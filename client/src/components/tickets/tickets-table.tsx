// Tabela de Passagens: cabeçalho ordenável + linhas (TicketRow) + estado vazio.
//
// 07/10 (redesenho):
//  - nove colunas no lugar de dez (o "Destino" foi distribuído na própria
//    linha — ver ticket-row.tsx), e o limiar do modo cartão caiu de 1100 para
//    960px: em 1366 com o menu aberto (≈1030px úteis) a lista voltou a ser
//    TABELA — antes cada vaga ocupava a tela inteira como um cartão de 420px;
//  - cabeçalho grudado abaixo da barra da tela ao rolar (a lista é longa e
//    rola pela janela);
//  - o cartão do celular/tablet é desenhado por CSS sobre a mesma árvore de
//    células (`.pas-cartao` no index.css): ~150px por vaga em vez de ~420px;
//  - rodapé com legenda honesta (as duas cores eram iguais e diziam coisas
//    diferentes).
import { useCallback, useRef } from "react";
import { Plane, SearchX, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { EspacadorLinha, useLinhasVirtuaisNaJanela } from "@/components/common/virtual-rows";
import { type SortConfig, type SortField } from "@/components/common/sortable-header";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import type { TeamInclusion } from "@shared/schema";
import TicketRow from "./ticket-row";
import type { TicketsData } from "./use-tickets-data";
import type { TicketFilters } from "./types";
import type { SinalDeViagem } from "./use-sinais-de-viagem";

/**
 * Abaixo disto a tabela não cabe sem espremer coluna e vira cartão.
 *
 * Medido sobre as nove colunas desta lista: com menos que isto, datas e
 * horários passam a quebrar no meio e os nomes viram três linhas.
 */
const LARGURA_MINIMA_DA_TABELA = 960;

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
  /** Vagas com alteração aprovada esperando remarcar (07/10). */
  vagasComAlteracao?: ReadonlySet<string> | ReadonlyMap<string, unknown>;
  /** Há filtro ligado? O vazio oferece limpar em vez de só lamentar. */
  temFiltro?: boolean;
  onLimparFiltros?: () => void;
  /** Sinais de viagem por vaga (09/10): cruza outra viagem, data impossível, trecho direto. */
  sinais?: Readonly<Record<string, SinalDeViagem>>;
  /** Linhas já recortadas por "?conflito=" (Pendências); sem isso, as do filtro. */
  linhas?: TeamInclusion[];
  /** Título/texto do vazio quando o recorte é de conflito. */
  vazioDoRecorte?: { titulo: string; texto: string } | null;
  nomeDoEvento?: (eventId: string) => string | null | undefined;
  onTrechoDireto?: (inclusion: TeamInclusion, anteriorId: string) => void;
  /** "Buscar preços do trecho direto" (09/10). */
  onBuscarTrechoDireto?: (inclusion: TeamInclusion, anteriorId: string) => void;
  /** Vagas que precisam de passagem sem recorte nenhum — o "de M" do rodapé. */
  total?: number;
}

// 11px/600 com tracking curto — era 10px `font-black` com 0.15em, caixa alta
// esticada e mais pesada que o próprio dado que rotulava.
const TH = "px-2.5 py-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground text-left";

export default function TicketsTable({
  data, filters, sortConfig, onSort, selectedTickets, allSelectableSelected, onToggleAll, onToggleSelect, onOpen, canEdit, onToggleEmitida, emitindo,
  vagasComAlteracao, temFiltro, onLimparFiltros, total, sinais, linhas, vazioDoRecorte, nomeDoEvento, onTrechoDireto, onBuscarTrechoDireto,
}: TicketsTableProps) {
  const rows = linhas ?? data.filteredTicketInclusions;
  // Medido sobre a largura ÚTIL, não pela janela: o menu lateral compacto
  // muda o espaço da lista sem mudar o tamanho da tela.
  const { ref: refLargura, largura } = useLarguraUtil<HTMLDivElement>();
  const modoCartao = largura !== null && largura < LARGURA_MINIMA_DA_TABELA;
  // Entre o cartão e a tabela folgada: some o círculo de iniciais (38px que
  // viram nome do colaborador numa linha só).
  const estreita = !modoCartao && largura !== null && largura < 1180;
  // Tela larga (1920): as colunas de largura fixa respiram em vez de deixar
  // toda a sobra para evento e colaborador.
  const largo = largura !== null && largura >= 1400;

  // 28/09: só as linhas à vista vão para o DOM. Com a fila inteira de
  // Compras (milhares de vagas × 9 colunas) a tela demorava a responder a
  // cada tecla e a cada marcação — não era a busca, era o número de `<tr>`.
  // Rola pela página (`janela`): a tabela É o corpo da tela, então uma caixa
  // de altura fixa rolando por dentro deixava metade da janela vazia.
  const refTabela = useRef<HTMLDivElement | null>(null);
  const refContainer = useCallback((el: HTMLDivElement | null) => {
    refTabela.current = el;
    refLargura.current = el;
  }, [refLargura]);
  const virtuais = useLinhasVirtuaisNaJanela(rows, { tabelaRef: refTabela, alturaEstimada: modoCartao ? 168 : 68 });

  if (rows.length === 0) {
    // Sem nenhuma vaga que precise de passagem × o recorte é que esvaziou.
    const titulo = vazioDoRecorte?.titulo ?? (filters.ticketStatus === "pending" ? "Nenhuma passagem pendente"
      : filters.ticketStatus === "processed" ? "Nenhuma passagem comprada"
      : filters.ticketStatus === "no_arrival" ? "Todas as compradas têm horário de chegada"
      : "Nenhuma passagem encontrada");
    const texto = vazioDoRecorte?.texto ?? (filters.ticketStatus === "pending"
      ? "Todas as passagens foram compradas ou não há colaboradores escalados."
      : filters.ticketStatus === "processed"
      ? "Nenhuma passagem foi comprada ainda."
      : filters.ticketStatus === "no_arrival"
      ? "Nenhuma passagem comprada está sem o horário de chegada da ida."
      : "Não há colaboradores escalados que necessitem de passagens.");
    const Icone = temFiltro ? SearchX : Plane;
    return (
      <div className="pas-entra px-8 py-12 text-center" data-testid="tickets-vazio">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
          <Icone className="w-5 h-5" />
        </span>
        <h3 className="m-0 text-base font-semibold text-foreground">{titulo}</h3>
        <p className="mx-auto mt-1.5 mb-0 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
          {texto}
          {temFiltro && " Os filtros ligados podem estar escondendo vagas."}
        </p>
        {temFiltro && onLimparFiltros && (
          <button
            type="button"
            onClick={onLimparFiltros}
            className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="button-clear-filters-empty"
          >
            Limpar filtros
          </button>
        )}
      </div>
    );
  }

  // Alvo de 26px: o botão de ordenar tinha a altura do texto (15px), pequeno
  // demais para acertar com o mouse.
  const sortBtn = (field: SortField, label: string) => (
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
  const ariaSort = (field: SortField) =>
    sortConfig?.field === field ? (sortConfig.direction === "asc" ? "ascending" : "descending") : undefined;

  const ordemLabel = sortConfig
    ? ({ id: "nº da inclusão", event: "evento", function: "função", collaborator: "colaborador", diarias: "datas" } as Record<string, string>)[sortConfig.field] ?? sortConfig.field
    : "evento e função";

  return (
    <>
      <div ref={refContainer} className={modoCartao ? "pas-cartao" : estreita ? "pas-tabela pas-estreita" : "pas-tabela"} data-testid="tickets-table">
      {/* `table-fixed` na tabela: as larguras do colgroup mandam e o texto que
          não cabe quebra (ou corta com reticências) dentro da célula — sem isso
          um resumo longo empurrava a coluna de ações para fora da tela. */}
      <table className={`w-full text-left border-collapse ${modoCartao ? "" : "table-fixed"}`}>
        {/* Larguras-guia: o nome do evento fica com a sobra; datas e situação
            não quebram no meio. */}
        {!modoCartao && (
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 72 }} />
            <col />
            <col style={{ width: estreita ? 96 : largo ? 180 : 140 }} />
            <col />
            <col style={{ width: largo ? 200 : 182 }} />
            <col style={{ width: largo ? 150 : 124 }} />
            <col style={{ width: estreita ? 116 : largo ? 200 : 150 }} />
            <col style={{ width: 78 }} />
          </colgroup>
        )}
        <caption className="sr-only">Passagens: vaga, evento, função, colaborador, viagem, sugestão e situação da compra</caption>
        <thead className="pas-cabecalho">
          <tr>
            <th scope="col" className="pl-3 pr-1 py-2.5">
              <input
                type="checkbox"
                checked={allSelectableSelected}
                disabled={data.selectableInclusionIds.size === 0}
                onChange={onToggleAll}
                aria-label="Selecionar todas as passagens pendentes"
                title="Selecionar todas as passagens pendentes"
                className="rounded border-slate-300 accent-primary w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                data-testid="checkbox-select-all"
              />
            </th>
            <th scope="col" aria-sort={ariaSort("id")} className={`${TH} !px-1.5 whitespace-nowrap`}>
              {sortBtn("id", "ID")}
            </th>
            {/* Evento e Função em colunas próprias (02/10), cada uma ordena. */}
            <th scope="col" aria-sort={ariaSort("event")} className={`${TH} whitespace-nowrap`}>{sortBtn("event", "Evento")}</th>
            <th scope="col" aria-sort={ariaSort("function")} className={`${TH} whitespace-nowrap`}>{sortBtn("function", "Função")}</th>
            <th scope="col" aria-sort={ariaSort("collaborator")} className={`${TH} whitespace-nowrap`}>{sortBtn("collaborator", "Colaborador")}</th>
            {/* Ordena pelo início da escala ("diarias"), como antes. */}
            <th scope="col" aria-sort={ariaSort("diarias")} className={`${TH} whitespace-nowrap`}>{sortBtn("diarias", "Viagem")}</th>
            <th scope="col" className={TH}>Sugestão</th>
            <th scope="col" className={TH}>Status</th>
            <th scope="col" className="pl-1 pr-2 py-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">
              <span className="pr-1.5">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody aria-rowcount={rows.length}>
          <EspacadorLinha altura={virtuais.espacoAntes} colunas={9} />
          {virtuais.linhas.map(({ item: inclusion, index: rowIdx, medir }) => (
            <TicketRow
              key={inclusion.id}
              ref={medir}
              data-index={rowIdx}
              inclusion={inclusion}
              ticket={data.getTicket(inclusion.id)}
              rowIdx={rowIdx}
              eventName={data.getEventName(inclusion.eventId)}
              functionName={data.getFunctionName(inclusion.functionId)}
              collaboratorName={data.getCollaboratorName(inclusion.collaboratorId)}
              eventLocation={data.getEventLocation(inclusion.eventId)}
              hasPendingSwap={data.pendingSwapByInclusion.has(inclusion.id)}
              hasApprovedSwap={data.approvedSwapInclusionIds.has(inclusion.id)}
              alteracaoPendente={vagasComAlteracao?.has(inclusion.id) ?? false}
              selected={selectedTickets.includes(inclusion.id)}
              canEdit={canEdit}
              locked={data.isEventLocked(inclusion)}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
              onToggleEmitida={onToggleEmitida}
              emitindo={emitindo}
              sinal={sinais?.[inclusion.id]}
              nomeDoEvento={nomeDoEvento}
              onTrechoDireto={onTrechoDireto}
              onBuscarTrechoDireto={onBuscarTrechoDireto}
            />
          ))}
          <EspacadorLinha altura={virtuais.espacoDepois} colunas={9} />
        </tbody>
      </table>
      </div>

      {/* Rodapé: o que está na tela e o que a cor da borda esquerda quer dizer.
          Um marcador colorido sem legenda é charada, não sinal. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-h-10 px-4 py-2 bg-surface-muted border-t border-border">
        <span className="text-xs text-slate-600 tabular-nums">
          {/* A contagem da barra de filtros mora aqui desde 07/10 (testid mantido). */}
          <span data-testid="contagem-passagens" aria-live="polite">
            Mostrando {rows.length}{typeof total === "number" && total !== rows.length ? ` de ${total}` : ""} {(total ?? rows.length) === 1 ? "vaga" : "vagas"}
          </span>
          {" · "}ordenado por {ordemLabel}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:ml-auto text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-[3px] h-[11px] rounded-full bg-warning-strong" />espera você (comprar, troca em análise, remarcar, viagem a conferir)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-[3px] h-[11px] rounded-full bg-success-strong" />comprada
          </span>
        </span>
      </div>
    </>
  );
}
