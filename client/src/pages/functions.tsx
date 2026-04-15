import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import ConfirmModal from "@/components/common/confirm-modal";
import type { Function, User as UserType, FunctionManager } from "@shared/schema";

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
  const ITEM_H = 52, HEADER_H = 48;
  const popH = Math.min(managers.length * ITEM_H + HEADER_H + 8, 320);
  const openLeft = x > window.innerWidth / 2;
  const rawLeft = openLeft ? x - MGPOP_W - 8 : x + 8;
  const left = Math.max(8, Math.min(window.innerWidth - MGPOP_W - 8, rawLeft));
  const top  = Math.max(8, Math.min(window.innerHeight - popH - 8, y - popH / 2));

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div className="absolute bg-white overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{ width: MGPOP_W, left, top, borderRadius: 12, border: "1px solid #E9EDFF", boxShadow: "0 8px 32px -4px rgba(20,27,43,0.15), 0 2px 8px -1px rgba(0,0,0,0.06)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #F1F3FF" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#141b2b", textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{functionName}</p>
          <p style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{managers.length} {managers.length === 1 ? "responsável" : "responsáveis"}</p>
        </div>
        <div className="py-1 divide-y divide-[#F8FAFC] max-h-72 overflow-y-auto">
          {managers.map(fm => {
            const u = users.find(uid => uid.id === fm.userId);
            const displayName = u?.name || u?.email || "Usuário";
            const [bg, txt] = avatarColor(fm.userId);
            const isConfirming = confirmId === fm.userId;
            return (
              <div key={fm.id} className="group flex items-center gap-3 px-3.5 py-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${bg} ${txt}`}>
                  {initials(displayName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#141b2b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</p>
                </div>
                {isConfirming ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <span style={{ fontSize: 10, color: "#64748B", fontWeight: 500 }}>Remover?</span>
                    <button onClick={e => { e.stopPropagation(); onRemove(fm.userId); setConfirmId(null); }} className="text-[10px] font-bold text-red-500 hover:text-red-600 px-1 py-0.5 rounded hover:bg-red-50 transition-colors">Sim</button>
                    <button onClick={e => { e.stopPropagation(); setConfirmId(null); }} className="text-[10px] text-slate-400 hover:text-slate-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors">Não</button>
                  </div>
                ) : (
                  <button onClick={e => { e.stopPropagation(); setConfirmId(fm.userId); }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500 p-1 rounded hover:bg-red-50">
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_remove</span>
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
    mutationFn: async (userId: string) => (await apiRequest("POST", `/api/functions/${functionId}/managers`, { userId })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/functions/${functionId}/managers`] });
      setSelectedUserId(""); setIsOpen(false);
      toast({ title: "Responsável adicionado!" });
    },
    onError: () => toast({ title: "Erro ao adicionar responsável", variant: "destructive" }),
  });
  const removeManagerMutation = useMutation({
    mutationFn: async (userId: string) => (await apiRequest("DELETE", `/api/functions/${functionId}/managers/${userId}`)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`/api/functions/${functionId}/managers`] }); toast({ title: "Responsável removido." }); },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
  });

  const managers = functionManagers ?? [];
  const visible  = managers.slice(0, 3);
  const overflow = managers.length > 3 ? managers.length - 3 : 0;
  const availableUsers = users?.filter(u => !managers.some(fm => fm.userId === u.id)) || [];

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
            <div className="flex items-center cursor-pointer"
              onClick={e => { e.stopPropagation(); setPopover({ x: e.clientX, y: e.clientY }); }}>
              {visible.map((fm, i) => {
                const u = users?.find(uid => uid.id === fm.userId);
                const displayName = u?.name || u?.email || "Usuário";
                const [bg, txt] = avatarColor(fm.userId);
                return (
                  <div key={fm.id} className={`group relative w-7 h-7 rounded-full border-2 border-white flex items-center justify-center shrink-0 ${bg}`}
                    style={{ marginLeft: i === 0 ? 0 : -8, zIndex: visible.length - i }}>
                    <span className={`text-[10px] font-bold ${txt}`}>{initials(displayName)}</span>
                    <button
                      className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white shadow border border-gray-100 hidden group-hover:flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 z-20 transition-colors"
                      onClick={e => { e.stopPropagation(); removeManagerMutation.mutate(fm.userId); }}
                      data-testid={`button-remove-function-manager-${fm.userId}`}
                    >
                      <X className="w-2 h-2" />
                    </button>
                  </div>
                );
              })}

              {overflow > 0 && (
                <div className="relative w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 border-2 border-white text-[9px] font-bold text-slate-500 flex items-center justify-center shrink-0 transition-colors"
                  style={{ marginLeft: -8, zIndex: 0 }}>
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
        <ManagersPopover functionName={functionName} managers={managers} users={users ?? []}
          x={popover.x} y={popover.y}
          onRemove={userId => removeManagerMutation.mutate(userId)}
          onClose={() => setPopover(null)} />
      )}

      {/* Add button */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <button className="w-7 h-7 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-[#004ac6] hover:text-[#004ac6] transition-colors"
            data-testid={`button-add-function-manager-${functionId}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[380px] rounded-xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #E9EDFF", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#141b2b", margin: 0, fontFamily: "Manrope, sans-serif" }}>Adicionar Responsável</h3>
              <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 3, textTransform: "capitalize" }}>{functionName}</p>
            </div>
            <button onClick={() => setIsOpen(false)} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
              className="hover:bg-slate-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div style={{ padding: "20px 24px" }}>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Usuário</label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="h-10 text-sm border-0 bg-[#f1f3ff] rounded-lg focus:ring-2 focus:ring-blue-600/20" data-testid={`select-function-manager-${functionId}`}>
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

          <div style={{ padding: "12px 24px 20px", display: "flex", gap: 10 }}>
            <button onClick={() => setIsOpen(false)} style={{ flex: 1, height: 38, fontSize: 13, fontWeight: 600, color: "#64748B", background: "transparent", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
              className="hover:text-slate-900 transition-colors">
              Cancelar
            </button>
            <button onClick={() => selectedUserId && addManagerMutation.mutate(selectedUserId)}
              disabled={!selectedUserId || addManagerMutation.isPending}
              style={{ flex: 1, height: 38, fontSize: 13, fontWeight: 700, color: "white", background: "#004ac6", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 2px 8px rgba(0,74,198,0.3)", opacity: !selectedUserId ? 0.5 : 1 }}
              data-testid={`button-submit-add-manager-${functionId}`}>
              {addManagerMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <><Check className="w-3.5 h-3.5" strokeWidth={3} /> Adicionar</>}
            </button>
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
    onError: () => toast({ title: "Erro ao atualizar função", variant: "destructive" }),
  });
  const createFunctionMutation = useMutation({
    mutationFn: async (data: FunctionFormData) => (await apiRequest("POST", "/api/functions", data)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/functions"] }); toast({ title: "Função criada!" }); handleCloseDialog(); },
    onError: () => toast({ title: "Erro ao salvar função", variant: "destructive" }),
  });
  const deleteFunctionMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/functions/${id}`)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/functions"] }); toast({ title: "Função removida." }); },
    onError: () => toast({ title: "Erro ao remover função. Pode haver escalações vinculadas.", variant: "destructive" }),
  });

  const handleOpenDialog = (fn?: Function) => { setEditingFunction(fn ?? null); form.reset({ name: fn?.name ?? "" }); setIsDialogOpen(true); };
  const handleCloseDialog = () => { setIsDialogOpen(false); setEditingFunction(null); form.reset(); };
  const handleSubmit = (data: FunctionFormData) => {
    if (editingFunction) updateFunctionMutation.mutate({ id: editingFunction.id, data });
    else createFunctionMutation.mutate(data);
  };
  const handleDelete = (id: string) => {
    setConfirmState({ open: true, title: 'Remover função?', message: 'Esta ação não pode ser desfeita.', confirmLabel: 'Remover',
      onConfirm: () => { setConfirmState(p => ({ ...p, open: false })); deleteFunctionMutation.mutate(id); } });
  };

  const isPending = createFunctionMutation.isPending || updateFunctionMutation.isPending;

  return (
    <TooltipProvider>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

        {/* ── Page header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 44, height: 44, borderRadius: 11, background: "#0033CC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 14px rgba(0,51,204,0.35)" }}>
              <span className="material-symbols-outlined text-white" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>label</span>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: "#141b2b", margin: 0, letterSpacing: "-0.5px", fontFamily: "Manrope, sans-serif" }}>Funções</h1>
                {totalCount > 0 && (
                  <span style={{ background: "#EEF2FF", color: "#004ac6", padding: "3px 12px", borderRadius: 99, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {totalCount} funções
                  </span>
                )}
              </div>
              <p style={{ fontSize: 13, color: "#64748B", margin: "3px 0 0", fontWeight: 500 }}>Gerencie as funções e atribua responsáveis</p>
            </div>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <button onClick={() => handleOpenDialog()} data-testid="button-add-function"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "#0033CC", color: "white", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(0,51,204,0.3)" }}
                className="hover:bg-blue-800 active:scale-95 transition-all">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_circle</span>
                Nova Função
              </button>
            </DialogTrigger>

            {/* Create / Edit dialog */}
            <DialogContent className="sm:max-w-[420px] rounded-xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
              <div style={{ padding: "22px 24px", borderBottom: "1px solid #E9EDFF", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "#141b2b", margin: 0, fontFamily: "Manrope, sans-serif" }}>
                  {editingFunction ? "Editar Função" : "Nova Função"}
                </h3>
                <button onClick={handleCloseDialog} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
                  className="hover:bg-slate-100 transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                </button>
              </div>

              <div style={{ padding: "22px 24px" }}>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <div>
                        <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                          Nome da Função <span style={{ color: "#EF4444" }}>*</span>
                        </label>
                        <FormControl>
                          <input placeholder="Ex: Atendimento, Palco, Som..."
                            data-testid="input-function-name"
                            style={{ width: "100%", height: 42, fontSize: 14, padding: "0 16px", border: "none", borderRadius: 10, background: "#f1f3ff", color: "#141b2b", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                            className="focus:ring-2 focus:ring-blue-600/20"
                            {...field} />
                        </FormControl>
                        <FormMessage className="text-[11px] mt-1" />
                      </div>
                    )} />

                    <div style={{ padding: "12px 0 0" }}>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button type="button" onClick={handleCloseDialog}
                          style={{ flex: 1, height: 40, fontSize: 13, fontWeight: 600, color: "#64748B", background: "transparent", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
                          className="hover:text-slate-900 transition-colors">
                          Cancelar
                        </button>
                        <button type="submit" disabled={isPending} data-testid="button-save-function"
                          style={{ flex: 1, height: 40, fontSize: 13, fontWeight: 700, color: "white", background: "#0033CC", border: "none", borderRadius: 8, cursor: isPending ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, boxShadow: "0 2px 8px rgba(0,51,204,0.3)" }}
                          className="hover:bg-blue-800 transition-colors">
                          {isPending
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <><Check className="w-3.5 h-3.5" strokeWidth={3} /> {editingFunction ? "Atualizar" : "Salvar"} Função</>}
                        </button>
                      </div>
                    </div>
                  </form>
                </Form>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* ── Main card ── */}
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #E9EDFF", boxShadow: "0 20px 40px rgba(20,27,43,0.03)", overflow: "hidden" }}>

          {/* Filter bar */}
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #E9EDFF", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ position: "relative", flex: 1, maxWidth: 400 }}>
              <span className="material-symbols-outlined" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: "#94A3B8", pointerEvents: "none" }}>search</span>
              <input placeholder="Buscar por função ou responsável..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: "100%", height: 40, fontSize: 13, paddingLeft: 40, paddingRight: search ? 36 : 14, border: "none", borderRadius: 10, background: "#f1f3ff", color: "#374151", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                className="focus:ring-2 focus:ring-blue-600/20 transition-shadow" />
              {search && (
                <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex" }}
                  className="hover:text-slate-600 transition-colors"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {search && sortedFunctions.length > 0 && (
                <span style={{ fontSize: 11, color: "#94A3B8", marginRight: 8 }}>{sortedFunctions.length} resultado{sortedFunctions.length !== 1 ? "s" : ""}</span>
              )}
              <button style={{ width: 38, height: 38, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
                className="hover:bg-[#f1f3ff] hover:text-slate-700 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>filter_list</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(241,243,255,0.5)", borderBottom: "1px solid #E9EDFF" }}>
                  {["#","Nome da Função","Responsáveis","Ações"].map((h, i) => (
                    <th key={h} style={{
                      padding: "14px 24px", fontSize: 10, fontWeight: 700, color: "#94A3B8",
                      textTransform: "uppercase", letterSpacing: "0.08em", textAlign: i === 3 ? "right" : "left",
                      width: i === 0 ? 60 : undefined,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedFunctions.map((func, idx) => (
                  <tr key={func.id} className="group transition-colors hover:bg-[#f1f3ff]/30"
                    style={{ borderBottom: "1px solid #F8FAFC" }}>
                    <td style={{ padding: "18px 24px", fontSize: 12, color: "#CBD5E1", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {String(idx + 1).padStart(2, "0")}
                    </td>
                    <td style={{ padding: "18px 24px" }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "#141b2b", textTransform: "capitalize", fontFamily: "Manrope, sans-serif" }}>{func.name}</span>
                    </td>
                    <td style={{ padding: "18px 24px" }}>
                      <FunctionManagersCell functionId={func.id} functionName={func.name} />
                    </td>
                    <td style={{ padding: "18px 24px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button onClick={() => handleOpenDialog(func)} data-testid={`button-edit-function-${func.id}`}
                              style={{ padding: 8, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8" }}
                              className="hover:text-[#004ac6] hover:bg-[#EEF2FF] transition-colors">
                              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>edit</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Editar função</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button onClick={() => handleDelete(func.id)} data-testid={`button-delete-function-${func.id}`}
                              style={{ padding: 8, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8" }}
                              className="hover:text-red-500 hover:bg-red-50 transition-colors">
                              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
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
                    <td colSpan={4} style={{ padding: "64px 24px", textAlign: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#f1f3ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#94A3B8" }}>label_off</span>
                        </div>
                        <h4 style={{ fontSize: 16, fontWeight: 800, color: "#141b2b", margin: 0, fontFamily: "Manrope, sans-serif" }}>
                          {search ? "Nenhuma função encontrada" : "Nenhuma função cadastrada"}
                        </h4>
                        <p style={{ fontSize: 13, color: "#64748B", margin: 0, maxWidth: 280, lineHeight: 1.5 }}>
                          {search ? "Ajuste sua busca ou limpe os filtros para ver todos os resultados." : 'Clique em "Nova Função" para criar a primeira.'}
                        </p>
                        {search && (
                          <button onClick={() => setSearch("")} style={{ fontSize: 13, fontWeight: 700, color: "#004ac6", background: "none", border: "none", cursor: "pointer", marginTop: 8 }}
                            className="hover:underline">
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

          {/* Footer */}
          {sortedFunctions.length > 0 && (
            <div style={{ padding: "14px 24px", borderTop: "1px solid #E9EDFF", background: "rgba(241,243,255,0.3)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>
                {search
                  ? `Mostrando ${sortedFunctions.length} de ${totalCount} funções`
                  : `${totalCount} ${totalCount === 1 ? "função" : "funções"} no total`}
              </span>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmState.open} variant="delete"
        title={confirmState.title} message={confirmState.message} confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(p => ({ ...p, open: false }))}
      />
    </TooltipProvider>
  );
}
