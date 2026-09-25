/**
 * Histórico da escala — a página (25/09).
 *
 * Só orquestra: aba/evento na URL, os hooks de dados, linha do tempo e
 * exportação, e as abas em components/scaling-validation/event-view/*.
 * Tinha 1.610 linhas num componente só.
 */
import { useCallback, useMemo, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AlertCircle, CalendarRange, History, Info, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SuggestionDetailDrawer } from "@/components/scaling-validation/suggestion-detail-drawer";
import { EventCommentsButton } from "@/components/scaling-validation/event-comments-dialog";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/common/loading-state";
import { EmptyState } from "@/components/common/empty-state";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { hasPermission } from "@/lib/role-utils";
import { apiErrorMessage } from "@/lib/utils";
import { scalingHref, useScalingEvent } from "@/lib/use-scaling-event";
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";
import { BASE_PATH, LABEL, TABS, plural, type Tab } from "@/components/scaling-validation/event-view/event-view-shared";
import { useEventHistory } from "@/components/scaling-validation/event-view/use-event-history";
import { timelineArgsFrom, useEventTimeline } from "@/components/scaling-validation/event-view/use-event-timeline";
import { useEventExport } from "@/components/scaling-validation/event-view/use-event-export";
import { EventContextBar } from "@/components/scaling-validation/event-view/event-context-bar";
import { EventTimeline } from "@/components/scaling-validation/event-view/event-timeline";
import { EventInclusionsTable } from "@/components/scaling-validation/event-view/event-inclusions-table";
import { EventScheduleTab } from "@/components/scaling-validation/event-view/event-schedule-tab";
import { EventRequestsTab } from "@/components/scaling-validation/event-view/event-requests-tab";
import { ExportButton, ExportDialog } from "@/components/scaling-validation/event-view/export-dialog";

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

  // ── Render ──
  return (
    <PageContainer fluid className="space-y-4">
      <PageHeader
        icon={History}
        title="Histórico da escala"
        subtitle="Cada envio, validação, pedido e decisão — e onde cada vaga está agora."
        actions={
          <>
            {selectedEvent && <EventCommentsButton eventId={selectedEvent.id} eventName={selectedEvent.name} />}
            <ExportButton exp={exp} effectiveTab={effectiveTab} />
          </>
        }
      />
      {/* A fila do módulo (Sugestão → Validação → Aprovação → Histórico) tem
          faixa própria: dividindo a linha com os botões de ação ela parecia
          mais um botão — e espremia "Exportar CSV" em telas médias. */}
      <ScalingModuleNav current="history" eventId={eventId} className="-mt-1" />

      {/* ── Barra de contexto: evento · última movimentação · funil · KPIs ── */}
      <EventContextBar ref={eventPickerRef} h={h} eventId={eventId} setEventId={setEventId} lastMovement={tl.lastMovement} />

      {/* ── Onde a escala está travada (sem role=status: a contagem das abas é a única região live) ── */}
      {showData && stalled && (effectiveTab === "timeline" || effectiveTab === "lista") && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/25 bg-warning-soft px-3.5 py-2.5">
          <Timer className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-warning">{stalled.title}</p>
            <p className="mt-0.5 text-xs text-warning">{stalled.text}</p>
          </div>
          {canOpenApproval && (
            <Link href={scalingHref("/scaling-approval", eventId)} className="ml-auto text-xs font-medium text-primary hover:underline whitespace-nowrap">
              Abrir na Aprovação
            </Link>
          )}
        </div>
      )}

      {/* Teto do modo "todos os eventos" — a consulta histórica é a que mais
          cresce, então quando ela é cortada o filtro é a saída. Tom NEUTRO de
          propósito: não é um problema da escala (esse é o âmbar do "travada"
          acima), é só um aviso de que a página não mostra tudo. */}
      {truncated && (
        <p role="status" className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted px-3.5 py-2.5 text-xs text-slate-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            <span className="font-semibold text-slate-700">Histórico parcial</span> — são muitos movimentos para mostrar de uma vez
            {viewQuery.data?.rowLimit ? ` (teto de ${viewQuery.data.rowLimit} vagas)` : ""}. Escolha um evento acima para ver o histórico completo dele.
          </span>
        </p>
      )}

      {/* As funções entram no gate (como na Validação): sem elas a tela abriria
          com "Sem função" em toda linha até a segunda consulta responder. */}
      {viewQuery.isLoading || (loadingFunctions && !functions) ? (
        <LoadingState count={5} label={viewQuery.isLoading ? (eventId ? "Carregando escala do evento…" : "Carregando histórico dos eventos…") : "Carregando funções…"} />
      ) : viewQuery.error ? (
        <div role="alert" className="rounded-xl border border-danger/25 bg-card p-6 text-center">
          <AlertCircle className="mx-auto mb-2 h-5 w-5 text-danger-strong" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-700">Não foi possível carregar a escala</p>
          <p className="mt-1 text-xs text-muted-foreground">{apiErrorMessage(viewQuery.error, "Verifique sua conexão e tente novamente.")}</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => viewQuery.refetch()}>Tentar novamente</Button>
        </div>
      ) : rows.length === 0 && requests.length === 0 ? (
        <EmptyState
          className="rounded-xl"
          icon={CalendarRange}
          title={eventId ? "Nenhuma vaga passou pela Validação de Escala neste evento" : "Nenhuma vaga passou pela Validação de Escala"}
          description={eventId
            ? "A logística ainda não enviou a escala sugerida deste evento."
            : "Nenhum evento do recorte (com vaga em validação, pedido em aberto ou encerrado há pouco) tem histórico de escala. Escolha um evento acima para consultar o histórico dele."}
        />
      ) : (
        <Tabs value={effectiveTab} onValueChange={(v) => setTab(v as Tab)} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="h-auto rounded-xl bg-muted p-[3px]">
              <TabsTrigger value="timeline" className="h-7 rounded-lg px-3.5 text-sm">Linha do tempo</TabsTrigger>
              <TabsTrigger value="lista" className="h-7 rounded-lg px-3.5 text-sm">Lista</TabsTrigger>
              {/* O quadro é função × dia DE UM evento: sem filtro ele somaria
                  dias de eventos diferentes na mesma coluna. A aba fica
                  visível e desabilitada (com o motivo no title) — sumir com
                  ela fazia a pessoa achar que a tela não tinha quadro. */}
              <TabsTrigger
                value="escala"
                disabled={!eventId}
                title={eventId ? undefined : "Escolha um evento para ver o quadro função × dia"}
                className="h-7 rounded-lg px-3.5 text-sm disabled:pointer-events-auto disabled:cursor-not-allowed"
              >
                Escala
              </TabsTrigger>
              <TabsTrigger value="pedidos" className="h-7 rounded-lg px-3.5 text-sm">Pedidos{requests.length ? ` (${requests.length})` : ""}</TabsTrigger>
            </TabsList>
            <p className={LABEL} aria-live="polite">{countText}</p>
          </div>

          {/* ── ABA 1: Linha do tempo ── */}
          <TabsContent value="timeline" className="mt-0 space-y-3">
            <EventTimeline h={h} tl={tl} eventId={eventId} />
          </TabsContent>

          {/* ── ABA 2: Lista (situação atual de cada vaga) ── */}
          <TabsContent value="lista" className="space-y-3 mt-0">
            <EventInclusionsTable h={h} eventId={eventId} escalaSemEvento={escalaSemEvento} onFocusEventPicker={focusEventPicker} />
          </TabsContent>

          {/* ── ABA 3: Escala (quadro função × dia) ── */}
          <TabsContent value="escala" className="mt-0 space-y-2.5">
            <EventScheduleTab h={h} />
          </TabsContent>

          {/* ── ABA 4: Pedidos ── */}
          <TabsContent value="pedidos" className="mt-0 space-y-3">
            <EventRequestsTab h={h} eventId={eventId} canOpenApproval={canOpenApproval} />
          </TabsContent>
        </Tabs>
      )}

      {/* ── Exportar CSV (aba corrente) ── */}
      <ExportDialog exp={exp} effectiveTab={effectiveTab} eventId={eventId} />
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
