// Aba "Dados da Passagem" em modo visualização (passagem já registrada).
import { FileText, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { TeamInclusion, Ticket } from "@shared/schema";
import { extractTravelSuggestion } from "@/lib/ticket-form";
import SuggestedDates from "./suggested-dates";
import { LBL, VAL } from "./ticket-summary-tab";
import { formatDate, formatBrl, isOneWayTicket } from "./use-tickets-data";

interface TicketViewDetailsProps {
  ticket: Ticket;
  inclusion: TeamInclusion;
}

export default function TicketViewDetails({ ticket, inclusion }: TicketViewDetailsProps) {
  const { toast } = useToast();
  const isVan = ticket.transportType === "van";
  const isRodo = ticket.transportType === "rodoviario";
  const suggestion = extractTravelSuggestion(inclusion);

  const openAttachment = async (attachmentId: string) => {
    try {
      const response = await fetch(`/api/attachments/${attachmentId}`);
      const attachmentData = await response.json();
      if (response.ok && attachmentData.viewUrl && attachmentData.viewUrl !== "#") {
        const isViewable = attachmentData.type?.includes("pdf") || attachmentData.type?.includes("image");
        window.open(isViewable ? attachmentData.viewUrl : attachmentData.downloadUrl, "_blank");
      } else {
        toast({ title: "Anexo não disponível", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao abrir anexo", variant: "destructive" });
    }
  };

  const legCard = (leg: "ida" | "volta") => {
    const cityO = leg === "ida" ? ticket.departureCityOrigin : ticket.returnCityOrigin;
    const airO = leg === "ida" ? ticket.departureAirport : ticket.returnOriginAirport;
    const cityD = leg === "ida" ? ticket.departureCityDestination : ticket.returnCityDestination;
    const airD = leg === "ida" ? ticket.destinationAirport : ticket.returnDestinationAirport;
    const date = leg === "ida" ? ticket.actualDepartureDate : ticket.actualReturnDate;
    const time = leg === "ida" ? ticket.actualDepartureTime : ticket.actualReturnTime;
    // Chegada também na VOLTA (dono, 18/09): é por ela que se agenda o Uber.
    const arrival = leg === "ida" ? ticket.actualArrivalTime : ticket.returnArrivalTime;
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="text-2xs font-black uppercase tracking-[0.12em] mb-3 flex items-center gap-1.5 text-primary">
          {isRodo ? "🚌" : leg === "ida" ? "🛫" : "🛬"} {leg === "ida" ? "IDA" : "VOLTA"}
        </div>
        <div className="space-y-2.5">
          {cityO && <div><div className={LBL}>Cidade Origem</div><div className="text-sm font-medium text-slate-700">{cityO}</div></div>}
          {airO && <div><div className={LBL}>{isRodo ? "Rodoviária Origem" : "Aeroporto Origem"}</div><div className="text-sm font-bold text-slate-700 uppercase font-mono">{airO}</div></div>}
          {cityD && <div><div className={LBL}>Cidade Destino</div><div className="text-sm font-medium text-slate-700">{cityD}</div></div>}
          {airD && <div><div className={LBL}>{isRodo ? "Rodoviária Destino" : "Aeroporto Destino"}</div><div className="text-sm font-bold text-slate-700 uppercase font-mono">{airD}</div></div>}
          {date && <div><div className={LBL}>Data</div><div className="text-sm font-semibold text-primary">{formatDate(date)}</div></div>}
          {time && (
            <div>
              <div className={LBL}>Horário</div>
              <div className="bg-success-soft border-l-4 border-success-strong rounded-lg px-3 py-2" title={arrival ? (leg === "ida" ? "Partida → Chegada (ida) — usado no cálculo automático de alimentação" : "Partida → Chegada (volta) — horário para agendar o transporte na chegada") : undefined}>
                <span className="text-lg font-bold text-success">{time}{arrival ? ` → ${arrival}` : ""}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header do ticket */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-1">
        <div className="border-b border-border px-4 py-3 flex items-center gap-3 bg-brand-soft">
          <span className="text-xl">{isVan ? "🚐" : isRodo ? "🚌" : "✈️"}</span>
          <div>
            <div className="text-xs font-black text-primary uppercase tracking-[0.12em]">
              {isVan ? "Van" : isRodo ? "Transporte Rodoviário" : "Passagem Aérea"}
            </div>
            {ticket.purchaseDate && <div className="text-2xs text-muted-foreground mt-0.5">Comprada em {formatDate(ticket.purchaseDate)}</div>}
          </div>
          {ticket.purchaseOrderNumber && (
            <span className="ml-auto text-2xs font-bold text-muted-foreground font-mono bg-muted px-2.5 py-1 rounded-full">
              {isVan ? "Empresa: " : isRodo ? "Bilhete: " : "LOC: "}{ticket.purchaseOrderNumber}
            </span>
          )}
        </div>
        {!isVan && (
          <div className="px-4 py-3 flex flex-wrap gap-6">
            {ticket.purchaseDate && <div><div className={LBL}>Data da Compra</div><div className={VAL}>{formatDate(ticket.purchaseDate)}</div></div>}
            {ticket.value != null && ticket.value > 0 && <div><div className={LBL}>Valor da Passagem</div><div className={VAL}>{formatBrl(ticket.value)}</div></div>}
          </div>
        )}
        {isVan && ticket.ticketObservations && (
          <div className="p-4">
            <div className={LBL}>Observações</div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.ticketObservations}</div>
          </div>
        )}
      </div>

      {/* IDA + VOLTA */}
      {!isVan && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {legCard("ida")}
          {!isOneWayTicket(ticket) ? legCard("volta") : (
            <div className="bg-surface-muted border border-dashed border-border rounded-xl p-4 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xs font-black uppercase tracking-[0.12em] text-muted-foreground mb-1">{isRodo ? "🚌" : "🛬"} VOLTA</div>
                <div className="text-xs text-muted-foreground">Apenas ida / sem informações de volta</div>
              </div>
            </div>
          )}
        </div>
      )}

      {ticket.ticketObservations && !isVan && (
        <div className="bg-surface-muted border border-border rounded-xl p-4">
          <div className={LBL + " mb-1"}>Observações</div>
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.ticketObservations}</div>
        </div>
      )}

      <SuggestedDates suggestion={suggestion} hideWhenEmpty compact />

      {/* Anexos */}
      {ticket.attachmentIds && ticket.attachmentIds.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="bg-surface-muted border-b border-border px-4 py-2.5 flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-2xs font-black text-muted-foreground uppercase tracking-[0.12em]">Anexos</span>
            <span className="ml-auto text-2xs text-muted-foreground">{ticket.attachmentIds.length} arquivo(s)</span>
          </div>
          <div className="p-4 space-y-2">
            {ticket.attachmentIds.map((attachmentId, index) => (
              <div
                key={attachmentId}
                role="button"
                tabIndex={0}
                aria-label={`Abrir arquivo ${index + 1}`}
                className="flex items-center gap-3 bg-card border border-border hover:border-primary hover:bg-brand-soft rounded-xl px-4 py-3 cursor-pointer transition-all group"
                onClick={() => openAttachment(attachmentId)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAttachment(attachmentId); } }}
              >
                <div className="w-8 h-8 rounded-lg bg-brand-soft border border-primary/25 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-700">Arquivo {index + 1}</div>
                  <div className="text-2xs text-muted-foreground mt-0.5">Documento anexado · clique para visualizar</div>
                </div>
                <Eye className="w-4 h-4 text-muted-foreground group-hover:text-primary-hover transition-colors flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
