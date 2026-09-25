/**
 * Diálogos de participação do Planejado — 25/09 (modularização).
 * `NaoParticipouDialog` (confirmar ausência com motivo opcional) e
 * `RestoreParticipacaoDialog` (reincluir nos cálculos). Extraídos de
 * budget-planned.tsx; o estado e as mutations vêm de `useBudgetPlannedActions`.
 */
import { Calendar, Undo2, UserX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export function NaoParticipouDialog({ modal, reason, setReason, onClose, isPending, onConfirm }: NaoParticipouDialogProps) {
  return (
    <Dialog open={!!modal} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 gap-0 rounded-xl overflow-hidden shadow-3 border border-black/6">
        <DialogHeader className="sr-only">
          <DialogTitle>Confirmar Ausência</DialogTitle>
        </DialogHeader>

        {modal && (
          <div className="bg-card flex flex-col items-center px-6 pt-7 pb-6 gap-4"
            style={{ animation: "modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both" }}>

            {/* Ícone centralizado — círculo rose claro */}
            <div className="w-11 h-11 rounded-full flex items-center justify-center bg-danger-soft border border-danger/25">
              <UserX className="w-4.5 h-4.5 text-danger-strong" style={{ width: 18, height: 18 }} aria-hidden="true" />
            </div>

            {/* Título + subtítulo */}
            <div className="text-center space-y-1">
              <h2 className="text-base font-medium text-foreground leading-snug">Confirmar Ausência?</h2>
              <p className="text-xs font-normal text-muted-foreground">{modal.name} · {modal.functionName}</p>
            </div>

            {/* Texto explicativo */}
            <p className="text-center text-sm font-normal text-muted-foreground leading-relaxed">
              Você está marcando que este colaborador não participou deste evento. Os cálculos de diárias e custos associados serão removidos dos totais.
            </p>

            {/* Campo motivo */}
            <div className="w-full">
              <label className="text-2xs font-medium uppercase tracking-widest text-muted-foreground block mb-1.5">
                Motivo <span className="normal-case tracking-normal font-normal text-muted-foreground">(opcional)</span>
              </label>
              <Textarea
                className="w-full rounded-xl text-sm resize-none border-border focus:border-danger/25 focus:ring-2 focus:ring-danger/25 placeholder:text-muted-foreground"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder='Ex: "Desistência", "Problema de saúde", "Substituído"...'
                rows={2}
                autoFocus
              />
            </div>

            {/* Botões */}
            <div className="flex gap-2 w-full pt-1">
              <button
                className="flex-1 h-10 rounded-xl text-sm font-medium text-slate-600 bg-muted transition-colors hover:bg-border"
                onClick={onClose}
              >
                Voltar
              </button>
              <button
                className="flex-1 h-10 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 bg-danger-strong hover:bg-danger/90"
                onClick={() => onConfirm(modal, reason)}
                disabled={isPending}
              >
                <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                {isPending ? "Confirmando…" : "Confirmar"}
              </button>
            </div>
          </div>
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
      <DialogContent className="max-w-sm p-0 gap-0 rounded-xl overflow-hidden shadow-3 border border-black/6">
        <DialogHeader className="sr-only">
          <DialogTitle>Restaurar Planejamento</DialogTitle>
        </DialogHeader>
        {modal && (
          <div className="bg-card flex flex-col items-center px-6 pt-7 pb-6 gap-4"
            style={{ animation: "modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both" }}>

            {/* Ícone — círculo azul claro */}
            <div className="w-11 h-11 rounded-full flex items-center justify-center bg-brand-soft border border-primary/25">
              <Undo2 className="text-primary" style={{ width: 18, height: 18 }} aria-hidden="true" />
            </div>

            {/* Título + subtítulo */}
            <div className="text-center space-y-1">
              <h2 className="text-base font-medium text-foreground leading-snug">Restaurar Planejamento?</h2>
              <p className="text-xs font-normal text-muted-foreground">{modal.name} · {modal.functionName}</p>
              {modal.startDate && modal.endDate && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md mt-1 bg-brand-soft text-2xs font-medium text-primary border border-primary/25">
                  <Calendar style={{ width: 10, height: 10 }} aria-hidden="true" />
                  {ddmmLocal(modal.startDate)}
                  {" – "}
                  {ddmmLocal(modal.endDate)}
                </span>
              )}
            </div>

            {/* Texto explicativo */}
            <p className="text-center text-sm font-normal text-muted-foreground leading-relaxed">
              Deseja incluir novamente este colaborador nos cálculos? Todos os valores de diárias, alimentação e mobilidade serão reativados.
            </p>

            {/* Botões */}
            <div className="flex gap-2 w-full pt-1">
              <button
                className="flex-1 h-10 rounded-xl text-sm font-medium text-slate-600 bg-muted transition-colors hover:bg-border"
                onClick={onClose}
              >
                Voltar
              </button>
              <button
                className="flex-1 h-10 rounded-xl text-sm font-medium text-primary-foreground flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 bg-primary hover:bg-primary-hover"
                onClick={() => { onConfirm(modal.id); onClose(); }}
                disabled={isPending}
              >
                <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                {isPending ? "Restaurando…" : "Restaurar"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default NaoParticipouDialog;
