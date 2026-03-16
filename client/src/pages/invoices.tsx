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
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText, Upload, CheckCircle2, RotateCcw, XCircle, Clock,
  ChevronDown, ChevronUp, Paperclip, Calendar, Building2,
  FileCheck, AlertCircle, Send, Eye, ExternalLink, Info
} from "lucide-react";
import { Link } from "wouter";
import type { Event, Invoice } from "@shared/schema";

// ── helpers ────────────────────────────────────────────────────────────────
function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v / 100);
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
const STATUS_CONFIG: Record<string, { label: string; cls: string; border: string; icon: any }> = {
  pendente:  { label: "Pendente",      cls: "bg-gray-100 text-gray-500",                                border: "border-gray-100 dark:border-gray-700",   icon: Clock },
  enviada:   { label: "Aguardando RH", cls: "bg-amber-50 text-amber-600 ring-1 ring-amber-200",         border: "border-amber-200 dark:border-amber-700", icon: Send },
  aprovada:  { label: "Aprovada",      cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",   border: "border-emerald-200 dark:border-emerald-700", icon: CheckCircle2 },
  devolvida: { label: "Devolvida",     cls: "bg-orange-50 text-orange-600 ring-1 ring-orange-200",      border: "border-orange-300 dark:border-orange-700", icon: RotateCcw },
  recusada:  { label: "Recusada",      cls: "bg-red-50 text-red-600 ring-1 ring-red-200",               border: "border-red-200 dark:border-red-700",     icon: XCircle },
};

// ── main page ────────────────────────────────────────────────────────────────
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
      <div className="max-w-5xl mx-auto space-y-4">
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

        {/* Banner informativo */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl px-3 py-2 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Apenas eventos com empresa pagadora aparecem aqui.{" "}
            <Link href="/events">
              <a className="font-semibold underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-200 transition-colors">
                Cadastre no evento
              </a>
            </Link>
            {" "}os campos de Empresa e CNPJ responsável pelo pagamento.
          </p>
        </div>

        {eventsWithCnpj.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-gray-300 dark:text-gray-500" />
            </div>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              Nenhum evento com empresa pagadora cadastrada
            </p>
            <p className="text-xs text-gray-400 mt-1.5 max-w-xs mx-auto">
              Para usar Notas Fiscais, cadastre a empresa responsável pelo pagamento no evento desejado.
            </p>
            <Link href="/events">
              <a className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors">
                <ExternalLink className="w-3.5 h-3.5" />
                Ir para Eventos
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
            {/* Empresa pagadora — compact one-liner */}
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

            {/* Tabs */}
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

// ── Lançamento Tab ─────────────────────────────────────────────────────────
function LancamentoTab({
  approvedActuals, getInvoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast
}: any) {
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
      {approvedActuals.map((actual: any) => {
        const invoice = getInvoice(actual.id);
        return (
          <CollaboratorInvoiceCard
            key={actual.id}
            actual={actual}
            invoice={invoice}
            getName={getName}
            getFuncName={getFuncName}
            selectedEvent={selectedEvent}
            selectedEventId={selectedEventId}
            qc={qc}
            toast={toast}
          />
        );
      })}
    </div>
  );
}

// ── Collaborator Invoice Card ──────────────────────────────────────────────
function CollaboratorInvoiceCard({ actual, invoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast }: any) {
  const status = invoice?.status || "pendente";
  // Only auto-expand when devolvida (needs attention); everything else starts collapsed
  const [expanded, setExpanded] = useState(status === "devolvida");
  const [oc, setOc] = useState(invoice?.oc || "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const StatusIcon = STATUS_CONFIG[status]?.icon || Clock;
  const name = getName(actual.collaboratorId);
  const funcName = getFuncName(actual.functionId);

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
          attachmentName = uploaded[0].name || file.name;
        }
        setUploading(false);
      }

      if (!oc.trim()) throw new Error("OC obrigatória");
      if (!attachmentUrl) throw new Error("Nota em anexo obrigatória");

      if (invoice) {
        return apiRequest("PATCH", `/api/invoices/${invoice.id}`, {
          oc, attachmentUrl, attachmentName, paymentText, status: "enviada",
        }).then(r => r.json());
      } else {
        return apiRequest("POST", "/api/invoices", {
          eventId: selectedEventId,
          collaboratorId: actual.collaboratorId,
          functionId: actual.functionId,
          budgetActualId: actual.id,
          oc, attachmentUrl, attachmentName, paymentText,
          status: "enviada",
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

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border transition-all ${borderCls}`}>
      {/* ── Compact Header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
          status === "aprovada" ? "bg-emerald-100 text-emerald-700" :
          status === "devolvida" ? "bg-orange-100 text-orange-600" :
          status === "enviada" ? "bg-amber-100 text-amber-700" :
          "bg-gray-100 dark:bg-gray-700 text-gray-500"
        }`}>
          {name.charAt(0)}
        </div>

        {/* Name · func · value */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{name}</span>
            <span className="text-gray-300 dark:text-gray-600 text-xs">·</span>
            <span className="text-xs text-gray-400 truncate">{funcName}</span>
            <span className="text-gray-300 dark:text-gray-600 text-xs">·</span>
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 tabular-nums">{formatCurrency(actual.totalValue)}</span>
          </div>
          {/* Sub-info when collapsed: OC + file */}
          {!expanded && invoice?.oc && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-gray-400 font-mono">OC: {invoice.oc}</span>
              {invoice?.attachmentUrl && (
                <span className="text-[10px] text-blue-500 flex items-center gap-0.5">
                  <Paperclip className="w-2.5 h-2.5" />
                  {invoice.attachmentName || "Nota em anexo"}
                </span>
              )}
              {status === "aprovada" && invoice?.paymentDate && (
                <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                  <Calendar className="w-2.5 h-2.5" />
                  {fmtDate(invoice.paymentDate)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Status badge */}
        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_CONFIG[status]?.cls}`}>
          <StatusIcon className="w-3 h-3" />
          {STATUS_CONFIG[status]?.label}
        </span>

        {/* Expand arrow */}
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        }
      </div>

      {/* ── Expanded Content ── */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-gray-50 dark:border-gray-700/60">

          {/* Return comment (devolvida) */}
          {status === "devolvida" && invoice?.returnComment && (
            <div className="mt-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <RotateCcw className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-orange-600 mb-0.5 uppercase tracking-wide">Devolvida para ajuste</p>
                <p className="text-xs text-orange-700 dark:text-orange-300">{invoice.returnComment}</p>
              </div>
            </div>
          )}

          {/* Recusada comment */}
          {status === "recusada" && invoice?.returnComment && (
            <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-red-600 mb-0.5 uppercase tracking-wide">Nota recusada</p>
                <p className="text-xs text-red-700 dark:text-red-300">{invoice.returnComment}</p>
              </div>
            </div>
          )}

          {/* Read-only view (enviada / aprovada / recusada) */}
          {!canEdit && invoice?.attachmentUrl && (
            <div className="mt-3 flex items-center gap-4 flex-wrap">
              {invoice?.oc && (
                <div>
                  <p className="text-[10px] text-gray-400 font-medium mb-0.5">OC</p>
                  <p className="text-xs font-mono text-gray-700 dark:text-gray-200">{invoice.oc}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-gray-400 font-medium mb-0.5">Nota em anexo</p>
                <a
                  href={invoice.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                >
                  <Paperclip className="w-3 h-3" />
                  {invoice.attachmentName || "Ver nota"}
                  <Eye className="w-3 h-3" />
                </a>
              </div>
              {status === "aprovada" && invoice?.paymentDate && (
                <div>
                  <p className="text-[10px] text-gray-400 font-medium mb-0.5">Pagamento previsto</p>
                  <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {fmtDate(invoice.paymentDate)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Edit form */}
          {canEdit && (
            <div className="mt-3 space-y-3">
              {/* OC + Upload side by side */}
              <div className="grid grid-cols-2 gap-3">
                {/* OC */}
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

                {/* File upload — compact */}
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
                      <>
                        <FileCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate text-emerald-600 font-medium">{file.name}</span>
                      </>
                    ) : invoice?.attachmentUrl ? (
                      <>
                        <Paperclip className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{invoice.attachmentName || "Substituir arquivo"}</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 shrink-0" />
                        <span>Selecionar arquivo</span>
                      </>
                    )}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              {/* Payment text — compact box */}
              {paymentText && (
                <div className="bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2 flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 italic leading-relaxed">{paymentText}</p>
                </div>
              )}

              {/* Submit button — right-aligned, not full width */}
              <div className="flex justify-end pt-0.5">
                <Button
                  size="sm"
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-5 h-8 text-xs shadow-sm"
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending || uploading}
                >
                  <Send className="w-3 h-3 mr-1.5" />
                  {submitMutation.isPending || uploading
                    ? "Enviando..."
                    : status === "devolvida" ? "Reenviar nota" : "Enviar nota"}
                </Button>
              </div>
            </div>
          )}

          {/* Approved info banner */}
          {status === "aprovada" && (
            <div className="mt-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-lg px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                Nota aprovada
                {invoice?.paymentDate && ` · Pagamento previsto em ${fmtDate(invoice.paymentDate)}`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Aprovação Tab ──────────────────────────────────────────────────────────
function AprovacaoTab({ invoices, getName, getFuncName, budgetActuals, selectedEventId, qc, toast }: any) {
  const [approveModal, setApproveModal] = useState<any | null>(null);
  const [returnModal, setReturnModal] = useState<any | null>(null);
  const [rejectModal, setRejectModal] = useState<any | null>(null);
  const [paymentDate, setPaymentDate] = useState("");
  const [comment, setComment] = useState("");

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/approve`, { paymentDate }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      setApproveModal(null); setPaymentDate("");
      toast({ title: "Nota aprovada!", description: "Colaborador notificado." });
    },
    onError: () => toast({ title: "Erro", description: "Erro ao aprovar nota", variant: "destructive" }),
  });

  const returnMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/return`, { comment }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      setReturnModal(null); setComment("");
      toast({ title: "Nota devolvida", description: "Colaborador pode reenviar a nota corrigida." });
    },
    onError: () => toast({ title: "Erro", description: "Erro ao devolver nota", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/reject`, { comment }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      setRejectModal(null); setComment("");
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

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Colaborador</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Função</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Valor</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">OC</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Nota</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Ações</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv: any) => {
              const actual = getActual(inv.budgetActualId);
              const StatusIcon = STATUS_CONFIG[inv.status]?.icon || Clock;
              return (
                <tr key={inv.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{getName(inv.collaboratorId)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{getFuncName(inv.functionId)}</td>
                  <td className="px-4 py-3 text-right text-gray-800 dark:text-gray-200 tabular-nums">
                    {actual ? formatCurrency(actual.totalValue) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs font-mono">{inv.oc || "—"}</td>
                  <td className="px-4 py-3">
                    {inv.attachmentUrl ? (
                      <a href={inv.attachmentUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <Paperclip className="w-3 h-3" />
                        {inv.attachmentName || "Abrir"}
                      </a>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[inv.status]?.cls}`}>
                      <StatusIcon className="w-3 h-3" />
                      {STATUS_CONFIG[inv.status]?.label}
                    </span>
                    {inv.status === "aprovada" && inv.paymentDate && (
                      <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-0.5">
                        <Calendar className="w-2.5 h-2.5" />
                        {fmtDate(inv.paymentDate)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {inv.status === "enviada" && (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost"
                          className="h-7 px-2.5 text-[11px] text-emerald-600 hover:bg-emerald-50 rounded-lg"
                          onClick={() => { setApproveModal(inv); setPaymentDate(""); }}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="h-7 px-2.5 text-[11px] text-orange-500 hover:bg-orange-50 rounded-lg"
                          onClick={() => { setReturnModal(inv); setComment(""); }}>
                          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="h-7 px-2.5 text-[11px] text-red-500 hover:bg-red-50 rounded-lg"
                          onClick={() => { setRejectModal(inv); setComment(""); }}>
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Recusar
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Approve Modal */}
      <Dialog open={!!approveModal} onOpenChange={() => setApproveModal(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Aprovar nota fiscal
            </DialogTitle>
          </DialogHeader>
          {approveModal && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Aprovando nota de <strong>{getName(approveModal.collaboratorId)}</strong>.
              </p>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Data prevista de pagamento <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="pl-9 h-9 text-sm rounded-xl border-gray-200"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" className="rounded-xl" onClick={() => setApproveModal(null)}>Cancelar</Button>
                <Button
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => approveMutation.mutate(approveModal.id)}
                  disabled={!paymentDate || approveMutation.isPending}
                >
                  {approveMutation.isPending ? "Aprovando..." : "Confirmar aprovação"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Return Modal */}
      <Dialog open={!!returnModal} onOpenChange={() => setReturnModal(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RotateCcw className="w-4 h-4 text-orange-500" /> Devolver nota
            </DialogTitle>
          </DialogHeader>
          {returnModal && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Devolvendo nota de <strong>{getName(returnModal.collaboratorId)}</strong>. O colaborador poderá reenviar a nota corrigida.
              </p>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Comentário <span className="text-gray-400 font-normal">(opcional)</span></label>
                <Textarea
                  rows={3}
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Explique o que precisa ser corrigido..."
                  className="text-sm rounded-xl border-gray-200 resize-none"
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" className="rounded-xl" onClick={() => setReturnModal(null)}>Cancelar</Button>
                <Button
                  className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => returnMutation.mutate(returnModal.id)}
                  disabled={returnMutation.isPending}
                >
                  {returnMutation.isPending ? "Devolvendo..." : "Devolver"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={!!rejectModal} onOpenChange={() => setRejectModal(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <XCircle className="w-4 h-4 text-red-500" /> Recusar nota
            </DialogTitle>
          </DialogHeader>
          {rejectModal && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Tem certeza que deseja recusar a nota de <strong>{getName(rejectModal.collaboratorId)}</strong>?
              </p>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Motivo <span className="text-gray-400 font-normal">(opcional)</span></label>
                <Textarea
                  rows={3}
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Explique o motivo da recusa..."
                  className="text-sm rounded-xl border-gray-200 resize-none"
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" className="rounded-xl" onClick={() => setRejectModal(null)}>Cancelar</Button>
                <Button
                  variant="destructive"
                  className="rounded-xl"
                  onClick={() => rejectMutation.mutate(rejectModal.id)}
                  disabled={rejectMutation.isPending}
                >
                  {rejectMutation.isPending ? "Recusando..." : "Confirmar recusa"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
