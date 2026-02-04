import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, Save, Grid3x3, Plus, Trash2, Ticket, Copy, MoreHorizontal, HelpCircle, Download, Upload, Check, ChevronsUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Event, Function, User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";

const FUNCTION_ORDER = [
  'atendimento',
  'dir prova',
  'produção',
  'produção local',
  'ativação sp',
  'ativação local',
  'sup ceno',
  'cenotecnica',
  'cenotecnica local',
  'percurso',
  'kit',
  'kit local',
  'o2 prime'
];

const sortFunctionsByOrder = (functions: Function[]) => {
  return functions.sort((a, b) => {
    const aIndex = FUNCTION_ORDER.indexOf(a.name.toLowerCase());
    const bIndex = FUNCTION_ORDER.indexOf(b.name.toLowerCase());
    
    if (aIndex === -1 && bIndex === -1) {
      return a.name.localeCompare(b.name);
    }
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    
    return aIndex - bIndex;
  });
};

const gridFormSchema = z.object({
  eventId: z.string().min(1, "Evento é obrigatório"),
  startDate: z.string().min(1, "Data inicial é obrigatória"),
  endDate: z.string().min(1, "Data final é obrigatória"),
});

type GridFormData = z.infer<typeof gridFormSchema>;

interface FunctionRow {
  functionId: string;
  functionName: string;
  dataVooIda: string;
  horarioChegadaSugerido: string;
  dataVooRetorno: string;
  horarioPartidaSugerido: string;
  needsTicket: boolean; // se precisa de passagem
  needsAccommodation: boolean; // se precisa de hospedagem
  dailyRates: { [date: string]: number }; // date -> daily rate (1, 2, or 3)
  isCustom: boolean; // se é uma função adicionada dinamicamente
  selected?: boolean; // para exclusão em lote
  fromExcelPaste?: boolean; // se veio do copy-paste do Excel
  originalFunctionId?: string; // ID original da função (usado para resolver duplicatas)
}

interface ProcessedRange {
  functionId: string;
  dailyRate: number;
  dailyRatePerDay: number; // Quantas diárias por dia (para observação correta)
  startDate: string;
  endDate: string;
  workDays: string[]; // dias específicos de trabalho
  travelInfo: {
    dataVooIda: string;
    horarioChegadaSugerido: string;
    dataVooRetorno: string;
    horarioPartidaSugerido: string;
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
  const [copiedSchedule, setCopiedSchedule] = useState<{dataVooIda: string, horarioChegadaSugerido: string, dataVooRetorno: string, horarioPartidaSugerido: string, needsTicket: boolean, needsAccommodation: boolean} | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedData, setPastedData] = useState<string>("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [templateLoaded, setTemplateLoaded] = useState<boolean>(false);
  const [openEventCombobox, setOpenEventCombobox] = useState(false);
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

  // Rascunho será carregado apenas quando o usuário clicar no botão

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
      queryClient.invalidateQueries({ queryKey: ["/api/events-with-inclusions"] });
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
          ...templateFunc, // Preserva ida, chegada, retorno, horarioRetorno, needsTicket, needsAccommodation
          dailyRates, // Aplica nas novas datas
        };
      });
      
      // Limpar flag do template
      setTemplateLoaded(false);
    } else {
      // Grade nova - começar com campos VAZIOS
      rows = sortFunctionsByOrder([...(functions || [])]).map(func => {
        const dailyRates: { [date: string]: number } = {};
        
        datesList.forEach(date => {
          // Grade nova = sem valores (0 = célula vazia)
          dailyRates[date] = 0;
        });

        return {
          functionId: func.id,
          functionName: func.name,
          dataVooIda: "", // Vazio para grade nova
          horarioChegadaSugerido: "", // Vazio para grade nova
          dataVooRetorno: "", // Vazio para grade nova
          horarioPartidaSugerido: "", // Vazio para grade nova
          needsTicket: false, // Desmarcado para grade nova
          needsAccommodation: false, // Desmarcado para grade nova
          dailyRates,
          isCustom: false,
          selected: false,
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

  const updateNeedsAccommodation = (functionId: string, needsAccommodation: boolean) => {
    setFunctionRows(prev => prev.map(row => 
      row.functionId === functionId 
        ? { ...row, needsAccommodation }
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
      dataVooIda: "",
      horarioChegadaSugerido: "",
      dataVooRetorno: "",
      horarioPartidaSugerido: "",
      needsTicket: false,
      needsAccommodation: false,
      dailyRates,
      isCustom: false,
      selected: false,
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
      dataVooIda: row.dataVooIda,
      horarioChegadaSugerido: row.horarioChegadaSugerido,
      dataVooRetorno: row.dataVooRetorno,
      horarioPartidaSugerido: row.horarioPartidaSugerido,
      needsTicket: row.needsTicket,
      needsAccommodation: row.needsAccommodation
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
            dataVooIda: copiedSchedule.dataVooIda,
            horarioChegadaSugerido: copiedSchedule.horarioChegadaSugerido,
            dataVooRetorno: copiedSchedule.dataVooRetorno,
            horarioPartidaSugerido: copiedSchedule.horarioPartidaSugerido,
            needsTicket: copiedSchedule.needsTicket,
            needsAccommodation: copiedSchedule.needsAccommodation
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
      dataVooIda: selectedRowForScheduleCopy.dataVooIda,           // Copia data voo ida
      horarioChegadaSugerido: selectedRowForScheduleCopy.horarioChegadaSugerido,   // Copia horário chegada
      dataVooRetorno: selectedRowForScheduleCopy.dataVooRetorno,   // Copia data voo retorno
      horarioPartidaSugerido: selectedRowForScheduleCopy.horarioPartidaSugerido, // Copia horário partida
      needsTicket: selectedRowForScheduleCopy.needsTicket,       // Copia se precisa passagem
      needsAccommodation: selectedRowForScheduleCopy.needsAccommodation, // Copia se precisa hospedagem
      dailyRates,                                    // NÃO copia as diárias
      isCustom: false,
      selected: false,
    };

    setFunctionRows(prev => [...prev, newRow]);
    setShowFunctionSelectForSchedule(false);
    setSelectedRowForScheduleCopy(null);
    
    toast({
      title: "Horários copiados",
      description: `Horários de ${selectedRowForScheduleCopy.functionName} copiados para ${selectedFunction.name}`,
    });
  };


  const removeFunction = (functionId: string) => {
    setFunctionRows(prev => prev.filter(row => row.functionId !== functionId));
  };

  // Exclusão em lote
  const toggleRowSelection = (functionId: string) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(functionId)) {
        newSet.delete(functionId);
      } else {
        newSet.add(functionId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === functionRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(functionRows.map(r => r.functionId)));
    }
  };

  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) {
      toast({
        title: "Nenhuma linha selecionada",
        description: "Selecione pelo menos uma função para excluir.",
        variant: "destructive",
      });
      return;
    }

    setFunctionRows(prev => prev.filter(row => !selectedRows.has(row.functionId)));
    setSelectedRows(new Set());
    toast({
      title: "Linhas excluídas",
      description: `${selectedRows.size} linha(s) removida(s) com sucesso.`,
    });
  };

  // Função para converter datas curtas (15/nov, 16/nov) em datas completas (2025-11-15)
  const parseShortDate = (dateStr: string): string => {
    if (!dateStr) return "";
    
    // Se já está no formato YYYY-MM-DD, retornar como está
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    // Formatos aceitos: "15/nov", "15/11", "15-nov", "15-11"
    const monthMap: { [key: string]: string } = {
      'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
      'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
      'set': '09', 'out': '10', 'nov': '11', 'dez': '12'
    };
    
    // Tentar extrair dia e mês
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length >= 2) {
      const day = parts[0].padStart(2, '0');
      let month = parts[1].toLowerCase();
      
      // Se é nome do mês, converter para número
      if (monthMap[month]) {
        month = monthMap[month];
      } else {
        month = month.padStart(2, '0');
      }
      
      // Inferir ano: usar ano do evento se disponível, senão ano atual
      const selectedEventId = form.getValues().eventId;
      let year = new Date().getFullYear().toString();
      
      if (selectedEventId && events) {
        const selectedEvent = events.find(e => e.id === selectedEventId);
        if (selectedEvent && selectedEvent.startDate) {
          year = selectedEvent.startDate.split('-')[0];
        }
      }
      
      return `${year}-${month}-${day}`;
    }
    
    return "";
  };

  // Copy-Paste do Excel
  const handlePasteFromExcel = () => {
    if (!pastedData.trim()) {
      toast({
        title: "Dados vazios",
        description: "Cole os dados do Excel primeiro.",
        variant: "destructive",
      });
      return;
    }

    try {
      const lines = pastedData.trim().split('\n');
      const newRows: FunctionRow[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const columns = line.split('\t');
        
        if (columns.length < 4) continue; // Precisa ter pelo menos função, data ida, horário chegada, data retorno

        const functionName = columns[0]?.trim();
        const dataVooIda = parseShortDate(columns[1]?.trim() || "");
        const horarioChegadaSugerido = columns[2]?.trim() || "";
        const dataVooRetorno = parseShortDate(columns[3]?.trim() || "");
        const horarioPartidaSugerido = columns[4]?.trim() || "";
        const needsTicketStr = columns[5]?.trim().toLowerCase() || "";
        const needsAccommodationStr = columns[6]?.trim().toLowerCase() || "";

        // Encontrar função no sistema
        const matchedFunction = functions?.find(f => 
          f.name.toLowerCase() === functionName?.toLowerCase()
        );

        if (!matchedFunction) {
          console.warn(`Função não encontrada: ${functionName}`);
          continue;
        }

        // Interpretar checkboxes
        const needsTicket = ['sim', 's', '1', 'x', 'true'].includes(needsTicketStr);
        const needsAccommodation = ['sim', 's', '1', 'x', 'true'].includes(needsAccommodationStr);

        // Criar diárias vazias para as datas existentes
        const dailyRates: { [date: string]: number } = {};
        dates.forEach(date => {
          dailyRates[date] = 0; // Começar vazio
        });

        // Processar diárias se houver colunas adicionais
        for (let j = 7; j < columns.length && j - 7 < dates.length; j++) {
          const value = parseInt(columns[j]?.trim() || "0");
          dailyRates[dates[j - 7]] = isNaN(value) ? 0 : value;
        }

        const uniqueId = `${matchedFunction.id}-${Date.now()}-${i}`;

        newRows.push({
          functionId: uniqueId,
          functionName: matchedFunction.name,
          dataVooIda,
          horarioChegadaSugerido,
          dataVooRetorno,
          horarioPartidaSugerido,
          needsTicket,
          needsAccommodation,
          dailyRates,
          isCustom: false,
          selected: false,
          fromExcelPaste: true, // Flag para identificar que veio do Excel
          originalFunctionId: matchedFunction.id, // Guardar ID original da função
        });
      }

      if (newRows.length > 0) {
        // Em vez de apenas adicionar, substituir linhas existentes da mesma função
        setFunctionRows(prev => {
          const updatedRows = [...prev];
          
          newRows.forEach(newRow => {
            // Procurar se já existe uma linha para esta função
            const existingIndex = updatedRows.findIndex(existingRow => {
              // Extrair o ID original da função existente
              let existingFunctionId = (existingRow as any).originalFunctionId;
              if (!existingFunctionId) {
                // Tentar extrair do functionId
                if (existingRow.functionId.includes('-')) {
                  const parts = existingRow.functionId.split('-');
                  for (let i = 1; i <= parts.length; i++) {
                    const testId = parts.slice(0, i).join('-');
                    const foundFunction = functions?.find(f => f.id === testId);
                    if (foundFunction) {
                      existingFunctionId = testId;
                      break;
                    }
                  }
                } else {
                  existingFunctionId = existingRow.functionId;
                }
              }
              
              // Comparar com o ID da nova linha
              return existingFunctionId === (newRow as any).originalFunctionId;
            });
            
            if (existingIndex >= 0) {
              // Substituir a linha existente
              updatedRows[existingIndex] = newRow;
            } else {
              // Adicionar nova linha
              updatedRows.push(newRow);
            }
          });
          
          return updatedRows;
        });
        
        toast({
          title: "Dados colados com sucesso",
          description: `${newRows.length} linha(s) processada(s). Linhas duplicadas foram substituídas.`,
        });
        setShowPasteModal(false);
        setPastedData("");
      } else {
        toast({
          title: "Nenhum dado válido",
          description: "Verifique o formato dos dados colados.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro ao processar dados",
        description: "Verifique se os dados estão no formato correto.",
        variant: "destructive",
      });
    }
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
      
      // Nova lógica: pensar em pessoas individuais
      // Determinar quantas pessoas no máximo estão trabalhando em qualquer dia
      const maxPeoplePerDay = Math.max(...sortedDates.map(date => row.dailyRates[date]));
      
      // Para cada pessoa (1 até maxPeoplePerDay)
      for (let personIndex = 1; personIndex <= maxPeoplePerDay; personIndex++) {
        // Determinar em quais dias esta pessoa trabalha
        const workingDates = sortedDates.filter(date => row.dailyRates[date] >= personIndex);
        
        if (workingDates.length > 0) {
          // Ordenar as datas de trabalho
          const sortedWorkingDates = workingDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
          const personStartDate = sortedWorkingDates[0];
          const personEndDate = sortedWorkingDates[sortedWorkingDates.length - 1];
          const personTotalDays = sortedWorkingDates.length;
          
          ranges.push({
            functionId: originalFunctionId, // Usar ID original
            dailyRate: personTotalDays, // Total de dias que esta pessoa trabalha
            dailyRatePerDay: 1, // 1 diária por dia por pessoa
            startDate: personStartDate,
            endDate: personEndDate,
            workDays: sortedWorkingDates, // dias específicos de trabalho
            travelInfo: {
              dataVooIda: row.dataVooIda,
              horarioChegadaSugerido: row.horarioChegadaSugerido,
              dataVooRetorno: row.dataVooRetorno,
              horarioPartidaSugerido: row.horarioPartidaSugerido,
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
          scheduleStartDate: range.startDate, // PERÍODO DE TRABALHO (primeiro dia de trabalho)
          scheduleEndDate: range.endDate, // PERÍODO DE TRABALHO (último dia de trabalho)
          dailyRates: range.dailyRate, // número de dias trabalhados (já calculado corretamente no processGrid)
          workDays: range.workDays, // dias específicos de trabalho
          dailyValue: range.dailyRate * 5000, // valor total (dias * valor unitário de R$50)
          needsTicket: functionRow?.needsTicket || false,
          needsAccommodation: functionRow?.needsAccommodation || false,
          status: "planejado", // Status para aparecer na escalação
          phase: "inclusao", // Fase obrigatória
          rowOrder: rowOrder, // SALVAR POSIÇÃO DA LINHA NA PLANILHA
          // Salvar datas e horários de voo nos campos específicos
          flightDepartureDate: functionRow?.dataVooIda || null,
          flightArrivalSuggestedTime: functionRow?.horarioChegadaSugerido || null,
          flightReturnDate: functionRow?.dataVooRetorno || null,
          flightReturnSuggestedTime: functionRow?.horarioPartidaSugerido || null
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
                <FormItem className="flex flex-col">
                  <FormLabel>Evento *</FormLabel>
                  <Popover open={openEventCombobox} onOpenChange={setOpenEventCombobox}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground"
                          )}
                          data-testid="select-grid-event"
                        >
                          {field.value
                            ? events?.find((event) => event.id === field.value)?.name
                            : "Selecione um evento"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar evento..." />
                        <CommandList>
                          <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
                          <CommandGroup>
                            {events?.filter(e => e.status !== 'excluido' && e.status !== 'excluído').map((event) => (
                              <CommandItem
                                key={event.id}
                                value={event.name}
                                onSelect={() => {
                                  form.setValue("eventId", event.id);
                                  setOpenEventCombobox(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    event.id === field.value
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                {event.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
                      onClick={() => setShowPasteModal(true)}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Colar do Excel
                    </Button>
                    {selectedRows.size > 0 && (
                      <Button
                        type="button"
                        onClick={deleteSelectedRows}
                        variant="destructive"
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Excluir ({selectedRows.size})
                      </Button>
                    )}
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
                          <th className="px-2 py-2 text-center border-r font-medium w-12">
                            <Checkbox
                              checked={selectedRows.size === functionRows.length && functionRows.length > 0}
                              onCheckedChange={toggleSelectAll}
                              aria-label="Selecionar todas"
                            />
                          </th>
                          <th className="px-3 py-2 text-left border-r font-medium min-w-32">Função</th>
                          <th className="px-3 py-2 text-center border-r font-medium w-20">
                            <div className="flex items-center justify-center gap-1">
                              <Ticket className="w-3 h-3" />
                              <span>Passagem</span>
                            </div>
                          </th>
                          <th className="px-3 py-2 text-center border-r font-medium w-20">
                            <div className="flex items-center justify-center gap-1">
                              🏨
                              <span>Hospedagem</span>
                            </div>
                          </th>
                          <th className="px-3 py-2 text-center border-r font-medium w-24">Data Voo Ida</th>
                          <th className="px-3 py-2 text-center border-r font-medium min-w-[120px]">Horário Chegada Sugerido</th>
                          <th className="px-3 py-2 text-center border-r font-medium w-24">Data Voo Retorno</th>
                          <th className="px-3 py-2 text-center border-r font-medium min-w-[120px]">Horário Partida Sugerido</th>
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
                        {[...functionRows].sort((a, b) => {
                          const aIndex = FUNCTION_ORDER.indexOf(a.functionName.toLowerCase());
                          const bIndex = FUNCTION_ORDER.indexOf(b.functionName.toLowerCase());
                          
                          if (aIndex === -1 && bIndex === -1) {
                            return a.functionName.localeCompare(b.functionName);
                          }
                          if (aIndex === -1) return 1;
                          if (bIndex === -1) return -1;
                          
                          return aIndex - bIndex;
                        }).map(row => (
                          <tr key={row.functionId} className="border-t">
                            <td className="px-2 py-2 border-r text-center">
                              <Checkbox
                                checked={selectedRows.has(row.functionId)}
                                onCheckedChange={() => toggleRowSelection(row.functionId)}
                                aria-label={`Selecionar ${row.functionName}`}
                              />
                            </td>
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
                            <td className="px-2 py-2 border-r text-center">
                              <Checkbox
                                checked={row.needsAccommodation}
                                onCheckedChange={(checked) => updateNeedsAccommodation(row.functionId, checked === true)}
                                data-testid={`checkbox-needs-accommodation-${row.functionId}`}
                              />
                            </td>
                            <td className="px-2 py-2 border-r">
                              <Input 
                                type="date"
                                value={row.dataVooIda} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'dataVooIda', e.target.value)}
                                className="h-7 text-center text-xs"
                              />
                            </td>
                            <td className="px-2 py-2 border-r min-w-[120px]">
                              <Input 
                                value={row.horarioChegadaSugerido} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'horarioChegadaSugerido', e.target.value)}
                                placeholder="Ex: 14h30"
                                className="h-7 text-center text-xs !bg-white dark:!bg-white !text-black dark:!text-black w-full"
                                maxLength={15}
                              />
                            </td>
                            <td className="px-2 py-2 border-r">
                              <Input 
                                type="date"
                                value={row.dataVooRetorno} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'dataVooRetorno', e.target.value)}
                                className="h-7 text-center text-xs"
                              />
                            </td>
                            <td className="px-2 py-2 border-r min-w-[120px]">
                              <Input 
                                value={row.horarioPartidaSugerido} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'horarioPartidaSugerido', e.target.value)}
                                placeholder="Ex: 18h00"
                                className="h-7 text-center text-xs !bg-white dark:!bg-white !text-black dark:!text-black w-full"
                                maxLength={15}
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
              {sortFunctionsByOrder([...(functions || [])]).map(func => (
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
                ✅ Data Voo Ida: {selectedRowForScheduleCopy?.dataVooIda || "(vazio)"} • 
                Horário Chegada: {selectedRowForScheduleCopy?.horarioChegadaSugerido || "(vazio)"} • 
                Data Voo Retorno: {selectedRowForScheduleCopy?.dataVooRetorno || "(vazio)"} • 
                Horário Partida: {selectedRowForScheduleCopy?.horarioPartidaSugerido || "(vazio)"}
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
                  {sortFunctionsByOrder([...(functions || [])]).map((func) => (
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

      {/* Modal para colar dados do Excel */}
      <Dialog open={showPasteModal} onOpenChange={setShowPasteModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Colar Dados do Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">📋 Formato Esperado:</p>
              <div className="text-xs text-blue-800 dark:text-blue-200 font-mono bg-white dark:bg-gray-900 p-2 rounded">
                Função | Data Voo Ida | Horário Chegada | Data Voo Retorno | Horário Partida | Passagem | Hospedagem | [Diárias por dia...]
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                <strong>Dica:</strong> Copie as linhas do Excel (sem cabeçalho) e cole abaixo. As diárias nas colunas extras serão aplicadas às datas correspondentes.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Cole os dados aqui:</Label>
              <Textarea
                value={pastedData}
                onChange={(e) => setPastedData(e.target.value)}
                placeholder="Cole os dados do Excel aqui (Ctrl+V)..."
                className="h-48 font-mono text-xs"
              />
            </div>


            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPasteModal(false);
                  setPastedData("");
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handlePasteFromExcel}>
                <Upload className="w-4 h-4 mr-2" />
                Processar e Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}