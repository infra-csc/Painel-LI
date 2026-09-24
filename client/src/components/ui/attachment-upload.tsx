import { useState, useRef } from "react";
import { Paperclip, X, Upload, FileText, FileImage, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { throwIfResNotOk } from "@/lib/queryClient";

interface AttachmentMeta {
  id: string;
  name: string;
  size: number;
  type: string;
}

/** Item devolvido por `POST /api/upload` (um por arquivo enviado). */
interface ArquivoEnviado {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

// Espelho da allowlist do servidor (server/routes.ts ALLOWED_UPLOAD_MIMES +
// objectAcl.ts, que confere os primeiros bytes): PDF, PNG, JPG/JPEG, XLSX e
// CSV, até 10 MB. Validar aqui evita subir 10 MB para receber um 415; o
// servidor continua sendo a barreira de verdade.
const EXTENSOES_ACEITAS = ["pdf", "png", "jpg", "jpeg", "xlsx", "csv"] as const;
const TIPOS_ACEITOS = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/jpg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel", // Windows/Excel rotula CSV assim
  "text/csv", "text/plain",
]);
const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;
const TEXTO_TIPOS_ACEITOS = "PDF, PNG, JPG, XLSX ou CSV";

function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i >= 0 ? nome.slice(i + 1).toLowerCase() : "";
}

/** Motivo (pt-BR) para recusar o arquivo antes de enviar, ou null se pode ir. */
export function motivoDeRecusa(file: Pick<File, "name" | "size" | "type">): string | null {
  const ext = extensaoDe(file.name);
  // Extensão manda (o navegador às vezes deixa `type` vazio ou genérico);
  // um MIME conhecido com extensão estranha também não passa.
  if (!(EXTENSOES_ACEITAS as readonly string[]).includes(ext)) {
    return `"${file.name}" não é ${TEXTO_TIPOS_ACEITOS}.`;
  }
  if (file.type && !TIPOS_ACEITOS.has(file.type) && !file.type.startsWith("application/octet-stream")) {
    return `"${file.name}" não é ${TEXTO_TIPOS_ACEITOS}.`;
  }
  if (file.size > TAMANHO_MAXIMO_BYTES) {
    return `"${file.name}" tem ${(file.size / (1024 * 1024)).toFixed(1)} MB; o máximo é 10 MB.`;
  }
  if (file.size === 0) return `"${file.name}" está vazio.`;
  return null;
}

/**
 * Envio pelo servidor (23/09). Até então o componente pedia uma URL assinada
 * em POST /api/attachments/upload, fazia PUT direto no bucket e confirmava —
 * sem allowlist de tipo nem dono. Essa rota agora responde 410; o caminho é
 * um único POST multipart em /api/upload, que valida o conteúdo (magic
 * number), grava o dono e já devolve id/nome/tipo/tamanho/URL.
 */
async function enviarArquivo(file: File): Promise<ArquivoEnviado> {
  const fd = new FormData();
  fd.append("files", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
  await throwIfResNotOk(res);
  const lista = (await res.json()) as unknown;
  const enviado = Array.isArray(lista) ? (lista[0] as Partial<ArquivoEnviado> | undefined) : undefined;
  if (!enviado || typeof enviado.id !== "string" || !enviado.id) {
    throw new Error("O servidor não devolveu o identificador do anexo.");
  }
  return {
    id: enviado.id,
    name: typeof enviado.name === "string" && enviado.name ? enviado.name : file.name,
    type: typeof enviado.type === "string" && enviado.type ? enviado.type : file.type,
    size: typeof enviado.size === "number" ? enviado.size : file.size,
    url: typeof enviado.url === "string" && enviado.url ? enviado.url : `/api/attachments/${enviado.id}/view`,
  };
}

interface AttachmentUploadProps {
  attachmentIds?: string[];
  onAttachmentsChange: (attachmentIds: string[]) => void;
  disabled?: boolean;
  title?: string;
  /**
   * Chamado com o arquivo original depois de anexado (28/08). Serve para quem
   * quer APROVEITAR o conteúdo do anexo — na passagem, o mesmo PDF que vira
   * comprovante também preenche os campos, para não existirem dois lugares
   * de subir o mesmo arquivo.
   */
  onFileSelected?: (file: File) => void | Promise<void>;
}

export default function AttachmentUpload({
  attachmentIds = [],
  onAttachmentsChange,
  disabled = false,
  onFileSelected,
}: AttachmentUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [localMeta, setLocalMeta] = useState<AttachmentMeta[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const recusa = motivoDeRecusa(file);
    if (recusa) {
      toast({ title: "Arquivo não aceito", description: recusa, variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    try {
      const enviado = await enviarArquivo(file);

      setLocalMeta(prev => [...prev, { id: enviado.id, name: enviado.name, size: enviado.size, type: enviado.type }]);
      onAttachmentsChange([...attachmentIds, enviado.id]);
      toast({ title: "Anexo carregado", description: `"${enviado.name}" anexado com sucesso` });
      // Depois de guardado, quem chamou pode ler o conteúdo (ex.: voucher que
      // preenche a passagem). Falha aqui não desfaz o anexo.
      try { await onFileSelected?.(file); } catch { /* quem trata é o chamador */ }
    } catch (error) {
      toast({ title: "Erro no upload", description: apiErrorMessage(error, "Não foi possível carregar o anexo. Tente de novo."), variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setLocalMeta(prev => prev.filter(m => m.id !== id));
    onAttachmentsChange(attachmentIds.filter(a => a !== id));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getIcon = (type: string) => {
    if (type.startsWith('image/')) return <FileImage className="w-3.5 h-3.5 text-primary" />;
    if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) {
      return <FileSpreadsheet className="w-3.5 h-3.5 text-success" />;
    }
    return <FileText className="w-3.5 h-3.5 text-danger-strong" />;
  };

  const displayedIds = attachmentIds;
  const knownIds = new Set(localMeta.map(m => m.id));
  const unknownIds = displayedIds.filter(id => !knownIds.has(id));

  return (
    <div className="space-y-2">
      {/* Lista de anexos com nome */}
      {localMeta.filter(m => displayedIds.includes(m.id)).map(meta => (
        <div key={meta.id} className="flex items-center gap-2 px-2.5 py-2 bg-surface-muted border border-border rounded-lg">
          {getIcon(meta.type)}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{meta.name}</p>
            <p className="text-2xs text-muted-foreground">{formatSize(meta.size)}</p>
          </div>
          {!disabled && (
            <button type="button" onClick={() => removeAttachment(meta.id)}
              className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-danger-strong hover:bg-danger-soft transition-colors shrink-0">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}

      {/* IDs sem metadata (carregados anteriormente) */}
      {unknownIds.map((id, i) => (
        <div key={id} className="flex items-center gap-2 px-2.5 py-2 bg-surface-muted border border-border rounded-lg">
          <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground flex-1 truncate">Anexo {i + 1}</p>
          {!disabled && (
            <button type="button" onClick={() => removeAttachment(id)}
              className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-danger-strong hover:bg-danger-soft transition-colors shrink-0">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}

      {/* Botão de upload */}
      {!disabled && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv"
            onChange={handleFileSelect}
            disabled={isUploading}
            className="hidden"
            data-testid="input-attachment-file"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            data-testid="button-add-attachment"
            className="w-full flex items-center justify-center gap-2 h-8 border border-dashed border-slate-300 rounded-lg text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {isUploading ? "Enviando..." : "Adicionar arquivo"}
          </button>
          <p className="text-2xs text-muted-foreground">{TEXTO_TIPOS_ACEITOS} · máx. 10 MB</p>
        </>
      )}
    </div>
  );
}
