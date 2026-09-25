/**
 * Cabeçalho do modal da vaga (25/09 — extraído do dialog): #ID, situação, nome
 * e a navegação ‹ › pela lista atual.
 *
 * O gradiente e o quadrado azul de 44px com sombra ocupavam a linha inteira
 * para dizer "Detalhes da Escalação", que é o que o próprio modal já é. O que
 * identifica o registro é o ID, o nome e a situação — e é isso que fica.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { DialogTitle } from "@/components/ui/dialog";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { getStatusBadge } from "../scaling-table";

export function DetailsHeader({ inclusion, nome, navIndex, navTotal, hasPrev, hasNext, onNavigate }: {
  inclusion: TeamInclusion | null;
  nome: string;
  navIndex: number;
  navTotal: number;
  hasPrev: boolean;
  hasNext: boolean;
  onNavigate: (direction: -1 | 1) => void;
}) {
  const navBtn = "w-8 h-8 rounded-lg border border-border bg-card text-muted-foreground hover:bg-surface-muted hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors";
  return (
    <div className="px-6 pt-4 pb-3.5 border-b border-border shrink-0 flex items-center gap-3 pr-14">
      <span className="font-mono text-xs text-muted-foreground tabular-nums shrink-0">
        #{inclusion?.inclusionNumber || "—"}
      </span>
      {inclusion && getStatusBadge(inclusion, "sm")}
      <div className="flex-1 min-w-0">
        <DialogTitle className="text-lg font-semibold text-foreground leading-tight m-0 p-0 truncate">{nome}</DialogTitle>
        <span className="sr-only">Detalhes da escalação</span>
      </div>
      {navTotal > 1 && navIndex >= 0 && (
        <div className="flex items-center gap-1 shrink-0" aria-label="Navegar entre escalações da lista">
          <MotivoDesabilitado motivo="Anterior (←)" desabilitado={!hasPrev}>
            <button type="button" onClick={() => onNavigate(-1)} disabled={!hasPrev} aria-label="Escalação anterior" className={navBtn} data-testid="button-nav-prev">
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
          </MotivoDesabilitado>
          <span className="text-2xs font-semibold text-muted-foreground tabular-nums px-1" data-testid="text-nav-position">
            {navIndex + 1} / {navTotal}
          </span>
          <MotivoDesabilitado motivo="Próxima (→)" desabilitado={!hasNext}>
            <button type="button" onClick={() => onNavigate(1)} disabled={!hasNext} aria-label="Próxima escalação" className={navBtn} data-testid="button-nav-next">
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </MotivoDesabilitado>
        </div>
      )}
    </div>
  );
}
