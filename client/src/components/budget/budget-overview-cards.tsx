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
 * médias; embaixo, numa faixa fina, o andamento do envio ao Realizado e em
 * qual etapa do fluxo o evento está. Nenhuma informação saiu: total, data,
 * colaboradores, casa, freela, período (agora na barra, junto do evento),
 * etapa atual com as quatro etapas, Casa/Freela em R$, médio por pessoa e
 * por dia — com os mesmos textos de ajuda.
 */
import { BarChart3, Check, Home, UserCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Event } from "@shared/schema";
import type { EstatisticasDoPlanejado } from "@/hooks/use-budget-engine";
import { formatCurrency, formatEventDate } from "./types";

export interface BudgetOverviewCardsProps {
  selectedEvent: Event | undefined;
  totalGeral: number;
  stats: EstatisticasDoPlanejado;
}

const STEPS = [
  { label: "Escalação", desc: "Inclusões confirmadas" },
  { label: "Planejamento RH", desc: "Valores previstos" },
  { label: "Prestação", desc: "Resp. preenche realizado" },
  { label: "Aprovação RH", desc: "Análise e aprovação" },
];

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function Metrica({ icon: Icon, label, value, sub, tooltip, cor }: {
  icon: LucideIcon; label: string; value: string; sub: string; tooltip: string; cor: string;
}) {
  return (
    <div className="pla-metrica min-w-0 px-4 py-3" title={tooltip}>
      <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <Icon className={cn("w-3.5 h-3.5 shrink-0", cor)} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </p>
      <p className="m-0 mt-1 text-base sm:text-lg font-semibold leading-6 tracking-[-0.01em] tabular-nums text-foreground truncate">{value}</p>
      <p className="m-0 text-2xs sm:text-xs text-muted-foreground truncate">{sub}</p>
    </div>
  );
}

/** As quatro etapas do fluxo numa linha: feitas com ✓, a atual em destaque. */
function TrilhoDeEtapas({ atual }: { atual: number }) {
  return (
    <ol className="m-0 p-0 list-none flex items-center gap-1.5 min-w-0" aria-label={`Etapa atual: ${STEPS[atual].label}`}>
      {STEPS.map((s, i) => {
        const feita = i < atual;
        const ativa = i === atual;
        return (
          <li
            key={s.label}
            title={`${s.label} — ${s.desc}`}
            aria-current={ativa ? "step" : undefined}
            className={cn("flex items-center gap-1.5 min-w-0", !ativa && "max-md:hidden")}
          >
            {i > 0 && <span aria-hidden="true" className={cn("hidden md:block w-5 h-px shrink-0", feita || ativa ? "bg-success-strong/60" : "bg-border")} />}
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex items-center justify-center w-[18px] h-[18px] rounded-full shrink-0 text-2xs font-semibold",
                feita ? "bg-success-strong text-white" : ativa ? "pla-etapa-atual bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {feita ? <Check className="w-2.5 h-2.5" strokeWidth={3.5} /> : i + 1}
            </span>
            <span className={cn("text-xs whitespace-nowrap", ativa ? "font-semibold text-foreground" : feita ? "text-success" : "text-muted-foreground")}>
              {ativa && <span className="md:hidden text-muted-foreground font-normal">Etapa {i + 1} de 4 · </span>}
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function BudgetOverviewCards({ selectedEvent, totalGeral, stats }: BudgetOverviewCardsProps) {
  // Etapa derivada do progresso real: com tudo enviado, o RH concluiu
  // o planejamento e a bola passa para a Prestação.
  const etapaAtual = stats.total > 0 && stats.progressoEnvio >= 100 ? 2 : 1;
  const tudoEnviado = stats.total > 0 && stats.progressoEnvio >= 100;
  const pct = Math.max(0, Math.min(100, stats.progressoEnvio));

  return (
    <section aria-label="Resumo do orçamento planejado" className="pla-resumo rounded-xl border border-border bg-card overflow-hidden" data-testid="resumo-planejado">
      <div className="grid grid-cols-2 md:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]">
        {/* O número da tela. */}
        <div className="col-span-2 md:col-span-1 min-w-0 px-4 pt-3.5 pb-3 max-md:border-b border-border">
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

      {/* Andamento: quanto já foi para o Realizado e em que etapa o evento está. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 border-t border-border bg-surface-muted/60">
        <div className="flex items-center gap-2.5 min-w-0 max-sm:w-full" data-testid="progresso-envio">
          <span className="text-xs font-medium text-slate-600 whitespace-nowrap">Envio ao Realizado</span>
          <span
            role="progressbar"
            aria-label="Colaboradores enviados ao Realizado"
            aria-valuemin={0}
            aria-valuemax={stats.total}
            aria-valuenow={stats.enviados}
            className="relative w-28 sm:w-36 h-1.5 rounded-full bg-border overflow-hidden shrink-0 max-sm:flex-1"
          >
            <span
              className={cn("pla-progresso absolute inset-y-0 left-0 rounded-full", tudoEnviado ? "bg-success-strong" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className={cn("text-xs tabular-nums whitespace-nowrap", tudoEnviado ? "text-success font-semibold" : "text-muted-foreground")}>
            {tudoEnviado
              ? <><Check className="inline w-3.5 h-3.5 -mt-0.5 mr-0.5" aria-hidden="true" />Todos enviados</>
              : `${stats.enviados} de ${stats.total}`}
          </span>
        </div>
        <div className="md:ml-auto min-w-0">
          <TrilhoDeEtapas atual={etapaAtual} />
        </div>
      </div>
    </section>
  );
}

export default BudgetOverviewCards;
