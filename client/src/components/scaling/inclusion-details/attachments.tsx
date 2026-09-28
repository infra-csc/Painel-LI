/**
 * Anexos do modal da vaga (25/09 — extraídos do dialog): a lista de uma aba
 * (Passagem/Hospedagem) e o resumo "Anexos" do Resumo (até 3, com "Ver todos").
 */
import { Eye, File, FileText } from "lucide-react";

export function AttachmentList({ ids, label, openAttachment }: {
  ids: string[] | null | undefined;
  label: string;
  openAttachment: (attachmentId: string, fallbackLabel: string) => void;
}) {
  if (!ids || ids.length === 0) {
    return (
      <div className="flex items-center gap-2.5 py-3 px-4 bg-surface-muted border border-dashed border-border rounded-xl">
        <File className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">Nenhum anexo disponível.</span>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {ids.map((attachmentId, index) => (
        <div
          key={attachmentId}
          role="button"
          tabIndex={0}
          aria-label={`Abrir ${label} ${index + 1}`}
          className="flex items-center gap-3 bg-card border border-border hover:border-primary hover:bg-brand-soft rounded-xl px-4 py-3 cursor-pointer transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => openAttachment(attachmentId, `${label} ${index + 1}`)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAttachment(attachmentId, `${label} ${index + 1}`); } }}
        >
          <div className="w-8 h-8 rounded-lg bg-brand-soft border border-primary/25 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-700">{label} {index + 1}</div>
            <div className="text-2xs text-muted-foreground mt-0.5">Documento anexado · clique para visualizar</div>
          </div>
          <Eye className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" aria-hidden="true" />
        </div>
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
    <div className="mt-5">
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-surface-muted border-b border-border px-4 py-2.5 flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-2xs font-black text-muted-foreground uppercase tracking-[0.12em]">Anexos</span>
          <span className="bg-border text-slate-600 text-2xs font-bold px-1.5 py-0.5 rounded-full">{allAttachments.length}</span>
        </div>
        <div className="p-4 space-y-2">
          {visible.map(({ id, label }, index) => (
            <div
              key={id}
              role="button"
              tabIndex={0}
              aria-label={`Abrir ${label} · Anexo ${index + 1}`}
              className="flex items-center gap-3 bg-card border border-border hover:border-primary hover:bg-brand-soft rounded-xl px-3 py-2.5 cursor-pointer transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => openAttachment(id, `${label} · Anexo ${index + 1}`)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAttachment(id, `${label} · Anexo ${index + 1}`); } }}
            >
              <div className="w-7 h-7 rounded-lg bg-brand-soft border border-primary/25 flex items-center justify-center flex-shrink-0">
                <FileText className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700">{label} · Anexo {index + 1}</div>
                <div className="text-2xs text-muted-foreground">Documento anexado</div>
              </div>
              <Eye className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" aria-hidden="true" />
            </div>
          ))}
          {allAttachments.length > 3 && (
            <button
              className="w-full text-center text-xs text-primary font-semibold py-1.5 hover:bg-brand-soft rounded-lg transition-colors"
              onClick={onVerTodos}
            >
              Ver todos os {allAttachments.length} anexos →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
