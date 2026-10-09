/**
 * Fechamento do evento: faixa de pendências + placar de blocos (25/09 —
 * extraídos da página; redesenho 07/10).
 *
 * Eram duas peças soltas que ocupavam ~370px em 1366 — uma caixa âmbar com
 * frase de manual e seis cartões que quebravam em duas fileiras (o custo do
 * evento ficava sozinho na segunda) — e empurravam a grade para baixo da dobra.
 * Viraram UM painel de ~130px: a manchete e os chips numa faixa no alto; os
 * cinco blocos e o custo numa régua de segmentos, como a fila de trabalho de
 * Passagens e Hospedagem. Os dois continuam sendo filtros: o chip filtra por
 * tipo de pendência, o segmento por bloco.
 */
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MirrorTotals } from "@shared/operational-mirror-types";
import {
  BLOCOS_DE_CUSTO, CHIPS_DE_PENDENCIA, ROTULO_DO_BLOCO, blocoPendencia, resumoDoEvento,
  type BlocoDeCusto, type ChipDePendencia,
} from "@shared/mirror-pendencia";
import { cn } from "@/lib/utils";
import { PONTO_ETAPA, brl } from "./mirror-shared";

type Resumo = ReturnType<typeof resumoDoEvento>;

/**
 * Divisórias dos seis segmentos em qualquer grade (2, 3 ou 6 colunas): entre
 * colunas e entre fileiras, nunca na borda do cartão.
 */
function bordas(i: number): string {
  return cn(
    i % 2 === 1 ? "border-l" : "border-l-0", i >= 2 ? "border-t" : "border-t-0",
    i % 3 !== 0 ? "sm:border-l" : "sm:border-l-0", i >= 3 ? "sm:border-t" : "sm:border-t-0",
    i > 0 ? "lg:border-l" : "lg:border-l-0", "lg:border-t-0",
  );
}

/** O que a manchete não diz e quem pergunta quer saber — no "i" ao lado dela. */
const REGRA_DA_PENDENCIA = "Contam passagem, hospedagem e Uber, e só para quem usa cada um — bagagem e locação são eventuais.";

/**
 * ===== FAIXA DE PENDÊNCIAS (02/09) =====
 * A unidade é o BLOCO e a manchete é gente: "N pessoas travam o
 * fechamento". Contar pendências ("30 pendências em 12 pessoas")
 * somava campos de blocos que ninguém usa, e fazia o evento
 * parecer mais atrasado do que está.
 */
export function FaixaDePendencias({ resumo, totalPessoas, chip, setChip }: {
  resumo: Resumo;
  totalPessoas: number;
  chip: ChipDePendencia | null;
  setChip: (c: ChipDePendencia | null) => void;
}) {
  // Evento sem ninguém: "nada pendente" em verde seria uma boa notícia falsa.
  if (totalPessoas === 0) {
    return (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border bg-surface-muted px-4 py-2.5" data-testid="mirror-no-pendencies">
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-semibold text-foreground">Ninguém escalado ainda</span>
        <span className="text-xs text-muted-foreground">O fechamento começa a contar quando a escala do evento tiver pessoas.</span>
      </div>
    );
  }
  if (resumo.pessoasTravando === 0) {
    return (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-success/20 bg-success-soft/70 px-4 py-2.5" data-testid="mirror-no-pendencies">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        <span className="text-sm font-semibold text-success">Nada pendente neste evento</span>
        <span className="text-xs text-success/90">Todo bloco em uso está preenchido e conferido.</span>
      </div>
    );
  }
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-warning/25 bg-warning-soft/70 px-4 py-2.5" aria-label="Pendências do evento" data-testid="mirror-pendencias">
      <p className="flex min-w-0 items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <span className="font-semibold text-warning">
          <span className="tabular-nums">{resumo.pessoasTravando}</span> de <span className="tabular-nums">{totalPessoas}</span>{" "}
          {resumo.pessoasTravando === 1 ? "pessoa trava" : "pessoas travam"} o fechamento
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label="Como a pendência é contada" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-warning/80 transition-colors hover:bg-warning/15 hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[280px]">{REGRA_DA_PENDENCIA}</TooltipContent>
        </Tooltip>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {CHIPS_DE_PENDENCIA.map((c) => {
          const count = resumo.porChip[c.key];
          const active = chip === c.key;
          return (
            <MotivoDesabilitado key={c.key} motivo={count === 0 ? `Ninguém em "${c.label}"` : `${c.label}: ${count} ${count === 1 ? "pessoa" : "pessoas"}. ${active ? "Clique para ver todos." : "Clique para filtrar."}`} desabilitado={count === 0 && !active}>
              <button type="button" onClick={() => setChip(active ? null : c.key)} data-testid={`chip-${c.key}`}
                aria-pressed={active} disabled={count === 0 && !active}
                className={cn(
                  "esp-alvo inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  active
                    ? "border-warning-strong bg-warning-strong text-white shadow-1"
                    : "border-warning/35 bg-card/70 text-warning hover:border-warning-strong/60 hover:bg-card",
                )}>
                {c.label}
                <span className={cn("rounded px-1 text-2xs font-semibold tabular-nums", active ? "bg-white/20" : "bg-warning/10")}>{count}</span>
              </button>
            </MotivoDesabilitado>
          );
        })}
        {chip && (
          <button type="button" onClick={() => setChip(null)}
            className="pas-entra inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-warning transition-colors hover:bg-warning/10">
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpar
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * ===== PLACAR DE BLOCOS (02/09) =====
 * Cada segmento é um filtro: nos blocos que pendenciam, "quem falta
 * aqui"; nos eventuais, "quem lançou". Bagagem e locação não têm
 * barra — não há progresso num bloco que não trava nada, e a
 * barra cheia dizia "100%" de uma corrida que não existe.
 */
export function PlacarDeBlocos({ resumo, totals, blocoFiltro, setBlocoFiltro, derivedHotelCount }: {
  resumo: Resumo;
  totals: MirrorTotals;
  blocoFiltro: BlocoDeCusto | null;
  setBlocoFiltro: (b: BlocoDeCusto | null) => void;
  derivedHotelCount: number;
}) {
  /** Valor e cor de cada bloco no placar. */
  const VALOR_DO_BLOCO: Record<BlocoDeCusto, number> = {
    passagem: totals?.tickets ?? 0, hospedagem: totals?.hotel ?? 0, bagagem: totals?.baggage ?? 0,
    uber: totals?.uber ?? 0, locacao: totals?.carRental ?? 0,
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="mirror-placar">
      {BLOCOS_DE_CUSTO.map((b, idx) => {
        const rb = resumo.porBloco[b];
        const obrigatorio = blocoPendencia(b);
        const ativo = blocoFiltro === b;
        const pct = obrigatorio ? (rb.emUso ? Math.round((rb.prontas / rb.emUso) * 100) : 100) : 100;
        const ponto = PONTO_ETAPA[b === "passagem" ? "ticket" : b === "hospedagem" ? "hotel" : b === "bagagem" ? "baggage" : b === "uber" ? "uber" : "car"];
        const vazio = rb.emUso === 0;
        return (
          <div key={b} className={cn("flex min-w-0 border-border", bordas(idx))}>
          <MotivoDesabilitado className="flex w-full" motivo={ativo
              ? `Mostrando só ${obrigatorio ? "quem falta em" : "quem lançou"} ${ROTULO_DO_BLOCO[b].toLowerCase()}. Clique para ver todos.`
              : vazio
                ? `Ninguém usa ${ROTULO_DO_BLOCO[b].toLowerCase()} neste evento.`
                : obrigatorio
                  ? `${rb.prontas} de ${rb.emUso} pessoas que usam ${ROTULO_DO_BLOCO[b].toLowerCase()} estão prontas. Clique para filtrar.`
                  : `${rb.emUso} ${rb.emUso === 1 ? "pessoa" : "pessoas"} com ${ROTULO_DO_BLOCO[b].toLowerCase()} lançada. Bloco eventual. Clique para filtrar.`} desabilitado={vazio && !ativo}>
            <button
            type="button"
            aria-pressed={ativo}
            onClick={() => setBlocoFiltro(ativo ? null : b)}
            disabled={vazio && !ativo}
            className={cn(
              "esp-segmento group relative flex w-full min-w-0 flex-col px-4 pb-3 pt-2.5 text-left transition-colors disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              ativo ? "bg-brand-soft" : vazio ? "" : "hover:bg-surface-muted",
            )}
            data-testid={`placar-${b}`}
          >
            {/* Filete do filtro ativo: cresce do centro (o mesmo da fila de trabalho). */}
            <span aria-hidden="true" className={cn("absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none", ativo ? "scale-x-100" : "scale-x-0")} />
            <span className={cn("flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.07em]", ativo ? "text-primary" : "text-muted-foreground", vazio && "opacity-60")}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ponto}`} aria-hidden="true" />
              <span className="truncate">{ROTULO_DO_BLOCO[b]}</span>
            </span>
            <span className={cn("mt-1 flex items-baseline gap-1", vazio && "opacity-60")}>
              <span className={cn("esp-segmento-n text-xl font-semibold leading-6 tabular-nums tracking-[-0.02em]", vazio ? "text-muted-foreground" : "text-foreground")}>
                {obrigatorio ? rb.prontas : rb.emUso}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {obrigatorio ? `de ${rb.emUso} prontas` : (rb.emUso === 1 ? "lançamento" : "lançamentos")}
              </span>
            </span>
            {/* Progresso só nos blocos que pendenciam; nos eventuais o espaço fica, para os valores alinharem. */}
            <span className={cn("mt-1.5 block h-1 w-full overflow-hidden rounded-full", obrigatorio && !vazio ? "bg-muted" : "bg-transparent")} aria-hidden="true">
              {obrigatorio && !vazio && <span className={cn("block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none", rb.faltam ? "bg-warning-strong" : "bg-success-strong")} style={{ width: `${pct}%` }} />}
            </span>
            <span className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <span className={cn("text-xs font-medium tabular-nums", VALOR_DO_BLOCO[b] ? "text-foreground" : "text-muted-foreground")}>{brl(VALOR_DO_BLOCO[b])}</span>
              <span className={cn("text-2xs font-medium", rb.faltam ? "text-warning" : "text-success")}>
                {obrigatorio && !vazio ? (rb.faltam ? `${rb.faltam} a completar` : "fechado") : ""}
              </span>
            </span>
            {b === "passagem" && (totals?.ticketsHistorico ?? 0) > 0 && (
              <span className="mt-0.5 block text-2xs leading-4 text-muted-foreground" data-testid="mirror-passagens-historico">
                inclui {brl(totals?.ticketsHistorico ?? 0)} de passagens de trocas
              </span>
            )}
          </button>
          </MotivoDesabilitado>
          </div>
        );
      })}
      <div className={cn("flex flex-col justify-center border-border bg-surface-muted px-4 pb-3 pt-2.5", bordas(5))} data-testid="placar-custo">
        <p className="text-2xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">Custo do evento</p>
        <p className="mt-1 text-xl font-semibold leading-6 tabular-nums tracking-[-0.02em] text-foreground" data-testid="mirror-total-geral">{brl(totals.grand)}</p>
        <p className="mt-1.5 text-2xs leading-4 text-muted-foreground">
          {derivedHotelCount > 0 ? "Hospedagem calculada por diária × noites" : "Soma dos cinco blocos"}
        </p>
      </div>
    </div>
  );
}

/** O painel inteiro: faixa no alto, placar embaixo, num cartão só. */
export function PainelDeFechamento(props: {
  resumo: Resumo;
  totalPessoas: number;
  chip: ChipDePendencia | null;
  setChip: (c: ChipDePendencia | null) => void;
  totals: MirrorTotals;
  blocoFiltro: BlocoDeCusto | null;
  setBlocoFiltro: (b: BlocoDeCusto | null) => void;
  derivedHotelCount: number;
}) {
  return (
    <section aria-label="Fechamento do evento" className="pas-entra overflow-hidden rounded-xl border border-border bg-card shadow-1" data-testid="mirror-fechamento">
      <FaixaDePendencias resumo={props.resumo} totalPessoas={props.totalPessoas} chip={props.chip} setChip={props.setChip} />
      <PlacarDeBlocos resumo={props.resumo} totals={props.totals} blocoFiltro={props.blocoFiltro} setBlocoFiltro={props.setBlocoFiltro} derivedHotelCount={props.derivedHotelCount} />
    </section>
  );
}
