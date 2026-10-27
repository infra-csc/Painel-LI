/**
 * Enviar a nota fiscal COMO REPRESENTANTE (28/10, etapa 5) — a produção (na
 * Presença no evento) ou o DP, quando o colaborador não consegue pelo app. O
 * mesmo formulário do portal: o arquivo (PDF ou foto, até 10 MB), o valor, o
 * nº e o CNPJ da nota. A nota fica presa à OC registrada (o servidor grava o
 * nº da OC) e vai para a Aprovação DP como "enviada". Reenvio só da devolvida.
 */
import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, Paperclip, Send, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CnpjInput } from "@/components/ui/cnpj-input";
import { CurrencyInput } from "@/components/common/currency-input";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { cnpjValido } from "@shared/cnpj";
import { reais } from "./oc-utils";

export interface AlvoDaNota {
  actualId: string;
  nome: string;
  oc: { numero: string; valor: number | null };
  /** CNPJ emissor (formatado) — vem preenchido. */
  cnpjEmissor: string | null;
  /** Empresa que vai no "tomador" da nota (a pagadora do evento). */
  tomador?: { nome: string | null; cnpj: string | null } | null;
  /** É o reenvio da nota devolvida (com o comentário do DP). */
  devolvida?: { comentario: string | null } | null;
}

interface MutacaoDaNota {
  mutate: (v: { actualId: string; arquivo: File; valorNota: number; numeroNota?: string; cnpjNota?: string }, o: { onSuccess: () => void; onError: (e: unknown) => void }) => void;
  isPending: boolean;
}

const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const TIPOS = ["application/pdf", "image/jpeg", "image/png"];

export function DialogoEnviarNota({ alvo, enviar, onClose }: { alvo: AlvoDaNota | null; enviar: MutacaoDaNota; onClose: () => void }) {
  const { toast } = useToast();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [valor, setValor] = useState(0);
  const [numero, setNumero] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!alvo) return;
    setArquivo(null); setValor(alvo.oc.valor ?? 0); setNumero(""); setCnpj((alvo.cnpjEmissor ?? "").replace(/\D/g, ""));
    setTentou(false); setErro(null);
  }, [alvo]);

  const enviando = enviar.isPending;
  const cnpjOk = !cnpj || cnpjValido(cnpj);
  const dif = alvo?.oc.valor != null && valor > 0 ? valor - alvo.oc.valor : 0;

  const escolher = (f: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!f) return;
    if (f.size > TAMANHO_MAXIMO) { setErro("O arquivo da nota passa de 10 MB."); return; }
    if (f.type && !TIPOS.includes(f.type)) { setErro("A nota tem que ser PDF (ou foto JPG/PNG)."); return; }
    setErro(null);
    setArquivo(f);
  };

  const salvar = () => {
    setTentou(true);
    if (!alvo || !arquivo || valor <= 0 || !cnpjOk) return;
    setErro(null);
    enviar.mutate({ actualId: alvo.actualId, arquivo, valorNota: valor, numeroNota: numero.trim() || undefined, cnpjNota: cnpj || undefined }, {
      onSuccess: () => {
        toast({ variant: "success", title: alvo.devolvida ? "Nota reenviada" : "Nota enviada", description: `${alvo.nome} · OC ${alvo.oc.numero}. Vai para a Aprovação DP em Notas fiscais.` });
        onClose();
      },
      onError: (e) => setErro(apiErrorMessage(e, "Não foi possível enviar a nota.")),
    });
  };

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => { if (!o && !enviando) onClose(); }}>
      <DialogContent className="prs-dialogo max-h-[92dvh] max-w-[520px] gap-0 p-0" data-testid="oc-dialogo-nota">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <FileUp className="h-4 w-4 text-primary" aria-hidden="true" />{alvo?.devolvida ? "Reenviar a nota fiscal" : "Enviar a nota fiscal"}
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {alvo && <>Como representante de <span className="font-medium text-foreground">{alvo.nome}</span>. Fica registrado que foi você; a nota vai para a conferência do DP.</>}
          </DialogDescription>
        </DialogHeader>

        <form className="prs-dialogo-corpo space-y-4 px-6 py-5" noValidate onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          {alvo?.devolvida && (
            <div className="rounded-lg border border-warning/30 bg-warning-soft/60 px-3.5 py-2.5 text-xs leading-5" role="note">
              <p className="m-0 font-semibold text-warning">Devolvida pelo DP</p>
              <p className="m-0 text-slate-700">{alvo.devolvida.comentario || "Sem comentário."}</p>
            </div>
          )}
          {alvo && (
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-border bg-surface-muted/60 px-3.5 py-2.5 text-xs leading-5" data-testid="oc-nota-o-que-consta">
              <dt className="text-muted-foreground">Nº da OC</dt><dd className="m-0 font-mono font-semibold text-foreground">{alvo.oc.numero}</dd>
              <dt className="text-muted-foreground">Valor da OC</dt><dd className="m-0 font-semibold tabular-nums text-foreground">{alvo.oc.valor != null ? reais(alvo.oc.valor) : "—"}</dd>
              {alvo.tomador?.nome && <><dt className="text-muted-foreground">Tomador</dt><dd className="m-0 min-w-0 break-words text-foreground">{alvo.tomador.nome}{alvo.tomador.cnpj ? <span className="tabular-nums text-muted-foreground"> · {alvo.tomador.cnpj}</span> : null}</dd></>}
            </dl>
          )}

          <div className="space-y-1.5">
            <span className="block text-sm font-medium leading-none text-foreground">Arquivo da nota</span>
            {arquivo ? (
              <div className="flex items-center gap-2 rounded-lg border border-success/35 bg-success-soft/60 px-3 py-2.5 text-xs text-success">
                <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium" title={arquivo.name}>{arquivo.name}</span>
                <button type="button" onClick={() => setArquivo(null)} aria-label="Tirar o arquivo" disabled={enviando}
                  className="pas-alvo inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => input.current?.click()} disabled={enviando}
                className={cn("prs-botao-foto w-full", tentou && !arquivo && "border-danger text-danger")} data-testid="oc-nota-escolher">
                <FileUp className="h-5 w-5" aria-hidden="true" />Escolher o PDF (ou foto) da nota
              </button>
            )}
            <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} data-testid="oc-nota-arquivo" />
            {tentou && !arquivo ? <p role="alert" className="m-0 text-xs font-medium text-danger">Anexe a nota fiscal.</p> : <p className="m-0 text-2xs text-muted-foreground">PDF, JPG ou PNG, até 10 MB.</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="oc-nota-valor">Valor da nota (R$)</Label>
              <CurrencyInput id="oc-nota-valor" value={valor} onChange={setValor} aria-label="Valor da nota em reais"
                className={cn("h-10 font-semibold tabular-nums", tentou && valor <= 0 && "border-danger")} />
              {dif !== 0 ? (
                <p className="m-0 text-xs font-medium text-warning" data-testid="oc-nota-diferenca">{dif > 0 ? "+" : "−"}{reais(Math.abs(dif))} {dif > 0 ? "acima" : "abaixo"} da OC — o DP vai ver a divergência.</p>
              ) : <p className="m-0 text-2xs text-muted-foreground">Igual ao valor da OC.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oc-nota-numero">Nº da nota <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="oc-nota-numero" value={numero} maxLength={40} onChange={(e) => setNumero(e.target.value)} className="h-10 rounded-lg tabular-nums" autoComplete="off" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="oc-nota-cnpj">CNPJ da nota</Label>
            <CnpjInput id="oc-nota-cnpj" value={cnpj} onChange={setCnpj} className="max-w-[240px] tabular-nums" aria-invalid={tentou && !cnpjOk} />
            {tentou && !cnpjOk ? <p role="alert" className="m-0 text-xs font-medium text-danger">CNPJ inválido — confira os 14 dígitos.</p>
              : <p className="m-0 text-2xs text-muted-foreground">Vem com o CNPJ emissor da prestação; troque se a nota saiu por outro.</p>}
          </div>

          {erro && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger" data-testid="oc-nota-erro">{erro}</p>}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>

        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button type="button" onClick={salvar} disabled={enviando} data-testid="oc-nota-enviar">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            {enviando ? "Enviando…" : alvo?.devolvida ? "Reenviar a nota" : "Enviar a nota"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
