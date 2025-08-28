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
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/team-inclusion" component={TeamInclusion} />
      <Route path="/scaling" component={Scaling} />
      <Route path="/tickets" component={Tickets} />
      <Route path="/closure" component={Closure} />
      <Route path="/approval" component={Approval} />
      <Route path="/consultation" component={Consultation} />
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
