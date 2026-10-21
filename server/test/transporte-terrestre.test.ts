/**
 * Transporte terrestre em Passagens (16/10) — "vai de carro ou van".
 *
 * Caso do dono: Blue Run - Campinas, vagas "Não comprada / Pendente" com a
 * Sugestão dizendo "van - 7h saindo", "14h carro". Regras: van pede empresa e
 * valor; carro, só o valor; ônibus como a van. Vaga com TODAS as pernas
 * terrestres sai do "Comprar" e o status anda como se a passagem estivesse
 * comprada; desfazer devolve. A perna terrestre não ganha passagem (e a perna
 * com passagem não vira terrestre).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ordenarParaRateio, pernasDaVaga, ratearTotal } from "@shared/transporte-terrestre";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  criarEvento,
  criarFuncao,
  criarVaga,
  mutacao,
  type Contexto,
  type TestAgent,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

const diaDaqui = (dias: number) => {
  const d = new Date(Date.now() + dias * 86_400_000);
  return d.toISOString().slice(0, 10);
};

async function vagaDeCampinas(opts: { status?: string; trechos?: "so_ida" | "so_volta" } = {}) {
  const { agent, user } = await agenteLogado("purchasing");
  const evento = await criarEvento({ name: "Blue Run - Campinas - 2026", location: "Parque Taquaral, Campinas - SP", startDate: diaDaqui(10), endDate: diaDaqui(11) });
  const funcao = await criarFuncao();
  const colab = await criarColaborador({ fullName: "Marina Souza Lopes" });
  const vaga = await criarVaga({
    userId: user.id, eventId: evento.id, functionId: funcao.id, collaboratorId: colab.id,
    status: opts.status ?? "escalado", phase: "escalacao", scheduleStartDate: diaDaqui(10), scheduleEndDate: diaDaqui(11),
  });
  if (opts.trechos) {
    await ctx.db.update(ctx.schema.teamInclusions).set({ trechosSugeridos: opts.trechos }).where(eq(ctx.schema.teamInclusions.id, vaga.id));
  }
  return { agent, user, evento, vaga };
}

const registrar = (agent: TestAgent, itens: Record<string, unknown>[]) =>
  mutacao(agent.post("/api/transportes-terrestres")).send({ itens });
const desfazer = (agent: TestAgent, vagaId: string, trecho?: string) =>
  mutacao(agent.delete(`/api/transportes-terrestres/${vagaId}${trecho ? `?trecho=${trecho}` : ""}`));
const statusDa = async (id: string) => (await ctx.storage.getTeamInclusion(id))?.status;
const terrestresDa = async (id: string) =>
  ctx.db.select().from(ctx.schema.transportesTerrestres).where(eq(ctx.schema.transportesTerrestres.teamInclusionId, id));

describe("POST /api/transportes-terrestres", () => {
  it("van ida e volta com empresa e valor: grava, a vaga vira 'passagem comprada' e o GET devolve", async () => {
    const { agent, vaga, evento } = await vagaDeCampinas();
    const res = await registrar(agent, [
      { teamInclusionId: vaga.id, trecho: "ida", modo: "van", empresa: "Viação Cometa", valorCentavos: 60_000 },
      { teamInclusionId: vaga.id, trecho: "volta", modo: "van", empresa: "Viação Cometa", valorCentavos: 60_000 },
    ]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ gravados: 2, vagas: 1, falhas: [], statusPorVaga: { [vaga.id]: "passagem_comprada" } });
    expect(await statusDa(vaga.id)).toBe("passagem_comprada");

    const lista = await agent.get(`/api/transportes-terrestres?eventId=${evento.id}`);
    expect(lista.status).toBe(200);
    expect(lista.body.map((r: { trecho: string; modo: string; empresa: string; valorCentavos: number }) => [r.trecho, r.modo, r.empresa, r.valorCentavos]).sort())
      .toEqual([["ida", "van", "Viação Cometa", 60_000], ["volta", "van", "Viação Cometa", 60_000]]);
  });

  it("van sem empresa → 400 com o campo, nada gravado", async () => {
    const { agent, vaga } = await vagaDeCampinas();
    const res = await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "ida", modo: "van", valorCentavos: 60_000 }]);
    expect(res.status).toBe(400);
    expect(res.body.erros.empresa).toMatch(/empresa/i);
    expect(await terrestresDa(vaga.id)).toHaveLength(0);
  });

  it("carro só com o valor; a empresa enviada é descartada", async () => {
    const { agent, vaga } = await vagaDeCampinas();
    const res = await registrar(agent, [
      { teamInclusionId: vaga.id, trecho: "ida", modo: "carro", empresa: "ignorada", valorCentavos: 30_000 },
      { teamInclusionId: vaga.id, trecho: "volta", modo: "carro", valorCentavos: 30_000 },
    ]);
    expect(res.status).toBe(200);
    const linhas = await terrestresDa(vaga.id);
    expect(linhas.map((l) => l.empresa)).toEqual([null, null]);
  });

  it("só a ida terrestre numa vaga de ida e volta: grava, mas o status não anda (a volta ainda precisa de passagem)", async () => {
    const { agent, vaga } = await vagaDeCampinas();
    const res = await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "ida", modo: "carro", valorCentavos: 30_000 }]);
    expect(res.status).toBe(200);
    expect(res.body.statusPorVaga).toEqual({});
    expect(await statusDa(vaga.id)).toBe("escalado");
  });

  it("vaga 'só ida': a ida terrestre já cobre tudo; volta não existe nela", async () => {
    const { agent, vaga } = await vagaDeCampinas({ trechos: "so_ida" });
    const volta = await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "volta", modo: "carro", valorCentavos: 1_000 }]);
    expect(volta.status).toBe(409);
    expect(volta.body.message).toMatch(/não tem volta/);
    const ida = await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "ida", modo: "van", empresa: "Cometa", valorCentavos: 9_000 }]);
    expect(ida.status).toBe(200);
    expect(await statusDa(vaga.id)).toBe("passagem_comprada");
  });

  it("ônibus saiu das opções (21/10): 400 no campo modo, nada gravado", async () => {
    const { agent, vaga } = await vagaDeCampinas();
    const res = await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "ida", modo: "onibus", empresa: "Cometa", valorCentavos: 9_000 }]);
    expect(res.status).toBe(400);
    expect(res.body.erros.modo).toBe("Escolha carro ou van.");
    expect(await terrestresDa(vaga.id)).toHaveLength(0);
  });

  it("ônibus antigo (gravado antes de 21/10) continua aparecendo e pode ser trocado por van ou desfeito", async () => {
    const { agent, vaga, evento } = await vagaDeCampinas({ trechos: "so_ida" });
    await ctx.db.insert(ctx.schema.transportesTerrestres).values({ teamInclusionId: vaga.id, trecho: "ida", modo: "onibus", empresa: "Cometa", valorCentavos: 9_000 });
    const lista = await agent.get(`/api/transportes-terrestres?eventId=${evento.id}`);
    expect(lista.body).toEqual([expect.objectContaining({ modo: "onibus", grupoId: null, grupoTotalCentavos: null, grupoVagas: null })]);
    expect((await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "ida", modo: "van", empresa: "Cometa", valorCentavos: 9_000 }])).status).toBe(200);
    expect((await terrestresDa(vaga.id)).map((l) => l.modo)).toEqual(["van"]);
    expect((await desfazer(agent, vaga.id)).status).toBe(200);
  });

  it("registrar de novo a mesma perna substitui (editar), sem duplicar", async () => {
    const { agent, vaga } = await vagaDeCampinas();
    await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "ida", modo: "carro", valorCentavos: 30_000 }]);
    const res = await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "ida", modo: "van", empresa: "Rápido", valorCentavos: 45_000 }]);
    expect(res.status).toBe(200);
    const linhas = await terrestresDa(vaga.id);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ modo: "van", empresa: "Rápido", valorCentavos: 45_000 });
  });

  it("lote: vagas boas gravam, a cancelada volta em 'falhas'", async () => {
    const a = await vagaDeCampinas();
    const b = await vagaDeCampinas({ status: "cancelado" });
    const res = await registrar(a.agent, [
      { teamInclusionId: a.vaga.id, trecho: "ida", modo: "van", empresa: "X", valorCentavos: 15_000 },
      { teamInclusionId: b.vaga.id, trecho: "ida", modo: "van", empresa: "X", valorCentavos: 15_000 },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.gravados).toBe(1);
    expect(res.body.falhas).toEqual([expect.objectContaining({ teamInclusionId: b.vaga.id, mensagem: expect.stringMatching(/cancelada/) })]);
  });

  it("a área (function_area) não registra: 403", async () => {
    const { vaga } = await vagaDeCampinas();
    const { agent } = await agenteLogado("function_area");
    const res = await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "ida", modo: "carro", valorCentavos: 1_000 }]);
    expect(res.status).toBe(403);
  });
});

describe("terrestre × passagem: o mesmo trecho não paga duas vezes", () => {
  it("perna com passagem não vira terrestre; passagem não entra em perna terrestre; a outra perna pode", async () => {
    const { agent, vaga } = await vagaDeCampinas();
    // Ida de carro.
    expect((await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "ida", modo: "carro", valorCentavos: 30_000 }])).status).toBe(200);
    // Passagem de ida e volta: recusada por causa da ida.
    const idaEVolta = await mutacao(agent.post("/api/tickets")).send({
      teamInclusionId: vaga.id, transportType: "aereo", value: 80_000, purchaseOrderNumber: "LOC1",
      actualDepartureDate: diaDaqui(9), actualDepartureTime: "07:00", actualArrivalTime: "08:00",
      actualReturnDate: diaDaqui(12), actualReturnTime: "18:00",
    });
    expect(idaEVolta.status).toBe(409);
    expect(idaEVolta.body.code).toBe("perna_terrestre");
    // Só a volta de avião: passa.
    const soVolta = await mutacao(agent.post("/api/tickets")).send({
      teamInclusionId: vaga.id, transportType: "aereo", value: 80_000, purchaseOrderNumber: "LOC2",
      actualReturnDate: diaDaqui(12), actualReturnTime: "18:00", returnOriginAirport: "VCP", returnDestinationAirport: "SSA",
    });
    expect(soVolta.status).toBe(200);
    // E a volta, agora com passagem, não vira terrestre.
    const volta = await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "volta", modo: "carro", valorCentavos: 30_000 }]);
    expect(volta.status).toBe(409);
    expect(volta.body.message).toMatch(/volta já tem passagem/);
  });
});

describe("DELETE /api/transportes-terrestres/:id — desfazer", () => {
  it("desfazer tudo devolve a vaga para 'escalado' (volta à fila Comprar)", async () => {
    const { agent, vaga } = await vagaDeCampinas();
    await registrar(agent, [
      { teamInclusionId: vaga.id, trecho: "ida", modo: "carro", valorCentavos: 30_000 },
      { teamInclusionId: vaga.id, trecho: "volta", modo: "carro", valorCentavos: 30_000 },
    ]);
    expect(await statusDa(vaga.id)).toBe("passagem_comprada");
    const res = await desfazer(agent, vaga.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ removidos: 2, inclusionStatus: "escalado" });
    expect(await statusDa(vaga.id)).toBe("escalado");
    expect((await desfazer(agent, vaga.id)).status).toBe(404);
  });

  it("desfazer só a volta: a ida fica, e o status também volta (a volta precisa de passagem)", async () => {
    const { agent, vaga } = await vagaDeCampinas();
    await registrar(agent, [
      { teamInclusionId: vaga.id, trecho: "ida", modo: "van", empresa: "X", valorCentavos: 1_000 },
      { teamInclusionId: vaga.id, trecho: "volta", modo: "van", empresa: "X", valorCentavos: 1_000 },
    ]);
    const res = await desfazer(agent, vaga.id, "volta");
    expect(res.status).toBe(200);
    expect((await terrestresDa(vaga.id)).map((l) => l.trecho)).toEqual(["ida"]);
    expect(await statusDa(vaga.id)).toBe("escalado");
  });

  it("trecho inválido → 400", async () => {
    const { agent, vaga } = await vagaDeCampinas();
    expect((await desfazer(agent, vaga.id, "meio")).status).toBe(400);
  });
});

describe("Pendências: quem vai de carro/van não é 'sem passagem a 30 dias'", () => {
  it("a vaga some do alerta do sino quando todas as pernas são terrestres", async () => {
    const { agent: compras, vaga } = await vagaDeCampinas();
    await ctx.db.update(ctx.schema.teamInclusions).set({ flightDepartureDate: diaDaqui(9) }).where(eq(ctx.schema.teamInclusions.id, vaga.id));
    const { agent: admin } = await agenteLogado("admin");
    const antes = (await admin.get("/api/shell/sem-passagem-30d")).body.count as number;
    await registrar(compras, [
      { teamInclusionId: vaga.id, trecho: "ida", modo: "van", empresa: "X", valorCentavos: 1_000 },
      { teamInclusionId: vaga.id, trecho: "volta", modo: "van", empresa: "X", valorCentavos: 1_000 },
    ]);
    const depois = (await admin.get("/api/shell/sem-passagem-30d")).body.count as number;
    expect(depois).toBe(antes - 1);
  });
});

// ── Revisão de 16/10 (segunda passada) ─────────────────────────────────────

describe("revisão 16/10 — lote dividido, permissão, desfazer e PATCH da passagem", () => {
  it("lote 'o total, dividido' (tudoOuNada): uma vaga recusada → 409 e NADA gravado (a soma não fica diferente do total)", async () => {
    const a = await vagaDeCampinas();
    const b = await vagaDeCampinas({ status: "cancelado" });
    const res = await mutacao(a.agent.post("/api/transportes-terrestres")).send({
      tudoOuNada: true,
      itens: [
        { teamInclusionId: a.vaga.id, trecho: "ida", modo: "van", empresa: "Transluz", valorCentavos: 33_334 },
        { teamInclusionId: b.vaga.id, trecho: "ida", modo: "van", empresa: "Transluz", valorCentavos: 33_333 },
      ],
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("lote_dividido_incompleto");
    expect(res.body.falhas).toEqual([expect.objectContaining({ teamInclusionId: b.vaga.id })]);
    expect(await terrestresDa(a.vaga.id)).toEqual([]);
    expect(await statusDa(a.vaga.id)).toBe("escalado");
  });

  it("sem tudoOuNada o lote continua parcial (valor por vaga): a boa grava", async () => {
    const a = await vagaDeCampinas();
    const b = await vagaDeCampinas({ status: "cancelado" });
    const res = await registrar(a.agent, [
      { teamInclusionId: a.vaga.id, trecho: "ida", modo: "carro", valorCentavos: 10_000 },
      { teamInclusionId: b.vaga.id, trecho: "ida", modo: "carro", valorCentavos: 10_000 },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.gravados).toBe(1);
  });

  it("evento encerrado + vaga cancelada, quem não é admin: 403 (permissão antes do 409)", async () => {
    const { agent, vaga, evento } = await vagaDeCampinas({ status: "cancelado" });
    await ctx.db.update(ctx.schema.events).set({ startDate: diaDaqui(-20), endDate: diaDaqui(-19) }).where(eq(ctx.schema.events.id, evento.id));
    const res = await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "ida", modo: "carro", valorCentavos: 1_000 }]);
    expect(res.status).toBe(403);
  });

  it("desfazer uma perna que NÃO cobria a vaga não mexe no status que veio de outro lugar", async () => {
    // Status "passagem comprada" sem passagem viva (legado / passagem cancelada).
    const { agent, vaga } = await vagaDeCampinas({ status: "passagem_comprada" });
    expect((await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "ida", modo: "carro", valorCentavos: 1_000 }])).status).toBe(200);
    const res = await desfazer(agent, vaga.id, "ida");
    expect(res.status).toBe(200);
    expect(res.body.inclusionStatus).toBeUndefined();
    expect(await statusDa(vaga.id)).toBe("passagem_comprada");
  });

  it("PATCH da passagem 'só ida' que ganha a volta só pela cidade/aeroporto, com a volta de van: 409", async () => {
    const { agent, vaga } = await vagaDeCampinas();
    expect((await registrar(agent, [{ teamInclusionId: vaga.id, trecho: "volta", modo: "van", empresa: "Transluz", valorCentavos: 20_000 }])).status).toBe(200);
    const criada = await mutacao(agent.post("/api/tickets")).send({
      teamInclusionId: vaga.id, transportType: "aereo", value: 80_000, purchaseOrderNumber: "LOC9",
      actualDepartureDate: diaDaqui(9), actualDepartureTime: "07:00", actualArrivalTime: "08:00",
      departureAirport: "SSA", destinationAirport: "VCP",
    });
    expect(criada.status).toBe(200);
    const patch = await mutacao(agent.patch(`/api/tickets/${criada.body.id}`)).send({ returnCityOrigin: "Campinas - SP" });
    expect(patch.status).toBe(409);
    expect(patch.body.code).toBe("perna_terrestre");
    // Editar o LOC continua livre.
    expect((await mutacao(agent.patch(`/api/tickets/${criada.body.id}`)).send({ purchaseOrderNumber: "LOC10" })).status).toBe(200);
  });
});

// ── 21/10: o valor total da van, dividido entre as vagas (grupo) ───────────

describe("21/10 — a van inteira: total dividido, grupo, editar e desfazer", () => {
  async function vanDeTres() {
    const a = await vagaDeCampinas();
    const b = await vagaDeCampinas();
    const c = await vagaDeCampinas({ trechos: "so_ida" });
    const vagas = ordenarParaRateio([a.vaga, b.vaga, c.vaga]);
    const partes = ratearTotal(100_001, vagas.map((v) => ({ id: v.id, pernas: pernasDaVaga(v.id === c.vaga.id ? { trechosSugeridos: "so_ida" } : {}) })));
    const res = await mutacao(a.agent.post("/api/transportes-terrestres")).send({
      agrupar: true,
      itens: partes.map((p) => ({ ...p, modo: "van", empresa: "Transluz" })),
    });
    return { agent: a.agent, a, b, c, res, partes };
  }
  const somaDe = async (ids: string[]) => {
    let s = 0;
    for (const id of ids) for (const l of await terrestresDa(id)) s += l.valorCentavos;
    return s;
  };

  it("agrupar: as 5 linhas (3 vagas, uma só ida) levam o mesmo grupo e o GET devolve o total e as vagas do grupo", async () => {
    const { agent, a, b, c, res } = await vanDeTres();
    expect(res.status).toBe(200);
    expect(res.body.gravados).toBe(5);
    const linhas = [...await terrestresDa(a.vaga.id), ...await terrestresDa(b.vaga.id), ...await terrestresDa(c.vaga.id)];
    expect(new Set(linhas.map((l) => l.grupoId)).size).toBe(1);
    expect(linhas[0].grupoId).toBe(res.body.grupoId);
    expect(await somaDe([a.vaga.id, b.vaga.id, c.vaga.id])).toBe(100_001);
    // O recorte de um evento só não encolhe a van: o resumo conta a tabela inteira.
    const lista = await agent.get(`/api/transportes-terrestres?eventId=${c.evento.id}`);
    expect(lista.body).toEqual([expect.objectContaining({ trecho: "ida", grupoTotalCentavos: 100_001, grupoVagas: 3 })]);
  });

  it("a van inteira com outro total: dividido de novo nas mesmas vagas e trechos, soma exata, nova empresa", async () => {
    const { agent, a, b, c, res } = await vanDeTres();
    const put = await mutacao(agent.put(`/api/transportes-terrestres/grupos/${res.body.grupoId}`)).send({ modo: "van", empresa: "Rápido Campinas", totalCentavos: 90_002 });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ atualizados: 5, vagas: 3 });
    expect(await somaDe([a.vaga.id, b.vaga.id, c.vaga.id])).toBe(90_002);
    expect((await terrestresDa(c.vaga.id)).map((l) => [l.trecho, l.empresa])).toEqual([["ida", "Rápido Campinas"]]);
  });

  it("só esta vaga: registrar a vaga de novo sem agrupar tira ela do grupo; o grupo fica com as outras", async () => {
    const { agent, a, b, res } = await vanDeTres();
    const so = await registrar(agent, [
      { teamInclusionId: a.vaga.id, trecho: "ida", modo: "van", empresa: "Transluz", valorCentavos: 10_000 },
      { teamInclusionId: a.vaga.id, trecho: "volta", modo: "van", empresa: "Transluz", valorCentavos: 10_000 },
    ]);
    expect(so.status).toBe(200);
    expect((await terrestresDa(a.vaga.id)).map((l) => l.grupoId)).toEqual([null, null]);
    const lista = (await agent.get(`/api/transportes-terrestres?eventId=${b.evento.id}`)).body as Array<{ grupoId: string; grupoVagas: number }>;
    expect(lista.every((l) => l.grupoId === res.body.grupoId && l.grupoVagas === 2)).toBe(true);
  });

  it("desfazer a van inteira: todas as linhas saem e todas as vagas voltam para a fila", async () => {
    const { agent, a, b, c, res } = await vanDeTres();
    expect(await statusDa(a.vaga.id)).toBe("passagem_comprada");
    const del = await mutacao(agent.delete(`/api/transportes-terrestres/grupos/${res.body.grupoId}`));
    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ removidos: 5, vagas: 3 });
    for (const v of [a.vaga, b.vaga, c.vaga]) {
      expect(await terrestresDa(v.id)).toEqual([]);
      expect(await statusDa(v.id)).toBe("escalado");
    }
    expect((await mutacao(agent.delete(`/api/transportes-terrestres/grupos/${res.body.grupoId}`))).status).toBe(404);
  });

  it("agrupar é tudo ou nada: uma vaga recusada, nada gravado", async () => {
    const a = await vagaDeCampinas();
    const b = await vagaDeCampinas({ status: "cancelado" });
    const res = await mutacao(a.agent.post("/api/transportes-terrestres")).send({
      agrupar: true,
      itens: [
        { teamInclusionId: a.vaga.id, trecho: "ida", modo: "van", empresa: "X", valorCentavos: 500 },
        { teamInclusionId: b.vaga.id, trecho: "ida", modo: "van", empresa: "X", valorCentavos: 500 },
      ],
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("lote_dividido_incompleto");
    expect(await terrestresDa(a.vaga.id)).toEqual([]);
  });

  it("grupo: ônibus → 400, grupo que não existe → 404, a área → 403", async () => {
    const { agent, res } = await vanDeTres();
    expect((await mutacao(agent.put(`/api/transportes-terrestres/grupos/${res.body.grupoId}`)).send({ modo: "onibus", empresa: "X", totalCentavos: 1_000 })).status).toBe(400);
    expect((await mutacao(agent.put("/api/transportes-terrestres/grupos/nao-existe")).send({ modo: "van", empresa: "X", totalCentavos: 1_000 })).status).toBe(404);
    // Total menor que o número de trechos: algum trecho ficaria com R$ 0,00.
    expect((await mutacao(agent.put(`/api/transportes-terrestres/grupos/${res.body.grupoId}`)).send({ modo: "van", empresa: "X", totalCentavos: 4 })).status).toBe(400);
    const { agent: area } = await agenteLogado("function_area");
    expect((await mutacao(area.put(`/api/transportes-terrestres/grupos/${res.body.grupoId}`)).send({ modo: "van", empresa: "X", totalCentavos: 1_000 })).status).toBe(403);
    expect((await mutacao(area.delete(`/api/transportes-terrestres/grupos/${res.body.grupoId}`))).status).toBe(403);
  });
});
