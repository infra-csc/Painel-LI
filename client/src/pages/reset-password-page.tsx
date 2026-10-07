import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff, ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/components/common/use-page-title";
import { AuthLayout, AuthHeader } from "@/components/layout/auth-layout";

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token é obrigatório"),
  newPassword: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Senhas não coincidem",
  path: ["confirmPassword"],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

/** Botão de mostrar/ocultar senha com hit area de 32px e aria-label. */
function EyeToggle({ shown, onToggle, label }: { shown: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? `Ocultar ${label}` : `Mostrar ${label}`}
      aria-pressed={shown}
      className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {shown ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
    </button>
  );
}

export default function ResetPasswordPage() {
  usePageTitle("Redefinir senha");
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [done, setDone] = useState(false);

  // Get token from URL parameters
  const urlParams = new URLSearchParams(searchParams);
  const tokenFromUrl = urlParams.get("token") || "";

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: tokenFromUrl,
      newPassword: "",
      confirmPassword: "",
    },
  });

  const handleResetPassword = async (data: ResetPasswordForm) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: data.token,
          newPassword: data.newPassword,
        }),
      });

      if (response.ok) {
        setDone(true);
      } else {
        const error = await response.json().catch(() => ({}));
        toast({
          title: "Erro ao redefinir senha",
          description: error.message || "Token inválido ou expirado",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Não foi possível redefinir a senha",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const errors = form.formState.errors;

  return (
    <AuthLayout
      rodape={done
        ? <>Problemas para acessar? Fale com o administrador do sistema.</>
        : <>O token vale por 1 hora. Se expirou, solicite um novo.</>}
    >
      <AuthHeader
        acima={!done && (
          <button
            type="button"
            onClick={() => setLocation("/auth")}
            data-testid="button-back-to-login"
            className="inline-flex items-center gap-1.5 h-8 -ml-2 mb-4 px-2 rounded-md border-0 bg-transparent text-[13px] font-medium text-muted-foreground cursor-pointer transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Voltar ao login
          </button>
        )}
        titulo={done ? "Senha redefinida" : "Redefinir senha"}
        descricao={done
          ? "Sua senha foi alterada com sucesso."
          : "Cole o token recebido por e-mail e escolha a nova senha."}
      />

      {done ? (
        <div role="status" className="casca-surgir space-y-5">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-success-soft border border-success/20">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-success-strong" aria-hidden="true" />
            <p className="m-0 text-sm text-foreground/85 leading-snug">Você já pode entrar no sistema usando a nova senha.</p>
          </div>
          <Button className="w-full h-10 font-semibold" onClick={() => setLocation("/auth")} data-testid="button-go-to-login">
            Ir para o login <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(handleResetPassword)} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="token">Token de recuperação</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                id="token"
                placeholder="Cole o token recebido por e-mail"
                autoComplete="one-time-code"
                aria-invalid={!!errors.token}
                aria-describedby={errors.token ? "token-error" : undefined}
                className={cn("h-10 pl-9 bg-card font-mono text-[13px] placeholder:font-sans placeholder:text-sm", errors.token && "border-destructive focus-visible:ring-destructive")}
                {...form.register("token")}
                data-testid="input-reset-token"
              />
            </div>
            {errors.token && (
              <p id="token-error" role="alert" className="text-xs text-destructive">{errors.token.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="newPassword">Nova senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                id="newPassword"
                type={showPassword ? "text" : "password"}
                placeholder="Pelo menos 6 caracteres"
                autoComplete="new-password"
                aria-invalid={!!errors.newPassword}
                aria-describedby={errors.newPassword ? "newPassword-error" : undefined}
                className={cn("h-10 pl-9 pr-10 bg-card", errors.newPassword && "border-destructive focus-visible:ring-destructive")}
                {...form.register("newPassword")}
                data-testid="input-new-password"
              />
              <EyeToggle shown={showPassword} onToggle={() => setShowPassword(v => !v)} label="nova senha" />
            </div>
            {errors.newPassword && (
              <p id="newPassword-error" role="alert" className="text-xs text-destructive">{errors.newPassword.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Repita a nova senha"
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
                className={cn("h-10 pl-9 pr-10 bg-card", errors.confirmPassword && "border-destructive focus-visible:ring-destructive")}
                {...form.register("confirmPassword")}
                data-testid="input-confirm-password"
              />
              <EyeToggle shown={showConfirmPassword} onToggle={() => setShowConfirmPassword(v => !v)} label="confirmação da senha" />
            </div>
            {errors.confirmPassword && (
              <p id="confirmPassword-error" role="alert" className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-10 font-semibold"
            disabled={isLoading}
            aria-busy={isLoading}
            data-testid="button-reset-password"
          >
            {isLoading
              ? <><Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Redefinindo…</>
              : "Redefinir senha"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
