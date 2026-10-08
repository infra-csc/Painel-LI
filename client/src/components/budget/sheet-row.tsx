/**
 * Linha da PLANILHA de edição do Planejado — 25/09 (modularização);
 * redesenho 08/10.
 *
 * Memoizada: digitar num input só re-renderiza ESTA linha (buffer de
 * digitação local), não a tabela inteira.
 *
 * 08/10: campos com cara de campo (fundo leve, borda ao apontar, anel no
 * foco), números em pt-BR e tabulares ("540,00", não "540.00" em
 * monoespaçada), ✱ + ↩ nos valores editados, situação numa etiqueta só e
 * `data-col`/`data-rotulo` em cada célula — é com eles que a linha vira
 * cartão na largura estreita (CSS `pla-cartao`), sem outra árvore.
 */
import { forwardRef, memo, useEffect, useRef, useState } from "react";
import { Check, PencilLine, Undo2 } from "lucide-react";
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
  /** Últimas linhas: a memória de cálculo abre para cima (não sai da tabela). */
  memoriaParaCima?: boolean;
  onToggleSelect: (sid: string, v: boolean) => void;
  onSheetEdit: (budget: CalculatedBudget, field: SheetField, rawValue: string) => void;
  onRestoreField: (sid: string, field: SheetField) => void;
  onToggleSubtotal: (sid: string) => void;
}

/** Valor do campo em pt-BR: "1.736,00". É também a referência do commit no blur. */
const paraCampo = (reais: number) => reais.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A11y: indicador NÃO cromático de célula editada (além da cor/negrito)
const editedMark = (
  <span role="img" aria-label="Valor editado manualmente" title="Valor editado manualmente"
    className="pla-editado text-2xs font-bold text-warning shrink-0 select-none">✱</span>
);

/** Colaborador + Função + Período + situação. */
function SheetRowCollaboratorCell({ budget, name, funcName, isSent, isNotAttended, isNewCollab, matchingActual }: Pick<SheetRowProps, "budget" | "name" | "funcName" | "isSent" | "isNotAttended" | "isNewCollab" | "matchingActual">) {
  const hasOvr = budget.hasOverride;
  const isCasa = isCasaType(budget.collaborator?.type);
  return (
    <td className="px-3 py-2.5 align-middle" data-col="colab">
      <div className={cn("min-w-0", !isNewCollab && "pl-3 border-l-2 border-border")}>
        {isNewCollab && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold leading-5 text-foreground truncate">{toTitleCase(name)}</span>
            {hasOvr && !isSent && (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0 bg-warning-strong" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Valores editados manualmente pelo RH</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <span className={cn("inline-flex items-center h-[18px] px-1.5 rounded text-2xs font-medium shrink-0", isCasa ? "bg-brand-soft text-primary" : "bg-muted text-slate-600")}>
              {isCasa ? "Casa" : "Freela"}
            </span>
          </div>
        )}
        {/* Função · período · situação */}
        <div className="flex items-center gap-x-1.5 gap-y-0.5 flex-wrap mt-0.5 text-xs text-muted-foreground">
          <span className={cn(isNotAttended && "line-through")}>{funcName}</span>
          {budget.cenoEmpreitaVaga && (
            budget.cenoFreelaTipo ? (
              <span className="text-2xs font-medium text-warning bg-warning-soft px-1.5 rounded shrink-0"
                title="Modalidade da empreita cenotécnica — definida na tela de Escalação (somente leitura aqui)">
                {CENO_FREELA_TIPO_LABELS[budget.cenoFreelaTipo]}
              </span>
            ) : (
              <span className="text-2xs font-medium text-warning bg-warning-soft px-1.5 rounded shrink-0"
                title="Sem modalidade de empreita: o cálculo segue a diária padrão. A escolha é feita na tela de Escalação (somente leitura aqui)">
                definir tipo na Escalação
              </span>
            )
          )}
          {budget.inclusion.scheduleStartDate && (
            <span className="tabular-nums whitespace-nowrap">
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
                  <span tabIndex={0} aria-label="RH ajustou o realizado" className="inline-flex shrink-0 text-warning rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <PencilLine className="w-3 h-3" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">RH ajustou o realizado deste colaborador</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isSent ? (
            <span className="pla-situacao inline-flex items-center gap-0.5 h-[18px] px-1.5 rounded text-2xs font-medium bg-success-soft text-success">
              <Check className="w-2.5 h-2.5" strokeWidth={3} aria-hidden="true" />Enviado
            </span>
          ) : isNotAttended ? (
            <span className="pla-situacao inline-flex items-center h-[18px] px-1.5 rounded text-2xs font-medium bg-muted text-slate-600">
              Não participou
            </span>
          ) : (
            <span className="pla-situacao inline-flex items-center h-[18px] px-1.5 rounded text-2xs font-medium bg-warning-soft text-warning">
              Pendente
            </span>
          )}
        </div>
      </div>
    </td>
  );
}

export const SheetRow = memo(forwardRef<HTMLTableRowElement, SheetRowProps>(function SheetRow({
  index, budget, name, funcName, isSent, isNotAttended, isNewCollab, showTopBorder,
  selected, ovr, matchingActual, subtotalOpen, memoriaParaCima,
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
  // total/dias com 2 casas — comparar contra o total re-multiplicado geraria
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

  // Valores exibidos — também são a referência do commitBlur. pt-BR (08/10):
  // o `parseBrNumber` do commit lê "1.736,00" e "540,00" do mesmo jeito.
  const vdiaDisplay = paraCampo(Number((budget.valorDiaria / 100).toFixed(2)));
  const alimUtilDisplay = paraCampo(Number(((budget.almocoSemana + budget.jantarSemana) / Math.max(1, budget.weekdays) / 100).toFixed(2)));
  const alimFdsDisplay = paraCampo(Number(((budget.almocoFds + budget.jantarFds) / Math.max(1, budget.weekends) / 100).toFixed(2)));
  const mobDisplay = paraCampo(Number(mobTotal.toFixed(2)));

  // Enter confirma o campo (o mesmo commit do blur) — digitar e seguir sem o mouse.
  const confirmarComEnter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") e.currentTarget.blur(); };

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

  const campo = (editado: boolean, travado: boolean, tom: "marca" | "fds" | "neutro" = "marca") => cn(
    "pla-campo h-8 w-full min-w-0 rounded-md px-2 text-right text-sm tabular-nums outline-none transition-[background-color,border-color,box-shadow] duration-150",
    travado
      ? "bg-transparent border border-transparent text-muted-foreground cursor-not-allowed"
      : "border border-transparent bg-surface-muted hover:border-border focus:bg-card focus:border-primary focus:ring-[3px] focus:ring-primary/12",
    !travado && (editado
      ? cn("font-semibold", tom === "fds" ? "text-warning" : "text-primary")
      : "text-foreground"),
  );

  const restoreBtn = (field: SheetField, key: string) => {
    const fbKey = `${sid}:${key}`;
    const restored = restoredFeedback === fbKey;
    return (
      <TooltipProvider delayDuration={restored ? 0 : 150}>
        <Tooltip open={restored ? true : undefined}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Restaurar valor padrão"
              onClick={() => { onRestoreField(sid, field); setRestoredFeedback(fbKey); setTimeout(() => setRestoredFeedback(r => r === fbKey ? null : r), 2000); }}
              className={cn(
                "pla-restaurar inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                restored ? "text-success-strong" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {restored ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">{restored ? "Restaurado ✓" : "Restaurar padrão (regra atual)"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };
  /** Mantém a coluna alinhada quando não há ✱/↩ (o campo não "pula"). */
  const vaga = <span aria-hidden="true" className="pla-vaga-acao w-6 shrink-0" />;

  return (
    <tr
      ref={ref}
      data-index={index}
      aria-selected={selected || undefined}
      className={cn(
        "pla-linha group",
        isNotAttended && "pla-linha-ausente",
        isSent && "pla-linha-enviada",
        hasOvr && !isSent && !isNotAttended && "pla-linha-ajustada",
        selected && "pla-linha-sel",
        showTopBorder && "pla-linha-nova",
      )}
    >
      {/* Checkbox */}
      <td className="pl-4 pr-1 align-middle" data-col="sel">
        <Checkbox
          checked={selected}
          onCheckedChange={v => onToggleSelect(sid, !!v)}
          disabled={isSent || isNotAttended}
          aria-label={`Selecionar ${name}`}
          className="pas-alvo disabled:opacity-25"
        />
      </td>

      <SheetRowCollaboratorCell budget={budget} name={name} funcName={funcName} isSent={isSent} isNotAttended={isNotAttended} isNewCollab={isNewCollab} matchingActual={matchingActual} />

      {/* Diárias qty — somente leitura */}
      <SheetRowDiasCell budget={budget} />

      {/* Diária R$/dia — valor ÚNICO por linha (a diária é plana) */}
      <td className="px-3 py-2.5 align-middle" data-col="diaria" data-rotulo="Diária/dia">
        <div className="flex items-center justify-end gap-1">
          {vdiaEdited && !disabled ? editedMark : null}
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
                  onKeyDown={confirmarComEnter}
                  className={campo(vdiaEdited, disabled)}
                />
              </TooltipTrigger>
              {!disabled && (
                <TooltipContent side="top" className="text-xs">
                  {vdiaEdited ? `Editado · regra atual: ${formatCurrency(defaultVDia)}` : `Diária plana pela regra atual (${funcName})`}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {vdiaEdited && !disabled ? restoreBtn("valorDia", "vdia") : vaga}
        </div>
      </td>

      {/* Alim. R$/dia — Útil + FDS */}
      <td className="px-3 py-2 align-middle" data-col="alim" data-rotulo="Alimentação/dia">
        <div className="pla-alim flex flex-col gap-1">
          {/* Útil */}
          <div className="flex items-center justify-end gap-1">
            <span className="pla-alim-rotulo flex items-center gap-1 text-2xs text-muted-foreground shrink-0 w-9 whitespace-nowrap" title="Dia útil">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />útil
            </span>
            {alimUtilEdited && !disabled && budget.weekdays > 0 ? editedMark : null}
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
                  onKeyDown={confirmarComEnter}
                    className={cn(campo(alimUtilEdited, disabled || budget.weekdays === 0), "h-7")}
                  />
                </TooltipTrigger>
                {!disabled && budget.weekdays > 0 && (
                  <TooltipContent side="top" className="text-xs">
                    {alimUtilEdited
                      ? `Editado · regra atual: ${formatCurrency(sysAlimUtilDia)} /dia útil`
                      : `Almoço + Jantar por dia útil`}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            {alimUtilEdited && !disabled && budget.weekdays > 0 ? restoreBtn("alimentacaoUtil", "alimUtil") : vaga}
          </div>
          {/* FDS */}
          <div className="flex items-center justify-end gap-1">
            <span className="pla-alim-rotulo flex items-center gap-1 text-2xs text-muted-foreground shrink-0 w-9 whitespace-nowrap" title="Fim de semana">
              <span className="w-1.5 h-1.5 rounded-full bg-warning-strong" aria-hidden="true" />FDS
            </span>
            {alimFdsEdited && !disabled && budget.weekends > 0 ? editedMark : null}
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
                  onKeyDown={confirmarComEnter}
                    className={cn(campo(alimFdsEdited, disabled || budget.weekends === 0, "fds"), "h-7")}
                  />
                </TooltipTrigger>
                {!disabled && budget.weekends > 0 && (
                  <TooltipContent side="top" className="text-xs">
                    {alimFdsEdited
                      ? `Editado · regra atual: ${formatCurrency(sysAlimFdsDia)} /dia FDS`
                      : `Almoço + Jantar por dia de fim de semana`}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            {alimFdsEdited && !disabled && budget.weekends > 0 ? restoreBtn("alimentacaoFds", "alimFds") : vaga}
          </div>
          {budget.alimEstimada && (
            <div className="flex justify-end pr-7">
              <span className="inline-flex items-center h-4 px-1.5 rounded text-2xs font-medium bg-warning-soft text-warning"
                title="Sem horários da passagem registrada — refeições estimadas até a compra">
                estimado
              </span>
            </div>
          )}
        </div>
      </td>

      {/* Mobilidade — total ida + volta */}
      <td className="px-3 py-2.5 align-middle" data-col="mob" data-rotulo="Mobilidade">
        <div className="flex items-center justify-end gap-1">
          {mobEdited && !disabled ? editedMark : null}
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
                  onKeyDown={confirmarComEnter}
                  className={campo(mobEdited, disabled)}
                />
              </TooltipTrigger>
              {!disabled && (
                <TooltipContent side="top" className="text-xs">
                  {mobEdited
                    ? `Editado · regra atual: ${formatCurrency(defaultMob)} (total Ida+Volta)`
                    : `Total Ida+Volta · regra atual: ${formatCurrency(defaultMob)}`}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {mobEdited && !disabled ? restoreBtn("mobilidade", "mob") : vaga}
        </div>
      </td>

      {/* Subtotal — clicável → Memória de cálculo */}
      <td className="pl-3 pr-4 py-2.5 text-right relative align-middle" data-col="subtotal">
        <button
          ref={memoBtnRef}
          type="button"
          id={`subtotal-btn-${sid}`}
          onClick={() => onToggleSubtotal(sid)}
          aria-label={`Ver memória de cálculo de ${name}`}
          aria-expanded={subtotalOpen}
          className={cn(
            "pla-subtotal text-sm font-semibold tabular-nums rounded-md px-1.5 -mx-1.5 py-0.5 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isNotAttended ? "text-muted-foreground line-through cursor-default" : "text-primary hover:bg-brand-soft",
            subtotalOpen && "bg-brand-soft",
          )}
          disabled={isNotAttended}
        >
          {formatCurrency(budget.totalFinal)}
        </button>
        {matchingActual?.rhAdjusted && isSent && (
          <div className="flex items-center justify-end gap-1 text-2xs font-medium tabular-nums mt-0.5 text-warning" title="Valor ajustado pelo RH no Realizado">
            {formatCurrency(matchingActual.totalValue)}
            <PencilLine className="w-3 h-3" aria-hidden="true" />
          </div>
        )}
        {/* Popover de Memória de cálculo — fecha a conta usando os segments da deflação */}
        {subtotalOpen && !isNotAttended && (
          <MemoriaCalculoPopover ref={memoPopoverRef} sid={sid} name={name} budget={budget} paraCima={memoriaParaCima} onClose={() => onToggleSubtotal(sid)} />
        )}
      </td>
    </tr>
  );
}));

export default SheetRow;
