/**
 * Aprovação do gestor (cenotécnica) no modal de detalhes: card com Aprovar /
 * Reprovar (quem tem canApproveCenotecnica ou admin) + confirms, e o modal
 * informativo "enviada para aprovação do gestor" mostrado após o Confirmar.
 */
import { useState } from "react";
import { AlertCircle, Check, Clock, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TeamInclusion } from "@shared/schema";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import type { ScalingMutations } from "./use-scaling-mutations";

export interface ProductionApprovalCardProps {
  inclusion: TeamInclusion;
  canApprove: boolean;
  mutations: Pick<ScalingMutations, "approveProduction" | "rejectProduction">;
  /** Evento encerrado: motivo do bloqueio (esconde Aprovar/Reprovar). */
  blockReason?: string | null;
}

export function ProductionApprovalCard({ inclusion, canApprove, mutations, blockReason }: ProductionApprovalCardProps) {
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const { approveProduction, rejectProduction } = mutations;
  const busy = approveProduction.isPending || rejectProduction.isPending;

  if (inclusion.status !== "aguardando_producao") return null;

  return (
    <div className="mt-5">
      <div className="border border-danger/25 rounded-xl overflow-hidden">
        <div className="bg-danger-soft border-b border-danger/25 px-4 py-2.5 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-danger" aria-hidden="true" />
          <span className="text-2xs font-black text-danger uppercase tracking-[0.12em]">Aprovação do gestor</span>
        </div>
        <div className="p-4">
          {blockReason ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2.5" role="status" data-testid="text-production-block-reason">
              <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-warning leading-snug">{blockReason}</p>
            </div>
          ) : canApprove ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Esta escalação de cenotécnica aguarda sua aprovação antes de seguir para as próximas etapas. Ao reprovar, o colaborador é removido e a vaga volta para escalação.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowReject(true)}
                  disabled={busy}
                  variant="outline"
                  className="flex-1 flex items-center justify-center gap-2 border-danger/25 text-danger hover:bg-danger-soft rounded-xl h-9 text-sm font-semibold"
                >
                  <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  {rejectProduction.isPending ? "Reprovando…" : "Reprovar"}
                </Button>
                <Button
                  onClick={() => setShowApprove(true)}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-2 bg-danger hover:bg-danger/90 text-white rounded-xl h-9 text-sm font-semibold"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  {approveProduction.isPending ? "Aprovando…" : "Aprovar"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-2">
              <div className="w-8 h-8 rounded-full bg-danger-soft flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-danger-strong" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Aguardando aprovação do gestor</p>
                <p className="text-2xs text-muted-foreground mt-0.5">O gestor da função precisa aprovar esta escalação.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showApprove}
        onOpenChange={setShowApprove}
        icon={Check}
        tone="default"
        title="Aprovar escalação de cenotécnica?"
        description="A escalação será aprovada pelo gestor e seguirá para o fluxo normal (passagem, hospedagem ou compras)."
        confirmLabel="Sim, aprovar"
        pending={approveProduction.isPending}
        onConfirm={() => approveProduction.mutate(inclusion.id, { onSuccess: () => setShowApprove(false) })}
      />
      <ConfirmDialog
        open={showReject}
        onOpenChange={setShowReject}
        icon={XCircle}
        tone="danger"
        title="Reprovar escalação de cenotécnica?"
        description={<>O colaborador será <span className="font-semibold text-slate-700">removido da vaga</span> e a escalação voltará para o estágio de escalação, aguardando um novo colaborador ser escolhido.</>}
        confirmLabel="Sim, reprovar"
        pending={rejectProduction.isPending}
        onConfirm={() => rejectProduction.mutate(inclusion.id, { onSuccess: () => setShowReject(false) })}
      />
    </div>
  );
}

// ── Info: escalação de cenotécnica enviada para aprovação do gestor ─────────

export interface SentToProductionInfo { collaboratorName: string; functionName: string; inclusionNumber: number | null }

export function SentToProductionDialog({ info, onClose }: { info: SentToProductionInfo | null; onClose: () => void }) {
  return (
    <Dialog open={!!info} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[460px] p-0 gap-0 rounded-xl overflow-hidden">
        <div className="px-6 pt-7 pb-6 space-y-5">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-warning-soft border-2 border-warning/25 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-warning-strong" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground leading-tight">Aguardando aprovação do gestor</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">A escalação foi registrada e está em análise.</p>
            </div>
          </div>
          <div className="bg-warning-soft border border-warning/25 rounded-xl px-4 py-3.5 space-y-2">
            {info?.inclusionNumber && (
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold text-warning uppercase tracking-wider">Escalação</span>
                <span className="text-xs font-bold text-slate-700">#{info.inclusionNumber}</span>
              </div>
            )}
            {info?.collaboratorName && (
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold text-warning uppercase tracking-wider">Colaborador</span>
                <span className="text-xs font-semibold text-slate-700">{info.collaboratorName}</span>
              </div>
            )}
            {info?.functionName && (
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold text-warning uppercase tracking-wider">Função</span>
                <span className="text-xs font-semibold text-slate-700">{info.functionName}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed text-center">
            Por ser uma função de <span className="font-semibold text-slate-700">cenotécnica</span>, esta escalação precisa ser aprovada pelo gestor antes de seguir para as próximas etapas.
          </p>
          <Button className="w-full rounded-xl h-10 text-sm font-semibold bg-warning-strong hover:bg-warning/90 text-white" onClick={onClose}>
            Entendido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
