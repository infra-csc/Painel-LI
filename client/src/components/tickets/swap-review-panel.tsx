// Painel de análise da troca de colaborador (Resumo do modal) + diálogos de
// confirmação de aprovar/rejeitar.
import { useState } from "react";
import { ArrowLeftRight, ArrowRight, AlertCircle, CheckCheck, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
      <div className="mt-5 rounded-xl border border-border shadow-1 bg-card overflow-hidden" data-testid="swap-review-panel">
        <div className="flex items-start justify-between px-5 py-3 bg-surface-muted border-b border-border">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <ArrowLeftRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-bold text-slate-700">Solicitação de troca de colaborador</span>
            </div>
            <p className="text-2xs text-muted-foreground pl-6">
              Solicitado por <span className="font-medium text-muted-foreground">{requestedByName}</span> em {formatSwapDT(swapCreatedAt)}
            </p>
          </div>
          <span className="text-2xs font-semibold bg-warning-soft text-warning px-2.5 py-1 rounded-full border border-warning/25 whitespace-nowrap shrink-0 mt-0.5">Aguardando análise</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-stretch gap-3">
            <div className="flex-1 bg-surface-muted border border-border rounded-xl px-4 py-3 min-w-0">
              <p className="text-2xs font-bold text-muted-foreground uppercase tracking-[0.08em] mb-1.5">Colaborador atual</p>
              <p className="text-sm font-semibold text-slate-700 leading-snug">{currentCollabName}</p>
            </div>
            <div className="flex items-center justify-center shrink-0 px-1"><ArrowRight className="w-5 h-5 text-muted-foreground" aria-hidden="true" /></div>
            <div className="flex-1 bg-brand-soft border border-primary/25 rounded-xl px-4 py-3 min-w-0">
              <p className="text-2xs font-bold text-primary/70 uppercase tracking-[0.08em] mb-1.5">Colaborador solicitado</p>
              <p className="text-sm font-semibold text-primary leading-snug">{requestedCollabName}</p>
            </div>
            <div className="w-px bg-border shrink-0" />
            <div className="flex-1 bg-surface-muted border border-border rounded-xl px-4 py-3 min-w-0">
              <p className="text-2xs font-bold text-muted-foreground uppercase tracking-[0.08em] mb-1.5">Motivo da solicitação</p>
              <p className="text-sm text-slate-600 leading-snug">{swap.reason || "—"}</p>
            </div>
          </div>
          <ExplicacaoDaTroca troca={trocaExplicada} titulo="Se for aprovada" />
          <div className="flex items-center gap-4 flex-wrap">
            {hasTicketPurchased && (
              <div className="flex items-center gap-2 flex-1 min-w-0 bg-warning-soft border border-warning/25 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 text-warning-strong shrink-0" aria-hidden="true" />
                <p className="text-2xs text-warning leading-snug">Esta escala possui passagem comprada. Revise os impactos antes de aprovar a troca.</p>
              </div>
            )}
            {isPurchasingRole && (
              <div className="flex flex-col items-start gap-1.5 shrink-0">
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmAction("approve")}
                    disabled={isPending}
                    className="flex items-center gap-1.5 bg-success hover:bg-success/90 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />Aprovar troca
                  </button>
                  <button
                    onClick={() => { setConfirmAction("reject"); setRejectReason(""); }}
                    disabled={isPending}
                    className="flex items-center gap-1.5 bg-danger hover:bg-danger/90 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <XCircle className="w-3.5 h-3.5" aria-hidden="true" />Rejeitar troca
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmação — Aprovar */}
      {confirmAction === "approve" && (
        <Dialog open onOpenChange={closeConfirm}>
          <DialogContent className="max-w-[520px] gap-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground">Aprovar troca de colaborador?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">Confira abaixo exatamente o que muda. Ao confirmar, a mudança é aplicada na hora.</p>
            <ExplicacaoDaTroca troca={trocaExplicada} />
            <div className="flex gap-2 justify-end">
              <button onClick={closeConfirm} className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-muted rounded-lg transition-colors">Cancelar</button>
              <button
                onClick={() => { onApprove(swap.id); closeConfirm(); }}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold bg-success hover:bg-success/90 text-white rounded-lg transition-colors disabled:opacity-50"
              >Confirmar aprovação</button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmação — Rejeitar */}
      {confirmAction === "reject" && (
        <Dialog open onOpenChange={closeConfirm}>
          <DialogContent className="max-w-[520px] gap-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground">Rejeitar troca de colaborador?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">{explicarTroca(trocaExplicada).recusa}</p>
            <div>
              <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Motivo da rejeição<RequiredMark /></label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className="mt-1.5 w-full border border-border rounded-xl p-2.5 text-sm text-slate-700 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300"
                rows={3}
                placeholder="Descreva o motivo da rejeição…"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={closeConfirm} className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-muted rounded-lg transition-colors">Cancelar</button>
              <button
                onClick={() => {
                  if (!rejectReason.trim()) return;
                  onReject(swap.id, rejectReason);
                  closeConfirm();
                }}
                disabled={isPending || !rejectReason.trim()}
                className="px-4 py-2 text-xs font-semibold bg-danger hover:bg-danger/90 text-white rounded-lg transition-colors disabled:opacity-50"
              >Confirmar rejeição</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
