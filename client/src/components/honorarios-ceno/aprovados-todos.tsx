/**
 * "Aprovados — todos os eventos" (30/10). Pedido de quem lança os honorários
 * da cenotécnica: "uma página para eu ver todos os valores aprovados numa só
 * página, tipo o que aparece para a controladoria — para não ter que entrar
 * evento por evento. Senão não consigo ter controle das OCs que eu abrir."
 *
 * Mora em DOIS lugares, com o mesmo componente:
 *  - na gaveta "Honorários do evento" da Escalação, ao lado da lista de
 *    eventos (quem lança — só as funções dele; GET /aprovados recorta);
 *  - como aba da tela do Financeiro para o DP e o admin (quem coloca as OCs),
 *    sem substituir A liberar / Liberados / Relatórios.
 *
 * Faixa de totais (aprovado, liberado, a liberar, itens); filtros de período
 * (a mesma regra e o mesmo botão do Financeiro, pela data do evento), evento,
 * situação (a liberar · liberado parcial · liberado · sem OC) e busca por
 * nome/OC; tabela agrupável por evento com subtotal (vira cartão abaixo de
 * 1280px — os números lado a lado —, sem rolar a página de lado); "Abrir no evento";
 * CSV com o mesmo preâmbulo dos CSVs do Financeiro. Ordem: eventos mais
 * próximos primeiro, depois os que já passaram (do mais recente).
 *
 * Só leitura do que a API manda — nenhuma regra nova: situação da verba,
 * falta liberar e "sem OC" vêm de shared/honorarios-ceno.ts; o período, de
 * shared/honorarios-periodo.ts. O DP informa a OC aqui mesmo (Informar OC).
 */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, CheckCircle2, CloudOff, Download, FileDigit, Pencil, SearchX } from "lucide-react";
import type { Event } from "@shared/schema";
import { EventSearchSelect } from "@/components/event-select";
import { BuscaDaLista } from "@/components/common/barra-de-filtros";
import { StatusBadge, type Tone } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BotaoTentarDeNovo, EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";
import { downloadCsv, slugify } from "@/components/scaling-validation/event-view/event-view-shared";
import { TH } from "@/components/scaling-approval/tokens";
import { apiErrorMessage, cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { normalizarNomeDeFuncao } from "@shared/cenotecnica";
import { hojeISO } from "@shared/hoje-sp";
import {
  SITUACAO_DA_VERBA_LABEL, diariasDoValor, reaisParaCsv, rotuloDoValor, situacaoDaVerba, temOc, type SituacaoDaVerba,
} from "@shared/honorarios-ceno";
import {
  descricaoDoIntervalo, ehAtalhoDoPeriodo, intervaloDoPeriodo, preambuloDoCsv, recortarPelaDataDoEvento, semLimite, sufixoDoPeriodo,
  type AtalhoDoPeriodo, type EscolhaDoPeriodo,
} from "@shared/honorarios-periodo";
import { useAprovadosDeTodosOsEventos, type HonorarioAprovado, type LiberacaoResumida } from "./api";
import { FiltroDePeriodo } from "./filtro-de-periodo";
import { InformarOcDialog, type AlvoDaOc } from "./financeiro-dialogos";
import { AvisoDaLinha, FaixaDeTotais, OrigemDaLinha, ValorComDiaria, brl, brlCurto, dataBr, periodoCurto, posicaoLabel, setorLabel } from "./pecas";

// ── Filtros ─────────────────────────────────────────────────────────────────

export type SituacaoDoFiltro = "todas" | Exclude<SituacaoDaVerba, "sem_aprovacao"> | "sem_oc";

export const SITUACOES_DO_FILTRO: { id: SituacaoDoFiltro; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "a_liberar", rotulo: "A liberar" },
  { id: "parcial", rotulo: "Liberado parcial" },
  { id: "liberada", rotulo: "Liberado" },
  { id: "sem_oc", rotulo: "Sem OC" },
];

export interface FiltrosDosAprovados {
  periodo: AtalhoDoPeriodo;
  de: string;
  ate: string;
  evento: string;
  situacao: SituacaoDoFiltro;
  q: string;
  agrupar: boolean;
}

export const FILTROS_PADRAO: FiltrosDosAprovados = { periodo: "tudo", de: "", ate: "", evento: "", situacao: "todas", q: "", agrupar: true };

/** Situação da verba de um aprovado (o servidor só manda aprovados). */
const situacaoDe = (h: HonorarioAprovado) => situacaoDaVerba(h.status, h.valorAprovado, h.liberado);
const semOc = (h: HonorarioAprovado) => h.liberacoes.filter((l) => !temOc(l.oc));

const TOM_DA_SITUACAO: Record<SituacaoDaVerba, Tone> = { sem_aprovacao: "neutral", a_liberar: "warning", parcial: "info", liberada: "success" };
/** Na visão de quem lança, "Liberada" vira "Liberado" (o pedido, não a verba). */
const ROTULO_DA_SITUACAO: Record<SituacaoDaVerba, string> = { ...SITUACAO_DA_VERBA_LABEL, parcial: "Liberado parcial", liberada: "Liberado" };

function casaBusca(h: HonorarioAprovado, q: string): boolean {
  if (!q.trim()) return true;
  const t = normalizarNomeDeFuncao(q);
  return [h.nome, h.eventName, h.functionName, ...h.liberacoes.map((l) => l.oc)].some((x) => normalizarNomeDeFuncao(x).includes(t));
}

/** Próximos e em andamento primeiro (do mais perto), depois os passados (do mais recente) — a ordem da lista de eventos. */
export function ordenarPorEvento(linhas: readonly HonorarioAprovado[], hoje: string): HonorarioAprovado[] {
  const passado = (h: HonorarioAprovado) => (h.eventEndDate ?? h.eventStartDate ?? "") < hoje;
  return [...linhas].sort((x, y) => {
    const px = passado(x), py = passado(y);
    if (px !== py) return px ? 1 : -1;
    const dx = x.eventStartDate ?? "", dy = y.eventStartDate ?? "";
    if (dx !== dy) return px ? dy.localeCompare(dx) : dx.localeCompare(dy);
    if (x.eventId !== y.eventId) return (x.eventName ?? "").localeCompare(y.eventName ?? "", "pt-BR");
    if (x.tipo !== y.tipo) return x.tipo === "vaga" ? -1 : 1;
    return x.nome.localeCompare(y.nome, "pt-BR");
  });
}

function totais(linhas: readonly HonorarioAprovado[]) {
  let aprovado = 0, liberado = 0, aLiberar = 0, liberacoes = 0, liberacoesSemOc = 0;
  for (const h of linhas) {
    aprovado += h.valorAprovado ?? 0;
    liberado += h.liberado;
    aLiberar += h.falta;
    liberacoes += h.liberacoes.length;
    liberacoesSemOc += semOc(h).length;
  }
  return { aprovado, liberado, aLiberar, liberacoes, liberacoesSemOc, itens: linhas.length, eventos: new Set(linhas.map((h) => h.eventId)).size };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/** "30/10/2026" do instante (fuso de São Paulo). */
const dataCompleta = (iso: string | null | undefined) => {
  const t = iso ? new Date(iso) : null;
  return t && !Number.isNaN(t.getTime()) ? t.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
};
const diaMes = (iso: string | null | undefined) => {
  const t = iso ? new Date(iso) : null;
  return t && !Number.isNaN(t.getTime()) ? t.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "";
};

// ── CSV ─────────────────────────────────────────────────────────────────────

function exportarCsv(linhas: readonly HonorarioAprovado[], nome: string, preambulo: string[][]) {
  const cabecalho = [
    "Evento", "Início do evento", "Fim do evento", "Tipo", "Pessoas", "Nome", "Função", "Setor", "Posição", "Origem do valor",
    "Valor pedido (R$)", "Valor aprovado (R$)", "Ajuste (R$)", "Aprovado por", "Aprovado em", "Liberado (R$)", "A liberar (R$)", "Situação",
    "OC/DP (data · valor)", "Liberações sem OC",
  ];
  const corpo = linhas.map((h) => {
    const aprovado = h.valorAprovado ?? 0;
    const ajuste = h.status === "aprovado_ajuste" ? aprovado - h.valorPedido : 0;
    return [
      h.eventName ?? "", dataBr(h.eventStartDate), dataBr(h.eventEndDate), h.tipo === "empreita" ? "Empreita" : "Individual",
      h.tipo === "empreita" && h.pessoas ? String(h.pessoas) : "", h.nome, h.functionName ?? "", setorLabel(h.setor), posicaoLabel(h.posicao), rotuloDoValor(h),
      reaisParaCsv(h.valorPedido), reaisParaCsv(aprovado), ajuste ? reaisParaCsv(ajuste) : "", h.decididoPorNome ?? "", dataCompleta(h.decididoEm),
      reaisParaCsv(h.liberado), reaisParaCsv(h.falta), ROTULO_DA_SITUACAO[situacaoDe(h)],
      h.liberacoes.map((l) => `${temOc(l.oc) ? l.oc.trim() : "sem OC"} (${dataBr(l.data)} · ${reaisParaCsv(l.valor)})`).join(" / "),
      String(semOc(h).length),
    ];
  });
  downloadCsv(nome, cabecalho, corpo, preambulo);
}

// ── Peças da linha ──────────────────────────────────────────────────────────

function SituacaoDoAprovado({ h }: { h: HonorarioAprovado }) {
  const s = situacaoDe(h);
  return (
    <span className="block space-y-1">
      <StatusBadge tone={TOM_DA_SITUACAO[s]} dot size="sm" data-testid="hon-apr-situacao">{ROTULO_DA_SITUACAO[s]}</StatusBadge>
      <span className="block text-2xs leading-4 text-muted-foreground">
        {h.status === "aprovado_ajuste" ? "Aprovado c/ ajuste" : "Aprovado"}{h.decididoPorNome ? ` por ${h.decididoPorNome}` : ""}{h.decididoEm ? ` · ${diaMes(h.decididoEm)}` : ""}
      </span>
    </span>
  );
}

function OcsDaLinha({ h, onInformarOc }: { h: HonorarioAprovado; onInformarOc?: (l: LiberacaoResumida) => void }) {
  if (h.liberacoes.length === 0) return <span className="block text-sm text-muted-foreground">—</span>;
  return (
    <ul className="space-y-1" aria-label={`OCs de ${h.nome}`}>
      {h.liberacoes.map((l) => {
        const com = temOc(l.oc);
        return (
          <li key={l.id} className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-2xs leading-4">
            {com
              ? <span className="font-mono text-xs font-semibold tabular-nums text-foreground [overflow-wrap:anywhere]">{l.oc.trim()}</span>
              : <span className="rounded bg-warning-soft px-1 font-medium text-warning">sem OC</span>}
            <span className="tabular-nums text-muted-foreground">{dataBr(l.data).slice(0, 5)} · {brlCurto(l.valor)}</span>
            {onInformarOc && (com ? (
              <button type="button" onClick={() => onInformarOc(l)} aria-label={`Editar a OC ${l.oc.trim()} de ${h.nome}`} title="Corrigir a OC/DP"
                className="val-alvo inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Pencil className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : (
              <button type="button" onClick={() => onInformarOc(l)} aria-label={`Informar a OC da liberação de ${dataBr(l.data)} de ${h.nome}`}
                className="val-alvo inline-flex h-6 items-center gap-1 rounded px-1 font-semibold text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <FileDigit className="h-3 w-3" aria-hidden="true" /> Informar OC
              </button>
            ))}
          </li>
        );
      })}
    </ul>
  );
}

function LinhaDoAprovado({ h, comEvento, onAbrir, onInformarOc }: {
  h: HonorarioAprovado; comEvento: boolean;
  onAbrir?: () => void; onInformarOc?: (l: LiberacaoResumida) => void;
}) {
  return (
    <tr className="apr-linha border-b border-border align-top last:border-b-0 bg-card hover:bg-surface-muted/50" data-testid={`hon-apr-${h.id}`}>
      {comEvento && (
        <td data-primeira className="px-3 py-3">
          <span className="block break-words text-sm font-medium leading-5 text-foreground">{h.eventName ?? "Evento"}</span>
          <span className="block text-2xs tabular-nums text-muted-foreground">{periodoCurto(h.eventStartDate, h.eventEndDate)} · {(h.eventStartDate ?? "").slice(0, 4)}</span>
        </td>
      )}
      <td data-primeira={comEvento ? undefined : true} data-rotulo={comEvento ? "Nome / empreita" : undefined} className="px-3 py-3">
        <span className="block break-words text-sm font-semibold leading-5 text-foreground">{h.nome}</span>
        <span className="block"><OrigemDaLinha h={h} /></span>
        {comEvento && <span className="block text-2xs text-slate-600">{setorLabel(h.setor)} · {posicaoLabel(h.posicao)}</span>}
        <AvisoDaLinha h={h} />
      </td>
      {!comEvento && (
        <td data-rotulo="Setor / posição" className="px-3 py-3">
          <span className="block text-xs text-slate-700">{setorLabel(h.setor)}</span>
          <span className="block text-2xs text-muted-foreground">{posicaoLabel(h.posicao)}</span>
        </td>
      )}
      <td data-rotulo="Aprovado" className="px-3 py-3 xl:pr-5">
        <ValorComDiaria valor={h.valorAprovado} diarias={diariasDoValor(h)} riscado={h.status === "aprovado_ajuste" ? h.valorPedido : null} alinhar="esquerda" className="xl:text-right" />
      </td>
      <td data-rotulo="Liberado" className="px-3 py-3">
        <span className="block text-sm tabular-nums text-foreground xl:text-right">{h.liberado ? brlCurto(h.liberado) : "—"}</span>
      </td>
      <td data-rotulo="A liberar" className="px-3 py-3">
        <span className={cn("block text-sm font-semibold tabular-nums xl:text-right", h.falta > 0 ? "text-warning" : "text-muted-foreground")}>{h.falta > 0 ? brlCurto(h.falta) : "—"}</span>
      </td>
      <td data-rotulo="OC/DP" className="px-3 py-3"><OcsDaLinha h={h} onInformarOc={onInformarOc} /></td>
      <td data-rotulo="Situação" className="px-3 py-3"><SituacaoDoAprovado h={h} /></td>
      {onAbrir !== undefined && (
        <td data-col="acoes" className="whitespace-nowrap py-2.5 pl-1 pr-3 text-right">
          {h.eventoExcluido ? <span className="text-2xs text-muted-foreground">Evento excluído</span> : (
            <Button type="button" variant="ghost" size="sm" onClick={onAbrir} title="Abrir no evento, já nesta pessoa" aria-label={`Abrir ${h.nome} no evento ${h.eventName ?? ""}`}
              className="val-alvo h-8 gap-1 px-2 text-xs font-semibold text-primary hover:bg-brand-soft hover:text-primary">
              <span className="xl:sr-only">Abrir no evento</span> <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </td>
      )}
    </tr>
  );
}

/** O mesmo aprovado em cartão (abaixo de 1280px): os três números lado a lado, as OCs e "Abrir no evento" no rodapé. */
function CartaoDoAprovado({ h, comEvento, onAbrir, onInformarOc }: {
  h: HonorarioAprovado; comEvento: boolean;
  onAbrir?: () => void; onInformarOc?: (l: LiberacaoResumida) => void;
}) {
  const s = situacaoDe(h);
  const num = (rotulo: string, valor: ReactNode, cls?: string) => (
    <div className="min-w-0"><dt className="text-2xs text-muted-foreground">{rotulo}</dt><dd className={cn("text-sm font-semibold tabular-nums", cls ?? "text-foreground")}>{valor}</dd></div>
  );
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-1" data-testid={`hon-apr-${h.id}`}>
      <div className="flex-1 space-y-2.5 px-3.5 pb-3 pt-3">
        {comEvento && (
          <p className="break-words text-2xs font-medium text-slate-700">
            {h.eventName ?? "Evento"} <span className="font-normal tabular-nums text-muted-foreground">· {periodoCurto(h.eventStartDate, h.eventEndDate)} · {(h.eventStartDate ?? "").slice(0, 4)}</span>
          </p>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="block break-words text-sm font-semibold leading-5 text-foreground">{h.nome}</span>
            <span className="block"><OrigemDaLinha h={h} /></span>
            <span className="block text-2xs text-slate-600">{setorLabel(h.setor)} · {posicaoLabel(h.posicao)}</span>
            <AvisoDaLinha h={h} />
          </div>
          <StatusBadge tone={TOM_DA_SITUACAO[s]} dot size="sm" data-testid="hon-apr-situacao">{ROTULO_DA_SITUACAO[s]}</StatusBadge>
        </div>
        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-surface-muted/70 px-3 py-2">
          {num("Aprovado", <>
            {brlCurto(h.valorAprovado)}
            {h.status === "aprovado_ajuste" && <span className="block text-2xs font-normal text-muted-foreground line-through" aria-label={`Pedido: ${brl(h.valorPedido)}`}>{brlCurto(h.valorPedido)}</span>}
          </>)}
          {num("Liberado", h.liberado ? brlCurto(h.liberado) : "—")}
          {num("A liberar", h.falta > 0 ? brlCurto(h.falta) : "—", h.falta > 0 ? "text-warning" : "text-muted-foreground")}
        </dl>
        {h.liberacoes.length > 0 && (
          <div>
            <p className="mb-1 text-2xs text-muted-foreground">OC/DP</p>
            <OcsDaLinha h={h} onInformarOc={onInformarOc} />
          </div>
        )}
      </div>
      <div className="flex min-h-[44px] items-center justify-between gap-2 border-t border-border bg-surface-muted/60 py-1.5 pl-3.5 pr-2">
        <span className="min-w-0 text-2xs leading-4 text-muted-foreground">
          {h.status === "aprovado_ajuste" ? "Aprovado c/ ajuste" : "Aprovado"}{h.decididoPorNome ? ` por ${h.decididoPorNome}` : ""}{h.decididoEm ? ` · ${diaMes(h.decididoEm)}` : ""}
        </span>
        {onAbrir && (h.eventoExcluido ? <span className="shrink-0 text-2xs text-muted-foreground">Evento excluído</span> : (
          <Button type="button" variant="ghost" size="sm" onClick={onAbrir} aria-label={`Abrir ${h.nome} no evento ${h.eventName ?? ""}`}
            className="val-alvo h-9 shrink-0 gap-1 px-2 text-xs font-semibold text-primary hover:bg-brand-soft hover:text-primary">
            Abrir no evento <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        ))}
      </div>
    </li>
  );
}

function Tabela({ linhas, comEvento, legenda, onAbrir, onInformarOc }: {
  linhas: HonorarioAprovado[]; comEvento: boolean; legenda: string;
  onAbrir?: (h: HonorarioAprovado) => void; onInformarOc?: (h: HonorarioAprovado, l: LiberacaoResumida) => void;
}) {
  const largo = useMediaQuery("(min-width: 1280px)");
  if (!largo) {
    return (
      <ul className="grid gap-2.5 md:grid-cols-2" aria-label={legenda}>
        {linhas.map((h) => (
          <CartaoDoAprovado key={h.id} h={h} comEvento={comEvento}
            onAbrir={onAbrir ? () => onAbrir(h) : undefined}
            onInformarOc={onInformarOc ? (l) => onInformarOc(h, l) : undefined} />
        ))}
      </ul>
    );
  }
  return (
    <div className="apr-tabela xl:rounded-xl xl:border xl:border-border xl:bg-card xl:shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]">
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">{legenda}</caption>
        <thead className="border-b border-border bg-surface-muted [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl">
          <tr>
            {comEvento && <th scope="col" className={cn(TH, "w-[16%]")}>Evento · data</th>}
            <th scope="col" className={TH}>{comEvento ? "Nome / empreita · setor" : "Nome / empreita"}</th>
            {!comEvento && <th scope="col" className={cn(TH, "w-[112px]")}>Setor / posição</th>}
            <th scope="col" className={cn(TH, "w-[140px] text-right")}>Aprovado</th>
            <th scope="col" className={cn(TH, "w-[92px] text-right")}>Liberado</th>
            <th scope="col" className={cn(TH, "w-[92px] text-right")}>A liberar</th>
            <th scope="col" className={cn(TH, "w-[146px]")}>OC/DP</th>
            <th scope="col" className={cn(TH, "w-[164px]")}>Situação</th>
            {onAbrir && <th scope="col" className={cn(TH, "w-[52px]")}><span className="sr-only">Abrir no evento</span></th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((h) => (
            <LinhaDoAprovado key={h.id} h={h} comEvento={comEvento}
              onAbrir={onAbrir ? () => onAbrir(h) : undefined}
              onInformarOc={onInformarOc ? (l) => onInformarOc(h, l) : undefined} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Numero = ({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "warning" }) => (
  <span className="min-w-0"><span className="block text-2xs text-muted-foreground">{rotulo}</span><span className={cn("block text-sm font-semibold tabular-nums", tom === "warning" ? "text-warning" : "text-foreground")}>{valor}</span></span>
);

const BOTAO_DE_OPCAO = "val-alvo inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ── O painel ────────────────────────────────────────────────────────────────

export function AprovadosDeTodosOsEventos({ filtros, onFiltros, onAbrirNoEvento, podeInformarOc, visao }: {
  filtros: FiltrosDosAprovados;
  onFiltros: (f: Partial<FiltrosDosAprovados>) => void;
  /** Leva ao evento com a linha em foco. Sem ele, a coluna some. */
  onAbrirNoEvento?: (h: HonorarioAprovado) => void;
  /** DP/admin: "Informar OC" nas liberações sem OC (e corrigir as outras). */
  podeInformarOc: boolean;
  /** Quem olha: muda só os textos de apoio. */
  visao: "quem-lanca" | "financeiro";
}) {
  const q = useAprovadosDeTodosOsEventos(true);
  const hoje = useMemo(() => hojeISO(), []);
  const [alvoDaOc, setAlvoDaOc] = useState<AlvoDaOc | null>(null);

  const escolha = useMemo<EscolhaDoPeriodo>(
    () => (ehAtalhoDoPeriodo(filtros.periodo) ? { atalho: filtros.periodo, de: filtros.de || null, ate: filtros.ate || null } : { atalho: "tudo" }),
    [filtros.periodo, filtros.de, filtros.ate],
  );
  const intervalo = useMemo(() => intervaloDoPeriodo(escolha, hoje), [escolha, hoje]);
  const comPeriodo = !semLimite(intervalo);

  const todas = useMemo(() => ordenarPorEvento(q.data ?? [], hoje), [q.data, hoje]);
  const eventos = useMemo(() => {
    const m = new Map<string, Event>();
    for (const h of todas) if (!m.has(h.eventId)) m.set(h.eventId, { id: h.eventId, name: h.eventName ?? "Evento", startDate: h.eventStartDate ?? "", endDate: h.eventEndDate ?? "" } as unknown as Event);
    return Array.from(m.values());
  }, [todas]);
  const eventoEscolhido = eventos.find((e) => e.id === filtros.evento);
  /** Evento + período: a base da faixa e das contagens da situação. */
  const base = useMemo(() => {
    const doEvento = filtros.evento ? todas.filter((h) => h.eventId === filtros.evento) : todas;
    return recortarPelaDataDoEvento(doEvento, intervalo);
  }, [todas, filtros.evento, intervalo]);
  const contagem = useMemo(() => {
    const c: Record<SituacaoDoFiltro, number> = { todas: base.length, a_liberar: 0, parcial: 0, liberada: 0, sem_oc: 0 };
    for (const h of base) {
      const s = situacaoDe(h);
      if (s !== "sem_aprovacao") c[s] += 1;
      if (semOc(h).length) c.sem_oc += 1;
    }
    return c;
  }, [base]);
  const visiveis = useMemo(() => base.filter((h) => {
    if (filtros.situacao === "sem_oc" ? semOc(h).length === 0 : filtros.situacao !== "todas" && situacaoDe(h) !== filtros.situacao) return false;
    return casaBusca(h, filtros.q);
  }), [base, filtros.situacao, filtros.q]);
  const t = useMemo(() => totais(visiveis), [visiveis]);
  const grupos = useMemo(() => {
    const m = new Map<string, HonorarioAprovado[]>();
    for (const h of visiveis) m.set(h.eventId, [...(m.get(h.eventId) ?? []), h]);
    return Array.from(m.values());
  }, [visiveis]);

  const filtrando = comPeriodo || !!filtros.evento || filtros.situacao !== "todas" || !!filtros.q.trim();
  const limpar = () => onFiltros({ periodo: "tudo", de: "", ate: "", evento: "", situacao: "todas", q: "" });
  const periodoTexto = descricaoDoIntervalo(intervalo);
  const situacaoTexto = SITUACOES_DO_FILTRO.find((s) => s.id === filtros.situacao)?.rotulo ?? "Todas";

  const exportar = () => exportarCsv(
    visiveis,
    `honorarios-cenotecnica-aprovados${eventoEscolhido ? `-${slugify(eventoEscolhido.name)}` : ""}${sufixoDoPeriodo(intervalo, "evento")}${filtros.situacao !== "todas" ? `-${filtros.situacao.replace("_", "-")}` : ""}.csv`,
    (() => {
      const p = preambuloDoCsv("Honorários da cenotécnica — aprovados (todos os eventos)", intervalo, "evento", eventoEscolhido?.name);
      // O preâmbulo do Financeiro termina numa linha vazia; a situação entra antes dela.
      return filtros.situacao !== "todas" || filtros.q.trim()
        ? [...p.slice(0, -1), ...(filtros.situacao !== "todas" ? [["Situação", situacaoTexto]] : []), ...(filtros.q.trim() ? [["Busca", filtros.q.trim()]] : []), []]
        : p;
    })(),
  );
  const abrirOc = podeInformarOc
    ? (h: HonorarioAprovado, l: LiberacaoResumida) => setAlvoDaOc({ honorarioId: h.id, nome: h.nome, eventName: h.eventName, liberacao: l })
    : undefined;

  if (q.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Carregando os aprovados">
        <div className="val-osso h-[78px] w-full rounded-xl" />
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="val-osso h-11 w-full" />)}</div>
      </div>
    );
  }
  if (q.error) {
    return (
      <EstadoDaValidacao tom="erro" icone={<CloudOff aria-hidden="true" />} titulo="Não foi possível carregar os aprovados"
        texto={apiErrorMessage(q.error, "Verifique sua conexão e tente novamente.")}
        acao={<BotaoTentarDeNovo onClick={() => q.refetch()} tentando={q.isFetching} />} testId="hon-apr-erro" />
    );
  }
  if (todas.length === 0) {
    return (
      <EstadoDaValidacao icone={<CheckCircle2 aria-hidden="true" />} titulo="Nenhum honorário aprovado ainda"
        texto={visao === "quem-lanca"
          ? "Quando o aprovador da escala aprovar um pedido seu, ele aparece aqui — com o que o Financeiro já liberou e as OCs."
          : "Quando o aprovador da escala aprovar um pedido, ele aparece aqui com as liberações e as OCs."}
        testId="hon-apr-vazio" />
    );
  }

  const legenda = "Honorários aprovados de todos os eventos";
  let lista: ReactNode;
  if (visiveis.length === 0) {
    lista = (
      <EstadoDaValidacao icone={<SearchX aria-hidden="true" />} titulo={filtros.situacao === "sem_oc" && !filtros.q.trim() ? "Nenhuma liberação sem OC" : "Nada com esses filtros"}
        texto={filtros.situacao === "sem_oc" && !filtros.q.trim() ? "Todas as liberações deste recorte já têm a OC/DP." : "Nenhum aprovado bate com o período, o evento, a situação ou a busca."}
        acao={<Button type="button" variant="outline" size="sm" className="val-alvo" onClick={limpar}>Limpar filtros</Button>}
        testId="hon-apr-filtro-vazio" />
    );
  } else if (filtros.agrupar) {
    lista = (
      <div className="space-y-5">
        {grupos.map((g) => {
          const st = totais(g);
          const e = g[0];
          return (
            <section key={e.eventId} aria-label={e.eventName ?? "Evento"} className="space-y-2" data-testid={`hon-apr-evento-${e.eventId}`}>
              <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1.5">
                <div className="min-w-0 flex-1 basis-[220px]">
                  <h3 className="break-words text-sm font-semibold text-foreground">{e.eventName}</h3>
                  <p className="text-2xs tabular-nums text-muted-foreground">{periodoCurto(e.eventStartDate, e.eventEndDate)} · {(e.eventStartDate ?? "").slice(0, 4)} · {plural(g.length, "item", "itens")}</p>
                </div>
                <p className="flex gap-4 text-left sm:text-right" data-testid="hon-apr-subtotal">
                  <Numero rotulo="Aprovado" valor={brlCurto(st.aprovado)} />
                  <Numero rotulo="Liberado" valor={brlCurto(st.liberado)} />
                  <Numero rotulo="A liberar" valor={brlCurto(st.aLiberar)} tom={st.aLiberar > 0 ? "warning" : undefined} />
                </p>
              </header>
              <Tabela linhas={g} comEvento={false} legenda={`${legenda} — ${e.eventName ?? "evento"}`} onAbrir={onAbrirNoEvento} onInformarOc={abrirOc} />
            </section>
          );
        })}
      </div>
    );
  } else {
    lista = <Tabela linhas={visiveis} comEvento legenda={legenda} onAbrir={onAbrirNoEvento} onInformarOc={abrirOc} />;
  }

  return (
    <div className="val-entra space-y-4" data-testid="hon-aprovados">
      {visao === "quem-lanca" && (
        <p className="text-sm text-muted-foreground">
          Tudo o que o aprovador da escala já aprovou das suas funções, de todos os eventos — com o que o Financeiro liberou e as OCs.
        </p>
      )}

      {/* Filtros: período (a regra do Financeiro, pela data do evento) · evento · situação · busca. */}
      <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="w-full min-w-0 rounded-lg border border-border bg-card shadow-1 sm:w-auto">
            <FiltroDePeriodo escolha={escolha} hoje={hoje} base="evento" podeLimpar={comPeriodo}
              onEscolha={(e) => onFiltros({ periodo: e.atalho, de: e.atalho === "personalizado" ? e.de ?? "" : "", ate: e.atalho === "personalizado" ? e.ate ?? "" : "" })}
              onLimpar={() => onFiltros({ periodo: "tudo", de: "", ate: "" })} />
          </div>
          <div className="w-full min-w-0 rounded-lg border border-border bg-card px-1 shadow-1 sm:w-[300px]" data-testid="hon-apr-evento">
            <EventSearchSelect variante="barra" value={filtros.evento} onValueChange={(id) => onFiltros({ evento: id })} events={eventos} rotuloVazio="Todos os eventos"
              detalhe={eventoEscolhido ? periodoCurto(eventoEscolhido.startDate, eventoEscolhido.endDate) : plural(eventos.length, "evento com aprovado", "eventos com aprovados")} />
          </div>
        </div>
        <div className="w-full lg:ml-auto lg:w-[280px]">
          <BuscaDaLista valor={filtros.q} onChange={(v) => onFiltros({ q: v })} placeholder="Nome, evento ou OC" rotulo="Buscar por nome, evento ou OC" testid="hon-apr-busca" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="val-rolagem-x max-w-full">
          <div role="radiogroup" aria-label="Situação da verba" className="flex min-w-max gap-0.5 rounded-lg border border-border bg-background p-[3px]">
            {SITUACOES_DO_FILTRO.map((s) => {
              const on = filtros.situacao === s.id;
              const n = contagem[s.id];
              return (
                <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => onFiltros({ situacao: s.id })} data-testid={`hon-apr-situacao-${s.id}`}
                  className={cn(BOTAO_DE_OPCAO, on ? "bg-card font-semibold text-primary shadow-1 ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
                  {s.rotulo}
                  <span className={cn("tabular-nums", on ? "text-primary" : "text-muted-foreground", s.id === "sem_oc" && n > 0 && !on && "font-semibold text-warning")}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
            <Switch checked={filtros.agrupar} onCheckedChange={(v) => onFiltros({ agrupar: v })} aria-label="Agrupar por evento" data-testid="hon-apr-agrupar" />
            Agrupar por evento
          </label>
          <Button type="button" variant="outline" size="sm" className="val-alvo" onClick={exportar} disabled={visiveis.length === 0} data-testid="hon-apr-exportar"
            title={filtrando ? `Exporta o que está na tela${comPeriodo ? ` (${periodoTexto}, pela data do evento)` : ""}` : "Exporta todos os aprovados"}>
            <Download className="h-4 w-4" aria-hidden="true" /> Exportar CSV
          </Button>
        </div>
      </div>

      <FaixaDeTotais testId="hon-apr-totais" itens={[
        { rotulo: "Aprovado", valor: brlCurto(t.aprovado), detalhe: plural(t.eventos, "evento", "eventos"), destaque: "success" },
        { rotulo: "Liberado", valor: brlCurto(t.liberado), detalhe: t.aprovado ? `${Math.round((t.liberado / t.aprovado) * 100)}% do aprovado · ${plural(t.liberacoes, "OC/DP", "OCs/DPs")}` : "—" },
        { rotulo: "A liberar", valor: brlCurto(t.aLiberar), detalhe: t.aLiberar > 0 ? "com o Financeiro" : "nada pendente", destaque: t.aLiberar > 0 ? "warning" : undefined },
        { rotulo: "Itens", valor: String(t.itens), detalhe: t.liberacoesSemOc ? <span className="font-medium text-warning">{plural(t.liberacoesSemOc, "liberação sem OC", "liberações sem OC")}</span> : "todas as liberações com OC" },
      ]} />

      {filtrando && (
        <p className="-mt-1 text-xs text-muted-foreground" aria-live="polite" data-testid="hon-apr-resumo-filtro">
          {plural(visiveis.length, "item", "itens")} de {todas.length}
          {comPeriodo ? <> · eventos de <span className="font-medium text-foreground">{periodoTexto}</span></> : null}
          {eventoEscolhido ? <> · {eventoEscolhido.name}</> : null}
          {filtros.situacao !== "todas" ? <> · {situacaoTexto.toLowerCase()}</> : null}
          {" · "}
          <button type="button" onClick={limpar} className="val-alvo rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Limpar filtros</button>
        </p>
      )}

      {lista}

      <InformarOcDialog alvo={alvoDaOc} onClose={() => setAlvoDaOc(null)} />
    </div>
  );
}
