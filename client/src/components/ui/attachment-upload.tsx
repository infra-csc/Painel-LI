import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Paperclip, X, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AttachmentUploadProps {
  attachmentId?: string;
  onAttachmentChange: (attachmentId: string | undefined) => void;
  disabled?: boolean;
}

export default function AttachmentUpload({ 
  attachmentId, 
  onAttachmentChange, 
  disabled = false 
}: AttachmentUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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
      // Simular upload (substituir pela integração real futuramente)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newAttachmentId = generateAttachmentId();
      onAttachmentChange(newAttachmentId);
      
      toast({
        title: "Anexo carregado",
        description: `Arquivo "${file.name}" anexado com sucesso`,
      });
    } catch (error) {
      toast({
        title: "Erro no upload",
        description: "Erro ao carregar o anexo",
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

  const removeAttachment = () => {
    onAttachmentChange(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast({
      title: "Anexo removido",
      description: "O anexo foi removido com sucesso",
    });
  };

  return (
    <div className="space-y-2">
      <Label>Anexo da Passagem</Label>
      
      {!attachmentId ? (
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
            data-testid="button-select-attachment"
          >
            <Paperclip className="h-4 w-4" />
            {isUploading ? "Carregando..." : "Anexar"}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-2 border rounded-md bg-green-50 dark:bg-green-900/20">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span className="flex-1 text-sm font-mono text-green-700 dark:text-green-300" data-testid="text-attachment-id">
            ID: {attachmentId}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={removeAttachment}
            disabled={disabled}
            data-testid="button-remove-attachment"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Formatos: PDF, JPG, PNG. Tamanho máximo: 5MB
      </p>
    </div>
  );
}