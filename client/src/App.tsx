import { Suspense, lazy } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { SidebarProvider } from "@/contexts/sidebar-context";
import { ThemeProvider } from "@/contexts/theme-context";
import MainLayout from "@/components/layout/main-layout";

// Carregadas de imediato: são o caminho crítico de entrada e são pequenas.
import AuthPage from "@/pages/auth-page";
import NotFound from "@/pages/not-found";

// Demais páginas sob demanda. Antes, as 21 telas eram importadas de forma
// estática e o build gerava um único bundle de ~2 MB — quem abria Passagens
// baixava e parseava Orçamento, Espelho Operacional e Configurações antes de
// ver qualquer coisa, inclusive telas que o papel dela nem acessa.
const Events                 = lazy(() => import("@/pages/events"));
const Functions              = lazy(() => import("@/pages/functions"));
const TeamInclusion          = lazy(() => import("@/pages/team-inclusion"));
const Scaling                = lazy(() => import("@/pages/scaling"));
const Tickets                = lazy(() => import("@/pages/tickets"));
const Accommodations         = lazy(() => import("@/pages/accommodations"));
const OperationalMirror      = lazy(() => import("@/pages/operational-mirror"));
const Approval               = lazy(() => import("@/pages/approval"));
const Consultation           = lazy(() => import("@/pages/consultation"));
const AdminUsers             = lazy(() => import("@/pages/admin-users"));
const CollaboratorManagement = lazy(() => import("@/pages/collaborator-management"));
const ResetPasswordPage      = lazy(() => import("@/pages/reset-password-page"));
const UserRegistration       = lazy(() => import("@/pages/user-registration"));
const BudgetPlanned          = lazy(() => import("@/pages/budget-planned"));
const BudgetActual           = lazy(() => import("@/pages/budget-actual"));
const BudgetComparison       = lazy(() => import("@/pages/budget-comparison"));
const RhControl              = lazy(() => import("@/pages/rh-control"));
const InvoicesPage           = lazy(() => import("@/pages/invoices"));
const FlashAccountPage       = lazy(() => import("@/pages/flash-account"));
const SystemSettings         = lazy(() => import("@/pages/system-settings"));
const CalendarPage           = lazy(() => import("@/pages/calendar"));

import ProtectedRoute from "@/components/layout/protected-route";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, getRoleLabel } from "@/lib/role-utils";
import type { RolePermissions, UserRole } from "@/lib/role-utils";

// Placeholder enquanto o chunk da página é baixado. Fica dentro do
// MainLayout, então a sidebar continua visível e navegável durante a troca —
// só a área de conteúdo mostra o esqueleto.
function PageFallback() {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6 animate-pulse">
      <div className="h-8 bg-muted rounded mb-4 w-1/3"></div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded"></div>
        ))}
      </div>
    </div>
  );
}

// Primeira página acessível na ordem do sidebar
const ORDERED_ROUTES: { path: string; permission: keyof RolePermissions }[] = [
  { path: "/user-registration", permission: "canAccessCadastros"     },
  { path: "/events",            permission: "canAccessCadastros"     },
  { path: "/calendar",          permission: "canAccessCalendar"      },
  { path: "/functions",         permission: "canAccessCadastros"     },
  { path: "/collaborators",     permission: "canAccessCollaborators" },
  { path: "/team-inclusion",    permission: "canAccessScreen1"       },
  { path: "/scaling",           permission: "canAccessScreen2"       },
  { path: "/tickets",           permission: "canAccessScreen3"       },
  { path: "/accommodations",    permission: "canAccessScreen3"       },
  { path: "/budget-planned",    permission: "canAccessFinanceiro"    },
  { path: "/budget-actual",     permission: "canAccessFinanceiro"    },
  { path: "/budget-comparison", permission: "canAccessScreen5"       },
  { path: "/rh-control",        permission: "canAccessScreen5"       },
  { path: "/invoices",          permission: "canAccessFinanceiro"    },
  { path: "/flash-account",     permission: "canAccessFinanceiro"    },
  { path: "/system-settings",   permission: "canAccessFinanceiro"    },
  { path: "/consultation",      permission: "canAccessScreen6"       },
  { path: "/admin-users",       permission: "canAccessAdminUsers"    },
];

function HomeRedirect() {
  const { user, logout } = useAuth();
  const first = ORDERED_ROUTES.find(r => hasPermission(user, r.permission));
  if (!first) {
    const roleLabel = getRoleLabel((user?.role || "production") as UserRole);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="text-4xl">🔒</div>
        <h2 className="text-xl font-semibold text-gray-800">Sem acesso</h2>
        <p className="text-gray-500 max-w-sm">
          Sua conta ainda não possui permissão para acessar nenhuma página.
          Entre em contato com o administrador do sistema.
        </p>
        <p className="text-sm text-gray-400">
          {user?.name} ({user?.email}) — {roleLabel}
        </p>
        <button
          onClick={logout}
          className="mt-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Sair
        </button>
      </div>
    );
  }
  return <Redirect to={first.path} />;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-lg text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    // Limite externo: cobre as rotas públicas (o /reset-password também é
    // carregado sob demanda). Para as telas protegidas quem responde primeiro
    // é o Suspense de dentro do MainLayout, preservando a sidebar.
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="animate-pulse text-lg text-muted-foreground">Carregando...</div>
        </div>
      }
    >
    <Switch>
      {/* Public routes */}
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      
      {/* Protected routes */}
      {user ? (
        <MainLayout>
          <Suspense fallback={<PageFallback />}>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/events">
              <ProtectedRoute permission="canAccessCadastros">
                <Events />
              </ProtectedRoute>
            </Route>
            <Route path="/functions">
              <ProtectedRoute permission="canAccessCadastros">
                <Functions />
              </ProtectedRoute>
            </Route>
            <Route path="/team-inclusion">
              <ProtectedRoute permission="canAccessScreen1">
                <TeamInclusion />
              </ProtectedRoute>
            </Route>
            <Route path="/scaling">
              <ProtectedRoute permission="canAccessScreen2">
                <Scaling />
              </ProtectedRoute>
            </Route>
            <Route path="/tickets">
              <ProtectedRoute permission="canAccessScreen3">
                <Tickets />
              </ProtectedRoute>
            </Route>
            <Route path="/accommodations">
              <ProtectedRoute permission="canAccessScreen3">
                <Accommodations />
              </ProtectedRoute>
            </Route>
            <Route path="/operational-mirror">
              <ProtectedRoute permission="canAccessScreen3">
                <OperationalMirror />
              </ProtectedRoute>
            </Route>
            <Route path="/approval">
              <ProtectedRoute permission="canAccessScreen5">
                <Approval />
              </ProtectedRoute>
            </Route>
            <Route path="/consultation">
              <ProtectedRoute permission="canAccessScreen6">
                <Consultation />
              </ProtectedRoute>
            </Route>
            <Route path="/user-registration">
              <ProtectedRoute permission="canAccessCadastros">
                <UserRegistration />
              </ProtectedRoute>
            </Route>
            <Route path="/admin-users">
              <ProtectedRoute permission="canAccessAdminUsers">
                <AdminUsers />
              </ProtectedRoute>
            </Route>
            <Route path="/collaborators">
              <ProtectedRoute permission="canAccessCollaborators">
                <CollaboratorManagement />
              </ProtectedRoute>
            </Route>
            <Route path="/budget-planned">
              <ProtectedRoute permission="canAccessFinanceiro">
                <BudgetPlanned />
              </ProtectedRoute>
            </Route>
            <Route path="/budget-actual">
              <ProtectedRoute permission="canAccessFinanceiro">
                <BudgetActual />
              </ProtectedRoute>
            </Route>
            <Route path="/budget-comparison">
              <ProtectedRoute permission="canAccessScreen5">
                <BudgetComparison />
              </ProtectedRoute>
            </Route>
            <Route path="/rh-control">
              <ProtectedRoute permission="canAccessScreen5">
                <RhControl />
              </ProtectedRoute>
            </Route>
            <Route path="/system-settings">
              <ProtectedRoute permission="canAccessFinanceiro">
                <SystemSettings />
              </ProtectedRoute>
            </Route>
            <Route path="/invoices">
              <ProtectedRoute permission="canAccessFinanceiro">
                <InvoicesPage />
              </ProtectedRoute>
            </Route>
            <Route path="/flash-account">
              <ProtectedRoute permission="canAccessFinanceiro">
                <FlashAccountPage />
              </ProtectedRoute>
            </Route>
            <Route path="/calendar" component={CalendarPage} />
            <Route component={NotFound} />
          </Switch>
          </Suspense>
        </MainLayout>
      ) : (
        <>
          <Route path="/" component={AuthPage} />
          <Route component={AuthPage} />
        </>
      )}
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <SidebarProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </SidebarProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
