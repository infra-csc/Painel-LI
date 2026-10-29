/**
 * Revisão de 28/10 — o modal do Realizado e o 1,5 diária (R4, R5, R8):
 *  - R5: o ½ marcado no Realizado é o MESMO do Planejado (metade da diária do
 *    dia com o fator da deflação), não 1,5 × a diária média;
 *  - R4: dia sem diária pela regra (casa em dia útil) não vira 1,5;
 *  - R8: casa sem dia de diária não ganha o subtotal espalhado como diária.
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { BudgetActual } from "@shared/schema";
import { realizadoFake } from "@/test/fixtures-dominio";
import { useBudgetActualEditor } from "./use-budget-actual-editor";
import { alternarAtivoDoDia } from "@/components/budget/actual-utils";

// 07/09/2026 é segunda; 12/09 é sábado.
const SEG_A_SAB = { weekdays: 5, weekends: 1, startDate: "2026-09-07", endDate: "2026-09-12" };
const SEG_A_QUA = { weekdays: 3, weekends: 0, startDate: "2026-09-07", endDate: "2026-09-09" };

function editor(dias: typeof SEG_A_SAB) {
  return renderHook(() => useBudgetActualEditor({
    getItemInclusion: () => undefined,
    getItemDayCounts: () => dias,
    getPlannedRef: () => undefined,
    getFunctionName: () => "Produção",
    functionNameById: new Map([["funcao-1", "Produção"]]),
    ticketByInclusion: new Map(),
    actualsPorGrupo: new Map(),
    systemSettings: {},
  }));
}

const abrir = (r: ReturnType<typeof editor>["result"], item: BudgetActual) => act(() => r.current.openEditModal(item));
const dia = (r: ReturnType<typeof editor>["result"], d: string) => r.current.editDayEntries.find((e) => e.date === d)!;

describe("Realizado — 1,5 diária pela regra do Planejado (revisão 28/10)", () => {
  // Freela seg–sáb, diária R$ 100: 4 × 100 + 2 × 90 (deflação do 5º dia) = R$ 580.
  const freela = realizadoFake({
    collaboratorType: "freela", dailyQuantity: 6, dailyValue: 9_667, totalValue: 58_000, sentForReview: false,
    workedDays: ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"],
  });

  it("R5: marcar o ½ na segunda soma R$ 50,00 (o ½ do Planejado), não 1,5 × a média", () => {
    const { result } = editor(SEG_A_SAB);
    abrir(result, freela);
    const antes = dia(result, "2026-09-07").valueCents;
    act(() => result.current.alternarMeiaDiaria("2026-09-07"));
    expect(dia(result, "2026-09-07").valueCents - antes).toBe(5_000);
    const payload = result.current.montarPayloadParaSalvar()!;
    expect(payload.data.diasMeiaExtra).toEqual(["2026-09-07"]);
    expect(payload.data.totalValue).toBe(63_000);
    // desmarcar volta exatamente
    act(() => result.current.alternarMeiaDiaria("2026-09-07"));
    expect(dia(result, "2026-09-07").valueCents).toBe(antes);
  });

  it("R5: reabrir com o ½ gravado mostra o ½ do Planejado no dia marcado (e a grade fecha no subtotal)", () => {
    const { result } = editor(SEG_A_SAB);
    abrir(result, { ...freela, totalValue: 63_000, dailyValue: 10_500, diasMeiaExtra: ["2026-09-07"] });
    const seg = dia(result, "2026-09-07");
    const ter = dia(result, "2026-09-08");
    expect(seg.meia).toBe(true);
    expect(seg.valueCents - ter.valueCents).toBe(5_000);
    expect(result.current.editDayEntries.reduce((s, d) => s + (d.active ? d.valueCents : 0), 0)).toBe(63_000);
  });

  it("R4: casa — ½ gravado num dia útil (sem diária) não vira 1,5 e não dá para marcar", () => {
    const { result } = editor(SEG_A_SAB);
    const casa = realizadoFake({
      collaboratorType: "casa", dailyQuantity: 1, dailyValue: 46_500, totalValue: 46_500, sentForReview: false,
      workedDays: ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"], diasMeiaExtra: ["2026-09-08"],
    });
    abrir(result, casa);
    expect(dia(result, "2026-09-08")).toMatchObject({ valueCents: 0, meia: false });
    expect(dia(result, "2026-09-12").valueCents).toBe(46_500);
    act(() => result.current.alternarMeiaDiaria("2026-09-09"));
    expect(dia(result, "2026-09-09")).toMatchObject({ valueCents: 0, meia: false });
    expect(result.current.montarPayloadParaSalvar()!.data.diasMeiaExtra).toEqual([]);
  });

  it("R8: casa só em dias úteis (0 diárias) não ganha o subtotal espalhado como diária", () => {
    const { result } = editor(SEG_A_QUA);
    const casa = realizadoFake({
      collaboratorType: "casa", dailyQuantity: 0, dailyValue: 46_500, totalValue: 1_500 + 5_000, weekdayLunch: 1_500, sentForReview: false,
      workedDays: ["2026-09-07", "2026-09-08", "2026-09-09"],
    });
    abrir(result, casa);
    expect(result.current.editDayEntries.map((d) => d.valueCents)).toEqual([0, 0, 0]);
    const payload = result.current.montarPayloadParaSalvar()!;
    expect(payload.data.dailyQuantity).toBe(0);
    expect(payload.data.dailyValue).toBe(0);
  });
});

describe("Realizado — dobra de turno (29/10)", () => {
  // Freela seg–sáb, diária R$ 100: 4 × 100 + 2 × 90 (deflação do 5º dia) = R$ 580.
  const freela = realizadoFake({
    collaboratorType: "freela", dailyQuantity: 6, dailyValue: 9_667, totalValue: 58_000, sentForReview: false,
    workedDays: ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"],
  });

  it("marcar a dobra na terça soma uma diária DAQUELE dia (R$ 100), conta mais uma diária e grava o dia", () => {
    const { result } = editor(SEG_A_SAB);
    abrir(result, freela);
    const antes = dia(result, "2026-09-08").valueCents;
    act(() => result.current.alternarDobra("2026-09-08"));
    expect(dia(result, "2026-09-08")).toMatchObject({ dobra: true, dobraCents: 10_000, valueCents: antes + 10_000 });
    const payload = result.current.montarPayloadParaSalvar()!;
    expect(payload.data.diasDobra).toEqual(["2026-09-08"]);
    expect(payload.data.dailyQuantity).toBe(7);
    expect(payload.data.totalValue).toBe(68_000);
    // alimentação não muda com a dobra
    expect(payload.data.weekdayLunch).toBe(freela.weekdayLunch);
    // desmarcar volta exatamente
    act(() => result.current.alternarDobra("2026-09-08"));
    expect(dia(result, "2026-09-08")).toMatchObject({ dobra: false, valueCents: antes });
    expect(result.current.montarPayloadParaSalvar()!.data.diasDobra).toEqual([]);
  });

  it("deflação: a dobra no sábado (6º dia) vale R$ 90, a diária daquele dia", () => {
    const { result } = editor(SEG_A_SAB);
    abrir(result, freela);
    act(() => result.current.alternarDobra("2026-09-12"));
    expect(dia(result, "2026-09-12").dobraCents).toBe(9_000);
    expect(result.current.montarPayloadParaSalvar()!.data.totalValue).toBe(67_000);
  });

  it("reabrir com a dobra gravada mostra a diária a mais no dia certo (e a grade fecha no subtotal)", () => {
    const { result } = editor(SEG_A_SAB);
    abrir(result, { ...freela, totalValue: 68_000, dailyQuantity: 7, dailyValue: 9_714, diasDobra: ["2026-09-08"] });
    const ter = dia(result, "2026-09-08");
    expect(ter).toMatchObject({ dobra: true, dobraCents: 10_000 });
    expect(ter.valueCents - dia(result, "2026-09-09").valueCents).toBe(10_000);
    expect(result.current.editDayEntries.reduce((s, d) => s + (d.active ? d.valueCents : 0), 0)).toBe(68_000);
    const payload = result.current.montarPayloadParaSalvar()!;
    expect(payload.data.dailyQuantity).toBe(7);
    expect(payload.data.totalValue).toBe(68_000);
  });

  it("½ e dobra no mesmo dia não convivem: a dobra substitui o ½ (e o ½ substitui a dobra)", () => {
    const { result } = editor(SEG_A_SAB);
    abrir(result, freela);
    const antes = dia(result, "2026-09-07").valueCents;
    act(() => result.current.alternarMeiaDiaria("2026-09-07"));
    act(() => result.current.alternarDobra("2026-09-07"));
    expect(dia(result, "2026-09-07")).toMatchObject({ meia: false, dobra: true, valueCents: antes + 10_000 });
    let payload = result.current.montarPayloadParaSalvar()!;
    expect(payload.data.diasMeiaExtra).toEqual([]);
    expect(payload.data.diasDobra).toEqual(["2026-09-07"]);
    act(() => result.current.alternarMeiaDiaria("2026-09-07"));
    expect(dia(result, "2026-09-07")).toMatchObject({ meia: true, dobra: false, valueCents: antes + 5_000 });
    payload = result.current.montarPayloadParaSalvar()!;
    expect(payload.data.diasMeiaExtra).toEqual(["2026-09-07"]);
    expect(payload.data.diasDobra).toEqual([]);
  });

  it("desmarcar o dia trabalhado tira a dobra dele", () => {
    const { result } = editor(SEG_A_SAB);
    abrir(result, freela);
    const antes = dia(result, "2026-09-08").valueCents;
    act(() => result.current.alternarDobra("2026-09-08"));
    act(() => result.current.setEditDayEntries((prev) => prev.map((d) => (d.date === "2026-09-08" ? alternarAtivoDoDia(d) : d))));
    expect(dia(result, "2026-09-08")).toMatchObject({ active: false, dobra: false, valueCents: antes });
    const payload = result.current.montarPayloadParaSalvar()!;
    expect(payload.data.diasDobra).toEqual([]);
    expect(payload.data.dailyQuantity).toBe(5);
    // dia desmarcado não marca dobra
    act(() => result.current.alternarDobra("2026-09-08"));
    expect(dia(result, "2026-09-08").dobra).toBe(false);
  });

  it("casa em dia útil (sem diária) não tem dobra; no fim de semana tem", () => {
    const { result } = editor(SEG_A_SAB);
    const casa = realizadoFake({
      collaboratorType: "casa", dailyQuantity: 1, dailyValue: 46_500, totalValue: 46_500, sentForReview: false,
      workedDays: ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"],
    });
    abrir(result, casa);
    act(() => result.current.alternarDobra("2026-09-09"));
    expect(dia(result, "2026-09-09")).toMatchObject({ valueCents: 0, dobra: false });
    act(() => result.current.alternarDobra("2026-09-12"));
    expect(dia(result, "2026-09-12")).toMatchObject({ dobra: true, valueCents: 93_000 });
    const payload = result.current.montarPayloadParaSalvar()!;
    expect(payload.data.dailyQuantity).toBe(2);
    expect(payload.data.diasDobra).toEqual(["2026-09-12"]);
  });
});
