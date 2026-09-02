/**
 * Barra de filtros de Passagens — uma linha de 34px (02/09).
 *
 * Antes eram duas faixas de 36px DENTRO do card da tabela, com a contagem e o
 * "Limpar" competindo com a ordenação. Agora fica acima do card, no mesmo
 * padrão de `scaling/scaling-filter-bar.tsx`, porque as duas telas são filas
 * de trabalho irmãs.
 *
 * **Nenhum filtro saiu**: busca, evento, funções, colaborador, status da
 * passagem, transporte, situação da inclusão, contagem e limpar continuam
 * todos aqui — só mudaram de forma e de lugar.
 */
import { Search, X } from "lucide-react";
import EventCombobox from "@/components/ui/event-combobox";
import CollaboratorCombobox from "@/components/ui/collaborator-combobox";
import FunctionMultiSelect from "@/components/ui/function-multi-select";
import type { Event, Function, Collaborator } from "@shared/schema";
import { DEFAULT_TICKET_FILTERS, type TicketFilters } from "./types";

interface TicketsFilterBarProps {
  filters: TicketFilters;
  onChange: (updater: (prev: TicketFilters) => TicketFilters) => void;
  onClear: () => void;
  events: Event[] | undefined;
  functions: Function[] | undefined;
  collaborators: Collaborator[] | undefined;
  count: number;
  /** Total sem recorte — a contagem vira "N de M" quando há filtro ativo. */
  total?: number;
}

/** Altura e forma comuns a todos os controles da linha. */
const CONTROLE = "h-[34px] rounded-lg border border-border bg-card text-[13px] font-medium text-slate-700";
const SELECT = `${CONTROLE} px-2.5 pr-7 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12 transition-colors`;

export default function TicketsFilterBar({
  filters, onChange, onClear, events, functions, collaborators, count, total,
}: TicketsFilterBarProps) {
  const set = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) =>
    onChange(prev => ({ ...prev, [key]: value }));

  const contagem = typeof total === "number" && total !== count
    ? `${count} de ${total} ${total === 1 ? "vaga" : "vagas"}`
    : `${count} ${count === 1 ? "vaga" : "vagas"}`;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-[1_1_260px] max-w-[320px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
        <input
          type="text"
          placeholder="Buscar por nome, ID ou função…"
          aria-label="Buscar por nome, ID ou função"
          value={filters.searchId ?? ""}
          onChange={(e) => set("searchId", e.target.value)}
          className={`w-full ${CONTROLE} pl-[33px] pr-3 placeholder:text-slate-400 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12`}
          data-testid="input-search-id"
        />
      </div>

      <div className="w-[168px] shrink-0">
        <EventCombobox
          events={events?.filter(e => e.status !== "excluido" && e.status !== "excluído")}
          value={filters.eventId}
          onValueChange={(value) => set("eventId", value)}
          placeholder="Todos os eventos"
          testId="filter-event"
        />
      </div>
      <div className="w-[150px] shrink-0">
        <FunctionMultiSelect
          functions={functions}
          selectedIds={filters.functionId}
          onSelectedChange={(ids) => set("functionId", ids)}
          placeholder="Todas as funções"
          testId="filter-function"
        />
      </div>
      <div className="w-[170px] shrink-0">
        <CollaboratorCombobox
          collaborators={collaborators}
          value={filters.collaboratorId}
          onValueChange={(value) => set("collaboratorId", value)}
          placeholder="Todos os colaboradores"
          testId="filter-collaborator"
        />
      </div>

      <select
        value={filters.ticketStatus}
        onChange={(e) => set("ticketStatus", e.target.value)}
        className={SELECT}
        data-testid="filter-ticket-status"
        aria-label="Filtrar por situação da passagem"
      >
        <option value="all">Todos os status</option>
        <option value="pending">Pendentes</option>
        <option value="processed">Compradas</option>
        <option value="no_arrival">Compradas sem horário de chegada</option>
      </select>

      <select
        value={filters.transportType}
        onChange={(e) => set("transportType", e.target.value)}
        className={SELECT}
        data-testid="filter-transport-type"
        aria-label="Filtrar por tipo de transporte"
      >
        <option value="all">Todos os transportes</option>
        <option value="aereo">Aéreo</option>
        <option value="rodoviario">Rodoviário</option>
        <option value="van">Van</option>
      </select>

      <select
        value={filters.inclusionStatus}
        onChange={(e) => set("inclusionStatus", e.target.value)}
        className={SELECT}
        data-testid="filter-inclusion-status"
        aria-label="Filtrar por situação da inclusão"
      >
        <option value="active">Inclusões ativas</option>
        <option value="all">Todas</option>
        <option value="cancelado">Canceladas</option>
      </select>

      {/* "Limpar" zera também o filtro de trocas pendentes (via onClear). */}
      <button
        type="button"
        onClick={() => { onChange(() => DEFAULT_TICKET_FILTERS); onClear(); }}
        className={`${CONTROLE} inline-flex items-center gap-1.5 px-3 text-muted-foreground hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C] transition-colors whitespace-nowrap shrink-0`}
        data-testid="button-clear-filters"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar filtros
      </button>

      <span
        className="ml-auto text-[12px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0"
        data-testid="contagem-passagens"
      >
        {contagem}
      </span>
    </div>
  );
}
