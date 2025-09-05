import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, Save, Grid3x3 } from "lucide-react";
import type { Event, Function } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";

const gridFormSchema = z.object({
  eventId: z.string().min(1, "Evento é obrigatório"),
  startDate: z.string().min(1, "Data inicial é obrigatória"),
  endDate: z.string().min(1, "Data final é obrigatória"),
});

type GridFormData = z.infer<typeof gridFormSchema>;

interface FunctionRow {
  functionId: string;
  functionName: string;
  ida: string;
  chegada: string;
  retorno: string;
  horarioRetorno: string;
  dailyRates: { [date: string]: number }; // date -> daily rate (1, 2, or 3)
}

interface ProcessedRange {
  functionId: string;
  dailyRate: number;
  startDate: string;
  endDate: string;
  travelInfo: {
    ida: string;
    chegada: string;
    retorno: string;
    horarioRetorno: string;
  };
}

export default function GridTeamInclusionForm() {
  const [functionRows, setFunctionRows] = useState<FunctionRow[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [showGrid, setShowGrid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Check if user can edit this screen
  if (!hasPermission(user, 'canEditScreen1')) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <p className="text-muted-foreground text-center">Você não tem permissão para usar a escalação por grade.</p>
      </div>
    );
  }

  const form = useForm<GridFormData>({
    resolver: zodResolver(gridFormSchema),
    defaultValues: {
      eventId: "",
      startDate: "",
      endDate: "",
    },
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  const createTeamInclusionMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/team-inclusions", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao criar escalação",
        variant: "destructive",
      });
    },
  });

  const generateGrid = () => {
    const { startDate, endDate } = form.getValues();

    if (!startDate || !endDate) {
      toast({
        title: "Erro",
        description: "Selecione as datas de início e fim",
        variant: "destructive",
      });
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      toast({
        title: "Erro", 
        description: "Data inicial deve ser menor que a data final",
        variant: "destructive",
      });
      return;
    }

    // Gerar datas
    const datesList: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      datesList.push(dateStr);
    }

    // Criar linhas para cada função
    const rows: FunctionRow[] = (functions || []).map(func => {
      const dailyRates: { [date: string]: number } = {};
      datesList.forEach(date => {
        dailyRates[date] = 1; // valor padrão
      });

      return {
        functionId: func.id,
        functionName: func.name,
        ida: "none",
        chegada: "",
        retorno: "none",
        horarioRetorno: "",
        dailyRates,
      };
    });

    setDates(datesList);
    setFunctionRows(rows);
    setShowGrid(true);
  };

  const updateDailyRate = (functionId: string, date: string, value: number) => {
    setFunctionRows(prev => prev.map(row => 
      row.functionId === functionId 
        ? { ...row, dailyRates: { ...row.dailyRates, [date]: value } }
        : row
    ));
  };

  const updateTravelInfo = (functionId: string, field: string, value: string) => {
    setFunctionRows(prev => prev.map(row => 
      row.functionId === functionId 
        ? { ...row, [field]: value }
        : row
    ));
  };

  const formatDateForDisplay = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}`;
  };

  const processGrid = (): ProcessedRange[] => {
    const ranges: ProcessedRange[] = [];

    functionRows.forEach(row => {
      if (dates.length === 0) return;

      let currentRate = row.dailyRates[dates[0]];
      let startDate = dates[0];
      let endDate = dates[0];

      for (let i = 1; i < dates.length; i++) {
        const date = dates[i];
        if (row.dailyRates[date] === currentRate) {
          // Mesmo número, continua o range
          endDate = date;
        } else {
          // Número mudou, fecha o range atual
          ranges.push({
            functionId: row.functionId,
            dailyRate: currentRate,
            startDate,
            endDate,
            travelInfo: {
              ida: row.ida,
              chegada: row.chegada,
              retorno: row.retorno,
              horarioRetorno: row.horarioRetorno,
            },
          });

          // Inicia novo range
          currentRate = row.dailyRates[date];
          startDate = date;
          endDate = date;
        }
      }

      // Adiciona o último range
      ranges.push({
        functionId: row.functionId,
        dailyRate: currentRate,
        startDate,
        endDate,
        travelInfo: {
          ida: row.ida,
          chegada: row.chegada,
          retorno: row.retorno,
          horarioRetorno: row.horarioRetorno,
        },
      });
    });

    // Filtrar apenas ranges que têm alguma diária configurada
    return ranges.filter(range => range.dailyRate > 0);
  };

  const calculateDailyRates = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  const handleSubmit = async () => {
    const { eventId } = form.getValues();
    const ranges = processGrid();

    if (ranges.length === 0) {
      toast({
        title: "Erro",
        description: "Configure pelo menos uma escalação na grade",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      let successCount = 0;
      
      // Cria um team_inclusion para cada range processado
      for (const range of ranges) {
        const dailyRatesCount = calculateDailyRates(range.startDate, range.endDate);
        
        await createTeamInclusionMutation.mutateAsync({
          eventId,
          functionId: range.functionId,
          userId: user?.id,
          scheduleStartDate: range.startDate,
          scheduleEndDate: range.endDate,
          dailyRates: dailyRatesCount,
          dailyValue: range.dailyRate * 5000, // R$ 50,00 por diária como exemplo
          needsTicket: range.travelInfo.ida !== "" && range.travelInfo.ida !== "none" || range.travelInfo.retorno !== "" && range.travelInfo.retorno !== "none",
          observations: `Escalação por grade: ${range.dailyRate} diária(s) - ${formatDateForDisplay(range.startDate)} a ${formatDateForDisplay(range.endDate)}`,
        });
        
        successCount++;
      }

      toast({
        title: "Sucesso",
        description: `${successCount} escalação(ões) criada(s) com sucesso!`,
      });

      // Limpa o form após sucesso
      form.reset();
      setFunctionRows([]);
      setDates([]);
      setShowGrid(false);
      
    } catch (error) {
      // Error já tratado no mutation
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Grid3x3 className="w-5 h-5" />
          Escalação por Grade - Modelo Planilha
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure as diárias por função e data. Números consecutivos iguais se tornam um registro único.
        </p>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <div className="space-y-4">
            {/* Seleção de Evento */}
            <FormField
              control={form.control}
              name="eventId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Evento *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-grid-event">
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
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Datas */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Inicial *</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-grid-start-date"
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
                    <FormLabel>Data Final *</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-grid-end-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Botão para gerar grade */}
            <Button
              type="button"
              onClick={generateGrid}
              className="w-full"
              data-testid="button-generate-grid"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Gerar Grade de Funções
            </Button>

            {/* Grade de Escalação */}
            {showGrid && (
              <div className="space-y-4">
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left border-r font-medium min-w-32">Função</th>
                          <th className="px-3 py-2 text-center border-r font-medium w-20">Ida</th>
                          <th className="px-3 py-2 text-center border-r font-medium w-24">Chegada</th>
                          <th className="px-3 py-2 text-center border-r font-medium w-20">Retorno</th>
                          <th className="px-3 py-2 text-center border-r font-medium w-24">Horário</th>
                          {dates.map(date => (
                            <th key={date} className="px-2 py-2 text-center border-r font-medium w-16 bg-primary/10">
                              {formatDateForDisplay(date)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {functionRows.map(row => (
                          <tr key={row.functionId} className="border-t">
                            <td className="px-3 py-2 border-r font-medium bg-muted/30">
                              {row.functionName}
                            </td>
                            <td className="px-2 py-2 border-r">
                              <Select value={row.ida} onValueChange={(val) => updateTravelInfo(row.functionId, 'ida', val)}>
                                <SelectTrigger className="h-7">
                                  <SelectValue placeholder="---" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">---</SelectItem>
                                  <SelectItem value="sáb">sáb</SelectItem>
                                  <SelectItem value="sex">sex</SelectItem>
                                  <SelectItem value="qui">qui</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-2 border-r">
                              <Input 
                                value={row.chegada} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'chegada', e.target.value)}
                                placeholder="10h"
                                className="h-7 text-center"
                              />
                            </td>
                            <td className="px-2 py-2 border-r">
                              <Select value={row.retorno} onValueChange={(val) => updateTravelInfo(row.functionId, 'retorno', val)}>
                                <SelectTrigger className="h-7">
                                  <SelectValue placeholder="---" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">---</SelectItem>
                                  <SelectItem value="dom">dom</SelectItem>
                                  <SelectItem value="seg">seg</SelectItem>
                                  <SelectItem value="ter">ter</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-2 border-r">
                              <Input 
                                value={row.horarioRetorno} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'horarioRetorno', e.target.value)}
                                placeholder="14-18h"
                                className="h-7 text-center"
                              />
                            </td>
                            {dates.map(date => (
                              <td key={date} className="px-1 py-2 border-r text-center">
                                <Select
                                  value={row.dailyRates[date]?.toString() || "0"}
                                  onValueChange={(val) => updateDailyRate(row.functionId, date, parseInt(val))}
                                >
                                  <SelectTrigger className="h-7 w-12">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="0">-</SelectItem>
                                    <SelectItem value="1">1</SelectItem>
                                    <SelectItem value="2">2</SelectItem>
                                    <SelectItem value="3">3</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Preview dos resultados */}
                <div className="border rounded-lg p-4 bg-muted/50">
                  <Label className="text-sm font-medium mb-3 block">
                    Registros que serão criados ({processGrid().length}):
                  </Label>
                  <div className="space-y-1 text-xs max-h-32 overflow-y-auto">
                    {processGrid().map((range, index) => (
                      <div key={index} className="flex justify-between">
                        <span>
                          {functions?.find(f => f.id === range.functionId)?.name} - {range.dailyRate} diária(s)
                        </span>
                        <span>
                          {formatDateForDisplay(range.startDate)} a {formatDateForDisplay(range.endDate)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Botão para salvar */}
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isProcessing}
                  className="w-full"
                  data-testid="button-save-grid"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isProcessing ? "Criando Escalações..." : `Criar ${processGrid().length} Escalação(ões)`}
                </Button>
              </div>
            )}
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}