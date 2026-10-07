import { describe, expect, it } from "vitest";
import { montarAvisoDeAlteracao, oQueRever, textoDoValor } from "./aviso-de-alteracao";

const d = (field: string, from: unknown, to: unknown) => ({ field, label: field, from, to }) as never;

describe("aviso de alteração para Compras (02/10)", () => {
  it("data de ida mudou em vaga com passagem → aviso de passagem", () => {
    const a = montarAvisoDeAlteracao([d("flightDepartureDate", "2026-10-29", "2026-10-30")], { temPassagem: true, temHospedagem: false });
    expect(a).toMatchObject({ afetaPassagem: true, afetaHospedagem: false });
    expect(a?.mudancas[0]).toMatchObject({ de: "29/10/2026", para: "30/10/2026" });
  });

  it("dias de trabalho mudaram com passagem e hospedagem → as duas", () => {
    const a = montarAvisoDeAlteracao([d("workDays", ["2026-10-29"], ["2026-10-29", "2026-10-30"])], { temPassagem: true, temHospedagem: true });
    expect(a && oQueRever(a)).toBe("Passagem e hospedagem");
    expect(a?.mudancas[0].para).toBe("29/10, 30/10");
  });

  it("horário mudou mas só há hospedagem → não vira aviso", () => {
    expect(montarAvisoDeAlteracao([d("flightDepartureSuggestedTime", "08:00", "06:00")], { temPassagem: false, temHospedagem: true })).toBeNull();
  });

  it("só observação ou sem nada registrado → não vira aviso", () => {
    expect(montarAvisoDeAlteracao([d("observations", null, "x")], { temPassagem: true, temHospedagem: true })).toBeNull();
    expect(montarAvisoDeAlteracao([d("flightReturnDate", "2026-10-31", "2026-11-01")], { temPassagem: false, temHospedagem: false })).toBeNull();
    expect(montarAvisoDeAlteracao([], { temPassagem: true, temHospedagem: true })).toBeNull();
  });

  it("texto dos valores", () => {
    expect(textoDoValor("needsTicket", true)).toBe("Sim");
    expect(textoDoValor("flightReturnDate", null)).toBe("—");
    expect(textoDoValor("transportModeIda", "aereo")).not.toBe("aereo");
  });
});
