/**
 * Envio da Escalação por Grade (25/09 — extraído do formulário): decomposição
 * "1 registro por pessoa", resumo, prévia agrupada e o POST transacional em
 * /api/team-inclusions/bulk.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import type { Function } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { avisarAgenda } from "@/hooks/use-vaga-acoes";
import type { useToast } from "@/hooks/use-toast";
import type { FunctionRow, GridFormData, ProcessedRange } from "./grid-types";

type Toast = ReturnType<typeof useToast>["toast"];

export interface UseGridSubmitArgs {
  form: UseFormReturn<GridFormData>;
  functionRows: FunctionRow[];
  dates: string[];
  functions: Function[] | undefined;
  userId: string | undefined;
  toast: Toast;
  /** Limpa grade e rascunhos depois do envio bem-sucedido. */
  onCreated: () => void;
}

export function useGridSubmit({ form, functionRows, dates, functions, userId, toast, onCreated }: UseGridSubmitArgs) {
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  // O(1) lookup map: functionId → Function
  const functionMap = useMemo(() => {
    const m = new Map<string, Function>();
    functions?.forEach(f => m.set(f.id, f));
    return m;
  }, [functions]);

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

      // Pensar em pessoas individuais: quantas pessoas no máximo estão
      // trabalhando em qualquer dia.
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
    const ranges = processedRanges;

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
          userId: originalFunction?.userId || userId,
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
      onCreated();

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

  return { isProcessing, processedRanges, gridSummary, rowsMissingFlightDate, previewGroups, handleSubmit };
}

export type GridSubmit = ReturnType<typeof useGridSubmit>;
