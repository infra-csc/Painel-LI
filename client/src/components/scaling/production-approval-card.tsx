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
import ConfirmDialog from "./confirm-dialog";
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
      <div className="border border-red-200 rounded-2xl overflow-hidden">
        <div className="bg-red-50 border-b border-red-100 px-4 py-2.5 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-[11px] font-black text-red-700 uppercase tracking-[0.12em]">Aprovação do gestor</span>
        </div>
        <div className="p-4">
          {blockReason ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5" role="status" data-testid="text-production-block-reason">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[12px] text-amber-800 leading-snug">{blockReason}</p>
            </div>
          ) : canApprove ? (
            <div className="space-y-3">
              <p className="text-[12px] text-slate-600 leading-relaxed">
                Esta escalação de cenotécnica aguarda sua aprovação antes de seguir para as próximas etapas. Ao reprovar, o colaborador é removido e a vaga volta para escalação.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowReject(true)}
                  disabled={busy}
                  variant="outline"
                  className="flex-1 flex items-center justify-center gap-2 border-red-200 text-red-600 hover:bg-red-50 rounded-xl h-9 text-[13px] font-semibold"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  {rejectProduction.isPending ? "Reprovando..." : "Reprovar"}
                </Button>
                <Button
                  onClick={() => setShowApprove(true)}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-xl h-9 text-[13px] font-semibold"
                >
                  <Check className="w-3.5 h-3.5" />
                  {approveProduction.isPending ? "Aprovando..." : "Aprovar"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-2">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-slate-700">Aguardando aprovação do gestor</p>
                <p className="text-[11px] text-slate-400 mt-0.5">O gestor da função precisa aprovar esta escalação.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showApprove}
        onOpenChange={setShowApprove}
        icon={Check}
        tone="rose"
        title="Aprovar escalação de cenotécnica?"
        description="A escalação será aprovada pelo gestor e seguirá para o fluxo normal (passagem, hospedagem ou compras)."
        confirmLabel="Sim, aprovar"
        pendingLabel="Aprovando..."
        isPending={approveProduction.isPending}
        onConfirm={() => approveProduction.mutate(inclusion.id, { onSuccess: () => setShowApprove(false) })}
      />
      <ConfirmDialog
        open={showReject}
        onOpenChange={setShowReject}
        icon={XCircle}
        tone="orange"
        title="Reprovar escalação de cenotécnica?"
        description={<>O colaborador será <span className="font-semibold text-slate-700">removido da vaga</span> e a escalação voltará para o estágio de escalação, aguardando um novo colaborador ser escolhido.</>}
        confirmLabel="Sim, reprovar"
        pendingLabel="Reprovando..."
        isPending={rejectProduction.isPending}
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
      <DialogContent className="max-w-[420px] p-0 gap-0 rounded-2xl overflow-hidden">
        <div className="px-6 pt-7 pb-6 space-y-5">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-amber-500" />
            </div>
            <div>
              <DialogTitle className="text-[17px] font-bold text-slate-900 leading-tight">Aguardando aprovação do gestor</DialogTitle>
              <p className="text-[13px] text-slate-500 mt-1">A escalação foi registrada e está em análise.</p>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3.5 space-y-2">
            {info?.inclusionNumber && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Escalação</span>
                <span className="text-[12px] font-bold text-slate-700">#{info.inclusionNumber}</span>
              </div>
            )}
            {info?.collaboratorName && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Colaborador</span>
                <span className="text-[12px] font-semibold text-slate-700">{info.collaboratorName}</span>
              </div>
            )}
            {info?.functionName && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Função</span>
                <span className="text-[12px] font-semibold text-slate-700">{info.functionName}</span>
              </div>
            )}
          </div>
          <p className="text-[12px] text-slate-500 leading-relaxed text-center">
            Por ser uma função de <span className="font-semibold text-slate-700">cenotécnica</span>, esta escalação precisa ser aprovada pelo gestor antes de seguir para as próximas etapas.
          </p>
          <Button className="w-full rounded-xl h-10 text-[13px] font-semibold bg-amber-500 hover:bg-amber-600 text-white" onClick={onClose}>
            Entendido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
