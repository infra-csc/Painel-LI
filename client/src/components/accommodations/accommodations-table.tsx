import { Hotel, Eye, BedDouble, Search, X, ArrowDown, ArrowUp } from "lucide-react";
import SortableHeader from "@/components/common/sortable-header";
import EventCombobox from "@/components/ui/event-combobox";
import CollaboratorCombobox from "@/components/ui/collaborator-combobox";
import FunctionMultiSelect from "@/components/ui/function-multi-select";
import { Button } from "@/components/ui/button";
import type { TeamInclusion, Event, Function, Collaborator, Accommodation } from "@shared/schema";
import type { AccommodationFilters, AccSortConfig, AccSortField, AccommodationStatusFilter, InclusionStatusFilter } from "./types";
import { formatDate, initials, toTitleCase } from "./utils";

export interface AccommodationsTableProps {
  rows: TeamInclusion[];
  events: Event[] | undefined;
  functions: Function[] | undefined;
  collaborators: Collaborator[] | undefined;
  accommodationMap: Map<string, Accommodation>;
  eventById: Map<string, Event>;
  functionById: Map<string, Function>;
  collaboratorById: Map<string, Collaborator>;
  pendingSwapByInclusion: Set<string>;
  filters: AccommodationFilters;
  onFiltersChange: (patch: Partial<AccommodationFilters>) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  sortConfig: AccSortConfig | null;
  onSort: (field: AccSortField) => void;
  /** Modo lote ligado: mostra a coluna de checkbox. */
  batchMode: boolean;
  selectedIds: string[];
  selectableIds: Set<string>;
  allSelectableSelected: boolean;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  canEdit: boolean;
  onOpen: (inclusion: TeamInclusion) => void;
  counts: { total: number; purchased: number; pending: number };
}

const TH = "px-3 py-3 text-[10px] font-bold tracking-[0.12em] text-slate-400 uppercase";
const SELECT = "h-8 px-2 pr-7 bg-white border border-gray-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring transition-all";
const CHECKBOX = "w-4 h-4 cursor-pointer accent-primary";

/** Barra de filtros + tabela + rodapé da tela de Hospedagens. */
export default function AccommodationsTable({
  rows, events, functions, collaborators, accommodationMap, eventById, functionById, collaboratorById, pendingSwapByInclusion,
  filters, onFiltersChange, onClearFilters, hasActiveFilters, sortConfig, onSort,
  batchMode, selectedIds, selectableIds, allSelectableSelected, onToggleRow, onToggleAll, canEdit, onOpen, counts,
}: AccommodationsTableProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Barra de filtros */}
      <div className="px-5 py-3 border-b border-gray-100 bg-slate-50/60 flex flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            placeholder="Nome ou número..."
            aria-label="Buscar por nome ou número da inclusão"
            value={filters.searchId}
            onChange={(e) => onFiltersChange({ searchId: e.target.value })}
            className="h-8 pl-8 pr-3 w-44 bg-white border border-gray-200 rounded-lg text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring transition-all"
            data-testid="input-search-id"
          />
        </div>
        <div className="w-44">
          <EventCombobox events={events?.filter((e) => e.status !== "excluido" && e.status !== "excluído")}
            value={filters.eventId} onValueChange={(v) => onFiltersChange({ eventId: v })} placeholder="Evento" testId="filter-event" />
        </div>
        <div className="w-44">
          <FunctionMultiSelect functions={functions} selectedIds={filters.functionId}
            onSelectedChange={(v) => onFiltersChange({ functionId: v })} placeholder="Funções" testId="filter-function" />
        </div>
        <div className="w-44">
          <CollaboratorCombobox collaborators={collaborators} value={filters.collaboratorId}
            onValueChange={(v) => onFiltersChange({ collaboratorId: v })} placeholder="Colaborador" testId="filter-collaborator" />
        </div>
        <select value={filters.accommodationStatus} aria-label="Status da hospedagem"
          onChange={(e) => onFiltersChange({ accommodationStatus: e.target.value as AccommodationStatusFilter })}
          className={SELECT} data-testid="filter-status">
          <option value="all">Todos os status</option>
          <option value="pending">Pendentes</option>
          <option value="processed">Registradas</option>
        </select>
        <select value={filters.inclusionStatus} aria-label="Status da inclusão"
          onChange={(e) => onFiltersChange({ inclusionStatus: e.target.value as InclusionStatusFilter })}
          className={SELECT} data-testid="filter-inclusion-status">
          <option value="active">Inclusões ativas</option>
          <option value="all">Todas</option>
          <option value="cancelado">Canceladas</option>
        </select>
        <div className="flex-1" />
        <span className="text-[11px] text-slate-400 font-medium bg-white border border-gray-200 px-2.5 py-1 rounded-lg">
          {rows.length} registro{rows.length !== 1 ? "s" : ""}
        </span>
        <button type="button" onClick={onClearFilters} data-testid="button-clear-filters"
          className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-slate-500 border border-gray-200 hover:border-red-200 hover:text-red-500 hover:bg-red-50 rounded-lg bg-white transition-colors">
          <X className="w-3.5 h-3.5" /> Limpar
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b-2 border-slate-200">
            <tr>
              {batchMode && (
                <th className="px-3 py-3 w-11 text-center">
                  <input type="checkbox" title="Selecionar todos pendentes" aria-label="Selecionar todas as hospedagens pendentes"
                    className={CHECKBOX} checked={allSelectableSelected} disabled={selectableIds.size === 0} onChange={onToggleAll} />
                </th>
              )}
              <SortableHeader field="id" sortConfig={sortConfig} onSort={onSort} className="!px-3 !py-3">ID</SortableHeader>
              <SortableHeader field="event" sortConfig={sortConfig} onSort={onSort} className="!px-4 !py-3 !tracking-[0.12em]">Evento</SortableHeader>
              <SortableHeader field="collaborator" sortConfig={sortConfig} onSort={onSort} className="!px-4 !py-3 !tracking-[0.12em]">Colaborador / Função</SortableHeader>
              <th scope="col" className={`${TH} w-[110px]`}>Check-in</th>
              <th scope="col" className={`${TH} w-[110px]`}>Check-out</th>
              <SortableHeader field="hotelName" sortConfig={sortConfig} onSort={onSort} className="!px-3.5 !py-3 !tracking-[0.12em] w-[180px]">Hotel</SortableHeader>
              <th scope="col" className={`${TH} px-4`}>Status</th>
              <th scope="col" className={`${TH} px-2 text-center w-[72px]`}>Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((inclusion, idx) => {
              const event = eventById.get(inclusion.eventId);
              const func = functionById.get(inclusion.functionId);
              const collaborator = inclusion.collaboratorId ? collaboratorById.get(inclusion.collaboratorId) : undefined;
              const accommodation = accommodationMap.get(inclusion.id);
              const hasAccommodation = !!accommodation;
              const isCanceled = inclusion.status === "cancelado";
              const displayName = toTitleCase(collaborator?.fullName);
              const hasPendingSwap = pendingSwapByInclusion.has(inclusion.id);
              const isSelected = selectedIds.includes(inclusion.id);
              const canSelect = !isCanceled && !hasAccommodation;
              const border = isSelected ? "border-l-primary"
                : hasPendingSwap ? "border-l-amber-500"
                : isCanceled ? "border-l-slate-200"
                : hasAccommodation ? "border-l-green-500" : "border-l-orange-500";
              const bg = isSelected ? "bg-brand-soft" : idx % 2 === 1 ? "bg-slate-50/50 hover:bg-slate-100" : "bg-white hover:bg-slate-100";

              return (
                <tr key={inclusion.id} data-testid={`accommodation-row-${inclusion.inclusionNumber}`}
                  className={`transition-colors border-l-[3px] ${border} ${bg} ${isCanceled ? "opacity-60" : ""}`}>
                  {batchMode && (
                    <td className="px-3 py-3 w-11 text-center">
                      {canSelect && (
                        <input type="checkbox" checked={isSelected} onChange={() => onToggleRow(inclusion.id)}
                          aria-label={`Selecionar hospedagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
                          className={CHECKBOX} data-testid={`checkbox-batch-${inclusion.inclusionNumber}`} />
                      )}
                    </td>
                  )}
                  {/* ID */}
                  <td className="px-3 py-3 w-16">
                    <span className="inline-block bg-brand-soft text-primary text-[13px] font-semibold rounded-md px-2 py-1 whitespace-nowrap">
                      #{inclusion.inclusionNumber || "N/A"}
                    </span>
                  </td>
                  {/* Evento */}
                  <td className="px-4 py-3 max-w-[180px]" data-testid={`accommodation-event-${inclusion.inclusionNumber}`}>
                    <p className="text-sm font-semibold text-slate-900 truncate max-w-[172px]">{event?.name || "—"}</p>
                  </td>
                  {/* Colaborador / Função */}
                  <td className="px-4 py-3" data-testid={`accommodation-collaborator-${inclusion.inclusionNumber}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-soft text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                        {collaborator ? initials(displayName) : "?"}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 leading-tight">{displayName || <span className="text-slate-300">Sem colaborador</span>}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{func?.name || "—"}</p>
                      </div>
                    </div>
                  </td>
                  {/* Check-in */}
                  <td className="px-3 py-3 w-[110px]" data-testid={`accommodation-checkin-${inclusion.inclusionNumber}`}>
                    {accommodation?.checkInDate ? (
                      <div>
                        <div className="text-[10px] font-bold text-green-600 uppercase tracking-[0.06em] mb-0.5 flex items-center gap-0.5"><ArrowDown className="w-2.5 h-2.5" /> In</div>
                        <div className="text-[13px] font-medium text-slate-900">{formatDate(accommodation.checkInDate)}</div>
                        {accommodation.checkInTime && <div className="text-[13px] font-bold text-primary mt-0.5">{accommodation.checkInTime}</div>}
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  {/* Check-out */}
                  <td className="px-3 py-3 w-[110px]" data-testid={`accommodation-checkout-${inclusion.inclusionNumber}`}>
                    {accommodation?.checkOutDate ? (
                      <div>
                        <div className="text-[10px] font-bold text-amber-600 uppercase tracking-[0.06em] mb-0.5 flex items-center gap-0.5"><ArrowUp className="w-2.5 h-2.5" /> Out</div>
                        <div className="text-[13px] font-medium text-slate-900">{formatDate(accommodation.checkOutDate)}</div>
                        {accommodation.checkOutTime && <div className="text-[13px] font-bold text-primary mt-0.5">{accommodation.checkOutTime}</div>}
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  {/* Hotel */}
                  <td className="px-3.5 py-3 w-[180px]" data-testid={`accommodation-hotel-${inclusion.inclusionNumber}`}>
                    {accommodation?.hotelName ? (
                      <div className="flex items-start gap-2">
                        <BedDouble className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <div className="overflow-hidden">
                          <p className="text-sm font-semibold text-slate-900 truncate max-w-[148px]">{accommodation.hotelName}</p>
                          {accommodation.hotelLocation && <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[148px]">{accommodation.hotelLocation}</p>}
                        </div>
                      </div>
                    ) : <span className="text-slate-300 text-[13px] italic">Não informado</span>}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3" data-testid={`accommodation-status-${inclusion.inclusionNumber}`}>
                    <div className="flex flex-col items-start gap-1">
                      {isCanceled ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-400 text-[10px] font-bold tracking-[0.06em]">Cancelado</span>
                      ) : hasAccommodation ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-100 text-green-700 text-[10px] font-bold tracking-[0.06em]">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />Registrada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-yellow-100 text-yellow-800 text-[10px] font-bold tracking-[0.06em]">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />Pendente
                        </span>
                      )}
                      {/* Badge "Troca pendente" na coluna Status — antes ficava escondido embaixo da função. */}
                      {hasPendingSwap && !isCanceled && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200" data-testid={`badge-swap-pending-${inclusion.inclusionNumber}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                          <span className="text-[10px] font-medium text-amber-700">Troca pendente</span>
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Ações */}
                  <td className="px-2 py-3 text-center w-[72px]">
                    {!isCanceled && (hasAccommodation ? (
                      <button type="button" onClick={() => onOpen(inclusion)} data-testid={`view-accommodation-${inclusion.inclusionNumber}`}
                        title="Visualizar hospedagem" aria-label={`Visualizar hospedagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
                        className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:bg-brand-soft hover:text-primary inline-flex items-center justify-center transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                    ) : canEdit ? (
                      <button type="button" onClick={() => onOpen(inclusion)} data-testid={`buy-accommodation-${inclusion.inclusionNumber}`}
                        title="Registrar hospedagem" aria-label={`Registrar hospedagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
                        className="w-8 h-8 rounded-lg bg-brand-soft text-primary hover:bg-primary hover:text-white inline-flex items-center justify-center transition-colors">
                        <BedDouble className="w-4 h-4" />
                      </button>
                    ) : null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 text-center py-12 text-slate-400 text-sm" data-testid="no-accommodations">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Hotel className="w-6 h-6 text-slate-400" />
            </div>
            {hasActiveFilters ? (
              <>
                <p className="font-semibold text-slate-600">Nenhuma hospedagem corresponde aos filtros</p>
                <p className="text-xs text-slate-400">Ajuste ou limpe os filtros para ver as demais inclusões.</p>
                <Button variant="outline" size="sm" className="mt-1 rounded-lg" onClick={onClearFilters} data-testid="button-clear-filters-empty">
                  Limpar filtros
                </Button>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-600">Nenhuma inclusão com hospedagem</p>
                <p className="text-xs text-slate-400">Inclusões que precisam de hospedagem aparecerão aqui assim que forem escaladas.</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em]">
          Exibindo {rows.length} {rows.length === 1 ? "resultado" : "resultados"}
        </p>
        <span className="text-[11px] text-slate-400 font-semibold">
          {counts.purchased} registradas · {counts.pending} pendentes
        </span>
      </div>
    </div>
  );
}

