/**
 * Export CSV da ABA corrente do Histórico (BOM + ;) — 25/09, extraído da página.
 * Exporta o que está na tela — inclusive em "Todos os eventos" (a Lista e os
 * Pedidos saem com a coluna Evento; o quadro "Escala" só existe com filtro).
 */
import { useState } from "react";
import { CHANGE_REQUEST_STATUS_LABELS, CHANGE_REQUEST_TYPE_LABELS, type ChangeRequestStatus, type ChangeRequestType } from "@shared/scaling-validation-rules";
import { formatDateBr, formatDayMonthBr, todayIso } from "@/lib/dates";
import { workDaysOf, ymd } from "@/components/scaling-validation/types";
import { legLabel, periodLabel } from "@/components/scaling-validation/suggestions-list";
import { buildReadDateList } from "@/components/scaling-validation/scaling-grid-utils";
import { formatDateTimeBr } from "@/components/scaling-approval/request-badges";
import { TL, downloadCsv, hhmm, lastMoveOf, originLabel, slugify, type Tab } from "./event-view-shared";
import type { EventHistory } from "./use-event-history";
import type { EventTimelineData } from "./use-event-timeline";

type Toast = (t: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

export function useEventExport(h: EventHistory, tl: EventTimelineData, eventId: string, effectiveTab: Tab, toast: Toast) {
  const [exportOpen, setExportOpen] = useState(false);
  const { selectedEvent, filteredRows, boardRows, boardLines, filteredRequests, functionNameById, rowById, eventNameOf } = h;
  const { filteredTimeline } = tl;

  const exportEnabled = (
    effectiveTab === "timeline" ? filteredTimeline.length > 0
      : effectiveTab === "lista" ? filteredRows.length > 0
        : effectiveTab === "escala" ? !!eventId && boardRows.length > 0
          : filteredRequests.length > 0
  );
  const exportFilename = `historico-escala-${slugify(selectedEvent?.name ?? (eventId ? "evento" : "todos-os-eventos"))}-${effectiveTab}-${todayIso()}.csv`;
  const exportCsv = () => {
    setExportOpen(false);
    const filename = exportFilename;
    if (effectiveTab === "timeline") {
      const header = [...(eventId ? [] : ["Evento"]), "Data", "Hora", "Tipo", "Movimento", "Descrição", "Quem", "Vagas", "Comentário"];
      const lines = filteredTimeline.map((e) => [
        ...(eventId ? [] : [e.eventId ? eventNameOf({ eventId: e.eventId }) : ""]),
        formatDateBr(e.at), hhmm(e.at), TL[e.cat].label, e.title, e.text,
        e.author ?? "", (e.chips ?? []).join(", "), e.quote ?? "",
      ]);
      downloadCsv(filename, header, lines);
      return;
    }
    if (effectiveTab === "lista") {
      // Em "Todos os eventos" a planilha precisa dizer de que evento é cada
      // linha — sem isso o arquivo mistura eventos sem aviso.
      const header = [...(eventId ? [] : ["Evento"]), "ID", "Função", "Área", "Origem/Status", "Período", "Dias de trabalho", "Diárias", "Ida", "Volta", "Passagem", "Hotel", "Pedidos", "Observações", "Último movimento", "Movimento em"];
      const lines = filteredRows.map((r) => {
        const days = workDaysOf(r);
        const last = lastMoveOf(r);
        return [
          ...(eventId ? [] : [eventNameOf(r)]),
          `#${r.inclusionNumber}`, functionNameById.get(r.functionId) ?? "", r.area ?? "", originLabel(r), periodLabel(r),
          days.map((d) => formatDayMonthBr(d)).join(", "), String(days.length || r.dailyRates || 0),
          legLabel(r.transportModeIda, r.flightDepartureDate, r.flightArrivalSuggestedTime),
          legLabel(r.transportModeVolta, r.flightReturnDate, r.flightReturnSuggestedTime),
          r.needsTicket ? "Sim" : "Não", r.needsAccommodation ? "Sim" : "Não", String(r.requests.length), r.observations ?? "",
          last.label, last.at ? formatDateTimeBr(last.at) : "",
        ];
      });
      downloadCsv(filename, header, lines);
      return;
    }
    if (effectiveTab === "escala") {
      // Mesma agregação do ScheduleBoard (`aggregateByFunction`): função × dia.
      let min = ymd(selectedEvent?.startDate); let max = ymd(selectedEvent?.endDate);
      for (const r of boardRows) {
        const days = workDaysOf(r);
        if (!days.length) continue;
        if (!min || days[0] < min) min = days[0];
        if (!max || days[days.length - 1] > max) max = days[days.length - 1];
      }
      // Mesmo teto de leitura do quadro: trunca (com aviso) em vez de exportar sem coluna de dia.
      const { dates, totalDays, truncated } = min && max ? buildReadDateList(min, max) : { dates: [] as string[], totalDays: 0, truncated: false };
      if (truncated) {
        toast({
          title: "Período muito longo para o CSV",
          description: `O evento cobre ${totalDays} dias; o arquivo traz os ${dates.length} primeiros.`,
          variant: "destructive",
        });
      }
      const fnLines = boardLines;
      const lines = fnLines.map((l) => [l.name, l.area, String(l.vagas), ...dates.map((d) => String(l.perDay[d] || 0)), String(l.total)]);
      const totalRow = [
        "Total por dia", "", String(fnLines.reduce((a, l) => a + l.vagas, 0)),
        ...dates.map((d) => String(fnLines.reduce((a, l) => a + (l.perDay[d] || 0), 0))),
        String(fnLines.reduce((a, l) => a + l.total, 0)),
      ];
      downloadCsv(filename, ["Função", "Área", "Vagas", ...dates.map((d) => formatDayMonthBr(d)), "Pessoas-dia"], [...lines, totalRow]);
      return;
    }
    // Pedidos: sai o que está na tela (busca, tipo e status aplicados) — igual às outras abas.
    const header = [...(eventId ? [] : ["Evento"]), "Tipo", "Função", "Vaga", "Área", "Solicitante", "Aberto em", "Motivo", "Status", "Revisado por", "Revisado em", "Comentário"];
    const lines = filteredRequests.map((r) => [
      ...(eventId ? [] : [eventNameOf(r)]),
      CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType,
      functionNameById.get(r.functionId) ?? "",
      r.teamInclusionId ? `#${rowById.get(r.teamInclusionId)?.inclusionNumber ?? "?"}` : "vaga nova",
      r.area ?? "", r.requestedByName ?? "", formatDateTimeBr(r.createdAt), r.reason ?? "",
      CHANGE_REQUEST_STATUS_LABELS[r.status as ChangeRequestStatus] ?? r.status,
      r.reviewedByName ?? "", r.reviewedAt ? formatDateTimeBr(r.reviewedAt) : "", r.reviewComment ?? "",
    ]);
    downloadCsv(filename, header, lines);
  };

  return { exportOpen, setExportOpen, exportEnabled, exportFilename, exportCsv };
}

export type EventExport = ReturnType<typeof useEventExport>;
