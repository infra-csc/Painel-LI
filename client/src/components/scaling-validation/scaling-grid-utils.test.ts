import { describe, it, expect } from "vitest";
import {
  buildDateList, buildReadDateList, countDaysInclusive, countOutsidePeriod, decomposeGridRows, detectPasteFormat,
  emptyGridRow, mergePastedRows, MAX_GRID_DAYS, MAX_READ_DAYS, parsePastedRows, parseShortDate, parseTimeHHMM,
  parseTransportMode, pasteConflicts, periodBounds, periodProblem, reframeRows, validateGridRow, normalizeStr,
} from "./scaling-grid-utils";

const DATES = ["2026-09-10", "2026-09-11", "2026-09-12"];

describe("buildDateList", () => {
  it("lista inclusiva em horário local", () => {
    expect(buildDateList("2026-09-10", "2026-09-12")).toEqual(DATES);
  });
  it("vazia quando o período é inválido ou parcial", () => {
    expect(buildDateList("2026-09-12", "2026-09-10")).toEqual([]);
    expect(buildDateList("", "2026-09-10")).toEqual([]);
    expect(buildDateList("2026-09", "2026-09-10")).toEqual([]);
  });
  it("respeita o teto de dias (acima retorna [])", () => {
    expect(buildDateList("2026-01-01", "2026-03-31")).toHaveLength(MAX_GRID_DAYS); // 90 dias
    expect(buildDateList("2026-01-01", "2026-04-01")).toEqual([]);
  });
  it("o teto é configurável por opção (o default continua sendo o da grade)", () => {
    expect(buildDateList("2026-01-01", "2026-04-01", { maxDays: 200 })).toHaveLength(91);
    expect(buildDateList("2026-01-01", "2026-04-01", { maxDays: Infinity })).toHaveLength(91);
    expect(buildDateList("2026-09-10", "2026-09-12", { maxDays: 2 })).toEqual([]);
  });
});

describe("countDaysInclusive", () => {
  it("conta os dois extremos e devolve 0 em período inválido", () => {
    expect(countDaysInclusive("2026-09-10", "2026-09-12")).toBe(3);
    expect(countDaysInclusive("2026-09-10", "2026-09-10")).toBe(1);
    expect(countDaysInclusive("2026-01-01", "2026-12-31")).toBe(365);
    expect(countDaysInclusive("2026-09-12", "2026-09-10")).toBe(0);
    expect(countDaysInclusive("", "2026-09-10")).toBe(0);
  });
});

describe("buildReadDateList (leitura: quadro da Escala e CSV)", () => {
  it("período curto: mesma lista da grade, sem truncar", () => {
    expect(buildReadDateList("2026-09-10", "2026-09-12")).toEqual({ dates: DATES, totalDays: 3, truncated: false });
  });
  it("acima do teto da GRADE a leitura continua mostrando os dias (o quadro não fica sem colunas)", () => {
    const r = buildReadDateList("2026-01-01", "2026-04-01"); // 91 dias
    expect(r.dates).toHaveLength(91);
    expect(r.truncated).toBe(false);
    expect(buildDateList("2026-01-01", "2026-04-01")).toEqual([]); // a grade de sugestão segue protegida
  });
  it("acima do teto de leitura trunca no início do período e avisa", () => {
    const r = buildReadDateList("2026-01-01", "2026-09-30", 30);
    expect(r.dates).toHaveLength(30);
    expect(r.dates[0]).toBe("2026-01-01");
    expect(r.dates[29]).toBe("2026-01-30");
    expect(r.totalDays).toBe(countDaysInclusive("2026-01-01", "2026-09-30"));
    expect(r.truncated).toBe(true);
  });
  it("teto padrão de leitura: evento de 2 anos trunca em MAX_READ_DAYS", () => {
    const r = buildReadDateList("2026-01-01", "2027-12-31");
    expect(r.dates).toHaveLength(MAX_READ_DAYS);
    expect(r.totalDays).toBe(730);
    expect(r.truncated).toBe(true);
  });
  it("Infinity não trunca", () => {
    const r = buildReadDateList("2026-01-01", "2027-12-31", Infinity);
    expect(r.dates).toHaveLength(730);
    expect(r.truncated).toBe(false);
  });
  it("período inválido continua vazio, sem truncamento", () => {
    expect(buildReadDateList("2026-09-12", "2026-09-10")).toEqual({ dates: [], totalDays: 0, truncated: false });
    expect(buildReadDateList("", "2026-09-10")).toEqual({ dates: [], totalDays: 0, truncated: false });
  });
});

describe("periodProblem / periodBounds", () => {
  it("classifica período incompleto, invertido, longo e ok", () => {
    expect(periodProblem("", "2026-09-10")).toBe("incompleto");
    expect(periodProblem("2026-09-12", "2026-09-10")).toBe("invertido");
    expect(periodProblem("2026-01-01", "2026-12-31")).toBe("longo");
    expect(periodProblem("2026-09-10", "2026-09-12")).toBeNull();
  });
  it("limites = evento ± 7 dias", () => {
    expect(periodBounds("2026-09-10", "2026-09-12")).toEqual({ min: "2026-09-03", max: "2026-09-19" });
    expect(periodBounds("", "")).toEqual({ min: "", max: "" });
  });
});

describe("período inválido não reencaixa (fluxo da página)", () => {
  it("countOutsidePeriod conta pessoas-dia e dias que sairiam ao encolher", () => {
    const row = emptyGridRow("f1", "Kit", DATES, "r1");
    row.quantities = { "2026-09-10": 2, "2026-09-11": 1, "2026-09-12": 3 };
    expect(countOutsidePeriod([row], ["2026-09-11"])).toEqual({ pessoasDia: 5, dias: 2 });
    expect(countOutsidePeriod([row], DATES)).toEqual({ pessoasDia: 0, dias: 0 });
  });
  it("com período inválido a lista vem vazia e as linhas NÃO devem ser reencaixadas (quantidades preservadas)", () => {
    const row = emptyGridRow("f1", "Kit", DATES, "r1");
    row.quantities = { "2026-09-10": 2, "2026-09-11": 1, "2026-09-12": 3 };
    const dates = buildDateList("2026-09-12", "2026-09-10");
    expect(dates).toEqual([]);
    // Regra da página: só reencaixa quando periodProblem() === null.
    const rows = periodProblem("2026-09-12", "2026-09-10") ? [row] : reframeRows([row], dates);
    expect(rows[0].quantities).toEqual({ "2026-09-10": 2, "2026-09-11": 1, "2026-09-12": 3 });
    // (se reencaixasse, zeraria tudo)
    expect(reframeRows([row], dates)[0].quantities).toEqual({});
  });
});

describe("decomposeGridRows (1 registro por pessoa)", () => {
  it("2,1,2 vira 2 pessoas: uma nos 3 dias e outra só nos dias 1 e 3", () => {
    const row = emptyGridRow("f1", "Kit", DATES, "r1");
    row.quantities = { "2026-09-10": 2, "2026-09-11": 1, "2026-09-12": 2 };
    row.transportModeIda = "aereo";
    row.needsTicket = true;
    const recs = decomposeGridRows([row], DATES);
    expect(recs).toHaveLength(2);
    expect(recs[0].workDays).toEqual(DATES);
    expect(recs[0].dailyRates).toBe(3);
    expect(recs[1].workDays).toEqual(["2026-09-10", "2026-09-12"]);
    expect(recs[1].dailyRates).toBe(2);
    expect(recs[1].transportModeIda).toBe("aereo");
    expect(recs[1].needsTicket).toBe(true);
    expect(recs[1].observations).toBeNull();
  });
  it("2|2|1|3 em 4 dias vira 3 pessoas: P1 4 dias, P2 dias 1,2,4 (3 diárias), P3 só dia 4 (1 diária)", () => {
    const D4 = ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"];
    const row = emptyGridRow("f1", "Kit", D4, "r1");
    row.quantities = { "2026-09-10": 2, "2026-09-11": 2, "2026-09-12": 1, "2026-09-13": 3 };
    const recs = decomposeGridRows([row], D4);
    expect(recs).toHaveLength(3);
    expect(recs[0].workDays).toEqual(D4);
    expect(recs[0].dailyRates).toBe(4);
    expect(recs[1].workDays).toEqual(["2026-09-10", "2026-09-11", "2026-09-13"]);
    expect(recs[1].dailyRates).toBe(3);
    expect(recs[2].workDays).toEqual(["2026-09-13"]);
    expect(recs[2].dailyRates).toBe(1);
    // rowOrder = índice da linha na grade (todas as pessoas da mesma linha compartilham)
    expect(recs.map((r) => r.rowOrder)).toEqual([0, 0, 0]);
  });
  it("rowOrder segue a posição da linha na grade, mesmo com função repetida", () => {
    const a = emptyGridRow("f1", "Kit", DATES, "a");
    a.quantities = { "2026-09-10": 1 };
    const vazia = emptyGridRow("f2", "Vazia", DATES, "b");
    const c = emptyGridRow("f1", "Kit", DATES, "c");
    c.quantities = { "2026-09-12": 2 };
    const recs = decomposeGridRows([a, vazia, c], DATES);
    expect(recs.map((r) => [r.functionId, r.rowOrder, r.dailyRates])).toEqual([["f1", 0, 1], ["f1", 2, 1], ["f1", 2, 1]]);
  });
  it("linha sem quantidade não gera registro", () => {
    expect(decomposeGridRows([emptyGridRow("f1", "Kit", DATES)], DATES)).toEqual([]);
  });
});

describe("reframeRows", () => {
  it("mantém dias que continuam e descarta os que saíram", () => {
    const row = emptyGridRow("f1", "Kit", DATES, "r1");
    row.quantities = { "2026-09-10": 1, "2026-09-11": 2, "2026-09-12": 3 };
    const [r] = reframeRows([row], ["2026-09-11", "2026-09-12", "2026-09-13"]);
    expect(r.quantities).toEqual({ "2026-09-11": 2, "2026-09-12": 3, "2026-09-13": 0 });
  });
});

describe("parsers de colagem", () => {
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

  describe("colar não duplica (substituição por função)", () => {
    it("pasteConflicts lista as funções já na grade; mergePastedRows substitui na posição e anexa as novas", () => {
      const kitA = emptyGridRow("f1", "Kit", DATES, "kitA");
      const prod = emptyGridRow("f2", "Produção", DATES, "prod");
      const kitB = emptyGridRow("f1", "Kit", DATES, "kitB");
      const existing = [kitA, prod, kitB];
      const pastedKit = emptyGridRow("f1", "Kit", DATES, "pKit");
      pastedKit.quantities["2026-09-10"] = 4;
      const pastedAt = emptyGridRow("f3", "Atendimento", DATES, "pAt");
      expect(pasteConflicts(existing, [pastedKit, pastedAt])).toEqual(["Kit"]);
      const merged = mergePastedRows(existing, [pastedKit, pastedAt]);
      expect(merged.map((r) => r.rowId)).toEqual(["pKit", "prod", "pAt"]);
      expect(merged[0].quantities["2026-09-10"]).toBe(4);
    });
    it("sem conflito só anexa", () => {
      const prod = emptyGridRow("f2", "Produção", DATES, "prod");
      const pasted = emptyGridRow("f1", "Kit", DATES, "pKit");
      expect(pasteConflicts([prod], [pasted])).toEqual([]);
      expect(mergePastedRows([prod], [pasted]).map((r) => r.rowId)).toEqual(["prod", "pKit"]);
    });
  });
});

describe("validateGridRow", () => {
  it("horário inválido é erro, passagem sem datas é só aviso; linha vazia é ignorada", () => {
    const row = emptyGridRow("f1", "Kit", DATES, "r1");
    expect(validateGridRow(row)).toEqual({ errors: [], warnings: [] });
    row.quantities["2026-09-10"] = 1;
    row.needsTicket = true;
    row.flightArrivalSuggestedTime = "14h";
    const v = validateGridRow(row);
    expect(v.warnings.some((i) => i.includes("passagem"))).toBe(true);
    expect(v.errors.some((i) => i.includes("passagem"))).toBe(false);
    expect(v.errors.some((i) => i.includes("desembarque"))).toBe(true);
  });
  it("data de volta antes da ida é erro", () => {
    const row = emptyGridRow("f1", "Kit", DATES, "r1");
    row.quantities["2026-09-10"] = 1;
    row.flightDepartureDate = "2026-09-12";
    row.flightReturnDate = "2026-09-10";
    expect(validateGridRow(row).errors).toEqual(["data de volta anterior à data de ida"]);
  });
});
