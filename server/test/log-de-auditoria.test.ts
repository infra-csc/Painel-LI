/**
 * Testes de rota — Log de auditoria (08/10): a busca acha pelo nome em pt-BR
 * da ação e do módulo (a tela mostra "Exclusão", "Eventos", não os códigos),
 * % e _ digitados não viram curinga, e página/limite são validados.
 * Rodar: `npm run test:rotas`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { agenteLogado, criarApp, criarEvento, mutacao } from "./harness";

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
