/**
 * Evento "corrente" do módulo Validação de Escala — compartilhado pelas 4 telas
 * (Sugestão, Validação, Aprovação, Histórico). Fonte de verdade:
 *   1. `?eventId=` na URL (deep-link / link cruzado entre telas)
 *   2. último evento usado, em UMA chave de localStorage para o módulo inteiro
 * Ao selecionar, atualiza URL (replace) + localStorage — assim copiar o link
 * sempre carrega o contexto e trocar de tela mantém o evento.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";

export const SCALING_LAST_EVENT_KEY = "scaling:last-event";

export function scalingHref(path: string, eventId?: string | null, extra?: Record<string, string>) {
  const p = new URLSearchParams();
  if (eventId) p.set("eventId", eventId);
  for (const [k, v] of Object.entries(extra ?? {})) if (v) p.set(k, v);
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}

export function useScalingEvent(basePath: string, opts?: { extraParams?: () => Record<string, string> }) {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const urlEventId = useMemo(() => new URLSearchParams(searchString).get("eventId") ?? "", [searchString]);
  const [eventId, setEventIdState] = useState<string>(() =>
    urlEventId || (typeof window !== "undefined" ? localStorage.getItem(SCALING_LAST_EVENT_KEY) ?? "" : ""),
  );

  // URL → estado (só quando difere; evita loop)
  useEffect(() => {
    if (urlEventId && urlEventId !== eventId) setEventIdState(urlEventId);
  }, [urlEventId]); // eslint-disable-line react-hooks/exhaustive-deps

  // estado → localStorage + URL (garante que link copiado carrega o contexto)
  useEffect(() => {
    if (!eventId) return;
    localStorage.setItem(SCALING_LAST_EVENT_KEY, eventId);
    if (urlEventId !== eventId) {
      setLocation(scalingHref(basePath, eventId, opts?.extraParams?.()), { replace: true });
    }
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setEventId = useCallback((id: string) => {
    setEventIdState(id);
    if (!id) {
      localStorage.removeItem(SCALING_LAST_EVENT_KEY);
      setLocation(basePath, { replace: true });
    }
  }, [basePath, setLocation]);

  /** Descarta um evento persistido que não existe mais na lista carregada. */
  const sanitize = useCallback((existingIds: string[] | undefined) => {
    if (!existingIds || !eventId) return;
    if (!existingIds.includes(eventId)) setEventId("");
  }, [eventId, setEventId]);

  return { eventId, setEventId, sanitize } as const;
}
