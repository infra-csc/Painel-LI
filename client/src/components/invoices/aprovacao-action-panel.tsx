// Extraído de invoices.tsx em 25/09 (modularização): painel inline que abre
// abaixo da linha na aba Aprovação RH — confirmar aprovação, devolver com
// motivo, recusar em definitivo ou fazer o check-in financeiro. O estado
// (motivo, data) e as mutations continuam na aba; aqui só a apresentação.
import { CheckCircle2, RotateCcw, X, CircleDot, Ban } from "lucide-react";
import type { Invoice } from "@shared/schema";
import { Textarea } from "@/components/ui/textarea";
import { RequiredMark } from "@/components/forms/required-mark";
import { MensagemDeErro } from "@/components/forms/mensagem-de-erro";
import { campoComErro } from "@/lib/campo-com-erro";
import type { StatusCfg } from "./invoice-status";
import type { AcaoNfMutation, AprovAction } from "./types";

export interface AprovacaoActionPanelProps {
  inv: Invoice;
  cfg: StatusCfg;
  type: AprovAction;
  comment: string;
  setComment: (v: string) => void;
  tocouMotivo: boolean;
  setTocouMotivo: (v: boolean) => void;
  checkinDate: string;
  setCheckinDate: (v: string) => void;
  closeAction: () => void;
  approveMutation: AcaoNfMutation;
  returnMutation: AcaoNfMutation;
  rejectMutation: AcaoNfMutation;
  checkinMutation: AcaoNfMutation;
}

export function AprovacaoActionPanel({
  inv, cfg, type, comment, setComment, tocouMotivo, setTocouMotivo, checkinDate, setCheckinDate, closeAction,
  approveMutation, returnMutation, rejectMutation, checkinMutation,
}: AprovacaoActionPanelProps) {
  return (
    <tr
      className={type === "approve" ? "" : "bg-surface-muted border-b border-border"}
      style={type === "approve" ? { borderLeft: `3px solid ${cfg.border}` } : {}}
    >
      <td
        colSpan={7}
        className={type === "approve" ? "bg-success-soft border-t border-t-success-strong py-2.5 px-4 rounded-b-lg" : "px-5 py-3"}
      >

        {/* ── Aprovar ── */}
        {type === "approve" && (
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
        {type === "return" && (
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
        {type === "reject" && (
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
        {type === "checkin" && (
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
  );
}
