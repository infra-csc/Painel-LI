import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { getRoleLabel, type UserRole } from "@/lib/role-utils";
import { Eye, Loader2, LogOut } from "lucide-react";

/** Altura fixa do banner — usada pelo MainLayout/Sidebar para abrir espaço. */
export const SIMULATION_BANNER_H = 40;

/**
 * Faixa global do Modo Simulação ("Ver como usuário"). Aparece em TODAS as
 * páginas enquanto o admin está vendo o sistema como outro usuário.
 * Sair: POST /api/simulation/stop → limpa o cache do React Query → reload
 * completo em "/" para reidratar tudo como o admin real.
 *
 * 07/10: etiqueta "Simulação" à esquerda (o estado tem nome), texto curto no
 * celular e botão sólido — antes era um contorno branco quase invisível.
 */
export default function SimulationBanner() {
  const { user, simulation } = useAuth();
  const [saindo, setSaindo] = useState(false);

  if (!simulation?.active) return null;

  const sair = async () => {
    if (saindo) return;
    setSaindo(true);
    try {
      await fetch("/api/simulation/stop", { method: "POST", credentials: "include" });
    } catch {
      // Mesmo que o stop falhe, o reload abaixo reflete o estado real do
      // servidor (se a simulação seguir ativa, o banner volta).
    }
    queryClient.clear();
    window.location.href = "/";
  };

  const roleLabel = getRoleLabel((user?.role || "production") as UserRole);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[60] flex items-center gap-2 sm:gap-3 px-2 sm:px-4 bg-primary-hover text-white shadow-2"
      style={{ height: SIMULATION_BANNER_H }}
    >
      <span className="hidden sm:inline-flex items-center gap-1.5 h-6 px-2 shrink-0 rounded-md bg-white/15 text-2xs font-semibold uppercase tracking-[0.08em]">
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        Simulação
      </span>
      <Eye className="sm:hidden h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="m-0 flex-1 min-w-0 text-xs sm:text-[13px] truncate sm:text-center">
        <span className="hidden md:inline">Você está vendo o sistema como </span>
        <span className="md:hidden">Vendo como </span>
        <b className="font-semibold">{user?.name}</b>
        <span className="hidden sm:inline text-white/80"> ({roleLabel})</span>
        <span className="hidden md:inline text-white/80"> — somente leitura</span>
      </p>
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        aria-busy={saindo}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 sm:px-3 shrink-0 rounded-md border-0 bg-white text-primary text-xs font-semibold cursor-pointer transition-colors hover:bg-brand-soft disabled:opacity-70 disabled:cursor-wait outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-hover"
      >
        {saindo
          ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          : <LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
        {saindo ? "Saindo…" : "Sair da simulação"}
      </button>
    </div>
  );
}
