/**
 * Diálogos de decisão sobre um colaborador (25/09 — extraídos de pages/collaborator-management.tsx;
 * 07/10 — redesenho): aprovar/rejeitar (com CPF/RG para quem vê dados
 * pessoais) e inativar com motivo.
 *
 * O desenho é o dos diálogos de decisão da Aprovação de Escala: cabeçalho com
 * o ícone no tom da decisão, quem é (o cartãozinho), o bloco "O que acontece"
 * dito ANTES do clique e o rodapé Cancelar → Confirmar. Inativar passou a ser
 * a confirmação única do app (`ConfirmDialog`, tom de perigo: o foco começa no
 * Cancelar). A regra de cada decisão continua em `use-collaborator-actions`.
 */
import { useState } from "react";
import { Ban, Check, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RequiredMark, OptionalMark } from "@/components/forms/required-mark";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { validateCPF } from "@/components/modals/collaborator-modal";
import { cn } from "@/lib/utils";
import { CollaboratorChip } from "./collaborator-shared";
import type { CollaboratorActions } from "./use-collaborator-actions";

const CAMPO_DOC = "w-full h-10 px-3 font-mono text-sm tabular-nums bg-card border border-input rounded-lg outline-none transition-[border-color,box-shadow] duration-150 hover:border-slate-300 focus:border-primary focus:ring-[3px] focus:ring-primary/12";
const ROTULO = "block text-xs font-medium text-slate-700 mb-1.5";

export function CollaboratorApprovalDialog({ a, podeVerDadosPessoais }: { a: CollaboratorActions; podeVerDadosPessoais: boolean }) {
  const { showApprovalModal, setShowApprovalModal, selectedCollaborator: c, approvalAction, approvalNotes, setApprovalNotes, editCpf, setEditCpf, editRg, setEditRg, updateMutation, handleConfirm } = a;
  const aprovar = approvalAction === "approve";
  const salvando = updateMutation.isPending;
  // Aviso do CPF na hora (a MESMA regra que trava a confirmação — validateCPF),
  // só depois de sair do campo: não brigar com quem ainda está digitando.
  const [cpfTocado, setCpfTocado] = useState(false);
  const cpfInvalido = cpfTocado && !!editCpf.trim() && !validateCPF(editCpf);
  const fechar = (v: boolean) => { if (!salvando) { setShowApprovalModal(v); if (!v) setCpfTocado(false); } };
  return (
    <Dialog open={showApprovalModal} onOpenChange={fechar}>
      <DialogContent className="max-w-[480px] p-0 gap-0 overflow-hidden rounded-xl max-sm:max-h-[calc(100dvh-1rem)] flex flex-col" data-testid="col-decisao">
        <div className="shrink-0 flex items-start gap-3 border-b border-border px-5 pt-4 pb-3.5 pr-12">
          <span className={cn("mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full", aprovar ? "bg-success-soft text-success" : "bg-danger-soft text-danger")} aria-hidden="true">
            {aprovar ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <X className="h-4 w-4" strokeWidth={2.5} />}
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold leading-6 text-foreground">{aprovar ? "Aprovar cadastro" : "Rejeitar cadastro"}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
              {aprovar
                ? (podeVerDadosPessoais ? "Confira os documentos antes de confirmar." : "Confirme a aprovação do cadastro.")
                : "Diga o motivo — ele fica registrado no cadastro."}
            </DialogDescription>
          </div>
        </div>

        {c && (
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
            <CollaboratorChip c={c} />

            {aprovar && podeVerDadosPessoais && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-foreground mb-2">Documentos</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="approval-cpf" className={ROTULO}>CPF<RequiredMark /></label>
                    <input
                      id="approval-cpf" value={editCpf} inputMode="numeric"
                      onChange={e => setEditCpf(e.target.value)} onBlur={() => setCpfTocado(true)}
                      placeholder="000.000.000-00" aria-invalid={cpfInvalido || undefined}
                      aria-describedby={cpfInvalido ? "approval-cpf-erro" : undefined}
                      className={cn(CAMPO_DOC, cpfInvalido && "border-danger focus:border-danger focus:ring-danger/15")}
                    />
                    {cpfInvalido && <p id="approval-cpf-erro" className="col-entra mt-1 text-2xs font-medium text-danger">CPF inválido — confira os dígitos.</p>}
                  </div>
                  <div>
                    <label htmlFor="approval-rg" className={ROTULO}>RG<OptionalMark /></label>
                    <input id="approval-rg" value={editRg} onChange={e => setEditRg(e.target.value)} placeholder="00.000.000-0" className={CAMPO_DOC} />
                  </div>
                </div>
                <p className="text-2xs text-muted-foreground">Basta um dos dois. Com CPF, ele vira o documento oficial do cadastro.</p>
              </fieldset>
            )}

            <div>
              <label htmlFor="approval-notes" className={ROTULO}>
                {aprovar ? "Observações" : "Motivo da rejeição"}
                <span className="ml-1 font-normal text-muted-foreground">{aprovar ? "(opcional)" : "(recomendado)"}</span>
              </label>
              <Textarea id="approval-notes" value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)}
                placeholder={aprovar ? "Algo que a equipe deva saber sobre este cadastro…" : "Ex.: documento ilegível, cadastro duplicado…"}
                rows={3} className="text-sm rounded-lg resize-none border-input hover:border-slate-300 focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:ring-offset-0 focus-visible:border-primary" />
            </div>

            {/* O que acontece — dito antes do clique. */}
            <div className={cn("relative overflow-hidden rounded-xl border py-2.5 pl-4 pr-3.5", aprovar ? "border-success/25 bg-success-soft/60" : "border-danger/20 bg-danger-soft/50")}>
              <span className={cn("absolute inset-y-0 left-0 w-[3px] opacity-70", aprovar ? "bg-success" : "bg-danger")} aria-hidden="true" />
              <p className={cn("text-[13px] font-semibold leading-5", aprovar ? "text-success" : "text-danger")}>O que acontece</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-700">
                {aprovar
                  ? "O cadastro passa a Aprovado e, se estiver ativo, já pode ser escalado."
                  : "O cadastro passa a Rejeitado e não pode ser escalado. Os documentos ficam como estão."}
              </p>
            </div>
          </div>
        )}

        <div className="shrink-0 flex items-center justify-end gap-2 border-t border-border bg-surface-muted px-5 py-3">
          <Button variant="outline" onClick={() => fechar(false)} disabled={salvando} className="h-9 rounded-lg px-4 text-sm font-medium">
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={salvando}
            className={cn("h-9 min-w-[176px] rounded-lg px-4 text-sm font-semibold text-white", aprovar ? "bg-success hover:bg-success/90" : "bg-danger hover:bg-danger/90")}
            data-testid="col-decisao-confirmar"
          >
            {salvando
              ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />{aprovar ? "Aprovando…" : "Rejeitando…"}</>
              : aprovar
                ? <><Check className="w-4 h-4 mr-1.5" strokeWidth={2.5} aria-hidden="true" />Confirmar aprovação</>
                : <><X className="w-4 h-4 mr-1.5" strokeWidth={2.5} aria-hidden="true" />Confirmar rejeição</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CollaboratorInactivateDialog({ a }: { a: CollaboratorActions }) {
  const { showDeleteModal, setShowDeleteModal, selectedCollaborator: c, inactivateReason, setInactivateReason, inactivateMutation } = a;
  const salvando = inactivateMutation.isPending;
  return (
    <ConfirmDialog
      open={showDeleteModal}
      onOpenChange={(open) => { if (!salvando) { setShowDeleteModal(open); if (!open) setInactivateReason(""); } }}
      title="Inativar este cadastro?"
      description="Deixa de aparecer nas escalações, mas continua no histórico. Dá para reativar depois."
      icon={Ban}
      tone="danger"
      pending={salvando}
      confirmDisabled={!inactivateReason.trim()}
      confirmLabel={salvando ? "Inativando…" : "Inativar"}
      onConfirm={() => { if (c && inactivateReason.trim()) inactivateMutation.mutate({ id: c.id, reason: inactivateReason.trim() }); }}
      className="max-w-[440px]"
      testId="col-inativar"
      confirmTestId="col-inativar-confirmar"
    >
      <div className="space-y-3 text-left">
        {c && <CollaboratorChip c={c} />}
        <div>
          <label htmlFor="inactivate-reason" className={ROTULO}>
            Motivo da inativação<RequiredMark />
          </label>
          <Textarea
            id="inactivate-reason"
            value={inactivateReason}
            onChange={e => setInactivateReason(e.target.value)}
            placeholder="Ex.: desligamento, encerramento de contrato…"
            rows={3}
            disabled={salvando}
            className="text-sm rounded-lg resize-none border-input hover:border-slate-300 focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:ring-offset-0 focus-visible:border-primary"
          />
          <p className="mt-1 text-2xs text-muted-foreground">Fica registrado na ficha do colaborador.</p>
        </div>
      </div>
    </ConfirmDialog>
  );
}
