/**
 * Presença no evento — consultas e escritas (27/10, Fase 1 do Módulo de
 * Honorários). Contrato: server/routes/presenca.ts.
 *
 * Toda escrita devolve a prestação já montada: o cache do evento é
 * atualizado na hora com ela (sem esperar o recarregamento) e, em seguida,
 * invalidado — "na arena agora" e as contagens se recompõem do servidor.
 * O check-out final também invalida o Realizado, a Conferência DP e o Painel
 * de honorários (a prestação foi para o DP).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, fetchJson, throwIfResNotOk, ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/queryClient";
import { CHAVE_CONTROLE_RH } from "@/components/rh/prestacao-utils";
import type { TipoDeOcorrencia } from "@shared/presenca";
import type { CodigoDeAcessoGerado, PrestacaoDaPresenca, RespostaDaPresenca } from "./tipos";

export const CHAVE_PRESENCA = "/api/presenca/eventos";

/** Presença do evento. `ativo` = pode perguntar (evento escolhido e não legado). */
export function usePresencaDoEvento(eventId: string | null | undefined, ativo = true, aoVivo = true) {
  return useQuery<RespostaDaPresenca>({
    queryKey: [CHAVE_PRESENCA, eventId],
    queryFn: ({ signal }) => fetchJson<RespostaDaPresenca>(`${CHAVE_PRESENCA}/${encodeURIComponent(eventId!)}`, signal),
    enabled: !!eventId && ativo,
    staleTime: 20_000,
    // "Na arena agora" é ao vivo: a cada minuto, só com a aba à vista.
    refetchInterval: aoVivo ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
}

/** Troca a prestação devolvida pelo servidor dentro do cache do evento. */
function aplicarNoCache(qc: ReturnType<typeof useQueryClient>, eventId: string, nova: PrestacaoDaPresenca) {
  qc.setQueryData<RespostaDaPresenca>([CHAVE_PRESENCA, eventId], (antes) => antes
    ? { ...antes, prestacoes: antes.prestacoes.map((p) => (p.actualId === nova.actualId ? nova : p)) }
    : antes);
}

/** Envio multipart (selfie + localização) com o mesmo tratamento de erro do app. */
async function enviarMarcacao(url: string, foto: File | null, local: { lat: number; lng: number; precisao: number | null } | null): Promise<PrestacaoDaPresenca> {
  const corpo = new FormData();
  if (foto) corpo.append("foto", foto, foto.name || "selfie.jpg");
  if (local) {
    corpo.append("lat", String(local.lat));
    corpo.append("lng", String(local.lng));
    if (local.precisao != null) corpo.append("precisao", String(Math.round(local.precisao)));
  }
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: corpo, credentials: "include" });
  } catch {
    throw new ApiError(0, null, NETWORK_ERROR_MESSAGE);
  }
  await throwIfResNotOk(res);
  return res.json();
}

export interface CorpoDaOcorrencia {
  tipo: TipoDeOcorrencia;
  dia?: string | null;
  horas?: number | null;
  substitutoCollaboratorId?: string | null;
  observacao?: string | null;
}

export interface CorpoDaConfirmacao {
  dias: string[];
  cnpj: string;
  razaoSocial?: string | null;
  contestacao?: string | null;
}

export interface CorpoDoCheckoutFinal {
  valorFinal: number;
  cnpj?: string | null;
  razaoSocial?: string | null;
  justificativa?: string | null;
}

/** As escritas da tela, todas presas ao evento aberto. */
export function useAcoesDaPresenca(eventId: string) {
  const qc = useQueryClient();
  const depois = (nova: PrestacaoDaPresenca) => {
    aplicarNoCache(qc, eventId, nova);
    qc.invalidateQueries({ queryKey: [CHAVE_PRESENCA, eventId] });
  };
  const json = async (r: Response) => (await r.json()) as PrestacaoDaPresenca;

  const marcar = useMutation({
    mutationFn: (v: { actualId: string; dia: string; tipo: "entrada" | "saida"; foto: File | null; local: { lat: number; lng: number; precisao: number | null } | null }) =>
      enviarMarcacao(`/api/presenca/${encodeURIComponent(v.actualId)}/${v.dia}/${v.tipo}`, v.foto, v.local),
    onSuccess: depois,
  });

  const corrigir = useMutation({
    mutationFn: async (v: { actualId: string; dia: string; entrada?: string | null; saida?: string | null; motivo: string }) => {
      const { actualId, dia, ...corpo } = v;
      return json(await apiRequest("PATCH", `/api/presenca/${encodeURIComponent(actualId)}/${dia}`, corpo));
    },
    onSuccess: depois,
  });

  const lancarOcorrencia = useMutation({
    mutationFn: async (v: { actualId: string; corpo: CorpoDaOcorrencia }) =>
      json(await apiRequest("POST", `/api/presenca/${encodeURIComponent(v.actualId)}/ocorrencias`, v.corpo)),
    onSuccess: depois,
  });

  const removerOcorrencia = useMutation({
    mutationFn: async (id: string) => json(await apiRequest("DELETE", `/api/presenca/ocorrencias/${encodeURIComponent(id)}`)),
    onSuccess: depois,
  });

  const confirmar = useMutation({
    mutationFn: async (v: { actualId: string; corpo: CorpoDaConfirmacao }) =>
      json(await apiRequest("POST", `/api/presenca/${encodeURIComponent(v.actualId)}/confirmar`, v.corpo)),
    onSuccess: depois,
  });

  const checkoutFinal = useMutation({
    mutationFn: async (v: { actualId: string; corpo: CorpoDoCheckoutFinal }) =>
      json(await apiRequest("POST", `/api/presenca/${encodeURIComponent(v.actualId)}/checkout-final`, v.corpo)),
    onSuccess: (nova) => {
      depois(nova);
      // A prestação foi para o DP: o Realizado, a Conferência e o Painel mudam.
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
    },
  });

  return { marcar, corrigir, lancarOcorrencia, removerOcorrencia, confirmar, checkoutFinal };
}

/** Gera o código de primeiro acesso ao portal (admin, DP, produção). */
export function useGerarCodigoDeAcesso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (collaboratorId: string) =>
      (await (await apiRequest("POST", `/api/colaboradores/${encodeURIComponent(collaboratorId)}/codigo-de-acesso`)).json()) as CodigoDeAcessoGerado,
    // A linha "acesso ao portal" da presença passa a mostrar a validade nova.
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE_PRESENCA] }),
  });
}
