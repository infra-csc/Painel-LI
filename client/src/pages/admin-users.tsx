import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Edit, Key, Search, AlertCircle, X, UserPlus, Users,
  CheckCircle, XCircle, UserCheck, UserMinus,
  ChevronLeft, ChevronRight, ShieldCheck
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { campo, useUrlState } from "@/lib/use-url-state";
import UserEditModal from "@/components/modals/user-edit-modal";
import ResetPasswordModal from "@/components/modals/reset-password-modal";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import type { User } from "@shared/schema";
import { normalizeRole } from "@shared/roles";
import { hasPermission } from "@/lib/role-utils";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { PageHeader } from "@/components/common/page-header";
import { PageContainer } from "@/components/common/page-container";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";

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

// ─── Config ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

const ROLE_CFG: Record<string, { label: string; cls: string }> = {
  admin:         { label: "Administrador", cls: "bg-brand-soft text-primary ring-1 ring-primary/25" },
  administrador: { label: "Administrador", cls: "bg-brand-soft text-primary ring-1 ring-primary/25" },
  administrator: { label: "Administrador", cls: "bg-brand-soft text-primary ring-1 ring-primary/25" },
  production:    { label: "Produção",      cls: "bg-brand-soft text-primary ring-1 ring-primary/25" },
  function_area: { label: "Área de Função",cls: "bg-success-soft text-success ring-1 ring-success/25" },
  rh:            { label: "RH",            cls: "bg-warning-soft text-warning ring-1 ring-warning/25" },
  purchasing:    { label: "Compras",       cls: "bg-warning-soft text-warning ring-1 ring-warning/25" },
  financial:     { label: "RH",            cls: "bg-info-soft text-info ring-1 ring-info/25" },
};

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CFG[normalizeRole(role) ?? role] ?? ROLE_CFG[role] ?? { label: role, cls: "bg-surface-muted text-slate-600 ring-1 ring-border" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function StatusPill({ status, isActive }: { status: string; isActive: boolean | null }) {
  if (status === "pending") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-warning-soft text-warning ring-1 ring-warning/25">Pendente</span>;
  }
  if (status === "approved" && isActive !== false) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-success-soft text-success ring-1 ring-success/25">Ativo</span>;
  }
  if (status === "rejected") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-muted text-muted-foreground ring-1 ring-border">Rejeitado</span>;
  }
  // approved + isActive===false → Inativo (gray, NOT red)
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-muted text-muted-foreground ring-1 ring-border">Inativo</span>;
}

// ─── Metric card ─────────────────────────────────────────────────────────────
function MetricCard({
  label, value, valueColor, active, onClick
}: { label: string; value: number; valueColor: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 bg-card rounded-xl border shadow-1 transition-all hover:shadow-2 ${
        active ? "border-primary/40 ring-2 ring-primary/10" : "border-border"
      }`}
    >
      <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
    </button>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AdminUsers() {
  usePageTitle("Usuários");
  // Busca, papel, status e página na URL (23/09): aprovar alguém e voltar
  // devolvia a lista sem o recorte. Os cards de status também são filtros.
  const [urlState, setUrlState] = useUrlState({
    q: campo.texto(""),
    status: campo.texto("all"),
    role: campo.texto("all"),
    pagina: campo.numero(1),
  });
  const statusFilter = urlState.status;
  const roleFilter = urlState.role;
  const searchQuery = urlState.q;
  const page = urlState.pagina;
  const setPage = (p: number | ((prev: number) => number)) =>
    setUrlState(prev => ({ ...prev, pagina: typeof p === "function" ? p(prev.pagina) : p }));
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);
  // "delete"/"cancel" desfazem algo → tom destrutivo no ConfirmDialog; "confirm" é neutro.
  const [confirmState, setConfirmState] = useState<{
    open: boolean; variant: "delete" | "cancel" | "confirm"; title: string; message: string; confirmLabel: string; onConfirm: () => void;
  }>({ open: false, variant: 'delete', title: '', message: '', confirmLabel: '', onConfirm: () => {} });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // normalizeRole aceita os aliases legados do banco ("administrador", "compras"...)
  const isAdmin = normalizeRole(user?.role) === "admin";
  // GET /api/users: admin, financial, purchasing, production
  const hasAccess = hasPermission(user, "canAccessAdminUsers");
  // POST /api/users: admin, financial, purchasing (produção não cria)
  const canCreate = hasPermission(user, "canCreateUsers");
  // toggle-active / approval / reset-password: SÓ admin (23/09). RH e Compras
  // veem a lista e criam usuário; as ações de conta aparecem desabilitadas
  // com o motivo (a pessoa está a um clique da ação — não some sem explicar).
  const canManageAccounts = hasPermission(user, "canManageUserAccounts");
  const SO_ADMIN = "Só administradores podem fazer isso.";

  // Mensagem de erro padronizada: erro de rede/sessão nunca pode virar "lista vazia".
  const errorText = (e: any, fallback: string) => {
    if (e?.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
    if (e?.status === 403) return "Você não tem permissão para executar esta ação.";
    return e?.body?.message || e?.message || fallback;
  };

  const { data: users = [], isLoading, isError, error, refetch, isFetching } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: hasAccess,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (userId: string) => (await apiRequest("PATCH", `/api/users/${userId}/toggle-active`)).json(),
    onSuccess: () => { toast({ variant: "success", title: "Status da conta atualizado" }); queryClient.invalidateQueries({ queryKey: ["/api/users"] }); },
    onError: (e: any) => toast({ title: "Não foi possível alterar o status da conta", description: errorText(e, "Não foi possível alterar o status da conta."), variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) =>
      (await apiRequest("POST", `/api/users/${userId}/reset-password`, { newPassword })).json(),
    onSuccess: () => { toast({ variant: "success", title: "Senha redefinida", description: "O usuário deverá trocá-la no próximo login." }); queryClient.invalidateQueries({ queryKey: ["/api/users"] }); },
    onError: (e: any) => toast({ title: "Não foi possível redefinir a senha", description: errorText(e, "Não foi possível resetar a senha."), variant: "destructive" }),
  });

  const approveUserMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: "approved" | "rejected" }) =>
      (await apiRequest("PATCH", `/api/users/${userId}/approval`, { status })).json(),
    onSuccess: () => { toast({ variant: "success", title: "Aprovação do usuário atualizada" }); queryClient.invalidateQueries({ queryKey: ["/api/users"] }); },
    onError: (e: any) => toast({ title: "Não foi possível atualizar a aprovação", description: errorText(e, "Tente novamente."), variant: "destructive" }),
  });

  const toggleCenotecnicaMutation = useMutation({
    mutationFn: async (userId: string) =>
      (await apiRequest("PATCH", `/api/users/${userId}/toggle-cenotecnica-approval`)).json(),
    onSuccess: (data) => {
      const label = data.canApproveCenotecnica ? "habilitada" : "desabilitada";
      toast({ title: "Permissão atualizada", description: `Aprovação de cenotécnica ${label} para este usuário.` });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (e: any) => toast({ title: "Não foi possível alterar a permissão", description: errorText(e, "Tente novamente."), variant: "destructive" }),
  });

  const handleResetPassword = (u: User) => {
    setResetPwdUser(u);
  };

  const handleConfirmResetPassword = (newPassword: string) => {
    if (!resetPwdUser) return;
    resetPasswordMutation.mutate(
      { userId: resetPwdUser.id, newPassword },
      { onSuccess: () => setResetPwdUser(null) }
    );
  };

  const handleApprove = (userId: string, status: "approved" | "rejected") => {
    const isApprove = status === "approved";
    setConfirmState({
      open: true,
      variant: isApprove ? 'confirm' : 'delete',
      title: isApprove ? 'Aprovar usuário?' : 'Rejeitar usuário?',
      message: isApprove ? 'O usuário terá acesso ao sistema.' : 'O usuário não poderá acessar o sistema.',
      confirmLabel: isApprove ? 'Aprovar' : 'Rejeitar',
      onConfirm: () => { setConfirmState(prev => ({ ...prev, open: false })); approveUserMutation.mutate({ userId, status }); },
    });
  };

  // Desativar é destrutivo (tira o acesso de alguém) — pede confirmação.
  // Reativar é reversível e segue direto.
  const handleToggleActive = (u: User) => {
    const willDeactivate = u.isActive !== false;
    if (!willDeactivate) {
      toggleActiveMutation.mutate(u.id);
      return;
    }
    setConfirmState({
      open: true,
      variant: 'delete',
      title: 'Desativar usuário?',
      message: `${u.name} perderá o acesso ao sistema imediatamente. Você pode reativar a conta depois.`,
      confirmLabel: 'Desativar',
      onConfirm: () => { setConfirmState(prev => ({ ...prev, open: false })); toggleActiveMutation.mutate(u.id); },
    });
  };

  // Um único critério por status, usado nos cards E no filtro — antes o card
  // "Aprovados" contava só ativos mas o filtro mostrava também os desativados.
  const isPendingUser  = (u: User) => u.status === "pending";
  const isApprovedUser = (u: User) => u.status === "approved" && u.isActive !== false;
  const isInactiveUser = (u: User) => u.status === "rejected" || u.isActive === false;

  // Counts (unfiltered)
  const totalCount    = users.length;
  const pendingCount  = users.filter(isPendingUser).length;
  const approvedCount = users.filter(isApprovedUser).length;
  const inactiveCount = users.filter(isInactiveUser).length;

  const filtered = useMemo(() => {
    return users
      .filter(u => {
        if (statusFilter === "pending"  && !isPendingUser(u))  return false;
        if (statusFilter === "approved" && !isApprovedUser(u)) return false;
        if (statusFilter === "inactive" && !isInactiveUser(u)) return false;
        // Filtro de perfil compara o papel normalizado (aliases legados no banco)
        if (roleFilter !== "all" && normalizeRole(u.role) !== roleFilter) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [users, statusFilter, roleFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const setFilter = (val: string) => setUrlState({ status: val, pagina: 1 });
  const setRole   = (val: string) => setUrlState({ role: val, pagina: 1 });
  const clearAll  = () => setUrlState({ q: "", status: "all", role: "all", pagina: 1 });

  // A lista encolhe quando um usuário muda de status; sem isto a página atual
  // podia ficar fora do intervalo e a tabela aparecia vazia com o rodapé cheio.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // A checagem de permissão precisa vir DEPOIS de todos os hooks: quando ela
  // ficava antes, o primeiro render (sessão ainda carregando) não executava os
  // hooks e o React quebrava com "rendered more hooks than during the previous render".
  if (authLoading) {
    return (
      <PageContainer>
        <LoadingState count={4} variant="cards" />
      </PageContainer>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-lg font-bold text-foreground mb-1">Acesso Negado</h2>
          <p className="text-sm text-muted-foreground">Você não tem permissão para acessar esta página.</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <AlertCircle className="w-10 h-10 text-danger-strong mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-lg font-bold text-foreground mb-1">Não foi possível carregar os usuários</h2>
          <p className="text-sm text-muted-foreground mb-4">{errorText(error, "Verifique sua conexão e tente novamente.")}</p>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-border text-slate-600 hover:border-slate-300 disabled:opacity-50"
          >
            {isFetching ? "Tentando…" : "Tentar novamente"}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader icon={ShieldCheck} title="Usuários" subtitle="Aprove, edite e gerencie contas de acesso ao sistema" />
        <LoadingState count={4} variant="cards" className="lg:grid-cols-4" />
        <LoadingState count={6} label="Carregando usuários…" />
      </PageContainer>
    );
  }

  return (
    <TooltipProvider>
      <PageContainer>

        {/* ── Header ── */}
        <PageHeader
          icon={ShieldCheck}
          title="Usuários"
          subtitle="Aprove, edite e gerencie contas de acesso ao sistema"
          actions={canCreate && (
            <button
              onClick={() => setLocation("/user-registration")}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold rounded-lg shadow-1 hover:shadow-2 transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> Novo Usuário
            </button>
          )}
        />

        {/* ── Metric cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Total" value={totalCount} valueColor="text-foreground" active={statusFilter === "all"} onClick={() => setFilter("all")} />
          <MetricCard label="Pendentes" value={pendingCount} valueColor="text-warning" active={statusFilter === "pending"} onClick={() => setFilter("pending")} />
          <MetricCard label="Aprovados" value={approvedCount} valueColor="text-success" active={statusFilter === "approved"} onClick={() => setFilter("approved")} />
          <MetricCard label="Inativos" value={inactiveCount} valueColor="text-muted-foreground" active={statusFilter === "inactive"} onClick={() => setFilter("inactive")} />
        </div>

        {/* ── Search + Filters ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Buscar por nome ou e-mail…"
              aria-label="Buscar usuários por nome ou e-mail"
              value={searchQuery}
              onChange={e => setUrlState({ q: e.target.value, pagina: 1 })}
              className="pl-9 h-9 text-sm border-input rounded-lg focus:border-primary focus:ring-1 focus:ring-ring/20"
              data-testid="input-search-users"
            />
            {searchQuery && (
              <button type="button" aria-label="Limpar busca" onClick={() => setUrlState({ q: "", pagina: 1 })} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600">
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Perfil filter */}
          <Select value={roleFilter} onValueChange={setRole}>
            <SelectTrigger aria-label="Filtrar por perfil" className="h-9 w-[175px] text-xs border-input rounded-lg focus:border-primary focus:ring-1 focus:ring-ring/20">
              <SelectValue placeholder="Todos os perfis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os perfis</SelectItem>
              <SelectItem value="admin">Administrador</SelectItem>
              <SelectItem value="production">Logística Interna</SelectItem>
              <SelectItem value="function_area">Área de Função</SelectItem>
              <SelectItem value="purchasing">Compras / Viagem</SelectItem>
              <SelectItem value="financial">RH</SelectItem>
            </SelectContent>
          </Select>

          {(searchQuery || statusFilter !== "all" || roleFilter !== "all") && (
            <button onClick={clearAll}
              className="flex items-center gap-1 h-9 px-3 text-xs text-muted-foreground border border-border rounded-lg hover:border-slate-300 transition-colors">
              <X className="w-3 h-3" aria-hidden="true" /> Limpar
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
            {filtered.length} de {users.length} usuários
          </span>
        </div>

        {/* ── Table ── */}
        <div className="bg-card rounded-xl border border-border shadow-1 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted/80 border-b border-border">
                  <th scope="col" className="text-left px-6 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Usuário</th>
                  <th scope="col" className="text-left px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">E-mail</th>
                  <th scope="col" className="text-left px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Perfil</th>
                  <th scope="col" className="text-left px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th scope="col" className="text-left px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Cadastro</th>
                  <th scope="col" className="text-right px-6 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6">
                      <EmptyState
                        icon={Users}
                        variant={(searchQuery || statusFilter !== "all" || roleFilter !== "all") ? "filtered" : "default"}
                        title="Nenhum usuário encontrado"
                        description="Ajuste os filtros ou adicione um novo usuário."
                        onClearFilters={(searchQuery || statusFilter !== "all" || roleFilter !== "all") ? clearAll : undefined}
                        className="border-0 py-12"
                      />
                    </td>
                  </tr>
                ) : (
                  paginated.map((u, idx) => {
                    const isInactive = u.isActive === false || u.status === "rejected";
                    const isPending  = u.status === "pending";
                    const isEven = idx % 2 === 1;
                    const col = avatarColor(u.name);

                    return (
                      <tr
                        key={u.id}
                        className={`border-b border-border transition-colors ${
                          isPending
                            ? "bg-warning-soft/40 hover:bg-warning-soft/70"
                            : isEven
                            ? "bg-surface-muted/40 hover:bg-brand-soft/40"
                            : "bg-card hover:bg-brand-soft/40"
                        } ${isInactive ? "opacity-75" : ""}`}
                      >
                        {/* Usuário */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-2xs font-bold text-white shrink-0 ${col}`}>
                              {initials(u.name)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-foreground text-sm leading-tight" data-testid={`text-user-name-${u.id}`}>
                                  {u.name}
                                </span>
                              </div>
                              {u.area && <p className="text-2xs text-muted-foreground mt-0.5">{u.area}</p>}
                            </div>
                          </div>
                        </td>

                        {/* E-mail */}
                        <td className="px-4 py-4">
                          <span className="font-mono text-xs text-muted-foreground" data-testid={`text-user-email-${u.id}`}>
                            {u.email}
                          </span>
                        </td>

                        {/* Perfil */}
                        <td className="px-4 py-4">
                          <RoleBadge role={u.role} />
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <StatusPill status={u.status} isActive={u.isActive} />
                        </td>

                        {/* Data de Cadastro */}
                        <td className="px-4 py-4 text-xs text-muted-foreground tabular-nums">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString("pt-BR") : "—"}
                        </td>

                        {/* Ações */}
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setEditingUser(u)}
                                  aria-label={`Editar usuário ${u.name}`}
                                  className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-brand-soft transition-colors"
                                  data-testid={`button-edit-${u.id}`}
                                >
                                  <Edit className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Editar Usuário</TooltipContent>
                            </Tooltip>

                            {/* Pending: approve / reject */}
                            {isPending && (
                              <>
                                <MotivoDesabilitado motivo={canManageAccounts ? "Aprovar" : SO_ADMIN} desabilitado={!canManageAccounts}>
                                    <button
                                      onClick={() => handleApprove(u.id, "approved")}
                                      disabled={approveUserMutation.isPending || !canManageAccounts}
                                      aria-label={`Aprovar usuário ${u.name}`}
                                      className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-success hover:bg-success-soft disabled:opacity-40 transition-colors"
                                      data-testid={`button-approve-${u.id}`}
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                </MotivoDesabilitado>
                                <MotivoDesabilitado motivo={canManageAccounts ? "Rejeitar" : SO_ADMIN} desabilitado={!canManageAccounts}>
                                    <button
                                      onClick={() => handleApprove(u.id, "rejected")}
                                      disabled={approveUserMutation.isPending || !canManageAccounts}
                                      aria-label={`Rejeitar usuário ${u.name}`}
                                      className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-danger hover:bg-danger-soft disabled:opacity-40 transition-colors"
                                      data-testid={`button-reject-${u.id}`}
                                    >
                                      <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                </MotivoDesabilitado>
                              </>
                            )}

                            {/* Rejected: reactivate */}
                            {u.status === "rejected" && (
                              <MotivoDesabilitado motivo={canManageAccounts ? "Reativar" : SO_ADMIN} desabilitado={!canManageAccounts}>
                                  <button
                                    onClick={() => handleApprove(u.id, "approved")}
                                    disabled={approveUserMutation.isPending || !canManageAccounts}
                                    aria-label={`Reativar usuário ${u.name}`}
                                    className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-success hover:bg-success-soft disabled:opacity-40 transition-colors"
                                    data-testid={`button-reactivate-${u.id}`}
                                  >
                                    <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                                  </button>
                              </MotivoDesabilitado>
                            )}

                            {/* Approved: reset password + toggle active — o servidor só aceita
                                admin; os outros papéis veem o botão desabilitado com o motivo. */}
                            {u.status === "approved" && (
                              <>
                                <MotivoDesabilitado motivo={canManageAccounts ? "Redefinir senha" : SO_ADMIN} desabilitado={!canManageAccounts}>
                                    <button
                                      onClick={() => handleResetPassword(u)}
                                      disabled={resetPasswordMutation.isPending || !canManageAccounts}
                                      aria-label={`Resetar senha de ${u.name}`}
                                      className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-warning hover:bg-warning-soft disabled:opacity-40 transition-colors"
                                      data-testid={`button-reset-pwd-${u.id}`}
                                    >
                                      <Key className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                </MotivoDesabilitado>

                                <MotivoDesabilitado motivo={canManageAccounts ? (u.isActive !== false ? "Desativar usuário" : "Reativar usuário") : SO_ADMIN} desabilitado={!canManageAccounts}>
                                    <button
                                      onClick={() => handleToggleActive(u)}
                                      disabled={toggleActiveMutation.isPending || !canManageAccounts}
                                      aria-label={u.isActive !== false ? `Desativar usuário ${u.name}` : `Reativar usuário ${u.name}`}
                                      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-40 ${
                                        u.isActive !== false
                                          ? "text-muted-foreground hover:text-danger hover:bg-danger-soft"
                                          : "text-success bg-success-soft hover:bg-success-soft"
                                      }`}
                                      data-testid={`button-toggle-active-${u.id}`}
                                    >
                                      {u.isActive !== false
                                        ? <UserMinus className="w-3.5 h-3.5" aria-hidden="true" />
                                        : <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />}
                                    </button>
                                </MotivoDesabilitado>

                                {/* Admin-only: toggle cenotécnica approval permission */}
                                {isAdmin && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => toggleCenotecnicaMutation.mutate(u.id)}
                                        disabled={toggleCenotecnicaMutation.isPending}
                                        aria-label={(u as any).canApproveCenotecnica
                                          ? `Remover permissão de aprovar cenotécnica de ${u.name}`
                                          : `Dar permissão de aprovar cenotécnica a ${u.name}`}
                                        className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-40 ${
                                          (u as any).canApproveCenotecnica
                                            ? "text-primary bg-brand-soft hover:bg-brand-soft"
                                            : "text-muted-foreground hover:text-primary-hover hover:bg-brand-soft"
                                        }`}
                                        data-testid={`button-toggle-cenotecnica-${u.id}`}
                                      >
                                        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {(u as any).canApproveCenotecnica
                                        ? "Remover permissão: aprovar cenotécnica"
                                        : "Dar permissão: aprovar cenotécnica"}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Footer / Pagination ── */}
          {filtered.length > 0 && (
            <div className="px-6 py-3 border-t border-border flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Exibindo{" "}
                <span className="font-medium text-slate-600">
                  {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)}
                </span>{" "}
                de{" "}
                <span className="font-medium text-slate-600">{filtered.length}</span> usuários
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    aria-label="Página anterior"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-slate-700 hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <span className="text-xs text-muted-foreground px-2 tabular-nums">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    aria-label="Próxima página"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-slate-700 hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Edit Modal */}
        <UserEditModal
          isOpen={editingUser !== null}
          onClose={() => setEditingUser(null)}
          user={editingUser}
        />

        {/* Reset Password Modal */}
        <ResetPasswordModal
          isOpen={resetPwdUser !== null}
          onClose={() => setResetPwdUser(null)}
          userName={resetPwdUser?.name ?? ""}
          isPending={resetPasswordMutation.isPending}
          onConfirm={handleConfirmResetPassword}
        />
      </PageContainer>

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(o) => { if (!o) setConfirmState(prev => ({ ...prev, open: false })); }}
        title={confirmState.title}
        description={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        tone={confirmState.variant === "confirm" ? "default" : "danger"}
        onConfirm={confirmState.onConfirm}
      />
    </TooltipProvider>
  );
}
