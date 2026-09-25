/**
 * Diálogos de decisão sobre um colaborador (25/09 — extraídos de pages/collaborator-management.tsx):
 * aprovar/rejeitar (com CPF/RG para quem vê dados pessoais) e inativar com motivo.
 */
import { AlertTriangle, Ban, Check, Loader2, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RequiredMark } from "@/components/forms/required-mark";
import { cn } from "@/lib/utils";
import { CollaboratorChip } from "./collaborator-shared";
import type { CollaboratorActions } from "./use-collaborator-actions";

const CAMPO_DOC = "w-full h-9 px-3 font-mono text-sm border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring/20";
const ROTULO = "text-2xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5";

export function CollaboratorApprovalDialog({ a, podeVerDadosPessoais }: { a: CollaboratorActions; podeVerDadosPessoais: boolean }) {
  const { showApprovalModal, setShowApprovalModal, selectedCollaborator: c, approvalAction, approvalNotes, setApprovalNotes, editCpf, setEditCpf, editRg, setEditRg, updateMutation, handleConfirm } = a;
  const aprovar = approvalAction === "approve";
  return (
    <Dialog open={showApprovalModal} onOpenChange={setShowApprovalModal}>
      <DialogContent className="max-w-md rounded-xl p-0 gap-0 border-0 shadow-3 overflow-hidden [&>button:last-child]:hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-2", aprovar ? "bg-success" : "bg-danger")}>
            {aprovar
              ? <Check className="w-4 h-4 text-white" strokeWidth={3} aria-hidden="true" />
              : <X className="w-4 h-4 text-white" strokeWidth={3} aria-hidden="true" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-foreground">{aprovar ? "Aprovar Colaborador" : "Rejeitar Colaborador"}</h3>
            <p className="text-2xs text-muted-foreground mt-0.5">
              {aprovar
                ? (podeVerDadosPessoais ? "Revise os dados antes de confirmar" : "Confirme a aprovação do cadastro")
                : "Informe o motivo da rejeição"}
            </p>
          </div>
          <button onClick={() => setShowApprovalModal(false)} disabled={updateMutation.isPending} aria-label="Fechar" className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-slate-600 hover:bg-muted disabled:opacity-40 transition-colors">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {c && (
          <div className="px-5 py-5 space-y-4">
            <CollaboratorChip c={c} size="w-8 h-8 text-xs" />

            {aprovar && podeVerDadosPessoais && (
              <div className="space-y-3">
                <p className="text-2xs font-bold text-muted-foreground uppercase tracking-widest">Documentos</p>
                <div>
                  <label htmlFor="approval-cpf" className={ROTULO}>CPF<RequiredMark /></label>
                  <input id="approval-cpf" value={editCpf} onChange={e => setEditCpf(e.target.value)} placeholder="000.000.000-00" className={CAMPO_DOC} />
                </div>
                <div>
                  <label htmlFor="approval-rg" className={ROTULO}>RG <span className="text-muted-foreground font-normal normal-case tracking-normal">(opcional)</span></label>
                  <input id="approval-rg" value={editRg} onChange={e => setEditRg(e.target.value)} placeholder="00.000.000-0" className={CAMPO_DOC} />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="approval-notes" className={ROTULO}>
                Observações <span className="text-muted-foreground font-normal normal-case tracking-normal">{aprovar ? "(opcional)" : "(recomendado)"}</span>
              </label>
              <Textarea id="approval-notes" value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)}
                placeholder={aprovar ? "Comentários sobre a aprovação…" : "Motivo da rejeição…"}
                rows={3} className="text-sm border-border rounded-lg resize-none focus:border-primary focus:ring-1 focus:ring-ring/20" />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowApprovalModal(false)} disabled={updateMutation.isPending}
                className="flex-1 h-9 text-xs font-medium text-slate-600 border border-border rounded-lg hover:bg-surface-muted transition-colors">
                Cancelar
              </button>
              <button onClick={handleConfirm} disabled={updateMutation.isPending}
                className={cn("flex-1 h-9 flex items-center justify-center gap-1.5 text-xs font-semibold text-white rounded-lg transition-colors shadow-1 disabled:opacity-60", aprovar ? "bg-success" : "bg-danger")}
              >
                {updateMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  : aprovar
                    ? <><Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" /> Confirmar Aprovação</>
                    : <><X className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" /> Confirmar Rejeição</>
                }
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CollaboratorInactivateDialog({ a }: { a: CollaboratorActions }) {
  const { showDeleteModal, setShowDeleteModal, selectedCollaborator: c, inactivateReason, setInactivateReason, inactivateMutation } = a;
  const fechar = () => { setShowDeleteModal(false); setInactivateReason(""); };
  return (
    <Dialog open={showDeleteModal} onOpenChange={(open) => { if (!inactivateMutation.isPending) { setShowDeleteModal(open); if (!open) setInactivateReason(""); } }}>
      <DialogContent className="max-w-[420px] rounded-xl p-0 gap-0 border-0 shadow-3 overflow-hidden [&>button:last-child]:hidden">
        <div className="px-6 py-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-danger-soft border border-danger/25 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-danger-strong" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground leading-tight mb-1">Inativar colaborador?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">Ele deixará de aparecer nas escalações, mas será mantido no histórico. Você pode reativá-lo depois.</p>
            </div>
          </div>

          {c && <CollaboratorChip c={c} size="w-9 h-9 text-sm" rounded="rounded-xl" nameCls="text-sm font-semibold text-slate-700" />}

          <div>
            <label htmlFor="inactivate-reason" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Motivo da inativação<RequiredMark />
            </label>
            <textarea
              id="inactivate-reason"
              value={inactivateReason}
              onChange={e => setInactivateReason(e.target.value)}
              placeholder="Ex.: desligamento, encerramento de contrato…"
              rows={3}
              disabled={inactivateMutation.isPending}
              className="w-full text-sm rounded-lg border border-border px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-danger/25 focus:border-danger/25 disabled:opacity-60"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={fechar}
              disabled={inactivateMutation.isPending}
              className="flex-1 h-9 text-xs font-medium text-slate-600 border border-border rounded-lg hover:bg-surface-muted transition-colors disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              onClick={() => { if (c && inactivateReason.trim()) inactivateMutation.mutate({ id: c.id, reason: inactivateReason.trim() }); }}
              disabled={inactivateMutation.isPending || !inactivateReason.trim()}
              className="flex-1 h-9 flex items-center justify-center gap-1.5 text-xs font-semibold text-white rounded-lg transition-colors shadow-1 disabled:opacity-60 disabled:cursor-not-allowed bg-danger"
            >
              {inactivateMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                : <><Ban className="w-3.5 h-3.5" aria-hidden="true" /> Inativar</>
              }
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
