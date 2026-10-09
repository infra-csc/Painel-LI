// Extraído de invoices.tsx em 25/09 (modularização): a nota fiscal de um item
// do Realizado na aba Lançamento. Estado do formulário e a mutation de envio
// vivem em `useSubmitInvoice`; aqui só a apresentação. `React.memo` porque é
// item de lista — os resolvedores vêm memoizados do hook de dados.
//
// 08/10 (redesenho): era um cartão alto (nome e valor em cima, formulário com
// rótulos embaixo, ~150px) — cabiam três por tela e os valores não ficavam um
// embaixo do outro. Agora é uma LINHA de planilha: colaborador · valor ·
// situação · OC · nota · ação · histórico, nas mesmas colunas do cabeçalho da
// lista (`.nf-grade` no index.css). O formulário mora nas próprias células (OC
// e anexo onde a OC e a nota aparecem depois de enviadas), o motivo da
// devolução/recusa e o histórico abrem numa faixa logo abaixo. Em largura útil
// estreita a MESMA árvore vira cartão por CSS (`.nf-cartoes`): nenhum dado é
// renderizado de outro jeito, então nada se perde entre os dois modos.
//
// Nenhum campo saiu: nome, função, sinal de devolução, valor, situação, OC
// (campo ou texto), anexo (anexar, substituir, remover, ver atual, ver nota),
// enviar/reenviar, histórico, motivo da devolução, recusa definitiva e as
// datas de check-in e de pagamento.
import { memo, useState } from "react";
import {
  FileText, Upload, RotateCcw, Clock, ChevronDown,
  Paperclip, FileCheck, Send, Eye, X, Ban, Loader2,
} from "lucide-react";
import type { BudgetActual, Event, Invoice } from "@shared/schema";
import { toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RequiredMark } from "@/components/forms/required-mark";
import { MensagemDeErro } from "@/components/forms/mensagem-de-erro";
import { campoComErro } from "@/lib/campo-com-erro";
import { fmtDate, formatCurrency, haDias } from "./invoice-format";
import { getEffectiveStatus, getStatusCfg, PILULA } from "./invoice-status";
import { buildHistory, daysSince, HistoryPanel } from "./invoice-history";
import { useSubmitInvoice } from "./use-invoice-actions";
import { useAcabouDeMudar } from "./use-acabou-de-mudar";
import type { AbaBaseProps } from "./types";

// ── Invoice Card (linha da aba Lançamento) ───────────────────────────────────
export interface InvoiceCardProps extends Pick<AbaBaseProps, "getName" | "getFuncName" | "selectedEventId" | "qc" | "toast"> {
  actual: BudgetActual;
  invoice: Invoice | undefined;
  selectedEvent: Event | undefined;
  /** Linha pedida pela URL (`?actual=`): acende por alguns segundos. */
  destacado?: boolean;
}

/** Campo de texto da linha: 32px, a mesma borda/foco da busca das telas irmãs. */
const CAMPO =
  "pas-alvo w-full h-8 px-2.5 rounded-lg border border-border bg-card text-sm text-foreground font-mono tracking-tight outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-sans placeholder:text-muted-foreground hover:border-slate-300 focus:border-primary focus:ring-[3px] focus:ring-primary/12 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15";

/** Link "Ver nota" das linhas já enviadas. */
function VerNota({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="pas-alvo inline-flex items-center gap-1.5 h-7 px-2 -ml-2 rounded-md text-xs font-medium text-primary hover:bg-brand-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Ver nota
    </a>
  );
}

export const InvoiceCard = memo(function InvoiceCard({ actual, invoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast, destacado }: InvoiceCardProps) {
  const effStatus = getEffectiveStatus(invoice);
  const cfg = getStatusCfg(effStatus);
  const acesa = useAcabouDeMudar(effStatus);

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

  const temAnexoAtual = !!invoice?.attachmentUrl && !clearedAttachment;
  const enviando = submitMutation.isPending || uploading;
  /** OC e anexo preenchidos: o botão da linha ganha peso (antes disso, contorno). */
  const pronto = !!oc.trim() && (!!file || temAnexoAtual);

  return (
    <div
      role="listitem"
      data-actual-id={actual.id}
      className={cn(
        "nf-linha border-b border-border last:border-b-0 border-l-[3px]",
        historyOpen ? "border-l-primary" : cfg.borderCls,
        destacado && "nf-alvo",
        acesa && "nf-acesa",
      )}
      data-testid={`nf-linha-${actual.id}`}
    >
      <div className="nf-grade">
        {/* Colaborador + função (+ sinal de devolução anterior) */}
        <div data-col="colab" className="nf-cel flex items-center gap-2.5 min-w-0">
          <span aria-hidden="true" className={`w-8 h-8 rounded-full inline-flex items-center justify-center text-xs font-semibold shrink-0 ${cfg.avatarCls}`}>
            {initial}
          </span>
          <div className="min-w-0">
            <p className="m-0 text-sm font-medium leading-5 text-foreground" title={displayName}>{displayName}</p>
            <p className="m-0 flex items-center gap-1 text-2xs leading-4 text-muted-foreground min-w-0">
              <span className="truncate">{funcName}</span>
              {hasReturn && (
                <span title="Houve devolução" className="inline-flex items-center text-warning-strong shrink-0">
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span className="sr-only">Houve devolução</span>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Valor do Realizado */}
        <div data-col="valor" className="nf-cel text-right">
          <span className="sr-only">Valor: </span>
          <span className="text-sm font-semibold tabular-nums text-foreground whitespace-nowrap">{formatCurrency(actual.totalValue)}</span>
        </div>

        {/* Situação + o que ela quer dizer agora */}
        <div data-col="sit" className="nf-cel min-w-0">
          <span className={`${PILULA} ${cfg.pill}`}>{cfg.label}</span>
          {effStatus === "pendente" && <p className="nf-sub">falta enviar a nota</p>}
          {effStatus === "enviada" && invoice && <p className="nf-sub tabular-nums">enviada {haDias(daysSince(invoice))}</p>}
          {effStatus === "devolvida" && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              aria-expanded={expanded}
              aria-label={expanded ? "Recolher motivo da devolução" : "Ver motivo da devolução"}
              className="pas-alvo mt-0.5 flex w-fit items-center gap-0.5 h-5 -ml-1 px-1 rounded text-2xs font-medium text-warning hover:bg-warning-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? "ocultar motivo" : "ver motivo"}
              <ChevronDown className={`w-3 h-3 transition-transform duration-150 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          )}
          {effStatus === "recusada" && <p className="nf-sub text-danger">decisão definitiva</p>}
          {effStatus === "checkin-pendente" && <p className="nf-sub">aprovada, falta o check-in</p>}
          {effStatus === "checkin-realizado" && (
            <>
              {invoice?.paymentDate && (
                <p className="nf-sub font-medium text-success tabular-nums">Pgto: {fmtDate(invoice.paymentDate)}</p>
              )}
              {invoice?.checkinAt && <p className="nf-sub tabular-nums">check-in em {fmtDate(invoice.checkinAt)}</p>}
            </>
          )}
        </div>

        {/* OC: campo enquanto dá para enviar; depois, o número enviado */}
        <div data-col="oc" className="nf-cel min-w-0" data-rotulo={canEdit ? undefined : "Número OC"}>
          {canEdit ? (
            <>
              <label htmlFor={`nf-oc-${actual.id}`} className="nf-rotulo">
                Número OC<RequiredMark />
              </label>
              <input
                id={`nf-oc-${actual.id}`}
                value={oc}
                aria-required="true"
                {...campoComErro(`nf-oc-${actual.id}`, erros.oc)}
                onChange={e => { setOc(e.target.value); if (erros.oc) setErros(p => ({ ...p, oc: undefined })); }}
                onKeyDown={e => { if (e.key === "Enter" && !enviando) { e.preventDefault(); submitMutation.mutate(); } }}
                placeholder="OC-0000"
                autoComplete="off"
                className={CAMPO}
              />
              <MensagemDeErro id={`nf-oc-${actual.id}`} erro={erros.oc} />
            </>
          ) : invoice?.oc ? (
            <span className="font-mono text-xs font-semibold text-slate-700 truncate block" title={`OC ${invoice.oc}`}>
              <span className="sr-only">OC </span>{invoice.oc}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>

        {/* Nota: anexar/substituir enquanto dá para enviar; depois, "Ver nota" */}
        <div data-col="nota" className="nf-cel min-w-0" data-rotulo={canEdit ? undefined : "Nota fiscal"}>
          {canEdit ? (
            <>
              <label htmlFor={`nf-file-${actual.id}`} className="nf-rotulo">
                Nota fiscal<RequiredMark />
              </label>
              <div className="flex items-center gap-1 min-w-0">
                <button
                  type="button"
                  id={`nf-file-btn-${actual.id}`}
                  {...campoComErro(`nf-file-btn-${actual.id}`, erros.anexo)}
                  onClick={() => fileRef.current?.click()}
                  title={file ? file.name : temAnexoAtual ? (invoice?.attachmentName || "Substituir nota") : "PDF, JPG ou PNG"}
                  className={cn(
                    "pas-alvo flex-1 min-w-0 h-8 inline-flex items-center gap-1.5 px-2.5 rounded-lg border text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:border-primary",
                    file
                      ? "border-success/40 bg-success-soft/60 text-success"
                      : erros.anexo
                      ? "border-dashed border-danger text-danger hover:bg-danger-soft/50"
                      : "border-dashed border-slate-300 text-slate-600 hover:border-primary/50 hover:bg-brand-soft/50 hover:text-primary",
                  )}
                >
                  {file ? (
                    <><FileCheck className="nf-pop w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span className="truncate font-medium">{file.name}</span></>
                  ) : temAnexoAtual ? (
                    <><Paperclip className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span className="truncate">Substituir nota</span></>
                  ) : (
                    <><Upload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span className="truncate">Anexar nota</span></>
                  )}
                </button>
                {(file || temAnexoAtual) && (
                  <button
                    type="button"
                    onClick={removeAttachment}
                    aria-label="Remover anexo"
                    title="Remover anexo"
                    className="pas-alvo w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-danger hover:bg-danger-soft transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <input ref={fileRef} id={`nf-file-${actual.id}`} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { setFile(e.target.files?.[0] || null); if (erros.anexo) setErros(p => ({ ...p, anexo: undefined })); }} />
              {/* 28/09: o botão já apontava aria-describedby para este id; a mensagem só existia no toast. */}
              <MensagemDeErro id={`nf-file-btn-${actual.id}`} erro={erros.anexo} />
              {invoice?.attachmentUrl && !file && !clearedAttachment && (
                <a href={invoice.attachmentUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-2xs font-medium text-primary hover:underline">
                  <Eye className="w-3 h-3" aria-hidden="true" /> Ver atual
                </a>
              )}
            </>
          ) : invoice?.attachmentUrl ? (
            <VerNota url={invoice.attachmentUrl} />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>

        {/* No cartão, a regra da OC fica embaixo dos dois campos (na planilha, no cabeçalho). */}
        {canEdit && <p data-col="dica" className="m-0 text-2xs text-muted-foreground">OCs repetidas no evento devem usar o mesmo anexo.</p>}

        {/* Ação da linha: enviar (ou reenviar) */}
        <div data-col="acao" className="nf-cel">
          {canEdit && (
            <button
              type="button"
              onClick={() => submitMutation.mutate()}
              disabled={enviando}
              aria-busy={enviando || undefined}
              className={cn(
                "pas-alvo w-full h-8 inline-flex items-center justify-center gap-1.5 px-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-wait",
                pronto || enviando
                  ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                  : "border border-primary/30 bg-card text-primary hover:bg-brand-soft",
              )}
            >
              {enviando
                ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                : <Send className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
              {enviando ? "Enviando…" : effStatus === "devolvida" ? "Reenviar" : "Enviar nota"}
            </button>
          )}
        </div>

        {/* Histórico (só quem já tem nota) */}
        <div data-col="hist" className="nf-cel flex justify-end">
          {invoice && history.length > 0 && (
            <button
              type="button"
              onClick={() => setHistoryOpen(o => !o)}
              title={historyOpen ? "Fechar histórico" : `Histórico: ${history.length} ${history.length === 1 ? "evento" : "eventos"}`}
              aria-expanded={historyOpen}
              aria-label={historyOpen ? "Fechar histórico" : `Abrir histórico (${history.length} ${history.length === 1 ? "evento" : "eventos"})`}
              className={cn(
                "pas-alvo h-8 min-w-8 px-1.5 inline-flex items-center justify-center gap-1 rounded-lg text-2xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                historyOpen ? "bg-brand-soft text-primary" : "text-muted-foreground hover:bg-brand-soft hover:text-primary",
              )}
            >
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              {history.length}
            </button>
          )}
        </div>
      </div>

      {/* Devolvida — o motivo, aberto de saída (dá para recolher) */}
      {expanded && effStatus === "devolvida" && (
        <div className="nf-faixa nf-abre flex items-start gap-2 bg-warning-soft/70 border-t border-warning/20">
          <RotateCcw className="w-3.5 h-3.5 text-warning-strong mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="m-0 text-2xs font-semibold uppercase tracking-[0.06em] text-warning">Devolvida para ajuste</p>
            <p className="m-0 mt-0.5 text-xs leading-relaxed text-warning">{invoice?.returnComment || "Sem comentário."}</p>
          </div>
        </div>
      )}

      {/* Recusada — estado terminal, sem reenvio */}
      {effStatus === "recusada" && (
        <div className="nf-faixa flex items-start gap-2 bg-danger-soft/70 border-t border-danger/20">
          <Ban className="w-3.5 h-3.5 text-danger mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="m-0 text-2xs font-semibold uppercase tracking-[0.06em] text-danger">NF recusada — decisão definitiva, sem reenvio</p>
            <p className="m-0 mt-0.5 text-xs leading-relaxed text-danger">{invoice?.returnComment || "Sem motivo informado."}</p>
          </div>
        </div>
      )}

      {/* Histórico */}
      {historyOpen && history.length > 0 && (
        <div className="nf-faixa nf-abre bg-surface-muted border-t border-border">
          <HistoryPanel events={history} />
        </div>
      )}
    </div>
  );
});
