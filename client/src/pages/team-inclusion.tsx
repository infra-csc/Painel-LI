import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import GridTeamInclusionForm from "@/components/forms/grid-team-inclusion-form";
import TeamInclusionTable from "@/components/tables/team-inclusion-table";
import { useAuth } from "@/hooks/use-auth";
import { canView, canEdit } from "@/lib/permissions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, Calendar, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const eventSchema = z.object({
  name: z.string().min(1, "Nome do evento é obrigatório"),
  location: z.string().min(1, "Cidade é obrigatória"),
  startDate: z.string().min(1, "Data de início é obrigatória"),
  endDate: z.string().min(1, "Data de fim é obrigatória"),
  observations: z.string().optional(),
});

type EventFormData = z.infer<typeof eventSchema>;

export default function TeamInclusion() {
  const { user } = useAuth();
  const [showEventModal, setShowEventModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: "",
      location: "",
      startDate: "",
      endDate: "",
      observations: "",
    },
  });

  const createEventMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Evento criado",
        description: "O evento foi criado com sucesso!",
      });
      setShowEventModal(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/events'] });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: "Erro ao criar evento. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EventFormData) => {
    createEventMutation.mutate(data);
  };

  // Check if user can access this screen
  if (!canView(user as any, 'team_inclusion')) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Acesso Negado</h3>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta tela.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NavigationTabs activeTab="team-inclusion" />
        <WorkflowIndicator currentPhase="inclusao" />
        
        {/* Botão para criar evento - apenas para usuários com permissão de edição */}
        {canEdit(user as any, 'team_inclusion') && (
          <div className="mb-6">
            <Button 
              onClick={() => setShowEventModal(true)}
              className="gap-2"
              data-testid="button-create-event"
            >
              <PlusCircle className="h-4 w-4" />
              Criar Novo Evento
            </Button>
          </div>
        )}
        
        <div className="space-y-6">
          <GridTeamInclusionForm />
          <TeamInclusionTable />
        </div>

        {/* Modal para criar evento */}
        <Dialog open={showEventModal} onOpenChange={setShowEventModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Criar Novo Evento
              </DialogTitle>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Evento</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Ex: Festival de Inverno 2024" 
                          {...field}
                          data-testid="input-event-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        Cidade
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Ex: São Paulo - SP" 
                          {...field}
                          data-testid="input-event-city"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Início</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field}
                            data-testid="input-event-start-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Fim</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field}
                            data-testid="input-event-end-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="observations"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações (Opcional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Informações adicionais sobre o evento..."
                          {...field}
                          data-testid="textarea-event-observations"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowEventModal(false)}
                    data-testid="button-cancel-event"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={createEventMutation.isPending}
                    data-testid="button-save-event"
                  >
                    {createEventMutation.isPending ? "Criando..." : "Criar Evento"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        
      </div>
    </div>
  );
}
