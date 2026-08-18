import { describe, it, expect } from "vitest";
import {
  buildTicketPayload,
  getRequiredFields,
  getMissingRequiredFields,
  isFieldRequired,
  validateTicketChronology,
  hasUnsavedTicketInput,
  toCents,
} from "./ticket-form";

describe("getRequiredFields (fonte única de obrigatoriedade)", () => {
  it("van exige apenas o nome da empresa", () => {
    expect(getRequiredFields("van", false).map(f => f.field)).toEqual(["purchaseOrderNumber"]);
    expect(getRequiredFields("van", true).map(f => f.field)).toEqual(["purchaseOrderNumber"]);
  });

  it("aéreo ida e volta exige chegada (ida) e os campos de volta", () => {
    const fields = getRequiredFields("aereo", false).map(f => f.field);
    expect(fields).toContain("actualArrivalTime");
    expect(fields).toContain("value");
    expect(fields).toContain("actualReturnDate");
    expect(fields).toContain("actualReturnTime");
  });

  it("apenas ida não exige campos de volta", () => {
    const fields = getRequiredFields("aereo", true).map(f => f.field);
    expect(fields).not.toContain("actualReturnDate");
    expect(fields).not.toContain("actualReturnTime");
    expect(fields).toContain("actualArrivalTime");
  });

  it("rodoviário usa rótulos de rodoviária/bilhete e não exige valor", () => {
    const fields = getRequiredFields("rodoviario", false);
    expect(fields.find(f => f.field === "departureAirport")?.label).toBe("Rodoviária Origem");
    expect(fields.find(f => f.field === "purchaseOrderNumber")?.label).toBe("Bilhete");
    expect(fields.map(f => f.field)).not.toContain("value");
    expect(fields.map(f => f.field)).toContain("actualArrivalTime");
  });

  it("tipo desconhecido cai em aéreo", () => {
    expect(getRequiredFields(undefined, false)).toEqual(getRequiredFields("aereo", false));
    expect(isFieldRequired(undefined, false, "value")).toBe(true);
  });

  it("getMissingRequiredFields devolve só os vazios, com rótulo", () => {
    const missing = getMissingRequiredFields({
      transportType: "aereo",
      isOneWay: true,
      purchaseOrderNumber: "AX782Q",
      value: "100,00",
      departureAirport: "GRU",
      destinationAirport: "  ",
      actualDepartureDate: "2026-09-01",
      actualDepartureTime: "08:00",
    });
    expect(missing.map(f => f.label)).toEqual(["Aeroporto Destino", "Chegada (ida)"]);
  });
});

describe("buildTicketPayload (payload único)", () => {
  const base = {
    transportType: "aereo",
    value: "1.500,00",
    purchaseDate: "2026-08-10",
    actualDepartureDate: "2026-09-01",
    actualDepartureTime: "08:00",
    actualArrivalTime: "10:30",
    actualReturnDate: "2026-09-05",
    actualReturnTime: "18:00",
    departureCityOrigin: "São Paulo",
    departureCityDestination: "Manaus",
    returnCityOrigin: "Manaus",
    returnCityDestination: "São Paulo",
    departureAirport: "GRU",
    destinationAirport: "MAO",
    returnOriginAirport: "MAO",
    returnDestinationAirport: "GRU",
    purchaseOrderNumber: "AX782Q",
    attachmentIds: ["a1"],
    ticketObservations: "",
  };

  it("inclui os aeroportos da volta e converte valor para centavos", () => {
    const p = buildTicketPayload(base, { teamInclusionId: "inc-1" });
    expect(p.teamInclusionId).toBe("inc-1");
    expect(p.returnOriginAirport).toBe("MAO");
    expect(p.returnDestinationAirport).toBe("GRU");
    expect(p.value).toBe(150000);
    expect(p.actualArrivalTime).toBe("10:30");
    expect(p.ticketObservations).toBeNull();
    expect(p.attachmentIds).toEqual(["a1"]);
  });

  it("sem teamInclusionId (PATCH) a chave não aparece", () => {
    expect("teamInclusionId" in buildTicketPayload(base)).toBe(false);
  });

  it("fileUrl legado só entra no payload se o form o trouxer (PATCH não apaga voucher antigo)", () => {
    expect("fileUrl" in buildTicketPayload(base)).toBe(false);
    expect(buildTicketPayload({ ...base, fileUrl: "https://x/voucher.pdf" }).fileUrl).toBe("https://x/voucher.pdf");
    expect(buildTicketPayload({ ...base, fileUrl: "" }).fileUrl).toBeNull();
  });

  it("apenas ida zera todos os campos de volta", () => {
    const p = buildTicketPayload({ ...base, isOneWay: true });
    expect(p.actualReturnDate).toBeNull();
    expect(p.actualReturnTime).toBeNull();
    expect(p.returnCityOrigin).toBeNull();
    expect(p.returnCityDestination).toBeNull();
    expect(p.returnOriginAirport).toBeNull();
    expect(p.returnDestinationAirport).toBeNull();
    expect(p.actualDepartureDate).toBe("2026-09-01");
  });

  it("van zera trechos e valor, mantém empresa e observações", () => {
    const p = buildTicketPayload({ ...base, transportType: "van", ticketObservations: "Sai às 6h" });
    expect(p.transportType).toBe("van");
    expect(p.value).toBeNull();
    expect(p.departureAirport).toBeNull();
    expect(p.actualDepartureDate).toBeNull();
    expect(p.actualArrivalTime).toBeNull();
    expect(p.purchaseOrderNumber).toBe("AX782Q");
    expect(p.ticketObservations).toBe("Sai às 6h");
  });

  it("data de compra vazia usa o dia informado; anexos vazios viram null", () => {
    const p = buildTicketPayload({ ...base, purchaseDate: "", attachmentIds: [] }, { today: "2026-08-17" });
    expect(p.purchaseDate).toBe("2026-08-17");
    expect(p.attachmentIds).toBeNull();
  });

  it("toCents aceita formato pt-BR e vazio", () => {
    expect(toCents("1.500,00")).toBe(150000);
    expect(toCents("40,5")).toBe(4050);
    expect(toCents("")).toBeNull();
    expect(toCents(undefined)).toBeNull();
  });
});

describe("validateTicketChronology", () => {
  const ctx = { today: "2026-08-17", scheduleStartDate: "2026-09-01", scheduleEndDate: "2026-09-05" };
  const ok = {
    transportType: "aereo",
    purchaseDate: "2026-08-10",
    actualDepartureDate: "2026-08-31",
    actualDepartureTime: "08:00",
    actualArrivalTime: "10:30",
    actualReturnDate: "2026-09-06",
    actualReturnTime: "18:00",
  };

  it("passagem coerente não gera erro nem aviso", () => {
    const r = validateTicketChronology(ok, ctx);
    expect(r.errors).toEqual({});
    expect(r.warnings).toEqual([]);
  });

  it("volta antes da ida é erro bloqueante no campo da data de volta", () => {
    const r = validateTicketChronology({ ...ok, actualReturnDate: "2026-08-30" }, ctx);
    expect(r.errors.actualReturnDate).toMatch(/volta.*antes da ida/i);
  });

  it("mesmo dia com horário de volta antes da ida é erro no horário", () => {
    const r = validateTicketChronology(
      { ...ok, actualReturnDate: "2026-08-31", actualReturnTime: "07:00" },
      ctx,
    );
    expect(r.errors.actualReturnTime).toBeDefined();
    expect(r.errors.actualReturnDate).toBeUndefined();
  });

  it("mesmo dia com volta depois da ida é aceito", () => {
    const r = validateTicketChronology(
      { ...ok, actualReturnDate: "2026-08-31", actualReturnTime: "22:00" },
      ctx,
    );
    expect(r.errors).toEqual({});
  });

  it("data de compra no futuro é erro", () => {
    const r = validateTicketChronology({ ...ok, purchaseDate: "2026-08-18" }, ctx);
    expect(r.errors.purchaseDate).toBeDefined();
    expect(validateTicketChronology({ ...ok, purchaseDate: "2026-08-17" }, ctx).errors.purchaseDate).toBeUndefined();
  });

  it("chegada antes da partida é aviso (voo noturno), não erro", () => {
    const r = validateTicketChronology({ ...ok, actualDepartureTime: "23:00", actualArrivalTime: "01:30" }, ctx);
    expect(r.errors).toEqual({});
    expect(r.warnings.some(w => /dia seguinte/.test(w))).toBe(true);
  });

  it("ida depois do início do período e volta antes do término são avisos", () => {
    const r = validateTicketChronology(
      { ...ok, actualDepartureDate: "2026-09-02", actualReturnDate: "2026-09-04" },
      ctx,
    );
    expect(r.errors).toEqual({});
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0]).toMatch(/ida.*início/i);
    expect(r.warnings[1]).toMatch(/volta.*término/i);
  });

  it("apenas ida ignora a volta mesmo que haja lixo no campo", () => {
    const r = validateTicketChronology({ ...ok, isOneWay: true, actualReturnDate: "2020-01-01" }, ctx);
    expect(r.errors).toEqual({});
    expect(r.warnings).toEqual([]);
  });

  it("van só valida a data da compra", () => {
    const r = validateTicketChronology(
      { transportType: "van", purchaseDate: "2027-01-01", actualDepartureDate: "2026-09-10", actualReturnDate: "2026-09-01" },
      ctx,
    );
    expect(Object.keys(r.errors)).toEqual(["purchaseDate"]);
    expect(r.warnings).toEqual([]);
  });

  it("sem período de trabalho não há avisos de período", () => {
    const r = validateTicketChronology({ ...ok, actualDepartureDate: "2026-09-02" }, { today: "2026-08-17" });
    expect(r.warnings).toEqual([]);
  });
});

describe("hasUnsavedTicketInput", () => {
  it("ignora defaults automáticos e vazios", () => {
    expect(hasUnsavedTicketInput(undefined)).toBe(false);
    expect(hasUnsavedTicketInput({ transportType: "aereo", departureCityDestination: "Rio" }, ["transportType", "departureCityDestination"])).toBe(false);
    expect(hasUnsavedTicketInput({ purchaseOrderNumber: "", attachmentIds: [] })).toBe(false);
  });
  it("detecta digitação real", () => {
    expect(hasUnsavedTicketInput({ purchaseOrderNumber: "AX1" })).toBe(true);
    expect(hasUnsavedTicketInput({ attachmentIds: ["x"] })).toBe(true);
    expect(hasUnsavedTicketInput({ isOneWay: true })).toBe(true);
  });
});

// ─── Entrega 2: sugestões, impacto ao vivo, KPI ─────────────────────────────

import {
  extractTravelSuggestion,
  formatSuggestionDate,
  suggestionDateToIso,
  suggestionTimeToHHMM,
  suggestionToFormPatch,
  suggestionDivergences,
  buildPlannedImpact,
  formatPlannedImpact,
  periodDays,
  purchasedValueKpi,
  hasAnySuggestion,
} from "./ticket-form";

describe("extractTravelSuggestion", () => {
  it("prioriza os campos específicos da inclusão", () => {
    const s = extractTravelSuggestion({
      observations: "Ida: 2020-01-01 | Retorno: 2020-01-02",
      flightDepartureDate: "2026-09-01",
      flightArrivalSuggestedTime: "9h",
      flightReturnDate: null,
      flightReturnSuggestedTime: "20h+",
      flightDepartureSuggestedTime: "07:15",
    });
    expect(s).toEqual({ ida: "2026-09-01", retorno: "Não informado", chegada: "9h", horario: "20h+", partida: "07:15" });
    expect(hasAnySuggestion(s)).toBe(true);
  });

  it("cai no texto legado das observações", () => {
    const s = extractTravelSuggestion({ observations: "Ida: 01/09/2026 | Chegada: 10:30 | Retorno: | Horário: 18h" });
    expect(s.ida).toBe("01/09/2026");
    expect(s.chegada).toBe("10:30");
    expect(s.retorno).toBe("Não definido");
    expect(s.horario).toBe("18h");
  });

  it("sem nada → placeholders e hasAnySuggestion false", () => {
    const s = extractTravelSuggestion({ observations: "" });
    expect(hasAnySuggestion(s)).toBe(false);
  });
});

describe("formatSuggestionDate / suggestionDateToIso", () => {
  it("formata ISO e mantém DD/MM/YYYY", () => {
    expect(formatSuggestionDate("2026-09-01")).toBe("01/09/2026");
    expect(formatSuggestionDate("2026-09-01T00:00:00Z")).toBe("01/09/2026");
    expect(formatSuggestionDate("01/09/2026")).toBe("01/09/2026");
    expect(formatSuggestionDate("Não definido")).toBe("Não informado");
  });
  it("normaliza para o input date", () => {
    expect(suggestionDateToIso("01/09/2026")).toBe("2026-09-01");
    expect(suggestionDateToIso("2026-9-1")).toBe("2026-09-01");
    expect(suggestionDateToIso("carro")).toBeNull();
  });
});

describe("suggestionTimeToHHMM (parseHoraMin de shared/)", () => {
  it("normaliza texto livre da escalação", () => {
    expect(suggestionTimeToHHMM("9h")).toBe("09:00");
    expect(suggestionTimeToHHMM("onibus - 10h")).toBe("10:00");
    expect(suggestionTimeToHHMM("0930")).toBe("09:30");
    expect(suggestionTimeToHHMM("22h15")).toBe("22:15");
    expect(suggestionTimeToHHMM("carro")).toBeNull();
    expect(suggestionTimeToHHMM("Não informado")).toBeNull();
  });
});

describe("suggestionToFormPatch (Usar sugestão)", () => {
  const s = { ida: "2026-09-01", retorno: "05/09/2026", chegada: "9h", horario: "carro", partida: "07:15" };

  it("preenche data e horários normalizados; horário não parseável → só a data", () => {
    expect(suggestionToFormPatch(s, {})).toEqual({
      actualDepartureDate: "2026-09-01",
      actualDepartureTime: "07:15",
      actualArrivalTime: "09:00",
      actualReturnDate: "2026-09-05",
    });
  });

  it("não sobrescreve o que já foi digitado (salvo overwrite)", () => {
    const cur = { actualDepartureDate: "2026-09-02", actualArrivalTime: "" };
    expect(suggestionToFormPatch(s, cur)).toEqual({
      actualDepartureTime: "07:15",
      actualArrivalTime: "09:00",
      actualReturnDate: "2026-09-05",
    });
    expect(suggestionToFormPatch(s, cur, { overwrite: true }).actualDepartureDate).toBe("2026-09-01");
  });

  it("apenas ida ignora a volta", () => {
    const p = suggestionToFormPatch(s, { isOneWay: true });
    expect(p.actualReturnDate).toBeUndefined();
    expect(p.actualDepartureDate).toBe("2026-09-01");
  });
});

describe("suggestionDivergences (aviso informativo)", () => {
  const s = { ida: "2026-09-01", retorno: "2026-09-05", chegada: "9h", horario: "18:00" };

  it("nada digitado ou van → sem avisos", () => {
    expect(suggestionDivergences({}, s)).toEqual([]);
    expect(suggestionDivergences({ transportType: "van", actualDepartureDate: "2026-09-03" }, s)).toEqual([]);
  });

  it("dia diferente e horário > 4h avisam; < 4h não", () => {
    const w = suggestionDivergences({
      actualDepartureDate: "2026-09-02",
      actualArrivalTime: "14:30",
      actualReturnDate: "2026-09-05",
      actualReturnTime: "21:00",
    }, s);
    expect(w).toHaveLength(2);
    expect(w[0]).toContain("Data da ida");
    expect(w[0]).toContain("02/09/2026");
    expect(w[1]).toContain("Chegada da ida");
    expect(w[1]).toContain("6h de diferença");
  });

  it("apenas ida não compara a volta", () => {
    const w = suggestionDivergences({ isOneWay: true, actualReturnDate: "2026-09-09" }, s);
    expect(w).toEqual([]);
  });
});

describe("periodDays", () => {
  it("dias corridos inclusivos, sem UTC", () => {
    expect(periodDays("2026-09-01", "2026-09-03")).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(periodDays("2026-09-03", "2026-09-01")).toEqual([]);
    expect(periodDays(null, "2026-09-01")).toEqual([]);
  });
});

describe("buildPlannedImpact (funções reais de shared/)", () => {
  it("van → null; sem horários → nada de mobilidade/refeição", () => {
    expect(buildPlannedImpact({ transportType: "van" })).toBeNull();
    const i = buildPlannedImpact({ transportType: "aereo" })!;
    expect(i.mobilidade.ida).toBeNull();
    expect(i.mobilidade.volta).toBeNull();
    expect(i.alimentacao.chegada).toBeNull();
    expect(formatPlannedImpact(i)).toEqual([]);
  });

  it("chegada de madrugada → R$58 na ida; chegada 10:30 → almoço + jantar no 1º dia", () => {
    const i = buildPlannedImpact({ actualDepartureTime: "23:50", actualArrivalTime: "01:30", isOneWay: true })!;
    expect(i.mobilidade.ida).toEqual({ cents: 5800, madrugada: true });
    expect(i.alimentacao.chegada).toEqual({ almoco: true, jantar: true });
    expect(i.mobilidade.volta).toBeNull();

    const j = buildPlannedImpact({ actualDepartureTime: "08:00", actualArrivalTime: "10:30", actualReturnTime: "14:00" })!;
    expect(j.mobilidade.ida).toEqual({ cents: 5800, madrugada: true }); // parte antes das 09:30
    expect(j.alimentacao.chegada).toEqual({ almoco: true, jantar: true });
    expect(j.mobilidade.volta).toEqual({ cents: 2900, madrugada: false });
    expect(j.alimentacao.retorno).toEqual({ almoco: true, jantar: false }); // parte ≥13h → almoça, <21h → não janta
  });

  it("chegada 15:00 → só jantar; volta 22:00 → almoço + jantar; volta partindo 22h NÃO é madrugada", () => {
    const i = buildPlannedImpact({ actualDepartureTime: "12:00", actualArrivalTime: "15:00", actualReturnTime: "22:00" })!;
    expect(i.alimentacao.chegada).toEqual({ almoco: false, jantar: true });
    expect(i.alimentacao.retorno).toEqual({ almoco: true, jantar: true });
    expect(i.mobilidade.ida).toEqual({ cents: 2900, madrugada: false });
    // Tabela: só VOO partindo 23h30–9h30 ou chegando 20h–5h = R$58; partir às 22h = R$29
    expect(i.mobilidade.volta).toEqual({ cents: 2900, madrugada: false });
    expect(i.mobilidade.totalCents).toBe(5800);
  });

  it("janelas de voo: volta partindo 23:30 = 58; ida chegando 22:30 = 58; ida partindo 20:00 = 29", () => {
    const a = buildPlannedImpact({ actualDepartureTime: "12:00", actualArrivalTime: "15:00", actualReturnTime: "23:30" })!;
    expect(a.mobilidade.volta).toEqual({ cents: 5800, madrugada: true });
    const b = buildPlannedImpact({ actualDepartureTime: "20:00", actualArrivalTime: "22:30", actualReturnTime: "12:00" })!;
    expect(b.mobilidade.ida).toEqual({ cents: 5800, madrugada: true }); // chegada 22:30 está em 20h–5h
    const c = buildPlannedImpact({ actualDepartureTime: "20:00", actualArrivalTime: "19:00", actualReturnTime: "12:00" })!;
    expect(c.mobilidade.ida).toEqual({ cents: 2900, madrugada: false });
  });

  it("rodoviário é terrestre: R$29 fixo por trecho mesmo de madrugada", () => {
    const r = buildPlannedImpact({ transportType: "rodoviario", actualDepartureTime: "00:30", actualArrivalTime: "04:00", actualReturnTime: "23:45" })!;
    expect(r.mobilidade.ida).toEqual({ cents: 2900, madrugada: false });
    expect(r.mobilidade.volta).toEqual({ cents: 2900, madrugada: false });
  });

  it("com período de trabalho, soma refeições com os valores informados", () => {
    const i = buildPlannedImpact(
      { actualDepartureTime: "08:00", actualArrivalTime: "10:30", actualReturnTime: "14:00" },
      { workDays: periodDays("2026-09-01", "2026-09-03"), almocoCents: 4000, jantarCents: 4000 },
    )!;
    // dia 1: almoço+jantar; dia 2: ambos; dia 3: só almoço → 3 almoços, 2 jantares
    expect(i.alimentacao.periodo).toEqual({ dias: 3, almocos: 3, jantares: 2, totalCents: 20000, estimado: false });
    const lines = formatPlannedImpact(i);
    expect(lines[0]).toBe("Ida: madrugada → R$ 58");
    expect(lines[1]).toBe("Volta: padrão → R$ 29");
    expect(lines[2]).toBe("Chegada → almoço + jantar no 1º dia");
    expect(lines[3]).toBe("Volta → só almoço no último dia");
    expect(lines[4]).toContain("3 almoços + 2 jantares em 3 dias → R$ 200");
  });

  it("apenas ida: volta ignorada mesmo se digitada", () => {
    const i = buildPlannedImpact({ isOneWay: true, actualArrivalTime: "10:00", actualReturnTime: "22:00" })!;
    expect(i.mobilidade.volta).toBeNull();
    expect(i.alimentacao.retorno).toBeNull();
  });
});

describe("purchasedValueKpi", () => {
  it("soma e média ignorando nulos/zero", () => {
    expect(purchasedValueKpi([10000, null, 0, 20000, undefined])).toEqual({ count: 2, totalCents: 30000, avgCents: 15000 });
    expect(purchasedValueKpi([])).toEqual({ count: 0, totalCents: 0, avgCents: 0 });
  });
});
