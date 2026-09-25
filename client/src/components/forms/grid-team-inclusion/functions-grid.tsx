/**
 * Escalação por Grade — a grade função × dia com seus controles (25/09,
 * extraída do formulário): cabeçalho com resumo e ações, ajuda, aviso de
 * passagem sem voo, tabela e o botão de adicionar função.
 */
import { AlertTriangle, HelpCircle, Plus, Ticket, Trash2, Upload } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { GridRow } from "./grid-row";
import { formatDateHeader, type FunctionRow } from "./grid-types";
import type { GridRows } from "./use-grid-rows";
import type { GridSubmit } from "./use-grid-submit";

export interface FunctionsGridProps {
  grid: GridRows;
  gridSummary: GridSubmit["gridSummary"];
  rowsMissingFlightDate: FunctionRow[];
  showHelp: boolean;
  onToggleHelp: () => void;
  autoSave: boolean;
  setAutoSave: (v: boolean) => void;
  onOpenPaste: () => void;
}

export function FunctionsGrid({ grid, gridSummary, rowsMissingFlightDate, showHelp, onToggleHelp, autoSave, setAutoSave, onOpenPaste }: FunctionsGridProps) {
  const { functionRows, dates, selectedRows, toggleSelectAll, deleteSelectedRows, openFunctionSelect, copiedSchedule } = grid;
  return (
    <>
      {/* Header com controles */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-700">Grade de Inclusões</span>
          {/* Barra de resumo — atualiza a cada célula editada */}
          <span className="text-2xs text-muted-foreground tabular-nums" aria-live="polite">
            {gridSummary.funcoes} {gridSummary.funcoes === 1 ? 'função' : 'funções'}
            {' · '}{gridSummary.pessoasDia} pessoas-dia
            {' · '}{gridSummary.registros} {gridSummary.registros === 1 ? 'registro' : 'registros'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={onToggleHelp}
            className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border hover:border-slate-300 hover:bg-surface-muted rounded-lg transition-colors bg-card"
          >
            <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
            Ajuda
          </button>
          <button
            type="button"
            onClick={onOpenPaste}
            className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border hover:border-success/25 hover:text-success hover:bg-success-soft rounded-lg transition-colors bg-card"
          >
            <Upload className="w-3.5 h-3.5 text-success-strong" aria-hidden="true" />
            Colar Excel
          </button>
          {selectedRows.size > 0 && (
            <button
              type="button"
              onClick={deleteSelectedRows}
              className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-danger border border-danger/25 hover:bg-danger-soft rounded-lg transition-colors bg-card"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Excluir ({selectedRows.size})
            </button>
          )}
          <button
            type="button"
            onClick={openFunctionSelect}
            className="h-8 px-3 flex items-center gap-1.5 text-xs font-semibold text-primary-foreground rounded-lg transition-colors bg-primary hover:bg-primary-hover shadow-1"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Adicionar Função
          </button>
        </div>
      </div>

      {/* Seção de Ajuda */}
      <Collapsible open={showHelp}>
        <CollapsibleContent>
          <div className="bg-brand-soft p-4 rounded-lg border border-primary/25">
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-semibold text-primary mb-2">Como preencher</h4>
                <ul className="space-y-1 text-primary">
                  <li><strong>Célula do dia</strong>: número de pessoas daquela função trabalhando no dia (– = ninguém).</li>
                  <li><strong>Registros</strong>: cada pessoa vira 1 registro com os dias em que trabalha — veja a prévia abaixo da grade.</li>
                  <li><strong>Passagem / Hospedagem</strong>: marque quando a função precisa de logística; os dados de voo valem para toda a linha.</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-primary mb-2">Recursos</h4>
                <ul className="space-y-1 text-primary">
                  <li><strong>Menu de ações (⋯)</strong>: duplicar a função, copiar/colar dados de viagem, remover.</li>
                  <li><strong>Colar Excel</strong>: cola linhas copiadas de uma planilha (formato indicado no modal).</li>
                  <li><strong>Rascunho</strong>: salve e carregue a grade depois; o auto-save guarda por 1 hora.</li>
                  <li><strong>Regerar grade</strong>: mudar o período mantém os dias que continuam.</li>
                </ul>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-primary/25">
              <div className="flex items-center gap-4 text-xs text-primary">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={autoSave}
                    onCheckedChange={(checked) => setAutoSave(checked === true)}
                    className="w-3 h-3"
                  />
                  Auto-salvar ativo
                </label>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
      {/* Aviso: passagem marcada sem data de voo */}
      {rowsMissingFlightDate.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            {rowsMissingFlightDate.length === 1
              ? <>A função <strong>{rowsMissingFlightDate[0].functionName}</strong> está marcada com passagem mas não tem data de voo (ida e retorno).</>
              : <>{rowsMissingFlightDate.length} funções estão marcadas com passagem sem data de voo (ida e retorno): <strong>{rowsMissingFlightDate.map(r => r.functionName).join(', ')}</strong>.</>}
          </span>
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto max-h-[550px]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-muted sticky top-0">
              <tr>
                <th scope="col" className="px-2 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-12 min-w-[3rem] sticky left-0 bg-surface-muted z-20">
                  <Checkbox
                    checked={selectedRows.size === functionRows.length && functionRows.length > 0}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Selecionar todas"
                  />
                </th>
                <th scope="col" className="px-3 py-2 text-left border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-[180px] min-w-[180px] max-w-[180px] sticky left-12 bg-surface-muted z-20">Função</th>
                <th scope="col" className="px-3 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-20">
                  <div className="flex items-center justify-center gap-1">
                    <Ticket className="w-3 h-3" aria-hidden="true" />
                    <span>Passagem</span>
                  </div>
                </th>
                <th scope="col" className="px-3 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-20">
                  <div className="flex items-center justify-center gap-1">
                    🏨
                    <span>Hospedagem</span>
                  </div>
                </th>
                <th scope="col" className="px-3 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-24">Data Voo Ida</th>
                <th scope="col" className="px-3 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold min-w-[120px]">Horário Chegada Sugerido</th>
                <th scope="col" className="px-3 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-24">Data Voo Retorno</th>
                <th scope="col" className="px-3 py-2 text-center border-r border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold min-w-[120px]">Horário Partida Sugerido</th>
                {dates.map(date => {
                  const { date: d, dayName, isWeekend } = formatDateHeader(date);
                  return (
                    <th scope="col" key={date} className={`px-2 py-2 text-center border-r border-border text-2xs uppercase tracking-widest font-semibold w-16 ${isWeekend ? 'bg-warning-soft/60 text-warning-strong' : 'bg-brand-soft/50 text-muted-foreground'}`}>
                      <div className="leading-none font-bold">{d}</div>
                      <div className="text-2xs mt-0.5 opacity-70 normal-case tracking-normal">{dayName}</div>
                    </th>
                  );
                })}
                <th scope="col" className="px-2 py-2 text-center border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold w-16">Ações</th>
              </tr>
            </thead>
            <tbody>
              {functionRows.map((row, rowIdx) => (
                <GridRow
                  key={row.functionId} row={row} rowIdx={rowIdx} dates={dates}
                  selected={selectedRows.has(row.functionId)} hasCopiedSchedule={!!copiedSchedule}
                  toggleRowSelection={grid.toggleRowSelection} updateNeedsTicket={grid.updateNeedsTicket} updateNeedsAccommodation={grid.updateNeedsAccommodation}
                  updateTravelInfo={grid.updateTravelInfo} updateDailyRate={grid.updateDailyRate}
                  duplicateFunction={grid.duplicateFunction} duplicateScheduleOnly={grid.duplicateScheduleOnly}
                  copyScheduleData={grid.copyScheduleData} pasteScheduleData={grid.pasteScheduleData} removeFunction={grid.removeFunction}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Botão para adicionar função */}
      <button
        type="button"
        onClick={openFunctionSelect}
        disabled={dates.length === 0}
        className="border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-brand-soft/60 rounded-xl w-full py-2.5 text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        Adicionar Função à Grade
      </button>
    </>
  );
}
