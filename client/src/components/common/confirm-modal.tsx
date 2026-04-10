import { createPortal } from 'react-dom';

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
  iconColor: string;
  icon: string;
  footerBg: string;
  confirmBg: string;
  confirmShadow: string;
  borderColor: string;
}> = {
  delete: {
    iconBg: '#FEF2F2',
    iconColor: '#EF4444',
    icon: 'delete_forever',
    footerBg: '#FEF2F2',
    confirmBg: '#EF4444',
    confirmShadow: 'rgba(239,68,68,0.25)',
    borderColor: 'rgba(239,68,68,0.12)',
  },
  cancel: {
    iconBg: '#FFF7ED',
    iconColor: '#F97316',
    icon: 'cancel',
    footerBg: '#FFF7ED',
    confirmBg: '#F97316',
    confirmShadow: 'rgba(249,115,22,0.25)',
    borderColor: 'rgba(249,115,22,0.12)',
  },
  confirm: {
    iconBg: '#EFF6FF',
    iconColor: '#2563EB',
    icon: 'check_circle',
    footerBg: '#EFF6FF',
    confirmBg: '#2563EB',
    confirmShadow: 'rgba(37,99,235,0.25)',
    borderColor: 'rgba(37,99,235,0.12)',
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

  const cfg = variantConfig[variant];

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(20,27,43,0.45)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "white", borderRadius: 16,
        boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
        width: "100%", maxWidth: 360, overflow: "hidden",
        border: `2px solid ${cfg.borderColor}`,
      }}>
        {/* Body */}
        <div style={{ padding: "20px 20px 16px", display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
            background: cfg.iconBg, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span className="material-symbols-outlined" style={{
              fontSize: 26, color: cfg.iconColor,
              fontVariationSettings: "'FILL' 1",
            }}>{cfg.icon}</span>
          </div>
          <div style={{ paddingTop: 2 }}>
            <h4 style={{ fontSize: 15, fontWeight: 800, color: "#141b2b", margin: "0 0 5px", letterSpacing: "-0.2px", fontFamily: "Manrope, sans-serif" }}>
              {title}
            </h4>
            <p style={{ fontSize: 12, color: "#64748B", margin: 0, lineHeight: 1.6 }}>
              {message}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", background: cfg.footerBg,
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button onClick={onCancel} style={{
            fontSize: 11, fontWeight: 800, color: "#94A3B8", background: "none",
            border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 7,
            fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.05em",
            transition: "color 0.15s",
          }}
            className="hover:text-slate-600"
          >
            Voltar
          </button>
          <button onClick={onConfirm} style={{
            fontSize: 11, fontWeight: 800, color: "white",
            background: cfg.confirmBg, border: "none", cursor: "pointer",
            padding: "7px 16px", borderRadius: 8,
            fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.05em",
            boxShadow: `0 4px 12px ${cfg.confirmShadow}`,
            transition: "opacity 0.15s",
          }}
            className="hover:opacity-90 active:scale-95"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
