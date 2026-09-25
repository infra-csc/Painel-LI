/**
 * Diálogos auxiliares do Realizado — 25/09 (modularização).
 * `DeleteActualDialog` (confirmar remoção) e `SplitDialog` (divisão de vaga,
 * envoltório do `SplitVagaModal` que calcula os dias já tomados pelos filhos).
 */
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SplitVagaModal } from "@/components/split-vaga-modal";
import type { BudgetActual, Collaborator, Event, TeamInclusion } from "@shared/schema";

export interface DeleteActualDialogProps {
  confirmDeleteId: string | null;
  onClose: () => void;
  isPending: boolean;
  onConfirm: (id: string) => void;
}

export function DeleteActualDialog({ confirmDeleteId, onClose, isPending, onConfirm }: DeleteActualDialogProps) {
  return (
    <Dialog open={!!confirmDeleteId} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar Remoção</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          Tem certeza que deseja remover esta prestação? Esta ação não pode ser desfeita.
        </p>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={() => confirmDeleteId && onConfirm(confirmDeleteId)}
            disabled={isPending}
          >
            Remover
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface SplitDialogProps {
  splittingItem: BudgetActual | null;
  budgetActual: BudgetActual[] | undefined;
  collaborators: Collaborator[] | undefined;
  teamInclusion: TeamInclusion | undefined;
  selectedEvent: Event | undefined;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (id: string, payload: Record<string, unknown>) => void;
}

/** Split Escalação Modal. */
export function SplitDialog({ splittingItem, budgetActual, collaborators, teamInclusion, selectedEvent, isPending, onClose, onConfirm }: SplitDialogProps) {
  if (!splittingItem) return null;
  const takenDays = (budgetActual || [])
    .filter(a => a.splitParentId === splittingItem.id)
    .flatMap(a => a.workedDays || []);
  return (
    <SplitVagaModal
      item={splittingItem}
      collaborators={collaborators || []}
      teamInclusion={teamInclusion}
      eventStartDate={selectedEvent?.startDate}
      eventEndDate={selectedEvent?.endDate}
      takenDays={takenDays}
      onClose={onClose}
      isPending={isPending}
      onConfirm={(payload) => { onConfirm(splittingItem.id, payload); }}
    />
  );
}
