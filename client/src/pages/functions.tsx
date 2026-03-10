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
import { Tag, Plus, Edit, Trash2, X, Search, AlertTriangle, Check } from "lucide-react";
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
    <div className="flex items-center gap-1.5 flex-wrap">
      {hasNone && (
        <span className="flex items-center gap-1 text-xs text-slate-400 italic">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          Nenhum responsável
        </span>
      )}

      {visible.map((fm) => {
        const u = users?.find(x => x.id === fm.userId);
        const displayName = u?.name || u?.email || "Usuário";
        const col = avatarColor(fm.userId);
        return (
          <div
            key={fm.id}
            className="group flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors cursor-default"
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${col}`}>
              {initials(displayName)}
            </div>
            <span className="text-xs text-slate-700 font-medium max-w-[120px] truncate">{displayName}</span>
            <button
              className="w-3.5 h-3.5 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all ml-0.5"
              onClick={() => removeManagerMutation.mutate(fm.userId)}
              data-testid={`button-remove-function-manager-${fm.userId}`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        );
      })}

      {overflow > 0 && (
        <button
          className="w-5 h-5 rounded-full bg-[#e2e8f0] text-[9px] font-bold text-slate-600 flex items-center justify-center hover:bg-slate-300 transition-colors shrink-0 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setPopover({ x: e.clientX, y: e.clientY });
          }}
          title="Ver todos os responsáveis"
        >
          +{overflow}
        </button>
      )}

      {/* Managers popover */}
      {popover && (
        <ManagersPopover
          functionName={functionName}
          managers={managers}
          users={users ?? []}
          x={popover.x}
          y={popover.y}
          onClose={() => setPopover(null)}
        />
      )}

      {/* Add button */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <button
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-dashed border-gray-300 text-xs text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
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
    if (confirm("Tem certeza que deseja remover esta função? Esta ação não pode ser desfeita."))
      deleteFunctionMutation.mutate(id);
  };

  return (
    <TooltipProvider>
      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Section header */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Tag className="w-4 h-4 text-slate-400" />
                Gerenciamento de Funções
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Gerencie as funções e atribua usuários responsáveis</p>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <button
                  onClick={() => handleOpenDialog()}
                  data-testid="button-add-function"
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-blue-200 hover:shadow-md hover:shadow-blue-200 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
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

          {/* Search */}
          <div className="px-6 py-3 border-b border-gray-100">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                placeholder="Filtrar funções..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-8 text-sm border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-12">#</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Nome</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Responsáveis</th>
                  <th className="text-right px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedFunctions.map((func, idx) => {
                  const isNoManager = false;
                  return (
                    <tr
                      key={func.id}
                      className="border-b border-gray-50 hover:bg-slate-50/60 transition-colors group"
                    >
                      <td className="px-6 py-4 text-xs text-slate-300 font-medium tabular-nums">
                        {String(idx + 1).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-semibold text-slate-800 capitalize">{func.name}</span>
                      </td>
                      <td className="px-4 py-4">
                        <FunctionManagersCell functionId={func.id} functionName={func.name} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 justify-end">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => handleOpenDialog(func)}
                                data-testid={`button-edit-function-${func.id}`}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
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
                  );
                })}
                {sortedFunctions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-slate-400 text-sm">
                      {search
                        ? `Nenhuma função encontrada para "${search}".`
                        : 'Nenhuma função cadastrada. Clique em "Nova Função" para criar a primeira.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </TooltipProvider>
  );
}
