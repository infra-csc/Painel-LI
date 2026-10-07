/**
 * Barra de filtros de Passagens (02/09; redesenho 07/10).
 *
 * Antes eram duas faixas de 36px DENTRO do card da tabela, com a contagem e o
 * "Limpar" competindo com a ordenação. Depois virou uma fileira de oito
 * controles que, em 1366 com o menu aberto, quebrava em duas linhas iguais —
 * a pessoa lia "status da passagem" com o mesmo peso de "evento".
 *
 * 07/10: o que se escolhe todo dia fica à vista (busca, evento, funções,
 * colaborador, período); as três listas curtas e menos usadas — status da
 * passagem (a fila acima já faz esse recorte), transporte e situação da
 * inclusão — moram em "Filtros", com o número de ligados no botão e uma
 * etiqueta removível embaixo quando fogem do padrão. Um filtro ligado nunca
 * fica escondido. Mesma anatomia da barra da Escalação.
 *
 * **Nenhum filtro saiu**: busca, evento, funções, colaborador, período, status
 * da passagem, transporte, situação da inclusão, contagem e limpar continuam
 * todos aqui, com os mesmos valores.
 */
import { FiltroMultiplo, FiltroUnico, type OpcaoDeFiltro } from "@/components/common/filter-popover";
import { DEFAULT_TICKET_FILTERS, type TicketFilters } from "./types";
import ScalingPeriodFilter from "@/components/scaling/scaling-period-filter";
import type { DatasDoEvento } from "@/components/scaling/scaling-period";
import type { TeamInclusion } from "@shared/schema";
import { BuscaDaLista, EtiquetaDeFiltro, LimparFiltros, MaisFiltros } from "@/components/common/barra-de-filtros";

interface TicketsFilterBarProps {
  filters: TicketFilters;
  onChange: (updater: (prev: TicketFilters) => TicketFilters) => void;
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
  /** Datas de cada evento — liga a opção "Data do evento" no período (02/10). */
  datasDoEvento?: DatasDoEvento;
  count: number;
  /** Total sem recorte — a contagem vira "N de M" quando há filtro ativo. */
  total?: number;
  /** Algum recorte que a barra não mostra (o de trocas da fila) está ligado. */
  recorteDeFora?: boolean;
}

/** Os mesmos valores dos `<select>` que estavam aqui — nada mudou de opção. */
const STATUS_DA_PASSAGEM = [
  { id: "all", nome: "Todos os status" },
  { id: "pending", nome: "Pendentes" },
  { id: "processed", nome: "Compradas" },
  { id: "no_arrival", nome: "Compradas sem horário de chegada" },
];
const TRANSPORTES = [
  { id: "all", nome: "Todos os transportes" },
  { id: "aereo", nome: "Aéreo" },
  { id: "rodoviario", nome: "Rodoviário" },
  { id: "van", nome: "Van" },
];
// Aqui o padrão NÃO é "all": a tela abre em "Inclusões ativas", e "Todas" é
// uma escolha explícita. Por isso é a primeira da lista.
const SITUACOES_DA_INCLUSAO = [
  { id: "active", nome: "Inclusões ativas" },
  { id: "all", nome: "Todas" },
  { id: "cancelado", nome: "Canceladas" },
];

type ChaveDeLista = "ticketStatus" | "transportType" | "inclusionStatus";
const LISTAS: { chave: ChaveDeLista; titulo: string; etiqueta: string; opcoes: { id: string; nome: string }[]; testid: string }[] = [
  { chave: "ticketStatus", titulo: "Status da passagem", etiqueta: "Status", opcoes: STATUS_DA_PASSAGEM, testid: "filter-ticket-status" },
  { chave: "transportType", titulo: "Transporte", etiqueta: "Transporte", opcoes: TRANSPORTES, testid: "filter-transport-type" },
  { chave: "inclusionStatus", titulo: "Situação da inclusão", etiqueta: "Inclusão", opcoes: SITUACOES_DA_INCLUSAO, testid: "filter-inclusion-status" },
];

export default function TicketsFilterBar({
  filters, onChange, onClear, opcoesDeEvento, opcoesDeFuncao, opcoesDeColaborador, linhasSemPeriodo, hoje, datasDoEvento, count, total, recorteDeFora,
}: TicketsFilterBarProps) {
  const set = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) =>
    onChange(prev => ({ ...prev, [key]: value }));

  const contagem = typeof total === "number" && total !== count
    ? `${count} de ${total} ${total === 1 ? "vaga" : "vagas"}`
    : `${count} ${count === 1 ? "vaga" : "vagas"}`;

  // Listas fora do padrão (a primeira opção de cada uma é o padrão).
  const listasLigadas = LISTAS.filter((l) => filters[l.chave] !== l.opcoes[0].id);
  // O status da passagem já aparece aceso na fila de trabalho (cada status
  // tem o seu bloco): repetido aqui como etiqueta, ele só fazia barulho e
  // empurrava "Filtros" para a linha de baixo.
  const etiquetas = listasLigadas.filter((l) => l.chave !== "ticketStatus");
  const algumFiltro = recorteDeFora || JSON.stringify(filters) !== JSON.stringify(DEFAULT_TICKET_FILTERS);
  const limpar = () => { onChange(() => DEFAULT_TICKET_FILTERS); onClear(); };

  return (
    <div className="space-y-2" role="search" aria-label="Filtros das passagens">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
        <BuscaDaLista
          valor={filters.searchId ?? ""}
          onChange={(v) => set("searchId", v)}
          placeholder="Nome, ID, função"
          rotulo="Buscar por nome, ID ou função"
        />

        {/* Celular: a fileira rola de lado em vez de empilhar seis controles. */}
        <div className="pas-rolagem-x -mx-[var(--page-gutter)] flex items-center gap-1.5 px-[var(--page-gutter)] sm:contents">
          <div className="shrink-0 max-w-[220px]">
            <FiltroUnico
              valor={filters.eventId}
              onChange={(v) => set("eventId", v)}
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
              onChange={(ids) => set("functionId", ids)}
              opcoes={opcoesDeFuncao}
              rotuloTodos="Todas as funções"
              placeholderBusca="Buscar função…"
              testid="filter-function"
            />
          </div>
          <div className="shrink-0 max-w-[220px]">
            <FiltroUnico
              valor={filters.collaboratorId}
              onChange={(v) => set("collaboratorId", v)}
              opcoes={opcoesDeColaborador}
              rotuloTodos="Todos os colaboradores"
              placeholderBusca="Buscar colaborador…"
              testid="filter-collaborator"
              larguraPopover={340}
            />
          </div>
          {/* O mesmo período da Escalação (04/09): "Já terminou" é o que permite
              conferir passagens de eventos realizados sem os que ainda vêm.
              "Data do evento" × "Data da escala" (02/10). */}
          <div className="shrink-0">
            <ScalingPeriodFilter valor={filters.periodo} onChange={(v) => set("periodo", v)} linhas={linhasSemPeriodo} hoje={hoje} datasDoEvento={datasDoEvento} />
          </div>

          {/* Peças compartilhadas com a Hospedagem (07/10): as mesmas classes de antes. */}
          <MaisFiltros
            listas={LISTAS}
            valorDe={(chave) => filters[chave as ChaveDeLista]}
            onEscolher={(chave, id) => set(chave as ChaveDeLista, id)}
            contagem={etiquetas.length}
            mostrarPadrao={listasLigadas.length > 0}
            onPadrao={() => onChange((prev) => ({
              ...prev,
              ticketStatus: DEFAULT_TICKET_FILTERS.ticketStatus,
              transportType: DEFAULT_TICKET_FILTERS.transportType,
              inclusionStatus: DEFAULT_TICKET_FILTERS.inclusionStatus,
            }))}
          />
        </div>

      </div>

      {/* Etiquetas do que está ligado em "Filtros" + Limpar + "N de M vagas" (só com recorte).
          A contagem de sempre mora no rodapé da tabela, junto da lista que ela conta. */}
      {(etiquetas.length > 0 || algumFiltro) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {etiquetas.map((l) => (
            <EtiquetaDeFiltro
              key={l.chave}
              etiqueta={l.etiqueta}
              valor={l.opcoes.find((o) => o.id === filters[l.chave])?.nome}
              titulo={l.titulo}
              onTirar={() => set(l.chave, l.opcoes[0].id)}
            />
          ))}
          {/* "Limpar" zera também o filtro de trocas pendentes (via onClear). */}
          {algumFiltro && <LimparFiltros onClick={limpar} />}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite">{contagem}</span>
        </div>
      )}
    </div>
  );
}
