/**
 * Blocos de detalhamento do Comparativo — 25/09 (modularização).
 * `CategoryBlock` (card expandido), `SubRow` e `SectionBlock` (modal de
 * divisão). Já eram componentes de módulo em budget-comparison.tsx (para não
 * remontar o DOM a cada render); só mudaram de arquivo.
 */
import type { LucideIcon } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { fmt } from "./comparison-utils";

export interface CategoryBlockProps {
  title: string;
  icon: LucideIcon;
  iconColor: string;
  bgColor: string;
  stripColor: string;
  rows: Array<{ label: string; planned: number; actual: number; isQuantity?: boolean }>;
  badge?: string;
}

export function CategoryBlock({ title, icon: Icon, iconColor, bgColor, stripColor, rows, badge }: CategoryBlockProps) {
  const currencyRows = rows.filter(r => !r.isQuantity);
  const subtotalPlanned = currencyRows.reduce((s, r) => s + r.planned, 0);
  const subtotalActual  = currencyRows.reduce((s, r) => s + r.actual,  0);
  const subtotalDiff    = subtotalActual - subtotalPlanned;
  const hasAnyDiff      = rows.some(r => r.planned !== r.actual);
  const fmtVal = (v: number, isQty?: boolean) => isQty ? String(v) : fmt(v);

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-surface-muted/50">
      {/* Category header */}
      <div className={`flex items-center justify-between px-3 ${bgColor} border-b border-border`} style={{ height: 32 }}>
        <div className="flex items-center gap-1.5">
          <div className={`w-4 h-4 rounded flex items-center justify-center ${stripColor}`}>
            <Icon className="w-2.5 h-2.5 text-white" />
          </div>
          <span className={`text-2xs font-bold uppercase tracking-wide ${iconColor}`}>{title}</span>
          {badge && (
            <span className="text-2xs font-medium text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-full leading-none">
              {badge}
            </span>
          )}
          {hasAnyDiff && (
            <span className="flex items-center gap-0.5 text-2xs font-semibold text-warning bg-warning-soft border border-warning/25 px-1.5 py-0.5 rounded-full leading-none">
              <AlertTriangle className="w-2 h-2" aria-hidden="true" /> Divergência
            </span>
          )}
        </div>
        <span className={`text-xs font-semibold tabular-nums ${iconColor}`}>{fmt(subtotalActual)}</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border bg-card">
        {rows.map((row, i) => {
          const diff  = row.actual - row.planned;
          const isDiff = diff !== 0;
          return (
            <div key={i} className="grid grid-cols-4 gap-2 px-3 text-xs items-center" style={{ height: 32 }}>
              <span className="text-muted-foreground font-medium text-2xs">{row.label}</span>
              <span className="text-right tabular-nums text-primary font-medium text-2xs">{fmtVal(row.planned, row.isQuantity)}</span>
              <span className={`text-right tabular-nums font-medium text-2xs ${isDiff ? "text-primary" : "text-primary/70"}`}>
                {fmtVal(row.actual, row.isQuantity)}
              </span>
              <div className="text-right">
                {diff === 0 ? (
                  <span className="text-muted-foreground tabular-nums text-2xs">—</span>
                ) : (
                  <span className={`tabular-nums font-semibold text-2xs ${diff > 0 ? "text-danger-strong" : "text-success"}`}>
                    {row.isQuantity ? `${diff > 0 ? "+" : ""}${diff}` : `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))}`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtotal */}
      {currencyRows.length > 0 && (
        <div className={`grid grid-cols-4 gap-2 px-3 text-2xs items-center border-t border-border ${subtotalDiff > 0 ? "bg-danger-soft/40" : subtotalDiff < 0 ? "bg-success-soft/40" : "bg-surface-muted"}`} style={{ height: 28 }}>
          <span className="text-muted-foreground uppercase text-2xs tracking-wider font-semibold">Subtotal</span>
          <span className="text-right tabular-nums text-primary font-semibold">{fmt(subtotalPlanned)}</span>
          <span className={`text-right tabular-nums font-semibold ${subtotalDiff !== 0 ? "text-primary" : "text-primary"}`}>{fmt(subtotalActual)}</span>
          <div className="text-right">
            {subtotalDiff === 0 ? (
              <span className="text-muted-foreground tabular-nums">—</span>
            ) : (
              <span className={`tabular-nums text-2xs font-semibold ${subtotalDiff > 0 ? "text-danger-strong" : "text-success"}`}>
                {subtotalDiff > 0 ? "+" : "−"}{fmt(Math.abs(subtotalDiff))}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-linha do modal de divisão (zebra controlada pelo chamador)
export function SubRow({ label, planned, actual, rowIndex }: { label: string; planned: number; actual: number; rowIndex: number }) {
  const d = actual - planned;
  return (
    <div className={`grid grid-cols-4 gap-4 px-4 py-2 items-center ${rowIndex % 2 === 0 ? "bg-card" : "bg-surface-muted/70"}`}>
      <div className="flex items-center gap-1.5 pl-3">
        <span className="text-muted-foreground text-2xs select-none">└</span>
        <span className="text-2xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-right tabular-nums text-2xs text-primary">{fmt(planned)}</span>
      <span className={`text-right tabular-nums text-2xs ${d !== 0 ? "text-primary" : "text-primary/70"}`}>{fmt(actual)}</span>
      <div className="text-right">
        {d === 0 ? <span className="text-muted-foreground text-2xs">—</span> : (
          <span className={`text-2xs font-semibold ${d > 0 ? "text-danger-strong" : "text-success-strong"}`}>
            {d > 0 ? "+" : "−"}{fmt(Math.abs(d))}
          </span>
        )}
      </div>
    </div>
  );
}

// Seção com cabeçalho colorido do modal de divisão
export function SectionBlock({ title, icon: Icon, headerBg, iconColor, titleColor, subtotalPlan, subtotalAct, children }: {
  title: string; icon: LucideIcon; headerBg: string; iconColor: string; titleColor: string;
  subtotalPlan: number; subtotalAct: number; children: React.ReactNode;
}) {
  const d = subtotalAct - subtotalPlan;
  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <div className={`flex items-center gap-1.5 px-4 py-2 border-b border-white/40 ${headerBg}`}>
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <span className={`text-2xs font-bold tracking-wide ${titleColor}`}>{title}</span>
      </div>
      <div className={`grid grid-cols-4 gap-4 px-4 py-2 ${headerBg}`}>
        <span className={`text-2xs font-semibold ${titleColor} opacity-70`}>Total</span>
        <span className="text-right tabular-nums text-2xs text-primary font-semibold">{fmt(subtotalPlan)}</span>
        <span className={`text-right tabular-nums text-2xs font-semibold ${d !== 0 ? "text-primary" : "text-primary"}`}>{fmt(subtotalAct)}</span>
        <div className="text-right">
          {d === 0
            ? <span className="text-muted-foreground text-2xs">—</span>
            : <span className={`text-2xs font-bold tabular-nums ${d > 0 ? "text-danger-strong" : "text-success-strong"}`}>
                {d > 0 ? "+" : "−"}{fmt(Math.abs(d))}
              </span>
          }
        </div>
      </div>
      <div className="divide-y divide-border">
        {children}
      </div>
    </div>
  );
}
