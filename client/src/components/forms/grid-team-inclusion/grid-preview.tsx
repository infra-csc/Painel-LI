/**
 * Escalação por grade — prévia dos registros e ações (rascunho + criar)
 * (25/09, extraídas do formulário).
 *
 * 07/10 (redesenho): a prévia era uma linha por vaga (com 40 vagas, uma
 * coluna de 40 linhas antes do botão de criar). Agora é uma linha por função
 * com as vagas como etiquetas que quebram ("2 diárias · 09/10 → 10/10") —
 * nada fica escondido, só ocupa o espaço que precisa. As ações viram o
 * rodapé da montagem: rascunho (salvar, carregar, salvar sozinho) à
 * esquerda, discretos, e "Criar N vagas" à direita, a única ação cheia.
 */
import { Download, Loader2, Save, Users } from "lucide-react";
import { formatDiarias } from "@/lib/utils";
import { PastEventBanner } from "@/lib/event-lock";
import { Switch } from "@/components/ui/switch";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { formatDateForDisplay } from "./grid-types";
import type { GridSubmit } from "./use-grid-submit";

export function GridPreview({ processedRanges, previewGroups }: Pick<GridSubmit, "processedRanges" | "previewGroups">) {
  const records = processedRanges;
  return (
    <section className="rounded-lg border border-border overflow-hidden" aria-labelledby="inc-previa-titulo">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2 bg-surface-muted border-b border-border">
        <h3 id="inc-previa-titulo" className="m-0 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Prévia das vagas</h3>
        <span className={`inline-flex items-center h-[22px] px-2 rounded-full text-xs font-semibold tabular-nums ${records.length > 0 ? 'bg-brand-soft text-primary' : 'bg-muted text-muted-foreground'}`} aria-live="polite">
          {records.length} {records.length === 1 ? 'vaga' : 'vagas'}
        </span>
      </div>
      {/* Agrupada por função, sem altura máxima (nada fica escondido) */}
      {records.length === 0 ? (
        <p className="m-0 px-4 py-4 text-center text-sm text-muted-foreground">
          Nenhuma vaga ainda — preencha quantas pessoas trabalham em cada dia.
        </p>
      ) : (
        <ul className="m-0 p-0 list-none divide-y divide-border">
          {previewGroups.map((group) => (
            <li key={group.functionId} className="pas-entra grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-3.5 py-2.5">
              <div className="flex items-baseline justify-between sm:justify-start gap-2 min-w-0">
                <span className="text-sm font-semibold text-foreground truncate" title={group.functionName}>{group.functionName}</span>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {group.records.length} {group.records.length === 1 ? 'vaga' : 'vagas'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.records.map((range, index) => (
                  <span key={`${group.functionId}-${index}`} className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md border border-border bg-card text-xs text-slate-700 tabular-nums">
                    <span className="font-semibold text-foreground">{formatDiarias(range.dailyRate)}</span>
                    <span className="text-muted-foreground">{formatDateForDisplay(range.startDate)} → {formatDateForDisplay(range.endDate)}</span>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
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
  /** Salvar rascunho sozinho (auto-save de 1 hora). Opcional: sem ele o interruptor não aparece. */
  autoSave?: boolean;
  setAutoSave?: (v: boolean) => void;
}

const BOTAO_RASCUNHO = "pas-alvo inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function GridActions({ onSaveDraft, onLoadDraft, onSubmit, isProcessing, recordsCount, selectedEventId, eventoEncerrado, motivoBloqueio, bannerMessage, autoSave, setAutoSave }: GridActionsProps) {
  const disabled = isProcessing || recordsCount === 0 || !selectedEventId || eventoEncerrado;
  return (
    <div className="flex flex-col gap-2.5">
      <PastEventBanner show={eventoEncerrado} message={bannerMessage} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Rascunho: guardar o trabalho, nunca competir com "Criar". */}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <button type="button" onClick={onSaveDraft} className={BOTAO_RASCUNHO} data-testid="button-save-draft">
            <Save className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            Salvar rascunho
          </button>
          <button type="button" onClick={onLoadDraft} className={BOTAO_RASCUNHO} data-testid="button-load-draft">
            <Download className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            Carregar rascunho
          </button>
          {setAutoSave && (
            <label className="inline-flex items-center gap-2 h-9 pl-2 pr-1 text-xs text-muted-foreground cursor-pointer select-none" title="Guarda a grade sozinho, 2 s depois da última mudança; vale por 1 hora">
              <Switch checked={!!autoSave} onCheckedChange={(v) => setAutoSave(v)} className="scale-[.8] origin-left" aria-label="Salvar rascunho automaticamente" />
              Salvar sozinho
            </label>
          )}
        </div>

        <MotivoDesabilitado motivo={motivoBloqueio ?? (!selectedEventId ? "Selecione o evento para criar as escalações" : recordsCount === 0 ? "Preencha a grade: nenhuma vaga ainda" : undefined)} desabilitado={disabled} className="inline-flex w-full sm:w-auto">
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled}
            aria-busy={isProcessing}
            className="inc-criar w-full sm:w-auto sm:min-w-[220px] h-10 px-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-1 transition-[background-color,transform,box-shadow] hover:bg-primary-hover active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="button-save-grid"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Users className="w-4 h-4" aria-hidden="true" />}
            {isProcessing
              ? "Criando vagas…"
              : eventoEncerrado
                ? (motivoBloqueio ?? "Evento encerrado — só o administrador altera")
                : !selectedEventId
                  ? "Selecione o evento para criar"
                  : recordsCount === 0
                    ? "Nenhuma vaga para criar"
                    : `Criar ${recordsCount} ${recordsCount === 1 ? "vaga" : "vagas"}`}
          </button>
        </MotivoDesabilitado>
      </div>
    </div>
  );
}
