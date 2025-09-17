import { Users, UserCheck, Plane, Calculator, CheckCircle } from "lucide-react";

interface WorkflowIndicatorProps {
  currentPhase: string;
}

export default function WorkflowIndicator({ currentPhase }: WorkflowIndicatorProps) {
  // Temporarily disable closure and approval steps
  const steps = [
    { id: "inclusao", name: "Inclusão", icon: Users },
    { id: "escalacao", name: "Escalação", icon: UserCheck },
    { id: "passagem", name: "Passagem", icon: Plane },
    // { id: "fechamento", name: "Fechamento", icon: Calculator },
    // { id: "aprovacao", name: "Aprovação", icon: CheckCircle },
  ];

  const getCurrentStepIndex = () => {
    return steps.findIndex(step => step.id === currentPhase);
  };

  const currentStepIndex = getCurrentStepIndex();

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6 mb-8">
      <h3 className="text-lg font-semibold text-foreground mb-4">Fluxo do Processo</h3>
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === currentStepIndex;
          const isCompleted = index < currentStepIndex;
          
          return (
            <div key={step.id} className="flex items-center">
              <div className="text-center">
                <div 
                  className={`workflow-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                  data-testid={`workflow-step-${step.id}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
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
