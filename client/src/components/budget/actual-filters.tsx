/**
 * Filtros do Orçamento Realizado — 25/09 (modularização); redesenho 08/10.
 *
 * Antes: busca "sublinhada" de 200px e três `Select` cinza (função com TODAS
 * as funções do cadastro, tipo, ordem), um "14 itens" solto e o "Selecionar
 * todas" numa linha própria.
 *
 * Agora a MESMA anatomia do Planejado (common/barra-de-filtros): busca, a
 * função à vista (só as que existem no evento, com quantas sobram), tipo e
 * ordem em "Filtros"; o que está ligado vira etiqueta removível com "Limpar
 * filtros"; a contagem diz "N de M" e quanto o recorte soma. Acima dela, a
 * fila de situações (a preencher, salvas, em revisão, devolvidas,
 * aprovadas) conta E recorta. O "selecionar" foi para o cabeçalho da lista.
 *
 * Só apresentação: o estado vem de `useBudgetActualData`.
 */
import { CheckCheck, CircleDashed, Clock, PencilLine, Undo2 } from "lucide-react";
import { BuscaDaLista, EtiquetaDeFiltro, LimparFiltros, MaisFiltros, type ListaCurta } from "@/components/common/barra-de-filtros";
import { FiltroUnico } from "@/components/common/filter-popover";
import { FilaDeTrabalho, type BlocoDaFilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import type { DadosDoRealizado, SituacaoDaPrestacao } from "@/hooks/use-budget-actual-data";
import { formatCurrency } from "./types";

const LISTA_TIPO: ListaCurta = {
  chave: "tipo", titulo: "Tipo de colaborador", etiqueta: "Tipo", testid: "filtro-tipo",
  opcoes: [{ id: "all", nome: "Todos" }, { id: "casa", nome: "Casa" }, { id: "freela", nome: "Freela" }],
};
const LISTA_ORDEM: ListaCurta = {
  chave: "ordem", titulo: "Ordenar por", etiqueta: "Ordem", testid: "filtro-ordem",
  opcoes: [
    // "adjusted": diverge do planejado primeiro, depois o maior valor.
    { id: "adjusted", nome: "Com divergência primeiro" },
    { id: "value", nome: "Maior valor" },
    { id: "name", nome: "Nome A–Z" },
  ],
};

export interface ActualFiltersProps {
  dados: DadosDoRealizado;
}

export function ActualFilters({ dados: d }: ActualFiltersProps) {
  const tipoLigado = d.filterType !== "all";
  const total = d.eventItems.length;
  const n = d.filteredItems.length;
  const contagem = d.algumFiltro
    ? `${n} de ${total} ${total === 1 ? "prestação" : "prestações"}`
    : `${n} ${n === 1 ? "prestação" : "prestações"}`;
  // Com filtro, a contagem diz também quanto o recorte soma (o painel é do evento inteiro).
  const soma = d.algumFiltro && n > 0 ? ` · ${formatCurrency(d.totalRealizado)}` : "";

  return (
    <div className="space-y-2" role="search" aria-label="Filtros do realizado">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
        <BuscaDaLista
          valor={d.searchTerm}
          onChange={d.setSearchTerm}
          placeholder="Buscar colaborador ou função"
          rotulo="Buscar prestação por colaborador ou função"
          testid="busca-realizado"
        />
        {/* Celular: a fileira rola de lado em vez de empilhar os controles. */}
        <div className="pas-rolagem-x -mx-[var(--page-gutter)] flex items-center gap-1.5 px-[var(--page-gutter)] sm:contents">
          <div className="shrink-0 max-w-[220px]">
            <FiltroUnico
              valor={d.filterFunction}
              onChange={d.setFilterFunction}
              opcoes={d.opcoesDeFuncao}
              rotuloTodos="Todas as funções"
              placeholderBusca="Buscar função…"
              testid="filtro-funcao-realizado"
            />
          </div>
          <MaisFiltros
            listas={[LISTA_TIPO, LISTA_ORDEM]}
            valorDe={(chave) => (chave === "tipo" ? d.filterType : d.sortBy)}
            onEscolher={(chave, id) => (chave === "tipo" ? d.setFilterType(id) : d.setSortBy(id))}
            // A ordem não é filtro: não conta no número do botão.
            contagem={tipoLigado ? 1 : 0}
            mostrarPadrao={tipoLigado || d.sortBy !== "adjusted"}
            onPadrao={() => { d.setFilterType("all"); d.setSortBy("adjusted"); }}
            testid="filtros-realizado"
          />
        </div>
        <span className="hidden sm:inline ml-auto pl-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap" aria-live="polite" data-testid="contagem-realizado">
          {contagem}{soma}
        </span>
      </div>

      {d.algumFiltro && (
        <div className="flex flex-wrap items-center gap-1.5">
          {d.filterFunction !== "all" && (
            <EtiquetaDeFiltro
              etiqueta="Função"
              valor={d.opcoesDeFuncao.find((o) => o.id === d.filterFunction)?.nome}
              titulo="Função"
              onTirar={() => d.setFilterFunction("all")}
            />
          )}
          {tipoLigado && (
            <EtiquetaDeFiltro
              etiqueta="Tipo"
              valor={LISTA_TIPO.opcoes.find((o) => o.id === d.filterType)?.nome}
              titulo="Tipo de colaborador"
              onTirar={() => d.setFilterType("all")}
            />
          )}
          <LimparFiltros onClick={d.limparFiltros} testid="limpar-filtros-realizado" />
          <span className="sm:hidden ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite">{contagem}{soma}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Fila de situações: cada bloco conta E recorta (reclicar desliga). Os
 * números respeitam a busca, a função e o tipo de agora.
 */
export function FilaDoRealizado({ dados: d }: { dados: DadosDoRealizado }) {
  const c = d.contagemPorSituacao;
  const v = d.valorPorSituacao;
  const blocos: BlocoDaFilaDeTrabalho<SituacaoDaPrestacao>[] = [
    { key: "preencher", rotulo: "A preencher", n: c.preencher, sub: c.preencher ? "nunca salvas" : "nada pendente", icone: CircleDashed, cor: "text-muted-foreground",
      titulo: "Prestações que ainda não foram salvas — vão com os valores do planejado se forem enviadas assim" },
    { key: "salvas", rotulo: "Salvas", n: c.salvas, sub: c.salvas ? "prontas para enviar" : "nenhuma", icone: PencilLine, cor: "text-primary",
      titulo: "Prestações preenchidas e salvas, ainda não enviadas para revisão" },
    { key: "revisao", rotulo: "Em revisão", n: c.revisao, sub: c.revisao ? formatCurrency(v.revisao) : "nenhuma", icone: Clock, cor: "text-info",
      titulo: "Enviadas — aguardando a análise do RH (travadas para edição)" },
    { key: "devolvidas", rotulo: "Devolvidas", n: c.devolvidas,
      sub: !c.devolvidas ? "nenhuma" : d.recusadasNaFila > 0 ? `${d.recusadasNaFila === c.devolvidas ? "" : "inclui "}${d.recusadasNaFila} ${d.recusadasNaFila === 1 ? "recusada" : "recusadas"}` : "corrigir e reenviar", icone: Undo2, cor: "text-warning",
      titulo: "Devolvidas ou recusadas pelo RH — corrija e reenvie para revisão" },
    { key: "aprovadas", rotulo: "Aprovadas", n: c.aprovadas, sub: c.aprovadas ? formatCurrency(v.aprovadas) : "nenhuma ainda", icone: CheckCheck, cor: "text-success",
      titulo: "Aprovadas pelo RH" },
  ];
  return (
    <FilaDeTrabalho
      blocos={blocos}
      ativa={d.situacao === "todas" ? null : d.situacao}
      onEscolher={(k) => d.setSituacao(k ?? "todas")}
      rotulo="Situação das prestações"
      testid={(k) => `fila-${k}`}
    />
  );
}

export default ActualFilters;
