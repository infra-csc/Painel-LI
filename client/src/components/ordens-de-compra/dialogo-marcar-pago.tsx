/**
 * "Marcar como pago" (28/10, etapa 7) — individual (Notas fiscais) ou em
 * LOTE (a seleção dos programados nas Ordens de compra). Só depois de
 * programado: a NF aprovada e lançada no M4. A data do pagamento não pode
 * ser no futuro; observação e comprovante (PDF/foto, via /api/upload) são
 * opcionais. O servidor devolve quais entraram e o porquê das recusadas.
 */
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Loader2, Paperclip, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { OBS_DO_PAGAMENTO_MAX } from "@shared/honorarios-pagamento";
import { dataBr, reais } from "./oc-utils";
import { enviarComprovante } from "./use-ordens-de-compra";
import type { ResultadoDoPago } from "./tipos";

export interface ItemDoPago {
  actualId: string;
  nome: string;
  valor: number;
  programadoPara: string | null;
}

interface MutacaoDoPago {
  mutate: (v: { actualIds: string[]; pagoEm: string; observacao?: string | null; comprovanteId?: string | null }, o: { onSuccess: (r: ResultadoDoPago) => void; onError: (e: unknown) => void }) => void;
  isPending: boolean;
}

const TIPOS_DO_COMPROVANTE = ".pdf,.jpg,.jpeg,.png";
const TAMANHO_MAXIMO = 10 * 1024 * 1024;

export function DialogoMarcarPago({ itens, hoje, marcarPago, onClose, onPronto }: {
  /** null = fechado. */
  itens: ItemDoPago[] | null;
  hoje: string;
  marcarPago: MutacaoDoPago;
  onClose: () => void;
  /** Depois do sucesso (ex.: limpar a seleção). */
  onPronto?: (r: ResultadoDoPago) => void;
}) {
  const { toast } = useToast();
  const [pagoEm, setPagoEm] = useState("");
  const [obs, setObs] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recusadas, setRecusadas] = useState<ResultadoDoPago["recusadas"]>([]);
  const input = useRef<HTMLInputElement>(null);
  const aberto = !!itens && itens.length > 0;

  useEffect(() => {
    if (!itens) return;
    // Padrão: o dia programado (se já passou), senão hoje.
    const programados = Array.from(new Set(itens.map((i) => i.programadoPara).filter((d): d is string => !!d)));
    setPagoEm(programados.length === 1 && programados[0] <= hoje ? programados[0] : hoje);
    setObs(""); setArquivo(null); setErro(null); setRecusadas([]);
  }, [itens, hoje]);

  const enviando = marcarPago.isPending || subindo;
  const total = (itens ?? []).reduce((s, i) => s + i.valor, 0);
  const erroData = !pagoEm ? "Informe a data do pagamento." : pagoEm > hoje ? "A data do pagamento não pode ser no futuro." : null;
  const nomePorId = new Map((itens ?? []).map((i) => [i.actualId, i.nome]));

  const escolher = (f: File | undefined) => {
    if (!f) return;
    if (f.size > TAMANHO_MAXIMO) { setErro("O comprovante passa de 10 MB."); return; }
    setErro(null);
    setArquivo(f);
    if (input.current) input.current.value = "";
  };

  const salvar = async () => {
    if (!itens || erroData) return;
    setErro(null);
    let comprovanteId: string | null = null;
    if (arquivo) {
      setSubindo(true);
      try {
        comprovanteId = (await enviarComprovante(arquivo)).id;
      } catch (e) {
        setSubindo(false);
        setErro(apiErrorMessage(e, "O comprovante não subiu. Tente de novo ou marque sem ele."));
        return;
      }
      setSubindo(false);
    }
    marcarPago.mutate({ actualIds: itens.map((i) => i.actualId), pagoEm, observacao: obs.trim() || null, comprovanteId }, {
      onSuccess: (r) => {
        onPronto?.(r);
        toast({
          variant: r.pagas > 0 ? "success" : "destructive",
          title: r.pagas === 1 ? (itens.length === 1 ? `Pago em ${dataBr(pagoEm)}` : "1 prestação marcada como paga") : `${r.pagas} prestações marcadas como pagas`,
          description: r.recusadas.length ? `${r.recusadas.length} ficaram de fora — veja o porquê.` : "O colaborador já vê “Pago” no app.",
        });
        if (r.recusadas.length) setRecusadas(r.recusadas);
        else onClose();
      },
      onError: (e) => setErro(apiErrorMessage(e, "Não foi possível marcar como pago.")),
    });
  };

  const um = itens?.length === 1;

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !enviando) onClose(); }}>
      <DialogContent className="prs-dialogo max-h-[92dvh] max-w-[520px] gap-0 p-0" data-testid="oc-dialogo-pago">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <BadgeCheck className="h-4 w-4 text-success-strong" aria-hidden="true" />
            {um ? "Marcar como pago" : `Marcar ${itens?.length ?? 0} como pagas`}
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            Depois de liquidado no banco. O colaborador vê “Pago em dd/mm” no app; dá para desfazer com motivo.
          </DialogDescription>
        </DialogHeader>

        <form className="prs-dialogo-corpo space-y-4 px-6 py-5" noValidate onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
          <div className="rounded-lg border border-border bg-surface-muted/60">
            <ul className="m-0 max-h-[200px] list-none overflow-y-auto p-0" aria-label="Prestações a marcar">
              {(itens ?? []).map((i) => (
                <li key={i.actualId} className="flex items-baseline gap-3 border-b border-border px-3.5 py-2 text-xs last:border-b-0">
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={i.nome}>{i.nome}</span>
                  {i.programadoPara && <span className="shrink-0 tabular-nums text-muted-foreground">prog. {dataBr(i.programadoPara)}</span>}
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">{reais(i.valor)}</span>
                </li>
              ))}
            </ul>
            {!um && (
              <p className="m-0 flex justify-between border-t border-border px-3.5 py-2 text-xs font-semibold">
                <span className="text-slate-600">Total</span><span className="tabular-nums text-foreground" data-testid="oc-pago-total">{reais(total)}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="oc-pago-em">Data do pagamento</Label>
            <Input id="oc-pago-em" type="date" value={pagoEm} max={hoje} onChange={(e) => setPagoEm(e.target.value)}
              aria-invalid={!!erroData} className="h-10 max-w-[200px] rounded-lg tabular-nums" data-testid="oc-pago-em" />
            {erroData && <p role="alert" className="m-0 text-xs font-medium text-danger">{erroData}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="oc-pago-obs">Observação <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id="oc-pago-obs" rows={2} maxLength={OBS_DO_PAGAMENTO_MAX} value={obs} onChange={(e) => setObs(e.target.value)}
              placeholder="Ex.: TED do lote de 05/11, banco Itaú." className="rounded-lg text-sm" />
          </div>

          <div className="space-y-1.5">
            <span className="block text-sm font-medium leading-none text-foreground">Comprovante <span className="font-normal text-muted-foreground">(opcional)</span></span>
            {arquivo ? (
              <div className="flex items-center gap-2 rounded-lg border border-success/35 bg-success-soft/60 px-3 py-2 text-xs text-success">
                <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium" title={arquivo.name}>{arquivo.name}</span>
                <button type="button" onClick={() => setArquivo(null)} aria-label="Tirar o comprovante" disabled={enviando}
                  className="pas-alvo inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" className="h-9 rounded-lg border-dashed" onClick={() => input.current?.click()} disabled={enviando}>
                <Paperclip className="h-4 w-4" aria-hidden="true" />Anexar o comprovante
              </Button>
            )}
            <input ref={input} type="file" accept={TIPOS_DO_COMPROVANTE} className="hidden" onChange={(e) => escolher(e.target.files?.[0])} data-testid="oc-pago-comprovante" />
            <p className="m-0 text-2xs text-muted-foreground">PDF ou foto, até 10 MB.{!um ? " O mesmo comprovante vale para todas." : ""}</p>
          </div>

          {recusadas.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning-soft/60 px-3.5 py-2.5 text-xs" role="status" data-testid="oc-pago-recusadas">
              <p className="m-0 font-semibold text-warning">Ficaram de fora</p>
              <ul className="m-0 mt-1 list-none space-y-0.5 p-0">
                {recusadas.map((r) => <li key={r.actualId}><span className="font-medium text-foreground">{nomePorId.get(r.actualId) ?? "Prestação"}</span> — {r.motivo}</li>)}
              </ul>
            </div>
          )}
          {erro && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>

        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          {recusadas.length > 0 ? (
            <Button type="button" onClick={onClose}>Fechar</Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
              <Button type="button" onClick={() => void salvar()} disabled={enviando || !!erroData}
                className={cn("bg-success text-white hover:bg-success-strong")} data-testid="oc-confirmar-pago">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <BadgeCheck className="h-4 w-4" aria-hidden="true" />}
                {subindo ? "Subindo o comprovante…" : marcarPago.isPending ? "Marcando…" : um ? "Marcar como pago" : `Marcar ${itens?.length ?? 0} como pagas`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
