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
  /** É aprovador da função ou o padrão (15/09) — o que vira aviso; `canDecide` inclui o admin. */
  eAprovador?: boolean;
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
  const canSeeValidation = hasPermission(user, "canAccessScalingValidation");
  // Gestor da cenotécnica (dono, 15/09): mesma regra da tela de Escalação.
  const aprovaCenotecnica = !!(user as any)?.canApproveCenotecnica || user?.role === "admin" || user?.role === "administrator" || user?.role === "administrador";

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

  // Status da inclusão do swap: vem embutido na resposta de /api/swap-requests
  // (JOIN com team_inclusions). A casca NÃO baixa mais a lista inteira de vagas
  // (~6,5 MB) como fallback — era o que travava a troca de tela (15/09).
  // Swaps de inclusões excluídas são ignorados.
  const getSwapInclusionStatus = useCallback((s: any): string | undefined => {
    if (s.inclusion_deleted_at || s.inclusionDeletedAt) return undefined;
    return s.inclusion_status || s.inclusionStatus || undefined;
  }, []);

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

  /**
   * Vagas de cenotécnica esperando o gestor, só de eventos que ainda não
   * terminaram — igual ao card "Com o gestor" em "Futuros". Contado no
   * servidor: antes a casca baixava todas as vagas em toda tela (15/09).
   */
  const { data: gestorData } = useQuery<{ count: number }>({
    queryKey: ["shell", "aguardando-gestor"],
    queryFn: async () => {
      const r = await fetch("/api/shell/aguardando-gestor", { credentials: "include" });
      if (!r.ok) return { count: 0 };
      return r.json();
    },
    enabled: aprovaCenotecnica,
    staleTime: 60_000,
  });
  const aguardandoGestorCount = aprovaCenotecnica ? (gestorData?.count ?? 0) : 0;

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
    // eAprovador, não canDecide (dono, 15/09): o admin que aprova troca de
    // colaborador pode decidir tudo, mas o aviso é do aprovador de escala.
    () => (pendingRequests ?? []).filter((r) => r.eAprovador === true),
    [pendingRequests],
  );

  /**
   * Pedidos que este usuário PODE decidir (inclui o admin) — é o contador da
   * barra lateral (dono, 15/09: "no sidebar tem que aparecer o que tem
   * pendente para o aprovador, para quem aprova troca e tudo mais; aparecia
   * antes, agora sumiu"). O aviso do sininho continua só para o aprovador de
   * fato (`myPendingRequests`); o contador do menu mostra tudo que dá para resolver.
   */
  const pedidosQuePodeDecidir = useMemo(
    () => (pendingRequests ?? []).filter((r) => r.canDecide === true),
    [pendingRequests],
  );

  /**
   * Vagas validadas pela área esperando a decisão DESTE aprovador (04/09).
   * O badge da Aprovação contava só pedidos de ajuste/inclusão/exclusão; as
   * vagas "aguardando sua aprovação" — a fila principal da tela — ficavam de
   * fora, e o menu mostrava "3" com 22 vagas paradas esperando a pessoa.
   * Mesma fonte e mesma regra da tela (status validada + canDecide).
   */
  const { data: suggestionsForBadge } = useQuery<{ status?: string; canDecide?: boolean; eAprovador?: boolean; canEdit?: boolean; pendingRequest?: unknown }[]>({
    queryKey: ["shell", "awaiting-approval"],
    queryFn: async () => {
      const r = await fetch("/api/scaling-suggestions", { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    // Mesma lista serve à Validação (vagas esperando a área validar).
    enabled: !!user && (canSeeApprovals || canSeeValidation),
    staleTime: 60_000,
  });
  const myAwaitingApprovalCount = useMemo(
    // Contador do menu: tudo que a pessoa pode decidir (canDecide inclui o admin).
    () => (suggestionsForBadge ?? []).filter((s) => s.status === SUGESTAO_STATUS.VALIDADA && s.canDecide === true).length,
    [suggestionsForBadge],
  );

  /**
   * Vagas esperando a área validar que ESTE usuário pode validar (dono, 15/09:
   * "todo mundo que tem que tomar alguma ação tem que ter um sinalizador no
   * menu, e o admin tem que ver tudo"). canEdit = admin ou validador da função;
   * vaga com pedido pendente está na mesa do aprovador, não conta aqui.
   */
  const myAwaitingValidationCount = useMemo(
    () => canSeeValidation
      ? (suggestionsForBadge ?? []).filter((s) => s.status === SUGESTAO_STATUS.PENDENTE && s.canEdit === true && !s.pendingRequest).length
      : 0,
    [suggestionsForBadge, canSeeValidation],
  );

  /** Aviso do sininho de vagas esperando aprovação: só o aprovador de fato (eAprovador, 15/09). */
  const avisoVagasAprovacao = useMemo(
    () => (suggestionsForBadge ?? []).filter((s) => s.status === SUGESTAO_STATUS.VALIDADA && s.eAprovador === true).length,
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

    // Uma linha por pendência agregada, com a contagem real. O id carrega o
    // número — quando ele muda, o aviso volta a ser "novo". O href leva direto
    // ao recorte que resolve (dono, 15/09: "clico e não aparece nada" — ia para
    // /scaling sem abrir a fila, e na própria tela o clique não fazia nada).
    const entrada = (count: number, chave: string, title: string, text: string, screen: string, href: string, icon: string, iconClass: string) => {
      if (count <= 0) return;
      const id = `${chave}:${count}`;
      list.push({ id, icon, iconClass, title, text, when: "", screen, href, isNew: !seen.has(id) });
    };
    const trocas = (n: number) => `${n} ${n === 1 ? "troca pendente" : "trocas pendentes"}`;
    const vagas = (n: number) => `${n} ${n === 1 ? "vaga" : "vagas"}`;
    const AMBAR = "bg-amber-50 text-amber-700";

    if (isPurchasing) {
      entrada(ticketSwapCount, "swap:/tickets", `${trocas(ticketSwapCount)} em Passagens`, "Compras precisa confirmar a substituição", "Passagens", "/tickets", "swap_horiz", AMBAR);
      entrada(accommodationSwapCount, "swap:/accommodations", `${trocas(accommodationSwapCount)} em Hospedagem`, "Compras precisa confirmar a substituição", "Hospedagem", "/accommodations", "swap_horiz", AMBAR);
      entrada(scalingSwapCount, "swap:/scaling", `${trocas(scalingSwapCount)} em Escalação`, "Trocas de colaborador esperando análise", "Escalação", "/scaling?fila=troca", "swap_horiz", AMBAR);
    } else {
      entrada(myScalingSwapsCount, "swap:/scaling", `${trocas(myScalingSwapsCount)} em Escalação`, "Pedidos de troca que você abriu", "Escalação", "/scaling?fila=troca", "swap_horiz", AMBAR);
    }
    entrada(aguardandoGestorCount, "gestor", `${vagas(aguardandoGestorCount)} aguardando o gestor`, "Cenotécnica esperando a sua aprovação", "Escalação", "/scaling?fila=gestor", "engineering", "bg-red-50 text-red-700");
    entrada(avisoVagasAprovacao, "aprovacao", `${vagas(avisoVagasAprovacao)} aguardando sua aprovação`, "Validadas pela área, esperando decisão", "Aprovação de Escala", "/scaling-approval", "approval", "bg-brand-soft text-primary");
    entrada(myAwaitingValidationCount, "validacao", `${vagas(myAwaitingValidationCount)} aguardando validação`, "Sugestões de escala para a área validar", "Validação de Escala", "/scaling-validation", "fact_check", "bg-brand-soft text-primary");

    return list;
  }, [aguardandoGestorCount, avisoVagasAprovacao, myAwaitingValidationCount, myPendingRequests, seenIds, isPurchasing, ticketSwapCount, accommodationSwapCount, scalingSwapCount, myScalingSwapsCount]);

  const markAllSeen = useCallback(() => {
    markNotificationsSeen(user?.id, notifications.map((n) => n.id));
  }, [user?.id, notifications]);

  /** Badge do sino: total de pendências REAIS (nunca "novidades não vistas"). */
  const pendingTotal = myPendingRequests.length + swapTotal + aguardandoGestorCount + avisoVagasAprovacao + myAwaitingValidationCount;

  /** id da tela → badge. Item sem contador confiável simplesmente não aparece aqui. */
  const tabBadgeCount: Record<string, number> = {
    tickets: ticketSwapCount,
    accommodations: accommodationSwapCount,
    // Trocas + cenotécnica aguardando o gestor (15/09).
    scaling: (isPurchasing ? scalingSwapCount : myScalingSwapsCount) + aguardandoGestorCount,
    // Tudo que espera ação do aprovador: pedidos + vagas validadas aguardando ele.
    "scaling-approval": canSeeApprovals ? pedidosQuePodeDecidir.length + myAwaitingApprovalCount : 0,
    "scaling-validation": myAwaitingValidationCount,
  };

  return { tabBadgeCount, notifications, pendingTotal, hasUnseen: notifications.some((n) => n.isNew), markAllSeen };
}

export type ShellData = ReturnType<typeof useShellData>;
