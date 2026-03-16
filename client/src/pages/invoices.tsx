import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { isRhOrAdmin } from "@/lib/permissions";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
  FileCheck, AlertCircle, Send, Eye
} from "lucide-react";
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
const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: any }> = {
  pendente:  { label: "Pendente",          cls: "bg-gray-100 text-gray-500",   icon: Clock },
  enviada:   { label: "Aguardando RH",     cls: "bg-amber-50 text-amber-600 ring-1 ring-amber-200",  icon: Send },
  aprovada:  { label: "Aprovada",          cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", icon: CheckCircle2 },
  devolvida: { label: "Devolvida",         cls: "bg-orange-50 text-orange-600 ring-1 ring-orange-200", icon: RotateCcw },
  recusada:  { label: "Recusada",          cls: "bg-red-50 text-red-600 ring-1 ring-red-200", icon: XCircle },
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
  const selectedEvent = (activeEvents as any[]).find(e => e.id === selectedEventId);

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

  const getName = (id?: string | null) => (collaborators as any[]).find(c => c.id === id)?.name || "—";
  const getFuncName = (id?: string | null) => (functions as any[]).find(f => f.id === id)?.name || "—";

  // Budget actuals approved by RH → eligible for invoice
  const approvedActuals = (budgetActuals as any[]).filter(
    a => a.rhStatus === "aprovado" && !a.splitParentId
  );

  const getInvoice = (actualId: string) =>
    (invoices as any[]).find(inv => inv.budgetActualId === actualId);

  const tabs = [
    { id: "lancamento" as const, label: "Lançamento" },
    ...(canRH ? [{ id: "aprovacao" as const, label: "Aprovação RH" }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto space-y-5">
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
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="w-72 rounded-xl border-gray-200 text-sm">
              <SelectValue placeholder="Selecionar evento..." />
            </SelectTrigger>
            <SelectContent>
              {(activeEvents as any[]).map((ev: any) => (
                <SelectItem key={ev.id} value={ev.id}>{ev.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedEventId ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-16 text-center">
            <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Selecione um evento para gerenciar as notas fiscais</p>
          </div>
        ) : (
          <>
            {/* Empresa pagadora info */}
            {selectedEvent?.paymentCompanyName && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-xl px-4 py-3 flex items-center gap-3">
                <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="text-xs text-emerald-700 dark:text-emerald-300">
                  <span className="font-semibold">Empresa responsável pelo pagamento:</span>{" "}
                  {selectedEvent.paymentCompanyName}
                  {selectedEvent.paymentCompanyCnpj && (
                    <span className="text-emerald-500 ml-1">(CNPJ: {selectedEvent.paymentCompanyCnpj})</span>
                  )}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab.id
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {tab.label}
                  {tab.id === "lancamento" && approvedActuals.length > 0 && (
                    <span className="ml-2 bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full text-[10px]">
                      {approvedActuals.length}
                    </span>
                  )}
                  {tab.id === "aprovacao" && (
                    <span className="ml-2 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-[10px]">
                      {(invoices as any[]).filter(i => i.status === "enviada").length}
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
    <div className="space-y-3">
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
  const [expanded, setExpanded] = useState(!invoice || invoice.status === "devolvida");
  const [oc, setOc] = useState(invoice?.oc || "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const status = invoice?.status || "pendente";
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

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border transition-all ${
      status === "aprovada" ? "border-emerald-200" :
      status === "devolvida" ? "border-orange-200" :
      status === "recusada" ? "border-red-200" :
      status === "enviada" ? "border-amber-200" :
      "border-gray-100 dark:border-gray-700"
    }`}>
      {/* Card Header */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-gray-500">{name.charAt(0)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{name}</p>
          <p className="text-[10px] text-gray-400">{funcName} · {formatCurrency(actual.totalValue)}</p>
        </div>
        <Badge className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_CONFIG[status]?.cls}`}>
          <StatusIcon className="w-3 h-3 mr-1 inline" />
          {STATUS_CONFIG[status]?.label}
        </Badge>
        {status === "aprovada" && invoice?.paymentDate && (
          <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 shrink-0">
            <Calendar className="w-3 h-3" />
            Pagamento: {fmtDate(invoice.paymentDate)}
          </span>
        )}
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-gray-50 dark:border-gray-700">
          {/* Return comment */}
          {status === "devolvida" && invoice?.returnComment && (
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <RotateCcw className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-orange-600 mb-0.5">Devolvida para ajuste</p>
                <p className="text-xs text-orange-700">{invoice.returnComment}</p>
              </div>
            </div>
          )}
          {status === "recusada" && invoice?.returnComment && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-red-600 mb-0.5">Nota recusada</p>
                <p className="text-xs text-red-700">{invoice.returnComment}</p>
              </div>
            </div>
          )}

          {/* Existing attachment preview */}
          {invoice?.attachmentUrl && !canEdit && (
            <a
              href={invoice.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-blue-600 hover:underline"
            >
              <Paperclip className="w-3.5 h-3.5" />
              {invoice.attachmentName || "Ver nota em anexo"}
              <Eye className="w-3.5 h-3.5" />
            </a>
          )}

          {canEdit && (
            <div className="space-y-3 pt-1">
              {/* OC */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  OC (Ordem de Compra) <span className="text-red-400">*</span>
                </label>
                <Input
                  value={oc}
                  onChange={e => setOc(e.target.value)}
                  placeholder="Ex.: OC-2024-0123"
                  className="h-9 text-sm rounded-xl border-gray-200"
                />
              </div>

              {/* File upload */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Nota em anexo <span className="text-red-400">*</span>
                  <span className="text-gray-400 font-normal ml-1">(PDF ou imagem)</span>
                </label>
                <div
                  className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/40 transition-all"
                  onClick={() => fileRef.current?.click()}
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-xs text-emerald-600">
                      <FileCheck className="w-4 h-4" />
                      <span className="font-medium">{file.name}</span>
                    </div>
                  ) : invoice?.attachmentUrl ? (
                    <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                      <Paperclip className="w-4 h-4" />
                      <span>{invoice.attachmentName || "Arquivo anexado"} — clique para substituir</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <Upload className="w-5 h-5 text-gray-300" />
                      <p className="text-xs text-gray-400">Clique para selecionar arquivo</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
              </div>

              {/* Payment text preview */}
              {paymentText && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-gray-400 mb-1 font-medium">Texto gerado automaticamente na nota:</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 italic">{paymentText}</p>
                </div>
              )}

              <Button
                size="sm"
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white w-full shadow-sm"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending || uploading}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {submitMutation.isPending || uploading ? "Enviando..." : status === "devolvida" ? "Reenviar nota" : "Enviar nota"}
              </Button>
            </div>
          )}

          {/* Approved info */}
          {status === "aprovada" && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-emerald-700">Nota aprovada</p>
              {invoice?.paymentDate && (
                <p className="text-xs text-emerald-600">Data prevista de pagamento: <strong>{fmtDate(invoice.paymentDate)}</strong></p>
              )}
              {invoice?.oc && <p className="text-xs text-emerald-600">OC: <strong>{invoice.oc}</strong></p>}
              {invoice?.attachmentUrl && (
                <a href={invoice.attachmentUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-emerald-600 hover:underline mt-1">
                  <Paperclip className="w-3 h-3" /> Ver nota anexada
                </a>
              )}
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
