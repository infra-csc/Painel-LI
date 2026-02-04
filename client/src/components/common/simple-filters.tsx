import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
}

export default function SimpleFilters({ filters, onFiltersChange }: SimpleFiltersProps) {
  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  const { data: collaborators } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborators"],
  });

  const clearFilters = () => {
    onFiltersChange({
      eventId: "all",
      functionId: [], 
      collaboratorId: "all",
      searchId: ""
    });
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-4 mb-6">
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex-1 min-w-64">
          <label className="block text-sm font-medium text-foreground mb-1">
            Buscar por ID
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar por número..."
              value={filters.searchId}
              onChange={(e) => onFiltersChange({ ...filters, searchId: e.target.value })}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="input-search-id"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-48">
          <label className="block text-sm font-medium text-foreground mb-1">
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

        <div className="flex-1 min-w-48">
          <label className="block text-sm font-medium text-foreground mb-1">
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

        <div className="flex-1 min-w-48">
          <label className="block text-sm font-medium text-foreground mb-1">
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

        <div className="flex items-end">
          <Button 
            variant="outline" 
            onClick={clearFilters}
            className="flex items-center gap-2"
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