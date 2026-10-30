import { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, type RolePermissions } from "@/lib/role-utils";
import { ehPerfilHonorarios } from "@shared/roles";
import { CarregandoPagina } from "./app-loading";
import SemAcesso from "./sem-acesso";
import { useAcessoHonorarios } from "@/components/honorarios-ceno/api";

interface ProtectedRouteProps {
  children: ReactNode;
  permission: keyof RolePermissions;
  fallbackPath?: string;
  /**
   * Abre mesmo sem a permissão do papel quando a pessoa lança honorários da
   * cenotécnica (30/10, dono: quem lança tem acesso às telas de honorários).
   */
  ouQuemLancaHonorarios?: boolean;
}

export default function ProtectedRoute({
  children,
  permission,
  fallbackPath = "/",
  ouQuemLancaHonorarios = false,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const peloPapel = hasPermission(user, permission);
  const acessoHon = useAcessoHonorarios(!!user && !peloPapel && ouQuemLancaHonorarios);

  // Dentro do MainLayout: o esqueleto da página (07/10), não uma tela cheia —
  // o menu e o topo continuam no lugar.
  if (isLoading) return <CarregandoPagina />;

  if (!user) {
    return <Redirect to="/auth" />;
  }

  if (!peloPapel && ouQuemLancaHonorarios) {
    if (acessoHon.isLoading) return <CarregandoPagina />;
    if (acessoHon.data?.podePedir) return <>{children}</>;
  }

  if (!peloPapel) {
    // Perfil Honorários (23/10): abre uma tela só — a URL de qualquer outra
    // mostra "Sem acesso a esta tela" com o botão para a dele, em vez de
    // voltar em silêncio. Os outros papéis seguem indo para a primeira tela.
    if (ehPerfilHonorarios(user.role)) return <SemAcesso variante="tela" />;
    return <Redirect to={fallbackPath} />;
  }

  return <>{children}</>;
}
