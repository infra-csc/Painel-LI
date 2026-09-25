/**
 * Resumo · Col 3 — Período de trabalho (25/09 — extraído do dialog): início,
 * término e os dias (específicos ou o intervalo), com fim de semana em âmbar.
 */
import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { eachDayOfInterval, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TeamInclusion } from "@shared/schema";
import { parseDay, formatDateWithWeekday } from "../scaling-utils";
import { lbl, val } from "./details-shared";

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
    <div>
      <div className={lbl + " mb-2"}>
        {allDays.length} {allDays.length === 1 ? "dia" : "dias"} {usesWorkDays ? "de trabalho" : "no período"}
        {usesWorkDays && <span className="normal-case tracking-normal font-medium text-muted-foreground"> · dias específicos</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {allDays.map((day, index) => {
          const weekend = isWeekend(day);
          return (
            <div key={index} className={`flex flex-col items-center rounded-xl border text-center px-2 py-1.5 min-w-[40px] ${weekend ? "bg-warning-soft border-warning/25" : "bg-card border-border"}`}>
              <div className={`text-2xs uppercase font-bold ${weekend ? "text-warning-strong" : "text-muted-foreground"}`}>{format(day, "EEE", { locale: ptBR })}</div>
              <div className={`text-base font-bold leading-tight ${weekend ? "text-warning" : "text-slate-700"}`}>{format(day, "dd", { locale: ptBR })}</div>
              <div className={`text-2xs ${weekend ? "text-warning-soft" : "text-muted-foreground"}`}>{format(day, "MMM", { locale: ptBR })}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ResumoPeriodoCard({ inclusion }: { inclusion: TeamInclusion }) {
  return (
    <div>
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-primary/5 border-b border-border px-4 py-2.5 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" aria-hidden="true" />
          <span className="text-2xs font-black text-primary uppercase tracking-[0.12em]">Período de Trabalho</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <div className={lbl}>Início</div>
              <div className={val}>{formatDateWithWeekday(inclusion.scheduleStartDate)}</div>
            </div>
            <div>
              <div className={lbl}>Término</div>
              <div className={val}>{formatDateWithWeekday(inclusion.scheduleEndDate)}</div>
            </div>
          </div>
          <WorkDays incl={inclusion} />
        </div>
      </div>
    </div>
  );
}
