import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { getRoleLabel, type UserRole } from "@/lib/role-utils";

/** Altura fixa do banner — usada pelo MainLayout/Sidebar para abrir espaço. */
export const SIMULATION_BANNER_H = 40;

/**
 * Faixa global do Modo Simulação ("Ver como usuário"). Aparece em TODAS as
 * páginas enquanto o admin está vendo o sistema como outro usuário.
 * Sair: POST /api/simulation/stop → limpa o cache do React Query → reload
 * completo em "/" para reidratar tudo como o admin real.
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
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 sm:gap-3 px-3 bg-violet-700 text-white shadow-md"
      style={{ height: SIMULATION_BANNER_H }}
    >
      <span
        className="material-symbols-outlined select-none shrink-0"
        style={{ fontSize: 18, lineHeight: 1 }}
        aria-hidden="true"
      >
        visibility
      </span>
      <p className="m-0 text-xs sm:text-sm truncate">
        Você está vendo o sistema como <b>{user?.name}</b> ({roleLabel}) — somente leitura
      </p>
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        className="shrink-0 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 disabled:opacity-60 text-xs sm:text-sm font-semibold border border-white/30 transition-colors"
      >
        {saindo ? "Saindo..." : "Sair da simulação"}
      </button>
    </div>
  );
}
