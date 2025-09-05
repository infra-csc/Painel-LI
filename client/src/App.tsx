import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import Dashboard from "@/pages/dashboard";
import Functions from "@/pages/functions";
import TeamInclusion from "@/pages/team-inclusion";
import Scaling from "@/pages/scaling";
import Tickets from "@/pages/tickets";
import Closure from "@/pages/closure";
import Approval from "@/pages/approval";
import Consultation from "@/pages/consultation";
import AdminUsers from "@/pages/admin-users";
import CollaboratorManagement from "@/pages/collaborator-management";
import AuthPage from "@/pages/auth-page";
import ResetPasswordPage from "@/pages/reset-password-page";
import PublicLog from "@/pages/public-log";
import UserRegistration from "@/pages/user-registration";
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
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/functions">
            <ProtectedRoute permission="canAccessScreen1">
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
          <Route path="/closure">
            <ProtectedRoute permission="canAccessScreen4">
              <Closure />
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
            <ProtectedRoute permission="canAccessAdminUsers">
              <CollaboratorManagement />
            </ProtectedRoute>
          </Route>
          <Route component={NotFound} />
        </>
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
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
