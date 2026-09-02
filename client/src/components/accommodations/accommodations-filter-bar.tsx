/**
 * Barra de filtros de Hospedagem — uma linha de 34px, fora do card.
 *
 * Antes era uma faixa cinza DENTRO do card da tabela, com combobox de 32px,
 * dois `<select>` nativos e a contagem espremida entre eles. O menu nativo do
 * sistema, no meio de controles desenhados, aparecia como corpo estranho.
 *
 * **Nenhum filtro saiu**: busca, evento, funções, colaborador, status da
 * hospedagem, situação da inclusão, contagem e limpar continuam todos aqui.
 * A ordenação, que só existia nos cabeçalhos da tabela, ganhou controle
 * próprio — no modo cartão não há cabeçalho onde clicar.
 */
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { FiltroDeLista, FiltroMultiplo, FiltroUnico, type OpcaoDeFiltro } from "@/components/common/filter-popover";
import type { AccommodationFilters, AccSortConfig, AccSortField } from "./types";

interface Props {
  filters: AccommodationFilters;
  onChange: (patch: Partial<AccommodationFilters>) => void;
  /** Limpa filtros E o recorte de trocas e o bloco da fila — tudo de uma vez. */
  onClear: () => void;
  /**
   * Opções JÁ com a contagem cruzada — "quantas linhas sobram se eu escolher
   * ISTO mantendo o resto". Vêm prontas da página porque quem sabe contar é a
   * regra que monta a lista, não a barra.
   */
  opcoesDeEvento: OpcaoDeFiltro[];
  opcoesDeFuncao: OpcaoDeFiltro[];
  opcoesDeColaborador: OpcaoDeFiltro[];
  sortConfig: AccSortConfig | null;
  onSortChange: (c: AccSortConfig | null) => void;
  count: number;
  /** Total sem recorte — a contagem vira "N de M" quando há filtro ativo. */
  total: number;
}

const CONTROLE = "h-[34px] rounded-lg border border-border bg-card text-[13px] font-medium text-slate-700";

/** Os mesmos valores dos `<select>` que estavam aqui — nada mudou de opção. */
const STATUS_DA_HOSPEDAGEM = [
  { id: "all", nome: "Todos os status" },
  { id: "pending", nome: "Pendentes" },
  { id: "processed", nome: "Registradas" },
];
// Aqui o padrão NÃO é "all": a tela abre em "Inclusões ativas", e "Todas" é
// uma escolha explícita. Por isso é a primeira da lista.
const SITUACOES_DA_INCLUSAO = [
  { id: "active", nome: "Inclusões ativas" },
  { id: "all", nome: "Todas" },
  { id: "cancelado", nome: "Canceladas" },
];

/**
 * "padrao" representa a AUSÊNCIA de ordenação, que o terceiro clique no
 * cabeçalho sempre produziu. Sem ela o seletor teria dois dos três estados e o
 * usuário não conseguiria voltar ao original.
 */
const ORDENAR_POR: { id: string; nome: string }[] = [
  { id: "padrao", nome: "Ordem padrão" },
  { id: "id", nome: "Nº da inclusão" },
  { id: "event", nome: "Evento" },
  { id: "collaborator", nome: "Colaborador" },
  { id: "date", nome: "Check-in" },
  { id: "hotelName", nome: "Hotel" },
];

export default function AccommodationsFilterBar({
  filters, onChange, onClear, opcoesDeEvento, opcoesDeFuncao, opcoesDeColaborador,
  sortConfig, onSortChange, count, total,
}: Props) {
  const contagem = total !== count
    ? `${count} de ${total} ${total === 1 ? "vaga" : "vagas"}`
    : `${count} ${count === 1 ? "vaga" : "vagas"}`;

  const campoAtual = sortConfig?.field ?? "padrao";
  const ascendente = sortConfig?.direction === "asc";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-[1_1_260px] max-w-[320px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
        <input
          type="text"
          placeholder="Buscar por nome ou número…"
          aria-label="Buscar por nome ou número da inclusão"
          value={filters.searchId}
          onChange={(e) => onChange({ searchId: e.target.value })}
          className={`w-full ${CONTROLE} pl-[33px] pr-3 placeholder:text-slate-400 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12`}
          data-testid="input-search-id"
        />
      </div>

      <div className="w-[168px] shrink-0">
        <FiltroUnico
          valor={filters.eventId}
          onChange={(v) => onChange({ eventId: v })}
          opcoes={opcoesDeEvento}
          rotuloTodos="Todos os eventos"
          placeholderBusca="Buscar evento…"
          testid="filter-event"
          larguraPopover={360}
        />
      </div>
      <div className="w-[172px] shrink-0">
        <FiltroMultiplo
          valores={filters.functionId}
          onChange={(ids) => onChange({ functionId: ids })}
          opcoes={opcoesDeFuncao}
          rotuloTodos="Todas as funções"
          placeholderBusca="Buscar função…"
          testid="filter-function"
        />
      </div>
      <div className="w-[206px] shrink-0">
        <FiltroUnico
          valor={filters.collaboratorId}
          onChange={(v) => onChange({ collaboratorId: v })}
          opcoes={opcoesDeColaborador}
          rotuloTodos="Todos os colaboradores"
          placeholderBusca="Buscar colaborador…"
          testid="filter-collaborator"
          larguraPopover={340}
        />
      </div>

      <div className="w-[166px] shrink-0">
        <FiltroDeLista
          valor={filters.accommodationStatus}
          onChange={(v) => onChange({ accommodationStatus: v as AccommodationFilters["accommodationStatus"] })}
          opcoes={STATUS_DA_HOSPEDAGEM}
          testid="filter-status"
        />
      </div>
      <div className="w-[156px] shrink-0">
        <FiltroDeLista
          valor={filters.inclusionStatus}
          onChange={(v) => onChange({ inclusionStatus: v as AccommodationFilters["inclusionStatus"] })}
          opcoes={SITUACOES_DA_INCLUSAO}
          testid="filter-inclusion-status"
        />
      </div>

      <div className="w-[160px] shrink-0">
        <FiltroDeLista
          valor={campoAtual}
          onChange={(v) => onSortChange(v === "padrao" ? null : { field: v as AccSortField, direction: "asc" })}
          opcoes={ORDENAR_POR}
          testid="filter-sort"
        />
      </div>
      <button
        type="button"
        // Sem campo escolhido não há o que inverter — desabilitar diz isso
        // melhor do que um botão que não faz nada ao ser clicado.
        disabled={!sortConfig}
        onClick={() => sortConfig && onSortChange({ ...sortConfig, direction: ascendente ? "desc" : "asc" })}
        title={ascendente ? "Ordem crescente — clique para inverter" : "Ordem decrescente — clique para inverter"}
        aria-label={ascendente ? "Ordem crescente, inverter" : "Ordem decrescente, inverter"}
        className={`${CONTROLE} w-[34px] shrink-0 inline-flex items-center justify-center text-muted-foreground hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-card transition-colors`}
        data-testid="button-sort-direction"
      >
        {ascendente ? <ArrowUp className="w-4 h-4" aria-hidden="true" /> : <ArrowDown className="w-4 h-4" aria-hidden="true" />}
      </button>

      <button
        type="button"
        onClick={onClear}
        className={`${CONTROLE} inline-flex items-center gap-1.5 px-3 text-muted-foreground hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C] transition-colors whitespace-nowrap shrink-0`}
        data-testid="button-clear-filters"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar filtros
      </button>

      <span
        className="ml-auto text-[12px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0"
        data-testid="contagem-hospedagens"
      >
        {contagem}
      </span>
    </div>
  );
}
