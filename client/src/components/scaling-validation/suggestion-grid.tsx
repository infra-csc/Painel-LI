import { useCallback } from "react";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { TRANSPORT_MODES, TRANSPORT_MODE_LABELS, type TransportMode } from "@shared/scaling-validation-rules";
import { QtyCell } from "./qty-cell";
import { formatDateHeader, validateGridRow, type SuggestionGridRow } from "./scaling-grid-utils";

interface SuggestionGridProps {
  rows: SuggestionGridRow[];
  dates: string[];
  onChangeRow: (rowId: string, patch: Partial<SuggestionGridRow>) => void;
  onChangeQty: (rowId: string, date: string, value: number) => void;
  onDuplicateRow: (rowId: string) => void;
  onRemoveRow: (rowId: string) => void;
  disabled?: boolean;
}

const TH = "px-2 py-2 text-center border-r border-slate-100 text-[11px] uppercase tracking-widest text-slate-400 font-semibold whitespace-nowrap";
const inputCls = (filled: boolean) =>
  cn("h-7 text-center text-xs rounded-lg transition-colors focus:ring-2 focus:ring-primary/30 focus:border-primary",
    filled ? "bg-brand-soft/60 border-primary/30" : "bg-white border-slate-200");

const NONE = "__none__";

function ModeSelect({ value, onChange, label, disabled }: { value: TransportMode | ""; onChange: (v: TransportMode | "") => void; label: string; disabled?: boolean }) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : (v as TransportMode))} disabled={disabled}>
      <SelectTrigger aria-label={label} className={cn("h-7 w-[104px] text-xs rounded-lg", value ? "bg-brand-soft/60 border-primary/30" : "bg-white border-slate-200")}>
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>—</SelectItem>
        {TRANSPORT_MODES.map((m) => (
          <SelectItem key={m} value={m}>{TRANSPORT_MODE_LABELS[m]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Grade função × dia da Sugestão de Escala. Cada linha: quantidade por dia +
 * modal/data/horário de ida e volta + hotel/passagem + observação.
 * Componente controlado (o estado mora na página, que também cuida do rascunho).
 */
export function SuggestionGrid({ rows, dates, onChangeRow, onChangeQty, onDuplicateRow, onRemoveRow, disabled }: SuggestionGridProps) {
  const patch = useCallback(
    (rowId: string, p: Partial<SuggestionGridRow>) => onChangeRow(rowId, p),
    [onChangeRow],
  );

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
      <div className="overflow-x-auto max-h-[560px]">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-slate-50 sticky top-0 z-20">
            <tr>
              <th className={cn(TH, "text-left w-[180px] min-w-[180px] max-w-[180px] sticky left-0 bg-slate-50 z-30 border-r-slate-200 px-3")}>Função</th>
              {dates.map((date) => {
                const { date: d, dayName, isWeekend } = formatDateHeader(date);
                return (
                  <th key={date} className={cn(TH, "w-16", isWeekend ? "bg-orange-50/60 text-orange-400" : "bg-blue-50/50")}>
                    <div className="leading-none font-bold">{d}</div>
                    <div className="text-[10px] mt-0.5 opacity-70 normal-case tracking-normal">{dayName}</div>
                  </th>
                );
              })}
              <th className={cn(TH, "bg-slate-50 border-l border-l-slate-200")}>Total</th>
              <th className={TH}>Modal ida</th>
              <th className={TH}>Data ida</th>
              <th className={TH}>Desembarque</th>
              <th className={TH}>Modal volta</th>
              <th className={TH}>Data volta</th>
              <th className={TH}>Embarque</th>
              <th className={TH}>Hotel</th>
              <th className={TH}>Passagem</th>
              <th className={cn(TH, "min-w-[180px] text-left")}>Observação</th>
              <th className={cn(TH, "border-r-0 w-12")}><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={dates.length + 12} className="px-4 py-8 text-center text-sm text-slate-400 italic">
                  Nenhuma função na grade. Use "Adicionar função" ou "Colar da planilha".
                </td>
              </tr>
            )}
            {rows.map((row, rowIdx) => {
              const total = dates.reduce((acc, d) => acc + (row.quantities[d] || 0), 0);
              const issues = validateGridRow(row);
              return (
                <tr key={row.rowId} className={cn("border-b border-slate-100 hover:bg-blue-50/30 transition-colors", rowIdx % 2 === 1 ? "bg-slate-50/50" : "bg-white")}>
                  <td className="px-3 py-1.5 border-r border-slate-200 font-semibold text-slate-800 bg-slate-50 sticky left-0 z-10 w-[180px] min-w-[180px] max-w-[180px]">
                    <span className="block truncate" title={row.functionName}>{row.functionName}</span>
                    {issues.length > 0 && (
                      <span className="block text-[10px] font-normal text-amber-600 truncate" title={issues.join("; ")} role="status">
                        {issues[0]}{issues.length > 1 ? ` (+${issues.length - 1})` : ""}
                      </span>
                    )}
                  </td>
                  {dates.map((date, colIdx) => {
                    const { date: d, dayName, isWeekend } = formatDateHeader(date);
                    return (
                      <td key={date} className={cn("px-1 py-1.5 border-r border-slate-100 text-center", isWeekend && "bg-orange-50/30")}>
                        <QtyCell
                          value={row.quantities[date] || 0}
                          rowIdx={rowIdx}
                          colIdx={colIdx}
                          functionName={row.functionName}
                          dayLabel={`${dayName} ${d}`}
                          isWeekend={isWeekend}
                          disabled={disabled}
                          onChange={(v) => onChangeQty(row.rowId, date, v)}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 border-r border-slate-100 border-l border-l-slate-200 text-center text-xs font-semibold tabular-nums text-slate-600">
                    {total > 0 ? total : <span className="text-slate-300">–</span>}
                  </td>
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <ModeSelect value={row.transportModeIda} disabled={disabled} label={`Modal de ida — ${row.functionName}`} onChange={(v) => patch(row.rowId, { transportModeIda: v })} />
                  </td>
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <Input type="date" value={row.flightDepartureDate} disabled={disabled} aria-label={`Data de ida — ${row.functionName}`}
                      onChange={(e) => patch(row.rowId, { flightDepartureDate: e.target.value })} className={cn(inputCls(!!row.flightDepartureDate), "w-[130px]")} />
                  </td>
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <Input type="time" value={row.flightArrivalSuggestedTime} disabled={disabled} aria-label={`Horário de desembarque — ${row.functionName}`}
                      onChange={(e) => patch(row.rowId, { flightArrivalSuggestedTime: e.target.value })} className={cn(inputCls(!!row.flightArrivalSuggestedTime), "w-[96px]")} />
                  </td>
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <ModeSelect value={row.transportModeVolta} disabled={disabled} label={`Modal de volta — ${row.functionName}`} onChange={(v) => patch(row.rowId, { transportModeVolta: v })} />
                  </td>
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <Input type="date" value={row.flightReturnDate} disabled={disabled} aria-label={`Data de volta — ${row.functionName}`}
                      onChange={(e) => patch(row.rowId, { flightReturnDate: e.target.value })} className={cn(inputCls(!!row.flightReturnDate), "w-[130px]")} />
                  </td>
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <Input type="time" value={row.flightReturnSuggestedTime} disabled={disabled} aria-label={`Horário de embarque da volta — ${row.functionName}`}
                      onChange={(e) => patch(row.rowId, { flightReturnSuggestedTime: e.target.value })} className={cn(inputCls(!!row.flightReturnSuggestedTime), "w-[96px]")} />
                  </td>
                  <td className="px-2 py-1.5 border-r border-slate-100 text-center">
                    <Checkbox checked={row.needsAccommodation} disabled={disabled} aria-label={`Precisa de hospedagem — ${row.functionName}`}
                      onCheckedChange={(c) => patch(row.rowId, { needsAccommodation: c === true })} />
                  </td>
                  <td className="px-2 py-1.5 border-r border-slate-100 text-center">
                    <Checkbox checked={row.needsTicket} disabled={disabled} aria-label={`Precisa de passagem — ${row.functionName}`}
                      onCheckedChange={(c) => patch(row.rowId, { needsTicket: c === true })} />
                  </td>
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <Input value={row.observations} disabled={disabled} maxLength={500} placeholder="Observação da linha" aria-label={`Observação — ${row.functionName}`}
                      onChange={(e) => patch(row.rowId, { observations: e.target.value })} className={cn(inputCls(!!row.observations), "text-left min-w-[180px] placeholder:text-slate-300")} />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`Ações da linha ${row.functionName}`} className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700 rounded-lg">
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onDuplicateRow(row.rowId)}>
                          <Copy className="w-3 h-3 mr-2" /> Duplicar linha
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onRemoveRow(row.rowId)} className="text-destructive">
                          <Trash2 className="w-3 h-3 mr-2" /> Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SuggestionGrid;
