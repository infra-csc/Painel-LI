/**
 * Resumo do Planejado (topo da tela) — 25/09 (modularização); redesenho 08/10.
 *
 * Antes eram três blocos empilhados: uma faixa azul cheia com o total, o
 * stepper de quatro etapas num cartão próprio e quatro KPIs em cartões com
 * filete colorido — ~520px de altura antes do primeiro colaborador, e o
 * mesmo número (Casa, Freela) repetido em dois lugares.
 *
 * Agora é UM painel, lido da esquerda para a direita como um extrato:
 * o total planejado (o número da tela), a divisão Casa × Freela e as duas
 * médias; embaixo, numa faixa fina, o andamento dos dois passos da tela e,
 * por último, a trilha do honorário do evento.
 *
 * 26/10 (Módulo de Honorários, Fase 0): a tela virou "Pré-aprovação de
 * valores" — a faixa mostra a pré-aprovação do DP e o envio ao Realizado, e
 * o trilho de quatro etapas deu lugar à trilha ÚNICA do slide 8
 * (components/honorarios/trilha-do-honorario), contada no servidor.
 */
import { BarChart3, Check, Home, UserCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Event } from "@shared/schema";
import type { EstatisticasDoPlanejado } from "@/hooks/use-budget-engine";
import { TrilhaDoEvento } from "@/components/honorarios/trilha-do-honorario";
import { useTrilhaDoEvento } from "@/components/honorarios/use-honorarios";
import { formatCurrency, formatEventDate } from "./types";

export interface BudgetOverviewCardsProps {
  selectedEvent: Event | undefined;
  totalGeral: number;
  stats: EstatisticasDoPlanejado;
  /** Vagas que a tela lista (as confirmadas) — a trilha conta toda escalação com colaborador. */
  vagasNaTela?: number;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function Metrica({ icon: Icon, label, value, sub, tooltip, cor, corValor = "text-foreground" }: {
  icon: LucideIcon; label: string; value: string; sub: string; tooltip: string; cor: string;
  /** Cor do número (o Realizado pinta a diferença; o padrão é a do texto). */
  corValor?: string;
}) {
  return (
    <div className="pla-metrica min-w-0 px-4 py-3" title={tooltip}>
      <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <Icon className={cn("w-3.5 h-3.5 shrink-0", cor)} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </p>
      <p className={cn("m-0 mt-1 text-base sm:text-lg font-semibold leading-6 tracking-[-0.01em] tabular-nums truncate", corValor)}>{value}</p>
      <p className="m-0 text-2xs sm:text-xs text-muted-foreground truncate">{sub}</p>
    </div>
  );
}

/** Barra de andamento da faixa do resumo (pré-aprovação e envio). */
function Andamento({ rotulo, dica, feito, total, cor, testid, completo }: {
  rotulo: string; dica: string; feito: number; total: number; cor: string; testid: string; completo: string;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (feito / total) * 100)) : 0;
  const tudo = total > 0 && feito >= total;
  return (
    <div className="flex items-center gap-2.5 min-w-0 max-sm:w-full" data-testid={testid}>
      <span className="text-xs font-medium text-slate-600 whitespace-nowrap">{rotulo}</span>
      <span
        role="progressbar"
        aria-label={dica}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={feito}
        className="relative w-24 sm:w-32 h-1.5 rounded-full bg-border overflow-hidden shrink-0 max-sm:flex-1"
      >
        <span className={cn("pla-progresso absolute inset-y-0 left-0 rounded-full", tudo ? "bg-success-strong" : cor)} style={{ width: `${pct}%` }} />
      </span>
      <span className={cn("text-xs tabular-nums whitespace-nowrap", tudo ? "text-success font-semibold" : "text-muted-foreground")}>
        {tudo ? <><Check className="inline w-3.5 h-3.5 -mt-0.5 mr-0.5" aria-hidden="true" />{completo}</> : `${feito} de ${total}`}
      </span>
    </div>
  );
}

export function BudgetOverviewCards({ selectedEvent, totalGeral, stats, vagasNaTela }: BudgetOverviewCardsProps) {
  const trilha = useTrilhaDoEvento(selectedEvent?.id);
  // Quem já passou pela pré-aprovação: os pré-aprovados de agora e os já enviados.
  const preFeita = stats.preAprovados + stats.enviados;

  return (
    <section aria-label="Resumo da pré-aprovação de valores" className="pla-resumo pla-resumo-medido rounded-xl border border-border bg-card overflow-hidden" data-testid="resumo-planejado">
      {/* A grade segue a largura DO PAINEL (container query no index.css,
          pla-resumo-grade): pela janela, entre 768 e 1023px — e em 1024 com o
          menu aberto — os valores saíam com reticências (08/10). */}
      <div className="pla-resumo-grade">
        {/* O número da tela. */}
        <div className="pla-resumo-total min-w-0 px-4 pt-3.5 pb-3">
          <p className="m-0 text-xs font-medium text-slate-600">
            Total planejado
            {selectedEvent?.startDate && (
              <span className="text-muted-foreground font-normal"> · {formatEventDate(selectedEvent.startDate)}</span>
            )}
          </p>
          <p className="m-0 mt-0.5 text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] tabular-nums text-primary" data-testid="total-planejado">
            {formatCurrency(totalGeral)}
          </p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground tabular-nums">
            {plural(stats.total, "colaborador", "colaboradores")} · {stats.totalCasa} casa · {stats.totalFreela} freela
          </p>
        </div>
        <Metrica icon={Home} label="Casa" value={formatCurrency(stats.valorCasa)} sub={plural(stats.totalCasa, "colaborador", "colaboradores")} cor="text-primary" tooltip="Colaboradores que trabalham no próprio estado" />
        <Metrica icon={UserCheck} label="Freela" value={formatCurrency(stats.valorFreela)} sub={plural(stats.totalFreela, "colaborador", "colaboradores")} cor="text-warning" tooltip="Colaboradores contratados por evento" />
        <Metrica icon={Users} label="Médio por pessoa" value={formatCurrency(stats.media)} sub="por colaborador" cor="text-muted-foreground" tooltip="Média de custo por colaborador neste evento" />
        <Metrica icon={BarChart3} label="Médio por dia" value={formatCurrency(stats.mediaPorDia)} sub="por dia trabalhado" cor="text-info" tooltip="Média de custo por dia trabalhado neste evento" />
      </div>

      {/* Os dois passos desta tela: pré-aprovar (DP) e liberar ao Realizado. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 border-t border-border bg-surface-muted/60">
        {/* Evento legado (27/10): fluxo antigo — a pré-aprovação não é exigida. */}
        {stats.legado > 0 ? (
          <p className="m-0 text-xs text-muted-foreground" data-testid="resumo-fluxo-antigo">
            <span className="font-medium text-slate-700">Fluxo antigo</span> · evento legado: vai ao Realizado sem a pré-aprovação do DP
          </p>
        ) : (
          <Andamento
            rotulo="Pré-aprovação do DP" dica="Colaboradores com a pré-aprovação do DP (inclui os já enviados)"
            feito={preFeita} total={stats.total} cor="bg-success-strong" testid="progresso-pre-aprovacao" completo="Todos pré-aprovados"
          />
        )}
        <Andamento
          rotulo="Envio ao Realizado" dica="Colaboradores enviados ao Realizado"
          feito={stats.enviados} total={stats.total} cor="bg-primary" testid="progresso-envio" completo="Todos enviados"
        />
      </div>
      <TrilhaDoEvento
        {...trilha}
        foco={["previsto", "pre_aprovado"]}
        className="border-t border-border"
        nota={vagasNaTela !== undefined && trilha.contagem && trilha.contagem.total > vagasNaTela
          ? `A trilha conta toda escalação com colaborador: ${trilha.contagem.total - vagasNaTela} ainda não ${trilha.contagem.total - vagasNaTela === 1 ? "está confirmada" : "estão confirmadas"} e só ${trilha.contagem.total - vagasNaTela === 1 ? "entra" : "entram"} aqui depois da confirmação.`
          : undefined}
      />
    </section>
  );
}

export default BudgetOverviewCards;
