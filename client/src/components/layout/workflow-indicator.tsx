import { Users, UserCheck, Plane, Calculator, CheckCircle } from "lucide-react";
import { useLocation } from "wouter";

interface WorkflowIndicatorProps {
  currentPhase: string;
}

export default function WorkflowIndicator({ currentPhase }: WorkflowIndicatorProps) {
  const [, setLocation] = useLocation();
  
  // Temporarily disable closure and approval steps
  const steps = [
    { id: "inclusao", name: "Inclusão", icon: Users, route: "/team-inclusion" },
    { id: "escalacao", name: "Escalação", icon: UserCheck, route: "/scaling" },
    { id: "passagem", name: "Passagem", icon: Plane, route: "/tickets" },
    // { id: "fechamento", name: "Fechamento", icon: Calculator, route: "/closure" },
    // { id: "aprovacao", name: "Aprovação", icon: CheckCircle, route: "/approval" },
  ];

  const getCurrentStepIndex = () => {
    return steps.findIndex(step => step.id === currentPhase);
  };

  const currentStepIndex = getCurrentStepIndex();

  const handleStepClick = (route: string) => {
    setLocation(route);
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6 mb-8">
      <h3 className="text-lg font-semibold text-foreground mb-4">Fluxo do Processo</h3>
      <div className="flex items-center justify-center gap-16 max-w-3xl mx-auto">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === currentStepIndex;
          const isCompleted = index < currentStepIndex;
          
          return (
            <div key={step.id} className="flex items-center">
              <div className="text-center">
                <button
                  onClick={() => handleStepClick(step.route)}
                  className={`workflow-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} cursor-pointer hover:scale-105 transition-transform`}
                  data-testid={`workflow-step-${step.id}`}
                >
                  <Icon className="w-5 h-5" />
                </button>
                <p className={`text-xs mt-2 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.name}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div className={`workflow-connector ${isCompleted ? 'completed' : ''}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
