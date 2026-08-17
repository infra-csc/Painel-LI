import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowRight, AlertCircle, CheckCheck, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { fixEncoding } from "@/lib/utils";
import type { Collaborator, TeamInclusion } from "@shared/schema";
import type { ApiError, NormalizedSwap } from "./types";
import { formatDateTime, toTitleCase } from "./utils";

export interface SwapReviewPanelProps {
  inclusion: TeamInclusion;
  swaps: NormalizedSwap[] | undefined;
  collaboratorById: Map<string, Collaborator>;
  /** Admin/Compras — os únicos que aprovam/rejeitam. */
  canReview: boolean;
}

/**
 * Card de troca de colaborador dentro do modal de hospedagem: mostra a
 * solicitação pendente (com aprovar/rejeitar para Compras) ou o resultado da
 * última análise. Só aparece quando a hospedagem está comprada sem passagem.
 */
export default function SwapReviewPanel({ inclusion, swaps, collaboratorById, canReview }: SwapReviewPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<null | "approve" | "reject">(null);
  const [rejectReason, setRejectReason] = useState("");

  const pendingSwap = swaps?.find((s) => s.status === "pendente");
  const latestSwap = swaps?.find((s) => ["aprovado", "rejeitado"].includes(s.status));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/swap-requests/inclusion", inclusion.id] });
    // A lista global alimenta o banner e o selo "Troca pendente" das linhas.
    queryClient.invalidateQueries({ queryKey: ["/api/swap-requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
  };

  const approveMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("PATCH", `/api/swap-requests/${id}/approve`, {})).json(),
    onSuccess: () => { toast({ title: "Troca aprovada", description: "O colaborador foi atualizado na escalação." }); invalidate(); },
    onError: (err: ApiError) => toast({ title: "Erro", description: err?.body?.message || "Erro ao aprovar troca", variant: "destructive" }),
  });
  const rejectMutation = useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment?: string }) =>
      (await apiRequest("PATCH", `/api/swap-requests/${id}/reject`, { reviewComment: comment || "" })).json(),
    onSuccess: () => { toast({ title: "Troca rejeitada" }); invalidate(); },
    onError: (err: ApiError) => toast({ title: "Erro", description: err?.body?.message || "Erro ao rejeitar troca", variant: "destructive" }),
  });

  if (inclusion.status !== "hospedagem_comprada") return null;
  const swap = pendingSwap || latestSwap;
  if (!swap) return null;

  const nameOf = (id: string | null | undefined, fallback?: string | null) =>
    toTitleCase(fixEncoding((id ? collaboratorById.get(id) : undefined)?.fullName) || fallback || "—");
  const currentName = nameOf(inclusion.collaboratorId, swap.currentCollaboratorName);
  const requestedName = nameOf(swap.newCollaboratorId, swap.newCollaboratorName);
  const busy = approveMutation.isPending || rejectMutation.isPending;

  if (swap.status === "aprovado") return (
    <div className="mt-2 border border-green-200 rounded-xl overflow-hidden" data-testid="swap-approved">
      <div className="flex items-center justify-between px-3 py-2 bg-green-50 border-b border-green-200">
        <div className="flex items-center gap-1.5">
          <CheckCheck className="w-3.5 h-3.5 text-green-600" />
          <span className="text-[11px] font-bold text-green-800">Troca aprovada</span>
        </div>
        <span className="text-[10px] font-semibold bg-green-200 text-green-800 px-2 py-0.5 rounded-full">Aprovada por Compras</span>
      </div>
      <div className="px-3 py-2 bg-green-50/30">
        <p className="text-[11px] text-green-700">A alteração do colaborador foi liberada para esta escala.</p>
      </div>
    </div>
  );

  if (swap.status === "rejeitado") return (
    <div className="mt-2 border border-red-200 rounded-xl overflow-hidden" data-testid="swap-rejected">
      <div className="flex items-center justify-between px-3 py-2 bg-red-50 border-b border-red-200">
        <div className="flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5 text-red-500" />
          <span className="text-[11px] font-bold text-red-800">Troca rejeitada</span>
        </div>
        <span className="text-[10px] font-semibold bg-red-200 text-red-800 px-2 py-0.5 rounded-full">Rejeitada por Compras</span>
      </div>
      <div className="px-3 py-2 space-y-1 bg-red-50/30">
        <p className="text-[11px] text-red-700">A escala permanece com o colaborador atual.</p>
        {swap.reviewComment && <p className="text-[11px] text-slate-500">Motivo: <span className="font-medium text-slate-600">{swap.reviewComment}</span></p>}
      </div>
    </div>
  );

  if (swap.status !== "pendente") return null;

  return (
    <>
      <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white" data-testid="swap-pending">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[12px] font-bold text-slate-700">Troca de colaborador solicitada</span>
            </div>
            <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 whitespace-nowrap">Aguardando análise</span>
          </div>
          <p className="text-[10px] text-slate-400 pl-[22px]">
            Solicitado por <span className="font-medium text-slate-500">{swap.requestedByName || "—"}</span> em {formatDateTime(swap.createdAt)}
          </p>
        </div>
        <div className="p-3 space-y-2">
          <div className="flex items-stretch gap-1.5">
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 min-w-0">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1">Colaborador atual</p>
              <p className="text-[12px] font-semibold text-slate-700 leading-snug break-words">{currentName}</p>
            </div>
            <div className="flex items-center justify-center shrink-0 w-6">
              <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
            </div>
            <div className="flex-1 bg-brand-soft border border-blue-100 rounded-lg px-2.5 py-2 min-w-0">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1">Colaborador solicitado</p>
              <p className="text-[12px] font-semibold text-primary leading-snug break-words">{requestedName}</p>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-0.5">Motivo da solicitação</p>
            <p className="text-[11px] text-slate-600 leading-snug">{swap.reason || "—"}</p>
          </div>
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <AlertCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-700 leading-snug">Esta escala possui hospedagem comprada. Revise os impactos antes de aprovar a troca.</p>
          </div>
          {canReview && (
            <div className="space-y-1.5 pt-0.5">
              <p className="text-[10px] text-slate-400 text-center">A aprovação libera a alteração do colaborador nesta escala.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmAction("approve")} disabled={busy} data-testid="button-approve-swap"
                  className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                  <CheckCheck className="w-3.5 h-3.5" />Aprovar troca
                </button>
                <button type="button" onClick={() => { setConfirmAction("reject"); setRejectReason(""); }} disabled={busy} data-testid="button-reject-swap"
                  className="flex-1 flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                  <XCircle className="w-3.5 h-3.5" />Rejeitar troca
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmação — Aprovar */}
      {confirmAction === "approve" && (
        <Dialog open onOpenChange={() => setConfirmAction(null)}>
          <DialogContent className="max-w-[400px] gap-4">
            <DialogHeader>
              <DialogTitle className="text-[16px] font-bold text-slate-800">Aprovar troca de colaborador?</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-slate-600">Ao confirmar, a alteração do colaborador será liberada para esta escala.</p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-[12px]">
              <div className="flex items-start gap-2">
                <span className="text-slate-400 font-medium shrink-0">Colaborador atual:</span>
                <span className="font-semibold text-slate-700">{currentName}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-slate-400 font-medium shrink-0">Colaborador solicitado:</span>
                <span className="font-semibold text-primary">{requestedName}</span>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setConfirmAction(null)} className="px-4 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
              <button type="button"
                onClick={() => { approveMutation.mutate(swap.id); setConfirmAction(null); }}
                disabled={approveMutation.isPending}
                className="px-4 py-2 text-[12px] font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >Confirmar aprovação</button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmação — Rejeitar */}
      {confirmAction === "reject" && (
        <Dialog open onOpenChange={() => { setConfirmAction(null); setRejectReason(""); }}>
          <DialogContent className="max-w-[400px] gap-4">
            <DialogHeader>
              <DialogTitle className="text-[16px] font-bold text-slate-800">Rejeitar troca de colaborador?</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-slate-600">A solicitação será recusada e a escala continuará com o colaborador atual.</p>
            <div>
              <label htmlFor="swap-reject-reason" className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Motivo da rejeição <span className="text-red-400">*</span></label>
              <textarea
                id="swap-reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="mt-1.5 w-full border border-slate-200 rounded-xl p-2.5 text-[13px] text-slate-700 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300"
                rows={3}
                placeholder="Descreva o motivo da rejeição..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setConfirmAction(null); setRejectReason(""); }} className="px-4 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
              <button type="button"
                onClick={() => {
                  if (!rejectReason.trim()) return;
                  rejectMutation.mutate({ id: swap.id, comment: rejectReason });
                  setConfirmAction(null);
                  setRejectReason("");
                }}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
                className="px-4 py-2 text-[12px] font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >Confirmar rejeição</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
