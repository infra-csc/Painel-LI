/**
 * Célula "Dias" (somente leitura) da linha da planilha do Planejado —
 * 25/09 (modularização). Mostra os dias com diária e explica no tooltip a
 * regra aplicada (casa/CLT, cenotécnica, percurso, empreita).
 */
import { memo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CENO_FREELA_TIPO_LABELS } from "@shared/cenotecnica-empreita";
import type { CalculatedBudget } from "./types";

export const SheetRowDiasCell = memo(function SheetRowDiasCell({ budget }: { budget: CalculatedBudget }) {
  return (
    <td className="px-3 py-3 text-center bg-surface-muted align-middle">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm font-semibold tabular-nums font-mono text-slate-600 cursor-default select-none">
              {budget.diasComDiaria}
              {(budget.regraDiaria === "fds" || budget.regraDiaria === "nenhuma" || budget.isPercurso) && budget.diasComDiaria !== budget.weekdays + budget.weekends && (
                <span className="text-2xs font-sans font-normal text-muted-foreground">/{budget.weekdays + budget.weekends}</span>
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[260px]">
            <div className="flex flex-col gap-0.5">
              {budget.weekdays > 0 && (
                <span>
                  <span className="text-primary">●</span> Útil: {budget.weekdays}×
                  {budget.regraDiaria === "fds" && <span className="text-muted-foreground"> — sem diária (CLT)</span>}
                  {budget.regraDiaria === "nenhuma" && <span className="text-muted-foreground"> — sem diária</span>}
                </span>
              )}
              {budget.weekends > 0 && (
                <span>
                  <span className="text-warning-strong">●</span> FDS: {budget.weekends}×
                  {budget.regraDiaria === "nenhuma" && <span className="text-muted-foreground"> — sem diária</span>}
                </span>
              )}
              {budget.regraDiaria === "fds" && (
                <span className="text-muted-foreground mt-0.5">Casa (CLT): diária só nos fins de semana</span>
              )}
              {budget.regraDiaria === "nenhuma" && (
                <span className="text-muted-foreground mt-0.5">Cenotécnica de casa (CLT): não recebe diária</span>
              )}
              {budget.isPercurso && (
                <span className="text-muted-foreground mt-0.5">
                  Percurso: {budget.diasComDiaria} {budget.diasComDiaria === 1 ? "diária" : "diárias"} ({budget.inclusion.needsTicket ? "em viagem — regra fixa de 2 diárias" : "local (SP/Grande SP) — regra fixa de 1 diária"}), pacote fechado por diária
                </span>
              )}
              {budget.cenoEmpreita && (
                <span className="text-muted-foreground mt-0.5">
                  Empreita {CENO_FREELA_TIPO_LABELS[budget.cenoEmpreita.tipo]}: valor fechado por {budget.cenoEmpreita.dias} {budget.cenoEmpreita.dias === 1 ? "dia" : "dias"} (não é diária × dias) — modalidade definida na Escalação
                </span>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </td>
  );
});

export default SheetRowDiasCell;
