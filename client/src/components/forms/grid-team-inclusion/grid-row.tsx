/**
 * Uma linha da grade de Inclusão (25/09 — extraída do formulário). Memoizada:
 * cada linha tem uma célula por dia e o menu de ações — re-renderizar todas a
 * cada tecla numa célula era o custo da grade antiga.
 *
 * 07/10 (redesenho): a ordem das colunas segue o trabalho — função, se
 * precisa de passagem/hospedagem, os DIAS (o que todo mundo preenche) e
 * quantas vagas a linha vai criar; a sugestão de voo (só para quem viaja)
 * fica depois, separada por um filete. Antes os quatro campos de voo vinham
 * primeiro e empurravam os dias para fora da tela em 1366. As callbacks
 * chegam ESTÁVEIS da grade (ref), então só a linha editada re-renderiza.
 */
import { memo } from "react";
import { AlertTriangle, Calendar, ClipboardPaste, Copy, CopyPlus, MoreHorizontal, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  `h-7 w-full rounded-md border px-1.5 text-center text-xs tabular-nums outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/70 ${filled ? 'bg-brand-soft border-primary/30 text-foreground' : 'bg-card border-border text-foreground hover:border-slate-300'}`;

export const GridRow = memo(function GridRow({
  row, rowIdx, dates, selected, hasCopiedSchedule,
  toggleRowSelection, updateNeedsTicket, updateNeedsAccommodation, updateTravelInfo, updateDailyRate,
  duplicateFunction, duplicateScheduleOnly, copyScheduleData, pasteScheduleData, removeFunction,
}: GridRowProps) {
  // Quantas vagas a linha cria: o maior número de pessoas num mesmo dia
  // (a mesma conta da prévia — cada pessoa vira 1 vaga).
  let vagas = 0;
  for (const d of dates) vagas = Math.max(vagas, row.dailyRates[d] || 0);
  const semVoo = row.needsTicket && (!row.dataVooIda || !row.dataVooRetorno);
  return (
    <tr className={`inc-grade-linha group/linha border-b border-border ${selected ? 'inc-grade-marcada' : ''}`}>
      <td className="inc-grade-fixa px-2 py-1.5 text-center sticky left-0 z-10 w-10 min-w-[2.5rem]">
        <Checkbox
          checked={selected}
          onCheckedChange={() => toggleRowSelection(row.functionId)}
          aria-label={`Selecionar ${row.functionName}`}
        />
      </td>
      <td className="inc-grade-fixa inc-grade-fixa-fim px-2.5 py-1.5 font-medium text-foreground sticky left-10 z-10 w-[112px] min-w-[112px] max-w-[112px] sm:w-[168px] sm:min-w-[168px] sm:max-w-[168px]">
        <span className="block truncate text-sm" title={row.functionName}>{row.functionName}</span>
      </td>
      <td className="px-1 py-1.5 text-center">
        <span className="inline-flex items-center justify-center gap-0.5 min-h-[28px]">
          <Checkbox
            checked={row.needsTicket}
            onCheckedChange={(checked) => updateNeedsTicket(row.functionId, checked === true)}
            data-testid={`checkbox-needs-ticket-${row.functionId}`}
            aria-label={`Precisa de passagem — ${row.functionName}`}
          />
          {semVoo && (
            <AlertTriangle
              className="w-3.5 h-3.5 text-warning-strong"
              role="img"
              aria-label="Passagem marcada sem data de voo"
            />
          )}
        </span>
      </td>
      <td className="px-1 py-1.5 text-center">
        <Checkbox
          checked={row.needsAccommodation}
          onCheckedChange={(checked) => updateNeedsAccommodation(row.functionId, checked === true)}
          data-testid={`checkbox-needs-accommodation-${row.functionId}`}
          aria-label={`Precisa de hospedagem — ${row.functionName}`}
        />
      </td>
      {dates.map((date, colIdx) => {
        const { date: d, dayName, isWeekend } = formatDateHeader(date);
        const val = row.dailyRates[date] || 0;
        return (
          <td key={date} className={`px-0.5 py-1.5 text-center ${colIdx === 0 ? 'border-l border-border' : ''} ${isWeekend ? 'bg-warning-soft/30' : ''}`}>
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
      {/* Vagas que a linha cria — atualiza a cada célula. */}
      <td className="px-2 py-1.5 text-center border-l border-border">
        <span
          className={`inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-md text-xs font-semibold tabular-nums ${vagas > 0 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
          title={vagas > 0 ? `${vagas} ${vagas === 1 ? 'vaga' : 'vagas'} de ${row.functionName}` : 'Nenhuma vaga nesta linha'}
        >
          {vagas > 0 ? vagas : '–'}
        </span>
      </td>
      {/* Sugestão de voo (vale para a linha inteira) */}
      <td className="px-1 py-1.5 border-l-2 border-border min-w-[124px]">
        <input
          type="date"
          value={row.dataVooIda}
          onChange={(e) => updateTravelInfo(row.functionId, 'dataVooIda', e.target.value)}
          aria-label={`Data do voo de ida — ${row.functionName}`}
          className={`${travelInputClass(row.dataVooIda)} ${semVoo && !row.dataVooIda ? '!border-warning-strong/60' : ''}`}
        />
      </td>
      <td className="px-1 py-1.5 min-w-[96px]">
        <input
          value={row.horarioChegadaSugerido}
          onChange={(e) => updateTravelInfo(row.functionId, 'horarioChegadaSugerido', e.target.value)}
          placeholder="Ex: 14h30"
          aria-label={`Horário de chegada sugerido — ${row.functionName}`}
          className={travelInputClass(row.horarioChegadaSugerido)}
          maxLength={15}
        />
      </td>
      <td className="px-1 py-1.5 min-w-[124px]">
        <input
          type="date"
          value={row.dataVooRetorno}
          onChange={(e) => updateTravelInfo(row.functionId, 'dataVooRetorno', e.target.value)}
          aria-label={`Data do voo de retorno — ${row.functionName}`}
          className={`${travelInputClass(row.dataVooRetorno)} ${semVoo && !row.dataVooRetorno ? '!border-warning-strong/60' : ''}`}
        />
      </td>
      <td className="px-1 py-1.5 min-w-[96px]">
        <input
          value={row.horarioPartidaSugerido}
          onChange={(e) => updateTravelInfo(row.functionId, 'horarioPartidaSugerido', e.target.value)}
          placeholder="Ex: 18h00"
          aria-label={`Horário de partida sugerido — ${row.functionName}`}
          className={travelInputClass(row.horarioPartidaSugerido)}
          maxLength={15}
        />
      </td>
      <td className="px-1 py-1.5 text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Ações da função ${row.functionName}`}
              className="inc-grade-menu inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground"
            >
              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[220px]">
            <DropdownMenuItem onClick={() => duplicateFunction(row.functionId)}>
              <CopyPlus className="w-4 h-4 mr-2 text-muted-foreground" aria-hidden="true" />
              Duplicar função completa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => duplicateScheduleOnly(row.functionId)}>
              <Calendar className="w-4 h-4 mr-2 text-muted-foreground" aria-hidden="true" />
              Copiar viagem para nova função
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => copyScheduleData(row.functionId)}>
              <Copy className="w-4 h-4 mr-2 text-muted-foreground" aria-hidden="true" />
              Copiar horários
            </DropdownMenuItem>
            {hasCopiedSchedule && (
              <DropdownMenuItem onClick={() => pasteScheduleData(row.functionId)}>
                <ClipboardPaste className="w-4 h-4 mr-2 text-muted-foreground" aria-hidden="true" />
                Colar horários
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => removeFunction(row.functionId)}
              className="text-danger focus:text-danger focus:bg-danger-soft"
            >
              <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
              Remover da grade
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
});
