import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Paperclip, X, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  title = "📎 Anexos"
}: AttachmentUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  console.log("🔍 DEBUG ATTACHMENT COMPONENT: Renderizando com", attachmentIds.length, "anexos:", attachmentIds);
  

  const generateAttachmentId = () => {
    return `ATT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Tipo de arquivo inválido",
        description: "Apenas PDF, JPG e PNG são permitidos",
        variant: "destructive",
      });
      return;
    }

    // Validar tamanho (5MB máximo)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // 1. Obter URL de upload do servidor
      const uploadResponse = await fetch('/api/attachments/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Erro ao obter URL de upload');
      }
      
      const { attachmentId, uploadURL } = await uploadResponse.json();
      
      // 2. Fazer upload do arquivo para o object storage
      const fileUploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });
      
      if (!fileUploadResponse.ok) {
        throw new Error('Erro ao fazer upload do arquivo');
      }
      
      // 3. Confirmar upload e obter metadata do arquivo
      const confirmResponse = await fetch(`/api/attachments/${attachmentId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        }),
      });
      
      if (!confirmResponse.ok) {
        throw new Error('Erro ao confirmar upload do arquivo');
      }
      
      // 4. Adicionar ID do anexo à lista
      const updatedIds = [...attachmentIds, attachmentId];
      console.log("🔍 DEBUG UPLOAD: Chamando onAttachmentsChange com:", updatedIds);
      onAttachmentsChange(updatedIds);
      
      toast({
        title: "Anexo carregado",
        description: `Arquivo "${file.name}" anexado com sucesso ao storage`,
      });
    } catch (error) {
      console.error('Erro no upload:', error);
      toast({
        title: "Erro no upload",
        description: error instanceof Error ? error.message : "Erro ao carregar o anexo",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Limpar o input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeAttachment = (attachmentToRemove: string) => {
    const updatedIds = attachmentIds.filter(id => id !== attachmentToRemove);
    onAttachmentsChange(updatedIds);
    toast({
      title: "Anexo removido",
      description: "O anexo foi removido com sucesso",
    });
  };

  const clearAllAttachments = () => {
    onAttachmentsChange([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast({
      title: "Anexos removidos",
      description: "Todos os anexos foram removidos",
    });
  };

  return (
    <div className="space-y-3 p-4 border-2 border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-950/20">
      <div className="flex items-center justify-between">
        <Label className="text-lg font-semibold text-blue-700 dark:text-blue-300">{title}</Label>
        {attachmentIds.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAllAttachments}
            disabled={disabled}
            className="text-red-600 hover:text-red-700 text-xs"
            data-testid="button-clear-all-attachments"
          >
            Remover todos
          </Button>
        )}
      </div>
      
      {/* Lista de anexos existentes */}
      {attachmentIds.map((attachmentId, index) => (
        <div key={attachmentId} className="flex items-center gap-2 p-2 border rounded-md bg-green-50 dark:bg-green-900/20">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          <div className="flex-1">
            <span className="text-sm font-mono text-green-700 dark:text-green-300" data-testid={`text-attachment-id-${index}`}>
              ID: {attachmentId}
            </span>
            <div className="text-xs text-green-600 dark:text-green-400">
              Anexo {index + 1} de {attachmentIds.length}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeAttachment(attachmentId)}
            disabled={disabled}
            data-testid={`button-remove-attachment-${index}`}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}

      {/* Campo para adicionar novo anexo */}
      <div className="flex items-center gap-2">
        <Input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileSelect}
          disabled={disabled || isUploading}
          className="flex-1"
          data-testid="input-attachment-file"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          data-testid="button-add-attachment"
        >
          <Paperclip className="h-4 w-4" />
          {isUploading ? "Carregando..." : "Adicionar Anexo"}
        </Button>
      </div>
      
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Formatos: PDF, JPG, PNG. Tamanho máximo: 5MB por arquivo. Você pode adicionar múltiplos anexos.
      </p>
    </div>
  );
}