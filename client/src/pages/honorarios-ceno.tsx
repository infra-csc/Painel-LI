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
 */
import { useMemo, useState } from "react";
import { Banknote, CheckCircle2, CloudOff, Download, FileBarChart, History, Inbox, Lock, SearchX, Wallet } from "lucide-react";
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
import { ETAPA_LABEL, etapaDoHonorario, somar, valorPorDiaria, reaisParaCsv, type TipoDeRelatorio } from "@shared/honorarios-ceno";
import { BotaoTentarDeNovo, EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";
import { downloadCsv, slugify } from "@/components/scaling-validation/event-view/event-view-shared";
import { MOLDURA } from "@/components/scaling-approval/tokens";
import { useAcessoHonorarios, useHonorariosDoFinanceiro, type HonorarioDoFinanceiro, type Liberacao } from "@/components/honorarios-ceno/api";
import { BarraDaVerba, EtapaBadge, FaixaDeTotais, OrigemDaLinha, ValorComDiaria, brl, brlCurto, dataBr, diariasTexto, periodoCurto, posicaoLabel, setorLabel } from "@/components/honorarios-ceno/pecas";
import { HistoricoSheet } from "@/components/honorarios-ceno/historico-sheet";
import { EstornoDialog, LiberacaoDialog } from "@/components/honorarios-ceno/financeiro-dialogos";
import { Relatorios, TIPOS_DE_RELATORIO } from "@/components/honorarios-ceno/relatorios";

type Aba = "liberar" | "liberados" | "relatorios";

const ABAS: { id: Aba; rotulo: string; icone: LucideIcon }[] = [
  { id: "liberar", rotulo: "A liberar", icone: Banknote },
  { id: "liberados", rotulo: "Liberados", icone: CheckCircle2 },
  { id: "relatorios", rotulo: "Relatórios", icone: FileBarChart },
];

const TH = "px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";

function casaBusca(h: HonorarioDoFinanceiro, q: string): boolean {
  if (!q.trim()) return true;
  const t = normalizarNomeDeFuncao(q);
  return [h.nome, h.eventName, h.functionName, ...h.liberacoes.map((l) => l.oc)].some((x) => normalizarNomeDeFuncao(x).includes(t));
}

function exportarLinhas(linhas: HonorarioDoFinanceiro[], sufixo: string) {
  const cabecalho = ["Evento", "Data do evento", "Nome", "Tipo", "Setor", "Posição", "Início", "Fim", "Diárias", "Valor pedido (R$)", "Valor aprovado (R$)", "Por diária (R$)", "Situação", "Liberado (R$)", "Falta liberar (R$)", "OC/DP", "Pedido por", "Decidido por"];
  const linhasCsv = linhas.map((h) => {
    const vigente = h.valorAprovado ?? h.valorPedido;
    const pd = valorPorDiaria(vigente, h.diarias);
    return [
      h.eventName ?? "", dataBr(h.eventStartDate), h.nome, h.tipo === "empreita" ? "Empreita" : "Vaga", setorLabel(h.setor), posicaoLabel(h.posicao),
      dataBr(h.inicio), dataBr(h.fim), String(h.diarias ?? ""), reaisParaCsv(h.valorPedido), h.valorAprovado != null ? reaisParaCsv(h.valorAprovado) : "",
      pd != null ? reaisParaCsv(pd) : "", ETAPA_LABEL[etapaDoHonorario(h)], reaisParaCsv(h.liberado), reaisParaCsv(h.falta),
      h.liberacoes.filter((l) => !l.estornadaEm).map((l) => l.oc).join(" / "), h.enviadoPorNome ?? h.criadoPorNome, h.decididoPorNome ?? "",
    ];
  });
  downloadCsv(`honorarios-cenotecnica-linhas${sufixo}.csv`, cabecalho, linhasCsv);
}

function LinhaALiberar({ h, onLiberar, onHistorico }: { h: HonorarioDoFinanceiro; onLiberar: () => void; onHistorico: () => void }) {
  const ocs = h.liberacoes.filter((l) => !l.estornadaEm);
  return (
    <tr className="apr-linha border-b border-border align-top last:border-b-0 bg-card hover:bg-surface-muted/50" data-testid={`hon-fin-${h.id}`}>
      <td data-primeira className="px-3 py-3">
        <span className="block break-words text-sm font-semibold leading-5 text-foreground">{h.nome}</span>
        <span className="block"><OrigemDaLinha h={h} /></span>
        <span className="mt-0.5 block text-2xs text-slate-600">{setorLabel(h.setor)} · {posicaoLabel(h.posicao)} · {periodoCurto(h.inicio, h.fim)} · {diariasTexto(h.diarias)}</span>
      </td>
      <td data-rotulo="Aprovado" className="px-3 py-3"><ValorComDiaria valor={h.valorAprovado} diarias={h.diarias} riscado={h.valorPedido} alinhar="esquerda" className="xl:text-right" /></td>
      <td data-rotulo="Liberado" className="px-3 py-3">
        <span className="block text-right text-sm tabular-nums text-foreground max-xl:text-left">{h.liberado ? brlCurto(h.liberado) : "—"}</span>
        {ocs.length > 0 && <span className="block truncate text-right text-2xs text-muted-foreground max-xl:text-left">OC {ocs.map((l) => l.oc).join(", ")}</span>}
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
  const ocs = h.liberacoes.filter((l) => !l.estornadaEm);
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
            <span className="block text-2xs text-slate-600">{setorLabel(h.setor)} · {posicaoLabel(h.posicao)} · {diariasTexto(h.diarias)}</span>
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
          {ocs.length ? ` · OC ${ocs.map((l) => l.oc).join(", ")}` : ""}
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

function PorEvento({ linhas, render }: { linhas: HonorarioDoFinanceiro[]; render: (doEvento: HonorarioDoFinanceiro[]) => React.ReactNode }) {
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
                <span><span className="block text-2xs text-muted-foreground">Aprovado</span><span className="block text-sm font-semibold tabular-nums text-foreground">{brl(t.aprovado)}</span></span>
                <span><span className="block text-2xs text-muted-foreground">A liberar</span><span className="block text-sm font-semibold tabular-nums text-warning">{brl(t.aLiberar)}</span></span>
              </p>
            </header>
            {render(g)}
          </section>
        );
      })}
    </div>
  );
}

function LinhaLiberada({ h, onHistorico }: { h: HonorarioDoFinanceiro; onHistorico: () => void }) {
  const ativas = h.liberacoes.filter((l) => !l.estornadaEm);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
      <span className="min-w-0 flex-1 basis-[220px]">
        <span className="block truncate text-sm font-semibold text-foreground">{h.nome}</span>
        <span className="block truncate text-2xs text-muted-foreground">{setorLabel(h.setor)} · {posicaoLabel(h.posicao)} · {diariasTexto(h.diarias)}</span>
      </span>
      <span className="min-w-[160px] text-xs text-slate-700">
        {ativas.map((l: Liberacao) => <span key={l.id} className="block tabular-nums">OC/DP {l.oc} · {dataBr(l.data)} · {brlCurto(l.valor)}</span>)}
      </span>
      <span className="w-[120px] text-right text-sm font-semibold tabular-nums text-foreground">{brl(h.liberado)}</span>
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
  const q = useHonorariosDoFinanceiro(null, podeVer);
  const [url, setUrl] = useUrlState({
    aba: campo.opcao<Aba>("liberar"),
    evento: campo.texto(""),
    relatorio: campo.opcao<TipoDeRelatorio>("evento"),
    q: campo.texto(""),
  });
  const aba: Aba = ABAS.some((a) => a.id === url.aba) ? url.aba : "liberar";
  const tipo: TipoDeRelatorio = TIPOS_DE_RELATORIO.includes(url.relatorio) ? url.relatorio : "evento";
  const [liberando, setLiberando] = useState<HonorarioDoFinanceiro | null>(null);
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const [estornando, setEstornando] = useState<{ h: HonorarioDoFinanceiro; l: Liberacao } | null>(null);

  const todas = useMemo(() => q.data ?? [], [q.data]);
  const eventos = useMemo(() => {
    const m = new Map<string, Event>();
    for (const h of todas) if (!m.has(h.eventId)) m.set(h.eventId, { id: h.eventId, name: h.eventName ?? "Evento", startDate: h.eventStartDate ?? "", endDate: h.eventEndDate ?? "" } as unknown as Event);
    return Array.from(m.values());
  }, [todas]);
  const doEvento = useMemo(() => (url.evento ? todas.filter((h) => h.eventId === url.evento) : todas), [todas, url.evento]);
  const t = useMemo(() => somar(doEvento), [doEvento]);
  const aLiberar = doEvento.filter((h) => h.falta > 0 && (h.status === "aprovado" || h.status === "aprovado_ajuste") && casaBusca(h, url.q));
  const liberados = doEvento.filter((h) => h.valorAprovado != null && h.falta === 0 && h.liberado > 0 && casaBusca(h, url.q));
  const nALiberar = doEvento.filter((h) => h.falta > 0 && (h.status === "aprovado" || h.status === "aprovado_ajuste")).length;
  const eventoEscolhido = eventos.find((e) => e.id === url.evento);
  const sufixo = eventoEscolhido ? `-${slugify(eventoEscolhido.name)}` : "";

  const barra = (
    <PageHeader
      variant="bar"
      title="Honorários da cenotécnica"
      className="gap-x-3 max-sm:static"
      subtitle={eventos.length === 0 ? "aprovados pelo aprovador da escala, à espera da verba" : undefined}
      context={eventos.length > 0 ? (
        <>
          <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-border sm:block" />
          <EventSearchSelect variante="barra" value={url.evento} onValueChange={(id) => setUrl({ evento: id })} events={eventos} rotuloVazio="Todos os eventos"
            detalhe={eventoEscolhido ? `${dataBr(eventoEscolhido.startDate)} · ${doEvento.length} linhas` : `${eventos.length} ${eventos.length === 1 ? "evento" : "eventos"} com honorários`} />
        </>
      ) : undefined}
      actions={podeVer && doEvento.length > 0 ? (
        <Button type="button" variant="outline" size="sm" className="val-alvo" onClick={() => exportarLinhas(doEvento, sufixo)} data-testid="hon-exportar-linhas">
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
  } else if (!podeVer) {
    conteudo = <EstadoDaValidacao icone={<Lock aria-hidden="true" />} titulo="Tela do Financeiro" texto="Só o Financeiro (RH) e o administrador veem os honorários a liberar." testId="hon-fin-sem-acesso" />;
  } else if (q.error) {
    conteudo = <EstadoDaValidacao tom="erro" icone={<CloudOff aria-hidden="true" />} titulo="Não foi possível carregar os honorários" texto={apiErrorMessage(q.error, "Verifique sua conexão e tente novamente.")} acao={<BotaoTentarDeNovo onClick={() => q.refetch()} tentando={q.isFetching} />} />;
  } else if (todas.length === 0) {
    conteudo = <EstadoDaValidacao icone={<Wallet aria-hidden="true" />} titulo="Nenhum honorário enviado ainda" texto="Quando a cenotécnica enviar o valor negociado e o aprovador da escala aprovar, o pedido aparece aqui para você registrar a liberação da verba." testId="hon-fin-vazio" />;
  } else {
    const contagem: Record<Aba, number | null> = { liberar: nALiberar, liberados: null, relatorios: null };
    conteudo = (
      <>
        <FaixaDeTotais testId="hon-fin-totais" itens={[
          { rotulo: "Aprovado", valor: brlCurto(t.aprovado), detalhe: `${doEvento.filter((h) => h.valorAprovado != null).length} pedidos`, destaque: "success" },
          { rotulo: "Liberado", valor: brlCurto(t.liberado), detalhe: t.aprovado ? `${Math.round((t.liberado / t.aprovado) * 100)}% do aprovado` : "—" },
          { rotulo: "A liberar", valor: brlCurto(t.aLiberar), detalhe: `${nALiberar} ${nALiberar === 1 ? "pedido" : "pedidos"}`, destaque: t.aLiberar > 0 ? "warning" : undefined },
          { rotulo: "Aguardando aprovação", valor: brlCurto(t.aguardando), detalhe: t.emNegociacao ? `${t.emNegociacao} em negociação` : "com o aprovador da escala" },
        ]} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 sm:border-b sm:border-border">
          <div className="val-rolagem-x -mx-[var(--page-gutter)] border-b border-border px-[var(--page-gutter)] sm:mx-0 sm:self-end sm:border-b-0 sm:px-0">
            <div role="tablist" aria-label="Honorários" className="flex min-w-max items-end gap-1">
              {ABAS.map((a, i) => {
                const on = aba === a.id;
                const Icone = a.icone;
                const n = contagem[a.id];
                return (
                  <button key={a.id} id={`hon-tab-${a.id}`} type="button" role="tab" aria-selected={on} aria-controls={`hon-painel-${a.id}`} tabIndex={on ? 0 : -1}
                    onClick={() => setUrl({ aba: a.id })}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                      e.preventDefault();
                      const prox = ABAS[(i + (e.key === "ArrowRight" ? 1 : ABAS.length - 1)) % ABAS.length];
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
          {aba !== "relatorios" && (
            <div className="w-full sm:ml-auto sm:w-[320px] sm:pb-1.5">
              <BuscaDaLista valor={url.q} onChange={(v) => setUrl({ q: v })} placeholder="Nome, evento ou OC/DP" rotulo="Buscar por nome, evento ou OC/DP" testid="hon-fin-busca" />
            </div>
          )}
        </div>

        <div id={`hon-painel-${aba}`} role="tabpanel" aria-labelledby={`hon-tab-${aba}`} className="val-entra">
          {aba === "liberar" && (aLiberar.length === 0 ? (
            url.q ? <EstadoDaValidacao icone={<SearchX aria-hidden="true" />} titulo="Nada com essa busca" texto="Nenhum pedido a liberar bate com o nome, evento ou OC/DP digitado." />
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
            <EstadoDaValidacao icone={<Inbox aria-hidden="true" />} titulo={url.q ? "Nada com essa busca" : "Nenhuma verba liberada por completo ainda"} texto={url.q ? "Tente outro nome, evento ou OC/DP." : "Os pedidos com a verba inteira liberada ficam aqui, com as OCs/DPs."} />
          ) : (
            <PorEvento linhas={liberados} render={(g) => (
              <ul className={cn(MOLDURA, "divide-y divide-border overflow-hidden")}>{g.map((h) => <LinhaLiberada key={h.id} h={h} onHistorico={() => setHistoricoId(h.id)} />)}</ul>
            )} />
          ))}
          {aba === "relatorios" && <Relatorios linhas={doEvento} tipo={tipo} onTipo={(r) => setUrl({ relatorio: r })} sufixoDoArquivo={sufixo} />}
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
      <HistoricoSheet id={historicoId} aberto={!!historicoId} onOpenChange={(o) => { if (!o) setHistoricoId(null); }} visao="financeiro"
        onEstornar={(h, l) => { const linha = todas.find((x) => x.id === h.id); if (linha) setEstornando({ h: { ...linha, versao: h.versao }, l }); }}
        acoes={(h) => h.podeLiberar ? (
          <Button type="button" className="bg-success text-white hover:bg-success/90" onClick={() => { const linha = todas.find((x) => x.id === h.id); if (linha) { setHistoricoId(null); setLiberando({ ...linha, ...h }); } }}>
            <Banknote className="h-4 w-4" aria-hidden="true" /> Registrar liberação
          </Button>
        ) : null} />
    </PageContainer>
  );
}
