/**
 * Rascunho da Escalação por Grade (25/09 — extraído do formulário): salvar e
 * carregar à mão, e o auto-save (2s após a última alteração, vale 1 hora).
 * Rascunhos são por usuário: dois usuários na mesma máquina não veem a grade
 * um do outro, e o rascunho de um não sobrescreve o do outro.
 */
import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { FunctionRow, GridFormData } from "./grid-types";

type Toast = (t: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

export interface UseGridDraftArgs {
  userId: string | undefined;
  form: UseFormReturn<GridFormData>;
  functionRows: FunctionRow[];
  setFunctionRows: (rows: FunctionRow[]) => void;
  dates: string[];
  setDates: (dates: string[]) => void;
  setShowGrid: (v: boolean) => void;
  toast: Toast;
}

export function useGridDraft({ userId, form, functionRows, setFunctionRows, dates, setDates, setShowGrid, toast }: UseGridDraftArgs) {
  const [autoSave, setAutoSave] = useState(true);
  const draftKey = `grid-draft-save:${userId ?? "anon"}`;
  const autoSaveKey = `grid-auto-save:${userId ?? "anon"}`;

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

  /** Botão "Carregar Rascunho": avisa quando não há nada para restaurar. */
  const loadDraftOrWarn = () => {
    const loaded = loadDraft();
    if (!loaded) {
      toast({
        title: "Nenhum rascunho encontrado",
        description: "Não há rascunho salvo para carregar.",
        variant: "destructive"
      });
    }
  };

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

  /** Depois do envio bem-sucedido: rascunho e auto-save saem. */
  const clearStored = () => {
    localStorage.removeItem(draftKey);
    localStorage.removeItem(autoSaveKey);
  };

  return { autoSave, setAutoSave, saveDraft, loadDraftOrWarn, clearStored };
}

export type GridDraft = ReturnType<typeof useGridDraft>;
