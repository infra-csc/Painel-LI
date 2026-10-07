import { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, type RolePermissions } from "@/lib/role-utils";
import { CarregandoPagina } from "./app-loading";

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
    return <Redirect to={fallbackPath} />;
  }

  return <>{children}</>;
}
