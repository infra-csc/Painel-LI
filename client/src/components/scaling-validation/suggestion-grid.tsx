import { memo, useMemo } from "react";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { QtyCell } from "./qty-cell";
import { ModeSelect } from "./mode-select";
import { formatDateHeader, type DateHeader, type RowValidation, type SuggestionGridRow } from "./scaling-grid-utils";

interface SuggestionGridProps {
  rows: SuggestionGridRow[];
  dates: string[];
  /** Validação por rowId, computada uma vez na página (erros bloqueiam, avisos não). */
  issuesByRow: ReadonlyMap<string, RowValidation>;
  onChangeRow: (rowId: string, patch: Partial<SuggestionGridRow>) => void;
  onChangeQty: (rowId: string, date: string, value: number) => void;
  onDuplicateRow: (rowId: string) => void;
  onRemoveRow: (rowId: string) => void;
  disabled?: boolean;
}

const TH = "px-2 py-2 text-center border-r border-slate-100 text-xs uppercase tracking-wide text-slate-500 font-semibold whitespace-nowrap";
const inputCls = (filled: boolean) =>
  cn("h-8 text-center text-xs rounded-lg transition-colors focus:ring-2 focus:ring-primary/30 focus:border-primary",
    filled ? "bg-brand-soft/60 border-primary/30" : "bg-white border-slate-200");

/** Atributo usado pela página para focar a linha a partir do banner de pendências. */
export const rowDomId = (rowId: string) => `sug-row-${rowId}`;

interface GridRowProps {
  row: SuggestionGridRow;
  rowIdx: number;
  headers: readonly (DateHeader & { ymd: string })[];
  issues: RowValidation | undefined;
  disabled?: boolean;
  onChangeRow: SuggestionGridProps["onChangeRow"];
  onChangeQty: SuggestionGridProps["onChangeQty"];
  onDuplicateRow: SuggestionGridProps["onDuplicateRow"];
  onRemoveRow: SuggestionGridProps["onRemoveRow"];
}

const GridRow = memo(function GridRow({ row, rowIdx, headers, issues, disabled, onChangeRow, onChangeQty, onDuplicateRow, onRemoveRow }: GridRowProps) {
  const total = headers.reduce((acc, h) => acc + (row.quantities[h.ymd] || 0), 0);
  const errors = issues?.errors ?? [];
  const warnings = issues?.warnings ?? [];
  const zebra = rowIdx % 2 === 1 ? "bg-slate-50" : "bg-white";
  return (
    <tr id={rowDomId(row.rowId)} data-row-id={row.rowId} className={cn("group border-b border-slate-100 transition-colors hover:bg-blue-50/40", zebra)}>
      <td className={cn("px-3 py-1.5 border-r border-slate-200 font-semibold text-slate-800 sticky left-0 z-10 w-[180px] min-w-[180px] max-w-[180px] transition-colors group-hover:bg-blue-50", zebra)}>
        <span className="block truncate" title={row.functionName}>{row.functionName}</span>
        {errors.length > 0 ? (
          <span className="block text-xs font-normal text-red-700 truncate" title={[...errors, ...warnings].join("; ")}>
            {errors[0]}{errors.length + warnings.length > 1 ? ` (+${errors.length + warnings.length - 1})` : ""}
          </span>
        ) : warnings.length > 0 ? (
          <span className="block text-xs font-normal text-amber-700 truncate" title={warnings.join("; ")}>
            {warnings[0]}{warnings.length > 1 ? ` (+${warnings.length - 1})` : ""}
          </span>
        ) : null}
      </td>
      {headers.map((h, colIdx) => (
        <td key={h.ymd} className={cn("px-1 py-1.5 border-r border-slate-100 text-center", h.isWeekend && "bg-orange-50/30")}>
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
      <td className="px-1.5 py-1.5 border-r border-slate-100">
        <ModeSelect value={row.transportModeIda} disabled={disabled} label={`Modal de ida — ${row.functionName}`} onChange={(v) => onChangeRow(row.rowId, { transportModeIda: v })} />
      </td>
      <td className="px-1.5 py-1.5 border-r border-slate-100">
        <Input type="date" value={row.flightDepartureDate} disabled={disabled} aria-label={`Data de ida — ${row.functionName}`}
          onChange={(e) => onChangeRow(row.rowId, { flightDepartureDate: e.target.value })} className={cn(inputCls(!!row.flightDepartureDate), "w-[130px]")} />
      </td>
      <td className="px-1.5 py-1.5 border-r border-slate-100">
        <Input type="time" value={row.flightArrivalSuggestedTime} disabled={disabled} aria-label={`Horário de desembarque — ${row.functionName}`}
          onChange={(e) => onChangeRow(row.rowId, { flightArrivalSuggestedTime: e.target.value })} className={cn(inputCls(!!row.flightArrivalSuggestedTime), "w-[96px]")} />
      </td>
      <td className="px-1.5 py-1.5 border-r border-slate-100">
        <ModeSelect value={row.transportModeVolta} disabled={disabled} label={`Modal de volta — ${row.functionName}`} onChange={(v) => onChangeRow(row.rowId, { transportModeVolta: v })} />
      </td>
      <td className="px-1.5 py-1.5 border-r border-slate-100">
        <Input type="date" value={row.flightReturnDate} disabled={disabled} aria-label={`Data de volta — ${row.functionName}`}
          onChange={(e) => onChangeRow(row.rowId, { flightReturnDate: e.target.value })} className={cn(inputCls(!!row.flightReturnDate), "w-[130px]")} />
      </td>
      <td className="px-1.5 py-1.5 border-r border-slate-100">
        <Input type="time" value={row.flightReturnSuggestedTime} disabled={disabled} aria-label={`Horário de embarque da volta — ${row.functionName}`}
          onChange={(e) => onChangeRow(row.rowId, { flightReturnSuggestedTime: e.target.value })} className={cn(inputCls(!!row.flightReturnSuggestedTime), "w-[96px]")} />
      </td>
      <td className="px-2 py-1.5 border-r border-slate-100 text-center">
        <Checkbox checked={row.needsAccommodation} disabled={disabled} aria-label={`Precisa de hospedagem — ${row.functionName}`}
          onCheckedChange={(c) => onChangeRow(row.rowId, { needsAccommodation: c === true })} />
      </td>
      <td className="px-2 py-1.5 border-r border-slate-100 text-center">
        <Checkbox checked={row.needsTicket} disabled={disabled} aria-label={`Precisa de passagem — ${row.functionName}`}
          onCheckedChange={(c) => onChangeRow(row.rowId, { needsTicket: c === true })} />
      </td>
      <td className="px-1.5 py-1.5 border-r border-slate-100">
        <Input value={row.observations} disabled={disabled} maxLength={500} placeholder="Observação da linha" aria-label={`Observação — ${row.functionName}`}
          onChange={(e) => onChangeRow(row.rowId, { observations: e.target.value })} className={cn(inputCls(!!row.observations), "text-left min-w-[180px] placeholder:text-slate-300")} />
      </td>
      <td className="px-1 py-1.5 text-center">
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
  );
});

/**
 * Grade função × dia da Sugestão de Escala. Cada linha: quantidade por dia +
 * modal/data/horário de ida e volta + hotel/passagem + observação.
 * Componente controlado (o estado mora na página, que também cuida do rascunho).
 */
export function SuggestionGrid({ rows, dates, issuesByRow, onChangeRow, onChangeQty, onDuplicateRow, onRemoveRow, disabled }: SuggestionGridProps) {
  const headers = useMemo(() => dates.map((ymd) => ({ ymd, ...formatDateHeader(ymd) })), [dates]);

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
      <div className="overflow-x-auto max-h-[560px]">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-slate-50 sticky top-0 z-20">
            <tr>
              <th scope="col" className={cn(TH, "text-left w-[180px] min-w-[180px] max-w-[180px] sticky left-0 bg-slate-50 z-30 border-r-slate-200 px-3")}>Função</th>
              {headers.map((h) => (
                <th key={h.ymd} scope="col" className={cn(TH, "w-16", h.isWeekend ? "bg-orange-50 text-orange-700" : "bg-blue-50/50")}>
                  <div className="leading-none font-bold">{h.date}</div>
                  <div className="text-xs mt-0.5 font-normal normal-case tracking-normal">{h.dayName}</div>
                </th>
              ))}
              <th scope="col" className={cn(TH, "bg-slate-50 border-l border-l-slate-200")}>Total</th>
              <th scope="col" className={TH}>Modal ida</th>
              <th scope="col" className={TH}>Data ida</th>
              <th scope="col" className={TH}>Desembarque</th>
              <th scope="col" className={TH}>Modal volta</th>
              <th scope="col" className={TH}>Data volta</th>
              <th scope="col" className={TH}>Embarque</th>
              <th scope="col" className={TH}>Hotel</th>
              <th scope="col" className={TH}>Passagem</th>
              <th scope="col" className={cn(TH, "min-w-[180px] text-left")}>Observação</th>
              <th scope="col" className={cn(TH, "border-r-0 w-12")}><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={dates.length + 12} className="px-4 py-8 text-center text-sm text-slate-500 italic">
                  Nenhuma função na grade. Use "Adicionar função" ou "Colar da planilha".
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
                disabled={disabled}
                onChangeRow={onChangeRow}
                onChangeQty={onChangeQty}
                onDuplicateRow={onDuplicateRow}
                onRemoveRow={onRemoveRow}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SuggestionGrid;
