/**
 * Resumo da grade da Sugestão de escala (07/10 — redesenho premium).
 *
 * A faixa irmã do resumo da Validação e da Aprovação: uma moldura só, dividida
 * em células por filetes de 1px. A primeira célula é o PERÍODO DA GRADE (que
 * antes ficava espremido na barra do evento, com cinco controles soltos); as
 * outras três são os números que a logística confere antes de enviar — quantas
 * vagas nascem, quantas pessoas-dia e o pico do evento.
 *
 * O período continua passando pelo `requestPeriod` da página (valida, pede
 * confirmação ao encolher com gente fora, respeita a margem de ±7 dias): aqui
 * só mudou o desenho. "−1 dia"/"+1 dia" viraram um passo a passo em volta da
 * contagem de dias — é isso que eles fazem.
 */
import { useMemo } from "react";
import { CalendarRange, Layers, Minus, Plus, RotateCcw, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { cn } from "@/lib/utils";
import { dayText } from "@/components/scaling-validation/logistics-chips";
import { PERIOD_MARGIN_DAYS, totalsByDay, type SuggestionGridRow } from "@/components/scaling-validation/scaling-grid-utils";
import { MAX_VAGAS, plural } from "./suggestion-shared";

export interface GridSummaryProps {
  periodStart: string;
  periodEnd: string;
  /** requestPeriod da página (valida, pede confirmação ao encolher etc.). */
  onPeriodChange: (start: string, end: string) => void;
  bounds: { min: string; max: string };
  /** Dias do período APLICADO (0 = período inválido). */
  daysCount: number;
  onEventPeriod: () => void;
  onShrink: () => void;
  canShrink: boolean;
  onGrow: () => void;
  canGrow: boolean;
  /** true = há erro de período (o texto fica inline, logo abaixo da faixa). */
  periodInvalid: boolean;
  /** Sem evento ou travado (envio / modo leitura). */
  disabled: boolean;
  /** A grade é igual ao período do evento — o "voltar ao período do evento" não tem o que fazer. */
  isEventPeriod: boolean;
  rows: SuggestionGridRow[];
  dates: string[];
  vagas: number;
  pessoasDia: number;
  linhas: number;
  nearLimit: boolean;
  overLimit: boolean;
}

const PERIOD_HINT = `A grade pode começar até ${PERIOD_MARGIN_DAYS} dias antes e terminar até ${PERIOD_MARGIN_DAYS} dias depois do evento.`;
const STEP = "sug-alvo flex h-8 w-8 items-center justify-center text-slate-600 transition-colors hover:bg-brand-soft hover:text-primary focus-visible:relative focus-visible:z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:text-slate-300";

function Rotulo({ icon: Icon, children, cls }: { icon: LucideIcon; children: React.ReactNode; cls?: string }) {
  return (
    <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", cls ?? "text-muted-foreground")} aria-hidden="true" />
      <span className="leading-4">{children}</span>
    </dt>
  );
}

export function GridSummary({
  periodStart, periodEnd, onPeriodChange, bounds, daysCount, onEventPeriod, onShrink, canShrink, onGrow, canGrow,
  periodInvalid, disabled, isEventPeriod, rows, dates, vagas, pessoasDia, linhas, nearLimit, overLimit,
}: GridSummaryProps) {
  // O pico é o mesmo cálculo do rodapé da grade (barato: linhas × dias).
  const totals = useMemo(() => totalsByDay(rows, dates), [rows, dates]);
  const temGrade = daysCount > 0;
  const alerta = nearLimit || overLimit;

  const kpi = (n: number | null, cls?: string) => (
    <span className={cn("block text-[22px] font-semibold leading-7 tracking-tight tabular-nums", n ? cls ?? "text-foreground" : "text-muted-foreground")}>
      {n === null ? "–" : n}
    </span>
  );

  return (
    <section aria-labelledby="sug-resumo" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 id="sug-resumo" className="text-[13px] font-semibold text-foreground">Resumo da grade</h2>
        <span className="text-2xs text-muted-foreground">Cada pessoa vira 1 vaga com os dias de trabalho dela.</span>
      </div>
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-[0_1px_2px_hsl(222_47%_11%/0.04)] xl:grid-cols-[minmax(0,1fr)_repeat(3,minmax(150px,0.34fr))]">
        {/* ── Período da grade ── */}
        <div className="col-span-3 flex min-w-0 flex-col gap-2 bg-card px-3.5 py-2.5 sm:px-4 sm:py-3 xl:col-span-1">
          <Rotulo icon={CalendarRange} cls="text-primary">Dias na grade</Rotulo>
          <dd className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="sug-period-start" className="sr-only">Início da grade</Label>
              <Input
                id="sug-period-start" type="date" value={periodStart} disabled={disabled}
                min={bounds.min || undefined} max={bounds.max || undefined}
                title={PERIOD_HINT}
                aria-invalid={periodInvalid} aria-describedby={periodInvalid ? "sug-period-error" : undefined}
                onChange={(e) => onPeriodChange(e.target.value, periodEnd)}
                className={cn("h-8 w-[130px] rounded-lg px-2 text-xs tabular-nums", periodInvalid && "border-danger-strong focus-visible:ring-danger-strong")}
              />
              <span className="text-xs text-muted-foreground" aria-hidden="true">→</span>
              <Label htmlFor="sug-period-end" className="sr-only">Fim da grade</Label>
              <Input
                id="sug-period-end" type="date" value={periodEnd} disabled={disabled}
                min={periodStart || bounds.min || undefined} max={bounds.max || undefined}
                title={PERIOD_HINT}
                aria-invalid={periodInvalid} aria-describedby={periodInvalid ? "sug-period-error" : undefined}
                onChange={(e) => onPeriodChange(periodStart, e.target.value)}
                className={cn("h-8 w-[130px] rounded-lg px-2 text-xs tabular-nums", periodInvalid && "border-danger-strong focus-visible:ring-danger-strong")}
              />
            </div>

            {/* Passo a passo: tirar/acrescentar um dia no FIM da grade, em volta da contagem. */}
            <div className="flex h-8 items-stretch overflow-hidden rounded-lg border border-border bg-card" role="group" aria-label="Dias da grade">
              <MotivoDesabilitado motivo={canShrink ? "Tirar o último dia da grade" : "A grade precisa de pelo menos 1 dia"} desabilitado={disabled || !canShrink}>
                <button type="button" className={STEP} disabled={disabled || !canShrink} onClick={onShrink} aria-label="Tirar o último dia da grade">
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </MotivoDesabilitado>
              <span
                className={cn("flex min-w-[64px] items-center justify-center border-x border-border px-2 text-xs font-semibold tabular-nums",
                  temGrade ? "bg-brand-soft text-primary" : "bg-surface-muted text-muted-foreground")}
                aria-live="polite"
              >
                {temGrade ? plural(daysCount, "dia", "dias") : "– dias"}
              </span>
              <MotivoDesabilitado motivo={canGrow ? "Acrescentar um dia ao fim da grade" : `A grade já está no limite (${PERIOD_MARGIN_DAYS} dias depois do evento)`} desabilitado={disabled || !canGrow}>
                <button type="button" className={STEP} disabled={disabled || !canGrow} onClick={onGrow} aria-label="Acrescentar um dia ao fim da grade">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </MotivoDesabilitado>
            </div>

            <MotivoDesabilitado
              motivo={isEventPeriod && !periodInvalid ? "A grade já está no período do evento" : "Voltar a grade para o período do evento"}
              desabilitado={disabled}
            >
              <button
                type="button" disabled={disabled} onClick={onEventPeriod}
                className={cn(
                  "sug-alvo inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                  isEventPeriod && !periodInvalid ? "text-muted-foreground hover:bg-muted" : "text-primary hover:bg-brand-soft/60",
                )}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {/* Entre xl e 2xl a célula do período divide a linha com três indicadores:
                    o rótulo vira só o ícone (o tooltip e o leitor de tela continuam dizendo). */}
                <span className="xl:sr-only 2xl:not-sr-only">Período do evento</span>
              </button>
            </MotivoDesabilitado>
          </dd>
        </div>

        {/* ── Vagas ── */}
        <div className="flex min-w-0 flex-col bg-card px-3.5 py-2.5 sm:px-4 sm:py-3" data-testid="sug-resumo-vagas">
          <Rotulo icon={Users} cls={alerta ? "text-danger" : "text-primary"}>Vagas</Rotulo>
          <dd className="mt-1">
            {kpi(temGrade ? vagas : null, alerta ? "text-danger" : "text-primary")}
            <span className={cn("mt-0.5 block text-2xs leading-snug", alerta ? "font-medium text-danger" : "text-muted-foreground")}>
              {overLimit ? `acima do limite de ${MAX_VAGAS} por envio` : nearLimit ? `perto do limite de ${MAX_VAGAS} por envio` : "a criar no envio"}
            </span>
          </dd>
        </div>

        {/* ── Pessoas-dia ── */}
        <div className="flex min-w-0 flex-col bg-card px-3.5 py-2.5 sm:px-4 sm:py-3">
          <Rotulo icon={Layers}><span className="whitespace-nowrap">Pessoas-dia</span></Rotulo>
          <dd className="mt-1">
            {kpi(temGrade ? pessoasDia : null)}
            <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">
              {linhas > 0 ? `em ${plural(linhas, "linha", "linhas")}` : "soma das quantidades"}
            </span>
          </dd>
        </div>

        {/* ── Pico ── */}
        <div className="flex min-w-0 flex-col bg-card px-3.5 py-2.5 sm:px-4 sm:py-3">
          <Rotulo icon={TrendingUp}>Pico</Rotulo>
          <dd className="mt-1">
            {kpi(temGrade ? totals.peakTotal : null)}
            <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">
              {totals.peakTotal > 0 ? `pessoas em ${dayText(totals.peakDate)}` : "o dia mais cheio"}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
