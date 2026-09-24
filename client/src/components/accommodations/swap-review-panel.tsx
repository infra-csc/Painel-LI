import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowRight, AlertCircle, CheckCheck, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { AVISO_LOGISTICA_PARA_REVISAR } from "@/hooks/use-vaga-acoes";
import { fixEncoding } from "@/lib/utils";
import type { Collaborator, TeamInclusion } from "@shared/schema";
import type { NormalizedSwap } from "./types";
import { formatDateTime, toTitleCase } from "./utils";
import { ExplicacaoDaTroca } from "@/components/scaling/swap-explicacao";
import { explicarTroca, type TrocaParaExplicar } from "@shared/swap-explicacao";


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
    mutationFn: async (id: string) =>
      (await apiRequest("PATCH", `/api/swap-requests/${id}/approve`, {})).json() as Promise<{ logisticaParaRevisar?: boolean }>,
    onSuccess: (resposta) => {
      toast({ variant: "success", title: "Troca aprovada", description: "O colaborador e a cidade de saída foram atualizados na escalação." });
      // Passagem/hospedagem já registradas para o colaborador antigo (24/09).
      if (resposta?.logisticaParaRevisar) toast({ title: "Compras precisa revisar", description: AVISO_LOGISTICA_PARA_REVISAR });
      invalidate();
    },
    // 409 = pedido já decidido; a mensagem do servidor explica.
    onError: (err: unknown) => toast({ title: "Não foi possível aprovar a troca", description: apiErrorMessage(err, "Tente de novo em instantes."), variant: "destructive" }),
  });
  const rejectMutation = useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment?: string }) =>
      (await apiRequest("PATCH", `/api/swap-requests/${id}/reject`, { reviewComment: comment || "" })).json(),
    onSuccess: () => { toast({ variant: "success", title: "Troca rejeitada", description: "O colaborador atual foi mantido na vaga." }); invalidate(); },
    onError: (err: unknown) => toast({ title: "Não foi possível rejeitar a troca", description: apiErrorMessage(err, "Tente de novo em instantes."), variant: "destructive" }),
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
    <div className="mt-2 border border-success/25 rounded-xl overflow-hidden" data-testid="swap-approved">
      <div className="flex items-center justify-between px-3 py-2 bg-success-soft border-b border-success/25">
        <div className="flex items-center gap-1.5">
          <CheckCheck className="w-3.5 h-3.5 text-success" />
          <span className="text-2xs font-bold text-success">Troca aprovada</span>
        </div>
        <span className="text-2xs font-semibold bg-success/20 text-success px-2 py-0.5 rounded-full">Aprovada por Compras</span>
      </div>
      <div className="px-3 py-2 bg-success-soft/30">
        <p className="text-2xs text-success">A alteração do colaborador foi liberada para esta escala.</p>
      </div>
    </div>
  );

  if (swap.status === "rejeitado") return (
    <div className="mt-2 border border-danger/25 rounded-xl overflow-hidden" data-testid="swap-rejected">
      <div className="flex items-center justify-between px-3 py-2 bg-danger-soft border-b border-danger/25">
        <div className="flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5 text-danger-strong" />
          <span className="text-2xs font-bold text-danger">Troca rejeitada</span>
        </div>
        <span className="text-2xs font-semibold bg-danger/20 text-danger px-2 py-0.5 rounded-full">Rejeitada por Compras</span>
      </div>
      <div className="px-3 py-2 space-y-1 bg-danger-soft/30">
        <p className="text-2xs text-danger">A escala permanece com o colaborador atual.</p>
        {swap.reviewComment && <p className="text-2xs text-muted-foreground">Motivo: <span className="font-medium text-slate-600">{swap.reviewComment}</span></p>}
      </div>
    </div>
  );

  if (swap.status !== "pendente") return null;
  /** O "Sai de" que a aprovação vai gravar — o do pedido, ou o do cadastro em pedido antigo. */
  const saiDeDoPedido = swap.newCity
    || (swap.newCollaboratorId ? collaboratorById.get(swap.newCollaboratorId)?.city : null)
    || null;
  /** O que muda ao aprovar (16/09) — o mesmo texto da Escalação. */
  const trocaExplicada: TrocaParaExplicar = {
    ...swap,
    currentCollaboratorName: swap.swapKind === "transferencia" ? null : currentName,
    newCollaboratorName: requestedName,
    newCity: saiDeDoPedido,
  };

  return (
    <>
      <div className="mt-2 rounded-xl overflow-hidden border border-border shadow-1 bg-card" data-testid="swap-pending">
        <div className="px-4 py-2.5 bg-surface-muted border-b border-border">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-bold text-slate-700">Troca de colaborador solicitada</span>
            </div>
            <span className="text-2xs font-semibold bg-warning-soft text-warning px-2 py-0.5 rounded-full border border-warning/25 whitespace-nowrap">Aguardando análise</span>
          </div>
          <p className="text-2xs text-muted-foreground pl-[22px]">
            Solicitado por <span className="font-medium text-muted-foreground">{swap.requestedByName || "—"}</span> em {formatDateTime(swap.createdAt)}
          </p>
        </div>
        <div className="p-3 space-y-2">
          <div className="flex items-stretch gap-1.5">
            <div className="flex-1 bg-surface-muted border border-border rounded-lg px-2.5 py-2 min-w-0">
              <p className="text-2xs font-bold text-muted-foreground uppercase tracking-[0.08em] mb-1">Colaborador atual</p>
              <p className="text-xs font-semibold text-slate-700 leading-snug break-words">{currentName}</p>
            </div>
            <div className="flex items-center justify-center shrink-0 w-6">
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 bg-brand-soft border border-primary/25 rounded-lg px-2.5 py-2 min-w-0">
              <p className="text-2xs font-bold text-muted-foreground uppercase tracking-[0.08em] mb-1">Colaborador solicitado</p>
              <p className="text-xs font-semibold text-primary leading-snug break-words">{requestedName}</p>
            </div>
          </div>
          <div className="bg-surface-muted border border-border rounded-lg px-2.5 py-2">
            <p className="text-2xs font-bold text-muted-foreground uppercase tracking-[0.08em] mb-0.5">Novo colaborador sai de</p>
            <p className="text-2xs font-semibold text-slate-700">{saiDeDoPedido || "Não informado"}{!swap.newCity && saiDeDoPedido ? " (cadastro do colaborador)" : ""}</p>
          </div>
          <ExplicacaoDaTroca troca={trocaExplicada} titulo="Se for aprovada" />
          <div className="bg-surface-muted border border-border rounded-lg px-2.5 py-2">
            <p className="text-2xs font-bold text-muted-foreground uppercase tracking-[0.08em] mb-0.5">Motivo da solicitação</p>
            <p className="text-2xs text-slate-600 leading-snug">{swap.reason || "—"}</p>
          </div>
          <div className="flex items-start gap-2 bg-warning-soft border border-warning/25 rounded-lg px-2.5 py-1.5">
            <AlertCircle className="w-3 h-3 text-warning-strong shrink-0 mt-0.5" />
            <p className="text-2xs text-warning leading-snug">Esta escala possui hospedagem comprada. Revise os impactos antes de aprovar a troca.</p>
          </div>
          {canReview && (
            <div className="space-y-1.5 pt-0.5">
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmAction("approve")} disabled={busy} data-testid="button-approve-swap"
                  className="flex-1 flex items-center justify-center gap-1.5 bg-success hover:bg-success/90 text-white text-2xs font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                  <CheckCheck className="w-3.5 h-3.5" />Aprovar troca
                </button>
                <button type="button" onClick={() => { setConfirmAction("reject"); setRejectReason(""); }} disabled={busy} data-testid="button-reject-swap"
                  className="flex-1 flex items-center justify-center gap-1.5 bg-danger hover:bg-danger/90 text-white text-2xs font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50">
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
          <DialogContent className="max-w-[520px] gap-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground">Aprovar troca de colaborador?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">Confira abaixo exatamente o que muda. Ao confirmar, a mudança é aplicada na hora.</p>
            <ExplicacaoDaTroca troca={trocaExplicada} />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setConfirmAction(null)} className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-muted rounded-lg transition-colors">Cancelar</button>
              <button type="button"
                onClick={() => { approveMutation.mutate(swap.id); setConfirmAction(null); }}
                disabled={approveMutation.isPending}
                className="px-4 py-2 text-xs font-semibold bg-success hover:bg-success/90 text-white rounded-lg transition-colors disabled:opacity-50"
              >Confirmar aprovação</button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmação — Rejeitar */}
      {confirmAction === "reject" && (
        <Dialog open onOpenChange={() => { setConfirmAction(null); setRejectReason(""); }}>
          <DialogContent className="max-w-[520px] gap-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground">Rejeitar troca de colaborador?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">{explicarTroca(trocaExplicada).recusa}</p>
            <div>
              <label htmlFor="swap-reject-reason" className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Motivo da rejeição <span className="text-danger-strong">*</span></label>
              <textarea
                id="swap-reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="mt-1.5 w-full border border-border rounded-xl p-2.5 text-sm text-slate-700 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300"
                rows={3}
                placeholder="Descreva o motivo da rejeição..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setConfirmAction(null); setRejectReason(""); }} className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-muted rounded-lg transition-colors">Cancelar</button>
              <button type="button"
                onClick={() => {
                  if (!rejectReason.trim()) return;
                  rejectMutation.mutate({ id: swap.id, comment: rejectReason });
                  setConfirmAction(null);
                  setRejectReason("");
                }}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
                className="px-4 py-2 text-xs font-semibold bg-danger hover:bg-danger/90 text-white rounded-lg transition-colors disabled:opacity-50"
              >Confirmar rejeição</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
