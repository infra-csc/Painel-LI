import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Lock, X, Eye, EyeOff, Check, AlertCircle, ShieldCheck } from "lucide-react";

// ─── Avatar helpers ─────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-600", "bg-amber-500", "bg-rose-500",
  "bg-indigo-500", "bg-teal-500",
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

  if (score <= 1) return { score, label: "Fraca",  color: "text-red-500",     bar: "bg-red-400" };
  if (score <= 3) return { score, label: "Média",  color: "text-amber-500",   bar: "bg-amber-400" };
  return          { score, label: "Forte",  color: "text-emerald-600", bar: "bg-emerald-500" };
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
      <DialogContent className="p-0 gap-0 sm:max-w-[440px] rounded-2xl border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">

        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-5 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              {/* Lock icon circle */}
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Redefinir Senha</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Defina uma nova senha para o usuário</p>

                {/* User pill */}
                {userName && (
                  <div className="flex items-center gap-2 mt-3 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-gray-200 w-fit">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${avatarColor(userName)}`}>
                      {initials(userName)}
                    </div>
                    <span className="text-xs font-medium text-slate-600">{userName}</span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors shrink-0"
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
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">
                Nova Senha <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  className={`${BASE} border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 ${
                    pwdOk ? "border-gray-200" : ""
                  }`}
                  data-testid="input-new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength bar */}
              {password.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${strength.bar}`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-semibold min-w-[36px] ${strength.color}`}>
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            {/* Confirmar Senha */}
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">
                Confirmar Senha <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showCfm ? "text" : "password"}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  className={`${BASE} transition-all ${
                    cfmOk  ? "border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" :
                    cfmBad ? "border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/10" :
                             "border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                  }`}
                  data-testid="input-confirm-password"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {cfmOk && <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={3} />}
                  {cfmBad && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                  <button
                    type="button"
                    onClick={() => setShowCfm(v => !v)}
                    className="ml-1 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showCfm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {cfmBad && (
                <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
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
                className="px-4 py-2 text-xs font-medium text-slate-600 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                data-testid="button-cancel-reset-password"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!canSubmit || isPending}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-200 hover:shadow-md hover:shadow-blue-200 transition-all"
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
            <p className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              O usuário deverá usar a nova senha no próximo acesso
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
