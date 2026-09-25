/**
 * Faixa de pendências e placar de blocos do espelho (25/09 — extraídos da página).
 * Os dois são filtros: o chip filtra por tipo de pendência, o cartão por bloco.
 */
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import type { MirrorTotals } from "@shared/operational-mirror-types";
import {
  BLOCOS_DE_CUSTO, CHIPS_DE_PENDENCIA, ROTULO_DO_BLOCO, blocoPendencia, resumoDoEvento,
  type BlocoDeCusto, type ChipDePendencia,
} from "@shared/mirror-pendencia";
import { cn } from "@/lib/utils";
import { PONTO_ETAPA, brl } from "./mirror-shared";

type Resumo = ReturnType<typeof resumoDoEvento>;

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
  if (resumo.pessoasTravando === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-3 bg-info-soft border-info-strong/35" data-testid="mirror-no-pendencies">
        <CheckCircle2 className="h-[17px] w-[17px] shrink-0 text-info" aria-hidden="true" />
        <span className="text-sm font-bold text-info">Nada pendente neste evento</span>
        <span className="text-xs text-info">Todo bloco em uso está preenchido e conferido</span>
      </div>
    );
  }
  return (
    <section className="rounded-xl border px-4 py-3.5 bg-warning-soft border-warning/75" aria-label="Pendências do evento" data-testid="mirror-pendencias">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 mt-px text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-warning">
            {resumo.pessoasTravando} {resumo.pessoasTravando === 1 ? "pessoa trava" : "pessoas travam"} o fechamento deste evento
          </p>
          <p className="text-xs mt-0.5 text-warning">
            De {totalPessoas} {totalPessoas === 1 ? "escalado" : "escalados"}. Contam passagem, hospedagem e Uber, e só para quem usa cada um — bagagem e locação são eventuais.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {CHIPS_DE_PENDENCIA.map((c) => {
          const count = resumo.porChip[c.key];
          const active = chip === c.key;
          return (
            <MotivoDesabilitado key={c.key} motivo={count === 0 ? `Ninguém em "${c.label}"` : `${c.label}: ${count} ${count === 1 ? "pessoa" : "pessoas"}. Clique para filtrar.`} desabilitado={count === 0 && !active}>
              <button type="button" onClick={() => setChip(active ? null : c.key)} data-testid={`chip-${c.key}`}
              aria-pressed={active} disabled={count === 0 && !active}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1", active ? "bg-warning border-warning text-primary-foreground" : "bg-transparent border-warning-strong text-warning")}>
              {c.label}
              <span className="tabular-nums opacity-80">{count}</span>
            </button>
            </MotivoDesabilitado>
          );
        })}
        {chip && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs ml-auto" onClick={() => setChip(null)}>
            <X className="h-3 w-3 mr-1" aria-hidden="true" /> Limpar filtro
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * ===== PLACAR DE BLOCOS (02/09) =====
 * Cada cartão é um filtro: nos blocos que pendenciam, "quem falta
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
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(178px, 1fr))" }} data-testid="mirror-placar">
      {BLOCOS_DE_CUSTO.map((b) => {
        const rb = resumo.porBloco[b];
        const obrigatorio = blocoPendencia(b);
        const ativo = blocoFiltro === b;
        const pct = obrigatorio ? (rb.emUso ? Math.round((rb.prontas / rb.emUso) * 100) : 100) : 100;
        const ponto = PONTO_ETAPA[b === "passagem" ? "ticket" : b === "hospedagem" ? "hotel" : b === "bagagem" ? "baggage" : b === "uber" ? "uber" : "car"];
        return (
          <MotivoDesabilitado key={b} motivo={ativo
              ? `Mostrando só ${obrigatorio ? "quem falta em" : "quem lançou"} ${ROTULO_DO_BLOCO[b].toLowerCase()}. Clique para ver todos.`
              : rb.emUso === 0
                ? `Ninguém usa ${ROTULO_DO_BLOCO[b].toLowerCase()} neste evento.`
                : obrigatorio
                  ? `${rb.prontas} de ${rb.emUso} pessoas que usam ${ROTULO_DO_BLOCO[b].toLowerCase()} estão prontas. Clique para filtrar.`
                  : `${rb.emUso} ${rb.emUso === 1 ? "pessoa" : "pessoas"} com ${ROTULO_DO_BLOCO[b].toLowerCase()} lançada. Bloco eventual. Clique para filtrar.`} desabilitado={rb.emUso === 0 && !ativo}>
            <button
            type="button"
            aria-pressed={ativo}
            onClick={() => setBlocoFiltro(ativo ? null : b)}
            disabled={rb.emUso === 0 && !ativo}
            className={`rounded-xl border bg-card px-4 py-3.5 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ativo ? "border-primary bg-brand-soft" : "border-border hover:bg-muted/30"}`}
            data-testid={`placar-${b}`}
          >
            <span className="flex items-center gap-1.5 text-2xs font-extrabold uppercase tracking-[0.09em] text-muted-foreground">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ponto}`} aria-hidden="true" />
              {ROTULO_DO_BLOCO[b]}
            </span>
            <span className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold tabular-nums leading-none tracking-[-0.03em]">{obrigatorio ? rb.prontas : rb.emUso}</span>
              <span className="text-xs text-muted-foreground">{obrigatorio ? `de ${rb.emUso} que usam` : (rb.emUso === 1 ? "lançamento" : "lançamentos")}</span>
            </span>
            <span className={cn("mt-2 block h-[5px] w-full overflow-hidden rounded-full", (obrigatorio ? "bg-muted" : "bg-transparent"))} aria-hidden="true">
              {obrigatorio && <span className={cn("block h-full rounded-full transition-[width] duration-300", (rb.faltam ? "bg-warning-strong" : "bg-success-strong"))} style={{ width: `${pct}%` }} />}
            </span>
            <span className="mt-1.5 block font-mono text-xs tabular-nums text-slate-700">{brl(VALOR_DO_BLOCO[b])}</span>
            <span className={cn("mt-0.5 block h-4 text-2xs font-bold", (rb.faltam ? "text-warning" : "text-info"))}>
              {obrigatorio ? (rb.faltam ? `${rb.faltam} ${rb.faltam === 1 ? "pessoa" : "pessoas"} a completar` : "bloco fechado") : ""}
            </span>
          </button>
          </MotivoDesabilitado>
        );
      })}
      <div className="rounded-xl px-4 py-3.5 bg-foreground" data-testid="placar-custo">
        <p className="text-2xs font-extrabold uppercase tracking-[0.09em] text-white/55">Custo do evento</p>
        <p className="mt-1 text-2xl font-extrabold tabular-nums leading-none tracking-[-0.03em] text-white" data-testid="mirror-total-geral">{brl(totals.grand)}</p>
        <p className="mt-2 text-2xs text-white/55">
          {derivedHotelCount > 0 ? "Hospedagem calculada por diária × noites" : "Soma dos cinco blocos"}
        </p>
      </div>
    </div>
  );
}
