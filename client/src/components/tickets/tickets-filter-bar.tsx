/**
 * Barra de filtros de Passagens — uma linha de 34px (02/09).
 *
 * Antes eram duas faixas de 36px DENTRO do card da tabela, com a contagem e o
 * "Limpar" competindo com a ordenação. Agora fica acima do card, no mesmo
 * padrão de `scaling/scaling-filter-bar.tsx`, porque as duas telas são filas
 * de trabalho irmãs.
 *
 * **Nenhum filtro saiu**: busca, evento, funções, colaborador, status da
 * passagem, transporte, situação da inclusão, contagem e limpar continuam
 * todos aqui — só mudaram de forma e de lugar.
 */
import { Search, X } from "lucide-react";
import { FiltroDeLista, FiltroMultiplo, FiltroUnico, type OpcaoDeFiltro } from "@/components/common/filter-popover";
import { DEFAULT_TICKET_FILTERS, type TicketFilters } from "./types";

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
  count: number;
  /** Total sem recorte — a contagem vira "N de M" quando há filtro ativo. */
  total?: number;
}

/** Altura e forma comuns a todos os controles da linha. */
const CONTROLE = "h-[34px] rounded-lg border border-border bg-card text-[13px] font-medium text-slate-700";

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

export default function TicketsFilterBar({
  filters, onChange, onClear, opcoesDeEvento, opcoesDeFuncao, opcoesDeColaborador, count, total,
}: TicketsFilterBarProps) {
  const set = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) =>
    onChange(prev => ({ ...prev, [key]: value }));

  const contagem = typeof total === "number" && total !== count
    ? `${count} de ${total} ${total === 1 ? "vaga" : "vagas"}`
    : `${count} ${count === 1 ? "vaga" : "vagas"}`;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-[1_1_260px] max-w-[320px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
        <input
          type="text"
          placeholder="Buscar por nome, ID ou função…"
          aria-label="Buscar por nome, ID ou função"
          value={filters.searchId ?? ""}
          onChange={(e) => set("searchId", e.target.value)}
          className={`w-full ${CONTROLE} pl-[33px] pr-3 placeholder:text-slate-400 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12`}
          data-testid="input-search-id"
        />
      </div>

      <div className="w-[168px] shrink-0">
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
      <div className="w-[172px] shrink-0">
        <FiltroMultiplo
          valores={filters.functionId}
          onChange={(ids) => set("functionId", ids)}
          opcoes={opcoesDeFuncao}
          rotuloTodos="Todas as funções"
          placeholderBusca="Buscar função…"
          testid="filter-function"
        />
      </div>
      <div className="w-[206px] shrink-0">
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

      <div className="w-[210px] shrink-0">
        <FiltroDeLista
          valor={filters.ticketStatus}
          onChange={(v) => set("ticketStatus", v)}
          opcoes={STATUS_DA_PASSAGEM}
          testid="filter-ticket-status"
          larguraPopover={290}
        />
      </div>
      <div className="w-[190px] shrink-0">
        <FiltroDeLista
          valor={filters.transportType}
          onChange={(v) => set("transportType", v)}
          opcoes={TRANSPORTES}
          testid="filter-transport-type"
        />
      </div>
      <div className="w-[156px] shrink-0">
        <FiltroDeLista
          valor={filters.inclusionStatus}
          onChange={(v) => set("inclusionStatus", v)}
          opcoes={SITUACOES_DA_INCLUSAO}
          testid="filter-inclusion-status"
        />
      </div>

      {/* "Limpar" zera também o filtro de trocas pendentes (via onClear). */}
      <button
        type="button"
        onClick={() => { onChange(() => DEFAULT_TICKET_FILTERS); onClear(); }}
        className={`${CONTROLE} inline-flex items-center gap-1.5 px-3 text-muted-foreground hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C] transition-colors whitespace-nowrap shrink-0`}
        data-testid="button-clear-filters"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar filtros
      </button>

      <span
        className="ml-auto text-[12px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0"
        data-testid="contagem-passagens"
      >
        {contagem}
      </span>
    </div>
  );
}
