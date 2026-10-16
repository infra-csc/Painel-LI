/**
 * Detalhe de um pedido de honorário (16/10): gaveta lateral com o resumo do
 * dinheiro, o motivo da última decisão, as liberações e a linha do tempo
 * (quem, quando, valor anterior → novo). A mesma gaveta nas três telas; quem
 * abre decide as ações do rodapé.
 */
import type { ReactNode } from "react";
import {
  ArrowRight, Banknote, CheckCircle2, CircleDashed, CloudOff, FilePen, History, Pencil, RotateCcw, Send, Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { apiErrorMessage, cn } from "@/lib/utils";
import { faltaLiberar, valorPorDiaria } from "@shared/honorarios-ceno";
import { useHistoricoDoHonorario, type EntradaDoHistorico, type Honorario, type Liberacao } from "./api";
import { BarraDaVerba, EtapaBadge, OrigemDaLinha, brl, dataBr, diariasTexto, periodoCurto, posicaoLabel, setorLabel, type VisaoDaEtapa } from "./pecas";

const ACOES: Record<string, { rotulo: string; icone: LucideIcon; tom: string }> = {
  criado: { rotulo: "Pedido iniciado", icone: FilePen, tom: "bg-muted text-muted-foreground" },
  editado: { rotulo: "Valor renegociado", icone: Pencil, tom: "bg-brand-soft text-primary" },
  enviado: { rotulo: "Enviado para aprovação", icone: Send, tom: "bg-warning-soft text-warning" },
  aprovado: { rotulo: "Aprovado", icone: CheckCircle2, tom: "bg-success-soft text-success" },
  aprovado_ajuste: { rotulo: "Aprovado com ajuste", icone: CheckCircle2, tom: "bg-success-soft text-success" },
  devolvido: { rotulo: "Devolvido para negociar", icone: Undo2, tom: "bg-brand-soft text-primary" },
  liberacao: { rotulo: "Verba liberada", icone: Banknote, tom: "bg-success-soft text-success" },
  liberacao_estornada: { rotulo: "Liberação estornada", icone: RotateCcw, tom: "bg-danger-soft text-danger" },
};

const quando = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

function Entrada({ e, ultima }: { e: EntradaDoHistorico; ultima: boolean }) {
  const a = ACOES[e.acao] ?? { rotulo: "Registro", icone: CircleDashed, tom: "bg-muted text-muted-foreground" };
  const Icone = a.icone;
  const mostraValor = e.valorAnterior != null || e.valorNovo != null;
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!ultima && <span aria-hidden="true" className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />}
      <span className={cn("relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-card", a.tom)} aria-hidden="true">
        <Icone className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-medium leading-5 text-foreground">{a.rotulo}</p>
        <p className="text-2xs text-muted-foreground">{e.porNome} · {quando(e.em)}</p>
        {mostraValor && (
          <p className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-xs tabular-nums text-slate-700">
            {e.valorAnterior != null && <span className={cn(e.valorNovo != null && "text-muted-foreground line-through decoration-muted-foreground/50")}>{brl(e.valorAnterior)}</span>}
            {e.valorAnterior != null && e.valorNovo != null && <ArrowRight className="h-3 w-3 text-muted-foreground" aria-label="para" />}
            {e.valorNovo != null && <span className="font-semibold text-foreground">{brl(e.valorNovo)}</span>}
          </p>
        )}
        {e.detalhe && e.detalhe !== a.rotulo && <p className="mt-0.5 text-xs text-slate-600">{e.detalhe}</p>}
        {e.motivo && (
          <p className="mt-1.5 rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-xs leading-relaxed text-slate-700">“{e.motivo}”</p>
        )}
      </div>
    </li>
  );
}

function LinhaDaLiberacao({ l, onEstornar }: { l: Liberacao; onEstornar?: (l: Liberacao) => void }) {
  const estornada = !!l.estornadaEm;
  return (
    <li className={cn("flex items-start justify-between gap-3 px-3.5 py-2.5", estornada && "bg-surface-muted/70")}>
      <div className="min-w-0">
        <p className={cn("text-sm font-medium tabular-nums text-foreground", estornada && "text-muted-foreground line-through")}>
          OC/DP {l.oc} · {dataBr(l.data)}
        </p>
        <p className="text-2xs text-muted-foreground">
          {estornada ? `Estornada por ${l.estornadaPorNome ?? "—"}${l.motivoEstorno ? ` — “${l.motivoEstorno}”` : ""}` : `Registrada por ${l.porNome}`}
          {l.observacao && !estornada ? ` · ${l.observacao}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className={cn("text-sm font-semibold tabular-nums", estornada ? "text-muted-foreground line-through" : "text-foreground")}>{brl(l.valor)}</span>
        {onEstornar && !estornada && (
          <Button type="button" variant="ghost" size="sm" className="val-alvo h-8 px-2 text-xs text-muted-foreground hover:bg-danger-soft hover:text-danger" onClick={() => onEstornar(l)}>
            Estornar
          </Button>
        )}
      </div>
    </li>
  );
}

function Resumo({ h }: { h: Honorario }) {
  const aprovado = h.valorAprovado;
  const falta = faltaLiberar(aprovado, h.liberado);
  const porDia = valorPorDiaria(aprovado ?? h.valorPedido, h.diarias);
  const celula = (rotulo: string, valor: ReactNode, sub?: ReactNode) => (
    <div className="bg-card px-3 py-2.5">
      <dt className="text-2xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-semibold tabular-nums text-foreground">{valor}</dd>
      {sub && <dd className="text-2xs text-muted-foreground">{sub}</dd>}
    </div>
  );
  return (
    <section aria-label="Valores" className="space-y-2.5">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {celula("Pedido", brl(h.valorPedido), diariasTexto(h.diarias))}
        {celula(h.status === "aprovado_ajuste" ? "Aprovado (com ajuste)" : "Aprovado", aprovado != null ? brl(aprovado) : "—", porDia != null ? `${brl(porDia)}/diária` : undefined)}
        {celula("Liberado", brl(h.liberado))}
        {celula("Falta liberar", aprovado != null ? brl(falta) : "—")}
      </dl>
      {aprovado != null && aprovado > 0 && <BarraDaVerba aprovado={aprovado} liberado={h.liberado} />}
    </section>
  );
}

export function HistoricoSheet({ id, aberto, onOpenChange, visao = "pedido", acoes, onEstornar }: {
  id: string | null;
  aberto: boolean;
  onOpenChange: (o: boolean) => void;
  visao?: VisaoDaEtapa;
  /** Botões do rodapé (cada tela decide). */
  acoes?: (h: Honorario) => ReactNode;
  /** Financeiro: estornar uma liberação. */
  onEstornar?: (h: Honorario, l: Liberacao) => void;
}) {
  const q = useHistoricoDoHonorario(aberto ? id : null);
  const h = q.data?.honorario;
  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[460px]">
        <SheetHeader className="space-y-1 border-b border-border px-5 pb-4 pt-5 text-left">
          <div className="flex items-center gap-2 pr-8">
            <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <SheetTitle className="truncate text-base font-semibold">{h?.nome ?? "Pedido de honorário"}</SheetTitle>
          </div>
          <SheetDescription asChild>
            <div className="space-y-1.5">
              {h ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    <OrigemDaLinha h={h} /> · {h.eventName ?? "Evento"} · {periodoCurto(h.inicio, h.fim)}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <EtapaBadge h={h} visao={visao} />
                    <span className="text-2xs text-muted-foreground">{setorLabel(h.setor)} · {posicaoLabel(h.posicao)}</span>
                  </div>
                </>
              ) : <span className="text-xs text-muted-foreground">Carregando…</span>}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {q.isLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Carregando o histórico">
              <div className="val-osso h-28 w-full" />
              <div className="val-osso h-4 w-2/3" />
              <div className="val-osso h-4 w-1/2" />
              <div className="val-osso h-4 w-3/5" />
            </div>
          ) : q.error || !h ? (
            <div role="alert" className="rounded-xl border border-danger/25 bg-card px-4 py-6 text-center">
              <CloudOff className="mx-auto h-5 w-5 text-danger" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-foreground">Não foi possível abrir o histórico</p>
              <p className="mt-1 text-xs text-muted-foreground">{apiErrorMessage(q.error, "Tente de novo.")}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => q.refetch()}>Tentar de novo</Button>
            </div>
          ) : (
            <>
              <Resumo h={h} />
              {(h.status === "devolvido" || h.status === "aprovado_ajuste") && h.motivoDecisao && (
                <p className={cn("rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed", h.status === "devolvido" ? "border-primary/20 bg-brand-soft text-slate-700" : "border-success/20 bg-success-soft/60 text-slate-700")}>
                  <span className="block text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {h.status === "devolvido" ? "Por que voltou" : "Motivo do ajuste"} · {h.decididoPorNome}
                  </span>
                  {h.motivoDecisao}
                </p>
              )}
              {h.descricao && (
                <p className="text-xs leading-relaxed text-slate-700"><span className="font-semibold text-foreground">Descrição: </span>{h.descricao}</p>
              )}
              {h.observacao && (
                <p className="text-xs leading-relaxed text-slate-700"><span className="font-semibold text-foreground">Observação: </span>{h.observacao}</p>
              )}
              {(q.data?.liberacoes.length ?? 0) > 0 && (
                <section aria-labelledby="hon-libs" className="space-y-2">
                  <h3 id="hon-libs" className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Liberações</h3>
                  <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {q.data!.liberacoes.map((l) => <LinhaDaLiberacao key={l.id} l={l} onEstornar={onEstornar ? (x) => onEstornar(h, x) : undefined} />)}
                  </ul>
                </section>
              )}
              <section aria-labelledby="hon-hist" className="space-y-2.5">
                <h3 id="hon-hist" className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Histórico</h3>
                <ol className="pl-0.5">
                  {q.data!.historico.map((e, i) => <Entrada key={e.id} e={e} ultima={i === q.data!.historico.length - 1} />)}
                </ol>
              </section>
            </>
          )}
        </div>

        {h && acoes && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-muted/60 px-5 py-3">{acoes(h)}</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
