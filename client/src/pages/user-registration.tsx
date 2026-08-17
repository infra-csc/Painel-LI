import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, getAvailableAreas } from "@/lib/role-utils";
import { normalizeRole } from "@shared/roles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { PageContainer } from "@/components/common/page-container";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";

const schema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Digite um e-mail válido"),
  role: z.enum(["admin", "production", "function_area", "purchasing", "financial"], {
    required_error: "Selecione um perfil de acesso",
  }),
  area: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  if (!p[0]) return "";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const ROLES = [
  { value: "admin",         label: "Administrador",     icon: "admin_panel_settings" },
  { value: "production",    label: "Logística Interna", icon: "local_shipping" },
  { value: "function_area", label: "Área de Função",    icon: "lan" },
  { value: "purchasing",    label: "Compras / Viagem",  icon: "shopping_cart" },
  { value: "financial",     label: "RH",                icon: "groups" },
];

// Estilos compartilhados (tokens, sem hex)
const INPUT_BASE = "w-full py-2.5 pr-4 text-sm bg-brand-soft border-[1.5px] border-transparent rounded-lg outline-none text-foreground transition-[border-color,background-color] duration-150 focus:bg-card focus:border-primary placeholder:text-muted-foreground";
const SECTION_TITLE = "text-[11px] font-bold tracking-[0.1em] text-slate-500 uppercase";
const CARD = "bg-card rounded-xl border border-border shadow-sm";
const FIELD_LABEL = "block text-xs font-semibold text-slate-700 mb-1.5 ml-0.5";

const FieldError = ({ msg }: { msg?: string }) =>
  msg ? <p role="alert" className="text-[11px] text-destructive mt-[3px] ml-0.5">{msg}</p> : null;

export default function UserRegistration() {
  usePageTitle("Cadastro de Usuários");
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", area: "" },
  });

  const nameVal  = watch("name") || "";
  const emailVal = watch("email") || "";
  const roleVal  = watch("role");
  const areaVal  = watch("area") || "";

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
  const selectedRole = ROLES.find(r => r.value === roleVal);

  const mutation = useMutation({
    // apiRequest já lança em resposta não-ok (com .status e .body no erro),
    // então o antigo bloco "if (!r.ok)" era inalcançável.
    mutationFn: async (data: FormData) => {
      const r = await apiRequest("POST", "/api/users", data);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Usuário criado", description: "Conta criada com sucesso. O acesso será feito pelo Portal Norte." });
      // Sem isto a tela de Gerenciamento de Usuários continuava mostrando a
      // lista antiga (sem o usuário recém-criado) até um F5.
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      reset();
    },
    onError: (e: any) => {
      const description =
        e?.status === 401 ? "Sua sessão expirou. Entre novamente para continuar." :
        e?.status === 403 ? "Você não tem permissão para cadastrar usuários." :
        e?.body?.message || e?.message || "Tente novamente.";
      toast({ title: "Erro ao criar usuário", description, variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <PageContainer>
        <LoadingState count={4} variant="cards" />
      </PageContainer>
    );
  }

  // Espelha POST /api/users: admin, RH (financial) e Compras (purchasing).
  // Produção enxerga a lista de usuários, mas não cria — aviso em vez de 403.
  if (!hasPermission(user, 'canCreateUsers')) {
    const isProduction = normalizeRole(user?.role) === "production";
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-10 max-w-[420px]">
          <span className={cn("material-symbols-outlined text-[40px]", isProduction ? "text-amber-600" : "text-destructive")}>
            {isProduction ? "info" : "gpp_bad"}
          </span>
          <p className="mt-3 text-[15px] font-bold text-foreground">
            {isProduction ? "Cadastro de usuários indisponível para o seu perfil" : "Acesso restrito"}
          </p>
          <p className="mt-1.5 text-[13px] text-slate-500 leading-normal">
            {isProduction
              ? "Solicite ao RH ou à área de Compras a criação de novos usuários. Você continua podendo aprovar, resetar senha e ativar/desativar contas em Usuários."
              : "Apenas administradores, RH e Compras podem cadastrar usuários."}
          </p>
        </div>
      </div>
    );
  }

  const inputClass = (hasError?: boolean, valid?: boolean) =>
    cn(INPUT_BASE, "pl-[38px]", hasError ? "border-destructive" : valid ? "border-green-500" : undefined);

  return (
    <PageContainer className="max-w-[920px]">

      {/* Page header */}
      <PageHeader
        icon={UserPlus}
        title="Cadastro de Usuários"
        subtitle="O acesso ao sistema é feito exclusivamente pelo Portal Norte (Microsoft)"
        actions={
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 rounded-full text-[11px] font-bold text-amber-800 uppercase tracking-[0.05em]">
            <span className="material-symbols-outlined text-sm [font-variation-settings:'FILL'_1]">lock</span>
            Acesso restrito
          </div>
        }
        className="border-b border-border pb-3"
      />

      {/* Microsoft SSO notice */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-brand-soft border border-primary/20 rounded-[10px]">
        <span className="material-symbols-outlined text-xl text-primary shrink-0">info</span>
        <p className="text-xs text-primary m-0 leading-normal">
          <strong>Login via Microsoft:</strong> Não é necessário senha. O usuário cadastrado aqui acessa o sistema pelo Portal Norte usando a conta Microsoft corporativa.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-3 items-start">

        {/* ── Form card ── */}
        <form onSubmit={handleSubmit(d => { if (mutation.isPending) return; mutation.mutate(d); })} className="min-w-0">
          <div className={cn(CARD, "overflow-hidden")}>

            {/* Section 1: Dados Pessoais */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-border/50">
              <div className="flex items-center gap-2 mb-3 text-slate-400">
                <span className="material-symbols-outlined text-lg">person</span>
                <span className={SECTION_TITLE}>Dados Pessoais</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Nome */}
                <div>
                  <label htmlFor="user-name" className={FIELD_LABEL}>
                    Nome completo <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-lg text-slate-400 pointer-events-none" aria-hidden="true">person</span>
                    <input
                      id="user-name"
                      placeholder="Ex: Ana Silva"
                      data-testid="input-name"
                      aria-invalid={!!errors.name}
                      className={inputClass(!!errors.name)}
                      {...register("name")}
                    />
                  </div>
                  <FieldError msg={errors.name?.message} />
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="user-email" className={FIELD_LABEL}>
                    E-mail corporativo <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <span className={cn("material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-lg pointer-events-none", emailVal && isEmailValid ? "text-green-500" : "text-slate-400")} aria-hidden="true">mail</span>
                    <input
                      id="user-email"
                      type="email"
                      placeholder="ana.silva@empresa.com"
                      data-testid="input-email"
                      aria-invalid={!!errors.email}
                      className={cn(inputClass(!!errors.email, emailVal ? isEmailValid : undefined), "pr-9")}
                      {...register("email")}
                    />
                    {emailVal && (
                      <span className={cn("material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[15px] [font-variation-settings:'FILL'_1] pointer-events-none", isEmailValid ? "text-green-500" : "text-slate-300")} aria-hidden="true">
                        {isEmailValid ? "check_circle" : "radio_button_unchecked"}
                      </span>
                    )}
                  </div>
                  <FieldError msg={errors.email?.message} />
                </div>
              </div>
            </div>

            {/* Section 2: Perfil de Acesso */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-border/50">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="material-symbols-outlined text-lg text-slate-400">shield</span>
                <span className={SECTION_TITLE}>Perfil de Acesso</span>
                {errors.role && <span role="alert" className="ml-auto text-[10px] text-destructive font-semibold">{errors.role.message}</span>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {/* POST /api/users: só admin cria outro Administrador */}
                {ROLES.filter(r => r.value !== "admin" || normalizeRole(user?.role) === "admin").map(role => {
                  const isSelected = roleVal === role.value;
                  return (
                    <button key={role.value} type="button"
                      aria-pressed={isSelected}
                      onClick={() => setValue("role", role.value as FormData["role"], { shouldValidate: true })}
                      className={cn(
                        "relative flex flex-col items-center justify-center text-center gap-1 px-2 py-2.5 rounded-[10px] border-2 transition-all duration-150 cursor-pointer",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        isSelected ? "border-primary bg-primary/10" : "border-transparent bg-brand-soft hover:border-primary/30",
                      )}
                    >
                      <span className="material-symbols-outlined text-xl text-primary [font-variation-settings:'FILL'_1]" aria-hidden="true">
                        {role.icon}
                      </span>
                      <span className="text-[11px] font-bold text-foreground leading-[1.3]">{role.label}</span>
                      {isSelected && (
                        <span className="material-symbols-outlined absolute top-2 right-2 text-sm text-primary [font-variation-settings:'FILL'_1]" aria-hidden="true">check_circle</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Área Específica */}
            <div className="px-4 sm:px-5 py-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="material-symbols-outlined text-lg text-slate-400">location_on</span>
                <span className={SECTION_TITLE}>Área Específica</span>
                <span className="ml-auto text-[10px] text-slate-300">{areaVal.length}/80 · opcional</span>
              </div>
              {/* Input com sugestões (datalist) das áreas conhecidas — aceita valor livre */}
              <input
                id="user-area"
                list="user-area-options"
                placeholder="Ex.: Técnica, Cenografia, Logística Interna..."
                data-testid="input-area"
                aria-label="Área específica do usuário"
                maxLength={80}
                autoComplete="off"
                className={cn(INPUT_BASE, "text-[13px] px-3 border-input")}
                {...register("area")}
              />
              <datalist id="user-area-options">
                {getAvailableAreas().map(a => <option key={a} value={a} />)}
              </datalist>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 px-4 sm:px-5 py-2.5 bg-muted/30 border-t border-border/50">
              <Button type="button" variant="outline" size="sm" onClick={() => reset()} data-testid="button-clear" disabled={mutation.isPending}
                className="h-[34px] text-xs font-semibold text-slate-500">
                Limpar
              </Button>
              <Button type="submit" size="sm" disabled={mutation.isPending} data-testid="button-submit"
                className="h-[34px] text-xs font-bold shadow-sm shadow-primary/30 hover:bg-primary-hover disabled:shadow-none">
                {mutation.isPending ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[17px] [font-variation-settings:'FILL'_1]">person_add</span>
                    Criar Usuário
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>

        {/* ── Sidebar ── */}
        <aside className="flex flex-col gap-2.5">

          {/* Preview card */}
          <div className={cn(CARD, "px-4 py-3.5")}>
            <h3 className="text-[11px] font-bold text-slate-400 tracking-[0.08em] uppercase m-0 mb-3">Pré-visualização</h3>
            <div className="flex flex-col items-center">
              <div className={cn(
                "flex items-center justify-center w-14 h-14 rounded-full shrink-0 text-primary text-lg font-bold mb-2 shadow-[inset_0_2px_4px_hsl(226_100%_40%/0.1)] transition-colors duration-200",
                nameVal ? "bg-primary/15" : "bg-brand-soft",
              )}>
                {nameVal
                  ? initials(nameVal)
                  : <span className="material-symbols-outlined text-[22px] text-slate-300">person</span>}
              </div>
              <p className={cn("text-[13px] font-bold m-0 mb-0.5 text-center", nameVal ? "text-foreground" : "text-slate-300")}>
                {nameVal || "Nome do usuário"}
              </p>
              <p className={cn("text-[11px] m-0 mb-2.5 text-center max-w-full truncate", emailVal && isEmailValid ? "text-slate-700" : "text-slate-300")}>
                {emailVal && isEmailValid ? emailVal : "email@empresa.com"}
              </p>
              {selectedRole ? (
                <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-full uppercase tracking-[0.05em]">
                  {selectedRole.label}
                </span>
              ) : (
                <span className="px-3 py-1 bg-brand-soft text-slate-300 text-[10px] font-bold rounded-full uppercase tracking-[0.05em]">
                  Sem perfil
                </span>
              )}
            </div>
          </div>

          {/* Checklist card */}
          <div className={cn(CARD, "px-4 py-3.5")}>
            <h3 className="text-[11px] font-bold text-slate-400 tracking-[0.08em] uppercase m-0 mb-3">Status do Cadastro</h3>
            <ul className="list-none m-0 p-0 flex flex-col gap-2">
              {[
                { label: "Nome identificado",         ok: nameVal.length >= 2 },
                { label: "E-mail corporativo válido", ok: isEmailValid },
                { label: "Perfil selecionado",        ok: !!roleVal },
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <span className={cn("material-symbols-outlined text-lg [font-variation-settings:'FILL'_1] shrink-0 transition-colors duration-200", item.ok ? "text-green-500" : "text-slate-200")}>
                    {item.ok ? "check_circle" : "radio_button_checked"}
                  </span>
                  <span className={cn("text-xs font-medium", item.ok ? "text-slate-700" : "text-slate-400")}>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Microsoft SSO note */}
          <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-brand-soft rounded-lg border border-primary/20">
            <span className="material-symbols-outlined text-sm text-primary">verified_user</span>
            <span className="text-[10px] font-semibold tracking-[0.04em] text-primary">Acesso via Microsoft 365</span>
          </div>
        </aside>
      </div>
    </PageContainer>
  );
}
