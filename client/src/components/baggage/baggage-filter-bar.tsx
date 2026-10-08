/**
 * Barra de filtros do Controle de Bagagem.
 *
 * Antes era uma faixa dentro do card da lista: busca, um combobox de evento de
 * 220px, um chip azul que aparecia quando havia colaborador filtrado (e que só
 * podia ser criado clicando no nome dentro do relatório) e o botão de CSV.
 * O colaborador ganhou popover próprio, com busca e contagem, e a ordenação —
 * que era fixa em "embarque mais recente" — virou controle.
 *
 * 08/10 (redesenho): a MESMA anatomia de Passagens e Hospedagem (peças de
 * `common/barra-de-filtros`) — busca com "limpar" próprio e Esc, evento e
 * colaborador à vista, e a ordenação num popover só ("Ordenar"), com o sentido
 * dito em palavras ("mais recente primeiro") em vez de uma seta solta. O
 * "Limpar filtros" que ficava sempre aceso, mesmo sem nada para limpar, só
 * aparece quando há recorte — junto da etiqueta da companhia escolhida na fila
 * e do "N de M", que mora ao lado do que ele conta.
 *
 * **Nenhum filtro saiu**: busca, evento, colaborador, companhia, ordenação
 * (campo e sentido), contagem e limpar continuam todos aqui.
 */
import { useState } from "react";
import { ArrowDown, ArrowDownUp, ArrowUp, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FiltroMultiplo, FiltroUnico, type OpcaoDeFiltro } from "@/components/common/filter-popover";
import { BuscaDaLista, EtiquetaDeFiltro, LimparFiltros } from "@/components/common/barra-de-filtros";
import { formatCurrency } from "./baggage-core";
import { type CampoDeOrdem, type FiltrosDaLista, type Ordem, type ResumoDoRecorte } from "./baggage-logic";

const ORDENAR_POR: { id: CampoDeOrdem; nome: string }[] = [
  { id: "boarding", nome: "Embarque" },
  { id: "collaborator", nome: "Colaborador" },
  { id: "value", nome: "Valor" },
  { id: "cia", nome: "Companhia" },
];

/** O sentido da ordem em palavras, para cada campo — "↓" sozinho é charada. */
export function sentidoEmPalavras(o: Ordem): string {
  switch (o.campo) {
    case "boarding": return o.desc ? "mais recente primeiro" : "mais antigo primeiro";
    case "value": return o.desc ? "maior valor primeiro" : "menor valor primeiro";
    default: return o.desc ? "de Z a A" : "de A a Z";
  }
}

/** O campo e o sentido num popover só — o mesmo desenho do "Filtros" das irmãs. */
function Ordenar({ ordem, onOrdem }: { ordem: Ordem; onOrdem: (o: Ordem) => void }) {
  const [aberto, setAberto] = useState(false);
  const atual = ORDENAR_POR.find((o) => o.id === ordem.campo) ?? ORDENAR_POR[0];
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="pas-alvo inline-flex shrink-0 items-center gap-1.5 h-[34px] px-3 rounded-lg border border-border bg-card text-sm font-medium text-slate-700 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:border-primary data-[state=open]:border-primary/60"
          aria-label={`Ordenar: ${atual.nome.toLowerCase()}, ${sentidoEmPalavras(ordem)}`}
          data-testid="filter-sort"
        >
          <ArrowDownUp className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {atual.nome}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="w-[244px] p-0 rounded-xl overflow-hidden">
        <p className="m-0 px-3.5 py-2.5 border-b border-border text-sm font-semibold text-foreground">Ordenar por</p>
        <div role="radiogroup" aria-label="Ordenar por" className="flex flex-col gap-px p-1.5">
          {ORDENAR_POR.map((o) => {
            const marcada = o.id === ordem.campo;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={marcada}
                onClick={() => onOrdem({ ...ordem, campo: o.id })}
                className={`flex items-center gap-2 w-full min-h-[32px] px-2 py-1 rounded-md text-left text-sm transition-colors hover:bg-muted ${marcada ? "text-primary font-medium" : "text-slate-700"}`}
                data-testid={`filter-sort-opcao-${o.id}`}
              >
                <span aria-hidden="true" className={`inline-flex items-center justify-center w-4 h-4 shrink-0 rounded-full border ${marcada ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-card text-transparent"}`}>
                  <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                </span>
                {o.nome}
              </button>
            );
          })}
        </div>
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => onOrdem({ ...ordem, desc: !ordem.desc })}
            title="Inverter o sentido"
            aria-label={`${ordem.desc ? "Ordem decrescente" : "Ordem crescente"} (${sentidoEmPalavras(ordem)}), inverter`}
            className="inline-flex items-center gap-1.5 h-8 w-full px-2 rounded-md border border-border text-xs font-medium text-slate-700 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="button-sort-direction"
          >
            {ordem.desc ? <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" /> : <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />}
            <span className="first-letter:uppercase">{sentidoEmPalavras(ordem)}</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
  const algumFiltro = !!filtros.eventId || filtros.collaboratorIds.length > 0 || filtros.search.trim() !== "" || filtros.cia !== null;
  const contagem = total !== resumo.records
    ? `${resumo.records} de ${total} ${total === 1 ? "solicitação" : "solicitações"}`
    : `${resumo.records} ${resumo.records === 1 ? "solicitação" : "solicitações"}`;

  return (
    <div className="space-y-2" role="search" aria-label="Filtros das solicitações de bagagem">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
        <BuscaDaLista
          valor={filtros.search}
          onChange={(v) => onChange({ search: v })}
          placeholder="Nome, CPF, LOC, OS…"
          rotulo="Buscar solicitações por nome, CPF, LOC, OS ou evento"
          testid="input-search-baggage"
        />

        {/* Celular: a fileira rola de lado em vez de empilhar os controles. */}
        <div className="pas-rolagem-x -mx-[var(--page-gutter)] flex items-center gap-1.5 px-[var(--page-gutter)] sm:contents">
          <div className="shrink-0 max-w-[240px]">
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
          <div className="shrink-0 max-w-[240px]">
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
          <div className="shrink-0 sm:ml-auto">
            <Ordenar ordem={ordem} onOrdem={onOrdem} />
          </div>
        </div>
      </div>

      {/* A companhia escolhida na fila + Limpar + "N de M" — só com recorte.
          Sem recorte, a contagem de sempre mora no rodapé da lista. */}
      {algumFiltro && (
        <div className="pas-entra flex flex-wrap items-center gap-1.5">
          {filtros.cia && (
            <EtiquetaDeFiltro
              etiqueta="Companhia"
              valor={filtros.cia}
              titulo="Companhia aérea"
              onTirar={() => onChange({ cia: null })}
            />
          )}
          <LimparFiltros onClick={onClear} />
          {/*
            aria-live porque o número muda enquanto se digita na busca: sem ele, o
            leitor de tela anuncia a lista mas nunca o tamanho dela.
          */}
          <span
            className="ml-auto text-xs text-muted-foreground tabular-nums"
            aria-live="polite"
            data-testid="contagem-bagagem"
          >
            {contagem} · {resumo.bags} {resumo.bags === 1 ? "bagagem" : "bagagens"} · {formatCurrency(resumo.cents)}
          </span>
        </div>
      )}
    </div>
  );
}
