/**
 * Resumo · Período de trabalho (25/09 — extraído do dialog): início, término e
 * os dias (específicos ou o intervalo), com fim de semana em âmbar.
 *
 * 07/10: deixou de ser um cartão próprio (com faixa azul e título em caixa
 * alta) e virou a linha "Período" do painel da vaga. As datas ficam numa
 * linha só (início → término) e os dias em pastilhas menores — mesmo dado,
 * metade da altura. O mês do fim de semana estava em `text-warning-soft`
 * (a cor de FUNDO) e sumia; agora é legível.
 */
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { eachDayOfInterval, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TeamInclusion } from "@shared/schema";
import { parseDay, formatDateWithWeekday } from "../scaling-utils";

function WorkDays({ incl }: { incl: TeamInclusion }): ReactNode {
  // Dias de trabalho: prioriza `workDays` (dias específicos); cai no intervalo início→fim se vazio.
  const explicitDays = ((incl.workDays || []) as (string | null)[])
    .map(d => parseDay(d))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  let allDays: Date[] = explicitDays;
  const usesWorkDays = explicitDays.length > 0;
  if (!usesWorkDays) {
    if (!incl.scheduleStartDate || !incl.scheduleEndDate) return null;
    const startDate = parseDay(incl.scheduleStartDate);
    const endDate = parseDay(incl.scheduleEndDate);
    // eachDayOfInterval lança RangeError com data inválida ou fim < início
    if (!startDate || !endDate || startDate > endDate) return null;
    allDays = eachDayOfInterval({ start: startDate, end: endDate });
  }
  if (allDays.length === 0) return null;
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
  return (
    <div className="mt-2">
      <p className="mb-1.5 text-2xs text-muted-foreground">
        {allDays.length} {allDays.length === 1 ? "dia" : "dias"} {usesWorkDays ? "de trabalho" : "no período"}
        {usesWorkDays && <span> · dias específicos</span>}
      </p>
      <ul className="flex flex-wrap gap-1" aria-label="Dias de trabalho">
        {allDays.map((day, index) => {
          const weekend = isWeekend(day);
          return (
            <li
              key={index}
              title={format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              className={`flex w-[42px] flex-col items-center rounded-md border py-1 text-center leading-none ${weekend ? "bg-warning-soft border-warning/30" : "bg-card border-border"}`}
            >
              <span className={`text-2xs leading-3 font-semibold uppercase ${weekend ? "text-warning" : "text-muted-foreground"}`}>{format(day, "EEE", { locale: ptBR }).slice(0, 3)}</span>
              <span className={`mt-0.5 text-sm font-semibold tabular-nums ${weekend ? "text-warning" : "text-foreground"}`}>{format(day, "dd", { locale: ptBR })}</span>
              <span className={`mt-0.5 text-2xs leading-3 ${weekend ? "text-warning/80" : "text-muted-foreground"}`}>{format(day, "MMM", { locale: ptBR })}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Início → término (com o dia da semana) e as pastilhas dos dias. */
export function PeriodoDaVaga({ inclusion }: { inclusion: TeamInclusion }) {
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-medium tabular-nums">
        <span><span className="sr-only">Início: </span>{formatDateWithWeekday(inclusion.scheduleStartDate)}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span><span className="sr-only">Término: </span>{formatDateWithWeekday(inclusion.scheduleEndDate)}</span>
      </p>
      <WorkDays incl={inclusion} />
    </div>
  );
}
