import { describe, it, expect } from "vitest";
import { QTY_MAX } from "./grid-rows";
import { detectPasteFormat, parsePastedRows, summarizePaste } from "./paste-parse";

const DATES = ["2026-09-10", "2026-09-11", "2026-09-12"];

describe("parsers de colagem", () => {
  it("parsePastedRows monta linhas e acumula funções desconhecidas", () => {
    const text = [
      ["Kit", "Aéreo", "09/09", "10h", "Aéreo", "13/09", "18:00", "sim", "sim", "obs", "1", "1", "2"].join("\t"),
      ["Inexistente", "", "", "", "", "", "", "", "", "", "1"].join("\t"),
    ].join("\n");
    const res = parsePastedRows(text, [{ id: "f1", name: "Kit" }], DATES, "2026");
    expect(res.skippedNames).toEqual(["Inexistente"]);
    expect(res.rows).toHaveLength(1);
    const r = res.rows[0];
    expect(r.functionId).toBe("f1");
    expect(r.transportModeIda).toBe("aereo");
    expect(r.flightDepartureDate).toBe("2026-09-09");
    expect(r.flightArrivalSuggestedTime).toBe("10:00");
    expect(r.flightReturnSuggestedTime).toBe("18:00");
    expect(r.needsAccommodation).toBe(true);
    expect(r.needsTicket).toBe(true);
    expect(r.observations).toBe("obs");
    expect(r.quantities).toEqual({ "2026-09-10": 1, "2026-09-11": 1, "2026-09-12": 2 });
    expect(res.format).toBe("grade");
    expect(res.hadHeader).toBe(false);
  });

  describe("dois formatos de colagem", () => {
    const FUNCS = [{ id: "f1", name: "Kit" }, { id: "f2", name: "Produção" }];
    it("formato do briefing (sem Passagem/Observação): quantidades a partir da 9ª coluna", () => {
      const text = ["Kit", "Aéreo", "09/09", "10:00", "Aéreo", "13/09", "18:00", "sim", "1", "1", "2"].join("\t");
      expect(detectPasteFormat(text)).toEqual({ format: "briefing", hadHeader: false });
      const res = parsePastedRows(text, FUNCS, DATES, "2026");
      expect(res.format).toBe("briefing");
      const r = res.rows[0];
      expect(r.needsAccommodation).toBe(true);
      expect(r.needsTicket).toBe(false);
      expect(r.observations).toBe("");
      expect(r.quantities).toEqual({ "2026-09-10": 1, "2026-09-11": 1, "2026-09-12": 2 });
    });
    it("cabeçalho decide o formato e é ignorado", () => {
      const briefing = [
        ["Função", "Modal ida", "Data ida", "Hora desembarque", "Modal volta", "Data volta", "Hora embarque", "Hotel", "10/09", "11/09", "12/09"].join("\t"),
        ["Kit", "", "", "", "", "", "", "não", "0", "2", "0"].join("\t"),
      ].join("\n");
      const r1 = parsePastedRows(briefing, FUNCS, DATES, "2026");
      expect(r1.hadHeader).toBe(true);
      expect(r1.format).toBe("briefing");
      expect(r1.skippedNames).toEqual([]);
      expect(r1.rows[0].quantities).toEqual({ "2026-09-10": 0, "2026-09-11": 2, "2026-09-12": 0 });

      const grade = [
        ["funcao", "Modal ida", "Data ida", "Hora desembarque", "Modal volta", "Data volta", "Hora embarque", "Hotel", "Passagem", "Observação", "10/09"].join("\t"),
        ["Kit", "", "", "", "", "", "", "sim", "sim", "", "3"].join("\t"),
      ].join("\n");
      const r2 = parsePastedRows(grade, FUNCS, DATES, "2026");
      expect(r2.format).toBe("grade");
      expect(r2.rows[0].needsTicket).toBe(true);
      expect(r2.rows[0].quantities["2026-09-10"]).toBe(3);
    });
    it("heurística sem cabeçalho: sim/não ou texto nas colunas 9-10 → formato completo", () => {
      const text = ["Kit", "", "", "", "", "", "", "sim", "não", "levar crachá", "2"].join("\t");
      expect(detectPasteFormat(text).format).toBe("grade");
      const res = parsePastedRows(text, FUNCS, DATES, "2026");
      expect(res.rows[0].observations).toBe("levar crachá");
      expect(res.rows[0].quantities["2026-09-10"]).toBe(2);
    });
    it("cabeçalho é reconhecido em variações de grafia (plural, acento, caixa, sufixo de área)", () => {
      for (const head of ["Função", "Funções", "FUNCAO ", "Função/Área", "Função - Área", "funcoes"]) {
        const text = [
          [head, "Modal ida", "Data ida", "Hora desembarque", "Modal volta", "Data volta", "Hora embarque", "Hotel", "10/09", "11/09", "12/09"].join("\t"),
          ["Kit", "", "", "", "", "", "", "não", "0", "2", "0"].join("\t"),
        ].join("\n");
        expect(detectPasteFormat(text), head).toEqual({ format: "briefing", hadHeader: true });
        const res = parsePastedRows(text, FUNCS, DATES, "2026");
        expect(res.hadHeader, head).toBe(true);
        expect(res.skippedNames, head).toEqual([]);
        expect(res.rows[0].quantities, head).toEqual({ "2026-09-10": 0, "2026-09-11": 2, "2026-09-12": 0 });
      }
    });
    it("nome de função que só COMEÇA com 'func' não é confundido com cabeçalho", () => {
      const text = ["Funcionário", "", "", "", "", "", "", "sim", "1", "1", "2"].join("\t");
      expect(detectPasteFormat(text).hadHeader).toBe(false);
      expect(parsePastedRows(text, FUNCS, DATES, "2026").skippedNames).toEqual(["Funcionário"]);
    });

    describe("desempate de 1 dia (a quantidade '0'/'1' é igual a um sim/não)", () => {
      const D1 = ["2026-09-10"];
      const briefing1d = (qty: string) => ["Kit", "Aéreo", "09/09", "10:00", "Aéreo", "13/09", "18:00", "sim", qty].join("\t");
      for (const qty of ["0", "1"]) {
        it(`briefing de 1 dia com quantidade "${qty}" não vira formato completo`, () => {
          const text = briefing1d(qty);
          expect(detectPasteFormat(text, { dayCount: 1 })).toEqual({ format: "briefing", hadHeader: false });
          expect(detectPasteFormat(text).format).toBe("briefing"); // sem dayCount: a linha curta já denuncia
          const res = parsePastedRows(text, FUNCS, D1, "2026");
          expect(res.format).toBe("briefing");
          expect(res.rows[0].needsAccommodation).toBe(true);
          expect(res.rows[0].needsTicket).toBe(false); // antes o "1" da quantidade ligava a passagem
          expect(res.rows[0].observations).toBe("");
          expect(res.rows[0].quantities).toEqual({ "2026-09-10": Number(qty) });
        });
      }
      it("a mesma linha com N dias muda de leitura: o nº de colunas depois do bloco fixo decide", () => {
        const text = ["Kit", "", "", "", "", "", "", "sim", "1", "0", "1"].join("\t"); // 11 colunas
        // 3 dias → 8 fixas + 3 = 11 → briefing
        expect(detectPasteFormat(text, { dayCount: 3 }).format).toBe("briefing");
        expect(parsePastedRows(text, FUNCS, DATES, "2026").rows[0].quantities).toEqual({ "2026-09-10": 1, "2026-09-11": 0, "2026-09-12": 1 });
        // 1 dia → 10 fixas + 1 = 11 → grade (Passagem e Observação existem mesmo)
        expect(detectPasteFormat(text, { dayCount: 1 }).format).toBe("grade");
        const g = parsePastedRows(text, FUNCS, D1, "2026");
        expect(g.format).toBe("grade");
        expect(g.rows[0].needsTicket).toBe(true);
        expect(g.rows[0].observations).toBe("0");
        expect(g.rows[0].quantities).toEqual({ "2026-09-10": 1 });
      });
      it("quantidade ≥ 2 continua sendo sinal suficiente, com ou sem dayCount", () => {
        const text = briefing1d("3");
        expect(detectPasteFormat(text).format).toBe("briefing");
        expect(detectPasteFormat(text, { dayCount: 1 }).format).toBe("briefing");
        expect(parsePastedRows(text, FUNCS, D1, "2026").rows[0].quantities).toEqual({ "2026-09-10": 3 });
      });
      it("texto na Observação vence o desempate por posição (é formato completo)", () => {
        const text = ["Kit", "", "", "", "", "", "", "sim", "não", "levar crachá"].join("\t");
        expect(detectPasteFormat(text, { dayCount: 2 }).format).toBe("grade");
      });
    });

    it("formato forçado sobrepõe a detecção", () => {
      const text = ["Kit", "", "", "", "", "", "", "sim", "1", "1", "2"].join("\t");
      const res = parsePastedRows(text, FUNCS, DATES, "2026", "grade");
      expect(res.format).toBe("grade");
      expect(res.rows[0].needsTicket).toBe(true);
      expect(res.rows[0].observations).toBe("1");
      expect(res.rows[0].quantities["2026-09-10"]).toBe(2);
    });
  });
});

describe("summarizePaste (resumo ao vivo do diálogo de colagem)", () => {
  const FUNCS = [{ id: "f1", name: "Kit" }, { id: "f2", name: "Produção" }];

  it("conta linhas lidas, funções reconhecidas e dias distintos com quantidade", () => {
    const text = [
      ["Kit", "Aéreo", "09/09", "10:00", "Aéreo", "13/09", "18:00", "sim", "sim", "obs", "1", "0", "2"].join("\t"),
      ["Produção", "", "", "", "", "", "", "não", "não", "", "0", "3", "0"].join("\t"),
    ].join("\n");
    const s = summarizePaste(parsePastedRows(text, FUNCS, DATES, "2026"));
    expect(s.format).toBe("grade");
    expect(s.hadHeader).toBe(false);
    expect(s.lines).toBe(2);
    expect(s.recognized).toBe(2);
    expect(s.unknownNames).toEqual([]);
    expect(s.mappedDays).toBe(3); // 10 e 12 do Kit + 11 da Produção
    expect(s.rowsWithoutQty).toBe(0);
    expect(s.outsideDays).toBe(0);
    expect(s.problem).toBeUndefined();
  });

  it("separa nomes fora do catálogo e linhas reconhecidas sem nenhuma quantidade", () => {
    const text = [
      ["Kit", "", "", "", "", "", "", "não", "não", "", "0", "0", "0"].join("\t"),
      ["Fantasma", "", "", "", "", "", "", "não", "não", "", "1", "0", "0"].join("\t"),
    ].join("\n");
    const s = summarizePaste(parsePastedRows(text, FUNCS, DATES, "2026"));
    expect(s.lines).toBe(2);
    expect(s.recognized).toBe(1);
    expect(s.unknownNames).toEqual(["Fantasma"]);
    expect(s.rowsWithoutQty).toBe(1);
    expect(s.mappedDays).toBe(0);
  });

  it("repassa o problema estrutural e os dias fora do período da grade", () => {
    const s = summarizePaste({
      rows: [], skippedNames: [], unknownNames: [], datesOutsideGrid: ["2026-09-20", "2026-09-21"], adjustedQtyCells: 0,
      format: "logistica", hadHeader: false, alignedWithoutHeader: false, problem: "cabecalho-nao-encontrado",
    });
    expect(s.lines).toBe(0);
    expect(s.recognized).toBe(0);
    expect(s.outsideDays).toBe(2);
    expect(s.problem).toBe("cabecalho-nao-encontrado");
  });
});

describe("colagem: células de quantidade ajustadas viram aviso no resumo", () => {
  const FUNCS = [{ id: "f1", name: "Kit" }, { id: "f2", name: "Produção" }];

  it("conta coerções e clamps e soma o aviso ao resumo", () => {
    const text = ["Kit", "", "", "", "", "", "", "não", "não", "", "2x", "99", "1"].join("\t");
    const res = parsePastedRows(text, FUNCS, DATES, "2026");
    expect(res.format).toBe("grade");
    expect(res.adjustedQtyCells).toBe(2); // "2x" coagido + "99" clampado; "1" passa limpo
    expect(res.rows[0].quantities).toEqual({ "2026-09-10": 2, "2026-09-11": QTY_MAX, "2026-09-12": 1 });
    const s = summarizePaste(res);
    expect(s.adjustedQtyCells).toBe(2);
    expect(s.warnings).toContain("2 célula(s) de quantidade foram ajustadas — confira");
  });

  it("colagem limpa não ganha aviso nenhum", () => {
    const text = ["Kit", "", "", "", "", "", "", "não", "não", "", "1", "0", "2"].join("\t");
    const s = summarizePaste(parsePastedRows(text, FUNCS, DATES, "2026"));
    expect(s.adjustedQtyCells).toBe(0);
    expect(s.warnings).toEqual([]);
  });
});

describe("colagem: cabeçalho repetido no meio do texto", () => {
  const FUNCS = [{ id: "f1", name: "Kit" }, { id: "f2", name: "Produção" }];
  const HEADER = ["Função", "Modal ida", "Data ida", "Hora desembarque", "Modal volta", "Data volta", "Hora embarque", "Hotel", "Passagem", "Observação", "10/09", "11/09", "12/09"].join("\t");
  const KIT = ["Kit", "", "", "", "", "", "", "não", "não", "", "1", "0", "0"].join("\t");
  const PROD = ["Produção", "", "", "", "", "", "", "não", "não", "", "0", "2", "0"].join("\t");

  it("duas colagens emendadas: o cabeçalho repetido é pulado, não vira 'função não reconhecida'", () => {
    const res = parsePastedRows([HEADER, KIT, HEADER, PROD].join("\n"), FUNCS, DATES, "2026");
    expect(res.hadHeader).toBe(true);
    expect(res.rows.map((r) => r.functionName)).toEqual(["Kit", "Produção"]);
    expect(res.skippedNames).toEqual([]);
    expect(res.unknownNames).toEqual([]);
  });

  it("um cabeçalho DIFERENTE no meio continua aparecendo como não reconhecido (não é o mesmo bloco)", () => {
    const OTHER = ["Funções da outra planilha", "a", "b"].join("\t");
    const res = parsePastedRows([HEADER, KIT, OTHER, PROD].join("\n"), FUNCS, DATES, "2026");
    expect(res.rows.map((r) => r.functionName)).toEqual(["Kit", "Produção"]);
    expect(res.skippedNames).toEqual(["Funções da outra planilha"]);
  });
});
