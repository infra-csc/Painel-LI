import GridTeamInclusionForm from "@/components/forms/grid-team-inclusion-form";
import TeamInclusionTable from "@/components/tables/team-inclusion-table";
import { useAuth } from "@/hooks/use-auth";
import { canView, canEdit } from "@/lib/permissions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, MapPin, Loader2 } from "lucide-react";
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
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Acesso Negado</h3>
        <p className="text-muted-foreground">Você não tem permissão para acessar esta tela.</p>
      </div>
    );
  }

  return (
    <>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[10px] bg-[#0033CC] flex items-center justify-center shrink-0"
            style={{ boxShadow: "0 4px 14px #0033CC50" }}
          >
            <span
              className="material-symbols-outlined text-white text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              group_add
            </span>
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-slate-900 leading-tight">Inclusão de Equipe</h1>
            <p className="text-xs text-slate-400 mt-0.5">Monte a grade de funções e gerencie as inclusões do evento</p>
          </div>
        </div>
        {canEdit(user as any, 'team_inclusion') && (
          <button
            onClick={() => setShowEventModal(true)}
            className="h-9 px-4 flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg transition-all"
            style={{ background: "#0033CC", boxShadow: "0 2px 8px #0033CC40" }}
            data-testid="button-create-event"
          >
            <Plus className="h-4 w-4" />
            Novo Evento
          </button>
        )}
      </div>

      <div className="space-y-6">
        <GridTeamInclusionForm />
        <TeamInclusionTable />
      </div>

      {/* Modal para criar evento */}
      <Dialog open={showEventModal} onOpenChange={setShowEventModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div
                className="w-9 h-9 rounded-[9px] bg-[#0033CC] flex items-center justify-center shrink-0"
                style={{ boxShadow: "0 4px 12px #0033CC40" }}
              >
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <DialogTitle className="text-[16px] font-bold text-slate-900">
                Criar Novo Evento
              </DialogTitle>
            </div>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-1">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Nome do Evento <span className="text-red-400">*</span></FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Ex: Festival de Inverno 2024" 
                        className="h-9"
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
                    <FormLabel className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Cidade <span className="text-red-400">*</span></FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Ex: São Paulo - SP"
                        className="h-9"
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
                      <FormLabel className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Início <span className="text-red-400">*</span></FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          className="h-9"
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
                      <FormLabel className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Fim <span className="text-red-400">*</span></FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          className="h-9"
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
                    <FormLabel className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Observações <span className="text-slate-300 normal-case font-normal">(opcional)</span></FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Informações adicionais sobre o evento..."
                        className="resize-none"
                        rows={3}
                        {...field}
                        data-testid="textarea-event-observations"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-2">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="h-9 px-4 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-gray-100 transition-colors bg-white"
                  data-testid="button-cancel-event"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createEventMutation.isPending}
                  className="h-9 px-5 text-sm font-semibold text-white rounded-lg flex items-center gap-2 transition-all disabled:opacity-60"
                  style={{ background: "#0033CC", boxShadow: "0 2px 8px #0033CC40" }}
                  data-testid="button-save-event"
                >
                  {createEventMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</>
                  ) : (
                    <><Calendar className="w-4 h-4" /> Criar Evento</>
                  )}
                </button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
