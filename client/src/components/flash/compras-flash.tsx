/**
 * COMPRAS FLASH — a aba "Compras" do Cartão Flash (28/10, Honorários — Fase 3,
 * arquivos). Só admin e DP (a página já é do grupo financeiro; as rotas são
 * `requireFinanceUser`).
 *
 * Em cima, "A comprar": o período (e o evento, opcional) → a prévia por
 * colaborador dos créditos de alimentação e mobilidade que ainda não entraram
 * em nenhuma compra, com os avisos (sem CPF e valor zero ficam FORA do lote;
 * inativo só avisa) → "Gerar lote nº N" (confirmação com o aviso do CPF e do
 * layout provisório) grava o lote e baixa o arquivo. Embaixo, os lotes
 * gerados: baixar de novo (cada download é auditado), marcar como pago à Flash
 * e cancelar com motivo (devolve os créditos para "a comprar").
 *
 * O CPF aparece MASCARADO na tela; completo só no arquivo. O layout do arquivo
 * é PROVISÓRIO até o oficial da Flash chegar (shared/formatos-de-arquivo.ts).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Ban, BadgeCheck, CalendarRange, Download, FileSpreadsheet, FileText, Info, Loader2, PackageCheck, PackagePlus,
  RotateCw, ShieldAlert, ShoppingCart, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BuscaDaLista } from "@/components/common/barra-de-filtros";
import { EventSearchSelect } from "@/components/event-select";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { normalizarBusca } from "@shared/contratos";
import { MOTIVO_DO_CANCELAMENTO_MAX, MOTIVO_DO_CANCELAMENTO_MIN, erroDoPeriodo, rotuloDoLote } from "@shared/flash-compras";
import type { Event } from "@shared/schema";
import { formatCurrency } from "./flash-types";
import {
  baixarArquivoDoLote, useAcoesDasCompras, useLotesFlash, usePreviaDaCompra,
  type FiltroDaCompraNaTela, type LinhaDaPrevia, type LoteFlash, type PreviaDaCompraApi,
} from "./use-compras-flash";

type Extensao = "csv" | "xlsx";
const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const dataHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
};
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const inicioDoMes = (hoje: string) => `${hoje.slice(0, 8)}01`;

/** A marca do layout provisório (repete na prévia, no diálogo e nos lotes). */
export function MarcaDoLayoutProvisorio({ quem = "da Flash", className }: { quem?: string; className?: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn("inline-flex items-center gap-1 rounded-full border border-warning/35 bg-warning-soft px-2 py-0.5 text-2xs font-semibold text-warning whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} data-testid="marca-layout-provisorio">
            <Info className="h-3 w-3" aria-hidden="true" />Layout provisório
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[300px] text-xs font-normal leading-relaxed">
          O layout oficial {quem} ainda não chegou. O arquivo sai num formato provisório (marcado no topo e no nome): confira antes de subir. Quando o oficial chegar, só o formato muda — os lotes continuam valendo.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Uma cifra do resumo da prévia. */
function Cifra({ rotulo, valor, sub, tom, testid }: { rotulo: string; valor: string; sub?: string; tom?: string; testid?: string }) {
  return (
    <div className="min-w-0 px-4 pt-3 pb-3" data-testid={testid}>
      <p className="m-0 text-xs font-medium text-slate-600 truncate">{rotulo}</p>
      <p className={cn("m-0 mt-1 text-lg font-semibold leading-6 tracking-[-0.01em] tabular-nums truncate", tom ?? "text-foreground")}>{valor}</p>
      {sub && <p className="m-0 text-2xs sm:text-xs text-muted-foreground truncate">{sub}</p>}
    </div>
  );
}

function ChipDoAviso({ texto, bloqueia }: { texto: string; bloqueia: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium", bloqueia ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />{texto}
    </span>
  );
}

/** Uma linha da prévia: no celular vira cartão (nome em cima, valores embaixo). */
function LinhaDaPreviaDaCompra({ l }: { l: LinhaDaPrevia }) {
  return (
    <li className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 py-2.5 border-b border-border last:border-b-0 md:grid-cols-[minmax(0,1fr)_64px_120px_120px_130px] md:items-center", !l.entra && "bg-surface-muted/70")}
      data-testid={`compra-linha-${l.collaboratorId}`}>
      <div className="min-w-0">
        <p className={cn("m-0 text-sm font-medium leading-5 break-words", l.entra ? "text-foreground" : "text-muted-foreground")}>{l.nome}</p>
        <p className="m-0 text-2xs tabular-nums text-muted-foreground">{l.cpfMascarado ? `CPF ${l.cpfMascarado}` : "sem CPF"}</p>
        {l.avisos.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">{l.avisos.map((a) => <ChipDoAviso key={a.codigo} texto={a.texto} bloqueia={a.bloqueia} />)}</div>
        )}
      </div>
      <p className="m-0 hidden text-right text-xs tabular-nums text-muted-foreground md:block">{l.lancamentos}</p>
      <p className="m-0 hidden text-right text-sm tabular-nums text-foreground md:block">{formatCurrency(l.alimentacaoCents)}</p>
      <p className="m-0 hidden text-right text-sm tabular-nums text-foreground md:block">{formatCurrency(l.mobilidadeCents)}</p>
      <p className={cn("m-0 self-start text-right text-sm font-semibold tabular-nums md:self-auto", l.entra ? "text-foreground" : "text-muted-foreground line-through decoration-slate-400")}>{formatCurrency(l.totalCents)}</p>
      <p className="m-0 col-span-2 text-2xs tabular-nums text-muted-foreground md:hidden">
        Alimentação {formatCurrency(l.alimentacaoCents)} · Mobilidade {formatCurrency(l.mobilidadeCents)} · {plural(l.lancamentos, "lançamento", "lançamentos")}
      </p>
    </li>
  );
}

function EscolhaDoFormato({ valor, onChange, nome }: { valor: Extensao; onChange: (v: Extensao) => void; nome: string }) {
  const opcao = (v: Extensao, titulo: string, Icone: typeof FileText) => (
    <label className={cn("inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors max-sm:flex-1 max-sm:justify-center",
      valor === v ? "bg-card text-foreground shadow-1" : "text-muted-foreground hover:text-foreground")}>
      <input type="radio" name={nome} value={v} checked={valor === v} onChange={() => onChange(v)} className="sr-only" data-testid={`${nome}-${v}`} />
      <Icone className={cn("h-4 w-4", valor === v && "text-primary")} aria-hidden="true" />{titulo}
    </label>
  );
  return (
    <div role="radiogroup" aria-label="Formato do arquivo" className="inline-flex h-[38px] items-center rounded-lg bg-muted p-0.5 max-sm:w-full">
      {opcao("xlsx", "Excel (.xlsx)", FileSpreadsheet)}
      {opcao("csv", "CSV (;)", FileText)}
    </div>
  );
}

// ── A comprar ───────────────────────────────────────────────────────────────

function PainelAComprar({ hoje, events, onGerado }: { hoje: string; events: Event[]; onGerado: (lote: LoteFlash) => void }) {
  const [filtro, setFiltro] = useState<FiltroDaCompraNaTela>(() => ({ inicio: inicioDoMes(hoje), fim: hoje, eventId: "", incluirManuais: false }));
  const [busca, setBusca] = useState("");
  const [soComAviso, setSoComAviso] = useState(false);
  const [extensao, setExtensao] = useState<Extensao>("xlsx");
  const [confirmar, setConfirmar] = useState(false);
  const erroPeriodo = erroDoPeriodo(filtro.inicio, filtro.fim);
  const q = usePreviaDaCompra(filtro, !erroPeriodo);
  const p = q.data;
  const evento = events.find((e) => e.id === filtro.eventId);

  const linhas = useMemo(() => {
    const t = normalizarBusca(busca);
    return (p?.linhas ?? []).filter((l) => (!soComAviso || l.avisos.length > 0) && (!t || normalizarBusca(l.nome).includes(t)));
  }, [p, busca, soComAviso]);
  const comAviso = (p?.linhas ?? []).filter((l) => l.avisos.length > 0).length;
  const nada = !!p && p.linhas.length === 0;
  const podeGerar = !!p && p.totais.colaboradores > 0 && !q.isFetching;

  return (
    <section aria-labelledby="compra-titulo" className="rounded-xl border border-border bg-card overflow-hidden" data-testid="compra-a-comprar">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 pt-4 pb-3 sm:px-5 border-b border-border">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-primary" aria-hidden="true"><ShoppingCart className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="compra-titulo" className="m-0 flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">A comprar <MarcaDoLayoutProvisorio /></h2>
          <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">Créditos de alimentação e mobilidade que ainda não entraram em nenhuma compra. O mesmo crédito nunca entra em dois lotes.</p>
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4 py-3 sm:px-5 border-b border-border bg-surface-muted/50" role="group" aria-label="Período da compra">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5">
          <div className="space-y-1 max-sm:basis-full">
            <Label htmlFor="compra-inicio" className="text-xs">De</Label>
            <Input id="compra-inicio" type="date" value={filtro.inicio} max={filtro.fim || undefined} onChange={(e) => setFiltro((f) => ({ ...f, inicio: e.target.value }))}
              className="h-[34px] w-full rounded-lg tabular-nums sm:w-[160px]" aria-invalid={!!erroPeriodo} data-testid="compra-inicio" />
          </div>
          <div className="space-y-1 max-sm:basis-full">
            <Label htmlFor="compra-fim" className="text-xs">Até</Label>
            <Input id="compra-fim" type="date" value={filtro.fim} min={filtro.inicio || undefined} onChange={(e) => setFiltro((f) => ({ ...f, fim: e.target.value }))}
              className="h-[34px] w-full rounded-lg tabular-nums sm:w-[160px]" aria-invalid={!!erroPeriodo} data-testid="compra-fim" />
          </div>
          <div className="min-w-0 space-y-1 max-sm:basis-full sm:w-[320px]">
            <span className="block text-xs font-medium leading-none text-foreground">Evento <span className="font-normal text-muted-foreground">(opcional)</span></span>
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <EventSearchSelect value={filtro.eventId} onValueChange={(v) => setFiltro((f) => ({ ...f, eventId: v }))} events={events} className="sm:w-full [&_button]:h-[34px]" />
              </div>
              {filtro.eventId && (
                <Button type="button" variant="ghost" className="h-[34px] w-[34px] shrink-0 rounded-lg p-0" aria-label="Todos os eventos" title="Todos os eventos"
                  onClick={() => setFiltro((f) => ({ ...f, eventId: "" }))} data-testid="compra-limpar-evento">
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
          <label className="inline-flex h-[34px] cursor-pointer items-center gap-2 text-sm text-foreground">
            <Checkbox checked={filtro.incluirManuais} onCheckedChange={(v) => setFiltro((f) => ({ ...f, incluirManuais: v === true }))} data-testid="compra-manuais" />
            <span>Incluir lançamentos manuais <span className="text-muted-foreground">(crédito inicial, ajustes)</span></span>
          </label>
        </div>
        {erroPeriodo && <p role="alert" className="m-0 text-xs font-medium text-danger">{erroPeriodo}</p>}
      </div>

      {erroPeriodo ? null : q.isError ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center" data-testid="compra-erro">
          <p className="m-0 text-sm text-danger">{apiErrorMessage(q.error, "Não foi possível montar a prévia.")}</p>
          <Button variant="outline" className="rounded-lg gap-1.5" onClick={() => q.refetch()}><RotateCw className="h-4 w-4" aria-hidden="true" />Tentar novamente</Button>
        </div>
      ) : !p ? (
        <div role="status" aria-busy="true" aria-label="Carregando a prévia" className="space-y-2 px-5 py-5" data-testid="compra-carregando">
          {[0, 1, 2, 3].map((i) => <div key={i} className="pas-osso h-10 w-full rounded-lg" />)}
        </div>
      ) : nada ? (
        <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="compra-vazio">
          <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-success" aria-hidden="true"><PackageCheck className="h-5 w-5" /></span>
          <p className="m-0 text-sm font-semibold text-foreground">Nada a comprar {evento ? "neste evento" : "neste período"}</p>
          <p className="m-0 mt-1 max-w-[440px] text-xs leading-5 text-muted-foreground">
            Todo crédito de {dataBr(filtro.inicio)} a {dataBr(filtro.fim)}{evento ? ` em ${evento.name}` : ""} já está em um lote{filtro.incluirManuais ? "" : " — os lançamentos manuais só entram marcando a opção acima"}.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-border border-b border-border [&>*]:border-border [&>*:nth-child(even)]:border-l lg:[&>*:not(:first-child)]:border-l [&>*:nth-child(n+3)]:max-lg:border-t" data-testid="compra-resumo">
            <Cifra rotulo="Colaboradores no lote" valor={String(p.totais.colaboradores)} sub={plural(p.totais.lancamentos, "lançamento", "lançamentos")} testid="compra-total-colaboradores" />
            <Cifra rotulo="Alimentação" valor={formatCurrency(p.totais.alimentacaoCents)} />
            <Cifra rotulo="Mobilidade" valor={formatCurrency(p.totais.mobilidadeCents)} />
            <Cifra rotulo="Total da compra" valor={formatCurrency(p.totais.totalCents)} tom="text-primary" testid="compra-total"
              sub={p.foraDoLote.colaboradores > 0 ? `${formatCurrency(p.foraDoLote.totalCents)} fora do lote` : "nada fora do lote"} />
          </div>
          {p.foraDoLote.colaboradores > 0 && (
            <p className="m-0 flex items-start gap-2 border-b border-border bg-danger-soft/50 px-4 py-2.5 text-xs leading-5 text-foreground sm:px-5" role="note" data-testid="compra-fora-do-lote">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
              <span><span className="font-semibold text-danger">{plural(p.foraDoLote.colaboradores, "colaborador fica", "colaboradores ficam")} fora do lote</span> (sem CPF no cadastro ou valor zero) — os créditos continuam “a comprar” até o cadastro ser corrigido.</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-5">
            <BuscaDaLista valor={busca} onChange={setBusca} placeholder="Buscar colaborador" rotulo="Buscar colaborador na prévia" testid="compra-busca" compacta />
            {comAviso > 0 && (
              <button type="button" aria-pressed={soComAviso} onClick={() => setSoComAviso((v) => !v)}
                className={cn("inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  soComAviso ? "border-warning/50 bg-warning-soft text-warning" : "border-border bg-card text-muted-foreground hover:text-foreground")}
                data-testid="compra-so-com-aviso">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{plural(comAviso, "com aviso", "com aviso")}
              </button>
            )}
            <p className="m-0 ml-auto text-xs text-muted-foreground" aria-live="polite">{linhas.length === p.linhas.length ? plural(p.linhas.length, "colaborador", "colaboradores") : `${linhas.length} de ${p.linhas.length}`}</p>
          </div>
          <div className="hidden md:grid grid-cols-[minmax(0,1fr)_64px_120px_120px_130px] gap-x-4 border-y border-border bg-surface-muted/60 px-4 py-2 text-2xs font-semibold uppercase tracking-[0.04em] text-slate-600" aria-hidden="true">
            <span>Colaborador</span><span className="text-right">Lanç.</span><span className="text-right">Alimentação</span><span className="text-right">Mobilidade</span><span className="text-right">Total</span>
          </div>
          {linhas.length === 0 ? (
            <p className="m-0 border-t border-border px-5 py-8 text-center text-sm text-muted-foreground md:border-t-0">Ninguém na prévia com essa busca.</p>
          ) : (
            <ul className="m-0 max-h-[560px] list-none overflow-y-auto border-t border-border p-0 md:border-t-0" aria-label="Prévia da compra por colaborador" data-testid="compra-lista">
              {linhas.map((l) => <LinhaDaPreviaDaCompra key={l.collaboratorId} l={l} />)}
            </ul>
          )}
          <footer className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-t border-border bg-surface-muted/60 px-4 py-3 sm:px-5">
            <EscolhaDoFormato valor={extensao} onChange={setExtensao} nome="compra-formato" />
            <p className="m-0 min-w-0 flex-1 text-2xs leading-4 text-muted-foreground max-sm:basis-full">O arquivo tem o CPF completo; o download fica na auditoria.</p>
            <Button type="button" onClick={() => setConfirmar(true)} disabled={!podeGerar} className="h-[38px] rounded-lg gap-1.5 max-sm:w-full" data-testid="compra-gerar">
              <PackagePlus className="h-4 w-4" aria-hidden="true" />Gerar lote nº {p.proximoNumero}
            </Button>
          </footer>
        </>
      )}

      <DialogoGerarLote aberto={confirmar} previa={p ?? null} filtro={filtro} nomeDoEvento={evento?.name ?? null} extensao={extensao}
        onClose={() => setConfirmar(false)} onAtualizarPrevia={() => q.refetch()} onGerado={(l) => { setConfirmar(false); onGerado(l); }} />
    </section>
  );
}

function DialogoGerarLote({ aberto, previa, filtro, nomeDoEvento, extensao, onClose, onAtualizarPrevia, onGerado }: {
  aberto: boolean; previa: PreviaDaCompraApi | null; filtro: FiltroDaCompraNaTela; nomeDoEvento: string | null; extensao: Extensao;
  onClose: () => void; onAtualizarPrevia: () => void; onGerado: (l: LoteFlash) => void;
}) {
  const { toast } = useToast();
  const { gerar } = useAcoesDasCompras();
  const [erro, setErro] = useState<{ texto: string; mudou: boolean } | null>(null);
  const [baixando, setBaixando] = useState(false);
  useEffect(() => { if (aberto) { setErro(null); setBaixando(false); } }, [aberto]);
  if (!previa) return null;
  const ocupado = gerar.isPending || baixando;

  const confirmar = () => {
    setErro(null);
    gerar.mutate({ inicio: filtro.inicio, fim: filtro.fim, eventId: filtro.eventId || null, incluirManuais: filtro.incluirManuais, assinatura: previa.assinatura }, {
      onSuccess: async ({ lote }) => {
        setBaixando(true);
        try {
          const nome = await baixarArquivoDoLote(lote.id, extensao);
          toast({ variant: "success", title: `Lote nº ${lote.numero} gerado`, description: `${nome} · ${formatCurrency(lote.totalCents)} para ${plural(lote.colaboradores, "colaborador", "colaboradores")}.` });
        } catch (e) {
          toast({ variant: "destructive", title: `Lote nº ${lote.numero} gerado, mas o arquivo não baixou`, description: `${apiErrorMessage(e, "Tente de novo.")} Baixe pela lista de lotes.` });
        } finally {
          setBaixando(false);
          onGerado(lote);
        }
      },
      onError: (e) => {
        const codigo = (e as { body?: { codigo?: unknown } | null } | null)?.body?.codigo;
        setErro({ texto: apiErrorMessage(e, "Não foi possível gerar o lote."), mudou: codigo === "mudou" || codigo === "nada_a_comprar" });
      },
    });
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !ocupado) onClose(); }}>
      <DialogContent className="prs-dialogo max-h-[92dvh] max-w-[520px] gap-0 p-0" data-testid="compra-dialogo-gerar">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold"><PackagePlus className="h-4 w-4 text-primary" aria-hidden="true" />Gerar o lote nº {previa.proximoNumero}</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {dataBr(filtro.inicio)} a {dataBr(filtro.fim)}{nomeDoEvento ? ` · ${nomeDoEvento}` : " · todos os eventos"}{filtro.incluirManuais ? " · com os manuais" : ""}. Os créditos ficam presos a este lote até ele ser cancelado.
          </DialogDescription>
        </DialogHeader>
        <div className="prs-dialogo-corpo space-y-3 px-6 py-5">
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-muted/60 px-4 py-3 text-sm">
            <dt className="text-slate-600">Colaboradores</dt><dd className="m-0 text-right font-medium tabular-nums">{previa.totais.colaboradores}</dd>
            <dt className="text-slate-600">Alimentação</dt><dd className="m-0 text-right tabular-nums">{formatCurrency(previa.totais.alimentacaoCents)}</dd>
            <dt className="text-slate-600">Mobilidade</dt><dd className="m-0 text-right tabular-nums">{formatCurrency(previa.totais.mobilidadeCents)}</dd>
            <div className="col-span-2 flex items-baseline justify-between gap-4 border-t border-border pt-2"><dt className="font-semibold text-foreground">Total</dt><dd className="m-0 font-semibold tabular-nums text-primary" data-testid="compra-dialogo-total">{formatCurrency(previa.totais.totalCents)}</dd></div>
          </dl>
          {previa.foraDoLote.colaboradores > 0 && (
            <p className="m-0 text-xs leading-5 text-muted-foreground">{plural(previa.foraDoLote.colaboradores, "colaborador fica", "colaboradores ficam")} fora ({formatCurrency(previa.foraDoLote.totalCents)}): sem CPF ou valor zero.</p>
          )}
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft/60 px-3.5 py-3" role="note">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden="true" />
            <p className="m-0 text-xs leading-5 text-slate-700">
              <span className="font-semibold text-warning">Layout provisório e CPF completo.</span> O arquivo ({extensao.toUpperCase()}) sai no formato provisório até a Flash mandar o oficial — confira antes de subir. Guarde só onde o DP tem acesso; o download fica no log de auditoria com o seu nome.
            </p>
          </div>
          {erro && (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger" data-testid="compra-dialogo-erro">
              <span className="min-w-0 flex-1">{erro.texto}</span>
              {erro.mudou && <Button type="button" variant="outline" className="h-7 rounded-md px-2 text-xs" onClick={() => { onAtualizarPrevia(); onClose(); }}>Ver a prévia de novo</Button>}
            </div>
          )}
        </div>
        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={ocupado}>Cancelar</Button>
          <Button type="button" onClick={confirmar} disabled={ocupado || !!erro?.mudou} data-testid="compra-confirmar">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            {gerar.isPending ? "Gerando…" : baixando ? "Baixando…" : "Gerar e baixar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Lotes gerados ───────────────────────────────────────────────────────────

type FiltroDosLotes = "todos" | "gerado" | "pago" | "cancelado";

const COR_DO_STATUS: Record<LoteFlash["status"], string> = {
  gerado: "bg-info-soft text-info",
  pago: "bg-success-soft text-success",
  cancelado: "bg-muted text-muted-foreground",
};
const ROTULO_CURTO: Record<LoteFlash["status"], string> = { gerado: "A pagar à Flash", pago: "Pago à Flash", cancelado: "Cancelado" };

function MenuDeDownload({ lote, onBaixar, baixando }: { lote: LoteFlash; onBaixar: (l: LoteFlash, e: Extensao) => void; baixando: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="h-8 rounded-lg px-2.5 text-xs gap-1.5" disabled={baixando} data-testid={`lote-baixar-${lote.numero}`}>
          {baixando ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}Baixar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onBaixar(lote, "xlsx")} data-testid={`lote-baixar-${lote.numero}-xlsx`}><FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onBaixar(lote, "csv")} data-testid={`lote-baixar-${lote.numero}-csv`}><FileText className="mr-2 h-4 w-4" aria-hidden="true" />CSV (;)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LinhaDoLote({ l, destacado, baixando, onBaixar, onPagar, onCancelar }: {
  l: LoteFlash; destacado: boolean; baixando: boolean;
  onBaixar: (l: LoteFlash, e: Extensao) => void; onPagar: (l: LoteFlash) => void; onCancelar: (l: LoteFlash) => void;
}) {
  return (
    <li className={cn("flex flex-col gap-2 px-4 py-3 sm:px-5 border-b border-border last:border-b-0 lg:flex-row lg:items-center lg:gap-5 transition-colors", destacado && "bg-brand-soft", l.status === "cancelado" && "opacity-80")}
      data-testid={`lote-${l.numero}`}>
      <div className="min-w-0 lg:w-[300px] lg:shrink-0">
        <p className="m-0 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground tabular-nums">Lote nº {l.numero}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold", COR_DO_STATUS[l.status])} title={l.rotuloDoStatus}>
            {l.status === "pago" && l.pagoEm ? `Pago à Flash em ${dataBr(l.pagoEm)}` : ROTULO_CURTO[l.status]}
          </span>
        </p>
        <p className="m-0 mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{rotuloDoLote(l).replace(/^Lote \d+ · /, "")}{l.evento ? ` · ${l.evento.nome}` : " · todos os eventos"}{l.incluiManuais ? " · com manuais" : ""}</span>
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm tabular-nums text-foreground">
          <span className="font-semibold">{formatCurrency(l.totalCents)}</span>
          <span className="text-muted-foreground"> · {plural(l.colaboradores, "colaborador", "colaboradores")}</span>
        </p>
        <p className="m-0 text-2xs tabular-nums text-muted-foreground">Alimentação {formatCurrency(l.totalAlimentacaoCents)} · Mobilidade {formatCurrency(l.totalMobilidadeCents)}</p>
        <p className="m-0 text-2xs text-muted-foreground">Gerado por {l.geradoPorNome ?? "—"} em {dataHora(l.geradoEm)}</p>
        {l.cancelamento && (
          <p className="m-0 mt-1 text-xs leading-5 text-foreground" data-testid={`lote-${l.numero}-motivo`}>
            <span className="font-medium">Cancelado</span> por {l.cancelamento.porNome ?? "—"} em {dataHora(l.cancelamento.em)} · os créditos voltaram para “a comprar”.
            <span className="block text-muted-foreground">Motivo: “{l.cancelamento.motivo}”</span>
          </p>
        )}
        {l.divergencia && (
          <p className="m-0 mt-1 flex items-start gap-1.5 text-xs leading-5 text-warning" data-testid={`lote-${l.numero}-divergencia`}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Os créditos deste lote mudaram depois da compra (comparativo ressincronizado ou reaberto): hoje somam {formatCurrency(l.divergencia.totalAtualCents)} em {plural(l.divergencia.lancamentosAtuais, "lançamento", "lançamentos")}. O arquivo continua o que foi comprado.</span>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
        {l.acoes.baixar && <MenuDeDownload lote={l} onBaixar={onBaixar} baixando={baixando} />}
        {l.acoes.marcarPago && (
          <Button type="button" variant="outline" className="h-8 rounded-lg px-2.5 text-xs gap-1.5 text-success hover:text-success" onClick={() => onPagar(l)} data-testid={`lote-pagar-${l.numero}`}>
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />Pago à Flash
          </Button>
        )}
        {l.acoes.cancelar && (
          <Button type="button" variant="ghost" className="h-8 rounded-lg px-2.5 text-xs gap-1.5 text-danger hover:bg-danger-soft hover:text-danger" onClick={() => onCancelar(l)} data-testid={`lote-cancelar-${l.numero}`}>
            <Ban className="h-3.5 w-3.5" aria-hidden="true" />Cancelar
          </Button>
        )}
      </div>
    </li>
  );
}

function ListaDeLotes({ destaque }: { destaque: string }) {
  const { toast } = useToast();
  const q = useLotesFlash();
  const [filtro, setFiltro] = useState<FiltroDosLotes>("todos");
  const [baixando, setBaixando] = useState("");
  const [pagar, setPagar] = useState<LoteFlash | null>(null);
  const [cancelar, setCancelar] = useState<LoteFlash | null>(null);
  const lotes = q.data?.lotes ?? [];
  const conta = (s: FiltroDosLotes) => (s === "todos" ? lotes.length : lotes.filter((l) => l.status === s).length);
  const visiveis = filtro === "todos" ? lotes : lotes.filter((l) => l.status === filtro);

  const baixar = async (l: LoteFlash, e: Extensao) => {
    setBaixando(l.id);
    try {
      const nome = await baixarArquivoDoLote(l.id, e);
      toast({ variant: "success", title: "Arquivo baixado", description: `${nome} · o download ficou registrado na auditoria.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Não foi possível baixar", description: apiErrorMessage(err, "Tente de novo.") });
    } finally {
      setBaixando("");
    }
  };

  let corpo: ReactNode;
  if (q.isError) {
    corpo = (
      <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <p className="m-0 text-sm text-danger">{apiErrorMessage(q.error, "Não foi possível carregar os lotes.")}</p>
        <Button variant="outline" className="rounded-lg gap-1.5" onClick={() => q.refetch()}><RotateCw className="h-4 w-4" aria-hidden="true" />Tentar novamente</Button>
      </div>
    );
  } else if (!q.data) {
    corpo = <div role="status" aria-busy="true" aria-label="Carregando os lotes" className="space-y-2 px-5 py-5">{[0, 1, 2].map((i) => <div key={i} className="pas-osso h-14 w-full rounded-lg" />)}</div>;
  } else if (lotes.length === 0) {
    corpo = <p className="m-0 px-5 py-10 text-center text-sm text-muted-foreground" data-testid="lotes-vazio">Nenhum lote gerado ainda. O primeiro sai do painel “A comprar”, acima.</p>;
  } else if (visiveis.length === 0) {
    corpo = <p className="m-0 px-5 py-8 text-center text-sm text-muted-foreground">Nenhum lote nesta situação.</p>;
  } else {
    corpo = (
      <ul className="m-0 list-none p-0" aria-label="Lotes de compra Flash" data-testid="lotes-lista">
        {visiveis.map((l) => (
          <LinhaDoLote key={l.id} l={l} destacado={destaque === l.id} baixando={baixando === l.id} onBaixar={baixar} onPagar={setPagar} onCancelar={setCancelar} />
        ))}
      </ul>
    );
  }

  const opcoes: Array<[FiltroDosLotes, string]> = [["todos", "Todos"], ["gerado", "A pagar"], ["pago", "Pagos"], ["cancelado", "Cancelados"]];
  return (
    <section aria-labelledby="lotes-titulo" className="rounded-xl border border-border bg-card overflow-hidden" data-testid="compra-lotes">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
        <h2 id="lotes-titulo" className="m-0 text-base font-semibold text-foreground">Lotes gerados</h2>
        {lotes.length > 0 && (
          <div role="tablist" aria-label="Situação dos lotes" className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-border bg-background p-[3px] sm:ml-auto">
            {opcoes.map(([k, r]) => (
              <button key={k} type="button" role="tab" aria-selected={filtro === k} onClick={() => setFiltro(k)}
                className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors", filtro === k ? "bg-brand-soft text-primary" : "text-muted-foreground hover:text-foreground")}
                data-testid={`lotes-filtro-${k}`}>
                {r}<span className="tabular-nums opacity-80">{conta(k)}</span>
              </button>
            ))}
          </div>
        )}
      </header>
      {corpo}
      <DialogoPagarLote lote={pagar} hoje={q.data?.hoje ?? ""} onClose={() => setPagar(null)} />
      <DialogoCancelarLote lote={cancelar} onClose={() => setCancelar(null)} />
    </section>
  );
}

function DialogoPagarLote({ lote, hoje, onClose }: { lote: LoteFlash | null; hoje: string; onClose: () => void }) {
  const { toast } = useToast();
  const { marcarPago } = useAcoesDasCompras();
  const [pagoEm, setPagoEm] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (lote) { setPagoEm(hoje); setErro(null); } }, [lote, hoje]);
  const erroData = !pagoEm ? "Informe a data do pagamento." : pagoEm > hoje ? "A data do pagamento não pode ser no futuro." : null;
  const salvar = () => {
    if (!lote || erroData) return;
    marcarPago.mutate({ id: lote.id, pagoEm }, {
      onSuccess: () => { toast({ variant: "success", title: `Lote nº ${lote.numero} pago à Flash`, description: `Pagamento em ${dataBr(pagoEm)}. O lote não pode mais ser cancelado.` }); onClose(); },
      onError: (e) => setErro(apiErrorMessage(e, "Não foi possível marcar como pago.")),
    });
  };
  return (
    <Dialog open={!!lote} onOpenChange={(o) => { if (!o && !marcarPago.isPending) onClose(); }}>
      <DialogContent className="prs-dialogo max-w-[440px] gap-0 p-0" data-testid="lote-dialogo-pagar">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold"><BadgeCheck className="h-4 w-4 text-success-strong" aria-hidden="true" />Lote nº {lote?.numero} pago à Flash</DialogTitle>
          <DialogDescription className="text-xs leading-5">{lote ? `${formatCurrency(lote.totalCents)} · ${plural(lote.colaboradores, "colaborador", "colaboradores")}. ` : ""}Depois de pago, o lote não pode mais ser cancelado.</DialogDescription>
        </DialogHeader>
        <form className="prs-dialogo-corpo space-y-1.5 px-6 py-5" noValidate onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <Label htmlFor="lote-pago-em">Data do pagamento</Label>
          <Input id="lote-pago-em" type="date" value={pagoEm} max={hoje} onChange={(e) => setPagoEm(e.target.value)} aria-invalid={!!erroData} className="h-10 max-w-[200px] rounded-lg tabular-nums" data-testid="lote-pago-em" />
          {erroData && <p role="alert" className="m-0 text-xs font-medium text-danger">{erroData}</p>}
          {erro && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={marcarPago.isPending}>Voltar</Button>
          <Button type="button" onClick={salvar} disabled={marcarPago.isPending || !!erroData} className="bg-success text-white hover:bg-success-strong" data-testid="lote-confirmar-pago">
            {marcarPago.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <BadgeCheck className="h-4 w-4" aria-hidden="true" />}Marcar como pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoCancelarLote({ lote, onClose }: { lote: LoteFlash | null; onClose: () => void }) {
  const { toast } = useToast();
  const { cancelar } = useAcoesDasCompras();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [tocado, setTocado] = useState(false);
  useEffect(() => { if (lote) { setMotivo(""); setErro(null); setTocado(false); } }, [lote]);
  const curto = motivo.trim().length < MOTIVO_DO_CANCELAMENTO_MIN;
  const salvar = () => {
    setTocado(true);
    if (!lote || curto) return;
    cancelar.mutate({ id: lote.id, motivo: motivo.trim() }, {
      onSuccess: (r) => { toast({ variant: "success", title: `Lote nº ${lote.numero} cancelado`, description: `${plural(r.creditosDevolvidos, "crédito voltou", "créditos voltaram")} para “a comprar”.` }); onClose(); },
      onError: (e) => setErro(apiErrorMessage(e, "Não foi possível cancelar o lote.")),
    });
  };
  return (
    <Dialog open={!!lote} onOpenChange={(o) => { if (!o && !cancelar.isPending) onClose(); }}>
      <DialogContent className="prs-dialogo max-w-[480px] gap-0 p-0" data-testid="lote-dialogo-cancelar">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold"><Ban className="h-4 w-4 text-danger" aria-hidden="true" />Cancelar o lote nº {lote?.numero}</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {lote ? `${formatCurrency(lote.totalCents)} · ${plural(lote.lancamentos, "crédito volta", "créditos voltam")} para “a comprar” e podem entrar num lote novo. ` : ""}Use quando o arquivo não foi (ou não vai ser) enviado à Flash.
          </DialogDescription>
        </DialogHeader>
        <form className="prs-dialogo-corpo space-y-1.5 px-6 py-5" noValidate onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <Label htmlFor="lote-motivo">Motivo</Label>
          <Textarea id="lote-motivo" rows={3} maxLength={MOTIVO_DO_CANCELAMENTO_MAX} value={motivo} onChange={(e) => setMotivo(e.target.value)} onBlur={() => setTocado(true)}
            placeholder="Ex.: valores do evento X corrigidos depois do arquivo." aria-invalid={tocado && curto} className="rounded-lg text-sm" data-testid="lote-motivo" />
          {tocado && curto && <p role="alert" className="m-0 text-xs font-medium text-danger">Escreva o motivo (pelo menos {MOTIVO_DO_CANCELAMENTO_MIN} caracteres).</p>}
          {erro && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={cancelar.isPending}>Voltar</Button>
          <Button type="button" variant="destructive" onClick={salvar} disabled={cancelar.isPending} data-testid="lote-confirmar-cancelar">
            {cancelar.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Ban className="h-4 w-4" aria-hidden="true" />}Cancelar o lote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A aba inteira: "A comprar" em cima, "Lotes gerados" embaixo. */
export function ComprasFlash({ hoje }: { hoje: string }) {
  const [destaque, setDestaque] = useState("");
  // Mesma chave do resto do app (cache compartilhado); cancelado/excluído não entra no seletor.
  const qEventos = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const events = useMemo(() => (qEventos.data ?? []).filter((e) => e.status !== "cancelado" && e.status !== "excluído"), [qEventos.data]);
  useEffect(() => {
    if (!destaque) return;
    requestAnimationFrame(() => document.querySelector(`[data-testid="compra-lotes"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
    const t = setTimeout(() => setDestaque(""), 3500);
    return () => clearTimeout(t);
  }, [destaque]);
  return (
    <div className="flex flex-col gap-4" data-testid="flash-compras">
      <PainelAComprar hoje={hoje} events={events} onGerado={(l) => setDestaque(l.id)} />
      <ListaDeLotes destaque={destaque} />
    </div>
  );
}
