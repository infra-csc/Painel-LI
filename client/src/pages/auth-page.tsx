import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Redirect } from "wouter";
import { AlertTriangle, ExternalLink, Shield, Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/components/common/use-page-title";
import norteLogo from "@assets/image_1776349526988.png";

const isDev = import.meta.env.DEV;

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});
type LoginForm = z.infer<typeof loginSchema>;

// Aceita apenas caminhos internos do app ("/tickets", "/events?x=1").
// Rejeita "//evil.com", "http://...", "/auth" (evita loop) e "/reset-password".
function isInternalPath(p: string): boolean {
  if (!p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\")) return false;
  if (p.startsWith("/auth") || p.startsWith("/reset-password")) return false;
  return true;
}

export default function AuthPage() {
  usePageTitle("Entrar");
  const [, setLocation] = useLocation();
  const { user, login } = useAuth();
  const [ssoError, setSsoError] = useState<"not_registered" | "not_approved" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const [sessaoExpirada, setSessaoExpirada] = useState(false);
  // Rota interna para onde voltar após o login (vem do redirect de 401 do
  // queryClient). Só aceitamos caminhos relativos do próprio app — nada de
  // "//host" ou URLs absolutas — para não virar open redirect.
  const [returnTo] = useState<string>(() => {
    const rt = new URLSearchParams(window.location.search).get("returnTo");
    return rt && isInternalPath(rt) ? rt : "/";
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("sso_error");
    if (err === "not_registered" || err === "not_approved") {
      setSsoError(err);
    }
    // Marcado pelo queryClient quando o servidor devolve 401 numa tela interna
    if (params.get("sessao") === "expirada") setSessaoExpirada(true);
  }, []);

  if (user) return <Redirect to={returnTo} />;

  const handleLogin = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const success = await login(data.email, data.password);
      if (success) {
        setLocation(returnTo);
      } else {
        loginForm.setError("password", { message: "Credenciais inválidas. Verifique e-mail e senha." });
      }
    } catch {
      loginForm.setError("password", { message: "Erro interno do servidor." });
    } finally {
      setIsLoading(false);
    }
  };

  const emailErr = loginForm.formState.errors.email?.message;
  const passErr = loginForm.formState.errors.password?.message;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-brand-soft to-secondary">
      <div className="w-full max-w-[420px] bg-card rounded-[20px] shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-6 sm:p-10">
        {/* Logo + Title */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-10 overflow-hidden flex items-start">
            <img
              src={norteLogo}
              alt="Norte"
              className="object-contain object-left max-w-[160px] max-h-[54px] [clip-path:inset(0_0_25%_0)]"
            />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">Logística Interna</h1>
          <p className="text-sm text-muted-foreground mt-1">Sistema de gestão de eventos</p>
        </div>

        {/* Erro SSO */}
        {ssoError && (
          <div role="alert" className="flex items-start gap-3 p-3 mb-5 rounded-xl bg-red-50 border border-red-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                {ssoError === "not_registered" ? "Acesso não autorizado" : "Conta inativa"}
              </p>
              <p className="text-xs mt-0.5 text-red-700">
                {ssoError === "not_registered"
                  ? "Seu e-mail não está cadastrado no sistema. Solicite acesso ao administrador."
                  : "Sua conta está inativa. Entre em contato com o administrador."}
              </p>
            </div>
          </div>
        )}

        {sessaoExpirada && !ssoError && (
          <div role="status" className="flex items-start gap-3 p-3 mb-5 rounded-xl bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Sessão expirada</p>
              <p className="text-xs mt-0.5 text-amber-700">
                Sua sessão terminou por inatividade. Entre novamente para continuar de onde parou.
              </p>
            </div>
          </div>
        )}

        {isDev ? (
          /* ── Modo Dev: formulário de login direto ── */
          <>
            <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-lg bg-yellow-50 border border-amber-200">
              <span className="text-xs font-semibold text-amber-800">⚙ Modo desenvolvimento — login direto habilitado</span>
            </div>
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="login-email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60 pointer-events-none" />
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="seu@email.com"
                    aria-invalid={!!emailErr}
                    aria-describedby={emailErr ? "login-email-error" : undefined}
                    {...loginForm.register("email")}
                    className={cn("pl-9 bg-muted/40", emailErr && "border-destructive focus-visible:ring-destructive")}
                  />
                </div>
                {emailErr && (
                  <p id="login-email-error" className="text-xs text-destructive" role="alert">{emailErr}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60 pointer-events-none" />
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    aria-invalid={!!passErr}
                    aria-describedby={passErr ? "login-password-error" : undefined}
                    {...loginForm.register("password")}
                    className={cn("pl-9 pr-10 bg-muted/40", passErr && "border-destructive focus-visible:ring-destructive")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passErr && (
                  <p id="login-password-error" className="text-xs text-destructive" role="alert">{passErr}</p>
                )}
              </div>
              <Button type="submit" disabled={isLoading} className="w-full mt-2 font-semibold hover:bg-primary-hover">
                {isLoading ? "Entrando..." : <>Entrar <ArrowRight className="w-4 h-4" /></>}
              </Button>
            </form>
          </>
        ) : (
          /* ── Produção: acesso exclusivo pelo portal ── */
          <div className="flex flex-col items-center text-center gap-4 py-6 px-4 rounded-2xl bg-brand-soft border border-primary/20">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-foreground">Acesso exclusivo pelo Portal</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                O acesso a este sistema é feito apenas pelo Portal Norte. Use o link abaixo para entrar.
              </p>
            </div>
            <Button asChild className="font-semibold hover:bg-primary-hover">
              <a href="https://norte-app-hub.replit.app/">
                Acessar o Portal Norte <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-border text-center space-y-1.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Problemas para acessar? Entre em contato com o administrador do sistema.
          </p>
          <p className="text-[11px] text-muted-foreground/60 font-medium">v1.0.0</p>
        </div>
      </div>
    </div>
  );
}
