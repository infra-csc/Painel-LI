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
 *
 * 07/10 (redesenho): a MESMA casca de Passagens/Hospedagem — barra da tela
 * de 56px grudada no topo (título, o recorte por extenso e "Novo evento"),
 * conteúdo em até 1560px, a faixa de resumo no lugar dos quatro cartões, a
 * barra de filtros comum e os estados (carregando com a geometria real, erro
 * com o motivo, vazios que dizem por quê) dentro da mesma casca — a pessoa
 * sempre sabe onde está e nada "pula" quando os dados chegam.
 */
import { useState, type ReactNode } from "react";
import { CloudOff, Plus, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import type { Event } from "@shared/schema";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { hasRole } from "@/lib/role-utils";
import EventModal from "@/components/modals/event-modal";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { useEventsData } from "@/components/events/use-events-data";
import { useEventsFilters, OPCOES_DE_STATUS } from "@/components/events/use-events-filters";
import { EventsKpis } from "@/components/events/events-kpis";
import { EventsFilterBar } from "@/components/events/events-filter-bar";
import { EventsTable } from "@/components/events/events-table";
import { EventsList } from "@/components/events/events-list";
import { CalendarView, WeekView } from "@/components/events/events-calendar-views";
import { EventsEmpty } from "@/components/events/events-empty";
import { formatPeriod } from "@/components/events/events-shared";

/** O recorte de status por extenso, para a barra da tela ("5 eventos planejados ou em andamento"). [singular, plural] */
const STATUS_POR_EXTENSO: Record<string, [string, string]> = {
  default: ["planejado ou em andamento", "planejados ou em andamento"], all: ["em todos os status", "em todos os status"],
  active: ["ativo", "ativos"], planejado: ["planejado", "planejados"], "em andamento": ["em andamento", "em andamento"],
  "concluído": ["concluído", "concluídos"], "excluído": ["excluído", "excluídos"],
};

/** Esqueleto com a geometria real: faixa de resumo, barra de filtros e as primeiras linhas. */
function Carregando() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando eventos" className="flex flex-col gap-4">
      <span className="sr-only">Carregando eventos…</span>
      <div aria-hidden="true" className="grid grid-cols-2 sm:grid-cols-4 rounded-xl border border-border bg-card overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`px-3.5 pt-3 pb-3.5 space-y-2 ${i % 2 === 1 ? "border-l border-border" : ""} ${i >= 2 ? "border-t sm:border-t-0 border-border" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
            <div className="pas-osso h-3 w-20" />
            <div className="pas-osso h-5 w-28" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="flex gap-2">
        <div className="pas-osso h-[34px] flex-[1_1_220px] max-w-[340px] rounded-lg" />
        <div className="pas-osso h-[34px] w-[170px] rounded-lg hidden sm:block" />
        <div className="pas-osso h-[34px] w-[138px] rounded-lg hidden sm:block" />
        <div className="pas-osso h-[34px] w-[128px] rounded-lg hidden md:block" />
        <div className="pas-osso h-[34px] w-[110px] sm:w-[300px] rounded-lg ml-auto" />
      </div>
      <div aria-hidden="true" className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-10 bg-surface-muted border-b border-border" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0">
            <div className="pas-osso h-[22px] w-11" />
            <div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-3/5" /><div className="pas-osso h-2.5 w-2/5" /></div>
            <div className="pas-osso h-3.5 w-28 hidden md:block" />
            <div className="pas-osso h-[22px] w-24 hidden md:block" />
            <div className="pas-osso h-3.5 w-8 hidden md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

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

  const emptyNode = (
    <EventsEmpty
      hasFilters={f.hasFilters} onClear={f.clearFilters} onNew={podeCadastrar ? () => openModal() : undefined}
      busca={f.search} totalCadastrados={d.events?.length ?? 0} onVerTodos={() => f.setStatusFilter("all")}
    />
  );
  const acoes = {
    onEdit: openModal,
    onDelete: isAdmin ? d.confirmDelete : undefined,
    onRestore: d.confirmRestore,
    busy: d.isMutating,
    podeEditar: podeCadastrar,
  };

  // ── Barra da tela: título, o recorte por extenso e a ação principal ──
  const plural = (n: number) => (n === 1 ? "evento" : "eventos");
  const outrosFiltros = !!(f.search.trim() || f.monthFilter !== "all" || f.yearFilter !== "all");
  const subtitulo: ReactNode = d.isLoading ? "Carregando…" : falhou ? null : isCalendarLike
    ? <>{visibleCount} {plural(visibleCount)} {visibleCount === 1 ? "ativo" : "ativos"} no calendário</>
    : <span data-testid="resumo-do-recorte">
        {visibleCount} {plural(visibleCount)} {STATUS_POR_EXTENSO[f.statusFilter]?.[visibleCount === 1 ? 0 : 1] ?? (OPCOES_DE_STATUS.find(o => o.id === f.statusFilter)?.nome ?? "")}
        {outrosFiltros && <span className="text-muted-foreground/80"> · com busca ou filtro</span>}
      </span>;
  const botaoNovo = podeCadastrar ? (
    <Button onClick={() => openModal()} data-testid="button-add-event" className="h-[34px] rounded-lg px-3.5 text-sm font-semibold hover:bg-primary-hover">
      <Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" /> Novo evento
    </Button>
  ) : undefined;

  // Confirmação: o diálogo mostra QUAL evento (antes só o nome entre aspas).
  const ev = d.confirmState.evento;
  const escDoEvento = ev ? d.escalacoes[ev.id] ?? 0 : 0;
  const detalhes = ev ? (
    <div className="space-y-0.5">
      <p className="m-0 font-semibold text-sm leading-5"><span className="font-mono text-primary">#{ev.eventNumber}</span> · {ev.name}</p>
      <p className="m-0 text-muted-foreground">{formatPeriod(ev.startDate, ev.endDate)} · {ev.location}</p>
      {escDoEvento > 0 && <p className="m-0 text-muted-foreground">{escDoEvento} {escDoEvento === 1 ? "escalação ativa" : "escalações ativas"}</p>}
    </div>
  ) : undefined;

  let conteudo: ReactNode;
  if (d.isLoading) conteudo = <Carregando />;
  else if (falhou) conteudo = (
    /* Sem este ramo, uma falha de rede/sessão expirada aparecia como "nenhum evento". */
    <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
        <CloudOff className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar os eventos</h2>
      <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">{d.loadErrorMsg(d.error)}</p>
      <Button variant="outline" className="mt-5 rounded-lg" onClick={() => d.refetch()}>
        <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />Tentar novamente
      </Button>
    </div>
  );
  // Nenhum evento cadastrado: uma faixa de zeros e filtros sem o que filtrar
  // só empurram o convite para baixo — fica o vazio, sozinho.
  else if ((d.events?.length ?? 0) === 0) conteudo = emptyNode;
  else conteudo = (
    <>
      {/* A faixa de resumo: cada bloco conta E filtra (reclicar desliga). */}
      <EventsKpis stats={d.stats} events={d.activeEvents} statusFilter={f.statusFilter} onFilter={f.escolherDoResumo} />

      <EventsFilterBar filtros={f} availableYears={d.availableYears} />

      {f.viewMode === "table" ? (
        <EventsTable events={f.filteredAndSorted} escalacoes={d.escalacoes} empty={emptyNode}
          sortKey={f.sortKey} sortDir={f.sortDir} handleSort={f.handleSort} {...acoes} />
      ) : f.viewMode === "list" ? (
        <EventsList events={f.filteredAndSorted} escalacoes={d.escalacoes} empty={emptyNode} {...acoes} />
      ) : f.viewMode === "calendar" ? (
        <CalendarView events={d.activeEvents} onEdit={openModal} currentDate={calDate} setCurrentDate={setCalDate} />
      ) : (
        <WeekView events={d.activeEvents} onEdit={openModal} currentDate={calDate} setCurrentDate={setCalDate} />
      )}
    </>
  );

  return (
    <TooltipProvider>
      {/* Margens pela variável do layout: a barra sangra até as bordas da
          página e o conteúdo fica em até 1560px — a casca de Passagens. */}
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
        <PageHeader variant="bar" title="Eventos" subtitle={subtitulo} className="mx-0 mt-0" actions={botaoNovo} />
        <div className="px-[var(--page-gutter)] pt-5 pb-6">
          <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">{conteudo}</div>
        </div>
      </div>

      <EventModal open={isModalOpen} onClose={closeModal} event={editingEvent} />
      <ConfirmDialog
        open={d.confirmState.open}
        onOpenChange={(o) => { if (!o) d.closeConfirm(); }}
        title={d.confirmState.title} description={d.confirmState.message}
        confirmLabel={d.confirmState.confirmLabel}
        tone={d.confirmState.variant === "delete" ? "danger" : "default"}
        icon={d.confirmState.variant === "delete" ? Trash2 : RotateCcw}
        detalhes={detalhes}
        onConfirm={d.confirmState.onConfirm}
        testId="confirm-evento"
      />
    </TooltipProvider>
  );
}
