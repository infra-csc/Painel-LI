/**
 * Ficha do colaborador (25/09 — extraída de pages/collaborator-management.tsx;
 * 07/10 — de modal centralizado para painel lateral).
 *
 * Consultar um cadastro não é uma tarefa que interrompe: o painel à direita
 * deixa a lista à vista (no celular ocupa a tela). Cabeçalho com quem é e a
 * situação; o corpo em grupos — Cadastro, Dados pessoais, Documentos,
 * Observações — e as decisões no rodapé, que fica sempre à mão.
 *
 * Dados pessoais só para quem os recebe do servidor — para os demais papéis o
 * grupo inteiro some (não existe "—" para dado que não veio). A inativação,
 * antes só num tooltip da lista, ganhou o seu bloco com o motivo e a data.
 */
import type { ReactNode } from "react";
import { Ban, Check, Eye, FileText, PencilLine, X } from "lucide-react";
import type { Collaborator } from "@shared/schema";
import { enderecoEmUmaLinha } from "@shared/endereco";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Avatar, DetailRow, SituacaoDoColaborador, TYPE_CFG, TipoBadge, formatDate, formatDocument, rotuloDoSecundario, toTitleCase,
} from "./collaborator-shared";

/** Data de um timestamp (ISO) em dd/mm/aaaa, no fuso de quem olha. */
function dataDoRegistro(v: unknown): string {
  if (!v) return "";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

function Grupo({ titulo, children, acessorio }: { titulo: string; children: ReactNode; acessorio?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h3 className="text-xs font-semibold text-foreground">{titulo}</h3>
        {acessorio && <div className="ml-auto">{acessorio}</div>}
      </header>
      <div className="px-4 pb-3.5">{children}</div>
    </section>
  );
}

export function CollaboratorDetailsDialog({ open, onOpenChange, c, podeVerDadosPessoais, canEdit, onApprove, onReject, onEdit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  c: Collaborator | null;
  podeVerDadosPessoais: boolean;
  canEdit: boolean;
  onApprove: (c: Collaborator) => void;
  onReject: (c: Collaborator) => void;
  /** "Editar cadastro" a partir da ficha (o mesmo modal de edição da lista). */
  onEdit?: (c: Collaborator) => void;
}) {
  const decidido = c && (c.status === "aprovado" || c.status === "rejeitado") ? dataDoRegistro(c.approvedAt) : "";
  const pendenteDecidivel = !!c && c.status === "pendente" && canEdit;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="col-ficha w-full sm:max-w-[460px] p-0 gap-0 flex flex-col border-l border-border bg-surface-muted"
        data-testid="col-ficha"
      >
        {/* Cabeçalho: quem é e em que situação está. */}
        <div className="shrink-0 border-b border-border bg-card px-5 pt-5 pb-4 pr-12">
          {c && (
            <div className="flex items-start gap-3.5">
              <Avatar name={c.fullName} size="w-12 h-12 text-base" />
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg font-semibold leading-6 tracking-[-0.01em] text-foreground break-words">
                  {toTitleCase(c.fullName)}
                </SheetTitle>
                <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
                  {TYPE_CFG[c.type]?.extenso ?? "Colaborador"}
                  {c.city ? ` · ${c.city}` : ""}
                  {c.collaboratorNumber ? <span className="tabular-nums"> · nº {c.collaboratorNumber}</span> : null}
                </SheetDescription>
                {/* Sem tooltip aqui: o motivo da inativação tem bloco próprio logo abaixo. */}
                <div className="mt-2.5"><SituacaoDoColaborador c={c} empilhar={false} semDica /></div>
              </div>
            </div>
          )}
          {!c && <SheetTitle className="text-lg font-semibold">Colaborador</SheetTitle>}
        </div>

        {c && (
          <div key={c.id} className="col-entra flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-5 space-y-3">
            {/* Inativado: o porquê fica no topo — é a primeira coisa a saber. */}
            {c.active === false && (
              <div className="relative overflow-hidden rounded-xl border border-border bg-card py-2.5 pl-4 pr-3.5">
                <span className="absolute inset-y-0 left-0 w-[3px] bg-slate-400" aria-hidden="true" />
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                  <Ban className="w-3.5 h-3.5" aria-hidden="true" /> Inativo{c.inactivatedAt ? <span className="font-normal text-muted-foreground"> desde {dataDoRegistro(c.inactivatedAt)}</span> : null}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{c.inactiveReason || "Sem motivo registrado."}</p>
                <p className="mt-1 text-2xs text-muted-foreground">Não aparece nas escalações; o histórico continua.</p>
              </div>
            )}

            <Grupo titulo="Cadastro">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <DetailRow label="Nome completo" value={toTitleCase(c.fullName)} className="col-span-2" />
                <div className="min-w-0">
                  <dt className="text-2xs font-medium text-muted-foreground">Tipo de vínculo</dt>
                  <dd className="mt-1"><TipoBadge type={c.type} /></dd>
                </div>
                <DetailRow label="Cidade" value={c.city || ""} />
                <DetailRow label="Criado por" value={c.createdByName || ""} />
                <DetailRow label="Cadastrado em" value={dataDoRegistro(c.createdAt)} />
                {decidido && <DetailRow label={c.status === "aprovado" ? "Aprovado em" : "Rejeitado em"} value={decidido} />}
              </dl>
            </Grupo>

            {podeVerDadosPessoais && (
              <Grupo titulo="Dados pessoais">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailRow label="Data de nascimento" value={c.birthDate ? formatDate(c.birthDate) : ""} />
                  <DetailRow label="Telefone" value={c.phone || ""} />
                  {/* Endereço e CEP numa linha só: dois "Não informado" seguidos pesavam mais que o dado. */}
                  <div className="col-span-2 min-w-0">
                    <dt className="text-2xs font-medium text-muted-foreground">Endereço</dt>
                    <dd className="mt-0.5 text-sm break-words">
                      {enderecoEmUmaLinha(c) || c.addressZip ? (
                        <>
                          {enderecoEmUmaLinha(c) && <span className="text-foreground">{enderecoEmUmaLinha(c)}</span>}
                          {c.addressZip && <span className="block font-mono tabular-nums text-[13px] text-slate-700"><span className="font-sans text-2xs font-medium text-muted-foreground">CEP </span>{c.addressZip}</span>}
                        </>
                      ) : <span className="text-muted-foreground">Não informado</span>}
                    </dd>
                  </div>
                </dl>
              </Grupo>
            )}

            {podeVerDadosPessoais && (
              <Grupo titulo="Documentos">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {/* O rótulo seguia fixo em "CPF" mesmo quando o documento principal era RG. */}
                  <DetailRow label={(c.documentType || "documento").toUpperCase()} value={formatDocument(c.officialDocument, c.documentType)} mono />
                  {c.secondaryDocument && (
                    <DetailRow label={rotuloDoSecundario(c)} value={formatDocument(c.secondaryDocument, c.secondaryDocumentType || "")} mono />
                  )}
                </dl>
                {c.documentAttachmentId ? (
                  <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2.5">
                    <span className="inline-flex w-8 h-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary" aria-hidden="true">
                      <FileText className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">CPF/RG — {toTitleCase(c.fullName)}</p>
                      <p className="text-2xs text-muted-foreground">Documento anexado ao cadastro</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.open(`/api/attachments/${c.documentAttachmentId}/view`, "_blank")}
                      className="pas-alvo inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border bg-card text-xs font-medium text-primary hover:bg-brand-soft hover:border-primary/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="col-ficha-ver-anexo"
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" /> Abrir
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">Nenhum documento anexado.</p>
                )}
              </Grupo>
            )}

            {/* Quem não vê dados pessoais ainda sabe se há anexo (não o conteúdo). */}
            {!podeVerDadosPessoais && c.documentAttachmentId && (
              <Grupo titulo="Documento anexado">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                  <p className="min-w-0 flex-1 text-xs text-slate-700 truncate">CPF/RG — {toTitleCase(c.fullName)}</p>
                  <button
                    type="button"
                    onClick={() => window.open(`/api/attachments/${c.documentAttachmentId}/view`, "_blank")}
                    className="pas-alvo inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border bg-card text-xs font-medium text-primary hover:bg-brand-soft transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" /> Abrir
                  </button>
                </div>
              </Grupo>
            )}

            {c.approvalNotes && (
              <Grupo titulo="Observações da aprovação">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{c.approvalNotes}</p>
              </Grupo>
            )}
          </div>
        )}

        {/* Rodapé: as decisões ficam sempre à mão, mesmo com a ficha rolada. */}
        {c && (pendenteDecidivel || (canEdit && onEdit)) && (
          <div className="shrink-0 flex flex-wrap items-center gap-2 border-t border-border bg-card px-4 py-3 sm:px-5">
            {canEdit && onEdit && (
              <Button variant="outline" onClick={() => { onOpenChange(false); onEdit(c); }} className="h-9 rounded-lg px-3 text-sm font-medium" data-testid="col-ficha-editar">
                <PencilLine className="w-4 h-4 mr-1.5" aria-hidden="true" /> Editar
              </Button>
            )}
            {pendenteDecidivel && (
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" onClick={() => { onOpenChange(false); onReject(c); }} className="h-9 rounded-lg px-3.5 text-sm font-medium text-danger hover:bg-danger-soft hover:text-danger border-danger/30" data-testid="col-ficha-rejeitar">
                  <X className="w-4 h-4 mr-1" aria-hidden="true" /> Rejeitar
                </Button>
                <Button onClick={() => { onOpenChange(false); onApprove(c); }} className="h-9 rounded-lg px-4 text-sm font-semibold bg-success text-white hover:bg-success/90" data-testid="col-ficha-aprovar">
                  <Check className="w-4 h-4 mr-1" strokeWidth={2.5} aria-hidden="true" /> Aprovar
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
