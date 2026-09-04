import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import { buildReadDateList, formatDateHeader } from "./scaling-grid-utils";
import { workDaysOf, type SuggestionRow } from "./types";

interface ScheduleBoardProps {
  rows: SuggestionRow[];
  functionNameById: Map<string, string>;
  /** Período do evento — colunas mínimas do quadro. */
  rangeStart?: string;
  rangeEnd?: string;
}

interface BoardLine {
  functionId: string;
  functionName: string;
  area: string;
  editable: boolean;
  total: number;
  perDay: Record<string, number>;
  vagas: number;
}

/**
 * Quadro função × dia (somente leitura): soma de vagas por dia, agregando os
 * workDays de TODAS as áreas. Linhas fora do escopo do usuário ficam em cinza.
 * Vagas negadas não entram na soma.
 */
export function ScheduleBoard({ rows, functionNameById, rangeStart, rangeEnd }: ScheduleBoardProps) {
  const { dates, lines, totals, totalDays, truncated } = useMemo(() => {
    const active = rows.filter((r) => r.status !== SUGESTAO_STATUS.NEGADA);
    let min = rangeStart ?? "";
    let max = rangeEnd ?? "";
    for (const r of active) {
      const days = workDaysOf(r);
      if (days.length === 0) continue;
      if (!min || days[0] < min) min = days[0];
      if (!max || days[days.length - 1] > max) max = days[days.length - 1];
    }
    // Leitura: período longo demais TRUNCA (com aviso) em vez de sumir com as colunas.
    const { dates, totalDays, truncated } = min && max ? buildReadDateList(min, max) : { dates: [] as string[], totalDays: 0, truncated: false };
    const byFn = new Map<string, BoardLine>();
    for (const r of active) {
      let line = byFn.get(r.functionId);
      if (!line) {
        line = { functionId: r.functionId, functionName: functionNameById.get(r.functionId) ?? "Sem função", area: r.area ?? "", editable: r.canEdit, total: 0, perDay: {}, vagas: 0 };
        byFn.set(r.functionId, line);
      }
      line.vagas += 1;
      line.editable = line.editable || r.canEdit;
      for (const d of workDaysOf(r)) {
        line.perDay[d] = (line.perDay[d] || 0) + 1;
        line.total += 1;
      }
    }
    const lines = Array.from(byFn.values()).sort((a, b) => a.functionName.localeCompare(b.functionName, "pt-BR", { sensitivity: "base" }));
    const totals: Record<string, number> = {};
    for (const d of dates) totals[d] = lines.reduce((acc, l) => acc + (l.perDay[d] || 0), 0);
    return { dates, lines, totals, totalDays, truncated };
  }, [rows, functionNameById, rangeStart, rangeEnd]);

  if (lines.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-400" role="status">Nenhuma vaga com dias de trabalho para montar o quadro.</p>;
  }

  // Cabeçalho no padrão das tabelas do módulo (11px, bold, caixa alta, tracking-wide).
  const TH = "px-2 py-2 text-center border-r border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {truncated && (
        <p role="status" className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Período muito longo para exibir o quadro — {totalDays} dias. Mostrando os {dates.length} primeiros (a partir de {formatDateHeader(dates[0]).date}); os demais dias ficaram de fora das colunas.
        </p>
      )}
      {/* Focável: o quadro rola para o lado (uma coluna por dia) e sem tabIndex
          quem navega pelo teclado não tinha como chegar nas colunas escondidas. */}
      <div
        className="overflow-x-auto max-h-[600px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        tabIndex={0}
        role="region"
        aria-label="Quadro de vagas por função e dia (rolagem horizontal)"
      >
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Quadro de vagas por função e dia (todas as áreas)</caption>
          <thead className="bg-slate-50 sticky top-0 z-20">
            <tr>
              <th className={cn(TH, "text-left px-3 sticky left-0 bg-slate-50 z-30 w-[200px] min-w-[200px] border-r-slate-200")}>Função</th>
              <th className={TH}>Vagas</th>
              {dates.map((d) => {
                const { date, dayName, isWeekend } = formatDateHeader(d);
                return (
                  <th key={d} className={cn(TH, "w-14", isWeekend ? "bg-orange-50 text-orange-700" : "bg-blue-50/50")}>
                    <div className="leading-none font-bold">{date}</div>
                    <div className="text-[10px] mt-0.5 opacity-70 normal-case tracking-normal">{dayName}</div>
                  </th>
                );
              })}
              <th className={cn(TH, "border-r-0 border-l border-l-slate-200")}>Pessoas-dia</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={line.functionId} className={cn("border-b border-slate-100", i % 2 === 1 ? "bg-slate-50/40" : "bg-white", !line.editable && "text-slate-600")}>
                <td className={cn("px-3 py-1.5 font-semibold sticky left-0 z-10 border-r border-slate-200 w-[200px] min-w-[200px]", i % 2 === 1 ? "bg-slate-50" : "bg-white", line.editable ? "text-slate-800" : "text-slate-600")}>
                  <span className="block truncate" title={line.functionName}>{line.functionName}</span>
                  {!line.editable && <span className="block text-[10px] font-normal text-slate-500">somente leitura</span>}
                </td>
                <td className="px-2 py-1.5 text-center text-xs font-semibold tabular-nums border-r border-slate-100">{line.vagas}</td>
                {dates.map((d) => {
                  const n = line.perDay[d] || 0;
                  const { isWeekend } = formatDateHeader(d);
                  return (
                    <td key={d} className="px-1 py-1.5 text-center border-r border-slate-100">
                      {n > 0 ? (
                        <span className={cn("inline-flex items-center justify-center h-7 w-10 rounded-lg text-xs font-semibold tabular-nums", line.editable ? "bg-brand-soft text-primary" : "bg-slate-100 text-slate-600")}>{n}</span>
                      ) : (
                        <span className="text-slate-200">–</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-center text-xs font-semibold tabular-nums border-l border-l-slate-200">{line.total}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 border-t border-slate-200 sticky bottom-0">
            <tr>
              <td className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">Total por dia</td>
              <td className="px-2 py-2 text-center text-xs font-bold tabular-nums border-r border-slate-100">{lines.reduce((a, l) => a + l.vagas, 0)}</td>
              {dates.map((d) => (
                <td key={d} className="px-1 py-2 text-center text-xs font-bold tabular-nums text-slate-700 border-r border-slate-100">{totals[d] || <span className="text-slate-300 font-normal">–</span>}</td>
              ))}
              <td className="px-2 py-2 text-center text-xs font-bold tabular-nums border-l border-l-slate-200">{lines.reduce((a, l) => a + l.total, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default ScheduleBoard;
