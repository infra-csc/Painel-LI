import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FolderInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EventCombobox from "@/components/ui/event-combobox";
import { LoadingState } from "@/components/common/loading-state";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, cn, formatDateRange } from "@/lib/utils";
import { formatDayMonthBr } from "@/lib/dates";
import type { Event, Function as FunctionType } from "@shared/schema";
import { TRANSPORT_MODE_LABELS } from "@shared/scaling-validation-rules";
import { SUGGESTIONS_QUERY_KEY, type ApiError, type SuggestionRow } from "./types";
import {
  pasteConflicts, rowsFromSuggestions,
  type CopyFromEventResult, type SuggestionGridRow,
} from "./scaling-grid-utils";

export interface CopyEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Eventos ativos (o de destino sai da lista de origem). */
  events: Event[];
  currentEventId: string;
  /** Aberto sem evento: escolher o destino aqui é o mesmo que escolher na barra. */
  onSelectDestination: (id: string) => void;
  functions: FunctionType[];
  /** Dias do período atual da grade (o que não couber é listado no diálogo). */
  dates: string[];
  existingRows: SuggestionGridRow[];
  onApply: (result: CopyFromEventResult, sourceName: string) => void;
}

const HINT = "text-xs text-slate-500";

/** Resumo curto da logística de uma linha — é o que explica a mesma função aparecer duas vezes. */
function logisticsLabel(r: SuggestionGridRow): string {
  const leg = (mode: string, date: string, time: string) =>
    [mode ? TRANSPORT_MODE_LABELS[mode as keyof typeof TRANSPORT_MODE_LABELS] : "", date ? formatDayMonthBr(date) : "", time].filter(Boolean).join(" ");
  const parts: string[] = [];
  const ida = leg(r.transportModeIda, r.flightDepartureDate, r.flightArrivalSuggestedTime);
  if (ida) parts.push(`Ida ${ida}`);
  const volta = leg(r.transportModeVolta, r.flightReturnDate, r.flightReturnSuggestedTime);
  if (volta) parts.push(`Volta ${volta}`);
  if (r.needsAccommodation) parts.push("Hotel");
  if (r.needsTicket) parts.push("Passagem");
  if (r.observations.trim()) parts.push(r.observations.trim());
  return parts.join(" · ");
}

/**
 * "Copiar de evento": monta a grade a partir das vagas que OUTRO evento já tem
 * na Validação (GET existente /api/scaling-suggestions?eventId=), reagregadas
 * por função e reencaixadas no período do evento atual. Nada de API nova.
 */
export function CopyEventDialog({
  open, onOpenChange, events, currentEventId, onSelectDestination, functions, dates, existingRows, onApply,
}: CopyEventDialogProps) {
  const [sourceId, setSourceId] = useState("");
  const sourceEvents = useMemo(() => events.filter((e) => e.id !== currentEventId), [events, currentEventId]);
  const sourceEvent = useMemo(() => sourceEvents.find((e) => e.id === sourceId), [sourceEvents, sourceId]);

  const query = useQuery<SuggestionRow[]>({
    queryKey: [SUGGESTIONS_QUERY_KEY, sourceId],
    queryFn: async () => (await apiRequest("GET", `${SUGGESTIONS_QUERY_KEY}?eventId=${encodeURIComponent(sourceId)}`)).json(),
    enabled: open && !!sourceId,
  });

  const converted = useMemo(
    () => (query.data ? rowsFromSuggestions(query.data, functions, dates) : null),
    [query.data, functions, dates],
  );
  const replaced = useMemo(
    () => (converted ? pasteConflicts(existingRows, converted.rows) : []),
    [converted, existingRows],
  );

  // Escolher como DESTINO o evento que estava como origem deixaria `sourceEvent`
  // indefinido com o botão vivo (clique sem efeito): a origem é limpa na hora.
  useEffect(() => {
    if (currentEventId && sourceId === currentEventId) setSourceId("");
  }, [currentEventId, sourceId]);

  const close = (o: boolean) => {
    if (!o) { setSourceId(""); onOpenChange(false); }
  };
  const applyDisabled = !currentEventId || !sourceEvent || !converted || converted.rows.length === 0;
  const applyHint = !currentEventId
    ? "Escolha primeiro o evento de destino"
    : !sourceEvent
      ? "Escolha um evento de origem diferente do destino"
      : undefined;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-[560px] max-h-[90vh] p-0 gap-0 grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader className="px-5 pt-5 pb-3 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="w-4 h-4 text-primary" aria-hidden="true" /> Copiar de outro evento
          </DialogTitle>
          <DialogDescription>
            As vagas que o evento escolhido tem na Validação viram linhas da grade, reencaixadas no período atual. Nada é enviado — você revisa e envia quando quiser.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-5 pb-4 space-y-3">
          {!currentEventId && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-600">1. Primeiro, o evento de destino (o que você vai montar):</p>
              <EventCombobox events={events} value={currentEventId} showAllOption={false}
                onValueChange={(v) => onSelectDestination(v === "all" ? "" : v)}
                placeholder="Selecione o evento de destino" testId="copy-event-destination" />
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-600">{currentEventId ? "Copiar as vagas de:" : "2. Copiar as vagas de:"}</p>
            <EventCombobox events={sourceEvents} value={sourceId} showAllOption={false}
              onValueChange={(v) => setSourceId(v === "all" ? "" : v)}
              placeholder="Selecione o evento de origem" testId="copy-event-source" />
            {sourceEvent && (
              <p className={HINT}>
                Período de origem: <span className="font-mono">{formatDateRange(sourceEvent.startDate, sourceEvent.endDate, { withYear: true })}</span>
              </p>
            )}
          </div>

          {sourceId && query.isLoading && <LoadingState count={3} label="Buscando as vagas do evento…" />}

          {sourceId && query.isError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0 text-red-600" aria-hidden="true" />
              <span>
                <span className="font-semibold">Não foi possível carregar as vagas do evento.</span>{" "}
                {apiErrorMessage(query.error as ApiError, "Verifique sua conexão e tente novamente.")}
              </span>
            </div>
          )}

          {converted && (
            converted.totalVagas === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Este evento não tem vagas na Validação — não há o que copiar.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600 tabular-nums">
                    {converted.totalVagas} {converted.totalVagas === 1 ? "vaga lida" : "vagas lidas"}
                  </span>
                  <span className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-primary tabular-nums">
                    {converted.rows.length} {converted.rows.length === 1 ? "linha na grade" : "linhas na grade"}
                  </span>
                  {replaced.length > 0 && (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800 tabular-nums">
                      {replaced.length} {replaced.length === 1 ? "função já na grade será substituída" : "funções já na grade serão substituídas"}
                    </span>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <p className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Como vai entrar na grade
                  </p>
                  <ul className="max-h-[180px] overflow-y-auto divide-y divide-slate-100">
                    {converted.rows.map((r) => {
                      const days = dates.filter((d) => (r.quantities[d] || 0) > 0);
                      const logistica = logisticsLabel(r);
                      return (
                        <li key={r.rowId} className="px-3 py-1.5 text-xs">
                          <div className="flex items-baseline gap-2">
                            <span className="w-[150px] shrink-0 truncate font-semibold text-slate-800" title={r.functionName}>{r.functionName}</span>
                            <span className="min-w-0 truncate font-mono tabular-nums text-slate-600">
                              {days.length > 0
                                ? days.map((d) => `${formatDayMonthBr(d)}×${r.quantities[d]}`).join(" · ")
                                : "sem quantidades no período atual"}
                            </span>
                          </div>
                          {logistica && (
                            <p className="mt-0.5 pl-[158px] truncate text-[11px] text-slate-500" title={logistica}>{logistica}</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {converted.rows.length > new Set(converted.rows.map((r) => r.functionId)).size && (
                  <p className={HINT}>
                    A mesma função aparece em mais de uma linha quando as vagas têm logísticas diferentes (ida/volta, hotel, passagem ou observação) — assim cada turma mantém a sua.
                  </p>
                )}

                {(converted.outsideDays.length > 0 || converted.unknownFunctions > 0 || converted.clampedCells > 0 || converted.manualDailyRates > 0) && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0 text-amber-600" aria-hidden="true" />
                    <span>
                      {converted.outsideDays.length > 0 && (
                        <span className="block">
                          <span className="font-semibold">Não cabe no período atual:</span>{" "}
                          {converted.outsideDays.map((d) => formatDayMonthBr(d)).join(", ")} — essas quantidades ficam de fora (ajuste o período da grade antes, se precisar delas).
                        </span>
                      )}
                      {converted.unknownFunctions > 0 && (
                        <span className="block">{converted.unknownFunctions} vaga(s) de função que não está mais no catálogo ficam de fora.</span>
                      )}
                      {converted.clampedCells > 0 && (
                        <span className="block">{converted.clampedCells} célula(s) passariam do teto de 15 pessoas/dia e foram limitadas.</span>
                      )}
                      {converted.manualDailyRates > 0 && (
                        <span className="block">
                          {converted.manualDailyRates} vaga(s) com diárias ajustadas à mão — as diárias serão recalculadas pelos dias da grade.
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 gap-2">
          <Button type="button" variant="outline" className="rounded-lg" onClick={() => close(false)}>Cancelar</Button>
          <Button
            type="button" disabled={applyDisabled}
            className={cn("rounded-lg bg-primary hover:bg-primary-hover")}
            title={applyHint}
            onClick={() => {
              if (!converted || !sourceEvent) return;
              onApply(converted, sourceEvent.name);
              close(false);
            }}
          >
            {converted && converted.rows.length > 0
              ? `Copiar ${converted.rows.length} ${converted.rows.length === 1 ? "linha" : "linhas"}`
              : "Copiar para a grade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CopyEventDialog;
