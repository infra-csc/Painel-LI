import { describe, expect, it } from "vitest";
import {
  custoDoHotel, dividirCentavos, entradaDoCustoDoHotel, lateCheckoutsEfetivos, periodoNoQuarto, rotuloDoApartamento,
  type CustoDoHotel, type LateCheckoutDaPessoa, type LinhaParaCusto, type TarifasDoHotel,
} from "./custo-dos-quartos";

// 21/10: a tarifa é o preço do APARTAMENTO por noite, dividido entre quem dorme
// nele ("o duplo é uma vez só, pois é duas pessoas em um quarto duplo"). Os
// valores do print de produção: Individual R$ 100, Duplo R$ 200; o Triplo de
// R$ 270 divide certo por 3 (o de R$ 100, que não divide, tem teste próprio).
const TARIFAS: TarifasDoHotel = { single: 10000, double: 20000, triple: 27000 };
const late = (valorCentavos: number | null = null): LateCheckoutDaPessoa => ({ ativo: true, valorCentavos, origem: "quartos" });

/** A soma das partes bate EXATAMENTE com o total — em cada trecho, cada quarto e no evento. */
function conferirSomas(r: CustoDoHotel) {
  for (const q of r.quartos) {
    for (const t of q.trechos) {
      if (t.partesCentavos) expect(t.partesCentavos.reduce((s, x) => s + x, 0)).toBe(t.totalCentavos);
    }
    expect(q.pessoas.reduce((s, p) => s + p.totalCentavos, 0)).toBe(q.totalCentavos);
  }
  expect(Array.from(r.porPessoa.values()).reduce((s, p) => s + p.totalCentavos, 0)).toBe(r.totalCentavos);
}

describe("dividirCentavos", () => {
  it("divide sem perder centavo: o resto vai para os primeiros", () => {
    expect(dividirCentavos(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(dividirCentavos(20000, 3)).toEqual([6667, 6667, 6666]);
    expect(dividirCentavos(100000, 2)).toEqual([50000, 50000]);
    expect(dividirCentavos(27000, 4)).toEqual([6750, 6750, 6750, 6750]);
    expect(dividirCentavos(1, 3)).toEqual([1, 0, 0]);
    expect(dividirCentavos(0, 2)).toEqual([0, 0]);
    expect(dividirCentavos(500, 0)).toEqual([]);
  });
});

describe("custoDoHotel — tarifa por APARTAMENTO, dividida entre quem dorme no quarto", () => {
  it("Quarto 3 do print: Duplo, 2 pessoas, 21/10→26/10 = 5 × R$ 200 = R$ 1.000, R$ 500 cada", () => {
    const r = custoDoHotel({
      tarifas: TARIFAS,
      quartos: [{ id: "q3", ocupantes: [
        { chave: "a", checkIn: "2026-10-21", checkOut: "2026-10-26" },
        { chave: "b", checkIn: "2026-10-21", checkOut: "2026-10-26" },
      ] }],
    });
    const q = r.porQuarto.get("q3")!;
    expect(q.trechos).toHaveLength(1);
    expect(q.trechos[0]).toMatchObject({ tipo: "double", noites: 5, pessoas: 2, tarifaCentavos: 20000, totalCentavos: 100000, partesCentavos: [50000, 50000] });
    expect(q.totalCentavos).toBe(100000);
    expect(q.pessoas.map((p) => p.totalCentavos)).toEqual([50000, 50000]);
    expect(r.porTipo.find((t) => t.tipo === "double")).toMatchObject({ noitesDeQuarto: 5, pessoasNoite: 10, centavos: 100000, noitesSemTarifa: 0 });
    expect(r.custoMedioPorPessoaCentavos).toBe(50000);
    conferirSomas(r);
  });

  it("duplo com chegada escalonada: sozinho é Individual e ele paga o apartamento Individual inteiro", () => {
    const r = custoDoHotel({
      tarifas: TARIFAS,
      quartos: [{ id: "q1", ocupantes: [
        { chave: "mauricio", checkIn: "2026-04-22", checkOut: "2026-04-27" },
        { chave: "edney", checkIn: "2026-04-24", checkOut: "2026-04-26" },
      ] }],
    });
    const q = r.porQuarto.get("q1")!;
    expect(q.trechos.map((t) => [t.de, t.ate, t.tipo, t.tarifaCentavos, t.totalCentavos, t.partesCentavos])).toEqual([
      ["2026-04-22", "2026-04-24", "single", 10000, 20000, [20000]],
      ["2026-04-24", "2026-04-26", "double", 20000, 40000, [20000, 20000]],
      ["2026-04-26", "2026-04-27", "single", 10000, 10000, [10000]],
    ]);
    expect(r.porPessoa.get("mauricio")).toMatchObject({ noites: 5, totalCentavos: 20000 + 20000 + 10000, completo: true });
    expect(r.porPessoa.get("edney")).toMatchObject({ noites: 2, totalCentavos: 20000, completo: true });
    expect(q.totalCentavos).toBe(70000);
    expect(q).toMatchObject({ noitesDeQuarto: 5, pessoasNoite: 7 });
    expect(r.porTipo.find((t) => t.tipo === "single")).toMatchObject({ noitesDeQuarto: 3, pessoasNoite: 3, centavos: 30000 });
    expect(r.porTipo.find((t) => t.tipo === "double")).toMatchObject({ noitesDeQuarto: 2, pessoasNoite: 4, centavos: 40000 });
    expect(r.custoMedioPorPessoaCentavos).toBe(35000);
    conferirSomas(r);
  });

  it("triplo que divide certo: R$ 270 o apartamento, 3 noites = R$ 810, R$ 270 cada", () => {
    const r = custoDoHotel({
      tarifas: TARIFAS,
      quartos: [{ id: "q1", ocupantes: ["a", "b", "c"].map((chave) => ({ chave, checkIn: "2026-05-10", checkOut: "2026-05-13" })) }],
    });
    expect(r.porQuarto.get("q1")!.trechos[0]).toMatchObject({ tipo: "triple", pessoas: 3, totalCentavos: 81000, partesCentavos: [27000, 27000, 27000] });
    for (const c of ["a", "b", "c"]) expect(r.porPessoa.get(c)!.totalCentavos).toBe(27000);
    expect(r.totalCentavos).toBe(81000);
    conferirSomas(r);
  });

  it("triplo de R$ 100 (não divide por 3): os primeiros ficam com +1 centavo e a soma bate com o quarto", () => {
    const tarifas: TarifasDoHotel = { single: 10000, double: 10000, triple: 10000 };
    const tres = (checkOut: string) => custoDoHotel({
      tarifas,
      quartos: [{ id: "q1", ocupantes: ["a", "b", "c"].map((chave) => ({ chave, checkIn: "2026-05-10", checkOut })) }],
    });
    const uma = tres("2026-05-11");
    expect(uma.porQuarto.get("q1")!.pessoas.map((p) => p.totalCentavos)).toEqual([3334, 3333, 3333]);
    expect(uma.totalCentavos).toBe(10000);
    conferirSomas(uma);

    // Duas noites: o trecho (R$ 200) é que é dividido — 6.667 + 6.667 + 6.666.
    const duas = tres("2026-05-12");
    expect(duas.porQuarto.get("q1")!.pessoas.map((p) => p.totalCentavos)).toEqual([6667, 6667, 6666]);
    expect(duas.totalCentavos).toBe(20000);
    conferirSomas(duas);

    // Três noites: R$ 300 ÷ 3 divide certo.
    const todas = tres("2026-05-13");
    expect(todas.porQuarto.get("q1")!.pessoas.map((p) => p.totalCentavos)).toEqual([10000, 10000, 10000]);
    conferirSomas(todas);
  });

  it("late check-out: sem valor escrito vale a parte da pessoa na última noite; com valor, o valor (por pessoa)", () => {
    const r = custoDoHotel({
      tarifas: TARIFAS,
      quartos: [{ id: "q1", ocupantes: [
        { chave: "a", checkIn: "2026-05-10", checkOut: "2026-05-12" },
        { chave: "b", checkIn: "2026-05-10", checkOut: "2026-05-12" },
      ] }],
      lateCheckouts: new Map([["a", late()], ["b", late(5000)]]),
    });
    const [a, b] = r.porQuarto.get("q1")!.pessoas;
    expect(a.parteDaUltimaNoiteCentavos).toBe(10000);
    expect(a.lateCheckout).toEqual({ valorCentavos: 10000, sugerido: true, origem: "quartos" });
    expect(a.totalCentavos).toBe(20000 + 10000); // o "Hotel TT" da planilha: a parte nas noites + late
    expect(b.lateCheckout).toEqual({ valorCentavos: 5000, sugerido: false, origem: "quartos" });
    expect(b.totalCentavos).toBe(20000 + 5000);
    expect(r.lateCheckout).toEqual({ pessoas: 2, centavos: 15000 });
    expect(r.totalCentavos).toBe(40000 + 15000);
    conferirSomas(r);
  });

  it("late check-out sugerido num triplo que não divide: a parte DELA na última noite (com o centavo, se for a primeira)", () => {
    const r = custoDoHotel({
      tarifas: { single: null, double: null, triple: 10000 },
      quartos: [{ id: "q1", ocupantes: ["a", "b", "c"].map((chave) => ({ chave, checkIn: "2026-05-10", checkOut: "2026-05-11" })) }],
      lateCheckouts: new Map([["a", late()], ["c", late()]]),
    });
    const [a, , c] = r.porQuarto.get("q1")!.pessoas;
    expect(a.lateCheckout?.valorCentavos).toBe(3334);
    expect(c.lateCheckout?.valorCentavos).toBe(3333);
  });

  it("late check-out sem tarifa nem valor: entra como incompleto (não vira zero calado)", () => {
    const r = custoDoHotel({
      tarifas: { single: null, double: null, triple: null },
      quartos: [{ id: "q1", ocupantes: [{ chave: "a", checkIn: "2026-05-10", checkOut: "2026-05-12" }] }],
      lateCheckouts: new Map([["a", late()]]),
    });
    expect(r.porPessoa.get("a")).toMatchObject({ totalCentavos: 0, completo: false });
    expect(r.temValores).toBe(false);
    expect(r.completo).toBe(false);
  });

  it("diária própria: preço do apartamento em todas as noites, dividido entre os ocupantes de cada noite", () => {
    const r = custoDoHotel({
      tarifas: TARIFAS,
      quartos: [
        { id: "q1", diariaPropriaCentavos: 15000, ocupantes: [
          { chave: "a", checkIn: "2026-05-10", checkOut: "2026-05-13" },
          { chave: "b", checkIn: "2026-05-11", checkOut: "2026-05-13" },
        ] },
        { id: "q2", ocupantes: [{ chave: "c", checkIn: "2026-05-10", checkOut: "2026-05-11" }] },
      ],
    });
    const q1 = r.porQuarto.get("q1")!;
    expect(q1.usaDiariaPropria).toBe(true);
    expect(q1.trechos.map((t) => [t.tipo, t.origem, t.tarifaCentavos, t.totalCentavos, t.partesCentavos])).toEqual([
      ["single", "quarto", 15000, 15000, [15000]],
      ["double", "quarto", 15000, 30000, [15000, 15000]],
    ]);
    expect(q1.totalCentavos).toBe(15000 + 2 * 15000);
    expect(r.porPessoa.get("a")!.totalCentavos).toBe(30000);
    expect(r.porPessoa.get("b")!.totalCentavos).toBe(15000);
    expect(r.porQuarto.get("q2")!.trechos[0]).toMatchObject({ origem: "evento", tarifaCentavos: 10000, totalCentavos: 10000 });
    expect(r.temValores).toBe(true);
    conferirSomas(r);
  });

  it("pessoa que troca de quarto: o custo dela soma a parte nos dois quartos; o late check-out fica no quarto de onde ela sai", () => {
    const r = custoDoHotel({
      tarifas: TARIFAS,
      quartos: [
        { id: "q1", ocupantes: [
          { chave: "a", checkIn: "2026-05-10", checkOut: "2026-05-12" },
          { chave: "b", checkIn: "2026-05-10", checkOut: "2026-05-12" },
        ] },
        { id: "q2", ocupantes: [{ chave: "a", checkIn: "2026-05-12", checkOut: "2026-05-14" }] },
      ],
      lateCheckouts: new Map([["a", late()]]),
    });
    expect(r.porPessoa.get("a")).toMatchObject({
      noites: 4, quartos: ["q1", "q2"], lateCheckoutCentavos: 10000,
      totalCentavos: 20000 + 20000 + 10000,
    });
    expect(r.porQuarto.get("q1")!.pessoas[0].lateCheckout).toBeNull();
    expect(r.porQuarto.get("q2")!.pessoas[0].lateCheckout).toMatchObject({ valorCentavos: 10000 });
    expect(r.pessoas).toBe(2);
    conferirSomas(r);
  });

  it("noite com 4 pessoas: o apartamento Triplo ÷ 4, e vira aviso", () => {
    const r = custoDoHotel({
      tarifas: TARIFAS,
      quartos: [{ id: "q1", ocupantes: ["a", "b", "c", "d"].map((chave) => ({ chave, checkIn: "2026-05-10", checkOut: "2026-05-11" })) }],
    });
    const q = r.porQuarto.get("q1")!;
    expect(q.trechos[0]).toMatchObject({ tipo: "triple", pessoas: 4, acimaDoTriplo: true, tarifaCentavos: 27000, totalCentavos: 27000, partesCentavos: [6750, 6750, 6750, 6750] });
    expect(q.acimaDoTriplo).toBe(true);
    expect(r.noitesAcimaDoTriplo).toEqual([{ quartoId: "q1", de: "2026-05-10", ate: "2026-05-11", pessoas: 4 }]);
    conferirSomas(r);
  });

  it("tarifa faltando para um tipo: as noites desse tipo ficam sem valor e o tipo é apontado", () => {
    const r = custoDoHotel({
      tarifas: { single: null, double: 20000, triple: null },
      quartos: [{ id: "q1", ocupantes: [
        { chave: "a", checkIn: "2026-05-10", checkOut: "2026-05-13" },
        { chave: "b", checkIn: "2026-05-11", checkOut: "2026-05-13" },
      ] }],
    });
    const q = r.porQuarto.get("q1")!;
    expect(q.noitesSemTarifa).toBe(1);
    expect(q.completo).toBe(false);
    expect(q.trechos[0]).toMatchObject({ tipo: "single", totalCentavos: null, partesCentavos: null });
    expect(r.porPessoa.get("a")).toMatchObject({ completo: false, totalCentavos: 20000 });
    expect(r.porPessoa.get("b")).toMatchObject({ completo: true, totalCentavos: 20000 });
    expect(r.porTipo.find((t) => t.tipo === "single")).toMatchObject({ noitesDeQuarto: 1, noitesSemTarifa: 1, centavos: 0 });
    expect(r.tiposSemTarifa).toEqual(["single"]);
  });

  it("ocupante sem datas não gera noite nem custo", () => {
    const r = custoDoHotel({ tarifas: TARIFAS, quartos: [{ id: "q1", ocupantes: [{ chave: "a", checkIn: null, checkOut: "2026-05-12" }] }] });
    expect(r.porPessoa.get("a")).toMatchObject({ noites: 0, totalCentavos: 0, completo: true });
    expect(r.pessoas).toBe(0);
    expect(r.custoMedioPorPessoaCentavos).toBeNull();
  });
});

describe("custoDoHotel — calculado × pago (sem redistribuir nada)", () => {
  const quartos = [
    { id: "q1", valorPagoCentavos: 50000, ocupantes: [
      { chave: "a", checkIn: "2026-05-10", checkOut: "2026-05-12" },
      { chave: "b", checkIn: "2026-05-10", checkOut: "2026-05-12" },
    ] },
    { id: "q2", ocupantes: [{ chave: "c", checkIn: "2026-05-10", checkOut: "2026-05-12" }] },
  ];

  it("fatura do evento: diferença e percentual sobre o calculado; média = total ÷ pessoas", () => {
    const r = custoDoHotel({ tarifas: TARIFAS, quartos, faturaCentavos: 70000 });
    expect(r.totalCentavos).toBe(2 * 20000 + 2 * 10000); // 60.000
    expect(r.fatura).toEqual({ pagoCentavos: 70000, diferencaCentavos: 10000, percentual: 10000 / 60000 });
    // O valor de cada pessoa NÃO muda por causa da fatura.
    expect(r.porPessoa.get("a")!.totalCentavos).toBe(20000);
    expect(r.custoMedioPorPessoaCentavos).toBe(20000);
  });

  it("valor pago por quarto: diferença do quarto e soma só dos quartos lançados", () => {
    const r = custoDoHotel({ tarifas: TARIFAS, quartos });
    expect(r.porQuarto.get("q1")).toMatchObject({ valorPagoCentavos: 50000, diferencaCentavos: 50000 - 40000 });
    expect(r.porQuarto.get("q2")).toMatchObject({ valorPagoCentavos: null, diferencaCentavos: null });
    expect(r.pagoPorQuarto).toEqual({ quartos: 1, pagoCentavos: 50000, calculadoCentavos: 40000, diferencaCentavos: 10000 });
    expect(r.fatura).toBeNull();
  });

  it("valores inválidos (negativo, fração) contam como não informados", () => {
    const r = custoDoHotel({ tarifas: { single: -1, double: 13800.5, triple: null }, quartos: [{ ...quartos[1], valorPagoCentavos: -5 }], faturaCentavos: Number.NaN });
    expect(r.temValores).toBe(false);
    expect(r.porQuarto.get("q2")!.valorPagoCentavos).toBeNull();
    expect(r.fatura).toBeNull();
  });
});

describe("montagem a partir do Espelho", () => {
  const linha = (id: string, extra: Partial<LinhaParaCusto> = {}): LinhaParaCusto => ({
    collaborator: { id }, datasDoQuarto: null, accommodation: null, schedule: { startDate: "2026-05-11", endDate: "2026-05-13" }, ...extra,
  });

  it("periodoNoQuarto: estadia própria → passagem → hospedagem → escala → quarto", () => {
    const grupo = { checkInDate: "2026-05-01", checkOutDate: "2026-05-09" };
    const completa = linha("a", { datasDoQuarto: { checkIn: "2026-05-10", checkOut: "2026-05-14" }, accommodation: { checkInDate: "2026-05-09", checkOutDate: "2026-05-15" } });
    expect(periodoNoQuarto({ checkInDate: "2026-05-12", checkOutDate: null }, completa, grupo)).toEqual({ checkIn: "2026-05-12", checkOut: "2026-05-14" });
    expect(periodoNoQuarto({}, linha("a", { accommodation: { checkInDate: "2026-05-09", checkOutDate: "2026-05-15" } }), grupo)).toEqual({ checkIn: "2026-05-09", checkOut: "2026-05-15" });
    expect(periodoNoQuarto({}, linha("a"), grupo)).toEqual({ checkIn: "2026-05-11", checkOut: "2026-05-13" });
    expect(periodoNoQuarto({}, undefined, grupo)).toEqual({ checkIn: "2026-05-01", checkOut: "2026-05-09" });
  });

  it("late check-out: o da hospedagem conta; o marcado na aba Quartos vence (inclusive desmarcando)", () => {
    const linhas = [
      linha("a", { accommodation: { lateCheckout: true } }),
      linha("b", { accommodation: { lateCheckout: true } }),
      linha("c"),
    ];
    const m = lateCheckoutsEfetivos(linhas, [
      { collaboratorId: "b", ativo: false, valorCentavos: null },
      { collaboratorId: "c", ativo: true, valorCentavos: 5000 },
    ]);
    expect(m.get("a")).toEqual({ ativo: true, valorCentavos: null, origem: "hospedagem" });
    expect(m.has("b")).toBe(false);
    expect(m.get("c")).toEqual({ ativo: true, valorCentavos: 5000, origem: "quartos" });
  });

  it("entradaDoCustoDoHotel: tarifas, diária própria e datas de cada ocupante", () => {
    const grupos = [{ id: "q1", checkInDate: "2026-05-10", checkOutDate: "2026-05-13", members: [
      { id: "m1", collaboratorId: "a", checkInDate: null, checkOutDate: null },
      { id: "m2", collaboratorId: null, checkInDate: "2026-05-11", checkOutDate: null },
    ] }];
    const e = entradaDoCustoDoHotel(grupos, [linha("a")], {
      tarifas: TARIFAS, faturaCentavos: 1000,
      quartos: [{ quartoId: "q1", diariaPropriaCentavos: 9000, valorPagoCentavos: null }],
      lateCheckouts: [],
    });
    expect(e.faturaCentavos).toBe(1000);
    expect(e.quartos[0]).toMatchObject({ id: "q1", diariaPropriaCentavos: 9000 });
    expect(e.quartos[0].ocupantes).toEqual([
      { chave: "a", checkIn: "2026-05-11", checkOut: "2026-05-13" },
      { chave: "ocupante:m2", checkIn: "2026-05-11", checkOut: "2026-05-13" },
    ]);
    expect(entradaDoCustoDoHotel(grupos, [], null).tarifas).toEqual({ single: null, double: null, triple: null });
  });

  it("rótulos do dono: Individual, Duplo, Triplo", () => {
    expect(["single", "double", "triple"].map((t) => rotuloDoApartamento(t as "single"))).toEqual(["Individual", "Duplo", "Triplo"]);
  });
});
