import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, Plus, Edit, Trash2 } from "lucide-react";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import EventModal from "@/components/modals/event-modal";
import type { Event } from "@shared/schema";
import { format } from "date-fns";

export default function Events() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  // Sort events by eventNumber descending (latest first)
  const sortedEvents = useMemo(() => {
    if (!events) return [];
    return [...events].sort((a, b) => b.eventNumber - a.eventNumber);
  }, [events]);

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
                      {sortedEvents.map((event) => {
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
                      {(!sortedEvents || sortedEvents.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            Nenhum evento cadastrado. Clique em "Novo Evento" para criar o primeiro.
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
