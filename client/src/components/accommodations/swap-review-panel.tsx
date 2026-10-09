// Painel de análise da troca de colaborador (Resumo do modal de Hospedagem) +
// diálogos de confirmação de aprovar/rejeitar.
//
// 07/10 (redesenho): o MESMO desenho do painel de Passagens — largura toda
// embaixo do Resumo (era um cartão espremido na coluna do colaborador), quem
// sai → quem entra → motivo lado a lado (empilham no celular), "sai de" e o
// que muda ao aprovar, e os botões com a forma do resto do modal: a ação
// destrutiva (rejeitar) antes e em contorno, a principal (aprovar) por último e
// cheia. Aprovada/rejeitada viram uma linha de situação, não um cartão.
// Mesmas mutações, mesmas invalidações, mesmos data-testid.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowRight, AlertCircle, CheckCheck, XCircle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { avisoDepoisDaTroca } from "@/hooks/use-vaga-acoes";
import { fixEncoding } from "@/lib/utils";
import type { Collaborator, TeamInclusion } from "@shared/schema";
import type { NormalizedSwap } from "./types";
import { formatDateTime, toTitleCase } from "./utils";
import { AvisoTrocaDesatualizada, ExplicacaoDaTroca, comOcupantesFormatados, motivoDaTrocaPendente } from "@/components/scaling/swap-explicacao";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { explicarTroca, type TrocaParaExplicar } from "@shared/swap-explicacao";
import { RequiredMark } from "@/components/forms/required-mark";


export interface SwapReviewPanelProps {
  inclusion: TeamInclusion;
  swaps: NormalizedSwap[] | undefined;
  collaboratorById: Map<string, Collaborator>;
  /** Admin/Compras — os únicos que aprovam/rejeitam. */
  canReview: boolean;
}

/** Botões do painel e das confirmações (os mesmos de Passagens). */
const BOTAO = "inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

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
      (await apiRequest("PATCH", `/api/swap-requests/${id}/approve`, {})).json() as Promise<{ logisticaParaRevisar?: boolean; passagensParaHistorico?: number }>,
    onSuccess: (resposta) => {
      toast({ variant: "success", title: "Troca aprovada", description: "O colaborador e a cidade de saída foram atualizados na escalação." });
      // Passagem/hospedagem já registradas para o colaborador antigo (24/09).
      { const aviso = avisoDepoisDaTroca(resposta); if (aviso) toast({ title: "Compras precisa revisar", description: aviso }); }
      // A passagem de quem saiu virou histórico: a lista de passagens muda.
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
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
  const closeConfirm = () => { setConfirmAction(null); setRejectReason(""); };

  if (swap.status === "aprovado") return (
    <p className="pas-entra m-0 mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-success-soft px-3.5 py-2.5 text-xs text-success" data-testid="swap-approved">
      <CheckCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="font-semibold">Troca aprovada por Compras</span>
      <span className="text-success/90">— a alteração do colaborador foi liberada para esta escala.</span>
    </p>
  );

  if (swap.status === "rejeitado") return (
    <div className="pas-entra mt-5 rounded-lg bg-danger-soft px-3.5 py-2.5 text-xs text-danger" data-testid="swap-rejected">
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <XCircle className="w-4 h-4 shrink-0 text-danger-strong" aria-hidden="true" />
        <span className="font-semibold">Troca rejeitada por Compras</span>
        <span>— a escala permanece com o colaborador atual.</span>
      </p>
      {swap.reviewComment && <p className="m-0 mt-1 pl-6 text-slate-600">Motivo: <span className="font-medium text-slate-700">{swap.reviewComment}</span></p>}
    </div>
  );

  if (swap.status !== "pendente") return null;
  /** O "Sai de" que a aprovação vai gravar — o do pedido, ou o do cadastro em pedido antigo. */
  const saiDeDoPedido = swap.newCity
    || (swap.newCollaboratorId ? collaboratorById.get(swap.newCollaboratorId)?.city : null)
    || null;
  /** O que muda ao aprovar (16/09) — o mesmo texto da Escalação. */
  const trocaExplicada: TrocaParaExplicar = comOcupantesFormatados({
    ...swap,
    // Transferência para vaga aberta não tem "quem sai"; para vaga com alguém (05/10), tem.
    // 09/10: é quem estava na vaga NO PEDIDO (o modal pode ser o da outra vaga,
    // ou a vaga pode ter mudado) — quem está hoje vem dos ocupantes atuais.
    currentCollaboratorName: swap.swapKind === "transferencia" && !swap.currentCollaboratorId ? null : nameOf(swap.currentCollaboratorId, swap.currentCollaboratorName),
    newCollaboratorName: requestedName,
    newCity: saiDeDoPedido,
  });
  /** As vagas mudaram desde o pedido (09/10): o servidor recusaria a aprovação. */
  const motivoMudou = motivoDaTrocaPendente(swap.status, trocaExplicada);

  return (
    <>
      <section className="pas-entra mt-5 rounded-xl border border-warning/30 bg-card overflow-hidden" data-testid="swap-pending" aria-label="Solicitação de troca de colaborador">
        <div className="flex flex-wrap items-start justify-between gap-2 px-4 sm:px-5 py-3 bg-warning-soft/40 border-b border-warning/25">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <ArrowLeftRight className="w-4 h-4 text-warning-strong" aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">Troca de colaborador solicitada</span>
            </div>
            <p className="m-0 text-xs text-muted-foreground pl-6">
              Solicitado por <span className="font-medium text-slate-700">{swap.requestedByName || "—"}</span> em {formatDateTime(swap.createdAt)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md bg-warning-soft text-warning text-2xs font-medium whitespace-nowrap shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-warning-strong" aria-hidden="true" />Aguardando análise
          </span>
        </div>
        <div className="p-4 sm:p-5 space-y-4">
          {motivoMudou && <AvisoTrocaDesatualizada motivo={motivoMudou} />}
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1.2fr)] items-stretch gap-3">
            <div className="rounded-xl border border-border bg-surface-muted px-4 py-3 min-w-0">
              <p className="m-0 text-2xs font-medium text-muted-foreground mb-1">Colaborador atual</p>
              <p className="m-0 text-sm font-semibold text-foreground leading-snug break-words">{currentName}</p>
            </div>
            <div className="hidden sm:flex items-center justify-center"><ArrowRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" /></div>
            <div className="rounded-xl border border-primary/25 bg-brand-soft px-4 py-3 min-w-0">
              <p className="m-0 text-2xs font-medium text-primary/80 mb-1">Colaborador solicitado</p>
              <p className="m-0 text-sm font-semibold text-primary leading-snug break-words">{requestedName}</p>
              <p className="m-0 mt-1 text-2xs text-slate-600">
                Sai de <span className="font-medium text-slate-700">{saiDeDoPedido || "Não informado"}</span>{!swap.newCity && saiDeDoPedido ? " (cadastro do colaborador)" : ""}
              </p>
            </div>
            <div className="rounded-xl border border-border px-4 py-3 min-w-0">
              <p className="m-0 text-2xs font-medium text-muted-foreground mb-1">Motivo da solicitação</p>
              <p className="m-0 text-sm text-slate-700 leading-snug">{swap.reason || "—"}</p>
            </div>
          </div>
          <ExplicacaoDaTroca troca={trocaExplicada} titulo="Se for aprovada" />
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[220px] bg-warning-soft rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 text-warning-strong shrink-0" aria-hidden="true" />
              <p className="m-0 text-xs text-warning leading-snug">Esta escala possui hospedagem comprada. Revise os impactos antes de aprovar a troca.</p>
            </div>
            {canReview && (
              <div className="flex gap-2 shrink-0 ml-auto">
                <button type="button" onClick={() => { setConfirmAction("reject"); setRejectReason(""); }} disabled={busy} data-testid="button-reject-swap"
                  className={`${BOTAO} border border-danger/30 bg-card text-danger hover:bg-danger-soft`}>
                  <XCircle className="w-3.5 h-3.5" aria-hidden="true" />Rejeitar troca
                </button>
                <MotivoDesabilitado motivo={motivoMudou} desabilitado={!!motivoMudou}>
                <button type="button" onClick={() => setConfirmAction("approve")} disabled={busy || !!motivoMudou} data-testid="button-approve-swap"
                  className={`${BOTAO} bg-success hover:bg-success/90 text-white`}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />}Aprovar troca
                </button>
                </MotivoDesabilitado>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Confirmação — Aprovar */}
      {confirmAction === "approve" && !motivoMudou && (
        <Dialog open onOpenChange={closeConfirm}>
          <DialogContent className="max-w-[520px] gap-4">
            <DialogHeader className="text-left">
              <DialogTitle className="text-base font-semibold text-foreground">Aprovar troca de colaborador?</DialogTitle>
              <DialogDescription className="text-sm text-slate-600">Confira abaixo exatamente o que muda. Ao confirmar, a mudança é aplicada na hora.</DialogDescription>
            </DialogHeader>
            <ExplicacaoDaTroca troca={trocaExplicada} />
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" onClick={closeConfirm} className={`${BOTAO} font-medium text-slate-600 hover:bg-muted`}>Cancelar</button>
              <button type="button"
                onClick={() => { approveMutation.mutate(swap.id); closeConfirm(); }}
                disabled={approveMutation.isPending}
                className={`${BOTAO} bg-success hover:bg-success/90 text-white`}
              ><CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />Confirmar aprovação</button>
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
              <label htmlFor="swap-reject-reason" className="text-xs font-medium text-slate-600">Motivo da rejeição<RequiredMark /></label>
              <textarea
                id="swap-reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-card p-2.5 text-sm text-foreground resize-none outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/12"
                rows={3}
                placeholder="Descreva o motivo da rejeição…"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" onClick={closeConfirm} className={`${BOTAO} font-medium text-slate-600 hover:bg-muted`}>Cancelar</button>
              <button type="button"
                onClick={() => {
                  if (!rejectReason.trim()) return;
                  rejectMutation.mutate({ id: swap.id, comment: rejectReason });
                  closeConfirm();
                }}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
                className={`${BOTAO} bg-danger hover:bg-danger/90 text-white`}
              ><XCircle className="w-3.5 h-3.5" aria-hidden="true" />Confirmar rejeição</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
