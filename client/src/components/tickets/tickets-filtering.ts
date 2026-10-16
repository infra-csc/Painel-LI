/**
 * O predicado dos filtros base de Passagens (02/09) — extraído de
 * `use-tickets-data.ts`, com o MESMO comportamento.
 *
 * Foi extraído para que os contadores dos popovers de filtro possam responder
 * "quantas linhas sobram se eu escolher ISTO mantendo o resto" chamando
 * exatamente a regra que a lista usa. Uma cópia da regra só para contar
 * divergiria da real na primeira mudança, e o contador passaria a mentir sem
 * ninguém perceber.
 *
 * Nada aqui decide nada de novo: é o mesmo teste, no mesmo lugar do pipeline.
 */
import type { Collaborator, Event, TeamInclusion } from "@shared/schema";
import { fazTesteDePeriodo, temRecorteDePeriodo } from "@/components/scaling/scaling-period";
import type { TicketFilters } from "./types";
import type { CoberturaTerrestre } from "@shared/transporte-terrestre";

/** Status que mostram a inclusão mesmo sem colaborador (compra antes do nome). */
export const VALID_STATUSES_WITHOUT_COLLABORATOR = [
  "reaberto", "escalado",
  "aguardando_passagem", "aguardando_hospedagem",
  "passagem", "hospedagem", "hospedagem_comprada",
  "aprovado", "passagem_comprada", "hospedagem_passagem_comprada",
];

/**
 * Status de escalação JÁ CONFIRMADA (dono, 15/09: "quem não tem a escalação
 * confirmada não deve aparecer, apenas se confirmar — não apenas salvar"). Fica
 * de fora o que foi só salvo (planejado, pendente, reaberto, escalacao) e a
 * cenotécnica ainda com o gestor (aguardando_producao).
 */
export const STATUS_ESCALACAO_CONFIRMADA = [
  "escalado", "aguardando_passagem", "aguardando_hospedagem",
  "passagem", "passagem_comprada", "hospedagem", "hospedagem_comprada", "hospedagem_passagem_comprada",
  "aprovado", "concluido",
];

export interface ContextoDosFiltros {
  eventById: Map<string, Event>;
  collaboratorById: Map<string, Collaborator>;
  /** Base do filtro de período; sem ele, agora. */
  hoje?: Date;
  /** A vaga já tem passagem registrada? Então continua na lista (15/09). */
  temPassagem?: (inclusionId: string) => boolean;
}

/**
 * A vaga passa nos filtros de evento, função, colaborador, busca e situação
 * da inclusão. Os filtros de passagem (situação da compra e transporte) são
 * aplicados depois, em outra etapa — como sempre foram.
 */
export function passaNosFiltrosBase(
  inclusion: TeamInclusion,
  filters: TicketFilters,
  ctx: ContextoDosFiltros,
): boolean {
  if (!inclusion.needsTicket) return false;
  // Evento excluído (ou que sumiu) não aparece na lista — mesma regra da
  // Escalação. Antes a linha ficava aqui com "⚠ Não encontrado" no lugar do
  // nome, pedindo compra de passagem para um evento que não existe mais.
  const eventoDaVaga = ctx.eventById.get(inclusion.eventId);
  if (!eventoDaVaga || eventoDaVaga.status === "excluído" || eventoDaVaga.status === "excluido") return false;
  // Canceladas só somem no filtro "Inclusões ativas".
  if (inclusion.status === "cancelado" && filters.inclusionStatus === "active") return false;
  // Só escalação CONFIRMADA vai para Compras (dono, 15/09): salvar com
  // colaborador não basta. Passagem já registrada continua (não some o que já
  // foi comprado); cancelada fica para o filtro de situação decidir.
  const temPassagem = !!ctx.temPassagem?.(inclusion.id);
  const confirmada = STATUS_ESCALACAO_CONFIRMADA.includes(inclusion.status);
  const canceladaComNome = inclusion.status === "cancelado" && !!inclusion.collaboratorId;
  if (!confirmada && !canceladaComNome && !temPassagem) return false;

  if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
  if (filters.functionId.length > 0 && !filters.functionId.includes(inclusion.functionId)) return false;
  if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
  // "Data do evento" (02/10, como na Escalação): mede pelo dia da prova, não
  // pela escala — o evento vem do mapa que a tela já carregou.
  if (temRecorteDePeriodo(filters.periodo)
    && !fazTesteDePeriodo(filters.periodo, ctx.hoje ?? new Date(), (id) => (id ? ctx.eventById.get(id) : undefined))(inclusion)) return false;
  if (filters.searchId) {
    const q = filters.searchId.replace(/#/g, "").trim().toLowerCase();
    const colName = (inclusion.collaboratorId ? ctx.collaboratorById.get(inclusion.collaboratorId)?.fullName ?? "" : "").toLowerCase();
    if (!(String(inclusion.inclusionNumber ?? "").toLowerCase().includes(q) ||
      inclusion.id.toLowerCase().includes(q) ||
      colName.includes(q))) return false;
  }
  if (filters.inclusionStatus === "cancelado" && inclusion.status !== "cancelado") return false;
  return true;
}

/**
 * O segundo estágio: situação da compra, transporte e o recorte de trocas.
 *
 * Estava embutido no `useMemo` da lista. Saiu junto com o primeiro estágio
 * porque o contador do popover precisa do pipeline INTEIRO: contar só os
 * filtros base prometia 15 linhas onde a lista entregava 1, com "Pendentes"
 * ligado — um contador que mente é pior que contador nenhum.
 */
export function passaNosFiltrosDePassagem(
  inclusion: TeamInclusion,
  filters: TicketFilters,
  ctx: {
    ticketByInclusion: Map<string, { transportType?: string | null; actualArrivalTime?: string | null }>;
    /** Set ou Map — só o `has` importa aqui. */
    pendingSwapByInclusion: { has: (id: string) => boolean };
    showOnlyPendingSwaps: boolean;
    /** Transporte terrestre da vaga (16/10): carro/van/ônibus por perna. */
    coberturaDe?: (inclusionId: string) => CoberturaTerrestre | undefined;
  },
): boolean {
  if (ctx.showOnlyPendingSwaps && !ctx.pendingSwapByInclusion.has(inclusion.id)) return false;
  const t = ctx.ticketByInclusion.get(inclusion.id);
  const cob = ctx.coberturaDe?.(inclusion.id);
  const temTerrestre = !!cob && Object.keys(cob.porPerna).length > 0;
  if (filters.ticketStatus !== "all") {
    const hasTicket = !!t;
    // Quem vai de carro/van/ônibus em todas as pernas não tem passagem a comprar.
    if (filters.ticketStatus === "pending" && (hasTicket || !!cob?.cobreTudo)) return false;
    if (filters.ticketStatus === "processed" && !hasTicket) return false;
    if (filters.ticketStatus === "terrestre" && !temTerrestre) return false;
    // Qualidade: compradas (aéreo/rodoviário) sem horário de chegada.
    if (filters.ticketStatus === "no_arrival" && !(t && t.transportType !== "van" && !t.actualArrivalTime)) return false;
  }
  if (filters.transportType !== "all") {
    // A passagem e o terrestre contam: "Van" acha a passagem de van antiga e a
    // van registrada como terrestre; ônibus terrestre entra em "Rodoviário".
    const tipos = new Set<string>();
    if (t) tipos.add(t.transportType || "aereo");
    for (const r of Object.values(cob?.porPerna ?? {})) if (r) tipos.add(r.modo === "onibus" ? "rodoviario" : r.modo);
    if (!tipos.has(filters.transportType)) return false;
  }
  return true;
}

/**
 * Quantas linhas cada opção deixaria, mantendo o resto do recorte.
 *
 * A base é sempre a lista SEM o filtro em questão — senão "Todos os eventos"
 * mostraria só o evento já escolhido, e o número não ajudaria a escolher outro.
 */
export function contarPorOpcao(
  todas: TeamInclusion[],
  filters: TicketFilters,
  campo: "eventId" | "functionId" | "collaboratorId",
  ctx: ContextoDosFiltros,
  /**
   * Roda o resto do pipeline (dedupe e filtros de passagem) sobre a lista já
   * recortada. É o que faz o número prometido ser o número entregue.
   */
  completar: (linhas: TeamInclusion[], f: TicketFilters) => TeamInclusion[],
): Map<string, number> {
  // Zerar o próprio filtro: senão "Todos os eventos" mostraria só o evento já
  // escolhido, e o número não ajudaria a escolher outro.
  const semEsteFiltro: TicketFilters = campo === "functionId"
    ? { ...filters, functionId: [] }
    : { ...filters, [campo]: "all" };

  const base = todas.filter((i) => passaNosFiltrosBase(i, semEsteFiltro, ctx));
  const out = new Map<string, number>();
  for (const i of completar(base, semEsteFiltro)) {
    const chave = campo === "eventId" ? i.eventId : campo === "functionId" ? i.functionId : (i.collaboratorId ?? "");
    if (!chave) continue;
    out.set(chave, (out.get(chave) ?? 0) + 1);
  }
  return out;
}
