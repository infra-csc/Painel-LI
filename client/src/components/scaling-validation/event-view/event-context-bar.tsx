/**
 * Barra de contexto do Histórico (25/09 — extraída da página): evento ·
 * última movimentação · funil · KPIs clicáveis · aviso de excluídas.
 */
import { forwardRef } from "react";
import { CalendarDays, Timer } from "lucide-react";
import { SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import EventCombobox from "@/components/ui/event-combobox";
import { cn, formatDateRange } from "@/lib/utils";
import { ALL, DELETED, IN_INCLUSION, LABEL, ORIGIN_DOT, fmtShort, plural, type TlEntry } from "./event-view-shared";
import type { EventHistory } from "./use-event-history";

export interface EventContextBarProps {
  h: EventHistory;
  eventId: string;
  setEventId: (id: string) => void;
  lastMovement: TlEntry | null;
}

export const EventContextBar = forwardRef<HTMLDivElement, EventContextBarProps>(function EventContextBar({ h, eventId, setEventId, lastMovement }, eventPickerRef) {
  const { loadingEvents, activeEvents, selectedEvent, eventsInView, showData, rows, funnel, counts, originFilter, kpiWouldClear, onKpiClick, deletedCount } = h;
  const KPIS: { key: string; label: string; n: number; cls: string; hint?: string }[] = [
    { key: ALL, label: "Vagas", n: counts.total, cls: "text-foreground" },
    { key: SUGESTAO_STATUS.PENDENTE, label: "Pendentes", n: counts.pendentes, cls: "text-warning" },
    // Validar não aprova (regra de 19/08): a vaga validada pela área fica parada
    // aguardando o aprovador — o rótulo mostra o que está travando, não o que já passou.
    {
      key: SUGESTAO_STATUS.VALIDADA,
      label: "Aguardando aprovação",
      n: counts.validadas,
      cls: "text-info",
      hint: "Validadas pela área e aguardando a decisão do aprovador — clique para filtrar a Lista",
    },
    { key: SUGESTAO_STATUS.AJUSTE, label: "Com pedido", n: counts.comPedido, cls: "text-primary" },
    { key: SUGESTAO_STATUS.APROVADA, label: "Aprovadas", n: counts.aprovadas, cls: "text-success" },
    { key: SUGESTAO_STATUS.NEGADA, label: "Negadas", n: counts.negadas, cls: "text-muted-foreground" },
    { key: IN_INCLUSION, label: "Em Inclusão", n: counts.emInclusao, cls: "text-primary" },
  ];
  return (
    <section aria-label="Evento" className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-primary shrink-0" aria-hidden="true">
          <CalendarDays className="w-4 h-4" aria-hidden="true" />
        </span>
        <div ref={eventPickerRef} className="w-[280px] max-w-full shrink-0">
          {loadingEvents ? (
            <div className="h-8 rounded-lg bg-muted animate-pulse motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <EventCombobox
              events={activeEvents} value={eventId || ALL} showAllOption
              onValueChange={(v) => setEventId(v === ALL ? "" : v)}
              placeholder="Todos os eventos" testId="scaling-event-view-event"
              className="h-8 font-semibold"
            />
          )}
        </div>
        {selectedEvent ? (
          <p className={cn(LABEL, "truncate")}>
            <span className="font-mono">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
            {selectedEvent.location ? ` · ${selectedEvent.location}` : ""}
          </p>
        ) : (
          <p className={cn(LABEL, "truncate")}>
            {eventsInView > 0
              ? `${eventsInView} ${eventsInView === 1 ? "evento" : "eventos"} — com vaga em validação, pedido em aberto ou encerrados há pouco.`
              : "Todos os eventos — escolha um para filtrar."}
          </p>
        )}
        {showData && lastMovement && (
          <p className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600">
            <Timer className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            Última movimentação: <strong className="font-semibold text-foreground">{fmtShort(lastMovement.at)} — {lastMovement.title.toLowerCase()}</strong>
          </p>
        )}
      </div>

      {showData && rows.length > 0 && (
        <div className="space-y-2">
          {funnel.length > 0 && (
            <div
              className="flex h-3 items-center gap-1.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`Funil da escala: ${funnel.map((f) => `${f.label} ${f.n}`).join(", ")}`}
            >
              {funnel.map((f) => (
                <span key={f.key} title={`${f.label}: ${f.n}`} className={cn("h-3", ORIGIN_DOT[f.key])} style={{ flexGrow: f.n, flexBasis: 0 }} />
              ))}
            </div>
          )}
          {/* Uma linha só, colunas de mesma largura (30/08): com quebra, o
              último indicador caía sozinho e esticado, parecendo outra coisa.
              Faltando espaço, a faixa rola em vez de quebrar. */}
          <div
            className="grid auto-cols-[minmax(106px,1fr)] grid-flow-col gap-2 overflow-x-auto pb-1"
            role="group"
            aria-label="Resumo das vagas (clique para filtrar a Lista)"
          >
            {KPIS.map((k) => {
              const active = k.key === ALL ? originFilter === ALL : originFilter === k.key;
              const on = active && k.key !== ALL;
              return (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => onKpiClick(k.key)}
                  aria-pressed={k.key === ALL ? undefined : active}
                  title={k.key === ALL ? "Limpar filtro de origem/status" : kpiWouldClear(k.key) ? "Clique para limpar o filtro" : k.hint ?? `Filtrar a Lista por "${k.label}"`}
                  className={cn(
                    "rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "border-primary/30 bg-brand-soft" : "border-border bg-surface-muted/70 hover:border-slate-300 hover:bg-card",
                  )}
                >
                  <span className={cn("flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide leading-tight", on ? "text-primary" : "text-muted-foreground")}>
                    {k.key !== ALL && <span className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", ORIGIN_DOT[k.key])} aria-hidden="true" />}
                    <span className="truncate">{k.label}</span>
                  </span>
                  <span className={cn("mt-0.5 block text-lg font-bold tabular-nums", k.cls)}>{k.n}</span>
                </button>
              );
            })}
          </div>
          {deletedCount > 0 && (
            <p className="text-2xs text-muted-foreground text-right">
              + {plural(deletedCount, "vaga excluída", "vagas excluídas")} — fora da soma e do quadro.{" "}
              <button type="button" className="text-primary underline hover:no-underline" onClick={() => onKpiClick(DELETED)}>
                {kpiWouldClear(DELETED) ? "Limpar filtro" : "Ver excluídas"}
              </button>
            </p>
          )}
        </div>
      )}
    </section>
  );
});
