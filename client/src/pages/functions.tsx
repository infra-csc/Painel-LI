import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Trash2, X, Search, AlertTriangle, Check, Loader2 } from "lucide-react";
import ConfirmModal from "@/components/common/confirm-modal";
import type { Function, User as UserType, FunctionManager } from "@shared/schema";

const BLUE = "#0033CC";

// ─── Avatar colours ────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-600",
  "bg-amber-500",
  "bg-rose-500",
];

function avatarColor(userId: string) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Schemas ───────────────────────────────────────────────────────────────
const functionFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
});
type FunctionFormData = z.infer<typeof functionFormSchema>;

// ─── Managers popover ──────────────────────────────────────────────────────
const MGPOP_W = 260;

function ManagersPopover({
  functionName, managers, users, x, y, onRemove, onClose,
}: {
  functionName: string;
  managers: (FunctionManager & { user?: UserType })[];
  users: UserType[];
  x: number; y: number;
  onRemove: (userId: string) => void;
  onClose: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const ITEM_H = 44;
  const HEADER_H = 44;
  const popH = Math.min(managers.length * ITEM_H + HEADER_H + 8, 320);
  const openLeft = x > window.innerWidth / 2;
  const rawLeft = openLeft ? x - MGPOP_W - 8 : x + 8;
  const left = Math.max(8, Math.min(window.innerWidth - MGPOP_W - 8, rawLeft));
  const top = Math.max(8, Math.min(window.innerHeight - popH - 8, y - popH / 2));

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div
        className="absolute bg-white overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{
          width: MGPOP_W, left, top,
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          boxShadow: "0 8px 32px -4px rgba(0,0,0,0.15), 0 2px 8px -1px rgba(0,0,0,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 pt-3 pb-2 border-b border-gray-100">
          <p className="text-[12px] font-bold text-slate-800 capitalize truncate">{functionName}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{managers.length} {managers.length === 1 ? "responsável" : "responsáveis"}</p>
        </div>
        <div className="py-1 divide-y divide-gray-50 max-h-72 overflow-y-auto">
          {managers.map((fm) => {
            const u = users.find(uid => uid.id === fm.userId);
            const displayName = u?.name || u?.email || "Usuário";
            const col = avatarColor(fm.userId);
            const isConfirming = confirmId === fm.userId;
            return (
              <div key={fm.id} className="group flex items-center gap-2.5 px-3 py-2.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${col}`}>
                  {initials(displayName)}
                </div>
                <span className="text-[12px] font-medium text-slate-700 truncate flex-1">{displayName}</span>
                {isConfirming ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-slate-500 font-medium">Remover?</span>
                    <button onClick={(e) => { e.stopPropagation(); onRemove(fm.userId); setConfirmId(null); }} className="text-[10px] font-bold text-red-500 hover:text-red-600 px-1 py-0.5 rounded hover:bg-red-50 transition-colors">Sim</button>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmId(null); }} className="text-[10px] text-slate-400 hover:text-slate-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors">Não</button>
                  </div>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); setConfirmId(fm.userId); }} className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all" title="Remover responsável">
                    <X className="w-3.5 h-3.5" />
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
function FunctionManagersCell({ functionId, functionName }: { functionId: string; functionName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: functionManagers } = useQuery<(FunctionManager & { user?: UserType })[]>({
    queryKey: [`/api/functions/${functionId}/managers`],
    enabled: !!functionId,
  });

  const { data: users } = useQuery<UserType[]>({ queryKey: ["/api/users"] });

  const addManagerMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("POST", `/api/functions/${functionId}/managers`, { userId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/functions/${functionId}/managers`] });
      setSelectedUserId("");
      setIsOpen(false);
      toast({ title: "Responsável adicionado com sucesso!" });
    },
    onError: () => toast({ title: "Erro ao adicionar responsável", variant: "destructive" }),
  });

  const removeManagerMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/functions/${functionId}/managers/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/functions/${functionId}/managers`] });
      toast({ title: "Responsável removido com sucesso!" });
    },
    onError: () => toast({ title: "Erro ao remover responsável", variant: "destructive" }),
  });

  const availableUsers = users?.filter(u => !functionManagers?.some(fm => fm.userId === u.id)) || [];
  const managers = functionManagers ?? [];
  const hasNone = managers.length === 0;
  const visible = managers.slice(0, 3);
  const overflow = managers.length > 3 ? managers.length - 3 : 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {hasNone && (
        <span className="flex items-center gap-1 text-[11px] text-slate-400 italic">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          Nenhum responsável
        </span>
      )}

      {/* Overlapping avatar stack */}
      {!hasNone && (
        <div className="flex items-center">
          {visible.map((fm, i) => {
            const u = users?.find(uid => uid.id === fm.userId);
            const displayName = u?.name || u?.email || "Usuário";
            const col = avatarColor(fm.userId);
            return (
              <Tooltip key={fm.id}>
                <TooltipTrigger asChild>
                  <div
                    className="group relative w-7 h-7 rounded-full border-2 border-white flex items-center justify-center shrink-0 cursor-default"
                    style={{ marginLeft: i === 0 ? 0 : -8, zIndex: visible.length - i }}
                  >
                    <div className={`absolute inset-0 rounded-full ${col}`} />
                    <span className="relative z-10 text-white text-[10px] font-bold select-none">{initials(displayName)}</span>
                    <button
                      className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white shadow border border-gray-100 hidden group-hover:flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 z-20 transition-colors"
                      onClick={(e) => { e.stopPropagation(); removeManagerMutation.mutate(fm.userId); }}
                      data-testid={`button-remove-function-manager-${fm.userId}`}
                    >
                      <X className="w-2 h-2" />
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{displayName}</TooltipContent>
              </Tooltip>
            );
          })}

          {overflow > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="relative w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 border-2 border-white text-[9px] font-bold text-slate-500 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                  style={{ marginLeft: -8, zIndex: 0 }}
                  onClick={(e) => { e.stopPropagation(); setPopover({ x: e.clientX, y: e.clientY }); }}
                >
                  +{overflow}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Ver todos os responsáveis</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {popover && (
        <ManagersPopover
          functionName={functionName}
          managers={managers}
          users={users ?? []}
          x={popover.x}
          y={popover.y}
          onRemove={(userId) => removeManagerMutation.mutate(userId)}
          onClose={() => setPopover(null)}
        />
      )}

      {/* Add button */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <button
            className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-[11px] text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
            data-testid={`button-add-function-manager-${functionId}`}
          >
            <Plus className="w-3 h-3" />
            Adicionar
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[380px] rounded-2xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <div className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0" style={{ background: BLUE, boxShadow: `0 4px 12px ${BLUE}40` }}>
              <Plus className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-800">Adicionar Responsável</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate capitalize">{functionName}</p>
            </div>
            <button onClick={() => setIsOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Usuário</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="h-9 text-sm border-gray-200 rounded-lg" data-testid={`select-function-manager-${functionId}`}>
                  <SelectValue placeholder="Selecione um usuário..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {availableUsers.length === 0 ? (
                    <div className="py-3 text-center text-xs text-slate-400">Todos os usuários já foram adicionados</div>
                  ) : (
                    availableUsers.map(u => (
                      <SelectItem key={u.id} value={u.id} className="py-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${avatarColor(u.id)}`}>
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

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 h-9 text-xs font-medium text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => selectedUserId && addManagerMutation.mutate(selectedUserId)}
                disabled={!selectedUserId || addManagerMutation.isPending}
                className="flex-1 h-9 flex items-center justify-center gap-1.5 text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-50"
                style={{ background: BLUE, boxShadow: `0 2px 8px ${BLUE}40` }}
                data-testid={`button-submit-add-manager-${functionId}`}
              >
                {addManagerMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <><Check className="w-3.5 h-3.5" strokeWidth={3} /> Adicionar</>
                }
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function Functions() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFunction, setEditingFunction] = useState<Function | null>(null);
  const [search, setSearch] = useState("");
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void;
  }>({ open: false, title: '', message: '', confirmLabel: '', onConfirm: () => {} });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FunctionFormData>({
    resolver: zodResolver(functionFormSchema),
    defaultValues: { name: "" },
  });

  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: users } = useQuery<UserType[]>({ queryKey: ["/api/users"] });

  const sortedFunctions = useMemo(() => {
    if (!functions) return [];
    let list = [...functions].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (search.trim()) {
      const t = search.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(t));
    }
    return list;
  }, [functions, search]);

  const updateFunctionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FunctionFormData }) => {
      const response = await apiRequest("PATCH", `/api/functions/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/functions"] });
      toast({ title: "Função atualizada com sucesso!" });
      handleCloseDialog();
    },
    onError: () => toast({ title: "Erro ao atualizar função", variant: "destructive" }),
  });

  const createFunctionMutation = useMutation({
    mutationFn: async (data: FunctionFormData) => {
      const response = await apiRequest("POST", "/api/functions", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/functions"] });
      toast({ title: "Função criada com sucesso!" });
      handleCloseDialog();
    },
    onError: () => toast({ title: "Erro ao salvar função", variant: "destructive" }),
  });

  const deleteFunctionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/functions/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/functions"] });
      toast({ title: "Função removida com sucesso!" });
    },
    onError: () => toast({ title: "Erro ao remover função. Pode haver escalações vinculadas.", variant: "destructive" }),
  });

  const handleOpenDialog = (fn?: Function) => {
    setEditingFunction(fn ?? null);
    form.reset({ name: fn?.name ?? "" });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingFunction(null);
    form.reset();
  };

  const handleSubmit = (data: FunctionFormData) => {
    if (editingFunction) {
      updateFunctionMutation.mutate({ id: editingFunction.id, data });
    } else {
      createFunctionMutation.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmState({
      open: true,
      title: 'Remover função?',
      message: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Remover',
      onConfirm: () => { setConfirmState(prev => ({ ...prev, open: false })); deleteFunctionMutation.mutate(id); },
    });
  };

  const isPending = createFunctionMutation.isPending || updateFunctionMutation.isPending;

  return (
    <TooltipProvider>
      <div className="space-y-5">

        {/* ── Page header ── */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: BLUE, boxShadow: `0 4px 14px ${BLUE}50` }}
          >
            <span className="material-symbols-outlined text-white" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>label</span>
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-slate-900 leading-tight">Funções</h1>
            <p className="text-xs text-slate-400 mt-0.5">Gerencie as funções e atribua responsáveis</p>
          </div>
          {functions && functions.length > 0 && (
            <div className="ml-2 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100">
              <span className="text-xs font-semibold text-blue-600">{functions.length} funções</span>
            </div>
          )}
        </div>

        {/* ── Main card ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Filter bar */}
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 bg-[#FAFBFF]">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                placeholder="Filtrar funções..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-8 text-sm border-gray-200 rounded-lg bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {search && sortedFunctions.length > 0 && (
              <span className="text-[11px] text-slate-400">{sortedFunctions.length} resultado{sortedFunctions.length !== 1 ? "s" : ""}</span>
            )}

            <div className="ml-auto">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <button
                    onClick={() => handleOpenDialog()}
                    data-testid="button-add-function"
                    className="flex items-center gap-1.5 px-3.5 py-2 text-white text-xs font-semibold rounded-lg transition-all"
                    style={{ background: BLUE, boxShadow: `0 2px 8px ${BLUE}35` }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nova Função
                  </button>
                </DialogTrigger>

                {/* Create / Edit dialog */}
                <DialogContent className="sm:max-w-[420px] rounded-2xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
                  {/* Header */}
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                    <div
                      className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0"
                      style={{ background: BLUE, boxShadow: `0 4px 12px ${BLUE}40` }}
                    >
                      <span className="material-symbols-outlined text-white" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>
                        {editingFunction ? "edit" : "label"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-slate-800">
                        {editingFunction ? "Editar Função" : "Nova Função"}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {editingFunction ? `Editando: ${editingFunction.name}` : "Crie uma nova função no sistema"}
                      </p>
                    </div>
                    <button
                      onClick={handleCloseDialog}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="px-5 py-5">
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                                Nome da Função <span className="text-red-400 normal-case tracking-normal">*</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Ex: Atendimento, Palco, Som..."
                                  className="h-10 text-sm border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                                  data-testid="input-function-name"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage className="text-[11px]" />
                            </FormItem>
                          )}
                        />

                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={handleCloseDialog}
                            className="flex-1 h-9 text-xs font-medium text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={isPending}
                            className="flex-1 h-9 flex items-center justify-center gap-1.5 text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-60"
                            style={{ background: BLUE, boxShadow: `0 2px 8px ${BLUE}40` }}
                            data-testid="button-save-function"
                          >
                            {isPending
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <><Check className="w-3.5 h-3.5" strokeWidth={3} /> {editingFunction ? "Atualizar" : "Criar"} Função</>
                            }
                          </button>
                        </div>
                      </form>
                    </Form>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "2px solid #E2E8F0", background: "#F8FAFC" }}>
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-10">#</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome da Função</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Responsáveis</th>
                  <th className="text-right px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedFunctions.map((func, idx) => (
                  <tr
                    key={func.id}
                    className="group transition-colors hover:bg-blue-50/40"
                  >
                    <td className="px-5 py-3.5 text-[11px] text-slate-300 font-medium tabular-nums">
                      {String(idx + 1).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-blue-400" style={{ fontSize: 13, fontVariationSettings: "'FILL' 1" }}>label</span>
                        </div>
                        <span className="font-semibold text-slate-800 capitalize">{func.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <FunctionManagersCell functionId={func.id} functionName={func.name} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleOpenDialog(func)}
                              data-testid={`button-edit-function-${func.id}`}
                              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Editar função</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleDelete(func.id)}
                              data-testid={`button-delete-function-${func.id}`}
                              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Excluir função</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}

                {sortedFunctions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                          <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>label_off</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-600">
                            {search ? `Nenhuma função encontrada para "${search}"` : "Nenhuma função cadastrada"}
                          </p>
                          {!search && (
                            <p className="text-xs text-slate-400 mt-1">Clique em "Nova Função" para criar a primeira</p>
                          )}
                        </div>
                        {search && (
                          <button onClick={() => setSearch("")} className="text-xs text-blue-500 hover:text-blue-700 font-medium">
                            Limpar filtro
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          {sortedFunctions.length > 0 && (
            <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {search
                  ? `${sortedFunctions.length} de ${functions?.length ?? 0} funções`
                  : `${sortedFunctions.length} ${sortedFunctions.length === 1 ? "função" : "funções"} no total`
                }
              </span>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmState.open}
        variant="delete"
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, open: false }))}
      />
    </TooltipProvider>
  );
}
