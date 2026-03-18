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
import { Plus, Edit, Trash2, X, Search, AlertTriangle, Check } from "lucide-react";
import ConfirmModal from "@/components/common/confirm-modal";
import type { Function, User as UserType, FunctionManager } from "@shared/schema";

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
        {/* Header */}
        <div className="px-3 pt-3 pb-2 border-b border-gray-100">
          <p className="text-[12px] font-bold text-slate-800 capitalize truncate">{functionName}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{managers.length} {managers.length === 1 ? "responsável" : "responsáveis"}</p>
        </div>
        {/* List */}
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

                {/* Two-step removal */}
                {isConfirming ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-slate-500 font-medium">Remover?</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemove(fm.userId); setConfirmId(null); }}
                      className="text-[10px] font-bold text-red-500 hover:text-red-600 px-1 py-0.5 rounded hover:bg-red-50 transition-colors"
                    >
                      Sim
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmId(null); }}
                      className="text-[10px] text-slate-400 hover:text-slate-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                    >
                      Não
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmId(fm.userId); }}
                    className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                    title="Remover responsável"
                  >
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
  const visible = managers.slice(0, 2);
  const overflow = managers.length > 2 ? managers.length - 2 : 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {hasNone && (
        <span className="flex items-center gap-1 text-xs text-slate-400 italic">
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
                    <span className="relative z-10 text-white text-[10px] font-bold select-none">
                      {initials(displayName)}
                    </span>
                    {/* X badge on hover */}
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

          {/* +N overflow badge — same height, overlapping */}
          {overflow > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="relative w-7 h-7 rounded-full bg-slate-200 hover:bg-slate-300 border-2 border-white text-[9px] font-bold text-slate-600 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
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

      {/* Managers popover */}
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

      {/* Add button — blue dashed */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <button
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-dashed border-blue-300 text-xs text-blue-500 hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
            data-testid={`button-add-function-manager-${functionId}`}
          >
            <Plus className="w-3 h-3" />
            Adicionar
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[380px] rounded-2xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Adicionar Responsável</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Selecione um usuário para esta função</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-5 py-4 space-y-4">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger
                className="h-9 text-sm border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                data-testid={`select-function-manager-${functionId}`}
              >
                <SelectValue placeholder="Selecione um usuário" />
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
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 py-2 text-xs font-medium text-slate-600 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => selectedUserId && addManagerMutation.mutate(selectedUserId)}
                disabled={!selectedUserId || addManagerMutation.isPending}
                className="flex-1 py-2 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                data-testid={`button-submit-add-manager-${functionId}`}
              >
                {addManagerMutation.isPending ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><Check className="w-3 h-3" strokeWidth={3} /> Adicionar</>
                )}
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
      toast({ title: "Sucesso", description: "Função atualizada com sucesso!" });
      handleCloseDialog();
    },
    onError: () => toast({ title: "Erro", description: "Erro ao atualizar função", variant: "destructive" }),
  });

  const createFunctionMutation = useMutation({
    mutationFn: async (data: FunctionFormData) => {
      const response = await apiRequest("POST", "/api/functions", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/functions"] });
      toast({ title: "Sucesso", description: "Função criada com sucesso!" });
      handleCloseDialog();
    },
    onError: () => toast({ title: "Erro", description: "Erro ao salvar função", variant: "destructive" }),
  });

  const deleteFunctionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/functions/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/functions"] });
      toast({ title: "Sucesso", description: "Função removida com sucesso!" });
    },
    onError: () => toast({ title: "Erro", description: "Erro ao remover função. Pode haver escalações vinculadas.", variant: "destructive" }),
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

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-5xl">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-[#0033CC] uppercase tracking-[0.2em]">Configurações Operacionais</p>
            <h1 className="text-[28px] font-bold tracking-tight text-slate-900 leading-tight">Gerenciamento de Funções</h1>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <button
                onClick={() => handleOpenDialog()}
                data-testid="button-add-function"
                className="h-12 px-6 flex items-center gap-2 text-white text-sm font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 active:scale-95"
                style={{ background: "#0033CC", boxShadow: "0 8px 24px -4px rgba(0,51,204,0.3)" }}
              >
                <Plus className="w-4 h-4" />
                Nova Função
              </button>
            </DialogTrigger>

              {/* Create / Edit dialog */}
              <DialogContent className="sm:max-w-[420px] rounded-2xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      {editingFunction ? "Editar Função" : "Nova Função"}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {editingFunction ? "Altere o nome da função" : "Crie uma nova função no sistema"}
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
                            <FormLabel className="text-xs font-medium text-slate-600">
                              Nome da Função <span className="text-red-400">*</span>
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
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleCloseDialog}
                          className="flex-1 py-2 text-xs font-medium text-slate-600 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={createFunctionMutation.isPending || updateFunctionMutation.isPending}
                          className="flex-1 py-2 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                          data-testid="button-save-function"
                        >
                          {(createFunctionMutation.isPending || updateFunctionMutation.isPending) ? (
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <><Check className="w-3 h-3" strokeWidth={3} /> {editingFunction ? "Atualizar" : "Criar"} Função</>
                          )}
                        </button>
                      </div>
                    </form>
                  </Form>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Table card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Table toolbar */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Filtrar funções..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 h-9 text-sm border-slate-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-100 w-64"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {functions && (
                <span className="text-xs text-slate-400 font-medium">
                  {sortedFunctions.length} {sortedFunctions.length === 1 ? "função" : "funções"}
                </span>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200">
                    <th className="px-6 py-5 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest w-16"># ID</th>
                    <th className="px-6 py-5 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Nome da Função</th>
                    <th className="px-6 py-5 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Responsáveis</th>
                    <th className="px-6 py-5 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedFunctions.map((func, idx) => (
                    <tr key={func.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 text-sm font-medium text-slate-400 tabular-nums">
                        {String(idx + 1).padStart(3, "0")}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[14px] font-bold text-slate-900">{func.name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <FunctionManagersCell functionId={func.id} functionName={func.name} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => handleOpenDialog(func)}
                                data-testid={`button-edit-function-${func.id}`}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-[#0033CC] hover:bg-blue-50 transition-colors"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Editar função</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => handleDelete(func.id)}
                                data-testid={`button-delete-function-${func.id}`}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
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
                      <td colSpan={4} className="text-center py-16 text-slate-400 text-sm">
                        {search
                          ? `Nenhuma função encontrada para "${search}".`
                          : 'Nenhuma função cadastrada. Clique em "Nova Função" para criar a primeira.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            {sortedFunctions.length > 0 && (
              <div className="bg-slate-50/50 px-6 py-4 border-t border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Mostrando {sortedFunctions.length} {sortedFunctions.length === 1 ? "função" : "funções"}
                  {functions && functions.length !== sortedFunctions.length && ` de ${functions.length}`}
                </p>
              </div>
            )}
          </div>

          {/* Bento stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0033CC] flex items-center justify-center mb-4">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>groups</span>
              </div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">Total de Funções</p>
              <h3 className="text-2xl font-black text-slate-900">{functions?.length ?? 0} Cadastradas</h3>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>priority_high</span>
              </div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">Total de Usuários</p>
              <h3 className="text-2xl font-black text-slate-900">{users?.length ?? 0} Ativos</h3>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>verified</span>
              </div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">Sistema</p>
              <h3 className="text-2xl font-black text-slate-900">Operacional</h3>
            </div>
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
