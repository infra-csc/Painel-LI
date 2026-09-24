import { Fragment, useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { isRhOrAdmin } from "@/lib/role-utils";
import { EventSearchSelect } from "@/components/event-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { LoadingState } from "@/components/common/loading-state";
import { QueryError, useQueriesState } from "@/components/common/query-state";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FileText, Upload, CheckCircle2, RotateCcw, Clock,
  ChevronDown, ChevronUp, Paperclip, Building2,
  FileCheck, AlertCircle, AlertTriangle, Send, Eye, ExternalLink, Info, X, CircleDot, Ban
} from "lucide-react";
import { Link, useSearch } from "wouter";
import { useEventoEmFoco } from "@/lib/use-evento-em-foco";
import { campo, useUrlState } from "@/lib/use-url-state";
import type { BudgetActual, Collaborator, Event, Function as FunctionRow, Invoice, PaymentCompany, TeamInclusion } from "@shared/schema";
import type { QueryClient } from "@tanstack/react-query";
import { isNfEligible, nfIsentaPorEscalacao } from "@shared/prestacao-rules";

import { formatarMoeda, toTitleCase } from "@/lib/format";
import { RequiredMark } from "@/components/forms/required-mark";
import { MensagemDeErro } from "@/components/forms/mensagem-de-erro";
import { campoComErro } from "@/lib/campo-com-erro";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
const formatCurrency = formatarMoeda;
/** Timestamps do schema são `Date` no tipo, mas chegam como ISO pelo JSON — aceita os dois. */
function iso(v: string | Date | null | undefined): string | null {
  if (v == null || v === "") return null;
  return v instanceof Date ? v.toISOString() : v;
}
function fmtDate(raw?: string | Date | null) {
  const d = iso(raw);
  if (!d) return "—";
  // Aceita "YYYY-MM-DD" e timestamps ISO ("YYYY-MM-DDTHH:mm:ss…")
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}

// Effective status for display (aprovada splits into checkin-pendente / checkin-realizado)
type EffStatus = "pendente" | "enviada" | "devolvida" | "recusada" | "aprovada" | "checkin-pendente" | "checkin-realizado";

function getEffectiveStatus(inv: Invoice | null | undefined): EffStatus {
  if (!inv) return "pendente";
  if (inv.status === "aprovada") {
    // "Concluído" = checkin realizado (checkinAt set); otherwise waiting for physical check-in
    return inv.checkinAt ? "checkin-realizado" : "checkin-pendente";
  }
  return inv.status as EffStatus;
}

type StatusCfg = { label: string; pill: string; border: string; avatarCls: string };

const STATUS_CFG: Record<EffStatus, StatusCfg> = {
  pendente:          { label: "Pendente",            pill: "bg-muted text-muted-foreground",                              border: "var(--border)", avatarCls: "bg-muted text-muted-foreground" },
  enviada:           { label: "Aguardando RH",        pill: "bg-warning-soft text-warning ring-1 ring-warning/25",       border: "var(--warning-strong)", avatarCls: "bg-warning-soft text-warning" },
  devolvida:         { label: "Devolvida",            pill: "bg-warning-soft text-warning ring-1 ring-warning/25",    border: "var(--warning-strong)", avatarCls: "bg-warning-soft text-warning" },
  recusada:          { label: "NF recusada",          pill: "bg-danger-soft text-danger ring-1 ring-danger/25",            border: "var(--danger)", avatarCls: "bg-danger-soft text-danger" },
  aprovada:          { label: "Aprovada",             pill: "bg-success-soft text-success ring-1 ring-success/25", border: "var(--success-strong)", avatarCls: "bg-success-soft text-success" },
  "checkin-pendente":{ label: "Aguard. Check-in",    pill: "bg-brand-soft text-primary ring-1 ring-primary/25",         border: "var(--primary)", avatarCls: "bg-brand-soft text-primary" },
  "checkin-realizado":{ label: "Check-in Realizado", pill: "bg-success-soft text-success ring-1 ring-success/25", border: "var(--success)", avatarCls: "bg-success-soft text-success" },
};

// Fallback defensivo: um status desconhecido vindo do servidor não pode
// derrubar a tela inteira (foi o que aconteceu quando "recusada" surgiu).
const STATUS_CFG_FALLBACK: StatusCfg = {
  label: "Status desconhecido",
  pill: "bg-muted text-slate-600 ring-1 ring-border",
  border: "var(--neutral)",
  avatarCls: "bg-muted text-muted-foreground",
};

function getStatusCfg(st: string): StatusCfg {
  return (STATUS_CFG as Record<string, StatusCfg>)[st] ?? STATUS_CFG_FALLBACK;
}

// ── Stepper compacto ─────────────────────────────────────────────────────────
// Reflete o ESTÁGIO real dos itens do evento (quantos aguardam em cada etapa),
// não a aba ativa. Etapa sem pendências aparece concluída.
type StepperCounts = { lancamento: number; aprovacao: number; checkin: number };

function InvoiceStepper({ counts }: { counts: StepperCounts }) {
  const steps = [
    { id: "lancamento", label: "Lançamento",   count: counts.lancamento },
    { id: "aprovacao",  label: "Aprovação RH", count: counts.aprovacao },
    { id: "checkin",    label: "Check-in",     count: counts.checkin },
  ];
  return (
    <div className="flex items-center gap-0 h-9 flex-wrap">
      {steps.map((step, i) => {
        const done  = step.count === 0;
        const color = done ? "var(--success)" : "var(--primary)";
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 shrink-0`}
                style={{ borderColor: color, background: color }}>
                {done
                  ? <CheckCircle2 className="w-2 h-2 text-white" strokeWidth={3} aria-hidden="true" />
                  : <div className="w-1.5 h-1.5 rounded-full bg-card" />}
              </div>
              <span className="text-2xs font-semibold whitespace-nowrap" style={{ color }}>
                {step.label}
              </span>
              {step.count > 0 && (
                <span
                  className="text-2xs font-bold leading-none px-1.5 py-0.5 rounded-full bg-brand-soft text-primary ring-1 ring-primary/25 whitespace-nowrap"
                  title={`${step.count} ite${step.count === 1 ? "m aguardando" : "ns aguardando"} nesta etapa`}
                >
                  {step.count} aguardando
                </span>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className="w-10 mx-2 border-t border-slate-300" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Filter Pills ─────────────────────────────────────────────────────────────
function FilterPills({ filters, active, countFor, onChange, alertFor }: {
  filters: { id: string; label: string; activeBg: string }[];
  active: string;
  countFor: (id: string) => number;
  onChange: (id: string) => void;
  alertFor?: (id: string) => number;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {filters.map(({ id, label, activeBg }) => {
        const cnt = countFor(id);
        const alertCnt = alertFor ? alertFor(id) : 0;
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`inline-flex items-center gap-1.5 text-2xs font-semibold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
              isActive
                ? `${activeBg} border-transparent shadow-1`
                : "bg-card border-border text-muted-foreground hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            {label}
            {cnt > 0 && (
              <span className={`text-2xs font-bold leading-none px-1.5 py-0.5 rounded-full ${isActive ? "bg-card/20 text-white" : "bg-muted text-muted-foreground"}`}>
                {cnt}
              </span>
            )}
            {alertCnt > 0 && (
              <span className="text-2xs font-bold leading-none px-1.5 py-0.5 rounded-full bg-warning-strong text-white"
                title={`${alertCnt} aguardando há mais de 3 dias`}>
                {alertCnt}⚠
              </span>
            )}
          </button>
        );
      })}
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

  // Company confirmation state (for the CNPJ blocking screen)
  // Vazio de propósito: o usuário deve escolher ativamente a empresa pagadora.
  const [confirmCompanyId, setConfirmCompanyId] = useState<string>("");
  const [confirmCustomName, setConfirmCustomName] = useState("");
  const [confirmCustomCnpj, setConfirmCustomCnpj] = useState("");
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);

  const canRH = isRhOrAdmin(user);

  const qEvents = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const activeEvents = useMemo(() => (qEvents.data ?? []).filter(e => e.status !== "excluído"), [qEvents.data]);
  // Evento em foco excluído é descartado assim que a lista chega (23/09).
  useEffect(() => {
    if (qEvents.data?.length) sanearEventoEmFoco(qEvents.data.filter(e => e.status !== "excluído").map(e => e.id));
  }, [qEvents.data, sanearEventoEmFoco]);

  const { data: paymentCompanies = [] } = useQuery<PaymentCompany[]>({ queryKey: ["/api/payment-companies"] });

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

  const setEventCompanyMutation = useMutation({
    mutationFn: async ({ name, cnpj }: { name: string; cnpj: string }) => {
      const res = await apiRequest("PATCH", `/api/events/${selectedEventId}/payment-company`, {
        paymentCompanyName: name,
        paymentCompanyCnpj: cnpj,
      });
      if (!res.ok) throw new Error("Erro ao salvar empresa pagadora");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Empresa pagadora configurada com sucesso" });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível salvar a empresa pagadora", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const qInvoices = useQuery<Invoice[]>({
    queryKey: ["/api/invoices", selectedEventId],
    queryFn: () => apiRequest("GET", `/api/invoices?eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });
  const invoices = qInvoices.data ?? [];

  const qActuals = useQuery<BudgetActual[]>({
    queryKey: ["/api/budget-actual", selectedEventId],
    queryFn: () => apiRequest("GET", `/api/budget-actual?eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });
  const budgetActuals = qActuals.data ?? [];

  const qCollaborators = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const qFunctions = useQuery<FunctionRow[]>({ queryKey: ["/api/functions"] });
  const collaborators = qCollaborators.data ?? [];
  const functions = qFunctions.data ?? [];

  // Escalação do evento — fonte da flag "emite NF" de cada escalado
  const qInclusions = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions", selectedEventId, "invoices"],
    queryFn: () => apiRequest("GET", `/api/team-inclusions?eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });
  const teamInclusions = qInclusions.data ?? [];

  // Erro/carregando (23/09): eram 9 consultas sem tratamento — a falha virava
  // "Nenhum colaborador com Realizado enviado". Um só aviso; "Tentar de novo"
  // refaz apenas o que falhou. Enquanto carrega, skeleton em vez do vazio falso.
  const estado = useQueriesState([qEvents, qCollaborators, qFunctions, qInvoices, qActuals, qInclusions]);
  const dataLoading = !!selectedEventId && estado.isLoading;

  const getName     = (id?: string | null) => collaborators.find(c => c.id === id)?.fullName || "—";
  const getFuncName = (id?: string | null) => functions.find(f => f.id === id)?.name     || "—";

  // Definido na escalação: se false, a tela não cobra NF deste colaborador.
  // Regra única em @shared/prestacao-rules — mesma da tela Controle de
  // Prestações (as cópias locais tinham divergido).
  const emitsNfFor = (actual: BudgetActual): boolean =>
    !nfIsentaPorEscalacao(
      teamInclusions,
      actual.collaboratorId,
      actual.functionId,
      actual.eventId ?? selectedEventId,
    );

  // Elegibilidade da NF vem de @shared/prestacao-rules — a mesma regra que o
  // servidor aplica. Antes cada tela tinha sua cópia e elas divergiram.
  const approvedActuals = budgetActuals.filter(
    a => isNfEligible(a) && !a.splitParentId
  );

  const getInvoice = (actualId: string) =>
    invoices.find(inv => inv.budgetActualId === actualId);

  // Ids dos itens NF-elegíveis do Realizado — mesmo recorte do Controle RH (rh-control).
  const eligibleActualIds = new Set(approvedActuals.map(a => a.id));

  // "Lançamento": itens NF-elegíveis que ainda dependem do colaborador — sem NF enviada
  // ("Aguardando lançamento") ou com NF devolvida. Equivale a "Aguardando lançamento"
  // + "NF devolvida" do card "Aguardando Colaborador" do Controle RH.
  const pendingCount  = approvedActuals.filter(a => {
    if (!emitsNfFor(a)) return false; // não emite NF — nada a cobrar
    const inv = getInvoice(a.id);
    return !inv || inv.status === "pendente" || inv.status === "devolvida";
  }).length;
  // "Aprovação RH" (em análise): NFs enviadas de itens NF-elegíveis — mesmo critério do Controle RH.
  const rhPendingCount = invoices.filter(i => i.status === "enviada" && eligibleActualIds.has(i.budgetActualId ?? "")).length;
  // "Check-in": NFs aprovadas de itens NF-elegíveis ainda sem check-in financeiro.
  const checkinPendingCount = invoices.filter(i => i.status === "aprovada" && !i.checkinAt && eligibleActualIds.has(i.budgetActualId ?? "")).length;

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
          (() => {
            const pcs = paymentCompanies;
            const selectedPc = pcs.find(c => String(c.id) === confirmCompanyId);
            const isManual = confirmCompanyId === "__manual__" || pcs.length === 0;
            const canConfirm = isManual
              ? confirmCustomName.trim() && confirmCustomCnpj.trim()
              : !!selectedPc;
            const chosenName = isManual ? confirmCustomName.trim() : (selectedPc?.name || "");
            const chosenCnpj = isManual ? confirmCustomCnpj.trim() : (selectedPc?.cnpj || "");
            const handleConfirm = () => {
              if (!chosenName || !chosenCnpj) return;
              setCompanyDialogOpen(false);
              setEventCompanyMutation.mutate({ name: chosenName, cnpj: chosenCnpj });
            };
            return (
              <div className="bg-card rounded-xl border border-warning/25 p-8 max-w-md mx-auto">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-warning-soft flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-warning-strong" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Confirme a empresa pagadora</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Necessária para emissão das notas fiscais</p>
                  </div>
                </div>

                {/* Company selector */}
                <div className="space-y-3">
                  {pcs.length > 0 && (
                    <div>
                      <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                        Empresa cadastrada
                      </label>
                      <select
                        value={confirmCompanyId}
                        onChange={e => setConfirmCompanyId(e.target.value)}
                        className="w-full h-9 rounded-lg border border-border px-3 text-sm text-slate-700 bg-card focus:outline-none focus:ring-2 focus:ring-warning/50 focus:border-warning-strong"
                      >
                        <option value="" disabled>Selecione a empresa pagadora…</option>
                        {pcs.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} — {c.cnpj}
                          </option>
                        ))}
                        <option value="__manual__">Inserir manualmente…</option>
                      </select>
                    </div>
                  )}

                  {/* Manual entry (when no companies registered or "manual" selected) */}
                  {(isManual || pcs.length === 0) && (
                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                          Nome da empresa
                        </label>
                        <input
                          type="text"
                          value={confirmCustomName}
                          onChange={e => setConfirmCustomName(e.target.value)}
                          placeholder="Ex.: Produtora XYZ Ltda"
                          className="w-full h-9 rounded-lg border border-border px-3 text-sm text-slate-700 bg-card focus:outline-none focus:ring-2 focus:ring-warning/50 focus:border-warning-strong"
                        />
                      </div>
                      <div>
                        <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                          CNPJ
                        </label>
                        <input
                          type="text"
                          value={confirmCustomCnpj}
                          onChange={e => setConfirmCustomCnpj(e.target.value)}
                          placeholder="00.000.000/0000-00"
                          className="w-full h-9 rounded-lg border border-border px-3 text-sm text-slate-700 bg-card focus:outline-none focus:ring-2 focus:ring-warning/50 focus:border-warning-strong"
                        />
                      </div>
                    </div>
                  )}

                  {/* Preview when company selected from list */}
                  {!isManual && selectedPc && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning-soft border border-warning/25">
                      <Building2 className="w-3.5 h-3.5 text-warning-strong shrink-0" aria-hidden="true" />
                      <span className="text-xs text-warning font-medium">{selectedPc.name}</span>
                      <span className="text-xs text-warning-strong ml-auto">{selectedPc.cnpj}</span>
                    </div>
                  )}

                  <button
                    disabled={!canConfirm || setEventCompanyMutation.isPending}
                    onClick={() => setCompanyDialogOpen(true)}
                    className="w-full h-10 rounded-xl bg-warning-strong hover:bg-warning/90 disabled:opacity-40 text-white text-sm font-semibold transition-colors mt-1"
                  >
                    {setEventCompanyMutation.isPending ? 'Salvando…' : 'Confirmar e Continuar'}
                  </button>

                  <AlertDialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar empresa pagadora</AlertDialogTitle>
                        <AlertDialogDescription>
                          Definir {chosenName || "esta empresa"}{chosenCnpj ? ` (CNPJ ${chosenCnpj})` : ""} como
                          pagadora deste evento? Essa escolha vale para todas as NFs.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirm}>Definir empresa</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })()
        ) : estado.isError ? (
          <QueryError error={estado.error} onRetry={estado.retry} title="Não foi possível carregar as notas fiscais deste evento" />
        ) : dataLoading ? (
          <div className="space-y-3" role="status" aria-busy="true" aria-label="Carregando notas fiscais">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card rounded-xl border border-border px-5 py-4 animate-pulse motion-reduce:animate-none flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-border shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="h-3 bg-border rounded w-40 max-w-full" />
                  <div className="h-2.5 bg-muted rounded w-24" />
                </div>
                <div className="h-6 w-24 bg-muted rounded-full shrink-0" />
              </div>
            ))}
          </div>
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

// ── Lançamento Tab ────────────────────────────────────────────────────────────
const LANC_FILTERS = [
  { id: "all",               label: "Todos",              activeBg: "bg-slate-700 text-white" },
  { id: "pendente",          label: "Pendente",           activeBg: "bg-slate-500 text-white" },
  { id: "enviada",           label: "Aguardando RH",      activeBg: "bg-warning-strong text-white" },
  { id: "devolvida",         label: "Devolvida",          activeBg: "bg-warning-strong text-white" },
  { id: "recusada",          label: "NF recusada",        activeBg: "bg-danger text-white" },
  { id: "checkin-pendente",  label: "Aguard. Check-in",   activeBg: "bg-primary text-primary-foreground" },
  { id: "checkin-realizado", label: "Check-in Realizado", activeBg: "bg-success text-white" },
  { id: "sem-nf",            label: "Não emite NF",       activeBg: "bg-slate-500 text-white" },
];

type ToastFn = ReturnType<typeof useToast>["toast"];

/** Props comuns das abas e do card: resolvedores de nome e infra da página. */
interface AbaBaseProps {
  getName: (id?: string | null) => string;
  getFuncName: (id?: string | null) => string;
  selectedEventId: string;
  qc: QueryClient;
  toast: ToastFn;
  filterStatus: string;
  onFilterStatus: (v: string) => void;
  highlightActualId: string;
}

interface LancamentoTabProps extends AbaBaseProps {
  approvedActuals: BudgetActual[];
  emitsNfFor: (actual: BudgetActual) => boolean;
  getInvoice: (actualId: string) => Invoice | undefined;
  selectedEvent: Event | undefined;
}

// Filtro de status controlado pela página (vive na URL desde 23/09).
function LancamentoTab({ approvedActuals, emitsNfFor, getInvoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast, filterStatus, onFilterStatus, highlightActualId }: LancamentoTabProps) {
  const setFilterStatus = onFilterStatus;
  const [highlightedId, setHighlightedId] = useState<string>(highlightActualId || "");

  // When highlightActualId arrives, update and clear after animation
  useEffect(() => {
    if (highlightActualId) {
      setHighlightedId(highlightActualId);
      const timer = setTimeout(() => setHighlightedId(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightActualId]);

  // Scroll to the highlighted card — retries until element appears in DOM (data may load async)
  useEffect(() => {
    if (!highlightedId) return;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.querySelector(`[data-actual-id="${highlightedId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (attempts < 10) {
        attempts++;
        setTimeout(tryScroll, 200);
      }
    };
    const t = setTimeout(tryScroll, 150);
    return () => clearTimeout(t);
  }, [highlightedId, filterStatus, approvedActuals?.length]);

  function getEffStatus(actual: BudgetActual) {
    if (!emitsNfFor(actual)) return "sem-nf"; // definido na escalação
    return getEffectiveStatus(getInvoice(actual.id));
  }

  const countFor = (id: string) =>
    id === "all"
      ? approvedActuals.length
      : approvedActuals.filter(a => getEffStatus(a) === id).length;

  const filtered = filterStatus === "all"
    ? approvedActuals
    : approvedActuals.filter(a => getEffStatus(a) === filterStatus);

  if (approvedActuals.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-16 text-center">
        <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Nenhum colaborador com Realizado enviado para este evento.</p>
        <p className="text-xs text-muted-foreground mt-1">O lançamento de notas é liberado assim que o Realizado é enviado. Itens devolvidos ou rejeitados ficam pausados até a regularização.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FilterPills filters={LANC_FILTERS} active={filterStatus} countFor={countFor} onChange={setFilterStatus} />

      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">Nenhum item com este status.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map(actual => {
            const isTarget = actual.id === highlightedId;
            if (!emitsNfFor(actual)) {
              // Definido na escalação: não emite NF — mostra o item sem cobrar nota
              return (
                <div key={actual.id} data-actual-id={actual.id} className="rounded-xl bg-surface-muted border border-border px-5 py-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-border flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                    {(getName(actual.collaboratorId) || "?").charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-600 truncate">{getName(actual.collaboratorId)}</p>
                    <p className="text-2xs text-muted-foreground">{getFuncName(actual.functionId)}</p>
                  </div>
                  <span className="text-sm font-mono font-semibold text-muted-foreground">
                    {formatarMoeda(actual.totalValue || 0)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-border text-slate-600 text-2xs font-bold whitespace-nowrap" title="Definido na escalação — nenhuma nota fiscal será cobrada deste colaborador">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    Não emite NF
                  </span>
                </div>
              );
            }
            return (
              <div
                key={actual.id}
                data-actual-id={actual.id}
                className={`rounded-xl transition-all duration-700 ${isTarget ? "ring-2 ring-ring ring-offset-2 shadow-2 " : ""}`}
              >
                <InvoiceCard
                  actual={actual}
                  invoice={getInvoice(actual.id)}
                  getName={getName}
                  getFuncName={getFuncName}
                  selectedEvent={selectedEvent}
                  selectedEventId={selectedEventId}
                  qc={qc}
                  toast={toast}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Invoice Card (collaborator view) ─────────────────────────────────────────
interface InvoiceCardProps extends Pick<AbaBaseProps, "getName" | "getFuncName" | "selectedEventId" | "qc" | "toast"> {
  actual: BudgetActual;
  invoice: Invoice | undefined;
  selectedEvent: Event | undefined;
}

function InvoiceCard({ actual, invoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast }: InvoiceCardProps) {
  const effStatus = getEffectiveStatus(invoice);
  const cfg = getStatusCfg(effStatus);

  const [oc, setOc] = useState(invoice?.oc || "");
  const [erros, setErros] = useState<{ oc?: string; anexo?: string }>({});
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [clearedAttachment, setClearedAttachment] = useState(false);
  const [expanded, setExpanded] = useState(effStatus === "devolvida");
  const [historyOpen, setHistoryOpen] = useState(false);

  const canEdit = !invoice || invoice.status === "devolvida" || invoice.status === "pendente";
  const name = getName(actual.collaboratorId);
  const funcName = getFuncName(actual.functionId);
  const displayName = toTitleCase(name);
  const initial = displayName && displayName !== "—" ? displayName.charAt(0) : "?";
  const history = invoice ? buildHistory(invoice, name) : [];
  const hasReturn = !!invoice?.returnComment;

  const paymentText = (selectedEvent?.paymentCompanyName && actual.collaboratorId)
    ? `Este pagamento deve ser realizado de ${name} para ${selectedEvent.paymentCompanyName}${selectedEvent.paymentCompanyCnpj ? ` / CNPJ: ${selectedEvent.paymentCompanyCnpj}` : ""}.`
    : "";

  function removeAttachment() {
    setFile(null);
    setClearedAttachment(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const forceClear = clearedAttachment;
      let attachmentUrl = forceClear ? "" : (invoice?.attachmentUrl || "");
      let attachmentName = forceClear ? "" : (invoice?.attachmentName || "");

      if (file) {
        setUploading(true);
        const fd = new FormData();
        fd.append("files", file);
        const resp = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
        if (!resp.ok) {
          setUploading(false);
          throw new Error("Falha ao enviar o arquivo da nota. Verifique sua conexão e tente novamente.");
        }
        const uploaded = await resp.json();
        if (uploaded?.[0]?.url) {
          attachmentUrl = uploaded[0].url;
          attachmentName = file.name;
        } else {
          setUploading(false);
          throw new Error("Falha ao enviar o arquivo da nota. Tente novamente.");
        }
        setUploading(false);
      }

      if (!oc.trim()) { setErros({ oc: "Informe o número da OC." }); document.getElementById(`nf-oc-${actual.id}`)?.focus(); throw new Error("Informe o número da OC."); }
      if (!attachmentUrl) { setErros({ anexo: "Anexe o arquivo da nota fiscal." }); document.getElementById(`nf-file-btn-${actual.id}`)?.focus(); throw new Error("Anexe o arquivo da nota fiscal."); }
      setErros({});

      if (invoice) {
        return apiRequest("PATCH", `/api/invoices/${invoice.id}`, { oc, attachmentUrl, attachmentName, paymentText, status: "enviada" }).then(r => r.json());
      }
      return apiRequest("POST", "/api/invoices", {
        eventId: selectedEventId, collaboratorId: actual.collaboratorId,
        functionId: actual.functionId, budgetActualId: actual.id,
        oc, attachmentUrl, attachmentName, paymentText, status: "enviada",
      }).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      setFile(null);
      // Decisão 19/08 (substitui a regra de 17/08): a NF não credita mais o
      // Flash — alimentação e mobilidade entram na aprovação do comparativo.
      // A nota só documenta o pagamento, então nada de aviso de Flash aqui.
      toast({ title: "Nota enviada!", description: "Aguardando análise do RH." });
    },
    onError: (e: unknown) => {
      setUploading(false);
      // e.body vem do apiRequest enriquecido — mostra a mensagem real do
      // servidor (ex.: validação de OC repetida) em vez do texto genérico
      toast({ title: "Não foi possível enviar a nota", description: apiErrorMessage(e, "Tente novamente."), variant: "destructive" });
    },
  });

  return (
    <div
      className="bg-card rounded-xl border border-border overflow-hidden shadow-1 transition-shadow hover:shadow-2"
      style={{ borderLeft: `3px solid ${historyOpen ? "var(--primary)" : cfg.border}` }}
    >
      {/* Header row */}
      <div className={`flex items-center justify-between px-5 py-4 transition-colors ${historyOpen ? "bg-brand-soft/30" : ""}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${cfg.avatarCls}`}>
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{displayName}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="text-2xs text-muted-foreground truncate">{funcName}</div>
              {hasReturn && <span title="Houve devolução" className="text-2xs text-warning-strong font-bold leading-none">↩</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-lg font-bold text-primary tabular-nums font-mono">
            {formatCurrency(actual.totalValue)}
          </span>
          <span className={`text-2xs font-semibold px-2.5 py-1 rounded-full ${cfg.pill}`}>
            {cfg.label}
          </span>
          {invoice && history.length > 0 && (
            <button
              onClick={() => setHistoryOpen(o => !o)}
              title={historyOpen ? "Fechar histórico" : `${history.length} evento(s)`}
              aria-expanded={historyOpen}
              aria-label={historyOpen ? "Fechar histórico" : `Abrir histórico (${history.length} eventos)`}
              className={`inline-flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 transition-colors ${
                historyOpen ? "text-primary bg-brand-soft" : "text-muted-foreground hover:text-primary hover:bg-brand-soft"
              }`}
            >
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              {!historyOpen && <span className="text-2xs font-semibold leading-none tabular-nums">{history.length}</span>}
            </button>
          )}
          {effStatus === "devolvida" && (
            <button
              onClick={() => setExpanded(e => !e)}
              aria-expanded={expanded}
              aria-label={expanded ? "Recolher motivo da devolução" : "Ver motivo da devolução"}
              className="text-muted-foreground hover:text-slate-600 transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-4">
        {/* Editable (pendente / devolvida) */}
        {canEdit && (
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div className="flex-1 min-w-[180px]">
              <label htmlFor={`nf-oc-${actual.id}`} className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Número OC<RequiredMark />
              </label>
              <Input
                id={`nf-oc-${actual.id}`}
                value={oc}
                aria-required="true"
                {...campoComErro(`nf-oc-${actual.id}`, erros.oc)}
                onChange={e => { setOc(e.target.value); if (erros.oc) setErros(p => ({ ...p, oc: undefined })); }}
                placeholder="OC-0000"
                className="h-9 text-sm rounded-xl border-border focus:border-primary"
              />
              <MensagemDeErro id={`nf-oc-${actual.id}`} erro={erros.oc} />
              <p className="text-2xs text-muted-foreground mt-0.5">OCs repetidas no evento devem usar o mesmo anexo.</p>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label htmlFor={`nf-file-${actual.id}`} className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Nota fiscal<RequiredMark />
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id={`nf-file-btn-${actual.id}`}
                  {...campoComErro(`nf-file-btn-${actual.id}`, erros.anexo)}
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 h-9 flex items-center gap-1.5 px-3 border border-dashed border-slate-300 rounded-xl text-xs text-muted-foreground hover:border-success-strong hover:bg-success-soft/40 transition-all min-w-0"
                >
                  {file ? (
                    <><FileCheck className="w-3.5 h-3.5 text-success shrink-0" aria-hidden="true" /><span className="truncate text-success font-medium">{file.name}</span></>
                  ) : invoice?.attachmentUrl && !clearedAttachment ? (
                    <><Paperclip className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span className="truncate">Substituir nota</span></>
                  ) : (
                    <><Upload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span>Anexar nota</span></>
                  )}
                </button>
                {(file || (invoice?.attachmentUrl && !clearedAttachment)) && (
                  <button type="button" onClick={removeAttachment} aria-label="Remover anexo"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-danger-strong hover:bg-danger-soft transition-colors shrink-0">
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
              </div>
              <input ref={fileRef} id={`nf-file-${actual.id}`} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              {invoice?.attachmentUrl && !file && !clearedAttachment && (
                <a href={invoice.attachmentUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-0.5 text-2xs text-primary hover:underline">
                  <Eye className="w-2.5 h-2.5" aria-hidden="true" /> Ver atual
                </a>
              )}
            </div>
            <Button
              size="sm"
              className="rounded-xl text-white px-5 h-9 text-sm shadow-1 shrink-0 bg-success"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || uploading}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              {submitMutation.isPending || uploading ? "Enviando…" : effStatus === "devolvida" ? "Reenviar" : "Enviar nota"}
            </Button>
          </div>
        )}

        {/* Read-only (enviada) */}
        {!canEdit && effStatus === "enviada" && invoice?.oc && (
          <div className="flex items-center gap-4 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">OC</span>
              <span className="text-sm font-mono font-semibold text-slate-700">{invoice.oc}</span>
            </div>
            {invoice?.attachmentUrl && (
              <a href={invoice.attachmentUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-brand-soft hover:bg-brand-soft px-2.5 py-1.5 rounded-xl transition-colors">
                <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Ver nota
              </a>
            )}
          </div>
        )}

        {/* Check-in pendente — aguardando RH fazer o check-in */}
        {(effStatus === "checkin-pendente" || effStatus === "checkin-realizado") && (
          <div className="flex items-center gap-4 mb-2">
            {invoice?.oc && (
              <div className="flex items-center gap-1.5">
                <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">OC</span>
                <span className="text-sm font-mono font-semibold text-slate-700">{invoice.oc}</span>
              </div>
            )}
            {invoice?.attachmentUrl && (
              <a href={invoice.attachmentUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-brand-soft hover:bg-brand-soft px-2.5 py-1.5 rounded-xl transition-colors">
                <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Ver nota
              </a>
            )}
          </div>
        )}

        {/* Check-in realizado */}
        {effStatus === "checkin-realizado" && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-success-soft text-success border border-success/25">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            Check-in Realizado
            {invoice?.checkinAt && <span className="font-normal opacity-75">· {fmtDate(invoice.checkinAt)}</span>}
            {invoice?.paymentDate && (
              <span className="font-normal opacity-75 ml-1">
                · Pgto: {fmtDate(invoice.paymentDate)}
              </span>
            )}
          </div>
        )}

        {/* Aguardando Check-in — apenas badge estático no Lançamento */}
        {effStatus === "checkin-pendente" && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-brand-soft text-primary border border-primary/25">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            Aprovada · Aguardando Check-in Financeiro
          </div>
        )}

        {/* Devolvida — motivo */}
        {expanded && effStatus === "devolvida" && (
          <div className="mt-3 bg-warning-soft border border-warning/25 rounded-xl px-4 py-3 flex items-start gap-2">
            <RotateCcw className="w-3.5 h-3.5 text-warning-strong mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-2xs font-semibold text-warning mb-0.5 uppercase tracking-wide">Devolvida para ajuste</p>
              <p className="text-xs text-warning">{invoice?.returnComment || "Sem comentário."}</p>
            </div>
          </div>
        )}

        {/* Recusada — estado terminal, sem reenvio */}
        {effStatus === "recusada" && (
          <>
            {(invoice?.oc || invoice?.attachmentUrl) && (
              <div className="flex items-center gap-4 mb-2">
                {invoice?.oc && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">OC</span>
                    <span className="text-sm font-mono font-semibold text-slate-700">{invoice.oc}</span>
                  </div>
                )}
                {invoice?.attachmentUrl && (
                  <a href={invoice.attachmentUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-brand-soft hover:bg-brand-soft px-2.5 py-1.5 rounded-xl transition-colors">
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Ver nota
                  </a>
                )}
              </div>
            )}
            <div className="bg-danger-soft border border-danger/25 rounded-xl px-4 py-3 flex items-start gap-2">
              <Ban className="w-3.5 h-3.5 text-danger mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-2xs font-semibold text-danger mb-0.5 uppercase tracking-wide">NF recusada — decisão definitiva, sem reenvio</p>
                <p className="text-xs text-danger">{invoice?.returnComment || "Sem motivo informado."}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* History panel */}
      {historyOpen && history.length > 0 && (
        <div className="bg-surface-muted border-t border-t-primary/25" style={{ padding: "12px 20px 14px 48px" }}>
          <HistoryPanel events={history} />
        </div>
      )}
    </div>
  );
}

// ── Aprovação Tab ─────────────────────────────────────────────────────────────
const APROV_FILTERS = [
  { id: "all",               label: "Todos",              activeBg: "bg-slate-700 text-white" },
  { id: "enviada",           label: "Aguardando",         activeBg: "bg-warning-strong text-white" },
  { id: "checkin-pendente",  label: "Aguard. Check-in",   activeBg: "bg-primary text-primary-foreground" },
  { id: "checkin-realizado", label: "Check-in Realizado", activeBg: "bg-success text-white" },
  { id: "devolvida",         label: "Devolvida",          activeBg: "bg-warning-strong text-white" },
  { id: "recusada",          label: "NF recusada",        activeBg: "bg-danger text-white" },
];

// ── History helpers ───────────────────────────────────────────────────────────
function fmtDateTime(raw?: string | Date | null) {
  const s = iso(raw);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

type HistEvent = {
  type: "enviado" | "reenviado" | "devolvido" | "recusado" | "aprovado" | "checkin";
  label: string;
  color: string;
  at: string | null;
  by: string;
  oc?: string | null;
  attachmentName?: string | null;
  comment?: string | null;
  paymentDate?: string;
};

const HIST_CFG: Record<HistEvent["type"], { label: string; color: string; by: "colaborador" | "rh" }> = {
  enviado:   { label: "Enviado",   color: "var(--primary)", by: "colaborador" },
  reenviado: { label: "Reenviado", color: "var(--primary)", by: "colaborador" },
  devolvido: { label: "Devolvido", color: "var(--warning)", by: "rh" },
  recusado:  { label: "Recusado",  color: "var(--danger)", by: "rh" },
  aprovado:  { label: "Aprovado",  color: "var(--success)", by: "rh" },
  checkin:   { label: "Check-in",  color: "var(--primary)", by: "rh" },
};

/** Entrada do JSON gravado em `invoices.history` (texto livre do servidor). */
interface StoredHistEntry {
  type?: string;
  at?: string | null;
  oc?: string | null;
  attachmentName?: string | null;
  comment?: string | null;
  paymentDate?: string | null;
}

function parseStoredHistory(raw: string | null | undefined): StoredHistEntry[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as StoredHistEntry[]) : [];
}

function buildHistory(inv: Invoice, collabName: string): HistEvent[] {
  // Use stored history if available
  if (inv.history) {
    try {
      const stored = parseStoredHistory(inv.history);
      if (stored.length > 0) {
        return stored.map(e => {
          const cfg = HIST_CFG[e.type as HistEvent["type"]] || HIST_CFG.enviado;
          return {
            type: e.type,
            label: cfg.label,
            color: cfg.color,
            at: e.at ? fmtDateTime(e.at) : null,
            by: cfg.by === "colaborador" ? toTitleCase(collabName) : "RH",
            oc: e.oc || null,
            attachmentName: e.attachmentName || null,
            comment: e.comment || null,
            paymentDate: e.paymentDate || undefined,
          } as HistEvent;
        });
      }
    } catch { /* fall through */ }
  }
  // Fallback reconstruction for old invoices without stored history
  const events: HistEvent[] = [];
  events.push({ type: "enviado", label: "Enviado", color: "var(--primary)", at: fmtDateTime(inv.createdAt), by: toTitleCase(collabName) });
  if (inv.returnComment) {
    events.push({ type: "devolvido", label: "Devolvido", color: "var(--warning)", at: null, by: "RH", comment: inv.returnComment });
  }
  if (inv.approvedAt) {
    events.push({ type: "aprovado", label: "Aprovado", color: "var(--success)", at: fmtDateTime(inv.approvedAt), by: "RH" });
  }
  if (inv.paymentDate) {
    events.push({ type: "checkin", label: "Check-in", color: "var(--primary)", at: null, by: "RH", paymentDate: inv.paymentDate });
  }
  return events;
}

function HistoryPanel({ events }: { events: HistEvent[] }) {
  if (events.length === 0) return null;
  if (events.length === 1) {
    const e = events[0];
    return (
      <div className="text-2xs text-muted-foreground italic">
        Enviado em {e.at || "—"} por {e.by}
        {e.oc && <span className="not-italic text-slate-600 ml-1">· OC: <span className="font-mono font-semibold">{e.oc}</span></span>}
        {e.attachmentName && <span className="not-italic text-muted-foreground ml-1">· Nota: {e.attachmentName}</span>}
      </div>
    );
  }
  return (
    <div className="relative pl-4">
      {/* vertical dotted line */}
      <div className="absolute left-[7px] top-3 bottom-3 w-px border-l-2 border-dotted border-border" />
      <div className="space-y-3">
        {events.map((ev, i) => (
          <div key={i} className="relative flex items-start gap-3">
            {/* dot */}
            <div className="absolute -left-4 top-[5px] w-2 h-2 rounded-full ring-2 ring-white shrink-0" style={{ background: ev.color }} />
            <div className="min-w-0 w-full">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold" style={{ color: ev.color }}>{ev.label}</span>
                {ev.at && <span className="text-2xs text-muted-foreground">{ev.at}</span>}
                <span className="text-2xs text-muted-foreground italic">por {ev.by}</span>
              </div>
              {/* OC and attachment for sent/resent */}
              {(ev.type === "enviado" || ev.type === "reenviado") && (ev.oc || ev.attachmentName) && (
                <div className="mt-1 ml-0 flex items-center gap-3 flex-wrap">
                  {ev.oc && (
                    <span className="text-2xs text-slate-600">
                      OC: <span className="font-mono font-semibold text-foreground">{ev.oc}</span>
                    </span>
                  )}
                  {ev.attachmentName && (
                    <span className="text-2xs text-muted-foreground flex items-center gap-1">
                      <Paperclip className="w-2.5 h-2.5" aria-hidden="true" /> {ev.attachmentName}
                    </span>
                  )}
                </div>
              )}
              {ev.comment && (
                <div className="mt-1 text-2xs text-warning bg-warning-soft border-l-2 border-l-warning py-1 px-2"
                  style={{ borderRadius: "0 4px 4px 0" }}>
                  {ev.comment}
                </div>
              )}
              {ev.paymentDate && (
                <div className="mt-1 text-2xs text-primary italic">
                  Pagamento previsto: {fmtDate(ev.paymentDate)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type AprovAction = "approve" | "return" | "reject" | "checkin";
type ActiveAprovAction = { invId: string; type: AprovAction } | null;

interface AprovacaoTabProps extends AbaBaseProps {
  invoices: Invoice[];
  budgetActuals: BudgetActual[];
}

// Filtro de status controlado pela página (vive na URL desde 23/09).
function AprovacaoTab({ invoices, getName, getFuncName, budgetActuals, selectedEventId, qc, toast, filterStatus, onFilterStatus, highlightActualId }: AprovacaoTabProps) {
  const [active, setActive]             = useState<ActiveAprovAction>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [comment, setComment]           = useState("");
  const [tocouMotivo, setTocouMotivo]   = useState(false);
  const [checkinDate, setCheckinDate]   = useState("");
  const setFilterStatus = onFilterStatus;
  const [highlightedId, setHighlightedId] = useState<string>(highlightActualId || "");

  // Param `actual` → destaca a linha e limpa após a animação (padrão da LancamentoTab)
  useEffect(() => {
    if (highlightActualId) {
      setHighlightedId(highlightActualId);
      const timer = setTimeout(() => setHighlightedId(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightActualId]);

  // Scroll até a linha destacada — tenta de novo até o elemento aparecer no DOM
  useEffect(() => {
    if (!highlightedId) return;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.querySelector(`[data-actual-id="${highlightedId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (attempts < 10) {
        attempts++;
        setTimeout(tryScroll, 200);
      }
    };
    const t = setTimeout(tryScroll, 150);
    return () => clearTimeout(t);
  }, [highlightedId, filterStatus, invoices?.length]);

  function openAction(invId: string, type: AprovAction) {
    setHistoryOpenId(null);
    if (active?.invId === invId && active.type === type) {
      setActive(null);
    } else {
      setActive({ invId, type });
      setComment("");
      setCheckinDate("");
    }
  }
  function closeAction() { setActive(null); }
  function toggleHistory(invId: string) {
    setActive(null);
    setHistoryOpenId(prev => prev === invId ? null : invId);
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/approve`, {}).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      // Chave global também (igual reject/checkin) — o Controle RH usa ["/api/invoices"]
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      closeAction();
      toast({ title: "Nota aprovada!", description: "Faça o Check-in Financeiro para definir a data de pagamento." });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível aprovar a nota", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const returnMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/return`, { comment }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      // Chave global também (igual reject/checkin) — o Controle RH usa ["/api/invoices"]
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      closeAction();
      toast({ title: "Nota devolvida para ajuste." });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível devolver a nota", description: apiErrorMessage(err, "Informe o motivo da devolução e tente novamente."), variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/reject`, { comment }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      closeAction();
      // A recusa não mexe no Flash (decisão 19/08): o crédito é do comparativo
      // aprovado; para estornar, rejeite/devolva o comparativo do evento.
      toast({ title: "Nota recusada.", description: "A recusa é definitiva — esta nota não poderá ser reenviada." });
    },
    onError: (e: unknown) => toast({ title: "Não foi possível recusar a nota", description: apiErrorMessage(e, "Tente novamente."), variant: "destructive" }),
  });

  const checkinMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/checkin`, {
        ...(checkinDate ? { paymentDate: checkinDate } : {}),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      closeAction();
      toast({ title: "Check-in realizado!", description: `Data de pagamento: ${fmtDate(checkinDate)}` });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível fazer o check-in", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  if (invoices.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-16 text-center">
        <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Nenhuma nota enviada ainda para este evento.</p>
      </div>
    );
  }

  const getActual = (id: string | null) => budgetActuals.find(a => a.id === id);

  function daysSince(inv: Invoice) {
    // Conta a partir do último envio/reenvio registrado no histórico
    // (após uma devolução + reenvio, o prazo reinicia). Fallback: createdAt.
    let ref: string | null = iso(inv.createdAt);
    if (inv.history) {
      try {
        const stored = parseStoredHistory(inv.history);
        for (const e of stored) {
          if ((e?.type === "enviado" || e?.type === "reenviado") && e?.at) ref = e.at;
        }
      } catch { /* histórico inválido — mantém createdAt */ }
    }
    const t = ref ? Date.parse(ref) : NaN;
    if (isNaN(t)) return 0;
    return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  }

  const aprovCountFor = (id: string) => {
    if (id === "all") return invoices.length;
    return invoices.filter(i => getEffectiveStatus(i) === id).length;
  };
  const alertFor = (id: string): number => {
    if (id !== "enviada") return 0;
    return invoices.filter(i => i.status === "enviada" && daysSince(i) > 3).length;
  };

  const filteredInvoices = filterStatus === "all"
    ? invoices
    : invoices.filter(i => getEffectiveStatus(i) === filterStatus);

  // Totals footer
  const approvedTotal = invoices.reduce((sum: number, inv) => {
    if (inv.status !== "aprovada") return sum;
    const actual = getActual(inv.budgetActualId);
    return sum + (actual?.totalValue || 0);
  }, 0);
  const waitingTotal = invoices.reduce((sum: number, inv) => {
    if (inv.status !== "enviada") return sum;
    const actual = getActual(inv.budgetActualId);
    return sum + (actual?.totalValue || 0);
  }, 0);
  const grandTotal = approvedTotal + waitingTotal;

  return (
    <div className="space-y-3">
      <FilterPills filters={APROV_FILTERS} active={filterStatus} countFor={aprovCountFor} onChange={setFilterStatus} alertFor={alertFor} />

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full" style={{ tableLayout: "fixed", minWidth: "760px" }}>
          <caption className="sr-only">Notas fiscais: colaborador, evento, valor, competência e situação da nota</caption>
          <colgroup>
            <col style={{ width: "210px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "95px" }} />
            <col style={{ width: "95px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "52px" }} />
            <col />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface-muted/60">
              <th scope="col" className="text-left px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Colaborador</th>
              <th scope="col" className="text-left px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Função</th>
              <th scope="col" className="text-right px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Valor</th>
              <th scope="col" className="text-left px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">OC</th>
              <th scope="col" className="text-left px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Nota</th>
              <th scope="col" className="px-2 py-3" />
              <th scope="col" className="text-right px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhum item com este status.
                </td>
              </tr>
            ) : null}
            {filteredInvoices.map(inv => {
              const actual   = getActual(inv.budgetActualId);
              const name     = getName(inv.collaboratorId);
              const effSt        = getEffectiveStatus(inv);
              const cfg          = getStatusCfg(effSt);
              const isActive     = active?.invId === inv.id;
              const isHistOpen   = historyOpenId === inv.id;
              const initial      = name && name !== "—" ? name.charAt(0).toUpperCase() : "?";
              const history      = buildHistory(inv, name);
              const hasReturn    = !!inv.returnComment;
              const borderColor  = isHistOpen ? "var(--primary)" : cfg.border;
              // Realizado devolvido/rejeitado pausa a aprovação da NF até o reenvio
              const actualBlocked = !!actual && (actual.rhStatus === "devolvido" || actual.rhStatus === "rejeitado");
              const isTarget = !!highlightedId && inv.budgetActualId === highlightedId;

              return (
                <Fragment key={inv.id}>
                  <tr
                    data-actual-id={inv.budgetActualId}
                    className={`hover:bg-surface-muted/60 transition-colors duration-700 ${
                      isTarget
                        ? "bg-brand-soft/70"
                        : isActive && active?.type === "approve"
                        ? "bg-card"
                        : isHistOpen
                        ? "bg-brand-soft/30"
                        : isActive
                        ? "bg-surface-muted"
                        : "border-b border-border"
                    }`}
                    style={{
                      borderLeft: `3px solid ${borderColor}`,
                      ...(isTarget ? { boxShadow: "inset 0 0 0 2px var(--primary)" } : {}),
                    }}
                  >
                    {/* Colaborador */}
                    <td className="px-4 py-3.5 overflow-hidden" style={{ minWidth: "180px" }}>
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${cfg.avatarCls}`}>
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-foreground truncate block" title={toTitleCase(name)}>{toTitleCase(name)}</span>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full ${cfg.pill}`}>{cfg.label}</span>
                            {hasReturn && (
                              <span title="Houve devolução" className="text-2xs text-warning-strong font-bold leading-none">↩</span>
                            )}
                            {effSt === "enviada" && (() => {
                              const d = daysSince(inv);
                              const color = d <= 2 ? "var(--muted-foreground)" : d <= 5 ? "var(--warning)" : "var(--danger)";
                              return (
                                <span className="text-2xs font-medium leading-none" style={{ color }}>
                                  há {d} {d === 1 ? "dia" : "dias"}{d > 5 ? " ⚠" : ""}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Função */}
                    <td className="px-4 py-3.5 overflow-hidden">
                      <span className="text-xs text-muted-foreground truncate block">{getFuncName(inv.functionId)}</span>
                    </td>
                    {/* Valor */}
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-sm font-bold text-primary tabular-nums font-mono">
                        {actual ? formatCurrency(actual.totalValue) : "—"}
                      </span>
                    </td>
                    {/* OC */}
                    <td className="px-4 py-3.5 overflow-hidden">
                      <span className="text-xs font-mono text-slate-600 truncate block">{inv.oc || "—"}</span>
                    </td>
                    {/* Nota */}
                    <td className="px-4 py-3.5">
                      {inv.attachmentUrl ? (
                        <a href={inv.attachmentUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-brand-soft hover:bg-brand-soft px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                          <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Ver nota
                        </a>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    {/* Histórico toggle */}
                    <td className="px-2 py-3.5 text-center">
                      <button
                        onClick={() => toggleHistory(inv.id)}
                        title={isHistOpen ? "Fechar histórico" : `${history.length} evento(s)`}
                        aria-expanded={isHistOpen}
                        aria-label={isHistOpen ? "Fechar histórico" : `Abrir histórico (${history.length} eventos)`}
                        className={`inline-flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 transition-colors ${
                          isHistOpen
                            ? "text-primary bg-brand-soft"
                            : "text-muted-foreground hover:text-primary hover:bg-brand-soft"
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        {!isHistOpen && (
                          <span className="text-2xs font-semibold leading-none tabular-nums">{history.length}</span>
                        )}
                      </button>
                    </td>
                    {/* Ações */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {effSt === "enviada" && (
                          <>
                            {actualBlocked && (
                              <span
                                className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-1 rounded-full bg-warning-soft text-warning border border-warning/25 whitespace-nowrap"
                                title="Realizado devolvido — aguarde o reenvio"
                              >
                                <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Realizado devolvido
                              </span>
                            )}
                            <MotivoDesabilitado motivo={actualBlocked ? "Realizado devolvido — aguarde o reenvio" : undefined} desabilitado={actualBlocked}>
                              <button
                              onClick={() => openAction(inv.id, "approve")}
                              disabled={actualBlocked}
                             
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap border ${
                                actualBlocked
                                  ? "text-muted-foreground bg-surface-muted border-border cursor-not-allowed opacity-60"
                                  : isActive && active?.type === "approve"
                                  ? "bg-success text-white border-success"
                                  : "text-success bg-success-soft border-success/25 hover:bg-success-soft"
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Aprovar
                            </button>
                            </MotivoDesabilitado>
                            <button
                              onClick={() => openAction(inv.id, "return")}
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap border ${
                                isActive && active?.type === "return"
                                  ? "bg-warning text-white border-warning"
                                  : "text-warning bg-warning-soft border-warning/25 hover:bg-warning-soft"
                              }`}
                            >
                              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Devolver
                            </button>
                            <button
                              onClick={() => openAction(inv.id, "reject")}
                              title="Recusar em definitivo — a nota não poderá ser reenviada"
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap border ${
                                isActive && active?.type === "reject"
                                  ? "bg-danger text-white border-danger"
                                  : "text-danger bg-danger-soft border-danger/25 hover:bg-danger-soft"
                              }`}
                            >
                              <Ban className="w-3.5 h-3.5" aria-hidden="true" /> Recusar
                            </button>
                          </>
                        )}
                        {effSt === "checkin-pendente" && (
                          <button
                            onClick={() => openAction(inv.id, "checkin")}
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap border ${
                              isActive && active?.type === "checkin"
                                ? "bg-primary text-primary-foreground border-primary"
                                : "text-primary bg-brand-soft border-primary/25 hover:bg-brand-soft"
                            }`}
                          >
                            <CircleDot className="w-3.5 h-3.5" aria-hidden="true" /> Fazer Check-in
                          </button>
                        )}
                        {effSt === "checkin-realizado" && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success bg-success-soft border border-success/25 px-2.5 py-1.5 rounded-lg">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> {fmtDate(inv.paymentDate)}
                          </span>
                        )}
                        {effSt === "devolvida" && (
                          <span className="text-2xs text-muted-foreground italic truncate max-w-[180px]" title={inv.returnComment || undefined}>
                            {inv.returnComment || "Devolvida"}
                          </span>
                        )}
                        {effSt === "recusada" && (
                          <span
                            className="text-2xs text-danger italic truncate max-w-[180px]"
                            title={inv.returnComment ? `Recusada: ${inv.returnComment}` : "Recusada"}
                          >
                            {inv.returnComment || "Recusada"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Inline action panel */}
                  {isActive && active && (
                    <tr
                      key={`${inv.id}-panel`}
                      className={active.type === "approve" ? "" : "bg-surface-muted border-b border-border"}
                      style={active.type === "approve" ? { borderLeft: `3px solid ${cfg.border}` } : {}}
                    >
                      <td
                        colSpan={7}
                        className={active.type === "approve" ? "bg-success-soft border-t border-t-success-strong py-2.5 px-4 rounded-b-lg" : "px-5 py-3"}
                      >

                        {/* ── Aprovar ── */}
                        {active.type === "approve" && (
                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-success" aria-hidden="true" />
                              <span className="text-sm font-semibold text-success">Confirmar aprovação</span>
                            </div>
                            <p className="text-xs text-success/70 flex-1">
                              Confirmar aprovação desta nota? O RH deverá fazer o Check-in em seguida.
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={closeAction}
                                className="h-8 px-3 text-xs font-medium text-muted-foreground hover:text-slate-700 rounded-lg transition-colors"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => approveMutation.mutate(inv.id)}
                                disabled={approveMutation.isPending}
                                className="h-8 px-4 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-50 bg-success"
                              >
                                {approveMutation.isPending ? "Aprovando…" : "✓ Confirmar"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* ── Devolver ── */}
                        {active.type === "return" && (
                          <div className="space-y-2.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning bg-warning-soft border border-warning/25 px-2.5 py-1.5 rounded-lg">
                              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Devolver para ajuste
                            </span>
                            <div>
                              <label htmlFor={`nf-return-${inv.id}`} className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                                Motivo da devolução<RequiredMark />
                              </label>
                              <Textarea
                                id={`nf-return-${inv.id}`}
                                rows={3}
                                value={comment}
                                aria-required="true"
                                {...campoComErro(`nf-return-${inv.id}`, tocouMotivo && !comment.trim() ? "Informe o motivo da devolução." : undefined)}
                                onChange={e => setComment(e.target.value)}
                                onBlur={() => setTocouMotivo(true)}
                                placeholder="Descreva o que precisa ser corrigido (nota fiscal ou número OC)…"
                                className="text-xs rounded-xl border-border resize-none w-full"
                                autoFocus
                              />
                              <MensagemDeErro id={`nf-return-${inv.id}`} erro={tocouMotivo && !comment.trim() ? "Informe o motivo da devolução." : undefined} />
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={closeAction} className="h-8 px-3 text-xs text-muted-foreground hover:bg-border rounded-lg flex items-center gap-1">
                                <X className="w-3 h-3" aria-hidden="true" /> Cancelar
                              </button>
                              <button
                                onClick={() => { setTocouMotivo(true); if (comment.trim()) returnMutation.mutate(inv.id); }}
                                disabled={!comment.trim() || returnMutation.isPending}
                                aria-busy={returnMutation.isPending}
                                className="h-8 px-4 text-xs font-semibold bg-warning hover:bg-warning/90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                              >
                                {returnMutation.isPending ? "Devolvendo…" : "Confirmar devolução"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* ── Recusar (terminal) ── */}
                        {active.type === "reject" && (
                          <div className="space-y-2.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger bg-danger-soft border border-danger/25 px-2.5 py-1.5 rounded-lg">
                              <Ban className="w-3.5 h-3.5" aria-hidden="true" /> Recusar nota fiscal
                            </span>
                            <p className="text-2xs text-danger">
                              A recusa é definitiva: a nota não poderá ser corrigida nem reenviada. Para pedir ajustes, use <strong>Devolver</strong>.
                            </p>
                            <div>
                              <label htmlFor={`nf-reject-${inv.id}`} className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                                Motivo da recusa<RequiredMark />
                              </label>
                              <Textarea
                                id={`nf-reject-${inv.id}`}
                                rows={3}
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder="Explique por que esta nota está sendo recusada em definitivo…"
                                className="text-xs rounded-xl border-border resize-none w-full"
                                autoFocus
                              />
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={closeAction} className="h-8 px-3 text-xs text-muted-foreground hover:bg-border rounded-lg flex items-center gap-1">
                                <X className="w-3 h-3" aria-hidden="true" /> Cancelar
                              </button>
                              <button
                                onClick={() => rejectMutation.mutate(inv.id)}
                                disabled={!comment.trim() || rejectMutation.isPending}
                                className="h-8 px-4 text-xs font-semibold bg-danger hover:bg-danger/90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                              >
                                {rejectMutation.isPending ? "Recusando…" : "Confirmar Recusa"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* ── Check-in ── */}
                        {active.type === "checkin" && (
                          <div className="space-y-2.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-brand-soft border border-primary/25 px-2.5 py-1.5 rounded-lg">
                              <CircleDot className="w-3.5 h-3.5" aria-hidden="true" /> Check-in Financeiro
                            </span>
                            <div className="flex items-center gap-3 flex-wrap">
                              <div>
                                <label htmlFor={`nf-checkin-${inv.id}`} className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                                  Data de pagamento<RequiredMark />
                                </label>
                                <input
                                  id={`nf-checkin-${inv.id}`}
                                  type="date"
                                  value={checkinDate}
                                  onChange={e => setCheckinDate(e.target.value)}
                                  autoFocus
                                  className="h-9 text-sm border-2 border-primary/25 rounded-xl px-3 text-slate-700 bg-card focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                                />
                              </div>
                              <div className="flex items-center gap-2 mt-5">
                                <button onClick={closeAction} className="h-8 px-3 text-xs text-muted-foreground hover:bg-border rounded-lg flex items-center gap-1">
                                  <X className="w-3 h-3" aria-hidden="true" /> Cancelar
                                </button>
                                <button
                                  onClick={() => checkinMutation.mutate(inv.id)}
                                  disabled={!checkinDate || checkinMutation.isPending}
                                  className="h-8 px-4 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground rounded-lg transition-colors bg-primary hover:bg-primary-hover"
                                >
                                  {checkinMutation.isPending ? "Salvando…" : "Confirmar Check-in"}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}

                  {/* History panel */}
                  {isHistOpen && (
                    <tr key={`${inv.id}-history`} className="border-b border-primary/25">
                      <td
                        colSpan={7}
                        className="bg-surface-muted border-t border-t-primary/25" style={{
                          padding: "12px 16px 12px 48px",
                        }}
                      >
                        <HistoryPanel events={history} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {/* Totals footer */}
          {(approvedTotal > 0 || waitingTotal > 0) && (
            <tfoot>
              <tr className="bg-surface-muted border-t-2 border-t-border">
                <td className="px-4 py-3" colSpan={2}>
                  <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Total do Evento</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-5">
                    {approvedTotal > 0 && (
                      <div className="flex flex-col items-end">
                        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Aprovado</span>
                        <span className="text-sm font-bold text-success tabular-nums font-mono">{formatCurrency(approvedTotal)}</span>
                      </div>
                    )}
                    {waitingTotal > 0 && (
                      <div className="flex flex-col items-end">
                        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Aguardando</span>
                        <span className="text-sm font-bold text-warning tabular-nums font-mono">{formatCurrency(waitingTotal)}</span>
                      </div>
                    )}
                    <div className="flex flex-col items-end border-l border-border pl-5">
                      <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Total</span>
                      <span className="text-sm font-bold tabular-nums font-mono text-primary">{formatCurrency(grandTotal)}</span>
                    </div>
                  </div>
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>
    </div>
  );
}
