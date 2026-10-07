// Painel de análise da troca de colaborador (Resumo do modal) + diálogos de
// confirmação de aprovar/rejeitar.
//
// 07/10: quem sai → quem entra e o motivo empilham no celular (as três caixas
// lado a lado viravam colunas de 90px); botões e confirmações com a mesma
// forma do resto do modal. A ação destrutiva (rejeitar) fica antes e em
// contorno; a principal (aprovar) por último e cheia.
import { useState } from "react";
import { ArrowLeftRight, ArrowRight, AlertCircle, CheckCheck, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TeamInclusion } from "@shared/schema";
import type { SwapRequestRow } from "./use-tickets-data";
import { normalizeSwap } from "@/components/scaling/scaling-utils";
import { ExplicacaoDaTroca } from "@/components/scaling/swap-explicacao";
import { explicarTroca, type TrocaParaExplicar } from "@shared/swap-explicacao";
import { RequiredMark } from "@/components/forms/required-mark";

interface SwapReviewPanelProps {
  swap: SwapRequestRow;
  inclusion: TeamInclusion;
  currentCollabName: string;
  requestedCollabName: string;
  isPurchasingRole: boolean;
  isPending: boolean;
  onApprove: (swapId: string) => void;
  onReject: (swapId: string, comment: string) => void;
}

const formatSwapDT = (dt: string | Date | null | undefined) => {
  if (!dt) return "—";
  const d = new Date(dt);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const BOTAO = "inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

export default function SwapReviewPanel({
  swap, inclusion, currentCollabName, requestedCollabName, isPurchasingRole, isPending, onApprove, onReject,
}: SwapReviewPanelProps) {
  const [confirmAction, setConfirmAction] = useState<null | "approve" | "reject">(null);
  const [rejectReason, setRejectReason] = useState("");
  const swapCreatedAt = swap.created_at || swap.createdAt;
  const requestedByName = swap.requested_by_name || swap.requestedByName || "—";
  const hasTicketPurchased = ["passagem_comprada", "hospedagem_passagem_comprada"].includes(inclusion.status);
  const closeConfirm = () => { setConfirmAction(null); setRejectReason(""); };
  /** O que muda ao aprovar (16/09) — o mesmo texto da Escalação. */
  const trocaExplicada: TrocaParaExplicar = {
    ...normalizeSwap(swap as Record<string, unknown>),
    currentCollaboratorName: currentCollabName,
    newCollaboratorName: requestedCollabName,
  };

  return (
    <>
      <section className="pas-entra mt-5 rounded-xl border border-warning/30 bg-card overflow-hidden" data-testid="swap-review-panel" aria-label="Solicitação de troca de colaborador">
        <div className="flex flex-wrap items-start justify-between gap-2 px-4 sm:px-5 py-3 bg-warning-soft/40 border-b border-warning/25">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <ArrowLeftRight className="w-4 h-4 text-warning-strong" aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">Solicitação de troca de colaborador</span>
            </div>
            <p className="m-0 text-xs text-muted-foreground pl-6">
              Solicitado por <span className="font-medium text-slate-700">{requestedByName}</span> em {formatSwapDT(swapCreatedAt)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md bg-warning-soft text-warning text-2xs font-medium whitespace-nowrap shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-warning-strong" aria-hidden="true" />Aguardando análise
          </span>
        </div>
        <div className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1.2fr)] items-stretch gap-3">
            <div className="rounded-xl border border-border bg-surface-muted px-4 py-3 min-w-0">
              <p className="m-0 text-2xs font-medium text-muted-foreground mb-1">Colaborador atual</p>
              <p className="m-0 text-sm font-semibold text-foreground leading-snug">{currentCollabName}</p>
            </div>
            <div className="hidden sm:flex items-center justify-center"><ArrowRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" /></div>
            <div className="rounded-xl border border-primary/25 bg-brand-soft px-4 py-3 min-w-0">
              <p className="m-0 text-2xs font-medium text-primary/80 mb-1">Colaborador solicitado</p>
              <p className="m-0 text-sm font-semibold text-primary leading-snug">{requestedCollabName}</p>
            </div>
            <div className="rounded-xl border border-border px-4 py-3 min-w-0">
              <p className="m-0 text-2xs font-medium text-muted-foreground mb-1">Motivo da solicitação</p>
              <p className="m-0 text-sm text-slate-700 leading-snug">{swap.reason || "—"}</p>
            </div>
          </div>
          <ExplicacaoDaTroca troca={trocaExplicada} titulo="Se for aprovada" />
          <div className="flex items-center gap-3 flex-wrap">
            {hasTicketPurchased && (
              <div className="flex items-center gap-2 flex-1 min-w-[220px] bg-warning-soft rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 text-warning-strong shrink-0" aria-hidden="true" />
                <p className="m-0 text-xs text-warning leading-snug">Esta escala possui passagem comprada. Revise os impactos antes de aprovar a troca.</p>
              </div>
            )}
            {isPurchasingRole && (
              <div className="flex gap-2 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => { setConfirmAction("reject"); setRejectReason(""); }}
                  disabled={isPending}
                  className={`${BOTAO} border border-danger/30 bg-card text-danger hover:bg-danger-soft`}
                >
                  <XCircle className="w-3.5 h-3.5" aria-hidden="true" />Rejeitar troca
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction("approve")}
                  disabled={isPending}
                  className={`${BOTAO} bg-success hover:bg-success/90 text-white`}
                >
                  <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />Aprovar troca
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Confirmação — Aprovar */}
      {confirmAction === "approve" && (
        <Dialog open onOpenChange={closeConfirm}>
          <DialogContent className="max-w-[520px] gap-4">
            <DialogHeader className="text-left">
              <DialogTitle className="text-base font-semibold text-foreground">Aprovar troca de colaborador?</DialogTitle>
              <DialogDescription className="text-sm text-slate-600">Confira abaixo exatamente o que muda. Ao confirmar, a mudança é aplicada na hora.</DialogDescription>
            </DialogHeader>
            <ExplicacaoDaTroca troca={trocaExplicada} />
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" onClick={closeConfirm} className={`${BOTAO} font-medium text-slate-600 hover:bg-muted`}>Cancelar</button>
              <button
                type="button"
                onClick={() => { onApprove(swap.id); closeConfirm(); }}
                disabled={isPending}
                className={`${BOTAO} bg-success hover:bg-success/90 text-white`}
              >
                <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />Confirmar aprovação
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmação — Rejeitar */}
      {confirmAction === "reject" && (
        <Dialog open onOpenChange={closeConfirm}>
          <DialogContent className="max-w-[520px] gap-4">
            <DialogHeader className="text-left">
              <DialogTitle className="text-base font-semibold text-foreground">Rejeitar troca de colaborador?</DialogTitle>
              <DialogDescription className="text-sm text-slate-600">{explicarTroca(trocaExplicada).recusa}</DialogDescription>
            </DialogHeader>
            <div>
              <label htmlFor={`motivo-rejeicao-${swap.id}`} className="text-xs font-medium text-slate-600">Motivo da rejeição<RequiredMark /></label>
              <textarea
                id={`motivo-rejeicao-${swap.id}`}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-card p-2.5 text-sm text-foreground resize-none outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/12"
                rows={3}
                placeholder="Descreva o motivo da rejeição…"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" onClick={closeConfirm} className={`${BOTAO} font-medium text-slate-600 hover:bg-muted`}>Cancelar</button>
              <button
                type="button"
                onClick={() => {
                  if (!rejectReason.trim()) return;
                  onReject(swap.id, rejectReason);
                  closeConfirm();
                }}
                disabled={isPending || !rejectReason.trim()}
                className={`${BOTAO} bg-danger hover:bg-danger/90 text-white`}
              >
                <XCircle className="w-3.5 h-3.5" aria-hidden="true" />Confirmar rejeição
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
