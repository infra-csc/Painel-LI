/**
 * Cartões de indicadores de Eventos (28/09, extraídos de pages/events.tsx):
 * Total / Planejados / Em andamento / Concluídos. Cada cartão também é um
 * filtro de status (`aria-pressed`). Cores semânticas por status — não é a cor
 * de marca por tela.
 */
import { Calendar, CalendarCheck, CalendarX, List } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EventsStats {
  total: number;
  planejado: number;
  emAndamento: number;
  concluido: number;
}

export interface EventsKpisProps {
  stats: EventsStats;
  /** Valor atual do filtro de status (o cartão cujo `filter` bate fica ativo). */
  statusFilter: string;
  onFilter: (status: string) => void;
}

export function EventsKpis({ stats, statusFilter, onFilter }: EventsKpisProps) {
  const cards = [
    { label: "Total", value: stats.total, icon: List, filter: "active", tw: { text: "text-primary", border: "border-t-primary", activeBg: "bg-brand-soft", ring: "ring-ring/25" } },
    { label: "Planejados", value: stats.planejado, icon: Calendar, filter: "planejado", tw: { text: "text-primary", border: "border-t-primary", activeBg: "bg-brand-soft", ring: "ring-ring/25" } },
    { label: "Em andamento", value: stats.emAndamento, icon: CalendarCheck, filter: "em andamento", tw: { text: "text-warning-strong", border: "border-t-warning-strong", activeBg: "bg-warning-soft", ring: "ring-warning-strong/25" } },
    { label: "Concluídos", value: stats.concluido, icon: CalendarX, filter: "concluído", tw: { text: "text-success-strong", border: "border-t-success-strong", activeBg: "bg-success-soft", ring: "ring-success-strong/25" } },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      {cards.map(c => {
        const isActive = statusFilter === c.filter;
        return (
          <button
            key={c.label}
            type="button"
            aria-pressed={isActive}
            aria-label={`Filtrar por ${c.label}: ${c.value}`}
            onClick={() => onFilter(c.filter)}
            className={cn(
              "w-full text-left rounded-xl overflow-hidden border-t-[3px] px-4 sm:px-5 py-4 flex justify-between items-start transition-all duration-[180ms] hover:-translate-y-0.5",
              c.tw.border,
              isActive ? cn(c.tw.activeBg, "ring-2", c.tw.ring, "shadow-2") : "bg-card shadow-1 hover:shadow-2",
            )}
          >
            <div>
              <p className={cn("text-2xs font-bold uppercase tracking-[0.08em] mb-1 transition-colors", isActive ? c.tw.text : "text-muted-foreground")}>{c.label}</p>
              <p className={cn("text-2xl font-extrabold leading-none tabular-nums", c.tw.text)}>{c.value}</p>
            </div>
            <c.icon aria-hidden="true" className={cn("h-8 w-8 transition-opacity", c.tw.text, isActive ? "opacity-60" : "opacity-20")} />
          </button>
        );
      })}
    </div>
  );
}

export default EventsKpis;
