/**
 * Reajustar pedido de INCLUSÃO com só ida / trecho direto (09/10). O aprovador
 * edita o pedido e a vaga criada tem de nascer com `trechosSugeridos`,
 * `idaVemDoEventoId` e `voltaSegueParaEventoId` — e com a mesma normalização
 * da abertura do pedido ("segue para Y" = sem volta própria).
 *
 * Rodar: `npx vitest run server/test/reajuste-inclusao-trechos.test.ts`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { agenteLogado, criarApp, criarEvento, criarFuncao, mutacao, type Contexto } from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

const DIAS = ["2099-10-10", "2099-10-11"];

async function abrirInclusao(agent: Awaited<ReturnType<typeof agenteLogado>>["agent"], eventId: string, functionId: string) {
  const pedido = await mutacao(agent.post("/api/scaling-change-requests")).send({
    eventId, functionId, area: null, requestType: "inclusao",
    proposedChanges: { v: 1, quantity: 1, workDays: DIAS, dailyRates: 2, needsTicket: true, transportModeIda: "aereo", flightDepartureDate: "2099-10-09", transportModeVolta: "aereo", flightReturnDate: "2099-10-12" },
    reason: "Falta uma pessoa",
  });
  expect([200, 201]).toContain(pedido.status);
  return (pedido.body.id ?? pedido.body.request?.id) as string;
}

describe("PATCH /api/scaling-change-requests/:id/reajustar — inclusão com trecho direto", () => {
  it("aprovar direto: a vaga criada grava só ida + segue para outro evento, sem a volta", async () => {
    const { agent } = await agenteLogado("admin");
    const evento = await criarEvento();
    const seguinte = await criarEvento({ name: "Corrida seguinte", startDate: "2099-10-13", endDate: "2099-10-14" });
    const anterior = await criarEvento({ name: "Corrida anterior", startDate: "2099-10-05", endDate: "2099-10-07" });
    const funcao = await criarFuncao();
    const id = await abrirInclusao(agent, evento.id, funcao.id);

    const res = await mutacao(agent.patch(`/api/scaling-change-requests/${id}/reajustar`)).send({
      comment: "Vem da anterior e segue direto para a seguinte",
      then: "aprovar_direto",
      editedChanges: {
        v: 1, quantity: 1, workDays: DIAS, dailyRates: 2, needsTicket: true, needsAccommodation: false,
        transportModeIda: "aereo", flightDepartureDate: "2099-10-09",
        // A volta continua no rascunho: a normalização tem de apagá-la.
        transportModeVolta: "aereo", flightReturnDate: "2099-10-12",
        trechosSugeridos: "so_ida", idaVemDoEventoId: anterior.id, voltaSegueParaEventoId: seguinte.id,
      },
    });
    expect(res.status).toBe(200);

    const criadas = await ctx.storage.getTeamInclusions(false, undefined, { eventId: evento.id });
    expect(criadas).toHaveLength(1);
    expect(criadas[0]).toMatchObject({
      phase: "inclusao",
      trechosSugeridos: "so_ida",
      idaVemDoEventoId: anterior.id,
      voltaSegueParaEventoId: seguinte.id,
      transportModeIda: "aereo",
      transportModeVolta: null,
      flightReturnDate: null,
    });
    expect(String(criadas[0].flightDepartureDate).slice(0, 10)).toBe("2099-10-09");
  });

  it("devolver para validação: a vaga sugerida também nasce com o 'só ida'", async () => {
    const { agent } = await agenteLogado("admin");
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const id = await abrirInclusao(agent, evento.id, funcao.id);

    const res = await mutacao(agent.patch(`/api/scaling-change-requests/${id}/reajustar`)).send({
      comment: "Só ida",
      then: "reenviar_validacao",
      editedChanges: { v: 1, quantity: 1, workDays: DIAS, dailyRates: 2, needsTicket: true, transportModeIda: "aereo", flightDepartureDate: "2099-10-09", trechosSugeridos: "so_ida" },
    });
    expect(res.status).toBe(200);

    const criadas = await ctx.storage.getTeamInclusions(false, "sugestao", { eventId: evento.id });
    expect(criadas).toHaveLength(1);
    expect(criadas[0]).toMatchObject({ phase: "sugestao", trechosSugeridos: "so_ida", voltaSegueParaEventoId: null });
  });

  it("segue para o PRÓPRIO evento → 400 e nenhuma vaga é criada", async () => {
    const { agent } = await agenteLogado("admin");
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const id = await abrirInclusao(agent, evento.id, funcao.id);

    const res = await mutacao(agent.patch(`/api/scaling-change-requests/${id}/reajustar`)).send({
      comment: "x", then: "aprovar_direto",
      editedChanges: { v: 1, quantity: 1, workDays: DIAS, voltaSegueParaEventoId: evento.id },
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/próprio evento/);
    expect(await ctx.storage.getTeamInclusions(false, undefined, { eventId: evento.id })).toHaveLength(0);
    expect(await ctx.storage.getTeamInclusions(false, "sugestao", { eventId: evento.id })).toHaveLength(0);
  });
});
