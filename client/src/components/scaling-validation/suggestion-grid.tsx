import { memo, useMemo, useState } from "react";
import { ClipboardPaste, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { QtyCell } from "./qty-cell";
import { LogisticsPanel } from "./logistics-panel";
import { CHIP_NEUTRAL, LegChip, NeedChips, dayText } from "./logistics-chips";
import { formatDateHeader, totalsByDay, type DateHeader, type RowValidation, type SuggestionGridRow } from "./scaling-grid-utils";

export interface SuggestionGridProps {
  rows: SuggestionGridRow[];
  dates: string[];
  /** Validação por rowId, computada uma vez na página (erros bloqueiam, avisos não). */
  issuesByRow: ReadonlyMap<string, RowValidation>;
  /** Área responsável por função (11px sob o nome). */
  areaByFunctionId: ReadonlyMap<string, string>;
  onChangeRow: (rowId: string, patch: Partial<SuggestionGridRow>) => void;
  onChangeQty: (rowId: string, date: string, value: number) => void;
  onDuplicateRow: (rowId: string) => void;
  onRemoveRow: (rowId: string) => void;
  /** Saídas do estado vazio "Nenhuma função na grade". */
  onPaste: () => void;
  onAddFunction: () => void;
  disabled?: boolean;
}

const TH = "px-2 py-2 text-center border-r border-slate-100 text-xs uppercase tracking-wide text-slate-500 font-semibold whitespace-nowrap";

/** Atributo usado pela página para focar a linha a partir dos chips de pendência. */
export const rowDomId = (rowId: string) => `sug-row-${rowId}`;

/** A perna tem algo a dizer (modal, data ou hora)? */
const hasLeg = (mode: string, date: string, time: string) => !!(mode || date || time);

interface GridRowProps {
  row: SuggestionGridRow;
  rowIdx: number;
  headers: readonly (DateHeader & { ymd: string })[];
  issues: RowValidation | undefined;
  area: string | undefined;
  colCount: number;
  expanded: boolean;
  disabled?: boolean;
  onToggleExpand: (rowId: string) => void;
  onChangeRow: SuggestionGridProps["onChangeRow"];
  onChangeQty: SuggestionGridProps["onChangeQty"];
  onDuplicateRow: SuggestionGridProps["onDuplicateRow"];
  onRemoveRow: SuggestionGridProps["onRemoveRow"];
}

const GridRow = memo(function GridRow({
  row, rowIdx, headers, issues, area, colCount, expanded, disabled,
  onToggleExpand, onChangeRow, onChangeQty, onDuplicateRow, onRemoveRow,
}: GridRowProps) {
  const total = headers.reduce((acc, h) => acc + (row.quantities[h.ymd] || 0), 0);
  const errors = issues?.errors ?? [];
  const warnings = issues?.warnings ?? [];
  const issueText = errors[0] ?? warnings[0] ?? null;
  const issueExtra = errors.length + warnings.length - 1;
  // Ponto de status da linha: cinza vazio · azul ok · âmbar aviso · vermelho erro.
  const dot = errors.length > 0 ? "bg-red-500" : warnings.length > 0 ? "bg-amber-500" : total > 0 ? "bg-primary" : "bg-slate-300";
  const zebra = rowIdx % 2 === 1 ? "bg-slate-50" : "bg-white";

  const hasLogistics = hasLeg(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)
    || hasLeg(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime)
    || row.needsAccommodation || row.needsTicket || !!row.observations;

  return (
    <>
      <tr id={rowDomId(row.rowId)} data-row-id={row.rowId} className={cn("group border-b border-slate-100 transition-colors hover:bg-blue-50/40", zebra, expanded && "border-b-0")}>
        {/* Função: ponto de status + nome + área + pendência + repetir 1º valor */}
        <td className={cn("px-3 py-1.5 border-r border-slate-200 sticky left-0 z-10 w-[220px] min-w-[220px] max-w-[220px] transition-colors group-hover:bg-blue-50", zebra)}>
          <div className="flex items-start gap-1.5">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-800" title={row.functionName}>{row.functionName}</span>
              {area && <span className="block truncate text-[11px] text-slate-400" title={area}>{area}</span>}
              {issueText && (
                <span
                  className={cn("block truncate text-[11px]", errors.length > 0 ? "text-red-700" : "text-amber-700")}
                  title={[...errors, ...warnings].join("; ")}
                >
                  {issueText}{issueExtra > 0 ? ` (+${issueExtra})` : ""}
                </span>
              )}
            </div>
          </div>
        </td>

        {headers.map((h, colIdx) => (
          <td key={h.ymd} className="px-1 py-1.5 border-r border-slate-100 text-center">
            <QtyCell
              value={row.quantities[h.ymd] || 0}
              rowId={row.rowId}
              date={h.ymd}
              rowIdx={rowIdx}
              colIdx={colIdx}
              functionName={row.functionName}
              dayLabel={`${h.dayName} ${h.date}`}
              isWeekend={h.isWeekend}
              disabled={disabled}
              onChangeQty={onChangeQty}
            />
          </td>
        ))}

        <td className="px-2 py-1.5 border-r border-slate-100 border-l border-l-slate-200 text-center text-xs font-semibold tabular-nums text-slate-600">
          {total > 0 ? total : <span className="text-slate-300">–</span>}
        </td>

        {/* Logística e observação: chips de leitura em UMA linha + botão do painel */}
        <td className="px-2 py-1.5 border-r border-slate-100">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              <LegChip
                dir="ida" mode={row.transportModeIda} className="shrink-0"
                date={row.flightDepartureDate} time={row.flightArrivalSuggestedTime}
              />
              <LegChip
                dir="volta" mode={row.transportModeVolta} className="shrink-0"
                date={row.flightReturnDate} time={row.flightReturnSuggestedTime}
              />
              <NeedChips needsTicket={row.needsTicket} needsAccommodation={row.needsAccommodation} className="shrink-0" />
              {row.observations && (
                <span className={cn(CHIP_NEUTRAL, "min-w-0")} title={row.observations}>
                  <span className="truncate italic">{row.observations}</span>
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onToggleExpand(row.rowId)}
              aria-expanded={expanded}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none",
                expanded
                  ? "border-primary/30 bg-brand-soft text-primary"
                  : hasLogistics
                    ? "border-slate-200 bg-white text-slate-600 hover:border-primary/30 hover:text-primary"
                    : "border-dashed border-slate-300 bg-white text-slate-500 hover:border-primary/40 hover:text-primary",
              )}
            >
              {!expanded && <Pencil className="w-3 h-3" aria-hidden="true" />}
              {expanded ? "Fechar logística" : hasLogistics ? "Editar" : "Definir logística"}
            </button>
          </div>
        </td>

        <td className="px-1 py-1.5 text-center w-[44px]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`Ações da linha ${row.functionName}`} className="h-8 w-8 p-0 text-slate-500 hover:text-slate-800 rounded-lg">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onDuplicateRow(row.rowId)}>
                <Copy className="w-3.5 h-3.5 mr-2" /> Duplicar linha
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRemoveRow(row.rowId)} className="text-destructive">
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

      {/* Painel expandido de logística (um por vez, controlado pela grade) */}
      {expanded && (
        <tr className="border-b border-slate-200">
          <td colSpan={colCount} className="bg-slate-50 px-4 py-3">
            <LogisticsPanel row={row} disabled={disabled} onChangeRow={onChangeRow} />
          </td>
        </tr>
      )}
    </>
  );
});

/**
 * Grade função × dia da Sugestão de Escala, com quantidades separadas da
 * logística: colunas de dia + Total + UMA coluna de logística (chips + painel
 * expandido) + rodapé fixo "Pessoas por dia" com o pico do evento.
 * Componente controlado (o estado mora na página, que também cuida do rascunho).
 */
export function SuggestionGrid({
  rows, dates, issuesByRow, areaByFunctionId, onChangeRow, onChangeQty, onDuplicateRow, onRemoveRow,
  onPaste, onAddFunction, disabled,
}: SuggestionGridProps) {
  const headers = useMemo(() => dates.map((ymd) => ({ ymd, ...formatDateHeader(ymd) })), [dates]);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const toggleExpand = (rowId: string) => setOpenRowId((cur) => (cur === rowId ? null : rowId));
  const totals = useMemo(() => totalsByDay(rows, dates), [rows, dates]);
  // Função (220) + dias (58) + Total (48) + Logística (mín. 260) + ações (44):
  // 6 dias cabem em ~960px — sem rolagem horizontal num notebook de 1366px.
  const colCount = dates.length + 4;
  const minWidth = 220 + dates.length * 58 + 48 + 260 + 44;

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
      <div className="overflow-x-auto max-h-[560px]">
        <table className="w-full text-sm" style={{ minWidth }}>
          <thead className="bg-slate-50 sticky top-0 z-20">
            <tr>
              <th scope="col" className={cn(TH, "text-left w-[220px] min-w-[220px] max-w-[220px] sticky left-0 bg-slate-50 z-30 border-r-slate-200 px-3")}>Função</th>
              {headers.map((h) => (
                <th key={h.ymd} scope="col" className={cn(TH, "w-[58px] min-w-[58px]", h.isWeekend ? "bg-orange-50 text-orange-700" : "bg-blue-50/50")}>
                  <div className="leading-none font-bold">{h.date}</div>
                  <div className="text-xs mt-0.5 font-normal normal-case tracking-normal">{h.dayName}</div>
                </th>
              ))}
              <th scope="col" className={cn(TH, "w-[48px] bg-slate-50 border-l border-l-slate-200")}>Total</th>
              <th scope="col" className={cn(TH, "text-left min-w-[260px]")}>Logística e observação</th>
              <th scope="col" className={cn(TH, "border-r-0 w-[44px]")}><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-6 py-10 text-center">
                  <p className="text-sm font-medium text-slate-600">Nenhuma função na grade</p>
                  <p className="text-xs text-slate-500 mt-1">Cole a escala direto da planilha ou adicione as funções uma a uma.</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <Button type="button" size="sm" disabled={disabled} onClick={onPaste} className="rounded-lg bg-primary hover:bg-primary-hover">
                      <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Colar da planilha
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onAddFunction} className="rounded-lg">
                      <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Adicionar função
                    </Button>
                  </div>
                </td>
              </tr>
            )}
            {rows.map((row, rowIdx) => (
              <GridRow
                key={row.rowId}
                row={row}
                rowIdx={rowIdx}
                headers={headers}
                issues={issuesByRow.get(row.rowId)}
                area={areaByFunctionId.get(row.functionId)}
                colCount={colCount}
                expanded={openRowId === row.rowId}
                disabled={disabled}
                onToggleExpand={toggleExpand}
                onChangeRow={onChangeRow}
                onChangeQty={onChangeQty}
                onDuplicateRow={onDuplicateRow}
                onRemoveRow={onRemoveRow}
              />
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td className="sticky bottom-0 left-0 z-30 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Pessoas por dia
                </td>
                {headers.map((h) => {
                  const t = totals.byDay[h.ymd] || 0;
                  const isPeak = totals.peakDate === h.ymd && totals.peakTotal > 0;
                  return (
                    <td
                      key={h.ymd}
                      className={cn(
                        "sticky bottom-0 z-20 border-t border-slate-200 bg-slate-50 px-1 py-2 text-center text-xs tabular-nums",
                        isPeak ? "bg-brand-soft font-bold text-primary" : t > 0 ? "font-semibold text-slate-700" : "text-slate-300",
                      )}
                    >
                      {t > 0 ? t : "–"}
                    </td>
                  );
                })}
                <td className="sticky bottom-0 z-20 border-t border-slate-200 border-l border-l-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-bold tabular-nums text-primary">
                  {totals.grand > 0 ? totals.grand : "–"}
                </td>
                <td colSpan={2} className="sticky bottom-0 z-20 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-400">
                  <span className="whitespace-nowrap">↑/↓ ajusta · ←/→ navega · Enter desce · Delete zera</span>
                  {totals.peakTotal > 0 && (
                    <span className="ml-3 whitespace-nowrap font-semibold text-primary">
                      Pico em {dayText(totals.peakDate)} ({totals.peakTotal} {totals.peakTotal === 1 ? "pessoa" : "pessoas"})
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export default SuggestionGrid;
