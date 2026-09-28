/**
 * Passo 2 do "Dividir escalação" (25/09 — extraído de split-vaga-modal.tsx):
 * cabeçalho do novo colaborador, período, cartões de valores, aviso de titular
 * zerado e rodapé com o comparativo Base × Realizado × Diferença.
 */
import { AlertTriangle, Calendar, TrendingUp, TrendingDown, ArrowLeft, CheckCheck } from "lucide-react";
import type { Collaborator } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { fmtR$, formatDate, initials, capitalizeName } from "./split-shared";
import { DiariasCard, MobilidadeCard, AlimentacaoCard } from "./valores-cards";
import type { SplitState } from "./use-split-state";

function DiasBadges({ s, header }: { s: SplitState; header: boolean }) {
  const { selWeekdays, selWeekends, selectedDays } = s;
  if (header) {
    return (
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {selWeekdays > 0 && (
          <span className="text-2xs bg-card/15 text-white px-2 py-0.5 rounded-full font-medium">
            {selWeekdays} {selWeekdays === 1 ? 'dia útil' : 'dias úteis'}
          </span>
        )}
        {selWeekends > 0 && (
          <span className="text-2xs bg-warning-strong/30 text-warning-soft px-2 py-0.5 rounded-full font-medium">
            {selWeekends} fim{selWeekends > 1 ? 's' : ''} de semana
          </span>
        )}
        <span className="text-2xs bg-card/10 text-white/80 px-2 py-0.5 rounded-full font-medium">
          {selectedDays.size} {selectedDays.size === 1 ? 'dia' : 'dias'} total
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {selWeekdays > 0 && (
        <span className="text-2xs font-semibold bg-brand-soft text-primary border border-primary/25 px-2 py-0.5 rounded-full">
          {selWeekdays} {selWeekdays === 1 ? 'dia útil' : 'dias úteis'}
        </span>
      )}
      {selWeekends > 0 && (
        <span className="text-2xs font-semibold bg-warning-soft text-warning border border-warning/25 px-2 py-0.5 rounded-full">
          {selWeekends} fim{selWeekends > 1 ? 's' : ''} de sem.
        </span>
      )}
      <span className="text-2xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
        {selectedDays.size}d
      </span>
    </div>
  );
}

function ResumoValores({ s }: { s: SplitState }) {
  const { proportionalPlanned, proportionalPlannedBreakdown, s2Realizado, s2Difference } = s;
  return (
    <div className="rounded-xl border border-border shadow-1 overflow-hidden">
      <div className="grid grid-cols-3 divide-x divide-border">
        {/* Base honesta: os valores vêm do BudgetActual do titular (realizado),
            não do planejado do RH — o rótulo antigo "Planejado prop." mentia */}
        <div
          className="px-3 py-3 text-center"
          title={`Proporcional calculado sobre o realizado do titular, não sobre o planejado do RH${proportionalPlannedBreakdown ? ` — ${proportionalPlannedBreakdown}` : ''}`}
        >
          <div className="text-2xs uppercase text-muted-foreground font-semibold tracking-widest mb-1">Base do titular (realizado)</div>
          <div className="text-sm font-bold text-slate-600 tabular-nums">{fmtR$(proportionalPlanned)}</div>
        </div>
        <div className="px-4 py-3 text-center bg-brand-soft/60">
          <div className="text-2xs uppercase text-primary font-semibold tracking-widest mb-1">Realizado</div>
          <div className="text-sm font-bold text-primary tabular-nums">{fmtR$(s2Realizado)}</div>
        </div>
        <div className={`px-4 py-3 text-center ${Math.abs(s2Difference) <= 1 ? 'bg-surface-muted/60' : s2Difference < 0 ? 'bg-success-soft/60' : 'bg-danger-soft/60'}`}>
          <div className="text-2xs uppercase text-muted-foreground font-semibold tracking-widest mb-1">Diferença</div>
          {Math.abs(s2Difference) <= 1 ? (
            <div className="text-sm font-bold text-muted-foreground tabular-nums">—</div>
          ) : (
            <div className="flex items-center justify-center gap-1">
              {s2Difference < 0 ? <TrendingDown className="w-3.5 h-3.5 text-success-strong" aria-hidden="true" /> : <TrendingUp className="w-3.5 h-3.5 text-danger-strong" aria-hidden="true" />}
              <span className={`text-sm font-bold tabular-nums ${s2Difference < 0 ? 'text-success' : 'text-danger'}`}>
                {s2Difference > 0 ? '+' : '−'}{fmtR$(Math.abs(s2Difference))}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function StepValues({ s, selectedCollab, isPending }: { s: SplitState; selectedCollab: Collaborator; isPending?: boolean }) {
  const { selDaysSorted, remainingForParent, setStep, attemptConfirm } = s;
  const collabName = selectedCollab.fullName || "";
  const firstDay = selDaysSorted[0];
  const lastDay = selDaysSorted[selDaysSorted.length - 1];
  return (
    <>
      {/* Collaborator header */}
      <div className="px-5 pt-4 pb-4 flex-shrink-0 bg-primary-hover">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-lg bg-card/20 border border-white/30 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">{initials(collabName)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-white truncate leading-tight m-0">{capitalizeName(collabName)}</h2>
            <p className="text-2xs text-primary-foreground/80 mt-1 m-0">Preencha os valores para este colaborador</p>
            <DiasBadges s={s} header />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4 bg-surface-muted">
        {/* Period */}
        {firstDay && (
          <div className="bg-card rounded-xl border border-border px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-600">
                {firstDay === lastDay ? formatDate(firstDay) : `${formatDate(firstDay)} → ${formatDate(lastDay)}`}
              </span>
            </div>
            <DiasBadges s={s} header={false} />
          </div>
        )}

        <DiariasCard s={s} />
        <MobilidadeCard s={s} />
        <AlimentacaoCard s={s} />

        {remainingForParent.length === 0 && (
          <div className="flex gap-2 px-3.5 py-3 rounded-xl bg-danger-soft border border-danger/25 items-start">
            <AlertTriangle className="w-3.5 h-3.5 text-danger-strong flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-danger m-0">
              O colaborador original ficará <strong>sem dias atribuídos</strong>. Ao confirmar, o registro original ficará zerado.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-card border-t border-border flex-shrink-0 px-6 py-4 space-y-3">
        <ResumoValores s={s} />
        {/* Action buttons */}
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="h-9 px-4 text-sm text-muted-foreground hover:text-slate-700 rounded-xl flex items-center gap-2" onClick={() => setStep(1)} disabled={isPending}>
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar
          </Button>
          <Button
            onClick={attemptConfirm}
            disabled={isPending}
            className="h-9 px-5 text-sm rounded-xl text-white font-medium shadow-2 flex items-center gap-2 bg-primary-hover"
          >
            <CheckCheck className="w-4 h-4" aria-hidden="true" />
            {isPending ? 'Confirmando…' : 'Confirmar divisão'}
          </Button>
        </div>
      </div>
    </>
  );
}
