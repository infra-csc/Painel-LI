import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import type { TeamInclusion, Financial } from "@shared/schema";

export interface Notification {
  id: string;
  title: string;
  description: string;
  type: "approval" | "scaling" | "tickets" | "closure" | "inclusion";
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

  const notifications: Notification[] = [];

  if (!user || !teamInclusions) {
    return { notifications, totalCount: 0 };
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

  // Área de Produção - pode ver fechamentos pendentes (Tela 4)
  if (hasPermission(user, "canAccessScreen4")) {
    const pendingClosure = teamInclusions.filter(
      (inclusion) => inclusion.status === "fechamento"
    );
    if (pendingClosure.length > 0) {
      notifications.push({
        id: "pending-closure",
        title: "Fechamentos Pendentes",
        description: `${pendingClosure.length} fechamento(s) aguardando`,
        type: "closure",
        count: pendingClosure.length,
        route: "/closure",
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