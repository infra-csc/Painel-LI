/**
 * Histórico da escala — a página (25/09).
 *
 * Só orquestra: aba/evento na URL, os hooks de dados, linha do tempo e
 * exportação, e as abas em components/scaling-validation/event-view/*.
 * Tinha 1.610 linhas num componente só.
 *
 * 07/10 (redesenho premium — passo 4, irmão da Sugestão, Validação e
 * Aprovação): barra de 56px grudada com os passos e o "Exportar CSV", linha do
 * evento sem moldura, resumo numa faixa (total + funil + seis situações),
 * abas segmentadas, trilha da linha do tempo, tabelas que viram cartões em
 * largura estreita e os estados (carregando, erro, vazio, sem resultado) no
 * desenho do módulo. Lógica, consultas e permissões intactas.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowRight, CalendarDays, CloudOff, History, Inbox, Info, List, PencilLine, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SuggestionDetailDrawer } from "@/components/scaling-validation/suggestion-detail-drawer";
import { PageContainer } from "@/components/common/page-container";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { hasPermission } from "@/lib/role-utils";
import { apiErrorMessage, cn } from "@/lib/utils";
import { scalingHref, useScalingEvent } from "@/lib/use-scaling-event";
import { AcaoDoEstado, BotaoTentarDeNovo } from "@/components/scaling-validation/validation-page/estados";
import { AVISO, BASE_PATH, TABS, plural, type Tab } from "@/components/scaling-validation/event-view/event-view-shared";
import { useEventHistory } from "@/components/scaling-validation/event-view/use-event-history";
import { timelineArgsFrom, useEventTimeline } from "@/components/scaling-validation/event-view/use-event-timeline";
import { useEventExport } from "@/components/scaling-validation/event-view/use-event-export";
import { EventContextBar, HistoryBar } from "@/components/scaling-validation/event-view/event-context-bar";
import { HistorySummary } from "@/components/scaling-validation/event-view/history-summary";
import { EsqueletoDoHistorico, EstadoDoHistorico } from "@/components/scaling-validation/event-view/estados-do-historico";
import { EventTimeline } from "@/components/scaling-validation/event-view/event-timeline";
import { EventInclusionsTable } from "@/components/scaling-validation/event-view/event-inclusions-table";
import { EventScheduleTab } from "@/components/scaling-validation/event-view/event-schedule-tab";
import { EventRequestsTab } from "@/components/scaling-validation/event-view/event-requests-tab";
import { ExportButton, ExportDialog } from "@/components/scaling-validation/event-view/export-dialog";

/** Aba segmentada — o mesmo desenho das abas da Validação e da Aprovação. */
const ABA = "val-alvo h-8 shrink-0 gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-150 hover:text-foreground data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-1 data-[state=active]:ring-1 data-[state=active]:ring-border focus-visible:ring-offset-0";

function Aba({ value, Icon, rotulo, n, disabled, title }: { value: Tab; Icon: LucideIcon; rotulo: string; n?: number; disabled?: boolean; title?: string }) {
  return (
    <TabsTrigger
      value={value}
      disabled={disabled}
      title={title}
      className={cn(ABA, "disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:text-muted-foreground")}
    >
      <Icon className="hidden h-[15px] w-[15px] sm:block" aria-hidden="true" />
      {rotulo}
      {n !== undefined && n > 0 && (
        <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-muted px-1.5 text-2xs font-semibold tabular-nums text-slate-600">{n}</span>
      )}
    </TabsTrigger>
  );
}

export default function ScalingEventViewPage() {
  usePageTitle("Histórico da escala");
  const { user } = useAuth();
  const { toast } = useToast();
  // Acesso à rota já é garantido pelo ProtectedRoute (App.tsx) — sem guard duplicado aqui.
  const canOpenApproval = hasPermission(user, "canAccessScalingApproval");
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  // ── Aba (deep-link ?tab=) — derivada da URL ──
  const tab = useMemo<Tab>(() => {
    const t = new URLSearchParams(searchString).get("tab");
    return (TABS as string[]).includes(t ?? "") ? (t as Tab) : "timeline";
  }, [searchString]);
  const tabParams = useCallback((t: Tab): Record<string, string> => (t === "timeline" ? {} : { tab: t }), []);

  // ── Evento (URL ?eventId= > último usado no módulo) ──
  // Abre em "Todos os eventos" (regra do dono, 26/08) — o combobox é filtro.
  const { eventId, setEventId, sanitize } = useScalingEvent(BASE_PATH, {
    extraParams: () => tabParams(tab),
    allEventsDefault: true,
  });
  const setTab = useCallback((t: Tab) => {
    setLocation(scalingHref(BASE_PATH, eventId, tabParams(t)), { replace: true });
  }, [eventId, setLocation, tabParams]);
  /**
   * Aba EFETIVA: sem evento selecionado o quadro "Escala" não existe (função ×
   * dia de eventos diferentes na mesma coluna não quer dizer nada), então um
   * `?tab=escala` sem evento mostra a Lista — com a aba "Escala" desabilitada
   * e um aviso acima da Lista dizendo o porquê (`escalaSemEvento`), em vez de
   * trocar de aba em silêncio. Tudo que descreve a aba VISÍVEL — contagem,
   * exportação, banner — lê daqui; só a URL continua com `tab`.
   */
  const effectiveTab: Tab = !eventId && tab === "escala" ? "lista" : tab;
  const escalaSemEvento = !eventId && tab === "escala";

  /** Envolve o combobox de evento: o aviso "escolha um evento" leva o foco até ele. */
  const eventPickerRef = useRef<HTMLDivElement>(null);
  const focusEventPicker = () => eventPickerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();

  const h = useEventHistory({ eventId, sanitize, effectiveTab, tab, setTab });
  const tl = useEventTimeline(timelineArgsFrom(h, eventId, canOpenApproval));
  const exp = useEventExport(h, tl, eventId, effectiveTab, toast);
  const { viewQuery, loadingFunctions, functions, selectedEvent, activeEvents, functionNameById, rows, requests, truncated, showData, stalled, detailRow, setDetailId, filteredRows, boardRows, boardRowsAll, filteredRequests } = h;

  /** Contagem da aba visível — "N de M": o filtrado e o total, no mesmo formato nas quatro abas. */
  const countText =
    effectiveTab === "timeline" ? `${tl.filteredTimeline.length} de ${plural(tl.timeline.length, "movimento", "movimentos")}`
      : effectiveTab === "lista" ? `${filteredRows.length} de ${plural(rows.length, "vaga", "vagas")}`
        : effectiveTab === "escala" ? `${boardRows.length} de ${plural(boardRowsAll.length, "vaga", "vagas")} no quadro`
          : `${filteredRequests.length} de ${plural(requests.length, "pedido", "pedidos")}`;

  /**
   * No celular a faixa das abas rola de lado: a aba aberta (inclusive vinda do
   * link, "?tab=pedidos") é trazida para dentro da faixa — ficava cortada na
   * borda. Só a rolagem lateral da faixa; a página não se mexe.
   */
  const abasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const faixa = abasRef.current;
    const ativa = faixa?.querySelector<HTMLElement>("[role=tab][data-state=active]");
    if (!faixa || !ativa || faixa.scrollWidth <= faixa.clientWidth) return;
    const fora = ativa.offsetLeft + ativa.offsetWidth > faixa.scrollLeft + faixa.clientWidth || ativa.offsetLeft < faixa.scrollLeft;
    if (fora) faixa.scrollLeft = Math.max(0, ativa.offsetLeft - 16);
  }, [effectiveTab, viewQuery.isLoading]);

  const carregando = viewQuery.isLoading || (loadingFunctions && !functions);

  // ── Render ──
  return (
    <PageContainer fluid className="space-y-5 pb-16">
      <HistoryBar eventId={eventId} acoes={<ExportButton exp={exp} effectiveTab={effectiveTab} />} />

      {/* ── Evento: seletor, comentários e os fatos (datas, local, última movimentação) ── */}
      <EventContextBar ref={eventPickerRef} h={h} eventId={eventId} setEventId={setEventId} lastMovement={tl.lastMovement} />

      {/* Teto do modo "todos os eventos" — a consulta histórica é a que mais
          cresce, então quando ela é cortada o filtro é a saída. Tom NEUTRO de
          propósito: não é um problema da escala (esse é o âmbar do "travada"
          abaixo), é só um aviso de que a página não mostra tudo. */}
      {truncated && (
        <p role="status" className={cn(AVISO, "border-border bg-surface-muted/70 text-slate-600")} data-testid="hes-historico-parcial">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            <span className="font-semibold text-slate-700">Histórico parcial</span> — são muitos movimentos para mostrar de uma vez
            {viewQuery.data?.rowLimit ? ` (teto de ${viewQuery.data.rowLimit} vagas)` : ""}. Escolha um evento acima para ver o histórico completo dele.
          </span>
        </p>
      )}

      {/* As funções entram no gate (como na Validação): sem elas a tela abriria
          com "Sem função" em toda linha até a segunda consulta responder. */}
      {carregando ? (
        <EsqueletoDoHistorico label={viewQuery.isLoading ? (eventId ? "Carregando escala do evento…" : "Carregando histórico dos eventos…") : "Carregando funções…"} />
      ) : viewQuery.error ? (
        <EstadoDoHistorico
          tom="erro"
          icone={<CloudOff aria-hidden="true" />}
          titulo="Não foi possível carregar a escala"
          texto={apiErrorMessage(viewQuery.error, "Verifique sua conexão e tente novamente.")}
          acao={<BotaoTentarDeNovo onClick={() => viewQuery.refetch()} tentando={viewQuery.isFetching} />}
          testId="hes-erro"
        />
      ) : rows.length === 0 && requests.length === 0 ? (
        <EstadoDoHistorico
          icone={<Inbox aria-hidden="true" />}
          titulo={eventId ? "Nenhuma vaga passou pela Validação de Escala neste evento" : "Nenhuma vaga passou pela Validação de Escala"}
          texto={eventId
            ? "A logística ainda não enviou a escala sugerida deste evento."
            : "Nenhum evento do recorte (com vaga em validação, pedido em aberto ou encerrado há pouco) tem histórico de escala. Escolha um evento acima para consultar o histórico dele."}
          acao={eventId
            ? <AcaoDoEstado principal={false} onClick={() => setEventId("")}>Ver todos os eventos</AcaoDoEstado>
            : <AcaoDoEstado principal={false} onClick={focusEventPicker}><CalendarDays className="h-4 w-4" aria-hidden="true" /> Escolher um evento</AcaoDoEstado>}
          testId="hes-vazio"
        />
      ) : (
        <>
          {rows.length > 0 && <HistorySummary h={h} eventId={eventId} />}

          {/* ── Onde a escala está travada (sem role=status: a contagem das abas é a única região live) ── */}
          {showData && stalled && (effectiveTab === "timeline" || effectiveTab === "lista") && (
            <div className={cn(AVISO, "flex-wrap items-center gap-y-2 border-warning/30 bg-warning-soft text-warning")} data-testid="hes-travada">
              <Timer className="h-4 w-4 shrink-0 self-start sm:self-center" aria-hidden="true" />
              <p className="min-w-0 flex-1 basis-[240px]">
                <span className="font-semibold">{stalled.title}.</span>{" "}
                <span>{stalled.text}</span>
              </p>
              {canOpenApproval && (
                <Link
                  href={scalingHref("/scaling-approval", eventId)}
                  className="val-alvo ml-auto inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-warning/30 bg-card px-3 text-xs font-medium text-foreground transition-colors hover:border-warning/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Abrir na Aprovação <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          )}

          <Tabs value={effectiveTab} onValueChange={(v) => setTab(v as Tab)} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              {/* Rola de lado no celular (sem barra visível) em vez de quebrar linha. */}
              <div ref={abasRef} className="val-rolagem-x relative -mx-[var(--page-gutter)] max-w-[calc(100%+2*var(--page-gutter))] px-[var(--page-gutter)] sm:mx-0 sm:max-w-full sm:px-0">
                <TabsList className="h-auto w-max gap-0.5 rounded-lg border border-border bg-background p-[3px]">
                  <Aba value="timeline" Icon={History} rotulo="Linha do tempo" />
                  <Aba value="lista" Icon={List} rotulo="Lista" />
                  {/* O quadro é função × dia DE UM evento: sem filtro ele somaria
                      dias de eventos diferentes na mesma coluna. A aba fica
                      visível e desabilitada (com o motivo no title) — sumir com
                      ela fazia a pessoa achar que a tela não tinha quadro. */}
                  <Aba value="escala" Icon={CalendarDays} rotulo="Escala" disabled={!eventId} title={eventId ? undefined : "Escolha um evento para ver o quadro função × dia"} />
                  <Aba value="pedidos" Icon={PencilLine} rotulo="Pedidos" n={requests.length} />
                </TabsList>
              </div>
              <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite" data-testid="hes-contagem">{countText}</p>
            </div>

            {/* ── ABA 1: Linha do tempo ── */}
            <TabsContent value="timeline" className="val-entra mt-0 space-y-3">
              <EventTimeline h={h} tl={tl} eventId={eventId} onPickEvent={setEventId} />
            </TabsContent>

            {/* ── ABA 2: Lista (situação atual de cada vaga) ── */}
            <TabsContent value="lista" className="val-entra mt-0 space-y-3">
              <EventInclusionsTable h={h} eventId={eventId} escalaSemEvento={escalaSemEvento} onFocusEventPicker={focusEventPicker} />
            </TabsContent>

            {/* ── ABA 3: Escala (quadro função × dia) ── */}
            <TabsContent value="escala" className="val-entra mt-0 space-y-3">
              <EventScheduleTab h={h} />
            </TabsContent>

            {/* ── ABA 4: Pedidos ── */}
            <TabsContent value="pedidos" className="val-entra mt-0 space-y-3">
              <EventRequestsTab h={h} eventId={eventId} canOpenApproval={canOpenApproval} />
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* ── Exportar CSV (aba corrente) ── */}
      <ExportDialog exp={exp} effectiveTab={effectiveTab} eventId={eventId} eventName={selectedEvent?.name} />
      {/* Leitura pura: sem callbacks de ação, o rodapé de validar/ajustar não aparece. */}
      <SuggestionDetailDrawer
        open={!!detailRow}
        onOpenChange={(o) => { if (!o) setDetailId(null); }}
        row={detailRow}
        functionName={detailRow ? functionNameById.get(detailRow.functionId) : undefined}
        event={detailRow ? activeEvents.find((e) => e.id === detailRow.eventId) : undefined}
        // Só o Histórico oferece o "abrir onde ela está": nas outras telas o
        // link apontaria para a própria tela.
        mostrarOndeEsta
      />
    </PageContainer>
  );
}
