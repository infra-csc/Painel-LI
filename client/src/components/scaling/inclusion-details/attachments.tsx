/**
 * Anexos do modal da vaga (25/09 — extraídos do dialog): a lista de uma aba
 * (Passagem/Hospedagem) e o resumo "Anexos" do Resumo (até 3, com "Ver todos").
 *
 * 07/10: uma linha por anexo (40px, ícone + nome + "abrir"), a mesma nas abas e
 * no Resumo, dentro da moldura de seção do modal. O "Nenhum anexo" deixou de
 * ser uma caixa tracejada do tamanho de um formulário.
 */
import { ArrowRight, Eye, FileText, Paperclip } from "lucide-react";
import { Secao } from "./details-shared";

function LinhaDeAnexo({ titulo, onAbrir }: { titulo: string; onAbrir: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Abrir ${titulo}`}
      className="group flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onAbrir}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-primary">
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{titulo}</span>
        <span className="block text-2xs text-muted-foreground">Documento anexado</span>
      </span>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />Ver
      </span>
    </button>
  );
}

export function AttachmentList({ ids, label, openAttachment }: {
  ids: string[] | null | undefined;
  label: string;
  openAttachment: (attachmentId: string, fallbackLabel: string) => void;
}) {
  if (!ids || ids.length === 0) {
    return (
      <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
        <Paperclip className="h-4 w-4" aria-hidden="true" />
        Nenhum anexo disponível.
      </p>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ids.map((attachmentId, index) => (
        <LinhaDeAnexo key={attachmentId} titulo={`${label} ${index + 1}`} onAbrir={() => openAttachment(attachmentId, `${label} ${index + 1}`)} />
      ))}
    </div>
  );
}

/** Anexos no Resumo: os 3 primeiros de passagem + hospedagem, e o atalho para a aba. */
export function AttachmentsSummary({ ticketIds, accommodationIds, openAttachment, onVerTodos }: {
  ticketIds: string[] | null | undefined;
  accommodationIds: string[] | null | undefined;
  openAttachment: (attachmentId: string, fallbackLabel: string) => void;
  onVerTodos: () => void;
}) {
  const allAttachments = [
    ...(ticketIds || []).map(id => ({ id, label: "Passagem" })),
    ...(accommodationIds || []).map(id => ({ id, label: "Hospedagem" })),
  ];
  if (allAttachments.length === 0) return null;
  const visible = allAttachments.slice(0, 3);
  return (
    <Secao
      titulo="Anexos"
      icone={<Paperclip aria-hidden="true" />}
      acessorio={<span className="rounded-full bg-muted px-1.5 py-px text-2xs font-semibold tabular-nums text-slate-600">{allAttachments.length}</span>}
      corpo="p-3 space-y-2"
    >
      {visible.map(({ id, label }, index) => (
        <LinhaDeAnexo key={id} titulo={`${label} · Anexo ${index + 1}`} onAbrir={() => openAttachment(id, `${label} · Anexo ${index + 1}`)} />
      ))}
      {allAttachments.length > 3 && (
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-brand-soft"
          onClick={onVerTodos}
        >
          Ver todos os {allAttachments.length} anexos <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </Secao>
  );
}
