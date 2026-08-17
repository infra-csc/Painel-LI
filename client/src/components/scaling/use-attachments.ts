/**
 * Anexos (passagem/hospedagem) do modal de detalhes: cache de metadados,
 * pré-carregamento ao abrir o modal e abertura (lightbox / nova aba / viewer).
 */
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { isImageFile, isPdfFile } from "./scaling-utils";

export interface AttachmentMeta { name?: string; type?: string; viewUrl?: string; downloadUrl?: string }
export interface LightboxItem { url: string; name: string }

export function useAttachments(opts: {
  /** IDs a pré-carregar (mudam quando o modal abre em outra inclusão) */
  prefetchIds: string[];
  active: boolean;
  /** Ao abrir uma imagem o modal principal fecha para dar lugar ao lightbox */
  onBeforeOpenLightbox?: () => void;
}) {
  const { prefetchIds, active, onBeforeOpenLightbox } = opts;
  const { toast } = useToast();
  const [attachmentMeta, setAttachmentMeta] = useState<Record<string, AttachmentMeta>>({});
  const [lightbox, setLightbox] = useState<LightboxItem | null>(null);

  const prefetchKey = prefetchIds.join("|");
  useEffect(() => {
    if (!active) return;
    const ids = prefetchIds.filter(id => !attachmentMeta[id]);
    let alive = true;
    ids.forEach(async (id) => {
      try {
        const res = await fetch(`/api/attachments/${id}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (alive) setAttachmentMeta(prev => ({ ...prev, [id]: data }));
        }
      } catch (_) {}
    });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, prefetchKey]);

  // Abre anexo: lightbox para imagens, nova aba para PDFs, Google Docs Viewer para outros
  const openAttachment = async (attachmentId: string, fallbackLabel: string) => {
    try {
      let data = attachmentMeta[attachmentId];
      if (!data) {
        const res = await fetch(`/api/attachments/${attachmentId}`, { credentials: "include" });
        if (res.status === 401) throw new Error("Sua sessão expirou. Atualize a página e entre novamente.");
        if (!res.ok) throw new Error("Erro ao buscar anexo");
        data = await res.json();
        setAttachmentMeta(prev => ({ ...prev, [attachmentId]: data! }));
      }
      const url = data?.viewUrl;
      if (!url || url === "#") {
        toast({ title: "Anexo não disponível", description: "O arquivo ainda não possui URL de visualização.", variant: "destructive" });
        return;
      }
      if (isImageFile(data?.name, data?.type)) {
        onBeforeOpenLightbox?.();
        setLightbox({ url, name: data?.name || fallbackLabel });
      } else if (isPdfFile(data?.name, data?.type)) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      toast({ title: "Erro", description: `Não foi possível abrir o anexo: ${err instanceof Error ? err.message : "Erro desconhecido"}`, variant: "destructive" });
    }
  };

  return { attachmentMeta, openAttachment, lightbox, setLightbox };
}
