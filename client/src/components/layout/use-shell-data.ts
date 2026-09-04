/**
 * DADOS DA CASCA — badges do menu e lista de pendências do sino.
 *
 * REGRA DE OURO: nada aqui inventa número. Cada contador sai de uma consulta
 * que o app JÁ faz e que o servidor autoriza para o usuário logado:
 *   • `/api/swap-requests`  → trocas pendentes (Passagens, Hospedagem, Escalação);
 *   • `/api/scaling-change-requests?status=pendente` → pedidos de ajuste/inclusão/
 *     exclusão aguardando decisão (só quem tem acesso à Aprovação de Escala).
 * O que não existe de forma barata e confiável NÃO vira badge (nem zero):
 *   • "vagas aguardando aprovação" exige `eventId` no GET /api/scaling-suggestions;
 *   • pendências de Financeiro/Cadastros não têm endpoint de contagem.
 *
 * As duas consultas são compartilhadas por menu e sino (mesma chave do React
 * Query → uma requisição só).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { getSeenState } from "@/lib/seenSwaps";
import { CHANGE_REQUEST_STATUS, CHANGE_REQUEST_TYPE_LABELS, type ChangeRequestType } from "@shared/scaling-validation-rules";
import { getSeenNotifications, markNotificationsSeen, SHELL_PREFS_EVENT } from "./shell-prefs";

/** Só os campos que a casca lê de GET /api/scaling-change-requests (o contrato completo mora na tela de Aprovação). */
interface PendingChangeRequest {
  id: string;
  eventId: string;
  requestType: ChangeRequestType;
  status: string;
  createdAt?: string | null;
  functionName?: string | null;
  eventName?: string | null;
  inclusionNumber?: number | null;
  canDecide?: boolean;
}

export interface ShellNotification {
  id: string;
  icon: string;
  /** Classes do quadradinho do ícone (fundo + cor). */
  iconClass: string;
  title: string;
  text: string;
  when: string;
  screen: string;
  href: string;
  isNew: boolean;
}

/** "há 2 h", "ontem", "há 4 dias" — sem biblioteca de datas. */
function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

export function useShellData() {
  const { user } = useAuth();
  const isPurchasing = !!user?.role && ["admin", "administrator", "administrador", "purchasing"].includes(user.role);
  const canSeeApprovals = hasPermission(user, "canAccessScalingApproval");

  // ── Trocas (mesma consulta que o menu já usava) ──
  const [seenState, setSeenState] = useState<Record<string, any>>(() => (user ? getSeenState(user.id) : {}));
  useEffect(() => {
    const handler = () => { if (user) setSeenState(getSeenState(user.id)); };
    window.addEventListener("swapSeenUpdated", handler);
    return () => window.removeEventListener("swapSeenUpdated", handler);
  }, [user]);

  const { data: swapRequests } = useQuery<any[]>({
    queryKey: ["/api/swap-requests"],
    queryFn: async () => {
      const r = await fetch("/api/swap-requests", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: teamInclusions } = useQuery<any[]>({
    queryKey: ["/api/team-inclusions"],
    enabled: !!isPurchasing,
  });

  // Mapa teamInclusionId → status (fallback; o status já vem embutido no swap).
  const inclusionStatusMap = useMemo(() => {
    const map: Record<string, string> = {};
    (teamInclusions ?? []).forEach((ti) => { map[ti.id] = ti.status; });
    return map;
  }, [teamInclusions]);

  // Status da inclusão do swap: prioriza o status embutido na resposta da API
  // (/api/swap-requests já faz JOIN com team_inclusions). Cai para o mapa só se
  // o backend antigo não tiver enviado. Swaps de inclusões excluídas são ignorados.
  const getSwapInclusionStatus = useCallback((s: any): string | undefined => {
    if (s.inclusion_deleted_at || s.inclusionDeletedAt) return undefined;
    const embedded = s.inclusion_status || s.inclusionStatus;
    if (embedded) return embedded;
    const inclId = s.team_inclusion_id || s.teamInclusionId;
    return inclusionStatusMap[inclId];
  }, [inclusionStatusMap]);

  // Passagens: swaps de inclusões com passagem comprada (com ou sem hospedagem)
  const ticketSwapCount = useMemo(() => {
    if (!isPurchasing || !swapRequests) return 0;
    const ticketStatuses = ["passagem_comprada", "hospedagem_passagem_comprada"];
    return swapRequests.filter((s) => {
      if (s.status !== "pendente") return false;
      const st = getSwapInclusionStatus(s);
      return !!st && ticketStatuses.includes(st);
    }).length;
  }, [swapRequests, isPurchasing, getSwapInclusionStatus]);

  // Hospedagem: swaps de inclusões com hospedagem comprada SEM passagem
  const accommodationSwapCount = useMemo(() => {
    if (!isPurchasing || !swapRequests) return 0;
    return swapRequests.filter((s) => s.status === "pendente" && getSwapInclusionStatus(s) === "hospedagem_comprada").length;
  }, [swapRequests, isPurchasing, getSwapInclusionStatus]);

  // Compras: trocas pendentes de escalações SEM passagem/hospedagem já comprada → badge na Escalação
  const scalingSwapCount = useMemo(() => {
    if (!isPurchasing || !swapRequests) return 0;
    const alreadyHandled = new Set(["passagem_comprada", "hospedagem_passagem_comprada", "hospedagem_comprada"]);
    return swapRequests.filter((s) => {
      if (s.status !== "pendente") return false;
      const st = getSwapInclusionStatus(s);
      // Sem este guard, status indefinido (inclusão excluída/não carregada) gera badge fantasma.
      return !!st && !alreadyHandled.has(st);
    }).length;
  }, [swapRequests, isPurchasing, getSwapInclusionStatus]);

  // Quem solicitou (não-compras): troca pendente ainda não vista, ou resposta das últimas 48h ainda não vista.
  const myScalingSwapsCount = useMemo(() => {
    if (!swapRequests || !user || isPurchasing) return 0;
    let count = 0;
    swapRequests.forEach((s) => {
      const requestedBy = (s as any).requested_by || s.requestedBy;
      if (requestedBy !== user.id) return;
      if (s.status === "pendente" && !seenState[s.id]?.pendingSeen) {
        count++;
      } else if (["aprovado", "rejeitado"].includes(s.status) && !seenState[s.id]?.respondedSeen) {
        const reviewedAt = (s as any).reviewed_at || s.reviewedAt;
        if (reviewedAt && Date.now() - new Date(reviewedAt).getTime() < 48 * 60 * 60 * 1000) count++;
      }
    });
    return count;
  }, [swapRequests, user, isPurchasing, seenState]);

  // ── Pedidos de ajuste pendentes ──
  // Chave própria (não a da tela de Aprovação): lá o erro precisa aparecer para
  // o usuário; aqui um 403 (quem não é aprovador nem papel autorizado) tem de
  // sumir em silêncio, sem badge e sem tela de erro.
  const { data: pendingRequests } = useQuery<PendingChangeRequest[]>({
    queryKey: ["shell", "pending-change-requests"],
    queryFn: async () => {
      const r = await fetch(`/api/scaling-change-requests?status=${CHANGE_REQUEST_STATUS.PENDENTE}`, { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!user && canSeeApprovals,
    staleTime: 60_000,
  });

  /** Pedidos que ESTE usuário pode decidir — é o que vira badge e aviso. */
  const myPendingRequests = useMemo(
    () => (pendingRequests ?? []).filter((r) => r.canDecide),
    [pendingRequests],
  );

  /**
   * Vagas validadas pela área esperando a decisão DESTE aprovador (04/09).
   * O badge da Aprovação contava só pedidos de ajuste/inclusão/exclusão; as
   * vagas "aguardando sua aprovação" — a fila principal da tela — ficavam de
   * fora, e o menu mostrava "3" com 22 vagas paradas esperando a pessoa.
   * Mesma fonte e mesma regra da tela (status validada + canDecide).
   */
  const { data: suggestionsForBadge } = useQuery<{ status?: string; canDecide?: boolean }[]>({
    queryKey: ["shell", "awaiting-approval"],
    queryFn: async () => {
      const r = await fetch("/api/scaling-suggestions", { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!user && canSeeApprovals,
    staleTime: 60_000,
  });
  const myAwaitingApprovalCount = useMemo(
    () => (suggestionsForBadge ?? []).filter((s) => s.status === SUGESTAO_STATUS.VALIDADA && s.canDecide === true).length,
    [suggestionsForBadge],
  );

  // ── Vistos (só apagam o ponto de "novo"; nunca mudam a contagem real) ──
  const [seenIds, setSeenIds] = useState<string[]>(() => getSeenNotifications(user?.id));
  useEffect(() => {
    const sync = () => setSeenIds(getSeenNotifications(user?.id));
    sync();
    window.addEventListener(SHELL_PREFS_EVENT, sync);
    return () => window.removeEventListener(SHELL_PREFS_EVENT, sync);
  }, [user?.id]);

  const swapTotal = isPurchasing
    ? ticketSwapCount + accommodationSwapCount + scalingSwapCount
    : myScalingSwapsCount;

  const notifications: ShellNotification[] = useMemo(() => {
    const seen = new Set(seenIds);
    const list: ShellNotification[] = [];

    for (const r of myPendingRequests) {
      const typeLabel = CHANGE_REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType;
      const vaga = r.inclusionNumber ? ` #${r.inclusionNumber}` : "";
      list.push({
        id: `cr:${r.id}`,
        icon: r.requestType === "inclusao" ? "edit_note" : r.requestType === "exclusao" ? "undo" : "fact_check",
        iconClass: "bg-brand-soft text-primary",
        title: `Pedido de ${typeLabel.toLowerCase()} aguardando sua decisão`,
        text: [r.functionName ? `${r.functionName}${vaga}` : `Vaga${vaga}`, r.eventName].filter(Boolean).join(" · "),
        when: relativeTime(r.createdAt),
        screen: "Aprovação de Escala",
        href: `/scaling-approval?eventId=${encodeURIComponent(r.eventId)}&request=${encodeURIComponent(r.id)}`,
        isNew: !seen.has(`cr:${r.id}`),
      });
    }

    // Trocas: uma linha por tela, com a contagem real. O id carrega o número —
    // quando ele muda, o aviso volta a ser "novo".
    const swapEntry = (count: number, screen: string, href: string, icon: string, text: string) => {
      if (count <= 0) return;
      const id = `swap:${href}:${count}`;
      list.push({
        id,
        icon,
        iconClass: "bg-amber-50 text-amber-700",
        title: `${count} ${count === 1 ? "troca pendente" : "trocas pendentes"} em ${screen}`,
        text,
        when: "",
        screen,
        href,
        isNew: !seen.has(id),
      });
    };

    if (isPurchasing) {
      swapEntry(ticketSwapCount, "Passagens", "/tickets", "swap_horiz", "Compras precisa confirmar a substituição");
      swapEntry(accommodationSwapCount, "Hospedagem", "/accommodations", "swap_horiz", "Compras precisa confirmar a substituição");
      swapEntry(scalingSwapCount, "Escalação", "/scaling", "swap_horiz", "Trocas sem passagem ou hospedagem tratadas");
    } else {
      swapEntry(myScalingSwapsCount, "Escalação", "/scaling", "swap_horiz", "Pedidos de troca que você abriu");
    }

    return list;
  }, [myPendingRequests, seenIds, isPurchasing, ticketSwapCount, accommodationSwapCount, scalingSwapCount, myScalingSwapsCount]);

  const markAllSeen = useCallback(() => {
    markNotificationsSeen(user?.id, notifications.map((n) => n.id));
  }, [user?.id, notifications]);

  /** Badge do sino: total de pendências REAIS (nunca "novidades não vistas"). */
  const pendingTotal = myPendingRequests.length + swapTotal;

  /** id da tela → badge. Item sem contador confiável simplesmente não aparece aqui. */
  const tabBadgeCount: Record<string, number> = {
    tickets: ticketSwapCount,
    accommodations: accommodationSwapCount,
    scaling: isPurchasing ? scalingSwapCount : myScalingSwapsCount,
    // Tudo que espera ação do aprovador: pedidos + vagas validadas aguardando ele.
    "scaling-approval": myPendingRequests.length + myAwaitingApprovalCount,
  };

  return { tabBadgeCount, notifications, pendingTotal, hasUnseen: notifications.some((n) => n.isNew), markAllSeen };
}

export type ShellData = ReturnType<typeof useShellData>;
