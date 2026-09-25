/**
 * Popover "Memória de Cálculo" de uma linha da planilha do Planejado —
 * 25/09 (modularização). Fecha a conta usando os segments da deflação.
 * `forwardRef` porque a linha foca o popover ao abrir (a11y).
 */
import { forwardRef } from "react";
import { toTitleCase } from "@/lib/format";
import { PERCURSEIRO_TIPOS } from "@shared/calculation-rules";
import { CENO_FREELA_TIPO_LABELS } from "@shared/cenotecnica-empreita";
import { ddmm, formatCurrency, type CalculatedBudget } from "./types";

export interface MemoriaCalculoPopoverProps {
  sid: string;
  name: string;
  budget: CalculatedBudget;
  onClose: () => void;
}

export const MemoriaCalculoPopover = forwardRef<HTMLDivElement, MemoriaCalculoPopoverProps>(function MemoriaCalculoPopover(
  { sid, name, budget, onClose }, ref,
) {
  const alimTotal = budget.almocoSemana + budget.jantarSemana + budget.almocoFds + budget.jantarFds;
  const totalDias = budget.weekdays + budget.weekends;
  return (
    <div
      id={`subtotal-popover-${sid}`}
      ref={ref}
      role="dialog"
      aria-label={`Memória de cálculo de ${toTitleCase(name)}`}
      tabIndex={-1}
      onClick={e => e.stopPropagation()}
      className="absolute bg-card border border-border rounded-xl shadow-2 py-3.5 px-4 text-left outline-none" style={{
        right: 0,
        top: "100%",
        zIndex: 60,
        minWidth: 270,
      }}
    >
      <div className="text-2xs font-bold text-primary mb-2.5 tracking-wider uppercase">
        Memória de Cálculo · {toTitleCase(name)}
      </div>
      <div className="text-2xs text-muted-foreground mb-2">
        {totalDias} {totalDias === 1 ? "dia" : "dias"}
        {budget.regraDiaria === "fds" && ` · diária em ${budget.diasComDiaria} (só fins de semana — CLT)`}
        {budget.regraDiaria === "nenhuma" && ` · sem diária (cenotécnica CLT)`}
        {budget.isPercurso && ` · ${budget.diasComDiaria} ${budget.diasComDiaria === 1 ? "diária" : "diárias"} (percurso ${budget.inclusion.needsTicket ? "em viagem — regra fixa" : "local — regra fixa"}, pacote fechado)`}
        {budget.cenoEmpreita && ` · empreita ${CENO_FREELA_TIPO_LABELS[budget.cenoEmpreita.tipo]} — valor fechado por ${budget.cenoEmpreita.dias} ${budget.cenoEmpreita.dias === 1 ? "dia" : "dias"}`}
        {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && ` · ${ddmm(budget.inclusion.scheduleStartDate)} → ${ddmm(budget.inclusion.scheduleEndDate)}`}
      </div>
      <table className="text-xs" style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {budget.deflationSegments.map((seg, i) => (
            <tr key={i}>
              <td className="pb-1 text-primary font-semibold">
                {seg.days} {seg.days === 1 ? "dia" : "dias"} × {formatCurrency(seg.dailyCents)}
                {seg.factor < 1 && <span className="text-muted-foreground font-normal"> ({Math.round(seg.factor * 100)}% · {seg.label})</span>}
              </td>
              <td className="pb-1 text-right text-slate-700 font-mono">{formatCurrency(seg.totalCents)}</td>
            </tr>
          ))}
          {budget.isPercurso && budget.percurseiro && (
            ([["Motoqueiro", budget.percurseiro.motoqueiro], ["Fee Ivan", budget.percurseiro.fee], ["Alimentação (3 refeições)", budget.percurseiro.alimentacao], ["Ajuda transporte", budget.percurseiro.transporte], ["NF", budget.percurseiro.nf]] as [string, number][]).map(([lbl, v]) => (
              <tr key={lbl}>
                <td className="pb-0.5 text-muted-foreground text-2xs pl-2">{lbl} <span className="text-muted-foreground">× {budget.diasComDiaria}</span></td>
                <td className="pb-0.5 text-right text-muted-foreground font-mono text-2xs">{formatCurrency(v * budget.diasComDiaria)}</td>
              </tr>
            ))
          )}
          <tr>
            <td className="pb-2 text-muted-foreground text-2xs pl-2">
              {budget.isPercurso
                ? `Diárias (pacote fechado — ${PERCURSEIRO_TIPOS.find(t => t.value === (budget.percurseiroTipo ?? "tipo_1"))?.label}${budget.percurseiroTipo ? "" : " provisório"})`
                : budget.cenoEmpreita
                ? `Diárias (empreita — ${CENO_FREELA_TIPO_LABELS[budget.cenoEmpreita.tipo]} · ${budget.cenoEmpreita.dias} ${budget.cenoEmpreita.dias === 1 ? "dia" : "dias"} · valor fechado)`
                : budget.regraDiaria === "nenhuma" ? "Diárias (cenotécnica CLT: sem diária)" : "Diárias (com deflação por período)"}
              {budget.cenoEmpreita?.extrapolado && (
                <span className="text-warning font-semibold"> · valor extrapolado (tabela cobre 2 a 6 dias)</span>
              )}
            </td>
            <td className="pb-2 text-right text-muted-foreground font-mono text-2xs">{formatCurrency(budget.subtotalDiarias)}</td>
          </tr>
          {budget.isPercurso && (
            <tr>
              <td colSpan={2} className="pb-1.5 text-muted-foreground text-2xs pl-2">Alimentação e mobilidade: incluídas no pacote do percurseiro</td>
            </tr>
          )}
          {alimTotal > 0 && (
            <tr>
              <td className="pb-1 text-warning font-semibold">
                Alimentação{budget.alimEstimada ? <span className="text-warning font-normal text-2xs"> (estimada)</span> : null}
              </td>
              <td className="pb-1 text-right text-slate-700 font-mono">{formatCurrency(alimTotal)}</td>
            </tr>
          )}
          {budget.mobilidade > 0 && (
            <tr>
              <td className="pb-1 text-primary font-semibold">Mobilidade (total)</td>
              <td className="pb-1 text-right text-slate-700 font-mono">{formatCurrency(budget.mobilidade)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-t-border">
            <td className="pt-2 font-bold text-primary text-sm">Total</td>
            <td className="pt-2 text-right font-bold text-primary font-mono text-sm">{formatCurrency(budget.totalFinal)}</td>
          </tr>
        </tfoot>
      </table>
      <button
        onClick={onClose}
        className="mt-2.5 text-2xs text-muted-foreground cursor-pointer border-0 block text-center bg-transparent w-full"
      >fechar</button>
    </div>
  );
});

export default MemoriaCalculoPopover;
