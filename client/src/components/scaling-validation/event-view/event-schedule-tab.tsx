/**
 * Aba "Escala" do Histórico (25/09 — extraída da página): legenda clicável
 * (mesmo filtro de origem da Lista), lista mobile com os totais e o quadro.
 *
 * 07/10 (redesenho premium): a legenda virou a fileira de pílulas das outras
 * abas (ponto da cor, rótulo, contagem) e o aviso "não se aplica ao quadro"
 * ganhou forma de aviso. No celular os totais por função ficam numa lista só,
 * com o total no rodapé — eram cartões soltos, um por função. O quadro em si
 * é o `ScheduleBoard` da Validação, sem mudança.
 */
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScheduleBoard } from "@/components/scaling-validation/schedule-board";
import { ALL, AVISO, MOLDURA, ORIGIN_DOT, ORIGIN_LABELS, PILULA, PILULA_OFF, PILULA_ON, plural } from "./event-view-shared";
import type { EventHistory } from "./use-event-history";

export function EventScheduleTab({ h }: { h: EventHistory }) {
  const { boardLegend, boardFilter, originFilter, setOriginFilter, boardLines, boardRows, functionNameById, selectedEvent } = h;
  const totalVagas = boardLines.reduce((a, l) => a + l.vagas, 0);
  const totalPessoasDia = boardLines.reduce((a, l) => a + l.total, 0);
  return (
    <>
      {/* Legenda por situação — clicável, é o MESMO filtro de origem da Lista/KPIs. */}
      {boardLegend.length > 0 && (
        <div className="val-rolagem-x -mx-[var(--page-gutter)] flex items-center gap-1.5 px-[var(--page-gutter)] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Legenda do quadro por situação (clique para filtrar)">
          <span className="mr-0.5 hidden text-xs text-muted-foreground sm:inline">Legenda</span>
          {boardLegend.map((l) => {
            const active = boardFilter === l.key;
            return (
              <button
                key={l.key}
                type="button"
                aria-pressed={active}
                onClick={() => setOriginFilter(active ? ALL : l.key)}
                title={active ? "Clique para mostrar todas" : `Mostrar só "${l.label}" no quadro`}
                className={cn(PILULA, active ? PILULA_ON : PILULA_OFF)}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", ORIGIN_DOT[l.key])} aria-hidden="true" />
                {l.label}
                <span className={cn("tabular-nums", active ? "text-primary/70" : "text-muted-foreground")}>{l.n}</span>
              </button>
            );
          })}
          {boardFilter !== ALL && (
            <button type="button" className="val-alvo ml-1 inline-flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setOriginFilter(ALL)}>
              Mostrar todas
            </button>
          )}
        </div>
      )}
      {/* KPI "Negadas"/"Excluídas" ativo: a Lista está filtrada, o quadro não tem como estar. */}
      {originFilter !== ALL && boardFilter === ALL && (
        <p className={cn(AVISO, "border-border bg-surface-muted/70 text-slate-600")}>
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>O filtro “{ORIGIN_LABELS[originFilter] ?? originFilter}” não se aplica ao quadro — ele mostra todas as vagas que entram na soma.</span>
        </p>
      )}

      {/* No celular o quadro função × dia não cabe (uma coluna por dia); a
          lista traz os totais de cada função com os MESMOS números. */}
      <div className="md:hidden">
        {boardLines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-card px-6 py-10 text-center text-sm text-muted-foreground">Nenhuma vaga com dias de trabalho para montar o quadro.</p>
        ) : (
          <div className={MOLDURA}>
            <div className="flex items-center gap-3 border-b border-border bg-surface-muted px-3.5 py-2 text-xs text-muted-foreground" aria-hidden="true">
              <span className="flex-1">Função</span>
              <span className="w-12 text-right">Vagas</span>
              <span className="w-[72px] text-right">Pessoas-dia</span>
            </div>
            <ul aria-label="Vagas e pessoas-dia por função" className="divide-y divide-border">
              {boardLines.map((l) => (
                <li key={l.functionId} className="flex min-h-[44px] items-center gap-3 px-3.5 py-2">
                  <span className="min-w-0 flex-1 break-words text-sm font-medium text-foreground">{l.name}</span>
                  <span className="w-12 text-right text-sm tabular-nums text-slate-700"><span className="sr-only">Vagas: </span>{l.vagas}</span>
                  <span className="w-[72px] text-right text-sm font-semibold tabular-nums text-primary"><span className="sr-only">Pessoas-dia: </span>{l.total}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3 rounded-b-xl border-t border-border bg-surface-muted px-3.5 py-2.5 text-xs font-semibold text-foreground">
              <span className="flex-1">Total</span>
              <span className="text-right tabular-nums">{plural(totalVagas, "vaga", "vagas")} · {totalPessoasDia} pessoas-dia</span>
            </div>
          </div>
        )}
      </div>
      <div className="hidden md:block">
        <ScheduleBoard rows={boardRows} functionNameById={functionNameById} rangeStart={selectedEvent?.startDate} rangeEnd={selectedEvent?.endDate} />
      </div>
      <p className="text-2xs text-muted-foreground">Quadro função × dia, todas as áreas — vagas negadas e excluídas não entram na soma.</p>
    </>
  );
}
