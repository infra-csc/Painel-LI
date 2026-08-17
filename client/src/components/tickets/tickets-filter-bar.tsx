// Barra de filtros da tabela de Passagens.
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
}

const selectCls = "h-8 px-2 pr-7 bg-white border border-gray-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 transition-all";

export default function TicketsFilterBar({ filters, onChange, onClear, events, functions, collaborators, count }: TicketsFilterBarProps) {
  const set = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) => onChange(prev => ({ ...prev, [key]: value }));
  return (
    <div className="px-5 py-3 border-b border-gray-100 bg-[#FAFBFF] flex flex-wrap items-center justify-between gap-y-2 gap-x-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" style={{ fontSize: 14 }}>search</span>
          <input
            type="text"
            placeholder="Nome ou número..."
            value={filters.searchId ?? ""}
            onChange={(e) => set("searchId", e.target.value)}
            className="h-8 pl-8 pr-3 w-44 bg-white border border-gray-200 rounded-lg text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 transition-all"
            data-testid="input-search-id"
          />
        </div>
        <div className="w-44">
          <EventCombobox
            events={events?.filter(e => e.status !== "excluido" && e.status !== "excluído")}
            value={filters.eventId}
            onValueChange={(value) => set("eventId", value)}
            placeholder="Evento"
            testId="filter-event"
          />
        </div>
        <div className="w-44">
          <FunctionMultiSelect
            functions={functions}
            selectedIds={filters.functionId}
            onSelectedChange={(ids) => set("functionId", ids)}
            placeholder="Funções"
            testId="filter-function"
          />
        </div>
        <div className="w-44">
          <CollaboratorCombobox
            collaborators={collaborators}
            value={filters.collaboratorId}
            onValueChange={(value) => set("collaboratorId", value)}
            placeholder="Colaborador"
            testId="filter-collaborator"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={filters.ticketStatus} onChange={(e) => set("ticketStatus", e.target.value)} className={selectCls} data-testid="filter-ticket-status">
          <option value="all">Todos os status</option>
          <option value="pending">Pendentes</option>
          <option value="processed">Compradas</option>
          <option value="no_arrival">Compradas sem horário de chegada</option>
        </select>
        <select value={filters.transportType} onChange={(e) => set("transportType", e.target.value)} className={selectCls} data-testid="filter-transport-type" aria-label="Filtrar por tipo de transporte">
          <option value="all">Todos os transportes</option>
          <option value="aereo">Aéreo</option>
          <option value="rodoviario">Rodoviário</option>
          <option value="van">Van</option>
        </select>
        <select value={filters.inclusionStatus} onChange={(e) => set("inclusionStatus", e.target.value)} className={selectCls} data-testid="filter-inclusion-status">
          <option value="active">Inclusões ativas</option>
          <option value="all">Todas</option>
          <option value="cancelado">Canceladas</option>
        </select>
        <span className="text-[11px] text-slate-400 font-medium bg-white border border-gray-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
          {count} registro{count !== 1 ? "s" : ""}
        </span>
        {/* "Limpar" zera também o filtro de trocas pendentes (via onClear). */}
        <button
          onClick={() => { onChange(() => DEFAULT_TICKET_FILTERS); onClear(); }}
          className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-slate-500 border border-gray-200 hover:border-red-200 hover:text-red-500 hover:bg-red-50 rounded-lg bg-white transition-colors whitespace-nowrap"
          data-testid="button-clear-filters"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>Limpar
        </button>
      </div>
    </div>
  );
}
