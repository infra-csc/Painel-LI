export interface DashboardStats {
  totalInclusions: number;
  inScaling: number;
  waitingTickets: number;
  approved: number;
}

export interface TeamInclusionWithDetails {
  id: string;
  eventName: string;
  eventLocation: string;
  functionName: string;
  functionArea: string;
  collaboratorName?: string;
  scheduleStartDate: string;
  scheduleEndDate: string;
  dailyRates: number;
  needsTicket: boolean;
  status: string;
  phase: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  icon: string;
  phase: string;
  active: boolean;
  completed: boolean;
}
