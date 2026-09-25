// Extraído de rh-control.tsx em 25/09 (modularização): busca, toggle
// "Mostrar concluídos e recusados", botão Filtros (com contador), os 5 selects
// e as faixas "Filtro ativo". Só apresentação — o estado vem de `useRhFiltros`
// e os dados de `useRhControlData`.
import { useState } from "react";
import { CircleDot, Filter, Search, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PrestacaoStatus } from "./prestacao-types";
import { statusConfig } from "./status-config";
import type { EventoDoSelect, RhControlData } from "./use-rh-control-data";
import type { RhFiltros } from "./use-rh-filtros";

const ITEM_CLS = "hover:bg-brand-soft hover:text-primary-hover cursor-pointer focus:bg-brand-soft focus:text-primary-hover data-[state=checked]:bg-brand-soft data-[state=checked]:text-primary data-[state=checked]:font-medium";

export interface RhFiltersProps {
  filtros: RhFiltros;
  /** Eventos com escalação (/api/events-with-inclusions) — opções do select. */
  eventos: EventoDoSelect[];
  /** Funções presentes nas linhas (vêm no payload do servidor, já ordenadas). */
  funcoes: RhControlData["funcoes"];
  concludedCount: number;
  recusadaCount: number;
  /** Itens visíveis após o filtro (para as faixas "Filtro ativo (N itens)"). */
  filteredCount: number;
}

export function RhFilters(p: RhFiltersProps) {
  const { filtros: f, eventos, funcoes, concludedCount, recusadaCount, filteredCount } = p;
  const [showFilters, setShowFilters] = useState(false);
  const itens = `${filteredCount} ite${filteredCount === 1 ? "m" : "ns"}`;
  const limparTudo = () => { f.setFilterEvent("all"); f.setFilterFunction("all"); f.setFilterCollaborator("all"); f.setFilterStatus("all"); f.setFilterInvoiceStatus("all"); f.setSearchTerm(""); f.setFilterCheckinOnly(false); };

  return (
    <>
      {/* ── Search + filters ── */}
      <div className="space-y-2">
        {/* flex-wrap: em ~375px a linha busca+toggle quebra em vez de estourar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Buscar por colaborador…"
              value={f.searchTerm}
              onChange={e => f.setSearchTerm(e.target.value)}
              className="h-8 pl-9 text-xs border-border"
            />
          </div>

          <button
            className={`h-8 px-3 text-xs rounded-md border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              f.showConcluded ? "border-primary/40 text-primary bg-brand-soft" : "border-border text-muted-foreground hover:border-slate-300 bg-card"
            }`}
            onClick={() => f.setShowConcluded(!f.showConcluded)}
            aria-pressed={f.showConcluded}
            title="Concluídos e recusados ficam ocultos por padrão; ligado, eles são acrescentados à lista"
          >
            <div className={`w-7 h-4 rounded-full relative flex items-center transition-all ${f.showConcluded ? "bg-primary" : "bg-border"}`}>
              <div className={`w-3 h-3 rounded-full bg-card shadow-1 transition-transform ${f.showConcluded ? "translate-x-3.5" : "translate-x-0.5"}`} />
            </div>
            Mostrar concluídos e recusados
            {(concludedCount + recusadaCount) > 0 && <span className="text-2xs text-muted-foreground">({concludedCount + recusadaCount})</span>}
          </button>

          <Button variant="outline" size="sm"
            className={`h-8 text-xs gap-1.5 ${f.hasActiveFilters ? "border-primary/40 text-primary bg-brand-soft" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-3.5 h-3.5" aria-hidden="true" />
            Filtros
            {f.hasActiveFilters && (
              <span className="bg-primary text-primary-foreground text-2xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {[
                  f.filterEvent !== "all",
                  f.filterFunction !== "all",
                  f.filterCollaborator !== "all",
                  f.filterStatus !== "all", // inclui os 4 card-filtros (rh_action também)
                  f.filterInvoiceStatus !== "all",
                  f.searchTerm !== "",
                  f.filterCheckinOnly,
                ].filter(Boolean).length}
              </span>
            )}
          </Button>
          {f.hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-slate-600"
              onClick={limparTudo}>
              Limpar
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={f.filterEvent} onValueChange={f.setFilterEvent}>
              <SelectTrigger className="h-9 text-sm w-auto min-w-[192px] border border-border rounded-lg bg-card text-slate-700 hover:border-primary/40 transition-colors focus:ring-2 focus:ring-primary/25"><SelectValue placeholder="Evento" /></SelectTrigger>
              <SelectContent className="bg-card border border-border rounded-xl shadow-2 min-w-[220px]">
                <SelectItem value="all" className={ITEM_CLS}>Todos os eventos</SelectItem>
                {eventos.map(e => <SelectItem key={e.id} value={e.id} className={ITEM_CLS}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={f.filterFunction} onValueChange={f.setFilterFunction}>
              <SelectTrigger className="h-9 text-sm w-auto min-w-[176px] border border-border rounded-lg bg-card text-slate-700 hover:border-primary/40 transition-colors focus:ring-2 focus:ring-primary/25"><SelectValue placeholder="Função" /></SelectTrigger>
              <SelectContent className="bg-card border border-border rounded-xl shadow-2 min-w-[200px]">
                <SelectItem value="all" className={ITEM_CLS}>Todas as funções</SelectItem>
                {funcoes.map(fn => <SelectItem key={fn.id} value={fn.id} className={ITEM_CLS}>{fn.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={f.filterCollaborator} onValueChange={f.setFilterCollaborator}>
              <SelectTrigger className="h-9 text-sm w-auto min-w-[192px] border border-border rounded-lg bg-card text-slate-700 hover:border-primary/40 transition-colors focus:ring-2 focus:ring-primary/25"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent className="bg-card border border-border rounded-xl shadow-2 min-w-[220px]">
                <SelectItem value="all" className={ITEM_CLS}>Todos os colaboradores</SelectItem>
                <SelectItem value="definido" className={ITEM_CLS}>Com colaborador</SelectItem>
                <SelectItem value="a_definir" className={ITEM_CLS}>Colaborador a definir</SelectItem>
              </SelectContent>
            </Select>
            <Select value={f.filterStatus} onValueChange={(v) => f.setFilterStatus(v as PrestacaoStatus)}>
              <SelectTrigger className="h-9 text-sm w-auto min-w-[220px] border border-border rounded-lg bg-card text-slate-700 hover:border-primary/40 transition-colors focus:ring-2 focus:ring-primary/25"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent className="bg-card border border-border rounded-xl shadow-2 min-w-[240px]">
                <SelectItem value="all" className={ITEM_CLS}>Todos os status</SelectItem>
                <SelectItem value="planejamento_pendente" className={ITEM_CLS}>Aguardando planejamento</SelectItem>
                <SelectItem value="aguardando_prestacao" className={ITEM_CLS}>Aguardando realizado</SelectItem>
                <SelectItem value="prestacao_recebida" className={ITEM_CLS}>Análise pendente</SelectItem>
                <SelectItem value="devolvida_para_ajuste" className={ITEM_CLS}>Devolvida para ajuste</SelectItem>
                <SelectItem value="aprovada_faturamento" className={ITEM_CLS}>Aprovada para faturamento</SelectItem>
                <SelectItem value="recusada" className={ITEM_CLS}>Recusada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={f.filterInvoiceStatus} onValueChange={f.setFilterInvoiceStatus}>
              <SelectTrigger className={`h-9 text-sm w-auto min-w-[200px] border rounded-lg bg-card transition-colors focus:ring-2 focus:ring-primary/25 ${f.filterInvoiceStatus !== "all" ? "border-primary/40 text-primary" : "border-border text-slate-700 hover:border-primary/40"}`}><SelectValue placeholder="Nota Fiscal" /></SelectTrigger>
              <SelectContent className="bg-card border border-border rounded-xl shadow-2 min-w-[220px]">
                <SelectItem value="all" className={ITEM_CLS}>Todas as notas</SelectItem>
                <SelectItem value="pendente" className={ITEM_CLS}>Aguardando nota</SelectItem>
                <SelectItem value="enviada" className={ITEM_CLS}>Aguardando aprovação RH</SelectItem>
                <SelectItem value="devolvida" className={ITEM_CLS}>Devolvida</SelectItem>
                <SelectItem value="aprovada" className={ITEM_CLS}>Aprovada</SelectItem>
                <SelectItem value="recusada" className={ITEM_CLS}>NF recusada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {f.isRhFilterActive && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface-muted border border-border text-xs text-muted-foreground">
          <Shield className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          Mostrando apenas pendências do RH ({itens})
          <button className="ml-auto text-primary hover:text-primary-hover font-medium" onClick={() => { f.setFilterStatus("all"); f.setFilterCheckinOnly(false); }}>Limpar</button>
        </div>
      )}
      {f.filterCheckinOnly && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-brand-soft border border-primary/25 text-xs text-primary">
          <CircleDot className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
          Mostrando apenas check-ins pendentes ({itens})
          <button className="ml-auto text-primary hover:text-primary-hover font-medium" onClick={() => f.setFilterCheckinOnly(false)}>Limpar</button>
        </div>
      )}
      {(f.filterStatus !== "all" && f.filterStatus !== "rh_action") && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface-muted border border-border text-xs text-muted-foreground">
          <Shield className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          Filtro ativo: {statusConfig[f.filterStatus].label} ({itens})
          <button className="ml-auto text-primary hover:text-primary-hover font-medium" onClick={() => { f.setFilterStatus("all"); f.setFilterCheckinOnly(false); }}>Limpar</button>
        </div>
      )}
    </>
  );
}

export default RhFilters;
