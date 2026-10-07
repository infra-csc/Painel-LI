/**
 * Barra da tela, linha do evento, resumo e filtros da Aprovação (25/09 —
 * extraída de pages/scaling-approval.tsx).
 *
 * 07/10 (redesenho): a mesma linguagem da Validação e da Escalação.
 *  - BARRA de 56px grudada no topo (título + passos do módulo). Antes o
 *    título abria a página com um parágrafo de duas linhas e sumia ao rolar.
 *  - Linha do EVENTO logo abaixo, sem moldura: escolher o evento e, embaixo,
 *    os fatos dele (datas, local) ou de quantos eventos a lista mistura.
 *  - RESUMO numa faixa só: as duas filas que dependem do aprovador (os
 *    números grandes) e os recortes dos pendentes, que são filtros e não
 *    indicadores — antes eram dois cartões + uma fileira de chips soltos
 *    dentro de um cartão com o combobox, a busca e o status misturados.
 *  - BUSCA e STATUS foram para a aba da fila (`FilaToolbar`): só filtram os
 *    pedidos, e lá em cima pareciam filtrar a tela inteira (inclusive as
 *    vagas aguardando, que eles nunca filtraram).
 */
import type { ReactNode } from "react";
import { CalendarDays, CheckSquare, EyeOff, Inbox, Info, MapPin, Search, Square, Stamp, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EventCombobox from "@/components/ui/event-combobox";
import { cn, formatDateRange } from "@/lib/utils";
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";
import { ALL_EVENTS_ROW_LIMIT, CHANGE_REQUEST_STATUS_LABELS, CHANGE_REQUEST_STATUS_VALUES } from "@shared/scaling-validation-rules";
import { ALL, type ApprovalFilters, type ContagemPendentes, type StatusFilter } from "./use-approval-filters";
import type { ApprovalData } from "./use-approval-data";
import type { ApprovalVagas } from "./use-approval-vagas";

const eventos = (n: number) => `${n} ${n === 1 ? "evento" : "eventos"}`;

// ── Barra da tela + linha do evento ─────────────────────────────────────────

export function ApprovalHeader({ d, v, eventId, setEventId, isApprover, readOnlyMode }: {
  d: ApprovalData; v: ApprovalVagas; eventId: string; setEventId: (id: string) => void; isApprover: boolean; readOnlyMode: boolean;
}) {
  const { loadingEvents, activeEvents, selectedEvent } = d;
  const { eventsInSuggestions, suggestionsTruncated } = v;
  return (
    <>
      {/* Barra grudada abaixo da barra do app (`--sticky-top`) — uma linha de
          56px a partir de xl; antes disso, título em cima e os passos embaixo. */}
      <header className="sticky top-[var(--sticky-top)] z-30 -mx-[var(--page-gutter)] -mt-[var(--page-gutter)] flex flex-col gap-y-2 border-b border-border bg-card px-[var(--page-gutter)] py-2.5 xl:h-14 xl:flex-row xl:items-center xl:gap-x-4 xl:py-0">
        <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-[-0.01em] text-foreground">
          <Stamp className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">Aprovação de escala</span>
        </h1>
        <div className="min-w-0">
          <ScalingModuleNav current="approval" eventId={eventId} />
        </div>
        {/* O subtítulo antigo, dito em meia linha onde há espaço — some no
            celular, onde a faixa de resumo logo abaixo já diz o mesmo. */}
        <p className="hidden min-w-0 truncate text-xs text-muted-foreground 2xl:ml-auto 2xl:block">
          Vagas validadas pelas áreas e pedidos de ajuste, inclusão e exclusão, decididos pelo aprovador de cada função.
        </p>
      </header>

      <section aria-label="Evento" className="space-y-2">
        <div className="flex min-w-0 items-center gap-2 sm:max-w-[480px] lg:w-[440px] lg:max-w-[60%]">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            {loadingEvents ? (
              <div className="val-osso h-9" aria-hidden="true" />
            ) : (
              <EventCombobox
                events={activeEvents} value={eventId || ALL} showAllOption
                onValueChange={(val) => setEventId(val === ALL ? "" : val)}
                placeholder="Todos os eventos" testId="scaling-approval-event"
                className="h-9 font-semibold"
              />
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-muted-foreground">
          {selectedEvent ? (
            <>
              <span className="whitespace-nowrap tabular-nums text-slate-700">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
              {selectedEvent.location && (
                <span className="inline-flex min-w-0 items-center gap-1" title={selectedEvent.location}>
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="max-w-[260px] truncate">{selectedEvent.location}</span>
                </span>
              )}
            </>
          ) : (
            <span>
              {isApprover && eventsInSuggestions > 0
                ? `Mostrando vagas de ${eventos(eventsInSuggestions)} — escolha um evento para filtrar.`
                : "Todos os eventos — escolha um para filtrar."}
            </span>
          )}
        </div>
        {/* Teto do modo "todos os eventos": a lista foi cortada, o filtro é a saída. */}
        {!eventId && isApprover && suggestionsTruncated && (
          <p role="status" className="val-entra flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-xs leading-relaxed text-warning">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Só as {ALL_EVENTS_ROW_LIMIT} vagas que esperam há mais tempo cabem nesta lista — escolha um evento para ver a lista completa dele.</span>
          </p>
        )}
      </section>

      {readOnlyMode && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted/70 px-4 py-3 text-sm">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <p className="min-w-0 pt-1 text-slate-700"><span className="font-semibold text-foreground">Modo leitura</span> — você acompanha os pedidos, mas não decide. Quem decide é o aprovador de cada função.</p>
        </div>
      )}
    </>
  );
}

// ── Resumo ──────────────────────────────────────────────────────────────────

export function ApprovalSummary({ f, d, v, counts, isApprover, showMineFilter }: {
  f: ApprovalFilters; d: ApprovalData; v: ApprovalVagas; counts: ContagemPendentes; isApprover: boolean; showMineFilter: boolean;
}) {
  const { recortesForaDoEscopo, activeQuick, lateOnly, setLateOnly, mineOnly, setMineOnly, tab, switchTab, applyQuick } = f;
  const { pendingQuery, forbidden, erroFila } = d;
  const { awaitingMine, awaitingOthers, loadingAwaiting, erroVagas } = v;

  /**
   * Sete cartões de peso igual não criam hierarquia: o aprovador batia o olho e
   * não sabia por onde começar (30/08). Ficam DOIS números — as duas filas que
   * dependem dele — e os recortes como filtros, com peso de filtro.
   */
  const primarios: {
    key: string; titulo: string; n: number; contexto: ReactNode; Icon: LucideIcon; iconCls: string;
    active: boolean; onClick: () => void; hint: string; loading: boolean; erro: boolean; vazioPorPerfil?: boolean;
  }[] = [
    ...(isApprover ? [{
      key: "aguardando",
      titulo: awaitingMine.length === 1 ? "Vaga aguardando sua aprovação" : "Vagas aguardando sua aprovação",
      // O número é o que depende de VOCÊ; as dos outros aprovadores vão no contexto.
      n: awaitingMine.length,
      Icon: Stamp,
      iconCls: "text-info",
      // Sem contagem de dias aqui (pedido do dono, 04/09): "parada há N dias"
      // virava alarme vermelho permanente sem mudar a decisão.
      contexto: (
        <>
          validadas pela área, esperando você
          {awaitingOthers > 0 ? <> · <span className="tabular-nums">{awaitingOthers}</span> de outros aprovadores</> : null}
        </>
      ),
      active: tab === "aprovacao",
      onClick: () => switchTab("aprovacao"),
      hint: "Vagas validadas pela área que dependem da sua decisão",
      // Nunca 0 enquanto carrega (o 0 falso foi o achado do dono).
      loading: loadingAwaiting,
      erro: erroVagas,
    }] : []),
    {
      key: "pendentes",
      titulo: counts.pendentes === 1 ? "Pedido na fila" : "Pedidos na fila",
      n: counts.pendentes,
      Icon: Inbox,
      iconCls: "text-primary",
      contexto: showMineFilter
        ? <><span className="font-semibold text-primary tabular-nums">{counts.meus}</span> você decide</>
        : "ajustes, inclusões e exclusões abertos",
      active: activeQuick === "pendentes" && !lateOnly && !mineOnly && tab === "fila",
      onClick: () => { setLateOnly(false); setMineOnly(false); applyQuick("pendentes"); },
      hint: "Ver todos os pendentes",
      loading: pendingQuery.isLoading,
      erro: erroFila,
      vazioPorPerfil: forbidden,
    },
  ];

  /** Recortes da fila: filtros, não indicadores. */
  const recortes: { key: string; label: string; n: number; ponto: string; active: boolean; onClick: () => void; hint: string }[] = [
    { key: "ajuste", label: "Ajustes", n: counts.ajuste, ponto: "bg-warning-strong", active: activeQuick === "ajuste", onClick: () => applyQuick("ajuste"), hint: "Filtrar por ajustes pendentes" },
    { key: "inclusao", label: "Inclusões", n: counts.inclusao, ponto: "bg-success-strong", active: activeQuick === "inclusao", onClick: () => applyQuick("inclusao"), hint: "Filtrar por inclusões pendentes" },
    { key: "exclusao", label: "Exclusões", n: counts.exclusao, ponto: "bg-danger-strong", active: activeQuick === "exclusao", onClick: () => applyQuick("exclusao"), hint: "Filtrar por exclusões pendentes" },
    // "Posso decidir" saiu daqui (04/09): o mesmo filtro está na barra da fila.
  ];

  const mostrarRecortes = !erroFila && !forbidden;

  return (
    <section aria-labelledby="apr-resumo" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 id="apr-resumo" className="text-[13px] font-semibold text-foreground">O que espera decisão</h2>
        <span className="text-2xs text-muted-foreground">Clique num indicador para abrir a fila.</span>
      </div>
      {/* Grade com filetes de 1px (gap sobre o fundo da borda): quebra em
          coluna no celular sem filete solto nem borda dupla. */}
      <div
        className={cn(
          "grid gap-px overflow-hidden rounded-xl border border-border bg-border shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]",
          primarios.length === 2 ? "grid-cols-2" : "",
          mostrarRecortes && (primarios.length === 2 ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)]" : "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"),
        )}
        role="group" aria-label="Filas que dependem de você"
      >
        {primarios.map((c) => {
          // Trabalho seu esperando: a célula acende (fundo da marca, número em azul).
          const chama = !c.active && !c.loading && !c.erro && c.n > 0 && c.key === "aguardando";
          // No celular as duas filas ficam lado a lado (era a tela inteira só de resumo).
          return (
            <button
              key={c.key}
              type="button"
              onClick={c.onClick}
              aria-pressed={c.active}
              title={c.hint}
              data-testid={`apr-kpi-${c.key}`}
              className={cn(
                "apr-kpi relative flex min-w-0 flex-col items-start px-3.5 py-2.5 text-left focus-visible:z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4 sm:py-3",
                c.active ? "bg-brand-soft/80 hover:bg-brand-soft" : "bg-card hover:bg-surface-muted/70",
                // Ligado: filete embaixo (o "selecionado" da faixa da Validação).
                c.active && "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
              )}
            >
              <span className={cn("flex items-start gap-1.5 text-xs font-medium leading-4", c.active ? "text-primary" : "text-muted-foreground")}>
                <c.Icon className={cn("mt-px h-3.5 w-3.5 shrink-0", c.iconCls)} aria-hidden="true" />
                {c.titulo}
                {/* Trabalho seu esperando: um ponto que chama, sem pintar a célula inteira. */}
                {chama && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
              </span>
              {c.erro ? (
                <>
                  <span className="mt-1.5 block text-sm font-semibold text-danger">Não foi possível carregar</span>
                  <span className="mt-0.5 block text-2xs text-muted-foreground">Abra a aba para tentar de novo</span>
                </>
              ) : c.vazioPorPerfil ? (
                <>
                  <span className="mt-1.5 block text-sm font-semibold text-slate-600">Nenhum pedido seu por aqui</span>
                  <span className="mt-0.5 block text-2xs text-muted-foreground">Você vê os pedidos que abrir e os das funções que aprova</span>
                </>
              ) : (
                <>
                  {c.loading
                    ? <span className="val-osso mt-1.5 block h-7 w-10" aria-label="Carregando" />
                    : (
                      <span className={cn("apr-kpi-n mt-1 block text-xl font-semibold leading-7 tracking-tight tabular-nums sm:text-2xl",
                        c.n === 0 ? "text-muted-foreground" : c.active || chama ? "text-primary" : "text-foreground")}>
                        {c.n}
                      </span>
                    )}
                  <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">{c.contexto}</span>
                </>
              )}
            </button>
          );
        })}

        {/* Recortes: filtros da fila — peso de filtro, não de indicador. O
            escopo vai no rótulo (04/09): as contagens são dos PENDENTES. */}
        {mostrarRecortes && (
          <div
            className={cn("flex min-w-0 flex-col bg-card px-3.5 py-2.5 sm:px-4 sm:py-3", primarios.length === 2 && "col-span-2 lg:col-span-1")}
            role="group" aria-label="Recortes dos pendentes"
          >
            <span className="text-xs font-medium text-muted-foreground">
              Recortes dos pendentes
              {recortesForaDoEscopo && <span className="font-normal"> · voltam a fila para os pendentes</span>}
            </span>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:mt-2">
              {recortes.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={r.onClick}
                  aria-pressed={r.active}
                  title={recortesForaDoEscopo ? `${r.hint} (volta a lista para os pendentes)` : r.hint}
                  className={cn(
                    "val-alvo flex min-w-0 flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    r.active ? "border-primary/40 bg-brand-soft text-primary" : "border-border bg-card text-slate-600 hover:border-slate-300 hover:bg-surface-muted/70",
                    // Fora do escopo (outro status escolhido): atenuados, mas clicáveis.
                    recortesForaDoEscopo && !r.active && "opacity-60 hover:opacity-100",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-2xs font-medium">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", r.ponto)} aria-hidden="true" />
                    {r.label}
                  </span>
                  {pendingQuery.isLoading
                    ? <span className="val-osso mt-1 block h-4 w-5" aria-label="Carregando" />
                    : <span className={cn("text-base font-semibold leading-6 tabular-nums", r.active ? "text-primary" : r.n === 0 ? "text-muted-foreground" : "text-foreground")}>{r.n}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Filtros da fila ─────────────────────────────────────────────────────────

/**
 * Filtro liga/desliga ("Só as minhas funções" / "Só os que posso decidir").
 * Botão com `aria-pressed` e a caixa de marcar — o desenho do "Só as minhas
 * funções" da Validação.
 */
export function ToggleFilter({ pressed, onPressedChange, label }: { pressed: boolean; onPressedChange: (v: boolean) => void; label: string }) {
  const Icon = pressed ? CheckSquare : Square;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "val-alvo inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed ? "border-primary/40 bg-brand-soft font-medium text-primary" : "border-border bg-card text-slate-700 hover:border-slate-300",
      )}
    >
      <Icon className={cn("h-4 w-4", pressed ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />{label}
    </button>
  );
}

/** Busca + status + "só os que posso decidir": tudo que recorta a FILA de pedidos. */
export function FilaToolbar({ f, counts, showMineFilter }: { f: ApprovalFilters; counts: ContagemPendentes; showMineFilter: boolean }) {
  const { statusFilter, setStatusFilter, search, setSearch, mineOnly, setMineOnly } = f;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative min-w-0 sm:w-[400px]">
        <Label htmlFor="apr-search" className="sr-only">Buscar pedidos</Label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id="apr-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Função, evento, #ID, solicitante ou motivo"
          className="apr-busca h-9 rounded-lg bg-card pl-9 pr-9 text-sm"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} aria-label="Limpar a busca"
            className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="apr-status" className="sr-only">Status</Label>
        <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as StatusFilter)}>
          <SelectTrigger id="apr-status" className="h-9 w-auto min-w-[170px] rounded-lg bg-card text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {CHANGE_REQUEST_STATUS_VALUES.map((s) => <SelectItem key={s} value={s}>{CHANGE_REQUEST_STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        {showMineFilter && (
          <ToggleFilter
            pressed={mineOnly}
            onPressedChange={setMineOnly}
            label={`Só os que posso decidir${counts.meus ? ` (${counts.meus})` : ""}`}
          />
        )}
      </div>
    </div>
  );
}
