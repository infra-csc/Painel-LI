/**
 * Aba "Escala" do Histórico (25/09 — extraída da página): legenda clicável
 * (mesmo filtro de origem da Lista), lista mobile com os totais e o quadro.
 */
import { cn } from "@/lib/utils";
import { ScheduleBoard } from "@/components/scaling-validation/schedule-board";
import { ALL, ORIGIN_DOT, ORIGIN_LABELS, SECTION, plural } from "./event-view-shared";
import type { EventHistory } from "./use-event-history";

export function EventScheduleTab({ h }: { h: EventHistory }) {
  const { boardLegend, boardFilter, originFilter, setOriginFilter, boardLines, boardRows, functionNameById, selectedEvent } = h;
  return (
    <>
      {/* Legenda por origem/status — clicável, é o MESMO filtro de origem da Lista/KPIs. */}
      {boardLegend.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Legenda do quadro por origem/status (clique para filtrar)">
          <span className={cn(SECTION, "mr-1")}>Legenda</span>
          {boardLegend.map((l) => {
            const active = boardFilter === l.key;
            return (
              <button
                key={l.key}
                type="button"
                aria-pressed={active}
                onClick={() => setOriginFilter(active ? ALL : l.key)}
                title={active ? "Clique para mostrar todas" : `Mostrar só "${l.label}" no quadro`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-primary/30 bg-brand-soft text-primary" : "border-border bg-card text-slate-600 hover:border-slate-300",
                )}
              >
                <span className={cn("inline-block w-2 h-2 rounded-full", ORIGIN_DOT[l.key])} aria-hidden="true" />
                {l.label} <span className="tabular-nums text-muted-foreground">({l.n})</span>
              </button>
            );
          })}
          {boardFilter !== ALL && (
            <button type="button" className="ml-1 text-2xs text-primary hover:underline" onClick={() => setOriginFilter(ALL)}>Mostrar todas</button>
          )}
          {/* KPI "Negadas"/"Excluídas" ativo: a Lista está filtrada, o quadro não tem como estar. */}
          {originFilter !== ALL && boardFilter === ALL && (
            <span className="ml-1 text-2xs text-muted-foreground">O filtro "{ORIGIN_LABELS[originFilter] ?? originFilter}" não se aplica ao quadro.</span>
          )}
        </div>
      )}
      {/* No celular o quadro função × dia não cabe (uma coluna por dia); a
          lista traz os totais de cada função com os MESMOS números. */}
      <ul className="md:hidden space-y-2" aria-label="Vagas e pessoas-dia por função">
        {boardLines.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">Nenhuma vaga com dias de trabalho para montar o quadro.</li>
        ) : boardLines.map((l) => (
          <li key={l.functionId} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{l.name}</p>
            </div>
            <dl className="flex shrink-0 gap-3 text-right">
              <div><dt className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Vagas</dt><dd className="text-sm font-bold tabular-nums text-foreground">{l.vagas}</dd></div>
              <div><dt className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Pessoas-dia</dt><dd className="text-sm font-bold tabular-nums text-primary">{l.total}</dd></div>
            </dl>
          </li>
        ))}
        {boardLines.length > 0 && (
          <li className="flex items-center justify-between gap-3 px-3 text-xs font-semibold text-slate-700">
            <span>Total</span>
            <span className="tabular-nums">{plural(boardLines.reduce((a, l) => a + l.vagas, 0), "vaga", "vagas")} · {boardLines.reduce((a, l) => a + l.total, 0)} pessoas-dia</span>
          </li>
        )}
      </ul>
      <div className="hidden md:block">
        <ScheduleBoard rows={boardRows} functionNameById={functionNameById} rangeStart={selectedEvent?.startDate} rangeEnd={selectedEvent?.endDate} />
      </div>
      <p className="text-2xs text-muted-foreground">Quadro função × dia — vagas negadas e excluídas não entram na soma.</p>
    </>
  );
}
