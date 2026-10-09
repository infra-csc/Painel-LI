/**
 * Diálogos auxiliares do Realizado — 25/09 (modularização).
 * `DeleteActualDialog` (confirmar remoção) e `SplitDialog` (divisão de vaga,
 * envoltório do `SplitVagaModal` que calcula os dias já tomados pelos filhos).
 */
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SplitVagaModal } from "@/components/split-vaga-modal";
import type { BudgetActual, Collaborator, Event, TeamInclusion } from "@shared/schema";

export interface DeleteActualDialogProps {
  confirmDeleteId: string | null;
  /** Quem e o quê — o diálogo diz o que vai sumir (08/10). */
  nome?: string;
  detalhe?: string;
  onClose: () => void;
  isPending: boolean;
  onConfirm: (id: string) => void;
}

/** Confirmar remoção (08/10: diz de quem é, o valor, e mostra "Removendo…"). */
export function DeleteActualDialog({ confirmDeleteId, nome, detalhe, onClose, isPending, onConfirm }: DeleteActualDialogProps) {
  return (
    <AlertDialog open={!!confirmDeleteId} onOpenChange={(v) => { if (!v && !isPending) onClose(); }}>
      <AlertDialogContent className="max-w-[420px] rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Remover a prestação{nome ? ` de ${nome}` : ""}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-slate-600">
              {detalhe && <p className="m-0 tabular-nums">{detalhe}</p>}
              <p className="m-0">A prestação sai do Realizado deste evento. Esta ação não pode ser desfeita.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-lg" disabled={isPending}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            className="rounded-lg gap-1.5 bg-danger hover:bg-danger/90 text-white"
            onClick={() => confirmDeleteId && onConfirm(confirmDeleteId)}
            disabled={isPending}
            data-testid="realizado-confirmar-remocao"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Trash2 className="w-4 h-4" aria-hidden="true" />}
            {isPending ? "Removendo…" : "Remover"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
