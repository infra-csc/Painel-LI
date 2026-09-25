// Extraído de system-settings.tsx em 25/09 (modularização): estado e regras
// das "Diárias por Função (legado)" — os 4 mapas de valores (casa/freela ×
// útil/fds), o predicado de sujeira, a edição inline célula a célula, o
// salvamento (PATCH/POST) e as entradas de histórico. A busca e o estado de
// edição ficam AQUI (e não na tabela) porque a tabela vive dentro de um
// Collapsible que desmonta ao fechar — se o estado fosse dela, fechar a zona
// legada zeraria a busca e a edição em andamento.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { User, Function as FunctionType, FunctionValue } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { parseBrNumber } from "@/lib/utils";
import { centavosToReais, formatCurrency, freelaOuCasa, toTitleCase, type HistoryEntry } from "./settings-utils";

export type SettingsTab = 'casa' | 'freela';
export type EditingField = 'wd' | 'we';

/** O que a tabela/linha precisa para editar uma célula inline. */
export interface FunctionValuesEditor {
  editingFunctionId: string | null;
  editingField: EditingField;
  editingFunctionValue: string;
  setEditingFunctionValue: (v: string) => void;
  editInputRef: RefObject<HTMLInputElement>;
  getCurrentValue: (fnId: string, field: EditingField) => string;
  startEditFunction: (fn: FunctionType, field?: EditingField) => void;
  confirmEditFunction: (fnId: string) => void;
  cancelEditFunction: () => void;
}

export interface UseFunctionValuesParams {
  allFunctions: FunctionType[];
  allFunctionValues: FunctionValue[];
  activeTab: SettingsTab;
  user: User | null;
}

export function useFunctionValues({ allFunctions, allFunctionValues, activeTab, user }: UseFunctionValuesParams) {
  const queryClient = useQueryClient();
  // functionDailyValues: casaWeekday value per function (legacy, kept for compatibility)
  const [functionDailyValues, setFunctionDailyValues] = useState<Record<string, string>>({});
  // Extended function values: weekend + freela variants
  const [fnWeekendValues, setFnWeekendValues] = useState<Record<string, string>>({});
  const [fnFreelaValues, setFnFreelaValues] = useState<Record<string, string>>({});
  const [fnFreelaWeekendValues, setFnFreelaWeekendValues] = useState<Record<string, string>>({});
  const [functionSearch, setFunctionSearch] = useState("");
  const [editingFunctionId, setEditingFunctionId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<EditingField>('wd');
  const [editingFunctionValue, setEditingFunctionValue] = useState<string>("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Reconstrói os 4 mapas de valores por função a partir do que está salvo.
  // Usado no carregamento e também pelo "Descartar" da barra flutuante.
  const resetFunctionValueStates = useCallback(() => {
    if (allFunctions.length === 0) return;
    const mapCasaWd: Record<string, string> = {};
    const mapCasaWe: Record<string, string> = {};
    const mapFreelaWd: Record<string, string> = {};
    const mapFreelaWe: Record<string, string> = {};
    for (const fn of allFunctions) {
      const fv = allFunctionValues.find(v => v.functionId === fn.id);
      mapCasaWd[fn.id] = fv ? centavosToReais(fv.dailyValue) : "0.00";
      mapCasaWe[fn.id] = fv ? centavosToReais(fv.dailyValueWeekend ?? 0) : "0.00";
      mapFreelaWd[fn.id] = fv ? centavosToReais(freelaOuCasa(fv.dailyValueFreela, fv.dailyValue)) : "0.00";
      mapFreelaWe[fn.id] = fv ? centavosToReais(freelaOuCasa(fv.dailyValueFreelaWeekend, fv.dailyValueWeekend)) : "0.00";
    }
    setFunctionDailyValues(mapCasaWd);
    setFnWeekendValues(mapCasaWe);
    setFnFreelaValues(mapFreelaWd);
    setFnFreelaWeekendValues(mapFreelaWe);
  }, [allFunctions, allFunctionValues]);

  useEffect(() => {
    resetFunctionValueStates();
  }, [resetFunctionValueStates]);

  useEffect(() => {
    if (editingFunctionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingFunctionId]);

  // Predicado único de "função com valor alterado" — antes estava duplicado
  // verbatim aqui e no contador do rodapé, e as cópias já tinham divergido
  const isFunctionDirty = (fn: FunctionType): boolean => {
    const fv = allFunctionValues.find(v => v.functionId === fn.id);
    const savedCasaWd = fv ? centavosToReais(fv.dailyValue) : "0.00";
    const savedCasaWe = fv ? centavosToReais(fv.dailyValueWeekend ?? 0) : "0.00";
    const savedFreelaWd = fv ? centavosToReais(freelaOuCasa(fv.dailyValueFreela, fv.dailyValue)) : "0.00";
    const savedFreelaWe = fv ? centavosToReais(freelaOuCasa(fv.dailyValueFreelaWeekend, fv.dailyValueWeekend)) : "0.00";
    return (
      parseBrNumber(functionDailyValues[fn.id] ?? "0") !== parseBrNumber(savedCasaWd) ||
      parseBrNumber(fnWeekendValues[fn.id] ?? "0") !== parseBrNumber(savedCasaWe) ||
      parseBrNumber(fnFreelaValues[fn.id] ?? "0") !== parseBrNumber(savedFreelaWd) ||
      parseBrNumber(fnFreelaWeekendValues[fn.id] ?? "0") !== parseBrNumber(savedFreelaWe)
    );
  };

  const saveFunctionValuesMutation = useMutation({
    mutationFn: async () => {
      const dirtyFns = allFunctions.filter(isFunctionDirty);
      const promises = dirtyFns.map(async fn => {
        const fv = allFunctionValues.find(v => v.functionId === fn.id);
        const casaWd = Math.round(parseBrNumber(functionDailyValues[fn.id] || "0") * 100);
        const casaWe = Math.round(parseBrNumber(fnWeekendValues[fn.id] || "0") * 100);
        const freelaWd = Math.round(parseBrNumber(fnFreelaValues[fn.id] || "0") * 100);
        const freelaWe = Math.round(parseBrNumber(fnFreelaWeekendValues[fn.id] || "0") * 100);
        if (fv) {
          return apiRequest("PATCH", `/api/function-values/${fv.id}`, {
            dailyValue: casaWd,
            dailyValueWeekend: casaWe,
            dailyValueFreela: freelaWd,
            dailyValueFreelaWeekend: freelaWe,
          });
        } else {
          return apiRequest("POST", "/api/function-values", {
            functionId: fn.id,
            dailyValue: casaWd,
            dailyValueWeekend: casaWe,
            dailyValueFreela: freelaWd,
            dailyValueFreelaWeekend: freelaWe,
            costAssistance: 0, mobility: 0,
            transport: 0, weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0,
          });
        }
      });
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/function-values"] });
    },
  });

  const dirtyFunctionCount = allFunctions.filter(isFunctionDirty).length;

  // Monta as entradas de histórico local para as Diárias por Função alteradas.
  // Precisa rodar ANTES do PATCH/POST, enquanto allFunctionValues ainda tem os
  // valores antigos (a invalidation do save recarrega a query).
  const buildFunctionHistoryEntries = (): HistoryEntry[] => {
    const now = new Date().toISOString();
    const userName = user?.name || "Admin";
    const entries: HistoryEntry[] = [];
    for (const fn of allFunctions.filter(isFunctionDirty)) {
      const fv = allFunctionValues.find(v => v.functionId === fn.id);
      const cells: { label: string; saved: string; current: string }[] = [
        { label: "Casa · Dia Útil", saved: fv ? centavosToReais(fv.dailyValue) : "0.00", current: functionDailyValues[fn.id] ?? "0" },
        { label: "Casa · Fim de Semana", saved: fv ? centavosToReais(fv.dailyValueWeekend ?? 0) : "0.00", current: fnWeekendValues[fn.id] ?? "0" },
        { label: "Freela · Dia Útil", saved: fv ? centavosToReais(freelaOuCasa(fv.dailyValueFreela, fv.dailyValue)) : "0.00", current: fnFreelaValues[fn.id] ?? "0" },
        { label: "Freela · Fim de Semana", saved: fv ? centavosToReais(freelaOuCasa(fv.dailyValueFreelaWeekend, fv.dailyValueWeekend)) : "0.00", current: fnFreelaWeekendValues[fn.id] ?? "0" },
      ];
      for (const c of cells) {
        if (parseBrNumber(c.current) !== parseBrNumber(c.saved)) {
          entries.push({
            timestamp: now,
            user: userName,
            field: `Diária por Função — ${toTitleCase(fn.name)} (${c.label})`,
            oldValue: formatCurrency(c.saved),
            newValue: formatCurrency(c.current),
          });
        }
      }
    }
    return entries;
  };

  function getCurrentValue(fnId: string, field: EditingField): string {
    if (activeTab === 'casa') {
      return field === 'wd' ? (functionDailyValues[fnId] ?? "0.00") : (fnWeekendValues[fnId] ?? "0.00");
    } else {
      return field === 'wd' ? (fnFreelaValues[fnId] ?? "0.00") : (fnFreelaWeekendValues[fnId] ?? "0.00");
    }
  }
  function startEditFunction(fn: FunctionType, field: EditingField = 'wd') {
    setEditingFunctionId(fn.id);
    setEditingField(field);
    setEditingFunctionValue(getCurrentValue(fn.id, field));
  }
  function confirmEditFunction(fnId: string) {
    const val = editingFunctionValue;
    if (activeTab === 'casa') {
      if (editingField === 'wd') setFunctionDailyValues(prev => ({ ...prev, [fnId]: val }));
      else setFnWeekendValues(prev => ({ ...prev, [fnId]: val }));
    } else {
      if (editingField === 'wd') setFnFreelaValues(prev => ({ ...prev, [fnId]: val }));
      else setFnFreelaWeekendValues(prev => ({ ...prev, [fnId]: val }));
    }
    setEditingFunctionId(null);
  }
  function cancelEditFunction() {
    setEditingFunctionId(null);
  }

  const editor: FunctionValuesEditor = {
    editingFunctionId,
    editingField,
    editingFunctionValue,
    setEditingFunctionValue,
    editInputRef,
    getCurrentValue,
    startEditFunction,
    confirmEditFunction,
    cancelEditFunction,
  };

  return {
    functionSearch,
    setFunctionSearch,
    resetFunctionValueStates,
    saveFunctionValuesMutation,
    dirtyFunctionCount,
    buildFunctionHistoryEntries,
    editor,
  };
}

export type FunctionValuesState = ReturnType<typeof useFunctionValues>;
