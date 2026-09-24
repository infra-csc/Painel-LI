import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Upload, FileText, Check, X, AlertCircle, Download, Loader2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
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
  errors: Array<{ row: number; name: string; error: string }>;
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

/**
 * Divide uma linha CSV respeitando aspas: `"São Paulo, SP"` é UMA célula, e
 * `""` dentro de aspas vira uma aspa literal. Aceita `,` ou `;` como separador
 * (Excel em pt-BR salva com `;`).
 */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(v => v.trim());
}

/** Detecta o separador pela linha de cabeçalho (`;` se houver mais `;` que `,`). */
export function detectSeparator(headerLine: string): string {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis  = (headerLine.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

const EXPECTED_HEADERS = ["Nome", "Tipo", "Documento", "Telefone", "Cidade", "DataNasc"];
const ALT_HEADERS      = ["Nome", "Tipo", "Documento", "Telefone", "Cidade", "Data Nascimento"];

// Converte DD/MM/AAAA → YYYY-MM-DD
function convertDate(dateStr: string) {
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export default function BulkUploadModal({ open, onClose }: BulkUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedCollaborator[]>([]);
  const [uploadResult, setUploadResult] = useState<BulkUploadResult | null>(null);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    // Permite reselecionar o mesmo arquivo depois de "Voltar"
    event.target.value = "";
    if (!selectedFile) return;
    // Pelo nome, não pelo MIME: o Windows/Excel manda "application/vnd.ms-excel"
    // ou vazio para .csv, e o filtro por type recusava arquivos válidos.
    if (!/\.csv$/i.test(selectedFile.name)) {
      toast({ title: "Arquivo inválido", description: "Selecione um arquivo com extensão .csv", variant: "destructive" });
      return;
    }
    setFile(selectedFile);
    parseCSV(selectedFile);
  };

  const parseCSV = async (file: File) => {
    const text = (await file.text()).replace(/^\uFEFF/, ""); // remove BOM do Excel
    const lines = text.split(/\r?\n/).filter(line => line.trim());

    if (lines.length < 2) {
      toast({ title: "Arquivo vazio", description: "O arquivo deve conter o cabeçalho e pelo menos uma linha de dados.", variant: "destructive" });
      return;
    }

    const sep = detectSeparator(lines[0]);
    const headers = splitCsvLine(lines[0], sep);
    const matches = (expected: string[]) => expected.every((h, i) => headers[i]?.toLowerCase() === h.toLowerCase());
    if (!matches(EXPECTED_HEADERS) && !matches(ALT_HEADERS)) {
      toast({
        title: "Cabeçalho inválido",
        description: `O cabeçalho deve ser: ${EXPECTED_HEADERS.join(", ")} (ou "Data Nascimento" na última coluna).`,
        variant: "destructive",
      });
      return;
    }

    const parsed: ParsedCollaborator[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = splitCsvLine(lines[i], sep);
      const errors: string[] = [];

      // Linhas sem nome são ignoradas silenciosamente
      if (!values[0]) continue;

      const type = (values[1] || "").toLowerCase();
      if (type && !["casa", "freela", "local"].includes(type)) {
        errors.push("Tipo deve ser CASA, FREELA ou LOCAL (ou vazio)");
      }
      const rawDate = values[5] || "";
      if (rawDate && !/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
        errors.push("Data de nascimento deve estar no formato DD/MM/AAAA (ou vazio)");
      }

      parsed.push({
        fullName: values[0],
        type: type || "freela",
        documentType: "rg",
        document: values[2] || "",
        phone: values[3] || undefined,
        city: values[4] || "",
        birthDate: rawDate ? convertDate(rawDate) : "",
        area: "Geral",
        isValid: errors.length === 0,
        errors,
      });
    }

    if (parsed.length === 0) {
      toast({ title: "Nenhuma linha válida", description: "Nenhuma linha com nome foi encontrada no arquivo.", variant: "destructive" });
      return;
    }

    setParsedData(parsed);
    setStep("preview");
  };

  const bulkUploadMutation = useMutation({
    mutationFn: async (collaborators: ParsedCollaborator[]) => {
      const validCollaborators = collaborators.filter(c => c.isValid);
      // Identidade e papel vêm da sessão no servidor (não do corpo)
      const response = await apiRequest("POST", "/api/collaborators/bulk", { collaborators: validCollaborators });
      return response.json() as Promise<BulkUploadResult>;
    },
    onSuccess: (result) => {
      setUploadResult(result);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      toast({
        title: "Importação concluída",
        description: `${result.successful} colaborador${result.successful === 1 ? "" : "es"} importado${result.successful === 1 ? "" : "s"}${result.failed ? `, ${result.failed} com erro` : ""}.`,
      });
    },
    onError: (err: unknown) => {
      toast({ title: "Erro na importação", description: apiErrorMessage(err, "Ocorreu um erro durante a importação dos colaboradores."), variant: "destructive" });
    },
  });

  const handleClose = () => {
    if (bulkUploadMutation.isPending) return;
    setFile(null);
    setParsedData([]);
    setUploadResult(null);
    setStep("upload");
    onClose();
  };

  const downloadTemplate = () => {
    const csvContent = "Nome,Tipo,Documento,Telefone,Cidade,DataNasc\n" +
      "João Silva,casa,123456789,11999999999,\"São Paulo, SP\",15/01/1990\n" +
      "Maria Santos,freela,987654321,11888888888,Rio de Janeiro,22/03/1985\n" +
      "Pedro Costa,local,456789123,,Belo Horizonte,10/07/1992";
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo_colaboradores.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const validCount = parsedData.filter(p => p.isValid).length;
  const invalidCount = parsedData.length - validCount;

  const subtitle =
    step === "upload"  ? "Envie um arquivo CSV com os dados dos colaboradores" :
    step === "preview" ? `Revise as linhas antes de importar${file ? ` — ${file.name}` : ""}` :
                         "Resultado da importação";

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent
        className="p-0 gap-0 sm:max-w-[820px] rounded-xl border-0 shadow-3 overflow-hidden [&>button:last-child]:hidden max-h-[90vh] flex flex-col"
        data-testid="modal-bulk-upload"
      >
        {/* Header — mesmo padrão do modal de colaborador */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-primary shadow-2"
          >
            <Upload className="w-4 h-4 text-white" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-sm font-bold text-foreground leading-tight">Importar colaboradores em lote</DialogTitle>
            <DialogDescription className="text-2xs text-muted-foreground mt-0.5 truncate">{subtitle}</DialogDescription>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            disabled={bulkUploadMutation.isPending}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-slate-600 hover:bg-muted disabled:opacity-40 transition-colors"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          {step === "upload" && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-surface-muted/50">
                <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-semibold text-slate-700 mb-1">Selecione seu arquivo CSV</p>
                <p className="text-xs text-muted-foreground mb-4">O arquivo deve conter as colunas especificadas no modelo</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-csv-file"
                />
                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 h-9 px-4 text-primary-foreground text-xs font-semibold rounded-lg transition-all bg-primary hover:bg-primary-hover"
                    data-testid="button-select-csv"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" /> Selecionar Arquivo
                  </button>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="flex items-center gap-1.5 h-9 px-4 text-xs font-medium text-slate-600 border border-border bg-card rounded-lg hover:bg-surface-muted transition-colors"
                    data-testid="button-download-template"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" /> Baixar Modelo
                  </button>
                </div>
              </div>

              <div className="bg-surface-muted border border-border rounded-xl p-4">
                <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Formato do arquivo CSV</p>
                <p className="text-xs text-muted-foreground mb-2">Colunas, nesta ordem (separador vírgula ou ponto-e-vírgula):</p>
                <code className="text-2xs font-mono bg-card border border-border px-2.5 py-1.5 rounded-lg block text-slate-700">
                  Nome,Tipo,Documento,Telefone,Cidade,DataNasc
                </code>
                <ul className="text-xs text-muted-foreground mt-2.5 space-y-1">
                  <li>• <strong className="text-slate-600">Tipo:</strong> CASA, FREELA ou LOCAL (vazio = FREELA)</li>
                  <li>• <strong className="text-slate-600">Documento:</strong> número do RG (tipo RG é automático)</li>
                  <li>• <strong className="text-slate-600">DataNasc:</strong> formato DD/MM/AAAA</li>
                  <li>• <strong className="text-slate-600">Telefone:</strong> opcional</li>
                  <li>• Valores com vírgula devem vir entre aspas: <span className="font-mono">"São Paulo, SP"</span></li>
                </ul>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className="bg-success-soft text-success border border-success/25 hover:bg-success-soft">
                  {validCount} válido{validCount !== 1 ? "s" : ""}
                </Badge>
                {invalidCount > 0 && (
                  <Badge className="bg-danger-soft text-danger border border-danger/25 hover:bg-danger-soft">
                    {invalidCount} inválido{invalidCount !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>

              <div className="max-h-72 overflow-auto border border-border rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-surface-muted sticky top-0">
                    <tr className="text-2xs font-bold tracking-widest text-muted-foreground uppercase">
                      <th scope="col" className="px-3 py-2.5 text-left">Status</th>
                      <th scope="col" className="px-3 py-2.5 text-left">Nome</th>
                      <th scope="col" className="px-3 py-2.5 text-left">Tipo</th>
                      <th scope="col" className="px-3 py-2.5 text-left">RG</th>
                      <th scope="col" className="px-3 py-2.5 text-left">Telefone</th>
                      <th scope="col" className="px-3 py-2.5 text-left">Cidade</th>
                      <th scope="col" className="px-3 py-2.5 text-left">Nascimento</th>
                      <th scope="col" className="px-3 py-2.5 text-left">Erros</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsedData.map((item, index) => (
                      <tr key={index} className={item.isValid ? "" : "bg-danger-soft/40"}>
                        <td className="px-3 py-2">
                          {item.isValid
                            ? <Check className="w-3.5 h-3.5 text-success-strong" aria-label="Válido" />
                            : <X className="w-3.5 h-3.5 text-danger-strong" aria-label="Inválido" />}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-700">{item.fullName}</td>
                        <td className="px-3 py-2 uppercase text-muted-foreground">{item.type}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{item.document || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.phone || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.city || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.birthDate || "—"}</td>
                        <td className="px-3 py-2 text-danger">{item.errors.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === "result" && uploadResult && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="w-14 h-14 bg-success-soft rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="w-7 h-7 text-success" strokeWidth={3} aria-hidden="true" />
                </div>
                <h3 className="text-sm font-bold text-foreground mb-4">Importação concluída</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Processados", value: uploadResult.totalProcessed, cls: "text-slate-700" },
                    { label: "Importados",  value: uploadResult.successful,     cls: "text-success" },
                    { label: "Com erro",    value: uploadResult.failed,         cls: "text-danger" },
                  ].map(c => (
                    <div key={c.label} className="bg-surface-muted border border-border rounded-xl py-3">
                      <div className={`text-2xl font-bold ${c.cls}`}>{c.value}</div>
                      <div className="text-2xs font-bold uppercase tracking-widest text-muted-foreground mt-0.5">{c.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {uploadResult.errors.length > 0 && (
                <div className="bg-danger-soft border border-danger/25 rounded-xl p-4">
                  <p className="text-xs font-bold text-danger mb-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> Linhas com erro
                  </p>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {uploadResult.errors.map((error, index) => (
                      <div key={index} className="text-xs text-danger">
                        Linha {error.row} ({error.name}): {error.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border bg-surface-muted/50 shrink-0 flex items-center justify-end gap-2">
          {step === "upload" && (
            <button type="button" onClick={handleClose}
              className="h-9 px-4 text-xs font-medium text-slate-600 border border-border rounded-lg hover:bg-muted transition-colors">
              Cancelar
            </button>
          )}
          {step === "preview" && (
            <>
              <button type="button" onClick={() => { setStep("upload"); setParsedData([]); setFile(null); }}
                disabled={bulkUploadMutation.isPending}
                className="h-9 px-4 text-xs font-medium text-slate-600 border border-border rounded-lg hover:bg-muted disabled:opacity-60 transition-colors">
                Voltar
              </button>
              <button
                type="button"
                onClick={() => bulkUploadMutation.mutate(parsedData)}
                disabled={validCount === 0 || bulkUploadMutation.isPending}
                className="flex items-center gap-1.5 h-9 px-5 text-primary-foreground text-xs font-semibold rounded-lg transition-all disabled:opacity-60 bg-primary hover:bg-primary-hover"
                data-testid="button-confirm-upload"
              >
                {bulkUploadMutation.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Importando…</>
                  : <><Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" /> Importar {validCount} colaborador{validCount !== 1 ? "es" : ""}</>}
              </button>
            </>
          )}
          {step === "result" && (
            <button
              type="button"
              onClick={handleClose}
              className="flex items-center gap-1.5 h-9 px-5 text-primary-foreground text-xs font-semibold rounded-lg transition-all bg-primary hover:bg-primary-hover"
              data-testid="button-close-result"
            >
              Fechar
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
