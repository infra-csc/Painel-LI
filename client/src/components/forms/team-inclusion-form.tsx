import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { getAvailableAreas } from "@/lib/role-utils";
import EventModal from "@/components/modals/event-modal";
import FunctionModal from "@/components/modals/function-modal";
import type { Event, Function } from "@shared/schema";

const teamInclusionSchema = z.object({
  eventId: z.string().min(1, "Evento é obrigatório"),
  functionId: z.string().min(1, "Função é obrigatória"),
  area: z.string().optional(),
  scheduleStartDate: z.string().min(1, "Data de início é obrigatória"),
  scheduleEndDate: z.string().min(1, "Data de fim é obrigatória"),
  dailyValue: z.number().optional(),
  needsTicket: z.boolean().default(false),
  flightDepartureDate: z.string().optional(),
  flightDepartureSuggestedTime: z.string().optional(),
  flightReturnDate: z.string().optional(),
  flightReturnSuggestedTime: z.string().optional(),
  observations: z.string().optional(),
});

type TeamInclusionFormData = z.infer<typeof teamInclusionSchema>;

export default function TeamInclusionForm() {
  const [showEventModal, setShowEventModal] = useState(false);
  const [showFunctionModal, setShowFunctionModal] = useState(false);
  const [isAddingEscalation, setIsAddingEscalation] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Check if user can edit this screen
  if (!hasPermission(user, 'canEditScreen1')) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <p className="text-muted-foreground text-center">Você não tem permissão para cadastrar registros nesta tela.</p>
      </div>
    );
  }

  const form = useForm<TeamInclusionFormData>({
    resolver: zodResolver(teamInclusionSchema),
    defaultValues: {
      eventId: "",
      functionId: "",
      area: "",
      scheduleStartDate: "",
      scheduleEndDate: "",
      dailyValue: undefined,
      needsTicket: false,
      flightDepartureDate: "",
      flightDepartureSuggestedTime: "",
      flightReturnDate: "",
      flightReturnSuggestedTime: "",
      observations: "",
    },
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  const createTeamInclusionMutation = useMutation({
    mutationFn: async (data: TeamInclusionFormData) => {
      // Calculate daily rates
      const startDate = new Date(data.scheduleStartDate);
      const endDate = new Date(data.scheduleEndDate);
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      const payload = {
        ...data,
        dailyRates: diffDays,
        dailyValue: (data.dailyValue || 0) * 100, // Convert to cents
        status: "planejado",
        phase: "inclusao",
      };

      const response = await apiRequest("POST", "/api/team-inclusions", payload);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Nova escalação adicionada para o mesmo evento",
      });
      // Reset only specific fields, keep event data
      const currentEventId = form.getValues("eventId");
      const currentArea = form.getValues("area");
      const currentNeedsTicket = form.getValues("needsTicket");
      const currentFlightDates = {
        flightDepartureDate: form.getValues("flightDepartureDate"),
        flightReturnDate: form.getValues("flightReturnDate"),
        flightDepartureSuggestedTime: form.getValues("flightDepartureSuggestedTime"),
        flightReturnSuggestedTime: form.getValues("flightReturnSuggestedTime")
      };
      
      form.reset({
        eventId: currentEventId,
        functionId: "",
        area: currentArea,
        scheduleStartDate: "",
        scheduleEndDate: "",
        dailyValue: undefined,
        needsTicket: currentNeedsTicket,
        ...currentFlightDates,
        observations: "",
      });
      setIsAddingEscalation(false);
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao criar inclusão de equipe",
        variant: "destructive",
      });
    },
  });

  const onAddEscalation = (data: TeamInclusionFormData) => {
    setIsAddingEscalation(true);
    createTeamInclusionMutation.mutate(data);
  };

  const calculateDailyRates = () => {
    const startDate = form.watch("scheduleStartDate");
    const endDate = form.watch("scheduleEndDate");
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return diffDays;
    }
    return 0;
  };

  return (
    <>
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-6">Inclusão de Equipe</h3>
        
        <Form {...form}>
          <form className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="eventId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Evento *</FormLabel>
                    <div className="relative">
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-event">
                            <SelectValue placeholder="Selecione um evento" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {events?.map((event) => (
                            <SelectItem key={event.id} value={event.id}>
                              {event.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="absolute right-8 top-1/2 transform -translate-y-1/2 p-1 h-auto"
                        onClick={() => setShowEventModal(true)}
                        data-testid="button-add-event"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="functionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Função *</FormLabel>
                    <div className="relative">
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-function">
                            <SelectValue placeholder="Selecione uma função" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {functions?.map((func) => (
                            <SelectItem key={func.id} value={func.id}>
                              {func.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="absolute right-8 top-1/2 transform -translate-y-1/2 p-1 h-auto"
                        onClick={() => setShowFunctionModal(true)}
                        data-testid="button-add-function"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="scheduleStartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data Início da Escala *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-start-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="scheduleEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data Fim da Escala *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-end-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="area"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Área</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Digite uma área (ex: Som, Iluminação, Cenografia...)"
                        {...field}
                        data-testid="input-area"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dailyValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor da Diária (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="Digite o valor (ex: 150.00)"
                          value={field.value ? field.value.toString() : ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Remove leading zeros but preserve decimal part
                            const numericValue = value === '' ? undefined : parseFloat(value);
                            field.onChange(numericValue);
                          }}
                          data-testid="input-daily-value"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="bg-muted p-4 rounded-lg">
                  <Label className="block text-sm font-medium text-foreground mb-2">Quantidade de Diárias</Label>
                  <div className="text-lg font-semibold text-primary" data-testid="text-daily-rates">
                    {calculateDailyRates()} diárias
                  </div>
                </div>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <Label className="block text-sm font-medium text-foreground mb-2">Valor Total Estimado</Label>
                <div className="text-lg font-semibold text-primary" data-testid="text-total-value">
                  R$ {((form.watch('dailyValue') || 0) * calculateDailyRates()).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <FormField
                control={form.control}
                name="needsTicket"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between mb-2">
                      <FormLabel>Precisa de Passagem?</FormLabel>
                      <RadioGroup
                        value={field.value ? "sim" : "nao"}
                        onValueChange={(value) => field.onChange(value === "sim")}
                        className="flex items-center space-x-3"
                        data-testid="radio-needs-ticket"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="sim" id="sim" />
                          <Label htmlFor="sim" className="text-sm">Sim</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="nao" id="nao" />
                          <Label htmlFor="nao" className="text-sm">Não</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="flightDepartureDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data Voo Ida</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-departure-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="flightDepartureSuggestedTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sugestão Ida</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="Ex: Preferencialmente pela manhã, após 10h..." {...field} data-testid="input-departure-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="flightReturnDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data Voo Volta</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-return-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="flightReturnSuggestedTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sugestão Volta</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="Ex: Final da tarde, evitar horário de pico..." {...field} data-testid="input-return-time" />
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
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Informações adicionais sobre a inclusão..."
                        {...field}
                        data-testid="textarea-observations"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="lg:col-span-2 flex justify-end space-x-3 pt-4 border-t border-border">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => form.reset()}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button 
                type="button" 
                onClick={form.handleSubmit(onAddEscalation)}
                disabled={createTeamInclusionMutation.isPending}
                data-testid="button-add-escalation"
              >
                <Plus className="w-4 h-4 mr-2" />
                {createTeamInclusionMutation.isPending ? "Adicionando..." : "Adicionar Escalação"}
              </Button>
            </div>
          </form>
        </Form>
      </div>

      <EventModal 
        open={showEventModal} 
        onClose={() => setShowEventModal(false)} 
      />
      <FunctionModal 
        open={showFunctionModal} 
        onClose={() => setShowFunctionModal(false)} 
      />
    </>
  );
}
