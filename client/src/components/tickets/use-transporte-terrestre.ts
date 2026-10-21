// Transporte terrestre da vaga (16/10) — leitura e gravação.
//
// A chave começa com "/api/tickets": tudo que já invalida as passagens
// (registrar, aprovar troca, emitir) recarrega o terrestre junto — e o
// terrestre gravado invalida as passagens (a fila e o status andam juntos).
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, fetchJson } from "@/lib/queryClient";
import { aplicarStatusDaVagaNoCache, TEAM_INCLUSIONS_KEY } from "@/hooks/use-vaga-acoes";
import type { TransporteTerrestre } from "@shared/schema";
import type { ItemTerrestre, ModoDeRegistro, PernaDaViagem, ResumoDoGrupo, TrechoTerrestre } from "@shared/transporte-terrestre";

/** Linha do GET: as colunas + o resumo do grupo (21/10). */
export type TerrestreLido = TransporteTerrestre & Partial<ResumoDoGrupo>;

export const comoTrechoTerrestre = (r: TerrestreLido): TrechoTerrestre => ({
  trecho: r.trecho as PernaDaViagem,
  modo: r.modo as TrechoTerrestre["modo"],
  empresa: r.empresa ?? null,
  valorCentavos: r.valorCentavos,
  // Grupo com uma vaga só (as outras saíram) não é grupo: o servidor já manda null.
  grupo: r.grupoId && r.grupoTotalCentavos != null && (r.grupoVagas ?? 0) > 1
    ? { id: r.grupoId, totalCentavos: r.grupoTotalCentavos, vagas: r.grupoVagas! }
    : null,
});

/** Mesmo recorte das passagens: um evento, só os que não terminaram, ou tudo. */
export function useTerrestres(recorte: { eventId?: string; futuros?: boolean }) {
  const { eventId, futuros } = recorte;
  const { data } = useQuery<TerrestreLido[]>({
    queryKey: eventId ? ["/api/tickets", "terrestres", { eventId }] : futuros ? ["/api/tickets", "terrestres", { futuros: true }] : ["/api/tickets", "terrestres"],
    queryFn: ({ signal }) => fetchJson<TerrestreLido[]>(
      eventId ? `/api/transportes-terrestres?eventId=${encodeURIComponent(eventId)}` : futuros ? "/api/transportes-terrestres?futuros=1" : "/api/transportes-terrestres",
      signal,
    ),
  });
  const porVaga = useMemo(() => {
    const map = new Map<string, TrechoTerrestre[]>();
    for (const r of data ?? []) {
      const lista = map.get(r.teamInclusionId) ?? [];
      lista.push(comoTrechoTerrestre(r));
      map.set(r.teamInclusionId, lista);
    }
    return map;
  }, [data]);
  return { terrestreByInclusion: porVaga, carregado: !!data };
}

export interface RespostaDoRegistro {
  gravados: number;
  vagas: number;
  falhas: { teamInclusionId: string; numero: number | null; mensagem: string }[];
  statusPorVaga: Record<string, string>;
}

/** Registrar (um ou vários), desfazer, e a van inteira. Os erros sobem para quem chamou (o formulário mostra). */
export function useTerrestreMutations() {
  const queryClient = useQueryClient();
  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
    queryClient.invalidateQueries({ queryKey: [TEAM_INCLUSIONS_KEY] });
    queryClient.invalidateQueries({ queryKey: ["shell", "sem-passagem-30d"] });
  };
  const registrar = useMutation({
    // `tudoOuNada` (lote com o total dividido): o servidor grava todos os itens ou nenhum.
    // `agrupar` (21/10): o total foi dividido entre as vagas — as linhas viram um grupo.
    mutationFn: async (entrada: ItemTerrestre[] | { itens: ItemTerrestre[]; tudoOuNada?: boolean; agrupar?: boolean }) => {
      const corpo = Array.isArray(entrada) ? { itens: entrada } : entrada;
      return (await apiRequest("POST", "/api/transportes-terrestres", corpo)).json() as Promise<RespostaDoRegistro>;
    },
    onSuccess: (res) => {
      for (const [id, status] of Object.entries(res.statusPorVaga ?? {})) aplicarStatusDaVagaNoCache(queryClient, id, status);
      recarregar();
    },
  });
  const desfazer = useMutation({
    mutationFn: async ({ inclusionId, trecho }: { inclusionId: string; trecho?: PernaDaViagem }) =>
      (await apiRequest("DELETE", `/api/transportes-terrestres/${encodeURIComponent(inclusionId)}${trecho ? `?trecho=${trecho}` : ""}`)).json() as Promise<{ removidos: number; inclusionStatus?: string }>,
    onSuccess: (res, vars) => {
      if (res.inclusionStatus) aplicarStatusDaVagaNoCache(queryClient, vars.inclusionId, res.inclusionStatus);
      recarregar();
    },
  });
  const editarGrupo = useMutation({
    mutationFn: async ({ grupoId, ...corpo }: { grupoId: string; modo: ModoDeRegistro; empresa: string | null; totalCentavos: number }) =>
      (await apiRequest("PUT", `/api/transportes-terrestres/grupos/${encodeURIComponent(grupoId)}`, corpo)).json() as Promise<{ atualizados: number; vagas: number }>,
    onSuccess: recarregar,
  });
  const desfazerGrupo = useMutation({
    mutationFn: async ({ grupoId }: { grupoId: string }) =>
      (await apiRequest("DELETE", `/api/transportes-terrestres/grupos/${encodeURIComponent(grupoId)}`)).json() as Promise<{ removidos: number; vagas: number; statusPorVaga: Record<string, string> }>,
    onSuccess: (res) => {
      for (const [id, status] of Object.entries(res.statusPorVaga ?? {})) aplicarStatusDaVagaNoCache(queryClient, id, status);
      recarregar();
    },
  });
  return { registrar, desfazer, editarGrupo, desfazerGrupo };
}
