/**
 * Dados comuns do Módulo de Honorários (Fase 0, 26/10) para as telas do grupo.
 *
 *  - `useTrilhaDoEvento(eventId)`: quantos registros do evento estão em cada
 *    etapa da trilha única. Vem do mesmo endpoint do Painel de honorários
 *    (GET /api/rh/controle?eventId=&recorte=todos) — a régua é a do servidor
 *    e a chave começa por `CHAVE_CONTROLE_RH`, então toda ação que já
 *    invalida o Painel (enviar, decidir, nota, check-in) atualiza a trilha.
 *  - `useDataDeCorte()`: a data de corte do legado (GET /api/honorarios/
 *    data-de-corte); sem resposta, vale a decisão do dono (01/11/2026).
 */
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/queryClient";
import type { ControleRh } from "@shared/controle-rh";
import { DATA_DE_CORTE_PADRAO, ehEventoLegado } from "@shared/legado-honorarios";
import type { ContagemDaTrilha } from "@shared/trilha-honorarios";
import { CHAVE_CONTROLE_RH } from "@/components/rh/prestacao-utils";

export function useTrilhaDoEvento(eventId: string | null | undefined) {
  const q = useQuery<ControleRh, Error, ContagemDaTrilha>({
    queryKey: [CHAVE_CONTROLE_RH, { eventId: eventId ?? undefined, recorte: "todos", uso: "trilha" }],
    queryFn: ({ signal }) => fetchJson<ControleRh>(`${CHAVE_CONTROLE_RH}?eventId=${encodeURIComponent(eventId ?? "")}&recorte=todos`, signal),
    select: (d) => d.contadores.trilha,
    enabled: !!eventId,
    staleTime: 15_000,
  });
  return { contagem: q.data, carregando: q.isLoading, erro: q.isError };
}

export const CHAVE_DATA_DE_CORTE = "/api/honorarios/data-de-corte";

export interface RespostaDaDataDeCorte {
  dataDeCorte: string;
  padrao: string;
  podeEditar: boolean;
}

export function useDataDeCorte(enabled = true) {
  const q = useQuery<RespostaDaDataDeCorte>({ queryKey: [CHAVE_DATA_DE_CORTE], enabled, staleTime: 60_000 });
  const dataDeCorte = q.data?.dataDeCorte ?? DATA_DE_CORTE_PADRAO;
  /** O evento terminou antes da data de corte? */
  const ehLegado = useCallback(
    (e: { endDate?: string | null } | null | undefined) => ehEventoLegado(e?.endDate ?? null, dataDeCorte),
    [dataDeCorte],
  );
  return { dataDeCorte, podeEditar: !!q.data?.podeEditar, carregando: q.isLoading, erro: q.isError, ehLegado };
}

/** O que o seletor de evento precisa para esconder o legado (event-select.tsx). */
export interface FiltroDoLegado {
  ehLegado: (e: { endDate?: string | null } | null | undefined) => boolean;
  /**
   * Some da lista com o filtro desligado: legado que terminou há mais de
   * 60 dias (DIAS_DO_LEGADO_RECENTE). O legado recente (eventos desta virada, ainda sendo
   * fechados no fluxo antigo) continua à vista, com o selo "Legado".
   */
  ocultavel: (e: { endDate?: string | null } | null | undefined) => boolean;
  /** Mostrar os eventos legados na lista? (padrão: não) */
  mostrar: boolean;
  setMostrar: (v: boolean) => void;
  dataDeCorte: string;
}

const CHAVE_MOSTRAR_LEGADO = "honorarios:mostrar-legado";
/** Legado que terminou há até tantos dias continua na lista (27/10: a virada não esconde evento em fechamento). */
export const DIAS_DO_LEGADO_RECENTE = 60;

function terminouHaMaisDe(endDate: string | null | undefined, dias: number): boolean {
  if (!endDate) return false;
  const limite = new Date();
  limite.setDate(limite.getDate() - dias);
  const iso = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, "0")}-${String(limite.getDate()).padStart(2, "0")}`;
  return endDate.slice(0, 10) < iso;
}

function lerMostrar(): boolean {
  try { return window.localStorage.getItem(CHAVE_MOSTRAR_LEGADO) === "1"; } catch { return false; }
}

/**
 * Pré-aprovação, Realizado, Conferência DP e Notas fiscais abrem SEM o legado
 * (eventos que terminam antes da data de corte); o filtro para ver mora no
 * seletor de evento e vale para as quatro telas (preferência deste navegador).
 */
export function useFiltroDoLegado(): FiltroDoLegado {
  const { dataDeCorte, ehLegado } = useDataDeCorte();
  const [mostrar, setMostrarEstado] = useState(lerMostrar);
  const setMostrar = useCallback((v: boolean) => {
    setMostrarEstado(v);
    try { window.localStorage.setItem(CHAVE_MOSTRAR_LEGADO, v ? "1" : "0"); } catch { /* sem armazenamento: vale só nesta tela */ }
  }, []);
  const ocultavel = useCallback(
    (e: { endDate?: string | null } | null | undefined) => ehLegado(e) && terminouHaMaisDe(e?.endDate, DIAS_DO_LEGADO_RECENTE),
    [ehLegado],
  );
  return { ehLegado, ocultavel, mostrar, setMostrar, dataDeCorte };
}
