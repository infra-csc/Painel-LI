/**
 * Usuários — quem entra no sistema, com qual perfil e o que esse perfil abre.
 *
 * 08/10 (redesenho, série premium): a casca de Funções/Colaboradores — barra
 * de 56px grudada (título, o resumo por extenso e "Novo usuário"), conteúdo
 * em até 1560px, a faixa de situação que conta E filtra (Aguardando
 * aprovação, Com acesso, Sem acesso), a barra de filtros comum e a lista que
 * vira cartão no estreito. Cada linha diz de relance o que a pessoa abre (o
 * mapa de acesso do perfil) e as ações perigosas dizem o que acontece antes.
 *
 * Nada de regra mudou: as mesmas consultas, mutações, permissões
 * (`canAccessAdminUsers`, `canCreateUsers`, `canManageUserAccounts`), o mesmo
 * "Redefinir senha" só fora de produção e a mesma confirmação só para
 * aprovar, rejeitar e desativar. Pedaços em `components/admin-users/`.
 */
import { useState, useMemo, useEffect, useCallback, type ComponentType, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Check, CircleCheck, Clock, KeyRound, Loader2, PencilLine, ShieldCheck, UserCheck, UserMinus,
  UserPlus, UserRoundX, Users, X,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/hooks/use-auth";
import { campo, useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";
import UserEditModal from "@/components/modals/user-edit-modal";
import ResetPasswordModal from "@/components/modals/reset-password-modal";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { usePageTitle } from "@/components/common/use-page-title";
import { FilaDeTrabalho, type BlocoDaFilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import { BuscaDaLista, EtiquetaDeFiltro, LimparFiltros, MaisFiltros, type ListaCurta } from "@/components/common/barra-de-filtros";
import type { User } from "@shared/schema";
import { normalizeRole } from "@shared/roles";
import { hasPermission } from "@/lib/role-utils";
import {
  NOME_DO_PERFIL, PERFIS, isApprovedUser, isInactiveUser, isPendingUser, nomeDaPessoa, nomeDoPerfil, telasDoPerfil,
  type Situacao,
} from "@/components/admin-users/acesso";
import { AvatarDoUsuario, PerfilDoUsuario, SituacaoDaConta } from "@/components/admin-users/pecas";
import { PAGE_SIZE, PaginacaoDeUsuarios, UsuariosLista } from "@/components/admin-users/usuarios-lista";
import { CarregandoUsuarios, FalhaAoCarregar, SemPermissao } from "@/components/admin-users/usuarios-estados";

const SITUACOES: { id: Situacao | "all"; nome: string }[] = [
  { id: "all", nome: "Todas as situações" },
  { id: "pending", nome: "Aguardando aprovação" },
  { id: "approved", nome: "Com acesso" },
  { id: "inactive", nome: "Sem acesso" },
];

/** Botão de ícone da linha (32px; 44px no toque). */
const ICONE = "usr-acao pas-alvo inline-flex w-8 h-8 items-center justify-center rounded-lg text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground";
/** Botão com texto: a ação forte da linha (Aprovar, Reativar). */
const COM_TEXTO = "usr-acao usr-forte pas-alvo inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed";

/** Resumo da conta nas confirmações: quem, e-mail, perfil e situação. */
function ResumoDaConta({ u }: { u: User }) {
  return (
    // Sem `nowrap` no e-mail: o resumo mora num item de grade do diálogo, e um
    // texto que não quebra alargava o diálogo além da tela no celular.
    <div className="flex items-start gap-3 min-w-0">
      <AvatarDoUsuario nome={u.name} />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-semibold leading-5 break-words">{nomeDaPessoa(u.name)}</p>
        <p className="m-0 text-muted-foreground break-all">{u.email}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <PerfilDoUsuario role={u.role} />
          <SituacaoDaConta u={u} />
        </div>
      </div>
    </div>
  );
}

interface EstadoDaConfirmacao {
  open: boolean;
  /** "delete"/"cancel" desfazem algo → tom destrutivo no ConfirmDialog; "confirm" é neutro. */
  variant: "delete" | "cancel" | "confirm";
  title: string;
  message: ReactNode;
  confirmLabel: string;
  icon?: ComponentType<{ className?: string }>;
  alvo?: User;
  onConfirm: () => void;
}

export default function AdminUsers() {
  usePageTitle("Usuários");
  // Busca, papel, status e página na URL (23/09): aprovar alguém e voltar
  // devolvia a lista sem o recorte. A faixa de situação também é filtro.
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
  const setPage = useCallback((p: number | ((prev: number) => number)) =>
    setUrlState(prev => ({ ...prev, pagina: typeof p === "function" ? p(prev.pagina) : p })), [setUrlState]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);
  const [confirmState, setConfirmState] = useState<EstadoDaConfirmacao>({
    open: false, variant: "delete", title: "", message: "", confirmLabel: "", onConfirm: () => {},
  });
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

  // Mensagem de erro padronizada (api-error): erro de rede/sessão nunca pode virar "lista vazia".
  const errorText = (e: unknown, fallback: string) => apiErrorMessage(e, fallback);

  const { data: users = [], isLoading, isError, error, refetch, isFetching } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: hasAccess,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (userId: string) => (await apiRequest("PATCH", `/api/users/${userId}/toggle-active`)).json() as Promise<User>,
    onSuccess: (u) => {
      const nome = u?.name ? nomeDaPessoa(u.name) : null;
      toast({
        variant: "success",
        title: nome ? (u.isActive === false ? `Acesso de ${nome} desativado` : `Acesso de ${nome} reativado`) : "Status da conta atualizado",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (e: unknown) => toast({ title: "Não foi possível alterar o status da conta", description: errorText(e, "Não foi possível alterar o status da conta."), variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) =>
      (await apiRequest("POST", `/api/users/${userId}/reset-password`, { newPassword })).json(),
    onSuccess: () => { toast({ variant: "success", title: "Senha redefinida", description: "O usuário deverá trocá-la no próximo login." }); queryClient.invalidateQueries({ queryKey: ["/api/users"] }); },
    onError: (e: unknown) => toast({ title: "Não foi possível redefinir a senha", description: errorText(e, "Não foi possível resetar a senha."), variant: "destructive" }),
  });

  const approveUserMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: "approved" | "rejected" }) =>
      (await apiRequest("PATCH", `/api/users/${userId}/approval`, { status })).json() as Promise<User>,
    onSuccess: (u) => {
      const nome = u?.name ? nomeDaPessoa(u.name) : null;
      toast({
        variant: "success",
        title: nome ? (u.status === "rejected" ? `Cadastro de ${nome} rejeitado` : `Cadastro de ${nome} aprovado`) : "Aprovação do usuário atualizada",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (e: unknown) => toast({ title: "Não foi possível atualizar a aprovação", description: errorText(e, "Tente novamente."), variant: "destructive" }),
  });

  const toggleCenotecnicaMutation = useMutation({
    mutationFn: async (userId: string) =>
      (await apiRequest("PATCH", `/api/users/${userId}/toggle-cenotecnica-approval`)).json(),
    onSuccess: (data) => {
      const label = data.canApproveCenotecnica ? "habilitada" : "desabilitada";
      const para = data?.name ? `para ${nomeDaPessoa(data.name)}` : "para este usuário";
      toast({ title: "Permissão atualizada", description: `Aprovação de cenotécnica ${label} ${para}.` });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (e: unknown) => toast({ title: "Não foi possível alterar a permissão", description: errorText(e, "Tente novamente."), variant: "destructive" }),
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

  const fecharConfirmacao = () => setConfirmState(prev => ({ ...prev, open: false }));

  const handleApprove = (u: User, status: "approved" | "rejected") => {
    const isApprove = status === "approved";
    const nome = nomeDaPessoa(u.name);
    const perfil = nomeDoPerfil(u.role);
    const n = telasDoPerfil(u.role).length;
    const reativando = isApprove && u.status === "rejected";
    setConfirmState({
      open: true,
      variant: isApprove ? "confirm" : "delete",
      title: reativando ? `Reativar ${nome}?` : isApprove ? `Aprovar ${nome}?` : `Rejeitar o cadastro de ${nome}?`,
      message: isApprove
        ? <>{reativando ? "Volta a entrar" : "Passa a entrar"} no sistema como <strong className="font-semibold text-foreground">{perfil}</strong>, com acesso a {n} {n === 1 ? "tela" : "telas"}.</>
        : "A pessoa não poderá entrar no sistema e as sessões abertas são encerradas. Dá para aprovar depois, pela situação “Sem acesso”.",
      confirmLabel: reativando ? "Reativar" : isApprove ? "Aprovar" : "Rejeitar",
      icon: isApprove ? UserCheck : UserRoundX,
      alvo: u,
      onConfirm: () => { fecharConfirmacao(); approveUserMutation.mutate({ userId: u.id, status }); },
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
      variant: "delete",
      title: `Desativar o acesso de ${nomeDaPessoa(u.name)}?`,
      message: "A pessoa perde o acesso ao sistema imediatamente: as sessões abertas são encerradas e ela deixa de ser responsável pelas funções do catálogo. Você pode reativar a conta depois — as funções não voltam sozinhas.",
      confirmLabel: "Desativar acesso",
      icon: UserMinus,
      alvo: u,
      onConfirm: () => { fecharConfirmacao(); toggleActiveMutation.mutate(u.id); },
    });
  };

  // Contagens (sem filtro): um único critério por situação, o da faixa E do filtro.
  const totalCount    = users.length;
  const pendingCount  = users.filter(isPendingUser).length;
  const approvedCount = users.filter(isApprovedUser).length;
  const inactiveCount = users.filter(isInactiveUser).length;
  const porPerfil = useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of users) { const r = normalizeRole(u.role) ?? "?"; m[r] = (m[r] ?? 0) + 1; }
    return m;
  }, [users]);

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
  // Só depois de a lista chegar: enquanto carrega ela está vazia (1 página) e
  // o link direto para "?pagina=2" voltava sempre para a primeira.
  useEffect(() => {
    if (isLoading) return;
    if (page > totalPages) setPage(totalPages);
  }, [isLoading, page, totalPages, setPage]);

  /**
   * Ações de conta de um usuário. `rotulado`: no cartão, Rejeitar também ganha
   * texto. Dicas à ESQUERDA do botão: em cima, a da primeira linha ficava
   * cortada pelo cabeçalho grudado da tabela.
   */
  const acoesDoUsuario = (u: User, rotulado: boolean) => {
    const isPending = u.status === "pending";
    const nome = u.name;
    const ativo = u.isActive !== false;
    const mexendoNaConta = toggleActiveMutation.isPending && toggleActiveMutation.variables === u.id;
    const decidindo = approveUserMutation.isPending && approveUserMutation.variables?.userId === u.id;
    const cenoAqui = toggleCenotecnicaMutation.isPending && toggleCenotecnicaMutation.variables === u.id;
    return (
      <div className="relative z-[1] flex items-center justify-end gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setEditingUser(u)}
              aria-label={`Editar usuário ${nome}`}
              className={cn(ICONE, "hover:text-primary hover:bg-brand-soft")}
              data-testid={`button-edit-${u.id}`}
            >
              <PencilLine className="w-4 h-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Editar nome, e-mail e perfil</TooltipContent>
        </Tooltip>

        {/* Pendente: rejeitar e aprovar (a ação forte, com texto) */}
        {isPending && (
          <>
            <MotivoDesabilitado motivo={canManageAccounts ? "Rejeitar o cadastro" : SO_ADMIN} desabilitado={!canManageAccounts} side="left">
              <button
                type="button"
                onClick={() => handleApprove(u, "rejected")}
                disabled={approveUserMutation.isPending || !canManageAccounts}
                aria-label={`Rejeitar usuário ${nome}`}
                className={rotulado
                  ? "usr-acao pas-alvo inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-medium text-danger hover:bg-danger-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  : cn(ICONE, "hover:text-danger hover:bg-danger-soft")}
                data-testid={`button-reject-${u.id}`}
              >
                <X className="w-4 h-4" aria-hidden="true" />{rotulado && "Rejeitar"}
              </button>
            </MotivoDesabilitado>
            <MotivoDesabilitado motivo={canManageAccounts ? "Aprovar: a pessoa passa a entrar no sistema" : SO_ADMIN} desabilitado={!canManageAccounts} side="left">
              <button
                type="button"
                onClick={() => handleApprove(u, "approved")}
                disabled={approveUserMutation.isPending || !canManageAccounts}
                aria-label={`Aprovar usuário ${nome}`}
                className={cn(COM_TEXTO, "border-success/30 bg-success-soft text-success hover:border-success/60")}
                data-testid={`button-approve-${u.id}`}
              >
                {decidindo ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />}
                Aprovar
              </button>
            </MotivoDesabilitado>
          </>
        )}

        {/* Rejeitado: reativar (volta a aprovar) */}
        {u.status === "rejected" && (
          <MotivoDesabilitado motivo={canManageAccounts ? "Reativar: aprova o cadastro de novo" : SO_ADMIN} desabilitado={!canManageAccounts} side="left">
            <button
              type="button"
              onClick={() => handleApprove(u, "approved")}
              disabled={approveUserMutation.isPending || !canManageAccounts}
              aria-label={`Reativar usuário ${nome}`}
              className={cn(COM_TEXTO, "border-border bg-card text-slate-700 hover:border-success/50 hover:text-success")}
              data-testid={`button-reactivate-${u.id}`}
            >
              {decidindo ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />}
              Reativar
            </button>
          </MotivoDesabilitado>
        )}

        {/* Aprovado: senha, cenotécnica e desativar/reativar — o servidor só
            aceita admin; os outros papéis veem o botão desabilitado com o motivo. */}
        {u.status === "approved" && (
          <>
            {/* Redefinir senha só fora de produção (30/09): em produção o acesso é
                pelo Portal Norte com a conta Microsoft — não existe senha no
                Painel, e o botão só servia para prender a pessoa num diálogo de
                troca de senha. */}
            {import.meta.env.DEV && (
              <MotivoDesabilitado motivo={canManageAccounts ? "Redefinir senha" : SO_ADMIN} desabilitado={!canManageAccounts} side="left">
                <button
                  type="button"
                  onClick={() => handleResetPassword(u)}
                  disabled={resetPasswordMutation.isPending || !canManageAccounts}
                  aria-label={`Resetar senha de ${nome}`}
                  className={cn(ICONE, "hover:text-warning-strong hover:bg-warning-soft")}
                  data-testid={`button-reset-pwd-${u.id}`}
                >
                  <KeyRound className="w-4 h-4" aria-hidden="true" />
                </button>
              </MotivoDesabilitado>
            )}

            {/* Só admin: permissão especial de aprovar cenotécnica (liga/desliga). */}
            {isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => toggleCenotecnicaMutation.mutate(u.id)}
                    disabled={toggleCenotecnicaMutation.isPending}
                    aria-pressed={!!u.canApproveCenotecnica}
                    aria-label={u.canApproveCenotecnica
                      ? `Remover permissão de aprovar cenotécnica de ${nome}`
                      : `Dar permissão de aprovar cenotécnica a ${nome}`}
                    className={cn(ICONE, u.canApproveCenotecnica
                      ? "usr-ligado text-primary bg-brand-soft hover:bg-primary/15"
                      : "hover:text-primary hover:bg-brand-soft")}
                    data-testid={`button-toggle-cenotecnica-${u.id}`}
                  >
                    {cenoAqui
                      ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      : <ShieldCheck className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[240px]">
                  {u.canApproveCenotecnica
                    ? "Aprova cenotécnica — clique para remover a permissão"
                    : "Não aprova cenotécnica — clique para dar a permissão"}
                </TooltipContent>
              </Tooltip>
            )}

            <MotivoDesabilitado motivo={canManageAccounts ? (ativo ? "Desativar o acesso" : "Reativar o acesso") : SO_ADMIN} desabilitado={!canManageAccounts} side="left">
              <button
                type="button"
                onClick={() => handleToggleActive(u)}
                disabled={toggleActiveMutation.isPending || !canManageAccounts}
                aria-label={ativo ? `Desativar usuário ${nome}` : `Reativar usuário ${nome}`}
                className={ativo
                  ? cn(ICONE, "hover:text-danger hover:bg-danger-soft")
                  : cn(COM_TEXTO, "border-border bg-card text-slate-700 hover:border-success/50 hover:text-success")}
                data-testid={`button-toggle-active-${u.id}`}
              >
                {mexendoNaConta
                  ? <Loader2 className={ativo ? "w-4 h-4 animate-spin" : "w-3.5 h-3.5 animate-spin"} aria-hidden="true" />
                  : ativo ? <UserMinus className="w-4 h-4" aria-hidden="true" /> : <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />}
                {!ativo && "Reativar"}
              </button>
            </MotivoDesabilitado>
          </>
        )}
      </div>
    );
  };

  // ── Faixa de situação: conta e filtra (reclicar desliga) ──
  const blocos: BlocoDaFilaDeTrabalho<Situacao>[] = [
    { key: "pending",  rotulo: "Aguardando aprovação", n: pendingCount,  sub: pendingCount === 1 ? "cadastro novo" : "cadastros novos", icone: Clock,      cor: "text-warning-strong", titulo: "Cadastros que ainda não entram no sistema — aprovar ou rejeitar é com um administrador" },
    { key: "approved", rotulo: "Com acesso",           n: approvedCount, sub: approvedCount === 1 ? "conta ativa" : "contas ativas",      icone: CircleCheck, cor: "text-success",        titulo: "Aprovados e ativos: entram no sistema com as telas do perfil" },
    { key: "inactive", rotulo: "Sem acesso",           n: inactiveCount, sub: "inativos e rejeitados",                                    icone: UserMinus,  cor: "text-muted-foreground", titulo: "Contas desativadas ou cadastros rejeitados: não entram no sistema" },
  ];
  const situacaoAtiva = (["pending", "approved", "inactive"] as const).find(k => k === statusFilter) ?? null;

  // ── Filtros (o popover comum): situação e perfil, com a contagem de cada ──
  const listas: ListaCurta[] = [
    {
      chave: "status", titulo: "Situação", etiqueta: "Situação", testid: "usr-filtro-situacao",
      opcoes: SITUACOES.map(s => ({
        id: s.id,
        nome: s.id === "all" ? s.nome : `${s.nome} · ${s.id === "pending" ? pendingCount : s.id === "approved" ? approvedCount : inactiveCount}`,
      })),
    },
    {
      chave: "role", titulo: "Perfil", etiqueta: "Perfil", testid: "usr-filtro-perfil",
      opcoes: [{ id: "all", nome: "Todos os perfis" }, ...PERFIS.map(p => ({ id: p, nome: `${NOME_DO_PERFIL[p]} · ${porPerfil[p] ?? 0}` }))],
    },
  ];
  const nFiltros = (statusFilter !== "all" ? 1 : 0) + (roleFilter !== "all" ? 1 : 0);
  const filtrando = !!searchQuery.trim() || nFiltros > 0;
  const perfilAtivo = roleFilter !== "all" ? NOME_DO_PERFIL[roleFilter as keyof typeof NOME_DO_PERFIL] ?? roleFilter : null;

  // ── Vazios ──
  const q = searchQuery.trim();
  const vazio = totalCount === 0 ? (
    <EmptyState icon={Users} title="Nenhum usuário cadastrado"
      description={canCreate ? "Cadastre a primeira pessoa que vai entrar no sistema." : "Ainda não há usuários cadastrados."}
      action={canCreate ? <Button size="sm" onClick={() => setLocation("/user-registration")} className="rounded-lg"><UserPlus className="w-4 h-4" aria-hidden="true" /> Novo usuário</Button> : undefined}
      className="pas-entra" />
  ) : statusFilter === "pending" && !q && roleFilter === "all" ? (
    <EmptyState icon={CircleCheck} title="Nenhum cadastro aguardando aprovação"
      description="Os cadastros pendentes aparecem aqui para um administrador aprovar ou rejeitar."
      action={<Button size="sm" variant="outline" onClick={() => setFilter("all")} className="rounded-lg">Ver todos os usuários</Button>}
      className="pas-entra" />
  ) : (
    <EmptyState variant="filtered" icon={Users}
      title={q ? <>Nenhum usuário com “{q}”</> : "Nenhum usuário neste recorte"}
      description={nFiltros > 0 ? "A busca vale dentro dos filtros ligados. Limpe para ver a lista inteira." : "A busca procura pelo nome e pelo e-mail — confira a grafia."}
      onClearFilters={clearAll}
      className="pas-entra" />
  );

  // A checagem de permissão precisa vir DEPOIS de todos os hooks: quando ela
  // ficava antes, o primeiro render (sessão ainda carregando) não executava os
  // hooks e o React quebrava com "rendered more hooks than during the previous render".
  let conteudo: ReactNode;
  if (authLoading || (hasAccess && isLoading)) conteudo = <CarregandoUsuarios />;
  else if (!hasAccess) conteudo = <SemPermissao />;
  else if (isError) conteudo = <FalhaAoCarregar mensagem={errorText(error, "Verifique sua conexão e tente novamente.")} tentando={isFetching} onTentar={() => refetch()} />;
  else if (totalCount === 0) conteudo = vazio;
  else conteudo = (
    <>
      <FilaDeTrabalho blocos={blocos} ativa={situacaoAtiva} onEscolher={(k) => setFilter(k ?? "all")}
        rotulo="Situação das contas" testid={(k) => `usr-fila-${k}`} />

      <div role="search" aria-label="Filtros dos usuários" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <div className="flex-1 min-w-0 basis-full sm:basis-auto sm:flex-[1_1_220px] sm:max-w-[340px]">
            <BuscaDaLista valor={searchQuery} onChange={(v) => setUrlState({ q: v, pagina: 1 })}
              placeholder="Buscar por nome ou e-mail" rotulo="Buscar usuários por nome ou e-mail" testid="input-search-users" />
          </div>
          <MaisFiltros listas={listas}
            valorDe={(chave) => (chave === "role" ? roleFilter : statusFilter)}
            onEscolher={(chave, id) => (chave === "role" ? setRole(id) : setFilter(id))}
            contagem={nFiltros} mostrarPadrao={nFiltros > 0} onPadrao={() => setUrlState({ status: "all", role: "all", pagina: 1 })}
            testid="usr-filtros" />
          {perfilAtivo && (
            <EtiquetaDeFiltro etiqueta="Perfil" valor={perfilAtivo} titulo="Perfil" onTirar={() => setRole("all")} />
          )}
          {filtrando && (
            <div className="pas-entra flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite" data-testid="usr-recorte">
                <span className="font-semibold text-foreground">{filtered.length}</span> de {totalCount}
              </span>
              <LimparFiltros onClick={clearAll} testid="usr-limpar" />
            </div>
          )}
        </div>
      </div>

      <UsuariosLista
        rows={paginated}
        meuId={user?.id}
        onAbrir={setEditingUser}
        acoes={acoesDoUsuario}
        emptyState={vazio}
        rodape={filtered.length > 0 ? <PaginacaoDeUsuarios total={filtered.length} pagina={page} totalDePaginas={totalPages} irPara={setPage} /> : undefined}
      />
    </>
  );

  // ── Barra da tela ──
  const subtitulo: ReactNode = authLoading || (hasAccess && isLoading) ? "Carregando…" : !hasAccess || isError ? null : (
    <span data-testid="usr-resumo">
      {totalCount} {totalCount === 1 ? "conta" : "contas"}
      {pendingCount > 0 && <span className="text-warning-strong"> · {pendingCount} aguardando aprovação</span>}
      {inactiveCount > 0 && <> · {inactiveCount} sem acesso</>}
    </span>
  );

  const novoUsuario = hasAccess && canCreate ? (
    <Button onClick={() => setLocation("/user-registration")} data-testid="button-new-user"
      className="h-[34px] rounded-lg px-3.5 text-sm font-semibold hover:bg-primary-hover">
      <UserPlus className="h-4 w-4" aria-hidden="true" />
      Novo usuário
    </Button>
  ) : undefined;

  const alvo = confirmState.alvo;

  return (
    <TooltipProvider>
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
        <PageHeader variant="bar" title="Usuários" subtitle={subtitulo} className="mx-0 mt-0" actions={novoUsuario} />
        <div className="px-[var(--page-gutter)] pt-5 pb-6">
          <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">{conteudo}</div>
        </div>
      </div>

      {/* Editar: nome, e-mail, perfil e área */}
      <UserEditModal
        isOpen={editingUser !== null}
        onClose={() => setEditingUser(null)}
        user={editingUser}
      />

      {/* Redefinir senha (só fora de produção) */}
      <ResetPasswordModal
        isOpen={resetPwdUser !== null}
        onClose={() => setResetPwdUser(null)}
        userName={resetPwdUser?.name ?? ""}
        isPending={resetPasswordMutation.isPending}
        onConfirm={handleConfirmResetPassword}
      />

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(o) => { if (!o) fecharConfirmacao(); }}
        title={confirmState.title}
        description={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        tone={confirmState.variant === "confirm" ? "default" : "danger"}
        icon={confirmState.icon}
        detalhes={alvo ? <ResumoDaConta u={alvo} /> : undefined}
        onConfirm={confirmState.onConfirm}
        testId="usr-confirmacao"
      />
    </TooltipProvider>
  );
}
