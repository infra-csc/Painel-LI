import { Hotel, CheckCircle2, Clock, type LucideIcon } from "lucide-react";
import type { AccommodationStatusFilter } from "./types";

export interface SummaryCardsProps {
  counts: { total: number; purchased: number; pending: number };
  /** Filtro de status atual — o card correspondente aparece "ativo". */
  activeStatus: AccommodationStatusFilter;
  /** Clicar em um card aplica (ou remove, se já ativo) o filtro de status. */
  onSelectStatus: (status: AccommodationStatusFilter) => void;
}

interface CardDef {
  key: AccommodationStatusFilter;
  label: string;
  icon: LucideIcon;
  stripe: string;
  iconBg: string;
  iconTx: string;
  valTx: string;
}

const CARDS: CardDef[] = [
  { key: "all", label: "Total", icon: Hotel, stripe: "bg-slate-700", iconBg: "bg-slate-100", iconTx: "text-slate-600", valTx: "text-slate-700" },
  { key: "processed", label: "Registradas", icon: CheckCircle2, stripe: "bg-emerald-500", iconBg: "bg-emerald-50", iconTx: "text-emerald-600", valTx: "text-emerald-600" },
  { key: "pending", label: "Pendentes", icon: Clock, stripe: "bg-amber-400", iconBg: "bg-amber-50", iconTx: "text-amber-500", valTx: "text-amber-600" },
];

/** Cards de resumo clicáveis: Total / Registradas / Pendentes aplicam o filtro de status. */
export default function SummaryCards({ counts, activeStatus, onSelectStatus }: SummaryCardsProps) {
  const value: Record<AccommodationStatusFilter, number> = { all: counts.total, processed: counts.purchased, pending: counts.pending };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {CARDS.map((card) => {
        const active = activeStatus === card.key;
        const Icon = card.icon;
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelectStatus(active && card.key !== "all" ? "all" : card.key)}
            aria-pressed={active}
            title={card.key === "all" ? "Mostrar todas" : `Filtrar por ${card.label.toLowerCase()}`}
            data-testid={`summary-card-${card.key}`}
            className={`text-left bg-white rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary ring-1 ring-primary" : "border-slate-200"}`}
          >
            <div className={`h-0.5 w-full ${card.stripe}`} />
            <div className="px-4 py-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg} ${card.iconTx}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase leading-none mb-1">{card.label}</p>
                <p className={`text-[22px] font-bold leading-none ${card.valTx}`}>{value[card.key]}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
