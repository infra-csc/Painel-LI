/**
 * "Aprovar fornecedores pelo histórico" (28/10) — a varredura única do
 * passado. Abre já com a PRÉVIA (POST …?simular=1, não grava): quantos CNPJs
 * viram contrato novo, quantos ganham vigência e quais ficam de fora
 * (encerrado pelo DP, vigência do DP vencida). "Aprovar" grava e mostra o
 * resultado. Regra em shared/fornecedor-automatico.ts.
 * 28/10 (revisão, S1/R6): a OC não aprova; o CNPJ que já é de outro contrato
 * não vincula ninguém sozinho — vira a seção "Pendências do DP".
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, History, Link2, Loader2, PlusCircle, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { toTitleCase } from "@/lib/format";
import { apiErrorMessage, cn } from "@/lib/utils";
import { useAprovacaoPeloHistorico, type DecisaoDaAprovacao, type ItemDaAprovacaoApi, type RespostaDaAprovacao } from "./api";
import { dataBr } from "./pecas";

const ROTULO: Record<DecisaoDaAprovacao, string> = {
  criar: "Contrato novo", atualizar: "Abre vigência", ja_aprovado: "Já aprovado", ignorado: "Fica como está", pendente: "CNPJ de outro contrato",
};
const TOM: Record<DecisaoDaAprovacao, string> = {
  criar: "border-success/30 bg-success-soft text-success",
  atualizar: "border-primary/25 bg-brand-soft text-primary",
  ja_aprovado: "border-border bg-surface-muted text-slate-600",
  ignorado: "border-border bg-surface-muted text-slate-600",
  pendente: "border-warning/30 bg-warning-soft text-warning",
};

function Item({ i, comoPendencia = false }: { i: ItemDaAprovacaoApi; comoPendencia?: boolean }) {
  // Na seção de pendências o selo é sempre "CNPJ de outro contrato" (o "já aprovado" é de outra pessoa).
  const selo: DecisaoDaAprovacao = comoPendencia ? "pendente" : i.decisao;
  return (
    <li className="rounded-xl border border-border bg-card px-3.5 py-2.5" data-testid={`ctr-aprovacao-${i.decisao}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-2xs font-semibold", TOM[selo])}>{ROTULO[selo]}</span>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground">{i.cnpj}</span>
      </div>
      <p className="mt-1 break-words text-sm font-medium leading-5 text-foreground">{i.razaoSocial}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{i.descricao}</p>
      <p className="mt-0.5 break-words text-2xs leading-relaxed text-muted-foreground">
        Passou em {i.evento} · {dataBr(i.data)} · {i.gatilho}
        {i.colaboradores.length > 0 && <> · {i.colaboradores.map((c) => toTitleCase(c.nome)).join(", ")}</>}
      </p>
      {(i.pendentes?.length ?? 0) > 0 && (
        <p className="mt-1 flex items-start gap-1.5 text-2xs font-medium leading-relaxed text-warning" data-testid="ctr-aprovacao-pendentes">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">Não vinculado automaticamente: {i.pendentes!.map((c) => toTitleCase(c.nome)).join(", ")}</span>
        </p>
      )}
    </li>
  );
}

export function AprovacaoPeloHistoricoDialog({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const { previa, executar } = useAprovacaoPeloHistorico();
  const { toast } = useToast();
  const [resposta, setResposta] = useState<RespostaDaAprovacao | null>(null);
  const [feito, setFeito] = useState<RespostaDaAprovacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = () => {
    setErro(null);
    previa.mutate(undefined, { onSuccess: setResposta, onError: (e) => setErro(apiErrorMessage(e, "Não foi possível montar a prévia.")) });
  };
  useEffect(() => {
    if (!aberto) { setResposta(null); setFeito(null); setErro(null); return; }
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [aberto]);

  const aGravar = resposta ? resposta.resumo.criar + resposta.resumo.atualizar : 0;
  const aprovar = () => executar.mutate(undefined, {
    onSuccess: (r) => {
      setFeito(r);
      toast({ variant: "success", title: r.aprovados === 1 ? "1 fornecedor aprovado" : `${r.aprovados} fornecedores aprovados`, description: "Agora contam como contrato ativo em todas as telas." });
    },
    onError: (e) => toast({ variant: "destructive", title: "Não foi possível aprovar", description: apiErrorMessage(e, "Tente de novo.") }),
  });

  const r = feito ?? resposta;
  const gravaveis = r?.itens.filter((i) => i.decisao === "criar" || i.decisao === "atualizar") ?? [];
  const ignorados = r?.itens.filter((i) => i.decisao === "ignorado") ?? [];
  // 28/10 (S1): o CNPJ já é de outro contrato — o DP decide o vínculo à mão.
  const pendencias = r?.itens.filter((i) => i.decisao === "pendente" || (i.decisao === "ja_aprovado" && (i.pendentes?.length ?? 0) > 0)) ?? [];

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !executar.isPending) onClose(); }}>
      <DialogContent className="ctr-aprovacao flex max-h-[92vh] max-w-[760px] flex-col gap-0 p-0" onOpenAutoFocus={(e) => e.preventDefault()} data-testid="ctr-aprovacao-dialog">
        <DialogHeader className="shrink-0 space-y-1.5 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5 text-primary" aria-hidden="true" /> Aprovar fornecedores pelo histórico</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Todo CNPJ sem contrato que já teve nota fiscal aprovada ou pagamento marcado vira contrato ativo (vigência aberta), ligado a quem passou com ele primeiro.
            CNPJ que já é de outro contrato não liga ninguém sozinho: fica em Pendências do DP. Contrato encerrado pelo DP não volta; vigência que o DP definiu e venceu fica como está.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {!r && !erro && (
            <div className="space-y-2" aria-busy="true" aria-label="Montando a prévia">
              <div className="val-osso h-[70px] w-full rounded-xl" />
              {[0, 1, 2].map((k) => <div key={k} className="val-osso h-16 w-full rounded-xl" />)}
            </div>
          )}
          {erro && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
              {erro}
              <Button type="button" variant="outline" size="sm" onClick={carregar} className="ml-auto"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar de novo</Button>
            </div>
          )}
          {r && (
            <>
              {feito ? (
                <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm font-medium text-success" data-testid="ctr-aprovacao-feito">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {feito.aprovados === 0 ? "Nada mudou — o cadastro já estava em dia." : `${feito.aprovados} ${feito.aprovados === 1 ? "fornecedor aprovado" : "fornecedores aprovados"}. Eles já contam como contrato ativo.`}
                </p>
              ) : (
                <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Prévia — nada foi gravado ainda</p>
              )}
              <div role="group" aria-label="Resumo" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-5">
                {[
                  { rotulo: "Contratos novos", valor: r.resumo.criar, icone: PlusCircle, tom: "text-success" },
                  { rotulo: "Vigência aberta", valor: r.resumo.atualizar, icone: Link2, tom: "text-primary" },
                  { rotulo: "Já aprovados", valor: r.resumo.jaAprovados, icone: CheckCircle2, tom: "text-slate-500" },
                  { rotulo: "Como estão", valor: r.resumo.ignorados, icone: CircleSlash, tom: "text-slate-500" },
                  { rotulo: "Pendências", valor: r.resumo.pendentes ?? 0, icone: AlertTriangle, tom: "text-warning" },
                ].map((c, k) => (
                  <div key={c.rotulo} className={cn("bg-card px-4 py-3", k === 4 && "col-span-2 sm:col-span-1")}>
                    <span className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground"><c.icone className={cn("h-3.5 w-3.5", c.tom)} aria-hidden="true" />{c.rotulo}</span>
                    <span className="mt-0.5 block text-lg font-semibold tabular-nums text-foreground">{c.valor}</span>
                  </div>
                ))}
              </div>
              {gravaveis.length === 0 && ignorados.length === 0 && pendencias.length === 0 && (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  {r.resumo.total === 0 ? "Nenhum CNPJ no histórico de pagamentos ainda." : "Todo CNPJ do histórico já tem contrato ativo com quem passou com ele."}
                </p>
              )}
              {gravaveis.length > 0 && (
                <section aria-label={feito ? "Aprovados" : "Serão aprovados"} className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground">{feito ? "Aprovados" : "Serão aprovados"} ({gravaveis.length})</h3>
                  <ul className="space-y-2">{gravaveis.map((i) => <Item key={i.cnpj} i={i} />)}</ul>
                </section>
              )}
              {pendencias.length > 0 && (
                <section aria-label="Pendências do DP" className="space-y-2" data-testid="ctr-aprovacao-pendencias">
                  <h3 className="text-xs font-semibold text-foreground">Pendências do DP — CNPJ já é de outro contrato ({pendencias.length})</h3>
                  <p className="text-2xs leading-relaxed text-muted-foreground">Ninguém é ligado sozinho ao contrato de outra pessoa. Se for a mesma empresa, vincule à mão no contrato.</p>
                  <ul className="space-y-2">{pendencias.map((i) => <Item key={i.cnpj} i={i} comoPendencia />)}</ul>
                </section>
              )}
              {ignorados.length > 0 && (
                <section aria-label="Ficam como estão" className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground">Ficam como estão — decisão do DP ({ignorados.length})</h3>
                  <ul className="space-y-2">{ignorados.map((i) => <Item key={i.cnpj} i={i} />)}</ul>
                </section>
              )}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          {feito ? (
            <Button type="button" onClick={onClose} data-testid="ctr-aprovacao-concluir">Concluir</Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={executar.isPending}>Cancelar</Button>
              <Button type="button" onClick={aprovar} disabled={!resposta || aGravar === 0 || executar.isPending} data-testid="ctr-aprovacao-confirmar">
                {executar.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                {executar.isPending ? "Aprovando…" : aGravar ? `Aprovar ${aGravar} ${aGravar === 1 ? "fornecedor" : "fornecedores"}` : "Nada a aprovar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
