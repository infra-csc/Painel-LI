/**
 * Confirmação de envio para o Realizado — UNIFICADA (cards, individual e
 * planilha) — 25/09 (modularização). Extraída de budget-planned.tsx.
 *
 * 08/10 (redesenho): cabeçalho da família (ícone, pergunta, para quem), o
 * resumo como extrato — um envio mostra Diárias/Alimentação/Mobilidade; um
 * lote mostra QUEM vai (nome, função e valor, com a marca de ajuste manual),
 * para conferir antes do irreversível — e o total em destaque. Mesmo filtro,
 * mesma mutation, mesmo texto de aviso.
 */
import { Check, Loader2, PencilLine, Send } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogTitle,
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

const LINHA = "flex items-center justify-between gap-3 px-4 py-2";

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
      <AlertDialogContent className="max-w-[440px] w-[95vw] p-0 gap-0 rounded-xl overflow-hidden">
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
              <div className="flex items-start gap-3 px-5 pt-5 pb-3">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-soft text-primary shrink-0" aria-hidden="true">
                  <Send className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <AlertDialogTitle className="m-0 text-base font-semibold leading-6 text-foreground">Enviar para a prestação de contas?</AlertDialogTitle>
                  <AlertDialogDescription className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
                    {single
                      ? `${getCollaboratorName(single.inclusion.collaboratorId)} · ${getFunctionName(single.inclusion.functionId)}`
                      : `${targets.length} ${targets.length === 1 ? "colaborador selecionado" : "colaboradores selecionados"}`}
                  </AlertDialogDescription>
                </div>
              </div>

              {/* Resumo de custos — extrato */}
              <div className="mx-5 rounded-xl overflow-hidden border border-border">
                {single ? (
                  <div className="divide-y divide-border">
                    <div className={LINHA}>
                      <span className="text-xs text-slate-600">Diárias</span>
                      <span className="text-xs font-medium tabular-nums text-foreground">{formatCurrency(single.subtotalDiarias)}</span>
                    </div>
                    <div className={LINHA}>
                      <span className="text-xs text-slate-600">Alimentação</span>
                      <span className="text-xs font-medium tabular-nums text-foreground">{formatCurrency(single.almocoSemana + single.jantarSemana + single.almocoFds + single.jantarFds)}</span>
                    </div>
                    <div className={LINHA}>
                      <span className="text-xs text-slate-600">Mobilidade</span>
                      <span className="text-xs font-medium tabular-nums text-foreground">{formatCurrency(single.mobilidade)}</span>
                    </div>
                  </div>
                ) : (
                  <ul className="m-0 p-0 list-none max-h-[188px] overflow-y-auto divide-y divide-border" aria-label="Quem será enviado">
                    {targets.map(b => (
                      <li key={b.inclusion.id} className={LINHA}>
                        <span className="min-w-0 flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground truncate">{getCollaboratorName(b.inclusion.collaboratorId)}</span>
                          <span className="text-2xs text-muted-foreground truncate">{getFunctionName(b.inclusion.functionId)}</span>
                          {b.hasOverride && <PencilLine className="w-3 h-3 shrink-0 text-warning" aria-label="com ajuste manual" />}
                        </span>
                        <span className="text-xs tabular-nums text-slate-700 shrink-0">{formatCurrency(b.totalFinal)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border bg-brand-soft">
                  <span className="text-xs font-medium text-slate-700">
                    Total a ser enviado
                    {!single && <span className="text-muted-foreground font-normal"> · {targets.length} {targets.length === 1 ? "pessoa" : "pessoas"}</span>}
                  </span>
                  <span className="text-base font-semibold tabular-nums text-primary">{formatCurrency(totalEnvio)}</span>
                </div>
              </div>

              {/* Copy consistente entre os três fluxos */}
              <p className="m-0 px-5 pt-3 pb-4 text-xs leading-5 text-muted-foreground">
                {targets.length === 1 ? "O planejamento será enviado" : "Os planejamentos serão enviados"} para a prestação de contas (Realizado)
                {anyEdited ? " — os valores editados manualmente vão junto" : ""}. <span className="font-medium text-foreground">Esta ação não pode ser desfeita.</span>
              </p>

              <AlertDialogFooter className="px-5 py-3 border-t border-border bg-surface-muted gap-2 sm:space-x-0">
                <AlertDialogCancel disabled={isSending} className="mt-0 h-9 rounded-lg text-sm">Voltar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isSending || targets.length === 0}
                  onClick={e => { e.preventDefault(); doSend(); }}
                  className="h-9 rounded-lg text-sm font-semibold gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground"
                >
                  {isSending ? (
                    <><Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Enviando…</>
                  ) : (
                    <><Check className="w-4 h-4" aria-hidden="true" />Confirmar envio</>
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
