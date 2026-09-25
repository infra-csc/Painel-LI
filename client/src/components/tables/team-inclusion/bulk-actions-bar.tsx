/**
 * Barra de ações em lote da tabela de inclusões (25/09 — extraída da tabela).
 */
import { Ban, LayoutGrid, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BulkActionsBar({ selectedCount, selectedVisibleCount, onBatchDays, onBulkDelete, onBulkCancel }: {
  selectedCount: number;
  selectedVisibleCount: number;
  onBatchDays: () => void;
  onBulkDelete: () => void;
  onBulkCancel: () => void;
}) {
  return (
    <div className="bg-brand-soft border border-primary/25 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-primary">
          {selectedCount} inclusão(ões) selecionada(s)
          {selectedCount > selectedVisibleCount && (
            <span className="ml-1 font-normal text-primary/80">
              ({selectedCount - selectedVisibleCount} fora dos filtros atuais)
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onBatchDays}
            className="border-primary text-primary hover:bg-brand-soft gap-1.5"
            data-testid="button-bulk-diarias"
          >
            <LayoutGrid className="w-4 h-4" aria-hidden="true" />
            Editar diárias
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onBulkDelete}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
            Excluir Selecionadas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkCancel}
            className="border-warning-strong text-warning hover:bg-warning-soft"
            data-testid="button-bulk-cancel"
          >
            <Ban className="w-4 h-4 mr-2" aria-hidden="true" />
            Cancelar Selecionadas
          </Button>
        </div>
      </div>
    </div>
  );
}
