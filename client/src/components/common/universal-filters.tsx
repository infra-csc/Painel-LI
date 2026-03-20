import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { X, Search } from "lucide-react";
import CollaboratorCombobox from "@/components/ui/collaborator-combobox";
import EventCombobox from "@/components/ui/event-combobox";
import FunctionMultiSelect from "@/components/ui/function-multi-select";
import type { Event, Function, Collaborator } from "@shared/schema";

interface UniversalFiltersProps {
  filters: {
    eventId: string;
    functionId: string | string[];
    collaboratorId: string;
    status?: string;
    escalationStatus: string;
    searchId: string;
    showDeleted?: boolean;
  };
  onFiltersChange: (filters: any) => void;
  hideStatusFilter?: boolean;
  children?: React.ReactNode;
  rightActions?: React.ReactNode;
}

export default function UniversalFilters({ filters, onFiltersChange, hideStatusFilter = false, children, rightActions }: UniversalFiltersProps) {
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
    { value: "all", label: "Todos os Status" },
    { value: "planejado", label: "Aguardando Escalação" },
    { value: "escalacao", label: "Em Escalação" },
    { value: "passagem", label: "Aguardando Passagem" },
    { value: "hospedagem", label: "Aguardando Hospedagem" },
    { value: "passagem_comprada", label: "Passagem Comprada" },
    { value: "hospedagem_comprada", label: "Hospedagem Comprada" },
    { value: "hospedagem_passagem_comprada", label: "Hospedagem e Passagem Comprada" }
  ];

  const clearFilters = () => {
    const baseFilters: any = {
      eventId: "all",
      functionId: [],
      collaboratorId: "all",
      escalationStatus: "all",
      searchId: "",
      showDeleted: false
    };
    if (!hideStatusFilter) {
      baseFilters.status = "all";
    }
    onFiltersChange(baseFilters);
  };

  return (
    <div className="bg-[#FAFBFF] rounded-xl border border-slate-200 shadow-sm px-5 py-4 mb-6">
      {/* Linha 1: Busca + Evento + Funções + Colaborador + [Status] + Escalação */}
      <div
        className="grid gap-3 items-end"
        style={{ gridTemplateColumns: hideStatusFilter ? '170px 1fr 1fr 1fr 1fr' : '150px 1fr 1fr 1fr 1fr 1fr' }}
      >
        {/* Busca */}
        <div>
          <label className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">
            Buscar
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="ID, nome..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full h-8 pl-8 pr-3 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
              data-testid="input-search-id"
            />
          </div>
        </div>

        {/* Evento */}
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

        {/* Funções */}
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

        {/* Colaborador */}
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

        {/* Status (opcional) */}
        {!hideStatusFilter && (
          <div>
            <label className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">
              Status
            </label>
            <Select
              value={filters.status}
              onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
              data-testid="filter-status"
            >
              <SelectTrigger className="h-8 w-full border border-slate-200 rounded-lg bg-white px-3 text-sm text-slate-700 cursor-pointer hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200 focus:border-blue-400">
                <SelectValue placeholder="Selecionar status" />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-lg shadow-lg min-w-[220px]">
                {statusOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Escalação */}
        <div>
          <label className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">
            Escalação
          </label>
          <Select
            value={filters.escalationStatus}
            onValueChange={(value) => onFiltersChange({ ...filters, escalationStatus: value })}
            data-testid="filter-escalation"
          >
            <SelectTrigger className="h-8 w-full border border-slate-200 rounded-lg bg-white px-3 text-sm text-slate-700 cursor-pointer hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200 focus:border-blue-400">
              <SelectValue placeholder="Filtrar por escalação" />
            </SelectTrigger>
            <SelectContent className="bg-white border border-slate-200 rounded-lg shadow-lg min-w-[220px]">
              <SelectItem value="all" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todos</SelectItem>
              <SelectItem value="pending" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Pendentes de Escalação</SelectItem>
              <SelectItem value="escalated" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Já Escalados</SelectItem>
              <SelectItem value="cancelado" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Cancelados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Linha 2: children (esquerda) + Toggle + Limpar (direita) */}
      <div className="flex items-end justify-between mt-4 pt-4 border-t border-slate-100 gap-4">
        {/* Slot de filtros extras (children) */}
        <div className="flex items-end gap-3 flex-1 flex-wrap">
          {children}
        </div>

        {/* Ações direita: extras + Toggle + Limpar — alinhados pela base do input */}
        <div className="flex items-end gap-3 shrink-0 pb-0.5">
          {rightActions}
          <label className="flex items-center gap-2 cursor-pointer select-none h-8">
            <Switch
              id="show-deleted"
              checked={filters.showDeleted || false}
              onCheckedChange={(checked) => onFiltersChange({ ...filters, showDeleted: checked })}
              data-testid="checkbox-show-deleted"
            />
            <span className="text-sm text-slate-500 whitespace-nowrap">Mostrar Excluídos</span>
          </label>

          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1.5 border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200 rounded-lg px-3 h-8 text-sm font-medium transition-colors bg-white"
            data-testid="button-clear-filters"
          >
            <X className="w-3.5 h-3.5" />
            Limpar
          </button>
        </div>
      </div>
    </div>
  );
}
