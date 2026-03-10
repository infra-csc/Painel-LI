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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
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
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
            data-testid="input-search-id"
          />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className={`grid grid-cols-2 ${extraItems?.length ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-3`}>
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

          {extraItems?.map((item, idx) => (
            <div key={idx}>
              <label className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">
                {item.label}
              </label>
              {item.element}
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-4 pt-3 border-t border-slate-100">
          <Button
            variant="outline"
            onClick={clearFilters}
            className="flex items-center gap-2 border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            data-testid="button-clear-filters"
          >
            <X className="w-4 h-4" />
            Limpar Filtros
          </Button>
        </div>
      </div>
    </div>
  );
}
