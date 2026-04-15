import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import norteLogo from "@assets/image_1770316785096.png";

// ── Schemas ────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

const forgotSchema = z.object({
  email: z.string().email("E-mail inválido"),
});

type LoginForm = z.infer<typeof loginSchema>;
type ForgotForm = z.infer<typeof forgotSchema>;

// ── Component ─────────────────────────────────────────────────────────────────

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { user, login } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"login" | "recover">("login");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ── Login form ───────────────────────────────────────────────────────────────

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // ── Forgot-password form ─────────────────────────────────────────────────────

  const forgotForm = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  // Se já está logado, redirecionar para home (usando Redirect declarativo, não setLocation durante render)
  if (user) {
    return <Redirect to="/" />;
  }

  const handleLogin = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const success = await login(data.email, data.password);
      if (success) {
        setLocation("/");
      } else {
        loginForm.setError("email", { message: " " });
        loginForm.setError("password", { message: "Credenciais inválidas. Verifique e-mail e senha." });
      }
    } catch {
      toast({ title: "Erro", description: "Erro interno do servidor.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (data: ForgotForm) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok) {
        toast({ title: "E-mail enviado", description: result.message });
        if (result.resetToken) {
          toast({ title: "Token de Reset (DEMO)", description: `Token: ${result.resetToken}` });
        }
        forgotForm.reset();
      } else {
        toast({ title: "Erro", description: result.message || "Erro ao solicitar recuperação.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro", description: "Erro interno do servidor.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

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
        {/* ── Logo + Title ── */}
        <div className="flex flex-col items-center mb-8">
          <div style={{ height: 40, overflow: "hidden", display: "flex", alignItems: "flex-start" }}>
            <img
              src={norteLogo}
              alt="Norte"
              className="object-contain object-left"
              style={{
                maxWidth: 160,
                maxHeight: 54,
                clipPath: "inset(0 0 25% 0)",
              }}
            />
          </div>
          <h1
            className="mt-3 font-bold text-gray-900"
            style={{ fontSize: 24, letterSpacing: "-0.02em" }}
          >
            Logística Interna
          </h1>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 p-1 mb-6" style={{ background: "#f1f5f9", borderRadius: 10 }}>
          {(["login", "recover"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-2 text-sm font-semibold transition-all duration-150"
              style={{
                borderRadius: 8,
                background: activeTab === tab ? "#2563eb" : "transparent",
                color: activeTab === tab ? "#ffffff" : "#64748b",
              }}
            >
              {tab === "login" ? "Entrar" : "Recuperar"}
            </button>
          ))}
        </div>

        {/* ── Tab: Entrar ── */}
        {activeTab === "login" && (
          <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4" noValidate>
            {/* E-mail */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="login-email">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  data-testid="input-email"
                  {...loginForm.register("email")}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-lg outline-none transition-colors"
                  style={{
                    borderColor: loginForm.formState.errors.email ? "#ef4444" : "#e2e8f0",
                    background: "#f8fafc",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = loginForm.formState.errors.email ? "#ef4444" : "#e2e8f0")}
                />
              </div>
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="login-password">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  data-testid="input-password"
                  {...loginForm.register("password")}
                  className="w-full pl-9 pr-10 py-2.5 text-sm border rounded-lg outline-none transition-colors"
                  style={{
                    borderColor: loginForm.formState.errors.password ? "#ef4444" : "#e2e8f0",
                    background: "#f8fafc",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = loginForm.formState.errors.password ? "#ef4444" : "#e2e8f0")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {loginForm.formState.errors.password?.message && loginForm.formState.errors.password.message !== " " && (
                <p className="text-xs text-red-500">{loginForm.formState.errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white rounded-lg transition-all duration-150 mt-2"
              style={{
                background: isLoading ? "#93c5fd" : "#2563eb",
                cursor: isLoading ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.background = "#1d4ed8"; }}
              onMouseLeave={(e) => { if (!isLoading) e.currentTarget.style.background = "#2563eb"; }}
              data-testid="button-login"
            >
              {isLoading ? "Entrando..." : (
                <>Entrar <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
        )}

        {/* ── Tab: Recuperar ── */}
        {activeTab === "recover" && (
          <form onSubmit={forgotForm.handleSubmit(handleForgotPassword)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="recover-email">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                <input
                  id="recover-email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  {...forgotForm.register("email")}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-lg outline-none transition-colors"
                  style={{
                    borderColor: forgotForm.formState.errors.email ? "#ef4444" : "#e2e8f0",
                    background: "#f8fafc",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = forgotForm.formState.errors.email ? "#ef4444" : "#e2e8f0")}
                />
              </div>
              {forgotForm.formState.errors.email && (
                <p className="text-xs text-red-500">{forgotForm.formState.errors.email.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white rounded-lg transition-all duration-150"
              style={{
                background: isLoading ? "#93c5fd" : "#2563eb",
                cursor: isLoading ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.background = "#1d4ed8"; }}
              onMouseLeave={(e) => { if (!isLoading) e.currentTarget.style.background = "#2563eb"; }}
            >
              {isLoading ? "Enviando..." : (
                <>Recuperar Senha <ArrowRight className="w-4 h-4" /></>
              )}
            </button>

            <p className="text-xs text-gray-400 text-center leading-relaxed pt-1">
              Você receberá um e-mail com instruções para redefinir sua senha.
            </p>
          </form>
        )}

        {/* ── Footer ── */}
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
