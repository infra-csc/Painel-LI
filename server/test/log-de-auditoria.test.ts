/**
 * Testes de rota — Log de auditoria (08/10): a busca acha pelo nome em pt-BR
 * da ação e do módulo (a tela mostra "Exclusão", "Eventos", não os códigos),
 * % e _ digitados não viram curinga, e página/limite são validados.
 * Rodar: `npm run test:rotas`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { agenteLogado, criarApp, criarEvento, mutacao, unico } from "./harness";

beforeAll(async () => {
  await criarApp();
});

type Linha = { entityId: string; action: string; entityType: string };

describe("GET /api/system-logs — busca e paginação", () => {
  it("acha pelo nome em pt-BR da ação e do módulo", async () => {
    const { agent } = await agenteLogado("admin");
    const evento = await criarEvento();
    expect((await mutacao(agent.put(`/api/events/${evento.id}`)).send({ observations: "busca pt-BR" })).status).toBe(200);

    const porAcao = await agent.get(`/api/system-logs?limit=200&search=${encodeURIComponent("Alteração")}`);
    expect(porAcao.status).toBe(200);
    expect((porAcao.body.logs as Linha[]).some((l) => l.entityId === evento.id && l.action === "update")).toBe(true);

    // Sem acento também: "eventos" casa com o módulo "Eventos"
    const porModulo = await agent.get(`/api/system-logs?limit=200&search=eventos`);
    expect((porModulo.body.logs as Linha[]).some((l) => l.entityId === evento.id && l.entityType === "event")).toBe(true);
  });

  it("% e _ são texto: '%' sozinho não devolve o log inteiro", async () => {
    const { agent } = await agenteLogado("admin");
    await criarEvento();
    const tudo = await agent.get(`/api/system-logs?limit=200`);
    const porcento = await agent.get(`/api/system-logs?limit=200&search=${encodeURIComponent("%")}`);
    expect(porcento.status).toBe(200);
    expect(porcento.body.pagination.total).toBeLessThan(tudo.body.pagination.total);
  });

  it("página e limite inválidos viram valores seguros (página 1, até 200)", async () => {
    const { agent } = await agenteLogado("admin");
    const res = await agent.get(`/api/system-logs?page=-3&limit=99999&days=abc`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect((res.body.logs as Linha[]).length).toBeLessThanOrEqual(200);
  });
});

// 08/10: a tela chama de "Exclusão" o delete E duas alterações (evento que
// passou para "excluído", vaga que ganhou deletedAt). O filtro mandava
// action=delete e não achava essas duas.
describe("GET /api/system-logs — filtro \"Exclusão\" (action=exclusao)", () => {
  async function gravar(linha: { action: string; entityType: string; previousData: Record<string, unknown> | null; newData: Record<string, unknown> | null }) {
    const { storage } = await criarApp();
    const id = `teste-exclusao-${unico()}`;
    await storage.createSystemLog({ ...linha, entityId: id, entityName: "X", details: "teste", userId: null, userName: "Sistema" });
    return id;
  }

  it("acha delete, evento alterado para excluído e vaga com deletedAt — e não acha o resto", async () => {
    const { agent } = await agenteLogado("admin");
    const apagado = await gravar({ action: "delete", entityType: "event", previousData: null, newData: { name: "A" } });
    const eventoExcluido = await gravar({ action: "update", entityType: "event", previousData: { status: "planejado" }, newData: { status: "excluído" } });
    const vagaExcluida = await gravar({ action: "update", entityType: "team_inclusion", previousData: { deletedAt: null }, newData: { deletedAt: "2026-10-08T12:00:00.000Z" } });
    // Não são exclusão: alteração comum; evento JÁ excluído regravado sem diff; reativação.
    const alteracao = await gravar({ action: "update", entityType: "event", previousData: { name: "A" }, newData: { name: "B" } });
    const semDiff = await gravar({ action: "update", entityType: "event", previousData: null, newData: { name: "A", status: "excluído" } });
    const reativado = await gravar({ action: "update", entityType: "event", previousData: { status: "excluído" }, newData: { status: "planejado" } });

    const res = await agent.get("/api/system-logs?limit=200&action=exclusao");
    expect(res.status).toBe(200);
    const ids = new Set((res.body.logs as Linha[]).map((l) => l.entityId));
    expect(ids.has(apagado)).toBe(true);
    expect(ids.has(eventoExcluido)).toBe(true);
    expect(ids.has(vagaExcluida)).toBe(true);
    expect(ids.has(alteracao)).toBe(false);
    expect(ids.has(semDiff)).toBe(false);
    expect(ids.has(reativado)).toBe(false);
    // Só o que a tela chama de Exclusão.
    for (const l of res.body.logs as Linha[]) expect(["delete", "update"]).toContain(l.action);

    // action=delete continua exato (compatível).
    const soDelete = await agent.get("/api/system-logs?limit=200&action=delete");
    const idsDelete = new Set((soDelete.body.logs as Linha[]).map((l) => l.entityId));
    expect(idsDelete.has(apagado)).toBe(true);
    expect(idsDelete.has(eventoExcluido)).toBe(false);
  });
});

describe("GET /api/system-logs — pessoa sem cadastro ou sistema (08/10)", () => {
  it("/pessoas lista quem aparece no log (inclusive userId nulo) e userName filtra por ele", async () => {
    const { agent } = await agenteLogado("admin");
    const { storage } = await criarApp();
    const nome = `Robô ${unico()}`;
    await storage.createSystemLog({ action: "update", entityType: "event", entityId: `p-${unico()}`, entityName: "X", details: "t", userId: null, userName: nome });

    const pessoas = await agent.get("/api/system-logs/pessoas");
    expect(pessoas.status).toBe(200);
    expect((pessoas.body as { userId: string | null; userName: string }[]).some((p) => p.userName === nome && p.userId === null)).toBe(true);

    const res = await agent.get(`/api/system-logs?limit=200&userName=${encodeURIComponent(nome)}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
  });

  it("/pessoas é só do admin", async () => {
    const { agent } = await agenteLogado("production");
    expect((await agent.get("/api/system-logs/pessoas")).status).toBe(403);
  });
});
