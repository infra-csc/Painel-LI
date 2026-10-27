/**
 * Desfazer a OC (só antes de existir nota) ou o pago (28/10) — sempre com
 * motivo, que vai para a auditoria. Um diálogo só para os dois: o texto diz
 * o que volta a acontecer depois.
 */
import { useEffect, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { toTitleCase } from "@/lib/format";
import { MOTIVO_DO_DESFAZER_MIN } from "@shared/honorarios-pagamento";
import { dataBr } from "./oc-utils";
import type { LinhaDaOc } from "./tipos";

export interface AlvoDoDesfazer {
  tipo: "oc" | "pago";
  actualId: string;
  nome: string;
  /** Nº da OC ou a data do pagamento (AAAA-MM-DD). */
  referencia: string;
}

export const alvoDoDesfazer = (tipo: "oc" | "pago", l: LinhaDaOc): AlvoDoDesfazer => ({
  tipo, actualId: l.actualId, nome: l.colaborador ? toTitleCase(l.colaborador.nome) : "Prestação",
  referencia: tipo === "oc" ? l.oc?.numero ?? "" : l.pagamento?.pagoEm ?? "",
});

interface MutacaoDoDesfazer {
  mutate: (v: { actualId: string; motivo: string }, o: { onSuccess: () => void; onError: (e: unknown) => void }) => void;
  isPending: boolean;
}

export function DialogoDesfazer({ alvo, desfazerOc, desfazerPago, onClose }: {
  alvo: AlvoDoDesfazer | null;
  desfazerOc: MutacaoDoDesfazer;
  desfazerPago: MutacaoDoDesfazer;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (alvo) { setMotivo(""); setTentou(false); setErro(null); } }, [alvo]);

  const m = alvo?.tipo === "pago" ? desfazerPago : desfazerOc;
  const enviando = m.isPending;
  const curto = motivo.trim().length < MOTIVO_DO_DESFAZER_MIN;
  const ehOc = alvo?.tipo === "oc";

  const salvar = () => {
    setTentou(true);
    if (!alvo || curto) return;
    setErro(null);
    m.mutate({ actualId: alvo.actualId, motivo: motivo.trim() }, {
      onSuccess: () => {
        toast({ variant: "success", title: ehOc ? `OC ${alvo.referencia} desfeita` : "Pagamento desfeito", description: ehOc ? `${alvo.nome} volta para "Sem OC".` : `${alvo.nome} volta para "Programado".` });
        onClose();
      },
      onError: (e) => setErro(apiErrorMessage(e, "Não foi possível desfazer.")),
    });
  };

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => { if (!o && !enviando) onClose(); }}>
      <DialogContent className="prs-dialogo max-w-[480px] gap-0 p-0" data-testid="oc-dialogo-desfazer">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <Undo2 className="h-4 w-4 text-warning-strong" aria-hidden="true" />
            {ehOc ? `Desfazer a OC ${alvo?.referencia ?? ""}` : "Desfazer o pagamento"}
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {alvo && (ehOc
              ? <><span className="font-medium text-foreground">{alvo.nome}</span> volta para “Sem OC” e o valor some do app do colaborador se o evento esconde os valores. Só dá para desfazer enquanto não chegou nota fiscal.</>
              : <><span className="font-medium text-foreground">{alvo.nome}</span> volta para “Programado” (o pagamento de {dataBr(alvo.referencia)} deixa de constar). O colaborador deixa de ver “Pago”.</>)}
          </DialogDescription>
        </DialogHeader>
        <form className="prs-dialogo-corpo space-y-1.5 px-6 py-5" noValidate onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <Label htmlFor="oc-motivo-desfazer">Motivo</Label>
          <Textarea id="oc-motivo-desfazer" rows={3} maxLength={1000} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder={ehOc ? "Ex.: OC digitada na prestação errada." : "Ex.: a TED voltou — conta encerrada."}
            aria-invalid={tentou && curto} className="rounded-lg text-sm" data-testid="oc-motivo-desfazer" />
          <p className={tentou && curto ? "m-0 text-xs font-medium text-danger" : "m-0 text-2xs text-muted-foreground"} role={tentou && curto ? "alert" : undefined}>
            {tentou && curto ? `Escreva o motivo (pelo menos ${MOTIVO_DO_DESFAZER_MIN} caracteres).` : "Fica no log de auditoria com o seu nome."}
          </p>
          {erro && <p role="alert" className="m-0 mt-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button type="button" variant="destructive" onClick={salvar} disabled={enviando} data-testid="oc-confirmar-desfazer">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Undo2 className="h-4 w-4" aria-hidden="true" />}
            {enviando ? "Desfazendo…" : ehOc ? "Desfazer a OC" : "Desfazer o pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
