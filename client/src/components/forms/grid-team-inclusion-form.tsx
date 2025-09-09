import { useState, useEffect, useRef } from "react";
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
import { Calendar, Save, Grid3x3, Plus, Trash2, Ticket, Copy, MoreHorizontal, HelpCircle, Download, Upload } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Event, Function, User } from "@shared/schema";
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
  needsTicket: boolean; // se precisa de passagem
  dailyRates: { [date: string]: number }; // date -> daily rate (1, 2, or 3)
  isCustom: boolean; // se é uma função adicionada dinamicamente
}

interface ProcessedRange {
  functionId: string;
  dailyRate: number;
  dailyRatePerDay: number; // Quantas diárias por dia (para observação correta)
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
  const [showFunctionSelect, setShowFunctionSelect] = useState(false);
  const [copiedValue, setCopiedValue] = useState<number | null>(null);
  const [focusedCell, setFocusedCell] = useState<{functionId: string, date: string} | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [showEventSelect, setShowEventSelect] = useState(false);
  const [copiedSchedule, setCopiedSchedule] = useState<{ida: string, chegada: string, retorno: string, horarioRetorno: string, needsTicket: boolean} | null>(null);
  const [templateLoaded, setTemplateLoaded] = useState<boolean>(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const gridRef = useRef<HTMLDivElement>(null);

  // Keyboard event handler for copy/paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c' && focusedCell) {
          e.preventDefault();
          const row = functionRows.find(r => r.functionId === focusedCell.functionId);
          if (row) {
            const value = row.dailyRates[focusedCell.date] || 0;
            copyValue(value);
          }
        } else if (e.key === 'v' && focusedCell && copiedValue !== null) {
          e.preventDefault();
          pasteValue(focusedCell.functionId, focusedCell.date);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [focusedCell, copiedValue, functionRows]);

  // Auto-save functionality
  useEffect(() => {
    if (autoSave && functionRows.length > 0) {
      const timeoutId = setTimeout(() => {
        localStorage.setItem('grid-auto-save', JSON.stringify({
          functionRows,
          dates,
          timestamp: Date.now()
        }));
      }, 2000); // Auto-save after 2 seconds of inactivity

      return () => clearTimeout(timeoutId);
    }
  }, [functionRows, dates, autoSave]);

  // Função para salvar rascunho manualmente
  const saveDraft = () => {
    if (functionRows.length > 0) {
      localStorage.setItem('grid-draft-save', JSON.stringify({
        functionRows,
        dates,
        eventId: form.getValues().eventId,
        timestamp: Date.now()
      }));
      toast({
        title: "Rascunho salvo",
        description: "Dados da planilha salvos com sucesso!",
      });
    } else {
      toast({
        title: "Nada para salvar",
        description: "Adicione funções à grade primeiro.",
        variant: "destructive",
      });
    }
  };

  // Função para carregar rascunho salvo
  const loadDraft = () => {
    const draftSaved = localStorage.getItem('grid-draft-save');
    const autoSaved = localStorage.getItem('grid-auto-save');
    
    // Priorizar rascunho manual sobre auto-save
    const savedData = draftSaved || autoSaved;
    
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        // Carregar rascunho manual (sem limite de tempo) ou auto-save (com limite de 1 hora)
        const isValidData = draftSaved || (Date.now() - data.timestamp < 3600000);
        
        if (isValidData && data.functionRows && data.functionRows.length > 0) {
          setFunctionRows(data.functionRows || []);
          setDates(data.dates || []);
          setShowGrid(true); // Mostrar planilha automaticamente
          
          // Carregar dados do evento se salvo
          if (data.eventId) {
            form.setValue('eventId', data.eventId);
          }
          
          toast({
            title: "Rascunho carregado",
            description: `Dados restaurados de ${draftSaved ? 'rascunho salvo' : 'auto-save'}`
          });
          
          return true;
        }
      } catch (e) {
        console.error('Error loading saved data:', e);
      }
    }
    return false;
  };

  // Carregar rascunho automaticamente
  useEffect(() => {
    loadDraft();
  }, []);

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

  // Query para eventos que têm escalações salvas (para template)
  const { data: eventsWithInclusions } = useQuery<Event[]>({
    queryKey: ["/api/events-with-inclusions"],
    queryFn: async () => {
      const response = await fetch('/api/events-with-inclusions');
      if (!response.ok) throw new Error('Failed to fetch events with inclusions');
      return response.json();
    }
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  const { data: collaborators } = useQuery<User[]>({
    queryKey: ["/api/collaborators"],
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

    // Se há template carregado, usar APENAS essas funções
    let rows: FunctionRow[] = [];
    
    if (templateLoaded && functionRows.length > 0) {
      // Usar template carregado - aplicar nos novos dates
      rows = functionRows.map(templateFunc => {
        const dailyRates: { [date: string]: number } = {};
        
        datesList.forEach(date => {
          // Aplicar valor padrão do template
          dailyRates[date] = (templateFunc as any)?.defaultDailyRate || 1;
        });

        return {
          ...templateFunc, // Preserva ida, chegada, retorno, horarioRetorno, needsTicket
          dailyRates, // Aplica nas novas datas
        };
      });
      
      // Limpar flag do template
      setTemplateLoaded(false);
    } else {
      // Grade nova - começar com campos VAZIOS
      rows = (functions || []).sort((a, b) => a.name.localeCompare(b.name)).map(func => {
        const dailyRates: { [date: string]: number } = {};
        
        datesList.forEach(date => {
          // Grade nova = sem valores (0 = célula vazia)
          dailyRates[date] = 0;
        });

        return {
          functionId: func.id,
          functionName: func.name,
          ida: "", // Vazio para grade nova
          chegada: "", // Vazio para grade nova
          retorno: "", // Vazio para grade nova
          horarioRetorno: "", // Vazio para grade nova
          needsTicket: false, // Desmarcado para grade nova
          dailyRates,
          isCustom: false,
        };
      });
    }

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

  const updateNeedsTicket = (functionId: string, needsTicket: boolean) => {
    setFunctionRows(prev => prev.map(row => 
      row.functionId === functionId 
        ? { ...row, needsTicket }
        : row
    ));
  };


  const addSystemFunction = (functionId: string) => {
    const selectedFunction = functions?.find(f => f.id === functionId);
    if (!selectedFunction) return;

    const dailyRates: { [date: string]: number } = {};
    dates.forEach(date => {
      dailyRates[date] = 1;
    });

    // Criar ID único para permitir múltiplas instâncias da mesma função
    const uniqueId = `${selectedFunction.id}-${Date.now()}`;

    const newRow: FunctionRow = {
      functionId: uniqueId,
      functionName: selectedFunction.name,
      ida: "",
      chegada: "",
      retorno: "",
      horarioRetorno: "",
      needsTicket: false,
      dailyRates,
      isCustom: false,
    };

    setFunctionRows(prev => [...prev, newRow]);
    setShowFunctionSelect(false);

    toast({
      title: "Função adicionada",
      description: `${selectedFunction.name} adicionada à grade`,
    });
  };

  const openFunctionSelect = () => {
    setShowFunctionSelect(true);
  };

  const copyValue = (value: number) => {
    setCopiedValue(value);
    toast({
      title: "Valor copiado",
      description: `Valor ${value} copiado. Use Ctrl+V para colar.`,
    });
  };

  const pasteValue = (functionId: string, date: string) => {
    if (copiedValue !== null) {
      updateDailyRate(functionId, date, copiedValue);
      toast({
        title: "Valor colado",
        description: `Valor ${copiedValue} colado com sucesso.`,
      });
    }
  };

  const fillAllDates = (functionId: string, value: number) => {
    setFunctionRows(prev => prev.map(row => 
      row.functionId === functionId 
        ? { 
            ...row, 
            dailyRates: dates.reduce((acc, date) => ({ ...acc, [date]: value }), {})
          }
        : row
    ));
    toast({
      title: "Valores preenchidos",
      description: `Todas as datas preenchidas com valor ${value}.`,
    });
  };

  const duplicateFunction = (functionId: string) => {
    const originalRow = functionRows.find(row => row.functionId === functionId);
    if (!originalRow) return;

    const newRow: FunctionRow = {
      ...originalRow,
      functionId: `${originalRow.functionId}-copy-${Date.now()}`,
    };

    setFunctionRows(prev => [...prev, newRow]);
    toast({
      title: "Função duplicada",
      description: `Função ${originalRow.functionName} duplicada com sucesso.`,
    });
  };

  const duplicateScheduleOnly = (functionId: string) => {
    const originalRow = functionRows.find(row => row.functionId === functionId);
    if (!originalRow) return;
    
    setSelectedRowForScheduleCopy(originalRow);
    setShowFunctionSelectForSchedule(true);
  };

  // Copiar horários para uso em outras funções existentes
  const copyScheduleData = (functionId: string) => {
    const row = functionRows.find(r => r.functionId === functionId);
    if (!row) return;
    
    setCopiedSchedule({
      ida: row.ida,
      chegada: row.chegada,
      retorno: row.retorno,
      horarioRetorno: row.horarioRetorno,
      needsTicket: row.needsTicket
    });
    
    toast({
      title: "Horários copiados",
      description: `Horários de ${row.functionName} copiados para uso em outras funções.`,
    });
  };

  // Colar horários em uma função existente
  const pasteScheduleData = (functionId: string) => {
    if (!copiedSchedule) return;
    
    const row = functionRows.find(r => r.functionId === functionId);
    if (!row) return;
    
    setFunctionRows(prev => prev.map(r => 
      r.functionId === functionId 
        ? { 
            ...r, 
            ida: copiedSchedule.ida,
            chegada: copiedSchedule.chegada,
            retorno: copiedSchedule.retorno,
            horarioRetorno: copiedSchedule.horarioRetorno,
            needsTicket: copiedSchedule.needsTicket
          }
        : r
    ));
    
    toast({
      title: "Horários colados",
      description: `Horários colados em ${row.functionName} com sucesso.`,
    });
  };

  const [selectedRowForScheduleCopy, setSelectedRowForScheduleCopy] = useState<FunctionRow | null>(null);
  const [showFunctionSelectForSchedule, setShowFunctionSelectForSchedule] = useState(false);

  const createRowWithCopiedSchedule = (newFunctionId: string) => {
    if (!selectedRowForScheduleCopy) return;
    
    const selectedFunction = functions?.find(f => f.id === newFunctionId);
    if (!selectedFunction) return;

    // Criar nova linha com os horários copiados mas função diferente
    const dailyRates: { [date: string]: number } = {};
    dates.forEach(date => {
      dailyRates[date] = 1; // Valores padrão, não copia as diárias
    });

    // Criar ID único para permitir múltiplas instâncias
    const uniqueId = `${selectedFunction.id}-${Date.now()}`;

    const newRow: FunctionRow = {
      functionId: uniqueId,
      functionName: selectedFunction.name,
      ida: selectedRowForScheduleCopy.ida,           // Copia horário ida
      chegada: selectedRowForScheduleCopy.chegada,   // Copia horário chegada
      retorno: selectedRowForScheduleCopy.retorno,   // Copia horário retorno
      horarioRetorno: selectedRowForScheduleCopy.horarioRetorno, // Copia horário retorno
      needsTicket: selectedRowForScheduleCopy.needsTicket,       // Copia se precisa passagem
      dailyRates,                                    // NÃO copia as diárias
      isCustom: false,
    };

    setFunctionRows(prev => [...prev, newRow]);
    setShowFunctionSelectForSchedule(false);
    setSelectedRowForScheduleCopy(null);
    
    toast({
      title: "Horários copiados",
      description: `Horários de ${selectedRowForScheduleCopy.functionName} copiados para ${selectedFunction.name}`,
    });
  };

  const loadFromEvent = async (eventId: string) => {
    try {
      const response = await fetch(`/api/team-inclusions?eventId=${eventId}`);
      if (!response.ok) throw new Error('Erro ao carregar inclusões');
      
      const inclusions = await response.json();
      
      if (inclusions.length === 0) {
        toast({
          title: "Evento vazio",
          description: "Este evento não possui inclusões salvas.",
        });
        return;
      }

      // ORDENAR inclusions por row_order para manter posição original da planilha
      const sortedInclusions = inclusions.sort((a: any, b: any) => {
        // Se ambos têm row_order, usar essa ordem
        if (a.rowOrder !== null && b.rowOrder !== null) {
          return a.rowOrder - b.rowOrder;
        }
        // Se apenas um tem row_order, priorizar o que tem
        if (a.rowOrder !== null) return -1;
        if (b.rowOrder !== null) return 1;
        // Se nenhum tem row_order, manter ordem original (created_at)
        return 0;
      });
      
      const loadedFunctions: any[] = [];

      sortedInclusions.forEach((inclusion: any, index: number) => {
        // Extrair dados de viagem das observações 
        const observations = inclusion.observations || '';
        let ida = '', chegada = '', retorno = '', horarioRetorno = '';
        
        const idaMatch = observations.match(/Ida:\s*([^|]*?)(?:\s*\||\s*$)/);
        const chegadaMatch = observations.match(/Chegada:\s*([^|]*?)(?:\s*\||\s*$)/);
        const retornoMatch = observations.match(/Retorno:\s*([^|]*?)(?:\s*\||\s*$)/);
        const horarioMatch = observations.match(/Horário:\s*([^|]*?)(?:\s*\||\s*$)/);
        
        if (idaMatch) ida = idaMatch[1].trim();
        if (chegadaMatch) chegada = chegadaMatch[1].trim();
        if (retornoMatch) retorno = retornoMatch[1].trim();
        if (horarioMatch) horarioRetorno = horarioMatch[1].trim();
        
        // Buscar função no sistema
        const systemFunction = functions?.find(f => f.id === inclusion.functionId);
        const functionName = systemFunction?.name || 'Função';
        
        // USAR EXATAMENTE os dados salvos - extrair diárias por dia das observações
        const dailyRateMatch = observations.match(/(\d+)\s+diária\(s\)\s+por\s+dia/);
        const dailyRatePerDay = dailyRateMatch ? parseInt(dailyRateMatch[1]) : 1;
        
        loadedFunctions.push({
          functionId: `${inclusion.functionId}-${index}`,
          originalFunctionId: inclusion.functionId,
          functionName: functionName,
          needsTicket: inclusion.needsTicket || false,
          ida,
          chegada, 
          retorno, 
          horarioRetorno,
          dailyRates: {},
          isCustom: false,
          defaultDailyRate: dailyRatePerDay,
          // Dados originais para referência
          originalDailyRates: inclusion.dailyRates,
          originalStartDate: inclusion.scheduleStartDate,
          originalEndDate: inclusion.scheduleEndDate
        });
      });

      // USAR as datas que já estão nos campos do formulário (definidas pelo usuário)
      const startDate = form.getValues().startDate;
      const endDate = form.getValues().endDate;
      
      if (!startDate || !endDate) {
        toast({
          title: "Erro",
          description: "Defina as datas de início e fim antes de carregar o template do evento.",
          variant: "destructive"
        });
        return;
      }

      // Gerar datas do período usando as datas do formulário
      const datesList: string[] = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        datesList.push(dateStr);
      }

      // Aplicar template nas datas carregadas
      const rows = loadedFunctions.map(templateFunc => {
        const dailyRates: { [date: string]: number } = {};
        
        datesList.forEach(date => {
          // Aplicar valor padrão do template
          dailyRates[date] = (templateFunc as any)?.defaultDailyRate || 1;
        });

        return {
          ...templateFunc, // Preserva ida, chegada, retorno, horarioRetorno, needsTicket
          dailyRates, // Aplica nas novas datas
        };
      });

      // NÃO alterar as datas se já foram definidas pelo usuário
      // Usar apenas as datas que o usuário já definiu nos campos
      
      // Aplicar DIRETO na planilha
      setDates(datesList);
      setFunctionRows(rows);
      setShowGrid(true); // Mostrar planilha DIRETO
      
      toast({
        title: "Template aplicado",
        description: `${loadedFunctions.length} funções carregadas na planilha`,
      });

    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao carregar configurações do evento.",
        variant: "destructive"
      });
    }
  };

  const removeFunction = (functionId: string) => {
    setFunctionRows(prev => prev.filter(row => row.functionId !== functionId));
  };


  const formatDateForDisplay = (dateStr: string | undefined | null) => {
    if (!dateStr || typeof dateStr !== 'string') {
      return 'Data inválida';
    }
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}`;
  };

  const processGrid = (): ProcessedRange[] => {
    const ranges: ProcessedRange[] = [];

    functionRows.forEach(row => {
      if (dates.length === 0) return;

      // Get dates with daily rates > 0
      const datesWithRates = dates.filter(date => row.dailyRates[date] > 0);
      
      if (datesWithRates.length === 0) return;

      // Usar originalFunctionId se existir (função carregada de template) ou extrair do ID
      let originalFunctionId = (row as any).originalFunctionId || row.functionId;
      
      // Se não tem originalFunctionId, tentar extrair do ID único
      if (!originalFunctionId || originalFunctionId === row.functionId) {
        if (row.functionId.includes('-')) {
          const parts = row.functionId.split('-');
          
          // Testar diferentes combinações até encontrar uma que existe
          for (let i = 1; i <= parts.length; i++) {
            const testId = parts.slice(0, i).join('-');
            const foundFunction = functions?.find(f => f.id === testId);
            if (foundFunction) {
              originalFunctionId = testId;
              break;
            }
          }
        }
      }

      // Sort dates chronologically
      const sortedDates = datesWithRates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

      // Logic: Create records when value changes from previous
      const startDate = sortedDates[0];
      const endDate = sortedDates[sortedDates.length - 1];
      const numberOfDays = sortedDates.length;
      
      // Check if all values are the same
      const allValues = sortedDates.map(date => row.dailyRates[date]);
      const allSame = allValues.every(val => val === allValues[0]);
      const firstValue = allValues[0];
      
      if (allSame) {
        // Criar APENAS 1 registro por linha da planilha
        // dailyRate = dias trabalhados × diárias por dia
        const totalDailyRates = numberOfDays * firstValue;
        ranges.push({
          functionId: originalFunctionId, // Usar ID original
          dailyRate: totalDailyRates, // Total de diárias (dias × diárias por dia)
          dailyRatePerDay: firstValue, // Quantas diárias por dia (para observação)
          startDate: startDate,
          endDate: endDate,
          travelInfo: {
            ida: row.ida,
            chegada: row.chegada,
            retorno: row.retorno,
            horarioRetorno: row.horarioRetorno,
          },
        });
      } else {
          // Values change: create records for each different value
          
          // Agrupar datas por valor para criar registros corretos
          const valueGroups: { [value: number]: string[] } = {};
          
          for (const date of sortedDates) {
            const value = row.dailyRates[date];
            if (value > 0) { // Incluir todos os valores > 0, incluindo valor 1
              if (!valueGroups[value]) {
                valueGroups[value] = [];
              }
              valueGroups[value].push(date);
            }
          }
          
          // Criar um registro para cada grupo de valor
          for (const [valueStr, datesForValue] of Object.entries(valueGroups)) {
            const dailyRatePerDay = parseInt(valueStr);
            // Ordenar as datas para esse valor específico
            const sortedDatesForValue = datesForValue.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
            const firstDate = sortedDatesForValue[0];
            const lastDate = sortedDatesForValue[sortedDatesForValue.length - 1];
            const daysInThisGroup = sortedDatesForValue.length;
            
            ranges.push({
              functionId: originalFunctionId, // Usar ID original
              dailyRate: daysInThisGroup * dailyRatePerDay, // Total: dias × diárias por dia
              dailyRatePerDay: dailyRatePerDay, // Quantas diárias por dia (para observação)
              startDate: firstDate,
              endDate: lastDate,
              travelInfo: {
                ida: row.ida,
                chegada: row.chegada,
                retorno: row.retorno,
                horarioRetorno: row.horarioRetorno,
              },
            });
          }
      }
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
        description: "Configure pelo menos uma escalação na grade",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      let successCount = 0;
      
      // Cria um team_inclusion para cada range processado
      for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex++) {
        const range = ranges[rangeIndex];
        const dailyRatesCount = calculateDailyRates(range.startDate, range.endDate);
        
        // Como range.functionId agora é o ID original, precisamos encontrar a row pelo ID único original  
        const functionRow = functionRows.find(r => {
          // Extrair ID original da row para comparar
          let rowOriginalId = r.functionId;
          if (r.functionId.includes('-')) {
            const parts = r.functionId.split('-');
            for (let i = 1; i <= parts.length; i++) {
              const testId = parts.slice(0, i).join('-');
              const foundFunction = functions?.find(f => f.id === testId);
              if (foundFunction) {
                rowOriginalId = testId;
                break;
              }
            }
          }
          return rowOriginalId === range.functionId;
        });
        
        // Encontrar a posição original da linha na planilha
        const rowOrder = functionRows.findIndex(r => {
          let rowOriginalId = r.functionId;
          if (r.functionId.includes('-')) {
            const parts = r.functionId.split('-');
            for (let i = 1; i <= parts.length; i++) {
              const testId = parts.slice(0, i).join('-');
              const foundFunction = functions?.find(f => f.id === testId);
              if (foundFunction) {
                rowOriginalId = testId;
                break;
              }
            }
          }
          return rowOriginalId === range.functionId;
        });
        
        // O processGrid já retorna IDs originais corretos
        const originalFunction = functions?.find(f => f.id === range.functionId);
        
        await createTeamInclusionMutation.mutateAsync({
          eventId,
          functionId: range.functionId, // já é o ID original correto
          userId: originalFunction?.userId || user?.id, // usa userId da função original
          scheduleStartDate: range.startDate,
          scheduleEndDate: range.endDate,
          dailyRates: dailyRatesCount, // número de dias
          dailyValue: range.dailyRate * dailyRatesCount * 5000, // valor total (diárias por dia * dias * valor unitário)
          needsTicket: functionRow?.needsTicket || false,
          status: "planejado", // Status para aparecer na escalação
          phase: "inclusao", // Fase obrigatória
          rowOrder: rowOrder, // SALVAR POSIÇÃO DA LINHA NA PLANILHA
          observations: `${functionRow?.functionName || 'Função'} - ${(range as any).dailyRatePerDay || range.dailyRate} diária(s) por dia - ${formatDateForDisplay(range.startDate)} a ${formatDateForDisplay(range.endDate)} | Ida: ${functionRow?.ida || ''} | Chegada: ${functionRow?.chegada || ''} | Retorno: ${functionRow?.retorno || ''} | Horário: ${functionRow?.horarioRetorno || ''}`,
        });
        
        successCount++;
      }

      toast({
        title: "Sucesso",
        description: `${successCount} escalação(ões) criada(s) com sucesso!`,
      });

      // Limpa o form e rascunho após sucesso
      form.reset();
      setFunctionRows([]);
      setDates([]);
      setShowGrid(false);
      
      // Limpar rascunhos salvos após criar escalações
      localStorage.removeItem('grid-draft-save');
      localStorage.removeItem('grid-auto-save');
      
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
                {/* Header com controles */}
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Modo Planilha - Inclusões de Equipe</h3>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => setShowHelp(!showHelp)}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <HelpCircle className="w-4 h-4" />
                      Ajuda
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setShowEventSelect(true)}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Carregar de Evento Anterior
                    </Button>
                    <Button
                      type="button"
                      onClick={openFunctionSelect}
                      className="flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar Função
                    </Button>
                  </div>
                </div>

                {/* Seção de Ajuda */}
                <Collapsible open={showHelp}>
                  <CollapsibleContent>
                    <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">📋 Atalhos de Teclado:</h4>
                          <ul className="space-y-1 text-blue-800 dark:text-blue-200">
                            <li><strong>Ctrl+C</strong>: Copiar valor da célula selecionada</li>
                            <li><strong>Ctrl+V</strong>: Colar valor na célula selecionada</li>
                            <li><strong>Tab</strong>: Navegar para próxima célula</li>
                            <li><strong>Enter</strong>: Confirmar valor e navegar</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">⚡ Recursos Rápidos:</h4>
                          <ul className="space-y-1 text-blue-800 dark:text-blue-200">
                            <li><strong>Menu de Ações</strong>: Clique nos três pontos da função</li>
                            <li><strong>Duplicar Função</strong>: Copia todos os dados da função</li>
                            <li><strong>Preencher Datas</strong>: Aplica mesmo valor em todas as datas</li>
                            <li><strong>Auto-save</strong>: Salvamento automático a cada 2 segundos</li>
                            <li><strong>Templates</strong>: Salve e reutilize configurações</li>
                          </ul>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-4 text-xs text-blue-700 dark:text-blue-300">
                          <label className="flex items-center gap-2">
                            <Checkbox
                              checked={autoSave}
                              onCheckedChange={(checked) => setAutoSave(checked === true)}
                              className="w-3 h-3"
                            />
                            Auto-salvar ativo
                          </label>
                          <span>💡 Clique numa célula de diária para usar os atalhos de copiar/colar</span>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left border-r font-medium min-w-32">Função</th>
                          <th className="px-3 py-2 text-center border-r font-medium w-20">
                            <div className="flex items-center justify-center gap-1">
                              <Ticket className="w-3 h-3" />
                              <span>Passagem</span>
                            </div>
                          </th>
                          <th className="px-3 py-2 text-center border-r font-medium w-20">Ida</th>
                          <th className="px-3 py-2 text-center border-r font-medium w-24">Chegada(até..)</th>
                          <th className="px-3 py-2 text-center border-r font-medium w-20">Retorno</th>
                          <th className="px-3 py-2 text-center border-r font-medium w-24">Horário do Retorno</th>
                          {dates.map(date => (
                            <th key={date} className="px-2 py-2 text-center border-r font-medium w-16 bg-primary/10">
                              <div className="text-xs">
                                {formatDateForDisplay(date)}
                              </div>
                            </th>
                          ))}
                          <th className="px-2 py-2 text-center font-medium w-16">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {functionRows.sort((a, b) => a.functionName.localeCompare(b.functionName)).map(row => (
                          <tr key={row.functionId} className="border-t">
                            <td className="px-3 py-2 border-r font-medium bg-muted/30">
                              {row.functionName}
                            </td>
                            <td className="px-2 py-2 border-r text-center">
                              <Checkbox
                                checked={row.needsTicket}
                                onCheckedChange={(checked) => updateNeedsTicket(row.functionId, checked === true)}
                                data-testid={`checkbox-needs-ticket-${row.functionId}`}
                              />
                            </td>
                            <td className="px-2 py-2 border-r">
                              <Input 
                                value={row.ida} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'ida', e.target.value.slice(0, 3))}
                                placeholder="sáb"
                                className="h-7 text-center"
                                maxLength={3}
                              />
                            </td>
                            <td className="px-2 py-2 border-r">
                              <Input 
                                value={row.chegada} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'chegada', e.target.value)}
                                placeholder="até..."
                                className="h-7 text-center"
                              />
                            </td>
                            <td className="px-2 py-2 border-r">
                              <Input 
                                value={row.retorno} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'retorno', e.target.value.slice(0, 3))}
                                placeholder="dom"
                                className="h-7 text-center"
                                maxLength={3}
                              />
                            </td>
                            <td className="px-2 py-2 border-r">
                              <Input 
                                value={row.horarioRetorno} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'horarioRetorno', e.target.value.slice(0, 10))}
                                placeholder="14-18h"
                                className="h-7 text-center"
                                maxLength={10}
                              />
                            </td>
                            {dates.map(date => (
                              <td key={date} className="px-1 py-2 border-r text-center">
                                <div 
                                  className="relative"
                                  onFocus={() => setFocusedCell({functionId: row.functionId, date})}
                                  onBlur={() => setFocusedCell(null)}
                                >
                                  <Select
                                    value={row.dailyRates[date]?.toString() || "0"}
                                    onValueChange={(val) => updateDailyRate(row.functionId, date, parseInt(val))}
                                  >
                                    <SelectTrigger 
                                      className={`h-7 w-12 ${focusedCell?.functionId === row.functionId && focusedCell?.date === date ? 'ring-2 ring-primary' : ''}`}
                                      onFocus={() => setFocusedCell({functionId: row.functionId, date})}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="0">-</SelectItem>
                                      <SelectItem value="1">1</SelectItem>
                                      <SelectItem value="2">2</SelectItem>
                                      <SelectItem value="3">3</SelectItem>
                                      <SelectItem value="4">4</SelectItem>
                                      <SelectItem value="5">5</SelectItem>
                                      <SelectItem value="6">6</SelectItem>
                                      <SelectItem value="7">7</SelectItem>
                                      <SelectItem value="8">8</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                    <MoreHorizontal className="w-3 h-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => duplicateFunction(row.functionId)}>
                                    <Copy className="w-3 h-3 mr-2" />
                                    Duplicar Função Completa
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => duplicateScheduleOnly(row.functionId)}>
                                    <Calendar className="w-3 h-3 mr-2" />
                                    Copiar para Nova Função
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => copyScheduleData(row.functionId)}>
                                    <Copy className="w-3 h-3 mr-2" />
                                    Copiar Horários
                                  </DropdownMenuItem>
                                  {copiedSchedule && (
                                    <DropdownMenuItem onClick={() => pasteScheduleData(row.functionId)}>
                                      <Calendar className="w-3 h-3 mr-2" />
                                      Colar Horários
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem 
                                    onClick={() => removeFunction(row.functionId)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="w-3 h-3 mr-2" />
                                    Remover
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Botão para adicionar função */}
                <Button
                  type="button"
                  onClick={openFunctionSelect}
                  variant="outline"
                  className="w-full"
                  disabled={dates.length === 0}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Função
                </Button>

                {/* Preview dos resultados */}
                <div className="border rounded-lg p-4 bg-muted/50">
                  <Label className="text-sm font-medium mb-3 block">
                    Registros que serão criados ({processGrid().length}):
                  </Label>
                  <div className="space-y-1 text-xs max-h-32 overflow-y-auto">
                    {processGrid().map((range, index) => {
                      // Busca o nome da função no functionRows primeiro, depois na lista de functions
                      const functionRow = functionRows.find(r => r.functionId === range.functionId);
                      const functionName = functionRow?.functionName || 
                                         functions?.find(f => f.id === range.functionId)?.name ||
                                         functions?.find(f => f.id === range.functionId.split('-')[0])?.name || 
                                         'Função não encontrada';
                      
                      return (
                        <div key={index} className="flex justify-between">
                          <span>
                            {functionName} - {range.dailyRate} diária(s)
                          </span>
                          <span>
                            {formatDateForDisplay(range.startDate)} a {formatDateForDisplay(range.endDate)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Botões de ação */}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {/* Botão para salvar rascunho */}
                    <Button
                      type="button"
                      onClick={saveDraft}
                      variant="outline"
                      data-testid="button-save-draft"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Rascunho
                    </Button>
                    
                    {/* Botão para carregar rascunho */}
                    <Button
                      type="button"
                      onClick={() => {
                        const loaded = loadDraft();
                        if (!loaded) {
                          toast({
                            title: "Nenhum rascunho encontrado",
                            description: "Não há rascunho salvo para carregar.",
                            variant: "destructive"
                          });
                        }
                      }}
                      variant="outline"
                      data-testid="button-load-draft"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Carregar Rascunho
                    </Button>
                  </div>
                  
                  {/* Botão para criar escalações */}
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
              </div>
            )}
          </div>
        </Form>
      </CardContent>

      {/* Modal para seleção de função */}
      <Dialog open={showFunctionSelect} onOpenChange={setShowFunctionSelect}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Selecionar Função</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escolha uma função das disponíveis no sistema:
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {functions?.sort((a, b) => a.name.localeCompare(b.name)).map(func => (
                <Button
                  key={`${func.id}-${Date.now()}-${Math.random()}`}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => addSystemFunction(func.id)}
                >
                  <div className="text-left">
                    <div className="font-medium">{func.name}</div>
                    {func.description && (
                      <div className="text-xs text-muted-foreground">{func.description}</div>
                    )}
                  </div>
                </Button>
              ))}
              {(!functions || functions.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {!functions ? "Carregando funções..." : "Não há funções cadastradas."}
                </p>
              )}
            </div>
            <Button variant="outline" onClick={() => setShowFunctionSelect(false)} className="w-full">
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal para selecionar evento anterior */}
      <Dialog open={showEventSelect} onOpenChange={setShowEventSelect}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Carregar de Evento Anterior</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione um evento que já possui inclusões salvas:
            </p>
            <Select onValueChange={(eventId) => {
              loadFromEvent(eventId);
              setShowEventSelect(false);
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um evento" />
              </SelectTrigger>
              <SelectContent>
                {events?.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal para selecionar função ao copiar horários */}
      <Dialog open={showFunctionSelectForSchedule} onOpenChange={setShowFunctionSelectForSchedule}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Escolher Função para os Horários Copiados</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg border">
              <p className="text-sm font-medium">
                Copiando horários de: <strong>{selectedRowForScheduleCopy?.functionName}</strong>
              </p>
              <div className="text-xs text-muted-foreground mt-1">
                ✅ Ida: {selectedRowForScheduleCopy?.ida || "(vazio)"} • 
                Chegada: {selectedRowForScheduleCopy?.chegada || "(vazio)"} • 
                Retorno: {selectedRowForScheduleCopy?.retorno || "(vazio)"} • 
                Horário: {selectedRowForScheduleCopy?.horarioRetorno || "(vazio)"}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Escolha a nova função:</Label>
              <Select onValueChange={(functionId) => {
                createRowWithCopiedSchedule(functionId);
              }}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecione uma função" />
                </SelectTrigger>
                <SelectContent>
                  {functions?.sort((a, b) => a.name.localeCompare(b.name)).map((func) => (
                    <SelectItem key={func.id} value={func.id}>
                      {func.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
              <p className="text-xs text-yellow-800">
                <strong>Importante:</strong> Os valores das diárias (1, 2, 3) NÃO serão copiados - ficam todos em "1" por padrão.
                Apenas os horários de viagem serão copiados.
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => setShowFunctionSelectForSchedule(false)} 
              className="w-full"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}