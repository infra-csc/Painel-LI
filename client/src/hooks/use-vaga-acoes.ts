/**
 * Consultas e ações de VAGA (team-inclusions) que várias telas repetem —
 * contrato do servidor de 24/09.
 *
 * - `GET /api/team-inclusions` exige um recorte (`eventId`, `phase` ou
 *   `status`) para `function_area`; admin/compras/produção/RH ainda podem
 *   pedir a fila inteira (com aviso no log do servidor). `listaDeVagasQuery`
 *   monta a chave e o fetch certos: com evento → `?eventId=`; sem evento e
 *   papel transversal → global (mesma chave compartilhada das outras telas);
 *   sem evento e papel de área → `?phase=all` (o recorte que o servidor
 *   aceita; quem consome tira as sugestões com `isSuggestionInclusion`).
 * - Cancelar é `POST /api/team-inclusions/:id/cancel` (o PATCH não aceita
 *   mais status/fase): `useCancelarVaga`.
 * - Rotas de escalação podem devolver `avisosDeAgenda` (duas viagens no mesmo
 *   dia) — é aviso, não erro: `avisarAgenda`.
 * - `POST/PATCH /api/tickets|accommodations` devolvem `inclusionStatus`:
 *   `aplicarStatusDaVagaNoCache` atualiza as listas em cache na hora.
 */
import { useMutation, useQueryClient, type QueryClient, type QueryFunction, type QueryKey } from "@tanstack/react-query";
import { apiRequest, fetchJson } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { hasRole } from "@/lib/role-utils";
import { useToast } from "@/hooks/use-toast";
import type { TeamInclusion } from "@shared/schema";

export const TEAM_INCLUSIONS_KEY = "/api/team-inclusions";

/** Papéis que o servidor deixa listar TODAS as vagas sem recorte (24/09). */
export function podeListarTodasAsVagas(user: { role?: string | null } | null | undefined): boolean {
  return hasRole(user, "admin", "purchasing", "production", "financial");
}

export interface ParamsDaListaDeVagas {
  eventId?: string;
  phase?: "all" | "sugestao";
  status?: string;
  includeDeleted?: boolean;
}

const temEvento = (eventId: string | null | undefined): eventId is string =>
  !!eventId && eventId !== "all";

/**
 * Recorte a pedir ao servidor para esta tela/usuário. Um evento selecionado
 * vira `?eventId=`; sem evento, quem pode lê a fila inteira e quem não pode
 * cai em `?phase=all` (único recorte que não muda o resultado da tela).
 */
export function recorteDaListaDeVagas(opts: {
  eventId?: string | null;
  user: { role?: string | null } | null | undefined;
  includeDeleted?: boolean;
}): ParamsDaListaDeVagas {
  const params: ParamsDaListaDeVagas = {};
  if (temEvento(opts.eventId)) params.eventId = opts.eventId;
  else if (!podeListarTodasAsVagas(opts.user)) params.phase = "all";
  if (opts.includeDeleted) params.includeDeleted = true;
  return params;
}

export function urlDaListaDeVagas(params: ParamsDaListaDeVagas = {}): string {
  const qs = new URLSearchParams();
  if (params.eventId) qs.set("eventId", params.eventId);
  if (params.phase) qs.set("phase", params.phase);
  if (params.status) qs.set("status", params.status);
  if (params.includeDeleted) qs.set("includeDeleted", "true");
  const s = qs.toString();
  return s ? `${TEAM_INCLUSIONS_KEY}?${s}` : TEAM_INCLUSIONS_KEY;
}

/**
 * Chave de cache da lista. Sem parâmetros é a chave global de sempre
 * (`["/api/team-inclusions"]`), compartilhada entre as telas; com parâmetros
 * é `["/api/team-inclusions", { eventId, ... }]` — o prefixo continua o mesmo,
 * então `invalidateQueries({ queryKey: ["/api/team-inclusions"] })` e os
 * `setQueryDefaults` (staleTime 5 min) seguem valendo.
 */
export function chaveDaListaDeVagas(params: ParamsDaListaDeVagas = {}): QueryKey {
  const limpo: ParamsDaListaDeVagas = {};
  if (params.eventId) limpo.eventId = params.eventId;
  if (params.phase) limpo.phase = params.phase;
  if (params.status) limpo.status = params.status;
  if (params.includeDeleted) limpo.includeDeleted = true;
  return Object.keys(limpo).length > 0 ? [TEAM_INCLUSIONS_KEY, limpo] : [TEAM_INCLUSIONS_KEY];
}

/** `queryKey` + `queryFn` prontos para `useQuery<TeamInclusion[]>`. */
export function listaDeVagasQuery(params: ParamsDaListaDeVagas = {}): {
  queryKey: QueryKey;
  queryFn: QueryFunction<TeamInclusion[]>;
} {
  const url = urlDaListaDeVagas(params);
  return {
    queryKey: chaveDaListaDeVagas(params),
    queryFn: ({ signal }) => fetchJson<TeamInclusion[]>(url, signal),
  };
}

/** A chave é uma LISTA de vagas (global ou com recorte) — não timeline/logs de uma vaga. */
function ehChaveDeLista(key: QueryKey): boolean {
  if (key[0] !== TEAM_INCLUSIONS_KEY) return false;
  if (key.length === 1) return true;
  return key.length === 2 && typeof key[1] === "object" && key[1] !== null;
}

/**
 * Atualiza o status de uma vaga em TODAS as listas em cache (global e por
 * evento) — usado com o `inclusionStatus` que passagem/hospedagem devolvem.
 * Quem chama ainda invalida em seguida; isto só evita o piscar do status velho.
 */
export function aplicarStatusDaVagaNoCache(queryClient: QueryClient, inclusionId: string, status: string | null | undefined): void {
  if (!inclusionId || !status) return;
  queryClient.setQueriesData<TeamInclusion[]>(
    { queryKey: [TEAM_INCLUSIONS_KEY], predicate: (q) => ehChaveDeLista(q.queryKey) },
    (old) => {
      if (!Array.isArray(old)) return old;
      let mudou = false;
      const next = old.map((i) => {
        if (i.id !== inclusionId || i.status === status) return i;
        mudou = true;
        return { ...i, status };
      });
      return mudou ? next : old;
    },
  );
}

// ── Avisos de agenda ────────────────────────────────────────────────────────

/** Formato do servidor (rotas de vaga, 24/09) — ou já uma frase pronta. */
export type AvisoDeAgenda =
  | string
  | { vagaId?: string; eventoId?: string | null; evento?: string | null; inicio?: string | null; fim?: string | null };

const dataCurta = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}` : String(iso);
};

/** Uma frase por aviso; `null` quando não há avisos. */
export function textoDosAvisosDeAgenda(avisos: unknown): string | null {
  if (!Array.isArray(avisos) || avisos.length === 0) return null;
  const frases = (avisos as AvisoDeAgenda[]).map((a) => {
    if (typeof a === "string") return a.trim();
    const evento = a.evento || "outro evento";
    const ini = dataCurta(a.inicio);
    const fim = dataCurta(a.fim);
    const periodo = ini && fim && ini !== fim ? `${ini} a ${fim}` : (ini || fim);
    return periodo ? `${evento} (${periodo})` : evento;
  }).filter(Boolean);
  if (frases.length === 0) return null;
  return `Duas viagens no mesmo dia: ${frases.join("; ")}.`;
}

/** Toast de AVISO (não erro) para `avisosDeAgenda` de qualquer rota de vaga. */
export function avisarAgenda(
  toast: (t: { title: string; description?: string }) => unknown,
  avisos: unknown,
): void {
  const texto = textoDosAvisosDeAgenda(avisos);
  if (!texto) return;
  toast({ title: "Atenção à agenda", description: `${texto} A escalação foi gravada; confira as datas.` });
}

/** Tira `avisosDeAgenda` do objeto da vaga antes de guardá-lo em estado/cache. */
export function semAvisos<T extends { avisosDeAgenda?: unknown }>(vaga: T): Omit<T, "avisosDeAgenda"> {
  const { avisosDeAgenda: _ignorado, ...resto } = vaga;
  return resto;
}

// ── Cancelar vaga ───────────────────────────────────────────────────────────

export interface RespostaDoCancelamento {
  message: string;
  inclusion: TeamInclusion;
  /** Há passagem/hospedagem registradas — Compras precisa revisar. */
  logisticaParaRevisar: boolean;
}

export const AVISO_LOGISTICA_PARA_REVISAR = "Há passagem/hospedagem nesta vaga — Compras precisa revisar.";

/**
 * `POST /api/team-inclusions/:id/cancel`. 409 quando já cancelada (ou a
 * transição não é permitida), 403 com passagem emitida para quem não é
 * administrador — a mensagem do servidor vai para o toast.
 */
export function useCancelarVaga(opts: { onSuccess?: (resposta: RespostaDoCancelamento) => void } = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const r = await apiRequest("POST", `/api/team-inclusions/${id}/cancel`, reason ? { reason } : {});
      return (await r.json()) as RespostaDoCancelamento;
    },
    onSuccess: (resposta) => {
      queryClient.invalidateQueries({ queryKey: [TEAM_INCLUSIONS_KEY] });
      toast({ title: "Vaga cancelada", description: `Escalação #${resposta.inclusion?.inclusionNumber ?? "—"} cancelada.` });
      if (resposta.logisticaParaRevisar) {
        toast({ title: "Compras precisa revisar", description: AVISO_LOGISTICA_PARA_REVISAR });
      }
      opts.onSuccess?.(resposta);
    },
    onError: (err: unknown) => {
      toast({ title: "Não foi possível cancelar a vaga", description: apiErrorMessage(err, "Tente de novo em instantes."), variant: "destructive" });
    },
  });
}
