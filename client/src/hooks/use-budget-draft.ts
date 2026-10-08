/**
 * Rascunho de edições do Planejado por USUÁRIO + evento — 25/09 (modularização);
 * no SERVIDOR desde 08/10.
 *
 * Os overrides esparsos (só os campos editados) ficam no rascunho até o envio
 * ao Realizado. Até 08/10 moravam só no localStorage: quem trocava de
 * computador perdia o que tinha ajustado. Decisão do dono: o rascunho fica no
 * servidor (`/api/budget-planned/rascunho`, por evento + usuário da sessão) e
 * aparece em qualquer computador.
 *
 *  - Carrega do servidor ao abrir/trocar de evento. Enquanto carrega, o que o
 *    usuário já digitou não se perde: entra por cima do que veio.
 *  - Salva com atraso de ~800 ms depois da última edição, e na hora ao trocar
 *    de evento, sair da tela, esconder ou fechar a aba.
 *  - Migração: rascunho no localStorage (formato v2) com o servidor VAZIO sobe
 *    para o servidor e o local é apagado. Servidor com rascunho manda.
 *  - Sem servidor (rede, 5xx): o localStorage vira a reserva — o rascunho
 *    continua salvo neste navegador e a tela avisa (`draftStatus === "local"`).
 *    A próxima gravação que der certo apaga a reserva.
 *
 * O estado (`budgetOverrides`) é a única fonte que o motor lê para recalcular;
 * a interface usada pela página não mudou (só ganhou `draftStatus` e
 * `draftSavedAt` para o selo da planilha).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { BudgetOverride, BudgetOverrides } from "@/components/budget/types";

// Reserva local por USUÁRIO + evento (a mesma chave do rascunho local de antes,
// que é também a fonte da migração). v2: formato ESPARSO. O formato antigo
// (objeto completo por linha) restaurava tudo como override e congelava o
// recálculo — por isso é DESCARTADO, nunca migrado às cegas. A chave só por
// evento (pré-23/09) fazia o rascunho de uma pessoa aparecer para outra no
// mesmo navegador: é ignorada e apagada.
export const draftStorageKey = (eventId: string, userId: string) => `budget-overrides-draft-v2:${userId}:${eventId}`;
const legacyDraftStorageKey = (eventId: string) => `budget-overrides-draft:${eventId}`;
const legacyV2DraftStorageKey = (eventId: string) => `budget-overrides-draft-v2:${eventId}`;

export const draftUrl = (eventId: string) => `/api/budget-planned/rascunho?eventId=${encodeURIComponent(eventId)}`;
/** Atraso entre a última edição e a gravação no servidor. */
export const DRAFT_SAVE_DELAY_MS = 800;

/**
 * Situação do rascunho: `carregando` (buscando no servidor), `salvando`
 * (edição esperando a gravação), `salvo` (o servidor tem o que está na tela)
 * ou `local` (o servidor não respondeu — salvo só neste navegador).
 */
export type DraftStatus = "carregando" | "salvando" | "salvo" | "local";

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

/** Limpa o que não é override (qtdDiarias saiu do modelo; lixo vira vazio). */
function sanitizeDraft(raw: unknown): BudgetOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: BudgetOverrides = {};
  for (const [id, o] of Object.entries(raw as Record<string, unknown>)) {
    if (!o || typeof o !== "object" || Array.isArray(o)) continue;
    const { qtdDiarias: _qtd, ...resto } = o as BudgetOverride & { qtdDiarias?: number };
    out[id] = resto;
  }
  return out;
}

export function readDraft(eventId: string, userId: string): BudgetOverrides {
  if (!eventId || !userId) return {};
  try {
    const raw = localStorage.getItem(draftStorageKey(eventId, userId));
    return raw ? sanitizeDraft(JSON.parse(raw)) : {};
  } catch {
    // rascunho corrompido ou localStorage indisponível — começa vazio
    return {};
  }
}

function writeLocalDraft(eventId: string, userId: string, overrides: BudgetOverrides): void {
  try {
    if (Object.keys(overrides).length === 0) localStorage.removeItem(draftStorageKey(eventId, userId));
    else localStorage.setItem(draftStorageKey(eventId, userId), JSON.stringify(overrides));
  } catch {
    // localStorage cheio ou indisponível — o rascunho segue apenas em memória
  }
}

function removeLocalDraft(eventId: string, userId: string): void {
  try { localStorage.removeItem(draftStorageKey(eventId, userId)); } catch { /* indisponível */ }
}

/** "17:20" — a hora local de uma gravação. */
export function draftTime(quando: string | Date): string {
  const d = typeof quando === "string" ? new Date(quando) : quando;
  return (Number.isNaN(d.getTime()) ? new Date() : d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** O que o usuário digitou durante a carga entra por cima do que veio do servidor. */
function mergeDrafts(base: BudgetOverrides, porCima: BudgetOverrides): BudgetOverrides {
  const out: BudgetOverrides = { ...base };
  for (const [id, o] of Object.entries(porCima)) out[id] = { ...base[id], ...o };
  return out;
}

export interface RascunhoDoPlanejado {
  budgetOverrides: BudgetOverrides;
  setBudgetOverrides: React.Dispatch<React.SetStateAction<BudgetOverrides>>;
  /** Aviso discreto de que um rascunho salvo foi restaurado no load. */
  draftRestored: boolean;
  setDraftRestored: React.Dispatch<React.SetStateAction<boolean>>;
  /** Remove do rascunho os itens já enviados com sucesso para o Realizado. */
  clearDraftEntries: (ids: string[]) => void;
  /** Onde o rascunho está (servidor, gravando, só neste navegador). */
  draftStatus: DraftStatus;
  /** "HH:MM" da última gravação no servidor (null sem rascunho salvo). */
  draftSavedAt: string | null;
}

interface Owner { eventId: string; userId: string }
interface Pending extends Owner { overrides: BudgetOverrides; json: string }

/** Rascunho vazio que o próprio hook põe no estado (congelado: nunca muda). */
const EMPTY_DRAFT: BudgetOverrides = Object.freeze({}) as BudgetOverrides;

export function useBudgetDraft(eventId: string, userId: string): RascunhoDoPlanejado {
  const { toast } = useToast();
  const [budgetOverrides, setBudgetOverrides] = useState<BudgetOverrides>(EMPTY_DRAFT);
  // Aviso discreto de que um rascunho salvo foi restaurado no load
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>(eventId && userId ? "carregando" : "salvo");
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  // Evento + usuário DONOS do rascunho em memória — impede gravar o rascunho
  // de um evento no de outro durante a troca de evento.
  const ownerRef = useRef<Owner>({ eventId: "", userId: "" });
  // Só grava depois que o rascunho do dono atual foi carregado.
  const readyRef = useRef(false);
  // Objeto que o próprio hook pôs no estado (não é edição do usuário).
  const internalRef = useRef<BudgetOverrides>(EMPTY_DRAFT);
  const editedWhileLoadingRef = useRef(false);
  // JSON do que o servidor tem — evita regravar o que acabou de chegar.
  const lastSentRef = useRef<string | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Gravações em fila: uma de cada vez, na ordem em que foram pedidas.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  /** Gravou no servidor: some a reserva local e o selo mostra a hora. */
  const confirmSaved = useCallback((p: Pending, updatedAt: string | null) => {
    removeLocalDraft(p.eventId, p.userId);
    const owner = ownerRef.current;
    if (owner.eventId !== p.eventId || owner.userId !== p.userId) return;
    lastSentRef.current = p.json;
    setDraftSavedAt(Object.keys(p.overrides).length === 0 ? null : draftTime(updatedAt ?? new Date()));
    setDraftStatus(pendingRef.current ? "salvando" : "salvo");
  }, []);

  /** Servidor fora: a reserva local guarda o rascunho neste navegador. */
  const keepLocal = useCallback((p: Pending) => {
    writeLocalDraft(p.eventId, p.userId, p.overrides);
    const owner = ownerRef.current;
    if (owner.eventId === p.eventId && owner.userId === p.userId) setDraftStatus("local");
  }, []);

  const send = useCallback((p: Pending): Promise<void> => {
    const task = async () => {
      try {
        let updatedAt: string | null = null;
        if (Object.keys(p.overrides).length === 0) {
          await apiRequest("DELETE", draftUrl(p.eventId));
        } else {
          const res = await apiRequest("PUT", draftUrl(p.eventId), { overrides: p.overrides });
          const body = (await res.json().catch(() => null)) as { updatedAt?: string } | null;
          updatedAt = body?.updatedAt ?? null;
        }
        confirmSaved(p, updatedAt);
      } catch {
        keepLocal(p);
      }
    };
    queueRef.current = queueRef.current.then(task, task);
    return queueRef.current;
  }, [confirmSaved, keepLocal]);

  /** Grava já o que estiver esperando o atraso. */
  const flush = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    void send(p);
  }, [send]);

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

  // Carrega o rascunho do servidor ao abrir e a cada troca de evento/usuário.
  useEffect(() => {
    flush(); // o que ficou pendente vai para o dono ANTERIOR
    ownerRef.current = { eventId, userId };
    readyRef.current = false;
    editedWhileLoadingRef.current = false;
    lastSentRef.current = null;
    internalRef.current = EMPTY_DRAFT;
    setBudgetOverrides(EMPTY_DRAFT);
    setDraftRestored(false);
    setDraftSavedAt(null);
    if (!eventId || !userId) { setDraftStatus("salvo"); return; }
    setDraftStatus("carregando");

    const controller = new AbortController();
    let active = true;
    (async () => {
      let fromServer: { overrides: BudgetOverrides; updatedAt?: string } | null = null;
      try {
        const res = await apiRequest("GET", draftUrl(eventId), undefined, { signal: controller.signal });
        const body = (await res.json()) as { overrides?: unknown; updatedAt?: string };
        fromServer = { overrides: sanitizeDraft(body?.overrides), updatedAt: body?.updatedAt };
      } catch {
        fromServer = null;
      }
      if (!active) return;

      const local = readDraft(eventId, userId);
      let base: BudgetOverrides;
      if (!fromServer) {
        // Sem servidor: o que este navegador guardou é o rascunho (reserva).
        base = local;
        lastSentRef.current = JSON.stringify(local);
        setDraftStatus("local");
      } else if (Object.keys(fromServer.overrides).length > 0) {
        // O servidor manda: o local (se houver) é mais velho ou igual.
        base = fromServer.overrides;
        lastSentRef.current = JSON.stringify(base);
        removeLocalDraft(eventId, userId);
        setDraftSavedAt(fromServer.updatedAt ? draftTime(fromServer.updatedAt) : null);
        setDraftStatus("salvo");
      } else {
        // Servidor vazio: um rascunho local (de antes de 08/10, ou de quando o
        // servidor caiu) SOBE agora — a gravação apaga o local se der certo.
        base = local;
        lastSentRef.current = "{}";
        setDraftStatus(Object.keys(local).length > 0 ? "salvando" : "salvo");
      }
      readyRef.current = true;
      const editedNow = editedWhileLoadingRef.current;
      setBudgetOverrides(prev => (editedNow ? mergeDrafts(base, prev) : base));
      setDraftRestored(Object.keys(base).length > 0);
    })();

    return () => { active = false; controller.abort(); };
  }, [eventId, userId, flush]);

  // A cada mudança: agenda a gravação no servidor (sempre para o dono atual).
  useEffect(() => {
    const owner = ownerRef.current;
    if (!owner.eventId || !owner.userId) return;
    if (budgetOverrides === internalRef.current) return;
    if (!readyRef.current) { editedWhileLoadingRef.current = true; return; }
    const json = JSON.stringify(budgetOverrides);
    if (json === lastSentRef.current && !pendingRef.current) return;
    pendingRef.current = { ...owner, overrides: budgetOverrides, json };
    setDraftStatus("salvando");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, DRAFT_SAVE_DELAY_MS);
  }, [budgetOverrides, flush]);

  // Sair da tela grava o pendente; esconder/fechar a aba também — com
  // `keepalive` (a página pode morrer antes da resposta) e a reserva local
  // escrita antes, para o caso de a requisição não chegar.
  useEffect(() => {
    const onHide = () => {
      const p = pendingRef.current;
      if (!p) return;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      pendingRef.current = null;
      writeLocalDraft(p.eventId, p.userId, p.overrides);
      const empty = Object.keys(p.overrides).length === 0;
      // Fora da fila de propósito: a página pode estar morrendo agora.
      fetch(draftUrl(p.eventId), {
        method: empty ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: empty ? undefined : JSON.stringify({ overrides: p.overrides }),
        credentials: "include",
        keepalive: true,
      })
        .then(async (res) => {
          if (!res.ok) { keepLocal(p); return; }
          const body = empty ? null : ((await res.json().catch(() => null)) as { updatedAt?: string } | null);
          confirmSaved(p, body?.updatedAt ?? null);
        })
        .catch(() => keepLocal(p));
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") onHide(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      flush(); // saiu da tela pelo menu: grava o que faltava
    };
  }, [flush, confirmSaved, keepLocal]);

  // Remove do rascunho os itens já enviados com sucesso para o Realizado
  const clearDraftEntries = useCallback((ids: string[]) => {
    setBudgetOverrides(prev => {
      const next = { ...prev };
      ids.forEach(id => delete next[id]);
      return next;
    });
  }, []);

  return { budgetOverrides, setBudgetOverrides, draftRestored, setDraftRestored, clearDraftEntries, draftStatus, draftSavedAt };
}

export default useBudgetDraft;
