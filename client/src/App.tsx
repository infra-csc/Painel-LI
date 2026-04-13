import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { SidebarProvider } from "@/contexts/sidebar-context";
import { ThemeProvider } from "@/contexts/theme-context";
import MainLayout from "@/components/layout/main-layout";
import Events from "@/pages/events";
import Functions from "@/pages/functions";
import TeamInclusion from "@/pages/team-inclusion";
import Scaling from "@/pages/scaling";
import Tickets from "@/pages/tickets";
import Accommodations from "@/pages/accommodations";
import Approval from "@/pages/approval";
import Consultation from "@/pages/consultation";
import AdminUsers from "@/pages/admin-users";
import CollaboratorManagement from "@/pages/collaborator-management";
import AuthPage from "@/pages/auth-page";
import ResetPasswordPage from "@/pages/reset-password-page";
import UserRegistration from "@/pages/user-registration";
import BudgetPlanned from "@/pages/budget-planned";
import BudgetActual from "@/pages/budget-actual";
import BudgetComparison from "@/pages/budget-comparison";
import RhControl from "@/pages/rh-control";
import InvoicesPage from "@/pages/invoices";
import SystemSettings from "@/pages/system-settings";
import CalendarPage from "@/pages/calendar";
import NotFound from "@/pages/not-found";
import ProtectedRoute from "@/components/layout/protected-route";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import type { RolePermissions } from "@/lib/role-utils";

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
  { path: "/system-settings",   permission: "canAccessFinanceiro"    },
  { path: "/consultation",      permission: "canAccessScreen6"       },
  { path: "/admin-users",       permission: "canAccessAdminUsers"    },
];

function HomeRedirect() {
  const { user } = useAuth();
  const first = ORDERED_ROUTES.find(r => hasPermission(user, r.permission));
  return <Redirect to={first ? first.path : "/auth"} />;
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
    <Switch>
      {/* Public routes */}
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      
      {/* Protected routes */}
      {user ? (
        <MainLayout>
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
            <Route path="/calendar" component={CalendarPage} />
            <Route component={NotFound} />
          </Switch>
        </MainLayout>
      ) : (
        <>
          <Route path="/" component={AuthPage} />
          <Route component={AuthPage} />
        </>
      )}
    </Switch>
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
