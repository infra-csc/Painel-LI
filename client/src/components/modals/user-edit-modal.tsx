/**
 * Editar usuário (08/10, redesenho). Mesmos campos (nome, e-mail, perfil e
 * área), mesmo esquema, mesma rota (PATCH /api/users/:id), mesmo payload (sem
 * perfil e área para quem não é admin) e os mesmos toasts. Na apresentação:
 *  - a régua dos modais do app: ícone/avatar, título, uma linha de contexto,
 *    corpo em duas seções (Identificação; Perfil e acesso) e rodapé fixo;
 *  - o perfil diz, ao lado, O QUE ABRE — as telas por grupo do menu — e, se
 *    mudar, o que a pessoa ganha e perde; virar Administrador ganha um aviso
 *    vermelho e o botão diz "Salvar e tornar administrador";
 *  - fechar com alteração continua perguntando (Esc e clique fora também);
 *  - no celular ocupa a tela inteira.
 * Props inalteradas: { isOpen, onClose, user }.
 *
 * 08/10 (correções de lógica): o que cada um edita vem da regra ÚNICA do
 * servidor (`shared/edicao-de-usuario`) e o PATCH leva SÓ os campos que
 * mudaram — antes ia tudo, e o servidor recusava a edição de RH/Compras (o
 * e-mail ia junto) e a do admin no próprio nome (o perfil ia junto). Campo
 * que a pessoa não pode mudar fica travado com o motivo; quem não edita
 * ninguém (Logística Interna em terceiros) vê o modal só para leitura.
 * Promover a Administrador pede confirmação antes de salvar.
 */
import { useEffect, useMemo, useState } from "react";
import { apiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { User } from "@shared/schema";
import { normalizeRole } from "@shared/roles";
import { camposEditaveisDoUsuario, type CampoDoUsuario } from "@shared/edicao-de-usuario";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  Check, Loader2, Lock, ShieldAlert, ShieldCheck, Layers, Briefcase, ShoppingCart, BarChart2, X,
} from "lucide-react";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { OptionalMark, RequiredMark } from "@/components/forms/required-mark";
import { NOME_DO_PERFIL, RESUMO_DO_PERFIL, TOTAL_DE_TELAS, nomeDaPessoa, telasDoPerfil } from "@/components/admin-users/acesso";
import { AvatarDoUsuario, PerfilDoUsuario, SituacaoDaConta, TelasDoPerfil } from "@/components/admin-users/pecas";

/** Rótulo de campo — o mesmo de Eventos/Funções/Passagens. */
const ROTULO = "block mb-1.5 text-xs font-medium text-slate-600";
/** Campo: o Input padrão do sistema + estado de erro. */
const CAMPO = "h-10 rounded-lg text-sm bg-card aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/30";

// ─── Perfis (ícone e nome) ───────────────────────────────────────────────────
const ROLE_CFG: Record<string, { label: string; icon: typeof ShieldCheck; iconCls: string }> = {
  admin:         { label: NOME_DO_PERFIL.admin,         icon: ShieldCheck,  iconCls: "text-primary" },
  production:    { label: NOME_DO_PERFIL.production,    icon: Layers,       iconCls: "text-muted-foreground" },
  function_area: { label: NOME_DO_PERFIL.function_area, icon: Briefcase,    iconCls: "text-muted-foreground" },
  purchasing:    { label: NOME_DO_PERFIL.purchasing,    icon: ShoppingCart, iconCls: "text-muted-foreground" },
  financial:     { label: NOME_DO_PERFIL.financial,     icon: BarChart2,    iconCls: "text-muted-foreground" },
};

// ─── Schema ──────────────────────────────────────────────────────────────────
const userEditSchema = z.object({
  name:  z.string().trim().min(1, "Nome é obrigatório"),
  email: z.string().trim().email("E-mail inválido"),
  role:  z.enum(["admin", "production", "function_area", "purchasing", "financial"], {
    required_error: "Selecione uma função",
  }),
  area: z.string().optional(),
});

type UserEditFormData = z.infer<typeof userEditSchema>;
type Alteracoes = Partial<Record<CampoDoUsuario, string | null>>;

/** Perfil que o formulário mostra para a conta (papel legado normalizado). */
const perfilDoForm = (u: User | null) => (normalizeRole(u?.role) ?? "production") as UserEditFormData["role"];

/**
 * Só o que mudou E que quem edita pode mudar — o servidor recusa (403) campo
 * que a pessoa não pode alterar, mesmo com o valor igual.
 */
function alteracoesDoUsuario(data: UserEditFormData, u: User, campos: readonly CampoDoUsuario[]): Alteracoes {
  const p: Alteracoes = {};
  const nome = data.name.trim();
  if (campos.includes("name") && nome !== u.name) p.name = nome;
  const email = data.email.trim().toLowerCase();
  if (campos.includes("email") && email !== (u.email ?? "").toLowerCase()) p.email = email;
  if (campos.includes("role") && data.role !== perfilDoForm(u)) p.role = data.role;
  const area = data.area?.trim() || null;
  if (campos.includes("area") && area !== (u.area?.trim() || null)) p.area = area;
  return p;
}

interface UserEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export default function UserEditModal({ isOpen, onClose, user }: UserEditModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const isCurrentAdmin = normalizeRole(currentUser?.role) === "admin";
  // O que quem está logado pode mudar NESTA conta — a mesma regra do PATCH
  // /api/users/:id (shared/edicao-de-usuario). Campo fora da lista fica
  // travado e nunca vai no payload.
  const euMesmo = !!user && !!currentUser && user.id === currentUser.id;
  const campos = camposEditaveisDoUsuario(currentUser?.role, euMesmo);
  const canEditName = campos.includes("name");
  const canEditEmail = campos.includes("email");
  const canChangeRole = campos.includes("role");
  const canEditArea = campos.includes("area");
  const soLeitura = campos.length === 0;
  const [aConfirmar, setAConfirmar] = useState<Alteracoes | null>(null);

  const form = useForm<UserEditFormData>({
    resolver: zodResolver(userEditSchema),
    defaultValues: {
      name:  user?.name  || "",
      email: user?.email || "",
      role:  perfilDoForm(user),
      area:  user?.area  || "",
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        name:  user.name,
        email: user.email,
        role:  perfilDoForm(user),
        area:  user.area || "",
      });
    }
  }, [user, form]);

  const updateUserMutation = useMutation({
    mutationFn: async (payload: Alteracoes) =>
      (await apiRequest("PATCH", `/api/users/${user?.id}`, payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ variant: "success", title: "Usuário atualizado" });
      onClose();
    },
    onError: (err: unknown) => {
      toast({ title: "Não foi possível atualizar o usuário", description: apiErrorMessage(err, "Erro ao atualizar usuário"), variant: "destructive" });
    },
  });

  const onSubmit = (data: UserEditFormData) => {
    if (!user || soLeitura) return;
    const payload = alteracoesDoUsuario(data, user, campos);
    // Nada mudou de verdade (ex.: só espaços): fecha sem chamar o servidor.
    if (Object.keys(payload).length === 0) { onClose(); return; }
    // Acesso total: confirma ANTES de salvar.
    if (payload.role === "admin") { setAConfirmar(payload); return; }
    updateUserMutation.mutate(payload);
  };
  // "Descartar alterações?" (23/09): Esc e clique fora fechavam sem perguntar.
  const { pedirParaFechar, Dialogo: DialogoDescarte } = useConfirmarDescarte(form.formState.isDirty, { salvando: updateUserMutation.isPending });
  const fechar = () => pedirParaFechar(onClose);
  const salvando = updateUserMutation.isPending;

  // Validação ao vivo do e-mail (o ✓ no fim do campo)
  const emailValue = form.watch("email");
  const emailValid  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue || "");

  // Perfil escolhido × perfil de origem: o que a pessoa ganha e perde.
  const currentRole = form.watch("role");
  const roleOriginal = normalizeRole(user?.role);
  const mudouPerfil = !!roleOriginal && currentRole !== roleOriginal;
  const virandoAdmin = canChangeRole && currentRole === "admin" && roleOriginal !== "admin";
  const deixandoAdmin = canChangeRole && roleOriginal === "admin" && currentRole !== "admin";
  const { ganha, perde } = useMemo(() => {
    const antes = new Set(telasDoPerfil(roleOriginal).map(t => t.id));
    const depois = telasDoPerfil(currentRole);
    const idsDepois = new Set(depois.map(t => t.id));
    return {
      ganha: new Set(depois.filter(t => !antes.has(t.id)).map(t => t.id)),
      perde: telasDoPerfil(roleOriginal).filter(t => !idsDepois.has(t.id)),
    };
  }, [roleOriginal, currentRole]);
  const nTelas = telasDoPerfil(currentRole).length;
  const userName = user?.name ? nomeDaPessoa(user.name) : "";

  return (
    <>
    <Dialog open={isOpen} onOpenChange={v => { if (!v) fechar(); }}>
      <DialogContent data-testid="modal-user-edit"
        className="p-0 gap-0 sm:max-w-[600px] rounded-xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[92vh] max-sm:w-full max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0">

        {/* ── Cabeçalho ── */}
        <div className="relative flex items-start gap-3.5 shrink-0 px-5 sm:px-6 pt-4 pb-3.5 pr-14 border-b border-border bg-card">
          {userName && <AvatarDoUsuario nome={user?.name ?? ""} tamanho="lg" className="hidden sm:inline-flex" />}
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-semibold text-foreground leading-6 m-0 p-0 truncate">
              {userName || "Editar usuário"}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground">
                {user ? (
                  <>
                    <PerfilDoUsuario role={user.role} />
                    <SituacaoDaConta u={user} />
                    <span className="truncate">{user.email}</span>
                  </>
                ) : "Edite as informações do usuário"}
              </div>
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="pas-alvo absolute right-3 top-3 flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── Corpo ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 bg-surface-muted/60">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} id="user-edit-form" noValidate className="flex flex-col gap-3">

              {/* Identificação */}
              <section aria-labelledby="usr-sec-identificacao" className="rounded-xl border border-border bg-card p-4">
                <h3 id="usr-sec-identificacao" className="m-0 mb-3 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Identificação</h3>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <label htmlFor="usr-edit-nome" className={ROTULO}>Nome<RequiredMark /></label>
                        <FormControl>
                          <Input id="usr-edit-nome" placeholder="Nome completo" autoComplete="off"
                            className={cn(CAMPO, "disabled:opacity-60 disabled:cursor-not-allowed")}
                            data-testid="input-edit-name" {...field} disabled={!canEditName} />
                        </FormControl>
                        <FormMessage className="mt-1 text-2xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <label htmlFor="usr-edit-email" className={ROTULO}>E-mail<RequiredMark /></label>
                        <div className="relative">
                          <FormControl>
                            <Input id="usr-edit-email" type="email" placeholder="email@exemplo.com" autoComplete="off"
                              className={cn(CAMPO, "pr-9 disabled:opacity-60 disabled:cursor-not-allowed")} data-testid="input-edit-email"
                              aria-describedby="usr-edit-email-ajuda" {...field} disabled={!canEditEmail} />
                          </FormControl>
                          {!canEditEmail ? (
                            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                          ) : emailValid && emailValue && (
                            <Check className="usr-entra absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-success-strong" strokeWidth={3} aria-hidden="true" />
                          )}
                        </div>
                        <FormMessage className="mt-1 text-2xs" />
                      </FormItem>
                    )}
                  />
                </div>
                <p id="usr-edit-email-ajuda" className="m-0 mt-2.5 text-2xs leading-4 text-muted-foreground" data-testid="usr-edit-email-ajuda">
                  {canEditEmail
                    ? "O e-mail é o da conta Microsoft usada para entrar pelo Portal Norte."
                    : "O e-mail é a conta Microsoft que entra pelo Portal Norte — só administradores alteram o de outra pessoa."}
                </p>
              </section>

              {/* Perfil e acesso */}
              <section aria-labelledby="usr-sec-acesso" className={cn("usr-secao rounded-xl border bg-card p-4", virandoAdmin ? "border-danger/40" : "border-border")}>
                <h3 id="usr-sec-acesso" className="m-0 mb-3 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Perfil e acesso</h3>

                {!canChangeRole && (
                  <div className="mb-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-warning-soft border border-warning/25" data-testid="usr-edit-aviso">
                    <Lock className="w-3.5 h-3.5 text-warning-strong mt-0.5 shrink-0" aria-hidden="true" />
                    <p className="m-0 text-xs text-warning-strong leading-relaxed">
                      {/* Fiel ao PATCH /api/users/:id (shared/edicao-de-usuario). */}
                      {soLeitura
                        ? "Seu perfil só consulta os usuários. Quem edita outras pessoas: administradores, RH e Compras."
                        : canEditArea
                        ? "Ninguém altera o próprio perfil — peça a outro administrador. Você pode editar nome, e-mail e área."
                        : canEditEmail
                        ? "Só administradores alteram perfil e área. Você pode editar nome e e-mail."
                        : "Só administradores alteram e-mail, perfil e área de outra pessoa. Você pode editar o nome."}
                    </p>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <label htmlFor="usr-edit-perfil" className={ROTULO}>Perfil<RequiredMark /></label>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!canChangeRole}>
                          <FormControl>
                            <SelectTrigger id="usr-edit-perfil" className={cn(CAMPO, "px-3 disabled:opacity-60 disabled:cursor-not-allowed")} data-testid="select-edit-role" aria-disabled={!canChangeRole}>
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
                                    <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.iconCls}`} aria-hidden="true" />
                                    <span className="text-sm">{cfg.label}</span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage className="mt-1 text-2xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="area"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <label htmlFor="usr-edit-area" className={ROTULO}>Área<OptionalMark /></label>
                        <FormControl>
                          <Input id="usr-edit-area" placeholder="Ex.: Cenografia, Palco Principal…" autoComplete="off"
                            className={cn(CAMPO, "disabled:opacity-60 disabled:cursor-not-allowed")}
                            data-testid="input-edit-area" {...field} disabled={!canEditArea} />
                        </FormControl>
                        <FormMessage className="mt-1 text-2xs" />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Virar administrador: inequívoco, antes de salvar. */}
                {virandoAdmin && (
                  <div role="alert" className="usr-entra mt-4 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5" data-testid="aviso-vira-admin">
                    <ShieldAlert className="w-4 h-4 text-danger mt-0.5 shrink-0" aria-hidden="true" />
                    <p className="m-0 text-xs leading-5 text-danger">
                      <strong className="font-semibold">Acesso total.</strong> Como Administrador, {userName || "a pessoa"} passa a ver e alterar tudo —
                      inclusive aprovar e desativar usuários, mudar perfis, ler o log de auditoria e usar “Ver como usuário”.
                    </p>
                  </div>
                )}
                {deixandoAdmin && (
                  <div role="status" className="usr-entra mt-4 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5" data-testid="aviso-deixa-admin">
                    <ShieldAlert className="w-4 h-4 text-warning-strong mt-0.5 shrink-0" aria-hidden="true" />
                    <p className="m-0 text-xs leading-5 text-warning-strong">
                      {userName || "A pessoa"} deixa de ser Administrador e perde a gestão de usuários, o log de auditoria e “Ver como usuário”.
                    </p>
                  </div>
                )}

                {/* O que o perfil escolhido abre */}
                <div className="mt-4 pt-3.5 border-t border-border" aria-live="polite">
                  <p className="m-0 text-sm font-medium text-foreground">
                    {ROLE_CFG[currentRole]?.label ?? "Perfil"} abre {nTelas === TOTAL_DE_TELAS ? `todas as ${nTelas} telas` : `${nTelas} de ${TOTAL_DE_TELAS} telas`}
                  </p>
                  <p className="m-0 mt-0.5 mb-3 text-xs leading-5 text-muted-foreground">
                    {/* Virando admin, o aviso vermelho já diz o que o perfil faz. */}
                    {!virandoAdmin && RESUMO_DO_PERFIL[currentRole]}
                    {mudouPerfil && (
                      <span className="text-slate-600">
                        {!virandoAdmin && " "}Em relação a {NOME_DO_PERFIL[roleOriginal!]}: {ganha.size > 0 ? `ganha ${ganha.size} ${ganha.size === 1 ? "tela" : "telas"}` : "não ganha telas"}
                        {perde.length > 0 ? `, perde ${perde.length}` : ""}{ganha.size > 0 ? " — as novas estão em destaque" : ""}.
                      </span>
                    )}
                  </p>
                  <TelasDoPerfil role={currentRole} compacto destaque={mudouPerfil ? ganha : undefined} />
                  {mudouPerfil && perde.length > 0 && (
                    <p className="usr-entra m-0 mt-3 text-xs leading-5 text-muted-foreground" data-testid="telas-perdidas">
                      <span className="font-medium text-slate-600">Deixa de abrir:</span> {perde.map(t => t.label).join(", ")}.
                    </p>
                  )}
                </div>
              </section>
            </form>
          </Form>
        </div>

        {/* ── Rodapé ── */}
        <div className="flex items-center gap-2 shrink-0 px-5 sm:px-6 py-3 border-t border-border bg-surface-muted">
          <p className="m-0 mr-auto hidden sm:block text-2xs text-muted-foreground" aria-live="polite">
            {form.formState.isDirty ? "Alterações ainda não salvas" : ""}
          </p>
          <Button type="button" variant="outline" onClick={fechar} disabled={salvando}
            className="h-9 rounded-lg px-4 text-sm font-medium max-sm:flex-1" data-testid="button-cancel-edit-user">
            {soLeitura ? "Fechar" : "Cancelar"}
          </Button>
          {!soLeitura && <Button type="submit" form="user-edit-form" disabled={salvando} aria-busy={salvando}
            className={cn("h-9 rounded-lg px-4 text-sm font-semibold gap-2 max-sm:flex-1", virandoAdmin ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "hover:bg-primary-hover")}
            data-testid="button-save-edit-user">
            {salvando
              ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Salvando…</>
              : <><Check className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" /> {virandoAdmin ? "Salvar e tornar administrador" : "Salvar alterações"}</>}
          </Button>}
        </div>
      </DialogContent>
    </Dialog>
    {DialogoDescarte}
    {/* Promover a Administrador: acesso total — confirma antes de salvar. */}
    <ConfirmDialog
      open={aConfirmar !== null}
      onOpenChange={(o) => { if (!o) setAConfirmar(null); }}
      tone="danger"
      icon={ShieldAlert}
      title={`Tornar ${userName || "a pessoa"} administrador?`}
      description="Acesso total: passa a ver e alterar tudo — inclusive aprovar e desativar usuários, mudar perfis, ler o log de auditoria e usar “Ver como usuário”."
      confirmLabel="Tornar administrador"
      pending={salvando}
      onConfirm={() => { if (aConfirmar) updateUserMutation.mutate(aConfirmar, { onSettled: () => setAConfirmar(null) }); }}
      testId="usr-confirma-admin"
      confirmTestId="button-confirm-make-admin"
    />
    </>
  );
}
