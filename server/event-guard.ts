/**
 * Evento encerrado — a trava do servidor.
 *
 * Regra do usuário (20/08): a partir do dia seguinte ao término do evento, só
 * o ADMINISTRADOR age sobre ESCALAÇÃO e sobre o que depende dela (passagem,
 * hospedagem, troca de colaborador, Validação de Escala). A regra pura —
 * inclusive o "no último dia ainda pode" e o fuso — vive em
 * shared/event-window.ts; aqui fica a trava que vale: 403 com a mensagem única.
 *
 * Mora num módulo próprio (e não dentro de routes.ts) porque
 * server/scaling-validation.ts também precisa dela e importar routes.ts de lá
 * fecharia um ciclo — routes.ts é quem registra as rotas de escala.
 *
 * Custo: `canActOnPastEvent` é testado ANTES de qualquer I/O, então para o
 * administrador (hoje o único usuário do módulo de Escala) nenhuma dessas
 * funções toca no banco. Para os demais, quem já tem o registro em mãos passa
 * ele adiante (`inclusion` / `event`) em vez de mandar reler.
 */
import { storage } from "./storage";
import { isEventPast, canActOnPastEvent, PAST_EVENT_BLOCK_MSG } from "@shared/event-window";

export { PAST_EVENT_BLOCK_MSG };

export type EventActor = { id?: string; role?: string | null } | null | undefined;

/** O mínimo que a regra precisa de um evento / de uma escalação. */
type EventLike = { endDate?: string | Date | null } | null | undefined;
type InclusionLike = { eventId?: string | null } | null | undefined;

/**
 * Cache de eventos por requisição — as rotas de LOTE decidem N vagas que quase
 * sempre são do MESMO evento; sem ele seria um `getEvent` por linha.
 */
export type EventCache = Map<string, EventLike>;
export const newEventCache = (): EventCache => new Map();

/** Regra pura sobre um evento JÁ carregado: este ator está travado? */
export function isEventBlockedForActor(event: EventLike, actor: EventActor): boolean {
  if (canActOnPastEvent(actor?.role)) return false;
  if (!event) return false; // evento inexistente: o handler já trata (404/validação)
  return isEventPast(event.endDate ?? null);
}

/** Mesma pergunta a partir do id — lê o evento só se o ator puder ser travado. */
export async function isEventIdBlockedForActor(
  eventId: string | null | undefined,
  actor: EventActor,
  cache?: EventCache,
): Promise<boolean> {
  if (canActOnPastEvent(actor?.role)) return false; // curto-circuito antes de qualquer I/O
  if (!eventId) return false; // sem evento vinculado não há janela a aplicar
  if (cache?.has(eventId)) return isEventBlockedForActor(cache.get(eventId), actor);
  const event = await storage.getEvent(eventId);
  cache?.set(eventId, event ?? null);
  return isEventBlockedForActor(event ?? null, actor);
}

/** true = pode seguir. false = já respondeu 403, o handler deve dar `return`. */
export async function assertEventEditable(
  eventId: string | null | undefined,
  actor: EventActor,
  res: any,
  cache?: EventCache,
): Promise<boolean> {
  if (!(await isEventIdBlockedForActor(eventId, actor, cache))) return true;
  res.status(403).json({ message: PAST_EVENT_BLOCK_MSG });
  return false;
}

/** Variante para quem já tem o evento em mãos (o /bulk, por exemplo). */
export function assertLoadedEventEditable(event: EventLike, actor: EventActor, res: any): boolean {
  if (!isEventBlockedForActor(event, actor)) return true;
  res.status(403).json({ message: PAST_EVENT_BLOCK_MSG });
  return false;
}

/**
 * Mesma trava quando o alvo é uma escalação (passagem, hospedagem, troca).
 * `inclusion` é opcional e evita a leitura dupla: quando a rota JÁ carregou a
 * escalação, passe o registro em vez de deixar o guard reler pelo id.
 */
export async function assertInclusionEventEditable(
  teamInclusionId: string | null | undefined,
  actor: EventActor,
  res: any,
  inclusion?: InclusionLike,
  cache?: EventCache,
): Promise<boolean> {
  if (canActOnPastEvent(actor?.role)) return true; // curto-circuito antes de qualquer I/O
  if (inclusion !== undefined) return assertEventEditable(inclusion?.eventId ?? null, actor, res, cache);
  if (!teamInclusionId) return true;
  const loaded = await storage.getTeamInclusion(teamInclusionId);
  return assertEventEditable(loaded?.eventId ?? null, actor, res, cache);
}
