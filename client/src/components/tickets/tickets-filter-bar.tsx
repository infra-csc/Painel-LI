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
import { useState } from "react";
import { Search, SlidersHorizontal, X, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FiltroMultiplo, FiltroUnico, type OpcaoDeFiltro } from "@/components/common/filter-popover";
import { DEFAULT_TICKET_FILTERS, type TicketFilters } from "./types";
import ScalingPeriodFilter from "@/components/scaling/scaling-period-filter";
import type { DatasDoEvento } from "@/components/scaling/scaling-period";
import type { TeamInclusion } from "@shared/schema";

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
  const [filtrosAberto, setFiltrosAberto] = useState(false);
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
        <div className="relative sm:flex-[1_1_180px] sm:min-w-[180px] sm:max-w-[340px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            placeholder="Nome, ID, função"
            aria-label="Buscar por nome, ID ou função"
            value={filters.searchId ?? ""}
            onChange={(e) => set("searchId", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && filters.searchId) { e.preventDefault(); set("searchId", ""); } }}
            className={`pas-busca w-full h-[34px] pl-[33px] ${filters.searchId ? "pr-8" : "pr-3"} rounded-lg border border-border bg-card text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-slate-300 focus:border-primary focus:ring-[3px] focus:ring-primary/12`}
            data-testid="input-search-id"
          />
          {filters.searchId && (
            <button
              type="button"
              onClick={() => set("searchId", "")}
              aria-label="Limpar a busca"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

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

          <Popover open={filtrosAberto} onOpenChange={setFiltrosAberto}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`pas-alvo inline-flex shrink-0 items-center gap-1.5 h-[34px] px-3 rounded-lg border bg-card text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:border-primary data-[state=open]:border-primary/60 ${
                  etiquetas.length > 0 ? "border-primary/40 text-primary" : "border-border text-slate-700 hover:bg-muted"
                }`}
                data-testid="filtros-mais"
              >
                <SlidersHorizontal className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                Filtros
                {etiquetas.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-2xs font-semibold tabular-nums text-primary-foreground">
                    {etiquetas.length}
                  </span>
                )}
                {/* Sem seta: o ícone já diz "abre opções", e os 22px dela empurravam
                    o botão para a linha de baixo quando o contador aparece. */}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" collisionPadding={12} className="w-[min(560px,calc(100vw-24px))] p-0 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border">
                <span className="text-sm font-semibold text-foreground">Filtros</span>
                {listasLigadas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange((prev) => ({
                      ...prev,
                      ticketStatus: DEFAULT_TICKET_FILTERS.ticketStatus,
                      transportType: DEFAULT_TICKET_FILTERS.transportType,
                      inclusionStatus: DEFAULT_TICKET_FILTERS.inclusionStatus,
                    }))}
                    className="ml-auto h-[26px] px-2.5 rounded-md text-xs font-medium text-primary hover:bg-brand-soft"
                  >
                    Voltar ao padrão
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-3 p-3">
                {LISTAS.map((l) => (
                  <div key={l.chave} role="radiogroup" aria-label={l.titulo} data-testid={l.testid}>
                    <p className="m-0 mb-1 px-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{l.titulo}</p>
                    <div className="flex flex-col gap-px">
                      {l.opcoes.map((o) => {
                        const marcada = filters[l.chave] === o.id;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            role="radio"
                            aria-checked={marcada}
                            onClick={() => set(l.chave, o.id)}
                            className={`flex items-center gap-2 w-full min-h-[32px] px-2 py-1 rounded-md text-left text-sm transition-colors hover:bg-muted ${marcada ? "text-primary font-medium" : "text-slate-700"}`}
                            data-testid={`${l.testid}-opcao-${o.id}`}
                          >
                            <span aria-hidden="true" className={`inline-flex items-center justify-center w-4 h-4 shrink-0 rounded-full border ${marcada ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-card text-transparent"}`}>
                              <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                            </span>
                            <span className="min-w-0 leading-snug">{o.nome}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

      </div>

      {/* Etiquetas do que está ligado em "Filtros" + Limpar + "N de M vagas" (só com recorte).
          A contagem de sempre mora no rodapé da tabela, junto da lista que ela conta. */}
      {(etiquetas.length > 0 || algumFiltro) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {etiquetas.map((l) => (
            <span
              key={l.chave}
              className="pas-entra inline-flex max-w-full items-center gap-1 h-6 rounded-md border border-primary/25 bg-brand-soft pl-2 pr-0.5 text-xs font-medium text-primary"
            >
              <span className="text-2xs font-semibold uppercase tracking-wide text-primary/70">{l.etiqueta}</span>
              <span className="truncate">{l.opcoes.find((o) => o.id === filters[l.chave])?.nome}</span>
              <button
                type="button"
                onClick={() => set(l.chave, l.opcoes[0].id)}
                aria-label={`Tirar o filtro ${l.titulo.toLowerCase()}`}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-primary/15"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          {/* "Limpar" zera também o filtro de trocas pendentes (via onClear). */}
          {algumFiltro && (
            <button
              type="button"
              onClick={limpar}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger"
              data-testid="button-clear-filters"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar filtros
            </button>
          )}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite">{contagem}</span>
        </div>
      )}
    </div>
  );
}
