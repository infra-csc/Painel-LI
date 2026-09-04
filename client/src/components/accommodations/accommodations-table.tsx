/**
 * A lista de Hospedagem.
 *
 * O que mudou em relação à versão anterior é forma, não conteúdo: os filtros
 * saíram daqui para uma linha própria acima do card, a zebra saiu (além de
 * ruído, escondia o fundo da coluna congelada), as pílulas ganharam altura de
 * clique e o rodapé passou a explicar os marcadores de 3px em vez de deixá-los
 * como código de cor sem legenda.
 *
 * Toda célula que existia continua aqui — ID, evento, colaborador e função,
 * check-in e check-out com hora, hotel e localização, situação, troca pendente
 * e as ações de ver e registrar.
 */
import { Hotel, Eye, BedDouble, ArrowDown, ArrowUp } from "lucide-react";
import SortableHeader from "@/components/common/sortable-header";
import { Button } from "@/components/ui/button";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import type { TeamInclusion, Event, Function, Collaborator, Accommodation } from "@shared/schema";
import type { AccSortConfig, AccSortField } from "./types";
import { formatDate, initials, toTitleCase } from "./utils";

export interface AccommodationsTableProps {
  rows: TeamInclusion[];
  accommodationMap: Map<string, Accommodation>;
  eventById: Map<string, Event>;
  functionById: Map<string, Function>;
  collaboratorById: Map<string, Collaborator>;
  pendingSwapByInclusion: Set<string>;
  sortConfig: AccSortConfig | null;
  onSort: (field: AccSortField) => void;
  selectedIds: string[];
  selectableIds: Set<string>;
  allSelectableSelected: boolean;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  canEdit: boolean;
  onOpen: (inclusion: TeamInclusion) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  /** Total sem recorte, para o rodapé dizer "N de M". */
  total: number;
  /** Como a lista está ordenada agora, em palavras. */
  ordenacao: string;
}

/**
 * Abaixo disto a tabela não cabe sem espremer coluna.
 *
 * Medido sobre as colunas desta lista: com menos que isto, o par de datas e o
 * nome do hotel passam a quebrar no meio.
 */
const LARGURA_MINIMA_DA_TABELA = 1000;

const TH = "px-3.5 py-2.5 text-[11px] font-bold tracking-[0.12em] text-[#64748B] uppercase";
/** Alvo de 40×40 para a caixa: margem não amplia área de clique, e padding em checkbox nativo não funciona. */
const ALVO_DA_CAIXA = "inline-flex items-center justify-center w-10 h-10 -m-2 cursor-pointer";
const CAIXA = "w-4 h-4 cursor-pointer accent-primary";
/** Pílulas: 22px de altura, 7px de padding lateral, 11px/500 — legíveis e clicáveis. */
const PILULA = "inline-flex items-center gap-1.5 h-[22px] px-[7px] rounded-md text-[11px] font-medium whitespace-nowrap";

export default function AccommodationsTable({
  rows, accommodationMap, eventById, functionById, collaboratorById, pendingSwapByInclusion,
  sortConfig, onSort, selectedIds, selectableIds, allSelectableSelected, onToggleRow, onToggleAll,
  canEdit, onOpen, hasActiveFilters, onClearFilters, total, ordenacao,
}: AccommodationsTableProps) {
  const { ref: refLargura, largura } = useLarguraUtil<HTMLDivElement>();
  const modoCartao = largura !== null && largura < LARGURA_MINIMA_DA_TABELA;
  const selecionadas = new Set(selectedIds);

  return (
    <div className="bg-card rounded-[14px] border border-border shadow-[0_1px_2px_rgba(15,23,42,.05)] overflow-hidden">
      {/*
        Abaixo do limiar, cada célula vira uma faixa de largura cheia com o
        próprio rótulo — em CSS, sobre a MESMA árvore de células. Nada é
        re-renderizado de outro jeito, então nenhum dado pode se perder no
        caminho entre os dois modos.
      */}
      <style>{`
        .hospedagem-cartao thead { display: none; }
        .hospedagem-cartao table,
        .hospedagem-cartao tbody,
        .hospedagem-cartao tr,
        .hospedagem-cartao td { display: block; width: 100%; }
        .hospedagem-cartao tr { padding: 6px 0 12px; border-bottom: 1px solid var(--border); }
        .hospedagem-cartao td { padding: 4px 14px; text-align: left !important; }
        .hospedagem-cartao td[data-rotulo]::before {
          content: attr(data-rotulo);
          display: block;
          margin-bottom: 2px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: #64748B;
        }
        /* A caixa de seleção divide a primeira faixa com o #ID. */
        .hospedagem-cartao td:nth-child(1),
        .hospedagem-cartao td:nth-child(2) { display: inline-block; width: auto; vertical-align: middle; }
        /* Check-in e check-out são duas datas curtas, lidas em par. */
        .hospedagem-cartao td:nth-child(5),
        .hospedagem-cartao td:nth-child(6) { display: inline-block; width: auto; min-width: 132px; }
        /* Célula sem dado não abre faixa: um rótulo seguido de travessão é
           altura gasta para dizer que não há nada a dizer. Vem por último de
           propósito — empata em especificidade com as regras acima, e nesse
           empate quem vence é a última. */
        .hospedagem-cartao td[data-vazio="sim"] { display: none; }
        /* No cartão sobra largura: o nome do evento não tem por que continuar
           preso aos 200px que a coluna da tabela lhe dava. */
        .hospedagem-cartao td:nth-child(3) { max-width: none; }
        .hospedagem-cartao td:nth-child(3) p { overflow: visible; text-overflow: clip; white-space: normal; }
      `}</style>

      <div ref={refLargura} className={`overflow-x-auto ${modoCartao ? "hospedagem-cartao" : ""}`}>
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#F8FAFC] border-b border-border">
            <tr>
              <th className="px-3.5 py-2.5 w-11 text-center">
                <label className={ALVO_DA_CAIXA} title="Selecionar todas as pendentes">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todas as hospedagens pendentes"
                    className={CAIXA}
                    checked={allSelectableSelected}
                    disabled={selectableIds.size === 0}
                    onChange={onToggleAll}
                    data-testid="checkbox-select-all"
                  />
                </label>
              </th>
              <SortableHeader field="id" sortConfig={sortConfig} onSort={onSort} className="!px-3.5 !py-2.5 !text-[11px] !tracking-[0.12em] !text-[#64748B] !font-bold">ID</SortableHeader>
              <SortableHeader field="event" sortConfig={sortConfig} onSort={onSort} className="!px-3.5 !py-2.5 !text-[11px] !tracking-[0.12em] !text-[#64748B] !font-bold">Evento</SortableHeader>
              <SortableHeader field="collaborator" sortConfig={sortConfig} onSort={onSort} className="!px-3.5 !py-2.5 !text-[11px] !tracking-[0.12em] !text-[#64748B] !font-bold">Colaborador / Função</SortableHeader>
              <SortableHeader field="date" sortConfig={sortConfig} onSort={onSort} className="!px-3.5 !py-2.5 !text-[11px] !tracking-[0.12em] !text-[#64748B] !font-bold w-[112px]">Check-in</SortableHeader>
              <th scope="col" className={`${TH} w-[112px]`}>Check-out</th>
              <SortableHeader field="hotelName" sortConfig={sortConfig} onSort={onSort} className="!px-3.5 !py-2.5 !text-[11px] !tracking-[0.12em] !text-[#64748B] !font-bold w-[190px]">Hotel</SortableHeader>
              <th scope="col" className={TH}>Situação</th>
              <th scope="col" className={`${TH} text-center w-[72px]`}>Ações</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {rows.map((inclusion) => {
              const event = eventById.get(inclusion.eventId);
              const func = functionById.get(inclusion.functionId);
              const collaborator = inclusion.collaboratorId ? collaboratorById.get(inclusion.collaboratorId) : undefined;
              const accommodation = accommodationMap.get(inclusion.id);
              const hasAccommodation = !!accommodation;
              const isCanceled = inclusion.status === "cancelado";
              const displayName = toTitleCase(collaborator?.fullName);
              const hasPendingSwap = pendingSwapByInclusion.has(inclusion.id);
              const isSelected = selecionadas.has(inclusion.id);
              const canSelect = selectableIds.has(inclusion.id);
              const nomeDoEvento = event?.name || "—";
              const nomeDaFuncao = func?.name || "—";

              // Só dois marcadores, os dois da legenda do rodapé: o que espera
              // você e o que espera decisão de troca. Registrada não pinta nada
              // — trabalho feito não precisa chamar atenção.
              const marcador = isSelected ? "border-l-primary"
                : hasPendingSwap && !isCanceled ? "border-l-[#F59E0B]"
                : !hasAccommodation && !isCanceled ? "border-l-[#F97316]"
                : "border-l-transparent";

              return (
                <tr
                  key={inclusion.id}
                  data-testid={`accommodation-row-${inclusion.inclusionNumber}`}
                  className={`transition-colors border-l-[3px] ${marcador} ${
                    isSelected ? "bg-brand-soft" : "hover:bg-[#F8FAFC]"
                  } ${isCanceled ? "opacity-60" : ""}`}
                >
                  {/* Seleção */}
                  <td className="px-3.5 py-3 w-11 text-center" data-vazio={canSelect ? "nao" : "sim"}>
                    {canSelect && (
                      <label className={ALVO_DA_CAIXA}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleRow(inclusion.id)}
                          aria-label={`Selecionar hospedagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
                          className={CAIXA}
                          data-testid={`checkbox-batch-${inclusion.inclusionNumber}`}
                        />
                      </label>
                    )}
                  </td>

                  {/* ID */}
                  <td className="px-3.5 py-3 w-16">
                    <span className="inline-block bg-brand-soft text-primary text-[13px] font-semibold rounded-md px-2 py-1 whitespace-nowrap tabular-nums">
                      #{inclusion.inclusionNumber || "N/A"}
                    </span>
                  </td>

                  {/* Evento */}
                  <td className="px-3.5 py-3 max-w-[200px]" data-testid={`accommodation-event-${inclusion.inclusionNumber}`}>
                    <p className="text-[14px] font-semibold text-slate-900 truncate" title={nomeDoEvento}>{nomeDoEvento}</p>
                  </td>

                  {/* Colaborador / Função */}
                  <td className="px-3.5 py-3" data-testid={`accommodation-collaborator-${inclusion.inclusionNumber}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-soft text-primary flex items-center justify-center text-[11px] font-bold shrink-0" aria-hidden="true">
                        {collaborator ? initials(displayName) : "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-slate-900 leading-tight truncate" title={displayName || undefined}>
                          {displayName || <span className="text-[#64748B]">Sem colaborador</span>}
                        </p>
                        <p className="text-[12px] text-[#64748B] mt-0.5 truncate" title={nomeDaFuncao}>{nomeDaFuncao}</p>
                      </div>
                    </div>
                  </td>

                  {/* Check-in */}
                  <td
                    className="px-3.5 py-3 w-[112px]"
                    data-rotulo="Check-in"
                    data-vazio={accommodation?.checkInDate ? "nao" : "sim"}
                    data-testid={`accommodation-checkin-${inclusion.inclusionNumber}`}
                  >
                    {accommodation?.checkInDate ? (
                      <div>
                        <div className="text-[10px] font-bold text-[#15803D] uppercase tracking-[0.06em] mb-0.5 flex items-center gap-0.5">
                          <ArrowDown className="w-2.5 h-2.5" aria-hidden="true" /> In
                        </div>
                        <div className="text-[13px] font-medium text-slate-900 tabular-nums">{formatDate(accommodation.checkInDate)}</div>
                        {accommodation.checkInTime && <div className="text-[13px] font-bold text-primary mt-0.5 tabular-nums">{accommodation.checkInTime}</div>}
                      </div>
                    ) : <span className="text-[#94A3B8]">—</span>}
                  </td>

                  {/* Check-out */}
                  <td
                    className="px-3.5 py-3 w-[112px]"
                    data-rotulo="Check-out"
                    data-vazio={accommodation?.checkOutDate ? "nao" : "sim"}
                    data-testid={`accommodation-checkout-${inclusion.inclusionNumber}`}
                  >
                    {accommodation?.checkOutDate ? (
                      <div>
                        <div className="text-[10px] font-bold text-[#92400E] uppercase tracking-[0.06em] mb-0.5 flex items-center gap-0.5">
                          <ArrowUp className="w-2.5 h-2.5" aria-hidden="true" /> Out
                        </div>
                        <div className="text-[13px] font-medium text-slate-900 tabular-nums">{formatDate(accommodation.checkOutDate)}</div>
                        {accommodation.checkOutTime && <div className="text-[13px] font-bold text-primary mt-0.5 tabular-nums">{accommodation.checkOutTime}</div>}
                      </div>
                    ) : <span className="text-[#94A3B8]">—</span>}
                  </td>

                  {/* Hotel */}
                  <td className="px-3.5 py-3 w-[190px]" data-rotulo="Hotel" data-testid={`accommodation-hotel-${inclusion.inclusionNumber}`}>
                    {accommodation?.hotelName ? (
                      <div className="flex items-start gap-2">
                        <BedDouble className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-slate-900 truncate" title={accommodation.hotelName}>{accommodation.hotelName}</p>
                          {accommodation.hotelLocation && (
                            <p className="text-[12px] text-[#64748B] mt-0.5 truncate" title={accommodation.hotelLocation}>{accommodation.hotelLocation}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      // "Não informado" em itálico cinza-claro lia como erro do
                      // sistema; é só trabalho que ainda não foi feito.
                      <span className="text-[13px] text-[#64748B]">Hotel a definir</span>
                    )}
                  </td>

                  {/* Situação */}
                  <td className="px-3.5 py-3" data-testid={`accommodation-status-${inclusion.inclusionNumber}`}>
                    <div className="flex flex-col items-start gap-1">
                      {isCanceled ? (
                        <span className={`${PILULA} bg-slate-100 text-[#64748B]`}>Cancelado</span>
                      ) : hasAccommodation ? (
                        <span className={`${PILULA} bg-[#DCFCE7] text-[#15803D]`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] shrink-0" aria-hidden="true" />Registrada
                        </span>
                      ) : (
                        <span className={`${PILULA} bg-[#FEF9C3] text-[#854D0E]`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F97316] shrink-0" aria-hidden="true" />Pendente
                        </span>
                      )}
                      {hasPendingSwap && !isCanceled && (
                        <span
                          className={`${PILULA} bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]`}
                          data-testid={`badge-swap-pending-${inclusion.inclusionNumber}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] shrink-0 animate-pulse" aria-hidden="true" />Troca pendente
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Ações */}
                  <td className="px-2 py-3 text-center w-[72px]" data-vazio={isCanceled ? "sim" : "nao"}>
                    {!isCanceled && (hasAccommodation ? (
                      <button
                        type="button"
                        onClick={() => onOpen(inclusion)}
                        data-testid={`view-accommodation-${inclusion.inclusionNumber}`}
                        title="Visualizar hospedagem"
                        aria-label={`Visualizar hospedagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
                        className="w-10 h-10 rounded-full text-[#64748B] hover:bg-brand-soft hover:text-primary inline-flex items-center justify-center transition-colors"
                      >
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      </button>
                    ) : canEdit ? (
                      <button
                        type="button"
                        onClick={() => onOpen(inclusion)}
                        data-testid={`buy-accommodation-${inclusion.inclusionNumber}`}
                        title="Registrar hospedagem"
                        aria-label={`Registrar hospedagem da inclusão #${inclusion.inclusionNumber ?? ""}`}
                        className="w-10 h-10 rounded-lg bg-brand-soft text-primary hover:bg-primary hover:text-white inline-flex items-center justify-center transition-colors"
                      >
                        <BedDouble className="w-4 h-4" aria-hidden="true" />
                      </button>
                    ) : null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="m-4 flex flex-col items-center gap-2 text-center py-10 rounded-xl border border-dashed border-border" data-testid="no-accommodations">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Hotel className="w-6 h-6 text-[#64748B]" aria-hidden="true" />
            </div>
            {hasActiveFilters ? (
              <>
                <p className="text-[15px] font-semibold text-slate-700">Nenhuma hospedagem neste recorte</p>
                <p className="text-[13px] text-[#64748B]">Os filtros de agora não devolveram nenhuma vaga. Ajuste ou limpe para ver as demais.</p>
                <Button variant="outline" size="sm" className="mt-1 rounded-lg" onClick={onClearFilters} data-testid="button-clear-filters-empty">
                  Limpar filtros
                </Button>
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold text-slate-700">Nenhuma inclusão com hospedagem</p>
                <p className="text-[13px] text-[#64748B]">Inclusões que precisam de hospedagem aparecem aqui assim que forem escaladas.</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Rodapé: o que está na tela e o que as duas cores da borda querem dizer. */}
      <div className="h-10 px-4 bg-[#F8FAFC] border-t border-border flex items-center gap-4 flex-wrap">
        <p className="text-[12px] text-[#64748B] tabular-nums" data-testid="rodape-contagem">
          Mostrando {rows.length} de {total} {total === 1 ? "vaga" : "vagas"} · {ordenacao}
        </p>
        <div className="ml-auto flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#64748B]">
            <span className="w-[3px] h-3.5 rounded-sm bg-[#F97316]" aria-hidden="true" />espera você
          </span>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#64748B]">
            <span className="w-[3px] h-3.5 rounded-sm bg-[#F59E0B]" aria-hidden="true" />troca em análise
          </span>
        </div>
      </div>
    </div>
  );
}
