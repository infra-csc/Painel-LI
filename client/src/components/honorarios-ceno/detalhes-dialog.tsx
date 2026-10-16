/**
 * Formulário do pedido (16/10): detalhes de uma VAGA (setor, posição,
 * período, diárias, valor, observação) ou uma EMPREITA nova/existente
 * (responsável, pessoas, descrição + o resto). O valor por diária aparece ao
 * vivo, como a coluna da planilha. Salvar grava rascunho — o envio para o
 * aprovador é outra ação, em lote.
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
import { useMutacoesDoPedido, type Honorario, type LinhaDoPedido } from "./api";
import { brl } from "./pecas";

export type AlvoDoFormulario =
  | { modo: "vaga"; linha: LinhaDoPedido }
  | { modo: "empreita"; honorario: Honorario | null };

interface Form {
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

function inicial(alvo: AlvoDoFormulario, evento: { startDate: string; endDate: string }): Form {
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

const CAMPO = "h-10 rounded-lg bg-card";

export function DetalhesDialog({ alvo, eventId, evento, onClose }: {
  alvo: AlvoDoFormulario | null;
  eventId: string;
  evento: { startDate: string; endDate: string; name: string };
  onClose: () => void;
}) {
  const aberto = alvo !== null;
  const { criar, editar } = useMutacoesDoPedido();
  const { toast } = useToast();
  const [f, setF] = useState<Form | null>(null);
  const [base, setBase] = useState<Form | null>(null);
  const [diariasTocadas, setDiariasTocadas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!alvo) return;
    const i = inicial(alvo, evento);
    setF(i);
    setBase(i);
    setDiariasTocadas(false);
    setErro(null);
  }, [alvo]); // eslint-disable-line react-hooks/exhaustive-deps

  const honorario = alvo?.modo === "vaga" ? alvo.linha.honorario : alvo?.honorario ?? null;
  const empreita = alvo?.modo === "empreita";
  const nova = empreita && !honorario;
  const salvando = criar.isPending || editar.isPending;
  const sujo = !!f && !!base && JSON.stringify(f) !== JSON.stringify(base);
  const { pedirParaFechar, Dialogo } = useConfirmarDescarte(sujo, { salvando });

  const diariasNum = f?.diarias ? Number(f.diarias) : null;
  const porDia = useMemo(() => valorPorDiaria(f?.valor ?? 0, diariasNum), [f?.valor, diariasNum]);
  const diasDoIntervalo = f ? diasDoPeriodo(f.inicio, f.fim) : null;

  if (!aberto || !f) return null;
  const set = (patch: Partial<Form>) => { setErro(null); setF((p) => (p ? { ...p, ...patch } : p)); };
  /** Mudou o período e as diárias não foram mexidas à mão → acompanham o período. */
  const setPeriodo = (patch: Partial<Pick<Form, "inicio" | "fim">>) => {
    const prox = { ...f, ...patch };
    const dias = diasDoPeriodo(prox.inicio, prox.fim);
    set({ ...patch, ...(!diariasTocadas && dias ? { diarias: String(dias) } : {}) });
  };

  const salvar = async () => {
    const campos = {
      ...(empreita ? { nome: f.nome.trim(), pessoas: f.pessoas ? Number(f.pessoas) : null, descricao: f.descricao.trim() || null } : {}),
      setor: f.setor || null,
      ...(empreita ? {} : { posicao: f.posicao || null }),
      inicio: f.inicio || null,
      fim: f.fim || null,
      diarias: f.diarias ? Number(f.diarias) : null,
      valorPedido: f.valor,
      observacao: f.observacao.trim() || null,
    };
    const problema = validarDadosDoPedido({ tipo: empreita ? "empreita" : "vaga", ...campos });
    if (problema) { setErro(problema); return; }
    try {
      if (honorario) await editar.mutateAsync({ id: honorario.id, versao: honorario.versao, ...campos });
      else if (alvo.modo === "vaga" && alvo.linha.vaga) await criar.mutateAsync({ eventId, tipo: "vaga", teamInclusionId: alvo.linha.vaga.id, ...campos });
      else await criar.mutateAsync({ eventId, tipo: "empreita", ...campos });
      toast({ variant: "success", title: nova ? "Empreita adicionada" : "Pedido salvo", description: "Fica como rascunho até você enviar para aprovação." });
      onClose();
    } catch (err) {
      setErro(apiErrorMessage(err, "Não foi possível salvar. Tente de novo."));
    }
  };

  const titulo = nova ? "Adicionar empreita" : empreita ? "Empreita" : (alvo.modo === "vaga" ? alvo.linha.sugestao?.nome ?? honorario?.nome ?? "Vaga" : "");
  const subtitulo = alvo.modo === "vaga" && alvo.linha.vaga
    ? `#${alvo.linha.vaga.inclusionNumber} · ${alvo.linha.vaga.functionName} · ${evento.name}`
    : `Equipe terceirizada com valor fechado · ${evento.name}`;

  return (
    <>
      <Dialog open={aberto} onOpenChange={(o) => { if (!o) pedirParaFechar(onClose); }}>
        <DialogContent className="flex max-w-2xl flex-col gap-0 overflow-hidden p-0" onEscapeKeyDown={(e) => { if (salvando) e.preventDefault(); }}>
          <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
            <DialogTitle className="pr-8 text-base font-semibold">{titulo}</DialogTitle>
            <DialogDescription className="text-xs">{subtitulo}</DialogDescription>
          </DialogHeader>
          <form
            className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5"
            onSubmit={(e) => { e.preventDefault(); void salvar(); }}
            noValidate
          >
            {empreita && (
              <fieldset className="grid grid-cols-[minmax(0,1fr)_88px] gap-x-3 gap-y-4 sm:grid-cols-[1fr_120px] sm:gap-x-4">
                <legend className="sr-only">Quem é a empreita</legend>
                <div className="space-y-1.5">
                  <Label htmlFor="hon-nome">Responsável ou equipe</Label>
                  <Input id="hon-nome" autoFocus className={CAMPO} value={f.nome} maxLength={120} placeholder="Ex.: Equipe Horizonte" onChange={(e) => set({ nome: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hon-pessoas">Pessoas</Label>
                  <Input id="hon-pessoas" className={CAMPO} inputMode="numeric" value={f.pessoas} placeholder="—" onChange={(e) => set({ pessoas: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="hon-desc">Descrição <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  <Textarea id="hon-desc" rows={2} maxLength={HONORARIO_TEXTO_MAX} className="rounded-lg bg-card text-sm" value={f.descricao}
                    placeholder="Ex.: R$ 4.000 + R$ 400 de ajuda de custo (R$ 100 por pessoa)" onChange={(e) => set({ descricao: e.target.value })} />
                </div>
              </fieldset>
            )}

            <fieldset className="grid grid-cols-2 gap-3 sm:gap-4">
              <legend className="sr-only">Setor e posição</legend>
              <div className="space-y-1.5">
                <Label htmlFor="hon-setor">Setor</Label>
                <Select value={f.setor || undefined} onValueChange={(v) => set({ setor: v })}>
                  <SelectTrigger id="hon-setor" className={CAMPO} aria-label="Setor"><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
                  <SelectContent>{SETORES_CENO.map((s) => <SelectItem key={s} value={s}>{SETOR_CENO_LABEL[s]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hon-posicao">Posição</Label>
                {empreita || f.posicao === "empreita" ? (
                  <p id="hon-posicao" className="flex h-10 items-center rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground">Empreita</p>
                ) : (
                  <Select value={f.posicao || undefined} onValueChange={(v) => set({ posicao: v })}>
                    <SelectTrigger id="hon-posicao" className={CAMPO} aria-label="Posição"><SelectValue placeholder="Escolha a posição" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="freela_local">{POSICAO_CENO_LABEL.freela_local}</SelectItem>
                      <SelectItem value="freela_viagem">{POSICAO_CENO_LABEL.freela_viagem}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </fieldset>

            <fieldset className="grid grid-cols-[1fr_1fr_76px] gap-3 sm:grid-cols-[1fr_1fr_110px] sm:gap-4">
              <legend className="col-span-3 mb-1.5 text-sm font-medium text-foreground">Montagem</legend>
              <div className="space-y-1.5">
                <Label htmlFor="hon-inicio" className="text-xs text-muted-foreground">Início</Label>
                <Input id="hon-inicio" type="date" className={CAMPO} value={f.inicio} onChange={(e) => setPeriodo({ inicio: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hon-fim" className="text-xs text-muted-foreground">Fim</Label>
                <Input id="hon-fim" type="date" className={CAMPO} value={f.fim} min={f.inicio || undefined} onChange={(e) => setPeriodo({ fim: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hon-diarias" className="text-xs text-muted-foreground">Diárias</Label>
                <Input id="hon-diarias" className={cn(CAMPO, "tabular-nums")} inputMode="numeric" value={f.diarias}
                  onChange={(e) => { setDiariasTocadas(true); set({ diarias: e.target.value.replace(/\D/g, "").slice(0, 3) }); }}
                  aria-describedby="hon-diarias-dica" />
              </div>
              <p id="hon-diarias-dica" className="col-span-3 -mt-1 text-2xs text-muted-foreground">
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
                <Label htmlFor="hon-valor">Valor negociado</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <CurrencyInput id="hon-valor" value={f.valor} onChange={(c) => set({ valor: c })} className="h-11 bg-card pl-9 text-base tabular-nums" aria-label="Valor negociado" />
                </div>
              </div>
              <div className="text-right" aria-live="polite">
                <p className="text-2xs text-muted-foreground">Por diária</p>
                <p className="text-lg font-semibold tabular-nums text-foreground" data-testid="hon-por-diaria">{porDia != null && f.valor > 0 ? brl(porDia) : "—"}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hon-obs">Observação para o aprovador <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Textarea id="hon-obs" rows={2} maxLength={HONORARIO_TEXTO_MAX} className="rounded-lg bg-card text-sm" value={f.observacao}
                placeholder="Ex.: inclui carregamento e descarga" onChange={(e) => set({ observacao: e.target.value })} />
            </div>

            {erro && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
            {empreita && f.pessoas && Number(f.pessoas) > HONORARIO_PESSOAS_MAX && (
              <p className="text-xs text-danger">No máximo {HONORARIO_PESSOAS_MAX} pessoas.</p>
            )}
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
