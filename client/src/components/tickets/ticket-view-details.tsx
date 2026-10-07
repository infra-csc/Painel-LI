// Aba "Dados da passagem" em modo visualização (passagem já registrada).
//
// 07/10 (redesenho): cada perna virou um "cartão de embarque" — origem → destino
// em destaque, cidade embaixo de cada ponta, data no canto e partida → chegada
// numa faixa verde. Antes era uma pilha de dez rótulos em caixa alta pesada,
// com emoji no título. Os mesmos campos: cidade e aeroporto/rodoviária de
// origem e de destino, data, horário de partida e de chegada (ida e volta),
// LOC/bilhete/empresa, data da compra, valor, observações e anexos.
import { FileText, Eye, Plane, Bus, Truck, ArrowRight, PlaneTakeoff, PlaneLanding } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { TeamInclusion, Ticket } from "@shared/schema";
import { extractTravelSuggestion } from "@/lib/ticket-form";
import SuggestedDates from "./suggested-dates";
import { LBL, VAL, SECAO } from "./ticket-summary-tab";
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
  const TipoIcone = isVan ? Truck : isRodo ? Bus : Plane;

  const openAttachment = async (attachmentId: string) => {
    try {
      const response = await fetch(`/api/attachments/${attachmentId}`);
      const attachmentData = await response.json();
      if (response.ok && attachmentData.viewUrl && attachmentData.viewUrl !== "#") {
        const isViewable = attachmentData.type?.includes("pdf") || attachmentData.type?.includes("image");
        window.open(isViewable ? attachmentData.viewUrl : attachmentData.downloadUrl, "_blank");
      } else {
        // Motivo real do servidor quando houver (30/09).
        toast({ title: "Anexo não disponível", description: attachmentData?.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Não foi possível abrir o anexo", description: "Tente de novo em instantes.", variant: "destructive" });
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
    const Icone = leg === "ida" ? PlaneTakeoff : PlaneLanding;
    const rotuloPonto = (lado: "origem" | "destino") => `${isRodo ? "Rodoviária" : "Aeroporto"} de ${lado}`;
    // Ponta da rota: o código/terminal em destaque e a cidade embaixo.
    const ponta = (lado: "origem" | "destino", terminal: string | null | undefined, cidade: string | null | undefined) => (
      <div className={`min-w-0 ${lado === "destino" ? "text-right" : ""}`}>
        <div className="text-2xs text-muted-foreground">{lado === "origem" ? "Origem" : "Destino"}</div>
        {terminal ? (
          <div
            className={isRodo ? "text-sm font-semibold text-foreground leading-snug break-words" : "text-xl font-semibold tracking-wide text-foreground uppercase leading-7 tabular-nums"}
            title={rotuloPonto(lado)}
          >
            <span className="sr-only">{rotuloPonto(lado)}: </span>{terminal}
          </div>
        ) : (
          <div className="text-xl font-semibold text-muted-foreground leading-7" title={rotuloPonto(lado)}>—</div>
        )}
        {cidade && (
          <div className="text-xs text-slate-600 leading-snug break-words" title={`Cidade de ${lado}`}>
            <span className="sr-only">Cidade de {lado}: </span>{cidade}
          </div>
        )}
      </div>
    );
    return (
      <section className="rounded-xl border border-border bg-card overflow-hidden" aria-label={leg === "ida" ? "Ida" : "Volta"}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
          {isRodo ? <Bus className="w-4 h-4 text-primary" aria-hidden="true" /> : <Icone className="w-4 h-4 text-primary" aria-hidden="true" />}
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-primary">{leg === "ida" ? "Ida" : "Volta"}</span>
          {date && (
            <span className="ml-auto text-sm font-semibold text-foreground tabular-nums" title="Data">
              <span className="sr-only">Data: </span>{formatDate(date)}
            </span>
          )}
        </div>
        <div className="px-4 py-3.5 space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
            {ponta("origem", airO, cityO)}
            <ArrowRight className="w-4 h-4 mt-6 text-muted-foreground" aria-hidden="true" />
            {ponta("destino", airD, cityD)}
          </div>
          {time && (
            <div
              className="flex items-center gap-3 rounded-lg bg-success-soft px-3 py-2"
              title={arrival ? (leg === "ida" ? "Partida → Chegada (ida) — usado no cálculo automático de alimentação" : "Partida → Chegada (volta) — horário para agendar o transporte na chegada") : undefined}
            >
              <div>
                <div className="text-2xs text-success/80">Horário</div>
                <div className="text-lg font-semibold leading-6 text-success tabular-nums">{time}{arrival ? ` → ${arrival}` : ""}</div>
              </div>
              {arrival && <div className="ml-auto text-right text-2xs text-success/80 leading-4">partida → chegada</div>}
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-4">
      {/* A compra: tipo, LOC/bilhete/empresa, data e valor */}
      <section className="rounded-xl border border-border bg-card overflow-hidden" aria-label="Compra">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border">
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-soft text-primary shrink-0">
            <TipoIcone className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              {isVan ? "Van" : isRodo ? "Transporte rodoviário" : "Passagem aérea"}
            </div>
            {ticket.purchaseDate && <div className="text-xs text-muted-foreground">Comprada em {formatDate(ticket.purchaseDate)}</div>}
          </div>
          {ticket.purchaseOrderNumber && (
            <span className="ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-muted text-xs text-slate-600">
              {isVan ? "Empresa" : isRodo ? "Bilhete" : "LOC"}
              <span className="font-mono font-semibold text-foreground">{ticket.purchaseOrderNumber}</span>
            </span>
          )}
        </div>
        {!isVan && (
          <dl className="m-0 px-4 py-3 flex flex-wrap gap-x-8 gap-y-2">
            {ticket.purchaseDate && <div><dt className={LBL}>Data da compra</dt><dd className={`m-0 ${VAL}`}>{formatDate(ticket.purchaseDate)}</dd></div>}
            {ticket.value != null && ticket.value > 0 && <div><dt className={LBL}>Valor da passagem</dt><dd className={`m-0 ${VAL} tabular-nums`}>{formatBrl(ticket.value)}</dd></div>}
          </dl>
        )}
        {isVan && ticket.ticketObservations && (
          <div className="px-4 py-3">
            <div className={LBL}>Observações</div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.ticketObservations}</div>
          </div>
        )}
      </section>

      {/* IDA + VOLTA */}
      {!isVan && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {legCard("ida")}
          {!isOneWayTicket(ticket) ? legCard("volta") : (
            <div className="rounded-xl border border-dashed border-border bg-surface-muted p-4 flex items-center justify-center text-center">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1">
                  {isRodo ? <Bus className="w-3.5 h-3.5" aria-hidden="true" /> : <PlaneLanding className="w-3.5 h-3.5" aria-hidden="true" />}Volta
                </div>
                <div className="text-xs text-muted-foreground">Apenas ida / sem informações de volta</div>
              </div>
            </div>
          )}
        </div>
      )}

      {ticket.ticketObservations && !isVan && (
        <section className="rounded-xl border border-border bg-card px-4 py-3">
          <h3 className={SECAO.replace("mb-3", "mb-1")}>Observações</h3>
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.ticketObservations}</div>
        </section>
      )}

      <SuggestedDates suggestion={suggestion} hideWhenEmpty compact />

      {/* Anexos */}
      {ticket.attachmentIds && ticket.attachmentIds.length > 0 && (
        <section className="rounded-xl border border-border bg-card overflow-hidden" aria-label="Anexos">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
            <FileText className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs font-semibold text-foreground">Anexos</span>
            <span className="ml-auto text-2xs text-muted-foreground">{ticket.attachmentIds.length} arquivo(s)</span>
          </div>
          <div className="p-2">
            {ticket.attachmentIds.map((attachmentId, index) => (
              <div
                key={attachmentId}
                role="button"
                tabIndex={0}
                aria-label={`Abrir arquivo ${index + 1}`}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => openAttachment(attachmentId)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAttachment(attachmentId); } }}
              >
                <span className="w-8 h-8 rounded-lg bg-brand-soft flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">Arquivo {index + 1}</div>
                  <div className="text-2xs text-muted-foreground">Documento anexado · clique para visualizar</div>
                </div>
                <Eye className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" aria-hidden="true" />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
