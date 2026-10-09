/**
 * Testes de rota — edição de usuários pela regra única de
 * shared/edicao-de-usuario (08/10), área vazia normalizada, senha mínima e
 * auditoria sem segredos (criar usuário e iniciar simulação).
 * Rodar: `npx vitest run --project rotas server/test/usuarios-edicao`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarUsuario, mutacao, unico, type Contexto } from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

async function logsDe(entityId: string, action: string) {
  const { systemLogs } = ctx.schema;
  return ctx.db.select().from(systemLogs).where(and(eq(systemLogs.entityId, entityId), eq(systemLogs.action, action)));
}

describe("PATCH /api/users/:id — só o que mudou", () => {
  it("RH salva o NOME de terceiro (sem e-mail no corpo) → 200", async () => {
    const { agent } = await agenteLogado("financial");
    const alvo = await criarUsuario("production");
    const res = await mutacao(agent.patch(`/api/users/${alvo.id}`)).send({ name: "Nome Novo" });
    expect(res.status).toBe(200);
    expect((await ctx.storage.getUser(alvo.id))?.name).toBe("Nome Novo");
  });

  it("Logística Interna editando terceiro → 403 (o botão fica desabilitado na tela)", async () => {
    const { agent } = await agenteLogado("production");
    const alvo = await criarUsuario("function_area");
    const res = await mutacao(agent.patch(`/api/users/${alvo.id}`)).send({ name: "Tentativa" });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Sem permissão para editar este usuário");
  });

  it("admin salva o PRÓPRIO nome (sem o perfil no corpo) → 200", async () => {
    const { agent, user } = await agenteLogado("admin");
    const res = await mutacao(agent.patch(`/api/users/${user.id}`)).send({ name: "Admin Renomeado" });
    expect(res.status).toBe(200);
    const salvo = await ctx.storage.getUser(user.id);
    expect(salvo?.name).toBe("Admin Renomeado");
    expect(salvo?.role).toBe("admin");
  });

  it("admin com área vazia/só espaços → grava null", async () => {
    const { agent } = await agenteLogado("admin");
    const alvo = await criarUsuario("function_area");
    await ctx.db.update(ctx.schema.users).set({ area: "Comercial" }).where(eq(ctx.schema.users.id, alvo.id));
    const res = await mutacao(agent.patch(`/api/users/${alvo.id}`)).send({ area: "   " });
    expect(res.status).toBe(200);
    expect((await ctx.storage.getUser(alvo.id))?.area).toBeNull();
  });
});

describe("POST /api/users — área e auditoria", () => {
  it("área \"\" → null no banco; o log de criação não leva o hash da senha", async () => {
    const { agent } = await agenteLogado("admin");
    const email = `area.${unico()}@teste.local`;
    const res = await mutacao(agent.post("/api/users")).send({ email, name: "Sem Área", role: "production", area: "" });
    expect(res.status).toBe(200);
    const salvo = await ctx.storage.getUserByEmail(email);
    expect(salvo?.area).toBeNull();

    const [log] = await logsDe(salvo!.id, "create");
    expect(log).toBeDefined();
    const gravado = JSON.stringify([log.newData, log.previousData]);
    expect(gravado).not.toContain(salvo!.password);
    expect((log.newData as Record<string, unknown>).password).toBe("[REDACTED]");
  });

  it("senha com menos de 8 caracteres → 400", async () => {
    const { agent } = await agenteLogado("admin");
    const res = await mutacao(agent.post("/api/users")).send({ email: `curta.${unico()}@teste.local`, name: "Curta", role: "production", password: "1234567" });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("8 caracteres");
  });
});

describe("POST /api/users/:id/reset-password", () => {
  it("contra OUTRO admin → 403; 7 caracteres → 400; 8 → 200", async () => {
    const { agent } = await agenteLogado("admin");
    const outroAdmin = await criarUsuario("admin");
    const recusa = await mutacao(agent.post(`/api/users/${outroAdmin.id}/reset-password`)).send({ newPassword: "Temporaria-123" });
    expect(recusa.status).toBe(403);
    expect(recusa.body.message).toBe("A senha de outro administrador não pode ser redefinida por aqui.");

    const alvo = await criarUsuario("production");
    const curta = await mutacao(agent.post(`/api/users/${alvo.id}/reset-password`)).send({ newPassword: "1234567" });
    expect(curta.status).toBe(400);
    const certa = await mutacao(agent.post(`/api/users/${alvo.id}/reset-password`)).send({ newPassword: "12345678" });
    expect(certa.status).toBe(200);
  });
});

describe("POST /api/simulation/start — auditoria", () => {
  it("o log de simulation_start não leva o hash da senha do alvo", async () => {
    const { agent } = await agenteLogado("admin");
    const alvo = await criarUsuario("function_area");
    const res = await mutacao(agent.post("/api/simulation/start")).send({ userId: alvo.id });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("password");

    const hash = (await ctx.storage.getUser(alvo.id))!.password;
    const [log] = await logsDe(alvo.id, "simulation_start");
    expect(log).toBeDefined();
    const gravado = JSON.stringify([log.newData, log.previousData]);
    expect(gravado).not.toContain(hash);
    expect((log.newData as Record<string, unknown>).password).toBe("[REDACTED]");

    await mutacao(agent.post("/api/simulation/stop")).send();
  });
});
