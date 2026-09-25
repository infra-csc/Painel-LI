/**
 * Filtros e aba da Aprovação de Escala (25/09 — extraídos de pages/scaling-approval.tsx):
 * status, tipo, busca, "atrasados", "só os que posso decidir", aba aberta e as
 * ações compostas (tile → fila em pendentes, chips de recorte).
 */
import { useRef, useState } from "react";
import { CHANGE_REQUEST_STATUS, CHANGE_REQUEST_STATUS_VALUES, STALLED_DAYS, daysPending, type ChangeRequestType } from "@shared/scaling-validation-rules";
import type { ChangeRequestItem } from "../types";

export const ALL = "all";
export const BASE_PATH = "/scaling-approval";

export type StatusFilter = typeof ALL | (typeof CHANGE_REQUEST_STATUS_VALUES)[number];
export type TypeFilter = typeof ALL | ChangeRequestType;
/** Filtro rápido ativo a partir dos contadores. */
export type QuickFilter = "pendentes" | "ajuste" | "inclusao" | "exclusao";
/**
 * Abas da tela. A tela ABRE na "fila" com o filtro em pendentes (decisão do
 * dono, 26/08); "aprovacao" (vagas validadas pela área) fica a um clique, na
 * própria aba e no tile "Aguardando aprovação".
 */
export type ApprovalTab = "aprovacao" | "fila" | "paradas" | "decididas";

export function useApprovalFilters() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(CHANGE_REQUEST_STATUS.PENDENTE);
  const [search, setSearch] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [tab, setTab] = useState<ApprovalTab>("fila");
  /** Marca que o usuário escolheu a aba (o deep-link de pedido também usa). */
  const tabPickedByUser = useRef(false);

  const hasActiveFilters = search.trim() !== "" || typeFilter !== ALL || statusFilter !== CHANGE_REQUEST_STATUS.PENDENTE || lateOnly || mineOnly;
  const clearFilters = () => { setSearch(""); setTypeFilter(ALL); setStatusFilter(CHANGE_REQUEST_STATUS.PENDENTE); setLateOnly(false); setMineOnly(false); };

  /**
   * O chip de tipo acompanha o filtro de tipo em QUALQUER status (04/09): com
   * "Ajustes" marcado e o status em "Todos", o chip apagava e a lista continuava
   * recortada — a pessoa não via por que só tinha ajustes. Só "pendentes"
   * (o tile) exige o status pendente.
   */
  const activeQuick: QuickFilter | null =
    typeFilter === ALL
      ? (statusFilter === CHANGE_REQUEST_STATUS.PENDENTE ? "pendentes" : null)
      : (typeFilter as QuickFilter);
  /** Os chips recortam os PENDENTES; com outro status escolhido eles ficam atenuados e, ao clicar, voltam ao pendente. */
  const recortesForaDoEscopo = statusFilter !== CHANGE_REQUEST_STATUS.PENDENTE;
  /** Trocar de aba por ação do usuário (aba ou tile) — congela o padrão automático. */
  const switchTab = (t: ApprovalTab) => { tabPickedByUser.current = true; setTab(t); };
  /**
   * Entrar na Fila pela ABA sempre mostra OS PENDENTES (regra do dono, 26/08:
   * "na aprovação os pendentes têm que vir selecionado"). Sem isso a fila
   * reabria com o recorte da última visita — "Ajuste", "atrasados" — e o
   * aprovador achava que tinha 1 pedido quando tinha 3.
   */
  const openFilaTab = () => {
    switchTab("fila");
    setStatusFilter(CHANGE_REQUEST_STATUS.PENDENTE);
    setTypeFilter(ALL);
    setLateOnly(false);
    setMineOnly(false);
  };
  const applyQuick = (q: QuickFilter) => {
    switchTab("fila");
    if (activeQuick === q && q !== "pendentes") { setTypeFilter(ALL); return; }
    setStatusFilter(CHANGE_REQUEST_STATUS.PENDENTE);
    setTypeFilter(q === "pendentes" ? ALL : q);
  };

  return {
    typeFilter, setTypeFilter, statusFilter, setStatusFilter, search, setSearch, lateOnly, setLateOnly, mineOnly, setMineOnly,
    tab, setTab, tabPickedByUser, hasActiveFilters, clearFilters, activeQuick, recortesForaDoEscopo, switchTab, openFilaTab, applyQuick,
  };
}

export type ApprovalFilters = ReturnType<typeof useApprovalFilters>;

/** A fila visível: tipo, atrasados, "posso decidir" e busca; pendentes primeiro (mais antigos no topo), decididos por data desc. */
export function filtrarPedidos(items: ChangeRequestItem[], f: Pick<ApprovalFilters, "typeFilter" | "search" | "lateOnly" | "mineOnly">): ChangeRequestItem[] {
  const q = f.search.trim().toLowerCase();
  return items
    .filter((r) => f.typeFilter === ALL || r.requestType === f.typeFilter)
    .filter((r) => !f.lateOnly || (r.status === CHANGE_REQUEST_STATUS.PENDENTE && daysPending(r.createdAt) >= STALLED_DAYS))
    .filter((r) => !f.mineOnly || r.canDecide)
    .filter((r) => {
      if (!q) return true;
      return [r.functionName, r.eventName, r.requestedByName, r.reason, r.area, r.inclusionNumber ? `#${r.inclusionNumber}` : "", String(r.inclusionNumber ?? "")]
        .some((v) => (v ?? "").toString().toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const pa = a.status === CHANGE_REQUEST_STATUS.PENDENTE ? 0 : 1;
      const pb = b.status === CHANGE_REQUEST_STATUS.PENDENTE ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const ta = new Date(a.createdAt ?? 0).getTime();
      const tb = new Date(b.createdAt ?? 0).getTime();
      return pa === 0 ? ta - tb : tb - ta;
    });
}

/** Contadores sempre sobre os PENDENTES. */
export function contarPendentes(pendingItems: ChangeRequestItem[]) {
  return {
    pendentes: pendingItems.length,
    ajuste: pendingItems.filter((r) => r.requestType === "ajuste").length,
    inclusao: pendingItems.filter((r) => r.requestType === "inclusao").length,
    exclusao: pendingItems.filter((r) => r.requestType === "exclusao").length,
    atrasados: pendingItems.filter((r) => daysPending(r.createdAt) >= STALLED_DAYS).length,
    meus: pendingItems.filter((r) => r.canDecide).length,
  };
}

export type ContagemPendentes = ReturnType<typeof contarPendentes>;
