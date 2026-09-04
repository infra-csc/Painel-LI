/**
 * A regra que decide QUEM aparece na lista de Hospedagem, isolada do React.
 *
 * Ela vivia dentro de `use-accommodations-data.ts` e só era executada uma vez,
 * para montar a tabela. Os contadores dos popovers precisam da MESMA regra —
 * "quantas linhas sobram se eu marcar este evento, mantendo o resto do
 * recorte" — e um contador com cópia própria da regra começa a mentir na
 * primeira mudança. Em Passagens isso aconteceu: o popover prometia 15 linhas
 * e a lista entregava 1.
 *
 * O conteúdo abaixo foi COPIADO do hook, não reescrito de memória. Os testes
 * ao lado travam o comportamento exatamente como ele é hoje.
 */
import type { Accommodation, Collaborator, Event, TeamInclusion } from "@shared/schema";
import { fazTesteDePeriodo, temRecorteDePeriodo } from "@/components/scaling/scaling-period";
import type { AccommodationFilters } from "./types";

/** Sem colaborador escalado, a inclusão só aparece nestes status. */
export const VALID_STATUSES_WITHOUT_COLLABORATOR = [
  "reaberto", "escalado",
  "aguardando_passagem", "aguardando_hospedagem",
  "passagem", "passagem_comprada",
  "hospedagem", "hospedagem_comprada", "hospedagem_passagem_comprada",
  "aprovado", "cancelado",
];

export interface ContextoDaLista {
  eventById: Map<string, Event>;
  collaboratorById: Map<string, Collaborator>;
  accommodationMap: Map<string, Accommodation>;
  pendingSwapByInclusion: Set<string>;
  showOnlyPendingSwaps: boolean;
  /** Base do filtro de período; sem ele, agora. */
  hoje?: Date;
}

/**
 * A inclusão pertence a esta tela?
 *
 * Canceladas ficam: quem decide é o filtro "Status Inclusão" (senão a opção
 * "Canceladas" seria sempre vazia).
 */
export function precisaDeHospedagem(inclusion: TeamInclusion, eventById: Map<string, Event>): boolean {
  if (inclusion.needsAccommodation !== true) return false;
  // Evento excluído leva junto a escalação dele (regra do dono, 26/08).
  const evento = eventById.get(inclusion.eventId);
  if (!evento || evento.status === "excluído" || evento.status === "excluido") return false;
  // Com colaborador escalado, aparece independente do status (workflow flexível).
  if (inclusion.collaboratorId) return true;
  return VALID_STATUSES_WITHOUT_COLLABORATOR.includes(inclusion.status);
}

/** A inclusão passa pelo recorte atual? Assume que já passou por `precisaDeHospedagem`. */
export function passaNosFiltros(
  inclusion: TeamInclusion,
  filters: AccommodationFilters,
  ctx: ContextoDaLista,
): boolean {
  if (ctx.showOnlyPendingSwaps && !ctx.pendingSwapByInclusion.has(inclusion.id)) return false;
  if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
  if (filters.functionId.length > 0 && !filters.functionId.includes(inclusion.functionId)) return false;
  if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
  if (temRecorteDePeriodo(filters.periodo) && !fazTesteDePeriodo(filters.periodo, ctx.hoje ?? new Date())(inclusion)) return false;

  const q = filters.searchId.replace(/#/g, "").trim().toLowerCase();
  if (q) {
    const colName = (inclusion.collaboratorId ? ctx.collaboratorById.get(inclusion.collaboratorId)?.fullName ?? "" : "").toLowerCase();
    if (!String(inclusion.inclusionNumber ?? "").toLowerCase().includes(q) && !colName.includes(q)) return false;
  }

  const accommodationStatus = ctx.accommodationMap.get(inclusion.id) ? "processed" : "pending";
  if (filters.accommodationStatus !== "all" && filters.accommodationStatus !== accommodationStatus) return false;

  // "Canceladas" só canceladas; "Todas" mostra tudo; "ativas" esconde as canceladas.
  if (filters.inclusionStatus === "cancelado") return inclusion.status === "cancelado";
  if (filters.inclusionStatus === "active") return inclusion.status !== "cancelado";
  return true;
}

/**
 * Quantas linhas cada opção de um filtro deixaria, mantendo o resto do recorte.
 *
 * O contador roda a lista inteira IGNORANDO o próprio campo — senão, com um
 * evento já escolhido, todos os outros mostrariam zero e o número não ajudaria
 * a escolher outro.
 *
 * `refinar` é o resto do funil que não cabe em `AccommodationFilters`: hoje, o
 * bloco da fila de trabalho. Sem ele o contador mente — medido em 02/09 com
 * "Urgente" ligado, a lista tinha 114 linhas e os popovers prometiam 1.824.
 * É o mesmo defeito que Passagens já tinha tido, chegando por outra porta.
 */
export function contarPorOpcao(
  todas: TeamInclusion[],
  filters: AccommodationFilters,
  campo: "eventId" | "functionId" | "collaboratorId",
  ctx: ContextoDaLista,
  refinar: (linhas: TeamInclusion[]) => TeamInclusion[] = (l) => l,
): Map<string, number> {
  const neutro: AccommodationFilters = {
    ...filters,
    ...(campo === "eventId" ? { eventId: "all" } : {}),
    ...(campo === "functionId" ? { functionId: [] } : {}),
    ...(campo === "collaboratorId" ? { collaboratorId: "all" } : {}),
  };

  const contagem = new Map<string, number>();
  for (const inclusion of refinar(todas.filter((i) => passaNosFiltros(i, neutro, ctx)))) {
    const chave = campo === "functionId" ? inclusion.functionId : inclusion[campo];
    if (!chave) continue;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  return contagem;
}
