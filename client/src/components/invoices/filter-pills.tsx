// Extraído de invoices.tsx em 25/09 (modularização): pílulas de filtro por
// status, compartilhadas pelas abas Lançamento e Aprovação RH. Cada aba
// passa a própria lista de filtros e o contador.

export interface FilterDef {
  id: string;
  label: string;
  activeBg: string;
}

export interface FilterPillsProps {
  filters: FilterDef[];
  active: string;
  countFor: (id: string) => number;
  onChange: (id: string) => void;
  alertFor?: (id: string) => number;
}

// ── Filter Pills ─────────────────────────────────────────────────────────────
export function FilterPills({ filters, active, countFor, onChange, alertFor }: FilterPillsProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {filters.map(({ id, label, activeBg }) => {
        const cnt = countFor(id);
        const alertCnt = alertFor ? alertFor(id) : 0;
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`inline-flex items-center gap-1.5 text-2xs font-semibold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
              isActive
                ? `${activeBg} border-transparent shadow-1`
                : "bg-card border-border text-muted-foreground hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            {label}
            {cnt > 0 && (
              <span className={`text-2xs font-bold leading-none px-1.5 py-0.5 rounded-full ${isActive ? "bg-card/20 text-white" : "bg-muted text-muted-foreground"}`}>
                {cnt}
              </span>
            )}
            {alertCnt > 0 && (
              <span className="text-2xs font-bold leading-none px-1.5 py-0.5 rounded-full bg-warning-strong text-white"
                title={`${alertCnt} aguardando há mais de 3 dias`}>
                {alertCnt}⚠
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
