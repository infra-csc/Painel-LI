/**
 * Troca de colaborador dentro do modal de detalhes:
 * - SwapStatusCard: card de status (pendente/aprovada/recusada) com as ações
 *   aprovar/recusar (Compras/admin) e cancelar (solicitante) + seus confirms;
 * - RequestSwapButton: botão "Solicitar troca".
 * Extraído de pages/scaling.tsx — comportamento preservado.
 *
 * Desde 25/09 o formulário mora em `swap-request-dialog.tsx` e o campo "Sai de"
 * em `campo-sai-de.tsx`; os dois continuam exportados daqui (tinha 771 linhas).
 */
import { useState, type ReactNode } from "react";
import { Clock, Check, X, ArrowRight, ArrowLeftRight, CheckCheck, XCircle, MapPin } from "lucide-react";
import { AvisoTrocaDesatualizada, ExplicacaoDaTroca, comOcupantesFormatados, motivoDaTrocaPendente } from "./swap-explicacao";
import { explicarTroca, type TrocaParaExplicar } from "@shared/swap-explicacao";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { formatShortDateTime, type NormalizedSwap } from "./scaling-utils";
import { LinhasDaPermuta, LinhasDaTransferencia } from "./swap-permuta";
import type { ScalingMutations } from "./use-scaling-mutations";
import { RequiredMark } from "@/components/forms/required-mark";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";

export { saiDeInicial, CampoSaiDe } from "./campo-sai-de";
export { SwapRequestDialog, type SwapRequestDialogProps } from "./swap-request-dialog";

// ── Card de status da troca ─────────────────────────────────────────────────

const VARIANTS: Record<string, { bg: string; border: string; icon: ReactNode; title: string; badge: string; badgeClass: string; msg: string }> = {
  pendente: {
    bg: "bg-warning-soft/70", border: "border-warning/35",
    icon: <Clock className="w-3.5 h-3.5 text-warning-strong shrink-0" aria-hidden="true" />,
    title: "Troca solicitada", badge: "Aguardando aprovação",
    badgeClass: "bg-warning-soft text-warning border-warning/25",
    msg: "O colaborador atual será mantido até a aprovação.",
  },
  aprovado: {
    bg: "bg-success-soft/70", border: "border-success/30",
    icon: <Check className="w-3.5 h-3.5 text-success shrink-0" aria-hidden="true" />,
    title: "Troca aprovada", badge: "Aprovada por Compras",
    badgeClass: "bg-success-soft text-success border-success/25",
    msg: "A alteração do colaborador foi liberada.",
  },
  rejeitado: {
    bg: "bg-danger-soft/70", border: "border-danger/30",
    icon: <X className="w-3.5 h-3.5 text-danger-strong shrink-0" aria-hidden="true" />,
    title: "Troca recusada", badge: "Reprovada por Compras",
    badgeClass: "bg-danger-soft text-danger border-danger/25",
    msg: "A escala permanece com o colaborador atual.",
  },
};

export interface SwapStatusCardProps {
  pendingSwap: NormalizedSwap | undefined;
  latestSwap: NormalizedSwap | undefined;
  currentUserId: string | undefined;
  isAdminOrPurchasing: boolean;
  getCollaboratorName: (id?: string | null) => string;
  mutations: Pick<ScalingMutations, "approveSwap" | "rejectSwap" | "cancelSwap">;
  /** Evento encerrado: motivo do bloqueio (esconde aprovar/recusar/cancelar). */
  blockReason?: string | null;
}

export function SwapStatusCard({ pendingSwap, latestSwap, currentUserId, isAdminOrPurchasing, getCollaboratorName, mutations, blockReason }: SwapStatusCardProps) {
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const swap = pendingSwap || (latestSwap && ["rejeitado", "aprovado"].includes(latestSwap.status) ? latestSwap : null);
  if (!swap) return null;

  const { approveSwap, rejectSwap, cancelSwap } = mutations;
  const blocked = !!blockReason;
  const canCancel = swap.status === "pendente" && !blocked && !!currentUserId && swap.requestedBy === currentUserId;
  const v = VARIANTS[swap.status] || VARIANTS.pendente;
  const currentCollabName = getCollaboratorName(swap.currentCollaboratorId);
  const newCollabName = getCollaboratorName(swap.newCollaboratorId);
  const isResolved = swap.status === "aprovado" || swap.status === "rejeitado";
  const busy = approveSwap.isPending || rejectSwap.isPending;
  /** Permuta (14/09): dois escalados trocam de vaga — o cartão diz quem vai para onde. */
  const permuta = swap.swapKind === "permuta";
  /** Transferência (14/09): alguém de outra vaga entra nesta, que estava aberta. */
  const transferencia = swap.swapKind === "transferencia";
  /** O que muda ao aprovar (16/09) — mesmo texto no cartão e nas confirmações. */
  const trocaExplicada: TrocaParaExplicar = comOcupantesFormatados({
    ...swap,
    currentCollaboratorName: swap.currentCollaboratorId ? currentCollabName : null,
    newCollaboratorName: newCollabName || swap.newCollaboratorName,
  });
  /** As vagas mudaram desde o pedido (09/10): o servidor recusaria a aprovação. */
  const motivoMudou = motivoDaTrocaPendente(swap.status, trocaExplicada);

  return (
    <>
      {/* 07/10: cartão branco com o cabeçalho tingido pela situação — antes o
          bloco inteiro era âmbar, com um cartão branco dentro e um cinza dentro
          dele (três molduras para uma informação). */}
      <div className={`rounded-lg border ${v.border} bg-card overflow-hidden`} data-testid={`swap-status-${swap.status}`}>
        <div className={`flex flex-wrap items-center justify-between gap-2 border-b ${v.border} ${v.bg} px-3 py-2`}>
          <div className="flex items-center gap-1.5">
            {v.icon}
            <span className="text-xs font-semibold text-foreground">{permuta ? v.title.replace("Troca", "Troca entre vagas") : transferencia ? v.title.replace("Troca", "Transferência") : v.title}</span>
          </div>
          <span className={`text-2xs font-semibold border rounded-full px-2 py-px leading-tight bg-card ${v.badgeClass}`}>{v.badge}</span>
        </div>
        <div className="px-3 py-2.5 space-y-2">

        {isResolved ? (
          <div className="space-y-1.5">
            {permuta ? <LinhasDaPermuta swap={swap} getCollaboratorName={getCollaboratorName} /> : transferencia ? <LinhasDaTransferencia swap={swap} getCollaboratorName={getCollaboratorName} /> : (<>
            <div className="flex items-center gap-1.5 text-2xs">
              <span className="text-muted-foreground line-through">{currentCollabName || "—"}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className={`font-semibold ${swap.status === "aprovado" ? "text-success" : "text-muted-foreground"}`}>{newCollabName || "—"}</span>
            </div>
            {swap.newCity && (
              <div className="flex items-center gap-1 text-2xs text-muted-foreground" data-testid="swap-sai-de-resolvido">
                <MapPin className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                <span>Sai de <span className="font-semibold text-slate-700">{swap.newCity}</span></span>
              </div>
            )}
            </>)}
            {swap.requestedByName && (
              <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                <ArrowLeftRight className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                <span>Solicitado por <span className="font-medium text-slate-600">{swap.requestedByName}</span>{swap.createdAt && <> · {formatShortDateTime(swap.createdAt)}</>}</span>
              </div>
            )}
            {swap.reviewedByName && (
              <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                <Check className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                <span>{swap.status === "aprovado" ? "Aprovada" : "Rejeitada"} por <span className="font-medium text-slate-600">{swap.reviewedByName}</span>{swap.reviewedAt && <> · {formatShortDateTime(swap.reviewedAt)}</>}</span>
              </div>
            )}
            <div className="flex items-start gap-1 text-xs text-muted-foreground">
              <span className="shrink-0">Motivo:</span>
              <span className="text-slate-700 leading-snug">{swap.reason}</span>
            </div>
            {swap.reviewComment && (
              <div className="flex items-start gap-1 text-2xs text-muted-foreground">
                <span className="shrink-0">Obs.:</span>
                <span className="text-muted-foreground leading-snug italic">{swap.reviewComment}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {motivoMudou && <AvisoTrocaDesatualizada motivo={motivoMudou} />}
            <p className="text-xs text-muted-foreground leading-snug">Aguardando análise do time de Compras.</p>
            {swap.requestedByName && (
              <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                <ArrowLeftRight className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                <span>Solicitado por <span className="font-medium text-slate-600">{swap.requestedByName}</span>{swap.createdAt && <> · {formatShortDateTime(swap.createdAt)}</>}</span>
              </div>
            )}
            <ExplicacaoDaTroca troca={trocaExplicada} titulo="Se for aprovada" />
            <div className="flex items-start gap-1.5 text-xs">
              <span className="text-muted-foreground shrink-0">Motivo:</span>
              <span className="text-slate-700 leading-snug">{swap.reason}</span>
            </div>
            {isAdminOrPurchasing && blocked && (
              <p className="pt-1.5 text-2xs text-warning bg-warning-soft border border-warning/25 rounded-lg px-2 py-1.5 leading-snug" role="status" data-testid="text-swap-block-reason">
                {blockReason}
              </p>
            )}
            {isAdminOrPurchasing && !blocked && (
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setConfirmAction("reject"); setRejectReason(""); }}
                  disabled={busy}
                  className="esc-alvo flex-1 flex items-center justify-center gap-1.5 border border-danger/30 bg-card text-danger hover:bg-danger-soft text-xs font-semibold px-3 h-8 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:opacity-50"
                  data-testid="button-reject-swap"
                >
                  <XCircle className="w-3.5 h-3.5" aria-hidden="true" />Recusar troca
                </button>
                <MotivoDesabilitado motivo={motivoMudou} desabilitado={!!motivoMudou} className="flex flex-1">
                <button
                  type="button"
                  onClick={() => setConfirmAction("approve")}
                  disabled={busy || !!motivoMudou}
                  className="esc-alvo flex-1 flex items-center justify-center gap-1.5 bg-success hover:bg-success/90 text-white text-xs font-semibold px-3 h-8 rounded-lg shadow-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success-strong focus-visible:ring-offset-1 disabled:opacity-50"
                  data-testid="button-approve-swap"
                >
                  <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />Aprovar troca
                </button>
                </MotivoDesabilitado>
              </div>
            )}
          </div>
        )}

        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-muted px-3 py-1.5">
          <p className="text-2xs text-muted-foreground leading-tight">{v.msg}</p>
          {canCancel && (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="esc-alvo text-2xs font-medium text-muted-foreground hover:text-danger transition-colors underline underline-offset-2 shrink-0"
            >
              Cancelar solicitação
            </button>
          )}
        </div>
      </div>

      {/* Confirm: cancelar solicitação (solicitante) */}
      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        icon={X}
        tone="danger"
        title="Cancelar solicitação de troca?"
        description="A solicitação será cancelada e o colaborador atual será mantido. Uma nova solicitação poderá ser feita."
        cancelLabel="Manter solicitação"
        confirmLabel="Sim, cancelar"
        pending={cancelSwap.isPending}
        onConfirm={() => { if (pendingSwap) cancelSwap.mutate(pendingSwap.id, { onSuccess: () => setShowCancelConfirm(false) }); }}
      />

      {/* Confirm: aprovar troca (Compras) */}
      <ConfirmDialog
        open={confirmAction === "approve" && !!pendingSwap && !motivoMudou}
        onOpenChange={(o) => { if (!o) setConfirmAction(null); }}
        icon={CheckCheck}
        tone="default"
        title={pendingSwap?.swapKind === "permuta" ? "Aprovar troca entre vagas?" : pendingSwap?.swapKind === "transferencia" ? "Aprovar transferência de colaborador?" : "Aprovar troca de colaborador?"}
        description="Confira abaixo exatamente o que muda. Ao confirmar, a mudança é aplicada na hora."
        confirmLabel="Confirmar aprovação"
        pending={approveSwap.isPending}
        onConfirm={() => { if (pendingSwap) { approveSwap.mutate(pendingSwap.id); setConfirmAction(null); } }}
      >
        {pendingSwap && (
          <div className="bg-surface-muted border border-border rounded-xl p-3 space-y-2 text-xs">
            <ExplicacaoDaTroca troca={trocaExplicada} />
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground font-medium shrink-0">Motivo:</span>
              <span className="text-slate-600 leading-snug">{pendingSwap.reason}</span>
            </div>
          </div>
        )}
      </ConfirmDialog>

      {/* Confirm: recusar troca (Compras) */}
      <ConfirmDialog
        open={confirmAction === "reject" && !!pendingSwap}
        onOpenChange={(o) => { if (!o) { setConfirmAction(null); setRejectReason(""); } }}
        icon={XCircle}
        tone="danger"
        title={permuta ? "Recusar troca entre vagas?" : transferencia ? "Recusar transferência?" : "Recusar troca de colaborador?"}
        description={explicarTroca(trocaExplicada).recusa}
        confirmLabel="Confirmar recusa"
        pending={rejectSwap.isPending}
        confirmDisabled={!rejectReason.trim()}
        onConfirm={() => {
          if (!rejectReason.trim() || !pendingSwap) return;
          rejectSwap.mutate({ id: pendingSwap.id, comment: rejectReason });
          setConfirmAction(null);
          setRejectReason("");
        }}
      >
        <div>
          <label htmlFor="swap-reject-reason" className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Motivo da recusa<RequiredMark /></label>
          <textarea
            id="swap-reject-reason"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            className="mt-1.5 w-full border border-border rounded-lg p-2.5 text-sm text-slate-700 resize-none focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12"
            rows={3}
            placeholder="Descreva o motivo da recusa…"
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

// ── Botão "Solicitar troca" ─────────────────────────────────────────────────

export function RequestSwapButton({ onClick, blockReason }: { onClick: () => void; blockReason?: string | null }) {
  const blocked = !!blockReason;
  return (
    <div className="space-y-1">
      <MotivoDesabilitado motivo={blockReason || "Após aprovado pelo time de Compras, a alteração do colaborador será liberada."} desabilitado={blocked}>
        <button
        type="button"
        // Com evento encerrado o servidor devolve 403: o botão não pode prometer a troca
        onClick={blocked ? undefined : onClick}
        disabled={blocked}
        data-testid="button-request-swap"
        className="esc-alvo w-full flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-border bg-card text-primary text-sm font-semibold transition-colors hover:bg-brand-soft hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-brand-soft disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card"
      >
        <ArrowLeftRight className="w-4 h-4 shrink-0" aria-hidden="true" />
        Solicitar troca
      </button>
      </MotivoDesabilitado>
      <p className="text-center text-2xs text-muted-foreground leading-snug">
        {blocked ? blockReason : "Requer aprovação de Compras"}
      </p>
    </div>
  );
}
