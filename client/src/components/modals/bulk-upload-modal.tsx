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

  // Os três passos à vista (07/10): a pessoa sabe onde está e quanto falta.
  const PASSOS = [
    { id: "upload", nome: "Arquivo" },
    { id: "preview", nome: "Revisão" },
    { id: "result", nome: "Resultado" },
  ] as const;
  const passoAtual = PASSOS.findIndex(p => p.id === step);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent
        className="p-0 gap-0 sm:max-w-[820px] rounded-xl overflow-hidden [&>button:last-child]:hidden max-h-[90vh] flex flex-col max-sm:w-full max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0"
        data-testid="modal-bulk-upload"
      >
        {/* Cabeçalho — o mesmo desenho do cadastro de colaborador */}
        <div className="flex items-start gap-3.5 px-5 sm:px-6 pt-4 pb-3.5 border-b border-border bg-card shrink-0">
          <div className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center shrink-0 bg-brand-soft text-primary">
            <Upload className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-semibold text-foreground leading-6">Importar colaboradores em lote</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5 sm:truncate">{subtitle}</DialogDescription>
            <ol className="mt-2.5 flex items-center gap-1.5" aria-label="Passos da importação">
              {PASSOS.map((p, i) => {
                const feito = i < passoAtual;
                const atual = i === passoAtual;
                return (
                  <li key={p.id} className="flex items-center gap-1.5" aria-current={atual ? "step" : undefined}>
                    {i > 0 && <span className={`w-5 h-px ${feito || atual ? "bg-primary/50" : "bg-border"}`} aria-hidden="true" />}
                    <span className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[10px] font-semibold tabular-nums transition-colors ${
                      feito ? "bg-primary text-primary-foreground" : atual ? "bg-brand-soft text-primary ring-1 ring-primary/40" : "bg-muted text-muted-foreground"}`}>
                      {feito ? <Check className="w-2.5 h-2.5" strokeWidth={3} aria-hidden="true" /> : i + 1}
                    </span>
                    <span className={`text-xs ${atual ? "font-medium text-foreground" : "text-muted-foreground"}`}>{p.nome}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            disabled={bulkUploadMutation.isPending}
            className="pas-alvo w-8 h-8 -mr-1.5 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div key={step} className="col-entra overflow-y-auto flex-1 min-h-0 px-5 sm:px-6 py-5">
          {step === "upload" && (
            <div className="space-y-4">
              <div className="border border-dashed border-slate-300 rounded-xl px-6 py-8 text-center bg-surface-muted/60">
                <span className="inline-flex w-11 h-11 items-center justify-center rounded-full bg-card border border-border text-primary mb-3" aria-hidden="true">
                  <FileText className="w-5 h-5" />
                </span>
                <p className="text-sm font-semibold text-foreground mb-1">Selecione o arquivo CSV</p>
                <p className="text-xs text-muted-foreground mb-4">Use o modelo: as colunas precisam estar na ordem dele.</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-csv-file"
                />
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="pas-alvo inline-flex items-center gap-1.5 h-9 px-4 text-primary-foreground text-sm font-semibold rounded-lg transition-colors bg-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    data-testid="button-select-csv"
                  >
                    <Upload className="w-4 h-4" aria-hidden="true" /> Selecionar arquivo
                  </button>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="pas-alvo inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-slate-700 border border-border bg-card rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="button-download-template"
                  >
                    <Download className="w-4 h-4" aria-hidden="true" /> Baixar modelo
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="m-0 mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Formato do arquivo</p>
                <p className="text-xs text-muted-foreground mb-2">Colunas, nesta ordem (separador vírgula ou ponto e vírgula):</p>
                <code className="block overflow-x-auto whitespace-nowrap text-xs font-mono bg-surface-muted border border-border px-2.5 py-1.5 rounded-lg text-slate-700">
                  Nome,Tipo,Documento,Telefone,Cidade,DataNasc
                </code>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  <div><dt className="inline font-medium text-slate-700">Tipo: </dt><dd className="inline text-muted-foreground">CASA, FREELA ou LOCAL (vazio = FREELA)</dd></div>
                  <div><dt className="inline font-medium text-slate-700">Documento: </dt><dd className="inline text-muted-foreground">número do RG (tipo RG é automático)</dd></div>
                  <div><dt className="inline font-medium text-slate-700">DataNasc: </dt><dd className="inline text-muted-foreground">formato DD/MM/AAAA</dd></div>
                  <div><dt className="inline font-medium text-slate-700">Telefone: </dt><dd className="inline text-muted-foreground">opcional</dd></div>
                  <div className="sm:col-span-2"><dt className="inline font-medium text-slate-700">Vírgula no valor: </dt><dd className="inline text-muted-foreground">entre aspas — <span className="font-mono">"São Paulo, SP"</span></dd></div>
                </dl>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-md bg-success-soft text-success border-0 hover:bg-success-soft font-medium">
                  {validCount} válido{validCount !== 1 ? "s" : ""}
                </Badge>
                {invalidCount > 0 && (
                  <Badge className="rounded-md bg-danger-soft text-danger border-0 hover:bg-danger-soft font-medium">
                    {invalidCount} inválido{invalidCount !== 1 ? "s" : ""} — não entra{invalidCount !== 1 ? "m" : ""}
                  </Badge>
                )}
              </div>

              <div className="max-h-[50vh] overflow-auto border border-border rounded-xl bg-card">
                <table className="w-full text-xs">
                  <thead className="bg-surface-muted sticky top-0 z-[1]">
                    <tr className="text-2xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                      <th scope="col" className="px-3 py-2.5 text-left w-8"><span className="sr-only">Status</span></th>
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
                        <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{item.fullName}</td>
                        <td className="px-3 py-2 uppercase text-muted-foreground">{item.type}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">{item.document || "—"}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{item.phone || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{item.city || "—"}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{item.birthDate || "—"}</td>
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
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${uploadResult.failed ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>
                  {uploadResult.failed ? <AlertCircle className="w-6 h-6" aria-hidden="true" /> : <Check className="w-6 h-6" strokeWidth={3} aria-hidden="true" />}
                </div>
                <h3 className="text-base font-semibold text-foreground mb-4">
                  {uploadResult.failed ? "Importação concluída com pendências" : "Importação concluída"}
                </h3>
                <div className="grid grid-cols-3 rounded-xl border border-border bg-card overflow-hidden">
                  {[
                    { label: "Processados", value: uploadResult.totalProcessed, cls: "text-foreground" },
                    { label: "Importados",  value: uploadResult.successful,     cls: "text-success" },
                    { label: "Com erro",    value: uploadResult.failed,         cls: uploadResult.failed ? "text-danger" : "text-muted-foreground" },
                  ].map((c, i) => (
                    <div key={c.label} className={`py-3 ${i > 0 ? "border-l border-border" : ""}`}>
                      <div className={`text-2xl font-semibold tabular-nums tracking-[-0.02em] ${c.cls}`}>{c.value}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{c.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {uploadResult.errors.length > 0 && (
                <div className="relative overflow-hidden rounded-xl border border-danger/25 bg-danger-soft/60 py-3 pl-4 pr-3.5">
                  <span className="absolute inset-y-0 left-0 w-[3px] bg-danger opacity-70" aria-hidden="true" />
                  <p className="text-[13px] font-semibold text-danger mb-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> Linhas com erro
                  </p>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {uploadResult.errors.map((error, index) => (
                      <div key={index} className="text-xs text-slate-700">
                        <span className="font-medium tabular-nums">Linha {error.row}</span> ({error.name}): {error.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 border-t border-border bg-surface-muted shrink-0 flex items-center justify-end gap-2">
          {step === "upload" && (
            <button type="button" onClick={handleClose}
              className="h-9 px-4 text-sm font-medium text-slate-700 border border-border bg-card rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Cancelar
            </button>
          )}
          {step === "preview" && (
            <>
              <button type="button" onClick={() => { setStep("upload"); setParsedData([]); setFile(null); }}
                disabled={bulkUploadMutation.isPending}
                className="h-9 px-4 text-sm font-medium text-slate-700 border border-border bg-card rounded-lg hover:bg-muted disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Voltar
              </button>
              <button
                type="button"
                onClick={() => bulkUploadMutation.mutate(parsedData)}
                disabled={validCount === 0 || bulkUploadMutation.isPending}
                className="inline-flex items-center gap-1.5 h-9 px-4 text-primary-foreground text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 bg-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                data-testid="button-confirm-upload"
              >
                {bulkUploadMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Importando…</>
                  : <><Check className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" /> Importar {validCount} colaborador{validCount !== 1 ? "es" : ""}</>}
              </button>
            </>
          )}
          {step === "result" && (
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center gap-1.5 h-9 px-5 text-primary-foreground text-sm font-semibold rounded-lg transition-colors bg-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
