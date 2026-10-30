import { describe, expect, it } from "vitest";
import { diariasQueFicam } from "./dividir-diarias";
import { diariasDoValor } from "./honorarios-ceno";

// 2026-11-12 é quinta; 13 sexta; 14 sábado; 15 domingo.
const QUI = "2026-11-12", SEX = "2026-11-13", SAB = "2026-11-14", DOM = "2026-11-15";

describe("diariasQueFicam (Dividir, 30/10)", () => {
  it("freela: fica com o valor exato dos dias que continuam", () => {
    const r = diariasQueFicam({ subtotalCents: 40000, dias: [QUI, SEX, SAB, DOM], ficam: [SEX, SAB, DOM], collaboratorType: "freela", fatores: null });
    expect(r.subtotalCents).toBe(30000);
    expect(r.dailyQuantity).toBe(3);
  });

  it("casa: o dia útil que fica não ganha diária", () => {
    // Casa recebe só no fds: 2 diárias de R$ 150.
    const r = diariasQueFicam({ subtotalCents: 30000, dias: [QUI, SEX, SAB, DOM], ficam: [SEX, SAB, DOM], collaboratorType: "casa", fatores: null });
    expect(r.subtotalCents).toBe(30000);
    expect(r.dailyQuantity).toBe(2);
  });

  it("o ½ do dia que sai vai embora junto; o que fica continua", () => {
    // 4 dias de R$ 100 + ½ no domingo = R$ 450.
    const sai = diariasQueFicam({ subtotalCents: 45000, dias: [QUI, SEX, SAB, DOM], ficam: [QUI, SEX, SAB], diasMeiaExtra: [DOM], collaboratorType: "freela", fatores: null });
    expect(sai.subtotalCents).toBe(30000);
    expect(sai.diasMeiaExtra).toBeNull();
    const fica = diariasQueFicam({ subtotalCents: 45000, dias: [QUI, SEX, SAB, DOM], ficam: [SAB, DOM], diasMeiaExtra: [DOM], collaboratorType: "freela", fatores: null });
    expect(fica.subtotalCents).toBe(25000);
    expect(fica.diasMeiaExtra).toEqual([DOM]);
  });

  it("dobra que fica conta 1 diária a mais", () => {
    const r = diariasQueFicam({ subtotalCents: 50000, dias: [QUI, SEX, SAB, DOM], ficam: [SAB, DOM], diasDobra: [SAB], collaboratorType: "freela", fatores: null });
    expect(r.subtotalCents).toBe(30000);
    expect(r.dailyQuantity).toBe(3);
    expect(r.diasDobra).toEqual([SAB]);
  });
});

describe("diariasDoValor (honorários da cenotécnica, 30/10)", () => {
  it("freela: as diárias da vaga", () => {
    expect(diariasDoValor({ tipo: "vaga", diarias: 4 })).toBe(4);
  });

  it("empreita com vagas: soma as diárias de todas (R$ 6.670 ÷ 20 = R$ 333,50)", () => {
    const vagas = Array.from({ length: 5 }, () => ({ dias: 4, aviso: null }));
    expect(diariasDoValor({ tipo: "empreita", diarias: 4, pessoas: 5, vagasDaEmpreita: vagas })).toBe(20);
  });

  it("empreita sem vaga na escala: pessoas × diárias", () => {
    expect(diariasDoValor({ tipo: "empreita", diarias: 4, pessoas: 5, vagasDaEmpreita: [] })).toBe(20);
  });

  it("empreita com menos vagas que pessoas: o resto trabalha os dias do pedido", () => {
    expect(diariasDoValor({ tipo: "empreita", diarias: 4, pessoas: 3, vagasDaEmpreita: [{ dias: 2, aviso: null }] })).toBe(10);
  });

  it("vaga excluída da escala não conta", () => {
    expect(diariasDoValor({ tipo: "empreita", diarias: 4, pessoas: 2, vagasDaEmpreita: [{ dias: 4, aviso: null }, { dias: 4, aviso: "excluida" }] })).toBe(8);
  });
});
