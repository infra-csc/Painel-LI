/**
 * A lista de Hospedagem.
 *
 * 07/10 (redesenho): a MESMA tabela de Passagens (tickets-table.tsx) —
 *  - nove colunas de largura-guia (`table-fixed` + colgroup): em 1366 com o
 *    menu aberto a lista cabe inteira; antes a "Situação" e as "Ações" saíam
 *    pela direita e a tabela rolava de lado;
 *  - Função em coluna própria (era a segunda linha do colaborador) e check-in /
 *    check-out lidos juntos na coluna "Estadia", com as diárias;
 *  - cabeçalho grudado abaixo da barra da tela ao rolar;
 *  - só as linhas à vista vão para o DOM (centenas de vagas na fila de Compras);
 *  - abaixo de 960px úteis a MESMA árvore de células vira cartão por CSS
 *    (`.pas-cartao.hos-cartao`) — nada é renderizado de outro jeito, então
 *    nenhum dado se perde entre os dois modos;
 *  - rodapé com a contagem, a ordenação e a legenda das cores da borda.
 *
 * Toda célula que existia continua aqui — ID, evento, colaborador e função,
 * check-in e check-out com hora, hotel e localização, situação, troca pendente
 * e aprovada e as ações de ver e registrar.
 */
import { useCallback, useMemo, useRef } from "react";
import { Hotel, SearchX, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { EspacadorLinha, useLinhasVirtuaisNaJanela } from "@/components/common/virtual-rows";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import type { TeamInclusion, Event, Function, Collaborator, Accommodation } from "@shared/schema";
import type { AccSortConfig, AccSortField, AccommodationFilters } from "./types";
import { toTitleCase } from "./utils";
import AccommodationRow from "./accommodation-row";
import { dataDeChegada, diasAte, ehUrgente, type BlocoDaFila, type ContextoDaFila } from "./accommodations-queue";

export interface AccommodationsTableProps {
  rows: TeamInclusion[];
  accommodationMap: Map<string, Accommodation>;
  eventById: Map<string, Event>;
  functionById: Map<string, Function>;
  collaboratorById: Map<string, Collaborator>;
  pendingSwapByInclusion: Set<string>;
  /** Vagas com troca de colaborador aprovada — etiqueta para Compras (15/09). */
  approvedSwapInclusionIds?: Set<string>;
  /** Vagas com alteração aprovada esperando Compras rever a hospedagem (07/10). */
  vagasComAlteracao?: ReadonlySet<string> | ReadonlyMap<string, unknown>;
  /** Contexto da fila — a urgência da chegada aparece na linha (bloco Urgente). */
  ctxFila: ContextoDaFila;
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
  /** O vazio diz o que o recorte procurava (bloco da fila / status). */
  bloco?: BlocoDaFila | null;
  statusDaHospedagem?: AccommodationFilters["accommodationStatus"];
  /** Há filtro da barra ligado (além do bloco)? Só então o vazio culpa os filtros. */
  filtrosDaBarra?: boolean;
}

/**
 * Abaixo disto a tabela não cabe sem espremer coluna e vira cartão.
 *
 * O mesmo limiar de Passagens: com menos que isto, datas e horários passam a
 * quebrar no meio e os nomes viram três linhas.
 */
const LARGURA_MINIMA_DA_TABELA = 960;

// 11px/600 com tracking curto — o mesmo cabeçalho de Passagens.
const TH = "px-2.5 py-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground text-left";

/** "chega em 3 dias" / "chegou ontem" — a urgência dita em palavras. */
function urgenciaEmPalavras(dias: number): string {
  if (dias === 0) return "chega hoje";
  if (dias === 1) return "chega amanhã";
  if (dias === -1) return "chegou ontem";
  return dias > 0 ? `chega em ${dias} dias` : `chegou há ${-dias} dias`;
}

const VAZIO: Record<string, { titulo: string; texto: string }> = {
  reservar: { titulo: "Nenhuma hospedagem para reservar", texto: "Todas as vagas deste recorte já têm hotel registrado." },
  urgente: { titulo: "Nada urgente por aqui", texto: "Nenhuma vaga sem hotel chega nesta semana — nem ficou para trás nos últimos dias." },
  troca: { titulo: "Nenhuma troca aguardando análise", texto: "Quando a área pedir troca numa vaga com hotel registrado, ela aparece aqui." },
  registradas: { titulo: "Nenhuma hospedagem registrada", texto: "As reservas registradas neste recorte aparecem aqui." },
  pending: { titulo: "Nenhuma hospedagem pendente", texto: "Todas as vagas deste recorte já têm hotel registrado." },
  processed: { titulo: "Nenhuma hospedagem registrada", texto: "As reservas registradas neste recorte aparecem aqui." },
};

export default function AccommodationsTable({
  rows, accommodationMap, eventById, functionById, collaboratorById, pendingSwapByInclusion, approvedSwapInclusionIds,
  vagasComAlteracao, ctxFila, sortConfig, onSort, selectedIds, selectableIds, allSelectableSelected, onToggleRow, onToggleAll,
  canEdit, onOpen, hasActiveFilters, onClearFilters, total, ordenacao, bloco, statusDaHospedagem, filtrosDaBarra,
}: AccommodationsTableProps) {
  // Medido sobre a largura ÚTIL, não pela janela: o menu lateral compacto
  // muda o espaço da lista sem mudar o tamanho da tela.
  const { ref: refLargura, largura } = useLarguraUtil<HTMLDivElement>();
  const modoCartao = largura !== null && largura < LARGURA_MINIMA_DA_TABELA;
  // Entre o cartão e a tabela folgada: some o círculo de iniciais.
  const estreita = !modoCartao && largura !== null && largura < 1180;
  // Tela larga (1920): as colunas de largura fixa respiram.
  const largo = largura !== null && largura >= 1400;
  const selecionadas = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Só as linhas à vista vão para o DOM; a página rola como sempre (a tabela
  // É o corpo da tela — uma caixa rolando por dentro deixava a janela vazia).
  const refTabela = useRef<HTMLDivElement | null>(null);
  const refContainer = useCallback((el: HTMLDivElement | null) => {
    refTabela.current = el;
    refLargura.current = el;
  }, [refLargura]);
  const virtuais = useLinhasVirtuaisNaJanela(rows, { tabelaRef: refTabela, alturaEstimada: modoCartao ? 168 : 64 });

  if (rows.length === 0) {
    // Recorte que esvaziou × não há nenhuma vaga que precise de hotel.
    const doRecorte = (bloco && VAZIO[bloco]) || (statusDaHospedagem && statusDaHospedagem !== "all" && VAZIO[statusDaHospedagem]) || null;
    const titulo = doRecorte?.titulo ?? (hasActiveFilters ? "Nenhuma hospedagem neste recorte" : "Nenhuma inclusão com hospedagem");
    const texto = doRecorte
      ? `${doRecorte.texto}${filtrosDaBarra ? " Os filtros ligados podem estar escondendo vagas." : ""}`
      : hasActiveFilters
      ? "Nenhuma vaga bate com a busca e os filtros de agora. Ajuste ou limpe para ver as demais."
      : "Inclusões que precisam de hospedagem aparecem aqui assim que forem escaladas.";
    const Icone = hasActiveFilters ? SearchX : Hotel;
    return (
      <div className="bg-card rounded-xl border border-border overflow-clip">
        <div className="pas-entra px-8 py-12 text-center" data-testid="no-accommodations">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
            <Icone className="w-5 h-5" />
          </span>
          <h3 className="m-0 text-base font-semibold text-foreground">{titulo}</h3>
          <p className="mx-auto mt-1.5 mb-0 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
            {texto}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="button-clear-filters-empty"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>
    );
  }

  // Alvo de 26px: o botão de ordenar tinha a altura do texto.
  const sortBtn = (field: AccSortField, label: string) => (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`group/ordem inline-flex items-center gap-1 h-[26px] rounded-sm uppercase hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${sortConfig?.field === field ? "text-primary" : ""}`}
      data-testid={`header-${field}`}
      title={`Ordenar por ${label.toLowerCase()}`}
    >
      {label}
      {sortConfig?.field === field
        ? (sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" aria-hidden="true" /> : <ChevronDown className="w-3 h-3" aria-hidden="true" />)
        : <ChevronsUpDown className="w-3 h-3 opacity-0 transition-opacity group-hover/ordem:opacity-50" aria-hidden="true" />}
    </button>
  );
  const ariaSort = (field: AccSortField) =>
    sortConfig?.field === field ? (sortConfig.direction === "asc" ? "ascending" : "descending") : undefined;

  return (
    // `overflow-clip` (e não `hidden`): `hidden` prendia o cabeçalho grudado.
    <div className="bg-card rounded-xl border border-border overflow-clip">
      <div
        ref={refContainer}
        className={modoCartao ? "pas-cartao hos-cartao" : estreita ? "pas-tabela pas-estreita" : "pas-tabela"}
        data-testid="accommodations-table"
      >
        <table className={`w-full text-left border-collapse ${modoCartao ? "" : "table-fixed"}`}>
          {/* Larguras-guia: evento e colaborador ficam com a sobra; datas e
              situação não quebram no meio. */}
          {!modoCartao && (
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: 72 }} />
              <col />
              <col style={{ width: estreita ? 96 : largo ? 180 : 136 }} />
              <col />
              <col style={{ width: largo ? 190 : 156 }} />
              <col style={{ width: estreita ? 140 : largo ? 240 : 168 }} />
              <col style={{ width: estreita ? 112 : largo ? 160 : 128 }} />
              <col style={{ width: 56 }} />
            </colgroup>
          )}
          <caption className="sr-only">Hospedagens: vaga, evento, função, colaborador, estadia, hotel e situação da reserva</caption>
          <thead className="pas-cabecalho">
            <tr>
              <th scope="col" className="pl-3 pr-1 py-2.5">
                {canEdit && (
                <input
                  type="checkbox"
                  checked={allSelectableSelected}
                  disabled={selectableIds.size === 0}
                  onChange={onToggleAll}
                  aria-label="Selecionar todas as hospedagens pendentes"
                  title="Selecionar todas as hospedagens pendentes"
                  className="rounded border-slate-300 accent-primary w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                  data-testid="checkbox-select-all"
                />
                )}
              </th>
              <th scope="col" aria-sort={ariaSort("id")} className={`${TH} !px-1.5 whitespace-nowrap`}>{sortBtn("id", "ID")}</th>
              <th scope="col" aria-sort={ariaSort("event")} className={`${TH} whitespace-nowrap`}>{sortBtn("event", "Evento")}</th>
              <th scope="col" aria-sort={ariaSort("function")} className={`${TH} whitespace-nowrap`}>{sortBtn("function", "Função")}</th>
              <th scope="col" aria-sort={ariaSort("collaborator")} className={`${TH} whitespace-nowrap`}>{sortBtn("collaborator", "Colaborador")}</th>
              {/* Ordena pelo check-in ("date"), como antes. */}
              <th scope="col" aria-sort={ariaSort("date")} className={`${TH} whitespace-nowrap`}>{sortBtn("date", "Estadia")}</th>
              <th scope="col" aria-sort={ariaSort("hotelName")} className={`${TH} whitespace-nowrap`}>{sortBtn("hotelName", "Hotel")}</th>
              <th scope="col" className={TH}>Situação</th>
              <th scope="col" className="pl-1 pr-2 py-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">
                <span className="pr-1.5">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody aria-rowcount={rows.length}>
            <EspacadorLinha altura={virtuais.espacoAntes} colunas={9} />
            {virtuais.linhas.map(({ item: inclusion, index: rowIdx, medir }) => {
              const collaborator = inclusion.collaboratorId ? collaboratorById.get(inclusion.collaboratorId) : undefined;
              const event = eventById.get(inclusion.eventId);
              const hasPendingSwap = pendingSwapByInclusion.has(inclusion.id);
              // A urgência só existe para quem está no bloco Urgente (mesma regra).
              const chegada = ehUrgente(inclusion, ctxFila) ? dataDeChegada(inclusion, eventById) : null;
              return (
                <AccommodationRow
                  key={inclusion.id}
                  ref={medir}
                  data-index={rowIdx}
                  rowIdx={rowIdx}
                  inclusion={inclusion}
                  accommodation={accommodationMap.get(inclusion.id)}
                  eventName={event?.name || "—"}
                  eventLocation={event?.location || null}
                  functionName={functionById.get(inclusion.functionId)?.name || "—"}
                  collaboratorName={toTitleCase(collaborator?.fullName)}
                  hasPendingSwap={hasPendingSwap}
                  hasApprovedSwap={!hasPendingSwap && !!approvedSwapInclusionIds?.has(inclusion.id)}
                  alteracaoPendente={vagasComAlteracao?.has(inclusion.id) ?? false}
                  urgencia={chegada ? urgenciaEmPalavras(diasAte(chegada, ctxFila.hoje)) : null}
                  selected={selecionadas.has(inclusion.id)}
                  // Quem só consulta (RH) não monta lote: a caixa seria um controle sem saída.
                  selectable={canEdit && selectableIds.has(inclusion.id)}
                  canEdit={canEdit}
                  onToggleSelect={onToggleRow}
                  onOpen={onOpen}
                />
              );
            })}
            <EspacadorLinha altura={virtuais.espacoDepois} colunas={9} />
          </tbody>
        </table>
      </div>

      {/* Rodapé: o que está na tela, como está ordenado e o que a cor da borda
          esquerda quer dizer. Um marcador colorido sem legenda é charada. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-h-10 px-4 py-2 bg-surface-muted border-t border-border">
        <span className="text-xs text-slate-600 tabular-nums" data-testid="rodape-contagem" aria-live="polite">
          Mostrando {rows.length}{total !== rows.length ? ` de ${total}` : ""} {total === 1 ? "vaga" : "vagas"} · {ordenacao}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:ml-auto text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-[3px] h-[11px] rounded-full bg-warning-strong" />espera você (reservar, troca em análise, rever)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-[3px] h-[11px] rounded-full bg-success-strong" />registrada
          </span>
        </span>
      </div>
    </div>
  );
}
