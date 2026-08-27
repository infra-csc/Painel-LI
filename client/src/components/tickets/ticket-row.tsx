// Uma linha da tabela de Passagens.
import { memo } from "react";
import { Eye, Plane, ArrowLeftRight, Lock, Stamp } from "lucide-react";
import type { TeamInclusion, Ticket } from "@shared/schema";
import { extractTravelSuggestion, formatSuggestionDate, hasSuggestionValue } from "@/lib/ticket-form";
import { formatDate, formatBrl, isOneWayTicket, toTitleCase } from "./use-tickets-data";

export interface TicketRowProps {
  inclusion: TeamInclusion;
  ticket: Ticket | undefined;
  rowIdx: number;
  eventName: string;
  functionName: string;
  collaboratorName: string;
  eventLocation: string;
  hasPendingSwap: boolean;
  hasApprovedSwap: boolean;
  selected: boolean;
  canEdit: boolean;
  /** Evento encerrado: a linha não entra em ações em lote (servidor devolve 403). */
  locked?: boolean;
  onToggleSelect: (inclusionId: string) => void;
  onOpen: (inclusion: TeamInclusion) => void;
  /** Marca/desmarca "passagem emitida" — trava o pedido de ajuste da área. */
  onToggleEmitida?: (inclusion: TeamInclusion, emitida: boolean) => void;
  emitindo?: boolean;
}

const transportLabel = (t: Ticket) => (t.transportType === "van" ? "Van" : t.transportType === "rodoviario" ? "Rodoviário" : "Aéreo");

/** "LOC AX782Q · R$ 1.500,00 · Aéreo" — resumo curto da compra para tooltip/linha. */
export function ticketSummaryLine(t: Ticket): string {
  const parts: string[] = [];
  if (t.purchaseOrderNumber) parts.push(`${t.transportType === "van" ? "Empresa" : t.transportType === "rodoviario" ? "Bilhete" : "LOC"} ${t.purchaseOrderNumber}`);
  if (t.value != null && t.value > 0) parts.push(formatBrl(t.value));
  parts.push(transportLabel(t));
  return parts.join(" · ");
}

function TicketRow({
  inclusion, ticket, rowIdx, eventName, functionName, collaboratorName, eventLocation, onToggleEmitida, emitindo,
  hasPendingSwap, hasApprovedSwap, selected, canEdit, locked, onToggleSelect, onOpen,
}: TicketRowProps) {
  const cancelado = inclusion.status === "cancelado";
  const cellCls = `px-4 py-3 cursor-pointer ${cancelado ? "opacity-60" : ""}`;
  const open = () => onOpen(inclusion);
  const name = toTitleCase(collaboratorName);
  const initials = collaboratorName === "Não escalado" ? "?" : collaboratorName.split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase();
  const suggestion = extractTravelSuggestion(inclusion);
  const idaVazia = !hasSuggestionValue(suggestion.ida);
  const voltaVazia = !hasSuggestionValue(suggestion.retorno);
  const summary = ticket ? ticketSummaryLine(ticket) : "";

  return (
    <tr
      /* Hover por classe: o style.backgroundColor inline no mouseleave apagava o âmbar da linha com troca pendente. */
      className={`transition-colors group border-b border-slate-100 last:border-0 ${hasPendingSwap ? "bg-amber-50/40 hover:bg-amber-50/70" : rowIdx % 2 === 1 ? "bg-slate-50/50 hover:bg-[#EEF2FF]/40" : "bg-white hover:bg-[#EEF2FF]/40"}`}
      style={{
        opacity: cancelado ? 0.5 : 1,
        borderLeft: hasPendingSwap ? "3px solid #F59E0B" : cancelado ? "3px solid #E2E8F0" : ticket ? "3px solid #22C55E" : "3px solid #F97316",
      }}
    >
      {/* Checkbox — só para PENDENTES */}
      <td className="px-4 py-3 whitespace-nowrap w-10" onClick={(e) => e.stopPropagation()}>
        {!ticket && !cancelado && !locked ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(inclusion.id)}
            aria-label={`Selecionar passagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
            className="rounded border-gray-300 accent-blue-600"
            data-testid={`checkbox-ticket-${inclusion.id}`}
          />
        ) : <div className="w-4 h-4" />}
      </td>

      {/* ID */}
      <td className={`px-3 py-3 w-[64px] ${cancelado ? "opacity-60" : "cursor-pointer"}`} onClick={cancelado ? undefined : open}>
        <span style={{ display: "inline-block", background: "#EEF2FF", color: "#3B4FE4", fontSize: 13, fontWeight: 600, borderRadius: 6, padding: "4px 8px", whiteSpace: "nowrap" }}>
          #{inclusion.inclusionNumber || "N/A"}
        </span>
      </td>

      {/* Evento / Função */}
      <td className={cellCls} onClick={open}>
        {eventName === "Evento não encontrado" ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-500 text-[11px] font-semibold rounded-md">⚠ Não encontrado</span>
        ) : (
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>{eventName}</p>
        )}
        <p style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{functionName}</p>
      </td>

      {/* Colaborador */}
      <td className={cellCls} onClick={open}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: "#E8EFFE", color: "#3B4FE4" }}>{initials}</div>
          <div>
            <span className="text-[14px] font-[500] text-[#1a1a2e]">{name}</span>
            {hasPendingSwap && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                <span className="text-[10px] font-medium text-amber-600">Troca pendente</span>
              </span>
            )}
            {!hasPendingSwap && hasApprovedSwap && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-bold border border-green-200 mt-0.5">
                <ArrowLeftRight className="w-2.5 h-2.5" />Troca aprovada
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Destino */}
      <td className={cellCls} onClick={open}>
        {ticket ? (
          <div className="flex flex-col gap-0.5">
            <p className="text-[14px] font-semibold text-[#111827]">{eventLocation}</p>
            {ticket.transportType === "van" ? (
              ticket.purchaseOrderNumber && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 12 }}>directions_bus</span>
                  <span className="text-[11px] font-medium text-[#6B7280]">{ticket.purchaseOrderNumber}</span>
                </div>
              )
            ) : ticket.transportType === "rodoviario" ? (
              <>
                {(ticket.departureCityOrigin || ticket.departureCityDestination) && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 12 }}>directions_bus</span>
                    <span className="text-[11px] font-medium text-[#6B7280]">{ticket.departureCityOrigin || "—"}</span>
                    <span className="text-[10px] text-slate-300">→</span>
                    <span className="text-[11px] font-medium text-[#6B7280]">{ticket.departureCityDestination || "—"}</span>
                  </div>
                )}
                {(ticket.returnCityOrigin || ticket.returnCityDestination) && (
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 12 }}>directions_bus</span>
                    <span className="text-[11px] font-medium text-[#6B7280]">{ticket.returnCityOrigin || "—"}</span>
                    <span className="text-[10px] text-slate-300">→</span>
                    <span className="text-[11px] font-medium text-[#6B7280]">{ticket.returnCityDestination || "—"}</span>
                  </div>
                )}
              </>
            ) : (
              (ticket.departureAirport || ticket.destinationAirport) && (
                <>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 12 }}>flight_takeoff</span>
                    <span className="text-[11px] font-medium text-[#6B7280] uppercase">{ticket.departureAirport || "—"}</span>
                    <span className="text-[10px] text-slate-300">→</span>
                    <span className="text-[11px] font-medium text-[#6B7280] uppercase">{ticket.destinationAirport || "—"}</span>
                  </div>
                  {!isOneWayTicket(ticket) && (
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 12 }}>flight_land</span>
                      <span className="text-[11px] font-medium text-[#6B7280] uppercase">{ticket.destinationAirport || "—"}</span>
                      <span className="text-[10px] text-slate-300">→</span>
                      <span className="text-[11px] font-medium text-[#6B7280] uppercase">{ticket.departureAirport || "—"}</span>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 16 }}>location_on</span>
            <span>{eventLocation}</span>
          </div>
        )}
      </td>

      {/* Datas e Horários */}
      <td className={`${cellCls} whitespace-nowrap`} onClick={open} title={summary || undefined}>
        {ticket ? (
          ticket.transportType === "van" ? (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-[#16A34A] tracking-wide">✓ Van confirmada</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-[#16A34A] tracking-wide mb-0.5">✓ Passagem confirmada</span>
              <div className="flex items-center gap-2 text-xs">
                <span className="material-symbols-outlined text-[#16A34A]" style={{ fontSize: 13 }}>{ticket.transportType === "rodoviario" ? "directions_bus" : "flight_takeoff"}</span>
                <span className="font-bold text-slate-700">{ticket.actualDepartureDate ? formatDate(ticket.actualDepartureDate) : "—"}</span>
                {ticket.actualDepartureTime && <span className="text-slate-400 font-medium">{ticket.actualDepartureTime}{ticket.actualArrivalTime ? ` → ${ticket.actualArrivalTime}` : ""}</span>}
              </div>
              {!isOneWayTicket(ticket) && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="material-symbols-outlined text-[#22C55E]" style={{ fontSize: 13 }}>{ticket.transportType === "rodoviario" ? "directions_bus" : "flight_land"}</span>
                  <span className="font-bold text-slate-700">{ticket.actualReturnDate ? formatDate(ticket.actualReturnDate) : "—"}</span>
                  {ticket.actualReturnTime && <span className="text-slate-400 font-medium">{ticket.actualReturnTime}</span>}
                </div>
              )}
            </div>
          )
        ) : (
          <span className="text-sm text-slate-300 italic">Não comprada</span>
        )}
      </td>

      {/* Sugestões */}
      <td className={cellCls} onClick={open}>
        {idaVazia && voltaVazia ? (
          <span className="text-[11px] text-slate-300 italic">—</span>
        ) : (
          <div className="flex flex-col gap-0.5" title="Horário sugerido — ainda não confirmado">
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-0.5">Sugestão</span>
            {!idaVazia && (
              <div className="flex items-center gap-1 text-[11px] flex-nowrap">
                <span className="material-symbols-outlined text-amber-400 shrink-0" style={{ fontSize: 11 }}>flight_takeoff</span>
                <span className="font-semibold text-slate-700 whitespace-nowrap">{formatSuggestionDate(suggestion.ida)}</span>
                {hasSuggestionValue(suggestion.chegada) && <span className="text-slate-400 whitespace-nowrap">{suggestion.chegada}</span>}
              </div>
            )}
            {!voltaVazia && (
              <div className="flex items-center gap-1 text-[11px] flex-nowrap">
                <span className="material-symbols-outlined text-amber-400 shrink-0" style={{ fontSize: 11 }}>flight_land</span>
                <span className="font-semibold text-slate-700 whitespace-nowrap">{formatSuggestionDate(suggestion.retorno)}</span>
                {hasSuggestionValue(suggestion.horario) && <span className="text-slate-400 whitespace-nowrap">{suggestion.horario}</span>}
              </div>
            )}
          </div>
        )}
      </td>

      {/* Status (+ resumo LOC/valor/tipo) */}
      <td className={`${cellCls} text-center`} onClick={open}>
        {cancelado ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-400 text-[10px] font-bold tracking-wide rounded-md">Cancelado</span>
        ) : ticket ? (
          <div className="flex flex-col items-center gap-1" title={summary}>
            {ticket.emittedAt && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-wide rounded-md bg-violet-50 text-violet-700"
                title="Passagem emitida — a área não pede mais ajuste nesta vaga"
                data-testid={`ticket-emitida-${inclusion.id}`}
              >
                <Lock className="w-3 h-3" aria-hidden="true" />Emitida
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-wide rounded-md" style={{ background: "#DCFCE7", color: "#15803D" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />Comprada
            </span>
            <span className="text-[10px] text-slate-400 whitespace-nowrap max-w-[160px] truncate" data-testid={`ticket-summary-${inclusion.id}`}>{summary}</span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-wide rounded-md" style={{ background: "#FEF9C3", color: "#B45309" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />Pendente
          </span>
        )}
      </td>

      {/* Ações */}
      <td className="py-3 text-center whitespace-nowrap w-[72px]">
        {/* Emitida: o carimbo de quem compra. Marcar não exige a passagem
            preenchida — é aviso de que o bilhete saiu e de que a área não
            pede mais ajuste. Clicar de novo desfaz (erro de clique acontece). */}
        {!cancelado && onToggleEmitida && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleEmitida(inclusion, !ticket?.emittedAt); }}
            disabled={!canEdit || locked || emitindo}
            title={ticket?.emittedAt
              ? "Passagem emitida — clique para desfazer e reabrir o pedido de ajuste"
              : "Marcar como emitida — trava o pedido de ajuste desta vaga"}
            aria-label={ticket?.emittedAt ? "Desfazer emissão da passagem" : "Marcar passagem como emitida"}
            data-testid={`toggle-emitida-${inclusion.id}`}
            className={`mb-1 w-8 h-8 rounded-full flex items-center justify-center mx-auto transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${ticket?.emittedAt ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-400 hover:bg-violet-50 hover:text-violet-600"}`}
          >
            <Stamp className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
        {!cancelado && (
          ticket ? (
            <button
              onClick={open}
              data-testid={`view-ticket-${inclusion.inclusionNumber}`}
              title="Visualizar passagem"
              aria-label={`Visualizar passagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
              className="w-8 h-8 rounded-full flex items-center justify-center mx-auto transition-colors"
              style={{ background: "#F1F5F9", color: "#94A3B8" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#EEF2FF"; e.currentTarget.style.color = "#3B4FE4"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#F1F5F9"; e.currentTarget.style.color = "#94A3B8"; }}
            >
              <Eye className="w-4 h-4" />
            </button>
          ) : canEdit ? (
            <button
              onClick={open}
              data-testid={`buy-ticket-${inclusion.inclusionNumber}`}
              title="Registrar passagem"
              aria-label={`Registrar passagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
              className="w-8 h-8 flex items-center justify-center mx-auto transition-colors"
              style={{ background: "#EEF2FF", color: "#3B4FE4", border: "none", borderRadius: 8, cursor: "pointer" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#3B4FE4"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#EEF2FF"; e.currentTarget.style.color = "#3B4FE4"; }}
            >
              <Plane className="w-4 h-4" />
            </button>
          ) : null
        )}
      </td>
    </tr>
  );
}

export default memo(TicketRow);
