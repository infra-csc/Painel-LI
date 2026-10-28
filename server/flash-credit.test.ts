import { describe, it, expect, vi } from "vitest";

// ./db exige DATABASE_URL ao carregar e ./storage puxa o db; o plano do sync
// é puro e não precisa de nenhum dos dois.
vi.mock("./db", () => ({ db: {} }));
vi.mock("./storage", () => ({ storage: {} }));

import { descricaoDoAjuste, planejarSyncFlash } from "./flash-credit";
import type { FlashMovement } from "@shared/schema";
import { FLASH_SOURCE_COMPARATIVO_AJUSTE } from "@shared/flash-rules";

const existente = (over: Partial<FlashMovement>): FlashMovement => ({
  id: "m-" + (over.sourceRef ?? "x") + "-" + (over.category ?? "alimentacao"),
  collaboratorId: "c1",
  eventId: "ev1",
  category: "alimentacao",
  type: "credito",
  amountCents: 1000,
  movementDate: "2026-09-20",
  description: "Comparativo — Evento X",
  createdBy: null,
  createdByName: "Sistema",
  createdAt: new Date("2026-09-20T12:00:00Z"),
  sourceType: "comparativo",
  sourceRef: "p1",
  compraId: null,
  ...over,
});

const ids = () => {
  let n = 0;
  return () => `novo-${++n}`;
};

describe("planejarSyncFlash — criar/atualizar/remover por (prestação, categoria)", () => {
  const descricao = "Comparativo — Evento X";

  it("do zero: tudo é criação, ids na ordem de wanted", () => {
    const plano = planejarSyncFlash([
      { actualId: "p1", collaboratorId: "c1", category: "alimentacao", amountCents: 1000 },
      { actualId: "p1", collaboratorId: "c1", category: "mobilidade", amountCents: 500 },
    ], [], descricao, "ev1", ids());
    expect(plano.criar.map((c) => c.id)).toEqual(["novo-1", "novo-2"]);
    expect(plano.movementIds).toEqual(["novo-1", "novo-2"]);
    expect(plano.atualizar).toEqual([]);
    expect(plano.remover).toEqual([]);
  });

  it("idempotente: nada muda → nenhuma escrita, ids mantidos", () => {
    const ex = [existente({ sourceRef: "p1", category: "alimentacao", amountCents: 1000 })];
    const plano = planejarSyncFlash(
      [{ actualId: "p1", collaboratorId: "c1", category: "alimentacao", amountCents: 1000 }],
      ex, descricao, "ev1", ids(),
    );
    expect(plano.criar).toEqual([]);
    expect(plano.atualizar).toEqual([]);
    expect(plano.remover).toEqual([]);
    expect(plano.movementIds).toEqual([ex[0].id]);
  });

  it("valor, colaborador ou descrição diferentes → atualização do MESMO lançamento", () => {
    const ex = [
      existente({ sourceRef: "p1", category: "alimentacao", amountCents: 1000 }),
      existente({ sourceRef: "p2", category: "alimentacao", amountCents: 700, collaboratorId: "c9" }),
      existente({ sourceRef: "p3", category: "mobilidade", amountCents: 300, description: "antiga" }),
    ];
    const plano = planejarSyncFlash([
      { actualId: "p1", collaboratorId: "c1", category: "alimentacao", amountCents: 1500 },
      { actualId: "p2", collaboratorId: "c2", category: "alimentacao", amountCents: 700 },
      { actualId: "p3", collaboratorId: "c1", category: "mobilidade", amountCents: 300 },
    ], ex, descricao, "ev1", ids());
    expect(plano.criar).toEqual([]);
    expect(plano.atualizar.map((a) => a.prev.id)).toEqual(ex.map((m) => m.id));
    expect(plano.atualizar[0].changes).toEqual({ amountCents: 1500, collaboratorId: "c1", eventId: "ev1", description: descricao });
    expect(plano.atualizar[1].changes.collaboratorId).toBe("c2");
    expect(plano.atualizar[2].changes.description).toBe(descricao);
    expect(plano.movementIds).toEqual(ex.map((m) => m.id));
  });

  it("automático que a regra não quer mais (prestação apagada, zerada, órfão) → remover", () => {
    const ex = [
      existente({ sourceRef: "p1", category: "alimentacao" }),
      existente({ sourceRef: "p1", category: "mobilidade" }),
      existente({ sourceRef: "orfao", category: "alimentacao" }),
    ];
    const plano = planejarSyncFlash(
      [{ actualId: "p1", collaboratorId: "c1", category: "alimentacao", amountCents: 1000 }],
      ex, descricao, "ev1", ids(),
    );
    expect(plano.remover.map((m) => m.id).sort()).toEqual([ex[1].id, ex[2].id].sort());
    expect(plano.movementIds).toEqual([ex[0].id]);
  });

  it("mistura: cria o novo, mantém o igual, atualiza o diferente, remove o sobrando", () => {
    const ex = [
      existente({ sourceRef: "p1", category: "alimentacao", amountCents: 1000 }),
      existente({ sourceRef: "p2", category: "alimentacao", amountCents: 100 }),
      existente({ sourceRef: "p9", category: "mobilidade" }),
    ];
    const plano = planejarSyncFlash([
      { actualId: "p1", collaboratorId: "c1", category: "alimentacao", amountCents: 1000 },
      { actualId: "p2", collaboratorId: "c1", category: "alimentacao", amountCents: 250 },
      { actualId: "p3", collaboratorId: "c3", category: "mobilidade", amountCents: 80 },
    ], ex, descricao, "ev1", ids());
    expect(plano.criar).toEqual([{ actualId: "p3", collaboratorId: "c3", category: "mobilidade", amountCents: 80, id: "novo-1" }]);
    expect(plano.atualizar.map((a) => a.prev.sourceRef)).toEqual(["p2"]);
    expect(plano.remover.map((m) => m.sourceRef)).toEqual(["p9"]);
    expect(plano.movementIds).toEqual([ex[0].id, ex[1].id, "novo-1"]);
  });

  it("a mesma (prestação, categoria) repetida em wanted entra uma vez só — não estoura a unique", () => {
    const plano = planejarSyncFlash([
      { actualId: "p1", collaboratorId: "c1", category: "alimentacao", amountCents: 1000 },
      { actualId: "p1", collaboratorId: "c1", category: "alimentacao", amountCents: 1000 },
    ], [], descricao, "ev1", ids());
    expect(plano.criar).toHaveLength(1);
    expect(plano.movementIds).toEqual(["novo-1"]);
  });
});

describe("revisão 28/10 (R1) — crédito já comprado é imutável; a diferença vira ajuste fora de lote", () => {
  const descricao = "Comparativo — Evento X";
  const comprado = (over: Partial<FlashMovement> = {}) => existente({ sourceRef: "p1", category: "alimentacao", amountCents: 1000, compraId: "lote-1", ...over });

  it("valor SOBE depois da compra: o comprado fica; a diferença (+500) vira complemento novo, sem lote", () => {
    const plano = planejarSyncFlash([{ actualId: "p1", collaboratorId: "c1", category: "alimentacao", amountCents: 1500 }], [comprado()], descricao, "ev1", ids());
    expect(plano.atualizar).toEqual([]);
    expect(plano.remover).toEqual([]);
    expect(plano.criar).toEqual([]);
    expect(plano.criarAjustes).toEqual([{ id: "novo-1", actualId: "p1", collaboratorId: "c1", category: "alimentacao", type: "credito", amountCents: 500 }]);
  });

  it("valor DESCE depois da compra: estorno (débito) de 400", () => {
    const plano = planejarSyncFlash([{ actualId: "p1", collaboratorId: "c1", category: "alimentacao", amountCents: 600 }], [comprado()], descricao, "ev1", ids());
    expect(plano.criarAjustes).toEqual([expect.objectContaining({ type: "debito", amountCents: 400 })]);
    expect(plano.remover).toEqual([]);
  });

  it("Voltar ao Planejado / reabrir o comparativo (a regra não quer mais): o comprado NÃO é apagado — estorno do valor todo", () => {
    const plano = planejarSyncFlash([], [comprado()], descricao, "ev1", ids());
    expect(plano.remover).toEqual([]);
    expect(plano.criarAjustes).toEqual([expect.objectContaining({ actualId: "p1", type: "debito", amountCents: 1000 })]);
  });

  it("reaprovar com o mesmo valor depois do estorno ainda não comprado: o estorno sai (nada a comprar de novo)", () => {
    const estorno = existente({ id: "est-1", sourceType: FLASH_SOURCE_COMPARATIVO_AJUSTE, type: "debito", amountCents: 1000, compraId: null });
    const plano = planejarSyncFlash([{ actualId: "p1", collaboratorId: "c1", category: "alimentacao", amountCents: 1000 }], [comprado(), estorno], descricao, "ev1", ids());
    expect(plano.remover.map((m) => m.id)).toEqual(["est-1"]);
    expect(plano.criarAjustes).toEqual([]);
    expect(plano.criar).toEqual([]);
  });

  it("complemento ainda não comprado acompanha o valor (atualiza o MESMO ajuste); idempotente", () => {
    const comp = existente({ id: "comp-1", sourceType: FLASH_SOURCE_COMPARATIVO_AJUSTE, type: "credito", amountCents: 500, compraId: null, description: descricaoDoAjuste(descricao, "credito") });
    const sobe = planejarSyncFlash([{ actualId: "p1", collaboratorId: "c1", category: "alimentacao", amountCents: 1800 }], [comprado(), comp], descricao, "ev1", ids());
    expect(sobe.atualizar.map((a) => [a.prev.id, a.changes.amountCents])).toEqual([["comp-1", 800]]);
    const igual = planejarSyncFlash([{ actualId: "p1", collaboratorId: "c1", category: "alimentacao", amountCents: 1500 }], [comprado(), comp], descricao, "ev1", ids());
    expect(igual.atualizar).toEqual([]);
    expect(igual.criarAjustes).toEqual([]);
    expect(igual.remover).toEqual([]);
  });

  it("sem nada comprado, a regra de sempre: o lançamento principal acompanha o valor (e sai quando a regra não quer)", () => {
    const livre = existente({ sourceRef: "p1", category: "alimentacao", amountCents: 1000, compraId: null });
    expect(planejarSyncFlash([{ actualId: "p1", collaboratorId: "c1", category: "alimentacao", amountCents: 1500 }], [livre], descricao, "ev1", ids()).atualizar).toHaveLength(1);
    expect(planejarSyncFlash([], [livre], descricao, "ev1", ids()).remover).toEqual([livre]);
  });
});
