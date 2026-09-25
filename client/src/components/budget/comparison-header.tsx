/**
 * Topo do Comparativo (`ComparisonHeader`) — 25/09 (modularização).
 *
 * Extraído de budget-comparison.tsx: stepper, chips de status (filtráveis),
 * 3 cards de métricas, aviso informativo, comentário geral do RH e o card de
 * fechamento (aprovar comparativo / ressincronizar / reabrir Flash).
 */
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle, BarChart3, Check, CheckCircle, Clock, DollarSign, Info, ListChecks, MessageSquare, Minus,
  RefreshCw, RotateCcw, Send, TrendingDown, TrendingUp, Wallet, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import type { BudgetActual, BudgetComparison } from "@shared/schema";
import { fmt, type ComparisonRow, type StatusFilterKey } from "./comparison-utils";

const STEPS = [
  { label: "Escalação", desc: "Inclusões confirmadas" },
  { label: "Planejamento RH", desc: "Valores previstos" },
  { label: "Prestação", desc: "Resp. preenche realizado" },
  { label: "Aprovação RH", desc: "Análise e aprovação" },
  { label: "Nota Fiscal", desc: "Liberada no envio do Realizado" },
];

/** Stepper — passo atual calculado como no Realizado (não fixo). */
export function ComparisonStepper({ eventItems }: { eventItems: BudgetActual[] }) {
  // Passo atual calculado como no Realizado (não fixo): enquanto houver
  // item sem envio/decisão, ainda estamos na Prestação; tudo aprovado → NF
  const allSentOrDecided = eventItems.length > 0 && eventItems.every(i => i.sentForReview || ["aprovado", "devolvido", "rejeitado"].includes(i.rhStatus || ""));
  const allApproved = eventItems.length > 0 && eventItems.every(i => i.rhStatus === "aprovado");
  const currentStep = allApproved ? 4 : allSentOrDecided ? 3 : 2;
  // Mesmos 4 passos e rótulos do Orçamento Realizado + etapa final de NF
  const steps = STEPS;
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4">
      <div className="flex items-center justify-between">
        {steps.map((step, i) => {
          const isDone = i < currentStep;
          const isActive = i === currentStep;
          const isLast = i === steps.length - 1;
          return (
            <div key={i} className="flex items-center flex-1">
              <div className="flex items-center gap-2">
                <div className="relative flex-shrink-0">
                  {isActive && (
                    <div className="absolute inset-0 rounded-full opacity-30 animate-ping bg-success" />
                  )}
                  <div className={cn(`w-7 h-7 rounded-full flex items-center justify-center text-2xs font-bold relative`, (isDone ? "bg-success" : isActive ? "bg-success" : "bg-muted"), ((isDone || isActive) ? "text-white" : "text-muted-foreground"))}>
                    {isDone ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : (i + 1)}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className={cn("text-2xs font-semibold leading-tight", ((isDone || isActive) ? "text-success" : "text-muted-foreground"))}>{step.label}</div>
                  <div className="text-2xs text-muted-foreground leading-tight mt-0.5">{step.desc}</div>
                </div>
              </div>
              {!isLast && (
                <div className={cn(`flex-1 h-[2px] mx-3 rounded-full`, (isDone ? "bg-success" : "bg-border"))} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Chip = { key: StatusFilterKey; icon: LucideIcon; count: number; label: string; bg: string; border: string; iconColor: string; numColor: string; textColor: string; ring: string };

/** Status pills — chips clicáveis contam sobre a MESMA base filtrada pelos cards. */
export function StatusChips({ budgetActual, comparisonData, statusFilter, setStatusFilter }: {
  budgetActual: BudgetActual[]; comparisonData: ComparisonRow[]; statusFilter: StatusFilterKey | null;
  setStatusFilter: React.Dispatch<React.SetStateAction<StatusFilterKey | null>>;
}) {
  const totalActualItems = budgetActual.length;
  // Chips clicáveis contam sobre a MESMA base filtrada pelos cards
  // (comparisonData) — contar sobre budgetActual cru fazia o chip
  // prometer N itens e o filtro mostrar outro número
  const sentCount = comparisonData.filter(r => r.actual.sentForReview && (r.actual.rhStatus || "pendente") === "pendente").length;
  const approvedCount = comparisonData.filter(r => (r.actual.rhStatus || "pendente") === "aprovado").length;
  const rejectedCount = comparisonData.filter(r => (r.actual.rhStatus || "pendente") === "rejeitado").length;
  const returnedCount = comparisonData.filter(r => (r.actual.rhStatus || "pendente") === "devolvido").length;
  // "Não enviados" ficam fora da base do comparativo — o chip é apenas informativo
  const pendingCount = budgetActual.filter(a => !a.splitParentId && !a.sentForReview && (a.rhStatus || "pendente") === "pendente").length;
  const chips = [
    sentCount > 0 && { key: "para_analise" as StatusFilterKey, icon: Send, count: sentCount, label: `para análise`, bg: "bg-brand-soft", border: "border-primary/25", iconColor: "text-primary", numColor: "text-primary", textColor: "text-primary/70", ring: "ring-ring" },
    approvedCount > 0 && { key: "aprovado" as StatusFilterKey, icon: CheckCircle, count: approvedCount, label: `aprovado${approvedCount !== 1 ? "s" : ""}`, bg: "bg-success-soft", border: "border-success/25", iconColor: "text-success-strong", numColor: "text-success", textColor: "text-success/70", ring: "ring-success-strong" },
    rejectedCount > 0 && { key: "rejeitado" as StatusFilterKey, icon: XCircle, count: rejectedCount, label: `recusado${rejectedCount !== 1 ? "s" : ""}`, bg: "bg-danger-soft", border: "border-danger/25", iconColor: "text-danger-strong", numColor: "text-danger", textColor: "text-danger/70", ring: "ring-danger-strong" },
    returnedCount > 0 && { key: "devolvido" as StatusFilterKey, icon: RotateCcw, count: returnedCount, label: `devolvido${returnedCount !== 1 ? "s" : ""}`, bg: "bg-warning-soft", border: "border-warning/25", iconColor: "text-warning-strong", numColor: "text-warning", textColor: "text-warning/70", ring: "ring-warning-strong" },
  ].filter(Boolean) as Chip[];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          aria-pressed={statusFilter === chip.key}
          onClick={() => setStatusFilter(prev => prev === chip.key ? null : chip.key)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-shadow cursor-pointer ${chip.bg} ${chip.border} ${statusFilter === chip.key ? `ring-2 ${chip.ring} shadow-1` : "hover:shadow-1"}`}
          title={statusFilter === chip.key ? "Remover filtro" : "Filtrar por este status"}
        >
          <chip.icon className={`w-3 h-3 ${chip.iconColor}`} />
          <span className={`text-sm font-bold ${chip.numColor}`}>{chip.count}</span>
          <span className={`text-2xs ${chip.textColor}`}>{chip.label}</span>
        </button>
      ))}
      {pendingCount > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-warning-soft border border-warning/25"
          title="Prestações ainda não enviadas pelo responsável — não aparecem na lista abaixo"
        >
          <Clock className="w-3 h-3 text-warning-strong" aria-hidden="true" />
          <span className="text-sm font-bold text-warning">{pendingCount}</span>
          <span className="text-2xs text-warning/70">não enviado{pendingCount !== 1 ? "s" : ""}</span>
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-muted border border-border">
        <ListChecks className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-bold text-slate-600">{totalActualItems}</span>
        <span className="text-2xs text-muted-foreground">total</span>
      </div>
    </div>
  );
}

/** 3 Metric cards: Planejado, Realizado, Diferença. */
export function MetricCards({ totals }: { totals: { totalPlanned: number; totalActual: number; difference: number } }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Planejado */}
      <div className="rounded-xl border border-primary/25 p-5 bg-brand-soft">
        <div className="flex items-center justify-between mb-3">
          <p className="text-2xs uppercase text-muted-foreground font-medium tracking-widest">Total Planejado</p>
          <div className="w-7 h-7 rounded-lg bg-brand-soft/60 flex items-center justify-center">
            <DollarSign className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
          </div>
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{fmt(totals.totalPlanned)}</p>
        <p className="text-2xs text-muted-foreground font-light mt-1.5">Orçamento aprovado para o evento</p>
      </div>

      {/* Realizado */}
      <div className="rounded-xl border border-primary/25 p-5 bg-brand-soft">
        <div className="flex items-center justify-between mb-3">
          <p className="text-2xs uppercase text-muted-foreground font-medium tracking-widest">Total Realizado</p>
          <div className="w-7 h-7 rounded-lg bg-brand-soft/60 flex items-center justify-center">
            <BarChart3 className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
          </div>
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{fmt(totals.totalActual)}</p>
        <p className="text-2xs text-muted-foreground font-light mt-1.5">Valores prestados e enviados</p>
      </div>

      {/* Diferença */}
      <div className={`rounded-xl border p-5 ${
        totals.difference === 0 ? "border-border bg-surface-muted" :
        totals.difference < 0 ? "border-success/25 bg-success-soft" :
        "border-danger/25 bg-danger-soft"
      }`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-2xs uppercase text-muted-foreground font-medium tracking-widest">Diferença</p>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            totals.difference === 0 ? "bg-muted/60" :
            totals.difference < 0 ? "bg-success-soft/60" : "bg-danger-soft/60"
          }`}>
            {totals.difference === 0 ? <Minus className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" /> :
             totals.difference < 0 ? <TrendingDown className="w-3.5 h-3.5 text-success-strong" aria-hidden="true" /> :
             <TrendingUp className="w-3.5 h-3.5 text-danger-strong" aria-hidden="true" />}
          </div>
        </div>
        <p className={`text-2xl font-bold tabular-nums ${
          totals.difference === 0 ? "text-muted-foreground" :
          totals.difference < 0 ? "text-success" : "text-danger"
        }`}>
          {totals.difference > 0 ? "+" : totals.difference < 0 ? "−" : ""}{fmt(Math.abs(totals.difference))}
        </p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <p className={`text-2xs font-light ${
            totals.difference === 0 ? "text-muted-foreground" :
            totals.difference < 0 ? "text-success" : "text-danger-strong"
          }`}>
            {totals.difference === 0 ? "Sem diferença" : totals.difference < 0 ? "Economia" : "Acima do planejado"}
          </p>
          {totals.totalPlanned > 0 && totals.difference !== 0 && (
            <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
              totals.difference < 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
            }`}>
              {Math.abs(totals.difference / totals.totalPlanned * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export interface FechamentoCardProps {
  comparison: BudgetComparison;
  allItemsApproved: boolean;
  realizadoChangedAfterApproval: boolean;
  resyncPending: boolean;
  reopenPending: boolean;
  approvePending: boolean;
  onResync: () => void;
  onReopen: () => void;
  onApprove: () => void;
}

/** Fechamento do comparativo (crédito no Flash — regra 19/08). */
export function FechamentoCard(p: FechamentoCardProps) {
  const { comparison, allItemsApproved, realizadoChangedAfterApproval, resyncPending, reopenPending, approvePending, onResync, onReopen, onApprove } = p;
  // Comparativo APROVADO: o card aparece sempre (mesmo que alguma
  // prestação tenha mudado de status depois), senão os botões de
  // ressincronizar/estornar sumiriam justamente quando são precisos.
  // `allItemsApproved` continua governando só a APROVAÇÃO inicial.
  if (!(comparison.status === "aprovado" || allItemsApproved)) return null;
  if (comparison.status === "aprovado") {
    return (
      <div className="rounded-xl border border-success/25 bg-success-soft p-3.5 space-y-3">
        <div className="flex items-start gap-2.5">
          <Wallet className="w-4 h-4 text-success mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <span className="text-2xs uppercase text-success font-bold tracking-wider">Comparativo aprovado</span>
            <p className="text-sm text-success mt-0.5">
              Alimentação e mobilidade das prestações já foram creditadas na Conta Corrente Flash dos colaboradores. A nota fiscal apenas documenta o pagamento — não altera o saldo.
            </p>
          </div>
        </div>

        {/* Realizado editado depois da aprovação → o Flash ficou defasado */}
        {realizadoChangedAfterApproval && (
          <div className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2.5 flex items-start gap-2" data-testid="alert-flash-defasado">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" aria-hidden="true" />
            <p className="text-xs text-warning">
              <strong>O Realizado mudou depois da aprovação</strong> — os créditos no Flash ainda são os do momento em que o comparativo foi aprovado. Use <strong>Ressincronizar Flash</strong> para alinhar os lançamentos ao Realizado atual.
            </p>
          </div>
        )}

        {/* Correção e estorno: os dois caminhos que faltavam depois do aprovado */}
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <MotivoDesabilitado motivo="Reaplica a regra do crédito sobre o Realizado ATUAL. É idempotente: não duplica lançamento nem muda o status do comparativo." desabilitado={resyncPending || reopenPending}>
            <Button
            variant="outline"
            className={`h-8 text-xs px-3 rounded-lg font-semibold border-success/25 text-success hover:bg-success-soft ${realizadoChangedAfterApproval ? "bg-card ring-2 ring-warning/25" : "bg-card"}`}
            onClick={onResync}
            disabled={resyncPending || reopenPending}
            data-testid="button-ressincronizar-flash"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${resyncPending ? "animate-spin" : ""}`} aria-hidden="true" />
            {resyncPending ? "Ressincronizando…" : "Ressincronizar Flash"}
          </Button>
          </MotivoDesabilitado>
          <MotivoDesabilitado motivo="Devolve o comparativo para ajuste e ESTORNA os lançamentos automáticos do Flash deste evento." desabilitado={reopenPending || resyncPending}>
            <Button
            variant="outline"
            className="h-8 text-xs px-3 rounded-lg font-semibold bg-card border-warning/25 text-warning hover:bg-warning-soft"
            onClick={onReopen}
            disabled={reopenPending || resyncPending}
            data-testid="button-reabrir-comparativo"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            Reabrir comparativo (estorna o Flash)
          </Button>
          </MotivoDesabilitado>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-primary/25 bg-card p-3.5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <Wallet className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div>
          <span className="text-2xs uppercase text-muted-foreground font-bold tracking-wider">Fechamento do comparativo</span>
          <p className="text-sm text-slate-700 mt-0.5">
            Todas as prestações estão aprovadas. Ao aprovar o comparativo, <strong>alimentação e mobilidade</strong> de cada colaborador entram na Conta Corrente Flash (a diária não).
          </p>
        </div>
      </div>
      <Button
        className="h-9 text-sm px-4 rounded-xl font-bold text-primary-foreground bg-primary hover:bg-primary-hover disabled:opacity-40"
        onClick={onApprove}
        disabled={approvePending}
      >
        <CheckCircle className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
        {approvePending ? "Aprovando…" : "Aprovar comparativo e creditar o Flash"}
      </Button>
    </div>
  );
}

export interface ComparisonHeaderProps {
  budgetActual: BudgetActual[] | undefined;
  comparisonData: ComparisonRow[];
  statusFilter: StatusFilterKey | null;
  setStatusFilter: React.Dispatch<React.SetStateAction<StatusFilterKey | null>>;
  totals: { totalPlanned: number; totalActual: number; difference: number };
  rhComment: string | null | undefined;
  isRhOrAdmin: boolean;
  comparison: BudgetComparison | null | undefined;
  fechamento: Omit<FechamentoCardProps, "comparison">;
}

export function ComparisonHeader(p: ComparisonHeaderProps) {
  const { budgetActual, comparisonData, statusFilter, setStatusFilter, totals, rhComment, isRhOrAdmin, comparison, fechamento } = p;
  return (
    <>
      {/* ── Stepper ── */}
      <ComparisonStepper eventItems={budgetActual || []} />

      {/* ── Status pills ── */}
      {budgetActual && budgetActual.length > 0 && (
        <StatusChips budgetActual={budgetActual} comparisonData={comparisonData} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
      )}

      {/* ── 3 Metric cards ── */}
      <MetricCards totals={totals} />

      {/* ── Info banner ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-muted border border-border rounded-xl">
        <Info className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        <span className="text-2xs text-muted-foreground">
          Valores referentes apenas às prestações enviadas para revisão pelo responsável de função
        </span>
      </div>

      {/* ── RH comment banner ── */}
      {rhComment && (
        <div className="rounded-xl border border-border bg-card p-3.5 flex items-start gap-2.5">
          <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <span className="text-2xs uppercase text-muted-foreground font-bold tracking-wider">Comentário do RH</span>
            <p className="text-sm text-slate-700 mt-0.5">{rhComment}</p>
          </div>
        </div>
      )}

      {/* ── Fechamento do comparativo (crédito no Flash — regra 19/08) ── */}
      {isRhOrAdmin && comparison && <FechamentoCard comparison={comparison} {...fechamento} />}
    </>
  );
}

export default ComparisonHeader;
