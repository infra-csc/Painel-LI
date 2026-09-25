/**
 * Confirmação de envio para o Realizado — UNIFICADA (cards, individual e
 * planilha) — 25/09 (modularização). Extraída de budget-planned.tsx.
 */
import { Check, RefreshCw, Users } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency, type CalculatedBudget, type ConfirmSend } from "./types";

export interface ConfirmSendDialogProps {
  confirmSend: ConfirmSend | null;
  onClose: () => void;
  calculatedBudgets: CalculatedBudget[];
  sentToActual: Set<string>;
  isCardNotAttended: (b: CalculatedBudget) => boolean;
  getCollaboratorName: (id?: string | null) => string;
  getFunctionName: (id?: string | null) => string;
  isSending: boolean;
  onSendSingle: (b: CalculatedBudget) => void;
  onSendSelected: () => void;
}

export function ConfirmSendDialog(p: ConfirmSendDialogProps) {
  const { confirmSend, onClose, calculatedBudgets, sentToActual, isCardNotAttended, getCollaboratorName, getFunctionName, isSending } = p;
  return (
    <AlertDialog
      open={!!confirmSend}
      onOpenChange={v => {
        if (isSending) return;
        if (!v) onClose();
      }}
    >
      <AlertDialogContent className="max-w-sm rounded-xl">
        {confirmSend && (() => {
          // Mesmo filtro da mutation: ausente ("não participou") nem entra no
          // resumo/total do envio.
          const targets = calculatedBudgets.filter(b =>
            confirmSend.ids.includes(b.inclusion.id) && !sentToActual.has(b.inclusion.id) && !isCardNotAttended(b)
          );
          const single = confirmSend.source === "single" && targets.length === 1 ? targets[0] : null;
          const totalEnvio = targets.reduce((s, b) => s + b.totalFinal, 0);
          const anyEdited = targets.some(b => b.hasOverride);
          const doSend = () => {
            if (single) p.onSendSingle(single);
            else p.onSendSelected();
          };
          return (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base">Enviar para a prestação de contas?</AlertDialogTitle>
                <AlertDialogDescription className="text-xs">
                  {single
                    ? `${getCollaboratorName(single.inclusion.collaboratorId)} · ${getFunctionName(single.inclusion.functionId)}`
                    : `${targets.length} ${targets.length === 1 ? "colaborador selecionado" : "colaboradores selecionados"}`}
                </AlertDialogDescription>
              </AlertDialogHeader>

              {/* Resumo de custos */}
              <div className="w-full rounded-xl overflow-hidden border border-border">
                {single ? (
                  <>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-normal text-muted-foreground">Diárias</span>
                      <span className="text-xs font-medium text-slate-600">{formatCurrency(single.subtotalDiarias)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-t-border">
                      <span className="text-xs font-normal text-muted-foreground">Alimentação</span>
                      <span className="text-xs font-medium text-slate-600">{formatCurrency(single.almocoSemana + single.jantarSemana + single.almocoFds + single.jantarFds)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-t-border">
                      <span className="text-xs font-normal text-muted-foreground">Mobilidade</span>
                      <span className="text-xs font-medium text-slate-600">{formatCurrency(single.mobilidade)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                      <span className="text-xs font-normal text-muted-foreground">Colaboradores</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">{targets.length} {targets.length === 1 ? "pessoa" : "pessoas"}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-t-border bg-success-soft">
                  <span className="text-xs font-medium text-slate-600">Total a ser enviado</span>
                  <span className="text-base font-medium tabular-nums text-success">{formatCurrency(totalEnvio)}</span>
                </div>
              </div>

              {/* Copy consistente entre os três fluxos */}
              <p className="text-center text-xs font-normal text-muted-foreground leading-relaxed">
                {targets.length === 1 ? "O planejamento será enviado" : "Os planejamentos serão enviados"} para a prestação de contas (Realizado)
                {anyEdited ? " — os valores editados manualmente vão junto" : ""}. Esta ação não pode ser desfeita.
              </p>

              <AlertDialogFooter>
                <AlertDialogCancel disabled={isSending} className="rounded-xl text-sm">Voltar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isSending || targets.length === 0}
                  onClick={e => { e.preventDefault(); doSend(); }}
                  className="rounded-xl text-sm gap-1.5 text-white bg-success"
                >
                  {isSending ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />Enviando…</>
                  ) : (
                    <><Check className="w-3.5 h-3.5" aria-hidden="true" />Confirmar Envio</>
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          );
        })()}
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmSendDialog;
