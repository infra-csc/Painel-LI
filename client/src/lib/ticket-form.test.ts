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
