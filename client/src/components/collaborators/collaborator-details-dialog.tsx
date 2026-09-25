/**
 * Diálogo "Detalhes do Colaborador" (25/09 — extraído de pages/collaborator-management.tsx).
 * Dados pessoais só para quem os recebe do servidor — para os demais papéis a
 * linha some (não existe "—" para dado que não veio).
 */
import { Check, Eye, FileText, X } from "lucide-react";
import type { Collaborator } from "@shared/schema";
import { enderecoEmUmaLinha } from "@shared/endereco";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, DetailRow, StatusBadge, formatDate, formatDocument, toTitleCase } from "./collaborator-shared";

export function CollaboratorDetailsDialog({ open, onOpenChange, c, podeVerDadosPessoais, canEdit, onApprove, onReject }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  c: Collaborator | null;
  podeVerDadosPessoais: boolean;
  canEdit: boolean;
  onApprove: (c: Collaborator) => void;
  onReject: (c: Collaborator) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-xl p-0 gap-0 border-0 shadow-3 overflow-hidden [&>button:last-child]:hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          {c && <Avatar name={c.fullName} />}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-foreground">Detalhes do Colaborador</h3>
            {c && <p className="text-2xs text-muted-foreground mt-0.5 truncate">{toTitleCase(c.fullName)}</p>}
          </div>
          {c && <StatusBadge status={c.status} />}
          <button onClick={() => onOpenChange(false)} aria-label="Fechar detalhes" className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-slate-600 hover:bg-muted transition-colors">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {c && (
          <div className="px-5 py-5 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <DetailRow label="Nome Completo" value={toTitleCase(c.fullName)} />
              <DetailRow label="Tipo de Vínculo" value={toTitleCase(c.type)} />
              {podeVerDadosPessoais && (
                <DetailRow label="Data de Nascimento" value={c.birthDate ? formatDate(c.birthDate) : "—"} />
              )}
              <DetailRow label="Cidade" value={c.city || "—"} />
              {podeVerDadosPessoais && (
                <>
                  <DetailRow label="Telefone" value={c.phone || "—"} />
                  <DetailRow label="Endereço" value={enderecoEmUmaLinha(c) || "—"} />
                  <DetailRow label="CEP" value={c.addressZip || "—"} />
                </>
              )}
              <DetailRow label="Criado por" value={c.createdByName || "—"} />
            </div>

            {podeVerDadosPessoais && (
              <div className="border-t border-border pt-4">
                <p className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Documentos</p>
                <div className="font-mono text-xs space-y-1 bg-surface-muted rounded-lg px-3 py-2.5 border border-border">
                  {/* O rótulo seguia fixo em "CPF" mesmo quando o documento principal era RG. */}
                  <div><span className="text-muted-foreground">{(c.documentType || "documento").toUpperCase()} </span><span className="text-slate-700 font-medium">{formatDocument(c.officialDocument, c.documentType)}</span></div>
                  {c.secondaryDocument && (
                    <div><span className="text-muted-foreground">{(c.secondaryDocumentType || (c.documentType === "cpf" ? "rg" : "cpf")).toUpperCase()} </span><span className="text-slate-700 font-medium">{formatDocument(c.secondaryDocument, c.secondaryDocumentType || "")}</span></div>
                  )}
                </div>
              </div>
            )}

            {c.documentAttachmentId && (
              <div className="border-t border-border pt-4">
                <p className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Documento Anexado</p>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-muted border border-border">
                  <FileText className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">CPF/RG — {toTitleCase(c.fullName)}</p>
                    <p className="text-2xs text-muted-foreground">Documento do colaborador</p>
                  </div>
                  <button
                    onClick={() => window.open(`/api/attachments/${c.documentAttachmentId}/view`, "_blank")}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs text-primary border border-primary/25 rounded-lg hover:bg-brand-soft transition-colors"
                  >
                    <Eye className="w-3 h-3" aria-hidden="true" /> Ver
                  </button>
                </div>
              </div>
            )}

            {c.approvalNotes && (
              <div className="border-t border-border pt-4">
                <p className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Observações</p>
                <p className="text-xs text-slate-600 bg-surface-muted rounded-lg px-3 py-2 border border-border">{c.approvalNotes}</p>
              </div>
            )}

            {c.status === "pendente" && canEdit && (
              <div className="flex gap-2 justify-end pt-2 border-t border-border">
                <button onClick={() => { onOpenChange(false); onReject(c); }} className="flex items-center gap-1.5 h-9 px-4 text-xs font-medium text-danger border border-danger/25 rounded-lg hover:bg-danger-soft transition-colors">
                  <X className="w-3.5 h-3.5" aria-hidden="true" /> Rejeitar
                </button>
                <button onClick={() => { onOpenChange(false); onApprove(c); }} className="flex items-center gap-1.5 h-9 px-4 text-xs font-semibold bg-success hover:bg-success/90 text-white rounded-lg transition-colors shadow-1">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" /> Aprovar
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
