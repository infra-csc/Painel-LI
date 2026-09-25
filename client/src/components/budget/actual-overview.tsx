/**
 * Topo do Orçamento Realizado — 25/09 (modularização). Extraído de
 * budget-actual.tsx: banner de prestações devolvidas pelo RH, stepper de
 * etapas e o banner "Total Realizado" com KPIs e barra de aprovação.
 */
import { AlertCircle, CheckCircle2, Clock, TrendingDown, TrendingUp, Users } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import type { BudgetActual } from "@shared/schema";

const formatCurrency = formatarMoeda;

/** Banner: prestações devolvidas pelo RH (derivado dos itens, item a item —
 *  o status agregado do comparativo ficava stale). */
export function DevolvedBanner({ devolvedItems, getCollaboratorName }: { devolvedItems: BudgetActual[]; getCollaboratorName: (id?: string | null) => string }) {
  if (devolvedItems.length === 0) return null;
  const commented = devolvedItems.filter(i => i.rhComment);
  const shown = commented.slice(0, 3);
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-warning/25 bg-warning-soft shadow-1">
      <div className="w-8 h-8 rounded-lg bg-warning-soft border border-warning/25 flex items-center justify-center shrink-0">
        <AlertCircle className="w-4 h-4 text-warning" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-warning m-0">
          {devolvedItems.length === 1
            ? "Prestação devolvida pelo RH"
            : `${devolvedItems.length} prestações devolvidas pelo RH`}
        </p>
        {shown.map(i => (
          <p key={i.id} className="text-xs text-warning mt-0.5 m-0">
            <span className="font-semibold">{getCollaboratorName(i.collaboratorId)}:</span> {i.rhComment}
          </p>
        ))}
        {commented.length > shown.length && (
          <p className="text-xs text-warning/80 mt-0.5 m-0">
            + {commented.length - shown.length} {commented.length - shown.length === 1 ? "outro comentário" : "outros comentários"} nos cards devolvidos
          </p>
        )}
        <p className="text-2xs text-warning/80 mt-1 m-0">Corrija os itens marcados como "Devolvido" e reenvie para revisão.</p>
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

/** Stepper — avança para "Aprovação RH" quando todos os itens do evento já foram enviados ou aprovados. */
export function ActualStepper({ eventItems }: { eventItems: BudgetActual[] }) {
  const allSentOrApproved = eventItems.length > 0 && eventItems.every(i => i.sentForReview || i.rhStatus === "aprovado");
  const currentStep = allSentOrApproved ? 3 : 2;
  const steps = STEPS;
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4">
      <div className="flex items-center">
        {steps.map((step, i) => {
          const isDone = i < currentStep;
          const isActive = i === currentStep;
          const isLast = i === steps.length - 1;
          return (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                  isDone ? "bg-success-strong text-primary-foreground shadow-2  " :
                  isActive ? "bg-primary text-primary-foreground shadow-2   ring-4 ring-primary/25 " :
                  "bg-muted  text-muted-foreground "
                }`}>
                  {isDone ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (i + 1)}
                </div>
                <div className="text-center">
                  <div className={`text-2xs font-semibold leading-tight ${
                    isDone ? "text-success " :
                    isActive ? "text-primary " :
                    "text-muted-foreground"
                  }`}>{step.label}</div>
                  <div className="text-2xs text-muted-foreground mt-0.5 hidden sm:block">{step.desc}</div>
                </div>
              </div>
              {!isLast && (
                <div className={`flex-1 h-[3px] mx-2 rounded-full mb-5 ${
                  isDone ? "bg-success-strong" : "bg-muted "
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface ActualTotalBannerProps {
  filteredItems: BudgetActual[];
  prestacaoCount: number;
  totalRealizado: number;
  totalPlanejado: number;
  totalDifference: number;
  selectedEventId: string;
}

/** Banner Total Realizado. */
export function ActualTotalBanner({ filteredItems, prestacaoCount, totalRealizado, totalPlanejado, totalDifference, selectedEventId }: ActualTotalBannerProps) {
  const nAprovadas  = filteredItems.filter(i => i.rhStatus === "aprovado").length;
  const nRevisao    = filteredItems.filter(i => i.sentForReview && !["aprovado", "devolvido", "rejeitado"].includes(i.rhStatus || "")).length;
  const nDevolvidas = filteredItems.filter(i => i.rhStatus === "devolvido").length;
  const pctAprovado = prestacaoCount > 0 ? Math.round((nAprovadas / prestacaoCount) * 100) : 0;
  return (
    <div className="bg-card/88 border border-primary/12 rounded-xl shadow-2 overflow-hidden" style={{
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
    }}>
      {/* Faixa accent roxo topo */}
      <div className="h-[3px] bg-primary" />
      <div className="flex items-stretch flex-wrap">
        {/* Esquerda — total */}
        <div className="px-7 py-5 flex flex-col justify-center gap-1 relative overflow-hidden w-full sm:w-auto sm:min-w-[230px] bg-primary-hover">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-white/60">Total Realizado</p>
          <div className="text-3xl font-semibold text-white leading-none mt-1.5 tracking-[-0.03em]">
            {formatCurrency(totalRealizado)}
          </div>
          {totalPlanejado > 0 && (
            <div className="text-2xs text-white/40 mt-0.5 tabular-nums">
              Planejado: {formatCurrency(totalPlanejado)}
            </div>
          )}
          <div className={`text-2xs mt-1.5 font-medium flex items-center gap-1 ${totalDifference === 0 ? "text-white/45" : totalDifference < 0 ? "text-success-soft" : "text-danger-soft"}`}>
            {totalDifference < 0 && <TrendingDown className="w-3 h-3" aria-hidden="true" />}
            {totalDifference > 0 && <TrendingUp className="w-3 h-3" aria-hidden="true" />}
            {!selectedEventId ? "Selecione um evento" : totalDifference === 0 ? "= planejado" : `${totalDifference > 0 ? "+" : ""}${formatCurrency(totalDifference)} vs planejado`}
          </div>
        </div>
        {/* Separador */}
        <div className="bg-primary-hover/10" style={{ width: 1 }} />
        {/* Direita — KPIs + barra */}
        <div className="flex-1 px-6 py-5 flex flex-col justify-between">
          <div className="flex items-start gap-0 flex-wrap gap-y-3">
            <div className="flex-1 flex flex-col items-center gap-1 px-3">
              <div className="text-2xl font-bold leading-none tracking-tight text-primary">{prestacaoCount}</div>
              <div className="text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" aria-hidden="true" />Prestações</div>
            </div>
            <div className="bg-primary-hover/8" style={{ width: 1, height: 36 }} />
            <div className="flex-1 flex flex-col items-center gap-1 px-3">
              <div className="text-2xl font-bold leading-none tracking-tight text-primary">{nRevisao}</div>
              <div className="text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden="true" />Em Revisão</div>
            </div>
            <div className="bg-primary-hover/8" style={{ width: 1, height: 36 }} />
            <div className="flex-1 flex flex-col items-center gap-1 px-3">
              <div className="text-2xl font-bold leading-none tracking-tight text-success">{nAprovadas}</div>
              <div className="text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3 h-3" aria-hidden="true" />Aprovadas</div>
            </div>
            {nDevolvidas > 0 && (
              <>
                <div className="bg-primary-hover/8" style={{ width: 1, height: 36 }} />
                <div className="flex-1 flex flex-col items-center gap-1 px-3">
                  <div className="text-2xl font-bold leading-none tracking-tight text-warning">{nDevolvidas}</div>
                  <div className="text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1"><AlertCircle className="w-3 h-3" aria-hidden="true" />Devolvidas</div>
                </div>
              </>
            )}
          </div>
          {prestacaoCount > 0 && (
            <div className="mt-4">
              <div className="h-2 rounded-full overflow-hidden bg-primary-hover/25">
                <div className="h-full bg-success-strong rounded-full transition-all duration-500" style={{ width: `${pctAprovado}%` }} />
              </div>
              <div className="text-2xs text-muted-foreground mt-1.5 font-light">{nAprovadas} de {prestacaoCount} aprovadas</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
