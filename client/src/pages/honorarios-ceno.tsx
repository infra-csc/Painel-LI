/**
 * Honorários da cenotécnica — a tela do FINANCEIRO (16/10).
 *
 * "Depois disso o Financeiro tem que estar lá e ter alguns relatórios,
 * principalmente total por evento de valor, e colocar quando liberar a verba."
 *
 * Três abas: A liberar (aprovados com verba pendente, por evento, com o
 * registro da liberação — aceita parcial), Liberados (o que já foi pago, com
 * as OCs) e Relatórios (por evento, mês, pessoa/empreita e setor × posição,
 * com CSV). A barra filtra por evento; sem evento, tudo.
 *
 * 23/10: filtro por PERÍODO na barra (shared/honorarios-periodo.ts). Em "A
 * liberar" e nos Relatórios vale a data do evento; em "Liberados", a data da
 * liberação (padrão — o Financeiro fecha o mês pelo que pagou) ou a do
 * evento. Vale para a faixa de totais, as listas, os relatórios e os CSVs
 * (nome do arquivo e linhas de abertura dizem o período). A tela é também a
 * única do perfil "Honorários (liberação)".
 *
 * 30/10 (dono): a OC/DP deixou de ser obrigatória na liberação; quem coloca a
 * OC é o DP, inclusive depois. Em Liberados cada liberação sem OC aparece como
 * "sem OC" com "Informar OC" (DP/admin) e há o atalho "Sem OC". O DP e o admin
 * ganham a aba "Aprovados (todos os eventos)" (a mesma de quem lança) — ela
 * tem filtros próprios, então a barra esconde evento/período nela.
 */
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Banknote, CheckCircle2, CloudOff, Download, FileBarChart, FileDigit, History, Inbox, Lock, Pencil, SearchX, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Event } from "@shared/schema";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { BuscaDaLista } from "@/components/common/barra-de-filtros";
import { EventSearchSelect } from "@/components/event-select";
import { Button } from "@/components/ui/button";
import { campo, useUrlState } from "@/lib/use-url-state";
import { useMediaQuery } from "@/lib/use-media-query";
import { apiErrorMessage, cn } from "@/lib/utils";
import { normalizarNomeDeFuncao } from "@shared/cenotecnica";
import { ETAPA_LABEL, diariasDoValor, etapaDoHonorario, rotuloDoValor, somar, temOc, valorPorDiaria, reaisParaCsv, type TipoDeRelatorio } from "@shared/honorarios-ceno";
import { BotaoTentarDeNovo, EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";
import { downloadCsv, slugify } from "@/components/scaling-validation/event-view/event-view-shared";
import { MOLDURA } from "@/components/scaling-approval/tokens";
import { useAcessoHonorarios, useHonorariosDoFinanceiro, type HonorarioDoFinanceiro, type Liberacao } from "@/components/honorarios-ceno/api";
import { AvisoDaLinha, BarraDaVerba, EtapaBadge, FaixaDeTotais, OrigemDaLinha, OrigemDoValor, ValorComDiaria, VagasDaEmpreitaLista, brl, brlCurto, dataBr, diariasTexto, periodoCurto, posicaoLabel, setorLabel } from "@/components/honorarios-ceno/pecas";
import { HistoricoSheet } from "@/components/honorarios-ceno/historico-sheet";
import { EstornoDialog, InformarOcDialog, LiberacaoDialog, type AlvoDaOc } from "@/components/honorarios-ceno/financeiro-dialogos";
import { AprovadosDeTodosOsEventos, FILTROS_PADRAO, type FiltrosDosAprovados } from "@/components/honorarios-ceno/aprovados-todos";
import { Relatorios, TIPOS_DE_RELATORIO } from "@/components/honorarios-ceno/relatorios";
import { FiltroDePeriodo } from "@/components/honorarios-ceno/filtro-de-periodo";
import { hojeISO } from "@shared/hoje-sp";
import {
  descricaoDoIntervalo, ehAtalhoDoPeriodo, intervaloDoPeriodo, preambuloDoCsv, recortarPelaDataDaLiberacao, recortarPelaDataDoEvento,
  semLimite, sufixoDoPeriodo, totaisPagosNoPeriodo, BASE_DO_PERIODO_LABEL,
  type AtalhoDoPeriodo, type BaseDoPeriodo, type EscolhaDoPeriodo, type LinhaPagaNoPeriodo,
} from "@shared/honorarios-periodo";

type PagoNoPeriodo = LinhaPagaNoPeriodo<HonorarioDoFinanceiro, Liberacao>;

type Aba = "liberar" | "liberados" | "relatorios" | "aprovados";

const ABAS: { id: Aba; rotulo: string; icone: LucideIcon }[] = [
  { id: "liberar", rotulo: "A liberar", icone: Banknote },
  { id: "liberados", rotulo: "Liberados", icone: CheckCircle2 },
  { id: "relatorios", rotulo: "Relatórios", icone: FileBarChart },
  // 30/10: só DP e admin (quem coloca as OCs) — a mesma aba de quem lança.
  { id: "aprovados", rotulo: "Aprovados (todos os eventos)", icone: BadgeCheck },
];

/** Liberações que valem e estão sem OC/DP (30/10: a OC é opcional na liberação). */
const semOc = (h: HonorarioDoFinanceiro) => h.liberacoes.filter((l) => !l.estornadaEm && !temOc(l.oc));

const TH = "px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function casaBusca(h: HonorarioDoFinanceiro, q: string): boolean {
  if (!q.trim()) return true;
  const t = normalizarNomeDeFuncao(q);
  return [h.nome, h.eventName, h.functionName, ...h.liberacoes.map((l) => l.oc)].some((x) => normalizarNomeDeFuncao(x).includes(t));
}

/**
 * CSV das linhas. `pagos` (Liberados pela data da liberação): só os pedidos
 * pagos no período, com a coluna "Liberado no período" e as OCs/DPs do
 * período (com a data). `preambulo`: as linhas de abertura com o período.
 */
function exportarLinhas(linhas: HonorarioDoFinanceiro[], nomeDoArquivo: string, preambulo: string[][], pagos?: PagoNoPeriodo[]) {
  const porPago = pagos ? new Map(pagos.map((p) => [p.linha.id, p])) : null;
  const cabecalho = ["Evento", "Data do evento", "Nome", "Tipo", "Origem do valor", "Vagas da empreita", "Setor", "Posição", "Início", "Fim", "Diárias", "Valor pedido (R$)", "Valor aprovado (R$)", "Por diária (R$)", "Situação", "Liberado (R$)", "Falta liberar (R$)", ...(porPago ? ["Liberado no período (R$)"] : []), "OC/DP", "Pedido por", "Decidido por"];
  const linhasCsv = linhas.map((h) => {
    const vigente = h.valorAprovado ?? h.valorPedido;
    const pd = valorPorDiaria(vigente, diariasDoValor(h));
    const pago = porPago?.get(h.id);
    const oc = (l: Liberacao) => (temOc(l.oc) ? l.oc.trim() : "sem OC");
    const ocs = pago ? pago.liberacoes.map((l) => `${oc(l)} (${dataBr(l.data)})`) : h.liberacoes.filter((l) => !l.estornadaEm).map(oc);
    return [
      h.eventName ?? "", dataBr(h.eventStartDate), h.nome, h.tipo === "empreita" ? "Empreita" : h.semColaborador ? "Vaga sem colaborador" : "Vaga", rotuloDoValor(h), (h.vagasDaEmpreita ?? []).map((v) => `#${v.inclusionNumber}`).join(" "), setorLabel(h.setor), posicaoLabel(h.posicao),
      dataBr(h.inicio), dataBr(h.fim), String(diariasDoValor(h) ?? ""), reaisParaCsv(h.valorPedido), h.valorAprovado != null ? reaisParaCsv(h.valorAprovado) : "",
      pd != null ? reaisParaCsv(pd) : "", ETAPA_LABEL[etapaDoHonorario(h)], reaisParaCsv(h.liberado), reaisParaCsv(h.falta),
      ...(porPago ? [reaisParaCsv(pago?.liberadoNoPeriodo ?? 0)] : []),
      ocs.join(" / "), h.enviadoPorNome ?? h.criadoPorNome, h.decididoPorNome ?? "",
    ];
  });
  downloadCsv(nomeDoArquivo, cabecalho, linhasCsv, preambulo);
}

/** "OC 45123, 45124 · 1 sem OC" — o que já foi liberado do pedido, numa linha. */
function textoDasOcs(h: HonorarioDoFinanceiro): string {
  const com = h.liberacoes.filter((l) => !l.estornadaEm && temOc(l.oc)).map((l) => l.oc.trim());
  const sem = semOc(h).length;
  return [com.length ? `OC ${com.join(", ")}` : "", sem ? `${sem} sem OC` : ""].filter(Boolean).join(" · ");
}

function LinhaALiberar({ h, onLiberar, onHistorico }: { h: HonorarioDoFinanceiro; onLiberar: () => void; onHistorico: () => void }) {
  const ocs = textoDasOcs(h);
  return (
    <tr className="apr-linha border-b border-border align-top last:border-b-0 bg-card hover:bg-surface-muted/50" data-testid={`hon-fin-${h.id}`}>
      <td data-primeira className="px-3 py-3">
        <span className="block break-words text-sm font-semibold leading-5 text-foreground">{h.nome}</span>
        <span className="block"><OrigemDaLinha h={h} /></span>
        <OrigemDoValor h={h} className="mt-0.5" />
        <span className="block text-2xs text-slate-600">{periodoCurto(h.inicio, h.fim)} · {diariasTexto(h.diarias)}</span>
        {h.tipo === "empreita" && <VagasDaEmpreitaLista vagas={h.vagasDaEmpreita ?? []} className="mt-0.5" />}
        <AvisoDaLinha h={h} />
      </td>
      <td data-rotulo="Aprovado" className="px-3 py-3"><ValorComDiaria valor={h.valorAprovado} diarias={diariasDoValor(h)} riscado={h.valorPedido} alinhar="esquerda" className="xl:text-right" /></td>
      <td data-rotulo="Liberado" className="px-3 py-3">
        <span className="block text-right text-sm tabular-nums text-foreground max-xl:text-left">{h.liberado ? brlCurto(h.liberado) : "—"}</span>
        {ocs && <span className="block truncate text-right text-2xs text-muted-foreground max-xl:text-left">{ocs}</span>}
      </td>
      <td data-rotulo="Falta" className="px-3 py-3">
        <span className="block text-right text-sm font-semibold tabular-nums text-warning max-xl:text-left">{brlCurto(h.falta)}</span>
        {h.valorAprovado ? <BarraDaVerba aprovado={h.valorAprovado} liberado={h.liberado} rotulo={false} className="ml-auto mt-1.5 max-w-[110px] max-xl:ml-0" /> : null}
      </td>
      <td data-rotulo="Aprovação" className="px-3 py-3">
        <EtapaBadge h={h} visao="financeiro" />
        <span className="mt-1 block text-2xs text-muted-foreground">{h.status === "aprovado_ajuste" ? "com ajuste · " : ""}{h.decididoPorNome}</span>
      </td>
      <td data-col="acoes" className="whitespace-nowrap py-2.5 pl-2 pr-3 text-right">
        <span className="inline-flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="val-alvo h-8 w-8 p-0 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onHistorico} aria-label={`Histórico de ${h.nome}`}>
            <History className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" size="sm" className="val-alvo h-8 rounded-lg border border-success/35 bg-success-soft px-2.5 text-xs font-semibold text-success hover:border-success hover:bg-success hover:text-white" onClick={onLiberar} aria-label={`Registrar liberação de ${h.nome}`}>
            <Banknote className="h-3.5 w-3.5" aria-hidden="true" /> {h.liberado > 0 ? "Liberar o resto" : "Liberar"}
          </Button>
        </span>
      </td>
    </tr>
  );
}

/** O mesmo pedido em cartão (abaixo de 1280px): os três números lado a lado e a ação no rodapé. */
function CartaoALiberar({ h, onLiberar, onHistorico }: { h: HonorarioDoFinanceiro; onLiberar: () => void; onHistorico: () => void }) {
  const ocs = textoDasOcs(h);
  const num = (rotulo: string, valor: React.ReactNode, cls?: string) => (
    <div className="min-w-0"><dt className="text-2xs text-muted-foreground">{rotulo}</dt><dd className={cn("text-sm font-semibold tabular-nums", cls ?? "text-foreground")}>{valor}</dd></div>
  );
  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card shadow-1" data-testid={`hon-fin-${h.id}`}>
      <div className="space-y-3 px-3.5 pb-3 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="block break-words text-sm font-semibold leading-5 text-foreground">{h.nome}</span>
            <span className="block"><OrigemDaLinha h={h} /></span>
            <OrigemDoValor h={h} />
            <span className="block text-2xs text-slate-600">{diariasTexto(h.diarias)}</span>
            {h.tipo === "empreita" && <VagasDaEmpreitaLista vagas={h.vagasDaEmpreita ?? []} className="mt-0.5" />}
            <AvisoDaLinha h={h} />
          </div>
          <EtapaBadge h={h} visao="financeiro" />
        </div>
        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-surface-muted/70 px-3 py-2">
          {num("Aprovado", brlCurto(h.valorAprovado))}
          {num("Liberado", h.liberado ? brlCurto(h.liberado) : "—")}
          {num("Falta", brlCurto(h.falta), "text-warning")}
        </dl>
        {h.valorAprovado ? <BarraDaVerba aprovado={h.valorAprovado} liberado={h.liberado} rotulo={false} /> : null}
        <p className="text-2xs text-muted-foreground">
          {h.status === "aprovado_ajuste" ? `Aprovado com ajuste (pedido ${brlCurto(h.valorPedido)})` : "Aprovado"} por {h.decididoPorNome}
          {ocs ? ` · ${ocs}` : ""}
        </p>
      </div>
      <div className="flex items-center justify-end gap-1 border-t border-border bg-surface-muted/60 px-2 py-1.5">
        <Button type="button" variant="ghost" size="sm" className="val-alvo h-8 w-8 p-0 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onHistorico} aria-label={`Histórico de ${h.nome}`}>
          <History className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" size="sm" className="val-alvo h-8 rounded-lg border border-success/35 bg-success-soft px-3 text-xs font-semibold text-success hover:border-success hover:bg-success hover:text-white" onClick={onLiberar} aria-label={`Registrar liberação de ${h.nome}`}>
          <Banknote className="h-3.5 w-3.5" aria-hidden="true" /> {h.liberado > 0 ? "Liberar o resto" : "Liberar"}
        </Button>
      </div>
    </li>
  );
}

const Numero = ({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "warning" }) => (
  <span><span className="block text-2xs text-muted-foreground">{rotulo}</span><span className={cn("block text-sm font-semibold tabular-nums", tom === "warning" ? "text-warning" : "text-foreground")}>{valor}</span></span>
);

/** Agrupa por evento. `numeros`: o que o cabeçalho do grupo soma (padrão: aprovado e a liberar). */
function PorEvento({ linhas, render, numeros }: {
  linhas: HonorarioDoFinanceiro[];
  render: (doEvento: HonorarioDoFinanceiro[]) => React.ReactNode;
  numeros?: (doEvento: HonorarioDoFinanceiro[]) => React.ReactNode;
}) {
  const grupos = useMemo(() => {
    const m = new Map<string, HonorarioDoFinanceiro[]>();
    for (const h of linhas) m.set(h.eventId, [...(m.get(h.eventId) ?? []), h]);
    return Array.from(m.values());
  }, [linhas]);
  return (
    <div className="space-y-5">
      {grupos.map((g) => {
        const t = somar(g);
        return (
          <section key={g[0].eventId} aria-label={g[0].eventName ?? "Evento"} className="space-y-2">
            <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-foreground">{g[0].eventName}</h3>
                <p className="text-2xs text-muted-foreground">{dataBr(g[0].eventStartDate)} · {g.length} {g.length === 1 ? "linha" : "linhas"}</p>
              </div>
              <p className="flex gap-4 text-right">
                {numeros ? numeros(g) : (
                  <>
                    <Numero rotulo="Aprovado" valor={brl(t.aprovado)} />
                    <Numero rotulo="A liberar" valor={brl(t.aLiberar)} tom="warning" />
                  </>
                )}
              </p>
            </header>
            {render(g)}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Pedido liberado. `pago` (base data da liberação): só as OCs/DPs do período e
 * a soma delas; se ainda falta verba, o selo "parcial" diz quanto.
 */
function LinhaLiberada({ h, pago, onHistorico, onInformarOc }: { h: HonorarioDoFinanceiro; pago?: PagoNoPeriodo; onHistorico: () => void; onInformarOc?: (l: Liberacao) => void }) {
  const ativas = pago ? pago.liberacoes : h.liberacoes.filter((l) => !l.estornadaEm);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3" data-testid={`hon-liberado-${h.id}`}>
      <span className="min-w-0 flex-1 basis-[220px]">
        <span className="block truncate text-sm font-semibold text-foreground">{h.nome}</span>
        <span className="block truncate text-2xs text-muted-foreground">{rotuloDoValor(h)} · {diariasTexto(h.diarias)}</span>
        {pago && h.falta > 0 && (
          <span className="mt-0.5 inline-flex items-center rounded-full bg-warning-soft px-2 py-0.5 text-2xs font-medium text-warning">Parcial · faltam {brlCurto(h.falta)}</span>
        )}
        <AvisoDaLinha h={h} />
      </span>
      <span className="min-w-[200px] text-xs text-slate-700">
        {ativas.map((l: Liberacao) => (
          <span key={l.id} className="flex flex-wrap items-center gap-x-1.5 tabular-nums">
            {temOc(l.oc) ? <span>OC/DP {l.oc.trim()}</span> : <span className="rounded bg-warning-soft px-1 text-2xs font-medium text-warning">sem OC</span>}
            <span>· {dataBr(l.data)} · {brlCurto(l.valor)}</span>
            {onInformarOc && (temOc(l.oc) ? (
              <button type="button" onClick={() => onInformarOc(l)} aria-label={`Editar a OC ${l.oc.trim()} de ${h.nome}`} title="Corrigir a OC/DP"
                className="val-alvo inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Pencil className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : (
              <button type="button" onClick={() => onInformarOc(l)} aria-label={`Informar a OC da liberação de ${dataBr(l.data)} de ${h.nome}`}
                className="val-alvo inline-flex h-6 items-center gap-1 rounded px-1 text-2xs font-semibold text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <FileDigit className="h-3 w-3" aria-hidden="true" /> Informar OC
              </button>
            ))}
          </span>
        ))}
      </span>
      <span className="w-[120px] text-right text-sm font-semibold tabular-nums text-foreground">{brl(pago ? pago.liberadoNoPeriodo : h.liberado)}</span>
      <Button type="button" variant="ghost" size="sm" className="val-alvo h-8 w-8 p-0 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onHistorico} aria-label={`Histórico de ${h.nome}`}>
        <History className="h-4 w-4" aria-hidden="true" />
      </Button>
    </li>
  );
}

export default function HonorariosCenoPage() {
  usePageTitle("Honorários da cenotécnica");
  const acesso = useAcessoHonorarios();
  const largo = useMediaQuery("(min-width: 1280px)");
  const podeVer = !!acesso.data?.podeLiberar;
  // 30/10 (dono): quem lança a cenotécnica abre esta tela e vê só os
  // aprovados de todos os eventos (a mesma lista da Escalação), sem liberar verba.
  const soQuemLanca = !podeVer && !!acesso.data?.podePedir;
  const q = useHonorariosDoFinanceiro(null, podeVer);
  const [url, setUrl] = useUrlState({
    aba: campo.opcao<Aba>("liberar"),
    evento: campo.texto(""),
    relatorio: campo.opcao<TipoDeRelatorio>("evento"),
    q: campo.texto(""),
    // Período (23/10): atalho ou "personalizado" com de/até; base da aba Liberados.
    periodo: campo.opcao<AtalhoDoPeriodo>("tudo"),
    de: campo.texto(""),
    ate: campo.texto(""),
    base: campo.opcao<BaseDoPeriodo>("liberacao"),
    /** Liberados: só o que tem liberação sem OC (30/10 — o DP acha o que falta). */
    semOc: campo.booleano(false, "sem-oc"),
  });
  const podeInformarOc = !!acesso.data?.podeInformarOc;
  const abas = ABAS.filter((a) => a.id !== "aprovados" || podeInformarOc);
  const aba: Aba = abas.some((a) => a.id === url.aba) ? url.aba : "liberar";
  const [filtrosAprovados, setFiltrosAprovados] = useState<FiltrosDosAprovados>(FILTROS_PADRAO);
  const [alvoDaOc, setAlvoDaOc] = useState<AlvoDaOc | null>(null);
  // No celular as abas rolam de lado: a escolhida (inclusive vinda do link) fica à vista.
  useEffect(() => { document.getElementById(`hon-tab-${aba}`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [aba]);
  const tipo: TipoDeRelatorio = TIPOS_DE_RELATORIO.includes(url.relatorio) ? url.relatorio : "evento";
  const [liberando, setLiberando] = useState<HonorarioDoFinanceiro | null>(null);
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const [estornando, setEstornando] = useState<{ h: HonorarioDoFinanceiro; l: Liberacao } | null>(null);

  // ── Período ──
  const hoje = useMemo(() => hojeISO(), []);
  const escolha = useMemo<EscolhaDoPeriodo>(
    () => (ehAtalhoDoPeriodo(url.periodo) ? { atalho: url.periodo, de: url.de || null, ate: url.ate || null } : { atalho: "tudo" }),
    [url.periodo, url.de, url.ate],
  );
  const intervalo = useMemo(() => intervaloDoPeriodo(escolha, hoje), [escolha, hoje]);
  const comPeriodo = !semLimite(intervalo);
  const baseDosLiberados: BaseDoPeriodo = url.base === "evento" ? "evento" : "liberacao";
  // "A liberar" e Relatórios: sempre a data do evento. "Liberados": a escolhida.
  const base: BaseDoPeriodo = aba === "liberados" ? baseDosLiberados : "evento";
  const pelaLiberacao = aba === "liberados" && baseDosLiberados === "liberacao";
  const escolherPeriodo = (e: EscolhaDoPeriodo) => setUrl({ periodo: e.atalho, de: e.atalho === "personalizado" ? e.de ?? "" : "", ate: e.atalho === "personalizado" ? e.ate ?? "" : "" });
  const limparPeriodo = () => setUrl({ periodo: "tudo", de: "", ate: "", base: "liberacao" });

  const todas = useMemo(() => q.data ?? [], [q.data]);
  const eventos = useMemo(() => {
    const m = new Map<string, Event>();
    for (const h of todas) if (!m.has(h.eventId)) m.set(h.eventId, { id: h.eventId, name: h.eventName ?? "Evento", startDate: h.eventStartDate ?? "", endDate: h.eventEndDate ?? "" } as unknown as Event);
    return Array.from(m.values());
  }, [todas]);
  const doEvento = useMemo(() => (url.evento ? todas.filter((h) => h.eventId === url.evento) : todas), [todas, url.evento]);
  /** Evento escolhido + período pela data do evento — base de A liberar, Relatórios e da faixa. */
  const noPeriodo = useMemo(() => recortarPelaDataDoEvento(doEvento, intervalo), [doEvento, intervalo]);
  /** Liberados pela data da liberação: o que foi pago no período. */
  const pagos = useMemo<PagoNoPeriodo[]>(() => recortarPelaDataDaLiberacao<Liberacao, HonorarioDoFinanceiro>(doEvento, intervalo), [doEvento, intervalo]);
  const pagoPorId = useMemo(() => new Map(pagos.map((p) => [p.linha.id, p])), [pagos]);
  const t = useMemo(() => somar(noPeriodo), [noPeriodo]);
  const tPagos = useMemo(() => totaisPagosNoPeriodo(pagos), [pagos]);
  const aLiberar = noPeriodo.filter((h) => h.falta > 0 && (h.status === "aprovado" || h.status === "aprovado_ajuste") && casaBusca(h, url.q));
  // "Sem OC": tudo o que tem liberação sem OC no recorte — pago por completo ou em parte.
  const liberadosSemFiltroDeOc = pelaLiberacao
    ? pagos.map((p) => p.linha)
    : url.semOc ? noPeriodo.filter((h) => h.liberado > 0) : noPeriodo.filter((h) => h.valorAprovado != null && h.falta === 0 && h.liberado > 0);
  // Pela data da liberação vale só o que foi pago no período (as OCs que a linha mostra).
  const temSemOc = (h: HonorarioDoFinanceiro) => (pelaLiberacao ? (pagoPorId.get(h.id)?.liberacoes ?? []).some((l) => !temOc(l.oc)) : semOc(h).length > 0);
  const nSemOc = liberadosSemFiltroDeOc.filter(temSemOc).length;
  const liberados = liberadosSemFiltroDeOc.filter((h) => (!url.semOc || temSemOc(h)) && casaBusca(h, url.q));
  const informarOc = podeInformarOc
    ? (h: HonorarioDoFinanceiro, l: { id: string; data: string; oc: string; valor: number }) => setAlvoDaOc({ honorarioId: h.id, nome: h.nome, eventName: h.eventName, liberacao: { id: l.id, data: l.data, oc: l.oc, valor: l.valor } })
    : undefined;
  const nALiberar = noPeriodo.filter((h) => h.falta > 0 && (h.status === "aprovado" || h.status === "aprovado_ajuste")).length;
  const eventoEscolhido = eventos.find((e) => e.id === url.evento);
  const sufixoDoEvento = eventoEscolhido ? `-${slugify(eventoEscolhido.name)}` : "";
  const periodoTexto = descricaoDoIntervalo(intervalo);
  const linhasParaExportar = pelaLiberacao ? pagos.map((p) => p.linha) : noPeriodo;
  const exportar = () => exportarLinhas(
    linhasParaExportar,
    `honorarios-cenotecnica-linhas${sufixoDoEvento}${sufixoDoPeriodo(intervalo, base)}.csv`,
    preambuloDoCsv(pelaLiberacao ? "Honorários da cenotécnica — liberados no período" : "Honorários da cenotécnica — linhas", intervalo, base, eventoEscolhido?.name),
    pelaLiberacao ? pagos : undefined,
  );

  const barra = (
    <PageHeader
      variant="bar"
      title="Honorários da cenotécnica"
      className="gap-x-3 max-sm:static"
      subtitle={soQuemLanca ? "valores aprovados de todos os eventos" : eventos.length === 0 ? "aprovados pelo aprovador da escala, à espera da verba" : undefined}
      context={eventos.length > 0 && aba !== "aprovados" ? (
        <>
          <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-border sm:block" />
          <EventSearchSelect variante="barra" value={url.evento} onValueChange={(id) => setUrl({ evento: id })} events={eventos} rotuloVazio="Todos os eventos"
            detalhe={eventoEscolhido ? `${dataBr(eventoEscolhido.startDate)} · ${doEvento.length} linhas` : `${eventos.length} ${eventos.length === 1 ? "evento" : "eventos"} com honorários`} />
          <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-border sm:block" />
          <FiltroDePeriodo escolha={escolha} onEscolha={escolherPeriodo} hoje={hoje} base={base}
            onBase={aba === "liberados" ? (b) => setUrl({ base: b }) : undefined}
            onLimpar={limparPeriodo} podeLimpar={comPeriodo || baseDosLiberados !== "liberacao"} />
        </>
      ) : undefined}
      actions={podeVer && aba !== "aprovados" && linhasParaExportar.length > 0 ? (
        <Button type="button" variant="outline" size="sm" className="val-alvo" onClick={exportar} data-testid="hon-exportar-linhas"
          title={comPeriodo ? `Exporta as linhas de ${periodoTexto} (${BASE_DO_PERIODO_LABEL[base]})` : undefined}>
          <Download className="h-4 w-4" aria-hidden="true" /> Exportar linhas
        </Button>
      ) : undefined}
    />
  );

  let conteudo: React.ReactNode;
  if (acesso.isLoading || (podeVer && q.isLoading)) {
    conteudo = (
      <div className="space-y-4" aria-busy="true" aria-label="Carregando honorários">
        <div className="val-osso h-[78px] w-full rounded-xl" />
        <div className={cn(MOLDURA, "space-y-2 p-4")}>{[0, 1, 2, 3].map((i) => <div key={i} className="val-osso h-11 w-full" />)}</div>
      </div>
    );
  } else if (soQuemLanca) {
    conteudo = (
      <AprovadosDeTodosOsEventos visao="quem-lanca" podeInformarOc={false}
        filtros={filtrosAprovados} onFiltros={(f) => setFiltrosAprovados((x) => ({ ...x, ...f }))} />
    );
  } else if (!podeVer) {
    conteudo = <EstadoDaValidacao icone={<Lock aria-hidden="true" />} titulo="Tela do Financeiro" texto="Só o Financeiro (DP), o perfil Honorários e o administrador veem os honorários a liberar." testId="hon-fin-sem-acesso" />;
  } else if (q.error) {
    conteudo = <EstadoDaValidacao tom="erro" icone={<CloudOff aria-hidden="true" />} titulo="Não foi possível carregar os honorários" texto={apiErrorMessage(q.error, "Verifique sua conexão e tente novamente.")} acao={<BotaoTentarDeNovo onClick={() => q.refetch()} tentando={q.isFetching} />} />;
  } else if (todas.length === 0) {
    conteudo = <EstadoDaValidacao icone={<Wallet aria-hidden="true" />} titulo="Nenhum honorário enviado ainda" texto="Quando a cenotécnica enviar o valor negociado e o aprovador da escala aprovar, o pedido aparece aqui para você registrar a liberação da verba." testId="hon-fin-vazio" />;
  } else {
    const contagem: Record<Aba, number | null> = { liberar: nALiberar, liberados: null, relatorios: null, aprovados: null };
    // Faixa: na aba Liberados pela data da liberação, o que foi PAGO no
    // período; no resto, os totais dos eventos do período.
    const noPeriodoTexto = comPeriodo ? " no período" : "";
    const itensDaFaixa = pelaLiberacao ? [
      { rotulo: `Liberado${noPeriodoTexto}`, valor: brlCurto(tPagos.liberado), detalhe: plural(tPagos.liberacoes, "OC/DP", "OCs/DPs"), destaque: "success" as const },
      { rotulo: "Pedidos pagos", valor: String(tPagos.pedidos), detalhe: plural(tPagos.eventos, "evento", "eventos") },
      { rotulo: "Aprovado desses pedidos", valor: brlCurto(tPagos.aprovadoDessesPedidos), detalhe: tPagos.aprovadoDessesPedidos ? `${Math.round((tPagos.liberado / tPagos.aprovadoDessesPedidos) * 100)}% liberado${noPeriodoTexto}` : "—" },
      { rotulo: "Ainda falta desses pedidos", valor: brlCurto(tPagos.faltaDessesPedidos), detalhe: tPagos.faltaDessesPedidos > 0 ? "liberação parcial" : "pagos por completo", destaque: tPagos.faltaDessesPedidos > 0 ? "warning" as const : undefined },
    ] : [
      { rotulo: "Aprovado", valor: brlCurto(t.aprovado), detalhe: plural(noPeriodo.filter((h) => h.valorAprovado != null).length, "pedido", "pedidos"), destaque: "success" as const },
      { rotulo: "Liberado", valor: brlCurto(t.liberado), detalhe: t.aprovado ? `${Math.round((t.liberado / t.aprovado) * 100)}% do aprovado` : "—" },
      { rotulo: "A liberar", valor: brlCurto(t.aLiberar), detalhe: `${nALiberar} ${nALiberar === 1 ? "pedido" : "pedidos"}`, destaque: t.aLiberar > 0 ? "warning" as const : undefined },
      { rotulo: "Aguardando aprovação", valor: brlCurto(t.aguardando), detalhe: t.emNegociacao ? `${t.emNegociacao} em negociação` : "com o aprovador da escala" },
    ];
    const limparFiltros = <Button type="button" variant="outline" size="sm" className="val-alvo" onClick={limparPeriodo} data-testid="hon-limpar-periodo">Limpar período</Button>;
    conteudo = (
      <>
        {comPeriodo && aba !== "aprovados" && (
          <p className="-mb-2 text-xs text-muted-foreground" data-testid="hon-periodo-resumo" aria-live="polite">
            {pelaLiberacao ? "Liberado" : "Eventos"} de <span className="font-medium text-foreground">{periodoTexto}</span> · pela {BASE_DO_PERIODO_LABEL[base]}
          </p>
        )}
        {aba !== "aprovados" && <FaixaDeTotais testId="hon-fin-totais" itens={itensDaFaixa} />}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 sm:border-b sm:border-border">
          <div className="val-rolagem-x -mx-[var(--page-gutter)] border-b border-border px-[var(--page-gutter)] sm:mx-0 sm:self-end sm:border-b-0 sm:px-0">
            <div role="tablist" aria-label="Honorários" className="flex min-w-max items-end gap-1">
              {abas.map((a, i) => {
                const on = aba === a.id;
                const Icone = a.icone;
                const n = contagem[a.id];
                return (
                  <button key={a.id} id={`hon-tab-${a.id}`} type="button" role="tab" aria-selected={on} aria-controls={`hon-painel-${a.id}`} tabIndex={on ? 0 : -1}
                    onClick={() => setUrl({ aba: a.id })}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                      e.preventDefault();
                      const prox = abas[(i + (e.key === "ArrowRight" ? 1 : abas.length - 1)) % abas.length];
                      setUrl({ aba: prox.id });
                      document.getElementById(`hon-tab-${prox.id}`)?.focus();
                    }}
                    className={cn("group relative -mb-px inline-flex h-11 items-center gap-2 rounded-t-md px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      on ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                    <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {a.rotulo}
                    {n ? <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-warning-soft px-1.5 text-2xs font-semibold tabular-nums text-warning">{n}</span> : null}
                    <span aria-hidden="true" className={cn("absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none", on ? "scale-x-100" : "scale-x-0")} />
                  </button>
                );
              })}
            </div>
          </div>
          {aba === "liberados" && (nSemOc > 0 || url.semOc) && (
            <button type="button" aria-pressed={url.semOc} onClick={() => setUrl({ semOc: !url.semOc })} data-testid="hon-fin-sem-oc"
              title="Liberados sem OC: liberações registradas sem OC/DP — o DP informa a OC aqui" aria-label={`Liberados sem OC (${nSemOc})`}
              className={cn("val-alvo inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-auto sm:self-center sm:mb-1.5",
                url.semOc ? "border-warning/40 bg-warning-soft text-warning" : "border-border bg-card text-slate-700 hover:border-warning/40 hover:text-warning")}>
              <FileDigit className="h-3.5 w-3.5" aria-hidden="true" /> Sem OC
              <span className="tabular-nums">{nSemOc}</span>
            </button>
          )}
          {aba !== "relatorios" && aba !== "aprovados" && (
            <div className={cn("w-full sm:pb-1.5", aba === "liberados" && (nSemOc > 0 || url.semOc) ? "sm:w-[230px]" : "sm:ml-auto sm:w-[320px]")}>
              <BuscaDaLista valor={url.q} onChange={(v) => setUrl({ q: v })} placeholder="Nome, evento ou OC/DP" rotulo="Buscar por nome, evento ou OC/DP" testid="hon-fin-busca" />
            </div>
          )}
        </div>

        <div id={`hon-painel-${aba}`} role="tabpanel" aria-labelledby={`hon-tab-${aba}`} className="val-entra">
          {aba === "liberar" && (aLiberar.length === 0 ? (
            url.q ? <EstadoDaValidacao icone={<SearchX aria-hidden="true" />} titulo="Nada com essa busca" texto="Nenhum pedido a liberar bate com o nome, evento ou OC/DP digitado." />
              : comPeriodo && noPeriodo.length === 0 ? <EstadoDaValidacao icone={<SearchX aria-hidden="true" />} titulo="Nenhum evento neste período" texto={`Nenhum honorário de evento que começa em ${periodoTexto}.`} acao={limparFiltros} testId="hon-fin-periodo-vazio" />
              : <EstadoDaValidacao icone={<CheckCircle2 aria-hidden="true" />} titulo="Nada a liberar" texto={t.aguardando > 0 ? `Tudo o que foi aprovado já tem verba. Há ${brl(t.aguardando)} aguardando o aprovador da escala.` : "Tudo o que foi aprovado já tem verba liberada."} testId="hon-fin-nada-a-liberar" />
          ) : (
            <PorEvento linhas={aLiberar} render={(g) => !largo ? (
              <ul className="grid gap-2.5 md:grid-cols-2">{g.map((h) => <CartaoALiberar key={h.id} h={h} onLiberar={() => setLiberando(h)} onHistorico={() => setHistoricoId(h.id)} />)}</ul>
            ) : (
              <div className="apr-tabela xl:rounded-xl xl:border xl:border-border xl:bg-card xl:shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]">
                <table className="w-full table-fixed text-sm">
                  <caption className="sr-only">Honorários aprovados com verba a liberar</caption>
                  <thead className="border-b border-border bg-surface-muted [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl">
                    <tr>
                      <th scope="col" className={TH}>Pessoa</th>
                      <th scope="col" className={cn(TH, "w-[150px] text-right")}>Aprovado</th>
                      <th scope="col" className={cn(TH, "w-[140px] text-right")}>Liberado</th>
                      <th scope="col" className={cn(TH, "w-[140px] text-right")}>Falta</th>
                      <th scope="col" className={cn(TH, "w-[170px]")}>Aprovação</th>
                      <th scope="col" className={cn(TH, "w-[190px] text-right")}><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>{g.map((h) => <LinhaALiberar key={h.id} h={h} onLiberar={() => setLiberando(h)} onHistorico={() => setHistoricoId(h.id)} />)}</tbody>
                </table>
              </div>
            )} />
          ))}
          {aba === "liberados" && (liberados.length === 0 ? (
            url.q ? <EstadoDaValidacao icone={<SearchX aria-hidden="true" />} titulo="Nada com essa busca" texto="Tente outro nome, evento ou OC/DP." />
              : url.semOc ? <EstadoDaValidacao icone={<CheckCircle2 aria-hidden="true" />} titulo="Nenhuma liberação sem OC" texto="Todas as liberações deste recorte já têm a OC/DP."
                  acao={<Button type="button" variant="outline" size="sm" className="val-alvo" onClick={() => setUrl({ semOc: false })}>Ver todos os liberados</Button>} testId="hon-fin-sem-oc-vazio" />
              : comPeriodo ? <EstadoDaValidacao icone={<Inbox aria-hidden="true" />} titulo="Nada liberado neste período"
                  texto={pelaLiberacao ? `Nenhuma OC/DP com data de ${periodoTexto}.` : `Nenhum evento de ${periodoTexto} com a verba inteira liberada.`} acao={limparFiltros} testId="hon-fin-periodo-vazio" />
              : <EstadoDaValidacao icone={<Inbox aria-hidden="true" />} titulo={pelaLiberacao ? "Nenhuma verba liberada ainda" : "Nenhuma verba liberada por completo ainda"}
                  texto={pelaLiberacao ? "Cada OC/DP registrada aparece aqui, com a data da liberação." : "Os pedidos com a verba inteira liberada ficam aqui, com as OCs/DPs."} />
          ) : (
            <PorEvento linhas={liberados}
              numeros={pelaLiberacao ? (g) => <Numero rotulo={`Liberado${noPeriodoTexto}`} valor={brl(g.reduce((s, h) => s + (pagoPorId.get(h.id)?.liberadoNoPeriodo ?? 0), 0))} /> : undefined}
              render={(g) => (
                <ul className={cn(MOLDURA, "divide-y divide-border overflow-hidden")}>{g.map((h) => <LinhaLiberada key={h.id} h={h} pago={pelaLiberacao ? pagoPorId.get(h.id) : undefined} onHistorico={() => setHistoricoId(h.id)} onInformarOc={informarOc ? (l) => informarOc(h, l) : undefined} />)}</ul>
              )} />
          ))}
          {aba === "aprovados" && (
            <AprovadosDeTodosOsEventos visao="financeiro" podeInformarOc={podeInformarOc}
              filtros={filtrosAprovados} onFiltros={(f) => setFiltrosAprovados((x) => ({ ...x, ...f }))}
              onAbrirNoEvento={(h) => setUrl({ aba: h.falta > 0 ? "liberar" : "liberados", evento: h.eventId, q: h.nome, periodo: "tudo", de: "", ate: "", base: "evento", semOc: false })} />
          )}
          {aba === "relatorios" && (
            <Relatorios linhas={noPeriodo} tipo={tipo} onTipo={(r) => setUrl({ relatorio: r })} sufixoDoArquivo={`${sufixoDoEvento}${sufixoDoPeriodo(intervalo, "evento")}`}
              preambulo={(rotulo) => preambuloDoCsv(`Honorários da cenotécnica — ${rotulo.toLowerCase()}`, intervalo, "evento", eventoEscolhido?.name)}
              periodo={comPeriodo ? periodoTexto : null} acaoSemDados={comPeriodo ? limparFiltros : undefined} />
          )}
        </div>
      </>
    );
  }

  return (
    <PageContainer fluid className="pb-16">
      {barra}
      <div className="mx-auto w-full max-w-[1560px] space-y-5">{conteudo}</div>
      <LiberacaoDialog h={liberando} onClose={() => setLiberando(null)} />
      <EstornoDialog alvo={estornando} onClose={() => setEstornando(null)} />
      <InformarOcDialog alvo={alvoDaOc} onClose={() => setAlvoDaOc(null)} />
      <HistoricoSheet id={historicoId} aberto={!!historicoId} onOpenChange={(o) => { if (!o) setHistoricoId(null); }} visao="financeiro"
        onEstornar={(h, l) => { const linha = todas.find((x) => x.id === h.id); if (linha) setEstornando({ h: { ...linha, versao: h.versao }, l }); }}
        onInformarOc={podeInformarOc ? (h, l) => { setHistoricoId(null); setAlvoDaOc({ honorarioId: h.id, nome: h.nome, eventName: h.eventName, liberacao: { id: l.id, data: l.data, oc: l.oc, valor: l.valor } }); } : undefined}
        acoes={(h) => h.podeLiberar ? (
          <Button type="button" className="bg-success text-white hover:bg-success/90" onClick={() => { const linha = todas.find((x) => x.id === h.id); if (linha) { setHistoricoId(null); setLiberando({ ...linha, ...h }); } }}>
            <Banknote className="h-4 w-4" aria-hidden="true" /> Registrar liberação
          </Button>
        ) : null} />
    </PageContainer>
  );
}
