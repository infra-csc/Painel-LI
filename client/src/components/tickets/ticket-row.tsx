// Uma linha da tabela de Passagens.
import { memo } from "react";
import { Eye, Plane, ArrowLeftRight, Lock, Stamp, Bus, PlaneTakeoff, PlaneLanding, MapPin } from "lucide-react";
import type { TeamInclusion, Ticket } from "@shared/schema";
import { extractTravelSuggestion, formatSuggestionDate, hasSuggestionValue } from "@/lib/ticket-form";
import { formatDate, formatBrl, isOneWayTicket, toTitleCase } from "./use-tickets-data";
import { cn } from "@/lib/utils";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";

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

/** Forma única das pílulas da linha (h22 · px7 · r6 · 11px/500). */
const PILULA = "inline-flex items-center gap-1.5 h-[22px] px-[7px] rounded-md text-2xs font-medium whitespace-nowrap";

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
      className={cn(`transition-colors group border-b border-border last:border-0 ${hasPendingSwap ? "bg-warning-soft/40 hover:bg-warning-soft/70" : rowIdx % 2 === 1 ? "bg-surface-muted/50 hover:bg-brand-soft/40" : "bg-card hover:bg-brand-soft/40"}`, (cancelado ? "opacity-50" : "opacity-100"), (hasPendingSwap ? "border-l-[3px] border-l-warning-strong" : cancelado ? "border-l-[3px] border-l-border" : ticket ? "border-l-[3px] border-l-success-strong" : "border-l-[3px] border-l-warning-strong"))}
    >
      {/* Checkbox — só para PENDENTES */}
      <td className="px-4 py-3 whitespace-nowrap w-10" onClick={(e) => e.stopPropagation()}>
        {/* O alvo é o <label> de 40x40: margem não amplia área de clique e
            padding em checkbox nativo não funciona. */}
        {!ticket && !cancelado && !locked ? (
          <label className="flex items-center justify-center w-10 h-10 -m-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(inclusion.id)}
              aria-label={`Selecionar passagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
              className="rounded border-slate-300 accent-primary"
              data-testid={`checkbox-ticket-${inclusion.id}`}
            />
          </label>
        ) : <div className="w-4 h-4" />}
      </td>

      {/* ID */}
      <td className={`px-3 py-3 w-[64px] ${cancelado ? "opacity-60" : "cursor-pointer"}`} onClick={cancelado ? undefined : open}>
        {/* A linha abre no clique (mouse); pelo teclado o acesso é este botão, invisível até receber foco. */}
        {!cancelado && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); open(); }}
            className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:rounded-md focus:bg-primary focus:px-2 focus:py-1 focus:text-xs focus:text-primary-foreground"
          >
            Abrir vaga #{inclusion.inclusionNumber || ""}
          </button>
        )}
        <span className={`${PILULA} bg-brand-soft text-primary font-mono tabular-nums`}>
          #{inclusion.inclusionNumber || "N/A"}
        </span>
      </td>

      {/* Evento / Função */}
      <td className={cellCls} data-rotulo="Evento e função" onClick={open}>
        {eventName === "Evento não encontrado" ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-danger-soft text-danger-strong text-2xs font-semibold rounded-md">⚠ Não encontrado</span>
        ) : (
          <p className="text-sm font-semibold text-foreground">{eventName}</p>
        )}
        <p className="text-xs mt-0.5 text-muted-foreground">{functionName}</p>
      </td>

      {/* Colaborador */}
      <td className={cellCls} data-rotulo="Passageiro" onClick={open}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-2xs font-bold shrink-0 bg-brand-soft text-primary">{initials}</div>
          <div>
            <span className="text-sm font-[500] text-foreground">{name}</span>
            {hasPendingSwap && (
              <span className={`${PILULA} bg-warning-soft text-warning mt-0.5`}>
                <span className="w-[5px] h-[5px] rounded-full bg-warning shrink-0" aria-hidden="true" />
                Troca pendente
              </span>
            )}
            {!hasPendingSwap && hasApprovedSwap && (
              <span className={`${PILULA} bg-success-soft text-success mt-0.5`}>
                <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />Troca aprovada
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Destino */}
      <td className={cellCls} data-rotulo="Destino" onClick={open}>
        {ticket ? (
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-foreground">{eventLocation}</p>
            {ticket.transportType === "van" ? (
              ticket.purchaseOrderNumber && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Bus className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <span className="text-2xs font-medium text-muted-foreground">{ticket.purchaseOrderNumber}</span>
                </div>
              )
            ) : ticket.transportType === "rodoviario" ? (
              <>
                {(ticket.departureCityOrigin || ticket.departureCityDestination) && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Bus className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                    <span className="text-2xs font-medium text-muted-foreground">{ticket.departureCityOrigin || "—"}</span>
                    <span className="text-2xs text-muted-foreground">→</span>
                    <span className="text-2xs font-medium text-muted-foreground">{ticket.departureCityDestination || "—"}</span>
                  </div>
                )}
                {(ticket.returnCityOrigin || ticket.returnCityDestination) && (
                  <div className="flex items-center gap-1">
                    <Bus className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                    <span className="text-2xs font-medium text-muted-foreground">{ticket.returnCityOrigin || "—"}</span>
                    <span className="text-2xs text-muted-foreground">→</span>
                    <span className="text-2xs font-medium text-muted-foreground">{ticket.returnCityDestination || "—"}</span>
                  </div>
                )}
              </>
            ) : (
              (ticket.departureAirport || ticket.destinationAirport) && (
                <>
                  <div className="flex items-center gap-1 mt-0.5">
                    <PlaneTakeoff className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                    <span className="text-2xs font-medium text-muted-foreground uppercase">{ticket.departureAirport || "—"}</span>
                    <span className="text-2xs text-muted-foreground">→</span>
                    <span className="text-2xs font-medium text-muted-foreground uppercase">{ticket.destinationAirport || "—"}</span>
                  </div>
                  {!isOneWayTicket(ticket) && (
                    <div className="flex items-center gap-1">
                      <PlaneLanding className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      <span className="text-2xs font-medium text-muted-foreground uppercase">{ticket.destinationAirport || "—"}</span>
                      <span className="text-2xs text-muted-foreground">→</span>
                      <span className="text-2xs font-medium text-muted-foreground uppercase">{ticket.departureAirport || "—"}</span>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span>{eventLocation}</span>
          </div>
        )}
      </td>

      {/* Datas e Horários */}
      <td className={`${cellCls} whitespace-nowrap`} data-rotulo="Ida e volta" onClick={open} title={summary || undefined}>
        {ticket ? (
          ticket.transportType === "van" ? (
            <div className="flex flex-col gap-1">
              <span className="text-2xs font-bold text-success tracking-wide">✓ Van confirmada</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-2xs font-bold text-success tracking-wide mb-0.5">✓ Passagem confirmada</span>
              <div className="flex items-center gap-2 text-xs">
                {ticket.transportType === "rodoviario" ? <Bus className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <PlaneTakeoff className="h-3.5 w-3.5 text-success" aria-hidden="true" />}
                <span className="font-bold text-slate-700">{ticket.actualDepartureDate ? formatDate(ticket.actualDepartureDate) : "—"}</span>
                {ticket.actualDepartureTime && <span className="text-muted-foreground font-medium">{ticket.actualDepartureTime}{ticket.actualArrivalTime ? ` → ${ticket.actualArrivalTime}` : ""}</span>}
              </div>
              {!isOneWayTicket(ticket) && (
                <div className="flex items-center gap-2 text-xs">
                  {ticket.transportType === "rodoviario" ? <Bus className="h-3.5 w-3.5 text-success-strong" aria-hidden="true" /> : <PlaneLanding className="h-3.5 w-3.5 text-success-strong" aria-hidden="true" />}
                  <span className="font-bold text-slate-700">{ticket.actualReturnDate ? formatDate(ticket.actualReturnDate) : "—"}</span>
                  {ticket.actualReturnTime && <span className="text-muted-foreground font-medium">{ticket.actualReturnTime}{ticket.returnArrivalTime ? ` → ${ticket.returnArrivalTime}` : ""}</span>}
                </div>
              )}
            </div>
          )
        ) : (
          <span className="text-sm text-muted-foreground italic">Não comprada</span>
        )}
      </td>

      {/* Sugestões */}
      <td className={cellCls} data-rotulo="Sugestões" onClick={open}>
        {idaVazia && voltaVazia ? (
          <span className="text-2xs text-muted-foreground italic">—</span>
        ) : (
          <div className="flex flex-col gap-0.5" title="Horário sugerido — ainda não confirmado">
            <span className="text-2xs font-black uppercase tracking-widest text-warning-strong mb-0.5">Sugestão</span>
            {!idaVazia && (
              <div className="flex items-center gap-1 text-2xs flex-nowrap">
                <PlaneTakeoff className="h-3 w-3 text-warning-strong shrink-0" aria-hidden="true" />
                <span className="font-semibold text-slate-700 whitespace-nowrap">{formatSuggestionDate(suggestion.ida)}</span>
                {hasSuggestionValue(suggestion.chegada) && <span className="text-muted-foreground whitespace-nowrap">{suggestion.chegada}</span>}
              </div>
            )}
            {!voltaVazia && (
              <div className="flex items-center gap-1 text-2xs flex-nowrap">
                <PlaneLanding className="h-3 w-3 text-warning-strong shrink-0" aria-hidden="true" />
                <span className="font-semibold text-slate-700 whitespace-nowrap">{formatSuggestionDate(suggestion.retorno)}</span>
                {hasSuggestionValue(suggestion.horario) && <span className="text-muted-foreground whitespace-nowrap">{suggestion.horario}</span>}
              </div>
            )}
          </div>
        )}
      </td>

      {/* Status (+ resumo LOC/valor/tipo) */}
      <td className={`${cellCls} text-center`} data-rotulo="Situação" onClick={open}>
        {cancelado ? (
          <span className={`${PILULA} bg-muted text-muted-foreground`}>Cancelado</span>
        ) : ticket ? (
          <div className="flex flex-col items-center gap-1" title={summary}>
            {ticket.emittedAt && (
              <span
                className={`${PILULA} bg-brand-soft text-primary`}
                title="Passagem emitida — a área não pede mais ajuste nesta vaga"
                data-testid={`ticket-emitida-${inclusion.id}`}
              >
                <Lock className="w-3 h-3" aria-hidden="true" />Emitida
              </span>
            )}
            <span className={`${PILULA} bg-success-soft text-success`}>
              <span className="w-[5px] h-[5px] rounded-full bg-success shrink-0" aria-hidden="true" />Comprada
            </span>
            <span className="text-2xs text-muted-foreground whitespace-nowrap max-w-[210px] truncate" title={summary} data-testid={`ticket-summary-${inclusion.id}`}>{summary}</span>
          </div>
        ) : (
          <span className={`${PILULA} bg-warning-soft text-warning`}>
            <span className="w-[5px] h-[5px] rounded-full bg-warning shrink-0" aria-hidden="true" />Pendente
          </span>
        )}
      </td>

      {/* Ações */}
      <td className="py-3 text-center whitespace-nowrap w-[72px]">
        {/* Emitida: o carimbo de quem compra. Marcar não exige a passagem
            preenchida — é aviso de que o bilhete saiu e de que a área não
            pede mais ajuste. Clicar de novo desfaz (erro de clique acontece). */}
        {!cancelado && onToggleEmitida && (
          <MotivoDesabilitado motivo={ticket?.emittedAt
              ? "Passagem emitida — clique para desfazer e reabrir o pedido de ajuste"
              : "Marcar como emitida — trava o pedido de ajuste desta vaga"} desabilitado={!canEdit || locked || emitindo}>
            <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleEmitida(inclusion, !ticket?.emittedAt); }}
            disabled={!canEdit || locked || emitindo}
           
            aria-label={ticket?.emittedAt ? "Desfazer emissão da passagem" : "Marcar passagem como emitida"}
            data-testid={`toggle-emitida-${inclusion.id}`}
            className={`mb-1 w-8 h-8 rounded-full flex items-center justify-center mx-auto transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${ticket?.emittedAt ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground hover:bg-brand-soft hover:text-primary-hover"}`}
          >
            <Stamp className="w-4 h-4" aria-hidden="true" />
          </button>
          </MotivoDesabilitado>
        )}
        {!cancelado && (
          ticket ? (
            <button
              onClick={open}
              data-testid={`view-ticket-${inclusion.inclusionNumber}`}
              title="Visualizar passagem"
              aria-label={`Visualizar passagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
              className="w-8 h-8 rounded-full flex items-center justify-center mx-auto transition-colors bg-muted text-muted-foreground hover:bg-brand-soft hover:text-primary"
            >
              <Eye className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : canEdit ? (
            <button
              onClick={open}
              data-testid={`buy-ticket-${inclusion.inclusionNumber}`}
              title="Registrar passagem"
              aria-label={`Registrar passagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
              className="w-8 h-8 flex items-center justify-center mx-auto transition-colors bg-brand-soft text-primary hover:bg-primary hover:text-primary-foreground border-0 rounded-lg cursor-pointer"
            >
              <Plane className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : null
        )}
      </td>
    </tr>
  );
}

export default memo(TicketRow);
