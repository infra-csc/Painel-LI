/**
 * Formulário do pedido (16/10): detalhes de uma VAGA (setor, posição,
 * período, diárias, valor, observação) ou uma EMPREITA nova/existente
 * (responsável, pessoas, descrição + o resto). O valor por diária aparece ao
 * vivo, como a coluna da planilha. Salvar grava rascunho — o envio para o
 * aprovador é outra ação.
 *
 * 20/10: o formulário (estado + campos) saiu do diálogo para ser o MESMO na
 * aba "Honorário" do modal da vaga, na Escalação — `useFormularioDoPedido` e
 * `CamposDoPedido`. O diálogo continua para as empreitas e para o lápis da
 * linha no painel "Honorários do evento".
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/common/currency-input";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage, cn } from "@/lib/utils";
import {
  HONORARIO_DIARIAS_MAX, HONORARIO_PESSOAS_MAX, HONORARIO_TEXTO_MAX, POSICAO_CENO_LABEL, SETORES_CENO, SETOR_CENO_LABEL,
  diasDoPeriodo, validarDadosDoPedido, valorPorDiaria,
} from "@shared/honorarios-ceno";
import { useMutacoesDoPedido, type CamposDoPedido as CamposGravados, type Honorario, type LinhaDoPedido } from "./api";
import { brl, useFocoDeVolta } from "./pecas";

export type AlvoDoFormulario =
  | { modo: "vaga"; linha: LinhaDoPedido }
  | { modo: "empreita"; honorario: Honorario | null };

export interface FormDoPedido {
  nome: string;
  pessoas: string;
  descricao: string;
  setor: string;
  posicao: string;
  inicio: string;
  fim: string;
  diarias: string;
  valor: number;
  observacao: string;
}

function inicial(alvo: AlvoDoFormulario, evento: { startDate: string; endDate: string }): FormDoPedido {
  if (alvo.modo === "vaga") {
    const h = alvo.linha.honorario;
    const s = alvo.linha.sugestao;
    return {
      nome: h?.nome ?? s?.nome ?? "",
      pessoas: "",
      descricao: h?.descricao ?? "",
      setor: h?.setor ?? s?.setor ?? "",
      posicao: h?.posicao ?? s?.posicao ?? "",
      inicio: h?.inicio ?? s?.inicio ?? "",
      fim: h?.fim ?? s?.fim ?? "",
      diarias: String(h?.diarias ?? s?.diarias ?? ""),
      valor: h?.valorPedido ?? 0,
      observacao: h?.observacao ?? "",
    };
  }
  const h = alvo.honorario;
  return {
    nome: h?.nome ?? "",
    pessoas: h?.pessoas ? String(h.pessoas) : "",
    descricao: h?.descricao ?? "",
    setor: h?.setor ?? "montagem",
    posicao: "empreita",
    inicio: h?.inicio ?? evento.startDate,
    fim: h?.fim ?? evento.endDate,
    diarias: String(h?.diarias ?? diasDoPeriodo(evento.startDate, evento.endDate) ?? ""),
    valor: h?.valorPedido ?? 0,
    observacao: h?.observacao ?? "",
  };
}

/**
 * Estado do formulário do pedido. `chave` decide quando ele volta ao que está
 * gravado (abrir o diálogo, outra vaga, nova versão do pedido) — um refetch
 * qualquer com a mesma chave não apaga o que a pessoa está digitando.
 */
export function useFormularioDoPedido({ alvo, chave, eventId, evento }: {
  alvo: AlvoDoFormulario | null;
  chave: unknown;
  eventId: string;
  evento: { startDate: string; endDate: string };
}) {
  const { criar, editar } = useMutacoesDoPedido();
  const [f, setF] = useState<FormDoPedido | null>(null);
  const [base, setBase] = useState<FormDoPedido | null>(null);
  const [diariasTocadas, setDiariasTocadas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!alvo) { setF(null); setBase(null); return; }
    const i = inicial(alvo, evento);
    setF(i);
    setBase(i);
    setDiariasTocadas(false);
    setErro(null);
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  const honorario = alvo?.modo === "vaga" ? alvo.linha.honorario : alvo?.honorario ?? null;
  const empreita = alvo?.modo === "empreita";
  const salvando = criar.isPending || editar.isPending;
  const sujo = !!f && !!base && JSON.stringify(f) !== JSON.stringify(base);
  const diariasNum = f?.diarias ? Number(f.diarias) : null;
  const porDia = useMemo(() => valorPorDiaria(f?.valor ?? 0, diariasNum), [f?.valor, diariasNum]);
  const diasDoIntervalo = f ? diasDoPeriodo(f.inicio, f.fim) : null;

  const set = (patch: Partial<FormDoPedido>) => { setErro(null); setF((p) => (p ? { ...p, ...patch } : p)); };
  /** Mudou o período e as diárias não foram mexidas à mão → acompanham o período. */
  const setPeriodo = (patch: Partial<Pick<FormDoPedido, "inicio" | "fim">>) => {
    if (!f) return;
    const prox = { ...f, ...patch };
    const dias = diasDoPeriodo(prox.inicio, prox.fim);
    set({ ...patch, ...(!diariasTocadas && dias ? { diarias: String(dias) } : {}) });
  };
  const setDiarias = (v: string) => { setDiariasTocadas(true); set({ diarias: v.replace(/\D/g, "").slice(0, 3) }); };

  /** O que vai para o servidor (mesmo formato do POST e do PATCH). */
  const campos = (): CamposGravados | null => {
    if (!f) return null;
    return {
      ...(empreita ? { nome: f.nome.trim(), pessoas: f.pessoas ? Number(f.pessoas) : null, descricao: f.descricao.trim() || null } : {}),
      setor: f.setor || null,
      ...(empreita ? {} : { posicao: f.posicao || null }),
      inicio: f.inicio || null,
      fim: f.fim || null,
      diarias: f.diarias ? Number(f.diarias) : null,
      valorPedido: f.valor,
      observacao: f.observacao.trim() || null,
    };
  };

  /**
   * Grava o rascunho (cria ou edita) e devolve o pedido como ficou; `null`
   * quando os dados não passam ou o servidor recusa (o motivo fica em `erro`).
   */
  const gravar = async (): Promise<Honorario | null> => {
    const c = campos();
    if (!c || !alvo) return null;
    const problema = validarDadosDoPedido({ tipo: empreita ? "empreita" : "vaga", ...c });
    if (problema) { setErro(problema); return null; }
    try {
      let salvo: Honorario;
      if (honorario) salvo = await editar.mutateAsync({ id: honorario.id, versao: honorario.versao, ...c });
      else if (alvo.modo === "vaga" && alvo.linha.vaga) salvo = await criar.mutateAsync({ eventId, tipo: "vaga", teamInclusionId: alvo.linha.vaga.id, ...c });
      else salvo = await criar.mutateAsync({ eventId, tipo: "empreita", ...c });
      setBase(f);
      return salvo;
    } catch (err) {
      setErro(apiErrorMessage(err, "Não foi possível salvar. Tente de novo."));
      return null;
    }
  };

  return { f, set, setPeriodo, setDiarias, erro, setErro, salvando, sujo, porDia, diariasNum, diasDoIntervalo, honorario, empreita, campos, gravar };
}

export type FormularioDoPedido = ReturnType<typeof useFormularioDoPedido>;

const CAMPO = "h-10 rounded-lg bg-card";

/**
 * Os campos do pedido. `prefixo` separa os ids quando o formulário aparece
 * em mais de um lugar da tela (diálogo × aba da vaga).
 */
export function CamposDoPedido({ form, prefixo = "hon", rotuloDaObservacao = "Observação para o aprovador" }: {
  form: FormularioDoPedido;
  prefixo?: string;
  rotuloDaObservacao?: string;
}) {
  const { f, set, setPeriodo, setDiarias, empreita, porDia, diariasNum, diasDoIntervalo, erro } = form;
  if (!f) return null;
  const id = (s: string) => `${prefixo}-${s}`;
  return (
    <>
      {empreita && (
        <fieldset className="grid grid-cols-[minmax(0,1fr)_88px] gap-x-3 gap-y-4 sm:grid-cols-[1fr_120px] sm:gap-x-4">
          <legend className="sr-only">Quem é a empreita</legend>
          <div className="space-y-1.5">
            <Label htmlFor={id("nome")}>Responsável ou equipe</Label>
            <Input id={id("nome")} className={CAMPO} value={f.nome} maxLength={120} placeholder="Ex.: Equipe Horizonte" onChange={(e) => set({ nome: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("pessoas")}>Pessoas</Label>
            <Input id={id("pessoas")} className={CAMPO} inputMode="numeric" value={f.pessoas} placeholder="—" onChange={(e) => set({ pessoas: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor={id("desc")}>Descrição <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id={id("desc")} rows={2} maxLength={HONORARIO_TEXTO_MAX} className="rounded-lg bg-card text-sm" value={f.descricao}
              placeholder="Ex.: R$ 4.000 + R$ 400 de ajuda de custo (R$ 100 por pessoa)" onChange={(e) => set({ descricao: e.target.value })} />
          </div>
        </fieldset>
      )}

      <fieldset className="grid grid-cols-2 gap-3 sm:gap-4">
        <legend className="sr-only">Setor e posição</legend>
        <div className="space-y-1.5">
          <Label htmlFor={id("setor")}>Setor</Label>
          <Select value={f.setor || undefined} onValueChange={(v) => set({ setor: v })}>
            <SelectTrigger id={id("setor")} className={cn(CAMPO, !f.setor && "border-dashed")} aria-label="Setor"><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
            <SelectContent>{SETORES_CENO.map((s) => <SelectItem key={s} value={s}>{SETOR_CENO_LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("posicao")}>Posição</Label>
          {empreita || f.posicao === "empreita" ? (
            <p id={id("posicao")} className="flex h-10 items-center rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground">Empreita</p>
          ) : (
            <Select value={f.posicao || undefined} onValueChange={(v) => set({ posicao: v })}>
              <SelectTrigger id={id("posicao")} className={cn(CAMPO, !f.posicao && "border-dashed")} aria-label="Posição"><SelectValue placeholder="Escolha a posição" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="freela_local">{POSICAO_CENO_LABEL.freela_local}</SelectItem>
                <SelectItem value="freela_viagem">{POSICAO_CENO_LABEL.freela_viagem}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </fieldset>

      {/* No celular (20/10): início e fim lado a lado e as diárias embaixo — com três colunas o campo de data estourava o cartão em 390px. */}
      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_110px] sm:gap-4">
        <legend className="col-span-2 mb-1.5 sm:col-span-3 text-sm font-medium text-foreground">Montagem</legend>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={id("inicio")} className="text-xs text-muted-foreground">Início</Label>
          <Input id={id("inicio")} type="date" className={cn(CAMPO, "min-w-0")} value={f.inicio} onChange={(e) => setPeriodo({ inicio: e.target.value })} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={id("fim")} className="text-xs text-muted-foreground">Fim</Label>
          <Input id={id("fim")} type="date" className={cn(CAMPO, "min-w-0")} value={f.fim} min={f.inicio || undefined} onChange={(e) => setPeriodo({ fim: e.target.value })} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={id("diarias")} className="text-xs text-muted-foreground">Diárias</Label>
          <Input id={id("diarias")} className={cn(CAMPO, "tabular-nums")} inputMode="numeric" value={f.diarias}
            onChange={(e) => setDiarias(e.target.value)}
            aria-describedby={id("diarias-dica")} />
        </div>
        <p id={id("diarias-dica")} className="col-span-2 -mt-1 sm:col-span-3 text-2xs text-muted-foreground">
          {diasDoIntervalo
            ? diariasNum && diariasNum !== diasDoIntervalo
              ? `O período tem ${diasDoIntervalo} dias; ficam ${diariasNum} diárias.`
              : `O período tem ${diasDoIntervalo} ${diasDoIntervalo === 1 ? "dia" : "dias"}.`
            : "As diárias acompanham o período até você mudar o número."}
          {` Máximo de ${HONORARIO_DIARIAS_MAX}.`}
        </p>
      </fieldset>

      <div className="grid gap-4 rounded-xl border border-border bg-surface-muted/60 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={id("valor")}>Valor negociado</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            <CurrencyInput id={id("valor")} value={f.valor} onChange={(c) => set({ valor: c })} className="h-11 bg-card pl-9 text-base tabular-nums" aria-label="Valor negociado" />
          </div>
        </div>
        <div className="text-right" aria-live="polite">
          <p className="text-2xs text-muted-foreground">Por diária</p>
          <p className="text-lg font-semibold tabular-nums text-foreground" data-testid={`${prefixo}-por-diaria`}>{porDia != null && f.valor > 0 ? brl(porDia) : "—"}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("obs")}>{rotuloDaObservacao} <span className="font-normal text-muted-foreground">(opcional)</span></Label>
        <Textarea id={id("obs")} rows={2} maxLength={HONORARIO_TEXTO_MAX} className="rounded-lg bg-card text-sm" value={f.observacao}
          placeholder="Ex.: inclui carregamento e descarga" onChange={(e) => set({ observacao: e.target.value })} />
      </div>

      {erro && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
      {empreita && f.pessoas && Number(f.pessoas) > HONORARIO_PESSOAS_MAX && (
        <p className="text-xs text-danger">No máximo {HONORARIO_PESSOAS_MAX} pessoas.</p>
      )}
    </>
  );
}

export function DetalhesDialog({ alvo, eventId, evento, onClose }: {
  alvo: AlvoDoFormulario | null;
  eventId: string;
  evento: { startDate: string; endDate: string; name: string };
  onClose: () => void;
}) {
  const aberto = alvo !== null;
  const devolverFoco = useFocoDeVolta(aberto);
  const { toast } = useToast();
  const form = useFormularioDoPedido({ alvo, chave: alvo, eventId, evento });
  const { f, honorario, empreita, salvando, sujo } = form;
  const nova = empreita && !honorario;
  const { pedirParaFechar, Dialogo } = useConfirmarDescarte(sujo, { salvando });

  if (!aberto || !f) return null;

  const salvar = async () => {
    const salvo = await form.gravar();
    if (!salvo) return;
    toast({ variant: "success", title: nova ? "Empreita adicionada" : "Pedido salvo", description: "Fica como rascunho até você enviar para aprovação." });
    onClose();
  };

  const titulo = nova ? "Adicionar empreita" : empreita ? "Empreita" : (alvo.modo === "vaga" ? alvo.linha.sugestao?.nome ?? honorario?.nome ?? "Vaga" : "");
  const subtitulo = alvo.modo === "vaga" && alvo.linha.vaga
    ? `#${alvo.linha.vaga.inclusionNumber} · ${alvo.linha.vaga.functionName} · ${evento.name}`
    : `Equipe terceirizada com valor fechado · ${evento.name}`;

  return (
    <>
      <Dialog open={aberto} onOpenChange={(o) => { if (!o) pedirParaFechar(onClose); }}>
        <DialogContent className="flex max-w-2xl flex-col gap-0 overflow-hidden p-0" onEscapeKeyDown={(e) => { if (salvando) e.preventDefault(); }}
          // Foco no responsável da empreita pelo Radix (sem autoFocus): assim o foco volta ao botão de origem ao fechar.
          onOpenAutoFocus={(e) => { const nome = document.getElementById("hon-nome"); if (nome) { e.preventDefault(); nome.focus(); } }}
          onCloseAutoFocus={devolverFoco}>
          <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
            <DialogTitle className="pr-8 text-base font-semibold">{titulo}</DialogTitle>
            <DialogDescription className="text-xs">{subtitulo}</DialogDescription>
          </DialogHeader>
          <form
            className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5"
            onSubmit={(e) => { e.preventDefault(); void salvar(); }}
            noValidate
          >
            <CamposDoPedido form={form} />
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </form>
          <DialogFooter className="gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => pedirParaFechar(onClose)} disabled={salvando}>Cancelar</Button>
            <Button type="button" onClick={() => void salvar()} disabled={salvando || (empreita && f.nome.trim().length < 2)}>
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {salvando ? "Salvando…" : nova ? "Adicionar empreita" : "Salvar rascunho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {Dialogo}
    </>
  );
}
