import { useMemo, useState } from "react";
import { apiErrorMessage } from "@/lib/api-error";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { hasPermission, normalizeRole } from "@/lib/role-utils";
import { toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { BuscaDaLista } from "@/components/common/barra-de-filtros";
import { PERFIS } from "@/components/user-registration/perfis";
import { ComoFunciona, JaSimulando } from "@/components/simulation/como-funciona";
import {
  EsqueletoDaLista, ErroDaLista, ListaDePessoas, NinguemParaSimular, SemResultado,
} from "@/components/simulation/lista-de-pessoas";
import { ConfirmarSimulacao } from "@/components/simulation/confirmar-simulacao";

/**
 * Módulo "Ver como usuário" (só admin — permissão canAccessSimulation).
 *
 * O admin escolhe um usuário ativo e passa a ver o SISTEMA INTEIRO como aquele
 * usuário veria (menu, telas, permissões e dados filtrados por pessoa), em
 * modo somente leitura garantido pelo servidor. Ao iniciar:
 *   POST /api/simulation/start → queryClient.clear() → reload em "/"
 * O reload evita que o ProtectedRoute desta página (admin-only) quebre no
 * instante em que o /me passa a devolver o usuário simulado, e cancela
 * queries em voo com o cache antigo.
 *
 * Redesenho 08/10: barra de 56px grudada (título · quantas pessoas · regra),
 * a faixa "como funciona" em três passos com a réplica do botão de saída, a
 * busca com o perfil como seletor segmentado (com contagem), a lista que vira
 * cartão em largura estreita e a CONFIRMAÇÃO antes de entrar — quem, o que
 * você vai ver (as telas do perfil) e como sair. O POST, a limpeza do cache e
 * o reload são os mesmos; a falha fica dentro da confirmação.
 */

type FiltroPerfil = "todos" | (typeof PERFIS)[number]["value"];

export default function SimulationPage() {
  usePageTitle("Ver como usuário");
  const { user: me, simulation } = useAuth();
  const [search, setSearch] = useState("");
  const [perfil, setPerfil] = useState<FiltroPerfil>("todos");
  const [alvo, setAlvo] = useState<User | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [erroAoIniciar, setErroAoIniciar] = useState<string | null>(null);

  const { data: users, isLoading, isError, refetch, isFetching } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Só usuários ativos/aprovados fazem sentido (o servidor recusa os demais).
  // O próprio admin fica de fora — simular a si mesmo não muda nada.
  const ativos = useMemo(
    () => (users ?? []).filter((u) => u.status === "approved" && u.isActive !== false && u.id !== me?.id),
    [users, me?.id],
  );
  const foraDaLista = (users ?? []).filter((u) => u.id !== me?.id).length - ativos.length;

  const porPerfil = useMemo(() => {
    const n: Record<string, number> = { todos: ativos.length };
    for (const u of ativos) {
      const r = normalizeRole(u.role);
      if (r) n[r] = (n[r] ?? 0) + 1;
    }
    return n;
  }, [ativos]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = ativos.filter((u) =>
      (perfil === "todos" || normalizeRole(u.role) === perfil) &&
      (!q || (u.name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q)),
    );
    return [...filtered].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));
  }, [ativos, search, perfil]);

  const iniciar = async (escolhido: User) => {
    if (startingId) return;
    setStartingId(escolhido.id);
    setErroAoIniciar(null);
    try {
      await apiRequest("POST", "/api/simulation/start", { userId: escolhido.id });
      // Zera o cache ANTES do reload: nenhuma query em voo reaproveita dados
      // do admin. O reload em "/" leva à home do usuário simulado.
      queryClient.clear();
      window.location.href = "/";
    } catch (error) {
      setErroAoIniciar(apiErrorMessage(error, "Tente novamente em instantes."));
      setStartingId(null);
    }
  };

  const escolher = (u: User) => {
    if (startingId || simulation?.active) return;
    setErroAoIniciar(null);
    setAlvo(u);
  };
  const fechar = () => {
    if (startingId) return;
    setAlvo(null);
    setErroAoIniciar(null);
  };
  const limpar = () => { setSearch(""); setPerfil("todos"); };

  const carregado = !isLoading && !isError;
  const n = ativos.length;
  const subtitulo = carregado
    ? <>{n === 0 ? "nenhuma pessoa ativa" : n === 1 ? "1 pessoa ativa" : `${n} pessoas ativas`} para simular · somente leitura, com registro na auditoria</>
    : <>veja o sistema como outra pessoa vê — somente leitura</>;

  let lista;
  if (isLoading) lista = <EsqueletoDaLista />;
  else if (isError) lista = <ErroDaLista onRetry={() => refetch()} tentando={isFetching} />;
  else if (ativos.length === 0) lista = <NinguemParaSimular podeCadastrar={hasPermission(me, "canCreateUsers")} />;
  else if (candidates.length === 0) lista = <SemResultado busca={search} onLimpar={limpar} />;
  else lista = (
    <ListaDePessoas
      pessoas={candidates}
      bloqueado={!!simulation?.active}
      iniciandoId={startingId}
      onEscolher={escolher}
    />
  );

  return (
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      <PageHeader
        variant="bar"
        title="Ver como usuário"
        className="mx-0 mt-0 gap-x-3 max-sm:static"
        subtitle={subtitulo}
      />
      <div className="px-[var(--page-gutter)] pt-5 pb-8">
        <div className="sim-pagina max-w-[1560px] mx-auto flex flex-col gap-4">
          {simulation?.active ? <JaSimulando nome={toTitleCase(me?.name)} /> : <ComoFunciona />}

          {carregado && ativos.length > 0 && (
            <div className="sim-ferramentas flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2.5 sm:gap-y-2">
              <BuscaDaLista
                valor={search}
                onChange={setSearch}
                rotulo="Buscar usuário por nome ou e-mail"
                placeholder="Nome ou e-mail"
                testid="sim-busca"
              />
              <div className="pas-rolagem-x -mx-[var(--page-gutter)] px-[var(--page-gutter)] sm:mx-0 sm:px-0">
                <div
                  role="radiogroup"
                  aria-label="Perfil"
                  className="inline-flex items-center h-[34px] p-[3px] gap-0.5 rounded-lg border border-border bg-card"
                  data-testid="sim-perfis"
                  onKeyDown={(e) => {
                    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
                    e.preventDefault();
                    const ids: FiltroPerfil[] = ["todos", ...PERFIS.map((p) => p.value)];
                    const i = Math.max(0, ids.indexOf(perfil));
                    const passo = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
                    const prox = ids[(i + passo + ids.length) % ids.length];
                    setPerfil(prox);
                    (e.currentTarget.querySelector(`[data-testid="sim-perfil-${prox}"]`) as HTMLButtonElement | null)?.focus();
                  }}
                >
                  {[{ value: "todos" as const, label: "Todos" }, ...PERFIS].map((p) => {
                    const marcado = perfil === p.value;
                    const qtd = porPerfil[p.value] ?? 0;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        role="radio"
                        aria-checked={marcado}
                        tabIndex={marcado ? 0 : -1}
                        onClick={() => setPerfil(p.value)}
                        className={cn(
                          "sim-segmento pas-alvo inline-flex items-center gap-1.5 h-full px-2.5 rounded-md text-sm whitespace-nowrap",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          marcado ? "bg-brand-soft text-primary font-medium" : "text-slate-600 hover:bg-muted hover:text-foreground",
                        )}
                        data-testid={`sim-perfil-${p.value}`}
                      >
                        {p.label}
                        <span className={cn("text-2xs tabular-nums", marcado ? "text-primary/80" : "text-muted-foreground", qtd === 0 && !marcado && "opacity-60")}>{qtd}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {lista}

          {carregado && ativos.length > 0 && (
            <p className="m-0 px-0.5 text-xs text-muted-foreground" data-testid="sim-rodape">
              {candidates.length !== ativos.length && <>Mostrando {candidates.length} de {ativos.length}. </>}
              Você não aparece na lista
              {foraDaLista > 0 && <>, nem {foraDaLista === 1 ? "1 conta inativa, pendente ou recusada" : `${foraDaLista} contas inativas, pendentes ou recusadas`}</>}
              {" "}— só contas ativas e aprovadas podem ser simuladas.
            </p>
          )}
        </div>
      </div>

      <ConfirmarSimulacao
        alvo={alvo}
        iniciando={startingId !== null}
        erro={erroAoIniciar}
        onConfirmar={() => { if (alvo) iniciar(alvo); }}
        onFechar={fechar}
      />
    </div>
  );
}
