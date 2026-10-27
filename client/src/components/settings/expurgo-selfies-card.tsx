/**
 * Expurgo das selfies — Tabela de valores (28/10, Fase 2 MANUAL), irmão do
 * card "Presença e acesso do colaborador" (onde mora o prazo de guarda).
 *
 * Uma vez por dia o servidor apaga do storage as fotos de presença das
 * prestações PAGAS há mais que o prazo e marca a presença como "foto
 * apagada" (os horários ficam); a auditoria registra quantas. Aqui: o prazo
 * em vigor, a rotina automática (liga/desliga — só o administrador), a
 * prévia ("sairiam N fotos…") e o "Apagar agora", com confirmação forte
 * (irreversível). Na demonstração o servidor só mostra a prévia (409 `demo`).
 * Contrato: GET/POST /api/presenca/expurgo, PUT /api/presenca/expurgo/automatico.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CameraOff, Info, Loader2, Lock, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { CHAVE_PRESENCA } from "@/components/presenca/use-presenca";
import { GrupoDeAjustes, LinhaDeAjuste } from "./settings-fields";

export const CHAVE_EXPURGO = "/api/presenca/expurgo";

export interface ResumoDoExpurgo {
  simulacao: boolean;
  retencaoDias: number;
  dataLimite: string;
  presencas: number;
  fotos: number;
  prestacoes: number;
  apagadas: number;
  falhas: number;
}

export interface SituacaoDoExpurgo {
  automatico: boolean;
  /** O storage é o de verdade (fora da demo): a rotina diária de fato roda. */
  rotinaDiariaAtiva: boolean;
  podeMudarAutomatico: boolean;
  previa: ResumoDoExpurgo;
}

/** A palavra que a pessoa digita para liberar o "Apagar agora". */
export const PALAVRA_DE_CONFIRMACAO = "APAGAR";

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

/** "Sairiam 12 fotos de 3 prestações pagas antes de 27/10/2025." */
export function fraseDaPrevia(p: ResumoDoExpurgo): string {
  if (p.fotos === 0) return `Nenhuma foto a apagar: nenhuma prestação paga antes de ${dataBr(p.dataLimite)} ainda tem selfie guardada.`;
  return `Sairiam ${plural(p.fotos, "foto", "fotos")} de ${plural(p.prestacoes, "prestação paga", "prestações pagas")} antes de ${dataBr(p.dataLimite)}.`;
}

const codigoDe = (e: unknown) => (e as { body?: { codigo?: unknown } | null } | null)?.body?.codigo;

export function ExpurgoSelfiesCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery<SituacaoDoExpurgo>({ queryKey: [CHAVE_EXPURGO], staleTime: 30_000 });
  const [confirmando, setConfirmando] = useState(false);
  const [palavra, setPalavra] = useState("");
  const [avisoDemo, setAvisoDemo] = useState<string | null>(null);

  const automatico = useMutation({
    mutationFn: async (ligado: boolean) => (await apiRequest("PUT", `${CHAVE_EXPURGO}/automatico`, { ligado })).json() as Promise<SituacaoDoExpurgo>,
    onSuccess: (r) => {
      qc.setQueryData([CHAVE_EXPURGO], r);
      toast({ variant: "success", title: r.automatico ? "Expurgo diário ligado" : "Expurgo diário desligado", description: r.automatico ? "O servidor apaga as fotos vencidas uma vez por dia." : "As fotos ficam até alguém rodar o expurgo na hora." });
    },
    onError: (e) => toast({ variant: "destructive", title: "Não foi possível mudar o expurgo diário", description: apiErrorMessage(e, "Tente de novo.") }),
  });

  const apagar = useMutation({
    mutationFn: async () => (await apiRequest("POST", CHAVE_EXPURGO)).json() as Promise<ResumoDoExpurgo>,
    onSuccess: (r) => {
      setConfirmando(false);
      qc.invalidateQueries({ queryKey: [CHAVE_EXPURGO] });
      qc.invalidateQueries({ queryKey: [CHAVE_PRESENCA] });
      toast({
        variant: r.falhas ? "destructive" : "success",
        title: r.apagadas === 1 ? "1 foto apagada" : `${r.apagadas.toLocaleString("pt-BR")} fotos apagadas`,
        description: r.falhas ? `${r.falhas} não saíram do storage e ficam para a próxima rodada.` : "Registrado no log de auditoria (só a contagem).",
      });
    },
    onError: (e) => {
      setConfirmando(false);
      if (codigoDe(e) === "demo") { setAvisoDemo(apiErrorMessage(e, "Na demonstração o expurgo só mostra a prévia.")); return; }
      toast({ variant: "destructive", title: "Não foi possível apagar as fotos", description: apiErrorMessage(e, "Tente de novo.") });
    },
  });

  let corpo;
  if (q.isLoading) {
    corpo = (
      <div className="px-5 py-4 space-y-3" aria-busy="true" aria-label="Carregando o expurgo das selfies">
        <div className="pas-osso h-4 w-64" /><div className="pas-osso h-16 w-full max-w-[640px] rounded-lg" />
      </div>
    );
  } else if (q.isError || !q.data) {
    corpo = (
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm text-danger" role="alert">
        Não foi possível carregar o expurgo das selfies.
        <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => q.refetch()}>Tentar de novo</Button>
      </div>
    );
  } else {
    const s = q.data;
    const p = s.previa;
    corpo = (
      <>
        <LinhaDeAjuste titulo="Rotina diária" descricao={`Apaga as selfies das prestações pagas há mais de ${plural(p.retencaoDias, "dia", "dias")} (o prazo de guarda, no card acima). Os horários e a localização ficam; a foto vira “apagada pela política de guarda”.`} colunas={2}>
          <div className="cfg-campo-bloco min-w-0">
            <span className="cfg-rotulo" id="cfg-exp-auto-rotulo">Expurgo automático</span>
            <div className={cn("cfg-campo justify-between", !s.podeMudarAutomatico && "opacity-80")}>
              <span className="text-sm text-foreground">{s.automatico ? "Ligado" : "Desligado"}</span>
              <Switch checked={s.automatico} disabled={!s.podeMudarAutomatico || automatico.isPending}
                onCheckedChange={(v) => automatico.mutate(v)} aria-labelledby="cfg-exp-auto-rotulo" data-testid="cfg-exp-automatico" />
            </div>
            <p className="cfg-apoio text-muted-foreground">
              {s.podeMudarAutomatico ? "uma vez por dia, de madrugada" : <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" aria-hidden="true" />só o administrador liga ou desliga</span>}
            </p>
          </div>
          <div className="cfg-campo-bloco min-w-0">
            <span className="cfg-rotulo">Neste ambiente</span>
            <div className="cfg-campo">
              <span className={cn("text-sm", s.rotinaDiariaAtiva ? "text-foreground" : "text-warning")}>{s.rotinaDiariaAtiva ? "Rodando" : "Não roda aqui"}</span>
            </div>
            <p className="cfg-apoio text-muted-foreground">{s.rotinaDiariaAtiva ? "com o storage real; a auditoria registra quantas saíram" : "sem storage real (demonstração ou testes): só a prévia"}</p>
          </div>
        </LinhaDeAjuste>

        <LinhaDeAjuste titulo="Prévia e execução na hora" descricao="Quantas fotos sairiam hoje. Apagar agora é IRREVERSÍVEL: a foto sai do storage e não volta." colunas={2}>
          <div className="col-span-full min-w-0 space-y-3">
            <div className={cn("flex flex-wrap items-start gap-3 rounded-lg border px-3.5 py-3", p.fotos ? "border-warning/30 bg-warning-soft/50" : "border-border bg-surface-muted/60")} data-testid="cfg-exp-previa">
              <CameraOff className={cn("mt-0.5 h-4 w-4 shrink-0", p.fotos ? "text-warning-strong" : "text-muted-foreground")} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-medium text-foreground">{fraseDaPrevia(p)}</p>
                <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                  Prazo: {plural(p.retencaoDias, "dia", "dias")} depois do pagamento{p.fotos ? ` · ${plural(p.presencas, "dia de presença", "dias de presença")}` : ""}.
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg gap-1.5" onClick={() => q.refetch()} disabled={q.isFetching}>
                <RotateCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />Atualizar
              </Button>
            </div>
            {avisoDemo && (
              <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info-soft px-3.5 py-2.5 text-xs leading-5 text-info" role="status" data-testid="cfg-exp-demo">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{avisoDemo} Em produção, o mesmo botão apaga as fotos e registra a contagem na auditoria.</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="destructive" className="h-9 rounded-lg gap-1.5" disabled={p.fotos === 0 || apagar.isPending}
                onClick={() => { setPalavra(""); setAvisoDemo(null); setConfirmando(true); }} data-testid="cfg-exp-apagar">
                <Trash2 className="h-4 w-4" aria-hidden="true" />Apagar agora
              </Button>
              <span className="text-2xs text-muted-foreground">{p.fotos === 0 ? "Nada a apagar hoje." : "Pede confirmação. Fica no log de auditoria com o seu nome."}</span>
            </div>
          </div>
        </LinhaDeAjuste>

        <ConfirmDialog
          open={confirmando}
          onOpenChange={(o) => { if (!o && !apagar.isPending) setConfirmando(false); }}
          title={`Apagar ${plural(p.fotos, "foto", "fotos")} agora?`}
          description={<>{fraseDaPrevia(p)} <strong className="font-semibold text-danger">Não dá para desfazer</strong> — as fotos saem do storage para sempre. Os horários de entrada e saída ficam.</>}
          confirmLabel="Apagar as fotos"
          tone="danger"
          pending={apagar.isPending}
          confirmDisabled={palavra.trim().toUpperCase() !== PALAVRA_DE_CONFIRMACAO}
          onConfirm={() => apagar.mutate()}
          icon={Trash2}
          testId="cfg-exp-confirmar"
          confirmTestId="cfg-exp-confirmar-botao"
        >
          <div className="space-y-1.5">
            <Label htmlFor="cfg-exp-palavra" className="text-xs">Para confirmar, digite <span className="font-mono font-semibold text-danger">{PALAVRA_DE_CONFIRMACAO}</span></Label>
            <Input id="cfg-exp-palavra" value={palavra} onChange={(e) => setPalavra(e.target.value)} autoComplete="off" spellCheck={false}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} className="h-10 rounded-lg font-mono" data-testid="cfg-exp-palavra" />
            <p className="m-0 flex items-center gap-1 text-2xs text-muted-foreground"><AlertTriangle className="h-3 w-3" aria-hidden="true" />Irreversível.</p>
          </div>
        </ConfirmDialog>
      </>
    );
  }

  return (
    <GrupoDeAjustes
      id="cfg-expurgo"
      titulo="Expurgo das selfies (LGPD)"
      descricao="As fotos de presença saem do storage depois do prazo de guarda contado do pagamento. Admin e DP veem a prévia e podem rodar na hora; a rotina diária, só o administrador liga ou desliga."
      extra={(automatico.isPending || apagar.isPending) ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Salvando" /> : undefined}
      data-testid="cfg-expurgo"
    >
      {corpo}
    </GrupoDeAjustes>
  );
}
