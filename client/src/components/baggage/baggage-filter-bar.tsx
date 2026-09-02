/**
 * Barra de filtros do Controle de Bagagem — uma linha de 34px.
 *
 * Antes era uma faixa dentro do card da lista: busca, um combobox de evento de
 * 220px, um chip azul que aparecia quando havia colaborador filtrado (e que só
 * podia ser criado clicando no nome dentro do relatório) e o botão de CSV.
 * O colaborador ganhou popover próprio, com busca e contagem, e a ordenação —
 * que era fixa em "embarque mais recente" — virou controle.
 *
 * **Nenhum filtro saiu**: busca, evento, colaborador, CSV e a contagem
 * continuam todos aqui.
 */
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { FiltroDeLista, FiltroMultiplo, FiltroUnico, type OpcaoDeFiltro } from "@/components/common/filter-popover";
import { formatCurrency } from "./baggage-core";
import { NOME_DA_ORDEM, type CampoDeOrdem, type FiltrosDaLista, type Ordem, type ResumoDoRecorte } from "./baggage-logic";

const CONTROLE = "h-[34px] rounded-lg border border-border bg-card text-[13px] font-medium text-slate-700";

const ORDENAR_POR: { id: string; nome: string }[] = [
  { id: "boarding", nome: "Embarque" },
  { id: "collaborator", nome: "Colaborador" },
  { id: "value", nome: "Valor" },
  { id: "cia", nome: "Companhia" },
];

export default function BaggageFilterBar({
  filtros, onChange, onClear, opcoesDeEvento, opcoesDeColaborador, ordem, onOrdem, resumo, total,
}: {
  filtros: FiltrosDaLista;
  onChange: (patch: Partial<FiltrosDaLista>) => void;
  /** Limpa filtros E o bloco da fila por companhia — tudo de uma vez. */
  onClear: () => void;
  /**
   * Opções JÁ com a contagem cruzada — "quantas linhas sobram se eu escolher
   * ISTO mantendo o resto". Vêm prontas da página porque quem sabe contar é a
   * regra que monta a lista, não a barra.
   */
  opcoesDeEvento: OpcaoDeFiltro[];
  opcoesDeColaborador: OpcaoDeFiltro[];
  ordem: Ordem;
  onOrdem: (o: Ordem) => void;
  resumo: ResumoDoRecorte;
  /** Total sem recorte — a contagem vira "N de M" quando há filtro ativo. */
  total: number;
}) {
  const contagem = total !== resumo.records
    ? `${resumo.records} de ${total} ${total === 1 ? "solicitação" : "solicitações"}`
    : `${resumo.records} ${resumo.records === 1 ? "solicitação" : "solicitações"}`;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-[1_1_260px] max-w-[320px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
        <input
          type="text"
          placeholder="Buscar por nome, CPF, LOC, OS ou evento…"
          aria-label="Buscar solicitações por nome, CPF, LOC, OS ou evento"
          value={filtros.search}
          onChange={(e) => onChange({ search: e.target.value })}
          className={`w-full ${CONTROLE} pl-[33px] pr-3 placeholder:text-slate-400 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12`}
          data-testid="input-search-baggage"
        />
      </div>

      <div className="w-[168px] shrink-0">
        <FiltroUnico
          // O popover usa "all" para "todos"; aqui o estado sempre foi "" — a
          // tradução mora só nesta fronteira, e o resto da tela não muda.
          valor={filtros.eventId || "all"}
          onChange={(v) => onChange({ eventId: v === "all" ? "" : v })}
          opcoes={opcoesDeEvento}
          rotuloTodos="Todos os eventos"
          placeholderBusca="Buscar evento…"
          testid="filter-event"
          larguraPopover={360}
        />
      </div>
      <div className="w-[206px] shrink-0">
        <FiltroMultiplo
          valores={filtros.collaboratorIds}
          onChange={(ids) => onChange({ collaboratorIds: ids })}
          opcoes={opcoesDeColaborador}
          rotuloTodos="Todos os colaboradores"
          placeholderBusca="Buscar colaborador…"
          testid="filter-collaborator"
          larguraPopover={340}
        />
      </div>

      <div className="w-[150px] shrink-0">
        <FiltroDeLista
          valor={ordem.campo}
          onChange={(v) => onOrdem({ ...ordem, campo: v as CampoDeOrdem })}
          opcoes={ORDENAR_POR}
          testid="filter-sort"
        />
      </div>
      <button
        type="button"
        onClick={() => onOrdem({ ...ordem, desc: !ordem.desc })}
        title={ordem.desc ? "Ordem decrescente — clique para inverter" : "Ordem crescente — clique para inverter"}
        aria-label={ordem.desc ? "Ordem decrescente, inverter" : "Ordem crescente, inverter"}
        className={`${CONTROLE} w-[34px] shrink-0 inline-flex items-center justify-center text-muted-foreground hover:bg-slate-100 transition-colors`}
        data-testid="button-sort-direction"
      >
        {ordem.desc ? <ArrowDown className="w-4 h-4" aria-hidden="true" /> : <ArrowUp className="w-4 h-4" aria-hidden="true" />}
      </button>

      <button
        type="button"
        onClick={onClear}
        className={`${CONTROLE} inline-flex items-center gap-1.5 px-3 text-muted-foreground hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C] transition-colors whitespace-nowrap shrink-0`}
        data-testid="button-clear-filters"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar filtros
      </button>

      {/*
        aria-live porque o número muda enquanto se digita na busca: sem ele, o
        leitor de tela anuncia a lista mas nunca o tamanho dela.
      */}
      <span
        className="ml-auto text-[12px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0"
        aria-live="polite"
        data-testid="contagem-bagagem"
      >
        {contagem} · {resumo.bags} {resumo.bags === 1 ? "bagagem" : "bagagens"} · {formatCurrency(resumo.cents)}
      </span>
    </div>
  );
}
