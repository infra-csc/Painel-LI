/**
 * Barra de trabalho do espelho (25/09 — extraída da página): visões, busca,
 * popover de filtros e popover de exibição (densidade + blocos da grade).
 * Fixa no topo ao rolar — antes as abas sumiam e a grade passava por cima do cabeçalho.
 */
import { Search, X, SlidersHorizontal, Filter, Eraser, Columns3, Rows3, AlignJustify } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { resumoDoEvento } from "@shared/mirror-pendencia";
import { ALL_BLOCKS, SITUACOES, VIEWS } from "./mirror-shared";
import type { MirrorFilters } from "./use-mirror-filters";

export interface MirrorToolbarProps {
  filtros: MirrorFilters;
  resumo: ReturnType<typeof resumoDoEvento>;
  totalPessoas: number;
  departments: string[];
  hotels: string[];
  /** Contadores das abas Quartos/Uber. */
  roomGroupsCount: number;
  uberGroupsCount: number;
}

export function MirrorToolbar({ filtros, resumo, totalPessoas, departments, hotels, roomGroupsCount, uberGroupsCount }: MirrorToolbarProps) {
  const {
    view, setView, density, setDensity, searchText, setSearchText, deptFilter, setDeptFilter, hotelFilter, setHotelFilter,
    situacoes, setSituacoes, hiddenBlocks, setHiddenBlocks, filteredRows, activeFilterCount, clearFilters,
  } = filtros;
  return (
    <div className="sticky top-[calc(var(--sticky-top)+3.5rem)] z-30 -mx-[var(--page-gutter)] px-[var(--page-gutter)] py-2.5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-card p-0.5" role="tablist" aria-label="Visões do espelho">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const count = v.key === "quartos" ? roomGroupsCount : v.key === "uber" ? uberGroupsCount : v.key === "departamentos" ? departments.length : undefined;
            const activo = view === v.key;
            return (
              <button key={v.key} onClick={() => setView(v.key)} data-testid={`view-${v.key}`}
                role="tab" aria-selected={activo}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  activo ? "bg-primary text-primary-foreground shadow-1" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden md:inline">{v.label}</span>
                {count !== undefined && count > 0 && (
                  <span className={`rounded-full px-1.5 text-2xs tabular-nums ${activo ? "bg-primary-foreground/20" : "bg-muted-foreground/15"}`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-auto sm:ml-auto order-last sm:order-none">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Buscar colaborador…"
            aria-label="Buscar colaborador pelo nome" className="pl-8 h-9 w-40 lg:w-52" data-testid="input-search" />
          {searchText && (
            <button type="button" onClick={() => setSearchText("")} aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9" data-testid="button-filters">
              <SlidersHorizontal className="h-4 w-4 sm:mr-2" aria-hidden="true" />
              <span className="hidden sm:inline">Filtros</span>
              {activeFilterCount > 0 && <Badge className="ml-2 h-5 px-1.5 tabular-nums">{activeFilterCount}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[560px] max-w-[92vw]" align="end">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" aria-hidden="true" /> Filtros</span>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearFilters}><Eraser className="h-3 w-3 mr-1" aria-hidden="true" /> Limpar</Button>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Departamento</Label>
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                  <SelectTrigger className="mt-1 h-8" aria-label="Filtrar por departamento"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {departments.map((d) => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {hotels.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Hotel</Label>
                  <Select value={hotelFilter} onValueChange={setHotelFilter}>
                    <SelectTrigger className="mt-1 h-8" aria-label="Filtrar por hotel"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {hotels.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Separator />
              {/* Cada filtro diz quantas pessoas ele devolveria ANTES do
                  clique: sem isso, filtrar era às cegas — marcar, ver a
                  lista vazia, desmarcar. */}
              <div className="space-y-1">
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Situação</p>
                {SITUACOES.map((st) => {
                  const quantas = st.key === "comPendencia" ? resumo.pessoasTravando
                    : st.key === "pronto" ? totalPessoas - resumo.pessoasTravando
                    : resumo.comSugestao;
                  const marcada = situacoes.has(st.key);
                  return (
                    <label key={st.key}
                      className={`flex h-7 items-center gap-2 rounded px-1 text-sm ${quantas === 0 && !marcada ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-muted/60"}`}>
                      <Checkbox checked={marcada} disabled={quantas === 0 && !marcada}
                        onCheckedChange={(v) => setSituacoes((s) => { const n = new Set(s); if (v) n.add(st.key); else n.delete(st.key); return n; })} />
                      <span className="truncate">{st.label}</span>
                      <span className="ml-auto text-2xs tabular-nums text-muted-foreground">{quantas}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {view === "grade" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9" data-testid="button-columns">
                <Columns3 className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                <span className="hidden lg:inline">Exibição</span>
                {hiddenBlocks.size > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 tabular-nums">
                    {ALL_BLOCKS.length - hiddenBlocks.size} de {ALL_BLOCKS.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60" align="end">
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-semibold">Densidade</span>
                  <ToggleGroup type="single" value={density} onValueChange={(v) => (v === "comfortable" || v === "compact") && setDensity(v)}
                    className="mt-1.5 grid grid-cols-2 gap-1" aria-label="Densidade da grade">
                    <ToggleGroupItem value="comfortable" className="h-8 text-xs gap-1.5" aria-label="Densidade confortável">
                      <Rows3 className="h-3.5 w-3.5" aria-hidden="true" /> Confortável
                    </ToggleGroupItem>
                    <ToggleGroupItem value="compact" className="h-8 text-xs gap-1.5" aria-label="Densidade compacta">
                      <AlignJustify className="h-3.5 w-3.5" aria-hidden="true" /> Compacta
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Blocos da grade</span>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setHiddenBlocks(new Set())}>Mostrar tudo</Button>
                </div>
                {/* O ponto é a identidade da etapa (a mesma da faixa de
                    fechamento e do cabeçalho da grade) e "N colunas" diz
                    o que se ganha de espaço ao esconder o bloco. */}
                {ALL_BLOCKS.map((b) => (
                  <label key={b.key} className="flex h-8 items-center gap-2 text-sm cursor-pointer rounded px-1 hover:bg-muted/60">
                    <Checkbox checked={!hiddenBlocks.has(b.key)} onCheckedChange={(v) => setHiddenBlocks((s) => { const n = new Set(s); if (v) n.delete(b.key); else n.add(b.key); return n; })} />
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${b.ponto}`} aria-hidden="true" />
                    <span className="truncate">{b.label}</span>
                    <span className="ml-auto text-2xs tabular-nums text-muted-foreground">{b.colunas} colunas</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

      </div>

      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
          <span>Mostrando <strong className="text-foreground tabular-nums">{filteredRows.length}</strong> de {totalPessoas} colaboradores</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearFilters}>
            <Eraser className="h-3 w-3 mr-1" aria-hidden="true" /> Limpar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
