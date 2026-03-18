import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import {
  UserPlus, Shield, User, Mail, Lock, Eye, EyeOff,
  Check, Briefcase, Settings, CreditCard,
  ShoppingCart, CheckCircle, AlertCircle,
} from "lucide-react";

const userRegistrationSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Digite um e-mail válido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  role: z.enum(["admin", "production", "function_area", "purchasing", "financial"], {
    required_error: "Selecione uma área",
  }),
  area: z.string().optional(),
});

type UserRegistrationData = z.infer<typeof userRegistrationSchema>;

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { score, label: "Fraca", color: "bg-red-500" };
  if (score <= 3) return { score, label: "Média", color: "bg-amber-400" };
  return { score, label: "Forte", color: "bg-emerald-500" };
}

const ROLE_OPTIONS = [
  { value: "admin",         label: "Administrador",                    icon: Shield,      desc: "Acesso completo ao sistema" },
  { value: "production",    label: "Logística Interna",                icon: Briefcase,   desc: "Gerencia escalações e eventos" },
  { value: "function_area", label: "Área responsável por funções",     icon: Settings,    desc: "Responsável por funções de evento" },
  { value: "purchasing",    label: "Área de Compras/Viagem",           icon: ShoppingCart,desc: "Gerencia compras e viagens" },
  { value: "financial",     label: "Área Financeira",                  icon: CreditCard,  desc: "Gerencia prestações de contas" },
];

export default function UserRegistration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");

  if (!hasPermission(user, 'canAccessScreen0')) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-10 text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-6 h-6 text-red-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-2">Acesso Negado</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Apenas administradores podem acessar o cadastro de usuários.</p>
        </div>
      </div>
    );
  }

  const form = useForm<UserRegistrationData>({
    resolver: zodResolver(userRegistrationSchema),
    defaultValues: { name: "", email: "", password: "", area: "" },
  });

  const createUserMutation = useMutation({
    mutationFn: async (userData: UserRegistrationData) => {
      const response = await apiRequest("POST", "/api/users", userData);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Usuário criado", description: "Conta criada com sucesso." });
      form.reset();
      setPasswordValue("");
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar usuário", description: error.message || "Tente novamente.", variant: "destructive" });
    },
  });

  const onSubmit = (data: UserRegistrationData) => createUserMutation.mutate(data);

  const emailValue = form.watch("email");
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
  const pwStrength = getPasswordStrength(passwordValue);

  return (
    <div className="flex items-start justify-center py-8 px-4">
      <div className="w-full max-w-2xl">

        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">

          {/* Top accent bar */}
          <div className="bg-indigo-50/60 dark:bg-indigo-950/20 px-8 py-3 border-b border-indigo-100 dark:border-indigo-900/30 flex items-center gap-2">
            <Shield className="w-[15px] h-[15px] text-indigo-400 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acesso restrito — Administrador</span>
          </div>

          {/* Header */}
          <div className="px-8 lg:px-10 pt-8 pb-6">
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center shrink-0">
                <UserPlus className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">Cadastro de Usuários</h1>
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Preencha os dados para criar uma nova conta no sistema</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="px-8 lg:px-10 pb-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

                {/* Row 1: Nome + Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Nome */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Nome Completo <span className="text-orange-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                              placeholder="Ex: Ana Silva"
                              data-testid="input-name"
                              className="pl-10 h-11 text-sm border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />

                  {/* Email */}
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          E-mail <span className="text-orange-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                              type="email"
                              placeholder="email@empresa.com"
                              data-testid="input-email"
                              className={`pl-10 pr-10 h-11 text-sm rounded-xl transition-all ${
                                emailValue && isEmailValid
                                  ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/30 dark:bg-emerald-900/10 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10'
                                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10'
                              }`}
                              {...field}
                            />
                            {emailValue && isEmailValid && (
                              <CheckCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                            )}
                            {emailValue && !isEmailValid && (
                              <AlertCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                            )}
                          </div>
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Row 2: Senha + Role */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Senha */}
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Senha <span className="text-orange-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <div className="relative">
                              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Mínimo 6 caracteres"
                                data-testid="input-password"
                                className="pl-10 pr-10 h-11 text-sm border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  setPasswordValue(e.target.value);
                                }}
                              />
                              <button
                                type="button"
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex={-1}
                              >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                            {passwordValue && (
                              <div className="space-y-1">
                                <div className="flex gap-1">
                                  {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= pwStrength.score ? pwStrength.color : 'bg-gray-100 dark:bg-slate-700'}`} />
                                  ))}
                                </div>
                                <span className={`text-[11px] font-semibold ${
                                  pwStrength.score <= 1 ? 'text-red-500' :
                                  pwStrength.score <= 3 ? 'text-amber-500' : 'text-emerald-600'
                                }`}>{pwStrength.label}</span>
                              </div>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />

                  {/* Role */}
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Tipo de acesso <span className="text-orange-500">*</span>
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-role" className="h-11 text-sm border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all">
                              <SelectValue placeholder="Selecione o perfil" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-xl">
                            {ROLE_OPTIONS.map(opt => {
                              const Icon = opt.icon;
                              return (
                                <SelectItem key={opt.value} value={opt.value} className="py-2.5">
                                  <div className="flex items-center gap-2">
                                    <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span>{opt.label}</span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        {field.value && (() => {
                          const opt = ROLE_OPTIONS.find(o => o.value === field.value);
                          return opt ? (
                            <p className="text-[11px] text-slate-400 mt-1">{opt.desc}</p>
                          ) : null;
                        })()}
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Row 3: Área — full width */}
                <FormField
                  control={form.control}
                  name="area"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Área Específica <span className="text-slate-400 font-normal text-xs">(opcional)</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            placeholder="Ex: Som, Iluminação, Cenografia, Palco..."
                            data-testid="input-area"
                            maxLength={80}
                            className="h-11 text-sm border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all pr-14"
                            {...field}
                          />
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-300 tabular-nums">
                            {(field.value?.length || 0)}/80
                          </span>
                        </div>
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />

                {/* Divider + Footer */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => { form.reset(); setPasswordValue(""); }}
                      data-testid="button-clear"
                      className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
                    >
                      Limpar
                    </button>

                    <button
                      type="submit"
                      disabled={createUserMutation.isPending}
                      data-testid="button-submit"
                      className="flex items-center gap-2 px-7 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-200 dark:shadow-none hover:shadow-md hover:shadow-indigo-200/50 transition-all"
                    >
                      {createUserMutation.isPending ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Criando...
                        </span>
                      ) : (
                        <>
                          <Check className="w-4 h-4" strokeWidth={3} />
                          Criar Usuário
                        </>
                      )}
                    </button>
                  </div>

                  {/* Security note */}
                  <div className="flex items-center justify-center gap-1.5 mt-5">
                    <Lock className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                    <span className="text-[10px] text-slate-400 dark:text-slate-600">Os dados são criptografados e protegidos</span>
                  </div>
                </div>

              </form>
            </Form>
          </div>
        </div>

      </div>
    </div>
  );
}
