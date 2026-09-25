/**
 * Escalação por Grade — prévia dos registros e ações (rascunho + criar)
 * (25/09, extraídas do formulário).
 */
import { Download, Save } from "lucide-react";
import { formatDiarias } from "@/lib/utils";
import { PastEventBanner } from "@/lib/event-lock";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { formatDateForDisplay } from "./grid-types";
import type { GridSubmit } from "./use-grid-submit";

export function GridPreview({ processedRanges, previewGroups }: Pick<GridSubmit, "processedRanges" | "previewGroups">) {
  const records = processedRanges;
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-muted border-b border-border">
        <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">Prévia dos registros</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${records.length > 0 ? 'bg-brand-soft text-primary' : 'bg-muted text-muted-foreground'}`} aria-live="polite">
          {records.length} {records.length === 1 ? 'registro' : 'registros'}
        </span>
      </div>
      {/* Agrupada por função, sem altura máxima (nada fica escondido) */}
      <div>
        {records.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4 italic">Nenhum registro configurado ainda.</p>
        ) : (
          previewGroups.map((group, gi) => (
            <div key={group.functionId} className={gi > 0 ? 'border-t border-border' : ''}>
              <div className="flex items-center justify-between px-4 py-1.5 bg-surface-muted/70">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" aria-hidden="true" />
                  {group.functionName}
                </span>
                <span className="text-2xs text-muted-foreground tabular-nums">
                  {group.records.length} {group.records.length === 1 ? 'registro' : 'registros'}
                </span>
              </div>
              {group.records.map((range, index) => (
                <div key={`${group.functionId}-${index}`} className={`flex items-center justify-between gap-3 pl-8 pr-4 py-1.5 text-sm ${index % 2 === 1 ? 'bg-surface-muted/40' : 'bg-card'}`}>
                  <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{formatDiarias(range.dailyRate)}</span>
                  <span className="text-xs text-muted-foreground font-medium shrink-0 tabular-nums">
                    {formatDateForDisplay(range.startDate)} → {formatDateForDisplay(range.endDate)}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export interface GridActionsProps {
  onSaveDraft: () => void;
  onLoadDraft: () => void;
  onSubmit: () => void;
  isProcessing: boolean;
  recordsCount: number;
  selectedEventId: string;
  eventoEncerrado: boolean;
  motivoBloqueio: string | null | undefined;
  bannerMessage: string | null;
}

export function GridActions({ onSaveDraft, onLoadDraft, onSubmit, isProcessing, recordsCount, selectedEventId, eventoEncerrado, motivoBloqueio, bannerMessage }: GridActionsProps) {
  const disabled = isProcessing || recordsCount === 0 || !selectedEventId || eventoEncerrado;
  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSaveDraft}
          className="flex-1 h-9 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-surface-muted hover:border-slate-300 transition-colors bg-card"
          data-testid="button-save-draft"
        >
          <Save className="w-3.5 h-3.5" aria-hidden="true" />
          Salvar Rascunho
        </button>
        <button
          type="button"
          onClick={onLoadDraft}
          className="flex-1 h-9 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-surface-muted hover:border-slate-300 transition-colors bg-card"
          data-testid="button-load-draft"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Carregar Rascunho
        </button>
      </div>

      <PastEventBanner show={eventoEncerrado} message={bannerMessage} className="mb-2" />
      <MotivoDesabilitado motivo={motivoBloqueio ?? (!selectedEventId ? "Selecione o evento para criar as escalações" : undefined)} desabilitado={disabled}>
        <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="w-full h-11 flex items-center justify-center gap-2 text-primary-foreground text-sm font-semibold rounded-lg transition-all bg-primary hover:bg-primary-hover hover:-translate-y-0.5 shadow-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0"
        data-testid="button-save-grid"
      >
        <Save className="w-4 h-4" aria-hidden="true" />
        {isProcessing
          ? "Criando Escalações…"
          : eventoEncerrado
            ? (motivoBloqueio ?? "Evento encerrado — só o administrador altera")
            : !selectedEventId
              ? "Selecione o evento para criar"
              : `Criar ${recordsCount} Escalação(ões)`}
      </button>
      </MotivoDesabilitado>
    </div>
  );
}
