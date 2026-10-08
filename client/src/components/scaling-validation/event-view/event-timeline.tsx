/**
 * Aba "Linha do tempo" do Histórico (25/09 — extraída da página): filtros por
 * categoria, busca, e os movimentos por dia — direto (evento escolhido) ou
 * agrupados por evento (modo "Todos os eventos").
 *
 * 07/10 (redesenho premium): a linha do tempo virou uma TRILHA de verdade —
 * hora numa coluna à esquerda, o marcador da categoria sobre um fio contínuo e
 * o texto correndo sobre o branco. Antes cada movimento era um cartão tingido
 * com borda colorida (uma parede de azul, verde e vermelho em que nada se
 * destacava) e a hora ficava perdida na ponta direita. A etiqueta ganhou o tom
 * do SIGNIFICADO (pedido negado em vermelho, não no verde das "decisões").
 * Os dias têm cabeçalho que gruda abaixo da barra da tela no desktop.
 */
import { Link } from "wouter";
import { ArrowUpRight, CalendarDays, Filter, History, SearchX, UserRound } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { BuscaDaLista, LimparFiltros } from "@/components/common/barra-de-filtros";
import { AcaoDoEstado } from "@/components/scaling-validation/validation-page/estados";
import { EstadoDoHistorico } from "./estados-do-historico";
import { cn } from "@/lib/utils";
import { CHIP, MOLDURA, PILULA, PILULA_OFF, PILULA_ON, TL, TL_ORDER, hhmm, plural, type TlDay, type TlEntry } from "./event-view-shared";
import type { EventHistory } from "./use-event-history";
import type { EventTimelineData } from "./use-event-timeline";

/** Dia da semana curto ("seg.") ao lado da data do grupo. */
const diaDaSemana = (d: Date) => d.toLocaleDateString("pt-BR", { weekday: "short" });

function Movimento({ e, idByNumber, onOpenDetail }: { e: TlEntry; idByNumber: Map<string, string>; onOpenDetail: (id: string) => void }) {
  const c = TL[e.cat];
  return (
    <li className="hes-mov" data-cat={e.cat}>
      <time dateTime={e.at.toISOString()} className="pt-[7px] text-right text-xs tabular-nums text-muted-foreground">{hhmm(e.at)}</time>
      <span className={cn("hes-marcador relative z-[1] mt-[3px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-card", c.marker)} aria-hidden="true">
        <c.icon className="h-3.5 w-3.5" />
      </span>
      <div className="hes-mov-corpo min-w-0 space-y-1.5 rounded-lg px-2.5 py-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 text-sm font-semibold leading-5 text-foreground">{e.title}</p>
          <StatusBadge tone={e.tagTone ?? c.tone}>{e.tag}</StatusBadge>
        </div>
        {e.text && <p className="text-xs leading-relaxed text-slate-600">{e.text}</p>}
        {e.chips && e.chips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {e.chips.map((ch, i) => {
              const alvoId = idByNumber.get(ch);
              return alvoId ? (
                <button
                  key={`${e.id}-${i}`} type="button" onClick={() => onOpenDetail(alvoId)}
                  title="Ver o detalhe completo desta vaga"
                  aria-label={`Ver o detalhe da vaga ${ch}`}
                  className={cn(CHIP, "hes-chip val-alvo bg-brand-soft text-primary hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
                >
                  {ch}
                </button>
              ) : (
                <span key={`${e.id}-${i}`} className={cn(CHIP, "bg-muted text-slate-600", !/^[#+]/.test(ch) && "font-sans font-medium")}>{ch}</span>
              );
            })}
          </div>
        )}
        {e.quote && <p className="break-words border-l-2 border-border pl-2.5 text-xs italic leading-relaxed text-slate-700 whitespace-pre-wrap">{e.quote}</p>}
        {(e.author || e.href) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
            {e.author && (
              <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
                <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />{e.author}
              </span>
            )}
            {e.href && (
              <Link href={e.href} className="val-alvo inline-flex items-center gap-0.5 rounded text-2xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {e.linkLabel}<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Bloco de dias da linha do tempo — o MESMO markup com evento selecionado e
 * dentro de cada evento no modo "todos" (a leitura não muda de um para outro).
 */
function TimelineDays({ days, idByNumber, onOpenDetail }: { days: TlDay[]; idByNumber: Map<string, string>; onOpenDetail: (id: string) => void }) {
  return (
    <>
      {days.map((g) => (
        <div key={g.key}>
          <div className="hes-dia flex items-center gap-2.5 bg-card px-3 pb-1.5 pt-3 sm:px-4">
            <span className="text-xs font-semibold tabular-nums text-foreground">{g.label}</span>
            <span className="text-2xs text-muted-foreground">{diaDaSemana(g.items[0].at)} · {plural(g.items.length, "movimento", "movimentos")}</span>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
          <ol className="m-0 flex list-none flex-col gap-1 px-1.5 pb-2 sm:px-2.5" aria-label={`Movimentos de ${g.label}`}>
            {g.items.map((e) => <Movimento key={e.id} e={e} idByNumber={idByNumber} onOpenDetail={onOpenDetail} />)}
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
  /** Modo "todos": "Ver só este evento" no cabeçalho de cada evento. */
  onPickEvent: (id: string) => void;
}

export function EventTimeline({ h, tl, eventId, onPickEvent }: EventTimelineProps) {
  const { search, setSearch, idByNumber, setDetailId } = h;
  const { tlCats, toggleCat, setTlCats, timeline, filteredTimeline, timelineDays, timelineEvents, timelineStart, visibleEvents, showMoreEvents, groupByDay } = tl;
  const tlHasFilters = search.trim() !== "" || tlCats.length !== TL_ORDER.length;
  const clearTlFilters = () => { setSearch(""); setTlCats(TL_ORDER); };
  const restantes = timelineEvents.length - visibleEvents;
  return (
    <>
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-3">
        <div className="min-w-0 lg:w-[320px] lg:shrink-0">
          <BuscaDaLista valor={search} onChange={setSearch} placeholder="Função, #ID, pessoa ou texto" rotulo="Buscar movimento" testid="hes-busca-linha-do-tempo" />
        </div>
        {/* Categorias: liga/desliga, com a contagem de cada uma. No celular a
            faixa rola de lado em vez de quebrar em três linhas. */}
        <div className="val-rolagem-x -mx-[var(--page-gutter)] flex items-center gap-1.5 px-[var(--page-gutter)] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Tipos de movimento">
          <span className="mr-0.5 hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
            <Filter className="h-3.5 w-3.5" aria-hidden="true" /> Mostrar
          </span>
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
                title={on ? `Esconder ${c.label.toLowerCase()}` : `Mostrar ${c.label.toLowerCase()}`}
                className={cn(PILULA, on ? PILULA_ON : PILULA_OFF, n === 0 && !on && "opacity-60")}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", c.dot, !on && "opacity-50")} aria-hidden="true" />
                {c.label}
                <span className={cn("tabular-nums", on ? "text-primary/70" : "text-muted-foreground")}>{n}</span>
              </button>
            );
          })}
        </div>
        {tlHasFilters && <div className="lg:ml-auto"><LimparFiltros onClick={clearTlFilters} testid="hes-limpar-linha-do-tempo" /></div>}
      </div>

      {filteredTimeline.length === 0 ? (
        timeline.length === 0 ? (
          <EstadoDoHistorico
            icone={<History aria-hidden="true" />}
            titulo="Nenhum movimento registrado ainda"
            texto={eventId
              ? "As vagas deste evento não têm envio, validação, pedido ou decisão com data registrada."
              : "As vagas dos eventos do recorte não têm envio, validação, pedido ou decisão com data registrada."}
            testId="hes-linha-do-tempo-vazia"
          />
        ) : (
          <EstadoDoHistorico
            icone={<SearchX aria-hidden="true" />}
            titulo="Nenhum movimento com esses filtros"
            texto="Ajuste a busca ou ligue de novo os tipos de movimento escondidos."
            acao={tlHasFilters ? <AcaoDoEstado principal={false} onClick={clearTlFilters}>Limpar filtros</AcaoDoEstado> : undefined}
            testId="hes-linha-do-tempo-sem-resultado"
          />
        )
      ) : !eventId ? (
        /* "Todos os eventos": um bloco por EVENTO (o de movimento mais
           recente primeiro), N por vez — dentro dele, os dias de sempre. */
        <div className="space-y-3">
          {timelineEvents.slice(0, visibleEvents).map((g) => (
            <section key={g.key} className={MOLDURA} aria-label={`Movimentos de ${g.name}`}>
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2.5 sm:px-4">
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <h3 className="min-w-0 text-sm font-semibold text-foreground">{g.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {g.period && <span className="tabular-nums">{g.period} · </span>}
                  {plural(g.items.length, "movimento", "movimentos")}
                </span>
                {g.key && (
                  <button
                    type="button"
                    onClick={() => onPickEvent(g.key)}
                    className="val-alvo ml-auto inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Ver só este evento
                  </button>
                )}
              </header>
              <TimelineDays days={groupByDay(g.items)} idByNumber={idByNumber} onOpenDetail={setDetailId} />
            </section>
          ))}
          {restantes > 0 && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={showMoreEvents}
                className="val-alvo inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-slate-700 transition-colors hover:border-primary/30 hover:bg-brand-soft/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Ver mais eventos
                <span className="tabular-nums text-muted-foreground">({restantes} {restantes === 1 ? "restante" : "restantes"})</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={MOLDURA}>
          <TimelineDays days={timelineDays} idByNumber={idByNumber} onOpenDetail={setDetailId} />
          {timelineStart && (
            <p className="flex items-center justify-center gap-2 border-t border-border px-4 py-3 text-center text-2xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" aria-hidden="true" />
              <span>Fim do histórico — a escala deste evento começou em <span className="tabular-nums">{timelineStart}</span>.</span>
            </p>
          )}
        </div>
      )}
    </>
  );
}
