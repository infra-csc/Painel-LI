/**
 * Fila de situações e filtros do Comparativo — redesenho 08/10.
 *
 * Antes: pílulas coloridas de status (que filtravam, sem dizer que filtravam),
 * uma busca "por nome" e três `Select` cinza (função com todas as funções,
 * tipo, ordem) numa linha à parte.
 *
 * Agora a MESMA anatomia do Planejado e do Realizado: a fila de situações
 * (Para análise, Aprovadas, Devolvidas, Recusadas) conta, soma E recorta —
 * reclicar desliga; embaixo, a barra de filtros comum: busca (nome ou função),
 * a função à vista (só as do comparativo, com quantas sobram), tipo e ordem em
 * "Filtros", etiquetas removíveis e "Limpar filtros"; a contagem diz "N de M"
 * e quanto o recorte soma.
 *
 * Só apresentação: o estado vem de `useBudgetComparisonData`.
 */
import { CheckCheck, Clock, Undo2, XCircle } from "lucide-react";
import { BuscaDaLista, EtiquetaDeFiltro, LimparFiltros, MaisFiltros, type ListaCurta } from "@/components/common/barra-de-filtros";
import { FiltroUnico } from "@/components/common/filter-popover";
import { FilaDeTrabalho, type BlocoDaFilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import type { DadosDoComparativo } from "@/hooks/use-budget-comparison-data";
import type { StatusFilterKey } from "./comparison-utils";
import { formatCurrency } from "./types";

const LISTA_TIPO: ListaCurta = {
  chave: "tipo", titulo: "Tipo de colaborador", etiqueta: "Tipo", testid: "filtro-tipo",
  opcoes: [{ id: "all", nome: "Todos" }, { id: "casa", nome: "Casa" }, { id: "freela", nome: "Freela" }],
};
const LISTA_ORDEM: ListaCurta = {
  chave: "ordem", titulo: "Ordenar por", etiqueta: "Ordem", testid: "filtro-ordem",
  opcoes: [
    { id: "difference", nome: "Maior diferença" },
    { id: "total", nome: "Maior valor" },
  ],
};

/**
 * Fila de situações: cada bloco conta E recorta (reclicar desliga). Os
 * números respeitam a busca, a função e o tipo de agora.
 */
export function FilaDoComparativo({ dados: d }: { dados: DadosDoComparativo }) {
  const c = d.contagemPorStatus;
  const v = d.valorPorStatus;
  const blocos: BlocoDaFilaDeTrabalho<StatusFilterKey>[] = [
    { key: "para_analise", rotulo: "Para análise", n: c.para_analise, sub: c.para_analise ? formatCurrency(v.para_analise) : "nada pendente", icone: Clock, cor: "text-info",
      titulo: "Enviadas pelo responsável — aguardando a decisão do RH" },
    { key: "aprovado", rotulo: "Aprovadas", n: c.aprovado, sub: c.aprovado ? formatCurrency(v.aprovado) : "nenhuma ainda", icone: CheckCheck, cor: "text-success",
      titulo: "Aprovadas pelo RH (análise formal)" },
    { key: "devolvido", rotulo: "Devolvidas", n: c.devolvido, sub: c.devolvido ? "com o responsável" : "nenhuma", icone: Undo2, cor: "text-warning",
      titulo: "Devolvidas para correção — o responsável edita e reenvia" },
    { key: "rejeitado", rotulo: "Recusadas", n: c.rejeitado, sub: c.rejeitado ? "corrigir e reenviar" : "nenhuma", icone: XCircle, cor: "text-danger",
      titulo: "Recusadas pelo RH — o responsável pode corrigir e reenviar" },
  ];
  return (
    <FilaDeTrabalho
      blocos={blocos}
      ativa={d.statusFilter}
      onEscolher={(k) => d.setStatusFilter(k)}
      rotulo="Situação das prestações"
      testid={(k) => `fila-${k}`}
    />
  );
}

export function ComparisonFilters({ dados: d }: { dados: DadosDoComparativo }) {
  const tipoLigado = d.filterType !== "all";
  const total = d.comparisonData.length;
  const n = d.sortedData.length;
  const contagem = d.temFiltro
    ? `${n} de ${total} ${total === 1 ? "prestação" : "prestações"}`
    : `${n} ${n === 1 ? "prestação" : "prestações"}`;
  // Com filtro, a contagem diz também quanto o recorte soma (o painel é do comparativo inteiro).
  const soma = d.temFiltro && n > 0 ? ` · ${formatCurrency(d.totalDoRecorte)}` : "";

  return (
    <div className="space-y-2" role="search" aria-label="Filtros do comparativo">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
        <BuscaDaLista
          valor={d.searchTerm}
          onChange={d.setSearchTerm}
          placeholder="Buscar colaborador ou função"
          rotulo="Buscar prestação por colaborador ou função"
          testid="busca-comparativo"
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
              testid="filtro-funcao-comparativo"
            />
          </div>
          <MaisFiltros
            listas={[LISTA_TIPO, LISTA_ORDEM]}
            valorDe={(chave) => (chave === "tipo" ? d.filterType : d.sortBy)}
            onEscolher={(chave, id) => (chave === "tipo" ? d.setFilterType(id) : d.setSortBy(id as "difference" | "total"))}
            // A ordem não é filtro: não conta no número do botão.
            contagem={tipoLigado ? 1 : 0}
            mostrarPadrao={tipoLigado || d.sortBy !== "difference"}
            onPadrao={() => { d.setFilterType("all"); d.setSortBy("difference"); }}
            testid="filtros-comparativo"
          />
        </div>
        <span className="hidden sm:inline ml-auto pl-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap" aria-live="polite" data-testid="contagem-comparativo">
          {contagem}{soma}
        </span>
      </div>

      {d.temFiltro && (
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
          <LimparFiltros onClick={d.limparFiltros} testid="limpar-filtros-comparativo" />
          <span className="sm:hidden ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite">{contagem}{soma}</span>
        </div>
      )}
    </div>
  );
}

export default ComparisonFilters;
