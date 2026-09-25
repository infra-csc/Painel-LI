/**
 * Seleção da Validação de escala (25/09 — extraída da página).
 * Selecionáveis no evento inteiro (a seleção sobrevive ao filtro) e só as
 * visíveis (para o "selecionar todas"); acima de BIG_SELECTION pede confirmação.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { groupRowsByEvent } from "@/components/scaling-validation/suggestions-list";
import type { SuggestionRow } from "@/components/scaling-validation/types";
import { BIG_SELECTION } from "./validation-shared";
import type { ValidationData } from "./use-validation-data";

export function useValidationSelection(data: Pick<ValidationData, "rows" | "rowById" | "filteredRows" | "selectableAll" | "validatableAll" | "readOnlyMode">, eventId: string) {
  const { rows, rowById, filteredRows, selectableAll, validatableAll, readOnlyMode } = data;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** "Selecionar todas" com mais de BIG_SELECTION vagas visíveis pede confirmação. */
  const [confirmSelectAll, setConfirmSelectAll] = useState(false);
  /**
   * Alvo da confirmação de validação: `null` = o lote selecionado; uma lista =
   * a(s) vaga(s) da ação por LINHA. A validação por linha NÃO mexe na seleção
   * do lote (o usuário pode ter montado um lote de 8 vagas antes de clicar).
   */
  const [validateTargetIds, setValidateTargetIds] = useState<string[] | null>(null);

  // Trocou de evento: limpa a seleção (evita agir em vaga que sumiu da lista).
  useEffect(() => { setSelected(new Set()); setValidateTargetIds(null); }, [eventId]);

  const visibleIds = useMemo(() => new Set(filteredRows.map((r) => r.id)), [filteredRows]);
  const selectableVisible = useMemo(() => new Set(filteredRows.filter((r) => selectableAll.has(r.id)).map((r) => r.id)), [filteredRows, selectableAll]);
  const effectiveSelected = useMemo(() => Array.from(selected).filter((id) => selectableAll.has(id)), [selected, selectableAll]);
  const effectiveSelectedSet = useMemo(() => new Set(effectiveSelected), [effectiveSelected]);
  const selectedRows = useMemo(() => effectiveSelected.map((id) => rowById.get(id)).filter((r): r is SuggestionRow => !!r), [effectiveSelected, rowById]);
  /** Selecionadas que ainda dá para validar (as já validadas ficam de fora do lote). */
  const validatableSelected = useMemo(() => effectiveSelected.filter((id) => validatableAll.has(id)), [effectiveSelected, validatableAll]);
  /** Alvo corrente da confirmação: a(s) vaga(s) da linha ou o lote selecionado. */
  const validateTarget = validateTargetIds ?? effectiveSelected;
  const validateIds = useMemo(
    () => validateTarget.filter((id) => validatableAll.has(id)),
    [validateTarget, validatableAll],
  );
  const validateRows = useMemo(
    () => validateIds.map((id) => rowById.get(id)).filter((r): r is SuggestionRow => !!r),
    [validateIds, rowById],
  );
  /** Lote da confirmação agrupado por evento (só importa no modo "Todos os eventos"). */
  const validateGroups = useMemo(() => groupRowsByEvent(validateRows), [validateRows]);
  const hiddenSelectedCount = useMemo(() => effectiveSelected.filter((id) => !visibleIds.has(id)).length, [effectiveSelected, visibleIds]);
  const singleSelected = selectedRows.length === 1 ? selectedRows[0] : null;
  // Em modo leitura não há seleção nem barra de ações — nem para o eventual
  // usuário que o servidor deixaria validar: a matriz §7 é quem manda na tela.
  const anyEditable = !readOnlyMode && rows.some((r) => r.canEdit);

  const toggle = useCallback((id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const allVisibleSelected = useMemo(() => Array.from(selectableVisible).every((id) => selected.has(id)), [selectableVisible, selected]);
  const applyToggleAll = (all: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      selectableVisible.forEach((id) => { if (all) n.delete(id); else n.add(id); });
      return n;
    });
  };
  const toggleAll = () => {
    // Marcar mais de BIG_SELECTION vagas de uma vez pede confirmação (04/09):
    // em "Todos os eventos" um clique no cabeçalho montava um lote de 200
    // vagas de eventos diferentes, e "Validar (200)" ficava a um clique.
    if (!allVisibleSelected && selectableVisible.size > BIG_SELECTION) { setConfirmSelectAll(true); return; }
    applyToggleAll(allVisibleSelected);
  };
  /** Tira UMA vaga da seleção (pedido enviado / validada) sem mexer no resto do lote. */
  const removeFromSelection = (id: string) => setSelected((prev) => {
    if (!prev.has(id)) return prev;
    const n = new Set(prev);
    n.delete(id);
    return n;
  });
  const removeManyFromSelection = (ids: string[]) => setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
  const clearSelection = () => setSelected(new Set());

  return {
    selected, confirmSelectAll, setConfirmSelectAll, validateTargetIds, setValidateTargetIds,
    selectableVisible, effectiveSelected, effectiveSelectedSet, selectedRows, validatableSelected,
    validateIds, validateRows, validateGroups, hiddenSelectedCount, singleSelected, anyEditable,
    toggle, toggleAll, applyToggleAll, allVisibleSelected, removeFromSelection, removeManyFromSelection, clearSelection,
  };
}

export type ValidationSelection = ReturnType<typeof useValidationSelection>;
