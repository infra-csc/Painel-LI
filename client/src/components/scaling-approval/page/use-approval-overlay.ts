/**
 * Overlay da Aprovação (Sheet + diálogos) — um único estado {id, mode, origin}
 * — e o deep-link `?request=<id>` do Histórico.
 * (25/09 — extraído de pages/scaling-approval.tsx)
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import type { useToast } from "@/hooks/use-toast";
import { scalingHref } from "@/lib/use-scaling-event";
import type { ChangeRequestItem } from "../types";
import { ALL, BASE_PATH, type ApprovalTab, type StatusFilter } from "./use-approval-filters";

export type OverlayMode = "closed" | "sheet" | "approve" | "reajustar" | "negar";
/**
 * `origin` guarda de ONDE a decisão foi aberta: da linha da fila ou de dentro
 * do detalhe. É o que faz "Voltar" devolver o usuário ao lugar certo — decidir
 * pela linha e cair num detalhe que ninguém pediu era parte do "às vezes o
 * detalhe aparece, às vezes não" que o dono viu.
 */
interface OverlayState { id: string | null; mode: OverlayMode; origin: "fila" | "detalhe" }
type OverlayAction =
  | { type: "open"; id: string }
  | { type: "mode"; mode: Exclude<OverlayMode, "closed">; origin?: "fila" | "detalhe" }
  | { type: "back" }        // fecha o diálogo e volta para onde veio
  | { type: "close" };      // fecha tudo (mantém o id para a animação de saída)

function overlayReducer(state: OverlayState, action: OverlayAction): OverlayState {
  switch (action.type) {
    case "open": return { id: action.id, mode: "sheet", origin: "detalhe" };
    case "mode": return state.id ? { ...state, mode: action.mode, origin: action.origin ?? state.origin } : state;
    case "back": return { ...state, mode: state.origin === "detalhe" ? "sheet" : "closed" };
    case "close": return { ...state, mode: "closed" };
  }
}

export function useApprovalOverlay({ canAccess, eventId, items, pendingItems, listLoading, pendingLoading, statusFilter, setStatusFilter, setTab, tabPickedByUser, toast }: {
  canAccess: boolean;
  eventId: string;
  items: ChangeRequestItem[];
  pendingItems: ChangeRequestItem[];
  listLoading: boolean;
  pendingLoading: boolean;
  statusFilter: StatusFilter;
  setStatusFilter: (s: StatusFilter) => void;
  setTab: (t: ApprovalTab) => void;
  tabPickedByUser: React.MutableRefObject<boolean>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  /** Deep-link do Histórico: `?request=<id>` → abre o Sheet daquele pedido e limpa o param (capturado no 1º render, antes de o hook de evento reescrever a URL). */
  const [deepLinkId, setDeepLinkId] = useState<string | null>(() => new URLSearchParams(searchString).get("request"));
  const [overlay, dispatch] = useReducer(overlayReducer, { id: null, mode: "closed", origin: "fila" });

  const openId = overlay.id;
  const openRequest = items.find((r) => r.id === openId) ?? pendingItems.find((r) => r.id === openId) ?? null;

  // ── Deep-link ?request= ──
  // Link de pedido manda para a Fila: o padrão automático da aba "aguardando
  // aprovação" não pode roubar a tela de quem veio por um link.
  useEffect(() => {
    if (!deepLinkId || !canAccess) return;
    tabPickedByUser.current = true;
    setTab("fila");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, canAccess]);
  /**
   * Status que estava escolhido antes de o deep-link ampliar para "todos"
   * (04/09). O link de um pedido já decidido abria o detalhe e deixava a fila
   * em "Todos os status" para sempre — ao fechar, a pessoa via decididos
   * misturados aos pendentes sem ter pedido isso. Devolvido quando o detalhe
   * fecha (não antes: o pedido aberto vem da lista ampliada).
   */
  const statusAntesDoDeepLink = useRef<StatusFilter | null>(null);
  const restaurarStatusDoDeepLink = () => {
    const anterior = statusAntesDoDeepLink.current;
    if (anterior === null) return;
    statusAntesDoDeepLink.current = null;
    setStatusFilter(anterior);
  };
  useEffect(() => {
    if (!deepLinkId || !canAccess || pendingLoading) return;
    const finish = () => {
      setDeepLinkId(null);
      setLocation(scalingHref(BASE_PATH, eventId), { replace: true });
    };
    if (pendingItems.some((r) => r.id === deepLinkId)) { dispatch({ type: "open", id: deepLinkId }); finish(); return; }
    // Não está pendente: amplia o filtro para "todos os status" e espera a lista.
    if (statusFilter !== ALL) { statusAntesDoDeepLink.current = statusFilter; setStatusFilter(ALL); return; }
    if (listLoading) return;
    if (items.some((r) => r.id === deepLinkId)) dispatch({ type: "open", id: deepLinkId });
    else {
      toast({ title: "Pedido não encontrado", description: "O pedido do link não existe mais ou não está neste evento.", variant: "destructive" });
      restaurarStatusDoDeepLink();
    }
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, canAccess, pendingLoading, pendingItems, statusFilter, listLoading, items, eventId, setLocation, toast]);

  const closeAll = () => { dispatch({ type: "close" }); restaurarStatusDoDeepLink(); };
  const openDetail = (r: ChangeRequestItem) => dispatch({ type: "open", id: r.id });
  /** Abre o pedido já no diálogo pedido (ações da própria linha da fila). */
  const openDetailWithMode = (r: ChangeRequestItem, mode: Exclude<OverlayMode, "closed">) => {
    dispatch({ type: "open", id: r.id });
    // Decidir pela LINHA abre só o diálogo (origin 'fila'): o detalhe atrás,
    // que ninguém pediu, era o que deixava a tela inconsistente.
    dispatch({ type: "mode", mode, origin: "fila" });
  };
  const reviewKind = overlay.mode === "reajustar" || overlay.mode === "negar" ? overlay.mode : null;

  return { overlay, dispatch, openRequest, closeAll, openDetail, openDetailWithMode, reviewKind };
}

export type ApprovalOverlay = ReturnType<typeof useApprovalOverlay>;
