/**
 * Visão geral do Planejado (topo da tela) — 25/09 (modularização).
 *
 * Extraído de budget-planned.tsx em três blocos: barra "Total Planejado" com
 * estatísticas, timeline de etapas e os 4 KPIs. `BudgetOverviewCards` compõe
 * os três na mesma ordem de antes.
 */
import { BarChart3, Calendar, Home, UserCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Event } from "@shared/schema";
import type { EstatisticasDoPlanejado } from "@/hooks/use-budget-engine";
import { ddmm, formatCurrency, formatEventDate } from "./types";

export interface BudgetOverviewCardsProps {
  selectedEvent: Event | undefined;
  totalGeral: number;
  stats: EstatisticasDoPlanejado;
}

/** Dashboard Bar Superior: hero "Total Planejado" + colaboradores/casa/freela/período. */
function BudgetDashboardBar({ selectedEvent, totalGeral, stats }: BudgetOverviewCardsProps) {
  return (
    <div className="bg-card/85 border border-primary/12 rounded-xl shadow-2 overflow-hidden" style={{
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
    }}>
      {/* Faixa accent azul topo */}
      <div className="h-[3px] bg-primary" />

      {/* flex-wrap: em telas <900px o hero e os stats quebram em linhas */}
      <div className="flex flex-wrap items-stretch">
        {/* Total Planejado — hero section */}
        <div className="px-7 py-5 flex flex-col justify-center gap-1 relative overflow-hidden grow max-[900px]:w-full bg-primary min-w-[230px]">
          <p className="text-2xs font-extrabold uppercase tracking-[0.14em] text-white/75 relative">Total Planejado</p>
          {selectedEvent?.startDate && (
            <p className="flex items-center gap-1 text-2xs text-white/70 relative">
              <Calendar className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
              {formatEventDate(selectedEvent.startDate)}
            </p>
          )}
          <div className="text-3xl font-semibold text-white leading-none tracking-tight mt-1.5 relative tracking-[-0.03em]">
            {formatCurrency(totalGeral)}
          </div>
        </div>

        {/* Separador vertical */}
        <div className="max-[900px]:hidden bg-primary/10" style={{ width: 1 }} />

        {/* Stats */}
        <div className="flex-1 px-6 py-5 flex flex-wrap items-center gap-y-3 min-w-[280px]">
          {/* Colaboradores */}
          <div className="flex-1 min-w-[110px] flex flex-col items-center gap-1 px-4">
            <div className="text-2xl font-black leading-none tracking-tight text-primary">{stats.total}</div>
            <div className="flex items-center gap-1 text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
              <Users className="w-3 h-3" aria-hidden="true" />Colaboradores
            </div>
          </div>

          <div className="max-[900px]:hidden bg-primary/8" style={{ width: 1, height: 36 }} />

          {/* Casa */}
          <div className="flex-1 min-w-[90px] flex flex-col items-center gap-1 px-4">
            <div className="text-2xl font-black leading-none tracking-tight text-primary">{stats.totalCasa}</div>
            <div className="flex items-center gap-1 text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
              <Home className="w-3 h-3" aria-hidden="true" />Casa
            </div>
          </div>

          <div className="max-[900px]:hidden bg-primary/8" style={{ width: 1, height: 36 }} />

          {/* Freela */}
          <div className="flex-1 min-w-[90px] flex flex-col items-center gap-1 px-4">
            <div className="text-2xl font-black leading-none tracking-tight text-warning">{stats.totalFreela}</div>
            <div className="flex items-center gap-1 text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
              <UserCheck className="w-3 h-3" aria-hidden="true" />Freela
            </div>
          </div>

          <div className="max-[900px]:hidden bg-primary/8" style={{ width: 1, height: 36 }} />

          {/* Período do evento */}
          <div className="flex-1 min-w-[90px] flex flex-col items-center gap-1 px-4">
            {selectedEvent?.startDate && selectedEvent?.endDate ? (
              <div className="flex flex-col items-center gap-0">
                <div className="text-sm font-black leading-none tracking-tight tabular-nums text-info">
                  {ddmm(selectedEvent.startDate)}
                </div>
                <div className="text-2xs font-bold text-muted-foreground leading-none my-0.5">→</div>
                <div className="text-sm font-black leading-none tracking-tight tabular-nums text-info">
                  {ddmm(selectedEvent.endDate)}
                </div>
              </div>
            ) : (
              <div className="text-sm font-black leading-none tracking-tight text-muted-foreground">—</div>
            )}
            <div className="flex items-center gap-1 text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
              <Calendar className="w-3 h-3" aria-hidden="true" />Período
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { label: "Escalação", desc: "Inclusões confirmadas" },
  { label: "Planejamento RH", desc: "Valores previstos" },
  { label: "Prestação", desc: "Resp. preenche realizado" },
  { label: "Aprovação RH", desc: "Análise e aprovação" },
];

/** Timeline de etapas. */
function BudgetStepper({ stats }: { stats: EstatisticasDoPlanejado }) {
  // Etapa derivada do progresso real: com tudo enviado, o RH concluiu
  // o planejamento e a bola passa para a Prestação.
  const currentStep = stats.total > 0 && stats.progressoEnvio >= 100 ? 2 : 1;
  const steps = STEPS;
  return (
    <div className="bg-card rounded-xl px-6 py-5 border border-primary/25 shadow-2">
      <div className="flex items-center justify-between mb-5">
        <div>
          <span className="text-2xs font-black uppercase tracking-[0.12em] text-muted-foreground">Etapa atual</span>
          <div className="text-sm font-bold text-primary mt-0.5">{steps[currentStep].label}</div>
        </div>
      </div>
      {/* flex-wrap + min-width por etapa: abaixo de ~900px o stepper quebra em 2 linhas */}
      <div className="flex items-center flex-wrap gap-y-4">
        {steps.map((step, i) => {
          const isDone = i < currentStep;
          const isActive = i === currentStep;
          const isLast = i === steps.length - 1;
          return (
            <div key={i} className="flex items-center flex-1 min-w-[150px]">
              <div className="flex flex-col items-center gap-2">
                {/* Bolinha */}
                <div className="relative shrink-0">
                  {/* Ping no step ativo */}
                  {isActive && (
                    <span className="stepper-ping absolute rounded-full border-2 border-primary/35" style={{
                      inset: -4,
                      animation: "stepperPing 1.6s ease-out infinite",
                    }} />
                  )}
                  <div className={cn("rounded-full flex items-center justify-center",
                    isDone ? "w-8 h-8 bg-success-strong shadow-1"
                      : isActive ? "w-9 h-9 bg-primary ring-4 ring-primary/10 shadow-2"
                      : "w-8 h-8 bg-muted")}>
                    {isDone ? (
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className={cn("text-xs font-extrabold", (isActive ? "text-white" : "text-muted-foreground"))}>{i + 1}</span>
                    )}
                  </div>
                </div>
                {/* Labels */}
                <div className="text-center">
                  <div className={cn("text-2xs font-bold leading-tight", (isDone ? "text-success" : isActive ? "text-primary" : "text-muted-foreground"))}>{step.label}</div>
                  <div className="text-2xs text-muted-foreground mt-0.5">{step.desc}</div>
                </div>
              </div>
              {!isLast && (
                <div className="mb-7 ml-1.5 mr-1.5 rounded-full" style={{
                  flex: 1,
                  height: 3,
                  background: isDone
                    ? "var(--success-strong)"
                    : "var(--muted)",
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, tone, tooltip }: {
  icon: LucideIcon; label: string; value: string; sub: string; tooltip: string;
  tone: { border: string; iconBg: string; text: string };
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`rounded-xl bg-card cursor-default border-t-[3px] ${tone.border} shadow-1`}>
            <div className="px-5 py-4 pb-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tone.iconBg}`}>
                  <Icon className={tone.text} style={{ width: 13, height: 13 }} aria-hidden="true" />
                </div>
                <span className="text-2xs font-semibold tracking-widest uppercase text-muted-foreground">{label}</span>
              </div>
              <div className={`text-lg font-medium ${tone.text} tracking-[-0.02em] tabular-nums leading-none`}>
                {value}
              </div>
              <div className="flex items-center gap-1 mt-2">
                <span className="text-2xs text-muted-foreground font-normal">{sub}</span>
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-[180px] text-center">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const TONE_PRIMARY = { border: "border-t-primary", iconBg: "bg-primary/8", text: "text-primary" };
const TONE_WARNING = { border: "border-t-warning-strong", iconBg: "bg-warning/8", text: "text-warning" };
const TONE_INFO = { border: "border-t-info", iconBg: "bg-info/8", text: "text-info" };

/** KPI Cards: Casa, Freela, Médio/Pessoa, Médio/Dia. */
function BudgetKpiCards({ stats }: { stats: EstatisticasDoPlanejado }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard icon={Home} label="Casa" value={formatCurrency(stats.valorCasa)} sub={`${stats.totalCasa} colaborador${stats.totalCasa !== 1 ? "es" : ""}`} tone={TONE_PRIMARY} tooltip="Colaboradores que trabalham no próprio estado" />
      <KpiCard icon={UserCheck} label="Freela" value={formatCurrency(stats.valorFreela)} sub={`${stats.totalFreela} colaborador${stats.totalFreela !== 1 ? "es" : ""}`} tone={TONE_WARNING} tooltip="Colaboradores contratados por evento" />
      <KpiCard icon={Users} label="Médio / Pessoa" value={formatCurrency(stats.media)} sub="por colaborador" tone={TONE_PRIMARY} tooltip="Média de custo por colaborador neste evento" />
      <KpiCard icon={BarChart3} label="Médio / Dia" value={formatCurrency(stats.mediaPorDia)} sub="por dia trabalhado" tone={TONE_INFO} tooltip="Média de custo por dia trabalhado neste evento" />
    </div>
  );
}

export function BudgetOverviewCards(p: BudgetOverviewCardsProps) {
  return (
    <>
      <BudgetDashboardBar {...p} />
      <BudgetStepper stats={p.stats} />
      <BudgetKpiCards stats={p.stats} />
    </>
  );
}

export default BudgetOverviewCards;
