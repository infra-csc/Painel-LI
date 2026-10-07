/**
 * Cabeçalho do modal da vaga (25/09 — extraído do dialog): #ID, situação, nome
 * e a navegação ‹ › pela lista atual.
 *
 * O gradiente e o quadrado azul de 44px com sombra ocupavam a linha inteira
 * para dizer "Detalhes da escalação", que é o que o próprio modal já é. O que
 * identifica o registro é o ID, o nome e a situação — e é isso que fica.
 *
 * 07/10: a segunda linha diz DE QUE vaga se trata (função · evento · período ·
 * diárias) e acompanha todas as abas — em Passagem ou Histórico a pessoa
 * perdia de vista a vaga que estava olhando. No celular o nome ganha a linha
 * inteira (era cortado em "Rodr…" pela navegação).
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { DialogTitle } from "@/components/ui/dialog";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { formatDateRange, formatDiarias } from "@/lib/utils";
import { getStatusBadge } from "../scaling-table";

export function DetailsHeader({ inclusion, nome, contexto, navIndex, navTotal, hasPrev, hasNext, onNavigate }: {
  inclusion: TeamInclusion | null;
  nome: string;
  /** "Função · Evento" da vaga. */
  contexto?: string;
  navIndex: number;
  navTotal: number;
  hasPrev: boolean;
  hasNext: boolean;
  onNavigate: (direction: -1 | 1) => void;
}) {
  const navBtn = "esc-alvo w-8 h-8 rounded-lg border border-border bg-card text-muted-foreground hover:bg-surface-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const periodo = inclusion?.scheduleStartDate || inclusion?.scheduleEndDate
    ? formatDateRange(inclusion.scheduleStartDate, inclusion.scheduleEndDate)
    : null;
  const linha2 = [contexto, periodo, inclusion ? formatDiarias(inclusion.dailyRates) : null].filter(Boolean).join(" · ");
  return (
    <div className="shrink-0 border-b border-border bg-card px-4 pt-3.5 pb-3 pr-12 sm:px-6 sm:pr-14">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="font-mono text-xs text-muted-foreground tabular-nums shrink-0" data-testid="text-modal-id">
          #{inclusion?.inclusionNumber || "—"}
        </span>
        {inclusion && getStatusBadge(inclusion, "sm")}
        <DialogTitle className="order-last basis-full min-w-0 text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground m-0 p-0 break-words sm:order-none sm:basis-0 sm:flex-1 sm:truncate">
          {nome}
        </DialogTitle>
        <span className="sr-only">Detalhes da escalação</span>
        {navTotal > 1 && navIndex >= 0 && (
          <div className="ml-auto flex items-center gap-1 shrink-0 sm:ml-0" role="group" aria-label="Navegar entre escalações da lista">
            <MotivoDesabilitado motivo="Anterior (←)" desabilitado={!hasPrev}>
              <button type="button" onClick={() => onNavigate(-1)} disabled={!hasPrev} aria-label="Escalação anterior" className={navBtn} data-testid="button-nav-prev">
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
            </MotivoDesabilitado>
            <span className="min-w-[52px] text-center text-2xs font-semibold text-muted-foreground tabular-nums px-1" data-testid="text-nav-position">
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
      {linha2 && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:truncate" title={linha2} data-testid="text-modal-contexto">{linha2}</p>
      )}
    </div>
  );
}
