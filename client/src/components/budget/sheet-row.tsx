/**
 * Linha da PLANILHA de edição do Planejado — 25/09 (modularização).
 *
 * Extraída de budget-planned.tsx. Memoizada: digitar num input só
 * re-renderiza ESTA linha (buffer de digitação local), não a tabela inteira.
 * A célula do colaborador e a de dias vivem em componentes próprios para a
 * linha caber na régua de 300 linhas.
 */
import { forwardRef, memo, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn, parseBrNumber } from "@/lib/utils";
import { toTitleCase } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CENO_FREELA_TIPO_LABELS } from "@shared/cenotecnica-empreita";
import type { BudgetActual } from "@shared/schema";
import { MemoriaCalculoPopover } from "./memoria-calculo-popover";
import { SheetRowDiasCell } from "./sheet-row-dias-cell";
import { ddmm, formatCurrency, isCasaType, type BudgetOverride, type CalculatedBudget, type SheetField } from "./types";

export interface SheetRowProps {
  /** Posição na lista filtrada — lido pela medição da virtualização (`data-index`). */
  index: number;
  budget: CalculatedBudget;
  name: string;
  funcName: string;
  isSent: boolean;
  isNotAttended: boolean;
  isNewCollab: boolean;
  showTopBorder: boolean;
  selected: boolean;
  ovr?: BudgetOverride;
  matchingActual?: BudgetActual;
  subtotalOpen: boolean;
  onToggleSelect: (sid: string, v: boolean) => void;
  onSheetEdit: (budget: CalculatedBudget, field: SheetField, rawValue: string) => void;
  onRestoreField: (sid: string, field: SheetField) => void;
  onToggleSubtotal: (sid: string) => void;
}

// A11y: indicador NÃO cromático de célula editada (além da cor/negrito)
const editedMark = (
  <span role="img" aria-label="Valor editado manualmente" title="Valor editado manualmente"
    className="text-2xs font-bold text-muted-foreground shrink-0 select-none">✱</span>
);

/** Colaborador + Função + Período — coluna rica com avatar. */
function SheetRowCollaboratorCell({ budget, name, funcName, isSent, isNotAttended, isNewCollab, matchingActual }: Pick<SheetRowProps, "budget" | "name" | "funcName" | "isSent" | "isNotAttended" | "isNewCollab" | "matchingActual">) {
  const hasOvr = budget.hasOverride;
  const isCasa = isCasaType(budget.collaborator?.type);
  return (
    <td className="pl-4 pr-4 py-3 align-middle" style={{ minWidth: "280px" }}>
      <div className="flex items-start gap-3">
        {/* Avatar com iniciais */}
        {isNewCollab && (() => {
          const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
          return (
            <div className={cn("shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-2xs font-bold mt-0.5", isCasa ? "bg-brand-soft text-primary" : "bg-danger-soft text-danger")}>
              {initials}
            </div>
          );
        })()}
        {!isNewCollab && <div className="shrink-0 w-8" />}

        <div className="flex-1 min-w-0">
          {isNewCollab && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-sm font-semibold text-foreground tracking-[-0.01em]">{toTitleCase(name)}</span>
              {hasOvr && !isSent && (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block w-2 h-2 rounded-full shrink-0 bg-warning-strong ring-2 ring-card" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Valores editados manualmente pelo RH</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <span className={cn("inline-flex items-center justify-center text-2xs font-semibold rounded-full py-0.5 px-2 min-w-[44px]", isCasa ? "bg-brand-soft text-primary" : "bg-danger-soft text-danger")}>
                {isCasa ? "Casa" : "Freela"}
              </span>
            </div>
          )}
          {/* Linha 2: Função | Período */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-2xs ${isNotAttended ? "line-through text-muted-foreground" : "text-muted-foreground"}`}>
              {funcName}
            </span>
            {budget.cenoEmpreitaVaga && (
              budget.cenoFreelaTipo ? (
                <span className="text-2xs font-semibold text-warning bg-warning-soft px-1.5 py-px rounded-full shrink-0"
                  title="Modalidade da empreita cenotécnica — definida na tela de Escalação (somente leitura aqui)">
                  {CENO_FREELA_TIPO_LABELS[budget.cenoFreelaTipo]}
                </span>
              ) : (
                <span className="text-2xs font-semibold text-warning bg-warning-soft px-1.5 py-px rounded-full shrink-0"
                  title="Sem modalidade de empreita: o cálculo segue a diária padrão. A escolha é feita na tela de Escalação (somente leitura aqui)">
                  definir tipo na Escalação
                </span>
              )
            )}
            {budget.inclusion.scheduleStartDate && (
              <span className="text-2xs text-muted-foreground">
                · {ddmm(budget.inclusion.scheduleStartDate)}
                {budget.inclusion.scheduleEndDate && budget.inclusion.scheduleStartDate !== budget.inclusion.scheduleEndDate && (
                  <> → {ddmm(budget.inclusion.scheduleEndDate)}</>
                )}
              </span>
            )}
            {matchingActual?.rhAdjusted && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center shrink-0 cursor-default text-warning">✏</span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">RH ajustou o realizado deste colaborador</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {/* Linha 3: Status discreto */}
          <div className="mt-0.5">
            {isSent ? (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold px-1.5 py-px rounded-full bg-success-soft text-success">
                <Check className="w-2 h-2" aria-hidden="true" />Enviado
              </span>
            ) : !isNotAttended ? (
              <span className="inline-flex items-center text-2xs font-semibold px-1.5 py-px rounded-full bg-warning-soft text-warning">
                Pendente
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </td>
  );
}

export const SheetRow = memo(forwardRef<HTMLTableRowElement, SheetRowProps>(function SheetRow({
  index, budget, name, funcName, isSent, isNotAttended, isNewCollab, showTopBorder,
  selected, ovr, matchingActual, subtotalOpen,
  onToggleSelect, onSheetEdit, onRestoreField, onToggleSubtotal,
}, ref) {
  const sid = budget.inclusion.id;
  const hasOvr = budget.hasOverride;
  const mobTotal = budget.mobilidade / 100;
  const disabled = isSent || isNotAttended;

  // Buffer local de digitação — commit no blur
  const [bufs, setBufs] = useState<Record<string, string>>({});
  const [restoredFeedback, setRestoredFeedback] = useState<string | null>(null);
  const buf = (field: string, fallback: string) => bufs[field] ?? fallback;
  const setbuf = (field: string, val: string) => setBufs(prev => ({ ...prev, [field]: val }));
  const clearbuf = (field: string) => setBufs(prev => { const n = { ...prev }; delete n[field]; return n; });
  // Commit no blur SÓ quando o valor mudou de fato: blur sem edição não pode
  // gravar override fantasma (que "congela" o recálculo da linha). A comparação
  // é contra o MESMO valor derivado que o display usa (ex.: alimentação exibe
  // (total/dias).toFixed(2) — comparar contra o total re-multiplicado geraria
  // deriva de centavos e um falso "mudou").
  const commitBlur = (field: SheetField, key: string, displayValue: string) => (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    clearbuf(key);
    if (Math.abs(parseBrNumber(raw) - parseBrNumber(displayValue)) < 0.005) return;
    onSheetEdit(budget, field, raw);
  };

  // Diária é PLANA: um único valor por linha.
  // Rascunhos podem ter só um dos campos espelhados — qualquer um marca como editada.
  const vdiaEdited = ovr?.valorDiaria !== undefined || ovr?.valorDiariaUtil !== undefined || ovr?.valorDiariaFds !== undefined;
  const alimUtilEdited = ovr?.almocoSemana !== undefined || ovr?.jantarSemana !== undefined;
  const alimFdsEdited = ovr?.almocoFds !== undefined || ovr?.jantarFds !== undefined;
  const mobEdited = ovr?.mobilidade !== undefined;

  // Valores exibidos — também são a referência do commitBlur
  const vdiaDisplay = (budget.valorDiaria / 100).toFixed(2);
  const alimUtilDisplay = ((budget.almocoSemana + budget.jantarSemana) / Math.max(1, budget.weekdays) / 100).toFixed(2);
  const alimFdsDisplay = ((budget.almocoFds + budget.jantarFds) / Math.max(1, budget.weekends) / 100).toFixed(2);
  const mobDisplay = mobTotal.toFixed(2);

  // A11y: popover de memória recebe foco ao abrir e devolve ao botão ao fechar
  const memoPopoverRef = useRef<HTMLDivElement>(null);
  const memoBtnRef = useRef<HTMLButtonElement>(null);
  const memoWasOpen = useRef(false);
  useEffect(() => {
    if (subtotalOpen) {
      memoPopoverRef.current?.focus();
      memoWasOpen.current = true;
    } else if (memoWasOpen.current) {
      memoWasOpen.current = false;
      memoBtnRef.current?.focus();
    }
  }, [subtotalOpen]);

  // "Padrão" = valor da REGRA ATUAL (motor), não o legado fv/dailyValue
  const defaultVDia = budget.sysValorDiaria;
  const defaultMob = budget.sysMobilidade;
  const sysAlimUtilDia = (budget.sysAlmocoSemana + budget.sysJantarSemana) / Math.max(1, budget.weekdays);
  const sysAlimFdsDia = (budget.sysAlmocoFds + budget.sysJantarFds) / Math.max(1, budget.weekends);

  const inputBase = `h-7 text-right font-mono tabular-nums text-xs rounded px-2 outline-none transition-all
    ${disabled
      ? "bg-transparent text-muted-foreground cursor-not-allowed"
      : "bg-transparent border border-transparent text-slate-700 focus:bg-card focus:border-primary focus:ring-2 focus:ring-ring/20"}`;

  const restoreBtn = (field: SheetField, key: string, hoverColor: string) => {
    const fbKey = `${sid}:${key}`;
    const restored = restoredFeedback === fbKey;
    return (
      <TooltipProvider delayDuration={restored ? 0 : 150}>
        <Tooltip open={restored ? true : undefined}>
          <TooltipTrigger asChild>
            <button
              aria-label="Restaurar valor padrão"
              onClick={() => { onRestoreField(sid, field); setRestoredFeedback(fbKey); setTimeout(() => setRestoredFeedback(r => r === fbKey ? null : r), 2000); }}
              className={`text-2xs p-1.5 -m-1 rounded transition-colors cursor-pointer shrink-0 ${restored ? "text-success-strong" : `text-muted-foreground ${hoverColor}`}`}
              style={{ minWidth: 24, minHeight: 24 }}
            >↩</button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">{restored ? "Restaurado ✓" : "Restaurar padrão (regra atual)"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <tr
      ref={ref}
      data-index={index}
      className={cn(`group transition-colors ${isSent ? "" : isNotAttended ? "opacity-40" : "hover:bg-brand-soft/20"} ${hasOvr && !isSent ? "bg-warning-soft/20" : ""}`, (isSent ? "bg-surface-muted" : undefined), (showTopBorder ? "border-t-2 border-t-border" : undefined))}
    >
      {/* Checkbox */}
      <td className="pl-3 align-middle" style={{ width: 40 }}>
        <Checkbox
          checked={selected}
          onCheckedChange={v => onToggleSelect(sid, !!v)}
          className="w-3.5 h-3.5"
          disabled={isSent || isNotAttended}
          aria-label={`Selecionar ${name}`}
        />
      </td>

      <SheetRowCollaboratorCell budget={budget} name={name} funcName={funcName} isSent={isSent} isNotAttended={isNotAttended} isNewCollab={isNewCollab} matchingActual={matchingActual} />

      {/* Diárias qty — somente leitura */}
      <SheetRowDiasCell budget={budget} />

      {/* Diária R$/dia — valor ÚNICO por linha (a diária é plana) */}
      <td className="px-4 py-3 align-middle" style={{ minWidth: "120px" }}>
        <div className="flex items-center justify-end gap-1 rounded-md px-1 -mx-1 bg-primary/5">
          {vdiaEdited && !disabled && editedMark}
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <input
                  type="text" inputMode="decimal"
                  aria-label={`Diária de ${name} (R$/dia)`}
                  disabled={disabled}
                  value={buf("vdia", vdiaDisplay)}
                  onChange={e => setbuf("vdia", e.target.value)}
                  onBlur={commitBlur("valorDia", "vdia", vdiaDisplay)}
                  onFocus={e => e.target.select()}
                  className={`${inputBase} flex-1 min-w-0 ${!disabled && vdiaEdited ? "font-bold !text-primary !border-primary" : !disabled ? "!text-primary" : ""}`}
                />
              </TooltipTrigger>
              {!disabled && (
                <TooltipContent side="top" className="text-xs">
                  {vdiaEdited ? `Editado · regra atual: R$ ${(defaultVDia / 100).toFixed(2).replace(".", ",")}` : `Diária plana pela regra atual (${funcName})`}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {vdiaEdited && !disabled && restoreBtn("valorDia", "vdia", "hover:text-primary")}
        </div>
      </td>

      {/* Alim. R$/dia — Útil + FDS empilhados */}
      <td className="px-4 py-3 align-middle" style={{ minWidth: "120px" }}>
        {/* Útil */}
        <div className="flex items-center justify-end gap-1 mb-1.5 rounded-md px-1 -mx-1 bg-primary/5">
          {alimUtilEdited && !disabled && budget.weekdays > 0 && editedMark}
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <input
                  type="text" inputMode="decimal"
                  aria-label={`Alimentação de ${name} por dia útil (R$)`}
                  disabled={disabled || budget.weekdays === 0}
                  value={budget.weekdays === 0 ? "—" : buf("alimUtil", alimUtilDisplay)}
                  onChange={e => setbuf("alimUtil", e.target.value)}
                  onBlur={commitBlur("alimentacaoUtil", "alimUtil", alimUtilDisplay)}
                  onFocus={e => e.target.select()}
                  className={`${inputBase} flex-1 min-w-0 ${!disabled && budget.weekdays > 0 && alimUtilEdited ? "font-bold !text-primary !border-primary" : !disabled && budget.weekdays > 0 ? "!text-primary" : "!text-muted-foreground"}`}
                />
              </TooltipTrigger>
              {!disabled && budget.weekdays > 0 && (
                <TooltipContent side="top" className="text-xs">
                  {alimUtilEdited
                    ? `Editado · regra atual: R$ ${(sysAlimUtilDia / 100).toFixed(2).replace(".", ",")} /dia útil`
                    : `Almoço + Jantar por dia útil`}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {alimUtilEdited && !disabled && budget.weekdays > 0 && restoreBtn("alimentacaoUtil", "alimUtil", "hover:text-primary")}
        </div>
        {/* FDS */}
        <div className="flex items-center justify-end gap-1 rounded-md px-1 -mx-1 bg-warning-soft">
          {alimFdsEdited && !disabled && budget.weekends > 0 && editedMark}
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <input
                  type="text" inputMode="decimal"
                  aria-label={`Alimentação de ${name} por dia de fim de semana (R$)`}
                  disabled={disabled || budget.weekends === 0}
                  value={budget.weekends === 0 ? "—" : buf("alimFds", alimFdsDisplay)}
                  onChange={e => setbuf("alimFds", e.target.value)}
                  onBlur={commitBlur("alimentacaoFds", "alimFds", alimFdsDisplay)}
                  onFocus={e => e.target.select()}
                  className={`${inputBase} flex-1 min-w-0 ${!disabled && budget.weekends > 0 && alimFdsEdited ? "font-bold !text-warning-strong !border-warning-strong" : !disabled && budget.weekends > 0 ? "!text-warning" : "!text-muted-foreground"}`}
                />
              </TooltipTrigger>
              {!disabled && budget.weekends > 0 && (
                <TooltipContent side="top" className="text-xs">
                  {alimFdsEdited
                    ? `Editado · regra atual: R$ ${(sysAlimFdsDia / 100).toFixed(2).replace(".", ",")} /dia FDS`
                    : `Almoço + Jantar por dia de fim de semana`}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {alimFdsEdited && !disabled && budget.weekends > 0 && restoreBtn("alimentacaoFds", "alimFds", "hover:text-warning-strong")}
        </div>
        {budget.alimEstimada && (
          <div className="flex justify-end mt-1">
            <span className="inline-flex items-center px-1.5 py-px rounded-full text-2xs font-semibold bg-warning-soft text-warning"
              title="Sem horários da passagem registrada — refeições estimadas até a compra">
              estimado
            </span>
          </div>
        )}
      </td>

      {/* Mobilidade — coluna individual */}
      <td className="px-4 py-3 text-right align-middle">
        <div className="flex items-center justify-end gap-1">
          {mobEdited && !disabled && editedMark}
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <input
                  type="text" inputMode="decimal"
                  aria-label={`Mobilidade de ${name} (R$ total ida e volta)`}
                  disabled={disabled}
                  value={buf("mob", mobDisplay)}
                  onChange={e => setbuf("mob", e.target.value)}
                  onBlur={commitBlur("mobilidade", "mob", mobDisplay)}
                  onFocus={e => e.target.select()}
                  className={`${inputBase} w-[80px] ${!disabled && mobEdited ? "text-primary font-bold" : !disabled ? "text-foreground" : ""}`}
                />
              </TooltipTrigger>
              {!disabled && (
                <TooltipContent side="top" className="text-xs">
                  {mobEdited
                    ? `Editado · regra atual: R$ ${(defaultMob / 100).toFixed(2).replace(".", ",")} (total Ida+Volta)`
                    : `Total Ida+Volta · regra atual: R$ ${(defaultMob / 100).toFixed(2).replace(".", ",")}`}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {mobEdited && !disabled && restoreBtn("mobilidade", "mob", "hover:text-primary")}
        </div>
      </td>

      {/* Subtotal — clicável → Memória de Cálculo */}
      <td className="px-4 py-3 text-right bg-brand-soft/20 relative align-middle">
        <button
          ref={memoBtnRef}
          id={`subtotal-btn-${sid}`}
          onClick={() => onToggleSubtotal(sid)}
          aria-label={`Ver memória de cálculo de ${name}`}
          aria-expanded={subtotalOpen}
          className={`text-sm font-mono font-bold tabular-nums transition-colors ${isNotAttended ? "text-muted-foreground line-through cursor-default" : "cursor-pointer hover:opacity-80"}`}
          style={isNotAttended ? {} : { color: "var(--primary)" }}
          disabled={isNotAttended}
        >
          {formatCurrency(budget.totalFinal)}
        </button>
        {matchingActual?.rhAdjusted && isSent && (
          <div className="text-2xs font-mono font-semibold tabular-nums mt-0.5 text-warning">
            {formatCurrency(matchingActual.totalValue)} ✏
          </div>
        )}
        {/* Popover de Memória de Cálculo — fecha a conta usando os segments da deflação */}
        {subtotalOpen && !isNotAttended && (
          <MemoriaCalculoPopover ref={memoPopoverRef} sid={sid} name={name} budget={budget} onClose={() => onToggleSubtotal(sid)} />
        )}
      </td>
    </tr>
  );
}));

export default SheetRow;
