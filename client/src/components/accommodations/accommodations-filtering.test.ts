import { describe, it, expect } from "vitest";
import type { Accommodation, Collaborator, Event, TeamInclusion } from "@shared/schema";
import type { AccommodationFilters } from "./types";
import {
  VALID_STATUSES_WITHOUT_COLLABORATOR, contarPorOpcao, passaNosFiltros, precisaDeHospedagem,
} from "./accommodations-filtering";

/**
 * Estes testes existem porque o predicado foi EXTRAÍDO de
 * `use-accommodations-data.ts` para que os contadores dos popovers usassem a
 * mesma regra da lista. Extrair regra que já está em produção é onde se muda
 * comportamento sem querer.
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

const ctxBase = {
  eventById: EVENTOS,
  collaboratorById: COLABS,
  accommodationMap: new Map<string, Accommodation>(),
  pendingSwapByInclusion: new Set<string>(),
  showOnlyPendingSwaps: false,
};

const filtros = (over: Partial<AccommodationFilters> = {}): AccommodationFilters => ({
  eventId: "all", functionId: [], collaboratorId: "all", searchId: "",
  accommodationStatus: "all", inclusionStatus: "active",
  ...over,
});

let seq = 0;
const vaga = (over: Partial<TeamInclusion> = {}) => ({
  id: `v${++seq}`, inclusionNumber: seq,
  eventId: "e1", functionId: "f1", collaboratorId: "c1",
  needsAccommodation: true, status: "escalado",
  ...over,
}) as TeamInclusion;

describe("quem pertence à tela de Hospedagem", () => {
  it("só quem precisa de hospedagem", () => {
    expect(precisaDeHospedagem(vaga({ needsAccommodation: false }), EVENTOS)).toBe(false);
    expect(precisaDeHospedagem(vaga(), EVENTOS)).toBe(true);
  });

  it("evento excluído ou inexistente fica de fora", () => {
    expect(precisaDeHospedagem(vaga({ eventId: "excluido" }), EVENTOS)).toBe(false);
    expect(precisaDeHospedagem(vaga({ eventId: "fantasma" }), EVENTOS)).toBe(false);
  });

  it("vaga SEM colaborador só aparece nos status previstos", () => {
    // A lista é a de produção — copiada literalmente, não de memória.
    expect(VALID_STATUSES_WITHOUT_COLLABORATOR).toEqual([
      "reaberto", "escalado",
      "aguardando_passagem", "aguardando_hospedagem",
      "passagem", "passagem_comprada",
      "hospedagem", "hospedagem_comprada", "hospedagem_passagem_comprada",
      "aprovado", "cancelado",
    ]);
    expect(precisaDeHospedagem(vaga({ collaboratorId: null, status: "escalado" }), EVENTOS)).toBe(true);
    expect(precisaDeHospedagem(vaga({ collaboratorId: null, status: "planejado" }), EVENTOS)).toBe(false);
    // Com colaborador, o status não importa.
    expect(precisaDeHospedagem(vaga({ status: "planejado" }), EVENTOS)).toBe(true);
  });
});

describe("filtros da lista", () => {
  it("evento, função e colaborador cortam cada um pelo seu campo", () => {
    expect(passaNosFiltros(vaga({ eventId: "e2" }), filtros({ eventId: "e1" }), ctxBase)).toBe(false);
    expect(passaNosFiltros(vaga({ functionId: "f2" }), filtros({ functionId: ["f1"] }), ctxBase)).toBe(false);
    expect(passaNosFiltros(vaga({ collaboratorId: "c2" }), filtros({ collaboratorId: "c1" }), ctxBase)).toBe(false);
  });

  it("função é seleção múltipla: basta casar com uma", () => {
    expect(passaNosFiltros(vaga({ functionId: "f2" }), filtros({ functionId: ["f1", "f2"] }), ctxBase)).toBe(true);
  });

  it("busca acha por número da inclusão e por nome — com ou sem #", () => {
    const v = vaga({ inclusionNumber: 1043, collaboratorId: "c1" });
    expect(passaNosFiltros(v, filtros({ searchId: "1043" }), ctxBase)).toBe(true);
    expect(passaNosFiltros(v, filtros({ searchId: "#1043" }), ctxBase)).toBe(true);
    expect(passaNosFiltros(v, filtros({ searchId: "josé" }), ctxBase)).toBe(true);
    expect(passaNosFiltros(v, filtros({ searchId: "maria" }), ctxBase)).toBe(false);
  });

  it("registrada x pendente sai da existência do registro", () => {
    const v = vaga();
    const comHotel = { ...ctxBase, accommodationMap: new Map([[v.id, { id: "a1" } as Accommodation]]) };
    expect(passaNosFiltros(v, filtros({ accommodationStatus: "pending" }), ctxBase)).toBe(true);
    expect(passaNosFiltros(v, filtros({ accommodationStatus: "pending" }), comHotel)).toBe(false);
    expect(passaNosFiltros(v, filtros({ accommodationStatus: "processed" }), comHotel)).toBe(true);
  });

  it("cancelada some só no filtro “Inclusões ativas”", () => {
    const cancelada = vaga({ status: "cancelado" });
    expect(passaNosFiltros(cancelada, filtros({ inclusionStatus: "active" }), ctxBase)).toBe(false);
    expect(passaNosFiltros(cancelada, filtros({ inclusionStatus: "all" }), ctxBase)).toBe(true);
    expect(passaNosFiltros(cancelada, filtros({ inclusionStatus: "cancelado" }), ctxBase)).toBe(true);
    // "Canceladas" esconde as que não são.
    expect(passaNosFiltros(vaga(), filtros({ inclusionStatus: "cancelado" }), ctxBase)).toBe(false);
  });

  it("o recorte de trocas mantém só quem tem troca pendente", () => {
    const v = vaga();
    const comTroca = { ...ctxBase, pendingSwapByInclusion: new Set([v.id]), showOnlyPendingSwaps: true };
    const semTroca = { ...ctxBase, showOnlyPendingSwaps: true };
    expect(passaNosFiltros(v, filtros(), comTroca)).toBe(true);
    expect(passaNosFiltros(v, filtros(), semTroca)).toBe(false);
  });
});

describe("contadores dos popovers", () => {
  const todas = [
    vaga({ eventId: "e1", functionId: "f1", collaboratorId: "c1" }),
    vaga({ eventId: "e1", functionId: "f2", collaboratorId: "c2" }),
    vaga({ eventId: "e2", functionId: "f1", collaboratorId: "c1" }),
  ];

  it("contam sobre a lista SEM o próprio filtro", () => {
    // Com "e1" escolhido, o contador precisa dizer quanto CADA evento tem —
    // senão o número não ajuda a escolher outro.
    const porEvento = contarPorOpcao(todas, filtros({ eventId: "e1" }), "eventId", ctxBase);
    expect(porEvento.get("e1")).toBe(2);
    expect(porEvento.get("e2")).toBe(1);
  });

  it("mas respeitam os OUTROS filtros ativos", () => {
    const porEvento = contarPorOpcao(todas, filtros({ collaboratorId: "c1" }), "eventId", ctxBase);
    expect(porEvento.get("e1")).toBe(1); // a de c2 não conta
    expect(porEvento.get("e2")).toBe(1);
  });

  it("função conta ignorando a própria seleção múltipla", () => {
    const porFuncao = contarPorOpcao(todas, filtros({ functionId: ["f1"] }), "functionId", ctxBase);
    expect(porFuncao.get("f1")).toBe(2);
    expect(porFuncao.get("f2")).toBe(1);
  });

  it("O NÚMERO PROMETIDO É O ENTREGUE, com o filtro de situação ligado", () => {
    /**
     * O bug que motivou esta suíte, vindo de Passagens: contando só parte dos
     * filtros, o popover prometia 15 linhas e a lista entregava 1.
     */
    const comHotel = { ...ctxBase, accommodationMap: new Map([[todas[0].id, { id: "a1" } as Accommodation]]) };
    const pendentes = filtros({ accommodationStatus: "pending" });

    const porEvento = contarPorOpcao(todas, pendentes, "eventId", comHotel);
    expect(porEvento.get("e1")).toBe(1); // uma das duas já está registrada
    expect(porEvento.get("e2")).toBe(1);

    // E o número bate com o que a lista devolveria ao escolher aquele evento.
    const aoEscolherE1 = todas.filter((i) => passaNosFiltros(i, { ...pendentes, eventId: "e1" }, comHotel));
    expect(aoEscolherE1).toHaveLength(porEvento.get("e1")!);
  });
});
