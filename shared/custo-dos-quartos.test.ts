import { describe, expect, it } from "vitest";
import {
  custoDoHotel, entradaDoCustoDoHotel, lateCheckoutsEfetivos, periodoNoQuarto, rotuloDoApartamento,
  type LateCheckoutDaPessoa, type LinhaParaCusto, type TarifasDoHotel,
} from "./custo-dos-quartos";

// A planilha do dono: duplo R$ 138 e triplo R$ 132 por pessoa por noite; o
// individual (single) não aparece nela — R$ 180 aqui é só o exemplo.
const TARIFAS: TarifasDoHotel = { single: 18000, double: 13800, triple: 13200 };
const late = (valorCentavos: number | null = null): LateCheckoutDaPessoa => ({ ativo: true, valorCentavos, origem: "quartos" });

describe("custoDoHotel — o tipo de cada noite vem da ocupação", () => {
  it("duplo com chegada escalonada (caso da planilha): Individual até o Edney chegar, Duplo com os dois, Individual depois", () => {
    const r = custoDoHotel({
      tarifas: TARIFAS,
      quartos: [{ id: "q1", ocupantes: [
        { chave: "mauricio", checkIn: "2026-04-22", checkOut: "2026-04-27" },
        { chave: "edney", checkIn: "2026-04-24", checkOut: "2026-04-26" },
      ] }],
    });
    const q = r.porQuarto.get("q1")!;
    expect(q.trechos.map((t) => [t.de, t.ate, t.tipo, t.tarifaCentavos, t.totalCentavos])).toEqual([
      ["2026-04-22", "2026-04-24", "single", 18000, 36000],
      ["2026-04-24", "2026-04-26", "double", 13800, 55200],
      ["2026-04-26", "2026-04-27", "single", 18000, 18000],
    ]);
    expect(r.porPessoa.get("mauricio")).toMatchObject({ noites: 5, totalCentavos: 36000 + 27600 + 18000, completo: true });
    expect(r.porPessoa.get("edney")).toMatchObject({ noites: 2, totalCentavos: 27600, completo: true });
    expect(q.totalCentavos).toBe(109200);
    expect(r.porTipo.find((t) => t.tipo === "single")).toMatchObject({ diarias: 3, noitesDeQuarto: 3, centavos: 54000 });
    expect(r.porTipo.find((t) => t.tipo === "double")).toMatchObject({ diarias: 4, noitesDeQuarto: 2, centavos: 55200 });
    expect(r.custoMedioPorPessoaCentavos).toBe(54600);
  });

  it("triplo: três pessoas, três noites, R$ 132 cada", () => {
    const r = custoDoHotel({
      tarifas: TARIFAS,
      quartos: [{ id: "q1", ocupantes: ["a", "b", "c"].map((chave) => ({ chave, checkIn: "2026-05-10", checkOut: "2026-05-13" })) }],
    });
    expect(r.porQuarto.get("q1")!.trechos).toHaveLength(1);
    expect(r.porQuarto.get("q1")!.trechos[0]).toMatchObject({ tipo: "triple", pessoas: 3, totalCentavos: 3 * 3 * 13200 });
    for (const c of ["a", "b", "c"]) expect(r.porPessoa.get(c)!.totalCentavos).toBe(39600);
    expect(r.totalCentavos).toBe(118800);
  });

  it("late check-out: sem valor escrito vale a diária da última noite; com valor, o valor", () => {
    const r = custoDoHotel({
      tarifas: TARIFAS,
      quartos: [{ id: "q1", ocupantes: [
        { chave: "a", checkIn: "2026-05-10", checkOut: "2026-05-12" },
        { chave: "b", checkIn: "2026-05-10", checkOut: "2026-05-12" },
      ] }],
      lateCheckouts: new Map([["a", late()], ["b", late(10000)]]),
    });
    const [a, b] = r.porQuarto.get("q1")!.pessoas;
    expect(a.lateCheckout).toEqual({ valorCentavos: 13800, sugerido: true, origem: "quartos" });
    expect(a.totalCentavos).toBe(2 * 13800 + 13800); // o "Hotel TT" da planilha: diárias + late
    expect(b.lateCheckout).toEqual({ valorCentavos: 10000, sugerido: false, origem: "quartos" });
    expect(b.totalCentavos).toBe(2 * 13800 + 10000);
    expect(r.lateCheckout).toEqual({ pessoas: 2, centavos: 23800 });
    expect(r.totalCentavos).toBe(4 * 13800 + 23800);
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

  it("quarto com diária própria: vale em todas as noites dele, inclusive as de quem fica sozinho", () => {
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
    expect(q1.trechos.map((t) => [t.tipo, t.origem, t.tarifaCentavos])).toEqual([["single", "quarto", 15000], ["double", "quarto", 15000]]);
    expect(q1.totalCentavos).toBe(15000 + 2 * 2 * 15000);
    expect(r.porQuarto.get("q2")!.trechos[0]).toMatchObject({ origem: "evento", tarifaCentavos: 18000 });
    expect(r.temValores).toBe(true);
  });

  it("pessoa que troca de quarto: o custo dela soma os dois quartos; o late check-out fica no quarto de onde ela sai", () => {
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
      noites: 4, quartos: ["q1", "q2"], lateCheckoutCentavos: 18000,
      totalCentavos: 2 * 13800 + 2 * 18000 + 18000,
    });
    expect(r.porQuarto.get("q1")!.pessoas[0].lateCheckout).toBeNull();
    expect(r.porQuarto.get("q2")!.pessoas[0].lateCheckout).toMatchObject({ valorCentavos: 18000 });
    expect(r.pessoas).toBe(2);
  });

  it("noite com 4 pessoas: usa a tarifa do Triplo e vira aviso", () => {
    const r = custoDoHotel({
      tarifas: TARIFAS,
      quartos: [{ id: "q1", ocupantes: ["a", "b", "c", "d"].map((chave) => ({ chave, checkIn: "2026-05-10", checkOut: "2026-05-11" })) }],
    });
    const q = r.porQuarto.get("q1")!;
    expect(q.trechos[0]).toMatchObject({ tipo: "triple", pessoas: 4, acimaDoTriplo: true, tarifaCentavos: 13200, totalCentavos: 4 * 13200 });
    expect(q.acimaDoTriplo).toBe(true);
    expect(r.noitesAcimaDoTriplo).toEqual([{ quartoId: "q1", de: "2026-05-10", ate: "2026-05-11", pessoas: 4 }]);
  });

  it("tarifa faltando para um tipo: as noites desse tipo ficam sem valor e o tipo é apontado", () => {
    const r = custoDoHotel({
      tarifas: { single: null, double: 13800, triple: null },
      quartos: [{ id: "q1", ocupantes: [
        { chave: "a", checkIn: "2026-05-10", checkOut: "2026-05-13" },
        { chave: "b", checkIn: "2026-05-11", checkOut: "2026-05-13" },
      ] }],
    });
    const q = r.porQuarto.get("q1")!;
    expect(q.noitesSemTarifa).toBe(1);
    expect(q.completo).toBe(false);
    expect(r.porPessoa.get("a")).toMatchObject({ completo: false, totalCentavos: 2 * 13800 });
    expect(r.porPessoa.get("b")).toMatchObject({ completo: true, totalCentavos: 2 * 13800 });
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
    { id: "q1", valorPagoCentavos: 60000, ocupantes: [
      { chave: "a", checkIn: "2026-05-10", checkOut: "2026-05-12" },
      { chave: "b", checkIn: "2026-05-10", checkOut: "2026-05-12" },
    ] },
    { id: "q2", ocupantes: [{ chave: "c", checkIn: "2026-05-10", checkOut: "2026-05-12" }] },
  ];

  it("fatura do evento: diferença e percentual sobre o calculado", () => {
    const r = custoDoHotel({ tarifas: TARIFAS, quartos, faturaCentavos: 100000 });
    expect(r.totalCentavos).toBe(4 * 13800 + 2 * 18000); // 91.200
    expect(r.fatura).toEqual({ pagoCentavos: 100000, diferencaCentavos: 8800, percentual: 8800 / 91200 });
    // O valor de cada pessoa NÃO muda por causa da fatura.
    expect(r.porPessoa.get("a")!.totalCentavos).toBe(27600);
  });

  it("valor pago por quarto: diferença do quarto e soma só dos quartos lançados", () => {
    const r = custoDoHotel({ tarifas: TARIFAS, quartos });
    expect(r.porQuarto.get("q1")).toMatchObject({ valorPagoCentavos: 60000, diferencaCentavos: 60000 - 55200 });
    expect(r.porQuarto.get("q2")).toMatchObject({ valorPagoCentavos: null, diferencaCentavos: null });
    expect(r.pagoPorQuarto).toEqual({ quartos: 1, pagoCentavos: 60000, calculadoCentavos: 55200, diferencaCentavos: 4800 });
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
