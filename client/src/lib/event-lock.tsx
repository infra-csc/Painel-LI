/**
 * Evento encerrado — modo somente leitura no client.
 *
 * Regra do usuário (20/08): a partir do dia seguinte ao término do evento, só
 * o ADMINISTRADOR mexe em escalação (e no que depende dela: passagem,
 * hospedagem, troca de colaborador). O servidor é a trava (403 com
 * PAST_EVENT_BLOCK_MSG); aqui só escondemos/desabilitamos o que a API vai
 * recusar — o botão nunca deve prometer o que o servidor nega.
 *
 * Sem estado novo: deriva de `events.endDate` + papel do usuário, usando a
 * mesma regra pura de shared/event-window.ts.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import type { Event } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import {
  isEventPast,
  canActOnPastEvent,
  PAST_EVENT_BLOCK_MSG,
  PAST_EVENT_BANNER_MSG,
} from "@shared/event-window";

export { PAST_EVENT_BLOCK_MSG, PAST_EVENT_BANNER_MSG };

/**
 * Evento que não está na lista: `/api/events` não devolve os excluídos (só com
 * ?includeDeleted=true, que estas telas não usam). Antes o botão aparecia
 * habilitado e o servidor recusava na hora de salvar; agora tratamos como
 * travado, com motivo próprio — não é a regra de evento encerrado, é "essa
 * escalação aponta para um evento que sumiu da lista". Vale para TODOS os
 * papéis, inclusive o administrador: nem ele edita evento excluído.
 */
export const UNAVAILABLE_EVENT_MSG = "Evento indisponível — recarregue a página";

/**
 * Consulta os eventos (cache compartilhado com o resto do app) e devolve os
 * testes de bloqueio. `isLockedEvent`/`isLockedInclusion` já consideram o papel:
 * para o administrador devolvem false (salvo evento fora da lista).
 */
export function useEventLock() {
  const { user } = useAuth();
  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });

  const podeAgirEmEventoPassado = canActOnPastEvent(user?.role);
  // Enquanto a lista não chegou não travamos nada: durante o carregamento
  // inicial TODO evento estaria "fora da lista" e a tela abriria congelada.
  const eventsLoaded = !!events;

  const endDateById = useMemo(() => {
    const m = new Map<string, string | null>();
    (events || []).forEach(e => { if (!m.has(e.id)) m.set(e.id, (e.endDate as unknown as string) ?? null); });
    return m;
  }, [events]);

  /** O evento existe na lista carregada? (false enquanto ela não chegou → não trava) */
  const isUnavailableEvent = (eventId: string | null | undefined): boolean =>
    !!eventId && eventsLoaded && !endDateById.has(eventId);

  /** O evento já terminou? (independe do papel — para rótulos informativos) */
  const isPastEvent = (eventId: string | null | undefined): boolean =>
    !!eventId && isEventPast(endDateById.get(eventId));

  /**
   * Evento encerrado E este usuário não pode mexer — é o que o BANNER de
   * somente leitura anuncia. Separado de `isLockedEvent` porque evento fora da
   * lista trava do mesmo jeito, mas por outro motivo (e o banner diria a frase
   * errada).
   */
  const isReadOnlyPastEvent = (eventId: string | null | undefined): boolean =>
    !podeAgirEmEventoPassado && isPastEvent(eventId);

  /** Este usuário está impedido de agir neste evento? */
  const isLockedEvent = (eventId: string | null | undefined): boolean =>
    isUnavailableEvent(eventId) || isReadOnlyPastEvent(eventId);

  /** Mesmo teste a partir de qualquer registro que aponte para um evento. */
  const isLockedInclusion = (inclusion: { eventId?: string | null } | null | undefined): boolean =>
    isLockedEvent(inclusion?.eventId);

  /** Motivo pronto para tooltip/mensagem (null = não bloqueado). */
  const lockReason = (eventId: string | null | undefined): string | null => {
    if (isUnavailableEvent(eventId)) return UNAVAILABLE_EVENT_MSG;
    return isReadOnlyPastEvent(eventId) ? PAST_EVENT_BLOCK_MSG : null;
  };

  /** Texto do banner de somente leitura (null = não mostrar banner). */
  const bannerMessage = (eventId: string | null | undefined): string | null => {
    if (isUnavailableEvent(eventId)) return UNAVAILABLE_EVENT_MSG;
    return isReadOnlyPastEvent(eventId) ? PAST_EVENT_BANNER_MSG : null;
  };

  return {
    isPastEvent,
    isUnavailableEvent,
    isReadOnlyPastEvent,
    isLockedEvent,
    isLockedInclusion,
    lockReason,
    bannerMessage,
    podeAgirEmEventoPassado,
    eventsLoaded,
  };
}

export type EventLock = ReturnType<typeof useEventLock>;

/**
 * Banner discreto no topo da tela em modo somente leitura.
 * `message` cobre o caso do evento fora da lista, que trava pelo mesmo caminho
 * mas por outro motivo — sem ele o banner anunciaria "evento encerrado" para
 * um evento que na verdade sumiu.
 */
export function PastEventBanner(
  { show, message, className = "" }: { show: boolean; message?: string | null; className?: string },
) {
  if (!show) return null;
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800 ${className}`}
      role="status"
      data-testid="banner-evento-encerrado"
    >
      <Lock className="w-3.5 h-3.5 shrink-0" />
      <span>{message || PAST_EVENT_BANNER_MSG}</span>
    </div>
  );
}
