// Painel de análise da troca de colaborador (Resumo do modal) + diálogos de
// confirmação de aprovar/rejeitar.
import { useState } from "react";
import { ArrowLeftRight, ArrowRight, AlertCircle, CheckCheck, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TeamInclusion } from "@shared/schema";
import type { SwapRequestRow } from "./use-tickets-data";

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

  return (
    <>
      <div className="mt-5 rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden" data-testid="swap-review-panel">
        <div className="flex items-start justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <ArrowLeftRight className="w-4 h-4 text-slate-400" />
              <span className="text-[13px] font-bold text-slate-700">Solicitação de troca de colaborador</span>
            </div>
            <p className="text-[11px] text-slate-400 pl-6">
              Solicitado por <span className="font-medium text-slate-500">{requestedByName}</span> em {formatSwapDT(swapCreatedAt)}
            </p>
          </div>
          <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200 whitespace-nowrap shrink-0 mt-0.5">Aguardando análise</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-stretch gap-3">
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1.5">Colaborador atual</p>
              <p className="text-[14px] font-semibold text-slate-700 leading-snug">{currentCollabName}</p>
            </div>
            <div className="flex items-center justify-center shrink-0 px-1"><ArrowRight className="w-5 h-5 text-slate-300" /></div>
            <div className="flex-1 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 min-w-0">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.08em] mb-1.5">Colaborador solicitado</p>
              <p className="text-[14px] font-semibold text-blue-700 leading-snug">{requestedCollabName}</p>
            </div>
            <div className="w-px bg-slate-200 shrink-0" />
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1.5">Motivo da solicitação</p>
              <p className="text-[13px] text-slate-600 leading-snug">{swap.reason || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {hasTicketPurchased && (
              <div className="flex items-center gap-2 flex-1 min-w-0 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <p className="text-[11px] text-amber-700 leading-snug">Esta escala possui passagem comprada. Revise os impactos antes de aprovar a troca.</p>
              </div>
            )}
            {isPurchasingRole && (
              <div className="flex flex-col items-start gap-1.5 shrink-0">
                <p className="text-[10px] text-slate-400">A aprovação libera a alteração do colaborador nesta escala.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmAction("approve")}
                    disabled={isPending}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />Aprovar troca
                  </button>
                  <button
                    onClick={() => { setConfirmAction("reject"); setRejectReason(""); }}
                    disabled={isPending}
                    className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <XCircle className="w-3.5 h-3.5" />Rejeitar troca
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
          <DialogContent className="max-w-[400px] gap-4">
            <DialogHeader>
              <DialogTitle className="text-[16px] font-bold text-slate-800">Aprovar troca de colaborador?</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-slate-600">Ao confirmar, a alteração do colaborador será liberada para esta escala.</p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-[12px]">
              <div className="flex items-start gap-2">
                <span className="text-slate-400 font-medium shrink-0">Colaborador atual:</span>
                <span className="font-semibold text-slate-700">{currentCollabName}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-slate-400 font-medium shrink-0">Colaborador solicitado:</span>
                <span className="font-semibold text-blue-700">{requestedCollabName}</span>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={closeConfirm} className="px-4 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
              <button
                onClick={() => { onApprove(swap.id); closeConfirm(); }}
                disabled={isPending}
                className="px-4 py-2 text-[12px] font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >Confirmar aprovação</button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmação — Rejeitar */}
      {confirmAction === "reject" && (
        <Dialog open onOpenChange={closeConfirm}>
          <DialogContent className="max-w-[400px] gap-4">
            <DialogHeader>
              <DialogTitle className="text-[16px] font-bold text-slate-800">Rejeitar troca de colaborador?</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-slate-600">A solicitação será recusada e a escala continuará com o colaborador atual.</p>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Motivo da rejeição <span className="text-red-400">*</span></label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className="mt-1.5 w-full border border-slate-200 rounded-xl p-2.5 text-[13px] text-slate-700 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300"
                rows={3}
                placeholder="Descreva o motivo da rejeição..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={closeConfirm} className="px-4 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
              <button
                onClick={() => {
                  if (!rejectReason.trim()) return;
                  onReject(swap.id, rejectReason);
                  closeConfirm();
                }}
                disabled={isPending || !rejectReason.trim()}
                className="px-4 py-2 text-[12px] font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >Confirmar rejeição</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
