import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff, ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/components/common/use-page-title";
import norteLogo from "@assets/image_1776349526988.png";

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
      className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro interno do servidor",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const errors = form.formState.errors;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-brand-soft to-secondary">
      <div className="w-full max-w-[420px] bg-card rounded-[20px] shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-6 sm:p-10">
        {/* Logo + Title (mesma casca do login) */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-10 overflow-hidden flex items-start">
            <img
              src={norteLogo}
              alt="Norte"
              className="object-contain object-left max-w-[160px] max-h-[54px] [clip-path:inset(0_0_25%_0)]"
            />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
            {done ? "Senha redefinida" : "Redefinir senha"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            {done
              ? "Sua senha foi alterada com sucesso."
              : "Informe o token recebido por e-mail e escolha a nova senha"}
          </p>
        </div>

        {done ? (
          <div role="status" className="flex flex-col items-center text-center gap-4 py-6 px-4 rounded-2xl bg-brand-soft border border-primary/20">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Você já pode entrar no sistema usando a nova senha.
            </p>
            <Button className="w-full font-semibold hover:bg-primary-hover" onClick={() => setLocation("/auth")} data-testid="button-go-to-login">
              Ir para o login
            </Button>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(handleResetPassword)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="token">Token de recuperação</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60 pointer-events-none" />
                <Input
                  id="token"
                  placeholder="Cole o token recebido por e-mail"
                  autoComplete="one-time-code"
                  aria-invalid={!!errors.token}
                  aria-describedby={errors.token ? "token-error" : undefined}
                  className={cn("pl-9 bg-muted/40", errors.token && "border-destructive focus-visible:ring-destructive")}
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
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60 pointer-events-none" />
                <Input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Digite sua nova senha"
                  autoComplete="new-password"
                  aria-invalid={!!errors.newPassword}
                  aria-describedby={errors.newPassword ? "newPassword-error" : undefined}
                  className={cn("pl-9 pr-10 bg-muted/40", errors.newPassword && "border-destructive focus-visible:ring-destructive")}
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
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60 pointer-events-none" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirme sua nova senha"
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirmPassword}
                  aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
                  className={cn("pl-9 pr-10 bg-muted/40", errors.confirmPassword && "border-destructive focus-visible:ring-destructive")}
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
              className="w-full mt-2 font-semibold hover:bg-primary-hover"
              disabled={isLoading}
              data-testid="button-reset-password"
            >
              {isLoading ? "Redefinindo..." : "Redefinir senha"}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/auth")}
              data-testid="button-back-to-login"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao login
            </Button>
          </form>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-border text-center">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {done
              ? "Problemas para acessar? Entre em contato com o administrador do sistema."
              : "O token é válido por 1 hora. Se expirou, solicite um novo."}
          </p>
        </div>
      </div>
    </div>
  );
}
