/**
 * Diálogos de participação do Planejado — 25/09 (modularização).
 * `NaoParticipouDialog` (confirmar ausência com motivo opcional) e
 * `RestoreParticipacaoDialog` (reincluir nos cálculos). Extraídos de
 * budget-planned.tsx; o estado e as mutations vêm de `useBudgetPlannedActions`.
 *
 * 08/10 (redesenho): a moldura dos diálogos da família — ícone, pergunta e
 * para quem no alto, o efeito por extenso, o campo com rótulo de verdade e o
 * rodapé com Voltar × ação. Antes eram cartões centralizados com animação
 * própria de "salto" e botões em cinza cheio, diferentes do resto do app.
 */
import { useId } from "react";
import { Calendar, Loader2, Undo2, UserX } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ddmmLocal, type NotAttendedModalState, type RestoreModalState } from "./types";

export interface NaoParticipouDialogProps {
  modal: NotAttendedModalState | null;
  reason: string;
  setReason: (v: string) => void;
  onClose: () => void;
  isPending: boolean;
  onConfirm: (modal: NotAttendedModalState, reason: string) => void;
}

const MOLDURA = "max-w-[420px] w-[95vw] p-0 gap-0 rounded-xl overflow-hidden";
const VOLTAR = "inline-flex items-center justify-center h-9 px-4 rounded-lg border border-border bg-card text-sm font-medium text-slate-700 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function NaoParticipouDialog({ modal, reason, setReason, onClose, isPending, onConfirm }: NaoParticipouDialogProps) {
  const motivoId = useId();
  return (
    <Dialog open={!!modal} onOpenChange={onClose}>
      <DialogContent className={MOLDURA}>
        {!modal && <DialogTitle className="sr-only">Confirmar ausência</DialogTitle>}
        {modal && (
          <>
            <div className="flex items-start gap-3 px-5 pt-5 pb-1 pr-12">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-danger-soft text-danger shrink-0" aria-hidden="true">
                <UserX className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0 pt-0.5">
                <DialogTitle className="m-0 text-base font-semibold leading-6 text-foreground">Confirmar ausência?</DialogTitle>
                <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground truncate">{modal.name} · {modal.functionName}</p>
              </div>
            </div>

            <div className="px-5 pt-3 pb-4 space-y-3.5">
              <DialogDescription className="m-0 text-sm leading-relaxed text-slate-600">
                Você está marcando que este colaborador não participou deste evento. Os cálculos de diárias e custos associados serão removidos dos totais.
              </DialogDescription>
              <div>
                <label htmlFor={motivoId} className="block mb-1.5 text-xs font-medium text-slate-700">
                  Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <Textarea
                  id={motivoId}
                  className="w-full rounded-lg text-sm resize-none border-border focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:ring-offset-0 focus-visible:border-primary placeholder:text-muted-foreground"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder='Ex.: "Desistência", "Problema de saúde", "Substituído"…'
                  rows={2}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-surface-muted">
              <button type="button" className={VOLTAR} onClick={onClose}>Voltar</button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold text-white bg-danger-strong hover:bg-danger transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onConfirm(modal, reason)}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <UserX className="w-4 h-4" aria-hidden="true" />}
                {isPending ? "Confirmando…" : "Confirmar"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export interface RestoreParticipacaoDialogProps {
  modal: RestoreModalState | null;
  onClose: () => void;
  isPending: boolean;
  onConfirm: (id: string) => void;
}

/** Modal de confirmação de restauração. */
export function RestoreParticipacaoDialog({ modal, onClose, isPending, onConfirm }: RestoreParticipacaoDialogProps) {
  return (
    <Dialog open={!!modal} onOpenChange={onClose}>
      <DialogContent className={MOLDURA}>
        {!modal && <DialogTitle className="sr-only">Restaurar planejamento</DialogTitle>}
        {modal && (
          <>
            <div className="flex items-start gap-3 px-5 pt-5 pb-1 pr-12">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-soft text-primary shrink-0" aria-hidden="true">
                <Undo2 className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0 pt-0.5">
                <DialogTitle className="m-0 text-base font-semibold leading-6 text-foreground">Restaurar planejamento?</DialogTitle>
                <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs leading-5 text-muted-foreground">
                  <span className="truncate">{modal.name} · {modal.functionName}</span>
                  {modal.startDate && modal.endDate && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Calendar className="w-3 h-3" aria-hidden="true" />
                      {ddmmLocal(modal.startDate)}{" – "}{ddmmLocal(modal.endDate)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="px-5 pt-3 pb-4">
              <DialogDescription className="m-0 text-sm leading-relaxed text-slate-600">
                Deseja incluir novamente este colaborador nos cálculos? Todos os valores de diárias, alimentação e mobilidade serão reativados.
              </DialogDescription>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-surface-muted">
              <button type="button" className={VOLTAR} onClick={onClose}>Voltar</button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary-hover transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => { onConfirm(modal.id); onClose(); }}
                disabled={isPending}
                autoFocus
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Undo2 className="w-4 h-4" aria-hidden="true" />}
                {isPending ? "Restaurando…" : "Restaurar"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default NaoParticipouDialog;
