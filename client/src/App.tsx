import { Suspense, lazy } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { SidebarProvider } from "@/contexts/sidebar-context";
import MainLayout from "@/components/layout/main-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import TrocarSenhaObrigatoria from "@/components/ui/trocar-senha-obrigatoria";

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
const CalculationRulesPage   = lazy(() => import("@/pages/calculation-rules"));
const SystemSettings         = lazy(() => import("@/pages/system-settings"));
const CalendarPage           = lazy(() => import("@/pages/calendar"));
const BaggageControlPage     = lazy(() => import("@/pages/baggage-control"));
const ScalingSuggestionPage  = lazy(() => import("@/pages/scaling-suggestion"));
const ScalingValidationPage  = lazy(() => import("@/pages/scaling-validation"));
const ScalingApprovalPage    = lazy(() => import("@/pages/scaling-approval"));
const ScalingEventViewPage   = lazy(() => import("@/pages/scaling-event-view"));
const SimulationPage         = lazy(() => import("@/pages/simulation"));
const PendenciasPage         = lazy(() => import("@/pages/pendencias"));

import ProtectedRoute from "@/components/layout/protected-route";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import type { RolePermissions } from "@/lib/role-utils";
import { TelaDeCarregamento, CarregandoPagina } from "@/components/layout/app-loading";
import SemAcesso from "@/components/layout/sem-acesso";

// Tema escuro removido (24/09): o app é só claro. Quem ainda tem a preferência
// antiga gravada não pode acordar com a classe `.dark` no <html>.
if (typeof window !== "undefined") {
  try { localStorage.removeItem("theme"); } catch { /* sem storage */ }
  document.documentElement.classList.remove("dark");
}

// Placeholder enquanto o chunk da página é baixado. Fica dentro do
// MainLayout, então a sidebar continua visível e navegável durante a troca —
// só a área de conteúdo mostra o esqueleto (mesma geometria do PageHeader, 07/10).
const PageFallback = CarregandoPagina;

// Primeira página acessível na ordem do sidebar
const ORDERED_ROUTES: { path: string; permission: keyof RolePermissions }[] = [
  { path: "/user-registration", permission: "canCreateUsers"         }, // espelha POST /api/users
  { path: "/events",            permission: "canAccessCadastros"     },
  { path: "/calendar",          permission: "canAccessCalendar"      },
  { path: "/functions",         permission: "canAccessCadastros"     },
  { path: "/collaborators",     permission: "canAccessCollaborators" },
  { path: "/scaling-suggestion", permission: "canAccessScalingSuggestion" },
  { path: "/scaling-validation", permission: "canAccessScalingValidation" },
  { path: "/scaling-approval",  permission: "canAccessScalingApproval"  },
  { path: "/scaling-event-view", permission: "canAccessScalingEventView" },
  { path: "/team-inclusion",    permission: "canAccessScreen1"       },
  { path: "/scaling",           permission: "canAccessScreen2"       },
  { path: "/tickets",           permission: "canAccessScreen3"       },
  { path: "/accommodations",    permission: "canAccessScreen3"       },
  { path: "/baggage-control",   permission: "canAccessBaggage"       },
  { path: "/budget-planned",    permission: "canAccessFinanceiro"    },
  { path: "/budget-actual",     permission: "canAccessFinanceiro"    },
  { path: "/budget-comparison", permission: "canAccessScreen5"       },
  { path: "/rh-control",        permission: "canAccessScreen5"       },
  { path: "/invoices",          permission: "canAccessFinanceiro"    },
  { path: "/flash-account",     permission: "canAccessFinanceiro"    },
  { path: "/calculation-rules", permission: "canAccessFinanceiro"    },
  { path: "/system-settings",   permission: "canAccessFinanceiro"    },
  { path: "/consultation",      permission: "canAccessScreen6"       },
  { path: "/admin-users",       permission: "canAccessAdminUsers"    },
  { path: "/simulation",        permission: "canAccessSimulation"    }, // "Ver como usuário" — só admin
];

function HomeRedirect() {
  const { user } = useAuth();
  const first = ORDERED_ROUTES.find(r => hasPermission(user, r.permission));
  // Sem nenhuma tela liberada: estado próprio da casca (07/10, sem-acesso.tsx).
  if (!first) return <SemAcesso />;
  return <Redirect to={first.path} />;
}

function Router() {
  const { user, isLoading } = useAuth();
  // Chave do ErrorBoundary interno: ao navegar para outra rota o boundary é
  // remontado e sai do estado de erro (sem isso, um erro numa tela "grudava"
  // até o usuário recarregar a página inteira).
  const [location] = useLocation();

  if (isLoading) return <TelaDeCarregamento />;

  return (
    // Limite externo: cobre as rotas públicas (o /reset-password também é
    // carregado sob demanda). Para as telas protegidas quem responde primeiro
    // é o Suspense de dentro do MainLayout, preservando a sidebar.
    <ErrorBoundary>
    <Suspense
      fallback={<TelaDeCarregamento texto="Carregando…" />}
    >
    <Switch>
      {/* Public routes */}
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      
      {/* Protected routes */}
      {user ? (
        <MainLayout>
          <Suspense fallback={<PageFallback />}>
          <ErrorBoundary key={location} variant="content">
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
            <Route path="/scaling-suggestion">
              <ProtectedRoute permission="canAccessScalingSuggestion">
                <ScalingSuggestionPage />
              </ProtectedRoute>
            </Route>
            <Route path="/scaling-validation">
              <ProtectedRoute permission="canAccessScalingValidation">
                <ScalingValidationPage />
              </ProtectedRoute>
            </Route>
            <Route path="/scaling-approval">
              <ProtectedRoute permission="canAccessScalingApproval">
                <ScalingApprovalPage />
              </ProtectedRoute>
            </Route>
            <Route path="/scaling-event-view">
              <ProtectedRoute permission="canAccessScalingEventView">
                <ScalingEventViewPage />
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
            <Route path="/baggage-control">
              <ProtectedRoute permission="canAccessBaggage">
                <BaggageControlPage />
              </ProtectedRoute>
            </Route>
            <Route path="/consultation">
              <ProtectedRoute permission="canAccessScreen6">
                <Consultation />
              </ProtectedRoute>
            </Route>
            <Route path="/user-registration">
              <ProtectedRoute permission="canCreateUsers">
                <UserRegistration />
              </ProtectedRoute>
            </Route>
            <Route path="/admin-users">
              <ProtectedRoute permission="canAccessAdminUsers">
                <AdminUsers />
              </ProtectedRoute>
            </Route>
            <Route path="/simulation">
              <ProtectedRoute permission="canAccessSimulation">
                <SimulationPage />
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
            <Route path="/calculation-rules">
              <ProtectedRoute permission="canAccessFinanceiro">
                <CalculationRulesPage />
              </ProtectedRoute>
            </Route>
            <Route path="/calendar" component={CalendarPage} />
            {/* Todas as pendências do usuário (15/09) — cada item já respeita a permissão. */}
            <Route path="/pendencias" component={PendenciasPage} />
            <Route component={NotFound} />
          </Switch>
          </ErrorBoundary>
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
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SidebarProvider>
          <TooltipProvider>
            <Toaster />
            {/* Senha provisória: o servidor responde 403 para tudo até a troca. */}
            <TrocarSenhaObrigatoria />
            <Router />
          </TooltipProvider>
        </SidebarProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
