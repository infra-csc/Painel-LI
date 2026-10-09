/**
 * Agenda do período no celular (07/10, redesenho): em vez de espremer sete
 * colunas em 390px (no Mês as barras viravam "Trac…" e "+ 4 …"), os dias um
 * embaixo do outro, cada um com os chips completos — nome, local e quando.
 *
 * Semana: os sete dias; dia livre vira uma linha curta. Mês: só os dias em
 * que algum evento entra no mês (cada evento aparece uma vez, no seu primeiro
 * dia dentro do mês, com o período inteiro) e o "Hoje" como marco.
 */
import type { Event } from "@shared/schema";
import { cn } from "@/lib/utils";
import { ChipDoEvento, WEEKDAY_SHORT, isSameDay, type SelectEventFn } from "./calendar-shared";

export interface LinhaDaAgenda {
  dia: Date;
  eventos: Event[];
  /** Texto da linha sem chips (ex.: o marco "Hoje" do Mês). */
  nota?: string;
}

export function Agenda({ linhas, onSelectEvent, porDia, testid }: {
  linhas: LinhaDaAgenda[];
  onSelectEvent: SelectEventFn;
  /** Semana: o chip diz "Dia 2 de 4" em vez do período. */
  porDia?: boolean;
  testid?: string;
}) {
  const hoje = new Date();
  return (
    <ol className="m-0 p-0 list-none divide-y divide-border" data-testid={testid}>
      {linhas.map(({ dia, eventos, nota }) => {
        const eHoje = isSameDay(dia, hoje);
        const fds = dia.getDay() === 0 || dia.getDay() === 6;
        const fundo = eHoje ? "bg-brand-soft/60" : fds ? "cal-fds" : "";
        const rotulo = `${WEEKDAY_SHORT[dia.getDay()]} ${dia.getDate()}`;
        // Dia livre: uma linha curta — a semana não vira uma rolagem de "Sem eventos".
        if (eventos.length === 0) return (
          <li key={dia.toISOString()} className={cn("flex items-center gap-3 px-4 py-2", fundo)} aria-current={eHoje ? "date" : undefined}>
            <span className={cn("w-11 shrink-0 text-center text-xs tabular-nums", eHoje ? "font-semibold text-primary" : "text-muted-foreground")}>{rotulo}</span>
            <span className="text-xs text-muted-foreground">{nota ?? (eHoje ? "Hoje · nenhum evento" : "Nenhum evento")}</span>
          </li>
        );
        return (
          <li key={dia.toISOString()} className={cn("flex gap-3 px-4 py-3", fundo)} aria-current={eHoje ? "date" : undefined}>
            <div className="w-11 shrink-0 text-center leading-none">
              <span className={cn("block text-2xs font-semibold uppercase tracking-[0.06em]", eHoje ? "text-primary" : "text-muted-foreground")}>
                {WEEKDAY_SHORT[dia.getDay()]}
              </span>
              <span className={cn(
                "mt-1 mx-auto flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold tabular-nums",
                eHoje ? "bg-primary text-primary-foreground" : "text-foreground",
              )}>
                {dia.getDate()}
              </span>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5 justify-center">
              {eventos.map(ev => <ChipDoEvento key={ev.id} ev={ev} onSelect={onSelectEvent} dia={porDia ? dia : undefined} />)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
