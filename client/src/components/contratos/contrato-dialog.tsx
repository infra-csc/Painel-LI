/**
 * Novo contrato / editar contrato (26/10). Um formulário só, em três blocos:
 * a empresa (CNPJ, razão social, nome fantasia, tipo), a vigência — com a
 * situação calculada ao vivo, a mesma régua da lista — e quem o contrato
 * atende. O CNPJ é validado enquanto digita; o "já existe" vem do servidor
 * e aparece no próprio campo.
 */
import { useState } from "react";
import { Building2, Loader2, Save } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CnpjInput } from "@/components/ui/cnpj-input";
import { useToast } from "@/hooks/use-toast";
import { isApiError } from "@/lib/queryClient";
import { apiErrorMessage, cn } from "@/lib/utils";
import { erroDoCnpj, digitosDoCnpj } from "@shared/cnpj";
import {
  CONTRATO_OBSERVACAO_MAX, CONTRATO_TEXTO_MAX, TIPOS_DE_CONTRATO, TIPO_DE_CONTRATO_LABEL, diasParaVencer, erroDaVigencia, situacaoDoContrato,
  type TipoDeContrato,
} from "@shared/contratos";
import { hojeISO } from "@shared/hoje-sp";
import { useMutacoesDeContrato, type Contrato } from "./api";
import { SeletorDeColaboradores } from "./seletor-de-colaboradores";
import { SituacaoDoContratoBadge } from "./pecas";

const DICA_DO_TIPO: Record<TipoDeContrato, string> = {
  mei: "Microempreendedor — a pessoa emite a própria nota.",
  empresa: "Empresa do colaborador (ME, Ltda…).",
  empreiteira: "Atende vários colaboradores; um registro por CNPJ.",
};

interface Estado {
  cnpj: string; razaoSocial: string; nomeFantasia: string; tipo: TipoDeContrato;
  vigenciaInicio: string; vigenciaFim: string; observacao: string; colaboradorIds: string[];
}

const vazio = (colaboradorIds: string[] = []): Estado => ({
  cnpj: "", razaoSocial: "", nomeFantasia: "", tipo: "mei", vigenciaInicio: "", vigenciaFim: "", observacao: "", colaboradorIds,
});

const doContrato = (c: Contrato): Estado => ({
  cnpj: c.cnpjFormatado, razaoSocial: c.razaoSocial, nomeFantasia: c.nomeFantasia ?? "", tipo: c.tipo,
  vigenciaInicio: c.vigenciaInicio ?? "", vigenciaFim: c.vigenciaFim ?? "", observacao: c.observacao ?? "",
  colaboradorIds: c.colaboradores.map((x) => x.id),
});

export function ContratoDialog({ aberto, contrato, colaboradorInicial, onClose, onSalvo }: {
  aberto: boolean;
  /** null = novo. */
  contrato: Contrato | null;
  /** Novo contrato a partir do cadastro de um colaborador: já vem escolhido. */
  colaboradorInicial?: string | null;
  onClose: () => void;
  onSalvo?: (c: Contrato) => void;
}) {
  const { criar, editar } = useMutacoesDeContrato();
  const { toast } = useToast();
  const [chave, setChave] = useState<string | null>(null);
  const [f, setF] = useState<Estado>(vazio());
  const [erros, setErros] = useState<Partial<Record<keyof Estado | "geral", string>>>({});
  const [tentou, setTentou] = useState(false);
  const chaveAtual = aberto ? (contrato ? `${contrato.id}:${contrato.versao}` : `novo:${colaboradorInicial ?? ""}`) : null;
  if (chaveAtual !== chave) {
    setChave(chaveAtual);
    if (aberto) { setF(contrato ? doContrato(contrato) : vazio(colaboradorInicial ? [colaboradorInicial] : [])); setErros({}); setTentou(false); }
  }
  const salvando = criar.isPending || editar.isPending;
  const mudar = <K extends keyof Estado>(k: K, v: Estado[K]) => { setF((x) => ({ ...x, [k]: v })); setErros((e) => ({ ...e, [k]: undefined, geral: undefined })); };

  const hoje = hojeISO();
  const erroVig = erroDaVigencia(f.vigenciaInicio || null, f.vigenciaFim || null);
  const previa = !erroVig ? situacaoDoContrato({ vigenciaInicio: f.vigenciaInicio || null, vigenciaFim: f.vigenciaFim || null }, hoje) : null;
  const dias = diasParaVencer({ vigenciaInicio: f.vigenciaInicio || null, vigenciaFim: f.vigenciaFim || null }, hoje);

  const validar = () => {
    const e: typeof erros = {};
    e.cnpj = erroDoCnpj(f.cnpj) ?? (digitosDoCnpj(f.cnpj) ? undefined : "Informe o CNPJ.");
    if (!f.razaoSocial.trim()) e.razaoSocial = "Informe a razão social.";
    if (erroVig) e.vigenciaFim = erroVig;
    for (const k of Object.keys(e) as (keyof typeof e)[]) if (!e[k]) delete e[k];
    return e;
  };

  const salvar = async () => {
    setTentou(true);
    const e = validar();
    setErros(e);
    if (Object.keys(e).length) {
      const primeiro = Object.keys(e)[0];
      document.getElementById(`ctr-f-${primeiro}`)?.focus();
      return;
    }
    const corpo = {
      cnpj: f.cnpj, razaoSocial: f.razaoSocial.trim(), nomeFantasia: f.nomeFantasia.trim() || null, tipo: f.tipo,
      vigenciaInicio: f.vigenciaInicio || null, vigenciaFim: f.vigenciaFim || null, observacao: f.observacao.trim() || null,
      colaboradorIds: f.colaboradorIds,
    };
    try {
      const salvo = contrato ? await editar.mutateAsync({ id: contrato.id, versao: contrato.versao, ...corpo }) : await criar.mutateAsync(corpo);
      toast({ variant: "success", title: contrato ? "Contrato atualizado" : "Contrato cadastrado", description: `${salvo.razaoSocial} · ${salvo.cnpjFormatado}` });
      onSalvo?.(salvo);
      onClose();
    } catch (err) {
      const campo = isApiError(err) && typeof err.body?.campo === "string" ? err.body.campo : undefined;
      const msg = apiErrorMessage(err, "Não foi possível salvar. Tente de novo.");
      if (campo === "cnpj" || campo === "vigenciaFim") setErros({ [campo]: msg });
      else setErros({ geral: msg });
    }
  };

  const campoErro = (k: keyof Estado) => erros[k] ? <p id={`ctr-f-${k}-erro`} role="alert" className="text-2xs font-medium text-danger">{erros[k]}</p> : null;

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !salvando) onClose(); }}>
      <DialogContent className="ctr-dialogo max-w-[640px] gap-0 p-0" onOpenAutoFocus={(e) => { e.preventDefault(); document.getElementById(contrato ? "ctr-f-razaoSocial" : "ctr-f-cnpj")?.focus(); }}>
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" /> {contrato ? "Editar contrato" : "Novo contrato"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {contrato ? `${contrato.razaoSocial} · ${contrato.cnpjFormatado}` : "Um contrato por CNPJ. O DP confere aqui se o CNPJ informado no check-out tem contrato ativo."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5 px-6 py-5" noValidate onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
          <fieldset className="space-y-3.5">
            <legend className="ctr-legenda">Empresa</legend>
            <div className="grid gap-3.5 sm:grid-cols-[200px_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="ctr-f-cnpj">CNPJ</Label>
                <CnpjInput id="ctr-f-cnpj" value={f.cnpj} onChange={(v) => mudar("cnpj", v)} className="tabular-nums" aria-invalid={!!erros.cnpj} aria-describedby={erros.cnpj ? "ctr-f-cnpj-erro" : undefined} />
                {campoErro("cnpj")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ctr-f-razaoSocial">Razão social</Label>
                <Input id="ctr-f-razaoSocial" className={cn("h-10 rounded-lg bg-card", erros.razaoSocial && "border-danger focus-visible:ring-danger/30")} maxLength={CONTRATO_TEXTO_MAX} value={f.razaoSocial} onChange={(e) => mudar("razaoSocial", e.target.value)}
                  aria-invalid={!!erros.razaoSocial} aria-describedby={erros.razaoSocial ? "ctr-f-razaoSocial-erro" : undefined} placeholder="Como está no cartão CNPJ" />
                {campoErro("razaoSocial")}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ctr-f-nomeFantasia">Nome fantasia <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="ctr-f-nomeFantasia" className="h-10 rounded-lg bg-card" maxLength={CONTRATO_TEXTO_MAX} value={f.nomeFantasia} onChange={(e) => mudar("nomeFantasia", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium leading-none" id="ctr-f-tipo-rotulo">Tipo</span>
              <div role="radiogroup" aria-labelledby="ctr-f-tipo-rotulo" className="ctr-segmento grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface-muted p-1">
                {TIPOS_DE_CONTRATO.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={f.tipo === t} onClick={() => mudar("tipo", t)}
                    className={cn("h-8 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      f.tipo === t ? "bg-card text-foreground shadow-1" : "text-muted-foreground hover:text-foreground")}>
                    {TIPO_DE_CONTRATO_LABEL[t]}
                  </button>
                ))}
              </div>
              <p className="text-2xs text-muted-foreground">{DICA_DO_TIPO[f.tipo]}</p>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="ctr-legenda">Vigência</legend>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="ctr-f-vigenciaInicio">Início</Label>
                <Input id="ctr-f-vigenciaInicio" type="date" className="h-10 rounded-lg bg-card" value={f.vigenciaInicio} onChange={(e) => mudar("vigenciaInicio", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ctr-f-vigenciaFim">Fim <span className="font-normal text-muted-foreground">(vazio = sem prazo)</span></Label>
                <Input id="ctr-f-vigenciaFim" type="date" className={cn("h-10 rounded-lg bg-card", erros.vigenciaFim && "border-danger focus-visible:ring-danger/30")} value={f.vigenciaFim} onChange={(e) => mudar("vigenciaFim", e.target.value)}
                  aria-invalid={!!erros.vigenciaFim || (tentou && !!erroVig)} aria-describedby={erros.vigenciaFim ? "ctr-f-vigenciaFim-erro" : undefined} />
              </div>
            </div>
            {campoErro("vigenciaFim")}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
              {previa && !contrato?.encerradoEm && <><span>Com estas datas, hoje:</span><SituacaoDoContratoBadge situacao={previa} dias={dias} /></>}
              {previa === "sem_vigencia" && <span>Sem datas, o contrato não conta como ativo.</span>}
              {contrato?.encerradoEm && <span>Contrato encerrado — reative na ficha para voltar a valer.</span>}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="ctr-legenda">Colaboradores atendidos</legend>
            <SeletorDeColaboradores id="ctr-f-colaboradores" escolhidos={f.colaboradorIds} onChange={(ids) => mudar("colaboradorIds", ids)} />
            <p className="text-2xs text-muted-foreground">
              {f.colaboradorIds.length === 0 ? "Nenhum ainda — dá para vincular depois, aqui ou no cadastro do colaborador." : `${f.colaboradorIds.length} ${f.colaboradorIds.length === 1 ? "colaborador" : "colaboradores"}.`}
            </p>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="ctr-f-observacao">Observação <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id="ctr-f-observacao" rows={2} maxLength={CONTRATO_OBSERVACAO_MAX} className="rounded-lg bg-card text-sm" value={f.observacao} onChange={(e) => mudar("observacao", e.target.value)} />
          </div>

          {erros.geral && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erros.geral}</p>}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>

        <DialogFooter className="ctr-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button type="button" onClick={() => void salvar()} disabled={salvando} data-testid="ctr-salvar">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {salvando ? "Salvando…" : contrato ? "Salvar alterações" : "Cadastrar contrato"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
