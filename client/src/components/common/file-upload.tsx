import { useState, useRef } from 'react';
import { Upload, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface UploadedFile {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

interface FileUploadProps {
  onUpload: (files: UploadedFile[]) => void;
  onRemove: (fileId: string) => void;
  uploadedFiles?: UploadedFile[];
  multiple?: boolean;
  accept?: string;
  maxSize?: number; // em MB
  disabled?: boolean;
  className?: string;
}

export function FileUpload({
  onUpload,
  onRemove,
  uploadedFiles = [],
  multiple = false,
  accept = '*',
  maxSize = 10,
  disabled = false,
  className = ''
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length === 0) return;

    // Validar tamanho dos arquivos
    const oversizedFiles = files.filter(file => file.size > maxSize * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      toast({
        title: 'Arquivo muito grande',
        description: `Alguns arquivos excedem o limite de ${maxSize}MB`,
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    
    try {
      // Upload para object storage
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Erro no upload');
      }

      const uploadedFiles: UploadedFile[] = await response.json();
      onUpload(uploadedFiles);

      toast({
        title: 'Upload realizado',
        description: `${files.length} arquivo(s) enviado(s) com sucesso`,
      });

    } catch (error) {
      console.error('Erro no upload:', error);
      toast({
        title: 'Erro no upload',
        description: 'Não foi possível enviar os arquivos. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (disabled) return;
    
    const files = Array.from(event.dataTransfer.files);
    
    // Simular o evento de mudança do input
    if (fileInputRef.current && files.length > 0) {
      const dt = new DataTransfer();
      files.forEach(file => dt.items.add(file));
      fileInputRef.current.files = dt.files;
      
      handleFileSelect({ target: fileInputRef.current } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.includes('pdf')) return '📄';
    if (type.includes('word') || type.includes('doc')) return '📝';
    if (type.includes('excel') || type.includes('sheet')) return '📊';
    return '📎';
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Área de upload */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${disabled ? 'border-muted bg-muted/30' : 'border-muted-foreground/25 hover:border-primary/50'}
          ${uploading ? 'bg-muted/50' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          multiple={multiple}
          accept={accept}
          disabled={disabled || uploading}
          className="hidden"
          data-testid="input-file-upload"
        />
        
        <div className="flex flex-col items-center gap-2">
          <Upload className={`w-8 h-8 ${disabled ? 'text-muted-foreground' : 'text-muted-foreground'}`} />
          
          {uploading ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">Enviando arquivos...</span>
            </div>
          ) : (
            <>
              <div className="text-sm text-muted-foreground">
                Arraste arquivos aqui ou{' '}
                <Button
                  variant="link"
                  className="p-0 h-auto text-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  data-testid="button-select-files"
                >
                  clique para selecionar
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Tamanho máximo: {maxSize}MB {multiple && '• Múltiplos arquivos permitidos'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lista de arquivos enviados */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Arquivos anexados:</div>
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-2 bg-muted/50 rounded-md group"
              data-testid={`file-item-${file.id}`}
            >
              <span className="text-lg">{getFileIcon(file.type)}</span>
              
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`button-view-${file.id}`}
                >
                  <a href={file.url} target="_blank" rel="noopener noreferrer">
                    <FileText className="w-4 h-4" />
                  </a>
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(file.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                  disabled={disabled}
                  data-testid={`button-remove-${file.id}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}