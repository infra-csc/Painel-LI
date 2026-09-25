/**
 * Barra de contexto + filtros da Aprovação (25/09 — extraída de pages/scaling-approval.tsx):
 * evento, status, busca, os DOIS tiles primários (as filas que dependem do
 * aprovador) e os chips de recorte dos pendentes.
 */
import type { ReactNode } from "react";
import { CalendarDays, Inbox, Search, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EventCombobox from "@/components/ui/event-combobox";
import { cn } from "@/lib/utils";
import { ALL_EVENTS_ROW_LIMIT, CHANGE_REQUEST_STATUS_LABELS, CHANGE_REQUEST_STATUS_VALUES } from "@shared/scaling-validation-rules";
import { SECTION } from "../tokens";
import { ALL, type ApprovalFilters, type ContagemPendentes, type StatusFilter } from "./use-approval-filters";
import type { ApprovalData } from "./use-approval-data";
import type { ApprovalVagas } from "./use-approval-vagas";

export function ApprovalFilterBar({ f, d, v, counts, eventId, setEventId, isApprover, showMineFilter }: {
  f: ApprovalFilters; d: ApprovalData; v: ApprovalVagas; counts: ContagemPendentes;
  eventId: string; setEventId: (id: string) => void; isApprover: boolean; showMineFilter: boolean;
}) {
  const { statusFilter, setStatusFilter, search, setSearch, activeQuick, recortesForaDoEscopo, lateOnly, setLateOnly, mineOnly, setMineOnly, tab, switchTab, applyQuick } = f;
  const { loadingEvents, activeEvents, pendingQuery, forbidden, erroFila } = d;
  const { awaitingMine, awaitingOthers, loadingAwaiting, erroVagas, eventsInSuggestions, suggestionsTruncated } = v;

  /**
   * Sete cartões de peso igual não criam hierarquia: o aprovador batia o olho e
   * não sabia por onde começar (30/08). Ficam DOIS primários — as duas filas que
   * dependem dele — e os recortes viram chips, que é o que eles são: filtros.
   */
  const primarios: {
    key: string; titulo: string; n: number; contexto: ReactNode; Icon: LucideIcon;
    tom: string; active: boolean; onClick: () => void; hint: string; loading?: boolean;
  }[] = [
    ...(isApprover ? [{
      key: "aguardando",
      titulo: awaitingMine.length === 1 ? "vaga aguardando sua aprovação" : "vagas aguardando sua aprovação",
      // O número é o que depende de VOCÊ; as dos outros aprovadores vão no contexto.
      n: awaitingMine.length,
      Icon: ShieldCheck,
      // Sem contagem de dias no cartão (pedido do dono, 04/09): "parada há N
      // dias" virava alarme vermelho permanente sem mudar a decisão.
      tom: awaitingMine.length ? "text-info" : "text-foreground",
      contexto: (
        <span>
          <span>validadas pela área, esperando você</span>
          {awaitingOthers > 0 ? <span> · <span className="tabular-nums">{awaitingOthers}</span> de outros aprovadores</span> : null}
        </span>
      ),
      active: tab === "aprovacao",
      onClick: () => switchTab("aprovacao"),
      hint: "Vagas validadas pela área que dependem da sua decisão",
      // Nunca 0 enquanto carrega: o cartão mostra "…" (o 0 falso foi o achado do dono).
      loading: loadingAwaiting,
    }] : []),
    {
      key: "pendentes",
      titulo: counts.pendentes === 1 ? "pedido na fila" : "pedidos na fila",
      n: counts.pendentes,
      Icon: Inbox,
      tom: "text-foreground",
      contexto: (
        <span>
          {showMineFilter
            ? <><span className="font-semibold text-primary tabular-nums">{counts.meus}</span> você decide</>
            : <span>ajustes, inclusões e exclusões abertos</span>}
        </span>
      ),
      active: activeQuick === "pendentes" && !lateOnly && !mineOnly && tab === "fila",
      onClick: () => { setLateOnly(false); setMineOnly(false); applyQuick("pendentes"); },
      hint: "Ver todos os pendentes",
    },
  ];

  /** Recortes da fila: chips de filtro, não indicadores. */
  const recortes: { key: string; label: string; n: number; ponto: string; active: boolean; onClick: () => void; hint: string }[] = [
    { key: "ajuste", label: "Ajustes", n: counts.ajuste, ponto: "bg-warning-strong", active: activeQuick === "ajuste", onClick: () => applyQuick("ajuste"), hint: "Filtrar por ajustes pendentes" },
    { key: "inclusao", label: "Inclusões", n: counts.inclusao, ponto: "bg-success-strong", active: activeQuick === "inclusao", onClick: () => applyQuick("inclusao"), hint: "Filtrar por inclusões pendentes" },
    { key: "exclusao", label: "Exclusões", n: counts.exclusao, ponto: "bg-danger-strong", active: activeQuick === "exclusao", onClick: () => applyQuick("exclusao"), hint: "Filtrar por exclusões pendentes" },
    // "Posso decidir" saiu daqui (04/09): o mesmo filtro já existe na barra de
    // abas ("Só os que posso decidir") e o tile mostra a contagem — dois
    // controles para o mesmo estado confundiam mais do que ajudavam.
  ];

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3 space-y-3" aria-labelledby="apr-filtros">
      <h2 id="apr-filtros" className="sr-only">Filtros</h2>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          {loadingEvents ? (
            <div className="h-8 w-[280px] max-w-full rounded-lg bg-muted animate-pulse motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            // Mesma régua da Validação: cresce com o espaço disponível.
            <div className="w-[280px] max-w-full lg:w-auto lg:min-w-[280px] lg:max-w-[440px] lg:flex-1">
              <EventCombobox events={activeEvents} value={eventId || ALL} onValueChange={(val) => setEventId(val === ALL ? "" : val)} placeholder="Todos os eventos" showAllOption testId="scaling-approval-event" className="h-8 rounded-lg font-semibold" />
            </div>
          )}
        </div>
        {/* O select de Tipo saiu (04/09): os chips de recorte já filtram por
            tipo, com contagem — eram dois controles para o mesmo filtro. */}
        <Label htmlFor="apr-status" className="sr-only">Status</Label>
        <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as StatusFilter)}>
          <SelectTrigger id="apr-status" className="h-8 min-w-[150px] w-auto rounded-lg text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {CHANGE_REQUEST_STATUS_VALUES.map((s) => <SelectItem key={s} value={s}>{CHANGE_REQUEST_STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[220px]">
          <Label htmlFor="apr-search" className="sr-only">Buscar</Label>
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="apr-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Função, evento, #ID, solicitante ou motivo" className="h-8 pl-8 rounded-lg bg-surface-muted text-sm" />
        </div>
      </div>
      {!eventId && isApprover && eventsInSuggestions > 0 && (
        <p className="-mt-1 text-2xs text-muted-foreground">
          Mostrando vagas de {eventsInSuggestions} {eventsInSuggestions === 1 ? "evento" : "eventos"} — escolha um evento acima para filtrar.
          {suggestionsTruncated ? ` Só as ${ALL_EVENTS_ROW_LIMIT} que esperam há mais tempo cabem nesta lista.` : ""}
        </p>
      )}

      {/* As duas filas que dependem do aprovador, em primeiro plano. */}
      <div className="flex flex-wrap gap-2.5" role="group" aria-label="Filas que dependem de você">
        {primarios.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={c.onClick}
            aria-pressed={c.active}
            title={c.hint}
            className={cn(
              "flex flex-1 min-w-[240px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              c.active ? "border-primary bg-brand-soft/60 shadow-1" : "border-border bg-card hover:border-slate-300",
            )}
          >
            <span className={cn("flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg", c.active ? "bg-primary/10" : "bg-muted")}>
              <c.Icon className={cn("h-4 w-4", c.active ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              {(c.key === "aguardando" ? erroVagas : erroFila) ? (
                <>
                  <span className="block text-sm font-medium text-danger">Não foi possível carregar</span>
                  <span className="mt-0.5 block text-2xs text-muted-foreground">Abra a aba para tentar de novo</span>
                </>
              ) : c.key === "pendentes" && forbidden ? (
                <>
                  <span className="block text-sm font-medium text-slate-600">Nenhum pedido seu por aqui</span>
                  <span className="mt-0.5 block text-2xs text-muted-foreground">Você vê os pedidos que abrir e os das funções que aprova</span>
                </>
              ) : (
                <>
                  <span className="flex items-baseline gap-1.5">
                    <span className={cn("text-xl font-bold tabular-nums leading-none", c.tom)}>
                      {(c.loading ?? pendingQuery.isLoading) ? "…" : c.n}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-600">{c.titulo}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-muted-foreground">{c.contexto}</span>
                </>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Recortes: filtros da fila, em chips — peso de filtro, não de indicador.
          O escopo vai no rótulo (04/09): as contagens são dos PENDENTES, e
          com o status em "Todos" os números não batiam com a lista. */}
      {!erroFila && (
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Recortes dos pendentes">
        <span className={SECTION}>Recortes dos pendentes</span>
        {recortes.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={r.onClick}
            aria-pressed={r.active}
            title={recortesForaDoEscopo ? `${r.hint} (volta a lista para os pendentes)` : r.hint}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              r.active ? "border-primary bg-brand-soft text-primary" : "border-border bg-card text-slate-600 hover:border-slate-300",
              // Fora do escopo (outro status escolhido) os chips ficam atenuados: continuam clicáveis, mas dizem que não recortam a lista atual.
              recortesForaDoEscopo && "opacity-60 hover:opacity-100",
            )}
          >
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", r.ponto)} aria-hidden="true" />
            {r.label}
            <span className="font-bold tabular-nums">{pendingQuery.isLoading ? "…" : r.n}</span>
          </button>
        ))}
      </div>
      )}
    </section>
  );
}
