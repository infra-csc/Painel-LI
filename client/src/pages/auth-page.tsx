import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth, type LoginResult } from "@/hooks/use-auth";
import { useLocation, Redirect } from "wouter";
import { AlertTriangle, ExternalLink, Mail, Lock, Eye, EyeOff, ArrowRight, Clock, Wrench, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/components/common/use-page-title";
import { AuthLayout, AuthHeader } from "@/components/layout/auth-layout";

/**
 * Login por senha SÓ fora de produção (em produção o acesso é pelo Portal
 * Norte, SSO Microsoft). `?visual=producao` existe apenas em desenvolvimento,
 * para conferir o desenho da tela de produção sem publicar — em produção
 * `import.meta.env.DEV` é false e o parâmetro não muda nada.
 */
const isDev = import.meta.env.DEV
  && !(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("visual") === "producao");

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

const MSG_CREDENCIAIS = "Credenciais inválidas. Verifique e-mail e senha.";

/** Mensagem para a falha de `login()` (use-auth) conforme o status devolvido. */
function mensagemDeFalhaDoLogin(res: LoginResult): string {
  if (res.ok) return "";
  const status = res.status ?? 0;
  const message = typeof res.message === "string" && res.message.trim() ? res.message.trim() : "";
  // 400/401/403 são a resposta esperada para senha errada — a mensagem do
  // servidor, se vier, é mais precisa (ex.: "conta inativa").
  if (status === 400 || status === 401 || status === 403) return message || MSG_CREDENCIAIS;
  if (status === 429) return message || "Muitas tentativas. Aguarde um instante e tente de novo.";
  if (status >= 500) return message || "O servidor não respondeu. Tente de novo em instantes.";
  if (status === 0) return message || "Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.";
  return message || MSG_CREDENCIAIS;
}

/** Aviso dentro do formulário (erro de SSO, sessão expirada). */
function Aviso({ tom, icone: Icone, titulo, children, role }: {
  tom: "danger" | "warning";
  icone: typeof AlertTriangle;
  titulo: string;
  children: React.ReactNode;
  role: "alert" | "status";
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-3 p-3.5 mb-6 rounded-xl border",
        tom === "danger" ? "bg-danger-soft border-danger/20" : "bg-warning-soft border-warning/20",
      )}
    >
      <Icone className={cn("w-4 h-4 mt-0.5 shrink-0", tom === "danger" ? "text-danger" : "text-warning")} aria-hidden="true" />
      <div>
        <p className={cn("m-0 text-sm font-semibold", tom === "danger" ? "text-danger" : "text-warning")}>{titulo}</p>
        <p className="m-0 mt-0.5 text-[13px] leading-snug text-foreground/80">{children}</p>
      </div>
    </div>
  );
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
      // `login()` devolve `{ ok, status, message }` (23/09): 429/500/queda de
      // rede mostram o motivo real em vez de "Credenciais inválidas" — que
      // mandava a pessoa redigitar uma senha certa.
      const res = await login(data.email, data.password);
      if (res.ok) {
        setLocation(returnTo);
      } else {
        loginForm.setError("password", { message: mensagemDeFalhaDoLogin(res) });
      }
    } catch {
      loginForm.setError("password", { message: "Não foi possível falar com o servidor. Verifique sua conexão e tente de novo." });
    } finally {
      setIsLoading(false);
    }
  };

  const emailErr = loginForm.formState.errors.email?.message;
  const passErr = loginForm.formState.errors.password?.message;

  return (
    <AuthLayout rodape={<>Problemas para acessar? Fale com o administrador do sistema.</>}>
      <AuthHeader
        titulo="Logística Interna"
        descricao={isDev ? "Entre com o seu e-mail e a sua senha." : "Entre com a sua conta Microsoft pelo Portal Norte."}
        selo={isDev && (
          <span className="inline-flex items-center gap-1.5 h-6 px-2 mb-5 rounded-full bg-warning-soft text-2xs font-semibold text-warning ring-1 ring-inset ring-warning/20">
            <Wrench className="w-3 h-3" aria-hidden="true" />
            Ambiente de desenvolvimento — login por senha
          </span>
        )}
      />

      {/* Erro SSO */}
      {ssoError && (
        <Aviso role="alert" tom="danger" icone={AlertTriangle} titulo={ssoError === "not_registered" ? "Acesso não autorizado" : "Conta inativa"}>
          {ssoError === "not_registered"
            ? "Seu e-mail não está cadastrado no sistema. Solicite acesso ao administrador."
            : "Sua conta está inativa. Entre em contato com o administrador."}
        </Aviso>
      )}

      {sessaoExpirada && !ssoError && (
        <Aviso role="status" tom="warning" icone={Clock} titulo="Sessão expirada">
          Sua sessão terminou por inatividade. Entre novamente para continuar de onde parou.
        </Aviso>
      )}

      {isDev ? (
        /* ── Modo Dev: formulário de login direto ── */
        <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="login-email">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="nome@empresa.com.br"
                aria-invalid={!!emailErr}
                aria-describedby={emailErr ? "login-email-error" : undefined}
                {...loginForm.register("email")}
                className={cn("h-10 pl-9 bg-card", emailErr && "border-destructive focus-visible:ring-destructive")}
              />
            </div>
            {emailErr && (
              <p id="login-email-error" className="text-xs text-destructive" role="alert">{emailErr}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-password">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Sua senha"
                aria-invalid={!!passErr}
                aria-describedby={passErr ? "login-password-error" : undefined}
                {...loginForm.register("password")}
                className={cn("h-10 pl-9 pr-10 bg-card", passErr && "border-destructive focus-visible:ring-destructive")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
            {passErr && (
              <p id="login-password-error" className="text-xs text-destructive" role="alert">{passErr}</p>
            )}
          </div>
          <Button type="submit" disabled={isLoading} aria-busy={isLoading} className="w-full h-10 font-semibold">
            {isLoading
              ? <><Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Entrando…</>
              : <>Entrar <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
          </Button>
        </form>
      ) : (
        /* ── Produção: acesso exclusivo pelo portal ── */
        <div className="space-y-5">
          <ol className="m-0 p-0 list-none space-y-3">
            {[
              "Abra o Portal Norte e entre com a sua conta Microsoft corporativa.",
              "De lá, abra a Logística Interna: você chega aqui já autenticado.",
            ].map((passo, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-foreground/85 leading-snug">
                <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded-full bg-brand-soft text-2xs font-bold text-primary tabular-nums">{i + 1}</span>
                <span className="pt-0.5">{passo}</span>
              </li>
            ))}
          </ol>
          <Button asChild className="w-full h-10 font-semibold">
            <a href="https://norte-app-hub.replit.app/">
              Entrar pelo Portal Norte <ExternalLink className="w-4 h-4" aria-hidden="true" />
            </a>
          </Button>
          <p className="m-0 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5 text-success-strong" aria-hidden="true" />
            Não há senha própria do painel: o acesso é só pelo portal.
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
