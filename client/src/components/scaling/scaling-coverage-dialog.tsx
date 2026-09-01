/**
 * "O que falta escalar", pronto para colar (01/09).
 *
 * A prévia mostra o texto exato que vai para a área de transferência — sem
 * "confie em mim, o arquivo sai certo". É o mesmo princípio do preview da
 * importação da planilha: quem vai mandar a mensagem lê antes de mandar.
 */
import { useMemo, useState } from "react";
import { Check, ClipboardCopy, Download } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TeamInclusion } from "@shared/schema";
import type { AnalyticsContext } from "./scaling-analytics-data";
import { montarRelatorioDeCobertura, nomeDoArquivo, textoDoRelatorio } from "./scaling-coverage-report";

export default function ScalingCoverageDialog({ open, onOpenChange, linhas, ctx, hoje, recorte }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  linhas: TeamInclusion[];
  ctx: AnalyticsContext;
  hoje: Date;
  /** Descrição do recorte ativo, para sair escrita no relatório. */
  recorte?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  const { texto, rel } = useMemo(() => {
    const r = montarRelatorioDeCobertura(linhas, ctx, hoje);
    return { texto: textoDoRelatorio(r, hoje, recorte), rel: r };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, ctx, hoje, recorte, open]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência (http, foco perdido): seleciona
      // o texto para o Ctrl+C funcionar. Falhar em silêncio deixaria a pessoa
      // clicando num botão que não faz nada.
      const el = document.getElementById("previa-cobertura");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  const baixar = () => {
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeDoArquivo(hoje);
    a.click();
    URL.revokeObjectURL(url);
  };

  const nEventos = rel.comVagaAberta.length + rel.disponiveis.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[720px] w-[95vw] max-h-[88vh] !rounded-[14px] !flex !flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-6 pt-6 pb-3 pr-12 text-left">
          <DialogTitle>O que falta escalar</DialogTitle>
          <DialogDescription>
            {rel.totalAbertas === 0
              ? "Nenhuma vaga aberta neste recorte."
              : `${rel.totalAbertas} ${rel.totalAbertas === 1 ? "vaga aberta" : "vagas abertas"} em ${nEventos} ${nEventos === 1 ? "evento" : "eventos"}. Copie e mande para quem escala.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <pre
            id="previa-cobertura"
            data-testid="previa-cobertura"
            className="whitespace-pre-wrap break-words rounded-xl border border-border bg-background p-4 font-mono text-[12px] leading-relaxed text-slate-700"
          >
            {texto}
          </pre>
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-100 bg-background px-6 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button type="button" variant="outline" onClick={baixar} data-testid="button-baixar-cobertura">
            <Download className="h-4 w-4 mr-2" aria-hidden="true" /> Baixar .txt
          </Button>
          <Button type="button" onClick={copiar} data-testid="button-copiar-cobertura">
            {copiado
              ? <><Check className="h-4 w-4 mr-2" aria-hidden="true" /> Copiado</>
              : <><ClipboardCopy className="h-4 w-4 mr-2" aria-hidden="true" /> Copiar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
