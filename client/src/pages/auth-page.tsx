import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Redirect } from "wouter";
import { AlertTriangle, ExternalLink, Shield, Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
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

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #e8edf8 100%)" }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: 420,
          background: "#ffffff",
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.08)",
          padding: 40,
        }}
      >
        {/* Logo + Title */}
        <div className="flex flex-col items-center mb-8">
          <div style={{ height: 40, overflow: "hidden", display: "flex", alignItems: "flex-start" }}>
            <img
              src={norteLogo}
              alt="Norte"
              className="object-contain object-left"
              style={{ maxWidth: 160, maxHeight: 54, clipPath: "inset(0 0 25% 0)" }}
            />
          </div>
          <h1 className="mt-3 font-bold text-gray-900" style={{ fontSize: 24, letterSpacing: "-0.02em" }}>
            Logística Interna
          </h1>
          <p className="text-sm text-gray-400 mt-1">Sistema de gestão de eventos</p>
        </div>

        {/* Erro SSO */}
        {ssoError && (
          <div className="flex items-start gap-3 p-3 mb-5 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#dc2626" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#991b1b" }}>
                {ssoError === "not_registered" ? "Acesso não autorizado" : "Conta inativa"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#b91c1c" }}>
                {ssoError === "not_registered"
                  ? "Seu e-mail não está cadastrado no sistema. Solicite acesso ao administrador."
                  : "Sua conta está inativa. Entre em contato com o administrador."}
              </p>
            </div>
          </div>
        )}

        {sessaoExpirada && !ssoError && (
          <div className="flex items-start gap-3 p-3 mb-5 rounded-xl" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#d97706" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#92400e" }}>Sessão expirada</p>
              <p className="text-xs mt-0.5" style={{ color: "#b45309" }}>
                Sua sessão terminou por inatividade. Entre novamente para continuar de onde parou.
              </p>
            </div>
          </div>
        )}

        {isDev ? (
          /* ── Modo Dev: formulário de login direto ── */
          <>
            <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-lg" style={{ background: "#fefce8", border: "1px solid #fde68a" }}>
              <span className="text-xs font-semibold" style={{ color: "#92400e" }}>⚙ Modo desenvolvimento — login direto habilitado</span>
            </div>
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700" htmlFor="login-email">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="seu@email.com"
                    {...loginForm.register("email")}
                    className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-lg outline-none transition-colors"
                    style={{ borderColor: loginForm.formState.errors.email ? "#ef4444" : "#e2e8f0", background: "#f8fafc" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = loginForm.formState.errors.email ? "#ef4444" : "#e2e8f0")}
                  />
                </div>
                {loginForm.formState.errors.email?.message && (
                  <p className="text-xs text-red-500" role="alert">{loginForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700" htmlFor="login-password">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...loginForm.register("password")}
                    className="w-full pl-9 pr-10 py-2.5 text-sm border rounded-lg outline-none transition-colors"
                    style={{ borderColor: loginForm.formState.errors.password ? "#ef4444" : "#e2e8f0", background: "#f8fafc" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = loginForm.formState.errors.password ? "#ef4444" : "#e2e8f0")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {loginForm.formState.errors.password?.message && (
                  <p className="text-xs text-red-500">{loginForm.formState.errors.password.message}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white rounded-lg transition-all duration-150 mt-2"
                style={{ background: isLoading ? "#93c5fd" : "#2563eb", cursor: isLoading ? "not-allowed" : "pointer" }}
                onMouseEnter={(e) => { if (!isLoading) (e.currentTarget as HTMLElement).style.background = "#1d4ed8"; }}
                onMouseLeave={(e) => { if (!isLoading) (e.currentTarget as HTMLElement).style.background = "#2563eb"; }}
              >
                {isLoading ? "Entrando..." : <> Entrar <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          </>
        ) : (
          /* ── Produção: acesso exclusivo pelo portal ── */
          <div
            className="flex flex-col items-center text-center gap-4 py-6 px-4 rounded-2xl"
            style={{ background: "#f0f6ff", border: "1.5px solid #bfdbfe" }}
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-full" style={{ background: "#2563eb" }}>
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-800" style={{ fontSize: 15 }}>
                Acesso exclusivo pelo Portal
              </p>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                O acesso a este sistema é feito apenas pelo Portal Norte. Use o link abaixo para entrar.
              </p>
            </div>
            <a
              href="https://norte-app-hub.replit.app/"
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition-all duration-150"
              style={{ background: "#2563eb", textDecoration: "none" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#1d4ed8"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#2563eb"; }}
            >
              Acessar o Portal Norte <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-100 text-center space-y-1.5">
          <p className="text-xs text-gray-400 leading-relaxed">
            Problemas para acessar? Entre em contato com o administrador do sistema.
          </p>
          <p className="text-[11px] text-gray-300 font-medium">v1.0.0</p>
        </div>
      </div>
    </div>
  );
}
