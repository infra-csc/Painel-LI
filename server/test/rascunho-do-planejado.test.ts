/**
 * Rascunho do Planejado no servidor (08/10): "quem troca de computador perde o
 * que ajustou" — os overrides da tela passam a ficar no banco, por evento +
 * usuário, com a mesma regra de quem grava no Planejado (admin e Financeiro).
 *
 * Cobre: admin e financial gravam e leem o PRÓPRIO; production e purchasing
 * levam 403; um usuário não lê o de outro (nem forjando o id no corpo); DELETE
 * limpa; teto de 200 KB; corpo inválido e evento inexistente; sem cache.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { agenteLogado, criarApp, criarEvento, mutacao } from "./harness";

beforeAll(async () => {
  await criarApp();
});

const url = (eventId: string) => `/api/budget-planned/rascunho?eventId=${eventId}`;
const ajuste = { "vaga-1": { inclusionId: "vaga-1", valorDiaria: 250 }, "vaga-2": { inclusionId: "vaga-2", mobilidade: 0 } };

describe("Rascunho do Planejado (08/10)", () => {
  it.each(["admin", "financial"] as const)("%s grava, lê o próprio rascunho e o GET não fica em cache", async (papel) => {
    const { agent } = await agenteLogado(papel);
    const evento = await criarEvento();

    const vazio = await agent.get(url(evento.id));
    expect(vazio.status).toBe(200);
    expect(vazio.body).toEqual({ overrides: {} });
    expect(vazio.headers["cache-control"]).toContain("no-store");

    const salvo = await mutacao(agent.put(url(evento.id))).send({ overrides: ajuste });
    expect(salvo.status).toBe(200);
    expect(salvo.body.overrides).toEqual(ajuste);
    expect(typeof salvo.body.updatedAt).toBe("string");

    const lido = await agent.get(url(evento.id));
    expect(lido.status).toBe(200);
    expect(lido.body.overrides).toEqual(ajuste);
    expect(new Date(lido.body.updatedAt).getTime()).not.toBeNaN();

    // Substitui o inteiro (não acumula).
    const troca = await mutacao(agent.put(url(evento.id))).send({ overrides: { "vaga-3": { inclusionId: "vaga-3", almocoSemana: 30 } } });
    expect(troca.status).toBe(200);
    expect(Object.keys((await agent.get(url(evento.id))).body.overrides)).toEqual(["vaga-3"]);
  });

  it.each(["production", "purchasing"] as const)("%s não lê nem grava (403)", async (papel) => {
    const { agent } = await agenteLogado(papel);
    const evento = await criarEvento();
    expect((await agent.get(url(evento.id))).status).toBe(403);
    expect((await mutacao(agent.put(url(evento.id))).send({ overrides: ajuste })).status).toBe(403);
    expect((await mutacao(agent.delete(url(evento.id)))).status).toBe(403);
  });

  it("cada usuário vê só o seu — mesmo mandando o id de outro no corpo", async () => {
    const ana = await agenteLogado("financial");
    const bia = await agenteLogado("admin");
    const evento = await criarEvento();

    expect((await mutacao(ana.agent.put(url(evento.id))).send({ overrides: ajuste })).status).toBe(200);
    // A Bia tenta gravar "como" a Ana: o userId do corpo é ignorado.
    const forjado = await mutacao(bia.agent.put(url(evento.id))).send({ userId: ana.user.id, overrides: { "x": { inclusionId: "x", valorDiaria: 1 } } });
    expect(forjado.status).toBe(200);

    expect((await bia.agent.get(url(evento.id))).body.overrides).toEqual({ "x": { inclusionId: "x", valorDiaria: 1 } });
    expect((await ana.agent.get(url(evento.id))).body.overrides).toEqual(ajuste);
    // Nem pela query string.
    expect((await bia.agent.get(`${url(evento.id)}&userId=${ana.user.id}`)).body.overrides).toEqual({ "x": { inclusionId: "x", valorDiaria: 1 } });
  });

  it("DELETE limpa o rascunho do usuário (e só o dele)", async () => {
    const ana = await agenteLogado("financial");
    const bia = await agenteLogado("financial");
    const evento = await criarEvento();
    await mutacao(ana.agent.put(url(evento.id))).send({ overrides: ajuste });
    await mutacao(bia.agent.put(url(evento.id))).send({ overrides: ajuste });

    const apagado = await mutacao(ana.agent.delete(url(evento.id)));
    expect(apagado.status).toBe(204);
    expect((await ana.agent.get(url(evento.id))).body).toEqual({ overrides: {} });
    expect((await bia.agent.get(url(evento.id))).body.overrides).toEqual(ajuste);
    // Apagar o que não existe também é 204 (idempotente).
    expect((await mutacao(ana.agent.delete(url(evento.id)))).status).toBe(204);
  });

  it("recusa rascunho acima de 200 KB (413) e guarda o anterior intacto", async () => {
    const { agent } = await agenteLogado("admin");
    const evento = await criarEvento();
    await mutacao(agent.put(url(evento.id))).send({ overrides: ajuste });

    const grande: Record<string, { inclusionId: string; nota: string }> = {};
    for (let i = 0; i < 300; i += 1) grande[`vaga-${i}`] = { inclusionId: `vaga-${i}`, nota: "x".repeat(800) };
    const res = await mutacao(agent.put(url(evento.id))).send({ overrides: grande });
    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/200 KB/);
    expect((await agent.get(url(evento.id))).body.overrides).toEqual(ajuste);
  });

  it("valida evento e corpo: sem eventId 400, corpo fora do formato 400, evento inexistente 404", async () => {
    const { agent } = await agenteLogado("admin");
    const evento = await criarEvento();
    expect((await agent.get("/api/budget-planned/rascunho")).status).toBe(400);
    expect((await mutacao(agent.put(url(evento.id))).send({ overrides: "texto" })).status).toBe(400);
    expect((await mutacao(agent.put(url(evento.id))).send({ overrides: { "vaga-1": 10 } })).status).toBe(400);
    expect((await mutacao(agent.put(url(evento.id))).send({})).status).toBe(400);
    expect((await mutacao(agent.put(url("nao-existe"))).send({ overrides: ajuste })).status).toBe(404);
  });
});
