import { describe, it, expect } from "vitest";
import type { TeamInclusion } from "@shared/schema";
import {
  TODAS_AS_FLAGS, contadoresDasFlags, contarComFlag, fazTesteDeBusca, fazTesteDeFlags, normalizarBusca,
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

  it('"Escalar + confirmar" soma vaga sem nome e vaga com nome ainda não confirmada', () => {
    const teste = testeDaFila("trabalho", ctx());
    expect(teste(vaga())).toBe(true);                                                  // sem nome
    expect(teste(vaga({ collaboratorId: "c1", status: "pendente" }))).toBe(true);      // com nome, sem confirmar
    expect(teste(vaga({ status: "cancelado" }))).toBe(false);
    // Confirmada e sem bloqueio nenhum: não é mais trabalho de quem escala.
    const bloqueia = ctx({ bloqueioParaConfirmar: () => "já confirmada" });
    expect(testeDaFila("trabalho", bloqueia)(vaga({ collaboratorId: "c1", status: "escalado" }))).toBe(false);
  });

  it('"Escalar" ignora a cancelada — não há o que escalar nela', () => {
    expect(testeDaFila("escalar", ctx())(vaga({ status: "cancelado" }))).toBe(false);
  });

  it('"Escalar" respeita o nome escolhido e ainda não salvo', () => {
    const comEscolhido = ctx({ temNome: (i) => !!i.collaboratorId || i.id === "v1" });
    expect(testeDaFila("escalar", comEscolhido)(vaga())).toBe(false);
  });

  it('"Em análise" é só troca de colaborador — ajuste fica na Aprovação de Escala (15/09)', () => {
    expect(testeDaFila("troca", ctx({ temTroca: () => true }))(vaga())).toBe(true);
    expect(testeDaFila("troca", ctx({ temPedido: () => true }))(vaga())).toBe(false);
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

  it("dentro da lista é OU", () => {
    const teste = fazTesteDeFlags({ "pass:precisa": true, "pass:nao-precisa": true }, ctx());
    expect(linhas.filter(teste)).toHaveLength(3);
  });

  it("os dois eixos de Passagem cruzam: precisa + não comprada = quem precisa E não tem", () => {
    // 04/09: a soma trazia a passagem já comprada de quem "precisa".
    const comprou = ctx({ temPassagemComprada: (i) => i.id === "a" });
    const teste = fazTesteDeFlags({ "pass:precisa": true, "pass:nao-comprada": true }, comprou);
    expect(linhas.filter(teste).map((l) => l.id)).toEqual(["b"]);
    // O contador do popover promete o mesmo cruzamento.
    const n = contadoresDasFlags(linhas, { "pass:precisa": true }, comprou);
    expect(n["pass:nao-comprada"]).toBe(1);
    expect(n["pass:comprada"]).toBe(1);
  });

  it("os dois eixos de Hospedagem também cruzam", () => {
    const reservou = ctx({ temHospedagemReservada: (i) => i.id === "a" });
    const teste = fazTesteDeFlags({ "hosp:precisa": true, "hosp:nao-reservada": true }, reservou);
    expect(linhas.filter(teste).map((l) => l.id)).toEqual(["c"]);
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
    // Com "precisa de passagem" marcado, "precisa de hotel" diz quantas
    // dessas (a, b) precisam de hotel: 1.
    const ativas = { "pass:precisa": true };
    expect(contarComFlag(linhas, ativas, "hosp:precisa", ctx())).toBe(1);
    // A própria opção marcada mostra o recorte que ela dá (a, b) — não o que
    // sobraria ao desmarcar (04/09: os filtros passaram a "conversar").
    expect(contarComFlag(linhas, ativas, "pass:precisa", ctx())).toBe(2);
    // A irmã da mesma lista conta sozinha: "não precisa" = c.
    expect(contarComFlag(linhas, ativas, "pass:nao-precisa", ctx())).toBe(1);
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

  it("devolve um número para cada uma das 24 opções (18 + Honorário, 23/10)", () => {
    const out = contadoresDasFlags(linhas, {}, contexto);
    expect(Object.keys(out)).toHaveLength(24);
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

describe("vaga de sugestão (em validação/aprovação) nos filtros — 23/10", () => {
  // Caso real: #5171, ativação local, em validação, não precisa de passagem.
  const sugestao = (over: Partial<TeamInclusion> = {}) =>
    vaga({ id: "s1", phase: "sugestao", status: "sugestao_pendente", needsTicket: false, ...over } as Partial<TeamInclusion>);

  it('"Precisa de passagem" tira a sugestão que não precisa e mantém a que precisa', () => {
    const teste = fazTesteDeFlags({ "pass:precisa": true }, ctx());
    expect(teste(sugestao())).toBe(false);
    expect(teste(sugestao({ needsTicket: true }))).toBe(true);
    expect(fazTesteDeFlags({ "pass:nao-precisa": true }, ctx())(sugestao())).toBe(true);
  });

  it("qualquer filtro de Situação tira a sugestão — ela ainda não está na escalação", () => {
    for (const k of ["sit:aberta", "sit:salvo", "sit:gestor", "sit:escalado", "sit:cancelada"]) {
      expect(fazTesteDeFlags({ [k]: true }, ctx())(sugestao())).toBe(false);
    }
    // Sem isso, "Vaga aberta" contaria a sugestão (não tem colaborador).
    expect(fazTesteDeFlags({ "sit:aberta": true }, ctx())(vaga())).toBe(true);
  });

  it("sugestão nunca tem passagem comprada nem hotel reservado", () => {
    const tudoComprado = ctx({ temPassagemComprada: () => true, temHospedagemReservada: () => true });
    const s = sugestao({ needsTicket: true, needsAccommodation: true });
    expect(fazTesteDeFlags({ "pass:comprada": true }, tudoComprado)(s)).toBe(false);
    expect(fazTesteDeFlags({ "pass:nao-comprada": true }, tudoComprado)(s)).toBe(true);
    expect(fazTesteDeFlags({ "hosp:reservada": true }, tudoComprado)(s)).toBe(false);
    expect(fazTesteDeFlags({ "hosp:nao-reservada": true }, tudoComprado)(s)).toBe(true);
    // "Precisa de passagem" + "Não comprada" = quem precisa e ainda não tem.
    expect(fazTesteDeFlags({ "pass:precisa": true, "pass:nao-comprada": true }, tudoComprado)(s)).toBe(true);
  });

  it("filtros combinados cruzam (E) também na sugestão", () => {
    const s = sugestao({ needsTicket: true, needsAccommodation: false, city: "" });
    expect(fazTesteDeFlags({ "pass:precisa": true, "hosp:precisa": true }, ctx())(s)).toBe(false);
    expect(fazTesteDeFlags({ "pass:precisa": true, "falta:cidade": true }, ctx())(s)).toBe(true);
    expect(fazTesteDeFlags({ "pass:precisa": true, "falta:nf": true }, ctx())(s)).toBe(false);
  });

  it("os contadores do painel contam a sugestão com a mesma regra", () => {
    const linhas = [sugestao(), sugestao({ id: "s2", needsTicket: true }), vaga({ id: "v9" })];
    const out = contadoresDasFlags(linhas, {}, ctx());
    expect(out["pass:precisa"]).toBe(1);
    expect(out["sit:aberta"]).toBe(1); // só a da escalação
    expect(out["pass:comprada"]).toBe(0);
  });

  it("a sugestão aprovada pela área (sugestao_validada) segue a mesma regra", () => {
    expect(fazTesteDeFlags({ "pass:precisa": true }, ctx())(sugestao({ status: "sugestao_validada" }))).toBe(false);
  });
});

describe("fazTesteDeBusca", () => {
  const nomes = {
    getCollaboratorName: (id?: string | null) => (id ? "José Souza" : "Não escalado"),
    getFunctionName: () => "Ativação local",
    getEventName: () => "Circuito das Estações - Verão - Curitiba",
    getCollaboratorCity: () => null,
  };

  it("busca vazia não recorta (null)", () => {
    expect(fazTesteDeBusca("  ", nomes)).toBeNull();
    expect(fazTesteDeBusca("#", nomes)).toBeNull();
  });

  it("número da vaga, com ou sem #", () => {
    const v = vaga({ inclusionNumber: 5272 } as Partial<TeamInclusion>);
    expect(fazTesteDeBusca("5272", nomes)!(v)).toBe(true);
    expect(fazTesteDeBusca("#5272", nomes)!(v)).toBe(true);
    // A #5171 não casa com "5272" por nenhum campo.
    expect(fazTesteDeBusca("5272", nomes)!(vaga({ inclusionNumber: 5171 } as Partial<TeamInclusion>))).toBe(false);
  });

  it("colaborador, função, evento e cidade, sem acento", () => {
    const v = vaga({ collaboratorId: "c1", city: "Curitiba - PR" });
    expect(fazTesteDeBusca("jose", nomes)!(v)).toBe(true);
    expect(fazTesteDeBusca("ativacao", nomes)!(v)).toBe(true);
    expect(fazTesteDeBusca("estacoes", nomes)!(v)).toBe(true);
    expect(fazTesteDeBusca("curitiba - pr", nomes)!(v)).toBe(true);
  });
});

describe("grupo Honorário (23/10 — “quem lança não sabe quais lançou”)", () => {
  // Cinco vagas de cenotécnica, uma em cada etapa; uma de outra função (sem honorário) e uma de sugestão.
  const etapa = { a: "falta_lancar", b: "rascunho", c: "aguardando", d: "devolvido", e: "aprovado" } as const;
  const meus = new Set(["b", "c"]);
  const linhas = [
    ...Object.keys(etapa).map((id) => vaga({ id, collaboratorId: "c1" })),
    vaga({ id: "producao", collaboratorId: "c2" }),
    vaga({ id: "sug", phase: "sugestao", status: "sugestao_pendente" }),
  ];
  const contexto = ctx({
    honorarioDaVaga: (i) => (i.id in etapa ? { situacao: etapa[i.id as keyof typeof etapa], meu: meus.has(i.id) } : undefined),
  });

  it("cada etapa alcança só as vagas dela; vaga sem honorário não entra em nenhuma", () => {
    const n = contadoresDasFlags(linhas, {}, contexto);
    expect([n["hon:falta"], n["hon:rascunho"], n["hon:aguardando"], n["hon:devolvido"], n["hon:aprovado"]]).toEqual([1, 1, 1, 1, 1]);
    expect(n["hon:meus"]).toBe(2);
    expect(linhas.filter(fazTesteDeFlags({ "hon:falta": true }, contexto)).map((i) => i.id)).toEqual(["a"]);
  });

  it("etapas somam entre si; 'Lançados por mim' cruza com a etapa", () => {
    const soma = linhas.filter(fazTesteDeFlags({ "hon:rascunho": true, "hon:devolvido": true }, contexto)).map((i) => i.id);
    expect(soma).toEqual(["b", "d"]);
    const cruza = linhas.filter(fazTesteDeFlags({ "hon:rascunho": true, "hon:devolvido": true, "hon:meus": true }, contexto)).map((i) => i.id);
    expect(cruza).toEqual(["b"]);
    // O número ao lado de "Lançados por mim" já respeita a etapa marcada.
    expect(contadoresDasFlags(linhas, { "hon:rascunho": true, "hon:devolvido": true }, contexto)["hon:meus"]).toBe(1);
  });

  it("o lote bate com a contagem uma-a-uma também no grupo novo", () => {
    for (const ativas of [{ "hon:aprovado": true }, { "hon:meus": true }, { "hon:falta": true, "pass:nao-precisa": true }]) {
      const emLote = contadoresDasFlags(linhas, ativas, contexto);
      for (const k of TODAS_AS_FLAGS) expect(emLote[k]).toBe(contarComFlag(linhas, ativas, k, contexto));
    }
  });

  it("sem o contexto de honorário (quem não lança) nenhuma vaga entra — e a sugestão nunca entra", () => {
    const n = contadoresDasFlags(linhas, {}, ctx());
    expect(n["hon:falta"] + n["hon:aprovado"] + n["hon:meus"]).toBe(0);
    const comTudo = ctx({ honorarioDaVaga: () => ({ situacao: "falta_lancar", meu: true }) });
    expect(linhas.filter(fazTesteDeFlags({ "hon:falta": true }, comTudo)).map((i) => i.id)).not.toContain("sug");
  });
});
