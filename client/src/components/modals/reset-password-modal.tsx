import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Lock, X, Eye, EyeOff, Check, AlertCircle, ShieldCheck } from "lucide-react";

// ─── Avatar helpers ─────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-primary", "bg-primary", "bg-success-strong", "bg-warning-strong",
  "bg-primary", "bg-info", "bg-warning-strong", "bg-danger-strong",
  "bg-primary", "bg-info-strong",
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Password strength ───────────────────────────────────────────────────────
function getStrength(pwd: string): { score: number; label: string; color: string; bar: string } {
  if (!pwd) return { score: 0, label: "", color: "", bar: "" };
  let score = 0;
  if (pwd.length >= 6)  score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  if (score <= 1) return { score, label: "Fraca",  color: "text-danger-strong",     bar: "bg-danger-strong" };
  if (score <= 3) return { score, label: "Média",  color: "text-warning-strong",   bar: "bg-warning-strong" };
  return          { score, label: "Forte",  color: "text-success", bar: "bg-success-strong" };
}

// ─── Input class ─────────────────────────────────────────────────────────────
const BASE = "w-full h-11 pl-10 pr-10 text-sm border rounded-lg outline-none transition-all";

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  isPending: boolean;
  onConfirm: (password: string) => void;
}

export default function ResetPasswordModal({ isOpen, onClose, userName, isPending, onConfirm }: ResetPasswordModalProps) {
  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [showPwd, setShowPwd]       = useState(false);
  const [showCfm, setShowCfm]       = useState(false);

  const strength  = getStrength(password);
  const pwdOk     = password.length >= 6;
  const cfmOk     = confirm.length > 0 && confirm === password;
  const cfmBad    = confirm.length > 0 && confirm !== password;
  const canSubmit = pwdOk && cfmOk;

  const handleClose = () => { setPassword(""); setConfirm(""); setShowPwd(false); setShowCfm(false); onClose(); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm(password);
    setPassword(""); setConfirm(""); setShowPwd(false); setShowCfm(false);
  };

  // Strength bar fill: 1 segment = 20%
  const fillPct = password ? Math.round((Math.min(strength.score, 5) / 5) * 100) : 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="p-0 gap-0 sm:max-w-[440px] rounded-xl border-0 shadow-3 overflow-hidden [&>button:last-child]:hidden">

        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-5 border-b border-border">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              {/* Lock icon circle */}
              <div className="w-10 h-10 rounded-xl bg-brand-soft flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">Redefinir senha</h2>
                <p className="text-2xs text-muted-foreground mt-0.5">Defina uma nova senha para o usuário</p>

                {/* User pill */}
                {userName && (
                  <div className="flex items-center gap-2 mt-3 px-2.5 py-1.5 bg-surface-muted rounded-lg border border-border w-fit">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-2xs font-bold text-white shrink-0 ${avatarColor(userName)}`}>
                      {initials(userName)}
                    </div>
                    <span className="text-xs font-medium text-slate-600">{userName}</span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-slate-600 hover:bg-muted transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} id="reset-pwd-form">
          <div className="px-6 py-6 space-y-5">

            {/* Nova Senha */}
            <div>
              <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                Nova senha <span className="text-danger" aria-hidden="true">*</span><span className="sr-only"> (obrigatório)</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  className={`${BASE} border-border focus:border-primary focus:ring-2 focus:ring-ring/10 ${
                    pwdOk ? "border-border" : ""
                  }`}
                  data-testid="input-new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength bar */}
              {password.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${strength.bar}`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                  <span className={`text-2xs font-semibold min-w-[36px] ${strength.color}`}>
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            {/* Confirmar Senha */}
            <div>
              <label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                Confirmar Senha <span className="text-danger-strong">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showCfm ? "text" : "password"}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  className={`${BASE} transition-all ${
                    cfmOk  ? "border-success-strong focus:border-success-strong focus:ring-2 focus:ring-success-strong/10" :
                    cfmBad ? "border-danger-strong focus:border-danger-strong focus:ring-2 focus:ring-danger-strong/10" :
                             "border-border focus:border-primary focus:ring-2 focus:ring-ring/10"
                  }`}
                  data-testid="input-confirm-password"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {cfmOk && <Check className="w-3.5 h-3.5 text-success-strong" strokeWidth={3} />}
                  {cfmBad && <AlertCircle className="w-3.5 h-3.5 text-danger-strong" />}
                  <button
                    type="button"
                    onClick={() => setShowCfm(v => !v)}
                    className="ml-1 text-muted-foreground hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showCfm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {cfmBad && (
                <p className="text-2xs text-danger-strong mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> As senhas não coincidem
                </p>
              )}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="px-6 pb-5 pt-1 space-y-3">
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="px-4 py-2 text-xs font-medium text-slate-600 border border-border rounded-lg hover:border-slate-300 transition-colors"
                data-testid="button-cancel-reset-password"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!canSubmit || isPending}
                className="flex items-center gap-1.5 px-5 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:pointer-events-none text-primary-foreground text-xs font-semibold rounded-lg shadow-1 hover:shadow-2 transition-all"
                data-testid="button-confirm-reset-password"
              >
                {isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Redefinindo...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    Redefinir Senha
                  </>
                )}
              </button>
            </div>
            <p className="text-2xs text-muted-foreground text-center flex items-center justify-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              O usuário deverá usar a nova senha no próximo acesso
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
