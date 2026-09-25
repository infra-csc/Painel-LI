/**
 * Uma linha da grade de Inclusão (25/09 — extraída do formulário). Memoizada:
 * cada linha tem uma célula por dia e o menu de ações — re-renderizar todas a
 * cada tecla numa célula era o custo da grade antiga.
 */
import { memo } from "react";
import { AlertTriangle, Calendar, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { QtyCell } from "./qty-cell";
import { formatDateHeader, type FunctionRow } from "./grid-types";
import type { GridRows } from "./use-grid-rows";

export type GridRowActions = Pick<GridRows,
  | "toggleRowSelection" | "updateNeedsTicket" | "updateNeedsAccommodation" | "updateTravelInfo" | "updateDailyRate"
  | "duplicateFunction" | "duplicateScheduleOnly" | "copyScheduleData" | "pasteScheduleData" | "removeFunction"
>;

export interface GridRowProps extends GridRowActions {
  row: FunctionRow;
  rowIdx: number;
  dates: string[];
  selected: boolean;
  hasCopiedSchedule: boolean;
}

const travelInputClass = (filled: string) =>
  `h-7 text-center text-xs rounded-lg transition-colors focus:ring-2 focus:ring-primary/25 focus:border-primary ${filled ? 'bg-brand-soft border-primary/40' : 'bg-card border-border'}`;

export const GridRow = memo(function GridRow({
  row, rowIdx, dates, selected, hasCopiedSchedule,
  toggleRowSelection, updateNeedsTicket, updateNeedsAccommodation, updateTravelInfo, updateDailyRate,
  duplicateFunction, duplicateScheduleOnly, copyScheduleData, pasteScheduleData, removeFunction,
}: GridRowProps) {
  return (
    <tr className={`border-b border-border hover:bg-brand-soft/40 transition-colors ${rowIdx % 2 === 1 ? 'bg-surface-muted/50' : 'bg-card'}`}>
      <td className="px-2 py-2 border-r border-border text-center bg-surface-muted sticky left-0 z-10 w-12 min-w-[3rem]">
        <Checkbox
          checked={selected}
          onCheckedChange={() => toggleRowSelection(row.functionId)}
          aria-label={`Selecionar ${row.functionName}`}
          className="accent-primary"
        />
      </td>
      <td className="px-3 py-2 border-r border-border font-semibold text-foreground bg-surface-muted sticky left-12 z-10 w-[180px] min-w-[180px] max-w-[180px]">
        <span className="block truncate" title={row.functionName}>{row.functionName}</span>
      </td>
      <td className="px-2 py-2 border-r border-border text-center">
        <span className="inline-flex items-center gap-1">
          <Checkbox
            checked={row.needsTicket}
            onCheckedChange={(checked) => updateNeedsTicket(row.functionId, checked === true)}
            data-testid={`checkbox-needs-ticket-${row.functionId}`}
            aria-label={`Precisa de passagem — ${row.functionName}`}
            className="accent-primary"
          />
          {row.needsTicket && (!row.dataVooIda || !row.dataVooRetorno) && (
            <AlertTriangle
              className="w-3 h-3 text-warning-strong"
              role="img"
              aria-label="Passagem marcada sem data de voo"
            />
          )}
        </span>
      </td>
      <td className="px-2 py-2 border-r border-border text-center">
        <Checkbox
          checked={row.needsAccommodation}
          onCheckedChange={(checked) => updateNeedsAccommodation(row.functionId, checked === true)}
          data-testid={`checkbox-needs-accommodation-${row.functionId}`}
          aria-label={`Precisa de hospedagem — ${row.functionName}`}
          className="accent-primary"
        />
      </td>
      <td className="px-2 py-2 border-r border-border">
        <Input
          type="date"
          value={row.dataVooIda}
          onChange={(e) => updateTravelInfo(row.functionId, 'dataVooIda', e.target.value)}
          className={travelInputClass(row.dataVooIda)}
        />
      </td>
      <td className="px-2 py-2 border-r border-border min-w-[120px]">
        <Input
          value={row.horarioChegadaSugerido}
          onChange={(e) => updateTravelInfo(row.functionId, 'horarioChegadaSugerido', e.target.value)}
          placeholder="Ex: 14h30"
          className={`${travelInputClass(row.horarioChegadaSugerido)} w-full placeholder:text-muted-foreground`}
          maxLength={15}
        />
      </td>
      <td className="px-2 py-2 border-r border-border">
        <Input
          type="date"
          value={row.dataVooRetorno}
          onChange={(e) => updateTravelInfo(row.functionId, 'dataVooRetorno', e.target.value)}
          className={travelInputClass(row.dataVooRetorno)}
        />
      </td>
      <td className="px-2 py-2 border-r border-border min-w-[120px]">
        <Input
          value={row.horarioPartidaSugerido}
          onChange={(e) => updateTravelInfo(row.functionId, 'horarioPartidaSugerido', e.target.value)}
          placeholder="Ex: 18h00"
          className={`${travelInputClass(row.horarioPartidaSugerido)} w-full placeholder:text-muted-foreground`}
          maxLength={15}
        />
      </td>
      {dates.map((date, colIdx) => {
        const { date: d, dayName, isWeekend } = formatDateHeader(date);
        const val = row.dailyRates[date] || 0;
        return (
          <td key={date} className={`px-1 py-2 border-r border-border text-center ${isWeekend ? 'bg-warning-soft/30' : ''}`}>
            <QtyCell
              value={val}
              rowIdx={rowIdx}
              colIdx={colIdx}
              functionName={row.functionName}
              dayLabel={`${dayName} ${d}`}
              isWeekend={isWeekend}
              onChange={(v) => updateDailyRate(row.functionId, date, v)}
            />
          </td>
        );
      })}
      <td className="px-2 py-2 text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={`Ações da função ${row.functionName}`} className="h-7 w-7 p-0 text-muted-foreground hover:text-slate-700 hover:bg-muted rounded-lg transition-colors">
              <MoreHorizontal className="w-3 h-3" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => duplicateFunction(row.functionId)}>
              <Copy className="w-3 h-3 mr-2" aria-hidden="true" />
              Duplicar Função Completa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => duplicateScheduleOnly(row.functionId)}>
              <Calendar className="w-3 h-3 mr-2" aria-hidden="true" />
              Copiar para Nova Função
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => copyScheduleData(row.functionId)}>
              <Copy className="w-3 h-3 mr-2" aria-hidden="true" />
              Copiar Horários
            </DropdownMenuItem>
            {hasCopiedSchedule && (
              <DropdownMenuItem onClick={() => pasteScheduleData(row.functionId)}>
                <Calendar className="w-3 h-3 mr-2" aria-hidden="true" />
                Colar Horários
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => removeFunction(row.functionId)}
              className="text-destructive"
            >
              <Trash2 className="w-3 h-3 mr-2" aria-hidden="true" />
              Remover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
});
