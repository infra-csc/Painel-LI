/**
 * Aprovação do gestor (cenotécnica) no modal de detalhes: card com Aprovar /
 * Reprovar (quem tem canApproveCenotecnica ou admin) + confirms, e o modal
 * informativo "enviada para aprovação do gestor" mostrado após o Confirmar.
 */
import { useState } from "react";
import { AlertCircle, Check, Clock, Gavel, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TeamInclusion } from "@shared/schema";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { Secao } from "./inclusion-details/details-shared";
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

  // 07/10: "aguardando gestor" é ESPERA, não erro — o cartão era vermelho
  // (fundo, borda e o botão Aprovar em vermelho, que lia como "apagar").
  // Agora: moldura de decisão (marca) para quem aprova, neutra para quem
  // espera; Aprovar é o botão principal e Reprovar o contorno vermelho.
  return (
    <div>
      <Secao
        titulo="Aprovação do gestor"
        icone={<Gavel aria-hidden="true" />}
        tom={canApprove && !blockReason ? "decisao" : "neutro"}
        acessorio={<StatusBadge tone="warning" dot>Aguardando gestor</StatusBadge>}
        testId="card-aprovacao-gestor"
      >
          {blockReason ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2.5" role="status" data-testid="text-production-block-reason">
              <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-warning leading-snug">{blockReason}</p>
            </div>
          ) : canApprove ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-slate-600 leading-relaxed">
                Esta escalação de cenotécnica aguarda sua aprovação antes de seguir para as próximas etapas. Ao reprovar, o colaborador é removido e a vaga volta para escalação.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  onClick={() => setShowReject(true)}
                  disabled={busy}
                  variant="outline"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 border-danger/30 bg-card text-danger hover:bg-danger-soft hover:text-danger rounded-lg h-9 px-3.5 text-sm font-semibold"
                >
                  <XCircle className="w-4 h-4" aria-hidden="true" />
                  {rejectProduction.isPending ? "Reprovando…" : "Reprovar"}
                </Button>
                <Button
                  onClick={() => setShowApprove(true)}
                  disabled={busy}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg h-9 px-4 text-sm font-semibold shadow-1"
                >
                  <Check className="w-4 h-4" aria-hidden="true" />
                  {approveProduction.isPending ? "Aprovando…" : "Aprovar"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-warning-soft flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-warning-strong" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Aguardando aprovação do gestor</p>
                <p className="text-xs text-muted-foreground mt-0.5">O gestor da função precisa aprovar esta escalação.</p>
              </div>
            </div>
          )}
      </Secao>

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
  // 07/10: o mesmo desenho dos outros avisos da tela — ícone do assunto
  // (martelo do gestor) num círculo âmbar, resumo em linhas "rótulo · valor"
  // e o botão principal na cor da marca (era um âmbar cheio, que lia como alerta).
  const linhas = [
    info?.inclusionNumber ? ["Escalação", `#${info.inclusionNumber}`] : null,
    info?.collaboratorName ? ["Colaborador", info.collaboratorName] : null,
    info?.functionName ? ["Função", info.functionName] : null,
  ].filter(Boolean) as [string, string][];
  return (
    <Dialog open={!!info} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-describedby={undefined} className="max-w-[440px] p-0 gap-0 rounded-xl overflow-hidden">
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-full bg-warning-soft flex items-center justify-center shrink-0">
              <Gavel className="w-5 h-5 text-warning-strong" aria-hidden="true" />
            </div>
            <div className="min-w-0 pt-0.5">
              <DialogTitle className="text-base font-semibold text-foreground leading-tight">Aguardando aprovação do gestor</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">A escalação foi registrada e está em análise.</p>
            </div>
          </div>
          {linhas.length > 0 && (
            <dl className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface-muted">
              {linhas.map(([rotulo, valor]) => (
                <div key={rotulo} className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <dt className="text-xs text-muted-foreground">{rotulo}</dt>
                  <dd className="text-sm font-semibold text-foreground text-right break-words">{valor}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
            Por ser uma função de <span className="font-semibold text-slate-700">cenotécnica</span>, esta escalação precisa ser aprovada pelo gestor antes de seguir para as próximas etapas.
          </p>
          <div className="mt-5 flex justify-end">
            <Button className="rounded-lg h-9 px-5 text-sm font-semibold bg-primary hover:bg-primary-hover text-primary-foreground" onClick={onClose}>
              Entendido
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
