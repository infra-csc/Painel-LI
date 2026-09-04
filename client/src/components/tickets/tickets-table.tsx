// Tabela de Passagens: cabeçalho ordenável + linhas (TicketRow) + estado vazio.
import { Plane } from "lucide-react";
import SortableHeader, { type SortConfig, type SortField } from "@/components/common/sortable-header";
import { useLarguraUtil } from "@/components/common/use-largura-util";

/**
 * Abaixo disto a tabela não cabe sem espremer coluna.
 *
 * Medido sobre as oito colunas desta lista: com menos que isto, as células de
 * datas e sugestões passam a quebrar linha no meio de um horário.
 */
const LARGURA_MINIMA_DA_TABELA = 1100;
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

// 11px/600 com tracking curto — era 10px `font-black` com 0.15em, caixa alta
// esticada e mais pesada que o próprio dado que rotulava.
const TH = "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground";

export default function TicketsTable({
  data, filters, sortConfig, onSort, selectedTickets, allSelectableSelected, onToggleAll, onToggleSelect, onOpen, canEdit, onToggleEmitida, emitindo,
}: TicketsTableProps) {
  const rows = data.filteredTicketInclusions;
  // Medido sobre a largura ÚTIL, não pela janela: o menu lateral compacto
  // muda o espaço da lista sem mudar o tamanho da tela.
  const { ref: refLargura, largura } = useLarguraUtil<HTMLDivElement>();
  const modoCartao = largura !== null && largura < LARGURA_MINIMA_DA_TABELA;

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-slate-300 rounded-xl px-8 py-11 text-center">
        <div className="flex justify-center text-slate-400 mb-2.5" aria-hidden="true">
          <Plane className="w-7 h-7" />
        </div>
        <h3 className="text-[15px] font-semibold text-slate-900 mb-1.5">
          {filters.ticketStatus === "pending" ? "Nenhuma passagem pendente" :
           filters.ticketStatus === "processed" ? "Nenhuma passagem comprada" :
           filters.ticketStatus === "no_arrival" ? "Todas as compradas têm horário de chegada" :
           "Nenhuma passagem encontrada"}
        </h3>
        <p className="mx-auto max-w-[440px] text-[13px] leading-relaxed text-muted-foreground">
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
  // Alvo de 26px: o botão de ordenar tinha a altura do texto (15px), pequeno
  // demais para acertar com o mouse.
  const sortBtn = (field: SortField, label: string) => (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`inline-flex items-center h-[26px] rounded-sm hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${sortConfig?.field === field ? "text-primary" : ""}`}
      data-testid={`header-${field}`}
      title={`Ordenar por ${label.toLowerCase()}`}
    >
      {label}{sortIcon(field)}
    </button>
  );

  const ordemLabel = sortConfig
    ? ({ id: "nº da inclusão", event: "evento", function: "função", collaborator: "colaborador", diarias: "datas" } as Record<string, string>)[sortConfig.field] ?? sortConfig.field
    : "evento e função";

  return (
    <>
      {/*
        Abaixo do limiar, cada célula vira uma faixa de largura cheia com o
        próprio rótulo. Antes só a linha de cabeçalho saía do DOM: as células
        mantinham a largura de coluna e apenas embrulhavam, sobrando metade da
        linha vazia e deixando "12/09 06:40 → 09:15" sem dizer o que era.

        Feito em CSS sobre a MESMA árvore de células — nenhum dado é
        re-renderizado de outro jeito, então nada pode se perder no caminho.
      */}
      <style>{`
        .passagens-cartao thead { display: none; }
        .passagens-cartao table,
        .passagens-cartao tbody,
        .passagens-cartao tr,
        .passagens-cartao td { display: block; width: 100%; }
        .passagens-cartao tr {
          padding: 4px 0 10px;
          border-bottom: 1px solid var(--border);
        }
        .passagens-cartao td { padding: 4px 14px; text-align: left !important; }
        .passagens-cartao td[data-rotulo]::before {
          content: attr(data-rotulo);
          display: block;
          margin-bottom: 2px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: #94A3B8;
        }
        /* A caixa de seleção divide a primeira faixa com o ID. */
        .passagens-cartao td:first-child { display: inline-block; width: auto; vertical-align: middle; }
        .passagens-cartao td:nth-child(2) { display: inline-block; width: auto; vertical-align: middle; }
      `}</style>
      <div ref={refLargura} className={`overflow-x-auto ${modoCartao ? "passagens-cartao" : ""}`}>
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
            <th className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground w-[64px] whitespace-nowrap`}>
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
            <th className="py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-center w-[72px]">Ações</th>
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

      {/* Rodapé: o que está na tela e o que a cor da borda esquerda quer dizer.
          Um marcador colorido sem legenda é charada, não sinal. */}
      <div className="flex items-center gap-3 h-10 px-4 bg-background border-t border-border">
        <span className="text-[12px] text-[#475569] tabular-nums whitespace-nowrap">
          Mostrando {rows.length} {rows.length === 1 ? "vaga" : "vagas"} · ordenado por {ordemLabel}
        </span>
        <span className="flex items-center gap-3 ml-auto text-[11px] text-muted-foreground whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-[3px] h-[11px] rounded-full bg-[#F97316]" />espera você
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-[3px] h-[11px] rounded-full bg-[#F59E0B]" />troca em análise
          </span>
        </span>
      </div>
    </>
  );
}
