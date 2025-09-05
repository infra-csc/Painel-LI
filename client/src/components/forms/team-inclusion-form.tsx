import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Calendar, X } from "lucide-react";
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
import EventModal from "@/components/modals/event-modal";
import FunctionModal from "@/components/modals/function-modal";
import type { Event, Function } from "@shared/schema";

const teamInclusionSchema = z.object({
  eventId: z.string().min(1, "Evento é obrigatório"),
  functionId: z.string().min(1, "Função é obrigatória"),
  scheduleStartDate: z.string().optional(),
  scheduleEndDate: z.string().optional(),
  dailyRatesByDate: z.array(z.object({
    date: z.string(),
    dailyRates: z.number().min(1)
  })).optional(),
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
  const [dailyRatesByDate, setDailyRatesByDate] = useState<Array<{date: string, dailyRates: number}>>([]);
  const [showDateDetails, setShowDateDetails] = useState(false);
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
      scheduleStartDate: "",
      scheduleEndDate: "",
      dailyRatesByDate: [],
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
      // Create single entry with total daily rates
      const entries = [];
      
      if (dailyRatesByDate.length > 0) {
        // Sort dates chronologically
        const sortedDates = dailyRatesByDate
          .map(d => ({ date: d.date, dateObj: new Date(d.date), dailyRates: d.dailyRates }))
          .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

        // Check if all values are the same
        const allValues = sortedDates.map(entry => entry.dailyRates);
        const allEqual = allValues.every(val => val === allValues[0]);
        
        if (allEqual) {
          // All values are equal: create ONE record with total daily rates
          const startDate = sortedDates[0].date;
          const endDate = sortedDates[sortedDates.length - 1].date;
          const totalDailyRates = allValues.reduce((sum, val) => sum + val, 0);
          
          const payload = {
            ...data,
            scheduleStartDate: startDate,
            scheduleEndDate: endDate,
            dailyRates: totalDailyRates, // Sum of all values
            status: "planejado",
            phase: "inclusao",
            userId: user?.id,
          };
          delete payload.dailyRatesByDate;
          const response = await apiRequest("POST", "/api/team-inclusions", payload);
          entries.push(await response.json());
        } else {
          // Values are different: create records for unique values only
          const seenValues = new Set();
          
          for (let i = 0; i < sortedDates.length; i++) {
            const dailyRatesAtPosition = sortedDates[i].dailyRates;
            
            // Only create record if we haven't seen this value before
            if (!seenValues.has(dailyRatesAtPosition)) {
              seenValues.add(dailyRatesAtPosition);
              
              const startDate = sortedDates[i].date;
              const endDate = sortedDates[sortedDates.length - 1].date; // Always to the last date
              
              const payload = {
                ...data,
                scheduleStartDate: startDate,
                scheduleEndDate: endDate,
                dailyRates: dailyRatesAtPosition, // Use specific value at position i
                status: "planejado",
                phase: "inclusao",
                userId: user?.id,
              };
              delete payload.dailyRatesByDate;
              const response = await apiRequest("POST", "/api/team-inclusions", payload);
              entries.push(await response.json());
            }
          }
        }
      } else {
        // Single entry with date range
        let diffDays = 1;
        if (data.scheduleStartDate && data.scheduleEndDate) {
          const startDate = new Date(data.scheduleStartDate);
          const endDate = new Date(data.scheduleEndDate);
          const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
          diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }

        const payload = {
          ...data,
          dailyRates: diffDays,
          status: "planejado",
          phase: "inclusao",
          userId: user?.id,
        };
        delete payload.dailyRatesByDate;
        const response = await apiRequest("POST", "/api/team-inclusions", payload);
        entries.push(await response.json());
      }
      
      return entries;
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Nova escalação adicionada para o mesmo evento",
      });
      // Reset fields including clearing dates
      const currentEventId = form.getValues("eventId");
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
        scheduleStartDate: "",
        scheduleEndDate: "",
        dailyRatesByDate: [],
        needsTicket: currentNeedsTicket,
        ...currentFlightDates,
        observations: "",
      });
      
      // Clear local state
      setDailyRatesByDate([]);
      setShowDateDetails(false);
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

  const generateDateRange = () => {
    const startDate = form.getValues("scheduleStartDate");
    const endDate = form.getValues("scheduleEndDate");
    
    if (!startDate || !endDate) {
      toast({
        title: "Erro",
        description: "Selecione as datas de início e fim",
        variant: "destructive",
      });
      return;
    }
    
    const dates: Array<{date: string, dailyRates: number}> = [];
    
    // Função para adicionar um dia a uma data string YYYY-MM-DD
    const addDay = (dateStr: string): string => {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day); // mês é 0-based
      date.setDate(date.getDate() + 1);
      
      const newYear = date.getFullYear();
      const newMonth = String(date.getMonth() + 1).padStart(2, '0');
      const newDay = String(date.getDate()).padStart(2, '0');
      
      return `${newYear}-${newMonth}-${newDay}`;
    };
    
    // Gerar todas as datas do período (inclusive)
    let currentDate = startDate;
    
    while (currentDate <= endDate) {
      dates.push({ date: currentDate, dailyRates: 1 });
      
      if (currentDate === endDate) break;
      
      currentDate = addDay(currentDate);
    }
    
    setDailyRatesByDate(dates);
    setShowDateDetails(true);
  };

  const updateDailyRates = (index: number, dailyRates: number) => {
    const updated = [...dailyRatesByDate];
    updated[index].dailyRates = dailyRates;
    setDailyRatesByDate(updated);
  };

  const removeDateEntry = (index: number) => {
    const updated = dailyRatesByDate.filter((_, i) => i !== index);
    setDailyRatesByDate(updated);
    if (updated.length === 0) {
      setShowDateDetails(false);
    }
  };

  const formatDateForDisplay = (dateStr: string) => {
    // Não usar new Date() para evitar problemas de timezone
    // dateStr está no formato "YYYY-MM-DD"
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}`;
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

              <div className="space-y-4">
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
                
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={generateDateRange}
                    disabled={!form.watch('scheduleStartDate') || !form.watch('scheduleEndDate')}
                    data-testid="button-generate-dates"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Configurar Diárias por Data
                  </Button>
                  {showDateDetails && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setShowDateDetails(false);
                        setDailyRatesByDate([]);
                      }}
                      data-testid="button-clear-dates"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Usar Período Simples
                    </Button>
                  )}
                </div>
                
                {showDateDetails && dailyRatesByDate.length > 0 && (
                  <div className="bg-muted p-4 rounded-lg space-y-3">
                    <Label className="text-sm font-medium">Diárias por Data Específica:</Label>
                    <div className="grid gap-3 max-h-48 overflow-y-auto">
                      {dailyRatesByDate.map((entry, index) => (
                        <div key={entry.date} className="flex items-center gap-3 bg-background p-3 rounded border">
                          <span className="text-sm font-medium min-w-[60px]">
                            {formatDateForDisplay(entry.date)}
                          </span>
                          <Input
                            type="number"
                            min="1"
                            value={entry.dailyRates}
                            onChange={(e) => updateDailyRates(index, parseInt(e.target.value) || 1)}
                            className="w-20"
                            data-testid={`input-daily-rates-${index}`}
                          />
                          <span className="text-sm text-muted-foreground">diárias</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeDateEntry(index)}
                            data-testid={`button-remove-date-${index}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="text-sm text-muted-foreground pt-2 border-t">
                      Total: {dailyRatesByDate.reduce((sum, entry) => sum + entry.dailyRates, 0)} diárias 
                      em {dailyRatesByDate.length} {dailyRatesByDate.length === 1 ? 'linha' : 'linhas'} de escalação
                    </div>
                  </div>
                )}
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
