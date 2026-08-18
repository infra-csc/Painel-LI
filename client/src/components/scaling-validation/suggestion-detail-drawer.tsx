import { useQuery } from "@tanstack/react-query";
import { CalendarDays, History, Hotel, MessageSquareWarning, Plane, Undo2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { formatDateBr, formatDayMonthBr } from "@/lib/dates";
import { cn, formatDiarias } from "@/lib/utils";
import type { Event } from "@shared/schema";
import { CHANGE_REQUEST_TYPE_LABELS, type ChangeRequestType } from "@shared/scaling-validation-rules";
import { StatusCell, legLabel, periodLabel } from "./suggestions-list";
import { DECISION_TONE_CLASS, TEAM_INCLUSIONS_QUERY_KEY, describeLastDecision, workDaysOf, type InclusionLog, type SuggestionRow } from "./types";

interface SuggestionDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: SuggestionRow | null;
  functionName?: string;
  event?: Event;
}

const SECTION = "text-[11px] font-bold uppercase tracking-wide text-slate-500";

function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDateBr(d)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  );
}

/** Drawer lateral com o detalhe completo de uma vaga sugerida (leitura). */
export function SuggestionDetailDrawer({ open, onOpenChange, row, functionName, event }: SuggestionDetailDrawerProps) {
  const logsQuery = useQuery<InclusionLog[]>({
    queryKey: [TEAM_INCLUSIONS_QUERY_KEY, row?.id, "logs"],
    queryFn: async () => (await apiRequest("GET", `${TEAM_INCLUSIONS_QUERY_KEY}/${row!.id}/logs`)).json(),
    enabled: open && !!row?.id,
    staleTime: 30_000,
  });

  const days = row ? workDaysOf(row) : [];
  const decision = row ? describeLastDecision(row.lastDecision) : null;
  const pending = row?.pendingRequest ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col overflow-hidden">
        {row ? (
          <>
            <SheetHeader className="px-5 pt-5 pb-3 border-b border-slate-100 text-left space-y-2">
              <SheetTitle className="text-base leading-tight flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-blue-800">#{row.inclusionNumber}</span>
                <span className="truncate">{functionName ?? "Função"}</span>
              </SheetTitle>
              <SheetDescription className="text-xs">
                {event?.name ?? "Evento"}{row.area ? ` · ${row.area}` : ""}
                {row.canEdit ? " · você valida esta função" : " · somente leitura"}
              </SheetDescription>
              <StatusCell row={row} />
            </SheetHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="px-5 py-4 space-y-5">
                {/* Decisão do aprovador (a vaga voltou) */}
                {row.lastDecision && decision && (
                  <section aria-labelledby="det-decisao" className={cn("rounded-xl border px-3 py-2.5 space-y-1", DECISION_TONE_CLASS[decision.tone])}>
                    <p id="det-decisao" className="text-[11px] font-bold uppercase tracking-wide inline-flex items-center gap-1">
                      <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> {decision.title} · pedido de {(CHANGE_REQUEST_TYPE_LABELS[row.lastDecision.requestType] ?? row.lastDecision.requestType).toLowerCase()}
                    </p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{row.lastDecision.comment?.trim() ? row.lastDecision.comment : <span className="italic text-slate-600">Sem comentário do aprovador.</span>}</p>
                    <p className="text-[11px] text-slate-600">{row.lastDecision.byName ?? "Aprovador"} · {fmtDateTime(row.lastDecision.at)}</p>
                  </section>
                )}

                {/* Pedido pendente */}
                {pending && (
                  <section aria-labelledby="det-pedido" className="rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5 space-y-1">
                    <p id="det-pedido" className="text-[11px] font-bold uppercase tracking-wide text-violet-700 inline-flex items-center gap-1">
                      <MessageSquareWarning className="w-3.5 h-3.5" aria-hidden="true" /> Pedido de {(CHANGE_REQUEST_TYPE_LABELS[pending.requestType as ChangeRequestType] ?? pending.requestType).toLowerCase()} aguardando o aprovador
                    </p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{pending.reason}</p>
                    <p className="text-[11px] text-slate-600">por {pending.requestedByName} · {fmtDateTime(pending.createdAt)}</p>
                  </section>
                )}

                {/* Observações */}
                <section aria-labelledby="det-obs" className="space-y-1.5">
                  <h3 id="det-obs" className={SECTION}>Observações da vaga</h3>
                  {row.observations ? (
                    <p className="text-sm text-slate-800 whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">{row.observations}</p>
                  ) : (
                    <p className="text-sm text-slate-500 italic">Sem observações.</p>
                  )}
                </section>

                {/* Período */}
                <section aria-labelledby="det-periodo" className="space-y-1.5">
                  <h3 id="det-periodo" className={cn(SECTION, "inline-flex items-center gap-1")}><CalendarDays className="w-3.5 h-3.5" aria-hidden="true" /> Período e diárias</h3>
                  <dl className="grid grid-cols-2 gap-3">
                    <Field label="Período"><span className="font-mono tabular-nums">{periodLabel(row)}</span></Field>
                    <Field label="Diárias">{formatDiarias(days.length || row.dailyRates || 0)}</Field>
                    <Field label={`Dias de trabalho (${days.length})`} className="col-span-2">
                      {days.length ? (
                        <div className="flex flex-wrap gap-1">
                          {days.map((d) => <span key={d} className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] tabular-nums">{formatDayMonthBr(d)}</span>)}
                        </div>
                      ) : "—"}
                    </Field>
                  </dl>
                </section>

                {/* Logística */}
                <section aria-labelledby="det-log" className="space-y-1.5">
                  <h3 id="det-log" className={SECTION}>Logística</h3>
                  <dl className="grid grid-cols-2 gap-3">
                    <Field label="Ida">{legLabel(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)}</Field>
                    <Field label="Volta">{legLabel(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime)}</Field>
                    <Field label="Passagem">
                      <span className={cn("inline-flex items-center gap-1", row.needsTicket ? "text-violet-700 font-semibold" : "text-slate-500")}>
                        <Plane className="w-3.5 h-3.5" aria-hidden="true" /> {row.needsTicket ? "Precisa" : "Não precisa"}
                      </span>
                    </Field>
                    <Field label="Hospedagem">
                      <span className={cn("inline-flex items-center gap-1", row.needsAccommodation ? "text-sky-700 font-semibold" : "text-slate-500")}>
                        <Hotel className="w-3.5 h-3.5" aria-hidden="true" /> {row.needsAccommodation ? "Precisa" : "Não precisa"}
                      </span>
                    </Field>
                  </dl>
                </section>

                {/* Histórico */}
                <section aria-labelledby="det-hist" className="space-y-1.5">
                  <h3 id="det-hist" className={cn(SECTION, "inline-flex items-center gap-1")}><History className="w-3.5 h-3.5" aria-hidden="true" /> Histórico</h3>
                  {logsQuery.isLoading ? (
                    <div className="space-y-2" role="status" aria-label="Carregando histórico">
                      <Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : logsQuery.isError ? (
                    <p className="text-xs text-slate-500">Não foi possível carregar o histórico.</p>
                  ) : !logsQuery.data?.length ? (
                    <p className="text-sm text-slate-500 italic">Sem registros.</p>
                  ) : (
                    <ol className="relative border-l border-slate-200 ml-1.5 space-y-3">
                      {logsQuery.data.map((log) => (
                        <li key={log.id} className="ml-4">
                          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-white bg-slate-300" aria-hidden="true" />
                          <p className="text-sm text-slate-800">{log.details}</p>
                          {(log.previousValue || log.newValue) && (
                            <p className="text-[11px] text-slate-600 font-mono">
                              {log.previousValue && <span className="line-through text-slate-500">{log.previousValue}</span>}
                              {log.previousValue && log.newValue && <span aria-hidden="true"> → </span>}
                              {log.newValue}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-500">{log.userName} · {fmtDateTime(log.createdAt)}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>
            </div>
          </>
        ) : (
          <div className="p-5"><SheetTitle className="sr-only">Detalhe da vaga</SheetTitle><SheetDescription className="text-sm text-slate-500">Nenhuma vaga selecionada.</SheetDescription></div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default SuggestionDetailDrawer;
