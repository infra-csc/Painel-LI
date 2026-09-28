// Extraído de rh-control.tsx em 25/09 (modularização): estado dos filtros do
// Controle RH, guardado na URL. Separado do hook de dados porque filtros são
// entrada do usuário (e viram links compartilháveis); os dados só os consomem.
import { useDeferredValue } from "react";
import { campo, useUrlState } from "@/lib/use-url-state";
import { guardarEventoEmFoco } from "@/lib/evento-em-foco";
import type { PrestacaoStatus } from "./prestacao-types";

export interface RhFiltros {
  filterEvent: string;
  setFilterEvent: (v: string) => void;
  filterStatus: PrestacaoStatus;
  setFilterStatus: (v: PrestacaoStatus | ((prev: PrestacaoStatus) => PrestacaoStatus)) => void;
  filterCheckinOnly: boolean;
  setFilterCheckinOnly: (v: boolean) => void;
  filterFunction: string;
  setFilterFunction: (v: string) => void;
  filterCollaborator: string;
  setFilterCollaborator: (v: string) => void;
  filterInvoiceStatus: string;
  setFilterInvoiceStatus: (v: string) => void;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  /** Busca com `useDeferredValue` — é o que a fila de fato filtra. */
  buscaAplicada: string;
  showConcluded: boolean;
  setShowConcluded: (v: boolean) => void;
  hasActiveFilters: boolean;
  isRhFilterActive: boolean;
}

export function useRhFiltros(userId: string | undefined): RhFiltros {
  // Filtros na URL (23/09): ir ao Planejado/Notas e voltar devolvia a fila
  // zerada. `?event=` é o mesmo nome dos links para as outras telas do
  // Financeiro; escolher um evento aqui também vira o "evento em foco" (memória
  // por usuário). Mas esta é uma tela de FILA: abre em "Todos os eventos" (regra
  // do dono, 26/08) — o padrão não vem do localStorage, só da URL.
  const [f, setF] = useUrlState({
    event: campo.texto(""),
    status: campo.opcao<PrestacaoStatus>("all"),
    checkin: campo.booleano(false),
    function: campo.texto("all"),
    collaborator: campo.texto("all"),
    nf: campo.texto("all"),
    q: campo.texto(""),
    concluidos: campo.booleano(false),
  });
  const filterEvent = f.event || "all";
  const setFilterEvent = (v: string) => {
    const id = v === "all" ? "" : v;
    setF({ event: id });
    if (id) guardarEventoEmFoco(userId, id);
  };
  const filterStatus = f.status;
  const setFilterStatus = (v: PrestacaoStatus | ((prev: PrestacaoStatus) => PrestacaoStatus)) =>
    setF(prev => ({ ...prev, status: typeof v === "function" ? v(prev.status) : v }));
  const filterCheckinOnly = f.checkin;
  const setFilterCheckinOnly = (v: boolean) => setF({ checkin: v });
  const filterFunction = f.function;
  const setFilterFunction = (v: string) => setF({ function: v });
  const filterCollaborator = f.collaborator;
  const setFilterCollaborator = (v: string) => setF({ collaborator: v });
  const filterInvoiceStatus = f.nf;
  const setFilterInvoiceStatus = (v: string) => setF({ nf: v });
  const searchTerm = f.q;
  const setSearchTerm = (v: string) => setF({ q: v });
  // `useDeferredValue` (23/09): refiltrar centenas de prestações a cada tecla
  // travava a digitação. O input continua controlado por `searchTerm`.
  const buscaAplicada = useDeferredValue(searchTerm);
  const showConcluded = f.concluidos;
  const setShowConcluded = (v: boolean) => setF({ concluidos: v });

  // Os 4 card-filtros (rh_action, col_action, nf_andamento, concluidos) contam
  // como filtro ativo — consistente com o badge "Filtros (N)".
  const hasActiveFilters = filterEvent !== "all" || filterFunction !== "all" || filterCollaborator !== "all" || filterStatus !== "all" || filterInvoiceStatus !== "all" || searchTerm !== "" || filterCheckinOnly;
  const isRhFilterActive = filterStatus === "rh_action";

  return {
    filterEvent, setFilterEvent,
    filterStatus, setFilterStatus,
    filterCheckinOnly, setFilterCheckinOnly,
    filterFunction, setFilterFunction,
    filterCollaborator, setFilterCollaborator,
    filterInvoiceStatus, setFilterInvoiceStatus,
    searchTerm, setSearchTerm, buscaAplicada,
    showConcluded, setShowConcluded,
    hasActiveFilters, isRhFilterActive,
  };
}
