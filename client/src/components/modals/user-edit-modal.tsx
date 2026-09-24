import { useEffect } from "react";
import { apiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { User } from "@shared/schema";
import { normalizeRole } from "@shared/roles";
import { hasPermission } from "@/lib/role-utils";
import {
  X, Check, User as UserIcon, Mail, MapPin,
  ShieldCheck, Layers, Briefcase, ShoppingCart, BarChart2, Lock
} from "lucide-react";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { OptionalMark, RequiredMark } from "@/components/forms/required-mark";

// Rótulo padrão dos campos (11px, mínimo legível — 23/09)
const LBL = "text-2xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5";

// ─── Avatar helpers ─────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-primary", "bg-primary", "bg-success-strong", "bg-warning-strong",
  "bg-primary", "bg-info", "bg-warning-strong", "bg-danger-strong",
  "bg-primary", "bg-info-strong",
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Role config ─────────────────────────────────────────────────────────────
const ROLE_CFG: Record<string, { label: string; badgeCls: string; icon: typeof ShieldCheck; iconCls: string }> = {
  admin:         { label: "Administrador",            badgeCls: "bg-brand-soft text-primary ring-1 ring-primary/25", icon: ShieldCheck,    iconCls: "text-primary" },
  production:    { label: "Logística Interna",        badgeCls: "bg-brand-soft text-primary ring-1 ring-primary/25",       icon: Layers,         iconCls: "text-primary" },
  function_area: { label: "Área de Função",           badgeCls: "bg-success-soft text-success ring-1 ring-success/25", icon: Briefcase,   iconCls: "text-success-strong" },
  purchasing:    { label: "Área de Compras/Viagem",   badgeCls: "bg-warning-soft text-warning ring-1 ring-warning/25",    icon: ShoppingCart,   iconCls: "text-warning-strong" },
  financial:     { label: "RH",                        badgeCls: "bg-info-soft text-info ring-1 ring-info/25",       icon: BarChart2,      iconCls: "text-info-strong" },
};

// ─── Schema ──────────────────────────────────────────────────────────────────
const userEditSchema = z.object({
  name:  z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  role:  z.enum(["admin", "production", "function_area", "purchasing", "financial"], {
    required_error: "Selecione uma função",
  }),
  area: z.string().optional(),
});

type UserEditFormData = z.infer<typeof userEditSchema>;

interface UserEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

// ─── Shared input class ──────────────────────────────────────────────────────
const BASE_INPUT = "h-11 text-sm border-border rounded-lg transition-all focus:border-primary focus:ring-1 focus:ring-ring/20";

export default function UserEditModal({ isOpen, onClose, user }: UserEditModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const isCurrentAdmin = normalizeRole(currentUser?.role) === "admin";
  // PATCH /api/users/:id só grava role/area quando quem edita é admin
  // (allowedFieldsForAdmin). Para os demais os campos ficam travados e não
  // são enviados — antes o servidor descartava em silêncio.
  const canChangeRole = hasPermission(currentUser, "canChangeUserRole");

  const form = useForm<UserEditFormData>({
    resolver: zodResolver(userEditSchema),
    defaultValues: {
      name:  user?.name  || "",
      email: user?.email || "",
      role:  (normalizeRole(user?.role) as UserEditFormData["role"]) || "production",
      area:  user?.area  || "",
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        name:  user.name,
        email: user.email,
        role:  (normalizeRole(user.role) ?? "production") as UserEditFormData["role"],
        area:  user.area || "",
      });
    }
  }, [user, form]);

  const updateUserMutation = useMutation({
    mutationFn: async (data: UserEditFormData) => {
      const payload: Partial<UserEditFormData> = canChangeRole
        ? data
        : { name: data.name, email: data.email };
      return (await apiRequest("PATCH", `/api/users/${user?.id}`, payload)).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ variant: "success", title: "Usuário atualizado" });
      onClose();
    },
    onError: (err: unknown) => {
      toast({ title: "Não foi possível atualizar o usuário", description: apiErrorMessage(err, "Erro ao atualizar usuário"), variant: "destructive" });
    },
  });

  const onSubmit = (data: UserEditFormData) => updateUserMutation.mutate(data);
  // "Descartar alterações?" (23/09): Esc e clique fora fechavam sem perguntar.
  const { pedirParaFechar, Dialogo: DialogoDescarte } = useConfirmarDescarte(form.formState.isDirty, { salvando: updateUserMutation.isPending });
  const fechar = () => pedirParaFechar(onClose);

  // Live email validation state
  const emailValue = form.watch("email");
  const emailValid  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue || "");

  // Role info for header badge
  const currentRole = form.watch("role");
  const roleCfg = ROLE_CFG[currentRole] ?? ROLE_CFG.production;
  const userName = user?.name || "";

  return (
    <>
    <Dialog open={isOpen} onOpenChange={v => { if (!v) fechar(); }}>
      <DialogContent className="p-0 gap-0 sm:max-w-[480px] rounded-xl border-0 shadow-3 overflow-hidden [&>button:last-child]:hidden">

        {/* ── Header ── */}
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {userName && (
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${avatarColor(userName)}`}>
                  {initials(userName)}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-foreground">{userName || "Editar usuário"}</h2>
                  {currentRole && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold ${roleCfg.badgeCls}`}>
                      {roleCfg.label}
                    </span>
                  )}
                </div>
                <p className="text-2xs text-muted-foreground mt-0.5">Edite as informações do usuário</p>
              </div>
            </div>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-slate-600 hover:bg-muted transition-colors shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* ── Form ── */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="user-edit-form">
            <div className="px-6 py-6 space-y-5">

              {/* Nome */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <label className={LBL}>Nome<RequiredMark /></label>
                    <FormControl>
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        <Input
                          placeholder="Nome completo"
                          className={`${BASE_INPUT} pl-10`}
                          data-testid="input-edit-name"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-2xs" />
                  </FormItem>
                )}
              />

              {/* E-mail */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <label className={LBL}>E-mail<RequiredMark /></label>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        <Input
                          type="email"
                          placeholder="email@exemplo.com"
                          className={`${BASE_INPUT} pl-10 pr-10 font-mono ${
                            emailValid && emailValue
                              ? "border-success-strong focus:border-success-strong focus:ring-success-strong/20"
                              : ""
                          }`}
                          data-testid="input-edit-email"
                          {...field}
                        />
                        {emailValid && emailValue && (
                          <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-success-strong" strokeWidth={3} aria-hidden="true" />
                        )}
                      </div>
                    </FormControl>
                    <FormMessage className="text-2xs" />
                  </FormItem>
                )}
              />

              {!canChangeRole && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-warning-soft border border-warning/25">
                  <Lock className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" aria-hidden="true" />
                  <p className="text-2xs text-warning leading-relaxed">
                    Só administradores alteram perfil e área. Você pode editar nome e e-mail.
                  </p>
                </div>
              )}

              {/* Perfil */}
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <label className={LBL}>Perfil<RequiredMark /></label>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!canChangeRole}>
                      <FormControl>
                        <SelectTrigger className={`${BASE_INPUT} px-3 disabled:opacity-60 disabled:cursor-not-allowed`} data-testid="select-edit-role" aria-disabled={!canChangeRole}>
                          <SelectValue placeholder="Selecione o perfil" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        {Object.entries(ROLE_CFG)
                          .filter(([val]) => val !== "admin" || isCurrentAdmin)
                          .map(([val, cfg]) => {
                          const Icon = cfg.icon;
                          return (
                            <SelectItem key={val} value={val} className="py-2">
                              <div className="flex items-center gap-2.5">
                                <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.iconCls}`} />
                                <span className="text-sm">{cfg.label}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-2xs" />
                  </FormItem>
                )}
              />

              {/* Área */}
              <FormField
                control={form.control}
                name="area"
                render={({ field }) => (
                  <FormItem>
                    <label className={LBL}>Área<OptionalMark /></label>
                    <FormControl>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        <Input
                          placeholder="Ex: Cenografia, Palco Principal…"
                          className={`${BASE_INPUT} pl-10 disabled:opacity-60 disabled:cursor-not-allowed`}
                          data-testid="input-edit-area"
                          disabled={!canChangeRole}
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-2xs" />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Footer ── */}
            <div className="px-6 pb-5 pt-1 space-y-3">
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={fechar}
                  disabled={updateUserMutation.isPending}
                  className="px-4 py-2 text-xs font-medium text-slate-600 border border-border rounded-lg hover:border-slate-300 transition-colors"
                  data-testid="button-cancel-edit-user"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="flex items-center gap-1.5 px-5 py-2 bg-primary hover:bg-primary-hover disabled:opacity-60 text-primary-foreground text-xs font-semibold rounded-lg shadow-1 hover:shadow-2 transition-all"
                  data-testid="button-save-edit-user"
                >
                  {updateUserMutation.isPending ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Salvando…
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
                      Salvar
                    </>
                  )}
                </button>
              </div>
              <p className="text-2xs text-muted-foreground text-center">
                Apenas o campo <span className="font-medium">Área</span> é opcional
              </p>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    {DialogoDescarte}
    </>
  );
}
