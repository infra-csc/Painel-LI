// Extraído de rh-control.tsx em 25/09 (modularização): corpo expandido do
// cartão de prestação — stepper, painel financeiro (Planejado × Realizado com
// detalhamento), comentário do RH e o rodapé de navegação/ações de NF.
import { formatarMoeda } from "@/lib/format";
import { CheckCircle, FileText, FileCheck, ChevronRight, ArrowRight, CircleDot, Ban, Check } from "lucide-react";
import type { NotaParaControle, PrestacaoItem } from "./prestacao-types";
import { formatDateTime, type NavigationTarget } from "./prestacao-utils";
import { TimelinePrestacao } from "./timeline-prestacao";

// Formatador único (lib/format)
const fmt = formatarMoeda;

export interface CartaoPrestacaoCorpoProps {
  item: PrestacaoItem;
  /** Nota fiscal do `item.actual`, se houver. */
  invoice: NotaParaControle | undefined;
  itemEmitsNf: boolean;
  navTarget: NavigationTarget | null;
  hasCheckin: boolean;
  canRh: boolean;
  showDetails: boolean;
  toggleDetails: (id: string) => void;
  navigate: (path: string) => void;
}

export function CartaoPrestacaoCorpo({
  item, invoice, itemEmitsNf, navTarget, hasCheckin, canRh, showDetails, toggleDetails, navigate,
}: CartaoPrestacaoCorpoProps) {
  return (
    <div className="border-t border-border bg-surface-muted/30 px-4 pb-4 pt-3 space-y-3">

      {/* Stepper — rola horizontalmente em telas estreitas */}
      <div className="rounded-lg bg-card border border-border px-4 py-3 shadow-1 overflow-x-auto">
        <TimelinePrestacao item={item} invoice={invoice} itemEmitsNf={itemEmitsNf} />
      </div>

      {/* Financial panels — only when planned exists */}
      {item.planned && (() => {
        const hasActual = !!item.actual;

        if (!hasActual) {
          /* Variation: stepper-only (no financial data yet) */
          return null;
        }

        const diff = item.actual!.totalValue - item.planned.totalValue;
        const isNegative = diff < 0;
        const isZero = diff === 0;
        const pct = item.planned.totalValue > 0
          ? Math.abs(diff / item.planned.totalValue * 100).toFixed(1)
          : "0";

        const nfInvFin = item.actual ? invoice : null;
        const checkinPayStr = nfInvFin?.checkinAt && nfInvFin?.paymentDate
          ? new Date(nfInvFin.paymentDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
          : null;

        return (
          <div className="space-y-2">
            {/* Compact single-line financial summary */}
            <div className="rounded-lg bg-surface-muted border border-border px-3 py-2 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-2xs">
                <span className="uppercase text-2xs font-semibold tracking-wide text-muted-foreground">Planejado</span>
                <span className="font-semibold text-primary tabular-nums">{fmt(item.planned.totalValue)}</span>
                <span className="text-muted-foreground">→</span>
                <span className="uppercase text-2xs font-semibold tracking-wide text-muted-foreground">Realizado</span>
                <span className="font-semibold text-primary tabular-nums">{fmt(item.actual!.totalValue)}</span>
              </div>
              {isZero ? (
                <span className="inline-flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded bg-success-soft text-success">
                  <Check className="w-3 h-3" strokeWidth={3} aria-hidden="true" /> Idênticos · {fmt(item.planned.totalValue)}
                </span>
              ) : (
                <span className={`text-2xs font-semibold tabular-nums ${isNegative ? 'text-success' : 'text-danger'}`}>
                  {isNegative ? '▼' : '▲'} {fmt(Math.abs(diff))} ({isNegative ? '−' : '+'}{pct}%)
                </span>
              )}
              <button
                className="ml-auto text-2xs text-primary hover:text-primary-hover font-medium flex items-center gap-0.5 shrink-0"
                onClick={() => toggleDetails(item.id)}
              >
                {showDetails ? 'Ocultar' : 'Ver detalhes'} <ChevronRight className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-90' : ''}`} aria-hidden="true" />
              </button>
            </div>

            {/* Breakdown — visible only when expanded */}
            {showDetails && (
              <div className="grid grid-cols-2 divide-x divide-border rounded-lg border border-border overflow-hidden">
                <div className="p-3">
                  <p className="text-2xs font-semibold uppercase tracking-widest mb-1.5 text-primary">Planejado</p>
                  <div className="space-y-1 text-2xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Diárias</span><span className="tabular-nums text-slate-600">{item.planned.dailyQuantity}× {fmt(item.planned.dailyValue)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Alimentação</span><span className="tabular-nums text-slate-600">{fmt(item.planned.weekdayLunch + item.planned.weekdayDinner + item.planned.weekendLunch + item.planned.weekendDinner)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Mobilidade</span><span className="tabular-nums text-slate-600">{fmt(item.planned.mobility + item.planned.transport)}</span></div>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-2xs font-semibold uppercase tracking-widest mb-1.5 text-primary">Realizado</p>
                  <div className="space-y-1 text-2xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Diárias</span><span className="tabular-nums text-slate-600">{item.actual!.dailyQuantity}× {fmt(item.actual!.dailyValue)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Alimentação</span><span className="tabular-nums text-slate-600">{fmt((item.actual!.weekdayLunch ?? 0) + (item.actual!.weekdayDinner ?? 0) + (item.actual!.weekendLunch ?? 0) + (item.actual!.weekendDinner ?? 0))}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Mobilidade</span><span className="tabular-nums text-slate-600">{fmt((item.actual!.mobility ?? 0) + (item.actual!.transport ?? 0))}</span></div>
                  </div>
                  {item.actual!.changeReason && (
                    <p className="text-2xs text-muted-foreground italic mt-2 pt-1.5 border-t border-border">{item.actual!.changeReason}</p>
                  )}
                </div>
              </div>
            )}

            {/* Payment info after check-in */}
            {nfInvFin?.checkinAt && (
              <div className="rounded-lg bg-success-soft border border-success/25 px-3 py-2 flex items-center justify-between">
                <span className="text-2xs text-success font-semibold flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" /> Check-in Financeiro Realizado
                </span>
                {checkinPayStr && <span className="text-2xs text-success font-medium">💳 Pagamento: {checkinPayStr}</span>}
              </div>
            )}
          </div>
        );
      })()}

      {/* RH comment */}
      {item.actual?.rhComment && (
        <div className="px-3 py-2.5 rounded-lg bg-surface-muted border border-border">
          <p className="text-2xs font-semibold text-muted-foreground mb-1">Comentário do RH</p>
          <p className="text-xs text-slate-600">{item.actual.rhComment}</p>
          {item.actual.rhActionAt && (
            <p className="text-2xs text-muted-foreground mt-1">
              {formatDateTime(item.actual.rhActionAt)} — {item.rhActionByName ?? "-"}
            </p>
          )}
        </div>
      )}

      {/* Action footer */}
      {(navTarget || (item.status === "aprovada_faturamento" && item.actual)) && (
        <div className="flex items-center justify-between pt-1">
          {/* NF status info */}
          {item.status === "aprovada_faturamento" && item.actual && (() => {
            const nfInv = invoice;
            const nfStatus = nfInv?.status || "pendente";
            if (nfStatus === "pendente" && !itemEmitsNf) {
              return (
                <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                  Não emite NF — definido na escalação
                </span>
              );
            }
            if (nfStatus === "pendente") {
              return (
                <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                  Aguardando envio da nota fiscal
                </span>
              );
            }
            // Recusa é terminal — sem CTA no footer
            if (nfStatus === "recusada") {
              return (
                <span className="flex items-center gap-1.5 text-2xs text-danger font-medium">
                  <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                  NF recusada — decisão definitiva, sem reenvio
                </span>
              );
            }
            if (nfStatus === "devolvida") {
              return (
                <span className="flex items-center gap-1.5 text-2xs text-warning-strong font-medium">
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                  Nota devolvida
                </span>
              );
            }
            return <span />;
          })()}
          {!(item.status === "aprovada_faturamento" && item.actual) && <span />}

          {/* Primary / secondary nav button */}
          <div className="flex items-center gap-2 ml-auto">
            {navTarget && (() => {
              const isPrimary = item.status === "prestacao_recebida" || item.status === "planejamento_pendente";
              const bg = item.status === "prestacao_recebida" ? "var(--success)" : "var(--primary)";
              return (
                <button
                  onClick={() => navigate(navTarget.path)}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isPrimary ? "text-white shadow-1" : "border border-border text-slate-600 hover:bg-surface-muted"
                  }`}
                  style={isPrimary ? { background: bg } : undefined}
                >
                  {item.status === "prestacao_recebida" ? "Analisar comparativo" : navTarget.label}
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </button>
              );
            })()}

            {item.status === "aprovada_faturamento" && item.actual && (() => {
              const nfInv = invoice;
              const nfStatus = nfInv?.status || "pendente";
              if (nfStatus === "enviada") {
                // Aprovação de NF é exclusiva do RH/admin — sem CTA para os demais
                if (!canRh) return null;
                return (
                  <button
                    onClick={() => navigate(`/invoices?event=${item.event.id}&tab=aprovacao`)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white shadow-1 transition-colors bg-primary-hover"
                  >
                    <FileText className="w-3 h-3" aria-hidden="true" />
                    Aprovar nota fiscal
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                );
              }
              if (nfStatus === "devolvida") {
                return (
                  <button
                    onClick={() => navigate(`/invoices?event=${item.event.id}`)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold border border-warning/25 text-warning hover:bg-warning-soft transition-colors"
                  >
                    Ver notas fiscais
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                );
              }
              // nfStatus "aprovada" + sem check-in → leva para tela de check-in (card específico)
              if (nfStatus === "aprovada" && !hasCheckin) {
                // Check-in financeiro é exclusivo do RH/admin — sem CTA para os demais
                if (!canRh) return null;
                const actualId = item.actual?.id || "";
                return (
                  <button
                    onClick={() => navigate(`/invoices?event=${item.event.id}&tab=aprovacao&filter=checkin-pendente&actual=${actualId}`)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-primary-foreground shadow-1 transition-colors bg-primary"
                  >
                    <CircleDot className="w-3 h-3" aria-hidden="true" />
                    Ir para Check-in
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                );
              }
              // nfStatus "aprovada" + check-in feito → ver nota fiscal (concluído)
              if (nfStatus === "aprovada" && hasCheckin) {
                return (
                  <button
                    onClick={() => navigate(`/invoices?event=${item.event.id}`)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold border border-success/25 text-success hover:bg-success-soft transition-colors"
                  >
                    <FileCheck className="w-3 h-3" aria-hidden="true" />
                    Ver nota fiscal
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                );
              }
              // nfStatus "pendente" — navTarget block renders "Ver detalhes"
              return null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
