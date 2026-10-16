/**
 * Diálogos do Financeiro (16/10): registrar a liberação da verba (data, OC/DP
 * e valor — aceita parcial e mostra o que falta) e estornar uma liberação
 * lançada errado (com motivo; nada se apaga).
 */
import { useState } from "react";
import { Banknote, Loader2, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { CurrencyInput } from "@/components/common/currency-input";
import { useToast } from "@/hooks/use-toast";
import { isApiError } from "@/lib/queryClient";
import { todayIso } from "@/lib/dates";
import { apiErrorMessage, cn } from "@/lib/utils";
import { HONORARIO_OC_MAX, HONORARIO_TEXTO_MAX, faltaLiberar, validarLiberacao, validarMotivo } from "@shared/honorarios-ceno";
import { useMutacoesDoFinanceiro, type Honorario, type Liberacao } from "./api";
import { BarraDaVerba, OrigemDaLinha, brl } from "./pecas";

export function LiberacaoDialog({ h, onClose }: { h: Honorario | null; onClose: () => void }) {
  const { liberar } = useMutacoesDoFinanceiro();
  const { toast } = useToast();
  const [para, setPara] = useState<string | null>(null);
  const [data, setData] = useState(todayIso());
  const [oc, setOc] = useState("");
  const [valor, setValor] = useState(0);
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const falta = h ? faltaLiberar(h.valorAprovado, h.liberado) : 0;
  if (h && para !== h.id) { setPara(h.id); setData(todayIso()); setOc(""); setValor(falta); setObs(""); setErro(null); }
  if (!h) return null;
  const aprovado = h.valorAprovado ?? 0;
  const parcial = valor > 0 && valor < falta;
  const salvar = async () => {
    const e = validarLiberacao({ data, oc, valor }, falta);
    if (e) { setErro(e); return; }
    try {
      const r = await liberar.mutateAsync({ id: h.id, versao: h.versao, data, oc: oc.trim(), valor, observacao: obs.trim() || null });
      toast({
        variant: "success",
        title: r.falta > 0 ? "Liberação parcial registrada" : "Verba liberada por completo",
        description: `${h.nome} · OC/DP ${oc.trim()} · ${brl(valor)}${r.falta > 0 ? ` — faltam ${brl(r.falta)}` : ""}`,
      });
      onClose();
    } catch (err) {
      if (isApiError(err) && (err.status === 409 || err.status === 404)) {
        toast({ title: "Este pedido mudou", description: apiErrorMessage(err, "A lista foi atualizada.") });
        onClose();
        return;
      }
      setErro(apiErrorMessage(err, "Não foi possível registrar. Tente de novo."));
    }
  };
  return (
    <Dialog open={!!h} onOpenChange={(o) => { if (!o && !liberar.isPending) onClose(); }}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <Banknote className="h-4 w-4 text-success" aria-hidden="true" /> Registrar liberação
          </DialogTitle>
          <DialogDescription className="text-xs">{h.nome} · <OrigemDaLinha h={h} /> · {h.eventName}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4 px-6 py-5" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
          <div className="space-y-2 rounded-xl border border-border bg-surface-muted/60 px-4 py-3">
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div><dt className="text-2xs text-muted-foreground">Aprovado</dt><dd className="font-semibold tabular-nums text-foreground">{brl(aprovado)}</dd></div>
              <div><dt className="text-2xs text-muted-foreground">Já liberado</dt><dd className="font-semibold tabular-nums text-foreground">{brl(h.liberado)}</dd></div>
              <div><dt className="text-2xs text-muted-foreground">Falta</dt><dd className="font-semibold tabular-nums text-warning">{brl(falta)}</dd></div>
            </dl>
            <BarraDaVerba aprovado={aprovado} liberado={h.liberado} rotulo={false} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hon-lib-data">Data da liberação</Label>
              <Input id="hon-lib-data" type="date" className="h-10 rounded-lg bg-card" value={data} onChange={(e) => { setErro(null); setData(e.target.value); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hon-lib-oc">Nº da OC/DP</Label>
              <Input id="hon-lib-oc" autoFocus className="h-10 rounded-lg bg-card tabular-nums" maxLength={HONORARIO_OC_MAX} value={oc} placeholder="Ex.: 45123" onChange={(e) => { setErro(null); setOc(e.target.value); }} />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="hon-lib-valor">Valor liberado</Label>
              {valor !== falta && (
                <button type="button" className="text-2xs font-medium text-primary hover:underline" onClick={() => { setErro(null); setValor(falta); }}>Liberar tudo ({brl(falta)})</button>
              )}
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <CurrencyInput id="hon-lib-valor" value={valor} onChange={(c) => { setErro(null); setValor(c); }} className="h-11 bg-card pl-9 text-base tabular-nums" aria-label="Valor liberado" />
            </div>
            <p className={cn("text-2xs", parcial ? "text-info" : "text-muted-foreground")} aria-live="polite">
              {valor > falta ? "Passa do que falta liberar." : parcial ? `Liberação parcial — ficam ${brl(falta - valor)} a liberar.` : "Libera o que falta por completo."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hon-lib-obs">Observação <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id="hon-lib-obs" rows={2} maxLength={HONORARIO_TEXTO_MAX} className="rounded-lg bg-card text-sm" value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          {erro && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
        </form>
        <DialogFooter className="gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={liberar.isPending}>Cancelar</Button>
          <Button type="button" className="bg-success text-white hover:bg-success/90" onClick={() => void salvar()} disabled={liberar.isPending || valor <= 0}>
            {liberar.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Banknote className="h-4 w-4" aria-hidden="true" />}
            {liberar.isPending ? "Registrando…" : parcial ? `Liberar ${brl(valor)} (parcial)` : `Liberar ${brl(valor)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EstornoDialog({ alvo, onClose }: { alvo: { h: Honorario; l: Liberacao } | null; onClose: () => void }) {
  const { estornar } = useMutacoesDoFinanceiro();
  const { toast } = useToast();
  const [motivo, setMotivo] = useState("");
  const [para, setPara] = useState<string | null>(null);
  if (alvo && para !== alvo.l.id) { setPara(alvo.l.id); setMotivo(""); }
  const confirmar = async () => {
    if (!alvo || validarMotivo(motivo)) return;
    try {
      await estornar.mutateAsync({ id: alvo.h.id, liberacaoId: alvo.l.id, versao: alvo.h.versao, motivo: motivo.trim() });
      toast({ title: "Liberação estornada", description: `OC/DP ${alvo.l.oc} · ${brl(alvo.l.valor)} voltou para "a liberar".` });
      onClose();
    } catch (e) {
      toast({ variant: "destructive", title: "Não foi possível estornar", description: apiErrorMessage(e, "Tente de novo.") });
      if (isApiError(e) && (e.status === 409 || e.status === 404)) onClose();
    }
  };
  return (
    <ConfirmDialog
      open={!!alvo}
      onOpenChange={(o) => { if (!o && !estornar.isPending) onClose(); }}
      title="Estornar esta liberação?"
      description={alvo ? `OC/DP ${alvo.l.oc} · ${brl(alvo.l.valor)} sai da soma e o valor volta a ficar a liberar. O registro continua no histórico.` : undefined}
      tone="danger"
      icon={RotateCcw}
      cancelLabel="Voltar"
      confirmLabel={estornar.isPending ? "Estornando…" : "Estornar"}
      pending={estornar.isPending}
      confirmDisabled={!!validarMotivo(motivo)}
      onConfirm={() => { void confirmar(); }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="hon-estorno-motivo">Motivo do estorno (obrigatório)</Label>
        <Textarea id="hon-estorno-motivo" rows={2} maxLength={HONORARIO_TEXTO_MAX} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="rounded-lg bg-card text-sm" placeholder="Ex.: OC digitada errada" />
      </div>
    </ConfirmDialog>
  );
}
