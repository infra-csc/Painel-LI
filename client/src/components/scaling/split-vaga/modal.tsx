/**
 * "Dividir escalação" — modal em portal com dois passos (colaborador & dias →
 * valores) e a confirmação de titular zerado.
 *
 * Desde 25/09 este arquivo só monta a casca: o estado vive em
 * `use-split-state.ts` e cada passo em `step-collaborator.tsx` / `step-values.tsx`.
 * O arquivo antigo `components/split-vaga-modal.tsx` (1.032 linhas) virou um
 * reexport, porque a tela do Realizado (budget) continua importando de lá.
 */
import { createPortal } from "react-dom";
import { X, UserPlus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSplitState } from "./use-split-state";
import { StepCollaborator } from "./step-collaborator";
import { StepValues } from "./step-values";
import type { SplitVagaModalProps } from "./split-shared";

export type { SplitVagaModalProps, SplitPayload } from "./split-shared";

export function SplitVagaModal(props: SplitVagaModalProps) {
  const { item, collaborators, takenDays = [], isPending } = props;
  const s = useSplitState(props);
  const { step, selectedCollab, showZeroDayConfirm, setShowZeroDayConfirm, doConfirm, modalRef, DialogoDescarte, fechar } = s;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4">
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Dividir escalação"
          tabIndex={-1}
          className="bg-card rounded-xl w-full max-w-[680px] max-h-[92vh] flex flex-col shadow-3 overflow-hidden outline-none border border-black/6"
        >
          {/* ── Title header ── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary-hover">
                <UserPlus className="w-4.5 h-4.5 text-white" style={{width:18,height:18}} aria-hidden="true" />
              </div>
              <div>
                <p className="font-bold text-base text-foreground leading-tight m-0">Dividir escalação</p>
                <p className="text-xs text-muted-foreground m-0">Atribua dias específicos a outro colaborador</p>
              </div>
            </div>
            <button type="button" onClick={fechar} aria-label="Fechar" className="text-muted-foreground hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1 rounded-lg hover:bg-muted transition-colors">
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* ── Step indicator ── */}
          <div className="flex items-center gap-3 px-5 py-2.5 bg-surface-muted border-b border-border flex-shrink-0">
            {/* Step 1 */}
            <div className="flex items-center gap-2">
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold text-white flex-shrink-0", (step === 1 ? "bg-primary-hover" : "bg-success-strong"))}>
                {step === 1 ? '1' : '✓'}
              </div>
              <span className={cn("text-xs font-semibold", (step === 1 ? "text-primary" : "text-success-strong"))}>
                Colaborador & dias
              </span>
            </div>
            <div className="flex-1 h-px bg-border" />
            {/* Step 2 */}
            <div className="flex items-center gap-2">
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold flex-shrink-0", (step === 2 ? "bg-primary-hover" : "bg-border"), (step === 2 ? "text-white" : "text-muted-foreground"))}>
                2
              </div>
              <span className={cn("text-xs font-semibold", (step === 2 ? "text-primary" : "text-muted-foreground"))}>
                Valores
              </span>
            </div>
          </div>

          {step === 1 && <StepCollaborator item={item} collaborators={collaborators} takenDays={takenDays} s={s} />}
          {step === 2 && selectedCollab && <StepValues s={s} selectedCollab={selectedCollab} isPending={isPending} />}
        </div>
      </div>

      {/* Zero-day confirmation */}
      {showZeroDayConfirm && createPortal(
        <div className="fixed inset-0 z-[10001] bg-black/60 flex items-center justify-center p-6">
          <div id="split-zeroday-portal" role="alertdialog" aria-modal="true" aria-label="Colaborador original sem dias" className="bg-card rounded-xl max-w-[420px] w-full p-7 shadow-3">
            <div className="flex gap-3 items-start mb-5">
              <div className="w-10 h-10 rounded-xl bg-danger-soft flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-danger-strong" aria-hidden="true" />
              </div>
              <div>
                <p className="font-bold text-base text-foreground m-0 mb-1.5">Colaborador original sem dias</p>
                <p className="text-sm text-muted-foreground m-0 leading-relaxed">
                  Todos os dias foram redistribuídos para o novo colaborador. O registro original ficará com <strong>0 dias</strong>. Deseja continuar mesmo assim?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5">
              <Button variant="outline" className="rounded-xl" onClick={() => setShowZeroDayConfirm(false)}>Cancelar</Button>
              <Button
                onClick={() => { setShowZeroDayConfirm(false); doConfirm(); }}
                className="rounded-xl text-white bg-danger-strong hover:bg-danger/90"
              >
                Confirmar mesmo assim
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {DialogoDescarte}
    </>,
    document.body
  );
}
