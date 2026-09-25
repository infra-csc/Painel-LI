/**
 * Cartões de totais da tabela de inclusões (25/09 — extraídos da tabela).
 * Cada cartão é um atalho de UM recorte por vez; o multi fica na barra de filtros.
 */
import type { InclusionFilters, TeamInclusionData } from "./use-team-inclusion-data";

const CARDS = (t: TeamInclusionData["totals"]) => ([
  { value: t.incluidos,           label: "Total",          color: "text-primary",    border: "border-t-primary",    activeBg: "bg-brand-soft",    filterType: "all",        filterValue: "all",                 testId: "total-incluidos" },
  { value: t.pendentes,           label: "Pendentes",      color: "text-danger-strong",     border: "border-t-danger-strong",     activeBg: "bg-danger-soft",     filterType: "escalation", filterValue: "pending",             testId: "total-pendentes" },
  { value: t.escalados,           label: "Escalados",      color: "text-success",   border: "border-t-success-strong",   activeBg: "bg-success-soft",   filterType: "escalation", filterValue: "escalated",           testId: "total-escalados" },
  { value: t.aguardando_passagem, label: "Passagem",       color: "text-warning",  border: "border-t-warning-strong",  activeBg: "bg-warning-soft",  filterType: "status",     filterValue: "passagem",            testId: "total-passagem" },
  { value: t.hospedagem,          label: "Hospedagem",     color: "text-primary",  border: "border-t-primary",  activeBg: "bg-brand-soft",  filterType: "status",     filterValue: "hospedagem",          testId: "total-hospedagem" },
  { value: t.passagem_comprada,   label: "Pass. Comprada", color: "text-success", border: "border-t-success-strong", activeBg: "bg-success-soft", filterType: "status",     filterValue: "passagem_comprada",   testId: "total-passagem-comprada" },
  { value: t.hospedagem_comprada, label: "Hosp. Comprada", color: "text-primary",  border: "border-t-primary",  activeBg: "bg-brand-soft",  filterType: "status",     filterValue: "hospedagem_comprada", testId: "total-hospedagem-comprada" },
  { value: t.cancelados,          label: "Cancelados",     color: "text-muted-foreground",    border: "border-t-slate-300",    activeBg: "bg-surface-muted",    filterType: "escalation", filterValue: "cancelado",           testId: "total-cancelados" },
] as const);

export function TotalsCards({ totals, filters, setFilters }: {
  totals: TeamInclusionData["totals"];
  filters: InclusionFilters;
  setFilters: React.Dispatch<React.SetStateAction<InclusionFilters>>;
}) {
  return (
    <div className="mb-6">
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
        {CARDS(totals).map(({ value, label, color, border, activeBg, filterType, filterValue, testId }) => {
          // Cards continuam sendo atalho de UM recorte por vez; o multi fica
          // por conta dos dropdowns da barra.
          const isActive =
            filterType === "all"
              ? filters.status.length === 0 && filters.escalationStatus.length === 0
              : filterType === "status"
                ? filters.status.length === 1 && filters.status[0] === filterValue
                : filters.escalationStatus.length === 1 && filters.escalationStatus[0] === filterValue;

          const handleClick = () => {
            if (filterType === "all") {
              setFilters(f => ({ ...f, status: [], escalationStatus: [] }));
            } else if (filterType === "status") {
              setFilters(f => ({ ...f, status: isActive ? [] : [filterValue], escalationStatus: [] }));
            } else {
              setFilters(f => ({ ...f, escalationStatus: isActive ? [] : [filterValue], status: [] }));
            }
          };

          return (
            <div
              key={testId}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              aria-label={`${label}: ${value}. Filtrar por ${label}`}
              onClick={handleClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClick();
                }
              }}
              className={`border border-t-2 ${border} rounded-xl px-3 py-2.5 text-center cursor-pointer transition-all duration-150 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
                ${isActive
                  ? `${activeBg} border-border shadow-1`
                  : "bg-card border-border shadow-1 hover:shadow-2 hover:-translate-y-0.5"}`}
              data-testid={testId}
            >
              <div className={`text-2xl font-bold tabular-nums leading-none ${color}`}>{value}</div>
              <div className="text-2xs uppercase tracking-widest text-muted-foreground mt-1.5 leading-tight font-semibold">{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
