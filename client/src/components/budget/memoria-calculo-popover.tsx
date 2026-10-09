/**
 * Popover "Memória de cálculo" de uma linha da planilha do Planejado —
 * 25/09 (modularização). Fecha a conta usando os segments da deflação.
 * `forwardRef` porque a linha foca o popover ao abrir (a11y).
 *
 * 08/10: lido como um recibo — título e período no alto com o X, as faixas da
 * diária, as parcelas e o total com o traço; números tabulares sem a
 * monoespaçada. `paraCima` abre acima do valor nas últimas linhas.
 */
import { forwardRef } from "react";
import { X } from "lucide-react";
import { toTitleCase } from "@/lib/format";
import { PERCURSEIRO_TIPOS } from "@shared/calculation-rules";
import { CENO_FREELA_TIPO_LABELS } from "@shared/cenotecnica-empreita";
import { ddmm, formatCurrency, type CalculatedBudget } from "./types";

export interface MemoriaCalculoPopoverProps {
  sid: string;
  name: string;
  budget: CalculatedBudget;
  onClose: () => void;
  /** Abre acima do valor (últimas linhas da planilha). */
  paraCima?: boolean;
}

export const MemoriaCalculoPopover = forwardRef<HTMLDivElement, MemoriaCalculoPopoverProps>(function MemoriaCalculoPopover(
  { sid, name, budget, onClose, paraCima }, ref,
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
      className={`pla-memoria absolute right-2 z-[60] w-[min(340px,calc(100vw-32px))] bg-card border border-border rounded-xl shadow-3 pt-3 pb-3.5 px-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${paraCima ? "bottom-full mb-1" : "top-full mt-1"}`}
    >
      <div className="flex items-start gap-2 mb-1">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Memória de cálculo</p>
          <p className="m-0 text-sm font-semibold text-foreground truncate">{toTitleCase(name)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar a memória de cálculo"
          className="inline-flex items-center justify-center w-7 h-7 -mr-1.5 -mt-0.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <div className="text-2xs text-muted-foreground mb-2.5 tabular-nums">
        {totalDias} {totalDias === 1 ? "dia" : "dias"}
        {budget.regraDiaria === "fds" && ` · diária em ${budget.diasComDiaria} (só fins de semana — CLT)`}
        {budget.regraDiaria === "nenhuma" && ` · sem diária (cenotécnica CLT)`}
        {budget.isPercurso && ` · ${budget.diasComDiaria} ${budget.diasComDiaria === 1 ? "diária" : "diárias"} (percurso ${budget.inclusion.needsTicket ? "em viagem — regra fixa" : "local — regra fixa"}, pacote fechado)`}
        {budget.cenoEmpreita && ` · empreita ${CENO_FREELA_TIPO_LABELS[budget.cenoEmpreita.tipo]} — valor fechado por ${budget.cenoEmpreita.dias} ${budget.cenoEmpreita.dias === 1 ? "dia" : "dias"}`}
        {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && ` · ${ddmm(budget.inclusion.scheduleStartDate)} → ${ddmm(budget.inclusion.scheduleEndDate)}`}
      </div>
      <table className="w-full border-collapse text-xs tabular-nums">
        <tbody>
          {budget.deflationSegments.map((seg, i) => (
            <tr key={i}>
              <td className="pb-1 text-slate-700 font-medium">
                <span aria-hidden="true" className="inline-block w-1.5 h-1.5 mr-1.5 rounded-full bg-primary align-middle" />
                {seg.days} {seg.days === 1 ? "dia" : "dias"} × {formatCurrency(seg.dailyCents)}
                {seg.factor < 1 && <span className="text-muted-foreground font-normal"> ({Math.round(seg.factor * 100)}% · {seg.label})</span>}
              </td>
              <td className="pb-1 text-right text-foreground">{formatCurrency(seg.totalCents)}</td>
            </tr>
          ))}
          {budget.isPercurso && budget.percurseiro && (
            ([["Motoqueiro", budget.percurseiro.motoqueiro], ["Fee Ivan", budget.percurseiro.fee], ["Alimentação (3 refeições)", budget.percurseiro.alimentacao], ["Ajuda transporte", budget.percurseiro.transporte], ["NF", budget.percurseiro.nf]] as [string, number][]).map(([lbl, v]) => (
              <tr key={lbl}>
                <td className="pb-0.5 text-muted-foreground text-2xs pl-2">{lbl} <span className="text-muted-foreground">× {budget.diasComDiaria}</span></td>
                <td className="pb-0.5 text-right text-muted-foreground text-2xs">{formatCurrency(v * budget.diasComDiaria)}</td>
              </tr>
            ))
          )}
          <tr>
            <td className="pb-2 text-muted-foreground text-2xs pl-3">
              {budget.isPercurso
                ? `Diárias (pacote fechado — ${PERCURSEIRO_TIPOS.find(t => t.value === (budget.percurseiroTipo ?? "tipo_1"))?.label}${budget.percurseiroTipo ? "" : " provisório"})`
                : budget.cenoEmpreita
                ? `Diárias (empreita — ${CENO_FREELA_TIPO_LABELS[budget.cenoEmpreita.tipo]} · ${budget.cenoEmpreita.dias} ${budget.cenoEmpreita.dias === 1 ? "dia" : "dias"} · valor fechado)`
                : budget.regraDiaria === "nenhuma" ? "Diárias (cenotécnica CLT: sem diária)" : "Diárias (com deflação por período)"}
              {budget.cenoEmpreita?.extrapolado && (
                <span className="text-warning font-semibold"> · valor extrapolado (tabela cobre 2 a 6 dias)</span>
              )}
            </td>
            <td className="pb-2 text-right text-muted-foreground text-2xs">{formatCurrency(budget.subtotalDiarias)}</td>
          </tr>
          {budget.isPercurso && (
            <tr>
              <td colSpan={2} className="pb-1.5 text-muted-foreground text-2xs pl-2">Alimentação e mobilidade: incluídas no pacote do percurseiro</td>
            </tr>
          )}
          {alimTotal > 0 && (
            <tr>
              <td className="pb-1 text-slate-700 font-medium">
                <span aria-hidden="true" className="inline-block w-1.5 h-1.5 mr-1.5 rounded-full bg-warning-strong align-middle" />
                Alimentação{budget.alimEstimada ? <span className="text-warning font-normal text-2xs"> (estimada)</span> : null}
              </td>
              <td className="pb-1 text-right text-foreground">{formatCurrency(alimTotal)}</td>
            </tr>
          )}
          {budget.mobilidade > 0 && (
            <tr>
              <td className="pb-1 text-slate-700 font-medium"><span aria-hidden="true" className="inline-block w-1.5 h-1.5 mr-1.5 rounded-full bg-slate-400 align-middle" />Mobilidade (total)</td>
              <td className="pb-1 text-right text-foreground">{formatCurrency(budget.mobilidade)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-foreground/20">
            <td className="pt-2 font-semibold text-foreground text-sm">Total</td>
            <td className="pt-2 text-right font-semibold text-primary text-sm">{formatCurrency(budget.totalFinal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
});

export default MemoriaCalculoPopover;
