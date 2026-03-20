import { useState, useRef } from "react";
import { Paperclip, X, Upload, FileText, FileImage } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AttachmentMeta {
  id: string;
  name: string;
  size: number;
  type: string;
}

interface AttachmentUploadProps {
  attachmentIds?: string[];
  onAttachmentsChange: (attachmentIds: string[]) => void;
  disabled?: boolean;
  title?: string;
}

export default function AttachmentUpload({
  attachmentIds = [],
  onAttachmentsChange,
  disabled = false,
}: AttachmentUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [localMeta, setLocalMeta] = useState<AttachmentMeta[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Tipo inválido", description: "Apenas PDF, JPG e PNG são permitidos", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 5MB por arquivo", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const uploadResponse = await fetch('/api/attachments/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!uploadResponse.ok) throw new Error('Erro ao obter URL de upload');
      const { attachmentId, uploadURL } = await uploadResponse.json();

      const fileUploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!fileUploadResponse.ok) throw new Error('Erro ao fazer upload do arquivo');

      const confirmResponse = await fetch(`/api/attachments/${attachmentId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size }),
      });
      if (!confirmResponse.ok) throw new Error('Erro ao confirmar upload');

      setLocalMeta(prev => [...prev, { id: attachmentId, name: file.name, size: file.size, type: file.type }]);
      onAttachmentsChange([...attachmentIds, attachmentId]);
      toast({ title: "Anexo carregado", description: `"${file.name}" anexado com sucesso` });
    } catch (error) {
      toast({ title: "Erro no upload", description: error instanceof Error ? error.message : "Erro ao carregar", variant: "destructive" });
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
    if (type.startsWith('image/')) return <FileImage className="w-3.5 h-3.5 text-blue-500" />;
    return <FileText className="w-3.5 h-3.5 text-red-400" />;
  };

  const displayedIds = attachmentIds;
  const knownIds = new Set(localMeta.map(m => m.id));
  const unknownIds = displayedIds.filter(id => !knownIds.has(id));

  return (
    <div className="space-y-2">
      {/* Lista de anexos com nome */}
      {localMeta.filter(m => displayedIds.includes(m.id)).map(meta => (
        <div key={meta.id} className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg">
          {getIcon(meta.type)}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{meta.name}</p>
            <p className="text-[10px] text-slate-400">{formatSize(meta.size)}</p>
          </div>
          {!disabled && (
            <button type="button" onClick={() => removeAttachment(meta.id)}
              className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}

      {/* IDs sem metadata (carregados anteriormente) */}
      {unknownIds.map((id, i) => (
        <div key={id} className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg">
          <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <p className="text-xs text-slate-500 flex-1 truncate">Anexo {i + 1}</p>
          {!disabled && (
            <button type="button" onClick={() => removeAttachment(id)}
              className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
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
            accept=".pdf,.jpg,.jpeg,.png"
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
            className="w-full flex items-center justify-center gap-2 h-8 border border-dashed border-slate-300 rounded-lg text-xs font-medium text-slate-500 hover:border-[#0033CC] hover:text-[#0033CC] hover:bg-blue-50/50 transition-all disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {isUploading ? "Carregando..." : "Adicionar arquivo"}
          </button>
          <p className="text-[10px] text-slate-400">PDF, JPG ou PNG · máx. 5MB</p>
        </>
      )}
    </div>
  );
}
