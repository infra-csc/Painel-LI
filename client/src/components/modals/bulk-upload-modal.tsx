import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  FileText,
  Check,
  X,
  AlertCircle,
  Download,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BulkUploadModalProps {
  open: boolean;
  onClose: () => void;
}

interface ParsedCollaborator {
  fullName: string;
  documentType: string;
  document: string;
  phone?: string;
  city: string;
  birthDate: string;
  type: string;
  area: string;
  isValid: boolean;
  errors: string[];
}

interface BulkUploadResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  errors: Array<{
    row: number;
    name: string;
    error: string;
  }>;
}

export default function BulkUploadModal({ open, onClose }: BulkUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedCollaborator[]>([]);
  const [uploadResult, setUploadResult] = useState<BulkUploadResult | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      parseCSV(selectedFile);
    } else {
      toast({
        title: "Erro",
        description: "Por favor, selecione um arquivo CSV válido",
        variant: "destructive",
      });
    }
  };

  const parseCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      toast({
        title: "Erro",
        description: "O arquivo deve conter pelo menos uma linha de dados",
        variant: "destructive",
      });
      return;
    }

    // Espera cabeçalho: Nome,Tipo,Documento,Telefone,Cidade,DataNasc
    const headers = lines[0].split(',').map(h => h.trim());
    const expectedHeaders = ['Nome', 'Tipo', 'Documento', 'Telefone', 'Cidade', 'DataNasc'];
    
    // Validar cabeçalho
    const headerMatch = expectedHeaders.every((header, index) => 
      headers[index]?.toLowerCase() === header.toLowerCase()
    );
    
    if (!headerMatch) {
      toast({
        title: "Erro no cabeçalho",
        description: `O cabeçalho deve ser: ${expectedHeaders.join(', ')}`,
        variant: "destructive",
      });
      return;
    }
    
    const parsed: ParsedCollaborator[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const errors: string[] = [];
      
      // Função para converter data DD/MM/AAAA para YYYY-MM-DD
      const convertDate = (dateStr: string) => {
        if (!dateStr) return '';
        const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!match) return '';
        const [, day, month, year] = match;
        return `${year}-${month}-${day}`;
      };

      // Validações básicas
      if (!values[0]) errors.push('Nome é obrigatório');
      if (!values[1] || !['casa', 'freela', 'local'].includes(values[1].toLowerCase())) {
        errors.push('Tipo deve ser: CASA, FREELA ou LOCAL');
      }
      if (!values[2]) errors.push('Número do RG é obrigatório');
      // Telefone é opcional agora
      if (!values[4]) errors.push('Cidade é obrigatória');
      if (!values[5] || !values[5].match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        errors.push('Data de nascimento deve estar no formato DD/MM/AAAA');
      }

      const convertedDate = convertDate(values[5] || '');
      
      parsed.push({
        fullName: values[0] || '',
        type: values[1]?.toLowerCase() || '',
        documentType: 'rg', // sempre RG
        document: values[2] || '',
        phone: values[3] || undefined,
        city: values[4] || '',
        birthDate: convertedDate, // já convertida para YYYY-MM-DD
        area: 'Geral', // padrão
        isValid: errors.length === 0,
        errors
      });
    }

    setParsedData(parsed);
    setStep('preview');
  };

  const bulkUploadMutation = useMutation({
    mutationFn: async (collaborators: ParsedCollaborator[]) => {
      const validCollaborators = collaborators.filter(c => c.isValid);
      const response = await apiRequest("POST", "/api/collaborators/bulk", {
        collaborators: validCollaborators
      });
      return response.json();
    },
    onSuccess: (result: BulkUploadResult) => {
      setUploadResult(result);
      setStep('result');
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      toast({
        title: "Upload Concluído",
        description: `${result.successful} colaboradores importados com sucesso`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro no upload",
        description: "Ocorreu um erro durante o upload dos colaboradores",
        variant: "destructive",
      });
    },
  });

  const handleConfirmUpload = () => {
    bulkUploadMutation.mutate(parsedData);
  };

  const handleClose = () => {
    setFile(null);
    setParsedData([]);
    setUploadResult(null);
    setStep('upload');
    onClose();
  };

  const downloadTemplate = () => {
    const csvContent = "Nome,Tipo,Documento,Telefone,Cidade,DataNasc\n" +
      "João Silva,casa,123456789,11999999999,São Paulo,15/01/1990\n" +
      "Maria Santos,freela,987654321,11888888888,Rio de Janeiro,22/03/1985\n" +
      "Pedro Costa,local,456789123,,Belo Horizonte,10/07/1992";
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_colaboradores.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const validCount = parsedData.filter(p => p.isValid).length;
  const invalidCount = parsedData.length - validCount;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Importar Colaboradores em Lote
          </DialogTitle>
          <DialogDescription>
            Faça upload de um arquivo CSV com os dados dos colaboradores
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="border-2 border-dashed border-border rounded-lg p-8">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">Selecione seu arquivo CSV</p>
                <p className="text-muted-foreground mb-4">
                  O arquivo deve conter as colunas especificadas no modelo
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-csv-file"
                />
                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2"
                    data-testid="button-select-csv"
                  >
                    <Upload className="w-4 h-4" />
                    Selecionar Arquivo
                  </Button>
                  <Button
                    variant="outline"
                    onClick={downloadTemplate}
                    className="flex items-center gap-2"
                    data-testid="button-download-template"
                  >
                    <Download className="w-4 h-4" />
                    Baixar Modelo
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Formato do arquivo CSV:</h4>
              <p className="text-sm text-muted-foreground mb-2">
                O arquivo deve conter as seguintes colunas (nesta ordem):
              </p>
              <code className="text-xs bg-background p-2 rounded block">
                Nome,Tipo,Documento,Telefone,Cidade,DataNasc
              </code>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                <li>• <strong>Tipo:</strong> CASA, FREELA ou LOCAL</li>
                <li>• <strong>Documento:</strong> número do RG (tipo RG é automático)</li>
                <li>• <strong>DataNasc:</strong> formato DD/MM/AAAA</li>
                <li>• <strong>Telefone:</strong> opcional</li>
              </ul>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-4">
                <Badge variant="default" className="bg-green-100 text-green-800">
                  {validCount} válidos
                </Badge>
                {invalidCount > 0 && (
                  <Badge variant="destructive">
                    {invalidCount} inválidos
                  </Badge>
                )}
              </div>
              {file && (
                <p className="text-sm text-muted-foreground">
                  Arquivo: {file.name}
                </p>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-left">RG</th>
                    <th className="p-2 text-left">Telefone</th>
                    <th className="p-2 text-left">Cidade</th>
                    <th className="p-2 text-left">Data Nasc</th>
                    <th className="p-2 text-left">Erros</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedData.map((item, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2">
                        {item.isValid ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <X className="w-4 h-4 text-red-500" />
                        )}
                      </td>
                      <td className="p-2">{item.fullName}</td>
                      <td className="p-2 uppercase">{item.type}</td>
                      <td className="p-2">{item.document}</td>
                      <td className="p-2">{item.phone || 'N/A'}</td>
                      <td className="p-2">{item.city}</td>
                      <td className="p-2">{item.birthDate}</td>
                      <td className="p-2">
                        {item.errors.length > 0 && (
                          <div className="text-xs text-red-600">
                            {item.errors.join(', ')}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setStep('upload')}>
                Voltar
              </Button>
              <Button
                onClick={handleConfirmUpload}
                disabled={validCount === 0 || bulkUploadMutation.isPending}
                data-testid="button-confirm-upload"
              >
                {bulkUploadMutation.isPending ? 'Processando...' : `Importar ${validCount} Colaboradores`}
              </Button>
            </div>
          </div>
        )}

        {step === 'result' && uploadResult && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium mb-2">Upload Concluído!</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">{uploadResult.totalProcessed}</div>
                  <div className="text-sm text-muted-foreground">Processados</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{uploadResult.successful}</div>
                  <div className="text-sm text-muted-foreground">Sucessos</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">{uploadResult.failed}</div>
                  <div className="text-sm text-muted-foreground">Falhas</div>
                </div>
              </div>
            </div>

            {uploadResult.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-medium text-red-800 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Erros encontrados:
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {uploadResult.errors.map((error, index) => (
                    <div key={index} className="text-sm text-red-700">
                      Linha {error.row} ({error.name}): {error.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center">
              <Button onClick={handleClose} data-testid="button-close-result">
                Fechar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}