import { describe, it, expect } from "vitest";
import { QTY_MAX } from "./grid-rows";
import {
  buildFunctionMatcher, functionNameKey, normalizeStr, parseLongDateBr, parsePtBrTime, parseSheetDate, parseShortDate,
  parseTimeHHMM, parseTransportMode, readQtyCell,
} from "./paste-values";
import { resolveHeaderDate } from "./paste-layout";

describe("parsers de valores de planilha", () => {
  it("parseShortDate aceita dd/mmm, dd/mm, dd/mm/aa e ISO", () => {
    expect(parseShortDate("15/nov", "2026")).toBe("2026-11-15");
    expect(parseShortDate("5/11", "2026")).toBe("2026-11-05");
    expect(parseShortDate("15/11/25", "2026")).toBe("2025-11-15");
    expect(parseShortDate("2026-11-15", "2026")).toBe("2026-11-15");
    expect(parseShortDate("abc", "2026")).toBe("");
  });
  it("parseTimeHHMM normaliza 14h30 / 14:30 / 1430 / 9", () => {
    expect(parseTimeHHMM("14h30")).toBe("14:30");
    expect(parseTimeHHMM("14:30")).toBe("14:30");
    expect(parseTimeHHMM("1430")).toBe("14:30");
    expect(parseTimeHHMM("9")).toBe("09:00");
    expect(parseTimeHHMM("25:00")).toBe("");
    expect(parseTimeHHMM("8-14h")).toBe("8-14h");
  });
  it("parseTransportMode aceita rótulos e sinônimos", () => {
    expect(parseTransportMode("Aéreo")).toBe("aereo");
    expect(parseTransportMode("ônibus")).toBe("onibus");
    expect(parseTransportMode("Traslado")).toBe("transfer");
    expect(parseTransportMode("foguete")).toBe("");
  });
  it("normalizeStr remove acentos e caixa", () => {
    expect(normalizeStr("  Produção ")).toBe("producao");
  });
});

// ── Formato "logistica" (planilha real da logística) ─────────────────────────

describe("datas e horários da planilha da logística", () => {
  it("parseLongDateBr lê data por extenso com e sem dia da semana/acento", () => {
    expect(parseLongDateBr("quarta-feira, 9 de setembro de 2026", "2026")).toBe("2026-09-09");
    expect(parseLongDateBr("sábado, 12 de setembro de 2026", "2026")).toBe("2026-09-12");
    expect(parseLongDateBr("sabado, 12 de setembro de 2026", "2026")).toBe("2026-09-12");
    expect(parseLongDateBr("13 de setembro de 2026", "2026")).toBe("2026-09-13");
    expect(parseLongDateBr("1 de março de 2026", "2026")).toBe("2026-03-01");
    expect(parseLongDateBr("5 de maio de 2026", "2026")).toBe("2026-05-05");
  });
  it("parseLongDateBr aceita mês abreviado e usa o ano padrão quando falta", () => {
    expect(parseLongDateBr("9 de set de 2026", "2026")).toBe("2026-09-09");
    expect(parseLongDateBr("9 de sete de 2026", "2026")).toBe("2026-09-09");
    expect(parseLongDateBr("9 de setembro", "2027")).toBe("2027-09-09");
    expect(parseLongDateBr("9 de setembro de 26", "2026")).toBe("2026-09-09");
  });
  it("parseLongDateBr recusa o que não é data por extenso", () => {
    expect(parseLongDateBr("", "2026")).toBe("");
    expect(parseLongDateBr("domingo", "2026")).toBe("");
    expect(parseLongDateBr("40 de setembro de 2026", "2026")).toBe("");
    expect(parseLongDateBr("9 de xxxxx de 2026", "2026")).toBe("");
  });
  it("parseSheetDate cobre ISO, extenso e curta na mesma chamada", () => {
    expect(parseSheetDate("2026-09-09", "2026")).toBe("2026-09-09");
    expect(parseSheetDate("quinta-feira, 10 de setembro de 2026", "2026")).toBe("2026-09-10");
    expect(parseSheetDate("10/set", "2026")).toBe("2026-09-10");
    expect(parseSheetDate("  ", "2026")).toBe("");
  });
  it("parsePtBrTime: hora única normaliza; faixa/janela fica como a área escreveu", () => {
    expect(parsePtBrTime("23h")).toBe("23:00");
    expect(parsePtBrTime("11h")).toBe("11:00");
    // Janelas preservadas (04/09): Compras precisa do "até" e do "a partir de".
    expect(parsePtBrTime("20h+")).toBe("20h+");
    expect(parsePtBrTime("14-18h")).toBe("14-18h");
    expect(parsePtBrTime("8h às 10h")).toBe("8h às 10h");
    expect(parsePtBrTime("manhã")).toBe("");
  });
  it("parsePtBrTime mantém o que parseTimeHHMM já aceitava", () => {
    expect(parsePtBrTime("14h30")).toBe("14:30");
    expect(parsePtBrTime("14:30")).toBe("14:30");
    expect(parsePtBrTime("1430")).toBe("14:30");
    expect(parsePtBrTime("9")).toBe("09:00");
    expect(parsePtBrTime("")).toBe("");
    expect(parsePtBrTime("25h")).toBe("");
    expect(parsePtBrTime("a combinar")).toBe("");
  });
  it("resolveHeaderDate tira o ano da grade; sem grade cai no ano do evento", () => {
    const grade = ["2026-09-08", "2026-09-09", "2026-09-10"];
    expect(resolveHeaderDate("08/set", grade, "2025")).toBe("2026-09-08"); // o ano vem da grade
    expect(resolveHeaderDate("20/set", grade, "2025")).toBe("2025-09-20"); // fora da grade → ano do evento
    expect(resolveHeaderDate("08/09/2024", grade, "2026")).toBe("2024-09-08"); // ano escrito manda
    expect(resolveHeaderDate("09/09", grade, "2025")).toBe("2026-09-09");
    expect(resolveHeaderDate("", grade, "2026")).toBe("");
    expect(resolveHeaderDate("obs", grade, "2026")).toBe("");
  });
});

describe("casamento tolerante de nomes de função", () => {
  const FUNCS = [{ id: "f1", name: "Cenotécnica" }, { id: "f2", name: "Ativação SP" }, { id: "f3", name: "Clube O2" }];
  it("functionNameKey normaliza acento, caixa, pontuação, espaços e plural", () => {
    expect(functionNameKey("Cenotécnica")).toBe(functionNameKey("cenotecnica"));
    expect(functionNameKey("  Ativação   SP ")).toBe(functionNameKey("ativacao/sp"));
    expect(functionNameKey("Ativações")).toBe(functionNameKey("Ativação"));
    expect(functionNameKey("Kits")).toBe(functionNameKey("kit"));
  });
  it("o matcher casa variações mas NÃO chuta por semelhança", () => {
    const match = buildFunctionMatcher(FUNCS);
    expect(match("cenotecnica")?.id).toBe("f1");
    expect(match("CENOTÉCNICA")?.id).toBe("f1");
    expect(match("ativação  sp")?.id).toBe("f2");
    expect(match("ativações sp")?.id).toBe("f2");
    expect(match("o2 prime")).toBeUndefined();
    expect(match("")).toBeUndefined();
  });
  it("o mapeamento manual do usuário tem prioridade", () => {
    const match = buildFunctionMatcher(FUNCS, { [functionNameKey("o2 prime")]: "f3" });
    expect(match("O2 Prime")?.id).toBe("f3");
    expect(match("cenotecnica")?.id).toBe("f1"); // o resto continua igual
  });
});

describe("readQtyCell (coerção visível de quantidade)", () => {
  it("célula vazia é dia sem gente, não ajuste", () => {
    expect(readQtyCell("")).toEqual({ value: 0, adjusted: false });
    expect(readQtyCell("   ")).toEqual({ value: 0, adjusted: false });
  });
  it("inteiro limpo dentro do teto passa sem ajuste", () => {
    expect(readQtyCell("0")).toEqual({ value: 0, adjusted: false });
    expect(readQtyCell("3")).toEqual({ value: 3, adjusted: false });
    expect(readQtyCell(` ${QTY_MAX} `)).toEqual({ value: QTY_MAX, adjusted: false });
  });
  it("coerção do parseInt conta como ajuste ('2x' → 2, 'abc' → 0, '-1' → 0)", () => {
    expect(readQtyCell("2x")).toEqual({ value: 2, adjusted: true });
    expect(readQtyCell("abc")).toEqual({ value: 0, adjusted: true });
    expect(readQtyCell("-1")).toEqual({ value: 0, adjusted: true });
  });
  it("clamp pelo teto conta como ajuste", () => {
    expect(readQtyCell("99")).toEqual({ value: QTY_MAX, adjusted: true });
  });
});
