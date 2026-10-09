/**
 * Escalação por grade — a grade função × dia com seus controles (25/09,
 * extraída do formulário): cabeçalho com resumo e ações, ajuda, aviso de
 * passagem sem voo, tabela e o botão de adicionar função.
 *
 * 07/10 (redesenho): barra da grade com o resumo vivo à esquerda e as ações à
 * direita (só "Adicionar função" tem peso); ajuda vira um painel de atalhos de
 * teclado (antes só o `title` da célula ensinava ↑/↓/Enter); os dias vêm logo
 * depois da função, com a coluna "Vagas" (quantas a linha cria) e o rodapé
 * "Pessoas por dia" grudado embaixo; a sugestão de voo fica à direita. As
 * ações chegam às linhas por uma ref — antes eram recriadas a cada render e
 * furavam o `memo`: cada tecla numa célula repintava a grade inteira.
 */
import { useMemo, useRef } from "react";
import { AlertTriangle, BedDouble, ClipboardPaste, Keyboard, Plane, Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { GridRow, type GridRowActions } from "./grid-row";
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

const TH = "px-1.5 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";
const BOTAO_SECUNDARIO = "pas-alvo inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border bg-card text-xs font-medium text-slate-700 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Tecla({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex items-center justify-center min-w-[22px] h-[20px] px-1 rounded border border-border border-b-2 bg-card font-sans text-2xs font-semibold text-slate-700">{children}</kbd>;
}

export function FunctionsGrid({ grid, gridSummary, rowsMissingFlightDate, showHelp, onToggleHelp, onOpenPaste }: FunctionsGridProps) {
  const { functionRows, dates, selectedRows, toggleSelectAll, deleteSelectedRows, openFunctionSelect, copiedSchedule } = grid;

  // Ações ESTÁVEIS para a linha memoizada: leem a versão mais recente da grade
  // pela ref. Sem isto, `memo(GridRow)` não segurava nada.
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const acoes = useMemo<GridRowActions>(() => ({
    toggleRowSelection: (id) => gridRef.current.toggleRowSelection(id),
    updateNeedsTicket: (id, v) => gridRef.current.updateNeedsTicket(id, v),
    updateNeedsAccommodation: (id, v) => gridRef.current.updateNeedsAccommodation(id, v),
    updateTravelInfo: (id, campo, v) => gridRef.current.updateTravelInfo(id, campo, v),
    updateDailyRate: (id, data, v) => gridRef.current.updateDailyRate(id, data, v),
    duplicateFunction: (id) => gridRef.current.duplicateFunction(id),
    duplicateScheduleOnly: (id) => gridRef.current.duplicateScheduleOnly(id),
    copyScheduleData: (id) => gridRef.current.copyScheduleData(id),
    pasteScheduleData: (id) => gridRef.current.pasteScheduleData(id),
    removeFunction: (id) => gridRef.current.removeFunction(id),
  }), []);

  // Rodapé "Pessoas por dia": soma de cada coluna.
  const porDia = useMemo(() => dates.map(d => functionRows.reduce((s, r) => s + (r.dailyRates[d] || 0), 0)), [dates, functionRows]);
  const todasMarcadas = selectedRows.size === functionRows.length && functionRows.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Barra da grade: resumo vivo + ações */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-foreground">Grade</span>
          {/* Resumo — atualiza a cada célula editada */}
          <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite" data-testid="resumo-grade">
            {gridSummary.funcoes} {gridSummary.funcoes === 1 ? 'função' : 'funções'}
            {' · '}{gridSummary.pessoasDia} pessoas-dia
            {' · '}{gridSummary.registros} {gridSummary.registros === 1 ? 'vaga' : 'vagas'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={onToggleHelp}
            aria-expanded={showHelp}
            className={`${BOTAO_SECUNDARIO} ${showHelp ? 'border-primary/40 text-primary bg-brand-soft hover:bg-brand-soft' : ''}`}
          >
            <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
            Atalhos e ajuda
          </button>
          <button type="button" onClick={onOpenPaste} className={BOTAO_SECUNDARIO}>
            <ClipboardPaste className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            Colar do Excel
          </button>
          {selectedRows.size > 0 && (
            <button
              type="button"
              onClick={deleteSelectedRows}
              className="pas-entra pas-alvo inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-danger/30 bg-card text-xs font-medium text-danger hover:bg-danger-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Excluir ({selectedRows.size})
            </button>
          )}
          <button
            type="button"
            onClick={openFunctionSelect}
            className="pas-alvo inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-primary/30 bg-brand-soft text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />
            Adicionar função
          </button>
        </div>
      </div>

      {/* Ajuda: como preencher + atalhos de teclado */}
      <Collapsible open={showHelp}>
        <CollapsibleContent>
          <div className="pas-entra grid gap-4 md:grid-cols-[1.1fr_1fr] rounded-lg border border-border bg-surface-muted px-4 py-3.5 text-xs leading-5 text-slate-700">
            <div>
              <h4 className="m-0 mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Como preencher</h4>
              <ul className="m-0 pl-4 space-y-1 list-disc marker:text-muted-foreground">
                <li><strong>Célula do dia</strong>: quantas pessoas daquela função trabalham no dia (– = ninguém).</li>
                <li><strong>Vagas</strong>: cada pessoa vira 1 vaga com os dias em que trabalha — veja a prévia abaixo da grade.</li>
                <li><strong>Passagem / Hospedagem</strong>: marque quando a função precisa de logística; os dados de voo valem para toda a linha.</li>
                <li><strong>Menu ⋯</strong>: duplicar a função, copiar/colar dados de viagem, remover.</li>
                <li><strong>Colar do Excel</strong>: cola linhas copiadas de uma planilha (formato no próprio diálogo).</li>
                <li><strong>Rascunho</strong>: salve e carregue a grade depois; o salvamento automático guarda por 1 hora.</li>
                <li><strong>Regerar grade</strong>: mudar o período mantém os dias que continuam.</li>
              </ul>
            </div>
            <div>
              <h4 className="m-0 mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Teclado, numa célula</h4>
              <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
                <dt className="flex gap-1"><Tecla>↑</Tecla><Tecla>↓</Tecla></dt><dd className="m-0">soma ou tira 1 (0 a 15)</dd>
                <dt className="flex gap-1"><Tecla>←</Tecla><Tecla>→</Tecla></dt><dd className="m-0">célula ao lado</dd>
                <dt className="flex gap-1"><Tecla>Enter</Tecla></dt><dd className="m-0">linha de baixo (<Tecla>Shift</Tecla> sobe)</dd>
                <dt className="flex gap-1"><Tecla>Ctrl</Tecla><Tecla>↑↓</Tecla></dt><dd className="m-0">linha de cima / de baixo</dd>
                <dt className="flex gap-1"><Tecla>Delete</Tecla></dt><dd className="m-0">zera a célula</dd>
              </dl>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Aviso: passagem marcada sem data de voo */}
      {rowsMissingFlightDate.length > 0 && (
        <div role="status" className="pas-entra flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs leading-5 text-warning">
          <AlertTriangle className="w-3.5 h-3.5 mt-[3px] shrink-0 text-warning-strong" aria-hidden="true" />
          <span>
            {rowsMissingFlightDate.length === 1
              ? <>A função <strong>{rowsMissingFlightDate[0].functionName}</strong> está marcada com passagem mas não tem data de voo (ida e retorno).</>
              : <>{rowsMissingFlightDate.length} funções estão marcadas com passagem sem data de voo (ida e retorno): <strong>{rowsMissingFlightDate.map(r => r.functionName).join(', ')}</strong>.</>}
          </span>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <div className="inc-grade-rolagem overflow-auto max-h-[min(560px,calc(100dvh-var(--sticky-top,3.5rem)-12rem))]">
          <table className="inc-grade w-full min-w-[720px] text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr>
                <th scope="col" className={`${TH} inc-grade-fixa-cab text-center sticky left-0 z-30 w-10 min-w-[2.5rem]`}>
                  <Checkbox
                    checked={todasMarcadas}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Selecionar todas"
                  />
                </th>
                <th scope="col" className={`${TH} inc-grade-fixa-cab inc-grade-fixa-fim !px-2.5 text-left sticky left-10 z-30 w-[112px] min-w-[112px] max-w-[112px] sm:w-[168px] sm:min-w-[168px] sm:max-w-[168px]`}>Função</th>
                <th scope="col" className={`${TH} inc-grade-cab text-center w-12`} title="Precisa de passagem">
                  <Plane className="w-3.5 h-3.5 mx-auto" aria-hidden="true" />
                  <span className="sr-only">Passagem</span>
                </th>
                <th scope="col" className={`${TH} inc-grade-cab text-center w-12`} title="Precisa de hospedagem">
                  <BedDouble className="w-3.5 h-3.5 mx-auto" aria-hidden="true" />
                  <span className="sr-only">Hospedagem</span>
                </th>
                {dates.map((date, i) => {
                  const { date: d, dayName, isWeekend } = formatDateHeader(date);
                  return (
                    <th scope="col" key={date} className={`px-0.5 py-1.5 text-center text-2xs uppercase tracking-[0.04em] font-semibold w-12 ${i === 0 ? 'border-l border-border' : ''} ${isWeekend ? 'bg-warning-soft/60 text-warning-strong' : 'bg-brand-soft/50 text-muted-foreground'}`}>
                      <div className="leading-none font-bold tabular-nums">{d}</div>
                      <div className="text-2xs mt-0.5 opacity-80 normal-case tracking-normal font-medium">{dayName}</div>
                    </th>
                  );
                })}
                <th scope="col" className={`${TH} inc-grade-cab text-center w-14 border-l border-border`} title="Quantas vagas a linha cria">Vagas</th>
                <th scope="col" className={`${TH} inc-grade-cab text-center border-l-2 border-border`}>Voo de ida</th>
                <th scope="col" className={`${TH} inc-grade-cab text-center`}>Chegada sugerida</th>
                <th scope="col" className={`${TH} inc-grade-cab text-center`}>Voo de volta</th>
                <th scope="col" className={`${TH} inc-grade-cab text-center`}>Partida sugerida</th>
                <th scope="col" className={`${TH} inc-grade-cab text-center w-10`}><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {functionRows.map((row, rowIdx) => (
                <GridRow
                  key={row.functionId} row={row} rowIdx={rowIdx} dates={dates}
                  selected={selectedRows.has(row.functionId)} hasCopiedSchedule={!!copiedSchedule}
                  {...acoes}
                />
              ))}
              {functionRows.length === 0 && (
                <tr>
                  <td colSpan={dates.length + 10} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma função na grade. Use “Adicionar função” ou cole do Excel.
                  </td>
                </tr>
              )}
            </tbody>
            {functionRows.length > 0 && (
              <tfoot className="sticky bottom-0 z-20">
                <tr>
                  <th scope="row" colSpan={2} className="inc-grade-fixa-pe inc-grade-fixa-fim sticky left-0 z-30 px-2.5 py-2 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Pessoas por dia
                  </th>
                  <td className="inc-grade-pe" colSpan={2} />
                  {porDia.map((n, i) => (
                    <td key={dates[i]} className={`inc-grade-pe px-0.5 py-2 text-center text-xs font-semibold tabular-nums ${i === 0 ? 'border-l border-border' : ''} ${n > 0 ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                      {n > 0 ? n : '–'}
                    </td>
                  ))}
                  <td className="inc-grade-pe px-2 py-2 text-center text-xs font-bold tabular-nums text-primary border-l border-border" title="Total de vagas da grade">
                    {gridSummary.registros}
                  </td>
                  <td className="inc-grade-pe border-l-2 border-border" colSpan={5} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Adicionar função (atalho no fim da grade) */}
      <button
        type="button"
        onClick={openFunctionSelect}
        disabled={dates.length === 0}
        className="inc-adicionar border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-brand-soft/60 rounded-lg w-full h-9 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
        Adicionar função à grade
      </button>
    </div>
  );
}
