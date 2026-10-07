/**
 * Aba "Validação de Escala" da tela de Funções — validador e aprovador de cada
 * função (cadastro PRÓPRIO da Escala, `scaling_function_managers`).
 *
 * 07/10 (redesenho, na casca de Funções/Eventos):
 *  - a faixa no topo da lista diz o que cada papel permite e quem é o
 *    aprovador padrão (era uma legenda de 11px no canto da busca);
 *  - barra de filtros comum + recorte com contagem ("Sem validador", "No
 *    aprovador padrão") — o rodapé "N no aprovador padrão" virou filtro;
 *  - "Aplicar a várias funções" recolhido atrás de um botão: é ferramenta de
 *    configuração, não precisa ocupar o topo da aba todo dia;
 *  - lista no DataTable (cabeçalho com a dica do papel) e cartões no celular
 *    (a tabela de 640px rolava de lado em 390);
 *  - pessoa com iniciais; função sem aprovador próprio mostra o padrão como
 *    etiqueta tracejada, não como frase solta.
 * Mesmas consultas, mutações, toasts e data-testid.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronDown, CloudOff, Layers, Loader2, Plus, RotateCw, ShieldCheck, UserCheck, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-media-query";
import { EmptyState } from "@/components/common/empty-state";
import { DataTable, type ColunaDaTabela } from "@/components/common/data-table";
import { BuscaDaLista } from "@/components/common/barra-de-filtros";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import type { User as UserType } from "@shared/schema";
import type { FunctionWithManagers } from "@/components/scaling-validation/types";
import { apiErrorMessage } from "@/lib/api-error";
import { Avatar, BOTAO_ADICIONAR, FaixaDosPapeis, FiltroSegmentado, PAPEL_APROVADOR, PAPEL_VALIDADOR, ROTULO, nomeDaFuncao } from "./papeis";

type ManagerRole = "validador" | "aprovador";
type Manager = NonNullable<FunctionWithManagers["managers"]>[number];
/** GET /api/scaling-default-approver — quem decide quando a função não tem aprovador próprio. */
type DefaultApprover = { userId: string | null; userName: string | null };
type Recorte = "todas" | "sem-validador" | "padrao";

/** Abaixo disto a tabela não cabe com folga: cartões. */
const LARGURA_MINIMA_DA_TABELA = 720;

/** Minúsculas + sem acento — mesmo critério do seed 2026-08-20-escala-responsaveis. */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function roleLabel(role: ManagerRole) {
  return role === "aprovador" ? "aprovador" : "validador";
}

// ─── Chip de responsável (X com confirmação inline) ────────────────────────
function ManagerChip({ manager, canManage, isRemoving, onRemove }: {
  manager: Manager;
  canManage: boolean;
  isRemoving: boolean;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const aprovador = manager.role === "aprovador";

  if (confirming) return (
    <span className="pas-entra inline-flex items-center gap-1 h-7 pl-2.5 pr-0.5 rounded-full border border-danger/30 bg-danger-soft text-xs font-medium text-danger-strong">
      <span className="truncate max-w-[150px]">Remover {manager.userName.split(" ")[0]}?</span>
      <button type="button" onClick={() => setConfirming(false)}
        className="pas-alvo h-6 px-2 rounded-full text-2xs font-semibold text-slate-600 hover:bg-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Não
      </button>
      <button type="button" disabled={isRemoving}
        onClick={() => { setConfirming(false); onRemove(); }}
        className="pas-alvo h-6 px-2 rounded-full text-2xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Sim
      </button>
    </span>
  );

  return (
    <span className={cn(
      "fun-chip inline-flex items-center gap-1.5 h-7 pl-0.5 rounded-full border text-xs font-medium max-w-full",
      aprovador ? "bg-brand-soft text-primary border-primary/20" : "bg-card text-slate-700 border-border",
      canManage ? "pr-0.5" : "pr-2.5",
    )}>
      <Avatar id={manager.userId} nome={manager.userName} tamanho="sm" className={aprovador ? "bg-card text-primary" : "bg-muted text-slate-700"} />
      <span className="truncate max-w-[160px]">{manager.userName}</span>
      {canManage && (
        <button type="button" onClick={() => setConfirming(true)} disabled={isRemoving}
          aria-label={`Remover ${manager.userName} de ${roleLabel(manager.role)}`}
          className="pas-alvo fun-chip-x shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-current opacity-50 hover:opacity-100 hover:text-danger-strong hover:bg-danger-soft transition-[opacity,background-color,color] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {isRemoving ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <X className="w-3 h-3" aria-hidden="true" />}
        </button>
      )}
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
  const byUser = useMemo(() => new Map((func.managers ?? []).map(m => [m.userId, m])), [func.managers]);
  const otherRole: ManagerRole = role === "aprovador" ? "validador" : "aprovador";
  const papel = role === "aprovador" ? PAPEL_APROVADOR : PAPEL_VALIDADOR;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button type="button"
              aria-label={`Adicionar ${roleLabel(role)} a ${func.name}`}
              data-testid={`button-add-${role}-${func.id}`}
              className={cn(BOTAO_ADICIONAR, "data-[state=open]:border-primary data-[state=open]:text-primary data-[state=open]:bg-brand-soft")}>
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Adicionar {roleLabel(role)}</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-[300px] p-0 rounded-xl overflow-hidden" align="start" collisionPadding={12}>
        <div className="px-3.5 pt-3 pb-2.5 border-b border-border">
          <p className="m-0 text-sm font-semibold text-foreground truncate">Adicionar {roleLabel(role)} · {nomeDaFuncao(func.name)}</p>
          <p className="m-0 mt-0.5 text-xs leading-[18px] text-muted-foreground">{papel.nome} {papel.efeito}</p>
        </div>
        <Command filter={(value, search) => normalize(value).includes(normalize(search)) ? 1 : 0}>
          <CommandInput placeholder="Buscar usuário…" className="h-10 text-sm" />
          <CommandList className="max-h-60">
            <CommandEmpty className="py-5 text-center text-xs text-muted-foreground">Nenhum usuário encontrado</CommandEmpty>
            <CommandGroup className="p-1">
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
                    className="flex items-center gap-2.5 text-sm py-2 px-2 rounded-md cursor-pointer">
                    <Avatar id={u.id} nome={displayName} tamanho="sm" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-medium">{displayName}</span>
                      {moves && (
                        <span className="text-2xs text-warning-strong">mover de {roleLabel(otherRole)} → {roleLabel(role)}</span>
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

// ─── Bloco "Aplicar a várias funções" (por área) ───────────────────────────
function BulkApplyBlock({ functions, users, onDone, onClose }: {
  functions: FunctionWithManagers[];
  users: UserType[];
  onDone: () => void;
  onClose: () => void;
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

  const CAMPO = "h-9 rounded-lg border border-border bg-card text-sm text-foreground outline-none transition-[border-color,box-shadow] hover:border-slate-300 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/12";

  return (
    <section aria-labelledby="fun-aplicar-titulo" className="pas-entra rounded-xl border border-primary/20 bg-card shadow-1 overflow-hidden" data-testid="bulk-apply-block">
      <div className="flex items-start gap-3 px-4 pt-3 pb-2.5 border-b border-border bg-brand-soft/40">
        <Layers className="w-4 h-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h3 id="fun-aplicar-titulo" className="m-0 text-sm font-semibold text-foreground">Aplicar a várias funções</h3>
          <p className="m-0 mt-0.5 text-xs leading-[18px] text-muted-foreground">
            Escolha a pessoa, o papel e um pedaço do nome das funções (ex.: “ceno”). Desmarque as que não entram.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar aplicar a várias funções"
          className="pas-alvo -mr-1.5 -mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(200px,1fr)_150px_minmax(220px,1.4fr)_auto] gap-3 items-end px-4 py-3.5">
        {/* Usuário */}
        <div className="min-w-0">
          <span className={ROTULO} id="bulk-user-rotulo">Pessoa</span>
          <Popover open={userOpen} onOpenChange={setUserOpen}>
            <PopoverTrigger asChild>
              <button type="button" data-testid="bulk-user-trigger" aria-labelledby="bulk-user-rotulo bulk-user-valor"
                className={cn(CAMPO, "w-full px-2.5 flex items-center justify-between gap-2")}>
                <span id="bulk-user-valor" className={cn("flex items-center gap-2 min-w-0 truncate", !selectedUser && "text-muted-foreground")}>
                  {selectedUser && <Avatar id={selectedUser.id} nome={selectedUser.name || selectedUser.email} tamanho="sm" />}
                  <span className="truncate">{selectedUser ? (selectedUser.name || selectedUser.email) : "Selecionar usuário…"}</span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0 rounded-xl" align="start" collisionPadding={12}>
              <Command filter={(value, search) => normalize(value).includes(normalize(search)) ? 1 : 0}>
                <CommandInput placeholder="Buscar usuário…" className="h-10 text-sm" />
                <CommandList className="max-h-60">
                  <CommandEmpty className="py-5 text-center text-xs text-muted-foreground">Nenhum usuário encontrado</CommandEmpty>
                  <CommandGroup className="p-1">
                    {users.map(u => (
                      <CommandItem key={u.id} value={`${u.name || u.email} ${u.email ?? ""}`}
                        onSelect={() => { setUserId(u.id); setUserOpen(false); }}
                        className="flex items-center gap-2.5 text-sm py-2 px-2 rounded-md cursor-pointer">
                        <Avatar id={u.id} nome={u.name || u.email} tamanho="sm" />
                        <span className="truncate">{u.name || u.email}</span>
                        {u.id === userId && <Check className="w-3.5 h-3.5 ml-auto text-primary" aria-hidden="true" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Papel */}
        <div className="min-w-0">
          <span className={ROTULO}>Papel</span>
          <Select value={role} onValueChange={v => setRole(v as ManagerRole)}>
            <SelectTrigger className={cn(CAMPO, "w-full px-2.5 focus:ring-[3px] focus:ring-primary/12 focus:ring-offset-0")} aria-label="Papel" data-testid="bulk-role-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="validador">Validador</SelectItem>
              <SelectItem value="aprovador">Aprovador</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Grupo de funções */}
        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
          <label htmlFor="bulk-function-search" className={ROTULO}>Trecho do nome das funções</label>
          <input id="bulk-function-search" value={term} onChange={e => { setTerm(e.target.value); setUnchecked(new Set()); }}
            aria-label="Buscar grupo de funções pelo nome"
            placeholder='Ex.: "ceno", "kit"'
            data-testid="bulk-function-search"
            className={cn(CAMPO, "w-full px-2.5 placeholder:text-muted-foreground")} />
        </div>

        <Button type="button" onClick={apply}
          disabled={!userId || targets.length === 0 || applying}
          aria-busy={applying}
          data-testid="bulk-apply-button"
          className="h-9 px-4 rounded-lg text-sm font-semibold gap-2 hover:bg-primary-hover sm:col-span-2 lg:col-span-1">
          {applying ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />}
          {applying ? "Aplicando…" : targets.length > 0 ? `Aplicar a ${targets.length} ${targets.length === 1 ? "função" : "funções"}` : "Aplicar"}
        </Button>
      </div>

      {term.trim() && (
        <div className="px-4 pb-3.5 -mt-0.5">
          {matched.length === 0 ? (
            <p className="m-0 text-xs text-muted-foreground">Nenhuma função com “{term}” no nome.</p>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5" aria-label="Funções que entram">
              {matched.map(f => {
                const checked = !unchecked.has(f.id);
                const already = userId ? (f.managers ?? []).find(m => m.userId === userId) : undefined;
                return (
                  <li key={f.id}>
                    <label className={cn(
                      "pas-alvo inline-flex items-center gap-1.5 h-8 pl-2 pr-2.5 rounded-lg border text-xs font-medium cursor-pointer select-none transition-colors",
                      checked ? "border-primary/30 bg-brand-soft text-foreground" : "border-border bg-card text-muted-foreground line-through decoration-muted-foreground/40",
                    )}>
                      <Checkbox checked={checked} onCheckedChange={() => toggle(f.id)} aria-label={`Incluir ${f.name}`} className="w-3.5 h-3.5" />
                      <span>{nomeDaFuncao(f.name)}</span>
                      {already && <span className="text-2xs font-normal text-muted-foreground no-underline">(já é {roleLabel(already.role)})</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Aba "Validação de escala" ─────────────────────────────────────────────
export default function EscalaResponsaveisTab({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [recorte, setRecorte] = useState<Recorte>("todas");
  const [aplicarAberto, setAplicarAberto] = useState(false);
  const isMobile = useIsMobile();
  const { ref: medida, largura } = useLarguraUtil<HTMLDivElement>();
  const emCartoes = isMobile || (largura !== null && largura < LARGURA_MINIMA_DA_TABELA);

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
  const defaultApproverName = useMemo(() => {
    if (!defaultApprover?.userId) return null;
    return defaultApprover.userName?.trim() || null;
  }, [defaultApprover]);
  const temPadrao = !!defaultApprover?.userId;
  const defaultApproverText = temPadrao ? (defaultApproverName ? `Aprovador padrão: ${defaultApproverName}` : "Aprovador padrão do sistema") : null;

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

  const allVisible = useMemo(
    () => (functions ?? []).filter(f => f.responsibleArea !== "__system__").sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [functions],
  );
  // Funções sem aprovador PRÓPRIO — caem no aprovador padrão (não é pendência).
  const usingDefault = useMemo(() => allVisible.filter(f => !(f.managers ?? []).some(m => m.role === "aprovador")), [allVisible]);
  const semValidador = useMemo(() => allVisible.filter(f => !(f.managers ?? []).some(m => m.role === "validador")), [allVisible]);

  const visible = useMemo(() => {
    let list = recorte === "sem-validador" ? semValidador : recorte === "padrao" ? usingDefault : allVisible;
    if (search.trim()) { const t = normalize(search); list = list.filter(f => normalize(f.name).includes(t)); }
    return list;
  }, [allVisible, semValidador, usingDefault, recorte, search]);

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
    onError: (err: unknown) => toast({ title: "Erro ao adicionar responsável", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });
  const moveMutation = useMutation({
    mutationFn: async (v: { functionId: string; userId: string; role: ManagerRole }) =>
      // Trocar de papel = tirar do papel antigo e pôr no novo (a unicidade da
      // tabela é por função + usuário + papel).
      (await apiRequest("DELETE", `/api/scaling-function-managers/${v.functionId}/${v.userId}`).then(() =>
        apiRequest("POST", "/api/scaling-function-managers", { functionId: v.functionId, userId: v.userId, role: v.role }))).json(),
    onSuccess: (_d, v) => { invalidate(); toast({ title: "Papel alterado!", description: `Agora é ${roleLabel(v.role)} desta função.` }); },
    onError: (err: unknown) => toast({ title: "Erro ao alterar papel", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });
  const removeMutation = useMutation({
    mutationFn: async (v: { functionId: string; userId: string }) =>
      (await apiRequest("DELETE", `/api/scaling-function-managers/${v.functionId}/${v.userId}`)).json(),
    onSuccess: () => { invalidate(); toast({ title: "Responsável removido." }); },
    onError: (err: unknown) => toast({ title: "Erro ao remover responsável", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const cellFor = (func: FunctionWithManagers, role: ManagerRole) => {
    const managers = (func.managers ?? []).filter(m => m.role === role)
      .sort((a, b) => a.userName.localeCompare(b.userName, "pt-BR"));
    return (
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        {managers.length === 0 && (role === "aprovador"
          // Sem aprovador próprio: quem decide é o padrão do sistema — etiqueta
          // discreta, sem cor de alerta. O admin segue livre para cadastrar um
          // aprovador específico da função no "+" ao lado.
          ? defaultApproverText && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-dashed border-slate-300 text-xs text-muted-foreground cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`aprovador-padrao-${func.id}`}>
                    <span className="text-2xs font-semibold uppercase tracking-[0.06em]">Padrão</span>
                    <span className="truncate max-w-[160px]">{defaultApproverName ?? "do sistema"}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px]">Sem aprovador próprio: os pedidos desta função vão para o aprovador padrão do sistema.</TooltipContent>
              </Tooltip>
            )
          : <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-strong"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />Nenhum validador</span>
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

  const colunas: ColunaDaTabela<FunctionWithManagers>[] = [
    { key: "funcao", header: "Função", papel: "principal", headerClassName: "w-[26%]",
      cell: f => <span className="text-sm font-semibold leading-5 text-foreground">{nomeDaFuncao(f.name)}</span> },
    { key: "validadores", headerClassName: "w-[37%]", header: <span className="inline-flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" aria-hidden="true" />Validadores</span>,
      headerLabel: "Validadores", headerTip: `${PAPEL_VALIDADOR.nome} ${PAPEL_VALIDADOR.efeito}`, cell: f => cellFor(f, "validador") },
    { key: "aprovadores", header: <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-primary" aria-hidden="true" />Aprovadores</span>,
      headerLabel: "Aprovadores", headerTip: `${PAPEL_APROVADOR.nome} ${PAPEL_APROVADOR.efeito}`, cell: f => cellFor(f, "aprovador") },
  ];

  const cartao = (f: FunctionWithManagers) => (
    <article className="rounded-xl border border-border bg-card px-4 pt-3 pb-3.5" aria-label={nomeDaFuncao(f.name)}>
      <p className="m-0 text-sm font-semibold text-foreground">{nomeDaFuncao(f.name)}</p>
      <div className="mt-2.5 pt-2.5 border-t border-border/70 grid gap-2.5">
        <div>
          <p className="m-0 mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"><UserCheck className="w-3.5 h-3.5" aria-hidden="true" />Validadores</p>
          {cellFor(f, "validador")}
        </div>
        <div>
          <p className="m-0 mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"><ShieldCheck className="w-3.5 h-3.5 text-primary" aria-hidden="true" />Aprovadores</p>
          {cellFor(f, "aprovador")}
        </div>
      </div>
    </article>
  );

  const faixa = (className?: string) => (
    <FaixaDosPapeis
      testid="faixa-validacao"
      className={className}
      itens={[
        { icone: UserCheck, papel: PAPEL_VALIDADOR },
        {
          icone: ShieldCheck, papel: PAPEL_APROVADOR, cor: "text-primary",
          // Sem aprovador próprio, decide o padrão — dito junto do papel, não solto.
          complemento: defaultApproverText ? (
            <span className="text-muted-foreground" data-testid="nota-aprovador-padrao">
              Sem aprovador próprio, decide {defaultApproverName ? <strong className="font-semibold text-foreground">{defaultApproverName}</strong> : "o aprovador padrão do sistema"}{defaultApproverName && " (padrão)"}.
            </span>
          ) : undefined,
        },
      ]}
    />
  );

  // O contêiner medido existe em todos os ramos (carregando, erro, vazio): sem
  // ele no primeiro render a medição não começa e o tablet ficava na tabela.
  if (isLoading) return <div ref={medida}>{(
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando responsáveis" className="flex flex-col gap-4">
      <span className="sr-only">Carregando responsáveis…</span>
      <div aria-hidden="true" className="flex gap-2">
        <div className="pas-osso h-[34px] flex-[1_1_220px] max-w-[340px] rounded-lg" />
        <div className="pas-osso h-[34px] w-[330px] rounded-lg hidden sm:block" />
      </div>
      <div aria-hidden="true" className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border"><div className="pas-osso h-3 w-[min(640px,80%)]" /></div>
        <div className="h-10 bg-surface-muted border-b border-border" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0">
            <div className="pas-osso h-3.5 w-36" />
            <div className="pas-osso h-7 w-32 !rounded-full ml-[10%]" />
            <div className="pas-osso h-7 w-32 !rounded-full ml-[14%]" />
          </div>
        ))}
      </div>
    </div>
  )}</div>;

  if (isError && !funcoesCruas) return <div ref={medida}>{(
    <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
        <CloudOff className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar as funções</h2>
      <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">{apiErrorMessage(error, "Verifique sua conexão e tente novamente.")}</p>
      <Button variant="outline" className="mt-5 rounded-lg" onClick={() => refetch()}>
        <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />Tentar novamente
      </Button>
    </div>
  )}</div>;

  if (allVisible.length === 0) return <div ref={medida}>{(
    <EmptyState icon={Users} title="Nenhuma função cadastrada"
      description="Cadastre funções no Catálogo para definir quem valida e quem aprova a escala."
      className="pas-entra" />
  )}</div>;

  const q = search.trim();
  const filtrando = !!q || recorte !== "todas";
  const vazio = recorte === "sem-validador" && !q ? (
    <EmptyState icon={UserCheck} title="Todas as funções têm validador" description="Nenhuma função está sem quem valide a escala sugerida."
      action={<Button size="sm" variant="outline" onClick={() => setRecorte("todas")} className="rounded-lg">Ver todas</Button>} className="pas-entra" />
  ) : recorte === "padrao" && !q ? (
    <EmptyState icon={ShieldCheck} title="Todas as funções têm aprovador próprio" description="Nenhuma função depende do aprovador padrão."
      action={<Button size="sm" variant="outline" onClick={() => setRecorte("todas")} className="rounded-lg">Ver todas</Button>} className="pas-entra" />
  ) : (
    <EmptyState variant="filtered" icon={Users}
      title={q ? <>Nenhuma função com “{q}”</> : "Nenhuma função encontrada"}
      description="Ajuste sua busca para ver todas as funções."
      onClearFilters={() => { setSearch(""); setRecorte("todas"); }} className="pas-entra" />
  );

  return (
    <div ref={medida} className="flex flex-col gap-4">
      <div role="search" aria-label="Filtros dos responsáveis da Escala" className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex-1 min-w-0 basis-full sm:basis-auto sm:flex-[1_1_220px] sm:max-w-[340px]">
          <BuscaDaLista valor={search} onChange={setSearch} placeholder="Buscar função pelo nome" rotulo="Buscar função pelo nome" testid="escala-search" />
        </div>
        <div className="pas-rolagem-x max-w-full">
          <FiltroSegmentado<Recorte>
            rotulo="Recorte das funções" testid="recorte-escala"
            valor={recorte} onChange={setRecorte}
            opcoes={[
              { id: "todas", nome: "Todas", n: allVisible.length },
              { id: "sem-validador", nome: "Sem validador", n: semValidador.length, alerta: true },
              ...(defaultApproverText ? [{ id: "padrao" as const, nome: <><span className="sm:hidden">No padrão</span><span className="hidden sm:inline">No aprovador padrão</span></>, n: usingDefault.length }] : []),
            ]} />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto sm:ml-auto">
          {filtrando && visible.length > 0 && (
            <span className="pas-entra text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {visible.length} de {allVisible.length} {allVisible.length === 1 ? "função" : "funções"}
            </span>
          )}
          {canManage && (
            <Button type="button" variant="outline" onClick={() => setAplicarAberto(a => !a)} aria-expanded={aplicarAberto}
              data-testid="bulk-toggle"
              className={cn("h-[34px] rounded-lg px-3 text-sm font-medium gap-1.5 ml-auto max-sm:flex-1", aplicarAberto && "border-primary/40 text-primary bg-brand-soft hover:bg-brand-soft")}>
              <Layers className="w-4 h-4" aria-hidden="true" />Aplicar a várias funções
            </Button>
          )}
        </div>
      </div>

      {/* Atalho por área (recolhido por padrão) */}
      {canManage && aplicarAberto && (
        <BulkApplyBlock functions={allVisible} users={sortedUsers} onDone={invalidate} onClose={() => setAplicarAberto(false)} />
      )}

      <div>
        {visible.length === 0 ? vazio : emCartoes ? (
          <div className="flex flex-col gap-2">
            {faixa("rounded-xl border border-border bg-card")}
            <DataTable columns={colunas} rows={visible} getRowId={f => f.id} caption="Validadores e aprovadores por função"
              cardMode="always" cardRender={cartao} cardListClassName="gap-2" />
          </div>
        ) : (
          <div className="fun-moldura bg-card rounded-xl border border-border shadow-1">
            {faixa("border-b border-border")}
            <DataTable columns={colunas} rows={visible} getRowId={f => f.id} caption="Validadores e aprovadores por função"
              cardMode="never" className="fun-rolagem" tableClassName="fun-tabela" rowClassName={() => "fun-linha-escala"} />
          </div>
        )}
      </div>
    </div>
  );
}
