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
import { Calendar, Plus, Save, Grid3x3 } from "lucide-react";
import type { Event, Function } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";

const gridFormSchema = z.object({
  eventId: z.string().min(1, "Evento é obrigatório"),
  functionId: z.string().min(1, "Função é obrigatória"),
  startDate: z.string().min(1, "Data inicial é obrigatória"),
  endDate: z.string().min(1, "Data final é obrigatória"),
});

type GridFormData = z.infer<typeof gridFormSchema>;

interface GridCell {
  date: string;
  dailyRate: number; // 1, 2, ou 3
}

interface ProcessedRange {
  functionId: string;
  dailyRate: number;
  startDate: string;
  endDate: string;
}

export default function GridTeamInclusionForm() {
  const [grid, setGrid] = useState<GridCell[]>([]);
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
      functionId: "",
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
      toast({
        title: "Sucesso",
        description: "Escalações criadas com sucesso",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao criar escalações",
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

    const cells: GridCell[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      cells.push({
        date: dateStr,
        dailyRate: 1, // valor padrão
      });
    }

    setGrid(cells);
    setShowGrid(true);
  };

  const updateCell = (index: number, value: number) => {
    const updated = [...grid];
    updated[index].dailyRate = value;
    setGrid(updated);
  };

  const formatDateForDisplay = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}`;
  };

  // Processa a grade para gerar ranges baseados em números consecutivos
  const processGrid = (): ProcessedRange[] => {
    const ranges: ProcessedRange[] = [];
    const { functionId } = form.getValues();

    if (grid.length === 0) return ranges;

    let currentRate = grid[0].dailyRate;
    let startDate = grid[0].date;
    let endDate = grid[0].date;

    for (let i = 1; i < grid.length; i++) {
      if (grid[i].dailyRate === currentRate) {
        // Mesmo número, continua o range
        endDate = grid[i].date;
      } else {
        // Número mudou, fecha o range atual
        ranges.push({
          functionId,
          dailyRate: currentRate,
          startDate,
          endDate,
        });

        // Inicia novo range
        currentRate = grid[i].dailyRate;
        startDate = grid[i].date;
        endDate = grid[i].date;
      }
    }

    // Adiciona o último range
    ranges.push({
      functionId,
      dailyRate: currentRate,
      startDate,
      endDate,
    });

    return ranges;
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
        description: "Configure a grade antes de salvar",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
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
          needsTicket: false,
          observations: `Grade: ${range.dailyRate} diária(s) do ${formatDateForDisplay(range.startDate)} ao ${formatDateForDisplay(range.endDate)}`,
        });
      }

      // Limpa o form após sucesso
      form.reset();
      setGrid([]);
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
          Escalação por Grade
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure uma grade de diárias por dia. Números iguais consecutivos viram um registro único.
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

            {/* Seleção de Função */}
            <FormField
              control={form.control}
              name="functionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Função *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-grid-function">
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
              Gerar Grade
            </Button>

            {/* Grade de Diárias */}
            {showGrid && (
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <Label className="text-sm font-medium mb-3 block">
                    Grade de Diárias (1, 2 ou 3 por dia)
                  </Label>
                  <div className="grid grid-cols-7 gap-2 max-h-60 overflow-y-auto">
                    {grid.map((cell, index) => (
                      <div key={index} className="text-center">
                        <div className="text-xs text-muted-foreground mb-1">
                          {formatDateForDisplay(cell.date)}
                        </div>
                        <Select
                          value={cell.dailyRate.toString()}
                          onValueChange={(value) => updateCell(index, parseInt(value))}
                        >
                          <SelectTrigger className="h-8 text-center">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Preview dos ranges processados */}
                <div className="border rounded-lg p-4 bg-muted/50">
                  <Label className="text-sm font-medium mb-3 block">
                    Resultado (será criado um registro para cada linha):
                  </Label>
                  <div className="space-y-2 text-sm">
                    {processGrid().map((range, index) => (
                      <div key={index} className="flex justify-between">
                        <span>
                          {functions?.find(f => f.id === range.functionId)?.name || 'Função'} | 
                          Diária {range.dailyRate}
                        </span>
                        <span>
                          {formatDateForDisplay(range.startDate)} - {formatDateForDisplay(range.endDate)}
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
                  {isProcessing ? "Criando Escalações..." : "Criar Escalações"}
                </Button>
              </div>
            )}
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}