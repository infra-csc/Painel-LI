// Tabela de Passagens: cabeçalho ordenável + linhas (TicketRow) + estado vazio.
import { Plane } from "lucide-react";
import SortableHeader, { type SortConfig, type SortField } from "@/components/common/sortable-header";
import type { TeamInclusion } from "@shared/schema";
import TicketRow from "./ticket-row";
import type { TicketsData } from "./use-tickets-data";
import type { TicketFilters } from "./types";

interface TicketsTableProps {
  data: TicketsData;
  filters: TicketFilters;
  sortConfig: SortConfig | null;
  onSort: (field: SortField) => void;
  selectedTickets: string[];
  allSelectableSelected: boolean;
  onToggleAll: () => void;
  onToggleSelect: (inclusionId: string) => void;
  onOpen: (inclusion: TeamInclusion) => void;
  canEdit: boolean;
  /** Carimbo "passagem emitida" — só admin/compras recebem esta ação. */
  onToggleEmitida?: (inclusion: TeamInclusion, emitida: boolean) => void;
  emitindo?: boolean;
}

const TH = "px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400";

export default function TicketsTable({
  data, filters, sortConfig, onSort, selectedTickets, allSelectableSelected, onToggleAll, onToggleSelect, onOpen, canEdit, onToggleEmitida, emitindo,
}: TicketsTableProps) {
  const rows = data.filteredTicketInclusions;

  if (rows.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <Plane className="w-7 h-7 text-blue-200" />
        </div>
        <h3 className="text-[15px] font-bold text-slate-600 mb-1">
          {filters.ticketStatus === "pending" ? "Nenhuma passagem pendente" :
           filters.ticketStatus === "processed" ? "Nenhuma passagem comprada" :
           filters.ticketStatus === "no_arrival" ? "Todas as compradas têm horário de chegada" :
           "Nenhuma passagem encontrada"}
        </h3>
        <p className="text-[13px] text-slate-400">
          {filters.ticketStatus === "pending"
            ? "Todas as passagens foram compradas ou não há colaboradores escalados."
            : filters.ticketStatus === "processed"
            ? "Nenhuma passagem foi comprada ainda."
            : filters.ticketStatus === "no_arrival"
            ? "Nenhuma passagem comprada está sem o horário de chegada da ida."
            : "Não há colaboradores escalados que necessitem de passagens."}
        </p>
      </div>
    );
  }

  const sortIcon = (field: SortField) =>
    sortConfig?.field === field ? (sortConfig.direction === "asc" ? " ▲" : " ▼") : "";
  const sortBtn = (field: SortField, label: string) => (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`hover:text-slate-600 transition-colors ${sortConfig?.field === field ? "text-slate-600" : ""}`}
      data-testid={`header-${field}`}
      title={`Ordenar por ${label.toLowerCase()}`}
    >
      {label}{sortIcon(field)}
    </button>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
          <tr>
            <th className="px-4 py-3 w-10">
              <input
                type="checkbox"
                checked={allSelectableSelected}
                disabled={data.selectableInclusionIds.size === 0}
                onChange={onToggleAll}
                aria-label="Selecionar todas as passagens pendentes"
                title="Selecionar todas as passagens pendentes"
                className="rounded border-gray-300 accent-blue-600"
                data-testid="checkbox-select-all"
              />
            </th>
            <th className={`px-3 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 w-[64px] whitespace-nowrap`}>
              {sortBtn("id", "ID")}
            </th>
            {/* Evento e Função ordenam separadamente */}
            <th className={`${TH} whitespace-nowrap`}>
              {sortBtn("event", "Evento")}<span className="mx-1 text-slate-300">/</span>{sortBtn("function", "Função")}
            </th>
            <SortableHeader field="collaborator" sortConfig={sortConfig} onSort={onSort}>Colaborador</SortableHeader>
            <th className={TH}>Destino</th>
            <SortableHeader field="diarias" sortConfig={sortConfig} onSort={onSort}>Datas e Horários</SortableHeader>
            <th className={TH}>Sugestões</th>
            <th className={`${TH} text-center`}>Status</th>
            <th className="py-3 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 text-center w-[72px]">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((inclusion, rowIdx) => (
            <TicketRow
              key={inclusion.id}
              inclusion={inclusion}
              ticket={data.getTicket(inclusion.id)}
              rowIdx={rowIdx}
              eventName={data.getEventName(inclusion.eventId)}
              functionName={data.getFunctionName(inclusion.functionId)}
              collaboratorName={data.getCollaboratorName(inclusion.collaboratorId)}
              eventLocation={data.getEventLocation(inclusion.eventId)}
              hasPendingSwap={data.pendingSwapByInclusion.has(inclusion.id)}
              hasApprovedSwap={data.approvedSwapInclusionIds.has(inclusion.id)}
              selected={selectedTickets.includes(inclusion.id)}
              canEdit={canEdit}
              locked={data.isEventLocked(inclusion)}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
              onToggleEmitida={onToggleEmitida}
              emitindo={emitindo}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
