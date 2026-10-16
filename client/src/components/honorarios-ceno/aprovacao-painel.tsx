/**
 * Honorários — a aba do APROVADOR na Aprovação de escala (16/10). "Em outra
 * aba, pois é financeiro": as vagas e os pedidos da escala ficam nas abas
 * deles; aqui só dinheiro.
 *
 * Aguardando: os pedidos por evento, com o total do evento, o valor por
 * diária e as três decisões — aprovar, aprovar com ajuste (valor novo +
 * motivo) e devolver para negociar (motivo). Aprovar e devolver vão em lote;
 * o ajuste é um por vez. Decididos: o que já passou por aqui e a verba.
 */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCheck, CheckCircle2, CircleDollarSign, CloudOff, History, Inbox, Loader2, MessageSquareText, Pencil, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { CurrencyInput } from "@/components/common/currency-input";
import { useToast } from "@/hooks/use-toast";
import { isApiError } from "@/lib/queryClient";
import { apiErrorMessage, cn } from "@/lib/utils";
import { BotaoTentarDeNovo, EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";
import { APROVAR_DA_LINHA, ICONE_DA_LINHA, MOLDURA, SOBRE_ESCURO, TH } from "@/components/scaling-approval/tokens";
import { HONORARIO_TEXTO_MAX, validarAjuste, validarMotivo, valorPorDiaria } from "@shared/honorarios-ceno";
import { useFilaDeAprovacao, useMutacoesDoAprovador, type Honorario } from "./api";
import { BarraDaVerba, EtapaBadge, OrigemDaLinha, ValorComDiaria, brl, brlCurto, dataBr, diariasTexto, haQuanto, periodoCurto, posicaoLabel, setorLabel } from "./pecas";
import { HistoricoSheet } from "./historico-sheet";

type Situacao = "pendentes" | "decididos";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Agrupa por evento mantendo a ordem do servidor (evento mais recente primeiro). */
function porEvento(linhas: Honorario[]) {
  const mapa = new Map<string, { id: string; nome: string; inicio: string | null; fim: string | null; linhas: Honorario[] }>();
  for (const h of linhas) {
    const g = mapa.get(h.eventId) ?? { id: h.eventId, nome: h.eventName ?? "Evento", inicio: h.eventStartDate, fim: h.eventEndDate, linhas: [] };
    g.linhas.push(h);
    mapa.set(h.eventId, g);
  }
  return Array.from(mapa.values());
}

// ── Diálogos ────────────────────────────────────────────────────────────────

function AjusteDialog({ h, onClose }: { h: Honorario | null; onClose: () => void }) {
  const { ajustar } = useMutacoesDoAprovador();
  const { toast } = useToast();
  const [valor, setValor] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  if (h && aberto !== h.id) { setAberto(h.id); setValor(h.valorPedido); setMotivo(""); setErro(null); }
  if (!h) return null;
  const diferenca = valor - h.valorPedido;
  const porDia = valorPorDiaria(valor, h.diarias);
  const salvar = async () => {
    const e = validarAjuste(h.valorPedido, valor, motivo);
    if (e) { setErro(e); return; }
    try {
      await ajustar.mutateAsync({ id: h.id, versao: h.versao, valor, motivo: motivo.trim() });
      toast({ variant: "success", title: "Aprovado com ajuste", description: `${h.nome}: ${brl(h.valorPedido)} → ${brl(valor)}. O Financeiro já vê para liberar.` });
      onClose();
    } catch (err) {
      if (isApiError(err) && (err.status === 409 || err.status === 404)) {
        toast({ title: "Este pedido já tinha sido decidido", description: "A lista foi atualizada." });
        onClose();
        return;
      }
      setErro(apiErrorMessage(err, "Não foi possível aprovar. Tente de novo."));
    }
  };
  return (
    <Dialog open={!!h} onOpenChange={(o) => { if (!o && !ajustar.isPending) onClose(); }}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="pr-8 text-base font-semibold">Aprovar com ajuste</DialogTitle>
          <DialogDescription className="text-xs">{h.nome} · {h.eventName} · {setorLabel(h.setor)} · {posicaoLabel(h.posicao)} · {diariasTexto(h.diarias)}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4 px-6 py-5" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-surface-muted/60 px-3.5 py-3">
              <p className="text-2xs text-muted-foreground">Pedido</p>
              <p className="text-base font-semibold tabular-nums text-muted-foreground line-through decoration-muted-foreground/40">{brl(h.valorPedido)}</p>
              <p className="text-2xs tabular-nums text-muted-foreground">{valorPorDiaria(h.valorPedido, h.diarias) != null ? `${brl(valorPorDiaria(h.valorPedido, h.diarias)!)}/diária` : "—"}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hon-ajuste-valor" className="text-xs">Valor aprovado</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <CurrencyInput id="hon-ajuste-valor" value={valor} onChange={(c) => { setErro(null); setValor(c); }} className="h-11 bg-card pl-9 text-base tabular-nums" aria-label="Valor aprovado" />
              </div>
              <p className="text-2xs tabular-nums text-muted-foreground" aria-live="polite">
                {porDia != null ? `${brl(porDia)}/diária` : "—"}
                {diferenca !== 0 && <span className={cn("ml-1.5 font-semibold", diferenca < 0 ? "text-success" : "text-warning")}>{diferenca < 0 ? "−" : "+"}{brl(Math.abs(diferenca))}</span>}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hon-ajuste-motivo">Motivo do ajuste (obrigatório)</Label>
            <Textarea id="hon-ajuste-motivo" rows={3} maxLength={HONORARIO_TEXTO_MAX} value={motivo} onChange={(e) => { setErro(null); setMotivo(e.target.value); }}
              className="rounded-lg bg-card text-sm" placeholder="Ex.: fechado em 4 diárias com a produção" />
            <p className="text-2xs text-muted-foreground">Fica no histórico do pedido e é o que a cenotécnica lê.</p>
          </div>
          {erro && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
        </form>
        <DialogFooter className="gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={ajustar.isPending}>Cancelar</Button>
          <Button type="button" className="bg-success text-white hover:bg-success/90" onClick={() => void salvar()} disabled={ajustar.isPending}>
            {ajustar.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            {ajustar.isPending ? "Aprovando…" : `Aprovar ${brl(valor)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListaDoLote({ linhas }: { linhas: Honorario[] }) {
  return (
    <ul className="max-h-[220px] divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card text-xs">
      {linhas.map((h) => (
        <li key={h.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">{h.nome}</span>
            <span className="block text-2xs text-muted-foreground">{h.eventName} · {diariasTexto(h.diarias)}</span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-foreground">{brlCurto(h.valorAprovado ?? h.valorPedido)}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Linha ───────────────────────────────────────────────────────────────────

function LinhaPendente({ h, marcado, onMarcar, onAprovar, onAjustar, onDevolver, onHistorico, ocupado }: {
  h: Honorario; marcado: boolean; ocupado: boolean;
  onMarcar: () => void; onAprovar: () => void; onAjustar: () => void; onDevolver: () => void; onHistorico: () => void;
}) {
  return (
    <tr data-selecionada={marcado || undefined} data-testid={`hon-apr-${h.id}`}
      className={cn("apr-linha border-b border-border align-top last:border-b-0", marcado ? "bg-brand-soft/50" : "bg-card hover:bg-surface-muted/60")}>
      <td data-col="sel" className="w-11 py-3 pl-3 pr-1">
        <span className="inline-flex h-5 items-center">
          {h.podeDecidir && <Checkbox checked={marcado} onCheckedChange={onMarcar} aria-label={`Selecionar ${h.nome}`} />}
        </span>
      </td>
      <td data-primeira className="px-3 py-3">
        <span className="block break-words text-sm font-semibold leading-5 text-foreground">{h.nome}</span>
        <span className="block"><OrigemDaLinha h={h} /></span>
        <span className="mt-0.5 block text-2xs text-slate-600">{setorLabel(h.setor)} · {posicaoLabel(h.posicao)}</span>
        {h.observacao && (
          <span className="mt-1.5 flex items-start gap-1.5 text-2xs text-slate-600">
            <MessageSquareText className="mt-px h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="line-clamp-2">{h.observacao}</span>
          </span>
        )}
      </td>
      <td data-rotulo="Montagem" className="px-3 py-3">
        <span className="block text-xs tabular-nums text-foreground">{periodoCurto(h.inicio, h.fim)}</span>
        <span className="block text-2xs text-muted-foreground">{diariasTexto(h.diarias)}</span>
      </td>
      <td data-rotulo="Valor pedido" className="px-3 py-3"><ValorComDiaria valor={h.valorPedido} diarias={h.diarias} alinhar="esquerda" className="xl:text-right" /></td>
      <td data-rotulo="Pedido por" className="px-3 py-3">
        <span className="block text-xs font-medium text-foreground">{h.enviadoPorNome ?? h.criadoPorNome}</span>
        <span className="block text-2xs text-muted-foreground">{haQuanto(h.enviadoEm)}</span>
      </td>
      <td data-col="acoes" className="whitespace-nowrap py-2.5 pl-2 pr-3 text-right">
        <span className="inline-flex items-center gap-0.5">
          <button type="button" className={cn(ICONE_DA_LINHA, "hover:bg-muted hover:text-foreground")} onClick={onHistorico} aria-label={`Histórico de ${h.nome}`} title="Histórico">
            <History className="h-4 w-4" aria-hidden="true" />
          </button>
          {h.podeDecidir && (
            <>
              <button type="button" disabled={ocupado} className={cn(ICONE_DA_LINHA, "hover:bg-brand-soft hover:text-primary")} onClick={onDevolver} aria-label={`Devolver ${h.nome} para negociar`} title="Devolver para negociar">
                <Undo2 className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" disabled={ocupado} className={cn(ICONE_DA_LINHA, "mr-1 hover:bg-warning-soft hover:text-warning")} onClick={onAjustar} aria-label={`Aprovar ${h.nome} com ajuste`} title="Aprovar com ajuste">
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" disabled={ocupado} className={cn(APROVAR_DA_LINHA, "w-[92px]")} onClick={onAprovar} aria-label={`Aprovar ${h.nome}`}>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Aprovar
              </button>
            </>
          )}
        </span>
      </td>
    </tr>
  );
}

function CabecalhoPendente({ todos, algum, onTodos, n }: { todos: boolean; algum: boolean; onTodos: () => void; n: number }) {
  return (
    <thead className="apr-cabecalho sticky z-10 border-b border-border bg-surface-muted [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl">
      <tr>
        <th scope="col" data-col={n > 0 ? "sel" : "sel-vazio"} className="w-11 py-2.5 pl-3 pr-1 text-left">
          <span className="inline-flex h-5 items-center gap-2.5">
            <Checkbox checked={todos ? true : algum ? "indeterminate" : false} disabled={n === 0} onCheckedChange={onTodos}
              aria-label={todos ? "Desmarcar todos os pedidos do evento" : "Selecionar todos os pedidos do evento"} />
            <span className="apr-so-cartao whitespace-nowrap text-xs font-medium text-slate-600" aria-hidden="true">{todos ? "Desmarcar todos" : `Selecionar todos (${n})`}</span>
          </span>
        </th>
        <th scope="col" className={TH}>Pessoa</th>
        <th scope="col" className={cn(TH, "w-[140px]")}>Montagem</th>
        <th scope="col" className={cn(TH, "w-[160px] text-right")}>Valor pedido</th>
        <th scope="col" className={cn(TH, "w-[160px]")}>Pedido por</th>
        <th scope="col" className={cn(TH, "w-[236px] text-right")}>Decisão</th>
      </tr>
    </thead>
  );
}

function Pendentes({ eventId }: { eventId: string | null }) {
  const q = useFilaDeAprovacao("pendentes", eventId);
  const { aprovar, devolver, lote } = useMutacoesDoAprovador();
  const { toast } = useToast();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [aprovando, setAprovando] = useState<Honorario[] | null>(null);
  const [devolvendo, setDevolvendo] = useState<Honorario[] | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ajustando, setAjustando] = useState<Honorario | null>(null);
  const [historicoId, setHistoricoId] = useState<string | null>(null);

  const linhas = useMemo(() => q.data ?? [], [q.data]);
  const grupos = useMemo(() => porEvento(linhas), [linhas]);
  const decidiveis = linhas.filter((h) => h.podeDecidir);
  const marcados = decidiveis.filter((h) => sel.has(h.id));
  const totalMarcado = marcados.reduce((s, h) => s + h.valorPedido, 0);
  const ocupado = aprovar.isPending || devolver.isPending || lote.isPending;

  if (q.isLoading) return <div className={cn(MOLDURA, "space-y-2 p-4")} aria-busy="true" aria-label="Carregando pedidos de honorário">{[0, 1, 2].map((i) => <div key={i} className="val-osso h-12 w-full" />)}</div>;
  if (q.error) {
    return <EstadoDaValidacao tom="erro" icone={<CloudOff aria-hidden="true" />} titulo="Não foi possível carregar os honorários"
      texto={apiErrorMessage(q.error, "Verifique sua conexão e tente novamente.")} acao={<BotaoTentarDeNovo onClick={() => q.refetch()} tentando={q.isFetching} />} testId="hon-apr-erro" />;
  }
  if (linhas.length === 0) {
    return <EstadoDaValidacao icone={<CheckCircle2 aria-hidden="true" />} titulo="Nenhum honorário aguardando aprovação"
      texto={eventId ? "Não há valor da cenotécnica esperando decisão neste evento." : "Quando a cenotécnica enviar o valor negociado, os pedidos aparecem aqui por evento."} testId="hon-apr-vazio" />;
  }

  const alternar = (ids: string[], ligar: boolean) => setSel((s) => { const n = new Set(s); for (const id of ids) { if (ligar) n.add(id); else n.delete(id); } return n; });

  const confirmarAprovar = async () => {
    if (!aprovando) return;
    try {
      if (aprovando.length === 1) {
        await aprovar.mutateAsync({ id: aprovando[0].id, versao: aprovando[0].versao });
        toast({ variant: "success", title: "Honorário aprovado", description: `${aprovando[0].nome} · ${brl(aprovando[0].valorPedido)}. O Financeiro já vê para liberar.` });
      } else {
        const r = await lote.mutateAsync({ acao: "aprovar", itens: aprovando.map((h) => ({ id: h.id, versao: h.versao })) });
        toast({ variant: "success", title: `${plural(r.feitos?.length ?? 0, "honorário aprovado", "honorários aprovados")}`, description: r.recusados.length ? `${r.recusados.length} já tinham mudado e ficaram de fora.` : "O Financeiro já vê para liberar." });
      }
      setSel(new Set());
      setAprovando(null);
    } catch (e) {
      toast({ variant: isApiError(e) && e.status === 409 ? "default" : "destructive", title: isApiError(e) && e.status === 409 ? "Este pedido já tinha sido decidido" : "Não foi possível aprovar", description: apiErrorMessage(e, "Tente de novo.") });
      if (isApiError(e) && (e.status === 409 || e.status === 404)) setAprovando(null);
    }
  };

  const confirmarDevolver = async () => {
    if (!devolvendo) return;
    const erro = validarMotivo(motivo, "o que precisa ser renegociado");
    if (erro) return;
    try {
      if (devolvendo.length === 1) {
        await devolver.mutateAsync({ id: devolvendo[0].id, versao: devolvendo[0].versao, motivo: motivo.trim() });
      } else {
        await lote.mutateAsync({ acao: "devolver", itens: devolvendo.map((h) => ({ id: h.id, versao: h.versao })), motivo: motivo.trim() });
      }
      toast({ title: devolvendo.length === 1 ? "Devolvido para negociar" : `${devolvendo.length} pedidos devolvidos`, description: "A cenotécnica recebe o aviso com o seu motivo." });
      setSel(new Set());
      setDevolvendo(null);
      setMotivo("");
    } catch (e) {
      toast({ variant: "destructive", title: "Não foi possível devolver", description: apiErrorMessage(e, "Tente de novo.") });
      if (isApiError(e) && (e.status === 409 || e.status === 404)) setDevolvendo(null);
    }
  };

  return (
    <>
      <div className="space-y-5">
        {grupos.map((g) => {
          const ids = g.linhas.filter((h) => h.podeDecidir).map((h) => h.id);
          const todos = ids.length > 0 && ids.every((id) => sel.has(id));
          const algum = ids.some((id) => sel.has(id));
          const total = g.linhas.reduce((s, h) => s + h.valorPedido, 0);
          const diarias = g.linhas.reduce((s, h) => s + (h.diarias ?? 0), 0);
          return (
            <section key={g.id} aria-label={`Honorários de ${g.nome}`} className="space-y-2" data-testid={`hon-apr-evento-${g.id}`}>
              <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">{g.nome}</h3>
                  <p className="text-2xs text-muted-foreground">{dataBr(g.inicio)}{g.fim && g.fim !== g.inicio ? ` a ${dataBr(g.fim)}` : ""} · {plural(g.linhas.length, "pedido", "pedidos")} · {plural(diarias, "diária", "diárias")}</p>
                </div>
                <p className="text-right">
                  <span className="block text-2xs text-muted-foreground">Total do evento</span>
                  <span className="block text-base font-semibold tabular-nums text-foreground" data-testid="hon-apr-total-evento">{brl(total)}</span>
                </p>
              </header>
              <div className="apr-tabela xl:rounded-xl xl:border xl:border-border xl:bg-card xl:shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]">
                <table className="w-full table-fixed text-sm">
                  <caption className="sr-only">Honorários aguardando aprovação em {g.nome}</caption>
                  <CabecalhoPendente n={ids.length} todos={todos} algum={algum && !todos} onTodos={() => alternar(ids, !todos)} />
                  <tbody>
                    {g.linhas.map((h) => (
                      <LinhaPendente key={h.id} h={h} marcado={sel.has(h.id)} ocupado={ocupado}
                        onMarcar={() => alternar([h.id], !sel.has(h.id))}
                        onAprovar={() => setAprovando([h])}
                        onAjustar={() => setAjustando(h)}
                        onDevolver={() => { setMotivo(""); setDevolvendo([h]); }}
                        onHistorico={() => setHistoricoId(h.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      {/* Portal: dentro da aba (que anima com transform) o "fixed" virava relativo à aba e a barra ficava fora da tela. */}
      {marcados.length > 0 && createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div role="region" aria-label="Ações para os honorários selecionados"
            className="val-sobe pointer-events-auto flex w-full max-w-2xl flex-col items-stretch gap-2.5 rounded-xl bg-foreground px-3.5 py-2.5 text-white shadow-3 md:w-auto md:flex-row md:items-center md:gap-3 md:py-2 md:pl-4 md:pr-2">
            <div className="flex min-w-0 items-center gap-2.5" aria-live="polite">
              <CheckCheck className="h-4 w-4 shrink-0 text-white/60" aria-hidden="true" />
              <span className="flex-1 whitespace-nowrap text-sm font-semibold">{plural(marcados.length, "selecionado", "selecionados")} · <span className="tabular-nums">{brl(totalMarcado)}</span></span>
              <Button type="button" size="sm" variant="ghost" className="val-alvo h-8 w-8 shrink-0 rounded-lg p-0 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setSel(new Set())} aria-label="Limpar seleção">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <span aria-hidden="true" className="hidden h-6 w-px bg-white/15 md:block" />
            <div className="flex items-center gap-1.5">
              <Button type="button" size="sm" variant="ghost" className={cn(SOBRE_ESCURO, "flex-1 md:flex-none")} disabled={ocupado} onClick={() => { setMotivo(""); setDevolvendo(marcados); }}>
                <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Devolver ({marcados.length})
              </Button>
              <Button type="button" size="sm" className="val-alvo h-8 flex-[1.6] rounded-lg bg-success px-3 text-xs font-semibold text-white hover:bg-success/90 md:flex-none" disabled={ocupado} onClick={() => setAprovando(marcados)}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Aprovar ({marcados.length})
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <ConfirmDialog
        open={!!aprovando}
        onOpenChange={(o) => { if (!o && !ocupado) setAprovando(null); }}
        title={aprovando && aprovando.length > 1 ? `Aprovar ${aprovando.length} honorários?` : "Aprovar o honorário?"}
        description={aprovando && aprovando.length === 1 ? `${aprovando[0].nome} · ${aprovando[0].eventName}. O valor vai para o Financeiro liberar.` : "Os valores vão para o Financeiro liberar. Para mudar depois, você devolve para negociar."}
        icon={CheckCircle2}
        className="!max-w-[540px]"
        cancelLabel="Voltar"
        confirmLabel={ocupado ? "Aprovando…" : `Aprovar · ${brl((aprovando ?? []).reduce((s, h) => s + h.valorPedido, 0))}`}
        pending={ocupado}
        onConfirm={() => { void confirmarAprovar(); }}
        testId="hon-aprovar-dialogo"
      >
        {aprovando && aprovando.length > 1 && <ListaDoLote linhas={aprovando} />}
        {aprovando && aprovando.length === 1 && (
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border text-xs">
            {[["Valor", brl(aprovando[0].valorPedido)], ["Diárias", String(aprovando[0].diarias ?? "—")], ["Por diária", valorPorDiaria(aprovando[0].valorPedido, aprovando[0].diarias) != null ? brl(valorPorDiaria(aprovando[0].valorPedido, aprovando[0].diarias)!) : "—"]].map(([r, v]) => (
              <div key={r} className="bg-card px-3 py-2"><dt className="text-2xs text-muted-foreground">{r}</dt><dd className="font-semibold tabular-nums text-foreground">{v}</dd></div>
            ))}
          </dl>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!devolvendo}
        onOpenChange={(o) => { if (!o && !ocupado) setDevolvendo(null); }}
        title={devolvendo && devolvendo.length > 1 ? `Devolver ${devolvendo.length} pedidos para negociar?` : "Devolver para negociar?"}
        description="O pedido volta para a cenotécnica com o seu motivo; ela ajusta e envia de novo."
        icon={Undo2}
        className="!max-w-[540px]"
        cancelLabel="Voltar"
        confirmLabel={ocupado ? "Devolvendo…" : devolvendo && devolvendo.length > 1 ? `Devolver (${devolvendo.length})` : "Devolver"}
        pending={ocupado}
        confirmDisabled={!!validarMotivo(motivo)}
        onConfirm={() => { void confirmarDevolver(); }}
        testId="hon-devolver-dialogo"
      >
        {devolvendo && devolvendo.length > 1 && <ListaDoLote linhas={devolvendo} />}
        <div className="space-y-1.5">
          <Label htmlFor="hon-devolver-motivo" className="text-sm font-medium text-foreground">O que precisa ser renegociado (obrigatório)</Label>
          <Textarea id="hon-devolver-motivo" rows={3} maxLength={HONORARIO_TEXTO_MAX} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            className="rounded-lg bg-card text-sm" placeholder="Ex.: acima do combinado para 3 diárias — rever com o freela" />
          {devolvendo && devolvendo.length > 1 && <p className="text-2xs text-muted-foreground">O mesmo motivo vai para os {devolvendo.length} pedidos.</p>}
        </div>
      </ConfirmDialog>

      <AjusteDialog h={ajustando} onClose={() => setAjustando(null)} />
      <HistoricoSheet id={historicoId} aberto={!!historicoId} onOpenChange={(o) => { if (!o) setHistoricoId(null); }} visao="aprovacao" />
    </>
  );
}

function Decididos({ eventId }: { eventId: string | null }) {
  const q = useFilaDeAprovacao("decididos", eventId);
  const { devolver } = useMutacoesDoAprovador();
  const { toast } = useToast();
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const [devolvendo, setDevolvendo] = useState<Honorario | null>(null);
  const [motivo, setMotivo] = useState("");
  if (q.isLoading) return <div className={cn(MOLDURA, "space-y-2 p-4")} aria-busy="true" aria-label="Carregando decididos">{[0, 1, 2].map((i) => <div key={i} className="val-osso h-10 w-full" />)}</div>;
  if (q.error) return <EstadoDaValidacao tom="erro" icone={<CloudOff aria-hidden="true" />} titulo="Não foi possível carregar os decididos" texto={apiErrorMessage(q.error, "Tente de novo.")} acao={<BotaoTentarDeNovo onClick={() => q.refetch()} tentando={q.isFetching} />} />;
  const linhas = q.data ?? [];
  if (linhas.length === 0) return <EstadoDaValidacao icone={<Inbox aria-hidden="true" />} titulo="Nada decidido ainda" texto="Os honorários que você aprovar ou devolver ficam aqui, com a situação da verba." />;
  const confirmar = async () => {
    if (!devolvendo || validarMotivo(motivo)) return;
    try {
      await devolver.mutateAsync({ id: devolvendo.id, versao: devolvendo.versao, motivo: motivo.trim() });
      toast({ title: "Aprovação desfeita", description: `${devolvendo.nome} voltou para negociar.` });
      setDevolvendo(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Não foi possível devolver", description: apiErrorMessage(e, "Tente de novo.") });
      if (isApiError(e) && (e.status === 409 || e.status === 404)) setDevolvendo(null);
    }
  };
  return (
    <>
      <ul className={cn(MOLDURA, "divide-y divide-border overflow-hidden")} data-testid="hon-decididos">
        {linhas.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <span className="min-w-0 flex-1 basis-[220px]">
              <span className="block truncate text-sm font-semibold text-foreground">{h.nome}</span>
              <span className="block truncate text-2xs text-muted-foreground">{h.eventName} · {setorLabel(h.setor)} · {posicaoLabel(h.posicao)}</span>
            </span>
            <span className="w-[150px] shrink-0"><EtapaBadge h={h} visao="aprovacao" /><span className="mt-1 block text-2xs text-muted-foreground">{h.decididoPorNome} · {haQuanto(h.decididoEm)}</span></span>
            <span className="w-[130px] shrink-0"><ValorComDiaria valor={h.valorAprovado ?? h.valorPedido} diarias={h.diarias} riscado={h.valorAprovado != null ? h.valorPedido : null} /></span>
            <span className="hidden w-[120px] shrink-0 md:block">{h.valorAprovado ? <BarraDaVerba aprovado={h.valorAprovado} liberado={h.liberado} /> : <span className="text-2xs text-muted-foreground">—</span>}</span>
            <span className="ml-auto inline-flex shrink-0 items-center gap-0.5">
              {h.podeDevolver && h.status !== "devolvido" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className={cn(ICONE_DA_LINHA, "hover:bg-brand-soft hover:text-primary")} onClick={() => { setMotivo(""); setDevolvendo(h); }} aria-label={`Desfazer a aprovação de ${h.nome}`}>
                      <Undo2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Devolver para negociar (sem verba liberada ainda)</TooltipContent>
                </Tooltip>
              )}
              <button type="button" className={cn(ICONE_DA_LINHA, "hover:bg-muted hover:text-foreground")} onClick={() => setHistoricoId(h.id)} aria-label={`Histórico de ${h.nome}`}>
                <History className="h-4 w-4" aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!devolvendo}
        onOpenChange={(o) => { if (!o && !devolver.isPending) setDevolvendo(null); }}
        title="Desfazer a aprovação e devolver?"
        description={devolvendo ? `${devolvendo.nome} volta para a cenotécnica negociar. O Financeiro deixa de ver para liberar.` : undefined}
        icon={Undo2}
        cancelLabel="Voltar"
        confirmLabel={devolver.isPending ? "Devolvendo…" : "Devolver"}
        pending={devolver.isPending}
        confirmDisabled={!!validarMotivo(motivo)}
        onConfirm={() => { void confirmar(); }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="hon-desfazer-motivo">Motivo (obrigatório)</Label>
          <Textarea id="hon-desfazer-motivo" rows={3} maxLength={HONORARIO_TEXTO_MAX} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="rounded-lg bg-card text-sm" />
        </div>
      </ConfirmDialog>
      <HistoricoSheet id={historicoId} aberto={!!historicoId} onOpenChange={(o) => { if (!o) setHistoricoId(null); }} visao="aprovacao" />
    </>
  );
}

export function AprovacaoPainel({ eventId }: { eventId: string | null }) {
  const [situacao, setSituacao] = useState<Situacao>("pendentes");
  const pend = useFilaDeAprovacao("pendentes", eventId);
  const n = pend.data?.length ?? 0;
  const total = (pend.data ?? []).reduce((s, h) => s + h.valorPedido, 0);
  const seg = (v: Situacao, rotulo: string, cont?: number) => (
    <button type="button" role="radio" aria-checked={situacao === v} onClick={() => setSituacao(v)}
      className={cn("val-alvo inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-[color,background-color,box-shadow] duration-150",
        situacao === v ? "bg-card font-semibold text-primary shadow-1 ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
      {rotulo}
      {cont !== undefined && cont > 0 && <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-warning-soft px-1.5 text-2xs font-semibold tabular-nums text-warning">{cont}</span>}
    </button>
  );
  return (
    <div className="space-y-4" data-testid="hon-aprovacao">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-1">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success" aria-hidden="true"><CircleDollarSign className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Honorários da cenotécnica</p>
            <p className="text-2xs text-muted-foreground">
              {pend.isLoading ? "Carregando…" : n ? `${plural(n, "pedido aguardando", "pedidos aguardando")} · ${brl(total)}` : "Nada aguardando a sua decisão"}
            </p>
          </div>
        </div>
        <div role="radiogroup" aria-label="Situação dos honorários" className="inline-flex gap-0.5 rounded-lg border border-border bg-background p-[3px]">
          {seg("pendentes", "Aguardando", n)}
          {seg("decididos", "Decididos")}
        </div>
      </div>
      {situacao === "pendentes" ? <Pendentes eventId={eventId} /> : <Decididos eventId={eventId} />}
    </div>
  );
}
