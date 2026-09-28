/**
 * Edição da grade da Sugestão de escala (25/09 — extraído da página):
 * alterar linha/quantidade, duplicar, remover (com confirmação quando há
 * quantidades) e o diálogo "Adicionar função".
 */
import { useCallback, useMemo, useState } from "react";
import type { Function as FunctionType } from "@shared/schema";
import { emptyGridRow, type SuggestionGridRow } from "@/components/scaling-validation/scaling-grid-utils";
import type { SuggestionDraft } from "./use-suggestion-draft";

export function useSuggestionGridEdit(draft: Pick<SuggestionDraft, "rows" | "setRows" | "rowsRef" | "dates">, sortedFunctions: FunctionType[]) {
  const { rows, setRows, rowsRef, dates } = draft;
  const [showAddFunction, setShowAddFunction] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(() => new Set());
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const changeRow = useCallback((rowId: string, patch: Partial<SuggestionGridRow>) => {
    setRows((prev) => prev.map((r) => {
      if (r.rowId !== rowId) return r;
      const next = { ...r, ...patch };
      // Veio dado de VIAGEM? Hotel entra junto (regra do dono, 28/08: "se vier
      // dados de logística já vem com hotel obrigatoriamente"). Só liga quando
      // o dado chega — quem desmarcar depois não é re-marcado ao editar hora.
      const trouxeViagem = (["transportModeIda", "transportModeVolta", "flightDepartureDate", "flightReturnDate", "flightArrivalSuggestedTime", "flightReturnSuggestedTime"] as const)
        .some((k) => k in patch && patch[k]);
      const tinhaViagem = !!(r.transportModeIda || r.transportModeVolta || r.flightDepartureDate || r.flightReturnDate || r.flightArrivalSuggestedTime || r.flightReturnSuggestedTime);
      if (trouxeViagem && !tinhaViagem && !("needsAccommodation" in patch)) next.needsAccommodation = true;
      // Passagem marcada → hotel junto (28/08: "todo mundo que tem passagem
      // tem hospedagem"). Desmarcar continua livre.
      if (patch.needsTicket === true && !("needsAccommodation" in patch)) next.needsAccommodation = true;
      return next;
    }));
  }, [setRows]);
  const changeQty = useCallback((rowId: string, date: string, value: number) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, quantities: { ...r.quantities, [date]: value } } : r)));
  }, [setRows]);
  const duplicateRow = useCallback((rowId: string) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.rowId === rowId);
      if (idx < 0) return prev;
      const src = prev[idx];
      const copy: SuggestionGridRow = { ...src, rowId: `${src.functionId}-copy-${Date.now()}`, quantities: { ...src.quantities } };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }, [setRows]);
  const removeRowNow = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
    setConfirmRemove(null);
  }, [setRows]);
  const removeRow = useCallback((rowId: string) => {
    const row = rowsRef.current.find((r) => r.rowId === rowId);
    const hasQty = row ? Object.values(row.quantities).some((q) => q > 0) : false;
    if (hasQty) { setConfirmRemove(rowId); return; } // pede confirmação: há quantidades preenchidas
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }, [setRows, rowsRef]);
  const rowToRemove = useMemo(() => rows.find((r) => r.rowId === confirmRemove), [rows, confirmRemove]);

  const presentFunctionIds = useMemo(() => new Set(rows.map((r) => r.functionId)), [rows]);
  /** Quantas funções do catálogo ainda não estão na grade (rótulo do "Adicionar todas que faltam"). */
  const missingFunctionsCount = useMemo(() => sortedFunctions.filter((f) => !presentFunctionIds.has(f.id)).length, [sortedFunctions, presentFunctionIds]);
  const toggleToAdd = (id: string) => setSelectedToAdd((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const openAddFunction = () => { setSelectedToAdd(new Set()); setShowAddFunction(true); };
  const addSelectedFunctions = () => {
    const chosen = sortedFunctions.filter((f) => selectedToAdd.has(f.id));
    if (chosen.length === 0) return;
    setRows((prev) => [...prev, ...chosen.map((f) => emptyGridRow(f.id, f.name, dates))]);
    setShowAddFunction(false);
  };
  const addAllFunctions = () => {
    setRows((prev) => {
      const present = new Set(prev.map((r) => r.functionId));
      const news = sortedFunctions.filter((f) => !present.has(f.id)).map((f) => emptyGridRow(f.id, f.name, dates));
      return [...prev, ...news];
    });
    setShowAddFunction(false);
  };

  return {
    changeRow, changeQty, duplicateRow, removeRow, removeRowNow, confirmRemove, setConfirmRemove, rowToRemove,
    presentFunctionIds, missingFunctionsCount,
    showAddFunction, setShowAddFunction, selectedToAdd, toggleToAdd, openAddFunction, addSelectedFunctions, addAllFunctions,
  };
}

export type SuggestionGridEdit = ReturnType<typeof useSuggestionGridEdit>;
