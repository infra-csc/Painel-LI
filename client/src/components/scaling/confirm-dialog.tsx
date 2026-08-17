/**
 * Dialog genérico de confirmação da tela de Escalação.
 * Substitui os 7 dialogs quase idênticos (cancelar/aprovar/recusar troca,
 * aprovar/reprovar produção, reativar…): mesmo layout, muda ícone/texto/cor.
 */
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ConfirmTone = "red" | "emerald" | "orange" | "rose";

const TONE: Record<ConfirmTone, { iconWrap: string; icon: string; button: string }> = {
  red:     { iconWrap: "bg-red-50 border-red-100",         icon: "text-red-500",     button: "bg-red-500 hover:bg-red-600" },
  emerald: { iconWrap: "bg-emerald-50 border-emerald-100", icon: "text-emerald-600", button: "bg-emerald-600 hover:bg-emerald-700" },
  orange:  { iconWrap: "bg-orange-50 border-orange-100",   icon: "text-orange-600",  button: "bg-orange-500 hover:bg-orange-600" },
  rose:    { iconWrap: "bg-red-50 border-red-100",         icon: "text-red-600",     button: "bg-red-600 hover:bg-red-700" },
};

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ícone lucide (recebe className com a cor do tom) */
  icon: (props: { className?: string }) => ReactNode;
  tone: ConfirmTone;
  title: string;
  description: ReactNode;
  /** Conteúdo extra entre a descrição e os botões (ex.: campo de motivo) */
  children?: ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  pendingLabel: string;
  isPending: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
  testId?: string;
}

export default function ConfirmDialog({
  open, onOpenChange, icon: Icon, tone, title, description, children,
  cancelLabel = "Cancelar", confirmLabel, pendingLabel, isPending, confirmDisabled,
  onConfirm, onCancel, testId,
}: ConfirmDialogProps) {
  const t = TONE[tone];
  const handleCancel = () => { onCancel?.(); onOpenChange(false); };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onCancel?.(); } onOpenChange(o); }}>
      <DialogContent className="max-w-[400px] p-0 gap-0 rounded-2xl overflow-hidden" data-testid={testId}>
        <div className="px-6 py-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${t.iconWrap}`}>
              <Icon className={`w-4 h-4 ${t.icon}`} />
            </div>
            <div>
              <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight mb-0.5">{title}</DialogTitle>
              <p className="text-[12px] text-slate-500 leading-relaxed">{description}</p>
            </div>
          </div>
          {children}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-9 text-[12px] border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={handleCancel}
              disabled={isPending}
            >
              {cancelLabel}
            </Button>
            <Button
              className={`flex-1 rounded-xl h-9 text-[12px] text-white ${t.button}`}
              onClick={onConfirm}
              disabled={isPending || !!confirmDisabled}
              data-testid={testId ? `${testId}-confirm` : undefined}
            >
              {isPending ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
