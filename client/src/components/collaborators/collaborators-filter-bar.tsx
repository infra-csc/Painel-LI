/**
 * Barra de filtros da lista de Colaboradores (25/09 — extraída de pages/collaborator-management.tsx):
 * busca por nome/documento, status, tipo, "Limpar" e a contagem do recorte.
 */
import { Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CollaboratorsList } from "./use-collaborators-list";

export function CollaboratorsFilterBar({ lista, podeVerDadosPessoais }: { lista: CollaboratorsList; podeVerDadosPessoais: boolean }) {
  const { filters, setFilter, clearFilters, hasFilters, filtered } = lista;
  return (
    <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2.5 bg-muted/30">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
        <input
          id="collaborators-search"
          type="text"
          aria-label={podeVerDadosPessoais ? "Buscar por nome ou documento" : "Buscar por nome"}
          placeholder={podeVerDadosPessoais ? "Buscar por nome ou documento…" : "Buscar por nome…"}
          value={filters.search}
          onChange={e => setFilter("search", e.target.value)}
          className="w-full h-8 pl-9 pr-8 bg-card border border-border rounded-lg text-sm text-slate-700 placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring/20 transition-all"
        />
        {filters.search && (
          <button onClick={() => setFilter("search", "")} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600">
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Status filter */}
      <Select value={filters.status} onValueChange={v => setFilter("status", v)}>
        <SelectTrigger aria-label="Filtrar por status" className="h-8 w-[145px] text-xs border-input rounded-lg bg-card focus:border-primary focus:ring-1 focus:ring-ring/20">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value="all">Todos os Status</SelectItem>
          <SelectItem value="pendente">Pendente</SelectItem>
          <SelectItem value="aprovado">Aprovado</SelectItem>
          <SelectItem value="rejeitado">Rejeitado</SelectItem>
          <SelectItem value="inativo">Inativo</SelectItem>
        </SelectContent>
      </Select>

      {/* Type filter */}
      <Select value={filters.type} onValueChange={v => setFilter("type", v)}>
        <SelectTrigger aria-label="Filtrar por tipo" className="h-8 w-[145px] text-xs border-input rounded-lg bg-card focus:border-primary focus:ring-1 focus:ring-ring/20">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value="all">Todos os Tipos</SelectItem>
          <SelectItem value="casa">Casa</SelectItem>
          <SelectItem value="freela">Freela</SelectItem>
          <SelectItem value="local">Local</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <button
          onClick={clearFilters}
          className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-dashed border-slate-300 rounded-lg hover:bg-surface-muted hover:border-slate-400 transition-colors"
        >
          <X className="w-3 h-3" aria-hidden="true" /> Limpar
        </button>
      )}

      {hasFilters && (
        <span className="text-2xs text-muted-foreground ml-1">
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
