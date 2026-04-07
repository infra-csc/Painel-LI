import { useEffect } from "react";
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
import {
  X, Check, User as UserIcon, Mail, MapPin,
  ShieldCheck, Layers, Briefcase, ShoppingCart, BarChart2
} from "lucide-react";

// ─── Avatar helpers ─────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-600", "bg-amber-500", "bg-rose-500",
  "bg-indigo-500", "bg-teal-500",
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
  admin:         { label: "Administrador",            badgeCls: "bg-violet-50 text-violet-700 ring-1 ring-violet-200", icon: ShieldCheck,    iconCls: "text-violet-500" },
  production:    { label: "Logística Interna",        badgeCls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",       icon: Layers,         iconCls: "text-blue-500" },
  function_area: { label: "Área de Função",           badgeCls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", icon: Briefcase,   iconCls: "text-emerald-500" },
  purchasing:    { label: "Área de Compras/Viagem",   badgeCls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",    icon: ShoppingCart,   iconCls: "text-amber-500" },
  financial:     { label: "RH",                        badgeCls: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",       icon: BarChart2,      iconCls: "text-teal-500" },
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
const BASE_INPUT = "h-11 text-sm border-gray-200 rounded-lg transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20";

export default function UserEditModal({ isOpen, onClose, user }: UserEditModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const isCurrentAdmin = currentUser?.role === "admin";

  const form = useForm<UserEditFormData>({
    resolver: zodResolver(userEditSchema),
    defaultValues: {
      name:  user?.name  || "",
      email: user?.email || "",
      role:  (user?.role as UserEditFormData["role"]) || "production",
      area:  user?.area  || "",
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        name:  user.name,
        email: user.email,
        role:  user.role as any,
        area:  user.area || "",
      });
    }
  }, [user, form]);

  const updateUserMutation = useMutation({
    mutationFn: async (data: UserEditFormData) =>
      (await apiRequest("PATCH", `/api/users/${user?.id}`, data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Sucesso", description: "Dados do usuário atualizados com sucesso" });
      onClose();
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message || "Erro ao atualizar usuário", variant: "destructive" });
    },
  });

  const onSubmit = (data: UserEditFormData) => updateUserMutation.mutate(data);

  // Live email validation state
  const emailValue = form.watch("email");
  const emailValid  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue || "");

  // Role info for header badge
  const currentRole = form.watch("role");
  const roleCfg = ROLE_CFG[currentRole] ?? ROLE_CFG.production;
  const userName = user?.name || "";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 gap-0 sm:max-w-[480px] rounded-2xl border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">

        {/* ── Header ── */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {userName && (
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${avatarColor(userName)}`}>
                  {initials(userName)}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-slate-800">{userName || "Editar Usuário"}</h2>
                  {currentRole && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${roleCfg.badgeCls}`}>
                      {roleCfg.label}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">Edite as informações do usuário</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
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
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">
                      Nome <span className="text-red-400">*</span>
                    </label>
                    <FormControl>
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          placeholder="Nome completo"
                          className={`${BASE_INPUT} pl-10`}
                          data-testid="input-edit-name"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              {/* E-mail */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">
                      E-mail <span className="text-red-400">*</span>
                    </label>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          type="email"
                          placeholder="email@exemplo.com"
                          className={`${BASE_INPUT} pl-10 pr-10 font-mono ${
                            emailValid && emailValue
                              ? "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20"
                              : ""
                          }`}
                          data-testid="input-edit-email"
                          {...field}
                        />
                        {emailValid && emailValue && (
                          <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500" strokeWidth={3} />
                        )}
                      </div>
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              {/* Função */}
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">
                      Função <span className="text-red-400">*</span>
                    </label>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className={`${BASE_INPUT} px-3`} data-testid="select-edit-role">
                          <SelectValue placeholder="Selecione a função" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        {Object.entries(ROLE_CFG).map(([val, cfg]) => {
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
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              {/* Área */}
              <FormField
                control={form.control}
                name="area"
                render={({ field }) => (
                  <FormItem>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">
                      Área <span className="text-slate-300 font-normal normal-case">(opcional)</span>
                    </label>
                    <FormControl>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          placeholder="Ex: Cenografia, Palco Principal..."
                          className={`${BASE_INPUT} pl-10`}
                          data-testid="input-edit-area"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Footer ── */}
            <div className="px-6 pb-5 pt-1 space-y-3">
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={updateUserMutation.isPending}
                  className="px-4 py-2 text-xs font-medium text-slate-600 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                  data-testid="button-cancel-edit-user"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-200 hover:shadow-md hover:shadow-blue-200 transition-all"
                  data-testid="button-save-edit-user"
                >
                  {updateUserMutation.isPending ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      Salvar
                    </>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 text-center">
                Apenas o campo <span className="font-medium">Área</span> é opcional
              </p>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
