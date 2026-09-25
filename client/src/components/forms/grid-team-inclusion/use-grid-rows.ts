/**
 * Linhas da Escalação por Grade (25/09 — extraído do formulário): gerar/regerar a
 * grade, editar células e viagem, adicionar/duplicar/remover funções, copiar e
 * colar horários entre linhas e a seleção para exclusão em lote.
 */
import { useCallback, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { Function } from "@shared/schema";
import { buildDateList, emptyFunctionRow, type CopiedSchedule, type FunctionRow, type GridFormData } from "./grid-types";

type Toast = (t: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

export interface UseGridRowsArgs {
  form: UseFormReturn<GridFormData>;
  functions: Function[] | undefined;
  sortedFunctions: Function[];
  toast: Toast;
}

export function useGridRows({ form, functions, sortedFunctions, toast }: UseGridRowsArgs) {
  const [functionRows, setFunctionRows] = useState<FunctionRow[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [showGrid, setShowGrid] = useState(false);
  const [showFunctionSelect, setShowFunctionSelect] = useState(false);
  const [copiedSchedule, setCopiedSchedule] = useState<CopiedSchedule | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  // "Gerar Grade" com grade já preenchida pede confirmação antes de regerar
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [selectedRowForScheduleCopy, setSelectedRowForScheduleCopy] = useState<FunctionRow | null>(null);
  const [showFunctionSelectForSchedule, setShowFunctionSelectForSchedule] = useState(false);

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
      rows = sortedFunctions.map(func => emptyFunctionRow(func.id, func.name, datesList));
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

    // Criar ID único para permitir múltiplas instâncias da mesma função.
    // Nova linha começa vazia (0 = "–"), como toda a grade.
    const uniqueId = `${selectedFunction.id}-${Date.now()}`;
    setFunctionRows(prev => [...prev, emptyFunctionRow(uniqueId, selectedFunction.name, dates)]);
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
        ? { ...r, ...copiedSchedule }
        : r
    ));

    toast({
      title: "Horários colados",
      description: `Horários colados em ${row.functionName} com sucesso.`,
    });
  };

  const createRowWithCopiedSchedule = (newFunctionId: string) => {
    if (!selectedRowForScheduleCopy) return;

    const selectedFunction = functions?.find(f => f.id === newFunctionId);
    if (!selectedFunction) return;

    // Criar ID único para permitir múltiplas instâncias
    const uniqueId = `${selectedFunction.id}-${Date.now()}`;

    // Nova linha com os horários copiados mas função diferente — as diárias
    // NÃO são copiadas: começa vazia.
    const src = selectedRowForScheduleCopy;
    const newRow: FunctionRow = {
      ...emptyFunctionRow(uniqueId, selectedFunction.name, dates),
      dataVooIda: src.dataVooIda,                           // Copia data voo ida
      horarioChegadaSugerido: src.horarioChegadaSugerido,   // Copia horário chegada
      dataVooRetorno: src.dataVooRetorno,                   // Copia data voo retorno
      horarioPartidaSugerido: src.horarioPartidaSugerido,   // Copia horário partida
      needsTicket: src.needsTicket,                         // Copia se precisa passagem
      needsAccommodation: src.needsAccommodation,           // Copia se precisa hospedagem
    };

    setFunctionRows(prev => [...prev, newRow]);
    setShowFunctionSelectForSchedule(false);
    setSelectedRowForScheduleCopy(null);

    toast({
      title: "Horários copiados",
      description: `Horários de ${src.functionName} copiados para ${selectedFunction.name}`,
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

  /** Depois do envio: a grade volta ao estado inicial. */
  const resetGrid = () => {
    setFunctionRows([]);
    setDates([]);
    setShowGrid(false);
  };

  return {
    functionRows, setFunctionRows, dates, setDates, showGrid, setShowGrid,
    gridHasContent, generateGrid, buildGrid, confirmRegenerate, setConfirmRegenerate,
    updateDailyRate, updateTravelInfo, updateNeedsTicket, updateNeedsAccommodation,
    showFunctionSelect, setShowFunctionSelect, openFunctionSelect, addSystemFunction,
    duplicateFunction, duplicateScheduleOnly, copiedSchedule, copyScheduleData, pasteScheduleData,
    selectedRowForScheduleCopy, showFunctionSelectForSchedule, setShowFunctionSelectForSchedule, createRowWithCopiedSchedule,
    removeFunction, selectedRows, toggleRowSelection, toggleSelectAll, deleteSelectedRows, resetGrid,
  };
}

export type GridRows = ReturnType<typeof useGridRows>;
