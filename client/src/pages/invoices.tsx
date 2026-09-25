// Notas Fiscais — página de composição (modularizada em 25/09). Consultas e
// derivados em components/invoices/use-invoices-data; mutations em
// use-invoice-actions; abas, card, stepper e tela-bloqueio da empresa
// pagadora em components/invoices/*. Aqui ficam só o estado de URL/evento e
// a orquestração dos estados (erro, carregando, vazio, bloqueio, abas).
import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { isRhOrAdmin } from "@/lib/role-utils";
import { EventSearchSelect } from "@/components/event-select";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { LoadingState } from "@/components/common/loading-state";
import { QueryError } from "@/components/common/query-state";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Building2, ExternalLink, Info } from "lucide-react";
import { Link, useSearch } from "wouter";
import { useEventoEmFoco } from "@/lib/use-evento-em-foco";
import { campo, useUrlState } from "@/lib/use-url-state";
import { InvoiceStepper } from "@/components/invoices/invoice-stepper";
import { LancamentoTab } from "@/components/invoices/lancamento-tab";
import { AprovacaoTab } from "@/components/invoices/aprovacao-tab";
import { PaymentCompanyGate, usePaymentCompanyForm } from "@/components/invoices/payment-company-gate";
import { InvoicesSkeleton } from "@/components/invoices/invoices-skeleton";
import { useInvoicesData } from "@/components/invoices/use-invoices-data";
import { useSetEventCompanyMutation } from "@/components/invoices/use-invoice-actions";

// ── Main Page ────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  usePageTitle("Notas fiscais");
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Evento em foco (23/09): o mesmo do Planejado/Realizado/Comparativo — `?event=`
  // com memória por usuário; trocar de tela não pede o evento de novo.
  const { eventId: selectedEventId, setEventId: setSelectedEventId, sanitize: sanearEventoEmFoco } = useEventoEmFoco();
  // Aba e filtro de status na URL (23/09): voltar para a tela devolve o recorte;
  // `?tab=`/`?filter=` continuam sendo os nomes dos links vindos do Controle RH.
  const [urlState, setUrlState] = useUrlState({
    tab: campo.opcao<"lancamento" | "aprovacao">("lancamento"),
    filter: campo.texto(""),
  });
  const activeTab = urlState.tab;
  // Os ids de filtro diferem entre as abas — trocar de aba zera o filtro.
  const setActiveTab = useCallback((tab: "lancamento" | "aprovacao") => setUrlState({ tab, filter: "" }), [setUrlState]);
  const filterStatus = urlState.filter || "all";
  const setFilterStatus = (v: string) => setUrlState({ filter: v === "all" ? "" : v });

  // `?actual=` destaca uma linha (uma vez) — continua lido à parte.
  const search = useSearch();
  const paramActual = useMemo(() => new URLSearchParams(search).get("actual") || "", [search]);
  const [highlightActualId, setHighlightActualId] = useState<string>(paramActual);

  // Estado do formulário da empresa pagadora vive na página (ver payment-company-gate.tsx).
  const companyForm = usePaymentCompanyForm();

  const canRH = isRhOrAdmin(user);

  const {
    qEvents, activeEvents, paymentCompanies, invoices, budgetActuals, estado, dataLoading,
    getName, getFuncName, emitsNfFor, approvedActuals, getInvoice,
    pendingCount, rhPendingCount, checkinPendingCount,
  } = useInvoicesData(selectedEventId);

  // Evento em foco excluído é descartado assim que a lista chega (23/09).
  useEffect(() => {
    if (qEvents.data?.length) sanearEventoEmFoco(qEvents.data.filter(e => e.status !== "excluído").map(e => e.id));
  }, [qEvents.data, sanearEventoEmFoco]);

  // Sync from URL params when navigating from another page
  useEffect(() => {
    if (paramActual) setHighlightActualId(paramActual);
  }, [paramActual]);

  // Papel sem RH com aba "aprovacao" ativa (ex.: ?tab=aprovacao na URL) renderizaria
  // um corpo vazio — cai para "lancamento".
  useEffect(() => {
    if (activeTab === "aprovacao" && !canRH) setActiveTab("lancamento");
  }, [activeTab, canRH, setActiveTab]);

  // Auto-select the first active event when the list loads (if nothing is selected yet)
  useEffect(() => {
    if (!selectedEventId && activeEvents.length > 0) {
      setSelectedEventId(activeEvents[0].id);
    }
  }, [activeEvents, selectedEventId, setSelectedEventId]);

  const selectedEvent = activeEvents.find(e => e.id === selectedEventId);

  const setEventCompanyMutation = useSetEventCompanyMutation({ selectedEventId, qc, toast });

  const tabs = [
    { id: "lancamento" as const, label: "Lançamento",   count: pendingCount,   countCls: "bg-warning-soft text-warning" },
    ...(canRH ? [{ id: "aprovacao" as const, label: "Aprovação RH", count: rhPendingCount, countCls: "bg-warning-soft text-warning" }] : []),
  ];

  return (
    <div className="min-h-screen bg-surface-muted p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header — flex-wrap: em ~375px o select de evento quebra em vez de estourar */}
        <PageHeader
          icon={FileText}
          title={
            <span className="inline-flex items-center gap-2">
              Notas Fiscais
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="Regra de liberação da nota fiscal" className="cursor-default">
                      <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-slate-600 transition-colors" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[300px] text-xs font-normal">
                    A nota fiscal é liberada assim que o Realizado é enviado — itens devolvidos ou rejeitados pausam a NF até a regularização. Para geração automática do texto de pagamento, cadastre a empresa pagadora no evento.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          }
          subtitle={
            <>
              Envio e aprovação de notas por colaborador
              {selectedEvent?.paymentCompanyName && (
                <span className="inline-flex items-center gap-1.5 ml-2 text-muted-foreground">
                  <Building2 className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="font-medium text-slate-700">{selectedEvent.paymentCompanyName}</span>
                  {selectedEvent.paymentCompanyCnpj && (
                    <span className="text-muted-foreground">· CNPJ {selectedEvent.paymentCompanyCnpj}</span>
                  )}
                </span>
              )}
            </>
          }
          actions={activeEvents.length > 0 && (
            <EventSearchSelect
              value={selectedEventId}
              onValueChange={setSelectedEventId}
              events={activeEvents}
              className="w-72 max-w-full shrink-0"
            />
          )}
        />

        {/* Erro/carregando dos eventos (23/09): antes, enquanto a lista vinha
            — ou quando falhava — a tela dizia "Nenhum evento ativo encontrado". */}
        {qEvents.isError ? (
          <QueryError error={qEvents.error} onRetry={() => qEvents.refetch()} title="Não foi possível carregar os eventos" />
        ) : qEvents.isLoading ? (
          <LoadingState count={4} label="Carregando eventos…" />
        ) : activeEvents.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-16 text-center">
            <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-slate-600">Nenhum evento ativo encontrado</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto">Crie ou reative um evento para gerenciar as notas fiscais.</p>
            <Link href="/events">
              <a className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold rounded-xl shadow-1 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Ir para Eventos
              </a>
            </Link>
          </div>
        ) : !selectedEventId ? (
          <div className="bg-card rounded-xl border border-border p-16 text-center">
            <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Selecione um evento para gerenciar as notas fiscais</p>
          </div>
        ) : !selectedEvent?.paymentCompanyCnpj?.trim() && canRH ? (
          // Definir a empresa pagadora é ação do RH/admin — só eles veem o formulário
          <PaymentCompanyGate paymentCompanies={paymentCompanies} form={companyForm} mutation={setEventCompanyMutation} />
        ) : estado.isError ? (
          <QueryError error={estado.error} onRetry={estado.retry} title="Não foi possível carregar as notas fiscais deste evento" />
        ) : dataLoading ? (
          <InvoicesSkeleton />
        ) : (
          <>
            {/* Empresa pagadora indefinida + papel sem RH: aviso somente-leitura,
                sem bloquear a visualização das NFs */}
            {!selectedEvent?.paymentCompanyCnpj?.trim() && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-warning-soft border border-warning/25 text-xs text-warning">
                <Building2 className="w-4 h-4 text-warning-strong shrink-0" aria-hidden="true" />
                A empresa pagadora deste evento ainda não foi definida pelo RH. As notas fiscais continuam disponíveis para consulta.
              </div>
            )}

            {/* Stepper — estágio real dos itens (não a aba ativa) */}
            <InvoiceStepper counts={{ lancamento: pendingCount, aprovacao: rhPendingCount, checkin: checkinPendingCount }} />

            {/* Tabs */}
            <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    activeTab === tab.id
                      ? "bg-card text-foreground shadow-1"
                      : "text-muted-foreground hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`${tab.countCls} px-1.5 py-0.5 rounded-full text-2xs font-bold leading-none`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === "lancamento" && (
              <LancamentoTab
                approvedActuals={approvedActuals}
                emitsNfFor={emitsNfFor}
                getInvoice={getInvoice}
                getName={getName}
                getFuncName={getFuncName}
                selectedEvent={selectedEvent}
                selectedEventId={selectedEventId}
                qc={qc}
                toast={toast}
                filterStatus={filterStatus}
                onFilterStatus={setFilterStatus}
                highlightActualId={highlightActualId}
              />
            )}

            {activeTab === "aprovacao" && canRH && (
              <AprovacaoTab
                invoices={invoices}
                getName={getName}
                getFuncName={getFuncName}
                budgetActuals={budgetActuals}
                selectedEventId={selectedEventId}
                qc={qc}
                toast={toast}
                filterStatus={filterStatus}
                onFilterStatus={setFilterStatus}
                highlightActualId={highlightActualId}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
