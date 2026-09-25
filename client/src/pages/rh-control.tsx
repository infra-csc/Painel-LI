/**
 * CONTROLE RH — página de composição (25/09, modularização).
 *
 * Até 24/09 este arquivo tinha ~2.000 linhas: consultas, cruzamento da fila,
 * filtros, cards de métrica, cartão de prestação (closure de 500 linhas) e a
 * timeline. Agora:
 *  - dados: `useRhControlData` (UMA consulta ao endpoint agregado
 *    GET /api/rh/controle?eventId=&status= — o cruzamento roda no servidor),
 *    `useRhFiltros` (filtros na URL) e `useRhFilaFiltrada` (filtros do client
 *    + agrupamento por evento);
 *  - apresentação: components/rh/** (RhSummary, RhPendingBanner, RhFilters,
 *    RhEventGroup → CartaoPrestacao → Linha/Corpo/Timeline).
 * Evento e status (inclusive os card-filtros) vão para o servidor; busca,
 * função, colaborador, NF e check-in filtram no client.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Calendar, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { QueryError } from "@/components/common/query-state";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { isRhOrAdmin } from "@/lib/role-utils";
import { useRhControlData } from "@/components/rh/use-rh-control-data";
import { useRhFiltros } from "@/components/rh/use-rh-filtros";
import { useRhFilaFiltrada } from "@/components/rh/use-rh-fila-filtrada";
import { RhSummary } from "@/components/rh/rh-summary";
import { RhPendingBanner } from "@/components/rh/rh-pending-banner";
import { RhFilters } from "@/components/rh/rh-filters";
import { RhEventGroup } from "@/components/rh/rh-event-group";

const ETAPAS_DO_SUBTITULO = [
  { label: "Escalação", color: "var(--muted-foreground)" },
  { label: "Planejado", color: "var(--primary)" },
  { label: "Realizado", color: "var(--primary)" },
  { label: "Aprovação", color: "var(--success)" },
  { label: "Nota Fiscal", color: "var(--primary)" },
  { label: "Check-in", color: "var(--success)" },
];

export default function RhControlPage() {
  usePageTitle("Controle RH");
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const filtros = useRhFiltros(user?.id);
  const { filterEvent, hasActiveFilters, showConcluded, isRhFilterActive } = filtros;

  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [approvingInvoiceId, setApprovingInvoiceId] = useState<string | null>(null);
  const [nfApproving, setNfApproving] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const toggleDetails = useCallback((id: string) => setExpandedDetails(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  }), []);

  const eventoSelecionado = filterEvent !== "all" ? filterEvent : null;
  const dados = useRhControlData(eventoSelecionado, filtros.filterStatus);
  const { estado, isLoading, atualizando, statusCounts, invoiceCounts, rhActionCount, concludedCount, totalForProgress } = dados;
  const canRh = isRhOrAdmin(user);

  const { filteredItems, eventGroups } = useRhFilaFiltrada(dados, filtros);

  const didAutoExpand = useRef(false);
  useEffect(() => {
    if (eventGroups.length > 0 && !didAutoExpand.current) {
      didAutoExpand.current = true;
      const toExpand = eventGroups.filter(g => g.actionNeeded > 0).map(g => g.event.id);
      if (toExpand.length > 0) {
        setExpandedEvents(new Set(toExpand));
      } else if (eventGroups.length <= 3) {
        setExpandedEvents(new Set(eventGroups.map(g => g.event.id)));
      }
    }
  }, [eventGroups]);

  // Atualização FUNCIONAL: o card memoizado guarda o closure do seu último
  // render — ler `expandedCards` aqui apagaria a expansão de outros cards.
  const toggleExpand = useCallback((id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleEventExpand = (eventId: string) => {
    const next = new Set(expandedEvents);
    if (next.has(eventId)) next.delete(eventId); else next.add(eventId);
    setExpandedEvents(next);
  };

  const expandAllEvents = () => setExpandedEvents(new Set(eventGroups.map(g => g.event.id)));
  const collapseAllEvents = () => setExpandedEvents(new Set());

  const recusadaCount = statusCounts.recusada || 0;

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-24">

      {/* ── Page header ── */}
      <PageHeader
        icon={Shield}
        title="Controle RH"
        subtitle={
          <span className="inline-flex items-center gap-1 flex-wrap">
            <span className="mr-1">Prestações de contas ·</span>
            {ETAPAS_DO_SUBTITULO.map((step, i, arr) => (
              <span key={step.label} className="flex items-center gap-1">
                <span className="font-semibold" style={{ color: step.color }}>{step.label}</span>
                {i < arr.length - 1 && <span className="text-muted-foreground" aria-hidden="true">→</span>}
              </span>
            ))}
          </span>
        }
      />

      {/* ── Metric cards ── */}
      <RhSummary
        statusCounts={statusCounts}
        invoiceCounts={invoiceCounts}
        rhActionCount={rhActionCount}
        concludedCount={concludedCount}
        totalForProgress={totalForProgress}
        isLoading={isLoading}
        filtros={filtros}
      />

      {/* ── Pending action banner ── */}
      {!isLoading && rhActionCount > 0 && !isRhFilterActive && (
        <RhPendingBanner dados={dados} filtros={filtros} />
      )}

      {/* ── Search + filters ── */}
      <RhFilters
        filtros={filtros}
        eventos={dados.eventosDoSelect}
        funcoes={dados.funcoes}
        concludedCount={concludedCount}
        recusadaCount={recusadaCount}
        filteredCount={filteredItems.length}
      />

      {/* ── Content ── */}
      {estado.isError ? (
        <QueryError error={estado.error} onRetry={estado.retry} title="Não foi possível carregar as prestações" />
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-lg border border-border bg-card px-4 py-3 animate-pulse motion-reduce:animate-none flex items-center gap-3">
              <div className="w-8 h-8 bg-border rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-border rounded w-32" />
                <div className="h-2.5 bg-muted rounded w-48" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div id="rh-listing" className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-muted-foreground">Nenhum item encontrado</p>
          <p className="text-xs text-muted-foreground mt-1">
            {hasActiveFilters ? "Ajuste os filtros para ver mais resultados." :
             showConcluded ? "Nenhum item encontrado." :
             "Todos os itens estão em dia. Ative 'Mostrar concluídos e recusados' para ver o histórico completo."}
          </p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" className="mt-3 text-xs"
              onClick={() => {
                // Reseta TODOS os filtros — incl. Nota Fiscal e os card-filtros
                // (rh_action/col_action/nf_andamento/concluidos vivem em filterStatus)
                filtros.setFilterEvent("all"); filtros.setFilterFunction("all"); filtros.setFilterCollaborator("all");
                filtros.setFilterStatus("all"); filtros.setFilterInvoiceStatus("all"); filtros.setSearchTerm(""); filtros.setFilterCheckinOnly(false);
              }}>
              Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        // `atualizando`: trocar evento/card mantém a lista anterior esmaecida
        // até o novo recorte chegar (placeholderData), em vez de piscar o skeleton.
        <div id="rh-listing" className={`space-y-2 transition-opacity ${atualizando ? "opacity-60" : ""}`} aria-busy={atualizando}>
          {/* Section header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs font-medium text-slate-600">Por evento</span>
              <span className="text-2xs text-muted-foreground" aria-live="polite">
                {eventGroups.length} evento{eventGroups.length !== 1 ? "s" : ""} · {filteredItems.length} ite{filteredItems.length === 1 ? "m" : "ns"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button className="text-2xs text-primary hover:text-primary-hover font-medium" onClick={expandAllEvents}>Expandir tudo</button>
              <button className="text-2xs text-muted-foreground hover:text-slate-600 font-medium" onClick={collapseAllEvents}>Recolher tudo</button>
            </div>
          </div>

          {/* Event groups */}
          {eventGroups.map(group => (
            <RhEventGroup
              key={group.event.id}
              group={group}
              isOpen={expandedEvents.has(group.event.id)}
              onToggle={toggleEventExpand}
              expandedCards={expandedCards}
              expandedDetails={expandedDetails}
              approvingInvoiceId={approvingInvoiceId}
              nfApproving={nfApproving}
              canRh={canRh}
              toggleExpand={toggleExpand}
              toggleDetails={toggleDetails}
              navigate={navigate}
              setApprovingInvoiceId={setApprovingInvoiceId}
              setNfApproving={setNfApproving}
              toast={toast}
            />
          ))}
        </div>
      )}

    </div>
  );
}
