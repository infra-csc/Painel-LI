import { describe, it, expect } from "vitest";
import type { TeamInclusion } from "@shared/schema";
import {
  TODAS_AS_FLAGS, contadoresDasFlags, contarComFlag, fazTesteDeFlags, normalizarBusca,
  testeDaFila, type QueueContext,
} from "./scaling-queue";

/** Uma vaga com só o que a fila olha — o resto do TeamInclusion não importa. */
const vaga = (over: Partial<TeamInclusion> = {}) => ({
  id: "v1", status: "pendente", collaboratorId: null,
  needsTicket: false, needsAccommodation: false, emitsNf: true,
  cenoFreelaTipo: null, city: "São Paulo - SP",
  ...over,
}) as TeamInclusion;

/** Contexto padrão: nada comprado, nada em análise, tudo confirmável. */
const ctx = (over: Partial<QueueContext> = {}): QueueContext => ({
  temNome: (i) => !!i.collaboratorId,
  temTroca: () => false,
  temPedido: () => false,
  bloqueioParaConfirmar: () => null,
  temPassagemComprada: () => false,
  temHospedagemReservada: () => false,
  ehCenoEmpreita: () => false,
  ...over,
});

describe("blocos da fila de trabalho", () => {
  it('"Escalar" é sobre NOME, não sobre o status gravado', () => {
    // Uma linha marcada como escalada sem colaborador continua sendo trabalho
    // a fazer — é o mesmo princípio de getScalingStatusKey.
    const teste = testeDaFila("escalar", ctx());
    expect(teste(vaga({ status: "escalado", collaboratorId: null }))).toBe(true);
    expect(teste(vaga({ collaboratorId: "c1" }))).toBe(false);
  });

  it('"Escalar" ignora a cancelada — não há o que escalar nela', () => {
    expect(testeDaFila("escalar", ctx())(vaga({ status: "cancelado" }))).toBe(false);
  });

  it('"Escalar" respeita o nome escolhido e ainda não salvo', () => {
    const comEscolhido = ctx({ temNome: (i) => !!i.collaboratorId || i.id === "v1" });
    expect(testeDaFila("escalar", comEscolhido)(vaga())).toBe(false);
  });

  it('"Em análise" junta troca e pedido de ajuste', () => {
    expect(testeDaFila("troca", ctx({ temTroca: () => true }))(vaga())).toBe(true);
    expect(testeDaFila("troca", ctx({ temPedido: () => true }))(vaga())).toBe(true);
    expect(testeDaFila("troca", ctx())(vaga())).toBe(false);
  });

  it('"Prontas" conta só o que VOCÊ pode confirmar', () => {
    expect(testeDaFila("prontas", ctx())(vaga())).toBe(true);
    expect(testeDaFila("prontas", ctx({ bloqueioParaConfirmar: () => "Outra função" }))(vaga())).toBe(false);
  });
});

describe("filtros por grupo", () => {
  const linhas = [
    vaga({ id: "a", needsTicket: true, needsAccommodation: true }),
    vaga({ id: "b", needsTicket: true, needsAccommodation: false }),
    vaga({ id: "c", needsTicket: false, needsAccommodation: true }),
  ];

  it("sem nada marcado, tudo passa", () => {
    expect(linhas.filter(fazTesteDeFlags({}, ctx()))).toHaveLength(3);
  });

  it("dentro do grupo é OU", () => {
    const teste = fazTesteDeFlags({ "pass:precisa": true, "pass:nao-precisa": true }, ctx());
    expect(linhas.filter(teste)).toHaveLength(3);
  });

  it("entre grupos é E — o que permite “com passagem e sem hospedagem”", () => {
    const teste = fazTesteDeFlags({ "pass:precisa": true, "hosp:nao-precisa": true }, ctx());
    expect(linhas.filter(teste).map((l) => l.id)).toEqual(["b"]);
  });

  it("comprada e não comprada olham o registro, não a necessidade", () => {
    const comprou = ctx({ temPassagemComprada: (i) => i.id === "a" });
    expect(linhas.filter(fazTesteDeFlags({ "pass:comprada": true }, comprou)).map((l) => l.id)).toEqual(["a"]);
    expect(linhas.filter(fazTesteDeFlags({ "pass:nao-comprada": true }, comprou)).map((l) => l.id)).toEqual(["b", "c"]);
  });

  it("o tipo de freela só é cobrado de quem é cenotécnica de empreita", () => {
    const ceno = ctx({ ehCenoEmpreita: (i) => i.id === "a" });
    const teste = fazTesteDeFlags({ "falta:freela": true }, ceno);
    expect(linhas.filter(teste).map((l) => l.id)).toEqual(["a"]);
    // Com o tipo definido, sai do filtro.
    expect([vaga({ id: "a", cenoFreelaTipo: "viagem" })].filter(teste)).toHaveLength(0);
  });

  it("sem cidade de saída pega vazio e só espaço", () => {
    const teste = fazTesteDeFlags({ "falta:cidade": true }, ctx());
    expect([vaga({ city: "" }), vaga({ city: "   " }), vaga({ city: "Recife" })].filter(teste)).toHaveLength(2);
  });
});

describe("contadores hipotéticos", () => {
  const linhas = [
    vaga({ id: "a", needsTicket: true, needsAccommodation: true }),
    vaga({ id: "b", needsTicket: true, needsAccommodation: false }),
    vaga({ id: "c", needsTicket: false, needsAccommodation: false }),
  ];

  it("o número responde “quantas sobram se eu marcar isto, mantendo o resto”", () => {
    // Com "precisa de passagem" já marcado, marcar "precisa de hotel" deixa 1.
    const ativas = { "pass:precisa": true };
    expect(contarComFlag(linhas, ativas, "hosp:precisa", ctx())).toBe(1);
    // E o contador da própria opção marcada mostra o que sobraria ao DESMARCAR.
    expect(contarComFlag(linhas, ativas, "pass:precisa", ctx())).toBe(3);
  });
});

describe("contadores em lote", () => {
  // A versão rápida existe porque a ingênua (uma varredura por opção) travava
  // a tela com 3.700 linhas. Ela só vale se der EXATAMENTE o mesmo número.
  const linhas = [
    vaga({ id: "a", needsTicket: true, needsAccommodation: true, status: "aguardando_producao", collaboratorId: "c1" }),
    vaga({ id: "b", needsTicket: true, needsAccommodation: false }),
    vaga({ id: "c", needsTicket: false, needsAccommodation: true, collaboratorId: "c2", status: "escalado" }),
    vaga({ id: "d", status: "cancelado" }),
    vaga({ id: "e", emitsNf: false, city: "" }),
  ];
  const contexto = ctx({
    temPassagemComprada: (i) => i.id === "a",
    temHospedagemReservada: (i) => i.id === "c",
    temTroca: (i) => i.id === "b",
    ehCenoEmpreita: (i) => i.id === "e",
  });

  const casos: Record<string, boolean>[] = [
    {},
    { "pass:precisa": true },
    { "pass:precisa": true, "hosp:nao-precisa": true },
    { "sit:aberta": true, "sit:cancelada": true },
    { "falta:nf": true, "falta:cidade": true, "pass:nao-precisa": true },
    { "anal:troca": true },
  ];

  it("bate com a contagem uma-a-uma, em toda combinação", () => {
    for (const ativas of casos) {
      const emLote = contadoresDasFlags(linhas, ativas, contexto);
      for (const k of TODAS_AS_FLAGS) {
        expect(`${JSON.stringify(ativas)}/${k}=${emLote[k]}`)
          .toBe(`${JSON.stringify(ativas)}/${k}=${contarComFlag(linhas, ativas, k, contexto)}`);
      }
    }
  });

  it("devolve um número para cada uma das 18 opções", () => {
    const out = contadoresDasFlags(linhas, {}, contexto);
    expect(Object.keys(out)).toHaveLength(18);
    expect(TODAS_AS_FLAGS.every((k) => typeof out[k] === "number")).toBe(true);
  });

  it("lista vazia não quebra", () => {
    const out = contadoresDasFlags([], {}, contexto);
    expect(out["pass:precisa"]).toBe(0);
  });
});

describe("busca", () => {
  it("ignora acento e caixa", () => {
    expect(normalizarBusca("  JOSÉ da Silva ")).toBe("jose da silva");
    expect(normalizarBusca("Cenotécnica")).toBe("cenotecnica");
  });
});
