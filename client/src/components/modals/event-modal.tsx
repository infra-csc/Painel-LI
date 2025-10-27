import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Event } from "@shared/schema";
import { useEffect } from "react";

const eventSchema = z.object({
  name: z.string().min(1, "Nome do evento é obrigatório"),
  location: z.string().min(1, "Local é obrigatório"),
  startDate: z.string().min(1, "Data de início é obrigatória"),
  endDate: z.string().min(1, "Data de fim é obrigatória"),
  status: z.enum(["planejado", "concluído", "excluído"]).optional(),
  observations: z.string().optional(),
}).refine((data) => {
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  return endDate >= startDate;
}, {
  message: "Data de fim deve ser maior ou igual à data de início",
  path: ["endDate"],
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventModalProps {
  open: boolean;
  onClose: () => void;
  event?: Event | null;
}

export default function EventModal({ open, onClose, event }: EventModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!event;

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: "",
      location: "",
      startDate: "",
      endDate: "",
      status: "planejado",
      observations: "",
    },
  });

  useEffect(() => {
    if (event) {
      form.reset({
        name: event.name,
        location: event.location,
        startDate: event.startDate,
        endDate: event.endDate,
        status: event.status as "planejado" | "concluído" | "excluído",
        observations: event.observations || "",
      });
    } else {
      form.reset({
        name: "",
        location: "",
        startDate: "",
        endDate: "",
        status: "planejado",
        observations: "",
      });
    }
  }, [event, form]);

  const saveEventMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      if (isEditing && event) {
        const response = await apiRequest("PUT", `/api/events/${event.id}`, data);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/events", data);
        return response.json();
      }
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: isEditing ? "Evento atualizado com sucesso" : "Evento criado com sucesso",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || `Erro ao ${isEditing ? 'atualizar' : 'criar'} evento. Tente novamente.`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EventFormData) => {
    saveEventMutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" data-testid="modal-event">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Evento' : 'Adicionar Novo Evento'}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Evento *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ex: Rock in Rio 2024" 
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
                  <FormLabel>Local *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ex: Rio de Janeiro" 
                      {...field}
                      data-testid="input-event-location"
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
                    <FormLabel>Data Início *</FormLabel>
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
                    <FormLabel>Data Fim *</FormLabel>
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
            
            {isEditing && (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-event-status">
                          <SelectValue placeholder="Selecione o status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="planejado">Planejado</SelectItem>
                        <SelectItem value="concluído">Concluído</SelectItem>
                        <SelectItem value="excluído">Excluído</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            <FormField
              control={form.control}
              name="observations"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea 
                      rows={3}
                      placeholder="Informações adicionais sobre o evento..."
                      {...field}
                      data-testid="textarea-event-observations"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose}
                data-testid="button-cancel-event"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={saveEventMutation.isPending}
                data-testid="button-save-event"
              >
                {saveEventMutation.isPending ? "Salvando..." : isEditing ? "Atualizar Evento" : "Salvar Evento"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
