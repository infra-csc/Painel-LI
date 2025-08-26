import { useQuery } from "@tanstack/react-query";
import { Users, Clock, Plane, CheckCircle } from "lucide-react";
import type { DashboardStats } from "@/lib/types";

export default function DashboardSummary() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/stats"],
    queryFn: async () => {
      // Mock stats calculation - in real app this would come from backend
      return {
        totalInclusions: 23,
        inScaling: 8,
        waitingTickets: 12,
        approved: 15,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card rounded-lg shadow-sm border border-border p-6 animate-pulse">
            <div className="h-8 bg-muted rounded mb-4"></div>
            <div className="h-6 bg-muted rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Total de Inclusões",
      value: stats?.totalInclusions || 0,
      icon: Users,
      color: "blue",
      testId: "stat-total-inclusions",
    },
    {
      title: "Em Escalação",
      value: stats?.inScaling || 0,
      icon: Clock,
      color: "yellow",
      testId: "stat-in-scaling",
    },
    {
      title: "Aguardando Passagem",
      value: stats?.waitingTickets || 0,
      icon: Plane,
      color: "purple",
      testId: "stat-waiting-tickets",
    },
    {
      title: "Aprovados",
      value: stats?.approved || 0,
      icon: CheckCircle,
      color: "green",
      testId: "stat-approved",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.title} className="bg-card rounded-lg shadow-sm border border-border p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className={`w-8 h-8 bg-${card.color}-100 rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 text-${card.color}-600`} />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-bold text-foreground" data-testid={card.testId}>
                  {card.value}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
