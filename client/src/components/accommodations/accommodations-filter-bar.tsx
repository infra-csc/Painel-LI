/**
 * Barra de filtros de Hospedagem.
 *
 * Antes era uma faixa cinza DENTRO do card da tabela, com combobox de 32px,
 * dois `<select>` nativos e a contagem espremida entre eles. Depois virou uma
 * fileira de dez controles que, em 1366 com o menu aberto, quebrava em duas
 * linhas — "status da hospedagem" lido com o mesmo peso de "evento".
 *
 * 07/10 (redesenho): a MESMA anatomia da barra de Passagens (peças
 * compartilhadas em common/barra-de-filtros): à vista o que se escolhe todo
 * dia — busca, evento, funções, colaborador, período; em "Filtros" as listas
 * curtas — status da hospedagem, situação da inclusão e a ordenação (que
 * precisa existir fora do cabeçalho da tabela: no cartão do celular não há
 * cabeçalho onde clicar). Filtro fora do padrão vira etiqueta removível embaixo;
 * nunca fica escondido.
 *
 * **Nenhum filtro saiu**: busca, evento, funções, colaborador, período, status
 * da hospedagem, situação da inclusão, ordenação (campo e sentido), contagem e
 * limpar continuam todos aqui, com os mesmos valores.
 */
import { ArrowDown, ArrowUp } from "lucide-react";
import { FiltroMultiplo, FiltroUnico, type OpcaoDeFiltro } from "@/components/common/filter-popover";
import { BuscaDaLista, EtiquetaDeFiltro, LimparFiltros, MaisFiltros, type ListaCurta } from "@/components/common/barra-de-filtros";
import { DEFAULT_FILTERS, type AccommodationFilters, type AccSortConfig, type AccSortField } from "./types";
import ScalingPeriodFilter from "@/components/scaling/scaling-period-filter";
import type { TeamInclusion } from "@shared/schema";

interface Props {
  filters: AccommodationFilters;
  onChange: (patch: Partial<AccommodationFilters>) => void;
  /** Limpa filtros E o bloco da fila — tudo de uma vez. */
  onClear: () => void;
  /**
   * Opções JÁ com a contagem cruzada — "quantas linhas sobram se eu escolher
   * ISTO mantendo o resto". Vêm prontas da página porque quem sabe contar é a
   * regra que monta a lista, não a barra.
   */
  opcoesDeEvento: OpcaoDeFiltro[];
  opcoesDeFuncao: OpcaoDeFiltro[];
  opcoesDeColaborador: OpcaoDeFiltro[];
  /** Base do contador do período: tudo aplicado, menos o próprio período. */
  linhasSemPeriodo: TeamInclusion[];
  hoje: Date;
  sortConfig: AccSortConfig | null;
  onSortChange: (c: AccSortConfig | null) => void;
  count: number;
  /** Total sem recorte — a contagem vira "N de M" quando há filtro ativo. */
  total: number;
  /** Algum recorte que a barra não mostra (o bloco da fila) está ligado. */
  recorteDeFora?: boolean;
}

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
const ORDENAR_POR = [
  { id: "padrao", nome: "Ordem padrão" },
  { id: "id", nome: "Nº da inclusão" },
  { id: "event", nome: "Evento" },
  { id: "function", nome: "Função" },
  { id: "collaborator", nome: "Colaborador" },
  { id: "date", nome: "Check-in" },
  { id: "hotelName", nome: "Hotel" },
];

type ChaveDeFiltro = "accommodationStatus" | "inclusionStatus";
const LISTAS_DE_FILTRO: (ListaCurta & { chave: ChaveDeFiltro })[] = [
  { chave: "accommodationStatus", titulo: "Status da hospedagem", etiqueta: "Status", opcoes: STATUS_DA_HOSPEDAGEM, testid: "filter-status" },
  { chave: "inclusionStatus", titulo: "Situação da inclusão", etiqueta: "Inclusão", opcoes: SITUACOES_DA_INCLUSAO, testid: "filter-inclusion-status" },
];
const LISTA_DE_ORDEM: ListaCurta = { chave: "ordem", titulo: "Ordenar por", etiqueta: "Ordem", opcoes: ORDENAR_POR, testid: "filter-sort" };

export default function AccommodationsFilterBar({
  filters, onChange, onClear, opcoesDeEvento, opcoesDeFuncao, opcoesDeColaborador,
  linhasSemPeriodo, hoje, sortConfig, onSortChange, count, total, recorteDeFora,
}: Props) {
  const contagem = total !== count
    ? `${count} de ${total} ${total === 1 ? "vaga" : "vagas"}`
    : `${count} ${count === 1 ? "vaga" : "vagas"}`;

  const campoAtual = sortConfig?.field ?? "padrao";
  const ascendente = sortConfig?.direction === "asc";

  // Listas fora do padrão (a primeira opção de cada uma é o padrão).
  const ligadas = LISTAS_DE_FILTRO.filter((l) => filters[l.chave] !== l.opcoes[0].id);
  const algumFiltro = !!recorteDeFora || JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  /** O sentido da ordenação, embaixo da lista "Ordenar por". */
  const sentido = (chave: string) => chave !== "ordem" ? null : (
    <button
      type="button"
      // Sem campo escolhido não há o que inverter — desabilitar diz isso
      // melhor do que um botão que não faz nada ao ser clicado.
      disabled={!sortConfig}
      onClick={() => sortConfig && onSortChange({ ...sortConfig, direction: ascendente ? "desc" : "asc" })}
      title={!sortConfig ? "Escolha um campo para ordenar" : ascendente ? "Ordem crescente — clique para inverter" : "Ordem decrescente — clique para inverter"}
      aria-label={ascendente ? "Ordem crescente, inverter" : "Ordem decrescente, inverter"}
      className="mt-1.5 inline-flex items-center gap-1.5 h-8 w-full px-2 rounded-md border border-border text-xs font-medium text-slate-700 transition-colors hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
      data-testid="button-sort-direction"
    >
      {ascendente ? <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />}
      {ascendente ? "Crescente" : "Decrescente"}
    </button>
  );

  return (
    <div className="space-y-2" role="search" aria-label="Filtros das hospedagens">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
        <BuscaDaLista
          valor={filters.searchId}
          onChange={(v) => onChange({ searchId: v })}
          placeholder="Nome ou ID"
          rotulo="Buscar por nome ou número da inclusão"
          compacta
        />

        {/* Celular: a fileira rola de lado em vez de empilhar seis controles. */}
        <div className="pas-rolagem-x -mx-[var(--page-gutter)] flex items-center gap-1.5 px-[var(--page-gutter)] sm:contents">
          <div className="shrink-0 max-w-[220px]">
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
          <div className="shrink-0 max-w-[200px]">
            <FiltroMultiplo
              valores={filters.functionId}
              onChange={(ids) => onChange({ functionId: ids })}
              opcoes={opcoesDeFuncao}
              rotuloTodos="Todas as funções"
              placeholderBusca="Buscar função…"
              testid="filter-function"
            />
          </div>
          <div className="shrink-0 max-w-[220px]">
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
          {/* O mesmo período da Escalação (04/09): "Já terminou" é o que permite
              conferir hospedagens de eventos realizados sem os que ainda vêm. */}
          <div className="shrink-0">
            <ScalingPeriodFilter valor={filters.periodo} onChange={(v) => onChange({ periodo: v })} linhas={linhasSemPeriodo} hoje={hoje} />
          </div>

          <MaisFiltros
            listas={[...LISTAS_DE_FILTRO, LISTA_DE_ORDEM]}
            valorDe={(chave) => (chave === "ordem" ? campoAtual : filters[chave as ChaveDeFiltro])}
            onEscolher={(chave, id) => {
              if (chave === "ordem") {
                onSortChange(id === "padrao" ? null : { field: id as AccSortField, direction: sortConfig?.field === id ? sortConfig.direction : "asc" });
                return;
              }
              onChange({ [chave]: id } as Partial<AccommodationFilters>);
            }}
            // A ordenação não é filtro: não conta no número do botão.
            contagem={ligadas.length}
            mostrarPadrao={ligadas.length > 0}
            onPadrao={() => onChange({ accommodationStatus: DEFAULT_FILTERS.accommodationStatus, inclusionStatus: DEFAULT_FILTERS.inclusionStatus })}
            depoisDaLista={sentido}
          />
        </div>
      </div>

      {/* Etiquetas do que está ligado em "Filtros" + Limpar + "N de M vagas" (só com recorte).
          A contagem de sempre mora no rodapé da tabela, junto da lista que ela conta. */}
      {(ligadas.length > 0 || algumFiltro) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {ligadas.map((l) => (
            <EtiquetaDeFiltro
              key={l.chave}
              etiqueta={l.etiqueta}
              valor={l.opcoes.find((o) => o.id === filters[l.chave])?.nome}
              titulo={l.titulo}
              onTirar={() => onChange({ [l.chave]: l.opcoes[0].id } as Partial<AccommodationFilters>)}
            />
          ))}
          {/* "Limpar" zera também o bloco da fila (via onClear). */}
          {algumFiltro && <LimparFiltros onClick={onClear} />}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite" data-testid="contagem-hospedagens">{contagem}</span>
        </div>
      )}
    </div>
  );
}
