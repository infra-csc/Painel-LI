/**
 * Calendário de eventos — visões Mês, Semana e Lista, com painel de detalhe.
 *
 * Desde 25/09 a página só compõe (tinha 1.335 linhas): estado e navegação em
 * `components/calendar/use-calendar-state`, barra de ferramentas e topo do
 * período em `calendar-header`, cada visão no seu arquivo (`month-view`,
 * `week-view`, `list-view`, `agenda` no celular), o painel do evento em
 * `event-panel` e as barras da semana em `week-bars` (função pura).
 *
 * 07/10 (redesenho): a MESMA casca de Eventos/Passagens — barra da tela de
 * 56px grudada (título e o recorte por extenso), conteúdo em até 1560px, a
 * barra de filtros comum e a grade numa moldura com o período no topo. É a
 * tela de entrada da Área de Função, então os estados contam: esqueleto com a
 * forma da grade (era um círculo girando), erro com "Tentar novamente" (era
 * um beco), período vazio dizendo por quê e para onde ir. Setas do teclado
 * mudam o período e H volta para hoje.
 */
import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { CloudOff, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { useIsMobile, useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { useCalendarState, type CalendarState, type CalendarView } from "@/components/calendar/use-calendar-state";
import { CabecalhoDoPeriodo, CalendarToolbar } from "@/components/calendar/calendar-header";
import { MonthView } from "@/components/calendar/month-view";
import { WeekView } from "@/components/calendar/week-view";
import { ListView } from "@/components/calendar/list-view";
import { EventPanel } from "@/components/calendar/event-panel";
import { AvisoDoPeriodo, MONTH_NAMES_LOWER, addDays, eventosNoPeriodo, formatListDate, parseLocalDate } from "@/components/calendar/calendar-shared";

const MOLDURA = "bg-card rounded-xl border border-border shadow-1 overflow-hidden";

/** Esqueleto com a forma da visão que vai aparecer (grade, colunas ou linhas). */
function Carregando({ view, celular }: { view: CalendarView; celular: boolean }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando calendário" className="flex flex-col gap-4">
      <span className="sr-only">Carregando eventos…</span>
      <div aria-hidden="true" className="flex flex-wrap gap-2">
        <div className="pas-osso h-[34px] flex-[1_1_100%] sm:flex-[1_1_200px] sm:max-w-[320px] rounded-lg" />
        <div className="pas-osso h-[34px] w-[156px] rounded-lg" />
        <div className="pas-osso h-[34px] w-[232px] rounded-lg ml-auto" />
      </div>
      {view === "list" ? (
        <div aria-hidden="true" className={cn(MOLDURA, "divide-y divide-border")}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="pas-osso w-11 h-12 rounded-lg" />
              <div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-1/2" /><div className="pas-osso h-2.5 w-1/3" /></div>
              <div className="pas-osso h-3.5 w-28 hidden md:block" />
              <div className="pas-osso h-[22px] w-24 hidden md:block rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className={MOLDURA}>
          <div className="flex items-center gap-4 px-5 py-3 border-b border-border">
            <div className="pas-osso h-5 w-40" />
            <div className="pas-osso h-9 w-[124px] rounded-lg" />
            <div className="pas-osso h-3 w-28 ml-auto" />
          </div>
          {celular ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-4 py-3">
                  <div className="w-11 flex flex-col items-center gap-1.5"><div className="pas-osso h-2.5 w-7" /><div className="pas-osso h-8 w-8 rounded-full" /></div>
                  <div className="pas-osso flex-1 h-14 rounded-md" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="h-[33px] bg-surface-muted border-b border-border" />
              <div className={cn("grid grid-cols-7", view === "week" && "cal-semana-corpo")}>
                {Array.from({ length: view === "month" ? 35 : 7 }).map((_, i) => (
                  <div key={i} className={cn("p-2 space-y-1.5", i % 7 !== 6 && "border-r border-border", view === "month" && i < 28 && "border-b border-border", view === "month" && "cal-semana")}>
                    <div className="pas-osso h-4 w-5" />
                    {(i * 7) % 5 === 1 && <div className="pas-osso h-[22px] w-full rounded-md" />}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Falha ao buscar os eventos: o motivo e o caminho de volta (era um beco sem botão). */
function Erro({ mensagem, onTentar, tentando }: { mensagem: string; onTentar: () => void; tentando: boolean }) {
  return (
    <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14" data-testid="cal-erro">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
        <CloudOff className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar o calendário</h2>
      <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">{mensagem}</p>
      <Button variant="outline" className="mt-5 rounded-lg" onClick={onTentar} disabled={tentando}>
        <RotateCw className={cn("w-4 h-4 mr-1.5", tentando && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
        {tentando ? "Tentando…" : "Tentar novamente"}
      </Button>
    </div>
  );
}

/** A faixa do período sem evento: por quê (filtro × agenda vazia) e a saída. */
function avisoDoPeriodo(s: CalendarState, podeCadastrar: boolean, irParaEventos: () => void): ReactNode {
  const mes = s.view === "month";
  const ini = mes ? new Date(s.viewYear, s.viewMonth, 1) : s.viewWeekStart;
  const fim = mes ? new Date(s.viewYear, s.viewMonth + 1, 0) : addDays(s.viewWeekStart, 6);
  if (eventosNoPeriodo(s.filteredEvents, ini, fim).length > 0) return null;

  if (s.visibleEvents.length === 0) {
    return (
      <AvisoDoPeriodo
        titulo="Nenhum evento no calendário"
        texto="Os eventos planejados, em andamento e concluídos aparecem aqui assim que forem cadastrados."
        acao={podeCadastrar ? { rotulo: "Ir para Eventos", onClick: irParaEventos } : undefined}
      />
    );
  }
  if (s.filteredEvents.length === 0) {
    return (
      <AvisoDoPeriodo
        filtro
        titulo="Nenhum evento com esses filtros"
        texto="A busca procura no nome e no local do evento."
        acao={{ rotulo: "Limpar filtros", onClick: s.limparFiltros, testid: "cal-aviso-limpar" }}
      />
    );
  }
  const nomeDoPeriodo = mes ? `em ${MONTH_NAMES_LOWER[s.viewMonth]}` : "nesta semana";
  const prox = s.proximoDepois(fim);
  const ult = prox ? null : s.ultimoAntes(ini);
  const alvo = prox ?? ult;
  const dataAlvo = alvo ? parseLocalDate(prox ? alvo.startDate : alvo.endDate) : null;
  // O ano entra quando o evento é de outro ano ("11 a 22 de out. de 2026" visto de 2031).
  const anoDoAlvo = dataAlvo && dataAlvo.getFullYear() !== ini.getFullYear() ? ` de ${dataAlvo.getFullYear()}` : "";
  return (
    <AvisoDoPeriodo
      filtro={s.hasFilters}
      titulo={`Nenhum evento ${nomeDoPeriodo}${s.hasFilters ? " com esses filtros" : ""}`}
      texto={alvo ? <>{prox ? "Próximo" : "Último"}: <span className="text-foreground font-medium">{alvo.name}</span> · {formatListDate(alvo.startDate, alvo.endDate)}{anoDoAlvo}</> : undefined}
      acao={alvo && dataAlvo ? {
        // O ano só aparece quando muda ("Voltar para outubro de 2026" vindo de 2031).
        rotulo: mes
          ? `${prox ? "Ir para" : "Voltar para"} ${MONTH_NAMES_LOWER[dataAlvo.getMonth()]}${dataAlvo.getFullYear() !== s.viewYear ? ` de ${dataAlvo.getFullYear()}` : ""}`
          : prox ? "Ir para a semana dele" : "Voltar para a semana dele",
        volta: !prox,
        onClick: () => s.irParaDia(dataAlvo),
        testid: "cal-ir-para-evento",
      } : undefined}
    />
  );
}

export default function CalendarPage() {
  usePageTitle("Calendário");
  const s = useCalendarState();
  const { view, viewYear, viewMonth, viewWeekStart, filteredEvents, handleSelectEvent, isLoading, loadErrorMessage, selectedEvent, setSelectedEvent, clickPos } = s;
  const { user } = useAuth();
  const [, navegar] = useLocation();
  const celular = useIsMobile();
  // Abaixo de 1280px a Semana costuma virar agenda (largura útil < 840px): o esqueleto acompanha.
  const telaEstreita = useMediaQuery("(max-width: 1279px)");
  const podeCadastrar = hasPermission(user, "canAccessCadastros");

  // Teclado: ← → mudam o período, H volta para hoje — fora de campos e sem painel aberto.
  useEffect(() => {
    if (view === "list") return;
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu'], [role='listbox']")) return;
      if (document.querySelector("[role='dialog']")) return;
      const mes = view === "month";
      if (e.key === "ArrowLeft") { e.preventDefault(); if (mes) s.prevMonth(); else s.prevWeek(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); if (mes) s.nextMonth(); else s.nextWeek(); }
      else if (e.key === "h" || e.key === "H") { e.preventDefault(); s.goToday(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Barra da tela: o recorte por extenso ──
  const total = s.visibleEvents.length;
  const emAndamento = s.statusCounts["em andamento"] || 0;
  const plural = (n: number) => (n === 1 ? "evento" : "eventos");
  const subtitulo: ReactNode = isLoading ? "Carregando eventos…" : loadErrorMessage ? null : s.hasFilters ? (
    <span data-testid="cal-resumo">{filteredEvents.length} de {total} {plural(total)} <span className="text-muted-foreground/80">· com busca ou filtro</span></span>
  ) : (
    <span data-testid="cal-resumo">
      {total === 0 ? "Nenhum evento ativo" : <>{total} {plural(total)} {total === 1 ? "ativo" : "ativos"}</>}
      {emAndamento > 0 && <> · <span className="text-primary font-medium">{emAndamento} em andamento agora</span></>}
    </span>
  );

  let conteudo: ReactNode;
  if (isLoading) conteudo = <Carregando view={view} celular={celular || (view === "week" && telaEstreita)} />;
  else if (loadErrorMessage) conteudo = <Erro mensagem={loadErrorMessage} onTentar={() => s.refetch()} tentando={s.isFetching} />;
  else {
    const aviso = view === "list" ? null : avisoDoPeriodo(s, podeCadastrar, () => navegar("/events"));
    const chaveDoPeriodo = view === "month" ? `${viewYear}-${viewMonth}` : viewWeekStart.toISOString();
    conteudo = (
      <>
        <CalendarToolbar s={s} />
        {view === "list" ? (
          <div key="list" className="cal-entra">
            <ListView events={filteredEvents} onSelectEvent={handleSelectEvent} hasFilters={s.hasFilters} onLimparFiltros={s.limparFiltros} />
          </div>
        ) : (
          <section key={view} aria-label={view === "month" ? "Calendário do mês" : "Calendário da semana"} className={cn("cal-entra", MOLDURA)}>
            <CabecalhoDoPeriodo s={s} />
            {/* A troca de período reapresenta a grade com um esmaecer curto. */}
            <div key={chaveDoPeriodo} className="cal-troca">
              {view === "month" ? (
                <MonthView year={viewYear} month={viewMonth} events={filteredEvents} onSelectEvent={handleSelectEvent} aviso={aviso} />
              ) : (
                <WeekView weekStart={viewWeekStart} events={filteredEvents} onSelectEvent={handleSelectEvent} aviso={aviso} />
              )}
            </div>
          </section>
        )}
      </>
    );
  }

  return (
    <>
      {/* Margens pela variável do layout: a barra sangra até as bordas da
          página e o conteúdo fica em até 1560px — a casca de Eventos. */}
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
        <PageHeader variant="bar" title="Calendário" subtitle={subtitulo} className="mx-0 mt-0" />
        <div className="px-[var(--page-gutter)] pt-5 pb-6">
          <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">{conteudo}</div>
        </div>
      </div>

      {/* ── Event detail panel ── */}
      {selectedEvent && (
        <EventPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} clickPos={clickPos} />
      )}
    </>
  );
}
