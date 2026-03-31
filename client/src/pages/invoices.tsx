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
  FileText, Upload, CheckCircle2, RotateCcw, Clock,
  ChevronDown, ChevronUp, Paperclip, Calendar, Building2,
  FileCheck, AlertCircle, Send, Eye, ExternalLink, Info, X, CheckCheck, CircleDot
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

// Effective status for display (aprovada splits into checkin-pendente / checkin-realizado)
type EffStatus = "pendente" | "enviada" | "devolvida" | "aprovada" | "checkin-pendente" | "checkin-realizado";

function getEffectiveStatus(inv: any): EffStatus {
  if (!inv) return "pendente";
  if (inv.status === "aprovada") {
    return inv.paymentDate ? "checkin-realizado" : "checkin-pendente";
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

// ── Stepper ─────────────────────────────────────────────────────────────────
const STEPS = [
  { id: "lancamento", label: "Lançamento",          icon: Send },
  { id: "aprovacao",  label: "Aprovação RH",         icon: FileCheck },
  { id: "checkin",    label: "Check-in Financeiro",  icon: CheckCheck },
];

function InvoiceStepper({ currentStep }: { currentStep: "lancamento" | "aprovacao" | "checkin" }) {
  const stepIdx = STEPS.findIndex(s => s.id === currentStep);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4">
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const done   = i < stepIdx;
          const active = i === stepIdx;
          return (
            <div key={step.id} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all
                  ${done    ? "bg-emerald-500 text-white" :
                    active  ? "bg-[#0033CC] text-white ring-4 ring-blue-100" :
                              "bg-slate-100 text-slate-400"}`}>
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

// ── Filter Pills ─────────────────────────────────────────────────────────────
function FilterPills({ filters, active, countFor, onChange }: {
  filters: { id: string; label: string; activeBg: string }[];
  active: string;
  countFor: (id: string) => number;
  onChange: (id: string) => void;
}) {
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
  const { data: functions   = [] }   = useQuery<any[]>({ queryKey: ["/api/functions"] });

  const getName     = (id?: string | null) => (collaborators as any[]).find(c => c.id === id)?.fullName || "—";
  const getFuncName = (id?: string | null) => (functions     as any[]).find(f => f.id === id)?.name     || "—";

  const approvedActuals = (budgetActuals as any[]).filter(
    a => a.rhStatus === "aprovado" && !a.splitParentId
  );

  const getInvoice = (actualId: string) =>
    (invoices as any[]).find(inv => inv.budgetActualId === actualId);

  const pendingCount  = approvedActuals.filter(a => {
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

// ── Lançamento Tab ────────────────────────────────────────────────────────────
const LANC_FILTERS = [
  { id: "all",               label: "Todos",              activeBg: "bg-slate-700 text-white" },
  { id: "pendente",          label: "Pendente",           activeBg: "bg-gray-500 text-white" },
  { id: "enviada",           label: "Aguardando RH",      activeBg: "bg-amber-500 text-white" },
  { id: "devolvida",         label: "Devolvida",          activeBg: "bg-orange-500 text-white" },
  { id: "checkin-pendente",  label: "Aguard. Check-in",   activeBg: "bg-[#0033CC] text-white" },
  { id: "checkin-realizado", label: "Check-in Realizado", activeBg: "bg-emerald-600 text-white" },
];

function LancamentoTab({ approvedActuals, getInvoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast }: any) {
  const [filterStatus, setFilterStatus] = useState("all");

  function getEffStatus(actual: any) {
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
        <p className="text-sm text-gray-400">Nenhum colaborador aprovado no Comparativo para este evento.</p>
        <p className="text-xs text-gray-300 mt-1">A aprovação no Comparativo é necessária para habilitar o lançamento de notas.</p>
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

  const canEdit = !invoice || invoice.status === "devolvida" || invoice.status === "pendente";
  const name = getName(actual.collaboratorId);
  const funcName = getFuncName(actual.functionId);
  const displayName = toTitleCase(name);
  const initial = displayName && displayName !== "—" ? displayName.charAt(0) : "?";

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
        const uploaded = await resp.json();
        if (uploaded?.[0]?.url) { attachmentUrl = uploaded[0].url; attachmentName = file.name; }
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
      toast({ title: "Erro", description: e.message || "Erro ao enviar nota", variant: "destructive" });
    },
  });

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-shadow hover:shadow-md"
      style={{ borderLeft: `3px solid ${cfg.border}` }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${cfg.avatarCls}`}>
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-slate-800 truncate">{displayName}</div>
            <div className="text-[11px] text-slate-400 truncate">{funcName}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[18px] font-bold text-violet-600 tabular-nums font-mono">
            {formatCurrency(actual.totalValue)}
          </span>
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${cfg.pill}`}>
            {cfg.label}
          </span>
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
                  <button type="button" onClick={removeAttachment}
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

        {/* Check-in realizado — data de pagamento */}
        {effStatus === "checkin-realizado" && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Check-in Realizado · Pagamento Previsto em {fmtDate(invoice?.paymentDate)}
          </div>
        )}

        {/* Aguardando Check-in — colaborador apenas aguarda */}
        {effStatus === "checkin-pendente" && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] font-medium bg-blue-50 text-[#0033CC] border border-blue-200">
            <Clock className="w-3.5 h-3.5" />
            Aprovada · Aguardando Check-in Financeiro pelo RH
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

type AprovAction = "approve" | "return" | "checkin";
type ActiveAprovAction = { invId: string; type: AprovAction } | null;

function AprovacaoTab({ invoices, getName, getFuncName, budgetActuals, selectedEventId, qc, toast }: any) {
  const [active, setActive]         = useState<ActiveAprovAction>(null);
  const [comment, setComment]       = useState("");
  const [checkinDate, setCheckinDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  function openAction(invId: string, type: AprovAction) {
    if (active?.invId === invId && active.type === type) {
      setActive(null);
    } else {
      setActive({ invId, type });
      setComment("");
      setCheckinDate("");
    }
  }
  function closeAction() { setActive(null); }

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
      apiRequest("PATCH", `/api/invoices/${id}`, { paymentDate: checkinDate }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
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

  const aprovCountFor = (id: string) => {
    if (id === "all") return invoices.length;
    return invoices.filter((i: any) => getEffectiveStatus(i) === id).length;
  };

  const filteredInvoices = filterStatus === "all"
    ? invoices
    : invoices.filter((i: any) => getEffectiveStatus(i) === filterStatus);

  return (
    <div className="space-y-3">
      <FilterPills filters={APROV_FILTERS} active={filterStatus} countFor={aprovCountFor} onChange={setFilterStatus} />

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "220px" }} />
            <col style={{ width: "130px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "100px" }} />
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
                  Nenhum item com este status.
                </td>
              </tr>
            ) : null}
            {filteredInvoices.map((inv: any) => {
              const actual   = getActual(inv.budgetActualId);
              const name     = getName(inv.collaboratorId);
              const effSt    = getEffectiveStatus(inv);
              const cfg      = STATUS_CFG[effSt];
              const isActive = active?.invId === inv.id;
              const initial  = name && name !== "—" ? name.charAt(0).toUpperCase() : "?";

              return (
                <>
                  <tr
                    key={inv.id}
                    className={`hover:bg-gray-50/60 transition-colors ${isActive && active?.type === "approve" ? "bg-white" : isActive ? "bg-gray-50" : "border-b border-gray-50"}`}
                    style={{ borderLeft: `3px solid ${cfg.border}` }}
                  >
                    <td className="px-4 py-3.5 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${cfg.avatarCls}`}>
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[13px] font-medium text-slate-800 truncate block">{toTitleCase(name)}</span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.pill}`}>{cfg.label}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 overflow-hidden">
                      <span className="text-xs text-slate-500 truncate block">{getFuncName(inv.functionId)}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-[13px] font-bold text-violet-600 tabular-nums font-mono">
                        {actual ? formatCurrency(actual.totalValue) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 overflow-hidden">
                      <span className="text-xs font-mono text-slate-600 truncate block">{inv.oc || "—"}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {inv.attachmentUrl ? (
                        <a href={inv.attachmentUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                          <FileText className="w-3.5 h-3.5" /> Ver nota
                        </a>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Aguardando RH: Aprovar + Devolver */}
                        {effSt === "enviada" && (
                          <>
                            <button
                              onClick={() => openAction(inv.id, "approve")}
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap border ${
                                isActive && active?.type === "approve"
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
                        {/* Aprovada sem check-in: botão fazer check-in */}
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
                        {/* Check-in realizado */}
                        {effSt === "checkin-realizado" && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {fmtDate(inv.paymentDate)}
                          </span>
                        )}
                        {/* Devolvida — info */}
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
                        colSpan={6}
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
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
