// Notas fiscais — página de composição (modularizada em 25/09). Consultas e
// derivados em components/invoices/use-invoices-data; mutations em
// use-invoice-actions; abas, card, stepper e tela-bloqueio da empresa
// pagadora em components/invoices/*. Aqui ficam só o estado de URL/evento e
// a orquestração dos estados (erro, carregando, vazio, bloqueio, abas).
//
// 08/10 (redesenho, irmã do Planejado): a mesma casca das telas da família —
// barra de contexto de 56px grudada com o título, a regra de liberação e o
// evento como seletor (nome + período · local); conteúdo até 1560px com o
// painel das três etapas (quantas e quanto em cada uma) e a empresa pagadora,
// abas de verdade abaixo, e a lista de cada aba com pílulas de situação e
// busca. A barra aparece em todos os estados (carregando, erro, vazio,
// bloqueio): a pessoa sempre sabe onde está.
import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { isRhOrAdmin } from "@/lib/role-utils";
import { EventSearchSelect } from "@/components/event-select";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { QueryError } from "@/components/common/query-state";
import { BuscaDaLista } from "@/components/common/barra-de-filtros";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Building2, CalendarX2, Info, ClipboardList, ShieldCheck } from "lucide-react";
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
import { periodoDoEvento } from "@/components/invoices/invoice-format";
import { EstadoDaLista, BOTAO_SAIDA } from "@/components/invoices/estado-da-lista";

type AbaId = "lancamento" | "aprovacao";

/** As duas abas: de verdade (`tablist`), com o número do que espera em cada uma. */
function AbasDasNotas({ abas, ativa, onTrocar, aDireita }: {
  abas: { id: AbaId; label: string; count: number; icone: typeof ClipboardList; dica: string }[];
  ativa: AbaId;
  onTrocar: (id: AbaId) => void;
  /** A busca da lista, à direita das abas (no celular, embaixo). */
  aDireita?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 sm:border-b sm:border-border">
    <div className="pas-rolagem-x -mx-[var(--page-gutter)] px-[var(--page-gutter)] sm:mx-0 sm:px-0 border-b border-border sm:border-b-0 sm:self-end">
      <div role="tablist" aria-label="Etapas das notas fiscais na tela" className="flex items-end gap-1 min-w-max">
        {abas.map((t, idx) => {
          const Icone = t.icone;
          const on = ativa === t.id;
          return (
            <button
              key={t.id}
              id={`nf-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`nf-painel-${t.id}`}
              tabIndex={on ? 0 : -1}
              title={t.dica}
              onClick={() => onTrocar(t.id)}
              onKeyDown={e => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = e.key === "ArrowRight" ? (idx + 1) % abas.length : (idx - 1 + abas.length) % abas.length;
                onTrocar(abas[next].id);
                document.getElementById(`nf-tab-${abas[next].id}`)?.focus();
              }}
              className={`group relative inline-flex items-center gap-2 h-11 px-3 -mb-px text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring rounded-t-md ${
                on ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`nf-aba-${t.id}`}
            >
              <Icone className={`w-4 h-4 shrink-0 ${on ? "" : "text-muted-foreground group-hover:text-foreground"}`} aria-hidden="true" />
              {t.label}
              {t.count > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-2xs font-semibold tabular-nums bg-warning-soft text-warning">
                  {t.count}
                  <span className="sr-only"> aguardando</span>
                </span>
              )}
              {/* Filete da ativa: cresce do centro, a mesma microinteração das irmãs. */}
              <span
                aria-hidden="true"
                className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none ${on ? "scale-x-100" : "scale-x-0"}`}
              />
            </button>
          );
        })}
      </div>
    </div>
    {aDireita && <div className="w-full sm:w-[320px] sm:ml-auto sm:pb-1.5">{aDireita}</div>}
    </div>
  );
}

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
  // `?q=` (08/10): a busca por colaborador, função ou OC.
  const [urlState, setUrlState] = useUrlState({
    tab: campo.opcao<AbaId>("lancamento"),
    filter: campo.texto(""),
    q: campo.texto(""),
  });
  const activeTab = urlState.tab;
  // Os ids de filtro diferem entre as abas — trocar de aba zera o filtro.
  const setActiveTab = useCallback((tab: AbaId) => setUrlState({ tab, filter: "" }), [setUrlState]);
  const filterStatus = urlState.filter || "all";
  const setFilterStatus = (v: string) => setUrlState({ filter: v === "all" ? "" : v });
  const busca = urlState.q;
  const setBusca = (v: string) => setUrlState({ q: v });

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
    pendingValue, rhPendingValue, checkinPendingValue,
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

  // Escolhe o primeiro evento ativo quando a lista chega e nada está escolhido —
  // MAS não depois que a pessoa limpou o evento no "×": antes este efeito
  // escolhia de novo na mesma hora e o "×" parecia não fazer nada.
  const limpouOEventoRef = useRef(false);
  const trocarEvento = useCallback((id: string) => {
    limpouOEventoRef.current = !id;
    setSelectedEventId(id);
  }, [setSelectedEventId]);
  useEffect(() => {
    if (!selectedEventId && activeEvents.length > 0 && !limpouOEventoRef.current) {
      setSelectedEventId(activeEvents[0].id);
    }
  }, [activeEvents, selectedEventId, setSelectedEventId]);

  const selectedEvent = activeEvents.find(e => e.id === selectedEventId);

  const setEventCompanyMutation = useSetEventCompanyMutation({ selectedEventId, qc, toast });

  const tabs = [
    { id: "lancamento" as const, label: "Lançamento", count: pendingCount, icone: ClipboardList,
      dica: "Envio da nota (OC e arquivo) de cada item do Realizado" },
    ...(canRH ? [{ id: "aprovacao" as const, label: "Aprovação RH", count: rhPendingCount, icone: ShieldCheck,
      dica: "Análise do RH: aprovar, devolver, recusar e check-in financeiro" }] : []),
  ];

  const temPagadora = !!selectedEvent?.paymentCompanyCnpj?.trim();
  const detalheDoEvento = selectedEvent
    ? [periodoDoEvento(selectedEvent), selectedEvent.location].filter(Boolean).join(" · ")
    : undefined;

  // ── Barra de contexto (em todos os estados) ──
  const regraDeLiberacao = (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Regra de liberação da nota fiscal"
            className="pas-alvo inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="w-4 h-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[320px] text-xs font-normal leading-relaxed">
          A nota fiscal é liberada assim que o Realizado é enviado — itens devolvidos ou rejeitados pausam a NF até a regularização. Para geração automática do texto de pagamento, cadastre a empresa pagadora no evento.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const barra = (
    <PageHeader
      variant="bar"
      // A regra de liberação mora ao lado do título (no celular, o contexto desce).
      title={<span className="inline-flex items-center gap-1">Notas fiscais{regraDeLiberacao}</span>}
      // No celular a barra tem dois andares: grudada, comia a tela (como no Planejado).
      className="mx-0 mt-0 gap-x-3 max-sm:static"
      subtitle={selectedEventId && activeEvents.length > 0 ? undefined : "envio e aprovação de notas por colaborador"}
      context={selectedEventId && activeEvents.length > 0 ? (
          <>
            <span aria-hidden="true" className="hidden sm:block w-px h-5 bg-border shrink-0" />
            <EventSearchSelect
              variante="barra"
              value={selectedEventId}
              onValueChange={trocarEvento}
              events={activeEvents}
              detalhe={detalheDoEvento}
            />
          </>
        ) : undefined}
    />
  );

  // Empresa pagadora, no painel do resumo (ou o aviso de que falta).
  const pagadora = temPagadora ? (
    <div className="h-full flex flex-col justify-center px-4 pt-3 pb-3.5 min-w-0" data-testid="nf-pagadora">
      <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Building2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> Empresa pagadora
      </p>
      <p className="m-0 mt-1 text-sm font-semibold leading-5 text-foreground truncate" title={selectedEvent?.paymentCompanyName || undefined}>
        {selectedEvent?.paymentCompanyName || "—"}
      </p>
      <p className="m-0 text-xs tabular-nums text-muted-foreground">CNPJ {selectedEvent?.paymentCompanyCnpj}</p>
    </div>
  ) : (
    // Empresa pagadora indefinida + papel sem RH: aviso somente-leitura,
    // sem bloquear a visualização das NFs
    <div className="h-full flex flex-col justify-center px-4 pt-3 pb-3.5 bg-warning-soft/60" role="note" data-testid="nf-pagadora-pendente">
      <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-warning">
        <Building2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> Empresa pagadora não definida
      </p>
      <p className="m-0 mt-1 text-xs leading-relaxed text-warning">
        A empresa pagadora deste evento ainda não foi definida pelo RH. As notas fiscais continuam disponíveis para consulta.
      </p>
    </div>
  );

  // ── Conteúdo por estado ──
  let conteudo: ReactNode;
  // Erro/carregando dos eventos (23/09): antes, enquanto a lista vinha — ou
  // quando falhava — a tela dizia "Nenhum evento ativo encontrado".
  if (qEvents.isError) {
    conteudo = <QueryError error={qEvents.error} onRetry={() => qEvents.refetch()} title="Não foi possível carregar os eventos" />;
  } else if (qEvents.isLoading) {
    conteudo = <InvoicesSkeleton />;
  } else if (activeEvents.length === 0) {
    conteudo = (
      <EstadoDaLista
        icone={CalendarX2}
        titulo="Nenhum evento ativo encontrado"
        texto="Crie ou reative um evento para gerenciar as notas fiscais."
        acao={<Link href="/events" className={BOTAO_SAIDA}>Ir para Eventos</Link>}
        testid="nf-sem-eventos"
      />
    );
  } else if (!selectedEventId) {
    conteudo = (
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-16" data-testid="nf-sem-evento">
        <span aria-hidden="true" className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-primary mb-3.5">
          <FileText className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">Selecione um evento</h2>
        <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
          Selecione um evento para gerenciar as notas fiscais: o envio de cada colaborador, a análise do RH e o check-in financeiro.
        </p>
        <div className="mt-5 w-full max-w-sm text-left">
          <EventSearchSelect value={selectedEventId} onValueChange={trocarEvento} events={activeEvents} className="sm:w-full" />
        </div>
      </div>
    );
  } else if (!temPagadora && canRH) {
    // Definir a empresa pagadora é ação do RH/admin — só eles veem o formulário
    conteudo = <PaymentCompanyGate paymentCompanies={paymentCompanies} form={companyForm} mutation={setEventCompanyMutation} />;
  } else if (estado.isError) {
    conteudo = <QueryError error={estado.error} onRetry={estado.retry} title="Não foi possível carregar as notas fiscais deste evento" />;
  } else if (dataLoading) {
    conteudo = <InvoicesSkeleton />;
  } else {
    conteudo = (
      <>
        {/* Resumo — estágio real dos itens (não a aba ativa) + empresa pagadora */}
        <InvoiceStepper
          counts={{ lancamento: pendingCount, aprovacao: rhPendingCount, checkin: checkinPendingCount }}
          valores={{ lancamento: pendingValue, aprovacao: rhPendingValue, checkin: checkinPendingValue }}
          pagadora={pagadora}
        />

        <AbasDasNotas
          abas={tabs}
          ativa={activeTab === "aprovacao" && canRH ? "aprovacao" : "lancamento"}
          onTrocar={setActiveTab}
          // Sem nada no evento, não há o que buscar.
          aDireita={(approvedActuals.length > 0 || invoices.length > 0) && (
            <BuscaDaLista
              valor={busca}
              onChange={setBusca}
              placeholder="Colaborador, função ou OC"
              rotulo="Buscar por colaborador, função ou OC"
              testid="nf-busca"
            />
          )}
        />

        {activeTab === "lancamento" && (
          <div id="nf-painel-lancamento" role="tabpanel" aria-labelledby="nf-tab-lancamento" className="pas-entra">
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
              busca={busca}
              onBusca={setBusca}
            />
          </div>
        )}

        {activeTab === "aprovacao" && canRH && (
          <div id="nf-painel-aprovacao" role="tabpanel" aria-labelledby="nf-tab-aprovacao" className="pas-entra">
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
              busca={busca}
              onBusca={setBusca}
              onIrParaLancamento={() => setActiveTab("lancamento")}
            />
          </div>
        )}
      </>
    );
  }

  return (
    // Margens pela variável do layout: a barra sangra até as bordas da
    // página e o conteúdo fica em até 1560px — a casca das telas irmãs.
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      {barra}
      <div className="px-[var(--page-gutter)] pt-5 pb-6">
        <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">{conteudo}</div>
      </div>
    </div>
  );
}
