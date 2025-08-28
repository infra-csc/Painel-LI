import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import Dashboard from "@/pages/dashboard";
import TeamInclusion from "@/pages/team-inclusion";
import Scaling from "@/pages/scaling";
import Tickets from "@/pages/tickets";
import Closure from "@/pages/closure";
import Approval from "@/pages/approval";
import Consultation from "@/pages/consultation";
import Login from "@/pages/login";
import UserRegistration from "@/pages/user-registration";
import NotFound from "@/pages/not-found";
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

  if (!user) {
    return <Login />;
  }

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/team-inclusion" component={TeamInclusion} />
      <Route path="/scaling" component={Scaling} />
      <Route path="/tickets" component={Tickets} />
      <Route path="/closure" component={Closure} />
      <Route path="/approval" component={Approval} />
      <Route path="/consultation" component={Consultation} />
      <Route path="/user-registration" component={UserRegistration} />
      <Route component={NotFound} />
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
