import { describe, it, expect } from "vitest";
import type { Collaborator, Event, TeamInclusion } from "@shared/schema";
import type { TicketFilters } from "./types";
import {
  VALID_STATUSES_WITHOUT_COLLABORATOR, contarPorOpcao, passaNosFiltrosBase, passaNosFiltrosDePassagem,
} from "./tickets-filtering";

/**
 * Estes testes existem por um motivo específico: o predicado foi EXTRAÍDO de
 * `use-tickets-data.ts` para que os contadores dos popovers usassem a mesma
 * regra da lista. Extrair regra que já está em produção é onde se muda
 * comportamento sem querer — e mudar comportamento era justamente o que não se
 * podia fazer aqui.
 */

const EVENTOS = new Map<string, Event>([
  ["e1", { id: "e1", name: "Evento 1", status: "planejado" } as Event],
  ["e2", { id: "e2", name: "Evento 2", status: "planejado" } as Event],
  ["excluido", { id: "excluido", name: "Sumiu", status: "excluído" } as Event],
]);
const COLABS = new Map<string, Collaborator>([
  ["c1", { id: "c1", fullName: "José da Silva" } as Collaborator],
  ["c2", { id: "c2", fullName: "Maria Souza" } as Collaborator],
]);
const ctx = { eventById: EVENTOS, collaboratorById: COLABS };

const filtros = (over: Partial<TicketFilters> = {}): TicketFilters => ({
  eventId: "all", functionId: [], collaboratorId: "all", searchId: "",
  ticketStatus: "all", transportType: "all", inclusionStatus: "active",
  ...over,
} as TicketFilters);

let seq = 0;
const vaga = (over: Partial<TeamInclusion> = {}) => ({
  id: `v${++seq}`, inclusionNumber: seq,
  eventId: "e1", functionId: "f1", collaboratorId: "c1",
  needsTicket: true, status: "escalado",
  ...over,
}) as TeamInclusion;

describe("quem entra na lista de Passagens", () => {
  it("só vaga que precisa de passagem", () => {
    expect(passaNosFiltrosBase(vaga({ needsTicket: false }), filtros(), ctx)).toBe(false);
    expect(passaNosFiltrosBase(vaga(), filtros(), ctx)).toBe(true);
  });

  it("evento excluído ou inexistente fica de fora", () => {
    // Antes a linha ficava com "⚠ Não encontrado" pedindo compra para um
    // evento que não existe mais.
    expect(passaNosFiltrosBase(vaga({ eventId: "excluido" }), filtros(), ctx)).toBe(false);
    expect(passaNosFiltrosBase(vaga({ eventId: "fantasma" }), filtros(), ctx)).toBe(false);
  });

  it("cancelada some só no filtro “Inclusões ativas”", () => {
    const cancelada = vaga({ status: "cancelado" });
    expect(passaNosFiltrosBase(cancelada, filtros({ inclusionStatus: "active" }), ctx)).toBe(false);
    expect(passaNosFiltrosBase(cancelada, filtros({ inclusionStatus: "all" }), ctx)).toBe(true);
    expect(passaNosFiltrosBase(cancelada, filtros({ inclusionStatus: "cancelado" }), ctx)).toBe(true);
    // "Canceladas" esconde as que não são.
    expect(passaNosFiltrosBase(vaga(), filtros({ inclusionStatus: "cancelado" }), ctx)).toBe(false);
  });

  it("vaga SEM colaborador só aparece nos status previstos", () => {
    // A lista é a de produção — foi copiada literalmente, não de memória.
    expect(VALID_STATUSES_WITHOUT_COLLABORATOR).toEqual([
      "reaberto", "escalado",
      "aguardando_passagem", "aguardando_hospedagem",
      "passagem", "hospedagem", "hospedagem_comprada",
      "aprovado", "passagem_comprada", "hospedagem_passagem_comprada",
    ]);
    expect(passaNosFiltrosBase(vaga({ collaboratorId: null, status: "escalado" }), filtros(), ctx)).toBe(true);
    expect(passaNosFiltrosBase(vaga({ collaboratorId: null, status: "planejado" }), filtros(), ctx)).toBe(false);
    // Com colaborador, o status não importa.
    expect(passaNosFiltrosBase(vaga({ status: "planejado" }), filtros(), ctx)).toBe(true);
  });
});

describe("filtros de evento, função e colaborador", () => {
  it("cada um corta pelo seu campo", () => {
    expect(passaNosFiltrosBase(vaga({ eventId: "e2" }), filtros({ eventId: "e1" }), ctx)).toBe(false);
    expect(passaNosFiltrosBase(vaga({ functionId: "f2" }), filtros({ functionId: ["f1"] }), ctx)).toBe(false);
    expect(passaNosFiltrosBase(vaga({ collaboratorId: "c2" }), filtros({ collaboratorId: "c1" }), ctx)).toBe(false);
  });

  it("função é seleção múltipla: basta casar com uma", () => {
    expect(passaNosFiltrosBase(vaga({ functionId: "f2" }), filtros({ functionId: ["f1", "f2"] }), ctx)).toBe(true);
  });
});

describe("busca", () => {
  it("acha por número da inclusão, por id e por nome — com ou sem #", () => {
    const v = vaga({ inclusionNumber: 1043, id: "abc-123", collaboratorId: "c1" });
    expect(passaNosFiltrosBase(v, filtros({ searchId: "1043" }), ctx)).toBe(true);
    expect(passaNosFiltrosBase(v, filtros({ searchId: "#1043" }), ctx)).toBe(true);
    expect(passaNosFiltrosBase(v, filtros({ searchId: "abc-123" }), ctx)).toBe(true);
    expect(passaNosFiltrosBase(v, filtros({ searchId: "josé" }), ctx)).toBe(true);
    expect(passaNosFiltrosBase(v, filtros({ searchId: "maria" }), ctx)).toBe(false);
  });
});

describe("filtros de passagem (segundo estágio)", () => {
  const semPassagem = { ticketByInclusion: new Map(), pendingSwapByInclusion: new Set<string>(), showOnlyPendingSwaps: false };

  it("pendente é quem NÃO tem passagem; comprada é quem tem", () => {
    const v = vaga();
    const comTicket = { ...semPassagem, ticketByInclusion: new Map([[v.id, { transportType: "aereo", actualArrivalTime: "10:00" }]]) };
    expect(passaNosFiltrosDePassagem(v, filtros({ ticketStatus: "pending" }), semPassagem)).toBe(true);
    expect(passaNosFiltrosDePassagem(v, filtros({ ticketStatus: "pending" }), comTicket)).toBe(false);
    expect(passaNosFiltrosDePassagem(v, filtros({ ticketStatus: "processed" }), comTicket)).toBe(true);
  });

  it('"sem chegada" é comprada, não-van e sem horário de chegada', () => {
    const v = vaga();
    const semChegada = { ...semPassagem, ticketByInclusion: new Map([[v.id, { transportType: "aereo", actualArrivalTime: null }]]) };
    const van = { ...semPassagem, ticketByInclusion: new Map([[v.id, { transportType: "van", actualArrivalTime: null }]]) };
    expect(passaNosFiltrosDePassagem(v, filtros({ ticketStatus: "no_arrival" }), semChegada)).toBe(true);
    // Van não tem horário obrigatório — não entra na conta de qualidade.
    expect(passaNosFiltrosDePassagem(v, filtros({ ticketStatus: "no_arrival" }), van)).toBe(false);
  });

  it("o recorte de trocas mantém só quem tem troca pendente", () => {
    const v = vaga();
    const comTroca = { ...semPassagem, pendingSwapByInclusion: new Set([v.id]), showOnlyPendingSwaps: true };
    const semTroca = { ...semPassagem, showOnlyPendingSwaps: true };
    expect(passaNosFiltrosDePassagem(v, filtros(), comTroca)).toBe(true);
    expect(passaNosFiltrosDePassagem(v, filtros(), semTroca)).toBe(false);
  });
});

describe("contadores dos popovers", () => {
  const todas = [
    vaga({ eventId: "e1", functionId: "f1", collaboratorId: "c1" }),
    vaga({ eventId: "e1", functionId: "f2", collaboratorId: "c2" }),
    vaga({ eventId: "e2", functionId: "f1", collaboratorId: "c1" }),
    vaga({ eventId: "excluido", functionId: "f1", collaboratorId: "c1" }),
  ];
  /** Pipeline "vazio": nenhum dedupe e nenhum filtro de passagem. */
  const semSegundoEstagio = (linhas: typeof todas) => linhas;

  it("contam sobre a lista SEM o próprio filtro", () => {
    // Com "e1" escolhido, o contador de eventos precisa mostrar quanto CADA
    // evento tem — senão o número não ajuda a escolher outro.
    const porEvento = contarPorOpcao(todas, filtros({ eventId: "e1" }), "eventId", ctx, semSegundoEstagio);
    expect(porEvento.get("e1")).toBe(2);
    expect(porEvento.get("e2")).toBe(1);
    // O evento excluído nunca entra, nem no contador.
    expect(porEvento.get("excluido")).toBeUndefined();
  });

  it("mas respeitam os OUTROS filtros ativos", () => {
    const porEvento = contarPorOpcao(todas, filtros({ eventId: "all", collaboratorId: "c1" }), "eventId", ctx, semSegundoEstagio);
    expect(porEvento.get("e1")).toBe(1); // a de c2 não conta
    expect(porEvento.get("e2")).toBe(1);
  });

  it("função conta ignorando a própria seleção múltipla", () => {
    const porFuncao = contarPorOpcao(todas, filtros({ functionId: ["f1"] }), "functionId", ctx, semSegundoEstagio);
    expect(porFuncao.get("f1")).toBe(2);
    expect(porFuncao.get("f2")).toBe(1);
  });

  it("colaborador idem", () => {
    const porColab = contarPorOpcao(todas, filtros({ collaboratorId: "c1" }), "collaboratorId", ctx, semSegundoEstagio);
    expect(porColab.get("c1")).toBe(2);
    expect(porColab.get("c2")).toBe(1);
  });

  it("O NÚMERO PROMETIDO É O ENTREGUE, mesmo com filtro de situação ligado", () => {
    /**
     * O bug que motivou esta assinatura: contando só os filtros base, o
     * popover prometia 15 linhas para um evento e a lista entregava 1, porque
     * "Pendentes" estava ligado. O contador precisa rodar o pipeline inteiro.
     */
    const comTicket = new Map([[todas[0].id, { transportType: "aereo", actualArrivalTime: "10:00" }]]);
    const completar = (linhas: typeof todas, f: ReturnType<typeof filtros>) =>
      linhas.filter(i => passaNosFiltrosDePassagem(i, f, {
        ticketByInclusion: comTicket, pendingSwapByInclusion: new Set<string>(), showOnlyPendingSwaps: false,
      }));

    const pendentes = filtros({ ticketStatus: "pending" });
    const porEvento = contarPorOpcao(todas, pendentes, "eventId", ctx, completar);
    // e1 tem duas vagas, mas uma já foi comprada: sobra uma pendente.
    expect(porEvento.get("e1")).toBe(1);
    expect(porEvento.get("e2")).toBe(1);

    // E o número bate com o que a lista devolveria ao escolher aquele evento.
    const aoEscolherE1 = completar(
      todas.filter(i => passaNosFiltrosBase(i, { ...pendentes, eventId: "e1" }, ctx)),
      pendentes,
    );
    expect(aoEscolherE1).toHaveLength(porEvento.get("e1")!);
  });
});
