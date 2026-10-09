/**
 * Responsáveis da função — o cadastro "normal" (`function_managers`), na
 * célula da lista de Funções (07/10, redesenho; antes morava inline em
 * pages/functions.tsx).
 *
 * O que mudou na apresentação (a lógica é a mesma — POST/DELETE em
 * /api/functions/:id/managers, invalidando "/api/functions"):
 *  - os NOMES à vista (eram só iniciais: para saber quem era, um clique);
 *  - o "ver todos" virou um popover ancorado de verdade (Radix: foco, Esc,
 *    colisão com a borda), com o que o papel permite e "Adicionar" no rodapé —
 *    antes era uma camada fixa posicionada pelo clique do mouse;
 *  - remover continua com confirmação, agora com o botão nomeado;
 *  - adicionar ganhou busca (era um select com todos os usuários), mostra
 *    quem já responde pela função e diz o efeito antes de confirmar.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Plus, UserMinus, UserPlus, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import type { User as UserType } from "@shared/schema";
import {
  Avatar, BOTAO_ADICIONAR, CABECALHO_DO_DIALOGO, FECHAR_DO_DIALOGO, ICONE_DO_DIALOGO, PAPEL_RESPONSAVEL,
  RODAPE_DO_DIALOGO, ROTULO, nomeDaFuncao,
} from "./papeis";

/** Responsável como vem embutido em GET /api/functions. */
export type ManagerSummary = { userId: string; userName: string };

/** Minúsculas + sem acento, para a busca de pessoas. */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** "Ana Souza", "Ana Souza e Bruno Lima", "Ana Souza e mais 2". */
function resumoDosNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes[0]} e mais ${nomes.length - 1}`;
}

// Os responsáveis vêm embutidos em GET /api/functions (`managers`) — nada de
// uma query por linha. Adicionar/remover invalida "/api/functions".
export function FunctionManagersCell({ functionId, functionName, managers: managersProp, canManage }: {
  functionId: string;
  functionName: string;
  managers?: ManagerSummary[];
  canManage: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [verTodos, setVerTodos] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const nome = nomeDaFuncao(functionName);

  const { data: users, isLoading: carregandoUsuarios, isError: falhouUsuarios } = useQuery<UserType[]>({ queryKey: ["/api/users"] });

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
    onError: (err: unknown) => toast({ title: "Erro ao adicionar responsável", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });
  const removeManagerMutation = useMutation({
    mutationFn: async (userId: string) => (await apiRequest("DELETE", `/api/functions/${functionId}/managers/${userId}`)).json(),
    onSuccess: () => { invalidateManagers(); toast({ title: "Responsável removido." }); },
    onError: (err: unknown) => toast({ title: "Erro ao remover responsável", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const managers = useMemo(() => managersProp ?? [], [managersProp]);

  // O Map preserva a semântica de "primeiro registro vence" do find original.
  const usersById = useMemo(() => {
    const m = new Map<string, UserType>();
    for (const u of users ?? []) if (!m.has(u.id)) m.set(u.id, u);
    return m;
  }, [users]);

  const nomeDe = (fm: ManagerSummary) => {
    const u = usersById.get(fm.userId);
    return fm.userName || u?.name || u?.email || "Usuário";
  };
  const nomes = managers.map(nomeDe);

  const availableUsers = useMemo(() => {
    const taken = new Set(managers.map(fm => fm.userId));
    return (users ?? [])
      .filter(u => !taken.has(u.id))
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "pt-BR"));
  }, [users, managers]);

  const selecionado = availableUsers.find(u => u.id === selectedUserId);

  const abrirAdicionar = () => { setVerTodos(false); setSelectedUserId(""); setIsOpen(true); };

  return (
    <div className="flex items-center gap-2 min-w-0">
      {managers.length === 0 && (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-strong" data-testid={`sem-responsavel-${functionId}`}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Nenhum responsável
        </span>
      )}

      {managers.length > 0 && (
        <Popover open={verTodos} onOpenChange={o => { setVerTodos(o); if (!o) setConfirmId(null); }}>
          <PopoverTrigger asChild>
            <button type="button"
              aria-label={managers.length === 1 ? `Ver o responsável por ${nome}` : `Ver os ${managers.length} responsáveis por ${nome}`}
              className="fun-pessoas relative z-[1] inline-flex items-center gap-2 min-w-0 max-w-full h-8 pl-0.5 pr-2 -ml-0.5 rounded-full text-left transition-colors hover:bg-muted data-[state=open]:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`responsaveis-${functionId}`}>
              <span className="flex items-center shrink-0">
                {managers.slice(0, 3).map((fm, i) => (
                  <Avatar key={fm.userId} id={fm.userId} nome={nomeDe(fm)} className={cn("ring-2 ring-card", i > 0 && "-ml-2")} />
                ))}
              </span>
              <span className="min-w-0 truncate text-sm text-slate-700">{resumoDosNomes(nomes)}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" collisionPadding={12} tabIndex={-1} aria-label={`Responsáveis por ${nome}`}
            // O foco entra no painel (não no primeiro "Remover", que acendia a dica sozinho).
            onOpenAutoFocus={e => { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.focus(); }}
            className="w-[320px] p-0 rounded-xl overflow-hidden focus-visible:outline-none">
            <div className="px-4 pt-3 pb-2.5 border-b border-border">
              <p className="m-0 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground truncate">{nome}</span>
                <span className="text-2xs font-medium text-muted-foreground tabular-nums shrink-0">
                  {managers.length} {managers.length === 1 ? "responsável" : "responsáveis"}
                </span>
              </p>
              <p className="m-0 mt-1 text-xs leading-[18px] text-muted-foreground">
                {PAPEL_RESPONSAVEL.efeito.charAt(0).toUpperCase() + PAPEL_RESPONSAVEL.efeito.slice(1)}
              </p>
            </div>
            <ul className="m-0 p-1.5 list-none max-h-72 overflow-y-auto">
              {managers.map(fm => {
                const n = nomeDe(fm);
                const email = usersById.get(fm.userId)?.email;
                const confirmando = confirmId === fm.userId;
                const removendo = removeManagerMutation.isPending && removeManagerMutation.variables === fm.userId;
                return (
                  <li key={fm.userId} className={cn("group flex items-center gap-2.5 min-h-[48px] px-2 py-1.5 rounded-lg transition-colors", confirmando ? "bg-danger-soft" : "hover:bg-muted/60")}>
                    <Avatar id={fm.userId} nome={n} tamanho="lg" />
                    <div className="flex-1 min-w-0">
                      <p className="m-0 text-sm font-medium text-foreground truncate">{n}</p>
                      {email && email !== n && <p className="m-0 text-2xs text-muted-foreground truncate">{email}</p>}
                    </div>
                    {!canManage ? null : confirmando ? (
                      <div className="pas-entra flex items-center gap-1 shrink-0">
                        <Button type="button" variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs" onClick={() => setConfirmId(null)}>Não</Button>
                        <Button type="button" size="sm"
                          className="h-7 rounded-md px-2 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => { removeManagerMutation.mutate(fm.userId); setConfirmId(null); }}>
                          Remover
                        </Button>
                      </div>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" onClick={() => setConfirmId(fm.userId)} disabled={removendo}
                            aria-label={`Remover ${n} dos responsáveis`}
                            className="pas-alvo fun-remover shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground transition-colors hover:text-danger-strong hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                            {removendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserMinus className="h-4 w-4" aria-hidden="true" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Remover</TooltipContent>
                      </Tooltip>
                    )}
                  </li>
                );
              })}
            </ul>
            {canManage && (
              <div className="px-1.5 pb-1.5 pt-0.5 border-t border-border bg-surface-muted/60">
                <button type="button" onClick={abrirAdicionar}
                  className="pas-alvo mt-1 flex items-center gap-2 w-full h-9 px-2.5 rounded-lg text-sm font-medium text-primary hover:bg-brand-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <UserPlus className="w-4 h-4" aria-hidden="true" />Adicionar responsável
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}

      {/* Adicionar — só para quem o servidor aceita em POST /api/functions/:id/managers */}
      {canManage && <Dialog open={isOpen} onOpenChange={o => { setIsOpen(o); if (!o) setSelectedUserId(""); }}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <button type="button" aria-label={`Adicionar responsável a ${nome}`}
                className={BOTAO_ADICIONAR}
                data-testid={`button-add-function-manager-${functionId}`}>
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>Adicionar responsável</TooltipContent>
        </Tooltip>
        <DialogContent className="p-0 gap-0 sm:max-w-[460px] rounded-xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[88vh] max-sm:w-full max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0">
          <div className={CABECALHO_DO_DIALOGO}>
            <div className={ICONE_DO_DIALOGO}><UserPlus className="h-5 w-5" aria-hidden="true" /></div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold text-foreground leading-6 m-0 p-0">Adicionar responsável</DialogTitle>
              <DialogDescription className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground truncate">{nome}</DialogDescription>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Fechar" className={FECHAR_DO_DIALOGO}>
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4 flex flex-col gap-4">
            {/* O efeito antes de escolher: quem entra aqui passa a mexer nas vagas. */}
            <p className="m-0 flex items-start gap-2 rounded-lg border border-primary/15 bg-brand-soft/60 px-3 py-2.5 text-xs leading-5 text-slate-700" data-testid="efeito-responsavel">
              <Users className="w-3.5 h-3.5 mt-[3px] shrink-0 text-primary" aria-hidden="true" />
              <span><strong className="font-semibold text-foreground">Responsáveis</strong> {PAPEL_RESPONSAVEL.efeito}</span>
            </p>

            {managers.length > 0 && (
              <div>
                <p className={ROTULO}>Já respondem por ela</p>
                <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
                  {managers.map(fm => (
                    <li key={fm.userId} className="inline-flex items-center gap-1.5 h-7 pl-0.5 pr-2.5 rounded-full border border-border bg-card text-xs font-medium text-slate-700">
                      <Avatar id={fm.userId} nome={nomeDe(fm)} tamanho="sm" />{nomeDe(fm)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col min-h-0">
              <label htmlFor={`select-function-manager-${functionId}`} className={ROTULO}>Pessoa</label>
              <Command
                filter={(value, search) => normalizar(value).includes(normalizar(search)) ? 1 : 0}
                className="rounded-lg border border-border bg-card overflow-hidden [&_[cmdk-input-wrapper]]:px-2.5"
                data-testid={`select-function-manager-${functionId}`}>
                <CommandInput id={`select-function-manager-${functionId}`} aria-label="Selecionar usuário responsável" placeholder="Buscar pelo nome ou e-mail" className="h-10 text-sm" />
                <CommandList className="max-h-[232px] max-sm:max-h-[52dvh]">
                  {carregandoUsuarios ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />Carregando usuários…</div>
                  ) : falhouUsuarios ? (
                    <div className="py-6 text-center text-xs text-danger" role="alert">Não foi possível carregar os usuários.</div>
                  ) : availableUsers.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">Todos os usuários já foram adicionados</div>
                  ) : (
                    <>
                      <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">Ninguém com esse nome</CommandEmpty>
                      <CommandGroup className="p-1">
                        {availableUsers.map(u => {
                          const marcado = u.id === selectedUserId;
                          return (
                            <CommandItem key={u.id} value={`${u.name || u.email} ${u.email ?? ""}`}
                              onSelect={() => setSelectedUserId(u.id)}
                              aria-selected={marcado}
                              className={cn("flex items-center gap-2.5 py-2 px-2 rounded-md cursor-pointer", marcado && "bg-brand-soft")}>
                              <Avatar id={u.id} nome={u.name || u.email} tamanho="sm" />
                              <span className="flex-1 min-w-0">
                                <span className={cn("block truncate text-sm", marcado ? "font-semibold text-primary" : "text-foreground")}>{u.name || u.email}</span>
                                {u.name && u.email && <span className="block truncate text-2xs text-muted-foreground">{u.email}</span>}
                              </span>
                              {marcado && <Check className="w-4 h-4 text-primary shrink-0" strokeWidth={2.5} aria-hidden="true" />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </div>
          </div>

          <div className={RODAPE_DO_DIALOGO}>
            <p className="m-0 mr-auto min-w-0 text-xs text-muted-foreground truncate" aria-live="polite">
              {selecionado ? <>Entra: <span className="font-medium text-foreground">{selecionado.name || selecionado.email}</span></> : "Escolha uma pessoa"}
            </p>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="h-9 rounded-lg px-4 text-sm font-medium">
              Cancelar
            </Button>
            <Button type="button" onClick={() => selectedUserId && addManagerMutation.mutate(selectedUserId)}
              disabled={!selectedUserId || addManagerMutation.isPending} aria-busy={addManagerMutation.isPending}
              className="h-9 rounded-lg px-4 text-sm font-semibold gap-2 hover:bg-primary-hover"
              data-testid={`button-submit-add-manager-${functionId}`}>
              {addManagerMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Adicionando…</>
                : <><Check className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" /> Adicionar</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>}
    </div>
  );
}

export default FunctionManagersCell;
