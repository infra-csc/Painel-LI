/**
 * Topo do Comparativo — 25/09 (modularização); redesenho 08/10.
 *
 * Antes eram seis blocos empilhados: o stepper num cartão próprio, as pílulas
 * de status, três cartões de métrica coloridos, um aviso cinza, o comentário
 * do RH e o cartão de fechamento — ~420px antes da primeira prestação.
 *
 * Agora é o MESMO painel do Planejado e do Realizado (as etapas anteriores do
 * fluxo), lido como um extrato: o total realizado, o planejado, a diferença
 * (com sinal e %) e Casa × Freela; embaixo, numa faixa fina, o andamento da
 * análise do RH e as cinco etapas (a quinta é a nota fiscal). As pílulas
 * viraram a fila de situações (comparison-filters), o aviso cinza virou a
 * linha de apoio do total, e o fechamento (Flash) ficou num painel próprio,
 * logo abaixo, só para quem decide. Nada saiu: planejado, realizado,
 * diferença, %, "não enviadas", total de prestações, etapa atual, comentário
 * do RH, fechamento, ressincronizar e reabrir — com os mesmos testids.
 */
import { AlertTriangle, Calculator, Check, CheckCircle, Equal, Home, Loader2, MessageSquare, RefreshCw, RotateCcw, TrendingDown, TrendingUp, UserCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import type { BudgetActual, BudgetComparison, Event } from "@shared/schema";
import { Metrica } from "./budget-overview-cards";
import { diferencaComSinal } from "./actual-overview";
import { formatCurrency, formatEventDate } from "./types";
import type { ComparisonRow } from "./comparison-utils";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const ETAPAS = [
  { label: "Escalação", desc: "Inclusões confirmadas" },
  { label: "Planejamento RH", desc: "Valores previstos" },
  { label: "Prestação", desc: "Resp. preenche realizado" },
  { label: "Aprovação RH", desc: "Análise e aprovação" },
  { label: "Nota fiscal", desc: "Liberada no envio do Realizado" },
];

/** Etapa atual — a mesma regra do stepper de antes: enquanto houver item sem
 *  envio/decisão, ainda é a Prestação; tudo aprovado → Nota fiscal. */
export function etapaDoComparativo(eventItems: BudgetActual[]): number {
  const allSentOrDecided = eventItems.length > 0 && eventItems.every(i => i.sentForReview || ["aprovado", "devolvido", "rejeitado"].includes(i.rhStatus || ""));
  const allApproved = eventItems.length > 0 && eventItems.every(i => i.rhStatus === "aprovado");
  return allApproved ? 4 : allSentOrDecided ? 3 : 2;
}

/**
 * As cinco etapas numa linha — o desenho do `TrilhoDeEtapas` do Planejado
 * (mesmas classes), com a quinta etapa do Comparativo (Nota fiscal). O do
 * Planejado tem quatro etapas fixas e mora num arquivo de outra frente; por
 * isso a cópia curta aqui em vez de uma prop nova lá.
 */
export function TrilhoDoComparativo({ atual }: { atual: number }) {
  return (
    <ol className="m-0 p-0 list-none flex items-center gap-1.5 min-w-0" aria-label={`Etapa atual: ${ETAPAS[atual].label}`} data-testid="trilho-comparativo">
      {ETAPAS.map((s, i) => {
        const feita = i < atual;
        const ativa = i === atual;
        return (
          <li
            key={s.label}
            title={`${s.label} — ${s.desc}`}
            aria-current={ativa ? "step" : undefined}
            className={cn("flex items-center gap-1.5 min-w-0", !ativa && "max-md:hidden")}
          >
            {i > 0 && <span aria-hidden="true" className={cn("hidden md:block w-4 h-px shrink-0", feita || ativa ? "bg-success-strong/60" : "bg-border")} />}
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex items-center justify-center w-[18px] h-[18px] rounded-full shrink-0 text-2xs font-semibold",
                feita ? "bg-success-strong text-white" : ativa ? "pla-etapa-atual bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {feita ? <Check className="w-2.5 h-2.5" strokeWidth={3.5} /> : i + 1}
            </span>
            <span className={cn("text-xs whitespace-nowrap", ativa ? "font-semibold text-foreground" : feita ? "text-success" : "text-muted-foreground")}>
              {ativa && <span className="md:hidden text-muted-foreground font-normal">Etapa {i + 1} de {ETAPAS.length} · </span>}
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export interface TotaisDoComparativo {
  totalPlanned: number;
  totalActual: number;
  difference: number;
  totalCasa: number;
  totalFreela: number;
  nCasa: number;
  nFreela: number;
}

export interface ResumoDoComparativoProps {
  selectedEvent: Event | undefined;
  /** Todas as prestações do evento (etapa atual). */
  budgetActual: BudgetActual[];
  /** Base do comparativo (enviadas ou decididas, divisões agrupadas). */
  comparisonData: ComparisonRow[];
  totals: TotaisDoComparativo;
  naoEnviadas: number;
}

/** Painel de resumo: o número da tela, a comparação e o andamento da análise. */
export function ResumoDoComparativo({ selectedEvent, budgetActual, comparisonData, totals, naoEnviadas }: ResumoDoComparativoProps) {
  const { totalPlanned, totalActual, difference } = totals;
  const igual = Math.abs(difference) <= 1;
  const pct = totalPlanned > 0 && !igual ? Math.round((difference / totalPlanned) * 1000) / 10 : null;
  const n = comparisonData.length;
  const nAprovadas = comparisonData.filter(r => r.actual.rhStatus === "aprovado").length;
  const nAusentes = comparisonData.filter(r => r.planned?.didNotAttend).length;
  const tudoAprovado = n > 0 && nAprovadas === n;
  const pctAprovado = n > 0 ? Math.round((nAprovadas / n) * 100) : 0;

  return (
    <section aria-label="Resumo do comparativo" className="pla-resumo rea-resumo rounded-xl border border-border bg-card overflow-hidden" data-testid="resumo-comparativo">
      <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]">
        {/* O número da tela. */}
        <div className="col-span-2 lg:col-span-1 min-w-0 px-4 pt-3.5 pb-3 max-lg:border-b border-border">
          <p className="m-0 text-xs font-medium text-slate-600">
            Total realizado
            {selectedEvent?.startDate && <span className="text-muted-foreground font-normal"> · {formatEventDate(selectedEvent.startDate)}</span>}
          </p>
          <p className="m-0 mt-0.5 text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] tabular-nums text-primary" data-testid="total-comparativo">
            {formatCurrency(totalActual)}
          </p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground tabular-nums truncate" title="Só entram as prestações enviadas para revisão pelo responsável de função (e as já decididas pelo RH)">
            {plural(n, "prestação enviada", "prestações enviadas")}
            {naoEnviadas > 0 && (
              <span className="text-warning font-medium" title="Ainda não enviadas pelo responsável — ficam fora do comparativo até o envio no Realizado">
                {" "}· {plural(naoEnviadas, "não enviada", "não enviadas")}
              </span>
            )}
            {nAusentes > 0 && <span title="Quem não participou fica fora dos totais"> · {nAusentes} não {nAusentes === 1 ? "participou" : "participaram"}</span>}
          </p>
        </div>
        <Metrica icon={Calculator} label="Planejado" value={formatCurrency(totalPlanned)} sub="orçamento do evento" cor="text-muted-foreground"
          tooltip="Soma do planejado das prestações enviadas (sem quem não participou)" />
        <Metrica
          icon={igual ? Equal : difference > 0 ? TrendingUp : TrendingDown}
          label="Diferença"
          value={diferencaComSinal(difference)}
          corValor={igual ? "text-foreground" : difference > 0 ? "text-danger" : "text-success"}
          sub={igual ? "igual ao planejado" : pct !== null ? `${Math.abs(pct).toLocaleString("pt-BR")}% ${difference > 0 ? "acima do previsto" : "de economia"}` : difference > 0 ? "acima do planejado" : "abaixo do planejado"}
          cor={igual ? "text-muted-foreground" : difference > 0 ? "text-danger" : "text-success"}
          tooltip="Realizado menos planejado: positivo = gastou mais que o previsto; negativo = economia"
        />
        <Metrica icon={Home} label="Casa" value={formatCurrency(totals.totalCasa)} sub={plural(totals.nCasa, "prestação", "prestações")} cor="text-primary" tooltip="Realizado dos colaboradores da casa" />
        <Metrica icon={UserCheck} label="Freela" value={formatCurrency(totals.totalFreela)} sub={plural(totals.nFreela, "prestação", "prestações")} cor="text-warning" tooltip="Realizado dos colaboradores contratados por evento" />
      </div>

      {/* Andamento: quanto o RH já aprovou e em que etapa o evento está. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 border-t border-border bg-surface-muted/60">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0 max-sm:w-full" data-testid="progresso-analise">
          <span className="text-xs font-medium text-slate-600 whitespace-nowrap">Análise do RH</span>
          <span
            role="progressbar"
            aria-label="Prestações aprovadas pelo RH"
            aria-valuemin={0}
            aria-valuemax={n}
            aria-valuenow={nAprovadas}
            className="relative w-28 sm:w-36 h-1.5 rounded-full bg-border overflow-hidden shrink-0 max-sm:flex-1"
          >
            <span className="pla-progresso absolute inset-y-0 left-0 rounded-full bg-success-strong" style={{ width: `${pctAprovado}%` }} />
          </span>
          <span className={cn("text-xs tabular-nums whitespace-nowrap", tudoAprovado ? "text-success font-semibold" : "text-muted-foreground")}>
            {tudoAprovado
              ? <><Check className="inline w-3.5 h-3.5 -mt-0.5 mr-0.5" aria-hidden="true" />Todas aprovadas</>
              : `${nAprovadas} de ${n} aprovadas`}
          </span>
        </div>
        <div className="md:ml-auto min-w-0">
          <TrilhoDoComparativo atual={etapaDoComparativo(budgetActual)} />
        </div>
      </div>
    </section>
  );
}

/** Comentário do RH sobre o comparativo (aprovação, recusa ou devolução). */
export function ComentarioDoComparativo({ rhComment, comparison }: { rhComment: string | null | undefined; comparison: BudgetComparison | null | undefined }) {
  if (!rhComment) return null;
  const emAjuste = comparison?.status === "devolvido" || comparison?.status === "rejeitado";
  return (
    <div
      role="note"
      className={cn(
        "pas-entra flex items-start gap-3 rounded-xl border px-4 py-3",
        emAjuste ? "border-warning/25 bg-warning-soft" : "border-border bg-card",
      )}
      data-testid="comentario-comparativo"
    >
      <MessageSquare className={cn("w-4 h-4 mt-0.5 shrink-0", emAjuste ? "text-warning-strong" : "text-muted-foreground")} aria-hidden="true" />
      <div className="min-w-0">
        <p className={cn("m-0 text-sm font-semibold", emAjuste ? "text-warning" : "text-foreground")}>
          Comentário do RH
          {comparison?.status === "devolvido" && <span className="font-normal"> — comparativo devolvido para ajuste</span>}
          {comparison?.status === "rejeitado" && <span className="font-normal"> — comparativo recusado</span>}
        </p>
        <p className={cn("m-0 mt-0.5 text-sm leading-relaxed", emAjuste ? "text-warning" : "text-slate-600")}>{rhComment}</p>
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
  /** Comentário do RH no comparativo aprovado — mora no painel, não num cartão à parte. */
  observacao?: string | null;
}

/** Botão do painel de fechamento: altura e peso da família (34px, com texto). */
const BOTAO = "pas-alvo inline-flex items-center justify-center gap-1.5 h-[34px] px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 disabled:pointer-events-none";

/**
 * Fechamento do comparativo (crédito no Flash — regra 19/08). Só para quem
 * decide. Comparativo APROVADO: o painel aparece sempre (mesmo que alguma
 * prestação tenha mudado de status depois), senão ressincronizar/reabrir
 * sumiriam justamente quando são precisos. `allItemsApproved` governa só a
 * APROVAÇÃO inicial.
 */
export function FechamentoCard(p: FechamentoCardProps) {
  const { comparison, allItemsApproved, realizadoChangedAfterApproval, resyncPending, reopenPending, approvePending, onResync, onReopen, onApprove, observacao } = p;
  if (!(comparison.status === "aprovado" || allItemsApproved)) return null;

  if (comparison.status === "aprovado") {
    return (
      <section aria-label="Fechamento do comparativo" className="pas-entra rounded-xl border border-success/25 bg-card overflow-hidden" data-testid="fechamento-comparativo">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <span className="max-sm:hidden inline-flex items-center justify-center w-8 h-8 rounded-full bg-success-soft text-success shrink-0" aria-hidden="true">
            <Wallet className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1 basis-[280px]">
            <p className="m-0 text-sm font-semibold text-foreground">Comparativo aprovado — Flash creditado</p>
            <p className="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Alimentação e mobilidade das prestações já entraram na Conta Corrente Flash dos colaboradores. A nota fiscal só documenta o pagamento — não altera o saldo.
            </p>
            {observacao && (
              <p className="m-0 mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600" data-testid="comentario-comparativo">
                <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span><span className="font-medium text-slate-700">Comentário do RH:</span> {observacao}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
            <MotivoDesabilitado motivo="Reaplica a regra do crédito sobre o Realizado ATUAL. É idempotente: não duplica lançamento nem muda o status do comparativo." desabilitado={resyncPending || reopenPending}>
              <button
                type="button"
                className={cn(BOTAO, "max-sm:flex-1 border bg-card text-foreground", realizadoChangedAfterApproval ? "border-warning/50 hover:bg-warning-soft" : "border-border hover:bg-muted")}
                onClick={onResync}
                disabled={resyncPending || reopenPending}
                data-testid="button-ressincronizar-flash"
              >
                {resyncPending
                  ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  : <RefreshCw className="w-4 h-4" aria-hidden="true" />}
                {resyncPending ? "Ressincronizando…" : "Ressincronizar Flash"}
              </button>
            </MotivoDesabilitado>
            <MotivoDesabilitado motivo="Devolve o comparativo para ajuste e APAGA os lançamentos automáticos do Flash deste evento (alimentação e mobilidade saem do saldo)." desabilitado={reopenPending || resyncPending}>
              <button
                type="button"
                className={cn(BOTAO, "max-sm:flex-1 border border-border bg-card text-warning hover:bg-warning-soft hover:border-warning/30")}
                onClick={onReopen}
                disabled={reopenPending || resyncPending}
                data-testid="button-reabrir-comparativo"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                Reabrir comparativo
              </button>
            </MotivoDesabilitado>
          </div>
        </div>

        {/* Realizado editado depois da aprovação → o Flash ficou defasado */}
        {realizadoChangedAfterApproval && (
          <div className="flex items-start gap-2.5 px-4 py-2.5 border-t border-warning/25 bg-warning-soft" data-testid="alert-flash-defasado">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning-strong" aria-hidden="true" />
            <p className="m-0 text-xs leading-relaxed text-warning">
              <strong>O Realizado mudou depois da aprovação</strong> — os créditos no Flash ainda são os do momento em que o comparativo foi aprovado. Use <strong>Ressincronizar Flash</strong> para alinhar os lançamentos ao Realizado atual.
            </p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Fechamento do comparativo" className="pas-entra flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-primary/30 bg-brand-soft/40 px-4 py-3" data-testid="fechamento-comparativo">
      <span className="max-sm:hidden inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-soft text-primary shrink-0" aria-hidden="true">
        <Wallet className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1 basis-[280px]">
        <p className="m-0 text-sm font-semibold text-foreground">Todas as prestações aprovadas — falta fechar o comparativo</p>
        <p className="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Ao aprovar o comparativo, <strong className="font-semibold text-slate-700">alimentação e mobilidade</strong> de cada colaborador entram na Conta Corrente Flash (a diária não).
        </p>
      </div>
      <button
        type="button"
        className={cn(BOTAO, "max-sm:w-full bg-primary text-primary-foreground hover:bg-primary-hover")}
        onClick={onApprove}
        disabled={approvePending}
        data-testid="button-aprovar-comparativo"
      >
        {approvePending
          ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          : <CheckCircle className="w-4 h-4" aria-hidden="true" />}
        {approvePending ? "Aprovando…" : "Aprovar comparativo e creditar o Flash"}
      </button>
    </section>
  );
}

export default ResumoDoComparativo;
