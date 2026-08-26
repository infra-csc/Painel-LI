import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getRoleLabel, type UserRole } from "@/lib/role-utils";

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
 */

const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: "bg-violet-100 text-violet-700",
  production: "bg-orange-100 text-orange-700",
  function_area: "bg-sky-100 text-sky-700",
  purchasing: "bg-amber-100 text-amber-700",
  financial: "bg-emerald-100 text-emerald-700",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function SimulationPage() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);

  const { data: users, isLoading, isError } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Só usuários ativos/aprovados fazem sentido (o servidor recusa os demais).
  // O próprio admin fica de fora — simular a si mesmo não muda nada.
  const candidates = useMemo(() => {
    const list = (users ?? []).filter(
      (u) => u.status === "approved" && u.isActive !== false && u.id !== me?.id,
    );
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (u) =>
            (u.name ?? "").toLowerCase().includes(q) ||
            (u.email ?? "").toLowerCase().includes(q),
        )
      : list;
    return [...filtered].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));
  }, [users, search, me?.id]);

  const iniciar = async (alvo: User) => {
    if (startingId) return;
    setStartingId(alvo.id);
    try {
      await apiRequest("POST", "/api/simulation/start", { userId: alvo.id });
      // Zera o cache ANTES do reload: nenhuma query em voo reaproveita dados
      // do admin. O reload em "/" leva à home do usuário simulado.
      queryClient.clear();
      window.location.href = "/";
    } catch (error: any) {
      toast({
        title: "Não foi possível iniciar a simulação",
        description: error?.body?.message ?? "Tente novamente em instantes.",
        variant: "destructive",
      });
      setStartingId(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-violet-600" style={{ fontSize: 28 }} aria-hidden="true">
            visibility
          </span>
          Ver como usuário
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Escolha um usuário para ver o sistema inteiro exatamente como ele vê —
          menu, telas, permissões e dados.
        </p>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm text-violet-800">
        <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18, marginTop: 1 }} aria-hidden="true">
          lock
        </span>
        <p className="m-0">
          A simulação é <b>somente leitura</b> e fica registrada na auditoria.
          Enquanto ela estiver ativa, nenhuma ação pode ser feita em nome do
          usuário simulado.
        </p>
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-border">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <span
              className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              style={{ fontSize: 18 }}
              aria-hidden="true"
            >
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              aria-label="Buscar usuário por nome ou e-mail"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        ) : isError ? (
          <p className="p-6 text-sm text-red-600">
            Erro ao carregar os usuários. Recarregue a página e tente de novo.
          </p>
        ) : candidates.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {search.trim()
              ? "Nenhum usuário ativo encontrado para essa busca."
              : "Nenhum outro usuário ativo para simular."}
          </p>
        ) : (
          <ul className="divide-y divide-border m-0 p-0 list-none">
            {candidates.map((u) => {
              const roleLabel = getRoleLabel((u.role || "production") as UserRole);
              const badgeClass = ROLE_BADGE_CLASSES[u.role] ?? "bg-slate-100 text-slate-600";
              const starting = startingId === u.id;
              return (
                <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary text-xs font-bold shrink-0">
                    {initials(u.name || u.email || "?")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="m-0 text-sm font-semibold text-slate-800 truncate">{u.name}</p>
                    <p className="m-0 text-xs text-slate-400 truncate">{u.email}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${badgeClass}`}>
                    {roleLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => iniciar(u)}
                    disabled={startingId !== null}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white transition-colors"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden="true">
                      visibility
                    </span>
                    {starting ? "Iniciando..." : "Ver como"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
