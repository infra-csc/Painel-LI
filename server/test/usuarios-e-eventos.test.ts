/**
 * Testes de rota — usuários e eventos (24/09): quem cria/edita quem, troca da
 * própria senha, permissões de evento e exclusão lógica.
 * Rodar: `npm run test:rotas`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  agenteLogado,
  criarApp,
  criarEvento,
  criarUsuario,
  criarVaga,
  mutacao,
  unico,
  type Contexto,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

// ── Usuários ────────────────────────────────────────────────────────────────
describe("POST /api/users", () => {
  it("por RH com role 'admin' → 403 e o usuário não é criado", async () => {
    const { agent } = await agenteLogado("financial");
    const email = `novo.${unico()}@teste.local`;
    const res = await mutacao(agent.post("/api/users")).send({ email, name: "Novo Admin", role: "admin" });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("RH e Compras");
    expect(await ctx.storage.getUserByEmail(email)).toBeUndefined();
  });

  it("por RH com canApproveCenotecnica:true → 400 (schema estrito) e nada é criado", async () => {
    const { agent } = await agenteLogado("financial");
    const email = `novo.${unico()}@teste.local`;
    const res = await mutacao(agent.post("/api/users")).send({ email, name: "Operador", role: "production", canApproveCenotecnica: true });
    expect(res.status).toBe(400);
    expect(await ctx.storage.getUserByEmail(email)).toBeUndefined();
  });

  it("por RH com role 'production' → 200, já aprovado, sem segredos na resposta", async () => {
    const { agent } = await agenteLogado("financial");
    const email = `Novo.${unico()}@Teste.local`;
    const res = await mutacao(agent.post("/api/users")).send({ email, name: "Operador", role: "production" });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email.toLowerCase());
    expect(res.body.status).toBe("approved");
    expect(res.body).not.toHaveProperty("password");
    expect(res.body).not.toHaveProperty("resetToken");
  });
});

describe("PATCH /api/users/:id", () => {
  it("por RH mudando o e-mail de terceiro → 403 e o e-mail não muda", async () => {
    const { agent } = await agenteLogado("financial");
    const alvo = await criarUsuario("production");
    const res = await mutacao(agent.patch(`/api/users/${alvo.id}`)).send({ email: `sequestro.${unico()}@teste.local` });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("e-mail");
    expect((await ctx.storage.getUser(alvo.id))?.email).toBe(alvo.email);
  });

  it("própria senha: currentPassword errada → 400; correta → 200, mustChangePassword=false e o gate libera", async () => {
    const { agent, user } = await agenteLogado("production");
    // Força a troca obrigatória direto no banco e derruba o cache do gate
    await ctx.db.update(ctx.schema.users).set({ mustChangePassword: true }).where(eq(ctx.schema.users.id, user.id));
    const { invalidarCacheDeUsuario } = await import("../auth-guards");
    invalidarCacheDeUsuario(user.id);

    const bloqueado = await agent.get("/api/events");
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.body.mustChangePassword).toBe(true);

    const errada = await mutacao(agent.patch(`/api/users/${user.id}`)).send({ currentPassword: "nao-e-essa", newPassword: "Nova-senha-456", confirmPassword: "Nova-senha-456" });
    expect(errada.status).toBe(400);
    expect(errada.body.message).toBe("Senha atual incorreta");
    expect((await ctx.storage.getUser(user.id))?.mustChangePassword).toBe(true);

    const certa = await mutacao(agent.patch(`/api/users/${user.id}`)).send({ currentPassword: user.senha, newPassword: "Nova-senha-456", confirmPassword: "Nova-senha-456" });
    expect(certa.status).toBe(200);
    expect(certa.body.mustChangePassword).toBe(false);
    expect(certa.body).not.toHaveProperty("password");

    const noBanco = await ctx.storage.getUser(user.id);
    expect(noBanco?.mustChangePassword).toBe(false);
    expect(await bcrypt.compare("Nova-senha-456", noBanco!.password)).toBe(true);
    expect(await bcrypt.compare(user.senha, noBanco!.password)).toBe(false);

    // Gate liberado
    expect((await agent.get("/api/events")).status).toBe(200);
  });

  it("própria role/status → 403 (nem admin muda o próprio perfil)", async () => {
    const { agent, user } = await agenteLogado("admin");
    const res = await mutacao(agent.patch(`/api/users/${user.id}`)).send({ role: "production" });
    expect(res.status).toBe(403);
    expect((await ctx.storage.getUser(user.id))?.role).toBe("admin");
  });
});

// ── Eventos ─────────────────────────────────────────────────────────────────
describe("POST /api/events", () => {
  it("por function_area → 403", async () => {
    const { agent } = await agenteLogado("function_area");
    const nome = `Evento proibido ${unico()}`;
    const res = await mutacao(agent.post("/api/events")).send({ name: nome, location: "Recife - PE", startDate: "2099-11-01", endDate: "2099-11-03" });
    expect(res.status).toBe(403);
    expect((await ctx.storage.getEvents(true)).some((e) => e.name === nome)).toBe(false);
  });

  it("por purchasing → 200 e a empresa pagadora do corpo é ignorada", async () => {
    const { agent } = await agenteLogado("purchasing");
    const res = await mutacao(agent.post("/api/events")).send({
      name: `Evento ${unico()}`, location: "Recife - PE", startDate: "2099-11-01", endDate: "2099-11-03",
      paymentCompanyName: "Empresa X", paymentCompanyCnpj: "00.000.000/0001-00",
    });
    expect(res.status).toBe(200);
    expect(res.body.paymentCompanyName).toBeNull();
    expect(res.body.paymentCompanyCnpj).toBeNull();
  });
});

describe("PUT /api/events/:id", () => {
  it("por purchasing mudando paymentCompanyName → 403; mandando o valor já gravado → 200", async () => {
    const { agent } = await agenteLogado("purchasing");
    const evento = await criarEvento();

    const troca = await mutacao(agent.put(`/api/events/${evento.id}`)).send({ name: evento.name, paymentCompanyName: "Outra Empresa" });
    expect(troca.status).toBe(403);
    expect(troca.body.message).toContain("empresa pagadora");
    expect((await ctx.storage.getEvent(evento.id))?.paymentCompanyName).toBeNull();

    const igual = await mutacao(agent.put(`/api/events/${evento.id}`)).send({ name: `${evento.name} (editado)`, paymentCompanyName: null });
    expect(igual.status).toBe(200);
    expect(igual.body.name).toBe(`${evento.name} (editado)`);
  });

  it("por purchasing com status 'excluído' → 403 (só admin exclui)", async () => {
    const { agent } = await agenteLogado("purchasing");
    const evento = await criarEvento();
    const res = await mutacao(agent.put(`/api/events/${evento.id}`)).send({ status: "excluído" });
    expect(res.status).toBe(403);
    expect((await ctx.storage.getEvent(evento.id))?.status).toBe("planejado");
  });
});

describe("DELETE /api/events/:id", () => {
  it("com vaga viva → 409; sem vagas vivas → soft delete e GET /api/events não lista", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const vaga = await criarVaga({ eventId: evento.id, userId: user.id });

    const comVaga = await mutacao(agent.delete(`/api/events/${evento.id}`)).send();
    expect(comVaga.status).toBe(409);
    expect(comVaga.body.vagasVivas).toBe(1);
    expect((await ctx.storage.getEvent(evento.id))?.status).toBe("planejado");

    // Cancela a vaga — ela deixa de contar
    const cancel = await mutacao(agent.post(`/api/team-inclusions/${vaga.id}/cancel`)).send({ reason: "teste" });
    expect(cancel.status).toBe(200);

    const semVaga = await mutacao(agent.delete(`/api/events/${evento.id}`)).send();
    expect(semVaga.status).toBe(200);
    const noBanco = await ctx.storage.getEvent(evento.id);
    expect(noBanco).toBeDefined(); // soft delete: a linha continua
    expect(noBanco?.status).toBe("excluído");
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.status).toBe("cancelado"); // nada apagado em cascata

    const lista = await agent.get("/api/events");
    expect(lista.status).toBe(200);
    expect(lista.body.map((e: any) => e.id)).not.toContain(evento.id);
    const comExcluidos = await agent.get("/api/events?includeDeleted=true");
    expect(comExcluidos.body.map((e: any) => e.id)).toContain(evento.id);

    // Excluir de novo é idempotente
    const denovo = await mutacao(agent.delete(`/api/events/${evento.id}`)).send();
    expect(denovo.status).toBe(200);
    expect(denovo.body.message).toContain("já estava");
  });

  it("por purchasing → 403", async () => {
    const { agent } = await agenteLogado("purchasing");
    const evento = await criarEvento();
    const res = await mutacao(agent.delete(`/api/events/${evento.id}`)).send();
    expect(res.status).toBe(403);
    expect((await ctx.storage.getEvent(evento.id))?.status).toBe("planejado");
  });
});
