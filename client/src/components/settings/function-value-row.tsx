// Extraído de system-settings.tsx em 25/09 (modularização); redesenho 08/10.
//
// Uma linha da tabela "Diária por função (legado)" — nome + selo "Base" e as
// duas células editáveis (Dia útil / Fim de semana). `renderCell` continua
// como closure da linha porque depende de `fn` e do editor. React.memo: o
// editor e o ref mudam a cada render do pai, então o memo só evita re-render
// quando NADA mudou; mantido pelo padrão de linhas de lista do projeto.
//
// 08/10 — o valor parece clicável sem depender do hover (lápis discreto
// sempre visível), a célula alterada mostra "antes R$ X", a linha alterada
// ganha o filete âmbar da família e o nome deixou de mudar de cor por aba.
// Na largura estreita a linha vira cartão (CSS cfg-funcoes).
import { memo } from "react";
import type { Function as FunctionType, FunctionValue } from "@shared/schema";
import { Check, Pencil, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatarMoedaReais, toTitleCase } from "@/lib/format";
import { cn, parseBrNumber } from "@/lib/utils";
import { centavosToReais, freelaOuCasa, normalizeDecimal } from "./settings-utils";
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
  const nome = toTitleCase(fn.name);
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

  const renderCell = (field: EditingField, isEditing: boolean, currentVal: string, hasCustom: boolean, cellDirty: boolean, savedVal: string, fallbackVal?: string) => {
    const isZero = parseBrNumber(currentVal) === 0;
    const hasFallback = isZero && fallbackVal && parseBrNumber(fallbackVal) > 0;
    const rotuloCampo = field === 'wd' ? 'dia útil' : 'fim de semana';
    if (isEditing) {
      return (
        <div className="cfg-celula-edicao pas-entra">
          <div className="cfg-campo cfg-campo-compacto">
            <span className="cfg-campo-unidade" aria-hidden="true">R$</span>
            <input
              ref={editInputRef}
              type="text"
              inputMode="decimal"
              aria-label={`Novo valor de ${rotuloCampo} de ${nome}`}
              value={editingFunctionValue}
              onChange={e => setEditingFunctionValue(normalizeDecimal(e.target.value))}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); confirmEditFunction(fn.id); }
                if (e.key === 'Escape') cancelEditFunction();
              }}
              onBlur={() => confirmEditFunction(fn.id)}
              className="cfg-campo-input"
            />
          </div>
          {/* onMouseDown evita o blur antes do clique (o blur já confirma). */}
          <button type="button" aria-label="Confirmar" onMouseDown={e => e.preventDefault()} onClick={() => confirmEditFunction(fn.id)} className="cfg-icone-botao text-primary">
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Cancelar edição" onMouseDown={e => e.preventDefault()} onClick={cancelEditFunction} className="cfg-icone-botao text-muted-foreground">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      );
    }
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Editar ${rotuloCampo} de ${nome}`}
        className={cn("cfg-celula group/cell", cellDirty && "cfg-celula-alterada")}
        onClick={e => { e.stopPropagation(); startEditFunction(fn, field); }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            startEditFunction(fn, field);
          }
        }}
      >
        <span className="flex flex-col items-end min-w-0">
          {isZero ? (
            hasFallback ? (
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <span className="text-sm tabular-nums text-muted-foreground underline decoration-dotted underline-offset-4">
                    {formatarMoedaReais(parseBrNumber(fallbackVal!))}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Sem valor de fim de semana: usa o do dia útil
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )
          ) : (
            <span className={cn("text-sm tabular-nums", cellDirty ? "font-semibold text-warning" : hasCustom ? "font-medium text-foreground" : "text-muted-foreground")}>
              {formatarMoedaReais(parseBrNumber(currentVal))}
            </span>
          )}
          {cellDirty && (
            <span className="text-2xs leading-4 text-muted-foreground tabular-nums whitespace-nowrap">
              antes {parseBrNumber(savedVal) === 0 ? "—" : formatarMoedaReais(parseBrNumber(savedVal))}
            </span>
          )}
        </span>
        <Pencil className="cfg-lapis h-3 w-3 shrink-0" aria-hidden="true" />
      </div>
    );
  };

  // 28/09: a linha virou `<tr>` (a tabela é o DataTable).
  return (
    <tr className={cn("cfg-funcao-linha", isCoord && "cfg-funcao-base", isDirty && "cfg-funcao-alterada")} data-testid={`cfg-funcao-${fn.id}`}>
      {/* Nome + selo */}
      <td className="cfg-funcao-nome">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-sm", isCoord ? "font-semibold text-foreground" : "font-medium text-foreground")}>{nome}</span>
          {isCoord ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="shrink-0 cursor-help rounded-full bg-brand-soft px-2 py-0.5 text-2xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Base</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px] text-center text-xs leading-snug">
                Função base: valor de referência quando a função do colaborador não tem valor próprio cadastrado
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </td>

      {/* Dia útil */}
      <td className="cfg-funcao-valor" data-rotulo="Dia útil">{renderCell('wd', isEditingWd, wdVal, hasWd, isDirtyWd, savedWd)}</td>
      {/* Fim de semana — passa wdVal como fallback quando FDS não está configurado */}
      <td className="cfg-funcao-valor" data-rotulo="Fim de semana">{renderCell('we', isEditingWe, weVal, hasWe, isDirtyWe, savedWe, wdVal)}</td>
    </tr>
  );
});
