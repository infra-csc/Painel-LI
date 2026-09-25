/**
 * Passo 2 · cartões de valores (25/09 — extraídos de split-vaga-modal.tsx):
 * Diárias (útil × fim de semana), Mobilidade e Alimentação (almoço/jantar).
 */
import { Calendar, Briefcase, Sun, Moon, Car, Utensils } from "lucide-react";
import { CurrencyInput } from "@/components/common/currency-input";
import { fmtR$ } from "./split-shared";
import type { SplitState } from "./use-split-state";

export function DiariasCard({ s }: { s: SplitState }) {
  const { step2Form, setStep2Form, selWeekdays, selWeekends, s2SubDiarias, s2SubDiariasUtil, s2SubDiariasFds } = s;
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="h-[3px] bg-primary" />
      <div className="flex items-center justify-between px-4 py-2.5 bg-brand-soft/60 border-b border-primary/25">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
            <Calendar className="w-3 h-3 text-white" aria-hidden="true" />
          </div>
          <span className="text-2xs font-semibold text-primary uppercase tracking-wide">Diárias</span>
        </div>
        <span className="text-sm font-bold text-primary tabular-nums">{fmtR$(s2SubDiarias)}</span>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-surface-muted/50 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Briefcase className="w-3 h-3 text-primary" aria-hidden="true" />
            <span className="text-2xs font-semibold text-slate-600">Dias Úteis</span>
            <span className="text-2xs text-muted-foreground ml-auto">{selWeekdays}d</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-2xs text-muted-foreground">R$</span>
            <CurrencyInput
              className={`h-8 text-sm flex-1 text-center font-semibold ${selWeekdays === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
              value={step2Form.valorDiariaUtil}
              onChange={v => setStep2Form(f => ({ ...f, valorDiariaUtil: v }))}
              disabled={selWeekdays === 0}
            />
            <span className="text-2xs text-muted-foreground">/d</span>
          </div>
          <div className="text-2xs font-bold text-primary tabular-nums text-center mt-1.5">{fmtR$(s2SubDiariasUtil)}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-muted/50 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Sun className="w-3 h-3 text-warning-strong" aria-hidden="true" />
            <span className="text-2xs font-semibold text-slate-600">Fim de Semana</span>
            <span className="text-2xs text-muted-foreground ml-auto">{selWeekends}d</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-2xs text-muted-foreground">R$</span>
            <CurrencyInput
              className={`h-8 text-sm flex-1 text-center font-semibold ${selWeekends === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
              value={step2Form.valorDiariaFds}
              onChange={v => setStep2Form(f => ({ ...f, valorDiariaFds: v }))}
              disabled={selWeekends === 0}
            />
            <span className="text-2xs text-muted-foreground">/d</span>
          </div>
          <div className={`text-2xs font-bold tabular-nums text-center mt-1.5 ${selWeekends === 0 ? 'text-muted-foreground' : 'text-primary'}`}>{fmtR$(s2SubDiariasFds)}</div>
        </div>
      </div>
    </div>
  );
}

export function MobilidadeCard({ s }: { s: SplitState }) {
  const { step2Form, setStep2Form, selectedDays } = s;
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="h-[3px] bg-primary" />
      <div className="flex items-center justify-between px-4 py-2.5 bg-brand-soft/60 border-b border-primary/25">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
            <Car className="w-3 h-3 text-white" aria-hidden="true" />
          </div>
          <span className="text-2xs font-semibold text-primary uppercase tracking-wide">Mobilidade</span>
        </div>
        <span className="text-sm font-bold text-primary tabular-nums">{fmtR$(step2Form.mobility)}</span>
      </div>
      <div className="p-4 grid grid-cols-2 gap-4">
        <div>
          <label className="text-2xs font-semibold text-muted-foreground block mb-1">Total do período (R$)</label>
          <CurrencyInput
            className="h-9 text-sm"
            value={step2Form.mobility}
            onChange={v => setStep2Form(f => ({ ...f, mobility: v }))}
          />
        </div>
        <div>
          <label className="text-2xs font-semibold text-muted-foreground block mb-1">Por dia</label>
          <div className="h-9 flex items-center px-3 rounded-lg bg-surface-muted border border-border text-xs text-muted-foreground tabular-nums">
            {selectedDays.size > 0 ? fmtR$(Math.round(step2Form.mobility / selectedDays.size)) : fmtR$(0)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AlimentacaoCard({ s }: { s: SplitState }) {
  const { step2Form, setStep2Form, selWeekdays, selWeekends, s2TotalAlim } = s;
  const cell = "rounded-lg p-2 border border-border bg-surface-muted/50";
  const input = (dias: number) => `h-8 text-xs text-center w-full ${dias === 0 ? 'opacity-40 cursor-not-allowed' : ''}`;
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="h-[3px] bg-warning-strong" />
      <div className="flex items-center justify-between px-4 py-2.5 bg-warning-soft/60 border-b border-warning/25">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-warning-strong flex items-center justify-center">
            <Utensils className="w-3 h-3 text-white" aria-hidden="true" />
          </div>
          <span className="text-2xs font-semibold text-warning uppercase tracking-wide">Alimentação</span>
        </div>
        <span className="text-sm font-bold text-warning tabular-nums">{fmtR$(s2TotalAlim)}</span>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-2">
          <div />
          <div className="text-center">
            <span className="inline-flex items-center gap-1 text-2xs font-bold text-primary bg-brand-soft border border-primary/25 px-2 py-0.5 rounded-full">
              <Briefcase className="w-2.5 h-2.5" aria-hidden="true" /> Dias Úteis
            </span>
          </div>
          <div className="text-center">
            <span className="inline-flex items-center gap-1 text-2xs font-bold text-warning bg-warning-soft border border-warning/25 px-2 py-0.5 rounded-full">
              <Sun className="w-2.5 h-2.5" aria-hidden="true" /> Fins de Sem.
            </span>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-2">
          <div className="flex items-center gap-1">
            <Sun className="w-3 h-3 text-warning-strong" aria-hidden="true" />
            <span className="text-2xs font-semibold text-slate-600">Almoço</span>
          </div>
          <div className={cell}>
            <CurrencyInput className={input(selWeekdays)} value={step2Form.weekdayLunch} onChange={v => setStep2Form(f => ({ ...f, weekdayLunch: v }))} disabled={selWeekdays === 0} />
          </div>
          <div className={cell}>
            <CurrencyInput className={input(selWeekends)} value={step2Form.weekendLunch} onChange={v => setStep2Form(f => ({ ...f, weekendLunch: v }))} disabled={selWeekends === 0} />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-3">
          <div className="flex items-center gap-1">
            <Moon className="w-3 h-3 text-primary/70" aria-hidden="true" />
            <span className="text-2xs font-semibold text-slate-600">Jantar</span>
          </div>
          <div className={cell}>
            <CurrencyInput className={input(selWeekdays)} value={step2Form.weekdayDinner} onChange={v => setStep2Form(f => ({ ...f, weekdayDinner: v }))} disabled={selWeekdays === 0} />
          </div>
          <div className={cell}>
            <CurrencyInput className={input(selWeekends)} value={step2Form.weekendDinner} onChange={v => setStep2Form(f => ({ ...f, weekendDinner: v }))} disabled={selWeekends === 0} />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 border-t border-border pt-2">
          <span className="text-2xs font-semibold text-muted-foreground uppercase self-center">Subtotal</span>
          <div className="text-center"><span className="text-xs font-bold text-primary tabular-nums">{fmtR$(step2Form.weekdayLunch + step2Form.weekdayDinner)}</span></div>
          <div className="text-center"><span className="text-xs font-bold text-warning tabular-nums">{fmtR$(step2Form.weekendLunch + step2Form.weekendDinner)}</span></div>
        </div>
      </div>
    </div>
  );
}
