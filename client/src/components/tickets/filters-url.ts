// Filtros da tela ↔ query string (?event=&function=a,b&collaborator=&q=&status=&inclusion=&transport=&swaps=1).
import { DEFAULT_TICKET_FILTERS, type TicketFilters } from "./types";

export function filtersFromSearch(search: string): { filters: TicketFilters; swaps: boolean } {
  const p = new URLSearchParams(search);
  const fn = p.get("function");
  return {
    filters: {
      eventId: p.get("event") || DEFAULT_TICKET_FILTERS.eventId,
      functionId: fn ? fn.split(",").filter(Boolean) : [],
      collaboratorId: p.get("collaborator") || DEFAULT_TICKET_FILTERS.collaboratorId,
      searchId: p.get("q") || "",
      ticketStatus: p.get("status") || DEFAULT_TICKET_FILTERS.ticketStatus,
      inclusionStatus: p.get("inclusion") || DEFAULT_TICKET_FILTERS.inclusionStatus,
      transportType: p.get("transport") || DEFAULT_TICKET_FILTERS.transportType,
    },
    swaps: p.get("swaps") === "1",
  };
}

export function searchFromFilters(f: TicketFilters, swaps: boolean): string {
  const p = new URLSearchParams();
  if (f.eventId !== "all") p.set("event", f.eventId);
  if (f.functionId.length) p.set("function", f.functionId.join(","));
  if (f.collaboratorId !== "all") p.set("collaborator", f.collaboratorId);
  if (f.searchId) p.set("q", f.searchId);
  if (f.ticketStatus !== "all") p.set("status", f.ticketStatus);
  if (f.inclusionStatus !== "active") p.set("inclusion", f.inclusionStatus);
  if (f.transportType !== "all") p.set("transport", f.transportType);
  if (swaps) p.set("swaps", "1");
  return p.toString();
}
