import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import type { TeamInclusion, Financial, SwapRequest } from "@shared/schema";

export interface Notification {
  id: string;
  title: string;
  description: string;
  type: "approval" | "scaling" | "tickets" | "closure" | "inclusion" | "accommodation" | "production";
  count: number;
  route: string;
}

export function useNotifications() {
  const { user } = useAuth();

  const { data: teamInclusions } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions"],
    enabled: !!user,
  });

  const { data: financials } = useQuery<Financial[]>({
    queryKey: ["/api/financial"],
    enabled: !!user,
  });

  const { data: swapRequests } = useQuery<SwapRequest[]>({
    queryKey: ["/api/swap-requests"],
    queryFn: async () => {
      const r = await fetch("/api/swap-requests");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const notifications: Notification[] = [];

  if (!user || !teamInclusions) {
    return { notifications, totalCount: 0 };
  }

  const isPurchasing = ['admin', 'administrator', 'administrador', 'purchasing'].includes(user.role);

  // Compras — trocas de colaborador pendentes de aprovação
  if (isPurchasing && swapRequests) {
    const pendingSwaps = swapRequests.filter(s => s.status === 'pendente');
    if (pendingSwaps.length > 0) {
      notifications.push({
        id: "pending-swaps",
        title: "Trocas de Colaborador Pendentes",
        description: `${pendingSwaps.length} solicitação(ões) aguardando aprovação`,
        type: "scaling",
        count: pendingSwaps.length,
        route: "/scaling",
      });
    }
  }

  // Qualquer usuário — trocas que ele solicitou e foram aprovadas recentemente
  if (!isPurchasing && swapRequests) {
    const approvedForMe = swapRequests.filter(s =>
      s.status === 'aprovado' &&
      (s as any).requested_by === user.id &&
      // Aprovado nas últimas 48h
      s.reviewedAt && (Date.now() - new Date((s as any).reviewed_at || s.reviewedAt).getTime()) < 48 * 60 * 60 * 1000
    );
    if (approvedForMe.length > 0) {
      notifications.push({
        id: "swap-approved",
        title: "Troca de Colaborador Aprovada",
        description: `${approvedForMe.length} troca(s) de colaborador foram aprovadas`,
        type: "scaling",
        count: approvedForMe.length,
        route: "/scaling",
      });
    }
  }

  // Área de Produção - pode ver inclusões pendentes (Tela 1)
  if (hasPermission(user, "canAccessScreen1")) {
    const pendingInclusions = teamInclusions.filter(
      (inclusion) => inclusion.status === "rascunho" || inclusion.status === "pendente"
    );
    if (pendingInclusions.length > 0) {
      notifications.push({
        id: "pending-inclusions",
        title: "Inclusões Pendentes",
        description: `${pendingInclusions.length} inclusão(ões) aguardando processamento`,
        type: "inclusion",
        count: pendingInclusions.length,
        route: "/team-inclusion",
      });
    }
  }

  // Áreas de Função - pode ver escalações pendentes (Tela 2)
  if (hasPermission(user, "canAccessScreen2")) {
    const pendingScaling = teamInclusions.filter(
      (inclusion) => inclusion.status === "escalacao" && !inclusion.collaboratorId
    );
    if (pendingScaling.length > 0) {
      notifications.push({
        id: "pending-scaling",
        title: "Escalações Pendentes",
        description: `${pendingScaling.length} escalação(ões) aguardando colaboradores`,
        type: "scaling",
        count: pendingScaling.length,
        route: "/scaling",
      });
    }
  }

  // Área de Compras - pode ver passagens pendentes (Tela 3)
  if (hasPermission(user, "canAccessScreen3")) {
    const pendingTickets = teamInclusions.filter(
      (inclusion) => inclusion.status === "passagem" && inclusion.collaboratorId
    );
    if (pendingTickets.length > 0) {
      notifications.push({
        id: "pending-tickets",
        title: "Passagens Pendentes",
        description: `${pendingTickets.length} passagem(ns) aguardando compra`,
        type: "tickets",
        count: pendingTickets.length,
        route: "/tickets",
      });
    }
  }

  // Área de Produção - pode ver hospedagens pendentes (Tela 4)
  if (hasPermission(user, "canAccessScreen4")) {
    const pendingAccommodation = teamInclusions.filter(
      (inclusion) => inclusion.status === "hospedagem"
    );
    if (pendingAccommodation.length > 0) {
      notifications.push({
        id: "pending-accommodation",
        title: "Hospedagens Pendentes",
        description: `${pendingAccommodation.length} hospedagem(ns) aguardando`,
        type: "accommodation",
        count: pendingAccommodation.length,
        route: "/accommodations",
      });
    }
  }

  // Produção (cenotécnica) - pode ver escalações aguardando aprovação da produção
  const canApproveProduction = (user as any).canApproveCenotecnica ||
    ['admin', 'administrator', 'administrador'].includes(user.role);
  if (canApproveProduction) {
    const pendingProduction = teamInclusions.filter(
      (inclusion) => inclusion.status === "aguardando_producao"
    );
    if (pendingProduction.length > 0) {
      notifications.push({
        id: "pending-cenotecnica",
        title: "Aprovação de Cenotécnica",
        description: `${pendingProduction.length} escalação(ões) aguardando aprovação da Produção`,
        type: "production",
        count: pendingProduction.length,
        route: "/scaling",
      });
    }
  }

  // Área Financeira - pode ver aprovações pendentes (Tela 5)
  if (hasPermission(user, "canAccessScreen5")) {
    const pendingApprovals = teamInclusions.filter(
      (inclusion) => inclusion.status === "aprovacao" && inclusion.collaboratorId
    );
    if (pendingApprovals.length > 0) {
      notifications.push({
        id: "pending-approvals",
        title: "Aprovações Pendentes",
        description: `${pendingApprovals.length} aprovação(ões) financeira(s) aguardando`,
        type: "approval",
        count: pendingApprovals.length,
        route: "/approval",
      });
    }
  }

  const totalCount = notifications.reduce((sum, notification) => sum + notification.count, 0);

  return { notifications, totalCount };
}