import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { toTitleCase } from "@/lib/format";
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
 *
 * 08/10: sair usa o `apiRequest` (status conferido): só recarrega no sucesso;
 * se o servidor recusar ou a rede cair, o botão volta e um toast diz o porquê
 * (antes o erro era engolido e o reload fingia que tinha saído). A faixa mostra
 * o nome formatado e há quanto tempo a simulação começou.
 */

/** "há 5 min", "há 1 h 20 min" — desde o início da simulação. */
export function tempoDeSimulacao(desde: string | null | undefined, agora: number = Date.now()): string | null {
  if (!desde) return null;
  const inicio = new Date(desde).getTime();
  if (Number.isNaN(inicio)) return null;
  const min = Math.max(0, Math.floor((agora - inicio) / 60_000));
  if (min < 1) return "há menos de 1 min";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `há ${h} h ${m} min` : `há ${h} h`;
}
export default function SimulationBanner() {
  const { user, simulation } = useAuth();
  const { toast } = useToast();
  const [saindo, setSaindo] = useState(false);
  // Relógio de minuto em minuto para o "há N min".
  const [agora, setAgora] = useState(() => Date.now());
  const ativa = !!simulation?.active;
  useEffect(() => {
    if (!ativa) return;
    const t = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [ativa]);

  if (!simulation?.active) return null;

  const sair = async () => {
    if (saindo) return;
    setSaindo(true);
    try {
      await apiRequest("POST", "/api/simulation/stop");
    } catch (e) {
      setSaindo(false);
      toast({ variant: "destructive", title: "Não foi possível sair da simulação", description: apiErrorMessage(e, "Tente novamente.") });
      return;
    }
    queryClient.clear();
    window.location.href = "/";
  };

  const nome = toTitleCase(user?.name);
  const desde = tempoDeSimulacao(simulation.simulatedSince, agora);

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
        <b className="font-semibold" data-testid="sim-faixa-nome">{nome}</b>
        <span className="hidden sm:inline text-white/80"> ({roleLabel})</span>
        <span className="hidden md:inline text-white/80"> — somente leitura</span>
        {desde && <span className="hidden lg:inline text-white/80" data-testid="sim-faixa-desde"> · começou {desde}</span>}
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
