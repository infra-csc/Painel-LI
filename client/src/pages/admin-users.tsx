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
import UserEditModal from "@/components/modals/user-edit-modal";
import ResetPasswordModal from "@/components/modals/reset-password-modal";
import ConfirmModal, { type ConfirmVariant } from "@/components/common/confirm-modal";
import type { User } from "@shared/schema";

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

// ─── Config ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

const ROLE_CFG: Record<string, { label: string; cls: string }> = {
  admin:         { label: "Administrador", cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" },
  administrador: { label: "Administrador", cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" },
  administrator: { label: "Administrador", cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" },
  production:    { label: "Produção",      cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" },
  function_area: { label: "Área de Função",cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  rh:            { label: "RH",            cls: "bg-orange-50 text-orange-700 ring-1 ring-orange-200" },
  purchasing:    { label: "Compras",       cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  financial:     { label: "RH",            cls: "bg-teal-50 text-teal-700 ring-1 ring-teal-200" },
};

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CFG[role] ?? { label: role, cls: "bg-slate-50 text-slate-600 ring-1 ring-slate-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function StatusPill({ status, isActive }: { status: string; isActive: boolean | null }) {
  if (status === "pending") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200">Pendente</span>;
  }
  if (status === "approved" && isActive !== false) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Ativo</span>;
  }
  if (status === "rejected") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 ring-1 ring-slate-200">Rejeitado</span>;
  }
  // approved + isActive===false → Inativo (gray, NOT red)
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 ring-1 ring-slate-200">Inativo</span>;
}

// ─── Metric card ─────────────────────────────────────────────────────────────
function MetricCard({
  label, value, valueColor, active, onClick
}: { label: string; value: number; valueColor: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 bg-white rounded-xl border shadow-sm transition-all hover:shadow-md ${
        active ? "border-blue-300 ring-2 ring-blue-100" : "border-gray-200"
      }`}
    >
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
    </button>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AdminUsers() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);
  const [page, setPage] = useState(1);
  const [confirmState, setConfirmState] = useState<{
    open: boolean; variant: ConfirmVariant; title: string; message: string; confirmLabel: string; onConfirm: () => void;
  }>({ open: false, variant: 'delete', title: '', message: '', confirmLabel: '', onConfirm: () => {} });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const isAdmin = user?.role === "admin" || user?.role === "administrador" || user?.role === "administrator";
  const isRh    = user?.role === "financial";
  const isPurchasing = user?.role === "purchasing";
  const isProduction = user?.role === "production";
  const hasAccess = !!user && (isAdmin || isRh || isPurchasing || isProduction);

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
    onSuccess: () => { toast({ title: "Sucesso", description: "Status da conta atualizado" }); queryClient.invalidateQueries({ queryKey: ["/api/users"] }); },
    onError: (e: any) => toast({ title: "Erro ao alterar status", description: errorText(e, "Não foi possível alterar o status da conta."), variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) =>
      (await apiRequest("POST", `/api/users/${userId}/reset-password`, { newPassword })).json(),
    onSuccess: () => { toast({ title: "Sucesso", description: "Senha resetada. O usuário deverá trocá-la no próximo login." }); queryClient.invalidateQueries({ queryKey: ["/api/users"] }); },
    onError: (e: any) => toast({ title: "Erro ao resetar senha", description: errorText(e, "Não foi possível resetar a senha."), variant: "destructive" }),
  });

  const approveUserMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: "approved" | "rejected" }) =>
      (await apiRequest("PATCH", `/api/users/${userId}/approval`, { status })).json(),
    onSuccess: () => { toast({ title: "Sucesso", description: "Status do usuário atualizado" }); queryClient.invalidateQueries({ queryKey: ["/api/users"] }); },
    onError: (e: any) => toast({ title: "Erro", description: errorText(e, "Não foi possível atualizar o usuário."), variant: "destructive" }),
  });

  const toggleCenotecnicaMutation = useMutation({
    mutationFn: async (userId: string) =>
      (await apiRequest("PATCH", `/api/users/${userId}/toggle-cenotecnica-approval`)).json(),
    onSuccess: (data) => {
      const label = data.canApproveCenotecnica ? "habilitada" : "desabilitada";
      toast({ title: "Permissão atualizada", description: `Aprovação de cenotécnica ${label} para este usuário.` });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (e: any) => toast({ title: "Erro", description: errorText(e, "Não foi possível alterar a permissão."), variant: "destructive" }),
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

  // Counts (unfiltered)
  const totalCount    = users.length;
  const pendingCount  = users.filter(u => u.status === "pending").length;
  const approvedCount = users.filter(u => u.status === "approved" && u.isActive !== false).length;
  const inactiveCount = users.filter(u => u.status === "rejected" || u.isActive === false).length;

  const filtered = useMemo(() => {
    return users
      .filter(u => {
        if (statusFilter === "inactive") {
          if (!(u.status === "rejected" || u.isActive === false)) return false;
        } else if (statusFilter !== "all" && u.status !== statusFilter) {
          return false;
        }
        if (roleFilter !== "all" && u.role !== roleFilter) return false;
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

  const setFilter = (val: string) => { setStatusFilter(val); setPage(1); };
  const setRole   = (val: string) => { setRoleFilter(val); setPage(1); };
  const clearAll  = () => { setSearchQuery(""); setFilter("all"); setRole("all"); };

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
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-slate-100 rounded-xl w-1/3" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-100 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Acesso Negado</h2>
          <p className="text-sm text-slate-500">Você não tem permissão para acessar esta página.</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800 mb-1">Não foi possível carregar os usuários</h2>
          <p className="text-sm text-slate-500 mb-4">{errorText(error, "Verifique sua conexão e tente novamente.")}</p>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-slate-600 hover:border-gray-300 disabled:opacity-50"
          >
            {isFetching ? "Tentando..." : "Tentar novamente"}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-slate-100 rounded-xl w-1/3" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-100 rounded-xl" />)}
        </div>
        {[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-slate-50 rounded-xl" />)}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-bold text-slate-800">Gerenciamento de Usuários</h1>
            <p className="text-xs text-slate-400 mt-0.5">Aprove, edite e gerencie contas de acesso ao sistema</p>
          </div>
          <button
            onClick={() => setLocation("/user-registration")}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-200 hover:shadow-md hover:shadow-blue-200 transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" /> Novo Usuário
          </button>
        </div>

        {/* ── Metric cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Total" value={totalCount} valueColor="text-slate-800" active={statusFilter === "all"} onClick={() => setFilter("all")} />
          <MetricCard label="Pendentes" value={pendingCount} valueColor="text-amber-600" active={statusFilter === "pending"} onClick={() => setFilter("pending")} />
          <MetricCard label="Aprovados" value={approvedCount} valueColor="text-emerald-600" active={statusFilter === "approved"} onClick={() => setFilter("approved")} />
          <MetricCard label="Inativos" value={inactiveCount} valueColor="text-slate-400" active={statusFilter === "inactive"} onClick={() => setFilter("inactive")} />
        </div>

        {/* ── Search + Filters ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              aria-label="Buscar usuários por nome ou e-mail"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className="pl-9 h-9 text-sm border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
              data-testid="input-search-users"
            />
            {searchQuery && (
              <button type="button" aria-label="Limpar busca" onClick={() => { setSearchQuery(""); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Role filter */}
          <Select value={roleFilter} onValueChange={setRole}>
            <SelectTrigger className="h-9 w-[175px] text-xs border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20">
              <SelectValue placeholder="Todas as funções" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as funções</SelectItem>
              <SelectItem value="admin">Administrador</SelectItem>
              <SelectItem value="production">Logística Interna</SelectItem>
              <SelectItem value="function_area">Área de Função</SelectItem>
              <SelectItem value="purchasing">Compras / Viagem</SelectItem>
              <SelectItem value="financial">RH</SelectItem>
            </SelectContent>
          </Select>

          {(searchQuery || statusFilter !== "all" || roleFilter !== "all") && (
            <button onClick={clearAll}
              className="flex items-center gap-1 h-9 px-3 text-xs text-slate-500 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
          <span className="text-xs text-slate-400 ml-auto tabular-nums">
            {filtered.length} de {users.length} usuários
          </span>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Usuário</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">E-mail</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Função</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Cadastro</th>
                  <th className="text-right px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-500">Nenhum usuário encontrado</p>
                      <p className="text-xs text-slate-400 mt-1">Ajuste os filtros ou adicione um novo usuário.</p>
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
                        className={`border-b border-gray-50 transition-colors ${
                          isPending
                            ? "bg-amber-50/40 hover:bg-amber-50/70"
                            : isEven
                            ? "bg-slate-50/40 hover:bg-blue-50/40"
                            : "bg-white hover:bg-blue-50/40"
                        } ${isInactive ? "opacity-75" : ""}`}
                      >
                        {/* Usuário */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${col}`}>
                              {initials(u.name)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-800 text-sm leading-tight" data-testid={`text-user-name-${u.id}`}>
                                  {u.name}
                                </span>
                              </div>
                              {u.area && <p className="text-[11px] text-slate-400 mt-0.5">{u.area}</p>}
                            </div>
                          </div>
                        </td>

                        {/* E-mail */}
                        <td className="px-4 py-4">
                          <span className="font-mono text-xs text-slate-500" data-testid={`text-user-email-${u.id}`}>
                            {u.email}
                          </span>
                        </td>

                        {/* Função */}
                        <td className="px-4 py-4">
                          <RoleBadge role={u.role} />
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <StatusPill status={u.status} isActive={u.isActive} />
                        </td>

                        {/* Data de Cadastro */}
                        <td className="px-4 py-4 text-xs text-slate-400 tabular-nums">
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
                                  className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                  data-testid={`button-edit-${u.id}`}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Editar Usuário</TooltipContent>
                            </Tooltip>

                            {/* Pending: approve / reject */}
                            {isPending && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleApprove(u.id, "approved")}
                                      disabled={approveUserMutation.isPending}
                                      aria-label={`Aprovar usuário ${u.name}`}
                                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
                                      data-testid={`button-approve-${u.id}`}
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Aprovar</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleApprove(u.id, "rejected")}
                                      disabled={approveUserMutation.isPending}
                                      aria-label={`Rejeitar usuário ${u.name}`}
                                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                                      data-testid={`button-reject-${u.id}`}
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Rejeitar</TooltipContent>
                                </Tooltip>
                              </>
                            )}

                            {/* Rejected: reactivate */}
                            {u.status === "rejected" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => handleApprove(u.id, "approved")}
                                    disabled={approveUserMutation.isPending}
                                    aria-label={`Reativar usuário ${u.name}`}
                                    className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
                                    data-testid={`button-reactivate-${u.id}`}
                                  >
                                    <UserCheck className="w-3.5 h-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Reativar</TooltipContent>
                              </Tooltip>
                            )}

                            {/* Approved: reset password + toggle active */}
                            {u.status === "approved" && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleResetPassword(u)}
                                      disabled={resetPasswordMutation.isPending}
                                      aria-label={`Resetar senha de ${u.name}`}
                                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-40 transition-colors"
                                      data-testid={`button-reset-pwd-${u.id}`}
                                    >
                                      <Key className="w-3.5 h-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Resetar Senha</TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleToggleActive(u)}
                                      disabled={toggleActiveMutation.isPending}
                                      aria-label={u.isActive !== false ? `Desativar usuário ${u.name}` : `Reativar usuário ${u.name}`}
                                      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-40 ${
                                        u.isActive !== false
                                          ? "text-slate-400 hover:text-red-600 hover:bg-red-50"
                                          : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                                      }`}
                                      data-testid={`button-toggle-active-${u.id}`}
                                    >
                                      {u.isActive !== false
                                        ? <UserMinus className="w-3.5 h-3.5" />
                                        : <UserCheck className="w-3.5 h-3.5" />}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {u.isActive !== false ? "Desativar Usuário" : "Reativar Usuário"}
                                  </TooltipContent>
                                </Tooltip>

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
                                            ? "text-violet-600 bg-violet-50 hover:bg-violet-100"
                                            : "text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                                        }`}
                                        data-testid={`button-toggle-cenotecnica-${u.id}`}
                                      >
                                        <ShieldCheck className="w-3.5 h-3.5" />
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
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-slate-400">
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
                    className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs text-slate-500 px-2 tabular-nums">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    aria-label="Próxima página"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
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
      </div>

      <ConfirmModal
        open={confirmState.open}
        variant={confirmState.variant}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, open: false }))}
      />
    </TooltipProvider>
  );
}
