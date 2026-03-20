import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { Eye, EyeOff } from "lucide-react";

const userRegistrationSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Digite um e-mail válido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  role: z.enum(["admin", "production", "function_area", "purchasing", "financial"], {
    required_error: "Selecione um perfil de acesso",
  }),
  area: z.string().optional(),
});

type UserRegistrationData = z.infer<typeof userRegistrationSchema>;

function getPasswordStrength(pw: string) {
  if (!pw) return { score: 0, label: "", color: "#E2E8F0" };
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: s, label: "Fraca", color: "#EF4444" };
  if (s <= 3) return { score: s, label: "Média", color: "#F59E0B" };
  return { score: s, label: "Forte", color: "#22C55E" };
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const ROLES = [
  {
    value: "admin",
    label: "Administrador",
    desc: "Acesso completo ao sistema",
    icon: "admin_panel_settings",
    color: "#7C3AED",
    bg: "#F5F3FF",
  },
  {
    value: "production",
    label: "Logística Interna",
    desc: "Escalações e eventos",
    icon: "local_shipping",
    color: "#0033CC",
    bg: "#EEF2FF",
  },
  {
    value: "function_area",
    label: "Área de Função",
    desc: "Responsável por funções",
    icon: "work",
    color: "#EA580C",
    bg: "#FFF7ED",
  },
  {
    value: "purchasing",
    label: "Compras / Viagem",
    desc: "Passagens e hospedagem",
    icon: "shopping_cart",
    color: "#0891B2",
    bg: "#ECFEFF",
  },
  {
    value: "financial",
    label: "Financeiro",
    desc: "Prestações de contas",
    icon: "account_balance_wallet",
    color: "#059669",
    bg: "#ECFDF5",
  },
];

const BLUE = "#0033CC";
const BLUE_BG = "#EEF2FF";

const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#64748B",
  textTransform: "uppercase", letterSpacing: "0.06em",
  marginBottom: 5, display: "block",
};

const inp: React.CSSProperties = {
  height: 38, fontSize: 13, padding: "0 12px",
  border: "1px solid #E2E8F0", borderRadius: 8,
  background: "white", outline: "none", width: "100%",
  boxSizing: "border-box", color: "#1E293B", fontFamily: "inherit",
  transition: "border-color 0.15s",
};

export default function UserRegistration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");

  const form = useForm<UserRegistrationData>({
    resolver: zodResolver(userRegistrationSchema),
    defaultValues: { name: "", email: "", password: "", area: "" },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: UserRegistrationData) => {
      const r = await apiRequest("POST", "/api/users", data);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Usuário criado", description: "Conta criada com sucesso." });
      form.reset();
      setPasswordValue("");
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao criar usuário", description: e.message || "Tente novamente.", variant: "destructive" });
    },
  });

  if (!hasPermission(user, 'canAccessScreen0')) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, color: "#EF4444" }}>gpp_bad</span>
          <p style={{ marginTop: 12, fontSize: 14, color: "#64748B" }}>Apenas administradores podem acessar esta página.</p>
        </div>
      </div>
    );
  }

  const onSubmit = (data: UserRegistrationData) => createUserMutation.mutate(data);
  const emailVal = form.watch("email");
  const roleVal = form.watch("role");
  const nameVal = form.watch("name");
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
  const pwStrength = getPasswordStrength(passwordValue);
  const selectedRole = ROLES.find(r => r.value === roleVal);

  return (
    <div style={{ padding: "24px 24px", maxWidth: 900, margin: "0 auto" }}>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: BLUE,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: "white", fontVariationSettings: "'FILL' 1" }}>person_add</span>
        </div>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0, lineHeight: 1.2 }}>Cadastro de Usuários</h1>
          <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>Crie uma nova conta de acesso ao sistema</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "#FEF3C7", borderRadius: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#D97706", fontVariationSettings: "'FILL' 1" }}>lock</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#D97706" }}>Acesso restrito</span>
        </div>
      </div>

      {/* Main layout: form + sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "start" }}>

        {/* ── Form card ── */}
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #E8ECF8", overflow: "hidden" }}>

          {/* Section: Dados pessoais */}
          <div style={{ padding: "18px 20px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#94A3B8" }}>person</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>Dados Pessoais</span>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>

                  {/* Nome */}
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <label style={lbl}>Nome Completo <span style={{ color: "#EF4444" }}>*</span></label>
                      <FormControl>
                        <div style={{ position: "relative" }}>
                          <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "#CBD5E1" }}>person</span>
                          <input
                            placeholder="Ex: Ana Silva"
                            data-testid="input-name"
                            style={{ ...inp, paddingLeft: 32 }}
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage style={{ fontSize: 11 }} />
                    </FormItem>
                  )} />

                  {/* Email */}
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <label style={lbl}>E-mail <span style={{ color: "#EF4444" }}>*</span></label>
                      <FormControl>
                        <div style={{ position: "relative" }}>
                          <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "#CBD5E1" }}>mail</span>
                          <input
                            type="email"
                            placeholder="email@empresa.com"
                            data-testid="input-email"
                            style={{
                              ...inp, paddingLeft: 32, paddingRight: 32,
                              borderColor: emailVal ? (isEmailValid ? "#22C55E" : "#E2E8F0") : "#E2E8F0",
                            }}
                            {...field}
                          />
                          {emailVal && (
                            <span className="material-symbols-outlined" style={{
                              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                              fontSize: 15, color: isEmailValid ? "#22C55E" : "#CBD5E1",
                              fontVariationSettings: "'FILL' 1",
                            }}>{isEmailValid ? "check_circle" : "radio_button_unchecked"}</span>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage style={{ fontSize: 11 }} />
                    </FormItem>
                  )} />
                </div>

                {/* Senha */}
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <label style={lbl}>Senha <span style={{ color: "#EF4444" }}>*</span></label>
                    <FormControl>
                      <div>
                        <div style={{ position: "relative" }}>
                          <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "#CBD5E1" }}>lock</span>
                          <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Mínimo 6 caracteres"
                            data-testid="input-password"
                            style={{ ...inp, paddingLeft: 32, paddingRight: 36 }}
                            {...field}
                            onChange={(e) => { field.onChange(e); setPasswordValue(e.target.value); }}
                          />
                          <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex" }}>
                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                        {passwordValue && (
                          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ display: "flex", gap: 3, flex: 1 }}>
                              {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} style={{
                                  height: 3, flex: 1, borderRadius: 2,
                                  background: i <= pwStrength.score ? pwStrength.color : "#E2E8F0",
                                  transition: "background 0.2s",
                                }} />
                              ))}
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 600, color: pwStrength.color, minWidth: 36 }}>{pwStrength.label}</span>
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage style={{ fontSize: 11 }} />
                  </FormItem>
                )} />

              </form>
            </Form>
          </div>

          {/* Section: Perfil de acesso */}
          <div style={{ padding: "18px 20px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#94A3B8" }}>shield</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>Perfil de Acesso</span>
              {form.formState.errors.role && (
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#EF4444", fontWeight: 600 }}>
                  {form.formState.errors.role.message}
                </span>
              )}
            </div>

            <FormField control={form.control} name="role" render={({ field }) => (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {ROLES.map(role => {
                  const isSelected = field.value === role.value;
                  return (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => field.onChange(role.value)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "flex-start",
                        gap: 6, padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                        border: isSelected ? `1.5px solid ${role.color}` : "1.5px solid #E8ECF8",
                        background: isSelected ? role.bg : "white",
                        transition: "all 0.15s", textAlign: "left",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                        <span className="material-symbols-outlined"
                          style={{ fontSize: 18, color: isSelected ? role.color : "#CBD5E1", fontVariationSettings: isSelected ? "'FILL' 1" : "'FILL' 0" }}>
                          {role.icon}
                        </span>
                        {isSelected && (
                          <span className="material-symbols-outlined" style={{ fontSize: 13, color: role.color, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        )}
                      </div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: isSelected ? role.color : "#374151", margin: 0, lineHeight: 1.3 }}>{role.label}</p>
                        <p style={{ fontSize: 10, color: "#94A3B8", margin: 0, lineHeight: 1.3 }}>{role.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )} />
          </div>

          {/* Section: Área específica */}
          <div style={{ padding: "18px 20px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#94A3B8" }}>location_on</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>Área Específica</span>
              <span style={{ fontSize: 10, color: "#CBD5E1", marginLeft: 2 }}>(opcional)</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#CBD5E1" }}>
                {(form.watch("area")?.length || 0)}/80
              </span>
            </div>
            <FormField control={form.control} name="area" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    placeholder="Ex: Som, Iluminação, Cenografia, Palco..."
                    data-testid="input-area"
                    maxLength={80}
                    rows={2}
                    className="resize-none text-sm rounded-lg border-slate-200 bg-white focus:border-[#0033CC] focus:ring-1 focus:ring-[#0033CC]/20"
                    style={{ fontSize: 13 }}
                    {...field}
                  />
                </FormControl>
                <FormMessage style={{ fontSize: 11 }} />
              </FormItem>
            )} />
          </div>

          {/* Footer: actions */}
          <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FAFBFF" }}>
            <button
              type="button"
              onClick={() => { form.reset(); setPasswordValue(""); }}
              data-testid="button-clear"
              style={{
                height: 36, padding: "0 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                border: "1px solid #E2E8F0", background: "white", color: "#64748B",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Limpar
            </button>
            <button
              type="submit"
              form="user-reg-form"
              disabled={createUserMutation.isPending}
              data-testid="button-submit"
              onClick={form.handleSubmit(onSubmit)}
              style={{
                height: 36, padding: "0 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: "none", background: BLUE, color: "white",
                cursor: createUserMutation.isPending ? "not-allowed" : "pointer",
                opacity: createUserMutation.isPending ? 0.7 : 1,
                display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit",
              }}
            >
              {createUserMutation.isPending ? (
                <>
                  <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", display: "inline-block" }} className="animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>person_add</span>
                  Criar Usuário
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Preview card */}
          <div style={{ background: "white", borderRadius: 12, border: "1px solid #E8ECF8", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #F1F5F9" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>Pré-visualização</span>
            </div>
            <div style={{ padding: "16px 14px" }}>
              {/* Avatar */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: nameVal ? BLUE : "#E2E8F0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: nameVal ? "white" : "#94A3B8", fontSize: 14, fontWeight: 700,
                  transition: "background 0.2s",
                }}>
                  {nameVal ? initials(nameVal) : <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#94A3B8" }}>person</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: nameVal ? "#0F172A" : "#CBD5E1", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {nameVal || "Nome do usuário"}
                  </p>
                  <p style={{ fontSize: 11, color: emailVal && isEmailValid ? "#64748B" : "#CBD5E1", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {emailVal && isEmailValid ? emailVal : "email@empresa.com"}
                  </p>
                </div>
              </div>

              {/* Role badge */}
              {selectedRole ? (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 6,
                  background: selectedRole.bg, border: `1px solid ${selectedRole.color}22`,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13, color: selectedRole.color, fontVariationSettings: "'FILL' 1" }}>{selectedRole.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: selectedRole.color }}>{selectedRole.label}</span>
                </div>
              ) : (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 6, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#CBD5E1" }}>shield</span>
                  <span style={{ fontSize: 11, color: "#CBD5E1" }}>Sem perfil</span>
                </div>
              )}
            </div>
          </div>

          {/* Checklist card */}
          <div style={{ background: "white", borderRadius: 12, border: "1px solid #E8ECF8", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #F1F5F9" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>Checklist</span>
            </div>
            <div style={{ padding: "12px 14px" }}>
              {[
                { label: "Nome preenchido", ok: nameVal.length >= 2 },
                { label: "E-mail válido", ok: isEmailValid },
                { label: "Senha segura", ok: passwordValue.length >= 6 },
                { label: "Perfil selecionado", ok: !!roleVal },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: i < 3 ? 8 : 0 }}>
                  <span className="material-symbols-outlined" style={{
                    fontSize: 15, fontVariationSettings: "'FILL' 1",
                    color: item.ok ? "#22C55E" : "#E2E8F0",
                    transition: "color 0.2s",
                  }}>check_circle</span>
                  <span style={{ fontSize: 12, color: item.ok ? "#374151" : "#CBD5E1", fontWeight: item.ok ? 500 : 400 }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Security note */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #F1F5F9" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#CBD5E1" }}>encrypted</span>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>Dados criptografados e protegidos</span>
          </div>
        </div>
      </div>
    </div>
  );
}
