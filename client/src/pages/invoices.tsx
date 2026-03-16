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
  FileCheck, AlertCircle, Send, Eye, ExternalLink, Info, X
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

const STATUS_CONFIG: Record<string, { label: string; cls: string; border: string; icon: any }> = {
  pendente:  { label: "Pendente",      cls: "bg-gray-100 text-gray-600",                              border: "border-gray-100 dark:border-gray-700",       icon: Clock },
  enviada:   { label: "Aguardando RH", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",       border: "border-amber-200 dark:border-amber-700",     icon: Send },
  aprovada:  { label: "Aprovada",      cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", border: "border-emerald-200 dark:border-emerald-700", icon: CheckCircle2 },
  devolvida: { label: "Devolvida",     cls: "bg-orange-50 text-orange-600 ring-1 ring-orange-200",    border: "border-orange-300 dark:border-orange-700",   icon: RotateCcw },
  recusada:  { label: "Recusada",      cls: "bg-red-50 text-red-600 ring-1 ring-red-200",             border: "border-red-200 dark:border-red-700",         icon: XCircle },
};

const ROW_LEFT_BORDER: Record<string, string> = {
  pendente:  "border-l-4 border-l-gray-200",
  enviada:   "border-l-4 border-l-amber-400",
  aprovada:  "border-l-4 border-l-emerald-400",
  devolvida: "border-l-4 border-l-orange-400",
  recusada:  "border-l-4 border-l-red-400",
};

type ActionType = "approve" | "return" | "reject";
type ActiveAction = { invId: string; type: ActionType } | null;

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
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
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl px-3 py-2 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Apenas eventos com empresa pagadora aparecem aqui.{" "}
            <Link href="/events">
              <a className="font-semibold underline underline-offset-2 hover:text-blue-800 transition-colors">Cadastre no evento</a>
            </Link>
            {" "}os campos de Empresa e CNPJ responsável pelo pagamento.
          </p>
        </div>

        {eventsWithCnpj.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-gray-300 dark:text-gray-500" />
            </div>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">Nenhum evento com empresa pagadora cadastrada</p>
            <p className="text-xs text-gray-400 mt-1.5 max-w-xs mx-auto">Para usar Notas Fiscais, cadastre a empresa responsável pelo pagamento no evento desejado.</p>
            <Link href="/events">
              <a className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Ir para Eventos
              </a>
            </Link>
          </div>
        ) : !selectedEventId ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-16 text-center">
            <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Selecione um evento para gerenciar as notas fiscais</p>
          </div>
        ) : (
          <>
            {selectedEvent?.paymentCompanyName && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-xl px-3 py-2 flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  <span className="font-semibold">Empresa pagadora:</span>{" "}
                  {selectedEvent.paymentCompanyName}
                  {selectedEvent.paymentCompanyCnpj && (
                    <span className="text-emerald-500 ml-1">· CNPJ {selectedEvent.paymentCompanyCnpj}</span>
                  )}
                </p>
              </div>
            )}

            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    activeTab === tab.id
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
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
function LancamentoTab({ approvedActuals, getInvoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast }: any) {
  if (approvedActuals.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-16 text-center">
        <AlertCircle className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-sm text-gray-400">Nenhum colaborador aprovado no Comparativo para este evento.</p>
        <p className="text-xs text-gray-300 mt-1">A aprovação no Comparativo é necessária para habilitar o lançamento de notas.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {approvedActuals.map((actual: any) => (
        <CollaboratorInvoiceCard
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
  );
}

// ── Collaborator Invoice Card (Lançamento) ────────────────────────────────────
function CollaboratorInvoiceCard({ actual, invoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast }: any) {
  const status = invoice?.status || "pendente";
  const [expanded, setExpanded] = useState(status === "devolvida");
  const [oc, setOc] = useState(invoice?.oc || "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const StatusIcon = STATUS_CONFIG[status]?.icon || Clock;
  const name = getName(actual.collaboratorId);
  const funcName = getFuncName(actual.functionId);
  const displayName = toTitleCase(name);

  const paymentText = (selectedEvent?.paymentCompanyName && actual.collaboratorId)
    ? `Este pagamento deve ser realizado de ${name} para ${selectedEvent.paymentCompanyName}${selectedEvent.paymentCompanyCnpj ? ` / CNPJ: ${selectedEvent.paymentCompanyCnpj}` : ""}.`
    : "";

  const submitMutation = useMutation({
    mutationFn: async () => {
      let attachmentUrl = invoice?.attachmentUrl || "";
      let attachmentName = invoice?.attachmentName || "";

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
      } else {
        return apiRequest("POST", "/api/invoices", {
          eventId: selectedEventId, collaboratorId: actual.collaboratorId,
          functionId: actual.functionId, budgetActualId: actual.id,
          oc, attachmentUrl, attachmentName, paymentText, status: "enviada",
        }).then(r => r.json());
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      setFile(null);
      setExpanded(false);
      toast({ title: "Nota enviada!", description: "Aguardando aprovação do RH." });
    },
    onError: (e: any) => {
      setUploading(false);
      toast({ title: "Erro", description: e.message || "Erro ao enviar nota", variant: "destructive" });
    },
  });

  const canEdit = !invoice || invoice.status === "devolvida" || invoice.status === "pendente";
  const borderCls = STATUS_CONFIG[status]?.border || "border-gray-100 dark:border-gray-700";

  const avatarCls =
    status === "aprovada" ? "bg-emerald-100 text-emerald-700" :
    status === "devolvida" ? "bg-orange-100 text-orange-600" :
    status === "enviada"   ? "bg-amber-100 text-amber-700" :
    "bg-gray-100 dark:bg-gray-700 text-gray-500";

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border transition-all ${borderCls}`}>
      {/* ── Collapsed header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${avatarCls}`}>
          {displayName.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: name · func · value */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{displayName}</span>
            <span className="text-gray-300 dark:text-gray-600 text-xs">·</span>
            <span className="text-xs text-gray-400">{funcName}</span>
            <span className="text-gray-300 dark:text-gray-600 text-xs">·</span>
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 tabular-nums">{formatCurrency(actual.totalValue)}</span>
          </div>
          {/* Row 2 (collapsed only): OC · Ver anexo · data pagamento */}
          {!expanded && invoice?.oc && (
            <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
              <span className="text-[10px] text-gray-400 font-mono">OC: {invoice.oc}</span>
              {invoice?.attachmentUrl && (
                <a
                  href={invoice.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-[10px] text-blue-500 flex items-center gap-0.5 hover:underline"
                >
                  <Paperclip className="w-2.5 h-2.5" /> Ver anexo
                </a>
              )}
              {status === "aprovada" && invoice?.paymentDate && (
                <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                  <Calendar className="w-2.5 h-2.5" /> {fmtDate(invoice.paymentDate)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Status badge — fixed min width to avoid layout shift */}
        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap ${STATUS_CONFIG[status]?.cls}`}>
          <StatusIcon className="w-3 h-3" />
          {STATUS_CONFIG[status]?.label}
        </span>

        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        }
      </div>

      {/* ── Expanded content ── */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-gray-50 dark:border-gray-700/60">

          {status === "devolvida" && invoice?.returnComment && (
            <div className="mt-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <RotateCcw className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-orange-600 mb-0.5 uppercase tracking-wide">Devolvida para ajuste</p>
                <p className="text-xs text-orange-700 dark:text-orange-300">{invoice.returnComment}</p>
              </div>
            </div>
          )}

          {status === "recusada" && invoice?.returnComment && (
            <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-red-600 mb-0.5 uppercase tracking-wide">Nota recusada</p>
                <p className="text-xs text-red-700 dark:text-red-300">{invoice.returnComment}</p>
              </div>
            </div>
          )}

          {/* Read-only info (enviada / aprovada / recusada) */}
          {!canEdit && (
            <div className="mt-3 flex items-center gap-5 flex-wrap">
              {invoice?.oc && (
                <div>
                  <p className="text-[10px] text-gray-400 font-medium mb-0.5">OC</p>
                  <p className="text-xs font-mono text-gray-700 dark:text-gray-200">{invoice.oc}</p>
                </div>
              )}
              {invoice?.attachmentUrl && (
                <div>
                  <p className="text-[10px] text-gray-400 font-medium mb-0.5">Nota em anexo</p>
                  <a
                    href={invoice.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" /> Ver anexo <Eye className="w-3 h-3" />
                  </a>
                </div>
              )}
              {status === "aprovada" && invoice?.paymentDate && (
                <div>
                  <p className="text-[10px] text-gray-400 font-medium mb-0.5">Pagamento previsto</p>
                  <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {fmtDate(invoice.paymentDate)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Edit form */}
          {canEdit && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                    OC <span className="text-red-400">*</span>
                  </label>
                  <Input
                    value={oc}
                    onChange={e => setOc(e.target.value)}
                    placeholder="Ex.: OC-2024-0123"
                    className="h-8 text-xs rounded-lg border-gray-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                    Nota em anexo <span className="text-red-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full h-8 flex items-center gap-2 px-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-500 hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-900/10 transition-all"
                  >
                    {file ? (
                      <><FileCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" /><span className="truncate text-emerald-600 font-medium">{file.name}</span></>
                    ) : invoice?.attachmentUrl ? (
                      <><Paperclip className="w-3.5 h-3.5 shrink-0" /><span className="truncate">Substituir nota</span></>
                    ) : (
                      <><Upload className="w-3.5 h-3.5 shrink-0" /><span>Selecionar arquivo</span></>
                    )}
                  </button>
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                  {invoice?.attachmentUrl && !file && (
                    <a
                      href={invoice.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-blue-500 hover:underline"
                    >
                      <Eye className="w-2.5 h-2.5" /> Ver nota atual
                    </a>
                  )}
                </div>
              </div>

              {paymentText && (
                <div className="bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2 flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 italic leading-relaxed">{paymentText}</p>
                </div>
              )}

              <div className="flex justify-end pt-0.5">
                <Button
                  size="sm"
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-5 h-8 text-xs shadow-sm"
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending || uploading}
                >
                  <Send className="w-3 h-3 mr-1.5" />
                  {submitMutation.isPending || uploading ? "Enviando..." : status === "devolvida" ? "Reenviar nota" : "Enviar nota"}
                </Button>
              </div>
            </div>
          )}

          {status === "aprovada" && (
            <div className="mt-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-lg px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                Nota aprovada{invoice?.paymentDate && ` · Pagamento previsto em ${fmtDate(invoice.paymentDate)}`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Aprovação Tab ─────────────────────────────────────────────────────────────
function AprovacaoTab({ invoices, getName, getFuncName, budgetActuals, selectedEventId, qc, toast }: any) {
  const [active, setActive] = useState<ActiveAction>(null);
  const [paymentDate, setPaymentDate] = useState("");
  const [comment, setComment] = useState("");

  function openAction(inv: any, type: ActionType) {
    if (active?.invId === inv.id && active.type === type) {
      setActive(null);
    } else {
      setActive({ invId: inv.id, type });
      setPaymentDate("");
      setComment("");
    }
  }
  function closeAction() { setActive(null); }

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/approve`, { paymentDate }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      closeAction();
      toast({ title: "Nota aprovada!", description: "Colaborador notificado." });
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
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-16 text-center">
        <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-sm text-gray-400">Nenhuma nota enviada ainda para este evento.</p>
      </div>
    );
  }

  const getActual = (id: string) => budgetActuals.find((a: any) => a.id === id);

  const STATUS_DOT: Record<string, string> = {
    enviada:   "bg-amber-400",
    aprovada:  "bg-emerald-500",
    devolvida: "bg-orange-400",
    recusada:  "bg-red-500",
    pendente:  "bg-gray-300",
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      {/* Legend */}
      <div className="flex items-center justify-end gap-1 px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-1.5">
          {[
            { color: "bg-amber-400",   label: "Aguardando" },
            { color: "bg-emerald-500", label: "Aprovada" },
            { color: "bg-orange-400",  label: "Devolvida" },
            { color: "bg-red-500",     label: "Recusada" },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <table className="w-full" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "250px" }} />   {/* Colaborador */}
            <col style={{ width: "150px" }} />   {/* Função */}
            <col style={{ width: "120px" }} />   {/* Valor */}
            <col style={{ width: "130px" }} />   {/* OC */}
            <col style={{ width: "130px" }} />   {/* Nota */}
            <col />                              {/* Ações — toma o restante */}
          </colgroup>
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Colaborador</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Função</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">OC</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Nota</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv: any) => {
              const actual = getActual(inv.budgetActualId);
              const name = getName(inv.collaboratorId);
              const isActiveRow = active?.invId === inv.id;
              const initial = name && name !== "—" ? name.charAt(0).toUpperCase() : "?";
              const dotCls = STATUS_DOT[inv.status] || "bg-gray-300";

              const avatarCls =
                inv.status === "aprovada"  ? "bg-emerald-100 text-emerald-700" :
                inv.status === "enviada"   ? "bg-amber-100 text-amber-700" :
                inv.status === "devolvida" ? "bg-orange-100 text-orange-600" :
                inv.status === "recusada"  ? "bg-red-100 text-red-600" :
                "bg-gray-100 dark:bg-gray-700 text-gray-500";

              const approvedDate = inv.status === "aprovada" && inv.paymentDate
                ? `Aprovada · Pgto ${fmtDate(inv.paymentDate)}`
                : STATUS_CONFIG[inv.status]?.label;

              return (
                <>
                  <tr
                    key={inv.id}
                    className={`border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-900/30 transition-colors ${isActiveRow ? "bg-gray-50 dark:bg-gray-900/20" : ""}`}
                  >
                    {/* Colaborador — bolinha de status + avatar + nome */}
                    <td className="px-4 py-4 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotCls}`}
                          title={approvedDate}
                        />
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${avatarCls}`}>
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate block">
                            {toTitleCase(name)}
                          </span>
                          {inv.status === "aprovada" && inv.paymentDate && (
                            <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                              <Calendar className="w-2.5 h-2.5 shrink-0" /> {fmtDate(inv.paymentDate)}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Função */}
                    <td className="px-4 py-4 overflow-hidden">
                      <span className="text-xs text-gray-500 truncate block">{getFuncName(inv.functionId)}</span>
                    </td>

                    {/* Valor */}
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm font-semibold text-violet-600 dark:text-violet-400 tabular-nums whitespace-nowrap">
                        {actual ? formatCurrency(actual.totalValue) : "—"}
                      </span>
                    </td>

                    {/* OC */}
                    <td className="px-4 py-4 overflow-hidden">
                      <span className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate block">
                        {inv.oc || "—"}
                      </span>
                    </td>

                    {/* Nota */}
                    <td className="px-4 py-4">
                      {inv.attachmentUrl ? (
                        <a
                          href={inv.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <FileText className="w-3.5 h-3.5" /> Ver nota
                        </a>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Ações — ícone + texto curto */}
                    <td className="px-4 py-4">
                      {inv.status === "enviada" && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openAction(inv, "approve")}
                            title="Aprovar nota"
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                              isActiveRow && active?.type === "approve"
                                ? "bg-emerald-600 text-white"
                                : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar
                          </button>
                          <button
                            onClick={() => openAction(inv, "return")}
                            title="Devolver para ajuste"
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                              isActiveRow && active?.type === "return"
                                ? "bg-orange-500 text-white"
                                : "text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                            }`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Devolver
                          </button>
                          <button
                            onClick={() => openAction(inv, "reject")}
                            title="Recusar nota"
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                              isActiveRow && active?.type === "reject"
                                ? "bg-red-500 text-white"
                                : "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                            }`}
                          >
                            <XCircle className="w-3.5 h-3.5" /> Recusar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Inline action panel */}
                  {isActiveRow && active && (
                    <tr key={`${inv.id}-action`} className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                      <td colSpan={6} className="px-5 py-3">
                        {active.type === "approve" && (
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar aprovação
                            </span>
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                                Data de pagamento <span className="text-red-400">*</span>
                              </label>
                              <div className="relative">
                                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                                <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="pl-7 h-8 text-xs rounded-lg border-gray-200 w-40" autoFocus />
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-auto">
                              <button onClick={closeAction} className="h-8 px-3 text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1">
                                <X className="w-3 h-3" /> Cancelar
                              </button>
                              <button
                                onClick={() => approveMutation.mutate(inv.id)}
                                disabled={!paymentDate || approveMutation.isPending}
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
                              <Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Explique o que precisa ser corrigido (opcional)..." className="text-xs rounded-lg border-gray-200 resize-none flex-1" autoFocus />
                              <div className="flex items-center gap-2 shrink-0">
                                <button onClick={closeAction} className="h-8 px-3 text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1">
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
                              <Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Motivo da recusa (opcional)..." className="text-xs rounded-lg border-gray-200 resize-none flex-1" autoFocus />
                              <div className="flex items-center gap-2 shrink-0">
                                <button onClick={closeAction} className="h-8 px-3 text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1">
                                  <X className="w-3 h-3" /> Cancelar
                                </button>
                                <button onClick={() => rejectMutation.mutate(inv.id)} disabled={rejectMutation.isPending} className="h-8 px-4 text-xs font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors">
                                  {rejectMutation.isPending ? "Recusando..." : "Confirmar recusa"}
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
  );
}
