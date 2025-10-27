import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X, Search } from "lucide-react";
import CollaboratorCombobox from "@/components/ui/collaborator-combobox";
import EventCombobox from "@/components/ui/event-combobox";
import type { Event, Function, Collaborator } from "@shared/schema";

interface UniversalFiltersProps {
  filters: {
    eventId: string;
    functionId: string;
    collaboratorId: string;
    status?: string;
    escalationStatus: string;
    searchId: string;
  };
  onFiltersChange: (filters: any) => void;
  hideStatusFilter?: boolean;
}

export default function UniversalFilters({ filters, onFiltersChange, hideStatusFilter = false }: UniversalFiltersProps) {
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
    { value: "aprovado", label: "Aprovado" }
  ];


  const clearFilters = () => {
    const baseFilters: any = {
      eventId: "all",
      functionId: "all", 
      collaboratorId: "all",
      escalationStatus: "all",
      searchId: ""
    };
    
    if (!hideStatusFilter) {
      baseFilters.status = "all";
    }
    
    onFiltersChange(baseFilters);
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
            events={events}
            value={filters.eventId}
            onValueChange={(value) => onFiltersChange({ ...filters, eventId: value })}
            placeholder="Selecionar evento"
            testId="filter-event"
          />
        </div>

        <div className="flex-1 min-w-48">
          <label className="block text-sm font-medium text-foreground mb-1">
            Função
          </label>
          <Select 
            value={filters.functionId} 
            onValueChange={(value) => onFiltersChange({ ...filters, functionId: value })}
            data-testid="filter-function"
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar função" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Funções</SelectItem>
              {functions?.map((func) => (
                <SelectItem key={func.id} value={func.id}>
                  {func.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

        {!hideStatusFilter && (
          <div className="flex-1 min-w-48">
            <label className="block text-sm font-medium text-foreground mb-1">
              Status
            </label>
            <Select 
              value={filters.status} 
              onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
              data-testid="filter-status"
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex-1 min-w-48">
          <label className="block text-sm font-medium text-foreground mb-1">
            Escalação
          </label>
          <Select 
            value={filters.escalationStatus} 
            onValueChange={(value) => onFiltersChange({ ...filters, escalationStatus: value })}
            data-testid="filter-escalation"
          >
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por escalação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendentes de Escalação</SelectItem>
              <SelectItem value="escalated">Já Escalados</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
            </SelectContent>
          </Select>
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