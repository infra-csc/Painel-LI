import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import norteLogoUrl from "@assets/b7708c145100409.6298b4cbdc473_1756736810143.jpg";
import { Lock, Mail, User, Building2, Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

const registerSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  confirmPassword: z.string(),
  name: z.string().min(1, "Nome é obrigatório"),
  role: z.enum(["admin", "production", "function_area", "purchasing", "financial"]),
  area: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Senhas não coincidem",
  path: ["confirmPassword"],
});

const forgotPasswordSchema = z.object({
  email: z.string().email("E-mail inválido"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;
type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { user, login } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Redirect if already logged in
  if (user) {
    setLocation("/");
    return null;
  }

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      name: "",
      role: "production",
      area: "",
    },
  });

  const forgotPasswordForm = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const handleLogin = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.mustChangePassword) {
          toast({
            title: "Troca de senha obrigatória",
            description: "O administrador resetou sua senha. Por favor, defina uma nova senha.",
          });
          // Redirect to a password change flow or open a modal
          // For now, let's just log them in but keep the flag
          setLocation("/");
        } else {
          toast({
            title: "Login realizado com sucesso",
            description: "Bem-vindo ao sistema de Logística Interna",
          });
          setLocation("/");
        }
      } else {
        const error = await response.json();
        toast({
          title: "Erro no login",
          description: error.message || "Credenciais inválidas",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro no login",
        description: "Erro interno do servidor",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Cadastro realizado com sucesso",
          description: "Sua conta foi criada. Faça login para continuar.",
        });
        setActiveTab("login");
        loginForm.setValue("email", data.email);
      } else {
        const error = await response.json();
        toast({
          title: "Erro no cadastro",
          description: error.message || "Erro ao criar conta",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro no cadastro",
        description: "Erro interno do servidor",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (data: ForgotPasswordForm) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "E-mail enviado",
          description: result.message,
        });
        // In development, show the reset token
        if (result.resetToken) {
          toast({
            title: "Token de Reset (DEMO)",
            description: `Token: ${result.resetToken}`,
          });
        }
      } else {
        const error = await response.json();
        toast({
          title: "Erro",
          description: error.message || "Erro ao solicitar recuperação",
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

  const getRoleLabel = (role: string) => {
    const labels = {
      admin: "Administrador",
      production: "Logística Interna",
      function_area: "Área responsável por funções",
      purchasing: "Área de Compras/Viagem",
      financial: "Área Financeira",
    };
    return labels[role as keyof typeof labels] || role;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img 
              src={norteLogoUrl} 
              alt="NORTE Marketing Esportivo" 
              className="h-20 w-auto object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Logística Interna</h1>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Acesso ao Sistema</CardTitle>
            <CardDescription className="text-center">
              Entre com sua conta ou crie uma nova
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="register">Cadastrar</TabsTrigger>
                <TabsTrigger value="forgot">Recuperar</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4">
                <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="Digite seu e-mail"
                        className="pl-10"
                        {...loginForm.register("email")}
                        data-testid="input-email"
                      />
                    </div>
                    {loginForm.formState.errors.email && (
                      <p className="text-sm text-red-600">{loginForm.formState.errors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Digite sua senha"
                        className="pl-10 pr-10"
                        {...loginForm.register("password")}
                        data-testid="input-password"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-3 h-4 w-4 text-gray-400 hover:text-gray-600"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? <EyeOff /> : <Eye />}
                      </button>
                    </div>
                    {loginForm.formState.errors.password && (
                      <p className="text-sm text-red-600">{loginForm.formState.errors.password.message}</p>
                    )}
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading}
                    data-testid="button-login"
                  >
                    {isLoading ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="space-y-4">
                <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">Nome Completo</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="register-name"
                        placeholder="Digite seu nome completo"
                        className="pl-10"
                        {...registerForm.register("name")}
                        data-testid="input-register-name"
                      />
                    </div>
                    {registerForm.formState.errors.name && (
                      <p className="text-sm text-red-600">{registerForm.formState.errors.name.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-email">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="Digite seu e-mail"
                        className="pl-10"
                        {...registerForm.register("email")}
                        data-testid="input-register-email"
                      />
                    </div>
                    {registerForm.formState.errors.email && (
                      <p className="text-sm text-red-600">{registerForm.formState.errors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-role">Área</Label>
                    <Select
                      value={registerForm.watch("role")}
                      onValueChange={(value) => registerForm.setValue("role", value as any)}
                    >
                      <SelectTrigger data-testid="select-register-role">
                        <Building2 className="h-4 w-4 mr-2 text-gray-400" />
                        <SelectValue placeholder="Selecione sua área" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="production">Logística Interna</SelectItem>
                        <SelectItem value="function_area">Área responsável por funções</SelectItem>
                        <SelectItem value="purchasing">Área de Compras/Viagem</SelectItem>
                        <SelectItem value="financial">Área Financeira</SelectItem>
                      </SelectContent>
                    </Select>
                    {registerForm.formState.errors.role && (
                      <p className="text-sm text-red-600">{registerForm.formState.errors.role.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-area">Área Específica (Opcional)</Label>
                    <Input
                      id="register-area"
                      placeholder="Ex: Produção São Paulo, Compras RJ"
                      {...registerForm.register("area")}
                      data-testid="input-register-area"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="register-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Digite sua senha"
                        className="pl-10 pr-10"
                        {...registerForm.register("password")}
                        data-testid="input-register-password"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-3 h-4 w-4 text-gray-400 hover:text-gray-600"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff /> : <Eye />}
                      </button>
                    </div>
                    {registerForm.formState.errors.password && (
                      <p className="text-sm text-red-600">{registerForm.formState.errors.password.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-confirm-password">Confirmar Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="register-confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirme sua senha"
                        className="pl-10 pr-10"
                        {...registerForm.register("confirmPassword")}
                        data-testid="input-register-confirm-password"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-3 h-4 w-4 text-gray-400 hover:text-gray-600"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeOff /> : <Eye />}
                      </button>
                    </div>
                    {registerForm.formState.errors.confirmPassword && (
                      <p className="text-sm text-red-600">{registerForm.formState.errors.confirmPassword.message}</p>
                    )}
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading}
                    data-testid="button-register"
                  >
                    {isLoading ? "Criando conta..." : "Criar Conta"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="forgot" className="space-y-4">
                <form onSubmit={forgotPasswordForm.handleSubmit(handleForgotPassword)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="Digite seu e-mail cadastrado"
                        className="pl-10"
                        {...forgotPasswordForm.register("email")}
                        data-testid="input-forgot-email"
                      />
                    </div>
                    {forgotPasswordForm.formState.errors.email && (
                      <p className="text-sm text-red-600">{forgotPasswordForm.formState.errors.email.message}</p>
                    )}
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading}
                    data-testid="button-forgot-password"
                  >
                    {isLoading ? "Enviando..." : "Recuperar Senha"}
                  </Button>

                  <div className="text-center">
                    <p className="text-sm text-gray-600">
                      Você receberá um e-mail com instruções para redefinir sua senha.
                    </p>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            Problemas para acessar? Entre em contato com o administrador do sistema.
          </p>
        </div>
      </div>
    </div>
  );
}