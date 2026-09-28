/**
 * Passo 1 do "Dividir escalação" (25/09 — extraído de split-vaga-modal.tsx):
 * faixa "Dividindo escalação de", escolha do colaborador, grade de dias,
 * validações e o rodapé Cancelar / Próximo.
 */
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { BudgetActual, Collaborator } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { cn, fixEncoding } from "@/lib/utils";
import { capitalizeName } from "./split-shared";
import { CollabPicker } from "./collab-picker";
import { DayGrid } from "./day-grid";
import type { SplitState } from "./use-split-state";

function ContextBanner({ item, collaborators, s }: { item: BudgetActual; collaborators: Collaborator[]; s: SplitState }) {
  const originalCollab = collaborators.find(c => c.id === item.collaboratorId);
  const originalName = originalCollab
    ? capitalizeName(fixEncoding(originalCollab.fullName || ""))
    : "Colaborador original";
  const totalDays = s.parentWorkedDays.length;
  const selCount = s.selectedDays.size;
  const remCount = totalDays - selCount;
  return (
    <div className="rounded-xl border border-primary/25 bg-brand-soft px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-sm font-bold bg-primary-hover">
        {fixEncoding(originalCollab?.fullName || "?").charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-2xs font-semibold text-primary uppercase tracking-wide m-0 mb-0.5">Dividindo escalação de</p>
        <p className="text-sm font-semibold text-primary m-0 truncate">{originalName}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-center pl-3 border-l border-primary/25">
          <p className="text-2xs font-semibold text-primary/70 uppercase tracking-wide m-0">Total</p>
          <p className="text-xl font-bold text-primary m-0 leading-tight">{totalDays}</p>
          <p className="text-2xs text-primary/70 m-0">{totalDays === 1 ? 'dia' : 'dias'}</p>
        </div>
        {selCount > 0 && (
          <div className="text-center pl-3 border-l border-primary/25">
            <p className="text-2xs font-semibold text-primary/70 uppercase tracking-wide m-0">Para novo</p>
            <p className="text-xl font-bold text-primary m-0 leading-tight">{selCount}</p>
            <p className="text-2xs text-primary/70 m-0">{selCount === 1 ? 'dia' : 'dias'}</p>
          </div>
        )}
        {selCount > 0 && (
          <div className="text-center pl-3 border-l border-primary/25">
            <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide m-0">Resta</p>
            <p className={`text-xl font-bold m-0 leading-tight ${remCount === 0 ? 'text-danger-strong' : 'text-muted-foreground'}`}>{remCount}</p>
            <p className="text-2xs text-muted-foreground m-0">{remCount === 1 ? 'dia' : 'dias'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function StepCollaborator({ item, collaborators, takenDays, s }: { item: BudgetActual; collaborators: Collaborator[]; takenDays: string[]; s: SplitState }) {
  const { selectedCollabId, selectedDays, fechar, goToStep2, canGoNext } = s;
  return (
    <div className="flex flex-col gap-4 flex-1 overflow-y-auto px-6 py-5 bg-surface-muted">
      <ContextBanner item={item} collaborators={collaborators} s={s} />
      <CollabPicker s={s} />
      <DayGrid s={s} takenDays={takenDays} />

      {/* Validations */}
      {!selectedCollabId && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-danger-soft border border-danger/25 text-xs text-danger">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" /> Selecione um colaborador para continuar.
        </div>
      )}
      {selectedCollabId && selectedDays.size === 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-danger-soft border border-danger/25 text-xs text-danger">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" /> Selecione pelo menos 1 dia para o novo colaborador.
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-end gap-2.5 pt-1 border-t border-border flex-shrink-0">
        <Button variant="ghost" className="h-9 px-4 rounded-xl text-muted-foreground hover:text-slate-700" onClick={fechar}>Cancelar</Button>
        <Button
          onClick={goToStep2}
          disabled={!canGoNext}
          className={cn("h-9 px-5 rounded-xl text-white font-medium shadow-2 flex items-center gap-1.5", (canGoNext ? "bg-primary-hover" : undefined))}
        >
          Próximo <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
