/**
 * Exportar as prestações aprovadas SEM OC (28/10 — o "Plano B" do slide 12
 * enquanto o M4 não tem layout de importação). O arquivo leva o CPF
 * COMPLETO: a rota é só do DP e o download fica na auditoria (sem o CPF). O
 * mesmo arquivo, com a coluna "Nº da OC" preenchida, volta pelo lote.
 */
import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { baixarExportacao } from "./use-ordens-de-compra";

export function DialogoExportar({ aberto, eventId, semOc, onClose }: {
  aberto: boolean;
  eventId: string;
  /** Quantas aprovadas estão sem OC (e emitem NF) — as linhas do arquivo. */
  semOc: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [formato, setFormato] = useState<"csv" | "xlsx">("xlsx");
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (aberto) { setErro(null); setBaixando(false); } }, [aberto]);

  const baixar = async () => {
    setErro(null);
    setBaixando(true);
    try {
      const nome = await baixarExportacao(eventId, formato);
      toast({ variant: "success", title: "Arquivo baixado", description: `${nome} · o download ficou registrado na auditoria.` });
      onClose();
    } catch (e) {
      setErro(apiErrorMessage(e, "Não foi possível exportar."));
    } finally {
      setBaixando(false);
    }
  };

  const opcao = (v: "csv" | "xlsx", titulo: string, sub: string, Icone: typeof FileText) => (
    <label key={v} className={cn("prs-opcao", formato === v && "prs-opcao-on")}>
      <input type="radio" name="oc-formato" value={v} checked={formato === v} onChange={() => setFormato(v)} className="mt-1 accent-[var(--primary)]" data-testid={`oc-formato-${v}`} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground"><Icone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{titulo}</span>
        <span className="block text-xs leading-5 text-muted-foreground">{sub}</span>
      </span>
    </label>
  );

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !baixando) onClose(); }}>
      <DialogContent className="prs-dialogo max-w-[500px] gap-0 p-0" data-testid="oc-dialogo-exportar">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <Download className="h-4 w-4 text-primary" aria-hidden="true" />Exportar aprovadas sem OC
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {semOc === 1 ? "1 prestação aprovada" : `${semOc} prestações aprovadas`} pela Conferência DP e ainda sem OC: colaborador, CPF, CNPJ emissor, razão social, situação do contrato, função, valor e centro de custo — para gerar as OCs no M4.
          </DialogDescription>
        </DialogHeader>
        <div className="prs-dialogo-corpo space-y-3 px-6 py-5">
          <div className="grid gap-2">
            {opcao("xlsx", "Planilha do Excel (.xlsx)", "Valores como número; abre direto no Excel.", FileSpreadsheet)}
            {opcao("csv", "CSV (;)", "Texto separado por ponto e vírgula — o formato que volta pelo lote.", FileText)}
          </div>
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft/60 px-3.5 py-3" role="note" data-testid="oc-aviso-cpf">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden="true" />
            <p className="m-0 text-xs leading-5 text-slate-700">
              <span className="font-semibold text-warning">O arquivo tem o CPF completo.</span> Guarde só onde o DP tem acesso e apague depois de gerar as OCs. O download fica registrado no log de auditoria com o seu nome.
            </p>
          </div>
          <p className="m-0 text-2xs leading-4 text-muted-foreground">Para registrar as OCs de volta: preencha a coluna “Nº da OC” (valor e data são opcionais) e suba o arquivo em “Registrar em lote”.</p>
          {erro && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
        </div>
        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={baixando}>Cancelar</Button>
          <Button type="button" onClick={baixar} disabled={baixando || semOc === 0} data-testid="oc-baixar">
            {baixando ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            {baixando ? "Gerando…" : `Baixar ${formato.toUpperCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
