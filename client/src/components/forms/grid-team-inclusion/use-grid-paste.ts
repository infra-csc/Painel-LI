/**
 * Colar do Excel na Escalação por Grade (25/09 — extraído do formulário).
 * Formato: Função | Data Voo Ida | Horário Chegada | Data Voo Retorno |
 * Horário Partida | Passagem | Hospedagem | [Diárias por dia...]
 */
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { Event, Function } from "@shared/schema";
import { normalizeStr, parseShortDate, type FunctionRow, type GridFormData } from "./grid-types";

type Toast = (t: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

export interface UseGridPasteArgs {
  form: UseFormReturn<GridFormData>;
  events: Event[] | undefined;
  functions: Function[] | undefined;
  dates: string[];
  setFunctionRows: React.Dispatch<React.SetStateAction<FunctionRow[]>>;
  toast: Toast;
}

export function useGridPaste({ form, events, functions, dates, setFunctionRows, toast }: UseGridPasteArgs) {
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedData, setPastedData] = useState<string>("");

  // Inferir ano: usar ano do evento se disponível, senão ano atual
  const inferYear = (): string => {
    const selectedEventId = form.getValues().eventId;
    let year = new Date().getFullYear().toString();
    if (selectedEventId && events) {
      const selectedEvent = events.find(e => e.id === selectedEventId);
      if (selectedEvent && selectedEvent.startDate) {
        year = selectedEvent.startDate.split('-')[0];
      }
    }
    return year;
  };

  const closePaste = () => {
    setShowPasteModal(false);
    setPastedData("");
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

        const dataVooIda             = parseShortDate(columns[1]?.trim() || "", inferYear());
        const horarioChegadaSugerido = columns[2]?.trim() || "";
        const dataVooRetorno         = parseShortDate(columns[3]?.trim() || "", inferYear());
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

  return { showPasteModal, setShowPasteModal, pastedData, setPastedData, closePaste, handlePasteFromExcel };
}

export type GridPaste = ReturnType<typeof useGridPaste>;
