// Extraído de system-settings.tsx em 25/09 (modularização): uma linha da
// tabela "Diária por Função (legado)" — nome + badge "Base" e as duas células
// editáveis (Dia Útil / Fim de Semana). `renderCell` continua como closure da
// linha porque depende de `fn` e do editor. React.memo: o editor e o ref mudam
// a cada render do pai, então o memo só evita re-render quando NADA mudou;
// mantido pelo padrão de linhas de lista do projeto.
import { memo } from "react";
import type { Function as FunctionType, FunctionValue } from "@shared/schema";
import { Pencil, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseBrNumber } from "@/lib/utils";
import { centavosToReais, freelaOuCasa, normalizeDecimal, toTitleCase } from "./settings-utils";
import type { EditingField, FunctionValuesEditor, SettingsTab } from "./use-function-values";

export interface FunctionValueRowProps {
  fn: FunctionType;
  /** Valor salvo (undefined quando a função ainda não tem registro) */
  fv: FunctionValue | undefined;
  activeTab: SettingsTab;
  editor: FunctionValuesEditor;
}

export const FunctionValueRow = memo(function FunctionValueRow({ fn, fv, activeTab, editor }: FunctionValueRowProps) {
  const {
    editingFunctionId, editingField, editingFunctionValue, setEditingFunctionValue, editInputRef,
    getCurrentValue, startEditFunction, confirmEditFunction, cancelEditFunction,
  } = editor;

  const isCoord = fn.responsibleArea === '__system__';
  const wdVal = getCurrentValue(fn.id, 'wd');
  const weVal = getCurrentValue(fn.id, 'we');
  const savedWdCent = !fv ? 0 : activeTab === 'casa' ? (fv.dailyValue ?? 0) : freelaOuCasa(fv.dailyValueFreela, fv.dailyValue);
  const savedWeCent = !fv ? 0 : activeTab === 'casa' ? (fv.dailyValueWeekend ?? 0) : freelaOuCasa(fv.dailyValueFreelaWeekend, fv.dailyValueWeekend);
  const savedWd = centavosToReais(savedWdCent);
  const savedWe = centavosToReais(savedWeCent);
  const isDirtyWd = parseBrNumber(wdVal) !== parseBrNumber(savedWd);
  const isDirtyWe = parseBrNumber(weVal) !== parseBrNumber(savedWe);
  const isDirty = isDirtyWd || isDirtyWe;
  const isEditingWd = editingFunctionId === fn.id && editingField === 'wd';
  const isEditingWe = editingFunctionId === fn.id && editingField === 'we';
  const hasWd = !!fv && savedWdCent > 0;
  const hasWe = !!fv && savedWeCent > 0;

  const renderCell = (field: EditingField, isEditing: boolean, currentVal: string, hasCustom: boolean, fallbackVal?: string) => {
    const isZero = parseBrNumber(currentVal) === 0;
    const hasFallback = isZero && fallbackVal && parseBrNumber(fallbackVal) > 0;
    const valueColor = hasCustom
      ? (field === 'we' ? 'text-warning-strong' : activeTab === 'casa' ? 'text-primary' : 'text-primary')
      : 'text-muted-foreground';
    return (
      <div
        role={isEditing ? undefined : "button"}
        tabIndex={isEditing ? -1 : 0}
        aria-label={`Editar ${field === 'wd' ? 'dia útil' : 'fim de semana'} de ${toTitleCase(fn.name)}`}
        className="group/cell flex items-center justify-end gap-1.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onClick={e => { e.stopPropagation(); if (!isEditing) startEditFunction(fn, field); }}
        onKeyDown={e => {
          if (!isEditing && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            startEditFunction(fn, field);
          }
        }}
      >
        {isEditing ? (
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5 rounded border border-slate-300 bg-card px-1.5 py-0.5 shadow-1">
              <span className="select-none text-2xs font-medium text-muted-foreground">R$</span>
              <input
                ref={editInputRef}
                type="text"
                inputMode="decimal"
                aria-label="Novo valor da diária"
                value={editingFunctionValue}
                onChange={e => setEditingFunctionValue(normalizeDecimal(e.target.value))}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); confirmEditFunction(fn.id); }
                  if (e.key === 'Escape') cancelEditFunction();
                }}
                onBlur={() => confirmEditFunction(fn.id)}
                className="w-16 border-none bg-transparent text-right font-mono text-sm font-semibold tabular-nums text-slate-700 outline-none focus:outline-none"
              />
            </div>
            <button type="button" aria-label="Cancelar edição" onClick={cancelEditFunction} className="flex items-center justify-center text-muted-foreground opacity-0 transition-opacity hover:text-slate-600 group-hover/cell:opacity-100">
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="flex cursor-pointer items-center gap-1.5">
            {isZero ? (
              hasFallback ? (
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <span className="text-sm font-medium tabular-nums text-warning-strong">
                      R$ {parseBrNumber(fallbackVal!).toFixed(2).replace('.', ',')}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Usa o valor do Dia Útil (sem FDS específico)
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-sm italic text-muted-foreground">—</span>
              )
            ) : (
              <span className={`text-sm font-semibold tabular-nums ${valueColor}`}>
                {`R$ ${parseBrNumber(currentVal).toFixed(2).replace('.', ',')}`}
              </span>
            )}
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus-within/cell:opacity-100" aria-hidden="true" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`group grid min-h-[44px] grid-cols-3 items-center gap-2 px-5 py-1.5 transition-colors
        ${isCoord ? 'bg-brand-soft/40' : 'bg-card hover:bg-surface-muted/70'}
        ${isDirty ? 'ring-1 ring-inset ring-warning/25' : ''}
      `}
    >
      {/* Nome + badges */}
      <div className="flex min-w-0 items-center gap-2">
        {isCoord ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0 cursor-help rounded-full bg-brand-soft px-1.5 py-0.5 text-2xs font-semibold text-primary">Base</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-center text-xs leading-snug">
              Função base: valor usado como referência quando a função do colaborador não possui valor personalizado cadastrado
            </TooltipContent>
          </Tooltip>
        ) : null}
        <span
          className={`truncate text-sm font-medium ${
            isCoord ? 'text-primary'
            : isDirty ? 'font-semibold text-warning'
            : activeTab === 'freela' ? 'text-warning'
            : 'text-slate-700'
          }`}
        >
          {toTitleCase(fn.name)}
        </span>
      </div>

      {/* Dia Útil */}
      {renderCell('wd', isEditingWd, wdVal, hasWd)}
      {/* Fim de Semana — passa wdVal como fallback quando FDS não está configurado */}
      {renderCell('we', isEditingWe, weVal, hasWe, wdVal)}
    </div>
  );
});
