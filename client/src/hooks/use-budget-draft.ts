/**
 * Rascunho de edições do Planejado por USUÁRIO + evento — 25/09 (modularização).
 *
 * Extraído de budget-planned.tsx: guarda os overrides esparsos no localStorage,
 * restaura ao trocar de evento e descarta rascunhos no formato antigo. O estado
 * (`budgetOverrides`) é a única fonte que o motor lê para recalcular.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { BudgetOverride, BudgetOverrides } from "@/components/budget/types";

// Rascunho de edições persistido por evento — sobrevive a F5 e à troca de evento.
// v2: formato ESPARSO (só campos editados). O formato antigo (objeto completo
// por linha) restaurava tudo como override e congelava o recálculo — por isso
// é DESCARTADO, nunca migrado às cegas.
// Chave por USUÁRIO + evento (23/09): a chave só por evento fazia o rascunho
// de uma pessoa aparecer para outra no mesmo navegador (mesmo padrão do
// formulário de inclusão em grade). Rascunho na chave antiga (só evento) é
// ignorado e apagado — nunca lido para outra conta.
export const draftStorageKey = (eventId: string, userId: string) => `budget-overrides-draft-v2:${userId}:${eventId}`;
const legacyDraftStorageKey = (eventId: string) => `budget-overrides-draft:${eventId}`;
const legacyV2DraftStorageKey = (eventId: string) => `budget-overrides-draft-v2:${eventId}`;

// Remove um rascunho no formato antigo; retorna true se ele existia e não há v2
// (caso em que o usuário merece um aviso único).
export function discardLegacyDraft(eventId: string, userId: string): boolean {
  if (!eventId) return false;
  try {
    // v2 sem usuário: some em silêncio (formato certo, chave antiga).
    localStorage.removeItem(legacyV2DraftStorageKey(eventId));
    const hadLegacy = localStorage.getItem(legacyDraftStorageKey(eventId)) !== null;
    if (!hadLegacy) return false;
    localStorage.removeItem(legacyDraftStorageKey(eventId));
    return localStorage.getItem(draftStorageKey(eventId, userId)) === null;
  } catch {
    return false;
  }
}

export function readDraft(eventId: string, userId: string): BudgetOverrides {
  if (!eventId || !userId) return {};
  try {
    const raw = localStorage.getItem(draftStorageKey(eventId, userId));
    const parsed: Record<string, BudgetOverride & { qtdDiarias?: number }> = raw ? JSON.parse(raw) : {};
    // Defesa em profundidade: qtdDiarias saiu do modelo de override
    Object.values(parsed).forEach(o => { if (o) delete o.qtdDiarias; });
    return parsed;
  } catch {
    // rascunho corrompido ou localStorage indisponível — começa vazio
    return {};
  }
}

export interface RascunhoDoPlanejado {
  budgetOverrides: BudgetOverrides;
  setBudgetOverrides: React.Dispatch<React.SetStateAction<BudgetOverrides>>;
  /** Aviso discreto de que um rascunho salvo foi restaurado no load. */
  draftRestored: boolean;
  setDraftRestored: React.Dispatch<React.SetStateAction<boolean>>;
  /** Remove do rascunho os itens já enviados com sucesso para o Realizado. */
  clearDraftEntries: (ids: string[]) => void;
}

export function useBudgetDraft(eventId: string, userId: string): RascunhoDoPlanejado {
  const { toast } = useToast();
  const [budgetOverrides, setBudgetOverrides] = useState<BudgetOverrides>(() => readDraft(eventId, userId));
  // Aviso discreto de que um rascunho salvo foi restaurado no load
  const [draftRestored, setDraftRestored] = useState<boolean>(() => Object.keys(readDraft(eventId, userId)).length > 0);
  // Evento (e usuário) dono do rascunho em memória — impede salvar o rascunho
  // de um evento na chave de outro durante a troca de evento.
  const draftEventRef = useRef(eventId);
  const draftUserRef = useRef(userId);

  // Rascunho no formato ANTIGO (pré-v2): descarta e avisa UMA vez por evento —
  // migrá-lo às cegas restauraria tudo como override e travaria o recálculo.
  const warnedLegacyDraftRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!eventId || warnedLegacyDraftRef.current.has(eventId)) return;
    if (discardLegacyDraft(eventId, userId)) {
      warnedLegacyDraftRef.current.add(eventId);
      toast({
        title: "Rascunho antigo descartado",
        description: "Um rascunho no formato antigo foi descartado para não travar os cálculos automáticos.",
      });
    }
  }, [eventId, userId, toast]);

  // Carrega o rascunho salvo ao trocar de evento
  useEffect(() => {
    if (draftEventRef.current === eventId && draftUserRef.current === userId) return;
    draftEventRef.current = eventId;
    draftUserRef.current = userId;
    const draft = readDraft(eventId, userId);
    setBudgetOverrides(draft);
    setDraftRestored(Object.keys(draft).length > 0);
  }, [eventId, userId]);

  // Salva o rascunho a cada mudança, sempre na chave do evento dono do rascunho
  useEffect(() => {
    const evento = draftEventRef.current;
    const usuario = draftUserRef.current;
    if (!evento || !usuario) return;
    try {
      if (Object.keys(budgetOverrides).length === 0) {
        localStorage.removeItem(draftStorageKey(evento, usuario));
      } else {
        localStorage.setItem(draftStorageKey(evento, usuario), JSON.stringify(budgetOverrides));
      }
    } catch {
      // localStorage cheio ou indisponível — o rascunho segue apenas em memória
    }
  }, [budgetOverrides]);

  // Remove do rascunho os itens já enviados com sucesso para o Realizado
  const clearDraftEntries = useCallback((ids: string[]) => {
    setBudgetOverrides(prev => {
      const next = { ...prev };
      ids.forEach(id => delete next[id]);
      return next;
    });
  }, []);

  return { budgetOverrides, setBudgetOverrides, draftRestored, setDraftRestored, clearDraftEntries };
}

export default useBudgetDraft;
