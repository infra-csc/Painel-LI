/**
 * Cartões de contagem dos Colaboradores (25/09 — extraídos de pages/collaborator-management.tsx).
 */
import { Clock, Home, IdCard, ShieldCheck, Users } from "lucide-react";
import type { CollaboratorsList } from "./use-collaborators-list";

export function CollaboratorsStats({ counts }: { counts: CollaboratorsList["counts"] }) {
  const { totalCount, pendingCount, approvedCount, freelaCount, casaCount } = counts;
  const cards = [
    { label: "Total",      value: totalCount,    stripe: "bg-slate-700",   icon: Users,          iconBg: "bg-muted", iconTx: "text-slate-600", valTx: "var(--foreground)" },
    { label: "Aprovados",  value: approvedCount, stripe: "bg-success-strong", icon: ShieldCheck,     iconBg: "bg-success-soft", iconTx: "text-success", valTx: "var(--success)" },
    { label: "Pendentes",  value: pendingCount,  stripe: "bg-warning-strong",   icon: Clock,          iconBg: "bg-warning-soft",  iconTx: "text-warning-strong", valTx: "var(--warning)" },
    { label: "Freelancers", value: freelaCount,  stripe: "bg-primary",    icon: IdCard,         iconBg: "bg-brand-soft",   iconTx: "text-primary",  valTx: "var(--primary)" },
    { label: "Casa",       value: casaCount,     stripe: "bg-primary",  icon: Home,           iconBg: "bg-brand-soft", iconTx: "text-primary", valTx: "var(--primary)" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(card => (
        <div key={card.label} className="bg-card rounded-xl border border-border shadow-1 overflow-hidden">
          <div className={`h-1 w-full ${card.stripe}`} />
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.iconBg} ${card.iconTx}`}>
                <card.icon className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <p className="text-2xs font-bold tracking-widest text-muted-foreground uppercase mb-0.5">{card.label}</p>
            <p className="text-2xl font-bold leading-none" style={{ color: card.valTx }}>{card.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
