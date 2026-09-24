import { useState, useMemo, useEffect, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, ClipboardCheck, Loader2, X, Tag, UserMinus, Plus, CirclePlus, Search, Pencil, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EscalaResponsaveisTab from "@/components/functions/escala-responsaveis-tab";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageHeader } from "@/components/common/page-header";
import { campo, useUrlState } from "@/lib/use-url-state";
import { PageContainer } from "@/components/common/page-container";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import type { Function, User as UserType } from "@shared/schema";
import { apiErrorMessage } from "@/lib/api-error";

/** Responsável como vem embutido em GET /api/functions. */
type ManagerSummary = { userId: string; userName: string };
type FunctionWithManagers = Function & { managers?: ManagerSummary[] };

// ─── Avatar colours ────────────────────────────────────────────────────────
const AVATAR_LIGHT: [string, string][] = [
  ["bg-brand-soft",   "text-primary"],
  ["bg-brand-soft", "text-primary"],
  ["bg-success-soft","text-success"],
  ["bg-warning-soft", "text-warning"],
  ["bg-brand-soft",   "text-primary"],
  ["bg-info-soft",   "text-info"],
  ["bg-warning-soft",  "text-warning"],
  ["bg-danger-soft",   "text-danger"],
];

function avatarColor(userId: string): [string, string] {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_LIGHT[h % AVATAR_LIGHT.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Estilos compartilhados ────────────────────────────────────────────────
const LABEL = "block mb-2 text-2xs font-bold text-muted-foreground uppercase tracking-[0.1em]";
const SOFT_INPUT = "w-full text-foreground border-0 rounded-lg bg-brand-soft outline-none focus-visible:ring-2 focus-visible:ring-ring/25 placeholder:text-muted-foreground";
const DIALOG_HEADER = "flex items-center justify-between px-6 py-5 border-b border-border";
const CLOSE_BTN = "flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:bg-muted transition-colors";

// ─── Schemas ───────────────────────────────────────────────────────────────
const functionFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  // Conta contábil do rateio (28/08): é por ela que o Espelho Operacional
  // fecha o custo do evento. Vários departamentos caem na mesma conta —
  // cenotécnica, kit e percurso entram em "LI", por exemplo.
  costCenter: z.string().trim().optional(),
});
type FunctionFormData = z.infer<typeof functionFormSchema>;

// ─── Managers popover ──────────────────────────────────────────────────────
const MGPOP_W = 260;

function ManagersPopover({
  functionName, managers, usersById, x, y, canManage, onRemove, onClose,
}: {
  functionName: string;
  managers: ManagerSummary[];
  usersById: Map<string, UserType>;
  x: number; y: number;
  canManage: boolean;
  onRemove: (userId: string) => void;
  onClose: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const ITEM_H = 52, HEADER_H = 48;
  const popH = Math.min(managers.length * ITEM_H + HEADER_H + 8, 320);
  const openLeft = x > window.innerWidth / 2;
  const rawLeft = openLeft ? x - MGPOP_W - 8 : x + 8;
  const left = Math.max(8, Math.min(window.innerWidth - MGPOP_W - 8, rawLeft));
  const top  = Math.max(8, Math.min(window.innerHeight - popH - 8, y - popH / 2));

  // Só era possível fechar clicando fora — Esc não fazia nada.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70]" role="presentation" onClick={onClose}>
      <div className="absolute bg-popover overflow-hidden animate-in fade-in zoom-in-95 duration-150 rounded-xl border border-border shadow-3"
        role="dialog" aria-label={`Responsáveis por ${functionName}`}
        style={{ width: MGPOP_W, left, top }}
        onClick={e => e.stopPropagation()}>
        <div className="px-3.5 pt-3 pb-2.5 border-b border-border/60">
          <p className="text-xs font-bold text-foreground capitalize truncate">{functionName}</p>
          <p className="text-2xs text-muted-foreground mt-0.5">{managers.length} {managers.length === 1 ? "responsável" : "responsáveis"}</p>
        </div>
        <div className="py-1 divide-y divide-border/40 max-h-72 overflow-y-auto">
          {managers.map(fm => {
            const u = usersById.get(fm.userId);
            const displayName = fm.userName || u?.name || u?.email || "Usuário";
            const [bg, txt] = avatarColor(fm.userId);
            const isConfirming = confirmId === fm.userId;
            return (
              <div key={fm.userId} className="group flex items-center gap-3 px-3.5 py-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-2xs font-bold shrink-0 ${bg} ${txt}`}>
                  {initials(displayName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                </div>
                {!canManage ? null : isConfirming ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-2xs text-muted-foreground font-medium">Remover?</span>
                    <button onClick={e => { e.stopPropagation(); onRemove(fm.userId); setConfirmId(null); }} className="text-2xs font-bold text-danger-strong hover:text-danger px-1 py-0.5 rounded hover:bg-danger-soft transition-colors">Sim</button>
                    <button onClick={e => { e.stopPropagation(); setConfirmId(null); }} className="text-2xs text-muted-foreground hover:text-slate-600 px-1 py-0.5 rounded hover:bg-muted transition-colors">Não</button>
                  </div>
                ) : (
                  <button onClick={e => { e.stopPropagation(); setConfirmId(fm.userId); }}
                    aria-label={`Remover ${displayName} dos responsáveis`}
                    className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-muted-foreground hover:text-danger-strong p-1 rounded hover:bg-danger-soft">
                    <UserMinus className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── FunctionManagersCell ─────────────────────────────────────────────────
// Os responsáveis vêm embutidos em GET /api/functions (`managers`) — nada de
// uma query por linha. Adicionar/remover invalida "/api/functions".
function FunctionManagersCell({ functionId, functionName, managers: managersProp, canManage }: { functionId: string; functionName: string; managers?: ManagerSummary[]; canManage: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users } = useQuery<UserType[]>({ queryKey: ["/api/users"] });

  const invalidateManagers = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/functions"] });
    // rota antiga ainda existe; quem a usar continua coerente
    queryClient.invalidateQueries({ queryKey: [`/api/functions/${functionId}/managers`] });
  };

  const addManagerMutation = useMutation({
    mutationFn: async (userId: string) => (await apiRequest("POST", `/api/functions/${functionId}/managers`, { userId })).json(),
    onSuccess: () => {
      invalidateManagers();
      setSelectedUserId(""); setIsOpen(false);
      toast({ title: "Responsável adicionado!" });
    },
    onError: (err: any) => toast({ title: "Erro ao adicionar responsável", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });
  const removeManagerMutation = useMutation({
    mutationFn: async (userId: string) => (await apiRequest("DELETE", `/api/functions/${functionId}/managers/${userId}`)).json(),
    onSuccess: () => { invalidateManagers(); toast({ title: "Responsável removido." }); },
    onError: (err: any) => toast({ title: "Erro ao remover responsável", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const managers = useMemo(() => managersProp ?? [], [managersProp]);
  const visible  = managers.slice(0, 3);
  const overflow = managers.length > 3 ? managers.length - 3 : 0;

  // find() por usuário dentro do map rodava a cada linha da tabela × responsável.
  // O Map preserva a semântica de "primeiro registro vence" do find original.
  const usersById = useMemo(() => {
    const m = new Map<string, UserType>();
    for (const u of users ?? []) if (!m.has(u.id)) m.set(u.id, u);
    return m;
  }, [users]);

  const availableUsers = useMemo(() => {
    const taken = new Set(managers.map(fm => fm.userId));
    return (users ?? []).filter(u => !taken.has(u.id));
  }, [users, managers]);

  return (
    <div className="flex items-center gap-2">
      {managers.length === 0 && (
        <span className="flex items-center gap-1.5 text-2xs text-muted-foreground italic">
          <AlertTriangle className="w-3 h-3 text-warning-strong" />
          Nenhum responsável
        </span>
      )}

      {managers.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-ring/30"
              role="button" tabIndex={0}
              aria-label={`Ver os ${managers.length} responsáveis por ${functionName}`}
              onClick={e => { e.stopPropagation(); setPopover({ x: e.clientX, y: e.clientY }); }}
              onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault(); e.stopPropagation();
                const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                setPopover({ x: r.right, y: r.top + r.height / 2 });
              }}>
              {visible.map((fm, i) => {
                const u = usersById.get(fm.userId);
                const displayName = fm.userName || u?.name || u?.email || "Usuário";
                const [bg, txt] = avatarColor(fm.userId);
                return (
                  /* A remoção fica só no popover (que pede confirmação) — o "X" no
                     hover apagava o responsável com um clique acidental. */
                  <div key={fm.userId} className={cn("relative w-7 h-7 rounded-full border-2 border-card flex items-center justify-center shrink-0", bg, i > 0 && "-ml-2")}
                    style={{ zIndex: visible.length - i }}>
                    <span className={`text-2xs font-bold ${txt}`}>{initials(displayName)}</span>
                  </div>
                );
              })}

              {overflow > 0 && (
                <div className="relative -ml-2 z-0 w-7 h-7 rounded-full bg-muted hover:bg-border border-2 border-card text-2xs font-bold text-muted-foreground flex items-center justify-center shrink-0 transition-colors">
                  +{overflow}
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Ver todos os {managers.length} responsáveis
          </TooltipContent>
        </Tooltip>
      )}

      {popover && (
        <ManagersPopover functionName={functionName} managers={managers} usersById={usersById}
          x={popover.x} y={popover.y} canManage={canManage}
          onRemove={userId => removeManagerMutation.mutate(userId)}
          onClose={() => setPopover(null)} />
      )}

      {/* Add button — só para quem o servidor aceita em POST /api/functions/:id/managers */}
      {canManage && <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <button type="button" aria-label={`Adicionar responsável a ${functionName}`}
            className="w-7 h-7 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            data-testid={`button-add-function-manager-${functionId}`}>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[380px] rounded-xl p-0 gap-0 border-0 shadow-3 overflow-hidden [&>button:last-child]:hidden">
          <div className={DIALOG_HEADER}>
            <div>
              <DialogTitle className="text-base font-extrabold text-foreground m-0">Adicionar Responsável</DialogTitle>
              <p className="text-2xs text-muted-foreground mt-[3px] capitalize">{functionName}</p>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Fechar" className={CLOSE_BTN}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-5">
            <label htmlFor={`select-function-manager-${functionId}`} className={LABEL}>Usuário</label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger id={`select-function-manager-${functionId}`} aria-label="Selecionar usuário responsável" className="h-10 text-sm border-0 bg-brand-soft rounded-lg focus:ring-2 focus:ring-ring/25" data-testid={`select-function-manager-${functionId}`}>
                <SelectValue placeholder="Selecione um usuário..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {availableUsers.length === 0 ? (
                  <div className="py-3 text-center text-xs text-muted-foreground">Todos os usuários já foram adicionados</div>
                ) : (
                  availableUsers.map(u => (
                    <SelectItem key={u.id} value={u.id} className="py-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-2xs font-bold shrink-0 ${avatarColor(u.id)[0]} ${avatarColor(u.id)[1]}`}>
                          {initials(u.name || u.email)}
                        </div>
                        <span>{u.name || u.email}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2.5 px-6 pt-3 pb-5">
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} className="flex-1 h-[38px] text-sm font-semibold text-muted-foreground hover:text-foreground">
              Cancelar
            </Button>
            <Button type="button" onClick={() => selectedUserId && addManagerMutation.mutate(selectedUserId)}
              disabled={!selectedUserId || addManagerMutation.isPending}
              className="flex-1 h-[38px] text-sm font-bold shadow-2 hover:bg-primary-hover"
              data-testid={`button-submit-add-manager-${functionId}`}>
              {addManagerMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <><Check className="w-3.5 h-3.5" strokeWidth={3} /> Adicionar</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function Functions() {
  usePageTitle("Funções");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFunction, setEditingFunction] = useState<Function | null>(null);
  // Busca na URL (23/09): voltar para a tela devolve o mesmo recorte.
  const [urlState, setUrlState] = useUrlState({ q: campo.texto("") });
  const search = urlState.q;
  const setSearch = (v: string) => setUrlState({ q: v });
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void;
  }>({ open: false, title: '', message: '', confirmLabel: '', onConfirm: () => {} });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Espelha POST/PATCH/DELETE /api/functions e /:id/managers (CADASTRO_ROLES).
  // RH e Área de Função só visualizam.
  const canManage = hasPermission(user, "canManageFunctions");
  // Aba "Validação de Escala": permissão própria, diferente do catálogo
  // ("são permissões diferentes" — decisão do usuário). Hoje: só admin.
  const canSeeEscalaTab = hasPermission(user, "canAccessScalingManagers");

  const form = useForm<FunctionFormData>({
    resolver: zodResolver(functionFormSchema),
    defaultValues: { name: "", costCenter: "" },
  });

  const { data: functions, isLoading, isError, error, refetch } = useQuery<FunctionWithManagers[]>({ queryKey: ["/api/functions"] });

  const sortedFunctions = useMemo(() => {
    if (!functions) return [];
    let list = [...functions].filter(f => f.responsibleArea !== '__system__').sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (search.trim()) { const t = search.toLowerCase(); list = list.filter(f => f.name.toLowerCase().includes(t)); }
    return list;
  }, [functions, search]);

  const totalCount = useMemo(() => (functions ?? []).filter(f => f.responsibleArea !== '__system__').length, [functions]);

  const updateFunctionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FunctionFormData }) => (await apiRequest("PATCH", `/api/functions/${id}`, data)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/functions"] }); toast({ title: "Função atualizada!" }); handleCloseDialog(); },
    onError: (err: any) => toast({ title: "Erro ao atualizar função", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });
  const createFunctionMutation = useMutation({
    mutationFn: async (data: FunctionFormData) => (await apiRequest("POST", "/api/functions", data)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/functions"] }); toast({ title: "Função criada!" }); handleCloseDialog(); },
    onError: (err: any) => toast({ title: "Erro ao salvar função", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });
  const deleteFunctionMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/functions/${id}`)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/functions"] }); toast({ title: "Função removida." }); },
    onError: (err: any) => toast({ title: "Erro ao remover função", description: apiErrorMessage(err, "Pode haver escalações vinculadas."), variant: "destructive" }),
  });

  const handleOpenDialog = (fn?: Function) => { setEditingFunction(fn ?? null); form.reset({ name: fn?.name ?? "", costCenter: fn?.costCenter ?? "" }); setIsDialogOpen(true); };
  const handleCloseDialog = () => { setIsDialogOpen(false); setEditingFunction(null); form.reset(); };
  const handleSubmit = (data: FunctionFormData) => {
    if (editingFunction) updateFunctionMutation.mutate({ id: editingFunction.id, data });
    else createFunctionMutation.mutate(data);
  };
  const handleDelete = (id: string) => {
    setConfirmState({ open: true, title: 'Remover função?', message: 'Esta ação não pode ser desfeita.', confirmLabel: 'Remover',
      onConfirm: () => {
        setConfirmState(p => ({ ...p, open: false }));
        if (deleteFunctionMutation.isPending) return;
        deleteFunctionMutation.mutate(id);
      } });
  };

  const isPending = createFunctionMutation.isPending || updateFunctionMutation.isPending;
  const showTable = !isLoading && !(isError && !functions) && sortedFunctions.length > 0;

  return (
    <TooltipProvider>
      <PageContainer>

        {/* ── Page header ── */}
        <PageHeader
          icon={Tag}
          title={
            <span className="inline-flex items-center gap-3">
              Funções
              {totalCount > 0 && (
                <span className="bg-brand-soft text-primary px-3 py-[3px] rounded-full text-2xs font-bold uppercase tracking-[0.06em]">
                  {totalCount} funções
                </span>
              )}
            </span>
          }
          subtitle="Gerencie as funções e atribua responsáveis"
          actions={
            /* Fechar por Esc/overlay precisa limpar editingFunction — senão a próxima
               abertura reaproveitava o estado de edição anterior. */
            canManage && (
              <Dialog open={isDialogOpen} onOpenChange={v => { if (v) setIsDialogOpen(true); else handleCloseDialog(); }}>
                <DialogTrigger asChild>
                  <Button onClick={() => handleOpenDialog()} data-testid="button-add-function"
                    className="h-10 px-5 rounded-lg text-sm font-bold shadow-2 hover:bg-primary-hover active:scale-95 transition-all">
                    <CirclePlus className="h-5 w-5" aria-hidden="true" />
                    Nova função
                  </Button>
                </DialogTrigger>

                {/* Create / Edit dialog */}
                <DialogContent className="sm:max-w-[420px] rounded-xl p-0 gap-0 border-0 shadow-3 overflow-hidden [&>button:last-child]:hidden">
                  <div className={cn(DIALOG_HEADER, "py-[22px]")}>
                    <DialogTitle className="text-lg font-extrabold text-foreground m-0">
                      {editingFunction ? "Editar função" : "Nova função"}
                    </DialogTitle>
                    <button type="button" onClick={handleCloseDialog} aria-label="Fechar" className={CLOSE_BTN}>
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="px-6 py-[22px]">
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
                        <FormField control={form.control} name="name" render={({ field }) => (
                          <div>
                            <label htmlFor="function-name" className={LABEL}>
                              Nome da Função <span className="text-destructive">*</span>
                            </label>
                            <FormControl>
                              <input id="function-name" placeholder="Ex: Atendimento, Palco, Som..."
                                data-testid="input-function-name"
                                className={cn(SOFT_INPUT, "h-[42px] text-sm px-4")}
                                {...field} />
                            </FormControl>
                            <FormMessage className="text-2xs mt-1" />
                          </div>
                        )} />

                        <FormField control={form.control} name="costCenter" render={({ field }) => (
                          <div>
                            <label htmlFor="function-account" className={LABEL}>Conta (rateio)</label>
                            <FormControl>
                              <input id="function-account" placeholder="Ex: LI, Atendimento, Produção…"
                                data-testid="input-function-account"
                                className={cn(SOFT_INPUT, "h-[42px] text-sm px-4")}
                                {...field} value={field.value ?? ""} />
                            </FormControl>
                            <p className="text-2xs text-muted-foreground mt-1">
                              Em qual conta o custo desta função entra no fechamento do evento.
                              Várias funções podem dividir a mesma conta.
                            </p>
                            <FormMessage className="text-2xs mt-1" />
                          </div>
                        )} />

                        <div className="flex gap-2.5 pt-3">
                          <Button type="button" variant="ghost" onClick={handleCloseDialog} className="flex-1 h-10 text-sm font-semibold text-muted-foreground hover:text-foreground">
                            Cancelar
                          </Button>
                          <Button type="submit" disabled={isPending} data-testid="button-save-function"
                            className="flex-1 h-10 text-sm font-bold shadow-2 hover:bg-primary-hover">
                            {isPending
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <><Check className="w-3.5 h-3.5" strokeWidth={3} /> {editingFunction ? "Atualizar" : "Salvar"} Função</>}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </div>
                </DialogContent>
              </Dialog>
            )
          }
        />

        {/* ── Abas: catálogo de funções × responsáveis da Validação de Escala.
            Sem a permissão própria da aba, nem a TabsList aparece — a tela é o
            catálogo direto, como sempre foi. ── */}
        <Tabs defaultValue="catalogo" className="w-full">
          {canSeeEscalaTab && (
            <TabsList className="mb-4 h-11 rounded-xl bg-muted/70 p-1">
              <TabsTrigger value="catalogo" data-testid="tab-funcoes" className="rounded-lg px-4 text-sm font-bold gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Funções
              </TabsTrigger>
              <TabsTrigger value="escala" data-testid="tab-validacao-escala" className="rounded-lg px-4 text-sm font-bold gap-1.5">
                <ClipboardCheck className="w-3.5 h-3.5" /> Validação de Escala
              </TabsTrigger>
            </TabsList>
          )}

          {canSeeEscalaTab && (
            <TabsContent value="escala" className="mt-0">
              <EscalaResponsaveisTab canManage={canManage} />
            </TabsContent>
          )}

          <TabsContent value="catalogo" className="mt-0">

        {/* ── Main card ── */}
        <div className="bg-card rounded-xl border border-border shadow-3 overflow-hidden">

          {/* Filter bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-border">
            <div className="relative flex-1 min-w-[200px] max-w-[400px]">
              <Search className="h-[18px] w-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
              {/* A busca filtra apenas o nome da função; o texto antigo prometia
                  também "responsável", que não é filtrado aqui. */}
              <input id="functions-search" aria-label="Buscar função pelo nome"
                placeholder="Buscar função pelo nome..." value={search} onChange={e => setSearch(e.target.value)}
                className={cn(SOFT_INPUT, "h-10 text-sm pl-10 transition-shadow", search ? "pr-9" : "pr-3.5")} />
              {search && (
                <button onClick={() => setSearch("")} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 flex text-muted-foreground hover:text-slate-600 transition-colors"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {search && sortedFunctions.length > 0 && (
                <span className="text-2xs text-muted-foreground mr-2" aria-live="polite">{sortedFunctions.length} resultado{sortedFunctions.length !== 1 ? "s" : ""}</span>
              )}
            </div>
          </div>

          {/* Carregando e erro precisam de ramos próprios: sem eles, uma sessão
              expirada ou queda de rede aparecia como "Nenhuma função cadastrada". */}
          {isLoading && (
            <div className="p-4 sm:p-6">
              <LoadingState count={6} label="Carregando funções…" className="border-0 rounded-none" />
            </div>
          )}

          {!isLoading && isError && !functions && (
            <div className="px-6 py-14 text-center" role="alert">
              <div className="flex flex-col items-center gap-2.5">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-danger-soft">
                  <AlertTriangle className="w-6 h-6 text-danger-strong" />
                </div>
                <h4 className="text-base font-extrabold text-foreground m-0">Não foi possível carregar as funções</h4>
                <p className="text-sm text-muted-foreground m-0 max-w-[320px] leading-normal">
                  {apiErrorMessage(error, "Verifique sua conexão e tente novamente.")}
                </p>
                <Button variant="outline" size="sm" className="mt-1.5" onClick={() => refetch()}>Tentar novamente</Button>
              </div>
            </div>
          )}

          {!isLoading && !(isError && !functions) && sortedFunctions.length === 0 && (
            <div className="p-4 sm:p-6">
              {search ? (
                <EmptyState
                  variant="filtered"
                  icon={Tag}
                  title="Nenhuma função encontrada"
                  description="Ajuste sua busca ou limpe os filtros para ver todos os resultados."
                  onClearFilters={() => setSearch("")}
                  className="border-0 py-10"
                />
              ) : (
                <EmptyState
                  icon={Tag}
                  title="Nenhuma função cadastrada"
                  description={canManage ? 'Clique em "Nova função" para criar a primeira.' : "Ainda não há funções cadastradas."}
                  className="border-0 py-10"
                />
              )}
            </div>
          )}

          {/* Table */}
          {showTable && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[560px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    {["#","Nome da Função","Responsáveis","Ações"].map((h, i) => (
                      <th key={h}
                        className={cn("px-4 sm:px-6 py-3.5 text-2xs font-bold text-muted-foreground uppercase tracking-[0.08em]", i === 3 ? "text-right" : "text-left", i === 0 && "w-[60px]")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedFunctions.map((func, idx) => (
                    <tr key={func.id} className="group transition-colors hover:bg-brand-soft/30 border-b border-border/50">
                      <td className="px-4 sm:px-6 py-[18px] text-xs text-muted-foreground font-semibold tabular-nums">
                        {String(idx + 1).padStart(2, "0")}
                      </td>
                      <td className="px-4 sm:px-6 py-[18px]">
                        <span className="text-base font-semibold text-foreground capitalize">{func.name}</span>
                      </td>
                      <td className="px-4 sm:px-6 py-[18px]">
                        <FunctionManagersCell functionId={func.id} functionName={func.name} managers={func.managers} canManage={canManage} />
                      </td>
                      <td className="px-4 sm:px-6 py-[18px]">
                        {/* Editar/excluir só para quem o servidor aceita (CADASTRO_ROLES) */}
                        {canManage && <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" onClick={() => handleOpenDialog(func)} data-testid={`button-edit-function-${func.id}`}
                                aria-label={`Editar função ${func.name}`}
                                className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-brand-soft transition-colors">
                                <Pencil className="h-5 w-5" aria-hidden="true" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Editar função</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" onClick={() => handleDelete(func.id)} data-testid={`button-delete-function-${func.id}`}
                                disabled={deleteFunctionMutation.isPending}
                                aria-label={`Excluir função ${func.name}`}
                                className="p-2 rounded-lg text-muted-foreground hover:text-danger-strong hover:bg-danger-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                <Trash2 className="h-5 w-5" aria-hidden="true" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Excluir função</TooltipContent>
                          </Tooltip>
                        </div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          {sortedFunctions.length > 0 && (
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-t border-border bg-muted/30">
              <span className="text-xs text-muted-foreground font-medium">
                {search
                  ? `Mostrando ${sortedFunctions.length} de ${totalCount} funções`
                  : `${totalCount} ${totalCount === 1 ? "função" : "funções"} no total`}
              </span>
            </div>
          )}
        </div>
          </TabsContent>
        </Tabs>
      </PageContainer>

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(o) => { if (!o) setConfirmState(p => ({ ...p, open: false })); }}
        title={confirmState.title} description={confirmState.message} confirmLabel={confirmState.confirmLabel}
        tone="danger"
        onConfirm={confirmState.onConfirm}
      />
    </TooltipProvider>
  );
}
