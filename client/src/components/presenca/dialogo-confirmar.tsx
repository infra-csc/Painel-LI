/**
 * Confirmar PELO COLABORADOR (27/10) — quando a pessoa não consegue confirmar
 * no app (sem celular, sem internet). O representante marca os dias
 * trabalhados que ela confirmou, o CNPJ que emite a nota e, se houver, a
 * contestação. Fica registrado que foi o representante. CNPJ sem contrato
 * ligado não bloqueia: vira pendência para o DP.
 */
import { useEffect, useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CnpjInput } from "@/components/ui/cnpj-input";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { cnpjValido } from "@shared/cnpj";
import { diaComSemana } from "./presenca-utils";
import type { PrestacaoDaPresenca } from "./tipos";
import type { useAcoesDaPresenca } from "./use-presenca";

export interface AlvoDaConfirmacao {
  prestacao: PrestacaoDaPresenca;
  nome: string;
}

/** Dias que vêm marcados: os pagos (sem falta) e as diárias extras. */
export const diasSugeridos = (p: Pick<PrestacaoDaPresenca, "calculo">) => [...p.calculo.diasPagos].sort();

export function DialogoConfirmar({ alvo, confirmar, onClose }: {
  alvo: AlvoDaConfirmacao | null;
  confirmar: ReturnType<typeof useAcoesDaPresenca>["confirmar"];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [dias, setDias] = useState<string[]>([]);
  const [cnpj, setCnpj] = useState("");
  const [razao, setRazao] = useState("");
  const [contestacao, setContestacao] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const p = alvo?.prestacao;
  const todos = p ? Array.from(new Set([...p.dias.map((d) => d.dia), ...p.diasExtras])).sort() : [];

  useEffect(() => {
    if (!alvo) return;
    setDias(diasSugeridos(alvo.prestacao)); setCnpj(""); setRazao(""); setContestacao(""); setTentou(false); setErro(null);
  }, [alvo]);

  const cnpjOk = cnpjValido(cnpj);
  const enviando = confirmar.isPending;
  const alternar = (d: string, on: boolean) => setDias((atual) => (on ? Array.from(new Set([...atual, d])).sort() : atual.filter((x) => x !== d)));

  const salvar = () => {
    setTentou(true);
    if (!p || !alvo || !cnpjOk) return;
    setErro(null);
    confirmar.mutate({ actualId: p.actualId, corpo: { dias, cnpj, razaoSocial: razao.trim() || null, contestacao: contestacao.trim() || null } }, {
      onSuccess: (nova) => {
        toast({ variant: "success", title: "Confirmação registrada", description: `${alvo.nome} · ${dias.length} ${dias.length === 1 ? "dia" : "dias"} · ${nova.cnpj.rotulo}.` });
        onClose();
      },
      onError: (e) => setErro(apiErrorMessage(e, "Não foi possível registrar a confirmação.")),
    });
  };

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => { if (!o && !enviando) onClose(); }}>
      <DialogContent className="prs-dialogo max-w-[520px] gap-0 p-0" onOpenAutoFocus={(e) => e.preventDefault()} data-testid="prs-dialogo-confirmar">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <CheckCheck className="h-4 w-4 text-success-strong" aria-hidden="true" />Confirmar pelo colaborador
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {alvo && <>Use quando <span className="font-medium text-foreground">{alvo.nome}</span> não consegue confirmar no app. Fica registrado que foi você, como representante.</>}
          </DialogDescription>
        </DialogHeader>

        <form className="prs-dialogo-corpo space-y-4 px-6 py-5" noValidate onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Dias trabalhados que a pessoa confirma</legend>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {todos.map((d) => {
                const falta = p?.calculo.diasComFalta.includes(d);
                const extra = p?.diasExtras.includes(d);
                return (
                  <label key={d} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm cursor-pointer", dias.includes(d) ? "border-primary/30 bg-brand-soft" : "border-border bg-card hover:bg-muted")}>
                    <Checkbox checked={dias.includes(d)} onCheckedChange={(v) => alternar(d, !!v)} aria-label={diaComSemana(d)} />
                    <span className="min-w-0">
                      <span className="block tabular-nums">{diaComSemana(d)}</span>
                      {(falta || extra) && <span className="block text-2xs text-muted-foreground">{falta ? "com falta" : "diária extra"}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="prs-conf-cnpj">CNPJ que emite a nota</Label>
              <CnpjInput id="prs-conf-cnpj" value={cnpj} onChange={setCnpj} className="tabular-nums" aria-invalid={tentou && !cnpjOk} data-testid="prs-conf-cnpj" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prs-conf-razao">Razão social <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="prs-conf-razao" value={razao} onChange={(e) => setRazao(e.target.value)} maxLength={200} className="h-10 rounded-lg" />
            </div>
          </div>
          {tentou && !cnpjOk && <p role="alert" className="m-0 -mt-2 text-xs font-medium text-danger">Informe um CNPJ válido (14 dígitos).</p>}
          <p className="m-0 -mt-2 text-2xs text-muted-foreground">Sem contrato ativo para este CNPJ, a confirmação vale e o DP vê a pendência.</p>

          <div className="space-y-1.5">
            <Label htmlFor="prs-conf-contestacao">Contestação <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id="prs-conf-contestacao" rows={2} maxLength={2000} value={contestacao} onChange={(e) => setContestacao(e.target.value)} className="rounded-lg text-sm" placeholder="O que a pessoa não concorda (dias, horas, valor)." />
          </div>

          {erro && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>

        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button type="button" onClick={salvar} disabled={enviando} data-testid="prs-salvar-confirmacao">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
            {enviando ? "Registrando…" : "Registrar a confirmação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
