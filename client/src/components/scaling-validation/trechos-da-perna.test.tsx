/**
 * Só ida / só volta / trecho direto na logística sugerida (09/10): a escolha de
 * cada perna, a lista de eventos e o que acompanha a grade (cópia, colagem,
 * envio).
 */
import { describe, it, expect } from "vitest";
import { eventosParaTrecho, modoDaIda, modoDaVolta, patchDaEscolha } from "./trechos-da-perna";
import { decomposeGridRows, emptyGridRow, mergePastedRows, sanitizeDraftRow } from "./grid-utils/grid-rows";
import { copyLogisticsSignature, rowsFromSuggestions } from "./grid-utils/copy-from-event";

describe("escolha da perna", () => {
  it("segue direto para outro evento = só ida, com a volta sugerida apagada", () => {
    expect(patchDaEscolha("volta", "direto", {}, "ev-jpa")).toEqual({
      trechosSugeridos: "so_ida", voltaSegueParaEventoId: "ev-jpa", transportModeVolta: "", flightReturnDate: "", flightReturnSuggestedTime: "",
    });
    expect(modoDaVolta({ trechosSugeridos: "so_ida", voltaSegueParaEventoId: "ev-jpa" })).toBe("direto");
    expect(modoDaVolta({ trechosSugeridos: "so_ida" })).toBe("sem");
  });

  it("vem direto de outro evento mantém a ida (é o trecho direto) e desfaz o \"sem ida\"", () => {
    expect(patchDaEscolha("ida", "direto", { trechosSugeridos: "so_volta" }, "ev-aju")).toEqual({ trechosSugeridos: "", idaVemDoEventoId: "ev-aju" });
    expect(modoDaIda({ idaVemDoEventoId: "ev-aju" })).toBe("direto");
  });

  it("sem ida apaga os campos da ida e qualquer encadeamento; voltar a \"com volta\" desfaz o só ida", () => {
    expect(patchDaEscolha("ida", "sem", { voltaSegueParaEventoId: "x", trechosSugeridos: "so_ida" })).toMatchObject({
      trechosSugeridos: "so_volta", idaVemDoEventoId: "", voltaSegueParaEventoId: "", flightDepartureDate: "",
    });
    expect(patchDaEscolha("volta", "normal", { trechosSugeridos: "so_ida", voltaSegueParaEventoId: "x" })).toEqual({ trechosSugeridos: "", voltaSegueParaEventoId: "" });
  });

  it("eventos do seletor: sem o atual e sem excluídos, do mais próximo ao mais longe", () => {
    const eventos = [
      { id: "longe", name: "Longe", startDate: "2026-12-10", endDate: "2026-12-12" },
      { id: "atual", name: "Atual", startDate: "2026-10-26", endDate: "2026-11-02" },
      { id: "aju", name: "Night Run Aracaju", startDate: "2026-10-23", endDate: "2026-10-25" },
      { id: "x", name: "Excluído", startDate: "2026-10-27", endDate: "2026-10-27", status: "excluído" },
    ];
    expect(eventosParaTrecho(eventos, { id: "atual", startDate: "2026-10-26", endDate: "2026-11-02" }).map((e) => e.id)).toEqual(["aju", "longe"]);
  });
});

describe("a indicação acompanha a grade", () => {
  const dias = ["2026-10-26", "2026-10-27"];

  it("envio: o registro de cada pessoa leva a indicação (e a linha sem indicação não ganha campo)", () => {
    const comTrecho = { ...emptyGridRow("f1", "Produção", dias, "r1"), quantities: { "2026-10-26": 1, "2026-10-27": 1 }, idaVemDoEventoId: "ev-aju" };
    const sem = { ...emptyGridRow("f2", "Kit", dias, "r2"), quantities: { "2026-10-26": 1, "2026-10-27": 0 } };
    const [a, b] = decomposeGridRows([comTrecho, sem], dias);
    expect(a.idaVemDoEventoId).toBe("ev-aju");
    expect("idaVemDoEventoId" in b).toBe(false);
  });

  it("rascunho salvo: a indicação sobrevive; lixo é descartado", () => {
    const r = sanitizeDraftRow({ functionId: "f1", functionName: "Produção", trechosSugeridos: "so_ida", voltaSegueParaEventoId: "ev-jpa", idaVemDoEventoId: 7 });
    expect(r).toMatchObject({ trechosSugeridos: "so_ida", voltaSegueParaEventoId: "ev-jpa" });
    expect(r && "idaVemDoEventoId" in r).toBe(false);
    expect(sanitizeDraftRow({ functionId: "f1", functionName: "P", trechosSugeridos: "qualquer" })?.trechosSugeridos).toBeUndefined();
  });

  it("colar da planilha não apaga a indicação da linha substituída", () => {
    const antiga = { ...emptyGridRow("f1", "Produção", dias, "r1"), trechosSugeridos: "so_ida" as const, voltaSegueParaEventoId: "ev-jpa" };
    const colada = { ...emptyGridRow("f1", "Produção", dias, "r9"), quantities: { "2026-10-26": 2, "2026-10-27": 2 } };
    const [nova] = mergePastedRows([antiga], [colada]);
    expect(nova).toMatchObject({ rowId: "r9", trechosSugeridos: "so_ida", voltaSegueParaEventoId: "ev-jpa" });
  });

  it("copiar de outro evento: a indicação vem junto e separa as turmas", () => {
    const base = { functionId: "f1", workDays: ["2026-10-26"], needsTicket: true };
    const r = rowsFromSuggestions([{ ...base, voltaSegueParaEventoId: "ev-jpa", trechosSugeridos: "so_ida" }, { ...base }], [{ id: "f1", name: "Produção" }], dias);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ trechosSugeridos: "so_ida", voltaSegueParaEventoId: "ev-jpa" });
    // Vaga sem indicação mantém a assinatura de antes.
    expect(copyLogisticsSignature({ ...base })).not.toContain("t:");
  });
});
