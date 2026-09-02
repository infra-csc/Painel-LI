import { describe, it, expect } from "vitest";
import {
  ORDEM_PADRAO, agregarPorColaborador, buildPayload, contadoresPorCia, contarPorOpcao,
  locJaRegistrado, ordenar, passaNosFiltros, resumir, validate, type FiltrosDaLista,
} from "./baggage-logic";
import {
  ciaGroup, contarObrigatorios, emptyForm, formatCpf, getCpf,
  type BaggageRequestItem, type CollaboratorItem, type EventItem, type FormState,
} from "./baggage-core";

/**
 * Estes testes existem porque a regra foi EXTRAÍDA de uma página de 1.563
 * linhas para que os contadores dos popovers e a fila por companhia usassem a
 * mesma regra da lista. Extrair regra que já está em produção é onde se muda
 * comportamento sem querer.
 */

const COLABS = new Map<string, CollaboratorItem>([
  ["c1", { id: "c1", fullName: "BRUNO CARVALHO DE SOUZA", documentType: "cpf", officialDocument: "12345678909" }],
  ["c2", { id: "c2", fullName: "carla menezes", secondaryDocumentType: "cpf", secondaryDocument: "98765432100" }],
]);
const EVENTOS = new Map<string, EventItem>([
  ["e1", { id: "e1", name: "Circuito das Estações" }],
  ["e2", { id: "e2", name: "Night Run" }],
]);
const ctx = { collabById: COLABS, eventById: EVENTOS };

const filtros = (over: Partial<FiltrosDaLista> = {}): FiltrosDaLista => ({
  eventId: "", collaboratorIds: [], search: "", cia: null, ...over,
});

let seq = 0;
const pedido = (over: Partial<BaggageRequestItem> = {}): BaggageRequestItem => ({
  id: `r${++seq}`, eventId: "e1", collaboratorId: "c1",
  loc: "AX782Q", cia: "Azul", valueCents: 12000, os: "OS-1", quantity: 1,
  agency: "LCA", requestDate: "2026-09-01", boardingDate: "2026-09-11",
  createdAt: `2026-09-0${(seq % 9) + 1}`,
  ...over,
});

describe("CPF do colaborador", () => {
  it("vem do documento oficial ou do secundário, conforme o tipo", () => {
    expect(getCpf(COLABS.get("c1")!)).toBe("12345678909");
    expect(getCpf(COLABS.get("c2")!)).toBe("98765432100");
    expect(getCpf({ id: "x", fullName: "Sem CPF", documentType: "rg", officialDocument: "123" })).toBe("");
  });

  it("formata só quando tem 11 dígitos — senão devolve como está", () => {
    expect(formatCpf("12345678909")).toBe("123.456.789-09");
    expect(formatCpf("123")).toBe("123");
    expect(formatCpf("")).toBe("");
  });
});

describe("agrupamento de companhia", () => {
  it("latam entra no grupo TAM, e o resto vira Outros", () => {
    expect(ciaGroup("Azul")).toBe("Azul");
    expect(ciaGroup("  gol ")).toBe("Gol");
    expect(ciaGroup("tam")).toBe("TAM");
    expect(ciaGroup("Latam")).toBe("TAM");
    expect(ciaGroup("Passaredo")).toBe("Outros");
    expect(ciaGroup("")).toBe("Outros");
  });
});

describe("filtro da lista", () => {
  it("evento, colaborador e companhia cortam cada um pelo seu campo", () => {
    expect(passaNosFiltros(pedido({ eventId: "e2" }), filtros({ eventId: "e1" }), ctx)).toBe(false);
    expect(passaNosFiltros(pedido({ collaboratorId: "c2" }), filtros({ collaboratorIds: ["c1"] }), ctx)).toBe(false);
    expect(passaNosFiltros(pedido({ cia: "Gol" }), filtros({ cia: "Azul" }), ctx)).toBe(false);
    // "Latam" cai no bloco TAM, e é assim que a fila o encontra.
    expect(passaNosFiltros(pedido({ cia: "Latam" }), filtros({ cia: "TAM" }), ctx)).toBe(true);
  });

  it("colaborador é seleção múltipla: basta casar com um", () => {
    expect(passaNosFiltros(pedido({ collaboratorId: "c2" }), filtros({ collaboratorIds: ["c1", "c2"] }), ctx)).toBe(true);
  });

  it("a busca varre nome, LOC, OS, evento e CPF", () => {
    const r = pedido({ loc: "KP4419", os: "OS-778", collaboratorId: "c1", eventId: "e2" });
    expect(passaNosFiltros(r, filtros({ search: "bruno" }), ctx)).toBe(true);
    expect(passaNosFiltros(r, filtros({ search: "kp4419" }), ctx)).toBe(true);
    expect(passaNosFiltros(r, filtros({ search: "os-778" }), ctx)).toBe(true);
    expect(passaNosFiltros(r, filtros({ search: "night" }), ctx)).toBe(true);
    // CPF pontuado ou puro: só os dígitos importam.
    expect(passaNosFiltros(r, filtros({ search: "123.456.789-09" }), ctx)).toBe(true);
    expect(passaNosFiltros(r, filtros({ search: "carla" }), ctx)).toBe(false);
  });
});

describe("ordenação", () => {
  const a = pedido({ boardingDate: "2026-09-11", valueCents: 15000, cia: "Gol", collaboratorId: "c2" });
  const b = pedido({ boardingDate: "2026-09-20", valueCents: 9000, cia: "Azul", collaboratorId: "c1" });
  const linhas = [a, b];

  it("a ordem padrão é embarque mais recente primeiro", () => {
    expect(ordenar(linhas, ORDEM_PADRAO, ctx).map(r => r.id)).toEqual([b.id, a.id]);
  });

  it("inverter troca os dois lados", () => {
    expect(ordenar(linhas, { campo: "boarding", desc: false }, ctx).map(r => r.id)).toEqual([a.id, b.id]);
  });

  it("ordena por valor, por companhia e por colaborador", () => {
    expect(ordenar(linhas, { campo: "value", desc: true }, ctx).map(r => r.id)).toEqual([a.id, b.id]);
    expect(ordenar(linhas, { campo: "cia", desc: false }, ctx).map(r => r.id)).toEqual([b.id, a.id]);
    // "Bruno" antes de "Carla".
    expect(ordenar(linhas, { campo: "collaborator", desc: false }, ctx).map(r => r.id)).toEqual([b.id, a.id]);
  });

  it("não muda a lista recebida", () => {
    const original = [...linhas];
    ordenar(linhas, { campo: "value", desc: true }, ctx);
    expect(linhas).toEqual(original);
  });
});

describe("resumo do recorte", () => {
  it("soma registros, bagagens e centavos", () => {
    const r = resumir([pedido({ quantity: 2, valueCents: 12000 }), pedido({ quantity: 1, valueCents: 9000 })]);
    expect(r).toEqual({ records: 2, bags: 3, cents: 21000 });
  });

  it("lista vazia devolve zeros, não NaN", () => {
    expect(resumir([])).toEqual({ records: 0, bags: 0, cents: 0 });
  });
});

describe("fila por companhia", () => {
  it("conta bagagens, valor e registros de cada grupo numa passagem só", () => {
    const c = contadoresPorCia([
      pedido({ cia: "Azul", quantity: 2, valueCents: 24000 }),
      pedido({ cia: "Azul", quantity: 1, valueCents: 12000 }),
      pedido({ cia: "Latam", quantity: 1, valueCents: 15000 }),
      pedido({ cia: "Passaredo", quantity: 1, valueCents: 9500 }),
    ]);
    expect(c.Azul).toEqual({ bags: 3, cents: 36000, records: 2 });
    expect(c.TAM).toEqual({ bags: 1, cents: 15000, records: 1 });
    expect(c.Outros).toEqual({ bags: 1, cents: 9500, records: 1 });
    expect(c.Gol).toEqual({ bags: 0, cents: 0, records: 0 });
  });
});

describe("contadores dos popovers", () => {
  const todas = [
    pedido({ eventId: "e1", collaboratorId: "c1" }),
    pedido({ eventId: "e1", collaboratorId: "c2" }),
    pedido({ eventId: "e2", collaboratorId: "c1" }),
  ];

  it("contam sobre a lista SEM o próprio filtro", () => {
    const porEvento = contarPorOpcao(todas, filtros({ eventId: "e1" }), "eventId", ctx);
    expect(porEvento.get("e1")).toBe(2);
    expect(porEvento.get("e2")).toBe(1);
  });

  it("mas respeitam os OUTROS filtros ativos", () => {
    const porEvento = contarPorOpcao(todas, filtros({ collaboratorIds: ["c1"] }), "eventId", ctx);
    expect(porEvento.get("e1")).toBe(1);
    expect(porEvento.get("e2")).toBe(1);
  });

  it("O NÚMERO PROMETIDO É O ENTREGUE, com a fila de companhia ligada", () => {
    /**
     * O bug que motivou esta suíte, vindo de Passagens: contando só parte dos
     * filtros, o popover prometia 15 linhas e a lista entregava 1.
     */
    const comCias = [
      pedido({ eventId: "e1", cia: "Azul" }),
      pedido({ eventId: "e1", cia: "Gol" }),
      pedido({ eventId: "e2", cia: "Azul" }),
    ];
    const soAzul = filtros({ cia: "Azul" });
    const porEvento = contarPorOpcao(comCias, soAzul, "eventId", ctx);
    expect(porEvento.get("e1")).toBe(1);

    const aoEscolherE1 = comCias.filter(r => passaNosFiltros(r, { ...soAzul, eventId: "e1" }, ctx));
    expect(aoEscolherE1).toHaveLength(porEvento.get("e1")!);
  });
});

describe("agregado por colaborador", () => {
  it("soma sistema e histórico, mas o histórico NÃO entra no valor", () => {
    // O histórico veio de planilha e não tem valor nem evento. Somá-lo em
    // reais inventaria despesa que ninguém lançou.
    const map = agregarPorColaborador(
      [pedido({ collaboratorId: "c1", cia: "Azul", quantity: 2, valueCents: 24000 })],
      [{ collaboratorId: "c1", cia: "gol", quantity: 3 }],
    );
    const agg = map.get("c1")!;
    expect(agg.byCia).toEqual({ Azul: 2, Gol: 3, TAM: 0, Outros: 0 });
    expect(agg.histByCia).toEqual({ Azul: 0, Gol: 3, TAM: 0, Outros: 0 });
    expect(agg.totalBags).toBe(5);
    expect(agg.historyBags).toBe(3);
    expect(agg.totalCents).toBe(24000);
  });

  it("colaborador que só tem histórico ainda aparece", () => {
    const map = agregarPorColaborador([], [{ collaboratorId: "c2", cia: "Azul", quantity: 1 }]);
    expect(map.get("c2")?.totalBags).toBe(1);
    expect(map.get("c2")?.totalCents).toBe(0);
  });
});

describe("validação do formulário", () => {
  const cheio = (over: Partial<FormState> = {}): FormState => ({
    ...emptyForm, eventId: "e1", collaboratorId: "c1", loc: "ax782q",
    valueText: "1.500,00", os: "OS-1", quantityText: "2",
    requestDate: "2026-09-01", boardingDate: "2026-09-11", ...over,
  });

  it("um formulário completo não tem erro", () => {
    expect(validate(cheio())).toEqual({});
  });

  it("cobra cada obrigatório", () => {
    expect(validate(cheio({ eventId: "" })).eventId).toBeTruthy();
    expect(validate(cheio({ collaboratorId: "" })).collaboratorId).toBeTruthy();
    expect(validate(cheio({ loc: "  " })).loc).toBeTruthy();
    expect(validate(cheio({ valueText: "" })).value).toBeTruthy();
    expect(validate(cheio({ os: "" })).os).toBeTruthy();
    expect(validate(cheio({ boardingDate: "" })).boardingDate).toBeTruthy();
  });

  it("embarque não pode ser anterior à solicitação", () => {
    expect(validate(cheio({ requestDate: "2026-09-10", boardingDate: "2026-09-01" })).boardingDate)
      .toBe("O embarque não pode ser anterior à solicitação");
    // Mesmo dia vale.
    expect(validate(cheio({ requestDate: "2026-09-10", boardingDate: "2026-09-10" })).boardingDate).toBeUndefined();
  });

  it("quantidade mínima é 1 e valor não pode ser negativo", () => {
    expect(validate(cheio({ quantityText: "0" })).quantity).toBeTruthy();
    expect(validate(cheio({ quantityText: "abc" })).quantity).toBeTruthy();
    expect(validate(cheio({ valueText: "-50" })).value).toBe("Valor não pode ser negativo");
    expect(validate(cheio({ valueText: "abc" })).value).toBeTruthy();
  });

  it('"Outros" exige o texto livre de CIA e de agência', () => {
    expect(validate(cheio({ ciaSelect: "Outros", ciaOther: "" })).cia).toBeTruthy();
    expect(validate(cheio({ ciaSelect: "Outros", ciaOther: "Passaredo" })).cia).toBeUndefined();
    expect(validate(cheio({ agencySelect: "Outros", agencyOther: "" })).agency).toBeTruthy();
  });
});

describe("payload", () => {
  it("LOC vai em maiúsculas e o valor em centavos", () => {
    const p = buildPayload({
      ...emptyForm, eventId: "e1", collaboratorId: "c1", loc: " ax782q ",
      valueText: "1.500,00", os: " OS-1 ", quantityText: "2",
      requestDate: "2026-09-01", boardingDate: "2026-09-11",
    });
    expect(p.loc).toBe("AX782Q");
    expect(p.valueCents).toBe(150000);
    expect(p.quantity).toBe(2);
    expect(p.os).toBe("OS-1");
    expect(p.notes).toBeNull();
  });

  it('com "Outros", o texto livre é que vira a CIA e a agência', () => {
    const p = buildPayload({
      ...emptyForm, eventId: "e1", collaboratorId: "c1", loc: "X", valueText: "10",
      os: "1", boardingDate: "2026-09-11",
      ciaSelect: "Outros", ciaOther: " Passaredo ", agencySelect: "Outros", agencyOther: " Minha Ag ",
    });
    expect(p.cia).toBe("Passaredo");
    expect(p.agency).toBe("Minha Ag");
  });
});

describe("LOC duplicado", () => {
  const existente = pedido({ loc: "AX782Q", collaboratorId: "c1" });

  it("encontra outra solicitação com o mesmo localizador, ignorando caixa", () => {
    expect(locJaRegistrado(" ax782q ", [existente], null)?.id).toBe(existente.id);
    expect(locJaRegistrado("KP4419", [existente], null)).toBeNull();
  });

  it("não acusa a própria linha ao editar", () => {
    // Senão editar qualquer solicitação avisaria que ela duplica a si mesma.
    expect(locJaRegistrado("AX782Q", [existente], existente.id)).toBeNull();
  });

  it("LOC vazio não é duplicata de nada", () => {
    expect(locJaRegistrado("   ", [existente], null)).toBeNull();
  });
});

describe("progresso dos obrigatórios", () => {
  it("conta os seis grupos que o usuário realmente preenche", () => {
    // CIA, agência e data da solicitação já nascem preenchidas; contá-las
    // abriria a barra em "3 de 10" sem ninguém ter digitado nada.
    expect(contarObrigatorios(emptyForm)).toEqual({ preenchidos: 0, total: 6 });
    expect(contarObrigatorios({ ...emptyForm, eventId: "e1", loc: "AX1" }))
      .toEqual({ preenchidos: 2, total: 6 });
  });

  it("espaço em branco não conta como preenchido", () => {
    expect(contarObrigatorios({ ...emptyForm, loc: "   ", os: "  " }))
      .toEqual({ preenchidos: 0, total: 6 });
  });
});
