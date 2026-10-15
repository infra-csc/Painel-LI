/**
 * "Sai de" na grade da Sugestão (09/10 — dono: "ter a opção de colocar de onde
 * sai o colaborador"): rascunho, envio (1 registro por pessoa), validação da
 * linha, cópia de outro evento e colagem da planilha com coluna de cidade.
 */
import { describe, it, expect } from "vitest";
import { SAI_DE_SP } from "@shared/swap-sai-de";
import { cidadeDaLinha, decomposeGridRows, emptyGridRow, mergePastedRows, sanitizeDraftRow } from "./grid-rows";
import { copyLogisticsSignature, rowsFromSuggestions } from "./copy-from-event";
import { validateGridRow } from "./grid-validation";
import { cidadeDaPlanilha, parsePastedRows } from "./paste-parse";

const DATES = ["2026-09-10", "2026-09-11", "2026-09-12"];

describe("Sai de — linha da grade", () => {
  it("cada pessoa da linha leva a cidade aparada; sem cidade, o campo nem vai", () => {
    const comCidade = { ...emptyGridRow("f1", "Kit", DATES, "r1"), city: "  Rio de Janeiro - RJ " };
    comCidade.quantities = { "2026-09-10": 2, "2026-09-11": 1, "2026-09-12": 0 };
    const semCidade = emptyGridRow("f2", "Produção", DATES, "r2");
    semCidade.quantities = { "2026-09-10": 1, "2026-09-11": 0, "2026-09-12": 0 };
    const recs = decomposeGridRows([comCidade, semCidade], DATES);
    expect(recs.filter((r) => r.functionId === "f1").map((r) => r.city)).toEqual(["Rio de Janeiro - RJ", "Rio de Janeiro - RJ"]);
    expect("city" in recs.find((r) => r.functionId === "f2")!).toBe(false);
  });

  it("ida que vem direto de outro evento não manda cidade (a origem é a cidade daquele evento)", () => {
    const row = { ...emptyGridRow("f1", "Kit", DATES, "r1"), city: "Belo Horizonte - MG", idaVemDoEventoId: "ev-bh" };
    expect(cidadeDaLinha(row)).toBe("");
    row.quantities = { "2026-09-10": 1, "2026-09-11": 0, "2026-09-12": 0 };
    expect(decomposeGridRows([row], DATES)[0].city).toBeUndefined();
  });

  it("rascunho: a cidade sobrevive; vazia não cria o campo; texto enorme é cortado em 120", () => {
    const base = { functionId: "f1", functionName: "Kit", quantities: {} };
    expect(sanitizeDraftRow({ ...base, city: "Recife - PE" })?.city).toBe("Recife - PE");
    expect(sanitizeDraftRow({ ...base, city: "   " })).not.toHaveProperty("city");
    expect(sanitizeDraftRow({ ...base, city: 42 })).not.toHaveProperty("city");
    expect(sanitizeDraftRow({ ...base, city: "x".repeat(300) })?.city).toHaveLength(120);
  });

  it("validação: vazio vale; 1 letra bloqueia o envio da linha", () => {
    const row = { ...emptyGridRow("f1", "Kit", DATES, "r1"), city: "R" };
    row.quantities = { "2026-09-10": 1, "2026-09-11": 0, "2026-09-12": 0 };
    expect(validateGridRow(row).errors).toEqual([expect.stringMatching(/^cidade de saída muito curta/)]);
    expect(validateGridRow({ ...row, city: "" }).errors).toEqual([]);
    expect(validateGridRow({ ...row, city: "Rio de Janeiro - RJ" }).errors).toEqual([]);
  });

  it("colagem que substitui a linha: sem cidade na planilha, herda a da linha antiga", () => {
    const antiga = { ...emptyGridRow("f1", "Kit", DATES, "r1"), city: "Salvador - BA" };
    const colada = emptyGridRow("f1", "Kit", DATES, "p1");
    expect(mergePastedRows([antiga], [colada])[0].city).toBe("Salvador - BA");
    const comCidade = { ...colada, city: "Natal - RN" };
    expect(mergePastedRows([antiga], [comCidade])[0].city).toBe("Natal - RN");
  });
});

describe("Sai de — copiar de outro evento", () => {
  const FUNCS = [{ id: "f1", name: "Kit" }];

  it("a cidade acompanha a cópia e separa linhas da mesma função com origens diferentes", () => {
    const res = rowsFromSuggestions([
      { functionId: "f1", workDays: ["2026-09-10"], city: "Rio de Janeiro - RJ" },
      { functionId: "f1", workDays: ["2026-09-10"], city: "Rio de Janeiro - RJ" },
      { functionId: "f1", workDays: ["2026-09-11"], city: "Belo Horizonte - MG" },
      { functionId: "f1", workDays: ["2026-09-12"] },
    ], FUNCS, DATES);
    expect(res.rows.map((r) => [r.city, r.quantities])).toEqual([
      ["Rio de Janeiro - RJ", { "2026-09-10": 2, "2026-09-11": 0, "2026-09-12": 0 }],
      ["Belo Horizonte - MG", { "2026-09-10": 0, "2026-09-11": 1, "2026-09-12": 0 }],
      [undefined, { "2026-09-10": 0, "2026-09-11": 0, "2026-09-12": 1 }],
    ]);
  });

  it("vaga sem cidade mantém a assinatura antiga (nada muda para quem não usa o campo)", () => {
    const s = { functionId: "f1", workDays: [], observations: "obs" };
    expect(copyLogisticsSignature({ ...s, city: "  " })).toBe(copyLogisticsSignature(s));
    expect(copyLogisticsSignature({ ...s, city: "Recife - PE" })).not.toBe(copyLogisticsSignature(s));
  });
});

describe("Sai de — colagem da planilha da logística", () => {
  const FUNCS = [{ id: "f1", name: "Kit" }, { id: "f2", name: "Produção" }];
  const CAB = "\tida\tchegada (até...)\tretorno\thorario do retorno (a partir)\tcidade de saída\t10/set\t11/set\t12/set\tobs";

  it("coluna 'Cidade de saída' no cabeçalho vira o Sai de (e não a data de ida)", () => {
    const texto = [
      CAB,
      "kit\t10/09/2026\t23h\t12/09/2026\t14-18h\tRio de Janeiro - RJ\t1\t1\t1\tlevar rádio",
      "produção\t10/09/2026\t23h\t12/09/2026\t14-18h\tSP\t1\t1\t\t",
    ].join("\n");
    const res = parsePastedRows(texto, FUNCS, DATES, "2026");
    expect(res.format).toBe("logistica");
    expect(res.layout?.columns.cidade).toBe(5);
    expect(res.rows.map((r) => [r.functionName, r.city, r.flightDepartureDate, r.observations])).toEqual([
      ["Kit", "Rio de Janeiro - RJ", "2026-09-10", "levar rádio"],
      ["Produção", SAI_DE_SP, "2026-09-10", ""],
    ]);
  });

  it("sem coluna de cidade, nenhuma linha ganha Sai de", () => {
    const texto = [
      "\tida\tchegada (até...)\tretorno\thorario do retorno (a partir)\t10/set\t11/set\t12/set\tobs",
      "kit\t10/09/2026\t23h\t12/09/2026\t14-18h\t1\t1\t1\tlevar rádio",
    ].join("\n");
    const res = parsePastedRows(texto, FUNCS, DATES, "2026");
    expect(res.layout?.columns.cidade).toBe(-1);
    expect(res.rows[0]).not.toHaveProperty("city");
    expect(res.rows[0].observations).toBe("levar rádio");
  });

  it("SP por extenso ou abreviado vira o mesmo texto do botão 'São Paulo - SP'", () => {
    for (const v of ["SP", "sp", "São Paulo", "Sao Paulo - SP", "São Paulo/SP"]) expect(cidadeDaPlanilha(v)).toBe(SAI_DE_SP);
    expect(cidadeDaPlanilha("  Paulo Afonso - BA ")).toBe("Paulo Afonso - BA");
    expect(cidadeDaPlanilha("")).toBe("");
  });
});
