/**
 * Aba PREVISÃO POR ESCALAÇÃO (dono, 09/10: "aviso em qual escalação
 * provavelmente vai aumentar ou vai abaixar").
 *
 * Só escalações que PRECISAM de passagem e ainda NÃO têm. Cada linha diz a
 * tendência provável, POR QUÊ (os sinais, em texto de gente), com quanta
 * amostra e — sempre — que é estimativa. As mais urgentes primeiro (tende a
 * subir + faltam poucos dias). A fila de cima conta e filtra; o atalho
 * "Buscar preços" leva a escalação já selecionada para a aba Buscar (a busca
 * em si continua sendo um clique com o custo escrito — nada gasta sozinho).
 */
import { useState } from "react";
import { ArrowRight, CircleHelp, Minus, PlaneTakeoff, Search, TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toTitleCase } from "@/lib/format";
import { FilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import { faltam, type PrevisaoDaVaga } from "@shared/previsao-da-busca";
import type { TendenciaDoPreco } from "@shared/regras-da-busca";
import { moeda, plural } from "@/components/tickets/analises/formato";
import { diaCurto } from "../formato";
import { usePrevisao } from "./use-analises-da-busca";
import { ErroDaAnalise, EsqueletoDaAnalise, EstadoDaAnalise, Fonte, TopoDaAnalise } from "./moldura";

type Filtro = TendenciaDoPreco;

export const VISUAL_DA_TENDENCIA: Record<TendenciaDoPreco, { icone: LucideIcon; pilula: string; rotulo: string }> = {
  subir: { icone: TrendingUp, pilula: "bg-danger-soft text-danger", rotulo: "Tende a subir" },
  baixar: { icone: TrendingDown, pilula: "bg-success-soft text-success", rotulo: "Tende a baixar" },
  estavel: { icone: Minus, pilula: "bg-muted text-slate-700", rotulo: "Sem pressa clara" },
  sem_dado: { icone: CircleHelp, pilula: "bg-muted text-muted-foreground", rotulo: "Sem dado" },
};
const COR_DO_TITULO: Record<TendenciaDoPreco, string> = { subir: "text-danger", baixar: "text-success", estavel: "text-foreground", sem_dado: "text-slate-600" };
const CONFIANCA = { boa: "confiança boa", media: "confiança média", baixa: "confiança baixa" } as const;

function LinhaDaPrevisao({ l, onBuscar, indice }: { l: PrevisaoDaVaga; onBuscar: (vagaId: string) => void; indice: number }) {
  const v = VISUAL_DA_TENDENCIA[l.tendencia];
  const Icone = v.icone;
  const urgente = l.tendencia === "subir" && (l.diasParaVoo ?? 99) <= 14;
  return (
    <li className={cn("bpa-prev pas-entra", urgente && "bpa-prev-urgente")} style={{ animationDelay: `${Math.min(indice, 10) * 25}ms` }} data-testid={`previsao-${l.vagaId}`} data-tendencia={l.tendencia}>
      <div data-area="quem" className="min-w-0">
        <p className="m-0 flex min-w-0 items-start gap-2">
          <span className="inline-flex h-[22px] shrink-0 items-center rounded-md bg-brand-soft px-[7px] font-mono text-2xs font-medium tabular-nums text-primary">#{l.numero ?? "—"}</span>
          <span className="min-w-0 text-sm font-medium leading-5 text-foreground">{toTitleCase(l.colaborador)}</span>
        </p>
        <p className="m-0 mt-0.5 truncate text-2xs leading-4 text-muted-foreground">{l.funcao} · {l.eventName}</p>
      </div>
      <div data-area="voo" className="min-w-0 text-xs leading-5">
        {l.rota ? (
          <>
            <p className="m-0 flex items-center gap-1 font-mono font-semibold tabular-nums text-foreground">{l.rota.origem}<ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />{l.rota.destino}<span className="ml-1 font-sans text-2xs font-normal text-muted-foreground">{l.rota.perna === "ida_e_volta" ? "ida e volta" : l.rota.perna === "ida" ? "só ida" : "só volta"}</span></p>
            <p className="m-0 text-muted-foreground"><PlaneTakeoff className="mr-1 inline h-3 w-3 -translate-y-px" aria-hidden="true" />{diaCurto(l.rota.dataIda)}</p><p className="m-0"><span className={cn("font-medium tabular-nums", (l.diasParaVoo ?? 99) <= 7 ? "text-danger" : (l.diasParaVoo ?? 99) <= 14 ? "text-warning" : "text-slate-700")}>{faltam(l.diasParaVoo ?? 0)}</span></p>
          </>
        ) : <p className="m-0 text-warning">Rota ainda desconhecida</p>}
      </div>
      <div data-area="tendencia" className="min-w-0">
        <p className={cn("m-0 flex items-start gap-1.5 text-sm font-semibold leading-5", COR_DO_TITULO[l.tendencia])}>
          <span className={cn("mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded", v.pilula)} aria-hidden="true"><Icone className="h-3 w-3" /></span>
          <span>{l.titulo}<span className="sr-only"> ({v.rotulo})</span></span>
        </p>
        {l.sinais.length > 0 ? (
          <ul className="m-0 mt-1 list-none space-y-0.5 p-0 text-xs leading-5 text-slate-600">
            {l.sinais.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5"><span aria-hidden="true" className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", s.lado === "subir" ? "bg-danger-strong" : "bg-success-strong")} /><span>{s.texto.charAt(0).toUpperCase() + s.texto.slice(1)}</span></li>
            ))}
          </ul>
        ) : <p className="m-0 mt-1 text-xs text-muted-foreground">{l.amostraTexto}</p>}
        <p className="m-0 mt-1 text-2xs text-muted-foreground">
          Estimativa{l.confianca ? ` · ${CONFIANCA[l.confianca]}` : ""}{l.sinais.length > 0 ? ` · ${l.amostraTexto}` : ""}
        </p>
      </div>
      <div data-area="preco" className="text-right text-xs leading-5">
        {l.precoAtual ? (
          <>
            <p className="m-0 whitespace-nowrap text-sm font-semibold tabular-nums text-foreground" title={`Última consulta em ${diaCurto(l.precoAtual.dia)}`}>{moeda(l.precoAtual.preco)}</p>
            <p className="m-0 text-2xs leading-4 text-muted-foreground">atual{l.precoTipico ? <span className="block whitespace-nowrap">típico {moeda(l.precoTipico)}</span> : null}</p>
          </>
        ) : l.precoTipico ? (
          <>
            <p className="m-0 text-sm font-semibold tabular-nums text-slate-700">{moeda(l.precoTipico)}</p>
            <p className="m-0 text-2xs text-muted-foreground">típico · sem consulta recente</p>
          </>
        ) : <p className="m-0 text-2xs text-muted-foreground">sem preço</p>}
      </div>
      <div data-area="acao" className="flex justify-end">
        <Button variant={urgente ? "default" : "outline"} size="sm" className="pas-alvo h-8 rounded-lg" onClick={() => onBuscar(l.vagaId)} disabled={!l.rota} data-testid={`previsao-buscar-${l.vagaId}`}>
          <Search className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Buscar preços
        </Button>
      </div>
    </li>
  );
}

export function AbaPrevisao({ onBuscarVagas, onIrParaBuscar }: { onBuscarVagas: (ids: string[]) => void; onIrParaBuscar: () => void }) {
  const q = usePrevisao();
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const r = q.data;
  const topo = (
    <TopoDaAnalise
      pergunta={<>Para cada escalação que precisa de passagem e ainda não tem: o preço deve subir ou baixar até a compra? <strong className="font-semibold text-slate-700">É estimativa pelo histórico — nunca certeza.</strong></>}
      extra={<Fonte tipo="estimado" />}
      atualizando={q.isFetching && !!r}
    />
  );
  if (q.isError && !r) return <div className="flex flex-col gap-4">{topo}<ErroDaAnalise erro={q.error} onTentar={() => q.refetch()} /></div>;
  if (!r) return <div className="flex flex-col gap-4">{topo}<EsqueletoDaAnalise numeros={4} paineis={1} linhas={7} /></div>;
  if (r.resumo.total === 0) {
    return (
      <div className="flex flex-col gap-4">
        {topo}
        <EstadoDaAnalise testid="previsao-vazia" icone={<PlaneTakeoff className="h-5 w-5" />} titulo="Nenhuma escalação esperando passagem"
          texto="Quando uma escalação confirmada precisar de voo e ainda não tiver passagem, a previsão dela aparece aqui." />
      </div>
    );
  }
  const linhas = filtro ? r.linhas.filter((l) => l.tendencia === filtro) : r.linhas;
  const urgentes = r.linhas.filter((l) => l.tendencia === "subir" && (l.diasParaVoo ?? 99) <= 14);
  return (
    <div className="flex flex-col gap-4" data-testid="aba-previsao">
      {topo}
      <FilaDeTrabalho<Filtro>
        rotulo="Tendência das escalações pendentes"
        ativa={filtro}
        onEscolher={setFiltro}
        testid={(k) => `previsao-fila-${k}`}
        blocos={[
          { key: "subir", rotulo: "Tende a subir", n: r.resumo.subir, sub: r.resumo.subirEmBreve ? `${r.resumo.subirEmBreve} com voo em até 14 dias` : "compre primeiro", icone: TrendingUp, cor: "text-danger" },
          { key: "baixar", rotulo: "Tende a baixar", n: r.resumo.baixar, sub: "pode esperar e acompanhar", icone: TrendingDown, cor: "text-success" },
          { key: "estavel", rotulo: "Sem pressa clara", n: r.resumo.estavel, sub: "sinais que se anulam", icone: Minus, cor: "text-slate-600" },
          { key: "sem_dado", rotulo: "Sem dado", n: r.resumo.semDado, sub: "rota nova ou sem histórico", icone: CircleHelp, cor: "text-muted-foreground" },
        ]}
      />
      {urgentes.length > 0 && !filtro && (
        <div className="pas-entra flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-danger/25 bg-danger-soft/50 px-4 py-3" role="status" data-testid="previsao-compre-primeiro">
          <TrendingUp className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="m-0 min-w-0 flex-1 basis-[260px] text-sm text-foreground">
            <span className="font-semibold">{plural(urgentes.length, "escalação tende", "escalações tendem")} a subir com voo em até 14 dias — compre primeiro.</span>{" "}
            <span className="text-slate-600">Estimativa pelo histórico das rotas.</span>
          </p>
          <Button size="sm" className="h-8 rounded-lg" onClick={() => onBuscarVagas(urgentes.map((l) => l.vagaId).slice(0, 80))} data-testid="previsao-buscar-urgentes">
            <Search className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Selecionar na Buscar
          </Button>
        </div>
      )}
      <div className="overflow-clip rounded-xl border border-border bg-card">
        <div className="bpa-prev bpa-prev-cabeca" aria-hidden="true">
          <span>Escalação</span><span>Voo</span><span>Tendência e por quê</span><span className="text-right">Preço</span><span />
        </div>
        {linhas.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="m-0 text-sm text-muted-foreground">Nenhuma escalação nesta tendência.</p>
            <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => setFiltro(null)}>Ver todas</Button>
          </div>
        ) : (
          <ul className="m-0 list-none p-0" aria-label="Previsão por escalação">
            {linhas.map((l, i) => <LinhaDaPrevisao key={l.vagaId} l={l} indice={i} onBuscar={(id) => onBuscarVagas([id])} />)}
          </ul>
        )}
      </div>
      <p className="m-0 text-2xs leading-4 text-muted-foreground">
        Como lemos: (1) dias até o voo × a curva de antecedência da rota (ou a geral, quando a rota tem menos de 8 consultas); (2) a última consulta da mesma rota e data contra o típico; (3) a evolução das consultas da mesma rota e data. Base: {plural(r.consultas, "consulta", "consultas")} dos últimos 12 meses.{" "}
        <button type="button" onClick={onIrParaBuscar} className="font-medium text-primary hover:underline">Buscar preços agora</button> deixa a estimativa mais firme.
      </p>
    </div>
  );
}
