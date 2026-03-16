import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { SidebarProvider } from "@/contexts/sidebar-context";
import { ThemeProvider } from "@/contexts/theme-context";
import MainLayout from "@/components/layout/main-layout";
import Dashboard from "@/pages/dashboard";
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
            <Route path="/" component={Dashboard} />
            <Route path="/events">
              <ProtectedRoute permission="canAccessAdminUsers">
                <Events />
              </ProtectedRoute>
            </Route>
            <Route path="/functions">
              <ProtectedRoute permission="canAccessScreen0">
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
              <ProtectedRoute permission="canAccessScreen0">
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
              <ProtectedRoute permission="canAccessScreen0">
                <BudgetPlanned />
              </ProtectedRoute>
            </Route>
            <Route path="/budget-actual">
              <ProtectedRoute permission="canAccessScreen0">
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
              <ProtectedRoute permission="canAccessAdminUsers">
                <SystemSettings />
              </ProtectedRoute>
            </Route>
            <Route path="/invoices">
              <ProtectedRoute permission="canAccessScreen0">
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
