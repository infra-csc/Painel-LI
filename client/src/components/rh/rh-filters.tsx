// Extraído de rh-control.tsx em 25/09 (modularização); redesenho 08/10.
//
// Antes: busca, um interruptor desenhado à mão, o botão "Filtros" que abria
// uma fileira de cinco `Select` cinza (evento, função, colaborador, status,
// nota) e, embaixo, até três faixas cinza "Filtro ativo".
//
// Agora a barra de filtros comum das telas do Financeiro (components/common):
// busca por colaborador (Esc limpa), a função à vista com quantas sobram,
// situação, nota fiscal e colaborador em "Filtros" (com o número de ligados),
// e o interruptor de concluídos/recusados. Embaixo, numa linha só, o recorte
// em vigor por extenso (com o seu "Limpar"), as etiquetas removíveis e
// "Limpar filtros". O evento mora na barra de contexto, como no Planejado.
// Só apresentação — o estado vem de `useRhFiltros`; as opções são as de antes.
import { CircleDot, ListFilter } from "lucide-react";
import { BuscaDaLista, EtiquetaDeFiltro, LimparFiltros, MaisFiltros, type ListaCurta } from "@/components/common/barra-de-filtros";
import { FiltroUnico, type OpcaoDeFiltro } from "@/components/common/filter-popover";
import { cn } from "@/lib/utils";
import { STATUS_ORDER, type PrestacaoStatus } from "./prestacao-types";
import { statusConfig } from "./status-config";
import type { RhFiltros } from "./use-rh-filtros";

const LISTA_STATUS: ListaCurta = {
  chave: "status", titulo: "Situação", etiqueta: "Situação", testid: "rh-filtro-status",
  opcoes: [
    { id: "all", nome: "Todas" },
    { id: "planejamento_pendente", nome: "Aguardando planejamento" },
    { id: "aguardando_prestacao", nome: "Aguardando realizado" },
    { id: "prestacao_recebida", nome: "Análise pendente" },
    { id: "devolvida_para_ajuste", nome: "Devolvida para ajuste" },
    { id: "aprovada_faturamento", nome: "Aprovada para faturamento" },
    { id: "recusada", nome: "Recusada" },
  ],
};
const LISTA_NF: ListaCurta = {
  chave: "nf", titulo: "Nota fiscal", etiqueta: "Nota", testid: "rh-filtro-nf",
  opcoes: [
    { id: "all", nome: "Todas as notas" },
    { id: "pendente", nome: "Aguardando nota" },
    { id: "enviada", nome: "Aguardando aprovação RH" },
    { id: "devolvida", nome: "Devolvida" },
    { id: "aprovada", nome: "Aprovada" },
    { id: "recusada", nome: "NF recusada" },
  ],
};
const LISTA_COLAB: ListaCurta = {
  chave: "colab", titulo: "Colaborador", etiqueta: "Colaborador", testid: "rh-filtro-colaborador",
  opcoes: [
    { id: "all", nome: "Todos" },
    { id: "definido", nome: "Com colaborador" },
    { id: "a_definir", nome: "Colaborador a definir" },
  ],
};

const statusReal = (s: PrestacaoStatus) => (STATUS_ORDER as string[]).includes(s);

export interface RhFiltersProps {
  filtros: RhFiltros;
  /** Funções presentes na fila, com quantas prestações sobram em cada uma. */
  opcoesDeFuncao: OpcaoDeFiltro[];
  concludedCount: number;
  recusadaCount: number;
  /** Itens visíveis após o filtro (para o "Mostrando apenas … (N itens)"). */
  filteredCount: number;
}

export function RhFilters(p: RhFiltersProps) {
  const { filtros: f, opcoesDeFuncao, concludedCount, recusadaCount, filteredCount } = p;
  const itens = `${filteredCount} ite${filteredCount === 1 ? "m" : "ns"}`;
  // "Limpar filtros" zera tudo, inclusive o evento da barra (como antes).
  const limparTudo = () => { f.setFilterEvent("all"); f.setFilterFunction("all"); f.setFilterCollaborator("all"); f.setFilterStatus("all"); f.setFilterInvoiceStatus("all"); f.setSearchTerm(""); f.setFilterCheckinOnly(false); };
  const limparRecorte = () => { f.setFilterStatus("all"); f.setFilterCheckinOnly(false); };

  const valorDe = (chave: string) => (chave === "status" ? (statusReal(f.filterStatus) ? f.filterStatus : "all") : chave === "nf" ? f.filterInvoiceStatus : f.filterCollaborator);
  const contagem = [statusReal(f.filterStatus), f.filterInvoiceStatus !== "all", f.filterCollaborator !== "all"].filter(Boolean).length;
  const ocultos = concludedCount + recusadaCount;

  // Linha do recorte: algo além da busca e do evento está ligado.
  const temLinha = f.filterStatus !== "all" || f.filterCheckinOnly || f.filterFunction !== "all" || f.filterInvoiceStatus !== "all" || f.filterCollaborator !== "all";
  const nomeDoRecorte = f.filterStatus === "rh_action" ? "pendências do RH"
    : f.filterStatus !== "all" ? statusConfig[f.filterStatus].label.toLowerCase()
    : "";

  return (
    <div className="space-y-2" role="search" aria-label="Filtros da fila">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
        <BuscaDaLista
          valor={f.searchTerm}
          onChange={f.setSearchTerm}
          placeholder="Buscar colaborador"
          rotulo="Buscar prestação pelo nome do colaborador"
          testid="rh-busca"
        />
        {/* Celular: a fileira rola de lado em vez de empilhar os controles. */}
        <div className="pas-rolagem-x -mx-[var(--page-gutter)] flex items-center gap-1.5 px-[var(--page-gutter)] sm:contents">
          <div className="shrink-0 max-w-[220px]">
            <FiltroUnico
              valor={f.filterFunction}
              onChange={f.setFilterFunction}
              opcoes={opcoesDeFuncao}
              rotuloTodos="Todas as funções"
              placeholderBusca="Buscar função…"
              testid="rh-filtro-funcao"
            />
          </div>
          <MaisFiltros
            listas={[LISTA_STATUS, LISTA_NF, LISTA_COLAB]}
            valorDe={valorDe}
            onEscolher={(chave, id) => {
              if (chave === "status") f.setFilterStatus(id as PrestacaoStatus);
              else if (chave === "nf") f.setFilterInvoiceStatus(id);
              else f.setFilterCollaborator(id);
            }}
            contagem={contagem}
            mostrarPadrao={contagem > 0}
            onPadrao={() => { if (statusReal(f.filterStatus)) f.setFilterStatus("all"); f.setFilterInvoiceStatus("all"); f.setFilterCollaborator("all"); }}
            testid="rh-filtros"
          />
          <button
            type="button"
            role="switch"
            aria-checked={f.showConcluded}
            onClick={() => f.setShowConcluded(!f.showConcluded)}
            title="Concluídos e recusados ficam ocultos por padrão; ligado, eles são acrescentados à lista"
            className={cn(
              "pas-alvo crh-interruptor inline-flex shrink-0 items-center gap-2 h-[34px] pl-2.5 pr-3 rounded-lg border bg-card text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:border-primary",
              f.showConcluded ? "border-primary/40 text-primary" : "border-border text-slate-700 hover:bg-muted",
            )}
            data-testid="rh-mostrar-concluidos"
          >
            <span aria-hidden="true" className={cn("crh-chave", f.showConcluded && "crh-chave-on")}><span /></span>
            Concluídos e recusados
            {ocultos > 0 && <span className="text-xs text-muted-foreground tabular-nums">{ocultos}</span>}
          </button>
        </div>
      </div>

      {temLinha && (
        <div className="flex flex-wrap items-center gap-1.5 pas-entra">
          {nomeDoRecorte && (
            <div className="crh-recorte">
              <ListFilter className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Mostrando apenas {nomeDoRecorte} ({itens})
              <button type="button" className="crh-recorte-limpar" onClick={limparRecorte}>Limpar</button>
            </div>
          )}
          {f.filterCheckinOnly && (
            <div className="crh-recorte">
              <CircleDot className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Mostrando apenas check-ins pendentes ({itens})
              <button type="button" className="crh-recorte-limpar" onClick={() => f.setFilterCheckinOnly(false)}>Limpar</button>
            </div>
          )}
          {f.filterFunction !== "all" && (
            <EtiquetaDeFiltro etiqueta="Função" valor={opcoesDeFuncao.find(o => o.id === f.filterFunction)?.nome ?? "—"} titulo="Função" onTirar={() => f.setFilterFunction("all")} />
          )}
          {f.filterInvoiceStatus !== "all" && (
            <EtiquetaDeFiltro etiqueta="Nota" valor={LISTA_NF.opcoes.find(o => o.id === f.filterInvoiceStatus)?.nome} titulo="Nota fiscal" onTirar={() => f.setFilterInvoiceStatus("all")} />
          )}
          {f.filterCollaborator !== "all" && (
            <EtiquetaDeFiltro etiqueta="Colaborador" valor={LISTA_COLAB.opcoes.find(o => o.id === f.filterCollaborator)?.nome} titulo="Colaborador" onTirar={() => f.setFilterCollaborator("all")} />
          )}
          <LimparFiltros onClick={limparTudo} testid="rh-limpar-filtros" />
        </div>
      )}
    </div>
  );
}

export default RhFilters;
