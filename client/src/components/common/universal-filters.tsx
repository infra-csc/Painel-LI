/**
 * Barra de filtros da Inclusão de equipe (a única tela que a usa).
 *
 * 07/10 (redesenho): era um cartão de 150px de altura com seis rótulos em
 * caixa-alta, um seletor por coluna e uma segunda fileira só para "Mostrar
 * excluídos" e "Limpar". Agora é a MESMA anatomia da barra de Passagens e
 * Hospedagem (peças de `common/barra-de-filtros` e `common/filter-popover`):
 * à vista o que se escolhe todo dia — busca, evento, funções, colaborador —
 * e em "Filtros" as listas de status e de escalação e o "Mostrar excluídos".
 * Cada opção diz quantas vagas sobram ao escolhê-la; filtro ligado em
 * "Filtros" vira etiqueta removível embaixo, nunca fica escondido.
 *
 * **Nenhum filtro saiu**: busca, evento, funções, colaborador, status,
 * escalação (todos de seleção múltipla, como desde 28/08), mostrar excluídos
 * e limpar continuam aqui, com os mesmos valores e os mesmos `data-testid`.
 */
import { useState, useEffect, useRef } from "react";
import { Check, Search, SlidersHorizontal, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { FiltroMultiplo, type OpcaoDeFiltro } from "@/components/common/filter-popover";
import { EtiquetaDeFiltro, LimparFiltros } from "@/components/common/barra-de-filtros";

// Seleção múltipla (pedido do dono, 28/08): cada campo é uma LISTA de
// valores marcados; lista vazia significa "todos".
export interface UniversalFilterValues {
  eventId: string[];
  functionId: string | string[];
  collaboratorId: string[];
  status?: string[];
  escalationStatus: string[];
  searchId: string;
  showDeleted?: boolean;
  ticketStatus?: string[];
  accommodationStatus?: string[];
}

export interface OpcoesDaBarra {
  eventos: OpcaoDeFiltro[];
  funcoes: OpcaoDeFiltro[];
  colaboradores: OpcaoDeFiltro[];
  status: OpcaoDeFiltro[];
  escalacao: OpcaoDeFiltro[];
}

interface UniversalFiltersProps {
  filters: UniversalFilterValues;
  onFiltersChange: (filters: UniversalFilterValues) => void;
  /** Opções já com a contagem cruzada — quem sabe contar é a regra da lista. */
  opcoes: OpcoesDaBarra;
}

const plural = (um: string, varios: string) => (n: number) => `${n} ${n === 1 ? um : varios}`;

/** Lista de marcar (várias) dentro de "Filtros" — o mesmo desenho das listas curtas. */
function ListaDeMarcar({ titulo, opcoes, marcados, onChange, testid }: {
  titulo: string;
  opcoes: OpcaoDeFiltro[];
  marcados: string[];
  onChange: (v: string[]) => void;
  testid: string;
}) {
  return (
    <div role="group" aria-label={titulo} data-testid={testid}>
      <p className="m-0 mb-1 px-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{titulo}</p>
      <div className="flex flex-col gap-px">
        {opcoes.map((o) => {
          const on = marcados.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onChange(on ? marcados.filter((v) => v !== o.id) : [...marcados, o.id])}
              className={`flex items-center gap-2 w-full min-h-[32px] px-2 py-1 rounded-md text-left text-sm transition-colors hover:bg-muted ${on ? "text-primary font-medium" : "text-slate-700"}`}
              data-testid={`${testid}-opcao-${o.id}`}
            >
              <span aria-hidden="true" className={`inline-flex items-center justify-center w-4 h-4 shrink-0 rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-card text-transparent"}`}>
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
              <span className="flex-1 min-w-0 leading-snug">{o.nome}</span>
              <span className={`shrink-0 text-2xs tabular-nums ${o.n === 0 ? "text-muted-foreground/60" : "text-muted-foreground"}`}>{o.n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function UniversalFilters({ filters, onFiltersChange, opcoes }: UniversalFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.searchId ?? "");
  const [maisAberto, setMaisAberto] = useState(false);

  useEffect(() => {
    setSearchInput(filters.searchId ?? "");
  }, [filters.searchId]);

  // O debounce só pode reagir ao que o usuário digita: `filters`/`onFiltersChange`
  // mudam a cada render da tela pai e, como dependências, reiniciariam o timer
  // (e disparariam o callback) sem nenhuma tecla nova. Por isso ficam numa ref.
  const ultimo = useRef({ filters, onFiltersChange });
  ultimo.current = { filters, onFiltersChange };
  useEffect(() => {
    // Sem mudança real, sem callback (auditoria 28/08): este efeito disparava
    // onFiltersChange no MONTAR da tela, e cada tela reagia refazendo memos e
    // repintando a lista inteira antes mesmo do usuário digitar algo.
    const { filters: atuais, onFiltersChange: aplicar } = ultimo.current;
    if (searchInput === (atuais.searchId ?? "")) return;
    if (searchInput === "") {
      aplicar({ ...atuais, searchId: "" });
      return;
    }
    const t = setTimeout(() => {
      const { filters: f, onFiltersChange: cb } = ultimo.current;
      cb({ ...f, searchId: searchInput });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const status = filters.status ?? [];
  const escalacao = filters.escalationStatus ?? [];
  const funcoes = Array.isArray(filters.functionId) ? filters.functionId : [];
  const ligadosEmFiltros = status.length + escalacao.length + (filters.showDeleted ? 1 : 0);
  const algumFiltro = !!(filters.searchId || filters.eventId.length || funcoes.length || filters.collaboratorId.length || ligadosEmFiltros);

  const clearFilters = () => {
    setSearchInput("");
    onFiltersChange({
      eventId: [],
      functionId: [],
      collaboratorId: [],
      escalationStatus: [],
      searchId: "",
      showDeleted: false,
      status: [],
    });
  };

  const nomeDe = (lista: OpcaoDeFiltro[], id: string) => lista.find((o) => o.id === id)?.nome ?? id;

  return (
    <div className="space-y-2" role="search" aria-label="Filtros das vagas">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
        {/* Busca: o mesmo campo de Passagens/Hospedagem (ícone, limpar, Esc apaga). */}
        <div className="relative sm:flex-[1_1_170px] sm:min-w-[150px] sm:max-w-[300px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            inputMode="search"
            placeholder="ID ou nome…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && searchInput) { e.preventDefault(); setSearchInput(""); } }}
            className={`w-full h-[34px] pl-[33px] ${searchInput ? "pr-8" : "pr-3"} rounded-lg border border-border bg-card text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-slate-300 focus:border-primary focus:ring-[3px] focus:ring-primary/12`}
            data-testid="input-search-id"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="Limpar a busca"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Celular: a fileira rola de lado em vez de empilhar quatro controles. */}
        <div className="pas-rolagem-x -mx-[var(--page-gutter)] flex items-center gap-1.5 px-[var(--page-gutter)] sm:contents">
          <div className="shrink-0 w-[188px] sm:w-auto sm:max-w-[230px]">
            <FiltroMultiplo
              valores={filters.eventId ?? []}
              onChange={(v) => onFiltersChange({ ...filters, eventId: v })}
              opcoes={opcoes.eventos}
              rotuloTodos="Todos os eventos"
              placeholderBusca="Buscar evento…"
              testid="filter-event"
              larguraPopover={360}
              rotuloVarios={plural("evento", "eventos")}
            />
          </div>
          <div className="shrink-0 w-[168px] sm:w-auto sm:max-w-[200px]">
            <FiltroMultiplo
              valores={funcoes}
              onChange={(v) => onFiltersChange({ ...filters, functionId: v })}
              opcoes={opcoes.funcoes}
              rotuloTodos="Todas as funções"
              placeholderBusca="Buscar função…"
              testid="filter-function"
            />
          </div>
          <div className="shrink-0 w-[200px] sm:w-auto sm:max-w-[230px]">
            <FiltroMultiplo
              valores={filters.collaboratorId ?? []}
              onChange={(v) => onFiltersChange({ ...filters, collaboratorId: v })}
              opcoes={opcoes.colaboradores}
              rotuloTodos="Todos os colaboradores"
              placeholderBusca="Buscar colaborador…"
              testid="filter-collaborator"
              larguraPopover={340}
              rotuloVarios={plural("colaborador", "colaboradores")}
            />
          </div>

          {/* "Filtros": status, escalação e excluídos — o número de ligados no botão. */}
          <Popover open={maisAberto} onOpenChange={setMaisAberto}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`pas-alvo inline-flex shrink-0 items-center gap-1.5 h-[34px] px-3 rounded-lg border bg-card text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:border-primary data-[state=open]:border-primary/60 ${
                  ligadosEmFiltros > 0 ? "border-primary/40 text-primary" : "border-border text-slate-700 hover:bg-muted"
                }`}
                data-testid="filtros-mais"
              >
                <SlidersHorizontal className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                Filtros
                {ligadosEmFiltros > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-2xs font-semibold tabular-nums text-primary-foreground">
                    {ligadosEmFiltros}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" collisionPadding={12} className="w-[min(560px,calc(100vw-24px))] p-0 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border">
                <span className="text-sm font-semibold text-foreground">Filtros</span>
                {ligadosEmFiltros > 0 && (
                  <button
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, status: [], escalationStatus: [], showDeleted: false })}
                    className="ml-auto h-[26px] px-2.5 rounded-md text-xs font-medium text-primary hover:bg-brand-soft"
                  >
                    Voltar ao padrão
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3 p-3">
                <ListaDeMarcar
                  titulo="Status"
                  opcoes={opcoes.status}
                  marcados={status}
                  onChange={(v) => onFiltersChange({ ...filters, status: v })}
                  testid="filter-status"
                />
                <ListaDeMarcar
                  titulo="Escalação"
                  opcoes={opcoes.escalacao}
                  marcados={escalacao}
                  onChange={(v) => onFiltersChange({ ...filters, escalationStatus: v })}
                  testid="filter-escalation"
                />
              </div>
              <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-t border-border bg-surface-muted cursor-pointer select-none">
                <span className="text-sm text-slate-700">Mostrar excluídos</span>
                <Switch
                  id="show-deleted"
                  checked={filters.showDeleted || false}
                  onCheckedChange={(checked) => onFiltersChange({ ...filters, showDeleted: checked })}
                  data-testid="checkbox-show-deleted"
                />
              </label>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* O que está ligado em "Filtros" vira etiqueta removível; "Limpar" desliga tudo. */}
      {algumFiltro && (
        <div className="flex flex-wrap items-center gap-1.5">
          {status.map((s) => (
            <EtiquetaDeFiltro key={`s-${s}`} etiqueta="Status" valor={nomeDe(opcoes.status, s)} titulo={`status ${nomeDe(opcoes.status, s)}`}
              onTirar={() => onFiltersChange({ ...filters, status: status.filter((v) => v !== s) })} />
          ))}
          {escalacao.map((s) => (
            <EtiquetaDeFiltro key={`e-${s}`} etiqueta="Escalação" valor={nomeDe(opcoes.escalacao, s)} titulo={`escalação ${nomeDe(opcoes.escalacao, s)}`}
              onTirar={() => onFiltersChange({ ...filters, escalationStatus: escalacao.filter((v) => v !== s) })} />
          ))}
          {filters.showDeleted && (
            <EtiquetaDeFiltro etiqueta="Exibir" valor="excluídos" titulo="mostrar excluídos"
              onTirar={() => onFiltersChange({ ...filters, showDeleted: false })} />
          )}
          <LimparFiltros onClick={clearFilters} />
        </div>
      )}
    </div>
  );
}
