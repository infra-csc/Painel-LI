import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { formatDiarias } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { apiErrorMessage } from "@/lib/api-error";
import { avisarAgenda } from "@/hooks/use-vaga-acoes";
import { Calendar, Save, Grid3x3, Plus, Trash2, Ticket, Copy, MoreHorizontal, HelpCircle, Download, Upload, Check, ChevronsUpDown, AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Event, Function } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { useEventLock, PastEventBanner } from "@/lib/event-lock";
import { RequiredMark } from "@/components/forms/required-mark";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";

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
  needsTicket: boolean;
  needsAccommodation: boolean;
  rowOrder: number;
}

// ─── Célula de quantidade da grade ───────────────────────────────────────────
// Input numérico leve (substitui 1 Radix Select por célula — 130+ por grade):
//   ↑ / ↓ = +1 / −1 · Delete = zera · ← → = célula ao lado · Enter / Shift+Enter
//   e Ctrl+↑ / Ctrl+↓ = linha abaixo / acima · clamp 0..15.
const QTY_MAX = 15;
const qtyCellSelector = (r: number, c: number) => `[data-qty-cell="${r}-${c}"]`;

interface QtyCellProps {
  value: number;
  rowIdx: number;
  colIdx: number;
  functionName: string;
  dayLabel: string;
  isWeekend: boolean;
  onChange: (value: number) => void;
}

const QtyCell = memo(function QtyCell({ value, rowIdx, colIdx, functionName, dayLabel, isWeekend, onChange }: QtyCellProps) {
  const clamp = (n: number) => Math.max(0, Math.min(QTY_MAX, n));

  const focusCell = (e: React.KeyboardEvent<HTMLInputElement>, dRow: number, dCol: number) => {
    const table = e.currentTarget.closest("table");
    const target = table?.querySelector<HTMLInputElement>(qtyCellSelector(rowIdx + dRow, colIdx + dCol));
    if (target) {
      e.preventDefault();
      target.focus();
      target.select();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowUp":
        if (e.ctrlKey || e.metaKey) { focusCell(e, -1, 0); return; }
        e.preventDefault(); onChange(clamp(value + 1)); return;
      case "ArrowDown":
        if (e.ctrlKey || e.metaKey) { focusCell(e, 1, 0); return; }
        e.preventDefault(); onChange(clamp(value - 1)); return;
      case "ArrowLeft":  focusCell(e, 0, -1); return;
      case "ArrowRight": focusCell(e, 0, 1); return;
      case "Enter":      focusCell(e, e.shiftKey ? -1 : 1, 0); return;
      case "Delete":     e.preventDefault(); onChange(0); return;
      default: return;
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (digits === "") { onChange(0); return; }
    onChange(clamp(parseInt(digits.slice(-2), 10) || 0));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      data-qty-cell={`${rowIdx}-${colIdx}`}
      value={value > 0 ? String(value) : ""}
      placeholder="–"
      aria-label={`${functionName}, ${dayLabel}`}
      title="↑/↓ ajusta · ←/→ muda de célula · Enter desce · Delete zera"
      onChange={onInput}
      onKeyDown={onKeyDown}
      onFocus={e => e.currentTarget.select()}
      className={cn(
        "h-7 w-12 rounded-lg text-center text-xs font-semibold tabular-nums transition-colors outline-none",
        "focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground",
        value > 0
          ? "bg-brand-soft text-primary border border-primary/30"
          : cn("bg-card text-muted-foreground border border-border", isWeekend && "bg-warning-soft/40"),
      )}
    />
  );
});

export default function GridTeamInclusionForm() {
  const [functionRows, setFunctionRows] = useState<FunctionRow[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [showGrid, setShowGrid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showFunctionSelect, setShowFunctionSelect] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [copiedSchedule, setCopiedSchedule] = useState<{dataVooIda: string, horarioChegadaSugerido: string, dataVooRetorno: string, horarioPartidaSugerido: string, needsTicket: boolean, needsAccommodation: boolean} | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedData, setPastedData] = useState<string>("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [openEventCombobox, setOpenEventCombobox] = useState(false);
  // "Gerar Grade" com grade já preenchida pede confirmação antes de regerar
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Rascunhos são por usuário: dois usuários na mesma máquina não veem a grade
  // um do outro, e o rascunho de um não sobrescreve o do outro.
  const draftKey = `grid-draft-save:${user?.id ?? "anon"}`;
  const autoSaveKey = `grid-auto-save:${user?.id ?? "anon"}`;

  // Função para salvar rascunho manualmente
  const saveDraft = () => {
    if (functionRows.length > 0) {
      const { eventId, startDate, endDate } = form.getValues();
      localStorage.setItem(draftKey, JSON.stringify({
        functionRows,
        dates,
        eventId,
        startDate,
        endDate,
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
    const draftSaved = localStorage.getItem(draftKey);
    const autoSaved = localStorage.getItem(autoSaveKey);

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

          // Restaura evento e período junto com a grade (antes só o evento
          // voltava, e as datas do formulário ficavam vazias/inconsistentes)
          if (data.eventId) form.setValue('eventId', data.eventId, { shouldValidate: true });
          const savedDates: string[] = data.dates || [];
          form.setValue('startDate', data.startDate || savedDates[0] || "");
          form.setValue('endDate', data.endDate || savedDates[savedDates.length - 1] || "");

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
  // A checagem de permissão foi movida para logo antes do return principal:
  // early return AQUI ficava ANTES de useForm/useMutation/useMemo abaixo, então
  // o número de hooks mudava quando o usuário não tinha permissão (Rules of
  // Hooks — "rendered more hooks than during the previous render").
  const canEditGrid = hasPermission(user, 'canEditScreen1');

  const form = useForm<GridFormData>({
    resolver: zodResolver(gridFormSchema),
    defaultValues: {
      eventId: "",
      startDate: "",
      endDate: "",
    },
  });

  // Auto-save (fica depois do useForm: lê form.getValues())
  useEffect(() => {
    if (autoSave && functionRows.length > 0) {
      const timeoutId = setTimeout(() => {
        const { eventId, startDate, endDate } = form.getValues();
        localStorage.setItem(autoSaveKey, JSON.stringify({
          functionRows,
          dates,
          eventId,
          startDate,
          endDate,
          timestamp: Date.now()
        }));
      }, 2000); // Auto-save after 2 seconds of inactivity

      return () => clearTimeout(timeoutId);
    }
  }, [functionRows, dates, autoSave, autoSaveKey, form]);



  // Evento escolhido (reativo) — habilita/desabilita o botão de criar
  const selectedEventId = form.watch("eventId");

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });


  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  // Evento encerrado (regra 20/08): criar escalação em evento que já passou é
  // 403 no servidor — o botão fica desabilitado com o motivo.
  const eventLock = useEventLock();
  const eventoEncerrado = eventLock.isLockedEvent(selectedEventId);
  // Motivo exato (encerrado x fora da lista) para o tooltip e o rótulo do botão.
  const motivoBloqueio = eventLock.lockReason(selectedEventId);

  // O(1) lookup map: functionId → Function
  const functionMap = useMemo(() => {
    const m = new Map<string, Function>();
    functions?.forEach(f => m.set(f.id, f));
    return m;
  }, [functions]);

  // Sorted once per change in functions list
  const sortedFunctions = useMemo(
    () => sortFunctionsByOrder([...(functions || [])]),
    [functions]
  );

  // A criação passou a ser em lote transacional (POST /api/team-inclusions/bulk
  // no handleSubmit) — a mutation unitária antiga saiu.

  // Lista "YYYY-MM-DD" entre início e fim (inclusive), sem passar por
  // toISOString (que converte para UTC e pode pular/duplicar um dia).
  const buildDateList = (startDate: string, endDate: string): string[] => {
    const list: string[] = [];
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const cur = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      list.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }
    return list;
  };

  // A grade tem algo que o usuário perderia ao regerar?
  const gridHasContent = showGrid && functionRows.some(row =>
    Object.values(row.dailyRates).some(v => v > 0) ||
    row.dataVooIda || row.dataVooRetorno || row.horarioChegadaSugerido || row.horarioPartidaSugerido ||
    row.needsTicket || row.needsAccommodation
  );

  const validateGridPeriod = (): { startDate: string; endDate: string } | null => {
    const { startDate, endDate } = form.getValues();

    if (!startDate || !endDate) {
      form.trigger(["startDate", "endDate"]);
      toast({
        title: "Período incompleto",
        description: "Selecione as datas de início e fim.",
        variant: "destructive",
      });
      return null;
    }

    if (startDate > endDate) {
      form.setError("endDate", { message: "A data final não pode ser anterior à inicial" });
      toast({
        title: "Período inválido",
        description: "A data inicial deve ser menor ou igual à data final.",
        variant: "destructive",
      });
      return null;
    }
    return { startDate, endDate };
  };

  /**
   * Monta/regenera a grade para o período do formulário.
   * `preserve = true` mantém as linhas atuais (inclusive funções adicionadas e
   * dados de viagem) e só reencaixa as quantidades: dias que continuam no novo
   * período ficam com o valor; dias novos entram vazios; dias fora saem.
   */
  const buildGrid = (preserve: boolean) => {
    const period = validateGridPeriod();
    if (!period) return;
    const datesList = buildDateList(period.startDate, period.endDate);

    let rows: FunctionRow[];
    if (preserve && functionRows.length > 0) {
      rows = functionRows.map(row => {
        const dailyRates: { [date: string]: number } = {};
        datesList.forEach(date => { dailyRates[date] = row.dailyRates[date] || 0; });
        return { ...row, dailyRates };
      });
    } else {
      // Grade nova - começar com campos VAZIOS
      rows = sortedFunctions.map(func => {
        const dailyRates: { [date: string]: number } = {};
        datesList.forEach(date => { dailyRates[date] = 0; });
        return {
          functionId: func.id,
          functionName: func.name,
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
      });
    }

    setDates(datesList);
    setFunctionRows(rows);
    setSelectedRows(new Set());
    setShowGrid(true);
  };

  const generateGrid = () => {
    if (gridHasContent) {
      // Valida o período antes de perguntar — não faz sentido confirmar para
      // depois cair num erro de datas.
      if (!validateGridPeriod()) return;
      setConfirmRegenerate(true);
      return;
    }
    buildGrid(false);
  };

  const updateDailyRate = useCallback((functionId: string, date: string, value: number) => {
    setFunctionRows(prev => prev.map(row => 
      row.functionId === functionId 
        ? { ...row, dailyRates: { ...row.dailyRates, [date]: value } }
        : row
    ));
  }, []);

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

    // Nova linha começa vazia (0 = "–"), como toda a grade
    const dailyRates: { [date: string]: number } = {};
    dates.forEach(date => {
      dailyRates[date] = 0;
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
    // Sem toast: a linha nova aparece na grade (feedback visual suficiente)
  };

  const openFunctionSelect = () => {
    setShowFunctionSelect(true);
  };

  const duplicateFunction = (functionId: string) => {
    const originalRow = functionRows.find(row => row.functionId === functionId);
    if (!originalRow) return;

    const newRow: FunctionRow = {
      ...originalRow,
      functionId: `${originalRow.functionId}-copy-${Date.now()}`,
    };

    setFunctionRows(prev => [...prev, newRow]);
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
      dailyRates[date] = 0; // Começa vazia — não copia as quantidades por dia
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

  // Normaliza string para comparação: remove acentos, lowercase, trim
  const normalizeStr = (s: string) =>
    s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
      // Fix #1: suportar line endings Windows (\r\n) e Unix (\n)
      const lines = pastedData.trim().split(/\r?\n/);
      const newRows: FunctionRow[] = [];
      const skippedNames: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const columns = line.split('\t');

        // Requer ao menos o nome da função
        if (columns.length < 1 || !columns[0]?.trim()) continue;

        const functionName = columns[0].trim();

        // Fix #2: comparação normalizada (acentos + case) usando array de funções
        const normName = normalizeStr(functionName);
        const matchedFunction = functions?.find(f => normalizeStr(f.name) === normName);

        if (!matchedFunction) {
          // Fix #3: acumular nomes não encontrados para mostrar ao usuário
          skippedNames.push(functionName);
          continue;
        }

        const dataVooIda             = parseShortDate(columns[1]?.trim() || "");
        const horarioChegadaSugerido = columns[2]?.trim() || "";
        const dataVooRetorno         = parseShortDate(columns[3]?.trim() || "");
        const horarioPartidaSugerido = columns[4]?.trim() || "";
        const needsTicketStr         = columns[5]?.trim().toLowerCase() || "";
        const needsAccommodationStr  = columns[6]?.trim().toLowerCase() || "";

        // Interpretar checkboxes
        const needsTicket       = ['sim', 's', '1', 'x', 'true'].includes(needsTicketStr);
        const needsAccommodation = ['sim', 's', '1', 'x', 'true'].includes(needsAccommodationStr);

        // Criar diárias vazias para as datas existentes
        const dailyRates: { [date: string]: number } = {};
        dates.forEach(date => { dailyRates[date] = 0; });

        // Processar diárias nas colunas a partir do índice 7
        for (let j = 7; j < columns.length && j - 7 < dates.length; j++) {
          const raw   = parseInt(columns[j]?.trim() || "0");
          // Fix #4: clamp para o range válido do Select (0–15)
          const value = isNaN(raw) ? 0 : Math.max(0, Math.min(15, raw));
          dailyRates[dates[j - 7]] = value;
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
          fromExcelPaste: true,
          originalFunctionId: matchedFunction.id,
        });
      }

      if (newRows.length > 0) {
        setFunctionRows(prev => {
          const getOriginalId = (row: FunctionRow): string => {
            if (row.originalFunctionId) return row.originalFunctionId;
            if (row.functionId.includes('-')) {
              const parts = row.functionId.split('-');
              for (let i = 1; i <= parts.length; i++) {
                const testId = parts.slice(0, i).join('-');
                if (functions?.find(f => f.id === testId)) return testId;
              }
            }
            return row.functionId;
          };

          // IDs das funções que vieram no paste (em ordem do Excel)
          const pastedOriginalIds = newRows.map(r => r.originalFunctionId ?? r.functionId);

          // Mapa de originalId → row atualizada pelo paste
          const pastedMap = new Map<string, FunctionRow>();
          newRows.forEach(r => pastedMap.set(r.originalFunctionId ?? r.functionId, r));

          // Linhas que NÃO vieram no paste (mantém ao final)
          const remaining = prev.filter(r => !pastedOriginalIds.includes(getOriginalId(r)));

          // Montar lista final: ordem do Excel primeiro, depois o restante
          const result: FunctionRow[] = [];
          pastedOriginalIds.forEach(origId => {
            result.push(pastedMap.get(origId)!);
          });
          result.push(...remaining);

          return result;
        });

        // Fix #3: mostrar quais funções foram puladas
        const skippedMsg = skippedNames.length > 0
          ? ` • Não encontradas: ${skippedNames.join(', ')}.`
          : '';

        toast({
          title: "Dados colados",
          description: `${newRows.length} linha(s) aplicada(s).${skippedMsg}`,
          variant: skippedNames.length > 0 ? "destructive" : "default",
        });
        setShowPasteModal(false);
        setPastedData("");
      } else {
        const msg = skippedNames.length > 0
          ? `Nenhuma função reconhecida: ${skippedNames.join(', ')}. Verifique os nomes.`
          : "Verifique o formato dos dados colados.";
        toast({ title: "Nenhum dado válido", description: msg, variant: "destructive" });
      }
    } catch {
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
    const [, month, day] = dateStr.split('-');
    return `${day}/${month}`;
  };

  const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const formatDateHeader = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return { date: `${day}/${month}`, dayName: DAY_NAMES[d.getDay()], isWeekend: d.getDay() === 0 || d.getDay() === 6 };
  };

  // Memoized: only recalculates when rows, dates or functions change
  const processedRanges = useMemo((): ProcessedRange[] => {
    const ranges: ProcessedRange[] = [];

    functionRows.forEach((row, rowIndex) => {
      if (dates.length === 0) return;

      // Get dates with daily rates > 0
      const datesWithRates = dates.filter(date => row.dailyRates[date] > 0);
      
      if (datesWithRates.length === 0) return;

      // Usar originalFunctionId se existir (linha vinda do Excel ou duplicada) ou extrair do ID
      let originalFunctionId = row.originalFunctionId || row.functionId;
      
      // Se não tem originalFunctionId, usar functionMap (O(1)) para resolver
      if (!originalFunctionId || originalFunctionId === row.functionId) {
        if (row.functionId.includes('-')) {
          const parts = row.functionId.split('-');
          for (let i = 1; i <= parts.length; i++) {
            const testId = parts.slice(0, i).join('-');
            if (functionMap.has(testId)) {
              originalFunctionId = testId;
              break;
            }
          }
        }
      }

      // Sort dates chronologically
      const sortedDates = datesWithRates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

      // Logic: Create records when value changes from previous
      
      // Check if all values are the same
      
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
            needsTicket: !!row.needsTicket,
            needsAccommodation: !!row.needsAccommodation,
            rowOrder: rowIndex,
          });
        }
      }
    });

    return ranges;
  }, [functionRows, dates, functionMap]);

  const processGrid = () => processedRanges;

  // Resumo da grade (barra acima da tabela): funções · pessoas-dia · registros
  const gridSummary = useMemo(() => {
    let pessoasDia = 0;
    for (const row of functionRows) {
      for (const date of dates) pessoasDia += row.dailyRates[date] || 0;
    }
    return { funcoes: functionRows.length, pessoasDia, registros: processedRanges.length };
  }, [functionRows, dates, processedRanges]);

  // Linhas com passagem marcada mas sem data de voo (ida ou retorno) — aviso
  const rowsMissingFlightDate = useMemo(
    () => functionRows.filter(r => r.needsTicket && (!r.dataVooIda || !r.dataVooRetorno)),
    [functionRows],
  );

  // Prévia agrupada por função (na ordem da grade)
  const previewGroups = useMemo(() => {
    const groups: { functionId: string; functionName: string; records: ProcessedRange[] }[] = [];
    const byId = new Map<string, number>();
    for (const range of processedRanges) {
      let idx = byId.get(range.functionId);
      if (idx === undefined) {
        const functionRow = functionRows.find(r => r.functionId === range.functionId);
        const functionName = functionRow?.functionName ||
          functionMap.get(range.functionId)?.name ||
          functionMap.get(range.functionId.split('-')[0])?.name ||
          'Função não encontrada';
        idx = groups.length;
        byId.set(range.functionId, idx);
        groups.push({ functionId: range.functionId, functionName, records: [] });
      }
      groups[idx].records.push(range);
    }
    return groups;
  }, [processedRanges, functionRows, functionMap]);

  const handleSubmit = async () => {
    // Valida o formulário (evento/período) antes de qualquer coisa: sem evento
    // o backend rejeitaria o lote inteiro e o erro apareceria só num toast.
    const valid = await form.trigger();
    if (!valid) {
      const semEvento = !form.getValues().eventId;
      toast({
        title: semEvento ? "Selecione o evento" : "Período incompleto",
        description: semEvento
          ? "Escolha o evento antes de criar as escalações."
          : "Informe as datas de início e término antes de criar as escalações.",
        variant: "destructive",
      });
      return;
    }

    const { eventId } = form.getValues();
    const ranges = processGrid();

    if (ranges.length === 0) {
      toast({
        title: "Nenhuma escalação na grade",
        description: "Configure pelo menos uma escalação antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const inclusionsPayload = ranges.map((range) => {
        const originalFunction = functions?.find(f => f.id === range.functionId);
        return {
          eventId,
          functionId: range.functionId,
          userId: originalFunction?.userId || user?.id,
          scheduleStartDate: range.startDate,
          scheduleEndDate: range.endDate,
          dailyRates: range.dailyRate,
          workDays: range.workDays,
          // dailyValue NÃO é fabricado aqui (antes era range.dailyRate*5000 =
          // R$50/dia chumbado). O valor financeiro é calculado no Planejado a
          // partir dos Valores Padrão / valores por função.
          dailyValue: 0,
          needsTicket: range.needsTicket,
          needsAccommodation: range.needsAccommodation,
          // status/fase NÃO vão no corpo (24/09): o servidor decide o fluxo e
          // toda vaga do lote nasce planejado/inclusao.
          rowOrder: range.rowOrder,
          // Voo por LINHA (range.travelInfo), não da 1ª linha da função
          flightDepartureDate: range.travelInfo.dataVooIda || null,
          flightArrivalSuggestedTime: range.travelInfo.horarioChegadaSugerido || null,
          flightReturnDate: range.travelInfo.dataVooRetorno || null,
          flightReturnSuggestedTime: range.travelInfo.horarioPartidaSugerido || null,
        };
      });

      // Uma única chamada transacional: ou todas entram, ou nenhuma
      const resp = await apiRequest("POST", "/api/team-inclusions/bulk", { inclusions: inclusionsPayload });
      const result = (await resp.json()) as { created: number; avisosDeAgenda?: unknown };
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events-with-inclusions"] });

      toast({
        title: `${result.created} escalação(ões) criada(s)`,
        variant: "success",
      });
      // Duas viagens no mesmo dia para alguém já escolhido na grade: aviso,
      // não erro — as vagas foram criadas.
      avisarAgenda(toast, result.avisosDeAgenda);

      form.reset();
      setFunctionRows([]);
      setDates([]);
      setShowGrid(false);
      localStorage.removeItem(draftKey);
      localStorage.removeItem(autoSaveKey);

    } catch (error: unknown) {
      // A transação garante que nada foi gravado — mostra a causa (inclusive o
      // 409 de conflito de agenda) e mantém a grade
      toast({
        title: "Erro ao criar escalações",
        description: apiErrorMessage(error, "Nenhuma escalação foi criada. Revise os dados e tente novamente."),
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Guarda de permissão: agora DEPOIS de todos os hooks
  if (!canEditGrid) {
    return (
      <div className="bg-card rounded-lg shadow-1 border border-border p-6">
        <p className="text-muted-foreground text-center">Você não tem permissão para usar a escalação por grade.</p>
      </div>
    );
  }

  return (
    <Card className="border-border shadow-1 rounded-xl overflow-hidden">
      <CardHeader className="border-b border-border px-6 py-4 bg-surface-muted border-b-2 border-b-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-soft text-primary shrink-0">
            <Grid3x3 className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-foreground">Escalação por Grade</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Em cada célula, informe quantas pessoas daquela função trabalham no dia. Cada pessoa vira 1 registro com os dias em que trabalha.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <Form {...form}>
          <div className="space-y-4">
            {/* Seleção de Evento */}
            <FormField
              control={form.control}
              name="eventId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-2xs font-bold text-muted-foreground uppercase tracking-wide">Evento<RequiredMark /></FormLabel>
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
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar evento…" />
                        <CommandList>
                          <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
                          <CommandGroup>
                            {events?.filter(e => e.status !== 'excluido' && e.status !== 'excluído').map((event) => (
                              <CommandItem
                                key={event.id}
                                value={event.name}
                                onSelect={() => {
                                  form.setValue("eventId", event.id, { shouldValidate: true, shouldDirty: true });
                                  setOpenEventCombobox(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    event.id === field.value
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )} aria-hidden="true" />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-2xs font-bold text-muted-foreground uppercase tracking-wide">Data Inicial<RequiredMark /></FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="h-9"
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
                    <FormLabel className="text-2xs font-bold text-muted-foreground uppercase tracking-wide">Data Final<RequiredMark /></FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="h-9"
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
            <button
              type="button"
              onClick={generateGrid}
              className="w-full h-10 flex items-center justify-center gap-2 text-primary-foreground text-sm font-semibold rounded-lg transition-all bg-primary hover:bg-primary-hover hover:-translate-y-0.5 hover:shadow-2 shadow-1"
              data-testid="button-generate-grid"
            >
              <Calendar className="w-4 h-4" aria-hidden="true" />
              {gridHasContent ? "Regerar Grade de Funções" : "Gerar Grade de Funções"}
            </button>

            {/* Confirmação: regerar por cima de uma grade preenchida */}
            <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Regerar a grade para o novo período?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A grade atual já tem dados. Você pode <strong>ajustar o período</strong> mantendo as
                    funções, os dados de viagem e as quantidades dos dias que continuam no novo período
                    (dias que saírem do período são descartados; dias novos entram vazios) — ou
                    <strong> recomeçar do zero</strong> com todas as funções vazias.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <button
                    type="button"
                    onClick={() => { setConfirmRegenerate(false); buildGrid(false); }}
                    className="h-10 px-4 text-sm font-medium text-danger border border-danger/25 rounded-md hover:bg-danger-soft transition-colors bg-card"
                  >
                    Recomeçar do zero
                  </button>
                  <AlertDialogAction onClick={() => buildGrid(true)}>
                    Ajustar período mantendo dados
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Grade de Escalação */}
            {showGrid && (
              <div className="space-y-3 border-t border-border mt-6 pt-6">
                {/* Header com controles */}
                <div className="flex flex-wrap justify-between items-center gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-700">Grade de Inclusões</span>
                    {/* Barra de resumo — atualiza a cada célula editada */}
                    <span className="text-2xs text-muted-foreground tabular-nums" aria-live="polite">
                      {gridSummary.funcoes} {gridSummary.funcoes === 1 ? 'função' : 'funções'}
                      {' · '}{gridSummary.pessoasDia} pessoas-dia
                      {' · '}{gridSummary.registros} {gridSummary.registros === 1 ? 'registro' : 'registros'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setShowHelp(!showHelp)}
                      className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border hover:border-slate-300 hover:bg-surface-muted rounded-lg transition-colors bg-card"
                    >
                      <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      Ajuda
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPasteModal(true)}
                      className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border hover:border-success/25 hover:text-success hover:bg-success-soft rounded-lg transition-colors bg-card"
                    >
                      <Upload className="w-3.5 h-3.5 text-success-strong" aria-hidden="true" />
                      Colar Excel
                    </button>
                    {selectedRows.size > 0 && (
                      <button
                        type="button"
                        onClick={deleteSelectedRows}
                        className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-danger border border-danger/25 hover:bg-danger-soft rounded-lg transition-colors bg-card"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Excluir ({selectedRows.size})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={openFunctionSelect}
                      className="h-8 px-3 flex items-center gap-1.5 text-xs font-semibold text-primary-foreground rounded-lg transition-colors bg-primary hover:bg-primary-hover shadow-1"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      Adicionar Função
                    </button>
                  </div>
                </div>

                {/* Seção de Ajuda */}
                <Collapsible open={showHelp}>
                  <CollapsibleContent>
                    <div className="bg-brand-soft p-4 rounded-lg border border-primary/25">
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <h4 className="font-semibold text-primary mb-2">Como preencher</h4>
                          <ul className="space-y-1 text-primary">
                            <li><strong>Célula do dia</strong>: número de pessoas daquela função trabalhando no dia (– = ninguém).</li>
                            <li><strong>Registros</strong>: cada pessoa vira 1 registro com os dias em que trabalha — veja a prévia abaixo da grade.</li>
                            <li><strong>Passagem / Hospedagem</strong>: marque quando a função precisa de logística; os dados de voo valem para toda a linha.</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-semibold text-primary mb-2">Recursos</h4>
                          <ul className="space-y-1 text-primary">
                            <li><strong>Menu de ações (⋯)</strong>: duplicar a função, copiar/colar dados de viagem, remover.</li>
                            <li><strong>Colar Excel</strong>: cola linhas copiadas de uma planilha (formato indicado no modal).</li>
                            <li><strong>Rascunho</strong>: salve e carregue a grade depois; o auto-save guarda por 1 hora.</li>
                            <li><strong>Regerar grade</strong>: mudar o período mantém os dias que continuam.</li>
                          </ul>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-primary/25">
                        <div className="flex items-center gap-4 text-xs text-primary">
                          <label className="flex items-center gap-2">
                            <Checkbox
                              checked={autoSave}
                              onCheckedChange={(checked) => setAutoSave(checked === true)}
                              className="w-3 h-3"
                            />
                            Auto-salvar ativo
                          </label>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
                {/* Aviso: passagem marcada sem data de voo */}
                {rowsMissingFlightDate.length > 0 && (
                  <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                    <span>
                      {rowsMissingFlightDate.length === 1
                        ? <>A função <strong>{rowsMissingFlightDate[0].functionName}</strong> está marcada com passagem mas não tem data de voo (ida e retorno).</>
                        : <>{rowsMissingFlightDate.length} funções estão marcadas com passagem sem data de voo (ida e retorno): <strong>{rowsMissingFlightDate.map(r => r.functionName).join(', ')}</strong>.</>}
                    </span>
                  </div>
                )}

                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto max-h-[550px]">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="bg-surface-muted sticky top-0">
                        <tr>
                          <th scope="col" className="px-2 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-12 min-w-[3rem] sticky left-0 bg-surface-muted z-20">
                            <Checkbox
                              checked={selectedRows.size === functionRows.length && functionRows.length > 0}
                              onCheckedChange={toggleSelectAll}
                              aria-label="Selecionar todas"
                            />
                          </th>
                          <th scope="col" className="px-3 py-2 text-left border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-[180px] min-w-[180px] max-w-[180px] sticky left-12 bg-surface-muted z-20">Função</th>
                          <th scope="col" className="px-3 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-20">
                            <div className="flex items-center justify-center gap-1">
                              <Ticket className="w-3 h-3" aria-hidden="true" />
                              <span>Passagem</span>
                            </div>
                          </th>
                          <th scope="col" className="px-3 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-20">
                            <div className="flex items-center justify-center gap-1">
                              🏨
                              <span>Hospedagem</span>
                            </div>
                          </th>
                          <th scope="col" className="px-3 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-24">Data Voo Ida</th>
                          <th scope="col" className="px-3 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold min-w-[120px]">Horário Chegada Sugerido</th>
                          <th scope="col" className="px-3 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-24">Data Voo Retorno</th>
                          <th scope="col" className="px-3 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold min-w-[120px]">Horário Partida Sugerido</th>
                          {dates.map(date => {
                            const { date: d, dayName, isWeekend } = formatDateHeader(date);
                            return (
                              <th scope="col" key={date} className={`px-2 py-2 text-center border-r border-border text-2xs uppercase tracking-widest font-semibold w-16 ${isWeekend ? 'bg-warning-soft/60 text-warning-strong' : 'bg-brand-soft/50 text-muted-foreground'}`}>
                                <div className="leading-none font-bold">{d}</div>
                                <div className="text-2xs mt-0.5 opacity-70 normal-case tracking-normal">{dayName}</div>
                              </th>
                            );
                          })}
                          <th scope="col" className="px-2 py-2 text-center border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-16">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {functionRows.map((row, rowIdx) => (
                          <tr key={row.functionId} className={`border-b border-border hover:bg-brand-soft/40 transition-colors ${rowIdx % 2 === 1 ? 'bg-surface-muted/50' : 'bg-card'}`}>
                            <td className="px-2 py-2 border-r border-border text-center bg-surface-muted sticky left-0 z-10 w-12 min-w-[3rem]">
                              <Checkbox
                                checked={selectedRows.has(row.functionId)}
                                onCheckedChange={() => toggleRowSelection(row.functionId)}
                                aria-label={`Selecionar ${row.functionName}`}
                                className="accent-primary"
                              />
                            </td>
                            <td className="px-3 py-2 border-r border-border font-semibold text-foreground bg-surface-muted sticky left-12 z-10 w-[180px] min-w-[180px] max-w-[180px]">
                              <span className="block truncate" title={row.functionName}>{row.functionName}</span>
                            </td>
                            <td className="px-2 py-2 border-r border-border text-center">
                              <span className="inline-flex items-center gap-1">
                                <Checkbox
                                  checked={row.needsTicket}
                                  onCheckedChange={(checked) => updateNeedsTicket(row.functionId, checked === true)}
                                  data-testid={`checkbox-needs-ticket-${row.functionId}`}
                                  aria-label={`Precisa de passagem — ${row.functionName}`}
                                  className="accent-primary"
                                />
                                {row.needsTicket && (!row.dataVooIda || !row.dataVooRetorno) && (
                                  <AlertTriangle
                                    className="w-3 h-3 text-warning-strong"
                                    role="img"
                                    aria-label="Passagem marcada sem data de voo"
                                  />
                                )}
                              </span>
                            </td>
                            <td className="px-2 py-2 border-r border-border text-center">
                              <Checkbox
                                checked={row.needsAccommodation}
                                onCheckedChange={(checked) => updateNeedsAccommodation(row.functionId, checked === true)}
                                data-testid={`checkbox-needs-accommodation-${row.functionId}`}
                                aria-label={`Precisa de hospedagem — ${row.functionName}`}
                                className="accent-primary"
                              />
                            </td>
                            <td className="px-2 py-2 border-r border-border">
                              <Input 
                                type="date"
                                value={row.dataVooIda} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'dataVooIda', e.target.value)}
                                className={`h-7 text-center text-xs rounded-lg transition-colors focus:ring-2 focus:ring-primary/25 focus:border-primary ${row.dataVooIda ? 'bg-brand-soft border-primary/40' : 'bg-card border-border'}`}
                              />
                            </td>
                            <td className="px-2 py-2 border-r border-border min-w-[120px]">
                              <Input 
                                value={row.horarioChegadaSugerido} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'horarioChegadaSugerido', e.target.value)}
                                placeholder="Ex: 14h30"
                                className={`h-7 text-center text-xs rounded-lg transition-colors focus:ring-2 focus:ring-primary/25 focus:border-primary w-full placeholder:text-muted-foreground ${row.horarioChegadaSugerido ? 'bg-brand-soft border-primary/40' : 'bg-card border-border'}`}
                                maxLength={15}
                              />
                            </td>
                            <td className="px-2 py-2 border-r border-border">
                              <Input 
                                type="date"
                                value={row.dataVooRetorno} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'dataVooRetorno', e.target.value)}
                                className={`h-7 text-center text-xs rounded-lg transition-colors focus:ring-2 focus:ring-primary/25 focus:border-primary ${row.dataVooRetorno ? 'bg-brand-soft border-primary/40' : 'bg-card border-border'}`}
                              />
                            </td>
                            <td className="px-2 py-2 border-r border-border min-w-[120px]">
                              <Input 
                                value={row.horarioPartidaSugerido} 
                                onChange={(e) => updateTravelInfo(row.functionId, 'horarioPartidaSugerido', e.target.value)}
                                placeholder="Ex: 18h00"
                                className={`h-7 text-center text-xs rounded-lg transition-colors focus:ring-2 focus:ring-primary/25 focus:border-primary w-full placeholder:text-muted-foreground ${row.horarioPartidaSugerido ? 'bg-brand-soft border-primary/40' : 'bg-card border-border'}`}
                                maxLength={15}
                              />
                            </td>
                            {dates.map((date, colIdx) => {
                              const { date: d, dayName, isWeekend } = formatDateHeader(date);
                              const val = row.dailyRates[date] || 0;
                              return (
                                <td key={date} className={`px-1 py-2 border-r border-border text-center ${isWeekend ? 'bg-warning-soft/30' : ''}`}>
                                  <QtyCell
                                    value={val}
                                    rowIdx={rowIdx}
                                    colIdx={colIdx}
                                    functionName={row.functionName}
                                    dayLabel={`${dayName} ${d}`}
                                    isWeekend={isWeekend}
                                    onChange={(v) => updateDailyRate(row.functionId, date, v)}
                                  />
                                </td>
                              );
                            })}
                            <td className="px-2 py-2 text-center">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" aria-label={`Ações da função ${row.functionName}`} className="h-7 w-7 p-0 text-muted-foreground hover:text-slate-700 hover:bg-muted rounded-lg transition-colors">
                                    <MoreHorizontal className="w-3 h-3" aria-hidden="true" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => duplicateFunction(row.functionId)}>
                                    <Copy className="w-3 h-3 mr-2" aria-hidden="true" />
                                    Duplicar Função Completa
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => duplicateScheduleOnly(row.functionId)}>
                                    <Calendar className="w-3 h-3 mr-2" aria-hidden="true" />
                                    Copiar para Nova Função
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => copyScheduleData(row.functionId)}>
                                    <Copy className="w-3 h-3 mr-2" aria-hidden="true" />
                                    Copiar Horários
                                  </DropdownMenuItem>
                                  {copiedSchedule && (
                                    <DropdownMenuItem onClick={() => pasteScheduleData(row.functionId)}>
                                      <Calendar className="w-3 h-3 mr-2" aria-hidden="true" />
                                      Colar Horários
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem 
                                    onClick={() => removeFunction(row.functionId)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="w-3 h-3 mr-2" aria-hidden="true" />
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
                <button
                  type="button"
                  onClick={openFunctionSelect}
                  disabled={dates.length === 0}
                  className="border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-brand-soft/60 rounded-xl w-full py-2.5 text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Adicionar Função à Grade
                </button>

                {/* Preview dos resultados */}
                {(() => {
                  const records = processedRanges;
                  return (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-muted border-b border-border">
                        <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">Prévia dos registros</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${records.length > 0 ? 'bg-brand-soft text-primary' : 'bg-muted text-muted-foreground'}`} aria-live="polite">
                          {records.length} {records.length === 1 ? 'registro' : 'registros'}
                        </span>
                      </div>
                      {/* Agrupada por função, sem altura máxima (nada fica escondido) */}
                      <div>
                        {records.length === 0 ? (
                          <p className="text-muted-foreground text-sm text-center py-4 italic">Nenhum registro configurado ainda.</p>
                        ) : (
                          previewGroups.map((group, gi) => (
                            <div key={group.functionId} className={gi > 0 ? 'border-t border-border' : ''}>
                              <div className="flex items-center justify-between px-4 py-1.5 bg-surface-muted/70">
                                <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" aria-hidden="true" />
                                  {group.functionName}
                                </span>
                                <span className="text-2xs text-muted-foreground tabular-nums">
                                  {group.records.length} {group.records.length === 1 ? 'registro' : 'registros'}
                                </span>
                              </div>
                              {group.records.map((range, index) => (
                                <div key={`${group.functionId}-${index}`} className={`flex items-center justify-between gap-3 pl-8 pr-4 py-1.5 text-sm ${index % 2 === 1 ? 'bg-surface-muted/40' : 'bg-card'}`}>
                                  <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{formatDiarias(range.dailyRate)}</span>
                                  <span className="text-xs text-muted-foreground font-medium shrink-0 tabular-nums">
                                    {formatDateForDisplay(range.startDate)} → {formatDateForDisplay(range.endDate)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Botões de ação */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={saveDraft}
                      className="flex-1 h-9 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-surface-muted hover:border-slate-300 transition-colors bg-card"
                      data-testid="button-save-draft"
                    >
                      <Save className="w-3.5 h-3.5" aria-hidden="true" />
                      Salvar Rascunho
                    </button>
                    <button
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
                      className="flex-1 h-9 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-surface-muted hover:border-slate-300 transition-colors bg-card"
                      data-testid="button-load-draft"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      Carregar Rascunho
                    </button>
                  </div>

                  <PastEventBanner show={eventoEncerrado} message={eventLock.bannerMessage(selectedEventId)} className="mb-2" />
                  <MotivoDesabilitado motivo={motivoBloqueio ?? (!selectedEventId ? "Selecione o evento para criar as escalações" : undefined)} desabilitado={isProcessing || processedRanges.length === 0 || !selectedEventId || eventoEncerrado}>
                    <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isProcessing || processedRanges.length === 0 || !selectedEventId || eventoEncerrado}
                   
                    className="w-full h-11 flex items-center justify-center gap-2 text-primary-foreground text-sm font-semibold rounded-lg transition-all bg-primary hover:bg-primary-hover hover:-translate-y-0.5 shadow-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0"
                    data-testid="button-save-grid"
                  >
                    <Save className="w-4 h-4" aria-hidden="true" />
                    {isProcessing
                      ? "Criando Escalações…"
                      : eventoEncerrado
                        ? (motivoBloqueio ?? "Evento encerrado — só o administrador altera")
                        : !selectedEventId
                          ? "Selecione o evento para criar"
                          : `Criar ${processedRanges.length} Escalação(ões)`}
                  </button>
                  </MotivoDesabilitado>
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
              {sortedFunctions.map(func => (
                <Button
                  key={func.id}
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
                  {!functions ? "Carregando funções…" : "Não há funções cadastradas."}
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
            <div className="bg-brand-soft p-3 rounded-lg border">
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
                  {sortedFunctions.map((func) => (
                    <SelectItem key={func.id} value={func.id}>
                      {func.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="bg-warning-soft p-3 rounded-lg border border-warning/25">
              <p className="text-xs text-warning">
                <strong>Importante:</strong> as quantidades por dia (quantas pessoas em cada célula) NÃO são copiadas — a nova linha começa vazia (–).
                Só os dados de viagem (datas/horários de voo, passagem e hospedagem) são copiados.
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
            <div className="bg-brand-soft p-3 rounded-lg border border-primary/25">
              <p className="text-sm font-semibold text-primary mb-2">📋 Formato Esperado:</p>
              <div className="text-xs text-primary font-mono bg-card p-2 rounded">
                Função | Data Voo Ida | Horário Chegada | Data Voo Retorno | Horário Partida | Passagem | Hospedagem | [Diárias por dia...]
              </div>
              <p className="text-xs text-primary mt-2">
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
                <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
                Processar e Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}