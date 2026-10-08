// Extraído de invoices.tsx em 25/09 (modularização): pílulas de filtro por
// status, compartilhadas pelas abas Lançamento e Aprovação RH. Cada aba
// passa a própria lista de filtros e o contador.
//
// 08/10 (redesenho): eram oito pílulas cheias, cada uma de uma cor quando
// ativa (cinza, laranja, vermelho, azul, verde…) — a fileira competia com a
// lista. Agora são neutras com a bolinha da situação; a ativa ganha o fundo
// de marca (o mesmo da fila das telas irmãs). No celular a fileira rola de
// lado em vez de ocupar três linhas. `aria-pressed` diz qual está ligada.
import { Clock } from "lucide-react";

export interface FilterDef {
  id: string;
  label: string;
  /** Classe da bolinha da situação (`getStatusCfg(...).dot`); "Todos" não tem. */
  dot?: string;
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
    <div className="pas-rolagem-x -mx-[var(--page-gutter)] px-[var(--page-gutter)] sm:mx-0 sm:px-0 min-w-0">
      <div role="group" aria-label="Filtrar por situação" className="flex items-center gap-1 min-w-max sm:min-w-0 sm:flex-wrap">
        {filters.map(({ id, label, dot }) => {
          const cnt = countFor(id);
          const alertCnt = alertFor ? alertFor(id) : 0;
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(id)}
              className={`pas-alvo inline-flex items-center gap-1.5 h-8 pl-2.5 pr-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive
                  ? "bg-brand-soft border-primary/40 text-primary"
                  : cnt === 0
                  ? "bg-card border-border text-muted-foreground hover:bg-surface-muted"
                  : "bg-card border-border text-slate-700 hover:border-slate-300 hover:bg-surface-muted"
              }`}
              data-testid={`nf-filtro-${id}`}
            >
              {dot && <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot} ${cnt === 0 && !isActive ? "opacity-40" : ""}`} />}
              {label}
              {cnt > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-2xs font-semibold tabular-nums -mr-0.5 ${
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-slate-600"
                  }`}
                >
                  {cnt}
                </span>
              )}
              {alertCnt > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 text-2xs font-semibold tabular-nums text-warning"
                  title={`${alertCnt} aguardando há mais de 3 dias`}
                >
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  {alertCnt}
                  <span className="sr-only"> aguardando há mais de 3 dias</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
