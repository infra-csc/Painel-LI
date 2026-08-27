import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronDown, Loader2, ShieldCheck, UserCheck, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import type { User as UserType } from "@shared/schema";
import type { FunctionWithManagers } from "@/components/scaling-validation/types";

type ManagerRole = "validador" | "aprovador";
type Manager = NonNullable<FunctionWithManagers["managers"]>[number];
/** GET /api/scaling-default-approver — quem decide quando a função não tem aprovador próprio. */
type DefaultApprover = { userId: string | null; userName: string | null };

const SOFT_INPUT = "w-full text-foreground border-0 rounded-[10px] bg-brand-soft outline-none focus-visible:ring-2 focus-visible:ring-ring/25 placeholder:text-muted-foreground";

/** Minúsculas + sem acento — mesmo critério do seed 2026-08-20-escala-responsaveis. */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function roleLabel(role: ManagerRole) {
  return role === "aprovador" ? "aprovador" : "validador";
}

/** Mensagem legível a partir do erro enriquecido pelo apiRequest (.status/.body). */
function errMsg(err: any, fallback: string) {
  if (err?.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (err?.status === 403) return "Você não tem permissão para esta ação.";
  return err?.body?.message || fallback;
}

// ─── Chip de responsável (X com confirmação inline) ────────────────────────
function ManagerChip({ manager, canManage, isRemoving, onRemove }: {
  manager: Manager;
  canManage: boolean;
  isRemoving: boolean;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const tone = manager.role === "aprovador"
    ? "bg-violet-50 text-violet-700 border-violet-200"
    : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span className={cn("inline-flex items-center gap-1 pl-2.5 rounded-full border text-[12px] font-semibold max-w-full", tone, canManage ? "pr-1" : "pr-2.5", "py-[3px]")}>
      <span className="truncate max-w-[160px]">{manager.userName}</span>
      {canManage && (confirming ? (
        <span className="flex items-center gap-0.5 shrink-0">
          <button type="button" disabled={isRemoving}
            onClick={() => { setConfirming(false); onRemove(); }}
            className="text-[10px] font-bold text-red-600 hover:text-red-700 px-1 rounded hover:bg-red-100 transition-colors">
            {isRemoving ? "…" : "Sim"}
          </button>
          <button type="button" onClick={() => setConfirming(false)}
            className="text-[10px] text-slate-400 hover:text-slate-600 px-1 rounded hover:bg-black/5 transition-colors">
            Não
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}
          aria-label={`Remover ${manager.userName} de ${roleLabel(manager.role)}`}
          className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-current/50 hover:text-red-500 hover:bg-red-50 transition-colors">
          <X className="w-3 h-3" />
        </button>
      ))}
    </span>
  );
}

// ─── Botão "+" com combobox de usuários ────────────────────────────────────
function AddManagerButton({ func, role, users, onAdd, onMove, isPending }: {
  func: FunctionWithManagers;
  role: ManagerRole;
  users: UserType[];
  onAdd: (userId: string) => void;
  onMove: (userId: string, fromRole: ManagerRole) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const managers = func.managers ?? [];
  const byUser = useMemo(() => new Map(managers.map(m => [m.userId, m])), [managers]);
  const otherRole: ManagerRole = role === "aprovador" ? "validador" : "aprovador";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button"
          aria-label={`Adicionar ${roleLabel(role)} a ${func.name}`}
          data-testid={`button-add-${role}-${func.id}`}
          className="w-6 h-6 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-primary hover:text-primary transition-colors shrink-0">
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="material-symbols-outlined text-sm leading-none">add</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0 rounded-xl" align="start">
        <Command filter={(value, search) => normalize(value).includes(normalize(search)) ? 1 : 0}>
          <CommandInput placeholder="Buscar usuário..." className="h-9 text-[13px]" />
          <CommandList className="max-h-56">
            <CommandEmpty className="py-4 text-center text-xs text-slate-400">Nenhum usuário encontrado</CommandEmpty>
            <CommandGroup>
              {users.map(u => {
                const displayName = u.name || u.email;
                const existing = byUser.get(u.id);
                if (existing?.role === role) return null; // já está neste papel
                const moves = existing?.role === otherRole;
                return (
                  <CommandItem key={u.id} value={`${displayName} ${u.email ?? ""}`}
                    onSelect={() => {
                      setOpen(false);
                      if (moves) onMove(u.id, otherRole); else onAdd(u.id);
                    }}
                    className="text-[13px] py-2">
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-medium">{displayName}</span>
                      {moves && (
                        <span className="text-[10px] text-amber-600">mover de {roleLabel(otherRole)} → {roleLabel(role)}</span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Bloco "Aplicar por área" ──────────────────────────────────────────────
function BulkApplyBlock({ functions, users, onDone }: {
  functions: FunctionWithManagers[];
  users: UserType[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ManagerRole>("validador");
  const [term, setTerm] = useState("");
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [userOpen, setUserOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  const selectedUser = users.find(u => u.id === userId);

  const matched = useMemo(() => {
    const t = normalize(term);
    if (!t) return [];
    return functions.filter(f => normalize(f.name).includes(t));
  }, [functions, term]);

  const targets = matched.filter(f => !unchecked.has(f.id));

  const toggle = (id: string) => setUnchecked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const apply = async () => {
    if (!userId || targets.length === 0) return;
    setApplying(true);
    let added = 0, moved = 0, kept = 0, failed = 0;
    for (const f of targets) {
      const existing = (f.managers ?? []).find(m => m.userId === userId);
      try {
        if (existing?.role === role) { kept++; continue; }
        if (existing) {
          await apiRequest("PATCH", `/api/functions/${f.id}/managers/${userId}`, { role });
          moved++;
        } else {
          await apiRequest("POST", `/api/functions/${f.id}/managers`, { userId, role });
          added++;
        }
      } catch { failed++; }
    }
    setApplying(false);
    onDone();
    const parts = [
      added > 0 && `${added} adicionada${added !== 1 ? "s" : ""}`,
      moved > 0 && `${moved} com papel alterado`,
      kept > 0 && `${kept} já estava${kept !== 1 ? "m" : ""} assim`,
      failed > 0 && `${failed} falhou${failed !== 1 ? "/falharam" : ""}`,
    ].filter(Boolean).join(" · ");
    toast({
      title: failed > 0 ? "Aplicado com falhas" : "Escalação aplicada!",
      description: `${selectedUser?.name || "Usuário"} como ${roleLabel(role)} — ${parts || "nada a fazer"}.`,
      variant: failed > 0 ? "destructive" : undefined,
    });
    if (failed === 0) { setTerm(""); setUnchecked(new Set()); }
  };

  return (
    <div className="mx-4 sm:mx-6 mt-4 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-primary" />
        <h4 className="text-[13px] font-extrabold text-foreground m-0">Aplicar por área</h4>
        <span className="text-[11px] text-slate-400">— escolha um usuário, o papel e um grupo de funções pelo nome (ex.: "ceno")</span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Usuário */}
        <Popover open={userOpen} onOpenChange={setUserOpen}>
          <PopoverTrigger asChild>
            <button type="button" data-testid="bulk-user-trigger"
              className={cn(SOFT_INPUT, "h-9 w-auto min-w-[190px] px-3 text-[13px] flex items-center justify-between gap-2 bg-card border border-border")}>
              <span className={cn("truncate", !selectedUser && "text-muted-foreground")}>
                {selectedUser ? (selectedUser.name || selectedUser.email) : "Selecionar usuário..."}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-0 rounded-xl" align="start">
            <Command filter={(value, search) => normalize(value).includes(normalize(search)) ? 1 : 0}>
              <CommandInput placeholder="Buscar usuário..." className="h-9 text-[13px]" />
              <CommandList className="max-h-56">
                <CommandEmpty className="py-4 text-center text-xs text-slate-400">Nenhum usuário encontrado</CommandEmpty>
                <CommandGroup>
                  {users.map(u => (
                    <CommandItem key={u.id} value={`${u.name || u.email} ${u.email ?? ""}`}
                      onSelect={() => { setUserId(u.id); setUserOpen(false); }}
                      className="text-[13px] py-2">
                      <span className="truncate">{u.name || u.email}</span>
                      {u.id === userId && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Papel */}
        <Select value={role} onValueChange={v => setRole(v as ManagerRole)}>
          <SelectTrigger className="h-9 w-[140px] text-[13px] bg-card border border-border rounded-[10px]" aria-label="Papel" data-testid="bulk-role-trigger">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="validador">Validador</SelectItem>
            <SelectItem value="aprovador">Aprovador</SelectItem>
          </SelectContent>
        </Select>

        {/* Grupo de funções */}
        <input value={term} onChange={e => { setTerm(e.target.value); setUnchecked(new Set()); }}
          aria-label="Buscar grupo de funções pelo nome"
          placeholder='Grupo de funções (ex.: "ceno", "kit")'
          data-testid="bulk-function-search"
          className={cn(SOFT_INPUT, "h-9 flex-1 min-w-[180px] px-3 text-[13px] bg-card border border-border")} />

        <Button type="button" size="sm" onClick={apply}
          disabled={!userId || targets.length === 0 || applying}
          data-testid="bulk-apply-button"
          className="h-9 px-4 text-[13px] font-bold shadow-md shadow-primary/30 hover:bg-primary-hover">
          {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" strokeWidth={3} />}
          Aplicar{targets.length > 0 ? ` (${targets.length})` : ""}
        </Button>
      </div>

      {term.trim() && (
        matched.length === 0 ? (
          <p className="text-[12px] text-slate-400 mt-3 mb-0">Nenhuma função com "{term}" no nome.</p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
            {matched.map(f => {
              const checked = !unchecked.has(f.id);
              const already = userId ? (f.managers ?? []).find(m => m.userId === userId) : undefined;
              return (
                <label key={f.id} className="flex items-center gap-1.5 text-[12px] font-medium text-foreground cursor-pointer select-none">
                  <Checkbox checked={checked} onCheckedChange={() => toggle(f.id)} aria-label={`Incluir ${f.name}`} className="w-3.5 h-3.5" />
                  <span className="capitalize">{f.name}</span>
                  {already && <span className="text-[10px] text-slate-400">(já é {roleLabel(already.role)})</span>}
                </label>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ─── Aba "Validação de Escala" ─────────────────────────────────────────────
export default function EscalaResponsaveisTab({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: funcoesCruas, isLoading, isError, error, refetch } = useQuery<FunctionWithManagers[]>({ queryKey: ["/api/functions"] });
  /**
   * Cadastro PRÓPRIO da Escala (27/08) — tabela separada da lista clássica de
   * responsáveis da função. Antes as duas eram a mesma coisa: cadastrar aqui
   * dava acesso de responsável na Escalação, e remover aqui tirava de lá.
   */
  const { data: escalaManagers } = useQuery<{ functionId: string; userId: string; role: ManagerRole }[]>({
    queryKey: ["/api/scaling-function-managers"],
  });
  // GET /api/users recusa quem não gerencia — só busca para quem pode editar.
  const { data: users } = useQuery<UserType[]>({ queryKey: ["/api/users"], enabled: canManage });
  // Aprovador padrão do sistema: função sem aprovador próprio não fica sem quem
  // decida, então isso é informação, não alarme. Carregando/erro → sem linha.
  const { data: defaultApprover } = useQuery<DefaultApprover>({ queryKey: ["/api/scaling-default-approver"] });

  // Nunca exibimos o id: sem nome, texto genérico; sem padrão configurado, nada.
  const defaultApproverText = useMemo(() => {
    if (!defaultApprover?.userId) return null;
    const name = defaultApprover.userName?.trim();
    return name ? `Aprovador padrão: ${name}` : "Aprovador padrão do sistema";
  }, [defaultApprover]);

  const functions = useMemo<FunctionWithManagers[]>(() => {
    const nomePorUsuario = new Map((users ?? []).map(u => [u.id, u.name || u.email]));
    const porFuncao = new Map<string, NonNullable<FunctionWithManagers["managers"]>>();
    for (const m of escalaManagers ?? []) {
      const lista = porFuncao.get(m.functionId) ?? [];
      lista.push({ userId: m.userId, userName: nomePorUsuario.get(m.userId) ?? "Usuário", role: m.role });
      porFuncao.set(m.functionId, lista);
    }
    return (funcoesCruas ?? []).map(f => ({ ...f, managers: porFuncao.get(f.id) ?? [] }));
  }, [funcoesCruas, escalaManagers, users]);

  const visible = useMemo(() => {
    let list = (functions ?? [])
      .filter(f => f.responsibleArea !== "__system__")
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (search.trim()) { const t = normalize(search); list = list.filter(f => normalize(f.name).includes(t)); }
    return list;
  }, [functions, search]);

  const allVisible = useMemo(() => (functions ?? []).filter(f => f.responsibleArea !== "__system__"), [functions]);
  // Funções sem aprovador PRÓPRIO — caem no aprovador padrão (não é pendência).
  const usingDefault = useMemo(() => allVisible.filter(f => !(f.managers ?? []).some(m => m.role === "aprovador")), [allVisible]);

  const sortedUsers = useMemo(
    () => [...(users ?? [])].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "pt-BR")),
    [users],
  );

  const invalidate = () => {
    // Só o cadastro da Escala: a lista clássica de responsáveis não é mexida
    // por esta tela (é o ponto da separação).
    queryClient.invalidateQueries({ queryKey: ["/api/scaling-function-managers"] });
  };

  const addMutation = useMutation({
    mutationFn: async (v: { functionId: string; userId: string; role: ManagerRole }) =>
      (await apiRequest("POST", "/api/scaling-function-managers", { functionId: v.functionId, userId: v.userId, role: v.role })).json(),
    onSuccess: (_d, v) => { invalidate(); toast({ title: v.role === "aprovador" ? "Aprovador adicionado!" : "Validador adicionado!" }); },
    onError: (err: any) => toast({ title: "Erro ao adicionar responsável", description: errMsg(err, "Tente novamente."), variant: "destructive" }),
  });
  const moveMutation = useMutation({
    mutationFn: async (v: { functionId: string; userId: string; role: ManagerRole }) =>
      // Trocar de papel = tirar do papel antigo e pôr no novo (a unicidade da
      // tabela é por função + usuário + papel).
      (await apiRequest("DELETE", `/api/scaling-function-managers/${v.functionId}/${v.userId}`).then(() =>
        apiRequest("POST", "/api/scaling-function-managers", { functionId: v.functionId, userId: v.userId, role: v.role }))).json(),
    onSuccess: (_d, v) => { invalidate(); toast({ title: "Papel alterado!", description: `Agora é ${roleLabel(v.role)} desta função.` }); },
    onError: (err: any) => toast({ title: "Erro ao alterar papel", description: errMsg(err, "Tente novamente."), variant: "destructive" }),
  });
  const removeMutation = useMutation({
    mutationFn: async (v: { functionId: string; userId: string }) =>
      (await apiRequest("DELETE", `/api/scaling-function-managers/${v.functionId}/${v.userId}`)).json(),
    onSuccess: () => { invalidate(); toast({ title: "Responsável removido." }); },
    onError: (err: any) => toast({ title: "Erro ao remover responsável", description: errMsg(err, "Tente novamente."), variant: "destructive" }),
  });

  const cellFor = (func: FunctionWithManagers, role: ManagerRole) => {
    const managers = (func.managers ?? []).filter(m => m.role === role)
      .sort((a, b) => a.userName.localeCompare(b.userName, "pt-BR"));
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {managers.length === 0 && (role === "aprovador"
          // Sem aprovador próprio: quem decide é o padrão do sistema — nota
          // discreta, sem cor de alerta. O admin segue livre para cadastrar um
          // aprovador específico da função no "+" ao lado.
          ? defaultApproverText && (
              <span className="text-[11px] text-slate-500">{defaultApproverText}</span>
            )
          : <span className="text-[11px] italic text-slate-400">Nenhum validador</span>
        )}
        {managers.map(m => (
          <ManagerChip key={m.userId} manager={m} canManage={canManage}
            isRemoving={removeMutation.isPending && removeMutation.variables?.functionId === func.id && removeMutation.variables?.userId === m.userId}
            onRemove={() => removeMutation.mutate({ functionId: func.id, userId: m.userId })} />
        ))}
        {canManage && (
          <AddManagerButton func={func} role={role} users={sortedUsers}
            isPending={(addMutation.isPending || moveMutation.isPending) && (addMutation.variables?.functionId === func.id || moveMutation.variables?.functionId === func.id)}
            onAdd={userId => addMutation.mutate({ functionId: func.id, userId, role })}
            onMove={userId => moveMutation.mutate({ functionId: func.id, userId, role })} />
        )}
      </div>
    );
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-[0_20px_40px_rgba(20,27,43,0.03)] overflow-hidden">

      {/* Sem banner de "sem aprovador": com o aprovador padrão do sistema,
          nenhuma vaga validada fica sem quem decida. Cada função mostra a nota
          discreta do padrão na própria coluna Aprovadores. */}

      {/* Atalho por área */}
      {canManage && !isLoading && allVisible.length > 0 && (
        <BulkApplyBlock functions={allVisible} users={sortedUsers} onDone={invalidate} />
      )}

      {/* Busca */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-border mt-1">
        <div className="relative flex-1 min-w-[200px] max-w-[400px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400 pointer-events-none">search</span>
          <input aria-label="Buscar função pelo nome" placeholder="Buscar função pelo nome..."
            value={search} onChange={e => setSearch(e.target.value)}
            className={cn(SOFT_INPUT, "h-10 text-[13px] pl-10", search ? "pr-9" : "pr-3.5")} />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 flex text-slate-400 hover:text-slate-600 transition-colors"><X className="w-3.5 h-3.5" /></button>
          )}
        </div>
        <div className="flex items-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" /> Validador: valida a escala da área</span>
          <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-violet-500" /> Aprovador: decide pedidos e aprova vagas</span>
        </div>
      </div>

      {isLoading && (
        <div className="p-4 sm:p-6">
          <LoadingState count={6} label="Carregando responsáveis…" className="border-0 rounded-none" />
        </div>
      )}

      {!isLoading && isError && !functions && (
        <div className="px-6 py-14 text-center" role="alert">
          <div className="flex flex-col items-center gap-2.5">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-50">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h4 className="text-[15px] font-extrabold text-foreground m-0">Não foi possível carregar as funções</h4>
            <p className="text-[13px] text-slate-500 m-0 max-w-[320px] leading-normal">{errMsg(error, "Verifique sua conexão e tente novamente.")}</p>
            <Button variant="outline" size="sm" className="mt-1.5" onClick={() => refetch()}>Tentar novamente</Button>
          </div>
        </div>
      )}

      {!isLoading && !(isError && !functions) && visible.length === 0 && (
        <div className="p-4 sm:p-6">
          <EmptyState icon={Users}
            variant={search ? "filtered" : undefined}
            title={search ? "Nenhuma função encontrada" : "Nenhuma função cadastrada"}
            description={search ? "Ajuste sua busca para ver todas as funções." : "Cadastre funções na aba ao lado para definir os responsáveis."}
            onClearFilters={search ? () => setSearch("") : undefined}
            className="border-0 py-10" />
        </div>
      )}

      {!isLoading && !(isError && !functions) && visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {["Função", "Validadores", "Aprovadores"].map(h => (
                  <th key={h} className="px-4 sm:px-6 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(func => (
                <tr key={func.id}
                  className="transition-colors border-b border-border/50 hover:bg-brand-soft/30">
                  <td className="px-4 sm:px-6 py-3.5 align-top">
                    <span className="text-[14px] font-semibold text-foreground capitalize">{func.name}</span>
                  </td>
                  <td className="px-4 sm:px-6 py-3.5 align-top">{cellFor(func, "validador")}</td>
                  <td className="px-4 sm:px-6 py-3.5 align-top">{cellFor(func, "aprovador")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visible.length > 0 && (
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-t border-border bg-muted/30">
          <span className="text-xs text-slate-400 font-medium">
            {search
              ? `Mostrando ${visible.length} de ${allVisible.length} funções`
              : `${allVisible.length} ${allVisible.length === 1 ? "função" : "funções"}${
                  defaultApproverText && usingDefault.length > 0
                    ? ` · ${usingDefault.length} no aprovador padrão`
                    : ""
                }`}
          </span>
        </div>
      )}
    </div>
  );
}
