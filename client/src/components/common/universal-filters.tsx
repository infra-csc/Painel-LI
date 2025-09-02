import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { Event, Function, Collaborator } from "@shared/schema";

interface UniversalFiltersProps {
  filters: {
    eventId: string;
    functionId: string;
    collaboratorId: string;
    hasTicket: string;
  };
  onFiltersChange: (filters: any) => void;
}

export default function UniversalFilters({ filters, onFiltersChange }: UniversalFiltersProps) {
  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  const { data: collaborators } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborators"],
  });

  const ticketOptions = [
    { value: "all", label: "Todos" },
    { value: "with", label: "Com Passagem" },
    { value: "without", label: "Sem Passagem" }
  ];

  const clearFilters = () => {
    onFiltersChange({
      eventId: "all",
      functionId: "all", 
      collaboratorId: "all",
      hasTicket: "all"
    });
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-4 mb-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-48">
          <label className="block text-sm font-medium text-foreground mb-1">
            Evento
          </label>
          <Select 
            value={filters.eventId} 
            onValueChange={(value) => onFiltersChange({ ...filters, eventId: value })}
            data-testid="filter-event"
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar evento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Eventos</SelectItem>
              {events?.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Select 
            value={filters.collaboratorId} 
            onValueChange={(value) => onFiltersChange({ ...filters, collaboratorId: value })}
            data-testid="filter-collaborator"
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar colaborador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Colaboradores</SelectItem>
              {collaborators?.map((collaborator) => (
                <SelectItem key={collaborator.id} value={collaborator.id}>
                  {collaborator.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-48">
          <label className="block text-sm font-medium text-foreground mb-1">
            Passagem
          </label>
          <Select 
            value={filters.hasTicket} 
            onValueChange={(value) => onFiltersChange({ ...filters, hasTicket: value })}
            data-testid="filter-ticket"
          >
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por passagem" />
            </SelectTrigger>
            <SelectContent>
              {ticketOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
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