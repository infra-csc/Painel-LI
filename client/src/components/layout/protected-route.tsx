import { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, type RolePermissions } from "@/lib/role-utils";
import { ehPerfilHonorarios } from "@shared/roles";
import { CarregandoPagina } from "./app-loading";
import SemAcesso from "./sem-acesso";

interface ProtectedRouteProps {
  children: ReactNode;
  permission: keyof RolePermissions;
  fallbackPath?: string;
}

export default function ProtectedRoute({
  children,
  permission,
  fallbackPath = "/"
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  // Dentro do MainLayout: o esqueleto da página (07/10), não uma tela cheia —
  // o menu e o topo continuam no lugar.
  if (isLoading) return <CarregandoPagina />;

  if (!user) {
    return <Redirect to="/auth" />;
  }

  if (!hasPermission(user, permission)) {
    // Perfil Honorários (23/10): abre uma tela só — a URL de qualquer outra
    // mostra "Sem acesso a esta tela" com o botão para a dele, em vez de
    // voltar em silêncio. Os outros papéis seguem indo para a primeira tela.
    if (ehPerfilHonorarios(user.role)) return <SemAcesso variante="tela" />;
    return <Redirect to={fallbackPath} />;
  }

  return <>{children}</>;
}
