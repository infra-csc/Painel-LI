/**
 * Aba ORÇAMENTO (extras 7 e 11 do dono, 09/10): quanto ainda falta gastar com
 * passagem em cada evento (as pendentes × o último preço consultado, o típico
 * da rota ou a média paga — cada número diz de onde veio) ao lado do que já
 * foi gasto; e os CUSTOS OCULTOS que não aparecem no preço da passagem: a
 * diária de hotel a mais de quem volta depois das 18h e quanto o pinga-pinga
 * (trecho direto entre eventos) economizou.
 */
import { Hotel, Route, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrcamentoDoEvento } from "@shared/previsao-da-busca";
import { Painel, Numero } from "@/components/tickets/analises/partes";
import { dataCurta, moeda, plural } from "@/components/tickets/analises/formato";
import type { PeriodoDaAnalise } from "../filtros-da-busca";
import { useOrcamento } from "./use-analises-da-busca";
import { ErroDaAnalise, EsqueletoDaAnalise, EstadoDaAnalise, Fonte, ROTULO_DO_PERIODO, TopoDaAnalise } from "./moldura";

function Fontes({ e }: { e: OrcamentoDoEvento }) {
  const partes = [
    e.fontes.ultima_consulta && `${e.fontes.ultima_consulta} pela última consulta`,
    e.fontes.tipico_da_rota && `${e.fontes.tipico_da_rota} pelo típico da rota`,
    e.fontes.media_paga && `${e.fontes.media_paga} pela média paga`,
  ].filter(Boolean) as string[];
  return (
    <p className="m-0 text-2xs leading-4 text-muted-foreground">
      {partes.length ? `Estimativa: ${partes.join(" · ")}` : e.pendentes ? "Sem base para estimar" : "Nada pendente"}
      {e.semEstimativa > 0 && <span className="font-medium text-warning"> · {plural(e.semEstimativa, "escalação sem estimativa", "escalações sem estimativa")}</span>}
    </p>
  );
}

function LinhaDoEvento({ e, maior }: { e: OrcamentoDoEvento; maior: number }) {
  const pGasto = maior > 0 ? (e.gasto / maior) * 100 : 0;
  const pFalta = maior > 0 ? (e.estimado / maior) * 100 : 0;
  return (
    <li className="bpa-orc" data-testid={`orcamento-${e.eventId}`}>
      <div data-area="evento" className="min-w-0">
        <p className="m-0 truncate text-sm font-medium text-foreground">{e.nome}</p>
        <p className="m-0 text-2xs text-muted-foreground">{e.inicio ? `começa ${dataCurta(e.inicio)}` : "sem data"} · {plural(e.passagens, "passagem", "passagens")} · {plural(e.pendentes, "pendente", "pendentes")}</p>
      </div>
      <div data-area="barra" className="min-w-0">
        <span className="bpa-orc-trilho" aria-hidden="true">
          <span className="bpa-orc-gasto" style={{ width: `${pGasto}%` }} />
          <span className="bpa-orc-falta" style={{ width: `${pFalta}%` }} />
        </span>
        <Fontes e={e} />
      </div>
      <dl data-area="numeros" className="m-0 grid grid-cols-3 gap-x-3 text-right">
        <div><dt className="text-2xs text-muted-foreground">Gasto</dt><dd className="m-0 text-[13px] font-semibold tabular-nums text-foreground">{moeda(e.gasto)}</dd></div>
        <div><dt className="text-2xs text-muted-foreground">Falta (est.)</dt><dd className={cn("m-0 text-[13px] font-semibold tabular-nums", e.estimado ? "text-warning" : "text-muted-foreground")}>{e.estimado ? moeda(e.estimado) : "—"}</dd></div>
        <div><dt className="text-2xs text-muted-foreground">Total</dt><dd className="m-0 text-[13px] font-semibold tabular-nums text-foreground">{moeda(e.total)}</dd></div>
      </dl>
    </li>
  );
}

export function AbaOrcamento({ periodo, onPeriodo, onVerPrevisao }: { periodo: PeriodoDaAnalise; onPeriodo: (p: PeriodoDaAnalise) => void; onVerPrevisao: () => void }) {
  const q = useOrcamento(periodo);
  const r = q.data;
  const atualizando = q.isFetching && !!r;
  const topo = <TopoDaAnalise pergunta="Quanto ainda falta gastar com passagem em cada evento, ao lado do já gasto — e os custos que não aparecem no preço." periodo={periodo} onPeriodo={onPeriodo} atualizando={atualizando} />;
  if (q.isError && !r) return <div className="flex flex-col gap-4">{topo}<ErroDaAnalise erro={q.error} onTentar={() => q.refetch()} /></div>;
  if (!r) return <div className="flex flex-col gap-4">{topo}<EsqueletoDaAnalise paineis={2} /></div>;
  const o = r.orcamento;
  const c = r.custosOcultos;
  const maior = Math.max(1, ...o.eventos.map((e) => e.total));
  return (
    <div className={cn("flex flex-col gap-4 transition-opacity duration-200", atualizando && "opacity-60")} data-testid="aba-orcamento">
      {topo}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        <Numero testid="kpi-gasto" rotulo="Já gasto" valor={moeda(o.totais.gasto)} sub="eventos com algo a comprar ou futuros" />
        <Numero testid="kpi-falta" rotulo="Falta gastar (estimado)" valor={moeda(o.totais.estimado)} sub={plural(o.totais.pendentes, "escalação pendente", "escalações pendentes")} tom={o.totais.estimado > 0 ? "alerta" : undefined} />
        <Numero testid="kpi-total" rotulo="Total previsto" valor={moeda(o.totais.gasto + o.totais.estimado)} sub="gasto + estimativa" />
        <Numero testid="kpi-sem-estimativa" rotulo="Sem estimativa" valor={o.totais.semEstimativa.toLocaleString("pt-BR")} sub={o.totais.semEstimativa ? "rota desconhecida ou sem histórico" : "toda pendente tem estimativa"} />
      </div>

      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
        <Painel
          testid="orcamento-por-evento"
          titulo="Orçamento de passagens por evento"
          pergunta="Já gasto (cheio) e o que falta comprar (claro), em ordem de data"
          acao={<Fonte tipo="estimado" className="mt-0.5" />}
          corpoRente
          rodape={<>Falta = cada escalação pendente × a última consulta da mesma rota e data (até 14 dias), senão o típico da rota, senão a média paga{o.mediaPaga.idaEVolta ? ` (ida e volta ${moeda(o.mediaPaga.idaEVolta)})` : ""}. Nunca chutado: sem base, a escalação fica “sem estimativa”.</>}
        >
          {o.eventos.length === 0 ? (
            <EstadoDaAnalise testid="orcamento-vazio" icone={<Wallet className="h-5 w-5" />} titulo="Nada a orçar" texto="Nenhum evento futuro com passagem comprada ou pendente." />
          ) : (
            <>
              <p className="m-0 flex flex-wrap items-center gap-x-3.5 gap-y-1 px-4 pb-2 text-2xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-primary" />já gasto</span>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-warning-strong/55" />falta comprar (estimado)</span>
              </p>
              <ul className="m-0 list-none p-0">{o.eventos.map((e) => <LinhaDoEvento key={e.eventId} e={e} maior={maior} />)}</ul>
              {o.totais.pendentes > 0 && (
                <div className="px-4 pt-3"><Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={onVerPrevisao}>Ver a previsão das pendentes</Button></div>
              )}
            </>
          )}
        </Painel>

        <div className="flex min-w-0 flex-col gap-4">
          <Painel
            testid="custo-volta-noturna"
            titulo="Volta depois das 18h"
            pergunta={`Diária de hotel a mais de quem volta à noite — ${ROTULO_DO_PERIODO[periodo]}`}
            acao={<Fonte tipo="pago" className="mt-0.5" />}
            resposta={c.voltasNoturnas.passagens > 0 ? (
              <p className="m-0"><strong className="font-semibold text-foreground">{plural(c.voltasNoturnas.passagens, "passagem volta", "passagens voltam")}</strong> a partir das 18h: cerca de <strong className="font-semibold tabular-nums text-warning">{moeda(c.voltasNoturnas.custo)}</strong> em diárias a mais.</p>
            ) : <p className="m-0 text-muted-foreground">Nenhuma volta a partir das 18h no período.</p>}
            rodape={<>Regra do Espelho: volta a partir das 18h = +1 diária. Valor = diária média de hotel do evento{c.voltasNoturnas.semDiaria ? ` (${plural(c.voltasNoturnas.semDiaria, "passagem usou", "passagens usaram")} a média geral)` : ""}.</>}
          >
            {c.voltasNoturnas.porEvento.length > 0 && (
              <ul className="m-0 list-none space-y-1.5 p-0">
                {c.voltasNoturnas.porEvento.slice(0, 6).map((e) => (
                  <li key={e.eventId} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate text-slate-700"><Hotel className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px text-muted-foreground" aria-hidden="true" />{e.nome}</span>
                    <span className="shrink-0 tabular-nums text-slate-600">{e.passagens} · <strong className="font-semibold text-foreground">{moeda(e.custo)}</strong></span>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
          <Painel
            testid="custo-pinga-pinga"
            titulo="Pinga-pinga"
            pergunta="Quanto o trecho direto entre eventos economizou contra voltar para casa e sair de novo"
            acao={<Fonte tipo="estimado" className="mt-0.5" />}
            rodape={c.pingaPinga.pernaTipica ? <>Separado = 2 × a passagem de uma perna típica paga ({moeda(c.pingaPinga.pernaTipica)}, de {plural(c.pingaPinga.amostra, "passagem", "passagens")}).</> : <>Falta ter ao menos 3 passagens de uma perna pagas para estimar.</>}
          >
            {c.pingaPinga.trechos === 0 ? (
              <p className="m-0 flex items-start gap-2 text-[13px] leading-5 text-muted-foreground" data-testid="pinga-vazio"><Route className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Nenhum trecho direto pago no período. Quando Compras encadear dois eventos (“sai direto de…”), a economia aparece aqui.</p>
            ) : (
              <dl className="m-0 grid grid-cols-3 gap-3">
                <div><dt className="text-2xs text-muted-foreground">Trechos diretos</dt><dd className="m-0 text-lg font-semibold tabular-nums text-foreground">{c.pingaPinga.trechos}</dd></div>
                <div><dt className="text-2xs text-muted-foreground">Pago</dt><dd className="m-0 text-lg font-semibold tabular-nums text-foreground">{moeda(c.pingaPinga.pagoNosTrechos)}</dd></div>
                <div><dt className="text-2xs text-muted-foreground">Economia (est.)</dt><dd className={cn("m-0 text-lg font-semibold tabular-nums", (c.pingaPinga.economia ?? 0) > 0 ? "text-success" : "text-muted-foreground")}>{c.pingaPinga.economia === null ? "—" : moeda(c.pingaPinga.economia)}</dd></div>
              </dl>
            )}
          </Painel>
        </div>
      </div>
    </div>
  );
}
