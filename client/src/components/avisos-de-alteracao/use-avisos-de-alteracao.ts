/**
 * Avisos de alteração (07/10) — os dados, para Passagens e (na etapa seguinte)
 * Hospedagem.
 *
 * O servidor cria um aviso quando um ajuste aprovado mexe em vaga que já tem
 * passagem ou hospedagem registrada (ver shared/aviso-de-alteracao.ts). Aqui
 * só lemos a fila e marcamos "Já atuei" — nenhuma regra nova.
 *
 * `tipo` escolhe o recorte: "passagem" lê os que `afetaPassagem`, "hospedagem"
 * os que `afetaHospedagem`. A consulta é UMA só (mesma chave nas duas telas e
 * no modal); o recorte é feito aqui.
 *
 * Papéis: logística (admin/Compras/Produção) — os mesmos da rota. Para os
 * outros a consulta nem sai e tudo fica vazio; um 403 inesperado também some
 * em silêncio (não é erro para quem não deveria ver).
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MudancaDoAviso } from "@shared/aviso-de-alteracao";
import { ROLE_GROUPS, hasRoleIn } from "@shared/roles";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, fetchJson, isApiError } from "@/lib/queryClient";
import { toTitleCase } from "@/lib/format";

export type TipoDeAviso = "passagem" | "hospedagem";

/** O aviso como GET /api/avisos-de-alteracao devolve (datas em ISO). */
export interface AvisoDeAlteracao {
  id: string;
  teamInclusionId: string;
  eventId: string;
  changeRequestId: string | null;
  mudancas: MudancaDoAviso[];
  afetaPassagem: boolean;
  afetaHospedagem: boolean;
  motivo: string | null;
  pedidoPorNome: string | null;
  comentarioDoAprovador: string | null;
  aprovadoPorNome: string;
  aprovadoEm: string;
  resolvidoEm: string | null;
  resolvidoPorNome: string | null;
  resolucao: string | null;
  inclusionNumber: number | null;
  eventName: string | null;
  eventStartDate: string | null;
  functionName: string | null;
  collaboratorName: string | null;
}

/** Prefixo de TODAS as chaves da tela — invalidar ele refaz pendentes e resolvidos. */
export const CHAVE_AVISOS = "/api/avisos-de-alteracao";
/** Chave da casca (sino e menu): própria, para o 403 sumir sem virar erro de tela. */
export const CHAVE_AVISOS_CASCA = ["shell", "avisos-de-alteracao"] as const;

export const podeVerAvisos = (role: string | null | undefined) => hasRoleIn(role, ROLE_GROUPS.logistica);

export const doTipo = (a: Pick<AvisoDeAlteracao, "afetaPassagem" | "afetaHospedagem">, tipo: TipoDeAviso) =>
  tipo === "passagem" ? a.afetaPassagem : a.afetaHospedagem;

/** GET que trata 403 como "não é para você": lista vazia, sem erro. */
export async function buscarAvisos(situacao: "pendente" | "resolvido", signal?: AbortSignal): Promise<AvisoDeAlteracao[]> {
  try {
    const data = await fetchJson<unknown>(`${CHAVE_AVISOS}?situacao=${situacao}`, signal);
    return Array.isArray(data) ? (data as AvisoDeAlteracao[]) : [];
  } catch (e) {
    if (isApiError(e) && e.status === 403) return [];
    throw e;
  }
}

/** Pendentes do tipo, com o índice por vaga (linha da tabela e modal). */
export function useAvisosPendentes(tipo: TipoDeAviso) {
  const { user } = useAuth();
  const ativo = podeVerAvisos(user?.role);
  const q = useQuery<AvisoDeAlteracao[]>({
    queryKey: [CHAVE_AVISOS, "pendente"],
    queryFn: ({ signal }) => buscarAvisos("pendente", signal),
    enabled: ativo,
    staleTime: 30_000,
    // Quem fica com a tela aberta vê a aprovação chegar sem recarregar.
    refetchInterval: 60_000,
  });
  const avisos = useMemo(
    () => (ativo ? (q.data ?? []).filter((a) => doTipo(a, tipo)) : []),
    [ativo, q.data, tipo],
  );
  const porVaga = useMemo(() => {
    const m = new Map<string, AvisoDeAlteracao[]>();
    for (const a of avisos) m.set(a.teamInclusionId, [...(m.get(a.teamInclusionId) ?? []), a]);
    return m;
  }, [avisos]);
  return {
    ativo,
    avisos,
    porVaga,
    carregando: ativo && q.isLoading,
    erro: ativo && q.isError,
    tentarDeNovo: () => void q.refetch(),
  };
}

/** Resolvidos recentes (os 100 últimos do servidor), só quando alguém pede para ver. */
export function useAvisosResolvidos(tipo: TipoDeAviso, aberto: boolean) {
  const { user } = useAuth();
  const ativo = podeVerAvisos(user?.role) && aberto;
  const q = useQuery<AvisoDeAlteracao[]>({
    queryKey: [CHAVE_AVISOS, "resolvido"],
    queryFn: ({ signal }) => buscarAvisos("resolvido", signal),
    enabled: ativo,
    staleTime: 30_000,
  });
  const avisos = useMemo(() => (q.data ?? []).filter((a) => doTipo(a, tipo)), [q.data, tipo]);
  return { avisos, carregando: ativo && q.isLoading, erro: q.isError, tentarDeNovo: () => void q.refetch() };
}

/**
 * "Já atuei". 409 = outra pessoa resolveu antes: a mensagem do servidor diz
 * quem, e a lista é refeita do mesmo jeito (o aviso já não é pendente).
 */
export function useResolverAviso() {
  const queryClient = useQueryClient();
  const atualizar = () => {
    void queryClient.invalidateQueries({ queryKey: [CHAVE_AVISOS] });
    void queryClient.invalidateQueries({ queryKey: [...CHAVE_AVISOS_CASCA] });
  };
  return useMutation({
    mutationFn: async ({ id, resolucao }: { id: string; resolucao?: string }) =>
      (await apiRequest("POST", `${CHAVE_AVISOS}/${encodeURIComponent(id)}/resolver`, resolucao?.trim() ? { resolucao: resolucao.trim() } : {})).json() as Promise<AvisoDeAlteracao>,
    onSuccess: atualizar,
    onError: (e) => { if (isApiError(e) && e.status === 409) atualizar(); },
  });
}

// ── Texto ────────────────────────────────────────────────────────────────

/** "06/11/2026" de "2026-11-06" (sem passar por Date: evita o dia anterior em BRT). */
export function dataDaProva(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "em 14 dias", "amanhã", "hoje", "há 3 dias" — distância da prova a hoje. */
export function distanciaDaProva(ymd: string | null | undefined, hoje = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  if (!m) return "";
  const prova = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.round((prova - base) / 86_400_000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias === -1) return "ontem";
  return dias > 0 ? `em ${dias} dias` : `há ${-dias} dias`;
}

/** "07/10 às 14:32" — quando foi aprovado/resolvido. */
export function quando(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "há 2 h", "ontem", "há 4 dias" — o mesmo vocabulário do sino. */
export function haQuanto(iso: string | null | undefined, agora = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const min = Math.floor((agora - t) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

/** "BRUNA TEIXEIRA DA SILVA" → "Bruna Teixeira da Silva" (a regra única do app). */
export function nomeProprio(nome: string | null | undefined): string {
  return toTitleCase(nome);
}
