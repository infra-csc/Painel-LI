import { useState, useRef } from "react";
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
  FileText, Upload, CheckCircle2, RotateCcw, XCircle, Clock,
  ChevronDown, ChevronUp, Paperclip, Calendar, Building2,
  FileCheck, AlertCircle, Send, Eye, ExternalLink, Info, X, CheckCheck
} from "lucide-react";
import { Link } from "wouter";
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
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const STATUS_CONFIG: Record<string, { label: string; pill: string; border: string }> = {
  pendente:  { label: "Pendente",       pill: "bg-gray-100 text-gray-500",                              border: "#e5e7eb" },
  enviada:   { label: "Aguardando RH",  pill: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",       border: "#f59e0b" },
  aprovada:  { label: "Aprovada",       pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", border: "#10b981" },
  devolvida: { label: "Devolvida",      pill: "bg-orange-50 text-orange-600 ring-1 ring-orange-200",    border: "#f97316" },
  recusada:  { label: "Recusada",       pill: "bg-red-50 text-red-600 ring-1 ring-red-200",             border: "#ef4444" },
};

type ActionType = "approve" | "return" | "reject";
type ActiveAction = { invId: string; type: ActionType } | null;

// ── Stepper ─────────────────────────────────────────────────────────────────
const STEPS = [
  { id: "lancamento", label: "Lançamento",           icon: Send },
  { id: "aprovacao",  label: "Aprovação RH",          icon: FileCheck },
  { id: "checkin",    label: "Check-in Financeiro",   icon: CheckCheck },
];

function InvoiceStepper({ currentStep }: { currentStep: "lancamento" | "aprovacao" | "checkin" }) {
  const stepIdx = STEPS.findIndex(s => s.id === currentStep);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4">
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const done    = i < stepIdx;
          const active  = i === stepIdx;
          const pending = i > stepIdx;
          return (
            <div key={step.id} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all
                  ${done    ? "bg-emerald-500 text-white" :
                    active  ? "bg-[#0033CC] text-white ring-4 ring-blue-100" :
                              "bg-slate-100 text-slate-400"}`}
                >
                  {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                </div>
                <span className={`text-[11px] font-semibold whitespace-nowrap
                  ${done ? "text-emerald-600" : active ? "text-[#0033CC]" : "text-slate-400"}`}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 mb-5 rounded-full transition-colors
                  ${i < stepIdx ? "bg-emerald-400" : "bg-slate-200"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"lancamento" | "aprovacao">("lancamento");

  const canRH = isRhOrAdmin(user);

  const { data: events = [] } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const activeEvents = (events as any[]).filter(e => e.status !== "excluído");
  const eventsWithCnpj = activeEvents.filter((e: any) => e.paymentCompanyCnpj?.trim());
  const selectedEvent = eventsWithCnpj.find((e: any) => e.id === selectedEventId);

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
  const { data: functions = [] } = useQuery<any[]>({ queryKey: ["/api/functions"] });

  const getName = (id?: string | null) => (collaborators as any[]).find(c => c.id === id)?.fullName || "—";
  const getFuncName = (id?: string | null) => (functions as any[]).find(f => f.id === id)?.name || "—";

  const approvedActuals = (budgetActuals as any[]).filter(
    a => a.rhStatus === "aprovado" && !a.splitParentId
  );

  const getInvoice = (actualId: string) =>
    (invoices as any[]).find(inv => inv.budgetActualId === actualId);

  const pendingCount = approvedActuals.filter(a => {
    const inv = getInvoice(a.id);
    return !inv || inv.status === "pendente" || inv.status === "devolvida";
  }).length;
  const rhPendingCount = (invoices as any[]).filter(i => i.status === "enviada").length;

  const tabs = [
    { id: "lancamento" as const, label: "Lançamento", count: pendingCount, countCls: "bg-amber-100 text-amber-700" },
    ...(canRH ? [{ id: "aprovacao" as const, label: "Aprovação RH", count: rhPendingCount, countCls: "bg-orange-100 text-orange-700" }] : []),
  ];

  // Determine stepper step
  const stepperStep = activeTab === "aprovacao" ? "aprovacao" : "lancamento";

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                <FileText className="w-4 h-4 text-emerald-600" />
              </div>
              Notas Fiscais
            </h1>
            <p className="text-xs text-gray-400 mt-0.5 ml-10">Envio e aprovação de notas por colaborador</p>
          </div>
          {eventsWithCnpj.length > 0 && (
            <EventSearchSelect
              value={selectedEventId}
              onValueChange={setSelectedEventId}
              events={eventsWithCnpj}
              className="w-72"
            />
          )}
        </div>

        {/* Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-700">
            Apenas eventos com empresa pagadora aparecem aqui.{" "}
            <Link href="/events">
              <a className="font-semibold underline underline-offset-2 hover:text-blue-800 transition-colors">Cadastre no evento</a>
            </Link>
            {" "}os campos de Empresa e CNPJ responsável pelo pagamento.
          </p>
        </div>

        {eventsWithCnpj.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-600">Nenhum evento com empresa pagadora cadastrada</p>
            <p className="text-xs text-gray-400 mt-1.5 max-w-xs mx-auto">Para usar Notas Fiscais, cadastre a empresa responsável pelo pagamento no evento desejado.</p>
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
        ) : (
          <>
            {selectedEvent?.paymentCompanyName && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-700">
                  <span className="font-semibold">Empresa pagadora:</span>{" "}
                  {selectedEvent.paymentCompanyName}
                  {selectedEvent.paymentCompanyCnpj && (
                    <span className="text-emerald-500 ml-1">· CNPJ {selectedEvent.paymentCompanyCnpj}</span>
                  )}
                </p>
              </div>
            )}

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
                getInvoice={getInvoice}
                getName={getName}
                getFuncName={getFuncName}
                selectedEvent={selectedEvent}
                selectedEventId={selectedEventId}
                qc={qc}
                toast={toast}
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
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Filter Pills (shared) ──────────────────────────────────────────────────
const LANC_FILTERS = [
  { id: "all",      label: "Todos",         activeBg: "bg-slate-700 text-white" },
  { id: "pendente", label: "Pendente",      activeBg: "bg-gray-500 text-white" },
  { id: "enviada",  label: "Aguardando RH", activeBg: "bg-amber-500 text-white" },
  { id: "devolvida",label: "Devolvida",     activeBg: "bg-orange-500 text-white" },
  { id: "recusada", label: "Recusada",      activeBg: "bg-red-500 text-white" },
  { id: "aprovada", label: "Aprovada",      activeBg: "bg-emerald-500 text-white" },
];

function FilterPills({
  filters, active, countFor, onChange
}: { filters: typeof LANC_FILTERS; active: string; countFor: (id: string) => number; onChange: (id: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {filters.map(({ id, label, activeBg }) => {
        const cnt = countFor(id);
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
          </button>
        );
      })}
    </div>
  );
}

// ── Lançamento Tab ────────────────────────────────────────────────────────────
function LancamentoTab({ approvedActuals, getInvoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast }: any) {
  const [filterStatus, setFilterStatus] = useState("all");

  function getInvStatus(actual: any) {
    const inv = getInvoice(actual.id);
    return inv?.status || "pendente";
  }

  const countFor = (id: string) =>
    id === "all" ? approvedActuals.length : approvedActuals.filter((a: any) => getInvStatus(a) === id).length;

  const filtered = filterStatus === "all"
    ? approvedActuals
    : approvedActuals.filter((a: any) => getInvStatus(a) === filterStatus);

  if (approvedActuals.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
        <AlertCircle className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-sm text-gray-400">Nenhum colaborador aprovado no Comparativo para este evento.</p>
        <p className="text-xs text-gray-300 mt-1">A aprovação no Comparativo é necessária para habilitar o lançamento de notas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter pills */}
      <FilterPills
        filters={LANC_FILTERS}
        active={filterStatus}
        countFor={countFor}
        onChange={setFilterStatus}
      />

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-sm text-gray-400">Nenhum item com status "{LANC_FILTERS.find(f => f.id === filterStatus)?.label}".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((actual: any) => (
            <InvoiceCard
              key={actual.id}
              actual={actual}
              invoice={getInvoice(actual.id)}
              getName={getName}
              getFuncName={getFuncName}
              selectedEvent={selectedEvent}
              selectedEventId={selectedEventId}
              qc={qc}
              toast={toast}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Invoice Card (replaces LancamentoRow) ─────────────────────────────────────
function InvoiceCard({ actual, invoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast }: any) {
  const status = invoice?.status || "pendente";
  const [oc, setOc] = useState(invoice?.oc || "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [newSendMode, setNewSendMode] = useState(false);
  const newFileRef = useRef<HTMLInputElement>(null);
  const [clearedAttachment, setClearedAttachment] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinDate, setCheckinDate] = useState("");
  const [expanded, setExpanded] = useState(status === "devolvida" || status === "recusada");

  function removeAttachment() {
    setFile(null);
    setClearedAttachment(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  const canEdit = !invoice || invoice.status === "devolvida" || invoice.status === "pendente";
  const name = getName(actual.collaboratorId);
  const funcName = getFuncName(actual.functionId);
  const displayName = toTitleCase(name);
  const initial = displayName && displayName !== "—" ? displayName.charAt(0) : "?";

  const paymentText = (selectedEvent?.paymentCompanyName && actual.collaboratorId)
    ? `Este pagamento deve ser realizado de ${name} para ${selectedEvent.paymentCompanyName}${selectedEvent.paymentCompanyCnpj ? ` / CNPJ: ${selectedEvent.paymentCompanyCnpj}` : ""}.`
    : "";

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pendente;

  const avatarCls =
    status === "aprovada"  ? "bg-emerald-100 text-emerald-700" :
    status === "devolvida" ? "bg-orange-100 text-orange-600" :
    status === "enviada"   ? "bg-amber-100 text-amber-700" :
    status === "recusada"  ? "bg-red-100 text-red-600" :
    "bg-slate-100 text-slate-500";

  const submitMutation = useMutation({
    mutationFn: async () => {
      const forceClear = (status === "recusada" && newSendMode) || clearedAttachment;
      let attachmentUrl = forceClear ? "" : (invoice?.attachmentUrl || "");
      let attachmentName = forceClear ? "" : (invoice?.attachmentName || "");

      if (file) {
        setUploading(true);
        const fd = new FormData();
        fd.append("files", file);
        const resp = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
        const uploaded = await resp.json();
        if (uploaded?.[0]?.url) {
          attachmentUrl = uploaded[0].url;
          attachmentName = file.name;
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
      setNewSendMode(false);
      toast({ title: "Nota enviada!", description: "Aguardando aprovação do RH." });
    },
    onError: (e: any) => {
      setUploading(false);
      toast({ title: "Erro", description: e.message || "Erro ao enviar nota", variant: "destructive" });
    },
  });

  const checkinMutation = useMutation({
    mutationFn: (date: string) =>
      apiRequest("PATCH", `/api/invoices/${invoice.id}`, { paymentDate: date }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      setShowCheckin(false);
      setCheckinDate("");
      toast({ title: "Check-in realizado!", description: "Data de pagamento registrada com sucesso." });
    },
    onError: () => toast({ title: "Erro", description: "Erro ao registrar check-in", variant: "destructive" }),
  });

  const hasCheckin = status === "aprovada" && !!invoice?.paymentDate;
  const today = new Date().toISOString().split("T")[0];

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-shadow hover:shadow-md"
      style={{ borderLeft: `3px solid ${cfg.border}` }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${avatarCls}`}>
            {initial}
          </div>
          {/* Name + function */}
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-slate-800 truncate">{displayName}</div>
            <div className="text-[11px] text-slate-400 truncate">{funcName}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Value */}
          <span className="text-[18px] font-bold text-violet-600 tabular-nums font-mono">
            {formatCurrency(actual.totalValue)}
          </span>
          {/* Status pill */}
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${cfg.pill}`}>
            {cfg.label}
          </span>
          {/* Expand toggle for devolvida/recusada */}
          {(status === "devolvida" || status === "recusada") && (
            <button onClick={() => setExpanded(e => !e)} className="text-slate-400 hover:text-slate-600 transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Card body — meta row (OC + attachment link) */}
      <div className="px-5 pb-4">
        {/* OC + nota row */}
        {canEdit ? (
          <div className="flex items-center gap-3 mb-3">
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
                Nota em anexo <span className="text-red-400">*</span>
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
                  <button
                    type="button"
                    onClick={removeAttachment}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                  >
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
          </div>
        ) : (
          <div className="flex items-center gap-4 mb-3">
            {invoice?.oc && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">OC</span>
                <span className="text-[13px] font-mono font-semibold text-slate-700">{invoice.oc}</span>
              </div>
            )}
            {invoice?.attachmentUrl && (
              <a href={invoice.attachmentUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-xl transition-colors">
                <FileText className="w-3.5 h-3.5" /> Ver nota
              </a>
            )}
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1" />

          {/* Submit button */}
          {canEdit && (
            <Button
              size="sm"
              className="rounded-xl text-white px-5 h-9 text-sm shadow-sm"
              style={{ background: "#059669" }}
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || uploading}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {submitMutation.isPending || uploading ? "Enviando..." : status === "devolvida" ? "Reenviar nota" : "Enviar nota"}
            </Button>
          )}

          {/* Recusada: enviar nova */}
          {status === "recusada" && !newSendMode && !canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 px-4 h-9 text-xs"
              onClick={() => { setOc(""); setFile(null); setNewSendMode(true); }}
            >
              <Send className="w-3 h-3 mr-1.5" /> Enviar nova nota
            </Button>
          )}

          {/* Check-in financeiro */}
          {status === "aprovada" && !hasCheckin && !showCheckin && (
            <button
              onClick={() => setShowCheckin(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold text-white shadow-sm transition-colors"
              style={{ background: "#0033CC" }}
            >
              <Calendar className="w-3.5 h-3.5" />
              Realizar Check-in
            </button>
          )}

          {/* Check-in realizado */}
          {hasCheckin && (
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] font-semibold
              ${invoice.paymentDate < today ? "bg-orange-50 text-orange-700 border border-orange-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Check-in Realizado · Pagamento Previsto em {fmtDate(invoice.paymentDate)}
            </div>
          )}
        </div>

        {/* Check-in Popover */}
        {showCheckin && (
          <div className="mt-3 border-2 border-[#0033CC] rounded-2xl p-4 bg-blue-50/40">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-[#0033CC] flex items-center justify-center">
                <Calendar className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <div className="text-[13px] font-bold text-[#0033CC]">Check-in Financeiro</div>
                <div className="text-[11px] text-slate-500">Definir Data de Pagamento Prevista</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={checkinDate}
                onChange={e => setCheckinDate(e.target.value)}
                autoFocus
                className="h-9 text-sm border-2 border-[#0033CC]/30 rounded-xl px-3 text-slate-700 bg-white focus:outline-none focus:border-[#0033CC] focus:ring-2 focus:ring-[#0033CC]/10 flex-1"
              />
              <button
                onClick={() => setShowCheckin(false)}
                className="h-9 px-3 text-xs text-slate-500 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => checkinDate && checkinMutation.mutate(checkinDate)}
                disabled={!checkinDate || checkinMutation.isPending}
                className="h-9 px-4 text-xs font-semibold text-white rounded-xl disabled:opacity-40 transition-colors shadow-sm"
                style={{ background: "#0033CC" }}
              >
                {checkinMutation.isPending ? "Salvando..." : "Salvar Data"}
              </button>
            </div>
          </div>
        )}

        {/* New send mode (recusada) */}
        {status === "recusada" && newSendMode && (
          <div className="mt-3 border border-dashed border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-xs text-slate-500">Preencha os dados da nova nota fiscal para reenvio.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">
                  Nova OC <span className="text-red-400">*</span>
                </label>
                <Input value={oc} onChange={e => setOc(e.target.value)} placeholder="OC-0000" className="h-8 text-xs rounded-lg border-slate-200" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">
                  Nova nota em anexo <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => newFileRef.current?.click()}
                    className="flex-1 h-8 flex items-center gap-1.5 px-2.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-emerald-400 hover:bg-emerald-50/40 transition-all min-w-0"
                  >
                    {file ? (
                      <><FileCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" /><span className="truncate text-emerald-600">{file.name}</span></>
                    ) : (
                      <><Upload className="w-3.5 h-3.5 shrink-0" /><span>Selecionar arquivo</span></>
                    )}
                  </button>
                  {file && (
                    <button type="button" onClick={() => { setFile(null); if (newFileRef.current) newFileRef.current.value = ""; }}
                      className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <input ref={newFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => { setNewSendMode(false); setOc(""); setFile(null); }}>
                Cancelar
              </button>
              <Button size="sm" style={{ background: "#059669" }} className="rounded-lg text-white px-4 h-8 text-xs"
                onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || uploading}>
                <Send className="w-3 h-3 mr-1.5" />
                {submitMutation.isPending || uploading ? "Enviando..." : "Enviar nota fiscal"}
              </Button>
            </div>
          </div>
        )}

        {/* Expansion: devolvida */}
        {expanded && status === "devolvida" && (
          <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <RotateCcw className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold text-orange-600 mb-0.5 uppercase tracking-wide">Devolvida para ajuste</p>
              <p className="text-xs text-orange-700">{invoice?.returnComment || "Sem comentário."}</p>
            </div>
          </div>
        )}

        {/* Expansion: recusada */}
        {expanded && status === "recusada" && !newSendMode && (
          <div className="mt-3 space-y-2">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-red-600 mb-0.5 uppercase tracking-wide">Nota recusada pelo RH</p>
                <p className="text-xs text-red-700">{invoice?.returnComment || "Sem comentário."}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-1">
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide shrink-0">Nota anterior:</p>
              {invoice?.oc && <span className="text-[10px] font-mono text-slate-400 line-through">{invoice.oc}</span>}
              {invoice?.attachmentUrl && (
                <a href={invoice.attachmentUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-blue-500 hover:underline line-through">
                  <Paperclip className="w-2.5 h-2.5" /> Ver nota recusada
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Aprovação Tab ─────────────────────────────────────────────────────────────
const APROV_FILTERS = [
  { id: "all",      label: "Todos",     activeBg: "bg-slate-700 text-white" },
  { id: "enviada",  label: "Aguardando",activeBg: "bg-amber-500 text-white" },
  { id: "aprovada", label: "Aprovada",  activeBg: "bg-emerald-500 text-white" },
  { id: "devolvida",label: "Devolvida", activeBg: "bg-orange-500 text-white" },
  { id: "recusada", label: "Recusada",  activeBg: "bg-red-500 text-white" },
];

function AprovacaoTab({ invoices, getName, getFuncName, budgetActuals, selectedEventId, qc, toast }: any) {
  const [active, setActive] = useState<ActiveAction>(null);
  const [comment, setComment] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  function openAction(inv: any, type: ActionType) {
    if (active?.invId === inv.id && active.type === type) {
      setActive(null);
    } else {
      setActive({ invId: inv.id, type });
      setComment("");
    }
  }
  function closeAction() { setActive(null); }

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/approve`, {}).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      closeAction();
      toast({ title: "Nota aprovada!", description: "Colaborador poderá realizar o check-in financeiro." });
    },
    onError: () => toast({ title: "Erro", description: "Erro ao aprovar nota", variant: "destructive" }),
  });

  const returnMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/return`, { comment }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      closeAction();
      toast({ title: "Nota devolvida" });
    },
    onError: () => toast({ title: "Erro", description: "Erro ao devolver nota", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/reject`, { comment }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      closeAction();
      toast({ title: "Nota recusada" });
    },
    onError: () => toast({ title: "Erro", description: "Erro ao recusar nota", variant: "destructive" }),
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

  const aprovCountFor = (id: string) =>
    id === "all" ? invoices.length : invoices.filter((i: any) => i.status === id).length;

  const filteredInvoices = filterStatus === "all"
    ? invoices
    : invoices.filter((i: any) => i.status === filterStatus);

  return (
    <div className="space-y-3">
      {/* Filter pills */}
      <FilterPills
        filters={APROV_FILTERS}
        active={filterStatus}
        countFor={aprovCountFor}
        onChange={setFilterStatus}
      />

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "240px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col />
          </colgroup>
          <thead>
            <tr className="border-b border-gray-100 bg-slate-50/60">
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Colaborador</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Função</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Valor</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">OC</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Nota</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  Nenhum item com status "{APROV_FILTERS.find(f => f.id === filterStatus)?.label}".
                </td>
              </tr>
            ) : null}
            {filteredInvoices.map((inv: any) => {
              const actual = getActual(inv.budgetActualId);
              const name = getName(inv.collaboratorId);
              const isActiveRow = active?.invId === inv.id;
              const initial = name && name !== "—" ? name.charAt(0).toUpperCase() : "?";
              const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.pendente;

              const avatarCls =
                inv.status === "aprovada"  ? "bg-emerald-100 text-emerald-700" :
                inv.status === "enviada"   ? "bg-amber-100 text-amber-700" :
                inv.status === "devolvida" ? "bg-orange-100 text-orange-600" :
                inv.status === "recusada"  ? "bg-red-100 text-red-600" :
                "bg-slate-100 text-slate-500";

              return (
                <>
                  <tr
                    key={inv.id}
                    className={`border-b border-gray-50 hover:bg-gray-50/60 transition-colors ${isActiveRow ? "bg-gray-50" : ""}`}
                    style={{ borderLeft: `3px solid ${cfg.border}` }}
                  >
                    <td className="px-4 py-4 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${avatarCls}`}>
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[13px] font-medium text-slate-800 truncate block">{toTitleCase(name)}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.pill}`}>{cfg.label}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 overflow-hidden">
                      <span className="text-xs text-slate-500 truncate block">{getFuncName(inv.functionId)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-[13px] font-bold text-violet-600 tabular-nums font-mono">
                        {actual ? formatCurrency(actual.totalValue) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-4 overflow-hidden">
                      <span className="text-xs font-mono text-slate-600 truncate block">{inv.oc || "—"}</span>
                    </td>
                    <td className="px-4 py-4">
                      {inv.attachmentUrl ? (
                        <a href={inv.attachmentUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                          <FileText className="w-3.5 h-3.5" /> Ver nota
                        </a>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {inv.status === "enviada" && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openAction(inv, "approve")}
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                              isActiveRow && active?.type === "approve"
                                ? "bg-emerald-600 text-white"
                                : "text-emerald-600 hover:bg-emerald-50"
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar
                          </button>
                          <button
                            onClick={() => openAction(inv, "return")}
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                              isActiveRow && active?.type === "return"
                                ? "bg-orange-500 text-white"
                                : "text-orange-500 hover:bg-orange-50"
                            }`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Devolver
                          </button>
                          <button
                            onClick={() => openAction(inv, "reject")}
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                              isActiveRow && active?.type === "reject"
                                ? "bg-red-500 text-white"
                                : "text-red-500 hover:bg-red-50"
                            }`}
                          >
                            <XCircle className="w-3.5 h-3.5" /> Recusar
                          </button>
                        </div>
                      )}
                      {inv.status === "aprovada" && (
                        <div className="flex justify-end">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {inv.paymentDate ? `Check-in · ${fmtDate(inv.paymentDate)}` : "Aprovada"}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Inline action panel */}
                  {isActiveRow && active && (
                    <tr key={`${inv.id}-action`} className="bg-slate-50 border-b border-slate-100">
                      <td colSpan={6} className="px-5 py-3">
                        {active.type === "approve" && (
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar aprovação
                            </span>
                            <p className="text-xs text-slate-500">Após aprovar, o colaborador poderá definir a data de pagamento via Check-in Financeiro.</p>
                            <div className="flex items-center gap-2 ml-auto">
                              <button onClick={closeAction} className="h-8 px-3 text-xs text-slate-500 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1">
                                <X className="w-3 h-3" /> Cancelar
                              </button>
                              <button
                                onClick={() => approveMutation.mutate(inv.id)}
                                disabled={approveMutation.isPending}
                                className="h-8 px-4 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                              >
                                {approveMutation.isPending ? "Aprovando..." : "Confirmar"}
                              </button>
                            </div>
                          </div>
                        )}

                        {active.type === "return" && (
                          <div className="space-y-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2.5 py-1.5 rounded-lg">
                              <RotateCcw className="w-3.5 h-3.5" /> Devolver para ajuste
                            </span>
                            <div className="flex items-end gap-2">
                              <Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Explique o que precisa ser corrigido (opcional)..." className="text-xs rounded-lg border-slate-200 resize-none flex-1" autoFocus />
                              <div className="flex items-center gap-2 shrink-0">
                                <button onClick={closeAction} className="h-8 px-3 text-xs text-slate-500 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1">
                                  <X className="w-3 h-3" /> Cancelar
                                </button>
                                <button onClick={() => returnMutation.mutate(inv.id)} disabled={returnMutation.isPending} className="h-8 px-4 text-xs font-semibold bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg transition-colors">
                                  {returnMutation.isPending ? "Devolvendo..." : "Devolver"}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {active.type === "reject" && (
                          <div className="space-y-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg">
                              <XCircle className="w-3.5 h-3.5" /> Recusar nota
                            </span>
                            <div className="flex items-end gap-2">
                              <Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Motivo da recusa (opcional)..." className="text-xs rounded-lg border-slate-200 resize-none flex-1" autoFocus />
                              <div className="flex items-center gap-2 shrink-0">
                                <button onClick={closeAction} className="h-8 px-3 text-xs text-slate-500 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1">
                                  <X className="w-3 h-3" /> Cancelar
                                </button>
                                <button onClick={() => rejectMutation.mutate(inv.id)} disabled={rejectMutation.isPending} className="h-8 px-4 text-xs font-semibold bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg transition-colors">
                                  {rejectMutation.isPending ? "Recusando..." : "Recusar"}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
