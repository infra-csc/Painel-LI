import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";

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

const PRIMARY = "#004ac6";
const PRIMARY_FIXED = "#dbe1ff";

const inputBase: React.CSSProperties = {
  width: "100%",
  paddingTop: 10,
  paddingBottom: 10,
  paddingRight: 16,
  fontSize: 14,
  background: "#f1f3ff",
  border: "1.5px solid transparent",
  borderRadius: 8,
  outline: "none",
  color: "#141b2b",
  fontFamily: "inherit",
  boxSizing: "border-box",
  transition: "border-color 0.15s, background 0.15s",
};

const FieldError = ({ msg }: { msg?: string }) =>
  msg ? <p style={{ fontSize: 11, color: "#EF4444", marginTop: 3, marginLeft: 2 }}>{msg}</p> : null;

export default function UserRegistration() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [focusedField, setFocusedField] = useState<string | null>(null);

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
    mutationFn: async (data: FormData) => {
      const r = await apiRequest("POST", "/api/users", data);
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.message || "Erro ao criar usuário");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Usuário criado", description: "Conta criada com sucesso. O acesso será feito pelo Portal Norte." });
      reset();
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao criar usuário", description: e.message || "Tente novamente.", variant: "destructive" });
    },
  });

  if (!hasPermission(user, 'canAccessAdminUsers')) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, color: "#EF4444" }}>gpp_bad</span>
          <p style={{ marginTop: 12, fontSize: 14, color: "#64748B" }}>Você não tem permissão para acessar esta página.</p>
        </div>
      </div>
    );
  }

  const inputStyle = (field: string, hasError?: boolean, valid?: boolean): React.CSSProperties => ({
    ...inputBase,
    paddingLeft: 38,
    borderColor: hasError ? "#EF4444" : valid ? "#22C55E" : focusedField === field ? PRIMARY : "transparent",
    background: focusedField === field ? "white" : "#f1f3ff",
  });

  return (
    <div style={{ padding: "16px 24px", maxWidth: 920, margin: "0 auto" }}>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e9edff", paddingBottom: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 1px 3px rgba(0,74,198,0.25)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "white", fontVariationSettings: "'FILL' 1" }}>person_add</span>
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0, lineHeight: 1.2, letterSpacing: "-0.02em" }}>Cadastro de Usuários</h1>
            <p style={{ fontSize: 12, color: "#94A3B8", margin: 0, fontWeight: 500 }}>O acesso ao sistema é feito exclusivamente pelo Portal Norte (Microsoft)</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "#FEF3C7", borderRadius: 9999, fontSize: 11, fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: "'FILL' 1" }}>lock</span>
          Acesso restrito
        </div>
      </div>

      {/* Microsoft SSO notice */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 14, background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#2563EB", flexShrink: 0 }}>info</span>
        <p style={{ fontSize: 12, color: "#1E40AF", margin: 0, lineHeight: 1.5 }}>
          <strong>Login via Microsoft:</strong> Não é necessário senha. O usuário cadastrado aqui acessa o sistema pelo Portal Norte usando a conta Microsoft corporativa.
        </p>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "flex", gap: 12, alignItems: "start", flexWrap: "wrap" }}>

        {/* ── Form card ── */}
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: "white", borderRadius: 12, border: "1px solid #E8ECF8", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "hidden" }}>

            {/* Section 1: Dados Pessoais */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(233,237,255,0.5)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "#94A3B8" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#505f76", textTransform: "uppercase" }}>Dados Pessoais</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Nome */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#434655", marginBottom: 6, marginLeft: 2 }}>
                    Nome completo <span style={{ color: "#EF4444" }}>*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: "#94A3B8" }}>person</span>
                    <input
                      placeholder="Ex: Ana Silva"
                      data-testid="input-name"
                      style={inputStyle("name", !!errors.name)}
                      {...register("name")}
                      onFocus={() => setFocusedField("name")}
                      onBlur={() => setFocusedField(null)}
                    />
                  </div>
                  <FieldError msg={errors.name?.message} />
                </div>

                {/* Email */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#434655", marginBottom: 6, marginLeft: 2 }}>
                    E-mail corporativo <span style={{ color: "#EF4444" }}>*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: emailVal && isEmailValid ? "#22C55E" : "#94A3B8" }}>mail</span>
                    <input
                      type="email"
                      placeholder="ana.silva@empresa.com"
                      data-testid="input-email"
                      style={{ ...inputStyle("email", !!errors.email, emailVal ? isEmailValid : undefined), paddingRight: 36 }}
                      {...register("email")}
                      onFocus={() => setFocusedField("email")}
                      onBlur={() => setFocusedField(null)}
                    />
                    {emailVal && (
                      <span className="material-symbols-outlined" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: isEmailValid ? "#22C55E" : "#CBD5E1", fontVariationSettings: "'FILL' 1" }}>
                        {isEmailValid ? "check_circle" : "radio_button_unchecked"}
                      </span>
                    )}
                  </div>
                  <FieldError msg={errors.email?.message} />
                </div>
              </div>
            </div>

            {/* Section 2: Perfil de Acesso */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(233,237,255,0.5)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#94A3B8" }}>shield</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#505f76", textTransform: "uppercase" }}>Perfil de Acesso</span>
                {errors.role && <span style={{ marginLeft: "auto", fontSize: 10, color: "#EF4444", fontWeight: 600 }}>{errors.role.message}</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {ROLES.filter(r => r.value !== "admin" || user?.role === "admin").map(role => {
                  const isSelected = roleVal === role.value;
                  return (
                    <button key={role.value} type="button"
                      onClick={() => setValue("role", role.value as FormData["role"], { shouldValidate: true })}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        textAlign: "center", gap: 4, padding: "10px 8px", borderRadius: 10, cursor: "pointer",
                        border: `2px solid ${isSelected ? PRIMARY : "transparent"}`,
                        background: isSelected ? "#dbe1ff4d" : "#f1f3ff",
                        transition: "all 0.15s", position: "relative",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: PRIMARY, fontVariationSettings: "'FILL' 1" }}>
                        {role.icon}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#141b2b", lineHeight: 1.3 }}>{role.label}</span>
                      {isSelected && (
                        <span className="material-symbols-outlined" style={{ position: "absolute", top: 8, right: 8, fontSize: 14, color: PRIMARY, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Área Específica */}
            <div style={{ padding: "14px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#94A3B8" }}>location_on</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#505f76", textTransform: "uppercase" }}>Área Específica</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#CBD5E1" }}>{areaVal.length}/80 · opcional</span>
              </div>
              <textarea
                placeholder="Descreva o setor ou filial de atuação do colaborador..."
                data-testid="input-area"
                maxLength={80}
                rows={1}
                style={{
                  width: "100%", fontSize: 13, padding: "10px 12px", borderRadius: 8,
                  border: "1.5px solid #E2E8F0", background: "#f1f3ff", outline: "none",
                  color: "#141b2b", fontFamily: "inherit", resize: "none", boxSizing: "border-box",
                  transition: "border-color 0.15s, background 0.15s",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = PRIMARY; e.currentTarget.style.background = "white"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.background = "#f1f3ff"; }}
                {...register("area")}
              />
            </div>

            {/* Footer */}
            <div style={{ padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, background: "#FAFBFF", borderTop: "1px solid rgba(233,237,255,0.5)" }}>
              <button type="button" onClick={() => reset()} data-testid="button-clear"
                style={{ height: 34, padding: "0 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1px solid #E2E8F0", background: "white", color: "#64748B", cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={e => e.currentTarget.style.background = "white"}
              >
                Limpar
              </button>
              <button type="submit" disabled={mutation.isPending} data-testid="button-submit"
                style={{
                  height: 34, padding: "0 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  border: "none", background: PRIMARY, color: "white", fontFamily: "inherit",
                  cursor: mutation.isPending ? "not-allowed" : "pointer",
                  opacity: mutation.isPending ? 0.75 : 1,
                  display: "flex", alignItems: "center", gap: 8,
                  boxShadow: mutation.isPending ? "none" : "0 1px 3px rgba(0,74,198,0.3)",
                  transition: "all 0.15s",
                }}>
                {mutation.isPending ? (
                  <>
                    <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", display: "inline-block" }} className="animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 17, fontVariationSettings: "'FILL' 1" }}>person_add</span>
                    Criar Usuário
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* ── Sidebar ── */}
        <aside style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Preview card */}
          <div style={{ background: "white", borderRadius: 12, border: "1px solid #E8ECF8", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", padding: "14px 16px" }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>Pré-visualização</h3>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
                background: nameVal ? PRIMARY_FIXED : "#E9EDFF",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: PRIMARY, fontSize: 18, fontWeight: 700, marginBottom: 8,
                boxShadow: "inset 0 2px 4px rgba(0,74,198,0.1)",
                transition: "background 0.2s",
              }}>
                {nameVal
                  ? initials(nameVal)
                  : <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#C3C6D7" }}>person</span>}
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, color: nameVal ? "#141b2b" : "#C3C6D7", margin: "0 0 2px", textAlign: "center" }}>
                {nameVal || "Nome do usuário"}
              </p>
              <p style={{ fontSize: 11, color: emailVal && isEmailValid ? "#434655" : "#C3C6D7", margin: "0 0 10px", textAlign: "center", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {emailVal && isEmailValid ? emailVal : "email@empresa.com"}
              </p>
              {selectedRole ? (
                <span style={{ padding: "4px 12px", background: "#d0e1fb", color: "#38485d", fontSize: 10, fontWeight: 700, borderRadius: 9999, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {selectedRole.label}
                </span>
              ) : (
                <span style={{ padding: "4px 12px", background: "#F1F3FF", color: "#C3C6D7", fontSize: 10, fontWeight: 700, borderRadius: 9999, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Sem perfil
                </span>
              )}
            </div>
          </div>

          {/* Checklist card */}
          <div style={{ background: "white", borderRadius: 12, border: "1px solid #E8ECF8", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", padding: "14px 16px" }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>Status do Cadastro</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Nome identificado",         ok: nameVal.length >= 2 },
                { label: "E-mail corporativo válido", ok: isEmailValid },
                { label: "Perfil selecionado",        ok: !!roleVal },
              ].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1", color: item.ok ? "#22C55E" : "#E1E8FD", transition: "color 0.2s", flexShrink: 0 }}>
                    {item.ok ? "check_circle" : "radio_button_checked"}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: item.ok ? "#374151" : "#94A3B8" }}>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Microsoft SSO note */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 12px", background: "#EFF6FF", borderRadius: 8, border: "1px solid #BFDBFE" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#2563EB" }}>verified_user</span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", color: "#1D4ED8" }}>Acesso via Microsoft 365</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
