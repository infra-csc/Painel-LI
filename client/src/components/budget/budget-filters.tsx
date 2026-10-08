/**
 * Filtros do Planejado — 25/09 (modularização); redesenho 08/10.
 *
 * Antes: um checkbox solto, uma busca "sublinhada" de 180px e três `Select`
 * com fundo cinza, só na Visão geral — na Planilha os mesmos filtros
 * continuavam valendo, mas invisíveis (a lista encolhia sem dizer por quê).
 *
 * Agora a MESMA anatomia das listas da Logística (common/barra-de-filtros):
 * a troca Visão geral × Planilha, a busca, a função à vista; tipo e ordem em
 * "Filtros"; o que está ligado vira etiqueta removível com "Limpar filtros".
 * Vale para as duas vistas. Acima dela, a fila de situações (pendentes, com
 * ajuste, enviados, não participou) conta E recorta, como em Hospedagem.
 *
 * Só apresentação: o estado vem de `useBudgetFilters`.
 */
import { CircleSlash, Clock, LayoutGrid, PencilLine, Send, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BuscaDaLista, EtiquetaDeFiltro, LimparFiltros, MaisFiltros, type ListaCurta } from "@/components/common/barra-de-filtros";
import { FiltroUnico } from "@/components/common/filter-popover";
import { FilaDeTrabalho, type BlocoDaFilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import type { FiltrosDoPlanejado, SituacaoDoPlanejado } from "@/hooks/use-budget-filters";
import { formatCurrency } from "./types";

export type VistaDoPlanejado = "overview" | "sheet";

const LISTA_TIPO: ListaCurta = {
  chave: "tipo", titulo: "Tipo de colaborador", etiqueta: "Tipo", testid: "filtro-tipo",
  opcoes: [{ id: "all", nome: "Todos" }, { id: "casa", nome: "Casa" }, { id: "freela", nome: "Freela" }],
};
const LISTA_ORDEM: ListaCurta = {
  chave: "ordem", titulo: "Ordenar por", etiqueta: "Ordem", testid: "filtro-ordem",
  opcoes: [
    { id: "name_asc", nome: "Nome A–Z" },
    { id: "name_desc", nome: "Nome Z–A" },
    { id: "days_desc", nome: "Mais dias" },
    { id: "days_asc", nome: "Menos dias" },
    { id: "function", nome: "Por função" },
  ],
};

export interface BudgetFiltersProps {
  filtros: FiltrosDoPlanejado;
  vista: VistaDoPlanejado;
  onVista: (v: VistaDoPlanejado) => void;
  /** Sem permissão de gravar (08/10): a Planilha de edição não aparece. */
  semPlanilha?: boolean;
  /** Vagas do evento antes do filtro — o contador vira "N de M". */
  total: number;
}

/** Visão geral × Planilha: as duas vistas da mesma lista. */
function TrocaDeVista({ vista, onVista }: Pick<BudgetFiltersProps, "vista" | "onVista">) {
  const opcoes = [
    { id: "overview" as const, rotulo: "Visão geral", curto: "Cartões", Icone: LayoutGrid },
    { id: "sheet" as const, rotulo: "Planilha de edição", curto: "Planilha", Icone: Table2 },
  ];
  return (
    <div role="tablist" aria-label="Modo de exibição" className="pla-vista inline-flex shrink-0 h-[34px] p-0.5 rounded-lg bg-muted max-sm:w-full">
      {opcoes.map(({ id, rotulo, curto, Icone }) => {
        const on = vista === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={rotulo}
            onClick={() => onVista(id)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 h-full px-3 rounded-md text-sm font-medium transition-colors max-sm:flex-1",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-card text-foreground shadow-1" : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`vista-${id}`}
          >
            <Icone className={cn("w-4 h-4 shrink-0", on ? "text-primary" : "")} aria-hidden="true" />
            <span className="hidden lg:inline">{rotulo}</span>
            <span className="lg:hidden">{curto}</span>
          </button>
        );
      })}
    </div>
  );
}

export function BudgetFilters({ filtros: f, vista, onVista, total, semPlanilha }: BudgetFiltersProps) {
  const tipoLigado = f.filterType !== "all";
  const n = f.filteredBudgets.length;
  const contagem = f.algumFiltro
    ? `${n} de ${total} ${total === 1 ? "colaborador" : "colaboradores"}`
    : `${n} ${n === 1 ? "colaborador" : "colaboradores"}`;

  return (
    <div className="space-y-2" role="search" aria-label="Filtros do planejado">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
        {!semPlanilha && <TrocaDeVista vista={vista} onVista={onVista} />}
        <span aria-hidden="true" className="hidden sm:block w-px h-5 mx-1 bg-border shrink-0" />
        <BuscaDaLista
          valor={f.searchTerm}
          onChange={f.setSearchTerm}
          placeholder="Buscar colaborador"
          rotulo="Buscar colaborador por nome"
          testid="busca-planejado"
        />
        {/* Celular: a fileira rola de lado em vez de empilhar os controles. */}
        <div className="pas-rolagem-x -mx-[var(--page-gutter)] flex items-center gap-1.5 px-[var(--page-gutter)] sm:contents">
          <div className="shrink-0 max-w-[220px]">
            <FiltroUnico
              valor={f.filterFunction}
              onChange={f.setFilterFunction}
              opcoes={f.opcoesDeFuncao}
              rotuloTodos="Todas as funções"
              placeholderBusca="Buscar função…"
              testid="filtro-funcao"
            />
          </div>
          <MaisFiltros
            listas={[LISTA_TIPO, LISTA_ORDEM]}
            valorDe={(chave) => (chave === "tipo" ? f.filterType : f.sortBy)}
            onEscolher={(chave, id) => (chave === "tipo" ? f.setFilterType(id) : f.setSortBy(id))}
            // A ordem não é filtro: não conta no número do botão.
            contagem={tipoLigado ? 1 : 0}
            mostrarPadrao={tipoLigado || f.sortBy !== "name_asc"}
            onPadrao={() => { f.setFilterType("all"); f.setSortBy("name_asc"); }}
            testid="filtros-planejado"
          />
        </div>
        <span className="hidden sm:inline ml-auto pl-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap" aria-live="polite" data-testid="contagem-planejado">
          {contagem}
        </span>
      </div>

      {f.algumFiltro && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tipoLigado && (
            <EtiquetaDeFiltro
              etiqueta="Tipo"
              valor={LISTA_TIPO.opcoes.find((o) => o.id === f.filterType)?.nome}
              titulo="Tipo de colaborador"
              onTirar={() => f.setFilterType("all")}
            />
          )}
          <LimparFiltros onClick={f.limparFiltros} testid="limpar-filtros-planejado" />
          <span className="sm:hidden ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite">{contagem}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Fila de situações: cada bloco conta E recorta (reclicar desliga). Os
 * números respeitam a busca, a função e o tipo de agora.
 */
export function FilaDoPlanejado({ filtros: f }: { filtros: FiltrosDoPlanejado }) {
  const c = f.contagemPorSituacao;
  const v = f.valorPorSituacao;
  const blocos: BlocoDaFilaDeTrabalho<Exclude<SituacaoDoPlanejado, "todas">>[] = [
    { key: "pendentes", rotulo: "A enviar", n: c.pendentes, sub: c.pendentes ? formatCurrency(v.pendentes) : "nada pendente", icone: Clock, cor: "text-warning",
      titulo: "Colaboradores que ainda não foram enviados ao Realizado" },
    { key: "ajustadas", rotulo: "Com ajuste manual", n: c.ajustadas, sub: c.ajustadas === 1 ? "valor editado" : "valores editados", icone: PencilLine, cor: "text-primary",
      titulo: "Pendentes com algum valor editado à mão (diária, alimentação ou mobilidade)" },
    { key: "enviadas", rotulo: "Enviados", n: c.enviadas, sub: c.enviadas ? formatCurrency(v.enviadas) : "nenhum ainda", icone: Send, cor: "text-success",
      titulo: "Já estão na prestação de contas (Realizado)" },
    { key: "ausentes", rotulo: "Não participou", n: c.ausentes, sub: "fora dos totais", icone: CircleSlash, cor: "text-muted-foreground",
      titulo: "Marcados como não participou: não entram no total nem no envio" },
  ];
  return (
    <FilaDeTrabalho
      blocos={blocos}
      ativa={f.situacao === "todas" ? null : f.situacao}
      onEscolher={(k) => f.setSituacao(k ?? "todas")}
      rotulo="Situação dos colaboradores"
      testid={(k) => `fila-${k}`}
    />
  );
}

export default BudgetFilters;
