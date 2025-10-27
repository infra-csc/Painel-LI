import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, Plus, Edit, Trash2, Search, X } from "lucide-react";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import EventModal from "@/components/modals/event-modal";
import type { Event } from "@shared/schema";
import { format } from "date-fns";

export default function Events() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  // Filter and sort events
  const filteredAndSortedEvents = useMemo(() => {
    if (!events) return [];
    
    let filtered = [...events];
    
    // Apply search filter (by name)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(event => 
        event.name.toLowerCase().includes(term) ||
        event.location.toLowerCase().includes(term)
      );
    }
    
    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(event => {
        const eventStatus = getEventStatus(event);
        return eventStatus === statusFilter;
      });
    }
    
    // Apply date filters - show events that occur within the selected date range
    // An event is shown if it overlaps with the filter range
    if (startDateFilter || endDateFilter) {
      filtered = filtered.filter(event => {
        const eventStartDate = new Date(event.startDate);
        const eventEndDate = new Date(event.endDate);
        eventStartDate.setHours(0, 0, 0, 0);
        eventEndDate.setHours(0, 0, 0, 0);
        
        // If only start date is set, show events that end on or after this date
        if (startDateFilter && !endDateFilter) {
          const filterStartDate = new Date(startDateFilter);
          filterStartDate.setHours(0, 0, 0, 0);
          return eventEndDate >= filterStartDate;
        }
        
        // If only end date is set, show events that start on or before this date
        if (!startDateFilter && endDateFilter) {
          const filterEndDate = new Date(endDateFilter);
          filterEndDate.setHours(0, 0, 0, 0);
          return eventStartDate <= filterEndDate;
        }
        
        // If both dates are set, show events that overlap with the range
        if (startDateFilter && endDateFilter) {
          const filterStartDate = new Date(startDateFilter);
          const filterEndDate = new Date(endDateFilter);
          filterStartDate.setHours(0, 0, 0, 0);
          filterEndDate.setHours(0, 0, 0, 0);
          // Event overlaps if: event ends >= filter start AND event starts <= filter end
          return eventEndDate >= filterStartDate && eventStartDate <= filterEndDate;
        }
        
        return true;
      });
    }
    
    // Sort by eventNumber descending (latest first)
    return filtered.sort((a, b) => b.eventNumber - a.eventNumber);
  }, [events, searchTerm, statusFilter, startDateFilter, endDateFilter]);

  const deleteEventMutation = useMutation({
    mutationFn: async (eventToDelete: Event) => {
      // Soft delete - update status to "excluído"
      const response = await apiRequest("PUT", `/api/events/${eventToDelete.id}`, {
        status: "excluído",
      });
      return response.json();
    },
    onSuccess: async () => {
      // Force refetch to ensure UI updates
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      await queryClient.refetchQueries({ queryKey: ["/api/events"] });
      toast({
        title: "Sucesso",
        description: "Evento marcado como excluído com sucesso!",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao marcar evento como excluído.",
        variant: "destructive",
      });
    },
  });

  const handleOpenModal = (event?: Event) => {
    if (event) {
      setEditingEvent(event);
    } else {
      setEditingEvent(null);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingEvent(null);
  };

  const handleDelete = (event: Event) => {
    if (confirm(`Tem certeza que deseja marcar o evento "${event.name}" como excluído? O evento continuará visível na lista.`)) {
      deleteEventMutation.mutate(event);
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case "planejado":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "concluído":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "excluído":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const getEventStatus = (event: Event): string => {
    // If already excluded, keep as excluded
    if (event.status === "excluído") {
      return "excluído";
    }
    
    // Check if event has ended (endDate has passed)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(event.endDate);
    endDate.setHours(0, 0, 0, 0);
    
    if (endDate < today) {
      return "concluído";
    }
    
    return event.status;
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy");
    } catch {
      return dateString;
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setStartDateFilter("");
    setEndDateFilter("");
  };

  const hasActiveFilters = searchTerm || statusFilter !== "all" || startDateFilter || endDateFilter;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NavigationTabs activeTab="events" />
        <WorkflowIndicator currentPhase="configuracao" />

        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Gerenciamento de Eventos
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Gerencie os eventos do sistema
                  </p>
                </div>
                <Button onClick={() => handleOpenModal()} data-testid="button-add-event">
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Evento
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters Section */}
              <div className="mb-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Search by name */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-event"
                    />
                  </div>

                  {/* Status filter */}
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger data-testid="select-status-filter">
                      <SelectValue placeholder="Todos os status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      <SelectItem value="planejado">Planejado</SelectItem>
                      <SelectItem value="concluído">Concluído</SelectItem>
                      <SelectItem value="excluído">Excluído</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Start date filter */}
                  <div>
                    <Input
                      type="date"
                      placeholder="Data início (de)"
                      value={startDateFilter}
                      onChange={(e) => setStartDateFilter(e.target.value)}
                      data-testid="input-start-date-filter"
                    />
                  </div>

                  {/* End date filter */}
                  <div>
                    <Input
                      type="date"
                      placeholder="Data fim (até)"
                      value={endDateFilter}
                      onChange={(e) => setEndDateFilter(e.target.value)}
                      data-testid="input-end-date-filter"
                    />
                  </div>
                </div>

                {/* Clear filters button */}
                {hasActiveFilters && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {filteredAndSortedEvents.length} evento(s) encontrado(s)
                    </p>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={clearFilters}
                      data-testid="button-clear-filters"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Limpar filtros
                    </Button>
                  </div>
                )}
              </div>

              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Carregando eventos...
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nº</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Local</TableHead>
                        <TableHead>Data Início</TableHead>
                        <TableHead>Data Fim</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedEvents.map((event) => {
                        const displayStatus = getEventStatus(event);
                        return (
                          <TableRow key={event.id} className={displayStatus === "excluído" ? "opacity-60" : ""}>
                            <TableCell className="font-medium">{event.eventNumber}</TableCell>
                            <TableCell>{event.name}</TableCell>
                            <TableCell>{event.location}</TableCell>
                            <TableCell>{formatDate(event.startDate)}</TableCell>
                            <TableCell>{formatDate(event.endDate)}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeStyle(displayStatus)}`}>
                                {displayStatus}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-2 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenModal(event)}
                                  disabled={displayStatus === "excluído"}
                                  data-testid={`button-edit-event-${event.id}`}
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDelete(event)}
                                  disabled={displayStatus === "excluído"}
                                  className="text-destructive hover:text-destructive"
                                  data-testid={`button-delete-event-${event.id}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {(!filteredAndSortedEvents || filteredAndSortedEvents.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            {hasActiveFilters 
                              ? "Nenhum evento encontrado com os filtros aplicados."
                              : "Nenhum evento cadastrado. Clique em 'Novo Evento' para criar o primeiro."
                            }
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <EventModal 
        open={isModalOpen} 
        onClose={handleCloseModal} 
        event={editingEvent}
      />
    </div>
  );
}
