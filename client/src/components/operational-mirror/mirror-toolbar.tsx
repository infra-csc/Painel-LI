/**
 * Barra de trabalho do espelho (25/09 — extraída da página; redesenho 07/10):
 * visões, busca, filtros e — só na Grade — exibição e o interruptor de edição.
 *
 * Fixa abaixo da barra da tela ao rolar (a partir de md; no celular ela tem
 * duas fileiras e ficaria por cima do conteúdo). As visões são o mesmo
 * segmentado da Escalação; a busca e o botão "Filtros" são as peças comuns de
 * Passagens e Hospedagem. Filtro ligado vira etiqueta removível embaixo — um
 * filtro nunca fica escondido dentro de um popover.
 */
import { Pencil, Columns3, Rows3, AlignJustify, SlidersHorizontal } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BuscaDaLista, EtiquetaDeFiltro, LimparFiltros } from "@/components/common/barra-de-filtros";
import { CHIPS_DE_PENDENCIA, ROTULO_DO_BLOCO, blocoPendencia, type resumoDoEvento } from "@shared/mirror-pendencia";
import { cn } from "@/lib/utils";
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
  /** Interruptor de edição da grade (só para quem pode editar). */
  canEdit: boolean;
  editModeWanted: boolean;
  setEditModeWanted: (v: boolean) => void;
}

/** O botão de popover da barra — o mesmo "Filtros" de Passagens e Hospedagem. */
const BOTAO = "esp-alvo inline-flex shrink-0 items-center gap-1.5 h-[34px] px-3 rounded-lg border bg-card text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:border-primary data-[state=open]:border-primary/60";

export function MirrorToolbar({
  filtros, resumo, totalPessoas, departments, hotels, roomGroupsCount, uberGroupsCount,
  canEdit, editModeWanted, setEditModeWanted,
}: MirrorToolbarProps) {
  const {
    view, setView, density, setDensity, searchText, setSearchText, deptFilter, setDeptFilter, hotelFilter, setHotelFilter,
    situacoes, setSituacoes, hiddenBlocks, setHiddenBlocks, filteredRows, activeFilterCount, clearFilters,
    chip, setChip, blocoFiltro, setBlocoFiltro, estreito,
  } = filtros;
  // Os do popover — o número no botão "Filtros".
  const noPopover = (deptFilter !== "all" ? 1 : 0) + (hotelFilter !== "all" ? 1 : 0) + situacoes.size;
  const naGrade = view === "grade" && !estreito;
  const tirarSituacao = (k: string) => setSituacoes((s) => { const n = new Set(s); n.delete(k as never); return n; });

  return (
    <div className="esp-ferramentas z-20 -mx-[var(--page-gutter)] border-b border-border bg-background/95 px-[var(--page-gutter)] py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:sticky" data-testid="mirror-toolbar">
      <div className="flex flex-wrap items-center gap-2">
        {/* Visões: o segmentado da Escalação. No celular rola de lado com os
            rótulos à vista — ícone sozinho não dizia o que era cada aba. */}
        <div className="esp-rolagem-x -mx-1 w-[calc(100%+0.5rem)] px-1 min-[1340px]:mx-0 min-[1340px]:w-auto min-[1340px]:px-0">
          <div className="inline-flex gap-0.5 rounded-lg border border-border bg-background p-[3px]" role="tablist" aria-label="Visões do espelho">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const count = v.key === "quartos" ? roomGroupsCount : v.key === "uber" ? uberGroupsCount : v.key === "departamentos" ? departments.length : undefined;
              const ativo = view === v.key;
              return (
                <button key={v.key} type="button" onClick={() => setView(v.key)} data-testid={`view-${v.key}`}
                  role="tab" aria-selected={ativo}
                  className={cn(
                    "esp-alvo inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-[11px] text-sm transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    ativo ? "bg-card font-semibold text-primary shadow-1 ring-1 ring-border" : "font-medium text-muted-foreground hover:text-foreground",
                  )}>
                  {/* Ícones só a partir de 1536 e abaixo de 1340: na faixa do meio a barra
                      é uma fileira só e o espaço vai para a busca. */}
                  <Icon className="h-[15px] w-[15px] min-[1340px]:max-2xl:hidden" aria-hidden="true" />
                  <span className={cn(v.key === "departamentos" && "hidden 2xl:inline")}>{v.label}</span>
                  {v.key === "departamentos" && <span className="2xl:hidden" title="Departamentos">Deptos.</span>}
                  {count !== undefined && count > 0 && (
                    <span className={cn("rounded px-1 text-2xs font-semibold tabular-nums", ativo ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground")}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="ml-auto flex w-full min-w-0 items-center justify-end gap-2 min-[1340px]:w-auto min-[1340px]:flex-1">
          <div className="min-w-[120px] flex-1 min-[1340px]:max-w-[260px] [&>div]:max-w-none [&>div]:min-w-0">
            <BuscaDaLista valor={searchText} onChange={setSearchText} placeholder="Buscar pessoa…" rotulo="Buscar colaborador pelo nome" testid="input-search" compacta />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className={cn(BOTAO, noPopover > 0 ? "border-primary/40 text-primary" : "border-border text-slate-700 hover:bg-muted")} data-testid="button-filters" aria-label="Filtros">
                <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="hidden sm:inline">Filtros</span>
                {noPopover > 0 && (
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold tabular-nums text-primary-foreground">{noPopover}</span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(520px,calc(100vw-24px))] overflow-hidden rounded-xl p-0" align="end" collisionPadding={12}>
              <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
                <span className="text-sm font-semibold text-foreground">Filtros</span>
                {activeFilterCount > 0 && (
                  <button type="button" onClick={clearFilters} className="ml-auto h-[26px] rounded-md px-2.5 text-xs font-medium text-primary hover:bg-brand-soft">
                    Limpar tudo
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 p-3.5 sm:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <Label className="px-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Departamento</Label>
                    <Select value={deptFilter} onValueChange={setDeptFilter}>
                      <SelectTrigger className="mt-1 h-9" aria-label="Filtrar por departamento"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {departments.map((d) => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {hotels.length > 0 && (
                    <div>
                      <Label className="px-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Hotel</Label>
                      <Select value={hotelFilter} onValueChange={setHotelFilter}>
                        <SelectTrigger className="mt-1 h-9" aria-label="Filtrar por hotel"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {hotels.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {/* Cada filtro diz quantas pessoas ele devolveria ANTES do
                    clique: sem isso, filtrar era às cegas — marcar, ver a
                    lista vazia, desmarcar. */}
                <div>
                  <p className="mb-1 px-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Situação</p>
                  <div className="flex flex-col gap-px">
                    {SITUACOES.map((st) => {
                      const quantas = st.key === "comPendencia" ? resumo.pessoasTravando
                        : st.key === "pronto" ? totalPessoas - resumo.pessoasTravando
                        : resumo.comSugestao;
                      const marcada = situacoes.has(st.key);
                      return (
                        <label key={st.key}
                          className={cn("flex min-h-[32px] items-center gap-2 rounded-md px-2 text-sm transition-colors",
                            quantas === 0 && !marcada ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-muted",
                            marcada ? "font-medium text-primary" : "text-slate-700")}>
                          <Checkbox checked={marcada} disabled={quantas === 0 && !marcada}
                            onCheckedChange={(v) => setSituacoes((s) => { const n = new Set(s); if (v) n.add(st.key); else n.delete(st.key); return n; })} />
                          <span className="truncate">{st.label}</span>
                          <span className="ml-auto text-2xs tabular-nums text-muted-foreground">{quantas}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {naGrade && (
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button type="button" className={cn(BOTAO, "px-2.5", hiddenBlocks.size > 0 ? "border-primary/40 text-primary" : "border-border text-slate-700 hover:bg-muted")}
                      data-testid="button-columns" aria-label="Exibição da grade">
                      <Columns3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="hidden 2xl:inline">Exibição</span>
                      {hiddenBlocks.size > 0 && (
                        <span className="rounded bg-brand-soft px-1 text-2xs font-semibold tabular-nums text-primary">
                          {ALL_BLOCKS.length - hiddenBlocks.size} de {ALL_BLOCKS.length}
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Densidade e blocos da grade</TooltipContent>
              </Tooltip>
              <PopoverContent className="w-64 overflow-hidden rounded-xl p-0" align="end" collisionPadding={12}>
                <div className="border-b border-border px-3.5 py-2.5">
                  <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Densidade</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-0.5 rounded-lg border border-border bg-background p-[3px]" role="radiogroup" aria-label="Densidade da grade">
                    {([["comfortable", "Confortável", Rows3], ["compact", "Compacta", AlignJustify]] as const).map(([k, rot, Ic]) => (
                      <button key={k} type="button" role="radio" aria-checked={density === k} onClick={() => setDensity(k)}
                        aria-label={`Densidade ${rot.toLowerCase()}`}
                        className={cn("inline-flex h-7 items-center justify-center gap-1.5 rounded-md text-xs transition-colors",
                          density === k ? "bg-card font-semibold text-primary shadow-1 ring-1 ring-border" : "font-medium text-muted-foreground hover:text-foreground")}>
                        <Ic className="h-3.5 w-3.5" aria-hidden="true" /> {rot}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-2 py-2">
                  <div className="flex items-center justify-between px-1.5 pb-1">
                    <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Blocos da grade</p>
                    {hiddenBlocks.size > 0 && (
                      <button type="button" className="h-6 rounded-md px-2 text-xs font-medium text-primary hover:bg-brand-soft" onClick={() => setHiddenBlocks(new Set())}>Mostrar tudo</button>
                    )}
                  </div>
                  {/* O ponto é a identidade da etapa (a mesma do placar e do
                      cabeçalho da grade) e "N colunas" diz o que se ganha de
                      espaço ao esconder o bloco. */}
                  {ALL_BLOCKS.map((b) => (
                    <label key={b.key} className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 text-sm hover:bg-muted">
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

          {naGrade && canEdit && (
            <Tooltip>
              <TooltipTrigger asChild>
                <label htmlFor="mirror-edit-mode"
                  className={cn("esp-alvo inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm font-medium transition-colors",
                    editModeWanted ? "border-primary/30 bg-brand-soft text-primary" : "border-border bg-card text-slate-700 hover:bg-muted")}>
                  <Switch id="mirror-edit-mode" checked={editModeWanted} onCheckedChange={setEditModeWanted} data-testid="button-edit-mode" className="scale-90" />
                  <Pencil className="h-3.5 w-3.5 xl:hidden" aria-hidden="true" />
                  <span className="hidden xl:inline">Edição</span>
                </label>
              </TooltipTrigger>
              <TooltipContent>{editModeWanted ? "Desliga a edição nas células — a grade vira só leitura" : "Liga a edição direto nas células da grade"}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className="pas-entra flex flex-wrap items-center gap-1.5 pt-2" data-testid="mirror-filtros-ativos">
          <span className="mr-1 text-xs text-muted-foreground" aria-live="polite">
            <strong className="font-semibold tabular-nums text-foreground">{filteredRows.length}</strong> de {totalPessoas} {totalPessoas === 1 ? "pessoa" : "pessoas"}
          </span>
          {chip && <EtiquetaDeFiltro etiqueta="Pendência" valor={CHIPS_DE_PENDENCIA.find((c) => c.key === chip)?.label ?? chip} titulo="de pendência" onTirar={() => setChip(null)} />}
          {blocoFiltro && <EtiquetaDeFiltro etiqueta={blocoPendencia(blocoFiltro) ? "Falta em" : "Com"} valor={ROTULO_DO_BLOCO[blocoFiltro]} titulo="do bloco" onTirar={() => setBlocoFiltro(null)} />}
          {deptFilter !== "all" && <EtiquetaDeFiltro etiqueta="Depto." valor={<span className="capitalize">{deptFilter}</span>} titulo="de departamento" onTirar={() => setDeptFilter("all")} />}
          {hotelFilter !== "all" && <EtiquetaDeFiltro etiqueta="Hotel" valor={hotelFilter} titulo="de hotel" onTirar={() => setHotelFilter("all")} />}
          {SITUACOES.filter((s) => situacoes.has(s.key)).map((s) => (
            <EtiquetaDeFiltro key={s.key} etiqueta="Situação" valor={s.label} titulo={`de situação ${s.label}`} onTirar={() => tirarSituacao(s.key)} />
          ))}
          {searchText && <EtiquetaDeFiltro etiqueta="Busca" valor={`“${searchText}”`} titulo="de busca" onTirar={() => setSearchText("")} />}
          <LimparFiltros onClick={clearFilters} />
        </div>
      )}
    </div>
  );
}

