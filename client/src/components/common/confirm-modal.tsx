import { createPortal } from 'react-dom';
import { Trash2, Ban, CheckCircle } from 'lucide-react';

export type ConfirmVariant = 'delete' | 'cancel' | 'confirm';

interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: ConfirmVariant;
  title: string;
  message: string;
  confirmLabel: string;
}

const variantConfig: Record<ConfirmVariant, {
  iconBg: string;
  icon: React.ReactNode;
  confirmBg: string;
}> = {
  delete: {
    iconBg: 'bg-red-50',
    icon: <Trash2 className="w-6 h-6 text-red-500" />,
    confirmBg: 'bg-red-500 hover:bg-red-600',
  },
  cancel: {
    iconBg: 'bg-orange-50',
    icon: <Ban className="w-6 h-6 text-orange-500" />,
    confirmBg: 'bg-orange-500 hover:bg-orange-600',
  },
  confirm: {
    iconBg: 'bg-blue-50',
    icon: <CheckCircle className="w-6 h-6 text-blue-500" />,
    confirmBg: 'bg-blue-600 hover:bg-blue-700',
  },
};

export default function ConfirmModal({
  open,
  onConfirm,
  onCancel,
  variant = 'delete',
  title,
  message,
  confirmLabel,
}: ConfirmModalProps) {
  if (!open) return null;

  const { iconBg, icon, confirmBg } = variantConfig[variant];

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className={`w-12 h-12 ${iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}>
          {icon}
        </div>
        <h3 className="text-lg font-bold text-slate-800 text-center mb-2">{title}</h3>
        <p className="text-sm text-slate-500 text-center mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl py-2.5 text-sm font-medium transition-colors"
          >
            Voltar
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 ${confirmBg} text-white rounded-xl py-2.5 text-sm font-semibold shadow-sm transition-all`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
