/** Lightbox de imagens (anexos) — Dialog do shadcn (Esc fecha, foco preso). */
import { Download, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { LightboxItem } from "./use-attachments";

export default function AttachmentLightbox({ item, onClose }: { item: LightboxItem | null; onClose: () => void }) {
  const download = async () => {
    if (!item) return;
    try {
      // Sem checar res.ok, um 401/404 era baixado como se fosse o documento
      const res = await fetch(item.url, { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 401 ? "Sessão expirada" : "Não foi possível baixar o anexo");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(item.url, "_blank");
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="!max-w-5xl w-[95vw] max-h-[90vh] p-0 gap-0 overflow-hidden rounded-xl flex flex-col" data-testid="dialog-lightbox">
        {item && (
          <>
            <div className="bg-card border-b border-border px-5 py-3 pr-12 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
              <DialogTitle className="text-sm font-semibold text-slate-700 truncate">Visualizando anexo</DialogTitle>
              <DialogDescription className="sr-only">{item.name}</DialogDescription>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={download}
                  className="border border-border text-slate-600 hover:bg-surface-muted rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Baixar
                </button>
                <button
                  type="button"
                  onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}
                  className="border border-primary/25 text-primary bg-brand-soft hover:bg-brand-soft rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                  Abrir em outra aba
                </button>
              </div>
            </div>
            <div className="bg-surface-muted overflow-auto flex items-center justify-center min-h-[60vh] flex-1">
              <img src={item.url} alt={`Visualização do anexo ${item.name}`} className="max-w-full object-contain" style={{ maxHeight: "80vh" }} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
