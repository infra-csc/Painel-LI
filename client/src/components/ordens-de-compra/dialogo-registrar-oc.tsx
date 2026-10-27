/**
 * Registrar a OC de UMA prestação (28/10, etapa 4). O DP digita o nº da OC
 * gerada no M4; o valor vem com o total aprovado e a data com hoje (o
 * servidor recusa data futura). CNPJ emissor sem contrato ativo: a OC sai
 * assim mesmo, com justificativa — é pendência, não bloqueio (decisão do
 * dono, 26/10). Erro com `campo` cai no campo; `justificativa_obrigatoria`
 * abre a justificativa (o contrato pode ter vencido entre a lista e o envio).
 */
import { useEffect, useRef, useState } from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/common/currency-input";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { JUSTIFICATIVA_MIN, OC_NUMERO_MAX, erroDoNumeroDaOc } from "@shared/honorarios-pagamento";
import { SITUACAO_DO_CNPJ_LABEL } from "@shared/presenca";
import { ResumoDaPrestacao } from "./pecas";
import { dataBr, reais } from "./oc-utils";
import type { LinhaDaOc } from "./tipos";
import type { useAcoesDaOc } from "./use-ordens-de-compra";

const corpoDoErro = (e: unknown) => ((e as { body?: Record<string, unknown> | null } | null)?.body ?? null);

export function DialogoRegistrarOc({ alvo, hoje, registrar, onClose }: {
  alvo: LinhaDaOc | null;
  hoje: string;
  registrar: ReturnType<typeof useAcoesDaOc>["registrar"];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [numero, setNumero] = useState("");
  const [valor, setValor] = useState(0);
  const [data, setData] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [pedirJustificativa, setPedirJustificativa] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<{ campo: string | null; texto: string } | null>(null);
  const campoNumero = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!alvo) return;
    setNumero(""); setValor(alvo.valorAprovado); setData(hoje); setJustificativa("");
    setPedirJustificativa(alvo.acoes.exigeJustificativa); setTentou(false); setErro(null);
  }, [alvo, hoje]);

  const enviando = registrar.isPending;
  const erroNumero = tentou ? erroDoNumeroDaOc(numero) : null;
  const erroValor = tentou && valor <= 0 ? "O valor da OC tem que ser maior que zero." : null;
  const erroData = tentou && (!data ? "Informe a data da OC." : data > hoje ? "A data da OC não pode ser no futuro." : null);
  const erroJust = tentou && pedirJustificativa && justificativa.trim().length < JUSTIFICATIVA_MIN
    ? `Escreva a justificativa (pelo menos ${JUSTIFICATIVA_MIN} caracteres).` : null;
  const valorDiferente = !!alvo && valor > 0 && valor !== alvo.valorAprovado;

  const salvar = () => {
    setTentou(true);
    if (!alvo) return;
    if (erroDoNumeroDaOc(numero) || valor <= 0 || !data || data > hoje) return;
    if (pedirJustificativa && justificativa.trim().length < JUSTIFICATIVA_MIN) return;
    setErro(null);
    registrar.mutate({
      actualId: alvo.actualId, numero: numero.trim(), valor, data,
      justificativa: pedirJustificativa ? justificativa.trim() : null,
    }, {
      onSuccess: ({ linha }) => {
        toast({ variant: "success", title: `OC ${linha.oc?.numero ?? numero.trim()} registrada`, description: `${linha.colaborador ? toTitleCase(linha.colaborador.nome) : "Prestação"} · ${reais(linha.oc?.valor ?? valor)}. O colaborador já pode enviar a nota.` });
        onClose();
      },
      onError: (e) => {
        const corpo = corpoDoErro(e);
        if (corpo?.codigo === "justificativa_obrigatoria") setPedirJustificativa(true);
        setErro({ campo: typeof corpo?.campo === "string" ? corpo.campo : corpo?.codigo === "justificativa_obrigatoria" ? "justificativa" : null, texto: apiErrorMessage(e, "Não foi possível registrar a OC.") });
      },
    });
  };

  const situacao = alvo?.cnpjEmissor.situacao;

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => { if (!o && !enviando) onClose(); }}>
      <DialogContent className="prs-dialogo max-w-[540px] gap-0 p-0" onOpenAutoFocus={(e) => { e.preventDefault(); campoNumero.current?.focus(); }} data-testid="oc-dialogo-registrar">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <FileCheck2 className="h-4 w-4 text-primary" aria-hidden="true" />Registrar a OC
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            O número da ordem de compra gerada no M4. Com a OC, o colaborador vê o valor e envia a nota fiscal pelo app.
          </DialogDescription>
        </DialogHeader>

        <form className="prs-dialogo-corpo space-y-4 px-6 py-5" noValidate onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          {alvo && <ResumoDaPrestacao linha={alvo} />}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
            <div className="space-y-1.5">
              <Label htmlFor="oc-numero">Nº da OC</Label>
              <Input ref={campoNumero} id="oc-numero" value={numero} maxLength={OC_NUMERO_MAX} autoComplete="off" spellCheck={false}
                onChange={(e) => setNumero(e.target.value)} placeholder="ex.: 4500123456"
                aria-invalid={!!erroNumero || erro?.campo === "numero"} aria-describedby={erroNumero ? "oc-numero-erro" : undefined}
                className="h-10 rounded-lg font-mono tracking-tight" data-testid="oc-numero" />
              {erroNumero && <p id="oc-numero-erro" role="alert" className="m-0 text-xs font-medium text-danger">{erroNumero}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oc-data">Data da OC</Label>
              <Input id="oc-data" type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)}
                aria-invalid={!!erroData || erro?.campo === "data"} className="h-10 rounded-lg tabular-nums" data-testid="oc-data" />
              {erroData && <p role="alert" className="m-0 text-xs font-medium text-danger">{erroData}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="oc-valor">Valor da OC (R$)</Label>
            <CurrencyInput id="oc-valor" value={valor} onChange={setValor} aria-label="Valor da OC em reais"
              className={cn("h-10 max-w-[220px] text-base font-semibold tabular-nums", (erroValor || erro?.campo === "valor") && "border-danger")} />
            {erroValor ? <p role="alert" className="m-0 text-xs font-medium text-danger">{erroValor}</p> : (
              <p className={cn("m-0 text-xs", valorDiferente ? "font-medium text-warning" : "text-muted-foreground")} data-testid="oc-aviso-valor">
                {valorDiferente && alvo
                  ? <>Diferente do aprovado ({reais(alvo.valorAprovado)}) — a nota fiscal vai ser conferida contra este valor.</>
                  : "Padrão: o total aprovado na Conferência DP."}
              </p>
            )}
          </div>

          {pedirJustificativa && (
            <div className="space-y-1.5 rounded-lg border border-warning/30 bg-warning-soft/50 px-3.5 py-3" data-testid="oc-bloco-justificativa">
              <Label htmlFor="oc-justificativa" className="text-warning">Justificativa — {situacao ? SITUACAO_DO_CNPJ_LABEL[situacao].toLowerCase() : "CNPJ sem contrato ativo"}</Label>
              <p className="m-0 text-xs leading-5 text-slate-700">
                O CNPJ emissor não tem contrato ativo nos Contratos. A OC pode sair assim mesmo, mas fica registrada como pendência com o porquê — na auditoria e na linha da prestação.
              </p>
              <Textarea id="oc-justificativa" rows={3} maxLength={1000} value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Ex.: contrato em renovação no jurídico, assinatura prevista para 05/11."
                aria-invalid={!!erroJust || erro?.campo === "justificativa"} className="rounded-lg bg-card text-sm" data-testid="oc-justificativa" />
              {erroJust && <p role="alert" className="m-0 text-xs font-medium text-danger">{erroJust}</p>}
            </div>
          )}

          {erro && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger" data-testid="oc-erro">{erro.texto}</p>}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>

        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <p className="m-0 mr-auto hidden self-center text-2xs text-muted-foreground sm:block">{data && data !== hoje ? `OC de ${dataBr(data)}` : "OC de hoje"}</p>
          <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button type="button" onClick={salvar} disabled={enviando} data-testid="oc-salvar">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileCheck2 className="h-4 w-4" aria-hidden="true" />}
            {enviando ? "Registrando…" : "Registrar a OC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
