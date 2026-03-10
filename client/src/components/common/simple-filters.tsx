import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Search } from "lucide-react";
import CollaboratorCombobox from "@/components/ui/collaborator-combobox";
import EventCombobox from "@/components/ui/event-combobox";
import FunctionMultiSelect from "@/components/ui/function-multi-select";
import type { Event, Function, Collaborator } from "@shared/schema";

interface SimpleFiltersProps {
  filters: {
    eventId: string;
    functionId: string | string[];
    collaboratorId: string;
    searchId: string;
  };
  onFiltersChange: (filters: any) => void;
  extraItems?: Array<{ label: string; element: React.ReactNode }>;
}

export default function SimpleFilters({ filters, onFiltersChange, extraItems }: SimpleFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.searchId ?? "");

  useEffect(() => {
    setSearchInput(filters.searchId ?? "");
  }, [filters.searchId]);

  useEffect(() => {
    if (searchInput === "") {
      onFiltersChange({ ...filters, searchId: "" });
      return;
    }
    const t = setTimeout(() => onFiltersChange({ ...filters, searchId: searchInput }), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });

  const clearFilters = () => {
    onFiltersChange({ eventId: "all", functionId: [], collaboratorId: "all", searchId: "" });
  };

  const firstExtraItem = extraItems?.[0];
  const secondExtraItem = extraItems?.[1];
  const hasExtra = !!firstExtraItem;

  return (
    <div
      className="bg-white rounded-xl border border-[#E2E8F0] p-5 mb-0"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
    >
      {/* Linha 1: Buscar por ID (largura total) */}
      <div className="mb-4">
        <label className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">
          Buscar por ID
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Buscar por número..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-[#E2E8F0] rounded-xl bg-slate-50 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
            data-testid="input-search-id"
          />
        </div>
      </div>

      {/* Linha 2: Evento, Funções, Colaborador + primeiro extra (4 colunas) */}
      <div className="mb-4">
        <div className={`grid grid-cols-2 ${hasExtra ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-3`}>
          <div>
            <label className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">
              Evento
            </label>
            <EventCombobox
              events={events?.filter(e => e.status !== 'excluido' && e.status !== 'excluído')}
              value={filters.eventId}
              onValueChange={(value) => onFiltersChange({ ...filters, eventId: value })}
              placeholder="Selecionar evento"
              testId="filter-event"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">
              Funções
            </label>
            <FunctionMultiSelect
              functions={functions}
              selectedIds={Array.isArray(filters.functionId) ? filters.functionId : []}
              onSelectedChange={(selectedIds) => onFiltersChange({ ...filters, functionId: selectedIds })}
              placeholder="Selecionar funções"
              testId="filter-function"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">
              Colaborador
            </label>
            <CollaboratorCombobox
              collaborators={collaborators}
              value={filters.collaboratorId}
              onValueChange={(value) => onFiltersChange({ ...filters, collaboratorId: value })}
              placeholder="Selecionar colaborador"
              testId="filter-collaborator"
            />
          </div>

          {firstExtraItem && (
            <div>
              <label className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">
                {firstExtraItem.label}
              </label>
              {firstExtraItem.element}
            </div>
          )}
        </div>
      </div>

      {/* Linha 3: segundo extra à esquerda + Limpar Filtros à direita */}
      <div className="flex items-end justify-between gap-3 pt-3 border-t border-[#E2E8F0]">
        <div className="flex-1 max-w-xs">
          {secondExtraItem ? (
            <>
              <label className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">
                {secondExtraItem.label}
              </label>
              {secondExtraItem.element}
            </>
          ) : (
            <span />
          )}
        </div>
        <Button
          variant="outline"
          onClick={clearFilters}
          className="flex items-center gap-2 border border-[#E2E8F0] text-[#64748B] hover:bg-red-50 hover:text-red-500 hover:border-red-200 rounded-lg px-3 py-2 text-sm font-medium transition-colors shrink-0"
          data-testid="button-clear-filters"
        >
          <X className="w-4 h-4" />
          Limpar Filtros
        </Button>
      </div>
    </div>
  );
}
