/**
 * Redefinir senha (08/10, redesenho). Só aparece fora de produção (em
 * produção o acesso é pelo Portal Norte). Mesma regra de antes: senha com
 * confirmação, o mínimo do servidor, e quem chama faz o POST. Na
 * apresentação: a régua dos modais do app (cabeçalho com ícone, corpo,
 * rodapé fixo), o que acontece dito ANTES de confirmar (troca obrigatória no
 * próximo acesso e sessões abertas encerradas) e a força da senha em quatro
 * filetes. A senha nunca sai daqui a não ser pelo `onConfirm`.
 * Props inalteradas: { isOpen, onClose, userName, isPending, onConfirm }.
 *
 * 08/10: mínimo de 8 caracteres, o MESMO do servidor (`SENHA_MINIMA` em
 * shared/edicao-de-usuario) — antes o client aceitava 6 e o servidor recusava.
 * Os campos só se limpam quando o modal fecha (sucesso ou Cancelar): antes
 * eram apagados no envio, e um erro do servidor obrigava a digitar tudo de novo.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Check, Eye, EyeOff, Info, KeyRound, Loader2, X } from "lucide-react";
import { RequiredMark } from "@/components/forms/required-mark";
import { cn } from "@/lib/utils";
import { AvatarDoUsuario } from "@/components/admin-users/pecas";
import { nomeDaPessoa } from "@/components/admin-users/acesso";
import { SENHA_MINIMA } from "@shared/edicao-de-usuario";

// ─── Força da senha ──────────────────────────────────────────────────────────
function getStrength(pwd: string): { score: number; label: string; color: string; bar: string } {
  if (!pwd) return { score: 0, label: "", color: "", bar: "" };
  let score = 0;
  if (pwd.length >= SENHA_MINIMA) score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  if (score <= 1) return { score, label: "Fraca",  color: "text-danger",          bar: "bg-danger-strong" };
  if (score <= 3) return { score, label: "Média",  color: "text-warning-strong",  bar: "bg-warning-strong" };
  return          { score, label: "Forte",  color: "text-success", bar: "bg-success-strong" };
}

/** Campo de senha com o "mostrar" dentro. */
const CAMPO = "w-full h-10 pl-3 pr-10 text-sm bg-card border rounded-lg outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground";
const ROTULO = "block mb-1.5 text-xs font-medium text-slate-600";
const OLHO = "pas-alvo absolute right-1.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
  const pwdOk     = password.length >= SENHA_MINIMA;
  const cfmOk     = confirm.length > 0 && confirm === password;
  const cfmBad    = confirm.length > 0 && confirm !== password;
  const canSubmit = pwdOk && cfmOk;

  const limpar = () => { setPassword(""); setConfirm(""); setShowPwd(false); setShowCfm(false); };
  // Limpa quando o modal FECHA — no sucesso quem chama fecha; no erro ele fica
  // aberto com o que foi digitado.
  useEffect(() => {
    if (isOpen) return;
    setPassword(""); setConfirm(""); setShowPwd(false); setShowCfm(false);
  }, [isOpen]);

  const handleClose = () => { limpar(); onClose(); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isPending) return;
    onConfirm(password);
  };

  // Quatro filetes: 1 = fraca, 2-3 = média, 4 = forte (score 0–5 → 0–4).
  const filetes = password ? Math.max(1, Math.min(4, Math.round((Math.min(strength.score, 5) / 5) * 4))) : 0;
  const nome = userName ? nomeDaPessoa(userName) : "";

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent data-testid="modal-reset-password"
        className="p-0 gap-0 sm:max-w-[460px] rounded-xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[92vh] max-sm:w-full max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0">

        {/* ── Cabeçalho ── */}
        <div className="relative flex items-start gap-3.5 shrink-0 px-5 sm:px-6 pt-4 pb-3.5 pr-14 border-b border-border bg-card">
          <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-warning-soft text-warning-strong shrink-0">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-semibold text-foreground leading-6 m-0 p-0">Redefinir senha</DialogTitle>
            <DialogDescription asChild>
              <div className="m-0 mt-1 flex items-center gap-2 text-xs leading-5 text-muted-foreground min-w-0">
                {nome ? (
                  <>
                    <AvatarDoUsuario nome={userName} tamanho="sm" />
                    <span className="truncate">Nova senha para <strong className="font-semibold text-foreground">{nome}</strong></span>
                  </>
                ) : "Defina uma nova senha para o usuário"}
              </div>
            </DialogDescription>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={handleClose}
            className="pas-alvo absolute right-3 top-3 flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── Corpo ── */}
        <form onSubmit={handleSubmit} id="reset-pwd-form" className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 bg-surface-muted/60 flex flex-col gap-3">
            {/* O que acontece — antes de confirmar */}
            <div className="flex items-start gap-2.5 rounded-lg border border-info/25 bg-info-soft px-3 py-2.5">
              <Info className="w-4 h-4 text-info mt-0.5 shrink-0" aria-hidden="true" />
              <p className="m-0 text-xs leading-5 text-info">
                No próximo acesso, {nome || "a pessoa"} entra com esta senha e é obrigada a trocá-la.
                As sessões abertas dela são encerradas.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-4">
              {/* Nova senha */}
              <div>
                <label htmlFor="usr-nova-senha" className={ROTULO}>Nova senha<RequiredMark /></label>
                <div className="relative">
                  <input
                    id="usr-nova-senha"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={`Mínimo ${SENHA_MINIMA} caracteres`}
                    autoComplete="new-password"
                    aria-describedby="usr-forca-senha"
                    className={cn(CAMPO, "border-border hover:border-slate-300 focus:border-primary focus:ring-[3px] focus:ring-primary/12")}
                    data-testid="input-new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPwd}
                    className={OLHO}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>

                {/* Força: quatro filetes + a palavra */}
                <div id="usr-forca-senha" className="mt-2 flex items-center gap-2 h-4" aria-live="polite">
                  <div className="flex flex-1 gap-1" aria-hidden="true">
                    {[1, 2, 3, 4].map(i => (
                      <span key={i} className={cn("usr-filete h-1 flex-1 rounded-full", i <= filetes ? strength.bar : "bg-muted")} />
                    ))}
                  </div>
                  <span className={cn("min-w-[44px] text-right text-2xs font-semibold", password ? strength.color : "text-muted-foreground font-normal")}>
                    {password ? strength.label : "Força"}
                  </span>
                </div>
                {password && !pwdOk && (
                  <p className="m-0 mt-1 text-2xs text-muted-foreground" data-testid="usr-senha-curta">
                    Mínimo de {SENHA_MINIMA} caracteres — {SENHA_MINIMA - password.length === 1 ? "falta 1" : `faltam ${SENHA_MINIMA - password.length}`}.
                  </p>
                )}
              </div>

              {/* Confirmar */}
              <div>
                <label htmlFor="usr-confirma-senha" className={ROTULO}>Confirmar senha<RequiredMark /></label>
                <div className="relative">
                  <input
                    id="usr-confirma-senha"
                    type={showCfm ? "text" : "password"}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    aria-invalid={cfmBad || undefined}
                    aria-describedby={cfmBad ? "usr-confirma-erro" : undefined}
                    className={cn(CAMPO, "pr-16",
                      cfmOk  ? "border-success-strong focus:ring-[3px] focus:ring-success-strong/15" :
                      cfmBad ? "border-danger focus:ring-[3px] focus:ring-danger/15" :
                               "border-border hover:border-slate-300 focus:border-primary focus:ring-[3px] focus:ring-primary/12")}
                    data-testid="input-confirm-password"
                  />
                  {cfmOk && <Check className="usr-entra absolute right-10 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-success-strong" strokeWidth={3} aria-hidden="true" />}
                  <button
                    type="button"
                    onClick={() => setShowCfm(v => !v)}
                    aria-label={showCfm ? "Ocultar confirmação da senha" : "Mostrar confirmação da senha"}
                    aria-pressed={showCfm}
                    className={OLHO}
                  >
                    {showCfm ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
                {cfmBad && (
                  <p id="usr-confirma-erro" role="alert" className="usr-entra m-0 mt-1 flex items-center gap-1 text-2xs text-danger">
                    <AlertCircle className="w-3 h-3" aria-hidden="true" /> As senhas não coincidem
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Rodapé ── */}
          <div className="flex items-center justify-end gap-2 shrink-0 px-5 sm:px-6 py-3 border-t border-border bg-surface-muted">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}
              className="h-9 rounded-lg px-4 text-sm font-medium max-sm:flex-1" data-testid="button-cancel-reset-password">
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit || isPending} aria-busy={isPending}
              className="h-9 rounded-lg px-4 text-sm font-semibold gap-2 hover:bg-primary-hover max-sm:flex-1"
              data-testid="button-confirm-reset-password">
              {isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Redefinindo…</>
                : <><KeyRound className="w-4 h-4" aria-hidden="true" /> Redefinir senha</>}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
