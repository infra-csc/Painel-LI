import { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, type RolePermissions } from "@/lib/role-utils";

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-lg text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  if (!hasPermission(user, permission)) {
    return <Redirect to={fallbackPath} />;
  }

  return <>{children}</>;
}