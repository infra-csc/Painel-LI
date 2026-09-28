/**
 * Eventos — composição (28/09). Até aqui este arquivo tinha 778 linhas com
 * dados, filtros, quatro visualizações, a tabela e o modo cartão inline. Agora:
 *  - dados e ações: components/events/use-events-data.ts;
 *  - filtros/ordenação/visualização na URL: use-events-filters.ts;
 *  - apresentação: events-kpis, events-filter-bar, events-table (DataTable),
 *    events-list (Lista + cartão), events-calendar-views (Mês/Semana),
 *    events-empty e event-row-actions.
 * Nada de comportamento mudou — só o lugar onde cada pedaço vive (e os
 * filtros, que agora sobrevivem ao Voltar).
 */
import { useState } from "react";
import { CalendarDays, CloudOff, Plus } from "lucide-react";
import type { Event } from "@shared/schema";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { hasRole } from "@/lib/role-utils";
import EventModal from "@/components/modals/event-modal";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageHeader } from "@/components/common/page-header";
import { PageContainer } from "@/components/common/page-container";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import { useEventsData } from "@/components/events/use-events-data";
import { useEventsFilters } from "@/components/events/use-events-filters";
import { EventsKpis } from "@/components/events/events-kpis";
import { EventsFilterBar } from "@/components/events/events-filter-bar";
import { EventsTable } from "@/components/events/events-table";
import { EventsList } from "@/components/events/events-list";
import { CalendarView, WeekView } from "@/components/events/events-calendar-views";
import { EventsEmpty } from "@/components/events/events-empty";

export default function Events() {
  // Excluir evento: só administrador (dono, 18/09). Os demais só reativam.
  const { user } = useAuth();
  const isAdmin = ["admin", "administrator", "administrador"].includes(String(user?.role ?? ""));
  // POST/PATCH /api/events: CADASTRO_ROLES (admin, Compras, Logística). RH vê a
  // lista, mas não cria nem edita — o botão some (é ação de outro módulo).
  const podeCadastrar = hasRole(user, "admin", "purchasing", "production");
  usePageTitle("Eventos");

  const d = useEventsData();
  const f = useEventsFilters(d.events);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [calDate, setCalDate] = useState(new Date());

  const openModal = (ev?: Event) => { setEditingEvent(ev ?? null); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setEditingEvent(null); };

  // Calendário e semana mostram todos os eventos ativos (não passam pelos filtros).
  const isCalendarLike = f.viewMode === "calendar" || f.viewMode === "week";
  const visibleCount = isCalendarLike ? d.activeEvents.length : f.filteredAndSorted.length;
  const falhou = d.isError && !d.events;

  const emptyNode = <EventsEmpty hasFilters={f.hasFilters} onClear={f.clearFilters} onNew={() => openModal()} />;
  const acoes = {
    onEdit: openModal,
    onDelete: isAdmin ? d.confirmDelete : undefined,
    onRestore: d.confirmRestore,
    busy: d.isMutating,
    podeEditar: podeCadastrar,
  };

  return (
    <TooltipProvider>
      <PageContainer fluid>
        <PageHeader
          icon={CalendarDays}
          title="Eventos"
          subtitle="Controle e acompanhamento de cronogramas logísticos"
          actions={podeCadastrar ? (
            <Button onClick={() => openModal()} data-testid="button-add-event" className="h-9 text-sm font-semibold shadow-2 hover:bg-primary-hover">
              <Plus size={15} strokeWidth={2.5} aria-hidden="true" /> Novo evento
            </Button>
          ) : undefined}
        />

        {/* Indicadores escondidos em erro: zeros dariam a impressão de "não há eventos". */}
        {!d.isLoading && !falhou && (
          <EventsKpis stats={d.stats} statusFilter={f.statusFilter} onFilter={f.filterFromCard} />
        )}

        <EventsFilterBar filtros={f} availableYears={d.availableYears} visibleCount={visibleCount} />

        {d.isLoading ? (
          <LoadingState count={6} label="Carregando eventos…" />
        ) : falhou ? (
          /* Sem este ramo, uma falha de rede/sessão expirada aparecia como "nenhum evento". */
          <div role="alert" className="bg-card rounded-xl border border-danger/25 px-6 py-12 text-center">
            <CloudOff className="w-8 h-8 text-danger-strong mx-auto mb-2.5" aria-hidden="true" />
            <p className="text-sm font-bold text-foreground mb-1">Não foi possível carregar os eventos</p>
            <p className="text-xs text-muted-foreground mb-4">{d.loadErrorMsg(d.error)}</p>
            <Button variant="outline" size="sm" onClick={() => d.refetch()}>Tentar novamente</Button>
          </div>
        ) : f.viewMode === "table" ? (
          <EventsTable events={f.filteredAndSorted} escalacoes={d.escalacoes} empty={emptyNode}
            sortKey={f.sortKey} sortDir={f.sortDir} handleSort={f.handleSort} {...acoes} />
        ) : f.viewMode === "list" ? (
          <EventsList events={f.filteredAndSorted} escalacoes={d.escalacoes} empty={emptyNode} {...acoes} />
        ) : f.viewMode === "calendar" ? (
          <CalendarView events={d.activeEvents} onEdit={openModal} currentDate={calDate} setCurrentDate={setCalDate} />
        ) : (
          <WeekView events={d.activeEvents} onEdit={openModal} currentDate={calDate} setCurrentDate={setCalDate} />
        )}
      </PageContainer>

      <EventModal open={isModalOpen} onClose={closeModal} event={editingEvent} />
      <ConfirmDialog
        open={d.confirmState.open}
        onOpenChange={(o) => { if (!o) d.closeConfirm(); }}
        title={d.confirmState.title} description={d.confirmState.message}
        confirmLabel={d.confirmState.confirmLabel}
        tone={d.confirmState.variant === "delete" ? "danger" : "default"}
        onConfirm={d.confirmState.onConfirm}
      />
    </TooltipProvider>
  );
}
