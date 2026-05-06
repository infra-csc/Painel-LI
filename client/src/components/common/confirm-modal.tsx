import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2, XCircle, CheckCircle } from "lucide-react";

export type ConfirmVariant = "delete" | "cancel" | "confirm";

interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: ConfirmVariant;
  title: string;
  message: string;
  confirmLabel: string;
}

const variantConfig: Record<
  ConfirmVariant,
  {
    icon: React.ReactNode;
    iconBg: string;
    confirmClass: string;
    headerBorder: string;
  }
> = {
  delete: {
    icon: <Trash2 size={20} className="text-red-500" />,
    iconBg: "bg-red-50",
    confirmClass:
      "bg-red-500 hover:bg-red-600 text-white border-0 shadow-sm shadow-red-200",
    headerBorder: "border-red-100",
  },
  cancel: {
    icon: <XCircle size={20} className="text-orange-500" />,
    iconBg: "bg-orange-50",
    confirmClass:
      "bg-orange-500 hover:bg-orange-600 text-white border-0 shadow-sm shadow-orange-200",
    headerBorder: "border-orange-100",
  },
  confirm: {
    icon: <CheckCircle size={20} className="text-[#2563EB]" />,
    iconBg: "bg-blue-50",
    confirmClass:
      "bg-[#2563EB] hover:bg-[#004ac6] text-white border-0 shadow-sm shadow-blue-200",
    headerBorder: "border-blue-100",
  },
};

export default function ConfirmModal({
  open,
  onConfirm,
  onCancel,
  variant = "delete",
  title,
  message,
  confirmLabel,
}: ConfirmModalProps) {
  const cfg = variantConfig[variant];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden rounded-2xl border border-slate-200 shadow-xl">
        <div className={`px-6 pt-6 pb-4 border-b ${cfg.headerBorder}`}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.iconBg}`}>
                {cfg.icon}
              </div>
              <div>
                <DialogTitle className="text-[15px] font-bold text-slate-800 leading-tight">
                  {title}
                </DialogTitle>
                <DialogDescription className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">
                  {message}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-slate-50">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 text-xs font-semibold uppercase tracking-wide h-8"
          >
            Voltar
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            className={`text-xs font-semibold uppercase tracking-wide h-8 px-4 ${cfg.confirmClass}`}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
