// Extraído de invoices.tsx em 25/09 (modularização): cartão de uma nota
// fiscal na aba Lançamento (visão do colaborador). Estado do formulário e a
// mutation de envio vivem em `useSubmitInvoice`; aqui só a apresentação.
// `React.memo` porque é item de lista — os resolvedores vêm memoizados do
// hook de dados.
import { memo, useState } from "react";
import {
  FileText, Upload, CheckCircle2, RotateCcw, Clock,
  ChevronDown, ChevronUp, Paperclip,
  FileCheck, Send, Eye, X, Ban,
} from "lucide-react";
import type { BudgetActual, Event, Invoice } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toTitleCase } from "@/lib/format";
import { RequiredMark } from "@/components/forms/required-mark";
import { MensagemDeErro } from "@/components/forms/mensagem-de-erro";
import { campoComErro } from "@/lib/campo-com-erro";
import { fmtDate, formatCurrency } from "./invoice-format";
import { getEffectiveStatus, getStatusCfg } from "./invoice-status";
import { buildHistory, HistoryPanel } from "./invoice-history";
import { useSubmitInvoice } from "./use-invoice-actions";
import type { AbaBaseProps } from "./types";

// ── Invoice Card (collaborator view) ─────────────────────────────────────────
export interface InvoiceCardProps extends Pick<AbaBaseProps, "getName" | "getFuncName" | "selectedEventId" | "qc" | "toast"> {
  actual: BudgetActual;
  invoice: Invoice | undefined;
  selectedEvent: Event | undefined;
}

export const InvoiceCard = memo(function InvoiceCard({ actual, invoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast }: InvoiceCardProps) {
  const effStatus = getEffectiveStatus(invoice);
  const cfg = getStatusCfg(effStatus);

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

  const {
    oc, setOc, erros, setErros, file, setFile, uploading, clearedAttachment, fileRef, removeAttachment, submitMutation,
  } = useSubmitInvoice({ actual, invoice, selectedEventId, qc, toast, paymentText });

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
});
