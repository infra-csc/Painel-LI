/**
 * Aviso no topo do registro da vaga (modal da passagem/hospedagem): o que o
 * aprovador mudou depois que a compra foi registrada, e o "Já atuei" ali
 * mesmo — quem abriu a passagem para remarcar fecha o aviso sem voltar à lista.
 *
 * Lê a MESMA consulta do bloco da tela (sem requisição a mais).
 */
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { MudancasDoAviso } from "./mudancas-do-aviso";
import { QuemPediuEAprovou } from "./item-do-aviso";
import { JaAtuei } from "./ja-atuei";
import { useAvisosPendentes, type TipoDeAviso } from "./use-avisos-de-alteracao";

export function AvisoDaVaga({ tipo, teamInclusionId, className }: {
  tipo: TipoDeAviso;
  teamInclusionId: string;
  className?: string;
}) {
  const { porVaga } = useAvisosPendentes(tipo);
  const avisos = porVaga.get(teamInclusionId) ?? [];
  if (avisos.length === 0) return null;
  const oQue = tipo === "passagem" ? "a passagem" : "a hospedagem";
  return (
    <div
      role="region"
      aria-label="Alteração aprovada para remarcar"
      className={cn("pas-entra border-b border-warning/30 bg-warning-soft/50", className)}
      data-testid="aviso-da-vaga"
    >
      {avisos.map((a, i) => (
        <div key={a.id} className={cn("flex flex-col gap-3 px-6 py-3 sm:flex-row sm:items-start", i > 0 && "border-t border-warning/25")}>
          <span className="hidden sm:flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-card text-warning-strong shadow-1">
            <CalendarClock className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="m-0 text-sm font-semibold text-foreground">
              Alteração aprovada depois do registro — confira {oQue}
            </p>
            <MudancasDoAviso mudancas={a.mudancas} />
            <QuemPediuEAprovou aviso={a} />
          </div>
          <JaAtuei aviso={a} className="self-start" />
        </div>
      ))}
    </div>
  );
}

export default AvisoDaVaga;
