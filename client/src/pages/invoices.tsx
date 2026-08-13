import { Fragment, useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { isRhOrAdmin } from "@/lib/permissions";
import { EventSearchSelect } from "@/components/event-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, Upload, CheckCircle2, RotateCcw, Clock,
  ChevronDown, ChevronUp, Paperclip, Calendar, Building2,
  FileCheck, AlertCircle, AlertTriangle, Send, Eye, ExternalLink, Info, X, CircleDot
} from "lucide-react";
import { Link, useSearch } from "wouter";
import type { Event, Invoice } from "@shared/schema";

function toTitleCase(str: string) {
  if (!str || str === "—") return str;
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v / 100);
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  // Aceita "YYYY-MM-DD" e timestamps ISO ("YYYY-MM-DDTHH:mm:ss...")
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}

// Effective status for display (aprovada splits into checkin-pendente / checkin-realizado)
type EffStatus = "pendente" | "enviada" | "devolvida" | "aprovada" | "checkin-pendente" | "checkin-realizado";

function getEffectiveStatus(inv: any): EffStatus {
  if (!inv) return "pendente";
  if (inv.status === "aprovada") {
    // "Concluído" = checkin realizado (checkinAt set); otherwise waiting for physical check-in
    return inv.checkinAt ? "checkin-realizado" : "checkin-pendente";
  }
  return inv.status as EffStatus;
}

const STATUS_CFG: Record<EffStatus, { label: string; pill: string; border: string; avatarCls: string }> = {
  pendente:          { label: "Pendente",            pill: "bg-gray-100 text-gray-500",                              border: "#e5e7eb", avatarCls: "bg-slate-100 text-slate-500" },
  enviada:           { label: "Aguardando RH",        pill: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",       border: "#f59e0b", avatarCls: "bg-amber-100 text-amber-700" },
  devolvida:         { label: "Devolvida",            pill: "bg-orange-50 text-orange-600 ring-1 ring-orange-200",    border: "#f97316", avatarCls: "bg-orange-100 text-orange-600" },
  aprovada:          { label: "Aprovada",             pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", border: "#10b981", avatarCls: "bg-emerald-100 text-emerald-700" },
  "checkin-pendente":{ label: "Aguard. Check-in",    pill: "bg-blue-50 text-[#0033CC] ring-1 ring-blue-200",         border: "#0033CC", avatarCls: "bg-blue-100 text-[#0033CC]" },
  "checkin-realizado":{ label: "Check-in Realizado", pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300", border: "#059669", avatarCls: "bg-emerald-100 text-emerald-700" },
};

// ── Stepper compacto ─────────────────────────────────────────────────────────
const STEPS = [
  { id: "lancamento", label: "Lançamento" },
  { id: "aprovacao",  label: "Aprovação RH" },
  { id: "checkin",    label: "Check-in" },
];

function InvoiceStepper({ currentStep }: { currentStep: "lancamento" | "aprovacao" | "checkin" }) {
  const stepIdx = STEPS.findIndex(s => s.id === currentStep);
  return (
    <div className="flex items-center gap-0 h-9">
      {STEPS.map((step, i) => {
        const done   = i < stepIdx;
        const active = i === stepIdx;
        const color  = done ? "#059669" : active ? "#0033CC" : "#9ca3af";
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 shrink-0`}
                style={{ borderColor: color, background: done || active ? color : "white" }}>
                {done && <CheckCircle2 className="w-2 h-2 text-white" strokeWidth={3} />}
                {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color }}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
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
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
              isActive
                ? `${activeBg} border-transparent shadow-sm`
                : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            {label}
            {cnt > 0 && (
              <span className={`text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                {cnt}
              </span>
            )}
            {alertCnt > 0 && (
              <span className="text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-full bg-amber-500 text-white"
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
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Read URL params via wouter's useSearch — reprocessa quando a querystring muda
  const search = useSearch();
  const urlParams = useMemo(() => new URLSearchParams(search), [search]);
  const paramEvent  = urlParams.get("event") || "";
  const paramTab    = urlParams.get("tab") as "lancamento" | "aprovacao" | null;
  const paramFilter = urlParams.get("filter") || "";
  const paramActual = urlParams.get("actual") || "";

  const [selectedEventId, setSelectedEventId] = useState<string>(paramEvent);
  const [activeTab, setActiveTab] = useState<"lancamento" | "aprovacao">(paramTab || "lancamento");
  const [initialFilter, setInitialFilter] = useState<string>(paramFilter);
  const [highlightActualId, setHighlightActualId] = useState<string>(paramActual);

  // Company confirmation state (for the CNPJ blocking screen)
  const [confirmCompanyId, setConfirmCompanyId] = useState<string>("__manual__");
  const [confirmCustomName, setConfirmCustomName] = useState("");
  const [confirmCustomCnpj, setConfirmCustomCnpj] = useState("");

  const canRH = isRhOrAdmin(user);

  const { data: events = [] } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const activeEvents = (events as any[]).filter(e => e.status !== "excluído");

  const { data: paymentCompanies = [] } = useQuery<any[]>({ queryKey: ["/api/payment-companies"] });

  // Sync from URL params when navigating from another page
  useEffect(() => {
    if (paramEvent)  setSelectedEventId(paramEvent);
    if (paramTab)    setActiveTab(paramTab);
    if (paramFilter) setInitialFilter(paramFilter);
    if (paramActual) setHighlightActualId(paramActual);
  }, [paramEvent, paramTab, paramFilter, paramActual]);

  // Auto-select the first active event when the list loads (if nothing is selected yet)
  useEffect(() => {
    if (!selectedEventId && activeEvents.length > 0) {
      setSelectedEventId(activeEvents[0].id);
    }
  }, [activeEvents.length]);

  // Pre-select the first registered company as default when companies load
  useEffect(() => {
    if ((paymentCompanies as any[]).length > 0 && confirmCompanyId === "__manual__") {
      setConfirmCompanyId(String((paymentCompanies as any[])[0].id));
    }
  }, [(paymentCompanies as any[]).length]);

  const eventsWithCnpj = activeEvents.filter((e: any) => e.paymentCompanyCnpj?.trim());
  const selectedEvent = activeEvents.find((e: any) => e.id === selectedEventId);

  const setEventCompanyMutation = useMutation({
    mutationFn: async ({ name, cnpj }: { name: string; cnpj: string }) => {
      const res = await apiRequest("PATCH", `/api/events/${selectedEventId}/payment-company`, {
        paymentCompanyName: name,
        paymentCompanyCnpj: cnpj,
        _userId: (user as any)?.id,
      });
      if (!res.ok) throw new Error("Erro ao salvar empresa pagadora");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Empresa pagadora configurada com sucesso" });
    },
    onError: () => toast({ title: "Erro ao salvar empresa pagadora", variant: "destructive" }),
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices", selectedEventId],
    queryFn: () => apiRequest("GET", `/api/invoices?eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });

  const { data: budgetActuals = [] } = useQuery<any[]>({
    queryKey: ["/api/budget-actual", selectedEventId],
    queryFn: () => apiRequest("GET", `/api/budget-actual?eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });

  const { data: collaborators = [] } = useQuery<any[]>({ queryKey: ["/api/collaborators"] });
  const { data: functions   = [] }   = useQuery<any[]>({ queryKey: ["/api/functions"] });

  // Escalação do evento — fonte da flag "emite NF" de cada escalado
  const { data: teamInclusions = [] } = useQuery<any[]>({
    queryKey: ["/api/team-inclusions", selectedEventId, "invoices"],
    queryFn: () => apiRequest("GET", `/api/team-inclusions?eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });

  const getName     = (id?: string | null) => (collaborators as any[]).find(c => c.id === id)?.fullName || "—";
  const getFuncName = (id?: string | null) => (functions     as any[]).find(f => f.id === id)?.name     || "—";

  // Definido na escalação: se false, a tela não cobra NF deste colaborador.
  // Match por colaborador+função; sem escalação correspondente, assume que emite.
  const emitsNfFor = (actual: any): boolean => {
    const matches = (teamInclusions as any[]).filter(ti => ti.collaboratorId && ti.collaboratorId === actual.collaboratorId);
    if (matches.length === 0) return true;
    const byFunction = matches.find(ti => ti.functionId === actual.functionId);
    // Sem match exato colaborador+função na escalação, assume que emite (cobra NF)
    if (!byFunction) return true;
    return byFunction.emitsNf !== false;
  };

  // NF fica disponível assim que o Realizado é enviado (sem esperar a análise
  // do comparativo pelo RH). Devolvido/rejeitado pausam a NF até regularizar.
  const approvedActuals = (budgetActuals as any[]).filter(
    a => (a.rhStatus === "aprovado" || (a.sentForReview && a.rhStatus === "pendente")) && !a.splitParentId
  );

  const getInvoice = (actualId: string) =>
    (invoices as any[]).find(inv => inv.budgetActualId === actualId);

  const pendingCount  = approvedActuals.filter(a => {
    if (!emitsNfFor(a)) return false; // não emite NF — nada a cobrar
    const inv = getInvoice(a.id);
    return !inv || inv.status === "pendente" || inv.status === "devolvida";
  }).length;
  const rhPendingCount = (invoices as any[]).filter(i => i.status === "enviada").length;

  const tabs = [
    { id: "lancamento" as const, label: "Lançamento",   count: pendingCount,   countCls: "bg-amber-100 text-amber-700" },
    ...(canRH ? [{ id: "aprovacao" as const, label: "Aprovação RH", count: rhPendingCount, countCls: "bg-orange-100 text-orange-700" }] : []),
  ];

  const stepperStep = activeTab === "aprovacao" ? "aprovacao" : "lancamento";

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-emerald-600" />
                </div>
                Notas Fiscais
                <span
                  className="group relative cursor-default"
                  title="A nota fiscal é liberada assim que o Realizado é enviado — itens devolvidos ou rejeitados pausam a NF até a regularização. Para geração automática do texto de pagamento, cadastre a empresa pagadora no evento."
                >
                  <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 transition-colors" />
                </span>
              </h1>
              <p className="text-xs text-gray-400 mt-0.5 ml-10">Envio e aprovação de notas por colaborador</p>
            </div>
            {/* Empresa pagadora inline */}
            {selectedEvent?.paymentCompanyName && (
              <div className="flex items-center gap-1.5 text-[12px] text-slate-500 whitespace-nowrap">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-medium text-slate-700">{selectedEvent.paymentCompanyName}</span>
                {selectedEvent.paymentCompanyCnpj && (
                  <span className="text-slate-400">· CNPJ {selectedEvent.paymentCompanyCnpj}</span>
                )}
              </div>
            )}
          </div>
          {activeEvents.length > 0 && (
            <EventSearchSelect
              value={selectedEventId}
              onValueChange={setSelectedEventId}
              events={activeEvents}
              className="w-72 shrink-0"
            />
          )}
        </div>

        {activeEvents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-600">Nenhum evento ativo encontrado</p>
            <p className="text-xs text-gray-400 mt-1.5 max-w-xs mx-auto">Crie ou reative um evento para gerenciar as notas fiscais.</p>
            <Link href="/events">
              <a className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Ir para Eventos
              </a>
            </Link>
          </div>
        ) : !selectedEventId ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Selecione um evento para gerenciar as notas fiscais</p>
          </div>
        ) : !selectedEvent?.paymentCompanyCnpj?.trim() ? (
          (() => {
            const pcs = paymentCompanies as any[];
            const selectedPc = pcs.find(c => String(c.id) === confirmCompanyId);
            const isManual = confirmCompanyId === "__manual__";
            const canConfirm = isManual
              ? confirmCustomName.trim() && confirmCustomCnpj.trim()
              : !!selectedPc;
            const handleConfirm = () => {
              const name = isManual ? confirmCustomName.trim() : selectedPc.name;
              const cnpj = isManual ? confirmCustomCnpj.trim() : selectedPc.cnpj;
              setEventCompanyMutation.mutate({ name, cnpj });
            };
            return (
              <div className="bg-white rounded-2xl border border-amber-200 p-8 max-w-md mx-auto">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Confirme a empresa pagadora</p>
                    <p className="text-xs text-slate-400 mt-0.5">Necessária para emissão das notas fiscais</p>
                  </div>
                </div>

                {/* Company selector */}
                <div className="space-y-3">
                  {pcs.length > 0 && (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                        Empresa cadastrada
                      </label>
                      <select
                        value={confirmCompanyId}
                        onChange={e => setConfirmCompanyId(e.target.value)}
                        className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-400"
                      >
                        {pcs.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} — {c.cnpj}
                          </option>
                        ))}
                        <option value="__manual__">Inserir manualmente...</option>
                      </select>
                    </div>
                  )}

                  {/* Manual entry (when no companies registered or "manual" selected) */}
                  {(isManual || pcs.length === 0) && (
                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                          Nome da empresa
                        </label>
                        <input
                          type="text"
                          value={confirmCustomName}
                          onChange={e => setConfirmCustomName(e.target.value)}
                          placeholder="Ex.: Produtora XYZ Ltda"
                          className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                          CNPJ
                        </label>
                        <input
                          type="text"
                          value={confirmCustomCnpj}
                          onChange={e => setConfirmCustomCnpj(e.target.value)}
                          placeholder="00.000.000/0000-00"
                          className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-400"
                        />
                      </div>
                    </div>
                  )}

                  {/* Preview when company selected from list */}
                  {!isManual && selectedPc && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
                      <Building2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-xs text-amber-800 font-medium">{selectedPc.name}</span>
                      <span className="text-xs text-amber-500 ml-auto">{selectedPc.cnpj}</span>
                    </div>
                  )}

                  <button
                    disabled={!canConfirm || setEventCompanyMutation.isPending}
                    onClick={handleConfirm}
                    className="w-full h-10 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold transition-colors mt-1"
                  >
                    {setEventCompanyMutation.isPending ? 'Salvando...' : 'Confirmar e Continuar'}
                  </button>
                </div>
              </div>
            );
          })()
        ) : (
          <>
            {/* Stepper */}
            <InvoiceStepper currentStep={stepperStep} />

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    activeTab === tab.id
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`${tab.countCls} px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none`}>
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
                initialFilter={initialFilter}
                highlightActualId={highlightActualId}
              />
            )}

            {activeTab === "aprovacao" && canRH && (
              <AprovacaoTab
                invoices={invoices as any[]}
                getName={getName}
                getFuncName={getFuncName}
                budgetActuals={budgetActuals as any[]}
                selectedEventId={selectedEventId}
                qc={qc}
                toast={toast}
                initialFilter={initialFilter}
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
  { id: "pendente",          label: "Pendente",           activeBg: "bg-gray-500 text-white" },
  { id: "enviada",           label: "Aguardando RH",      activeBg: "bg-amber-500 text-white" },
  { id: "devolvida",         label: "Devolvida",          activeBg: "bg-orange-500 text-white" },
  { id: "checkin-pendente",  label: "Aguard. Check-in",   activeBg: "bg-[#0033CC] text-white" },
  { id: "checkin-realizado", label: "Check-in Realizado", activeBg: "bg-emerald-600 text-white" },
  { id: "sem-nf",            label: "Não emite NF",       activeBg: "bg-slate-500 text-white" },
];

function LancamentoTab({ approvedActuals, emitsNfFor, getInvoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast, initialFilter, highlightActualId }: any) {
  const [filterStatus, setFilterStatus] = useState(initialFilter || "all");
  const [highlightedId, setHighlightedId] = useState<string>(highlightActualId || "");

  // When initialFilter changes (e.g. navigating from another page), apply it
  useEffect(() => {
    if (initialFilter) setFilterStatus(initialFilter);
  }, [initialFilter]);

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

  function getEffStatus(actual: any) {
    if (!emitsNfFor(actual)) return "sem-nf"; // definido na escalação
    return getEffectiveStatus(getInvoice(actual.id));
  }

  const countFor = (id: string) =>
    id === "all"
      ? approvedActuals.length
      : approvedActuals.filter((a: any) => getEffStatus(a) === id).length;

  const filtered = filterStatus === "all"
    ? approvedActuals
    : approvedActuals.filter((a: any) => getEffStatus(a) === filterStatus);

  if (approvedActuals.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
        <AlertCircle className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-sm text-gray-400">Nenhum colaborador com Realizado enviado para este evento.</p>
        <p className="text-xs text-gray-300 mt-1">O lançamento de notas é liberado assim que o Realizado é enviado. Itens devolvidos ou rejeitados ficam pausados até a regularização.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FilterPills filters={LANC_FILTERS} active={filterStatus} countFor={countFor} onChange={setFilterStatus} />

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-sm text-gray-400">Nenhum item com este status.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((actual: any) => {
            const isTarget = actual.id === highlightedId;
            if (!emitsNfFor(actual)) {
              // Definido na escalação: não emite NF — mostra o item sem cobrar nota
              return (
                <div key={actual.id} data-actual-id={actual.id} className="rounded-2xl bg-slate-50 border border-slate-200 px-5 py-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                    {(getName(actual.collaboratorId) || "?").charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-600 truncate">{getName(actual.collaboratorId)}</p>
                    <p className="text-[11px] text-slate-400">{getFuncName(actual.functionId)}</p>
                  </div>
                  <span className="text-sm font-mono font-semibold text-slate-500">
                    {((actual.totalValue || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-200 text-slate-600 text-[11px] font-bold whitespace-nowrap" title="Definido na escalação — nenhuma nota fiscal será cobrada deste colaborador">
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
                className={`rounded-2xl transition-all duration-700 ${isTarget ? "ring-2 ring-violet-400 ring-offset-2 shadow-lg shadow-violet-100" : ""}`}
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
function InvoiceCard({ actual, invoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast }: any) {
  const effStatus = getEffectiveStatus(invoice);
  const cfg = STATUS_CFG[effStatus];

  const [oc, setOc] = useState(invoice?.oc || "");
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

      if (!oc.trim()) throw new Error("OC obrigatória");
      if (!attachmentUrl) throw new Error("Nota em anexo obrigatória");

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
      toast({ title: "Nota enviada!", description: "Aguardando análise do RH." });
    },
    onError: (e: any) => {
      setUploading(false);
      // e.body vem do apiRequest enriquecido — mostra a mensagem real do
      // servidor (ex.: validação de OC repetida) em vez do texto genérico
      toast({ title: "Erro", description: e?.body?.message || e.message || "Erro ao enviar nota", variant: "destructive" });
    },
  });

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-shadow hover:shadow-md"
      style={{ borderLeft: `3px solid ${historyOpen ? "#3B4FE4" : cfg.border}` }}
    >
      {/* Header row */}
      <div className={`flex items-center justify-between px-5 py-4 transition-colors ${historyOpen ? "bg-blue-50/30" : ""}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${cfg.avatarCls}`}>
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-slate-800 truncate">{displayName}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="text-[11px] text-slate-400 truncate">{funcName}</div>
              {hasReturn && <span title="Houve devolução" className="text-[10px] text-orange-500 font-bold leading-none">↩</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[18px] font-bold text-violet-600 tabular-nums font-mono">
            {formatCurrency(actual.totalValue)}
          </span>
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${cfg.pill}`}>
            {cfg.label}
          </span>
          {invoice && history.length > 0 && (
            <button
              onClick={() => setHistoryOpen(o => !o)}
              title={historyOpen ? "Fechar histórico" : `${history.length} evento(s)`}
              className={`inline-flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 transition-colors ${
                historyOpen ? "text-[#3B4FE4] bg-blue-100" : "text-slate-400 hover:text-[#3B4FE4] hover:bg-blue-50"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {!historyOpen && <span className="text-[9px] font-semibold leading-none tabular-nums">{history.length}</span>}
            </button>
          )}
          {effStatus === "devolvida" && (
            <button onClick={() => setExpanded(e => !e)} className="text-slate-400 hover:text-slate-600 transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-4">
        {/* Editable (pendente / devolvida) */}
        {canEdit && (
          <div className="flex items-end gap-3 mb-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">
                Número OC <span className="text-red-400">*</span>
              </label>
              <Input
                value={oc}
                onChange={e => setOc(e.target.value)}
                placeholder="OC-0000"
                className="h-9 text-sm rounded-xl border-[#e5e7eb] focus:border-[#3B4FE4]"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">
                Nota fiscal <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 h-9 flex items-center gap-1.5 px-3 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500 hover:border-emerald-400 hover:bg-emerald-50/40 transition-all min-w-0"
                >
                  {file ? (
                    <><FileCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" /><span className="truncate text-emerald-600 font-medium">{file.name}</span></>
                  ) : invoice?.attachmentUrl && !clearedAttachment ? (
                    <><Paperclip className="w-3.5 h-3.5 shrink-0" /><span className="truncate">Substituir nota</span></>
                  ) : (
                    <><Upload className="w-3.5 h-3.5 shrink-0" /><span>Anexar nota</span></>
                  )}
                </button>
                {(file || (invoice?.attachmentUrl && !clearedAttachment)) && (
                  <button type="button" onClick={removeAttachment} aria-label="Remover anexo"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              {invoice?.attachmentUrl && !file && !clearedAttachment && (
                <a href={invoice.attachmentUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-blue-500 hover:underline">
                  <Eye className="w-2.5 h-2.5" /> Ver atual
                </a>
              )}
            </div>
            <Button
              size="sm"
              className="rounded-xl text-white px-5 h-9 text-sm shadow-sm shrink-0"
              style={{ background: "#059669" }}
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || uploading}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {submitMutation.isPending || uploading ? "Enviando..." : effStatus === "devolvida" ? "Reenviar" : "Enviar nota"}
            </Button>
          </div>
        )}

        {/* Read-only (enviada) */}
        {!canEdit && effStatus === "enviada" && invoice?.oc && (
          <div className="flex items-center gap-4 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">OC</span>
              <span className="text-[13px] font-mono font-semibold text-slate-700">{invoice.oc}</span>
            </div>
            {invoice?.attachmentUrl && (
              <a href={invoice.attachmentUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-xl transition-colors">
                <FileText className="w-3.5 h-3.5" /> Ver nota
              </a>
            )}
          </div>
        )}

        {/* Check-in pendente — aguardando RH fazer o check-in */}
        {(effStatus === "checkin-pendente" || effStatus === "checkin-realizado") && (
          <div className="flex items-center gap-4 mb-2">
            {invoice?.oc && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">OC</span>
                <span className="text-[13px] font-mono font-semibold text-slate-700">{invoice.oc}</span>
              </div>
            )}
            {invoice?.attachmentUrl && (
              <a href={invoice.attachmentUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-xl transition-colors">
                <FileText className="w-3.5 h-3.5" /> Ver nota
              </a>
            )}
          </div>
        )}

        {/* Check-in realizado */}
        {effStatus === "checkin-realizado" && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
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
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] font-medium bg-blue-50 text-[#0033CC] border border-blue-200">
            <Clock className="w-3.5 h-3.5" />
            Aprovada · Aguardando Check-in Financeiro
          </div>
        )}

        {/* Devolvida — motivo */}
        {expanded && effStatus === "devolvida" && (
          <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <RotateCcw className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold text-orange-600 mb-0.5 uppercase tracking-wide">Devolvida para ajuste</p>
              <p className="text-xs text-orange-700">{invoice?.returnComment || "Sem comentário."}</p>
            </div>
          </div>
        )}
      </div>

      {/* History panel */}
      {historyOpen && history.length > 0 && (
        <div style={{ background: "#F8FAFC", borderTop: "1px solid #DBEAFE", padding: "12px 20px 14px 48px" }}>
          <HistoryPanel events={history} collabName={name} />
        </div>
      )}
    </div>
  );
}

// ── Aprovação Tab ─────────────────────────────────────────────────────────────
const APROV_FILTERS = [
  { id: "all",               label: "Todos",              activeBg: "bg-slate-700 text-white" },
  { id: "enviada",           label: "Aguardando",         activeBg: "bg-amber-500 text-white" },
  { id: "checkin-pendente",  label: "Aguard. Check-in",   activeBg: "bg-[#0033CC] text-white" },
  { id: "checkin-realizado", label: "Check-in Realizado", activeBg: "bg-emerald-600 text-white" },
  { id: "devolvida",         label: "Devolvida",          activeBg: "bg-orange-500 text-white" },
];

// ── History helpers ───────────────────────────────────────────────────────────
function fmtDateTime(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

type HistEvent = {
  type: "enviado" | "reenviado" | "devolvido" | "aprovado" | "checkin";
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
  enviado:   { label: "Enviado",   color: "#3B4FE4", by: "colaborador" },
  reenviado: { label: "Reenviado", color: "#3B4FE4", by: "colaborador" },
  devolvido: { label: "Devolvido", color: "#D97706", by: "rh" },
  aprovado:  { label: "Aprovado",  color: "#16A34A", by: "rh" },
  checkin:   { label: "Check-in",  color: "#7C3AED", by: "rh" },
};

function buildHistory(inv: any, collabName: string): HistEvent[] {
  // Use stored history if available
  if (inv.history) {
    try {
      const stored: any[] = JSON.parse(inv.history);
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
  events.push({ type: "enviado", label: "Enviado", color: "#3B4FE4", at: fmtDateTime(inv.createdAt), by: toTitleCase(collabName) });
  if (inv.returnComment) {
    events.push({ type: "devolvido", label: "Devolvido", color: "#D97706", at: null, by: "RH", comment: inv.returnComment });
  }
  if (inv.approvedAt) {
    events.push({ type: "aprovado", label: "Aprovado", color: "#16A34A", at: fmtDateTime(inv.approvedAt), by: "RH" });
  }
  if (inv.paymentDate) {
    events.push({ type: "checkin", label: "Check-in", color: "#7C3AED", at: null, by: "RH", paymentDate: inv.paymentDate });
  }
  return events;
}

function HistoryPanel({ events, collabName }: { events: HistEvent[]; collabName: string }) {
  if (events.length === 0) return null;
  if (events.length === 1) {
    const e = events[0];
    return (
      <div className="text-[11px] text-slate-500 italic">
        Enviado em {e.at || "—"} por {e.by}
        {e.oc && <span className="not-italic text-slate-600 ml-1">· OC: <span className="font-mono font-semibold">{e.oc}</span></span>}
        {e.attachmentName && <span className="not-italic text-slate-500 ml-1">· Nota: {e.attachmentName}</span>}
      </div>
    );
  }
  return (
    <div className="relative pl-4">
      {/* vertical dotted line */}
      <div className="absolute left-[7px] top-3 bottom-3 w-px border-l-2 border-dotted border-slate-200" />
      <div className="space-y-3">
        {events.map((ev, i) => (
          <div key={i} className="relative flex items-start gap-3">
            {/* dot */}
            <div className="absolute -left-4 top-[5px] w-2 h-2 rounded-full ring-2 ring-white shrink-0" style={{ background: ev.color }} />
            <div className="min-w-0 w-full">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold" style={{ color: ev.color }}>{ev.label}</span>
                {ev.at && <span className="text-[11px] text-[#888]">{ev.at}</span>}
                <span className="text-[11px] text-[#666] italic">por {ev.by}</span>
              </div>
              {/* OC and attachment for sent/resent */}
              {(ev.type === "enviado" || ev.type === "reenviado") && (ev.oc || ev.attachmentName) && (
                <div className="mt-1 ml-0 flex items-center gap-3 flex-wrap">
                  {ev.oc && (
                    <span className="text-[11px] text-slate-600">
                      OC: <span className="font-mono font-semibold text-slate-800">{ev.oc}</span>
                    </span>
                  )}
                  {ev.attachmentName && (
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Paperclip className="w-2.5 h-2.5" /> {ev.attachmentName}
                    </span>
                  )}
                </div>
              )}
              {ev.comment && (
                <div className="mt-1 text-[11px] text-amber-800"
                  style={{ background: "#FEF3C7", borderLeft: "2px solid #D97706", padding: "4px 8px", borderRadius: "0 4px 4px 0" }}>
                  {ev.comment}
                </div>
              )}
              {ev.paymentDate && (
                <div className="mt-1 text-[11px] text-violet-700 italic">
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

type AprovAction = "approve" | "return" | "checkin";
type ActiveAprovAction = { invId: string; type: AprovAction } | null;

function AprovacaoTab({ invoices, getName, getFuncName, budgetActuals, selectedEventId, qc, toast, initialFilter }: any) {
  const [active, setActive]             = useState<ActiveAprovAction>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [comment, setComment]           = useState("");
  const [checkinDate, setCheckinDate]   = useState("");
  const [filterStatus, setFilterStatus] = useState(initialFilter || "all");

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
      closeAction();
      toast({ title: "Nota aprovada!", description: "Faça o Check-in Financeiro para definir a data de pagamento." });
    },
    onError: () => toast({ title: "Erro", description: "Erro ao aprovar nota", variant: "destructive" }),
  });

  const returnMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/return`, { comment }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      closeAction();
      toast({ title: "Nota devolvida para ajuste." });
    },
    onError: () => toast({ title: "Erro", description: "Erro ao devolver nota", variant: "destructive" }),
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
    onError: () => toast({ title: "Erro", description: "Erro ao realizar check-in", variant: "destructive" }),
  });

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
        <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-sm text-gray-400">Nenhuma nota enviada ainda para este evento.</p>
      </div>
    );
  }

  const getActual = (id: string) => budgetActuals.find((a: any) => a.id === id);

  function daysSince(inv: any) {
    // Conta a partir do último envio/reenvio registrado no histórico
    // (após uma devolução + reenvio, o prazo reinicia). Fallback: createdAt.
    let ref: string | null = inv.createdAt || null;
    if (inv.history) {
      try {
        const stored: any[] = JSON.parse(inv.history);
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
    return invoices.filter((i: any) => getEffectiveStatus(i) === id).length;
  };
  const alertFor = (id: string): number => {
    if (id !== "enviada") return 0;
    return invoices.filter((i: any) => i.status === "enviada" && daysSince(i) > 3).length;
  };

  const filteredInvoices = filterStatus === "all"
    ? invoices
    : invoices.filter((i: any) => getEffectiveStatus(i) === filterStatus);

  // Totals footer
  const approvedTotal = invoices.reduce((sum: number, inv: any) => {
    if (inv.status !== "aprovada") return sum;
    const actual = getActual(inv.budgetActualId);
    return sum + (actual?.totalValue || 0);
  }, 0);
  const waitingTotal = invoices.reduce((sum: number, inv: any) => {
    if (inv.status !== "enviada") return sum;
    const actual = getActual(inv.budgetActualId);
    return sum + (actual?.totalValue || 0);
  }, 0);
  const grandTotal = approvedTotal + waitingTotal;

  return (
    <div className="space-y-3">
      <FilterPills filters={APROV_FILTERS} active={filterStatus} countFor={aprovCountFor} onChange={setFilterStatus} alertFor={alertFor} />

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full" style={{ tableLayout: "fixed" }}>
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
            <tr className="border-b border-gray-100 bg-slate-50/60">
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Colaborador</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Função</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Valor</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">OC</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Nota</th>
              <th className="px-2 py-3" />
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                  Nenhum item com este status.
                </td>
              </tr>
            ) : null}
            {filteredInvoices.map((inv: any) => {
              const actual   = getActual(inv.budgetActualId);
              const name     = getName(inv.collaboratorId);
              const effSt        = getEffectiveStatus(inv);
              const cfg          = STATUS_CFG[effSt];
              const isActive     = active?.invId === inv.id;
              const isHistOpen   = historyOpenId === inv.id;
              const initial      = name && name !== "—" ? name.charAt(0).toUpperCase() : "?";
              const history      = buildHistory(inv, name);
              const hasReturn    = !!inv.returnComment;
              const borderColor  = isHistOpen ? "#3B4FE4" : cfg.border;
              // Realizado devolvido/rejeitado pausa a aprovação da NF até o reenvio
              const actualBlocked = !!actual && (actual.rhStatus === "devolvido" || actual.rhStatus === "rejeitado");

              return (
                <Fragment key={inv.id}>
                  <tr
                    className={`hover:bg-gray-50/60 transition-colors ${
                      isActive && active?.type === "approve"
                        ? "bg-white"
                        : isHistOpen
                        ? "bg-blue-50/30"
                        : isActive
                        ? "bg-gray-50"
                        : "border-b border-gray-50"
                    }`}
                    style={{ borderLeft: `3px solid ${borderColor}` }}
                  >
                    {/* Colaborador */}
                    <td className="px-4 py-3.5 overflow-hidden" style={{ minWidth: "180px" }}>
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${cfg.avatarCls}`}>
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[13px] font-medium text-slate-800 truncate block" title={toTitleCase(name)}>{toTitleCase(name)}</span>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.pill}`}>{cfg.label}</span>
                            {hasReturn && (
                              <span title="Houve devolução" className="text-[10px] text-orange-500 font-bold leading-none">↩</span>
                            )}
                            {effSt === "enviada" && (() => {
                              const d = daysSince(inv);
                              const color = d <= 2 ? "#6b7280" : d <= 5 ? "#D97706" : "#DC2626";
                              return (
                                <span className="text-[10px] font-medium leading-none" style={{ color }}>
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
                      <span className="text-xs text-slate-500 truncate block">{getFuncName(inv.functionId)}</span>
                    </td>
                    {/* Valor */}
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-[13px] font-bold text-violet-600 tabular-nums font-mono">
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
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                          <FileText className="w-3.5 h-3.5" /> Ver nota
                        </a>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    {/* Histórico toggle */}
                    <td className="px-2 py-3.5 text-center">
                      <button
                        onClick={() => toggleHistory(inv.id)}
                        title={isHistOpen ? "Fechar histórico" : `${history.length} evento(s)`}
                        className={`inline-flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 transition-colors ${
                          isHistOpen
                            ? "text-[#3B4FE4] bg-blue-100"
                            : "text-slate-400 hover:text-[#3B4FE4] hover:bg-blue-50"
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        {!isHistOpen && (
                          <span className="text-[9px] font-semibold leading-none tabular-nums">{history.length}</span>
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
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-orange-50 text-orange-600 border border-orange-200 whitespace-nowrap"
                                title="Realizado devolvido — aguarde o reenvio"
                              >
                                <AlertTriangle className="w-3 h-3" /> Realizado devolvido
                              </span>
                            )}
                            <button
                              onClick={() => openAction(inv.id, "approve")}
                              disabled={actualBlocked}
                              title={actualBlocked ? "Realizado devolvido — aguarde o reenvio" : undefined}
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap border ${
                                actualBlocked
                                  ? "text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed opacity-60"
                                  : isActive && active?.type === "approve"
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar
                            </button>
                            <button
                              onClick={() => openAction(inv.id, "return")}
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap border ${
                                isActive && active?.type === "return"
                                  ? "bg-amber-600 text-white border-amber-600"
                                  : "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100"
                              }`}
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Devolver
                            </button>
                          </>
                        )}
                        {effSt === "checkin-pendente" && (
                          <button
                            onClick={() => openAction(inv.id, "checkin")}
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap border ${
                              isActive && active?.type === "checkin"
                                ? "bg-[#0033CC] text-white border-[#0033CC]"
                                : "text-[#0033CC] bg-blue-50 border-blue-200 hover:bg-blue-100"
                            }`}
                          >
                            <CircleDot className="w-3.5 h-3.5" /> Fazer Check-in
                          </button>
                        )}
                        {effSt === "checkin-realizado" && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {fmtDate(inv.paymentDate)}
                          </span>
                        )}
                        {effSt === "devolvida" && (
                          <span className="text-[11px] text-slate-400 italic truncate max-w-[180px]">
                            {inv.returnComment || "Devolvida"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Inline action panel */}
                  {isActive && active && (
                    <tr
                      key={`${inv.id}-panel`}
                      className={active.type === "approve" ? "" : "bg-slate-50 border-b border-slate-100"}
                      style={active.type === "approve" ? { borderLeft: `3px solid ${cfg.border}` } : {}}
                    >
                      <td
                        colSpan={7}
                        className={active.type === "approve" ? "" : "px-5 py-3"}
                        style={active.type === "approve" ? {
                          background: "#F0FDF4",
                          borderTop: "1px solid #86EFAC",
                          padding: "10px 16px",
                          borderRadius: "0 0 8px 8px",
                        } : {}}
                      >

                        {/* ── Aprovar ── */}
                        {active.type === "approve" && (
                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span className="text-[13px] font-semibold text-emerald-700">Confirmar aprovação</span>
                            </div>
                            <p className="text-xs text-emerald-700/70 flex-1">
                              Confirmar aprovação desta nota? O RH deverá fazer o Check-in em seguida.
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={closeAction}
                                className="h-8 px-3 text-xs font-medium text-slate-500 hover:text-slate-700 rounded-lg transition-colors"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => approveMutation.mutate(inv.id)}
                                disabled={approveMutation.isPending}
                                className="h-8 px-4 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-50"
                                style={{ background: "#16A34A" }}
                              >
                                {approveMutation.isPending ? "Aprovando..." : "✓ Confirmar"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* ── Devolver ── */}
                        {active.type === "return" && (
                          <div className="space-y-2.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg">
                              <RotateCcw className="w-3.5 h-3.5" /> Devolver para ajuste
                            </span>
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                                Motivo da devolução <span className="text-red-400">*</span>
                              </label>
                              <Textarea
                                rows={3}
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder="Descreva o que precisa ser corrigido (nota fiscal ou número OC)..."
                                className="text-xs rounded-xl border-slate-200 resize-none w-full"
                                autoFocus
                              />
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={closeAction} className="h-8 px-3 text-xs text-slate-500 hover:bg-slate-200 rounded-lg flex items-center gap-1">
                                <X className="w-3 h-3" /> Cancelar
                              </button>
                              <button
                                onClick={() => returnMutation.mutate(inv.id)}
                                disabled={!comment.trim() || returnMutation.isPending}
                                className="h-8 px-4 text-xs font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                              >
                                {returnMutation.isPending ? "Devolvendo..." : "↩ Confirmar Devolução"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* ── Check-in ── */}
                        {active.type === "checkin" && (
                          <div className="space-y-2.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0033CC] bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg">
                              <CircleDot className="w-3.5 h-3.5" /> Check-in Financeiro
                            </span>
                            <div className="flex items-center gap-3">
                              <div>
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                                  Data prevista de pagamento <span className="text-red-400">*</span>
                                </label>
                                <input
                                  type="date"
                                  value={checkinDate}
                                  onChange={e => setCheckinDate(e.target.value)}
                                  autoFocus
                                  className="h-9 text-sm border-2 border-blue-200 rounded-xl px-3 text-slate-700 bg-white focus:outline-none focus:border-[#0033CC] focus:ring-2 focus:ring-blue-100"
                                />
                              </div>
                              <div className="flex items-center gap-2 mt-5">
                                <button onClick={closeAction} className="h-8 px-3 text-xs text-slate-500 hover:bg-slate-200 rounded-lg flex items-center gap-1">
                                  <X className="w-3 h-3" /> Cancelar
                                </button>
                                <button
                                  onClick={() => checkinMutation.mutate(inv.id)}
                                  disabled={!checkinDate || checkinMutation.isPending}
                                  className="h-8 px-4 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                                  style={{ background: "#0033CC" }}
                                >
                                  {checkinMutation.isPending ? "Salvando..." : "Confirmar Check-in"}
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
                    <tr key={`${inv.id}-history`} className="border-b border-blue-100">
                      <td
                        colSpan={7}
                        style={{
                          background: "#F8FAFC",
                          borderTop: "1px solid #DBEAFE",
                          padding: "12px 16px 12px 48px",
                        }}
                      >
                        <HistoryPanel events={history} collabName={name} />
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
              <tr style={{ background: "#F8FAFC", borderTop: "2px solid #e5e7eb" }}>
                <td className="px-4 py-3" colSpan={2}>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total do Evento</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-5">
                    {approvedTotal > 0 && (
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Aprovado</span>
                        <span className="text-[13px] font-bold text-emerald-600 tabular-nums font-mono">{formatCurrency(approvedTotal)}</span>
                      </div>
                    )}
                    {waitingTotal > 0 && (
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Aguardando</span>
                        <span className="text-[13px] font-bold text-amber-600 tabular-nums font-mono">{formatCurrency(waitingTotal)}</span>
                      </div>
                    )}
                    <div className="flex flex-col items-end border-l border-slate-200 pl-5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total</span>
                      <span className="text-[13px] font-bold tabular-nums font-mono" style={{ color: "#3B4FE4" }}>{formatCurrency(grandTotal)}</span>
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
  );
}
