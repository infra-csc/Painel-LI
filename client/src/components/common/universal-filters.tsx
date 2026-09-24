import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { Search, CalendarDays, Layers, UserRound, Tag, ArrowUpDown, RotateCcw, Plane, BedDouble } from "lucide-react";
import FunctionMultiSelect from "@/components/ui/function-multi-select";
import MultiSelectFilter from "@/components/ui/multi-select-filter";
import { fixEncoding } from "@/lib/utils";
import type { Event, Function, Collaborator } from "@shared/schema";

// Seleção múltipla (pedido do dono, 28/08): cada campo é uma LISTA de
// valores marcados; lista vazia significa "todos".
export interface UniversalFilterValues {
  eventId: string[];
  functionId: string | string[];
  collaboratorId: string[];
  status?: string[];
  escalationStatus: string[];
  searchId: string;
  showDeleted?: boolean;
  ticketStatus?: string[];
  accommodationStatus?: string[];
}

interface UniversalFiltersProps {
  filters: UniversalFilterValues;
  onFiltersChange: (filters: UniversalFilterValues) => void;
  hideStatusFilter?: boolean;
  children?: React.ReactNode;
  rightActions?: React.ReactNode;
  showTicketFilter?: boolean;
  showAccommodationFilter?: boolean;
}

const FilterLabel = ({ icon: Icon, text }: { icon: LucideIcon; text: string }) => (
  <label className="flex items-center gap-1.5 mb-1.5">
    <Icon className="w-3 h-3 text-muted-foreground" />
    <span className="text-2xs font-bold tracking-widest text-muted-foreground uppercase">{text}</span>
  </label>
);

export default function UniversalFilters({ filters, onFiltersChange, hideStatusFilter = false, children, rightActions, showTicketFilter = false, showAccommodationFilter = false }: UniversalFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.searchId ?? "");

  useEffect(() => {
    setSearchInput(filters.searchId ?? "");
  }, [filters.searchId]);

  // O debounce só pode reagir ao que o usuário digita: `filters`/`onFiltersChange`
  // mudam a cada render da tela pai e, como dependências, reiniciariam o timer
  // (e disparariam o callback) sem nenhuma tecla nova. Por isso ficam numa ref.
  const ultimo = useRef({ filters, onFiltersChange });
  ultimo.current = { filters, onFiltersChange };
  useEffect(() => {
    // Sem mudança real, sem callback (auditoria 28/08): este efeito disparava
    // onFiltersChange no MONTAR da tela, e cada tela reagia refazendo memos e
    // repintando a lista inteira antes mesmo do usuário digitar algo.
    const { filters: atuais, onFiltersChange: aplicar } = ultimo.current;
    if (searchInput === (atuais.searchId ?? "")) return;
    if (searchInput === "") {
      aplicar({ ...atuais, searchId: "" });
      return;
    }
    const t = setTimeout(() => {
      const { filters: f, onFiltersChange: cb } = ultimo.current;
      cb({ ...f, searchId: searchInput });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  const { data: collaborators } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborators"],
  });

  const statusOptions = [
    { value: "planejado", label: "Aguardando Escalação" },
    { value: "escalacao", label: "Em Escalação" },
    { value: "passagem", label: "Aguardando Passagem" },
    { value: "hospedagem", label: "Aguardando Hospedagem" },
    { value: "passagem_comprada", label: "Passagem Comprada" },
    { value: "hospedagem_comprada", label: "Hospedagem Comprada" },
    { value: "hospedagem_passagem_comprada", label: "Hospedagem e Passagem Comprada" }
  ];

  const clearFilters = () => {
    const baseFilters: UniversalFilterValues = {
      eventId: [],
      functionId: [],
      collaboratorId: [],
      escalationStatus: [],
      searchId: "",
      showDeleted: false
    };
    if (!hideStatusFilter) baseFilters.status = [];
    if (showTicketFilter) baseFilters.ticketStatus = [];
    if (showAccommodationFilter) baseFilters.accommodationStatus = [];
    onFiltersChange(baseFilters);
  };

  const baseCols = hideStatusFilter ? 5 : 6;
  const extraCols = (showTicketFilter ? 1 : 0) + (showAccommodationFilter ? 1 : 0);
  const totalCols = baseCols + extraCols;
  const gridCols = `160px ${Array(totalCols - 1).fill('1fr').join(' ')}`;

  return (
    <div className="bg-card rounded-xl border border-border shadow-1 px-5 py-4 mb-6">
      {/* Grid de filtros */}
      <div
        className="grid gap-3 items-end"
        style={{ gridTemplateColumns: gridCols }}
      >
        {/* Busca */}
        <div>
          <FilterLabel icon={Search} text="Buscar" />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5 pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              placeholder="ID ou nome…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full h-9 pl-8 pr-3 border border-border rounded-lg bg-card text-sm text-slate-700 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
              data-testid="input-search-id"
            />
          </div>
        </div>

        {/* Evento */}
        <div>
          <FilterLabel icon={CalendarDays} text="Evento" />
          <MultiSelectFilter
            options={(events?.filter(e => e.status !== 'excluido' && e.status !== 'excluído') || [])
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
              .map(e => ({ value: e.id, label: e.name }))}
            selected={filters.eventId ?? []}
            onChange={(value) => onFiltersChange({ ...filters, eventId: value })}
            placeholder="Todos os Eventos"
            searchable
            searchPlaceholder="Buscar evento…"
            testId="filter-event"
          />
        </div>

        {/* Funções */}
        <div>
          <FilterLabel icon={Layers} text="Funções" />
          <FunctionMultiSelect
            functions={functions}
            selectedIds={Array.isArray(filters.functionId) ? filters.functionId : []}
            onSelectedChange={(selectedIds) => onFiltersChange({ ...filters, functionId: selectedIds })}
            placeholder="Selecionar funções"
            testId="filter-function"
          />
        </div>

        {/* Colaborador */}
        <div>
          <FilterLabel icon={UserRound} text="Colaborador" />
          <MultiSelectFilter
            options={(collaborators || [])
              .slice()
              .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "pt-BR", { sensitivity: "base" }))
              .map(c => ({ value: c.id, label: fixEncoding(c.fullName) || "Sem nome" }))}
            selected={filters.collaboratorId ?? []}
            onChange={(value) => onFiltersChange({ ...filters, collaboratorId: value })}
            placeholder="Todos os Colaboradores"
            searchable
            searchPlaceholder="Buscar colaborador…"
            testId="filter-collaborator"
          />
        </div>

        {/* Status (opcional) */}
        {!hideStatusFilter && (
          <div>
            <FilterLabel icon={Tag} text="Status" />
            <MultiSelectFilter
              options={statusOptions}
              selected={filters.status ?? []}
              onChange={(value) => onFiltersChange({ ...filters, status: value })}
              placeholder="Todos os Status"
              testId="filter-status"
            />
          </div>
        )}

        {/* Escalação */}
        <div>
          <FilterLabel icon={ArrowUpDown} text="Escalação" />
          <MultiSelectFilter
            options={[
              { value: "pending", label: "Pendentes de Escalação" },
              { value: "escalated", label: "Já Escalados" },
              { value: "aguardando_producao", label: "Aguardando Gestor" },
              { value: "cancelado", label: "Cancelados" },
            ]}
            selected={filters.escalationStatus ?? []}
            onChange={(value) => onFiltersChange({ ...filters, escalationStatus: value })}
            placeholder="Todos"
            testId="filter-escalation"
          />
        </div>

        {/* Passagem */}
        {showTicketFilter && (
          <div>
            <FilterLabel icon={Plane} text="Passagem" />
            <MultiSelectFilter
              options={[
                { value: "needs", label: "Precisa de passagem" },
                { value: "no-need", label: "Sem passagem" },
                { value: "purchased", label: "Comprada" },
                { value: "not-purchased", label: "Não comprada" },
              ]}
              selected={filters.ticketStatus ?? []}
              onChange={(value) => onFiltersChange({ ...filters, ticketStatus: value })}
              placeholder="Todas"
              testId="filter-ticket-status"
            />
          </div>
        )}

        {/* Hospedagem */}
        {showAccommodationFilter && (
          <div>
            <FilterLabel icon={BedDouble} text="Hospedagem" />
            <MultiSelectFilter
              options={[
                { value: "needs", label: "Precisa de hotel" },
                { value: "no-need", label: "Sem hotel" },
                { value: "reserved", label: "Reservada" },
                { value: "not-reserved", label: "Não reservada" },
              ]}
              selected={filters.accommodationStatus ?? []}
              onChange={(value) => onFiltersChange({ ...filters, accommodationStatus: value })}
              placeholder="Todas"
              testId="filter-accommodation-status"
            />
          </div>
        )}
      </div>

      {/* Linha 2: children (esquerda) + Toggle + Limpar (direita) */}
      <div className="flex items-center justify-between mt-3.5 pt-3.5 border-t border-border gap-4">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          {children}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {rightActions}

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Switch
              id="show-deleted"
              checked={filters.showDeleted || false}
              onCheckedChange={(checked) => onFiltersChange({ ...filters, showDeleted: checked })}
              data-testid="checkbox-show-deleted"
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">Mostrar Excluídos</span>
          </label>

          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-danger-strong text-sm font-medium transition-colors"
            data-testid="button-clear-filters"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Limpar filtros
          </button>
        </div>
      </div>
    </div>
  );
}
