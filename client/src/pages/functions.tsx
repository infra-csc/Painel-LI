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
import { AlertTriangle, Check, ClipboardCheck, Loader2, X, Tag } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EscalaResponsaveisTab from "@/components/functions/escala-responsaveis-tab";
import ConfirmModal from "@/components/common/confirm-modal";
import { PageHeader } from "@/components/common/page-header";
import { PageContainer } from "@/components/common/page-container";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import type { Function, User as UserType } from "@shared/schema";

/** Responsável como vem embutido em GET /api/functions. */
type ManagerSummary = { userId: string; userName: string };
type FunctionWithManagers = Function & { managers?: ManagerSummary[] };

// ─── Avatar colours ────────────────────────────────────────────────────────
const AVATAR_LIGHT: [string, string][] = [
  ["bg-blue-100",   "text-blue-700"],
  ["bg-violet-100", "text-violet-700"],
  ["bg-emerald-100","text-emerald-700"],
  ["bg-orange-100", "text-orange-700"],
  ["bg-pink-100",   "text-pink-700"],
  ["bg-cyan-100",   "text-cyan-700"],
  ["bg-amber-100",  "text-amber-700"],
  ["bg-rose-100",   "text-rose-700"],
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

/** Mensagem legível a partir do erro enriquecido pelo apiRequest (.status/.body). */
function fnErrMsg(err: any, fallback: string) {
  if (err?.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (err?.status === 403) return "Você não tem permissão para esta ação.";
  return err?.body?.message || fallback;
}

// ─── Estilos compartilhados ────────────────────────────────────────────────
const LABEL = "block mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]";
const SOFT_INPUT = "w-full text-foreground border-0 rounded-[10px] bg-brand-soft outline-none focus-visible:ring-2 focus-visible:ring-ring/25 placeholder:text-muted-foreground";
const DIALOG_HEADER = "flex items-center justify-between px-6 py-5 border-b border-border";
const CLOSE_BTN = "flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 transition-colors";

// ─── Schemas ───────────────────────────────────────────────────────────────
const functionFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
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
      <div className="absolute bg-popover overflow-hidden animate-in fade-in zoom-in-95 duration-150 rounded-xl border border-border shadow-[0_8px_32px_-4px_rgba(20,27,43,0.15),0_2px_8px_-1px_rgba(0,0,0,0.06)]"
        role="dialog" aria-label={`Responsáveis por ${functionName}`}
        style={{ width: MGPOP_W, left, top }}
        onClick={e => e.stopPropagation()}>
        <div className="px-3.5 pt-3 pb-2.5 border-b border-border/60">
          <p className="text-xs font-bold text-foreground capitalize truncate">{functionName}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{managers.length} {managers.length === 1 ? "responsável" : "responsáveis"}</p>
        </div>
        <div className="py-1 divide-y divide-border/40 max-h-72 overflow-y-auto">
          {managers.map(fm => {
            const u = usersById.get(fm.userId);
            const displayName = fm.userName || u?.name || u?.email || "Usuário";
            const [bg, txt] = avatarColor(fm.userId);
            const isConfirming = confirmId === fm.userId;
            return (
              <div key={fm.userId} className="group flex items-center gap-3 px-3.5 py-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${bg} ${txt}`}>
                  {initials(displayName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{displayName}</p>
                </div>
                {!canManage ? null : isConfirming ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-slate-500 font-medium">Remover?</span>
                    <button onClick={e => { e.stopPropagation(); onRemove(fm.userId); setConfirmId(null); }} className="text-[10px] font-bold text-red-500 hover:text-red-600 px-1 py-0.5 rounded hover:bg-red-50 transition-colors">Sim</button>
                    <button onClick={e => { e.stopPropagation(); setConfirmId(null); }} className="text-[10px] text-slate-400 hover:text-slate-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors">Não</button>
                  </div>
                ) : (
                  <button onClick={e => { e.stopPropagation(); setConfirmId(fm.userId); }}
                    aria-label={`Remover ${displayName} dos responsáveis`}
                    className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-slate-300 hover:text-red-500 p-1 rounded hover:bg-red-50">
                    <span className="material-symbols-outlined text-lg">person_remove</span>
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
    onError: (err: any) => toast({ title: "Erro ao adicionar responsável", description: fnErrMsg(err, "Tente novamente."), variant: "destructive" }),
  });
  const removeManagerMutation = useMutation({
    mutationFn: async (userId: string) => (await apiRequest("DELETE", `/api/functions/${functionId}/managers/${userId}`)).json(),
    onSuccess: () => { invalidateManagers(); toast({ title: "Responsável removido." }); },
    onError: (err: any) => toast({ title: "Erro ao remover responsável", description: fnErrMsg(err, "Tente novamente."), variant: "destructive" }),
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
        <span className="flex items-center gap-1.5 text-[11px] text-slate-400 italic">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
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
                    <span className={`text-[10px] font-bold ${txt}`}>{initials(displayName)}</span>
                  </div>
                );
              })}

              {overflow > 0 && (
                <div className="relative -ml-2 z-0 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 border-2 border-card text-[9px] font-bold text-slate-500 flex items-center justify-center shrink-0 transition-colors">
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
            className="w-7 h-7 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-primary hover:text-primary transition-colors"
            data-testid={`button-add-function-manager-${functionId}`}>
            <span className="material-symbols-outlined text-base">add</span>
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[380px] rounded-xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
          <div className={DIALOG_HEADER}>
            <div>
              <DialogTitle className="text-base font-extrabold text-foreground m-0">Adicionar Responsável</DialogTitle>
              <p className="text-[11px] text-slate-400 mt-[3px] capitalize">{functionName}</p>
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
                  <div className="py-3 text-center text-xs text-slate-400">Todos os usuários já foram adicionados</div>
                ) : (
                  availableUsers.map(u => (
                    <SelectItem key={u.id} value={u.id} className="py-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${avatarColor(u.id)[0]} ${avatarColor(u.id)[1]}`}>
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
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} className="flex-1 h-[38px] text-[13px] font-semibold text-slate-500 hover:text-foreground">
              Cancelar
            </Button>
            <Button type="button" onClick={() => selectedUserId && addManagerMutation.mutate(selectedUserId)}
              disabled={!selectedUserId || addManagerMutation.isPending}
              className="flex-1 h-[38px] text-[13px] font-bold shadow-md shadow-primary/30 hover:bg-primary-hover"
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
  const [search, setSearch] = useState("");
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void;
  }>({ open: false, title: '', message: '', confirmLabel: '', onConfirm: () => {} });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Espelha POST/PATCH/DELETE /api/functions e /:id/managers (CADASTRO_ROLES).
  // RH e Área de Função só visualizam.
  const canManage = hasPermission(user, "canManageFunctions");

  const form = useForm<FunctionFormData>({
    resolver: zodResolver(functionFormSchema),
    defaultValues: { name: "" },
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
    onError: (err: any) => toast({ title: "Erro ao atualizar função", description: fnErrMsg(err, "Tente novamente."), variant: "destructive" }),
  });
  const createFunctionMutation = useMutation({
    mutationFn: async (data: FunctionFormData) => (await apiRequest("POST", "/api/functions", data)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/functions"] }); toast({ title: "Função criada!" }); handleCloseDialog(); },
    onError: (err: any) => toast({ title: "Erro ao salvar função", description: fnErrMsg(err, "Tente novamente."), variant: "destructive" }),
  });
  const deleteFunctionMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/functions/${id}`)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/functions"] }); toast({ title: "Função removida." }); },
    onError: (err: any) => toast({ title: "Erro ao remover função", description: fnErrMsg(err, "Pode haver escalações vinculadas."), variant: "destructive" }),
  });

  const handleOpenDialog = (fn?: Function) => { setEditingFunction(fn ?? null); form.reset({ name: fn?.name ?? "" }); setIsDialogOpen(true); };
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
                <span className="bg-brand-soft text-primary px-3 py-[3px] rounded-full text-[11px] font-bold uppercase tracking-[0.06em]">
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
                    className="h-10 px-5 rounded-[10px] text-[13px] font-bold shadow-md shadow-primary/30 hover:bg-primary-hover active:scale-95 transition-all">
                    <span className="material-symbols-outlined text-xl">add_circle</span>
                    Nova Função
                  </Button>
                </DialogTrigger>

                {/* Create / Edit dialog */}
                <DialogContent className="sm:max-w-[420px] rounded-xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
                  <div className={cn(DIALOG_HEADER, "py-[22px]")}>
                    <DialogTitle className="text-lg font-extrabold text-foreground m-0">
                      {editingFunction ? "Editar Função" : "Nova Função"}
                    </DialogTitle>
                    <button type="button" onClick={handleCloseDialog} aria-label="Fechar" className={CLOSE_BTN}>
                      <span className="material-symbols-outlined text-xl">close</span>
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
                            <FormMessage className="text-[11px] mt-1" />
                          </div>
                        )} />

                        <div className="flex gap-2.5 pt-3">
                          <Button type="button" variant="ghost" onClick={handleCloseDialog} className="flex-1 h-10 text-[13px] font-semibold text-slate-500 hover:text-foreground">
                            Cancelar
                          </Button>
                          <Button type="submit" disabled={isPending} data-testid="button-save-function"
                            className="flex-1 h-10 text-[13px] font-bold shadow-md shadow-primary/30 hover:bg-primary-hover">
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

        {/* ── Abas: catálogo de funções × responsáveis da Validação de Escala ── */}
        <Tabs defaultValue="catalogo" className="w-full">
          <TabsList className="mb-4 h-11 rounded-xl bg-muted/70 p-1">
            <TabsTrigger value="catalogo" data-testid="tab-funcoes" className="rounded-lg px-4 text-[13px] font-bold gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Funções
            </TabsTrigger>
            <TabsTrigger value="escala" data-testid="tab-validacao-escala" className="rounded-lg px-4 text-[13px] font-bold gap-1.5">
              <ClipboardCheck className="w-3.5 h-3.5" /> Validação de Escala
            </TabsTrigger>
          </TabsList>

          <TabsContent value="escala" className="mt-0">
            <EscalaResponsaveisTab canManage={canManage} />
          </TabsContent>

          <TabsContent value="catalogo" className="mt-0">

        {/* ── Main card ── */}
        <div className="bg-card rounded-xl border border-border shadow-[0_20px_40px_rgba(20,27,43,0.03)] overflow-hidden">

          {/* Filter bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-border">
            <div className="relative flex-1 min-w-[200px] max-w-[400px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400 pointer-events-none">search</span>
              {/* A busca filtra apenas o nome da função; o texto antigo prometia
                  também "responsável", que não é filtrado aqui. */}
              <input id="functions-search" aria-label="Buscar função pelo nome"
                placeholder="Buscar função pelo nome..." value={search} onChange={e => setSearch(e.target.value)}
                className={cn(SOFT_INPUT, "h-10 text-[13px] pl-10 transition-shadow", search ? "pr-9" : "pr-3.5")} />
              {search && (
                <button onClick={() => setSearch("")} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 flex text-slate-400 hover:text-slate-600 transition-colors"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {search && sortedFunctions.length > 0 && (
                <span className="text-[11px] text-slate-400 mr-2" aria-live="polite">{sortedFunctions.length} resultado{sortedFunctions.length !== 1 ? "s" : ""}</span>
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
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-50">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
                <h4 className="text-[15px] font-extrabold text-foreground m-0">Não foi possível carregar as funções</h4>
                <p className="text-[13px] text-slate-500 m-0 max-w-[320px] leading-normal">
                  {fnErrMsg(error, "Verifique sua conexão e tente novamente.")}
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
                  description={canManage ? 'Clique em "Nova Função" para criar a primeira.' : "Ainda não há funções cadastradas."}
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
                        className={cn("px-4 sm:px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em]", i === 3 ? "text-right" : "text-left", i === 0 && "w-[60px]")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedFunctions.map((func, idx) => (
                    <tr key={func.id} className="group transition-colors hover:bg-brand-soft/30 border-b border-border/50">
                      <td className="px-4 sm:px-6 py-[18px] text-xs text-slate-300 font-semibold tabular-nums">
                        {String(idx + 1).padStart(2, "0")}
                      </td>
                      <td className="px-4 sm:px-6 py-[18px]">
                        <span className="text-[15px] font-semibold text-foreground capitalize">{func.name}</span>
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
                                className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-brand-soft transition-colors">
                                <span className="material-symbols-outlined text-xl">edit</span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Editar função</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" onClick={() => handleDelete(func.id)} data-testid={`button-delete-function-${func.id}`}
                                disabled={deleteFunctionMutation.isPending}
                                aria-label={`Excluir função ${func.name}`}
                                className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                <span className="material-symbols-outlined text-xl">delete</span>
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
              <span className="text-xs text-slate-400 font-medium">
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

      <ConfirmModal
        open={confirmState.open} variant="delete"
        title={confirmState.title} message={confirmState.message} confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(p => ({ ...p, open: false }))}
      />
    </TooltipProvider>
  );
}
