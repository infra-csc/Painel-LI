/**
 * Seleção múltipla da Escalação (25/09 — extraída de pages/scaling.tsx):
 * marcar/desmarcar linhas, marcar a página inteira e descartar IDs que saíram
 * da lista ou deixaram de ser elegíveis para o lote.
 */
import { useEffect, useMemo, useState } from "react";
import type { TeamInclusion } from "@shared/schema";
import type { ScalingData } from "../use-scaling-data";
import { getBulkConfirmBlockReason } from "../scaling-validation";

export function useScalingSelection(data: ScalingData) {
  const { teamInclusions } = data;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Seleção: descarta IDs que saíram da lista ou deixaram de ser elegíveis
  useEffect(() => {
    if (selectedIds.size === 0 || !teamInclusions) return;
    const byId = new Map(teamInclusions.map(i => [i.id, i]));
    const next = new Set(Array.from(selectedIds).filter(id => { const i = byId.get(id); return !!i && !getBulkConfirmBlockReason(i, data); }));
    if (next.size !== selectedIds.size) setSelectedIds(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamInclusions]);

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllVisible = (ids: string[], select: boolean) => setSelectedIds(prev => {
    const next = new Set(prev);
    ids.forEach(id => { if (select) next.add(id); else next.delete(id); });
    return next;
  });
  const selectedInclusions = useMemo(
    () => (teamInclusions || []).filter((i: TeamInclusion) => selectedIds.has(i.id)),
    [teamInclusions, selectedIds],
  );

  return { selectedIds, setSelectedIds, toggleSelect, toggleAllVisible, selectedInclusions };
}
