/**
 * Evento "corrente" do módulo Validação de Escala — compartilhado pelas 4 telas
 * (Sugestão, Validação, Aprovação, Histórico).
 *
 * Desde 23/09 é um invólucro de `useEventoEmFoco` (lib/evento-em-foco.tsx): a
 * memória do evento passou a ser UMA para o sistema inteiro (Escala, Financeiro,
 * Espelho), por usuário. Aqui só ficam fixados o parâmetro `?eventId=` e o modo
 * "substituir" (a URL zera os demais parâmetros ao trocar de evento), que é o
 * comportamento que as telas da Escala sempre tiveram.
 */
import { CHAVE_LEGADA_ESCALA } from "@/lib/evento-em-foco";
import { useEventoEmFoco } from "@/lib/use-evento-em-foco";

/** Chave antiga (única para todos os usuários). Mantida só para leitura na migração. */
export const SCALING_LAST_EVENT_KEY = CHAVE_LEGADA_ESCALA;

export function scalingHref(path: string, eventId?: string | null, extra?: Record<string, string>) {
  const p = new URLSearchParams();
  if (eventId) p.set("eventId", eventId);
  for (const [k, v] of Object.entries(extra ?? {})) if (v) p.set(k, v);
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}

export function useScalingEvent(
  basePath: string,
  opts?: {
    extraParams?: () => Record<string, string>;
    /**
     * Tela que ABRE em "Todos os eventos" (regra do dono, 26/08: "aparecer
     * inicialmente de todos e se eu quiser ver de algum eu seleciono o
     * evento"). Nessas telas o evento vem SÓ da URL — sem `?eventId=`, sem
     * filtro. O último evento usado continua sendo gravado (os links entre as
     * telas do módulo carregam o contexto pela própria URL), mas ele não
     * escolhe mais sozinho um filtro que o usuário não pediu.
     */
    allEventsDefault?: boolean;
  },
) {
  const { eventId, setEventId, sanitize } = useEventoEmFoco({
    parametro: "eventId",
    caminho: basePath,
    semPadrao: opts?.allEventsDefault ?? false,
    parametrosExtras: opts?.extraParams,
    modo: "substituir",
  });
  return { eventId, setEventId, sanitize } as const;
}
