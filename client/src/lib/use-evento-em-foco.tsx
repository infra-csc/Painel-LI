/**
 * Hook React do "evento em foco" (23/09) — ver `evento-em-foco.ts` para o porquê
 * e para as funções puras (leitura/escrita da query e do localStorage).
 *
 * Uso típico no Financeiro:
 *   const { eventId, setEventId } = useEventoEmFoco();
 *   <EventSearchSelect value={eventId} onValueChange={setEventId} events={events} />
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  buscaComEvento, guardarEventoEmFoco, hrefComEvento, lerEventoDaBusca, lerEventoGuardado,
  type ParametroDeEvento,
} from "@/lib/evento-em-foco";

export interface OpcoesDoEventoEmFoco {
  /** Nome do parâmetro na URL desta tela. Padrão: `event`. */
  parametro?: ParametroDeEvento;
  /** Caminho base para reescrever a URL. Padrão: o caminho atual. */
  caminho?: string;
  /**
   * Tela que ABRE em "Todos os eventos" (regra do dono, 26/08, para filas de
   * validação/aprovação): o evento vem SÓ da URL; o último usado continua sendo
   * gravado, mas não escolhe sozinho um filtro que o usuário não pediu.
   */
  semPadrao?: boolean;
  /** Parâmetros extras a escrever junto com o evento (ex.: aba). */
  parametrosExtras?: () => Record<string, string>;
  /** Como reescrever a query: mantendo os outros parâmetros (padrão) ou zerando. */
  modo?: "preservar" | "substituir";
}

export function useEventoEmFoco(opcoes?: OpcoesDoEventoEmFoco) {
  const parametro = opcoes?.parametro ?? "event";
  const modo = opcoes?.modo ?? "preservar";
  const semPadrao = opcoes?.semPadrao ?? false;
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const busca = useSearch();
  const [caminhoAtual, navegar] = useLocation();
  const caminho = opcoes?.caminho ?? caminhoAtual;
  const eventoDaUrl = useMemo(() => lerEventoDaBusca(busca), [busca]);

  const [eventId, setEventIdEstado] = useState<string>(() =>
    eventoDaUrl || (semPadrao ? "" : lerEventoGuardado(userId)),
  );

  // URL → estado (só quando difere; evita laço)
  useEffect(() => {
    if (eventoDaUrl && eventoDaUrl !== eventId) setEventIdEstado(eventoDaUrl);
  }, [eventoDaUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // estado → localStorage + URL (link copiado carrega o contexto)
  useEffect(() => {
    if (!eventId) return;
    guardarEventoEmFoco(userId, eventId);
    if (eventoDaUrl !== eventId) {
      const qs = buscaComEvento(busca, eventId, parametro, modo, opcoes?.parametrosExtras?.());
      navegar(qs ? `${caminho}?${qs}` : caminho, { replace: true });
    }
  }, [eventId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setEventId = useCallback((id: string) => {
    setEventIdEstado(id);
    if (!id) {
      guardarEventoEmFoco(userId, "");
      const qs = buscaComEvento(busca, "", parametro, modo);
      navegar(qs ? `${caminho}?${qs}` : caminho, { replace: true });
    }
  }, [busca, caminho, modo, navegar, parametro, userId]);

  /** Descarta um evento persistido que não existe mais na lista carregada. */
  const sanitize = useCallback((idsExistentes: string[] | undefined) => {
    if (!idsExistentes || !eventId) return;
    if (!idsExistentes.includes(eventId)) setEventId("");
  }, [eventId, setEventId]);

  /** `href` de outra tela já com este evento (`hrefCom("/budget-actual")`). */
  const hrefCom = useCallback(
    (destino: string, parametroDoDestino: ParametroDeEvento = "event", extras?: Record<string, string>) =>
      hrefComEvento(destino, eventId, parametroDoDestino, extras),
    [eventId],
  );

  return { eventId, setEventId, sanitize, hrefCom } as const;
}

export default useEventoEmFoco;
