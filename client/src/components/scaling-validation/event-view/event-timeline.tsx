/**
 * Aba "Linha do tempo" do Histórico (25/09 — extraída da página): pílulas por
 * categoria, busca, e os movimentos por dia — direto (evento escolhido) ou
 * agrupados por evento (modo "Todos os eventos").
 */
import { Link } from "wouter";
import { ExternalLink, History, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";
import { CHIP, SECTION, TL, TL_ORDER, hhmm, plural, type TlDay } from "./event-view-shared";
import type { EventHistory } from "./use-event-history";
import type { EventTimelineData } from "./use-event-timeline";

/**
 * Bloco de dias da linha do tempo — o MESMO markup com evento selecionado e
 * dentro de cada evento no modo "todos" (a leitura não muda de um para outro).
 */
function TimelineDays({ days, idByNumber, onOpenDetail }: { days: TlDay[]; idByNumber: Map<string, string>; onOpenDetail: (id: string) => void }) {
  return (
    <>
      {days.map((g) => (
        <div key={g.key} className="flex flex-col">
          <div className="sticky top-0 z-[2] flex items-center gap-2.5 bg-card pb-2 pt-3">
            <span className="text-2xs font-bold uppercase tracking-wide text-foreground">{g.label}</span>
            <span className="text-2xs text-muted-foreground">{plural(g.items.length, "movimento", "movimentos")}</span>
            <span className="h-px flex-1 bg-muted" aria-hidden="true" />
          </div>
          <ol className="m-0 flex list-none flex-col gap-3 border-l border-border pl-6">
            {g.items.map((e) => {
              const c = TL[e.cat];
              return (
                <li key={e.id} className="relative">
                  <span className={cn("absolute -left-[33px] top-0.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white text-white", c.dot)} aria-hidden="true">
                    <c.icon className="h-2.5 w-2.5" />
                  </span>
                  <div className={cn("flex flex-col gap-1.5 rounded-xl border p-2.5", c.card)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{e.title}</span>
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide", c.tag)}>{e.tag}</span>
                      <span className="ml-auto font-mono text-2xs text-muted-foreground">{hhmm(e.at)}</span>
                    </div>
                    {e.text && <p className="text-xs text-slate-600">{e.text}</p>}
                    {e.chips && e.chips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {e.chips.map((ch, i) => {
                          const alvoId = idByNumber.get(ch);
                          return alvoId ? (
                            <button
                              key={`${e.id}-${i}`} type="button" onClick={() => onOpenDetail(alvoId)}
                              title="Ver o detalhe completo desta vaga"
                              className={cn(CHIP, "bg-brand-soft font-semibold text-primary transition-colors hover:bg-primary hover:text-white")}
                            >
                              {ch}
                            </button>
                          ) : (
                            <span key={`${e.id}-${i}`} className={cn(CHIP, "bg-muted text-slate-600")}>{ch}</span>
                          );
                        })}
                      </div>
                    )}
                    {e.quote && <p className={cn("border-l-2 pl-2.5 text-xs text-slate-700 whitespace-pre-wrap break-words", c.quote)}>{e.quote}</p>}
                    {(e.author || e.href) && (
                      <div className="flex flex-wrap items-center gap-3">
                        {e.author && <span className="text-2xs text-muted-foreground">{e.author}</span>}
                        {e.href && (
                          <Link href={e.href} className="inline-flex items-center gap-1 text-2xs font-medium text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />{e.linkLabel}
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </>
  );
}

export interface EventTimelineProps {
  h: EventHistory;
  tl: EventTimelineData;
  eventId: string;
}

export function EventTimeline({ h, tl, eventId }: EventTimelineProps) {
  const { search, setSearch, idByNumber, setDetailId } = h;
  const { tlCats, toggleCat, setTlCats, timeline, filteredTimeline, timelineDays, timelineEvents, timelineStart, visibleEvents, showMoreEvents, groupByDay } = tl;
  const tlHasFilters = search.trim() !== "" || tlCats.length !== TL_ORDER.length;
  const clearTlFilters = () => { setSearch(""); setTlCats(TL_ORDER); };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
        <span className={SECTION}>Mostrar</span>
        {TL_ORDER.map((k) => {
          const c = TL[k];
          const on = tlCats.includes(k);
          const n = timeline.filter((e) => e.cat === k).length;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => toggleCat(k)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary/30 bg-brand-soft text-primary" : "border-border bg-card text-slate-600 hover:border-slate-300",
              )}
            >
              <span className={cn("inline-block h-1.5 w-1.5 rounded-full", c.dot)} aria-hidden="true" />
              {c.label} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
        <div className="relative ml-auto min-w-[220px]">
          <Label htmlFor="ev-tl-search" className="sr-only">Buscar movimento</Label>
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="ev-tl-search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Função, #ID, pessoa ou texto" className="h-8 pl-8 rounded-lg text-xs"
          />
        </div>
        {tlHasFilters && (
          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-xs text-primary" onClick={clearTlFilters}>Limpar filtros</Button>
        )}
      </div>

      {/* `live={false}` dentro das abas: a contagem acima já é a (única)
          região aria-live — dois live regions se atropelam no leitor. */}
      {filteredTimeline.length === 0 ? (
        timeline.length === 0 ? (
          <EmptyState
            live={false}
            className="rounded-xl"
            icon={History}
            title="Nenhum movimento registrado ainda"
            description={eventId
              ? "As vagas deste evento não têm envio, validação, pedido ou decisão com data registrada."
              : "As vagas dos eventos do recorte não têm envio, validação, pedido ou decisão com data registrada."}
          />
        ) : (
          <EmptyState
            live={false}
            className="rounded-xl"
            variant="filtered"
            title="Nada encontrado com esses filtros"
            description="Ajuste a busca ou o tipo de movimento."
            onClearFilters={tlHasFilters ? clearTlFilters : undefined}
          />
        )
      ) : !eventId ? (
        /* "Todos os eventos": um bloco por EVENTO (o de movimento mais
           recente primeiro), N por vez — dentro dele, os dias de sempre. */
        <div className="space-y-3">
          {timelineEvents.slice(0, visibleEvents).map((g) => (
            <section key={g.key} className="rounded-xl border border-border bg-card px-4 pb-4 pt-1" aria-label={`Movimentos de ${g.name}`}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border pb-2 pt-3">
                <span className={SECTION}>Evento</span>
                <span className="text-sm font-semibold text-foreground">{g.name}</span>
                {g.period && <span className="font-mono text-2xs text-muted-foreground">{g.period}</span>}
                <span className="text-2xs text-muted-foreground">· {plural(g.items.length, "movimento", "movimentos")}</span>
              </div>
              <TimelineDays days={groupByDay(g.items)} idByNumber={idByNumber} onOpenDetail={setDetailId} />
            </section>
          ))}
          {timelineEvents.length > visibleEvents && (
            <div className="flex justify-center">
              <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={showMoreEvents}>
                Ver mais eventos ({timelineEvents.length - visibleEvents} {timelineEvents.length - visibleEvents === 1 ? "restante" : "restantes"})
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card px-4 pb-4 pt-1">
          <TimelineDays days={timelineDays} idByNumber={idByNumber} onOpenDetail={setDetailId} />
          {timelineStart && (
            <p className="mt-4 text-center text-2xs text-muted-foreground">Fim do histórico — a escala deste evento começou em {timelineStart}.</p>
          )}
        </div>
      )}
    </>
  );
}
