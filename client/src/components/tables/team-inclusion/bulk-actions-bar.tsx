/**
 * Barra de ações em lote da tabela de inclusões (25/09 — extraída da tabela).
 *
 * 07/10 (redesenho): era uma faixa azul ACIMA da tabela que empurrava a lista
 * para baixo ao marcar a primeira linha. Agora é a barra de seleção da família
 * Passagens/Hospedagem: sobe do rodapé, fica grudada embaixo enquanto a lista
 * rola e diz quantas estão marcadas (e quantas o filtro esconde). As mesmas
 * três ações, na ordem do menos para o mais destrutivo, mais "Limpar seleção".
 */
import { Ban, LayoutGrid, Trash2, X } from "lucide-react";

export function BulkActionsBar({ selectedCount, selectedVisibleCount, onBatchDays, onBulkDelete, onBulkCancel, onClear }: {
  selectedCount: number;
  selectedVisibleCount: number;
  onBatchDays: () => void;
  onBulkDelete: () => void;
  onBulkCancel: () => void;
  onClear: () => void;
}) {
  const fora = selectedCount - selectedVisibleCount;
  const BOTAO = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60 shrink-0";
  return (
    <div className="sticky bottom-3 z-20 pas-sobe" role="region" aria-label="Ações da seleção" data-testid="barra-selecao-vagas">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-foreground text-background shadow-3 pl-4 pr-2 py-2">
        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2">
          <p className="m-0 text-sm font-semibold tabular-nums" aria-live="polite">
            {selectedCount} {selectedCount === 1 ? "vaga selecionada" : "vagas selecionadas"}
          </p>
          {fora > 0 && (
            <span className="text-xs text-background/70 tabular-nums">· {fora} fora dos filtros atuais</span>
          )}
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-xs font-medium text-background/75 hover:bg-background/10 hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60"
            data-testid="button-clear-selection"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar seleção
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={onBatchDays} className={`${BOTAO} bg-background/10 text-background hover:bg-background/20`} data-testid="button-bulk-diarias">
            <LayoutGrid className="w-4 h-4" aria-hidden="true" />Editar diárias
          </button>
          <button type="button" onClick={onBulkCancel} className={`${BOTAO} bg-background/10 text-background hover:bg-background/20`} data-testid="button-bulk-cancel">
            <Ban className="w-4 h-4" aria-hidden="true" />Cancelar selecionadas
          </button>
          <button type="button" onClick={onBulkDelete} className={`${BOTAO} bg-danger text-primary-foreground hover:bg-danger-strong`} data-testid="button-bulk-delete">
            <Trash2 className="w-4 h-4" aria-hidden="true" />Excluir selecionadas
          </button>
        </div>
      </div>
    </div>
  );
}
