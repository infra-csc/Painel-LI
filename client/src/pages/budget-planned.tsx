import { useState, useMemo, useEffect, useRef, useCallback, memo, forwardRef, useDeferredValue } from "react";
import { cn, formatDiasUteis, formatFds, fixEncoding, parseBrNumber } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { ActivityTimeline } from "@/components/activity-timeline";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { apiRequest } from "@/lib/queryClient";
import { Calculator, Users, Calendar, RefreshCw, Edit, Send, CheckCheck, Check, Car, Utensils, Sun, Search, Home, UserCheck, Briefcase, ChevronDown, ChevronUp, BarChart3, RotateCcw, Lock, UserX, Undo2, Eye } from "lucide-react";
import { isRhOrAdmin } from "@/lib/role-utils";
import { Textarea } from "@/components/ui/textarea";
import { EventSearchSelect } from "@/components/event-select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Event, Function, Collaborator, TeamInclusion, FunctionValue, BudgetNote, BudgetPlanned as BudgetPlannedRow, BudgetActual, Ticket } from "@shared/schema";
import { isAtendimentoFunction, atendimentoDailyCents, ATENDIMENTO_TIPOS, type AtendimentoTipo } from "@shared/atendimento";
import { calcDeflatedDailies, deflationFactorsFromSettings, percurseiroDiariaCents, PERCURSEIRO_TIPOS, FUNCAO_LOCAL_RAZAO, type DeflationSegment, type RegraDiaria, type PercurseiroTipo, type PercurseiroDiaria } from "@shared/calculation-rules";
import { CENO_FREELA_TIPO_LABELS, type CenoFreelaTipo, type CenoEmpreitaValor } from "@shared/cenotecnica-empreita";
import { useAuth } from "@/hooks/use-auth";
import { normalizeRole } from "@shared/roles";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { useSearch } from "wouter";
import { useEventoEmFoco } from "@/lib/use-evento-em-foco";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { BudgetChat, BudgetNotesBadge, BudgetNotesSnippet } from "@/components/budget-chat";
import { formatarMoeda, toTitleCase } from "@/lib/format";
import { indexarPorId } from "@/lib/indices";
import { calcularPlanejadoDaVaga, type ResultadoDoPlanejado, type VagaParaPlanejado } from "@shared/budget-engine";
import { useLinhasVirtuais, useCardsVirtuais, useMediaQuery, EspacadorLinha } from "@/components/common/virtual-rows";
import { CurrencyInput } from "@/components/common/currency-input";

import { EmptyState } from "@/components/common/empty-state";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
interface BudgetEdit {
  inclusionId: string;
  qtdDiarias: number;
  valorDiaria: number;
  valorDiariaUtil: number;
  valorDiariaFds: number;
  mobilidade: number;
  mobilidadeIda: number;
  mobilidadeVolta: number;
  almocoSemana: number;
  jantarSemana: number;
  almocoFds: number;
  jantarFds: number;
}

// Override ESPARSO: só os campos que o usuário realmente alterou entram aqui.
// Campos ausentes continuam sendo recalculados pelo motor (ex.: mobilidade e
// alimentação reagem à chegada da passagem mesmo depois de editar a diária).
// qtdDiarias NÃO faz parte do override: a contagem de dias vem sempre do
// período da escalação (weekdays + weekends).
type BudgetOverride = Partial<Omit<BudgetEdit, "inclusionId" | "qtdDiarias">> & { inclusionId: string };

// Resultado do MOTOR compartilhado (@shared/budget-engine, 23/09) + o que a
// tela precisa para exibir/agrupar. A fórmula (diária plana → deflação →
// mobilidade → alimentação) deixou de viver aqui: é a mesma do servidor.
type CalculatedBudget = ResultadoDoPlanejado & {
  inclusion: TeamInclusion;
  collaborator?: Collaborator;
  functionValue?: FunctionValue | null;
};

// Rascunho de edições persistido por evento — sobrevive a F5 e à troca de evento.
// v2: formato ESPARSO (só campos editados). O formato antigo (objeto completo
// por linha) restaurava tudo como override e congelava o recálculo — por isso
// é DESCARTADO, nunca migrado às cegas.
// Chave por USUÁRIO + evento (23/09): a chave só por evento fazia o rascunho
// de uma pessoa aparecer para outra no mesmo navegador (mesmo padrão do
// formulário de inclusão em grade). Rascunho na chave antiga (só evento) é
// ignorado e apagado — nunca lido para outra conta.
const draftStorageKey = (eventId: string, userId: string) => `budget-overrides-draft-v2:${userId}:${eventId}`;
const legacyDraftStorageKey = (eventId: string) => `budget-overrides-draft:${eventId}`;
const legacyV2DraftStorageKey = (eventId: string) => `budget-overrides-draft-v2:${eventId}`;
// Remove um rascunho no formato antigo; retorna true se ele existia e não há v2
// (caso em que o usuário merece um aviso único).
function discardLegacyDraft(eventId: string, userId: string): boolean {
  if (!eventId) return false;
  try {
    // v2 sem usuário: some em silêncio (formato certo, chave antiga).
    localStorage.removeItem(legacyV2DraftStorageKey(eventId));
    const hadLegacy = localStorage.getItem(legacyDraftStorageKey(eventId)) !== null;
    if (!hadLegacy) return false;
    localStorage.removeItem(legacyDraftStorageKey(eventId));
    return localStorage.getItem(draftStorageKey(eventId, userId)) === null;
  } catch {
    return false;
  }
}
function readDraft(eventId: string, userId: string): Record<string, BudgetOverride> {
  if (!eventId || !userId) return {};
  try {
    const raw = localStorage.getItem(draftStorageKey(eventId, userId));
    const parsed: Record<string, BudgetOverride & { qtdDiarias?: number }> = raw ? JSON.parse(raw) : {};
    // Defesa em profundidade: qtdDiarias saiu do modelo de override
    Object.values(parsed).forEach(o => { if (o) delete o.qtdDiarias; });
    return parsed;
  } catch {
    // rascunho corrompido ou localStorage indisponível — começa vazio
    return {};
  }
}

// Formatador único de moeda (lib/format) — antes era uma cópia local do Intl.
const formatCurrency = formatarMoeda;

// "4d × R$ 540,00 + 2d × R$ 486,00" — memória compacta da deflação por faixa
const formatSegmentsMemo = (segments: DeflationSegment[]) =>
  segments.map(s => `${s.days}d × ${formatCurrency(s.dailyCents)}`).join(' + ');

// Popover de edição em lote da planilha — antes triplicado nos 3 cabeçalhos.
// Aplica somente aos pendentes visíveis: linha enviada ou ausente nunca recebe
// override, então a antiga opção "Apenas Pendentes" deixou de existir.
function BatchPopover({ title, value, onChangeValue, onCancel, onApply }: {
  title: string;
  value: string;
  onChangeValue: (v: string) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className="absolute right-0 top-full mt-1 z-50 bg-card rounded-xl border border-border shadow-3 p-3 w-56 text-left"
      style={{minWidth:'220px'}}
    >
      <div className="text-2xs font-semibold text-slate-600 mb-2">{title}</div>
      <input
        type="text" inputMode="decimal" placeholder="0,00"
        aria-label={title}
        value={value}
        onChange={e => onChangeValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onApply(); }}
        autoFocus
        className="w-full h-8 border border-border rounded-md px-2 text-right text-xs font-mono outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 mb-2"
      />
      <p className="text-2xs text-muted-foreground mb-3">Aplica aos pendentes visíveis (filtro atual)</p>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 h-7 text-2xs border border-border rounded-md text-muted-foreground hover:bg-surface-muted transition-colors">Cancelar</button>
        <button onClick={onApply} className="flex-1 h-7 text-2xs rounded-md text-primary-foreground font-semibold bg-primary">Aplicar</button>
      </div>
    </div>
  );
}

type SheetField = 'valorDia' | 'alimentacao' | 'alimentacaoUtil' | 'alimentacaoFds' | 'mobilidade';

interface SheetRowProps {
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

// Linha da planilha memoizada: digitar num input só re-renderiza ESTA linha
// (buffer de digitação local), não a tabela inteira.
const SheetRow = memo(forwardRef<HTMLTableRowElement, SheetRowProps>(function SheetRow({
  index, budget, name, funcName, isSent, isNotAttended, isNewCollab, showTopBorder,
  selected, ovr, matchingActual, subtotalOpen,
  onToggleSelect, onSheetEdit, onRestoreField, onToggleSubtotal,
}, ref) {
  const sid = budget.inclusion.id;
  const hasOvr = budget.hasOverride;
  const isCasaType = budget.collaborator?.type === 'casa' || budget.collaborator?.type === 'local';
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

  // A11y: indicador NÃO cromático de célula editada (além da cor/negrito)
  const editedMark = (
    <span role="img" aria-label="Valor editado manualmente" title="Valor editado manualmente"
      className="text-2xs font-bold text-muted-foreground shrink-0 select-none">✱</span>
  );

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
      ? 'bg-transparent text-muted-foreground cursor-not-allowed'
      : 'bg-transparent border border-transparent text-slate-700 focus:bg-card focus:border-primary focus:ring-2 focus:ring-ring/20'}`;

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
              className={`text-2xs p-1.5 -m-1 rounded transition-colors cursor-pointer shrink-0 ${restored ? 'text-success-strong' : `text-muted-foreground ${hoverColor}`}`}
              style={{minWidth:24, minHeight:24}}
            >↩</button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">{restored ? 'Restaurado ✓' : 'Restaurar padrão (regra atual)'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <tr
      ref={ref}
      data-index={index}
      className={cn(`group transition-colors ${isSent ? '' : isNotAttended ? 'opacity-40' : 'hover:bg-brand-soft/20'} ${hasOvr && !isSent ? 'bg-warning-soft/20' : ''}`, (isSent ? "bg-surface-muted" : undefined), (showTopBorder ? "border-t-2 border-t-border" : undefined))}
    >
      {/* Checkbox */}
      <td className="pl-3 align-middle" style={{ width:40 }}>
        <Checkbox
          checked={selected}
          onCheckedChange={v => onToggleSelect(sid, !!v)}
          className="w-3.5 h-3.5"
          disabled={isSent || isNotAttended}
          aria-label={`Selecionar ${name}`}
        />
      </td>

      {/* Colaborador + Função + Período — coluna rica com avatar */}
      <td className="pl-4 pr-4 py-3 align-middle" style={{ minWidth:'280px' }}>
        <div className="flex items-start gap-3">
          {/* Avatar com iniciais */}
          {isNewCollab && (() => {
            const initials = name.split(' ').filter(Boolean).slice(0,2).map((w:string) => w[0]).join('').toUpperCase();
            return (
              <div className={cn("shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-2xs font-bold mt-0.5", isCasaType ? "bg-brand-soft text-primary" : "bg-danger-soft text-danger")}>
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
                <span className={cn("inline-flex items-center justify-center text-2xs font-semibold rounded-full py-0.5 px-2 min-w-[44px]", isCasaType ? "bg-brand-soft text-primary" : "bg-danger-soft text-danger")}>
                  {isCasaType ? 'Casa' : 'Freela'}
                </span>
              </div>
            )}
            {/* Linha 2: Função | Período */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-2xs ${isNotAttended ? 'line-through text-muted-foreground' : 'text-muted-foreground'}`}>
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
                  · {new Date(budget.inclusion.scheduleStartDate + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}
                  {budget.inclusion.scheduleEndDate && budget.inclusion.scheduleStartDate !== budget.inclusion.scheduleEndDate && (
                    <> → {new Date(budget.inclusion.scheduleEndDate + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}</>
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

      {/* Diárias qty — somente leitura */}
      <td className="px-3 py-3 text-center bg-surface-muted align-middle">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm font-semibold tabular-nums font-mono text-slate-600 cursor-default select-none">
                {budget.diasComDiaria}
                {(budget.regraDiaria === 'fds' || budget.regraDiaria === 'nenhuma' || budget.isPercurso) && budget.diasComDiaria !== budget.weekdays + budget.weekends && (
                  <span className="text-2xs font-sans font-normal text-muted-foreground">/{budget.weekdays + budget.weekends}</span>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[260px]">
              <div className="flex flex-col gap-0.5">
                {budget.weekdays > 0 && (
                  <span>
                    <span className="text-primary">●</span> Útil: {budget.weekdays}×
                    {budget.regraDiaria === 'fds' && <span className="text-muted-foreground"> — sem diária (CLT)</span>}
                    {budget.regraDiaria === 'nenhuma' && <span className="text-muted-foreground"> — sem diária</span>}
                  </span>
                )}
                {budget.weekends > 0 && (
                  <span>
                    <span className="text-warning-strong">●</span> FDS: {budget.weekends}×
                    {budget.regraDiaria === 'nenhuma' && <span className="text-muted-foreground"> — sem diária</span>}
                  </span>
                )}
                {budget.regraDiaria === 'fds' && (
                  <span className="text-muted-foreground mt-0.5">Casa (CLT): diária só nos fins de semana</span>
                )}
                {budget.regraDiaria === 'nenhuma' && (
                  <span className="text-muted-foreground mt-0.5">Cenotécnica de casa (CLT): não recebe diária</span>
                )}
                {budget.isPercurso && (
                  <span className="text-muted-foreground mt-0.5">
                    Percurso: {budget.diasComDiaria} {budget.diasComDiaria === 1 ? 'diária' : 'diárias'} ({budget.inclusion.needsTicket ? 'em viagem — regra fixa de 2 diárias' : 'local (SP/Grande SP) — regra fixa de 1 diária'}), pacote fechado por diária
                  </span>
                )}
                {budget.cenoEmpreita && (
                  <span className="text-muted-foreground mt-0.5">
                    Empreita {CENO_FREELA_TIPO_LABELS[budget.cenoEmpreita.tipo]}: valor fechado por {budget.cenoEmpreita.dias} {budget.cenoEmpreita.dias === 1 ? 'dia' : 'dias'} (não é diária × dias) — modalidade definida na Escalação
                  </span>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>

      {/* Diária R$/dia — valor ÚNICO por linha (a diária é plana) */}
      <td className="px-4 py-3 align-middle" style={{ minWidth:'120px' }}>
        <div className="flex items-center justify-end gap-1 rounded-md px-1 -mx-1 bg-primary/5">
          {vdiaEdited && !disabled && editedMark}
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <input
                  type="text" inputMode="decimal"
                  aria-label={`Diária de ${name} (R$/dia)`}
                  disabled={disabled}
                  value={buf('vdia', vdiaDisplay)}
                  onChange={e => setbuf('vdia', e.target.value)}
                  onBlur={commitBlur('valorDia', 'vdia', vdiaDisplay)}
                  onFocus={e => e.target.select()}
                  className={`${inputBase} flex-1 min-w-0 ${!disabled && vdiaEdited ? 'font-bold !text-primary !border-primary' : !disabled ? '!text-primary' : ''}`}
                />
              </TooltipTrigger>
              {!disabled && (
                <TooltipContent side="top" className="text-xs">
                  {vdiaEdited ? `Editado · regra atual: R$ ${(defaultVDia / 100).toFixed(2).replace('.', ',')}` : `Diária plana pela regra atual (${funcName})`}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {vdiaEdited && !disabled && restoreBtn('valorDia', 'vdia', 'hover:text-primary')}
        </div>
      </td>

      {/* Alim. R$/dia — Útil + FDS empilhados */}
      <td className="px-4 py-3 align-middle" style={{ minWidth:'120px' }}>
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
                  value={budget.weekdays === 0 ? '—' : buf('alimUtil', alimUtilDisplay)}
                  onChange={e => setbuf('alimUtil', e.target.value)}
                  onBlur={commitBlur('alimentacaoUtil', 'alimUtil', alimUtilDisplay)}
                  onFocus={e => e.target.select()}
                  className={`${inputBase} flex-1 min-w-0 ${!disabled && budget.weekdays > 0 && alimUtilEdited ? 'font-bold !text-primary !border-primary' : !disabled && budget.weekdays > 0 ? '!text-primary' : '!text-muted-foreground'}`}
                />
              </TooltipTrigger>
              {!disabled && budget.weekdays > 0 && (
                <TooltipContent side="top" className="text-xs">
                  {alimUtilEdited
                    ? `Editado · regra atual: R$ ${(sysAlimUtilDia / 100).toFixed(2).replace('.', ',')} /dia útil`
                    : `Almoço + Jantar por dia útil`}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {alimUtilEdited && !disabled && budget.weekdays > 0 && restoreBtn('alimentacaoUtil', 'alimUtil', 'hover:text-primary')}
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
                  value={budget.weekends === 0 ? '—' : buf('alimFds', alimFdsDisplay)}
                  onChange={e => setbuf('alimFds', e.target.value)}
                  onBlur={commitBlur('alimentacaoFds', 'alimFds', alimFdsDisplay)}
                  onFocus={e => e.target.select()}
                  className={`${inputBase} flex-1 min-w-0 ${!disabled && budget.weekends > 0 && alimFdsEdited ? 'font-bold !text-warning-strong !border-warning-strong' : !disabled && budget.weekends > 0 ? '!text-warning' : '!text-muted-foreground'}`}
                />
              </TooltipTrigger>
              {!disabled && budget.weekends > 0 && (
                <TooltipContent side="top" className="text-xs">
                  {alimFdsEdited
                    ? `Editado · regra atual: R$ ${(sysAlimFdsDia / 100).toFixed(2).replace('.', ',')} /dia FDS`
                    : `Almoço + Jantar por dia de fim de semana`}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {alimFdsEdited && !disabled && budget.weekends > 0 && restoreBtn('alimentacaoFds', 'alimFds', 'hover:text-warning-strong')}
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
                  value={buf('mob', mobDisplay)}
                  onChange={e => setbuf('mob', e.target.value)}
                  onBlur={commitBlur('mobilidade', 'mob', mobDisplay)}
                  onFocus={e => e.target.select()}
                  className={`${inputBase} w-[80px] ${!disabled && mobEdited ? 'text-primary font-bold' : !disabled ? 'text-foreground' : ''}`}
                />
              </TooltipTrigger>
              {!disabled && (
                <TooltipContent side="top" className="text-xs">
                  {mobEdited
                    ? `Editado · regra atual: R$ ${(defaultMob / 100).toFixed(2).replace('.', ',')} (total Ida+Volta)`
                    : `Total Ida+Volta · regra atual: R$ ${(defaultMob / 100).toFixed(2).replace('.', ',')}`}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {mobEdited && !disabled && restoreBtn('mobilidade', 'mob', 'hover:text-primary')}
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
          className={`text-sm font-mono font-bold tabular-nums transition-colors ${isNotAttended ? 'text-muted-foreground line-through cursor-default' : 'cursor-pointer hover:opacity-80'}`}
          style={isNotAttended ? {} : {color:'var(--primary)'}}
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
        {subtotalOpen && !isNotAttended && (() => {
          const alimTotal = budget.almocoSemana + budget.jantarSemana + budget.almocoFds + budget.jantarFds;
          const totalDias = budget.weekdays + budget.weekends;
          return (
            <div
              id={`subtotal-popover-${sid}`}
              ref={memoPopoverRef}
              role="dialog"
              aria-label={`Memória de cálculo de ${toTitleCase(name)}`}
              tabIndex={-1}
              onClick={e => e.stopPropagation()}
              className="absolute bg-card border border-border rounded-xl shadow-2 py-3.5 px-4 text-left outline-none" style={{
                right:0,
                top:'100%',
                zIndex:60,
                minWidth:270,
              }}
            >
              <div className="text-2xs font-bold text-primary mb-2.5 tracking-wider uppercase">
                Memória de Cálculo · {toTitleCase(name)}
              </div>
              <div className="text-2xs text-muted-foreground mb-2">
                {totalDias} {totalDias === 1 ? 'dia' : 'dias'}
                {budget.regraDiaria === 'fds' && ` · diária em ${budget.diasComDiaria} (só fins de semana — CLT)`}
                {budget.regraDiaria === 'nenhuma' && ` · sem diária (cenotécnica CLT)`}
                {budget.isPercurso && ` · ${budget.diasComDiaria} ${budget.diasComDiaria === 1 ? 'diária' : 'diárias'} (percurso ${budget.inclusion.needsTicket ? 'em viagem — regra fixa' : 'local — regra fixa'}, pacote fechado)`}
                {budget.cenoEmpreita && ` · empreita ${CENO_FREELA_TIPO_LABELS[budget.cenoEmpreita.tipo]} — valor fechado por ${budget.cenoEmpreita.dias} ${budget.cenoEmpreita.dias === 1 ? 'dia' : 'dias'}`}
                {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && ` · ${new Date(budget.inclusion.scheduleStartDate + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})} → ${new Date(budget.inclusion.scheduleEndDate + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}`}
              </div>
              <table className="text-xs" style={{ width:'100%', borderCollapse:'collapse' }}>
                <tbody>
                  {budget.deflationSegments.map((seg, i) => (
                    <tr key={i}>
                      <td className="pb-1 text-primary font-semibold">
                        {seg.days} {seg.days === 1 ? 'dia' : 'dias'} × {formatCurrency(seg.dailyCents)}
                        {seg.factor < 1 && <span className="text-muted-foreground font-normal"> ({Math.round(seg.factor * 100)}% · {seg.label})</span>}
                      </td>
                      <td className="pb-1 text-right text-slate-700 font-mono">{formatCurrency(seg.totalCents)}</td>
                    </tr>
                  ))}
                  {budget.isPercurso && budget.percurseiro && (
                    ([['Motoqueiro', budget.percurseiro.motoqueiro], ['Fee Ivan', budget.percurseiro.fee], ['Alimentação (3 refeições)', budget.percurseiro.alimentacao], ['Ajuda transporte', budget.percurseiro.transporte], ['NF', budget.percurseiro.nf]] as [string, number][]).map(([lbl, v]) => (
                      <tr key={lbl}>
                        <td className="pb-0.5 text-muted-foreground text-2xs pl-2">{lbl} <span className="text-muted-foreground">× {budget.diasComDiaria}</span></td>
                        <td className="pb-0.5 text-right text-muted-foreground font-mono text-2xs">{formatCurrency(v * budget.diasComDiaria)}</td>
                      </tr>
                    ))
                  )}
                  <tr>
                    <td className="pb-2 text-muted-foreground text-2xs pl-2">
                      {budget.isPercurso
                        ? `Diárias (pacote fechado — ${PERCURSEIRO_TIPOS.find(t => t.value === (budget.percurseiroTipo ?? 'tipo_1'))?.label}${budget.percurseiroTipo ? '' : ' provisório'})`
                        : budget.cenoEmpreita
                        ? `Diárias (empreita — ${CENO_FREELA_TIPO_LABELS[budget.cenoEmpreita.tipo]} · ${budget.cenoEmpreita.dias} ${budget.cenoEmpreita.dias === 1 ? 'dia' : 'dias'} · valor fechado)`
                        : budget.regraDiaria === 'nenhuma' ? 'Diárias (cenotécnica CLT: sem diária)' : 'Diárias (com deflação por período)'}
                      {budget.cenoEmpreita?.extrapolado && (
                        <span className="text-warning font-semibold"> · valor extrapolado (tabela cobre 2 a 6 dias)</span>
                      )}
                    </td>
                    <td className="pb-2 text-right text-muted-foreground font-mono text-2xs">{formatCurrency(budget.subtotalDiarias)}</td>
                  </tr>
                  {budget.isPercurso && (
                    <tr>
                      <td colSpan={2} className="pb-1.5 text-muted-foreground text-2xs pl-2">Alimentação e mobilidade: incluídas no pacote do percurseiro</td>
                    </tr>
                  )}
                  {alimTotal > 0 && (
                    <tr>
                      <td className="pb-1 text-warning font-semibold">
                        Alimentação{budget.alimEstimada ? <span className="text-warning font-normal text-2xs"> (estimada)</span> : null}
                      </td>
                      <td className="pb-1 text-right text-slate-700 font-mono">{formatCurrency(alimTotal)}</td>
                    </tr>
                  )}
                  {budget.mobilidade > 0 && (
                    <tr>
                      <td className="pb-1 text-primary font-semibold">Mobilidade (total)</td>
                      <td className="pb-1 text-right text-slate-700 font-mono">{formatCurrency(budget.mobilidade)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-t-border">
                    <td className="pt-2 font-bold text-primary text-sm">Total</td>
                    <td className="pt-2 text-right font-bold text-primary font-mono text-sm">{formatCurrency(budget.totalFinal)}</td>
                  </tr>
                </tfoot>
              </table>
              <button
                onClick={() => onToggleSubtotal(sid)}
                className="mt-2.5 text-2xs text-muted-foreground cursor-pointer border-0 block text-center bg-transparent w-full"
              >fechar</button>
            </div>
          );
        })()}
      </td>
    </tr>
  );
}));

export default function BudgetPlannedPage() {
  usePageTitle("Planejado");
  const searchString = useSearch();
  const { urlCollaboratorId, urlFunctionId } = useMemo(() => {
    const p = new URLSearchParams(searchString);
    return {
      urlCollaboratorId: p.get("collaborator") || "",
      urlFunctionId: p.get("function") || "",
    };
  }, [searchString]);
  const [highlightCardId, setHighlightCardId] = useState<string>("");

  // Evento em foco (23/09): antes lia `?event=` só na montagem e nunca escrevia —
  // trocar de tela pedia o evento de novo e o link copiado não carregava o contexto.
  const { eventId: selectedEventId, setEventId: setSelectedEventId, sanitize: sanearEventoEmFoco } = useEventoEmFoco();
  const [editingBudget, setEditingBudget] = useState<BudgetEdit | null>(null);
  const [editingBudgetInfo, setEditingBudgetInfo] = useState<{ name: string; functionName: string; type: string; weekdays: number; weekends: number; diasComDiaria: number; regraDiaria: RegraDiaria; period: string; vooChegadaIda?: string | null; vooPartidaVolta?: string | null; fonteVoo?: "passagem" | "sugerido" | "nenhum"; alimEstimada?: boolean; voa?: boolean; isAtend?: boolean; atendimentoTipo?: AtendimentoTipo | null; savedAtendimentoTipo?: AtendimentoTipo | null; isPercurso?: boolean; funcaoLocal?: boolean; percurseiroTipo?: PercurseiroTipo | null; savedPercurseiroTipo?: PercurseiroTipo | null; percurseiro?: PercurseiroDiaria | null; cenoEmpreitaVaga?: boolean; cenoFreelaTipo?: CenoFreelaTipo | null; cenoEmpreita?: CenoEmpreitaValor | null; inclusionId?: string } | null>(null);
  const [editingBudgetPlannedId, setEditingBudgetPlannedId] = useState<string | null>(null);
  // Tipo escolhido no modal e AINDA NÃO persistido na escalação (null = igual
  // ao gravado). Persistido no Salvar, descartado no Cancelar — comportamento
  // normal de formulário, sem PATCH imediato ao clicar.
  const [pendingAtendimentoTipo, setPendingAtendimentoTipo] = useState<AtendimentoTipo | null>(null);
  const [pendingPercurseiroTipo, setPendingPercurseiroTipo] = useState<PercurseiroTipo | null>(null);
  const [savingTipo, setSavingTipo] = useState(false);

  // Aplica a nova diária no modal (sem tocar em originalModalValues/Total: a
  // troca de tipo é uma mudança REAL, aparece no "▲ vs original"). Preserva a
  // edição manual da diária em curso: só sobrescreve se o valor atual ainda
  // era o padrão anterior. Retorna se a edição manual foi mantida.
  const applyTipoDiariaNoModal = (novoValor: number | null | undefined): boolean => {
    if (novoValor == null) return false;
    const prevDefault = defaultBudgetValues?.valorDiaria;
    const manualPreserved = !!editingBudget && prevDefault !== undefined && editingBudget.valorDiaria !== prevDefault;
    if (!manualPreserved) {
      setEditingBudget(prev => prev ? { ...prev, valorDiaria: novoValor, valorDiariaUtil: novoValor, valorDiariaFds: novoValor } : prev);
      setModalBufs(p => { const n = { ...p }; delete n.vdia; return n; });
    }
    // O "padrão" do modal acompanha a nova tarifa — assim salvar sem outras
    // edições não cria override desnecessário.
    setDefaultBudgetValues(prev => prev ? { ...prev, valorDiaria: novoValor, valorDiariaUtil: novoValor, valorDiariaFds: novoValor } : prev);
    return manualPreserved;
  };

  // Percurso (motoqueiro): Tipo 1 / Tipo 2 definido aqui pelo RH quando a
  // escalação veio sem tipo. Só estado local; persiste no Salvar.
  const chooseLocalPercurseiroTipo = (tipo: PercurseiroTipo) => {
    if (!editingBudgetInfo) return;
    const pacote = percurseiroDiariaCents(tipo, systemSettings);
    setPendingPercurseiroTipo(tipo === (editingBudgetInfo.savedPercurseiroTipo ?? null) ? null : tipo);
    setEditingBudgetInfo(prev => prev ? { ...prev, percurseiroTipo: tipo, percurseiro: pacote } : prev);
    applyTipoDiariaNoModal(pacote?.total);
  };

  // Muitas escalações de atendimento viraram Planejado ANTES do flag existir
  // (backfill marcou todas como Executivo de Contas). O RH corrige por aqui,
  // sem voltar à escalação. Só estado local; persiste no Salvar.
  const chooseLocalAtendimentoTipo = (tipo: AtendimentoTipo) => {
    if (!editingBudgetInfo) return;
    setPendingAtendimentoTipo(tipo === (editingBudgetInfo.savedAtendimentoTipo ?? null) ? null : tipo);
    setEditingBudgetInfo(prev => prev ? { ...prev, atendimentoTipo: tipo } : prev);
    applyTipoDiariaNoModal(atendimentoDailyCents(tipo, systemSettings));
  };

  // Persistência dos tipos NA ESCALAÇÃO (rotas dedicadas aceitam o papel
  // financeiro). Chamado pelo Salvar do modal, antes de gravar o orçamento.
  const persistPendingTipos = async (inclusionId: string): Promise<boolean> => {
    if (pendingAtendimentoTipo == null && pendingPercurseiroTipo == null) return true;
    setSavingTipo(true);
    try {
      if (pendingAtendimentoTipo != null) {
        await apiRequest("PATCH", `/api/team-inclusions/${inclusionId}/atendimento-tipo`, { atendimentoTipo: pendingAtendimentoTipo });
      }
      if (pendingPercurseiroTipo != null) {
        await apiRequest("PATCH", `/api/team-inclusions/${inclusionId}/percurseiro-tipo`, { percurseiroTipo: pendingPercurseiroTipo });
      }
      qc.invalidateQueries({ queryKey: ["/api/team-inclusions", selectedEventId] });
      qc.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      setPendingAtendimentoTipo(null);
      setPendingPercurseiroTipo(null);
      return true;
    } catch (e) {
      toast({ title: "Não foi possível salvar o tipo na escalação", description: apiErrorMessage(e, "Tente novamente."), variant: "destructive" });
      return false;
    } finally {
      setSavingTipo(false);
    }
  };
  // `user` precisa existir antes do rascunho: a chave dele inclui o id (23/09).
  const { user } = useAuth();
  const usuarioId = user?.id ?? "";
  const [budgetOverrides, setBudgetOverrides] = useState<Record<string, BudgetOverride>>(() => readDraft(selectedEventId, usuarioId));
  // Aviso discreto de que um rascunho salvo foi restaurado no load
  const [draftRestored, setDraftRestored] = useState<boolean>(() => Object.keys(readDraft(selectedEventId, usuarioId)).length > 0);
  // Evento (e usuário) dono do rascunho em memória — impede salvar o rascunho
  // de um evento na chave de outro durante a troca de evento.
  const draftEventRef = useRef(selectedEventId);
  const draftUserRef = useRef(usuarioId);
  // Seleção ÚNICA, compartilhada entre a Visão Geral (cards) e a Planilha
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Confirmação de envio unificada (cards, envio individual e planilha)
  const [confirmSend, setConfirmSend] = useState<{ ids: string[]; source: 'single' | 'batch' } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  // `useDeferredValue` (23/09): refiltrar a cada tecla travava a digitação nas
  // listas grandes. O input continua controlado por `searchTerm`. A limpeza da
  // seleção mora logo depois de `filteredBudgets` (só tira o que ficou oculto).
  const buscaAplicada = useDeferredValue(searchTerm);
  const [sortBy, setSortBy] = useState<string>("name_asc");
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const [notAttendedModal, setNotAttendedModal] = useState<{ id?: string; budget?: CalculatedBudget; name: string; functionName: string } | null>(null);
  const [notAttendedReason, setNotAttendedReason] = useState("");
  const [activeTab, setActiveTab] = useState<'overview' | 'sheet'>('overview');
  const [isApplyingDefaults, setIsApplyingDefaults] = useState(false);
  const [modalTab, setModalTab] = useState<'custos' | 'observacoes' | 'historico'>('custos');
  const [modalViewMode, setModalViewMode] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [batchPopover, setBatchPopover] = useState<{ field: 'vdia'|'alim'|'mob'; value: string } | null>(null);
  const [batchApplied, setBatchApplied] = useState<Set<'vdia'|'alim'|'mob'>>(new Set());
  const [batchHistory, setBatchHistory] = useState<{ fields: ('vdia'|'alim'|'mob')[]; prev: Record<string, BudgetOverride> } | null>(null);
  const batchPopoverRef = useRef<HTMLDivElement>(null);
  // A11y: botão ✏ que abriu o popover de lote — recebe o foco de volta ao fechar
  const batchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [restoreModal, setRestoreModal] = useState<{ id: string; name: string; functionName: string; startDate?: string; endDate?: string } | null>(null);
  const [subtotalOpenId, setSubtotalOpenId] = useState<string | null>(null);
  const [advancedBatch, setAdvancedBatch] = useState<{
    target: 'all'|'casa'|'freela'|'selected';
    field: 'vdia'|'alimUtil'|'alimFds'|'mob';
    value: string;
  } | null>(null);
  const batchValueRef = useRef<HTMLInputElement>(null);
  // Só pergunta "Descartar?" se já há um valor digitado no lote.
  const descarteLote = useConfirmarDescarte(!!advancedBatch?.value);
  // Buffer de digitação dos inputs do modal — permite "540,50" sem o controlled
  // input engolir a vírgula (mesmo padrão do SheetRow)
  const [modalBufs, setModalBufs] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const qc = useQueryClient();

  // `normalizeRole` (23/09): papéis legados ("administrador", "producao")
  // perdiam a edição nesta tela.
  const papel = normalizeRole(user?.role);
  const canEdit = papel === "admin" || papel === "production";
  const canMarkNotAttended = isRhOrAdmin(user);

  // Rascunho no formato ANTIGO (pré-v2): descarta e avisa UMA vez por evento —
  // migrá-lo às cegas restauraria tudo como override e travaria o recálculo.
  const warnedLegacyDraftRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedEventId || warnedLegacyDraftRef.current.has(selectedEventId)) return;
    if (discardLegacyDraft(selectedEventId, usuarioId)) {
      warnedLegacyDraftRef.current.add(selectedEventId);
      toast({
        title: "Rascunho antigo descartado",
        description: "Um rascunho no formato antigo foi descartado para não travar os cálculos automáticos.",
      });
    }
  }, [selectedEventId, usuarioId, toast]);

  // Carrega o rascunho salvo ao trocar de evento
  useEffect(() => {
    if (draftEventRef.current === selectedEventId && draftUserRef.current === usuarioId) return;
    draftEventRef.current = selectedEventId;
    draftUserRef.current = usuarioId;
    const draft = readDraft(selectedEventId, usuarioId);
    setBudgetOverrides(draft);
    setDraftRestored(Object.keys(draft).length > 0);
  }, [selectedEventId, usuarioId]);

  // Salva o rascunho a cada mudança, sempre na chave do evento dono do rascunho
  useEffect(() => {
    const eventId = draftEventRef.current;
    const userId = draftUserRef.current;
    if (!eventId || !userId) return;
    try {
      if (Object.keys(budgetOverrides).length === 0) {
        localStorage.removeItem(draftStorageKey(eventId, userId));
      } else {
        localStorage.setItem(draftStorageKey(eventId, userId), JSON.stringify(budgetOverrides));
      }
    } catch {
      // localStorage cheio ou indisponível — o rascunho segue apenas em memória
    }
  }, [budgetOverrides]);

  // Remove do rascunho os itens já enviados com sucesso para o Realizado
  const clearDraftEntries = (ids: string[]) => {
    setBudgetOverrides(prev => {
      const next = { ...prev };
      ids.forEach(id => delete next[id]);
      return next;
    });
  };

  const toggleCardSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Seleciona todos os SELECIONÁVEIS visíveis (respeita filtros; exclui
  // enviados e "não participou") — mesma base do checkbox da planilha.
  const selectAllCards = () => {
    setSelectedIds(new Set(selectableFiltered.map(b => b.inclusion.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const toggleCollapse = (id: string) => {
    setCollapsedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  // Evento em foco que não existe mais (excluído) é descartado assim que a lista chega (23/09).
  useEffect(() => { if (events?.length) sanearEventoEmFoco(events.map(e => e.id)); }, [events, sanearEventoEmFoco]);
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const { data: functionValues, isLoading: isLoadingFunctionValues, isError: isErrorFunctionValues, refetch: refetchFunctionValues } = useQuery<FunctionValue[]>({ queryKey: ["/api/function-values"] });
  // Passagens: fonte dos horários de voo para mobilidade e alimentação
  const { data: allTickets } = useQuery<Ticket[]>({ queryKey: ["/api/tickets"] });
  const ticketByInclusion = useMemo(() => {
    const m = new Map<string, Ticket>();
    for (const t of allTickets || []) if (t.teamInclusionId) m.set(t.teamInclusionId, t);
    return m;
  }, [allTickets]);
  // Sem `queryFn` caseiro (23/09): o padrão do queryClient checa `res.ok`,
  // trata 401 e HTML de servidor desatualizado — o de antes gravava o corpo
  // do erro no cache como se fossem os valores.
  const { data: systemSettings } = useQuery<Record<string, number>>({
    queryKey: ["/api/system-settings"],
  });

  const { data: existingActuals } = useQuery<BudgetActual[]>({
    queryKey: ["/api/budget-actual", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-actual?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch budget actual");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: allBudgetPlanned } = useQuery<BudgetPlannedRow[]>({
    queryKey: ["/api/budget-planned", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-planned?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch budget planned");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: eventNotes = [] } = useQuery<BudgetNote[]>({
    queryKey: ["/api/budget-notes/by-event", "planned", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-notes/by-event?entityType=planned&eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch event notes");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const toggleNotAttendedMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/budget-planned/${id}/toggle-not-attended`, { reason });
      return res.json();
    },
    onSuccess: (data: BudgetPlannedRow, { id }) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-planned", selectedEventId] });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      setNotAttendedModal(null);
      setNotAttendedReason("");
      if (data.didNotAttend) {
        // Remove de seleção se estava selecionado
        const plan = allBudgetPlanned?.find(p => p.id === id);
        const budget = plan && calculatedBudgets.find(b => b.inclusion.collaboratorId === plan.collaboratorId && b.inclusion.functionId === plan.functionId);
        if (budget) setSelectedIds(prev => { const s = new Set(Array.from(prev)); s.delete(budget.inclusion.id); return s; });
        toast({ title: "Colaborador marcado como não participou" });
      } else {
        toast({ title: "Participação restaurada", variant: "success" });
      }
    },
    onError: (err: unknown) => toast({ title: "Não foi possível atualizar a participação", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const createAndMarkNotAttendedMutation = useMutation({
    mutationFn: async ({ budget, reason }: { budget: CalculatedBudget; reason: string }) => {
      // Dias persistidos = dias que efetivamente recebem diária (casa: só fds)
      const totalDias = budget.diasComDiaria ?? (budget.weekdays + budget.weekends);
      const weightedDailyValue = totalDias > 0
        ? Math.round(budget.subtotalDiarias / totalDias)
        : budget.valorDiaria;
      const plannedData = {
        eventId: budget.inclusion.eventId,
        collaboratorId: budget.inclusion.collaboratorId,
        functionId: budget.inclusion.functionId,
        collaboratorType: budget.collaborator?.type || "freela",
        dailyQuantity: totalDias,
        dailyValue: weightedDailyValue,
        costAssistance: 0,
        weekdayLunch: budget.almocoSemana,
        weekdayDinner: budget.jantarSemana,
        weekendLunch: budget.almocoFds,
        weekendDinner: budget.jantarFds,
        mobility: budget.mobilidade,
        mobilityIda: budget.mobilidadeIda,
        mobilityVolta: budget.mobilidadeVolta,
        transport: 0,
        totalValue: budget.totalFinal,
        createdBy: user?.id,
      };
      const res = await apiRequest("POST", "/api/budget-planned", plannedData);
      const created = await res.json();
      const toggleRes = await apiRequest("POST", `/api/budget-planned/${created.id}/toggle-not-attended`, { reason });
      return toggleRes.json();
    },
    onSuccess: (_, { budget }) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-planned", selectedEventId] });
      setNotAttendedModal(null);
      setNotAttendedReason("");
      setSelectedIds(prev => { const s = new Set(Array.from(prev)); s.delete(budget.inclusion.id); return s; });
      toast({ title: "Colaborador marcado como não participou" });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível marcar como não participou", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  // Busca diretamente os eventos que têm escalação — sem carregar todas as escalações
  const { data: eventsWithInclusions } = useQuery<Event[]>({
    queryKey: ["/api/events-with-inclusions"],
  });

  const { data: teamInclusions, isLoading: isLoadingInclusions, isError: isErrorInclusions, refetch: refetchInclusions } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions", selectedEventId],
    queryFn: async () => {
      const url = selectedEventId ? `/api/team-inclusions?eventId=${selectedEventId}` : "/api/team-inclusions";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch team inclusions");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  // Gerar valores padrão automaticamente se não existirem
  useEffect(() => {
    if (functionValues && functionValues.length === 0 && functions && functions.length > 0) {
      apiRequest("POST", "/api/function-values/generate-defaults", {})
        .then(() => qc.invalidateQueries({ queryKey: ["/api/function-values"] }))
        .catch(() => {});
    }
  }, [functionValues, functions, qc]);

  const didScrollToCard = useRef(false);
  useEffect(() => {
    if (didScrollToCard.current || !teamInclusions || !urlCollaboratorId || !urlFunctionId) return;
    const target = teamInclusions.find(
      ti => ti.collaboratorId === urlCollaboratorId && ti.functionId === urlFunctionId && !ti.deletedAt
    );
    if (target) {
      didScrollToCard.current = true;
      // A rolagem até o card fica no efeito de `highlightCardId` (após a
      // virtualização, o card pode ainda não estar no DOM neste momento).
      setHighlightCardId(target.id);
      setTimeout(() => setHighlightCardId(""), 4000);
    }
  }, [teamInclusions, urlCollaboratorId, urlFunctionId]);

  // Maps id→nome pré-computados: os getters eram Array.find O(n) chamados
  // dentro do comparador de ordenação e por card, O(n²) com listas grandes.
  const collaboratorNamesById = useMemo(() => {
    const m = new Map<string, string>();
    collaborators?.forEach(c => m.set(c.id, fixEncoding(c.fullName) || "Não definido"));
    return m;
  }, [collaborators]);

  const functionNamesById = useMemo(() => {
    const m = new Map<string, string>();
    functions?.forEach(f => m.set(f.id, f.name));
    return m;
  }, [functions]);

  const getCollaboratorName = useCallback((id?: string | null) => {
    if (!id) return "Não definido";
    return collaboratorNamesById.get(id) || "Não definido";
  }, [collaboratorNamesById]);
  /** Nome que a linha mostra: colaborador, ou a empresa da empreita (10/09). */
  const nomeDaVaga = (i: TeamInclusion): string => {
    const empresa = i.empreitaEmpresa as string | null | undefined;
    if (empresa) return `Empreita · ${empresa}${i.empreitaPessoas ? ` (${i.empreitaPessoas} pessoas)` : ""}`;
    return getCollaboratorName(i.collaboratorId);
  };

  const getFunctionName = useCallback((id?: string | null) => {
    if (!id) return "-";
    return functionNamesById.get(id) || "-";
  }, [functionNamesById]);

  // Índices O(1) (23/09): `collaborators?.find` e `functionValues?.find` rodavam
  // dentro do `.map` do cálculo — O(n·m) a cada render.
  const collaboratorById = useMemo(() => indexarPorId(collaborators), [collaborators]);
  const functionValueByFunctionId = useMemo(() => {
    const m = new Map<string, FunctionValue>();
    functionValues?.forEach(fv => { if (!m.has(fv.functionId)) m.set(fv.functionId, fv); });
    return m;
  }, [functionValues]);


  const selectedEvent = events?.find(e => e.id === selectedEventId);

  function formatEventDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "";
    const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const [year, month, day] = dateStr.split("-");
    return `${parseInt(day)} de ${months[parseInt(month) - 1]} de ${year}`;
  }

  // Filtrar apenas escalações CONFIRMADAS
  const confirmedInclusions = useMemo(() => {
    if (!teamInclusions) return [];
    return teamInclusions.filter(inc => 
      inc.status === "confirmado" || 
      inc.status === "escalacao" || 
      inc.status === "escalado" ||
      inc.status === "aprovacao" ||
      inc.status === "passagem" ||
      inc.status === "passagem_comprada" ||
      inc.status === "hospedagem" ||
      inc.status === "hospedagem_comprada" ||
      inc.status === "hospedagem_passagem_comprada" ||
      inc.status === "aprovado"
    );
  }, [teamInclusions]);

  // "Já enviado ao Realizado" é DERIVADO de `existingActuals` (23/09): fonte
  // única. Antes era um `useState` alimentado por um useEffect O(n·m) e ainda
  // alterado à mão nos onSuccess — duas fontes de verdade que divergiam.
  // Após enviar, os onSuccess gravam o registro criado no cache da query
  // (`setQueryData`) e invalidam; a UI responde na hora sem estado paralelo.
  const sentToActual = useMemo(() => {
    const enviados = new Set<string>();
    if (!existingActuals || existingActuals.length === 0) return enviados;
    const chaves = new Set<string>();
    for (const a of existingActuals) chaves.add(`${a.collaboratorId}|${a.functionId}`);
    for (const inc of confirmedInclusions) {
      if (chaves.has(`${inc.collaboratorId}|${inc.functionId}`)) enviados.add(inc.id);
    }
    return enviados;
  }, [existingActuals, confirmedInclusions]);

  // ── Cálculo por vaga: MOTOR COMPARTILHADO (23/09) ────────────────────────
  // `calcularPlanejadoDaVaga` (@shared/budget-engine) é a mesma sequência que
  // o servidor usa em apply-defaults — a fórmula duplicada saiu desta tela.
  // Cache por vaga: só recalcula a linha cuja ENTRADA mudou (escalação,
  // função, tipo, valores, configurações, passagem ou override). Digitar um
  // valor recalcula UMA vaga; as demais devolvem o MESMO objeto e o
  // `SheetRow` (React.memo) e os cards não repintam.
  const settingsPlanejado = systemSettings as Record<string, number> | undefined;
  const cacheOrcamentosRef = useRef(new Map<string, { chave: unknown[]; result: CalculatedBudget }>());
  const calculatedBudgets = useMemo((): CalculatedBudget[] => {
    if (!confirmedInclusions || !functionValues) return [];
    const anterior = cacheOrcamentosRef.current;
    const proximo = new Map<string, { chave: unknown[]; result: CalculatedBudget }>();
    const eventLocation = selectedEvent?.location ?? null;
    const out = confirmedInclusions.map((inclusion): CalculatedBudget => {
      const id = inclusion.id;
      const fv = functionValueByFunctionId.get(inclusion.functionId) ?? null;
      const collab = inclusion.collaboratorId ? collaboratorById.get(inclusion.collaboratorId) : undefined;
      const fnName = functionNamesById.get(inclusion.functionId) ?? null;
      const ticket = ticketByInclusion.get(inclusion.id) ?? null;
      const override = budgetOverrides[id];
      const chave: unknown[] = [inclusion, fnName, collab?.type ?? null, fv, settingsPlanejado, eventLocation, ticket, override];
      const hit = anterior.get(id);
      const reaproveita = !!hit && hit.chave.length === chave.length && hit.chave.every((v, i) => v === chave[i]);
      const result: CalculatedBudget = reaproveita
        ? hit.result
        : {
            ...calcularPlanejadoDaVaga({
              vaga: inclusion as VagaParaPlanejado,
              functionName: fnName,
              collaboratorType: collab?.type,
              functionValue: fv,
              settings: settingsPlanejado,
              eventLocation,
              ticket,
              override,
            }),
            inclusion,
            collaborator: collab,
            functionValue: fv,
          };
      proximo.set(id, { chave, result });
      return result;
    });
    cacheOrcamentosRef.current = proximo;
    return out;
  }, [confirmedInclusions, functionValues, collaboratorById, functionValueByFunctionId, functionNamesById, settingsPlanejado, ticketByInclusion, selectedEvent?.location, budgetOverrides]);

  // Set de chaves "collaboratorId|functionId" para cards marcados como "não participou"
  const notAttendedKeys = useMemo(() => {
    const keys = new Set<string>();
    (allBudgetPlanned || []).forEach(p => {
      if (p.didNotAttend) keys.add(`${p.collaboratorId}|${p.functionId}`);
    });
    return keys;
  }, [allBudgetPlanned]);

  const isCardNotAttended = (b: typeof calculatedBudgets[0]) =>
    notAttendedKeys.has(`${b.inclusion.collaboratorId}|${b.inclusion.functionId}`);

  // Registros indexados por "colaborador|função" — evita .find() O(n) por card/linha.
  // O primeiro registro vence, preservando a semântica do Array.find original.
  const plannedByCollabFunc = useMemo(() => {
    const m = new Map<string, BudgetPlannedRow>();
    (allBudgetPlanned || []).forEach(p => {
      const key = `${p.collaboratorId}|${p.functionId}`;
      if (!m.has(key)) m.set(key, p);
    });
    return m;
  }, [allBudgetPlanned]);

  const actualsByCollabFunc = useMemo(() => {
    const m = new Map<string, BudgetActual>();
    (existingActuals || []).forEach(a => {
      if (a.splitParentId) return;
      const key = `${a.collaboratorId}|${a.functionId}`;
      if (!m.has(key)) m.set(key, a);
    });
    return m;
  }, [existingActuals]);

  const totalGeral = useMemo(() => {
    return calculatedBudgets
      .filter(b => !notAttendedKeys.has(`${b.inclusion.collaboratorId}|${b.inclusion.functionId}`))
      .reduce((sum, b) => sum + b.totalFinal, 0);
  }, [calculatedBudgets, notAttendedKeys]);

  // Estatísticas de resumo
  const stats = useMemo(() => {
    const activeBudgets = calculatedBudgets.filter(b => !notAttendedKeys.has(`${b.inclusion.collaboratorId}|${b.inclusion.functionId}`));
    const total = activeBudgets.length;
    const isCasa = (type?: string) => type === 'casa' || type === 'local';
    const isFreela = (type?: string) => type === 'freela' || !type;
    const totalCasa = activeBudgets.filter(b => isCasa(b.collaborator?.type)).length;
    const totalFreela = activeBudgets.filter(b => isFreela(b.collaborator?.type)).length;
    const valorCasa = activeBudgets.filter(b => isCasa(b.collaborator?.type)).reduce((sum, b) => sum + b.totalFinal, 0);
    const valorFreela = activeBudgets.filter(b => isFreela(b.collaborator?.type)).reduce((sum, b) => sum + b.totalFinal, 0);
    const media = total > 0 ? totalGeral / total : 0;
    const totalDias = activeBudgets.reduce((sum, b) => sum + b.weekdays + b.weekends, 0);
    const mediaPorDia = totalDias > 0 ? totalGeral / totalDias : 0;
    // Mesmo denominador de `total` (só ativos) — incluir "não participou" aqui
    // impedia o progresso de chegar a 100%.
    const enviados = activeBudgets.filter(b => sentToActual.has(b.inclusion.id)).length;
    const progressoEnvio = total > 0 ? (enviados / total) * 100 : 0;
    
    return { total, totalCasa, totalFreela, valorCasa, valorFreela, media, mediaPorDia, enviados, progressoEnvio };
  }, [calculatedBudgets, totalGeral, sentToActual, notAttendedKeys]);

  // Funções únicas para filtro
  const uniqueFunctions = useMemo(() => {
    const funcs = new Set<string>();
    calculatedBudgets.forEach(b => {
      if (b.inclusion.functionId) {
        const fname = getFunctionName(b.inclusion.functionId);
        if (fname !== '-') funcs.add(fname);
      }
    });
    return Array.from(funcs).sort();
  }, [calculatedBudgets, getFunctionName]);

  // Filtrar e ordenar budgets
  const filteredBudgets = useMemo(() => {
    let result = [...calculatedBudgets];
    
    // Filtro por busca
    if (buscaAplicada) {
      const term = buscaAplicada.toLowerCase();
      result = result.filter(b => 
        getCollaboratorName(b.inclusion.collaboratorId).toLowerCase().includes(term)
      );
    }
    
    // Filtro por função
    if (filterFunction !== 'all') {
      result = result.filter(b => 
        getFunctionName(b.inclusion.functionId) === filterFunction
      );
    }
    
    // Filtro por tipo — 'casa' inclui 'local', como no resto da tela
    if (filterType !== 'all') {
      result = result.filter(b =>
        (filterType === 'casa' && (b.collaborator?.type === 'casa' || b.collaborator?.type === 'local')) ||
        (filterType === 'freela' && (b.collaborator?.type === 'freela' || !b.collaborator?.type))
      );
    }
    
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return getCollaboratorName(a.inclusion.collaboratorId).localeCompare(getCollaboratorName(b.inclusion.collaboratorId));
        case 'name_desc':
          return getCollaboratorName(b.inclusion.collaboratorId).localeCompare(getCollaboratorName(a.inclusion.collaboratorId));
        case 'days_desc':
          return b.qtdDiarias - a.qtdDiarias;
        case 'days_asc':
          return a.qtdDiarias - b.qtdDiarias;
        case 'function':
          return getFunctionName(a.inclusion.functionId).localeCompare(getFunctionName(b.inclusion.functionId));
        default:
          return getCollaboratorName(a.inclusion.collaboratorId).localeCompare(getCollaboratorName(b.inclusion.collaboratorId));
      }
    });
    
    return result;
  }, [calculatedBudgets, buscaAplicada, filterFunction, filterType, sortBy, getCollaboratorName, getFunctionName]);

  // Seleção × filtro (23/09): antes CADA tecla na busca zerava a seleção.
  // Agora só saem da seleção os itens que o filtro escondeu — item selecionado
  // e depois oculto não segue no "Enviar Planejamento (N)" sem o usuário ver.
  useEffect(() => {
    setSelectedIds(prev => {
      if (prev.size === 0) return prev;
      const visiveis = new Set(filteredBudgets.map(b => b.inclusion.id));
      const mantidos = new Set(Array.from(prev).filter(id => visiveis.has(id)));
      return mantidos.size === prev.size ? prev : mantidos;
    });
  }, [filteredBudgets]);

  // SELECIONÁVEIS visíveis: respeitam o filtro atual e excluem enviados e
  // "não participou" — base do select-all dos cards E da planilha.
  const selectableFiltered = useMemo(
    () => filteredBudgets.filter(b =>
      !sentToActual.has(b.inclusion.id) &&
      !notAttendedKeys.has(`${b.inclusion.collaboratorId}|${b.inclusion.functionId}`)
    ),
    [filteredBudgets, sentToActual, notAttendedKeys]
  );

  // ── Virtualização (23/09): cards da Visão Geral e linhas da Planilha ──────
  // Só o que cabe no contêiner de rolagem vai para o DOM; abaixo de 60 itens a
  // lista é renderizada inteira. O grid de cards tem 2 colunas a partir de
  // `md` (768px) — mesmo breakpoint das classes Tailwind do grid.
  const cardsScrollRef = useRef<HTMLDivElement>(null);
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  const duasColunas = useMediaQuery("(min-width: 768px)");
  const cardsVirtuais = useCardsVirtuais(filteredBudgets, {
    scrollRef: cardsScrollRef,
    alturaEstimada: 360,
    colunas: duasColunas ? 2 : 1,
  });
  const linhasPlanilha = useLinhasVirtuais(filteredBudgets, {
    scrollRef: sheetScrollRef,
    alturaEstimada: 52,
  });

  // Card destacado pela URL pode estar fora da janela virtualizada: rola a
  // lista até ele antes do `scrollIntoView`.
  const rolarParaCardRef = useRef(cardsVirtuais.rolarPara);
  rolarParaCardRef.current = cardsVirtuais.rolarPara;
  useEffect(() => {
    if (!highlightCardId) return;
    const idx = filteredBudgets.findIndex(b => b.inclusion.id === highlightCardId);
    if (idx >= 0) rolarParaCardRef.current(idx);
    const t = setTimeout(() => {
      document.querySelector(`[data-card-id="${highlightCardId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350);
    return () => clearTimeout(t);
  }, [highlightCardId, filteredBudgets]);


  const [originalModalTotal, setOriginalModalTotal] = useState<number>(0);
  // Valores originais campo a campo — comparar só o total esconderia edições
  // que se compensam (ex.: +50 no almoço e -50 no jantar).
  const [originalModalValues, setOriginalModalValues] = useState<BudgetEdit | null>(null);
  const [defaultBudgetValues, setDefaultBudgetValues] = useState<BudgetEdit | null>(null);
  // "Descartar alterações?" no modal de edição (23/09): Esc e clique fora
  // fechavam e jogavam fora o que foi digitado. Mesmo critério do `hasChanges`
  // que acende o botão Salvar no rodapé do modal.
  const modalSujo = !!editingBudget && (
    pendingAtendimentoTipo != null || pendingPercurseiroTipo != null ||
    (!!originalModalValues && (Object.keys(editingBudget) as (keyof BudgetEdit)[]).some(k => editingBudget[k] !== originalModalValues[k]))
  );
  const fecharModalEdicao = () => {
    setEditingBudget(null); setEditingBudgetInfo(null); setEditingBudgetPlannedId(null);
    setModalViewMode(false); setModalBufs({}); setPendingAtendimentoTipo(null); setPendingPercurseiroTipo(null);
  };
  const { pedirParaFechar: pedirFecharEdicao, Dialogo: DialogoDescarteEdicao } = useConfirmarDescarte(modalSujo, { salvando: savingTipo });
  // Alimentação no modal: os 4 campos legados ficam recolhidos ("exceções");
  // abrem automaticamente quando o valor atual difere do motor (override).
  const [alimExpanded, setAlimExpanded] = useState(false);

  const openEditModal = (budget: typeof calculatedBudgets[0], viewMode = false) => {
    const startDate = budget.inclusion.scheduleStartDate;
    const endDate = budget.inclusion.scheduleEndDate;
    const formatDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
    const period = startDate && endDate ? `${formatDate(startDate)} a ${formatDate(endDate)}` : '-';
    
    setEditingBudgetInfo({
      name: nomeDaVaga(budget.inclusion),
      functionName: getFunctionName(budget.inclusion.functionId),
      type: budget.collaborator?.type === 'casa' || budget.collaborator?.type === 'local' ? 'Casa' : 'Freela',
      weekdays: budget.weekdays,
      weekends: budget.weekends,
      diasComDiaria: budget.diasComDiaria,
      regraDiaria: budget.regraDiaria,
      period,
      vooChegadaIda: budget.vooChegadaIda,
      vooPartidaVolta: budget.vooPartidaVolta,
      fonteVoo: budget.fonteVoo,
      alimEstimada: budget.alimEstimada,
      voa: !!budget.inclusion.needsTicket,
      isAtend: isAtendimentoFunction(getFunctionName(budget.inclusion.functionId)),
      atendimentoTipo: (budget.inclusion.atendimentoTipo ?? null) as AtendimentoTipo | null,
      savedAtendimentoTipo: (budget.inclusion.atendimentoTipo ?? null) as AtendimentoTipo | null,
      isPercurso: budget.isPercurso,
      funcaoLocal: budget.funcaoLocal,
      percurseiroTipo: budget.percurseiroTipo,
      savedPercurseiroTipo: budget.percurseiroTipo,
      percurseiro: budget.percurseiro,
      cenoEmpreitaVaga: budget.cenoEmpreitaVaga,
      cenoFreelaTipo: budget.cenoFreelaTipo,
      cenoEmpreita: budget.cenoEmpreita,
      inclusionId: budget.inclusion.id,
    });
    setPendingAtendimentoTipo(null);
    setPendingPercurseiroTipo(null);

    // "Restaurar padrão" re-deriva do MOTOR ATUAL (atendimento/freela/casa +
    // deflação + voo), não do legado fv/dailyValue.
    const defaultVals: BudgetEdit = {
      inclusionId: budget.inclusion.id,
      qtdDiarias: budget.weekdays + budget.weekends,
      valorDiaria: budget.sysValorDiaria,
      valorDiariaUtil: budget.sysValorDiaria,
      valorDiariaFds: budget.sysValorDiaria,
      mobilidade: budget.sysMobilidade,
      mobilidadeIda: budget.sysMobilidadeIda,
      mobilidadeVolta: budget.sysMobilidadeVolta,
      almocoSemana: budget.sysAlmocoSemana,
      jantarSemana: budget.sysJantarSemana,
      almocoFds: budget.sysAlmocoFds,
      jantarFds: budget.sysJantarFds,
    };
    setDefaultBudgetValues(defaultVals);

    const editVals: BudgetEdit = {
      inclusionId: budget.inclusion.id,
      qtdDiarias: budget.qtdDiarias,
      valorDiaria: budget.valorDiaria,
      valorDiariaUtil: budget.valorDiariaUtil,
      valorDiariaFds: budget.valorDiariaFds,
      mobilidade: budget.mobilidade,
      mobilidadeIda: budget.mobilidadeIda,
      mobilidadeVolta: budget.mobilidadeVolta,
      almocoSemana: budget.almocoSemana,
      jantarSemana: budget.jantarSemana,
      almocoFds: budget.almocoFds,
      jantarFds: budget.jantarFds,
    };
    setEditingBudget(editVals);
    setOriginalModalValues(editVals);
    setOriginalModalTotal(budget.totalFinal);
    setAlimExpanded(
      editVals.almocoSemana !== defaultVals.almocoSemana ||
      editVals.jantarSemana !== defaultVals.jantarSemana ||
      editVals.almocoFds !== defaultVals.almocoFds ||
      editVals.jantarFds !== defaultVals.jantarFds
    );
    const planRec = allBudgetPlanned?.find(
      p => p.collaboratorId === budget.inclusion.collaboratorId && p.functionId === budget.inclusion.functionId
    );
    setEditingBudgetPlannedId(planRec?.id ?? null);
    setModalViewMode(viewMode);
    setModalTab('custos');
    setModalBufs({});
  };

  const saveEdit = async () => {
    if (!editingBudget || !originalModalValues || !defaultBudgetValues) return;
    const id = editingBudget.inclusionId;
    const cur = editingBudget;
    const orig = originalModalValues;
    const sys = defaultBudgetValues;
    // 1) Tipo (atendimento/percurseiro) escolhido no modal → grava na ESCALAÇÃO
    //    antes do orçamento; erro aborta o salvar (modal fica aberto).
    const hadPendingTipo = pendingAtendimentoTipo != null || pendingPercurseiroTipo != null;
    const tipoOk = await persistPendingTipos(id);
    if (!tipoOk) return;
    // 2) Orçamento (override esparso local)
    setBudgetOverrides(prev => {
      const existing = prev[id];
      // Override ESPARSO: persiste SOMENTE o que o usuário alterou em relação
      // ao valor calculado. Campo igual ao motor sai do override, para que o
      // recálculo (ex.: chegada da passagem) volte a valer.
      const next: BudgetOverride = { ...(existing || { inclusionId: id }) };

      // Grupo diária (plana): um único valor espelhado em util/fds
      if (cur.valorDiaria === sys.valorDiaria) {
        delete next.valorDiaria; delete next.valorDiariaUtil; delete next.valorDiariaFds;
      } else if (cur.valorDiaria !== orig.valorDiaria || next.valorDiaria !== undefined || next.valorDiariaUtil !== undefined || next.valorDiariaFds !== undefined) {
        next.valorDiaria = cur.valorDiaria; next.valorDiariaUtil = cur.valorDiaria; next.valorDiariaFds = cur.valorDiaria;
      }

      // Grupo mobilidade: total sempre coerente com ida + volta
      const mobEqualsSys = cur.mobilidade === sys.mobilidade && cur.mobilidadeIda === sys.mobilidadeIda && cur.mobilidadeVolta === sys.mobilidadeVolta;
      const mobChanged = cur.mobilidade !== orig.mobilidade || cur.mobilidadeIda !== orig.mobilidadeIda || cur.mobilidadeVolta !== orig.mobilidadeVolta;
      if (mobEqualsSys) {
        delete next.mobilidade; delete next.mobilidadeIda; delete next.mobilidadeVolta;
      } else if (mobChanged || next.mobilidade !== undefined || next.mobilidadeIda !== undefined || next.mobilidadeVolta !== undefined) {
        next.mobilidade = cur.mobilidade; next.mobilidadeIda = cur.mobilidadeIda; next.mobilidadeVolta = cur.mobilidadeVolta;
      }

      // Campos individuais (alimentação) — qtdDiarias saiu do modelo de override
      (['almocoSemana', 'jantarSemana', 'almocoFds', 'jantarFds'] as const).forEach(f => {
        if (cur[f] === sys[f]) delete next[f];
        else if (cur[f] !== orig[f] || next[f] !== undefined) next[f] = cur[f];
      });

      const hasAny = Object.keys(next).some(k => k !== 'inclusionId');
      const n = { ...prev };
      if (!hasAny) delete n[id];
      else n[id] = next;
      return n;
    });
    // O banner "rascunho restaurado" é só para a restauração do load — a
    // primeira edição manual da sessão o dispensa.
    setDraftRestored(false);
    setEditingBudget(null);
    setEditingBudgetPlannedId(null);
    toast({
      title: "Valores ajustados",
      description: hadPendingTipo
        ? "Tipo gravado na escalação. As alterações serão aplicadas no envio para o Realizado."
        : "As alterações serão aplicadas no envio para o Realizado.",
    });
  };

  const savePlannedAndSendToActual = async (budget: typeof calculatedBudgets[0], obsLabel: string) => {
    // Dias persistidos = dias que efetivamente recebem diária (casa: só fds);
    // Realizado/Comparativo leem dailyQuantity.
    const totalDias = budget.diasComDiaria;
    const weightedDailyValue = totalDias > 0
      ? Math.round(budget.subtotalDiarias / totalDias)
      : budget.valorDiaria;
    const plannedData = {
      eventId: budget.inclusion.eventId,
      collaboratorId: budget.inclusion.collaboratorId,
      functionId: budget.inclusion.functionId,
      collaboratorType: budget.collaborator?.type || "freela",
      dailyQuantity: totalDias,
      dailyValue: weightedDailyValue,
      costAssistance: 0,
      weekdayLunch: budget.almocoSemana,
      weekdayDinner: budget.jantarSemana,
      weekendLunch: budget.almocoFds,
      weekendDinner: budget.jantarFds,
      mobility: budget.mobilidade,
      mobilityIda: budget.mobilidadeIda,
      mobilityVolta: budget.mobilidadeVolta,
      transport: 0,
      totalValue: budget.totalFinal,
      createdBy: user?.id,
    };

    // Reutiliza registro planejado já existente (ex: marcado como "não participou" antes de enviar)
    const existingPlan = allBudgetPlanned?.find(
      p => p.collaboratorId === budget.inclusion.collaboratorId && p.functionId === budget.inclusion.functionId
    );

    let savedPlanned: BudgetPlannedRow;
    if (existingPlan) {
      const patchRes = await apiRequest("PATCH", `/api/budget-planned/${existingPlan.id}`, {
        ...plannedData,
        didNotAttend: existingPlan.didNotAttend,
        didNotAttendReason: existingPlan.didNotAttendReason,
      });
      savedPlanned = await patchRes.json();
    } else {
      const plannedRes = await apiRequest("POST", "/api/budget-planned", plannedData);
      savedPlanned = await plannedRes.json();
    }

    const actualRes = await apiRequest("POST", "/api/budget-actual", {
      ...plannedData,
      plannedId: savedPlanned.id,
      paymentStatus: "pendente",
      observations: obsLabel,
    });
    return { id: budget.inclusion.id, result: await actualRes.json() };
  };

  // Resposta imediata após o envio SEM estado paralelo: grava o registro
  // criado no cache de `existingActuals` (fonte única de `sentToActual`) e a
  // invalidação logo depois confirma com o servidor.
  const marcarEnviados = (enviados: { id: string; result: BudgetActual }[]) => {
    const novos = enviados.map(e => e.result).filter(r => r && r.collaboratorId);
    if (novos.length === 0) return;
    qc.setQueryData<BudgetActual[]>(["/api/budget-actual", selectedEventId], (old) => [...(old ?? []), ...novos]);
  };

  const sendToActualMutation = useMutation({
    mutationFn: async (budget: typeof calculatedBudgets[0]) => {
      return savePlannedAndSendToActual(budget, "Enviado do planejado");
    },
    onSuccess: (data, variables) => {
      marcarEnviados([data]);
      clearDraftEntries([data.id]);
      setConfirmSend(null);
      const wasEdited = !!variables.hasOverride;
      // O envio individual JÁ cria o registro no Realizado — o texto diz isso.
      toast({
        title: "Enviado para o Realizado!",
        description: wasEdited
          ? "Enviado para a prestação de contas — os valores editados foram junto."
          : "Os valores calculados foram enviados para a prestação de contas.",
      });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
    },
    onError: () => {
      toast({ title: "Erro ao enviar", description: "Não foi possível enviar para o Realizado.", variant: "destructive" });
    },
  });

  const sendSelectedToActualMutation = useMutation({
    mutationFn: async () => {
      // "Não participou" NUNCA vai para o Realizado, mesmo se um id ausente
      // sobrou na seleção por algum caminho antigo.
      const toSend = calculatedBudgets.filter(b =>
        selectedIds.has(b.inclusion.id) && !sentToActual.has(b.inclusion.id) && !isCardNotAttended(b)
      );
      const results: { id: string; result: BudgetActual }[] = [];
      let failedCount = 0;
      for (const budget of toSend) {
        try {
          results.push(await savePlannedAndSendToActual(budget, "Enviado do planejado (lote)"));
        } catch {
          failedCount++;
        }
      }
      if (failedCount > 0) {
        // Propaga os sucessos parciais para o onError registrá-los mesmo com falhas
        throw Object.assign(new Error("Envio parcial"), { sent: results, failedCount });
      }
      return results;
    },
    onSuccess: (data) => {
      marcarEnviados(data);
      clearDraftEntries(data.map(d => d.id));
      setSelectedIds(new Set());
      setConfirmSend(null);
      toast({ title: "Planejamento enviado com sucesso!", description: `${data.length} ${data.length === 1 ? 'colaborador enviado' : 'colaboradores enviados'} para a prestação de contas.` });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
    },
    onError: (err) => {
      // Erro "Envio parcial" montado acima com os sucessos anexados.
      const parcial = err as Partial<{ sent: { id: string; result: BudgetActual }[]; failedCount: number }>;
      const sent = parcial.sent ?? [];
      const failedCount = parcial.failedCount ?? 0;
      if (sent.length > 0) {
        // Sucessos parciais contam: marca como enviados e tira da seleção para
        // que uma nova tentativa reenvie apenas os que falharam.
        marcarEnviados(sent);
        clearDraftEntries(sent.map(d => d.id));
        setSelectedIds(prev => { const s = new Set(Array.from(prev)); sent.forEach(d => s.delete(d.id)); return s; });
        qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
        qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      }
      toast({
        title: "Erro ao enviar",
        description: sent.length > 0
          ? `${sent.length} de ${sent.length + failedCount} enviados com sucesso; ${failedCount} ${failedCount === 1 ? 'falhou' : 'falharam'}. Tente novamente para reenviar os pendentes.`
          : "Não foi possível enviar para o Realizado.",
        variant: "destructive",
      });
    },
  });

  const handleApplyDefaults = async () => {
    setIsApplyingDefaults(true);
    try {
      // Contrato 23/09: o servidor exige o evento (400 sem `eventId`).
      if (!selectedEventId) {
        toast({ title: "Selecione um evento", description: "Os padrões são aplicados por evento.", variant: "destructive" });
        return;
      }
      const res = await apiRequest("POST", `/api/budget-planned/apply-defaults?eventId=${selectedEventId}`, {});
      const data = await res.json();
      const count = data.updated ?? 0;
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      toast({
        title: count > 0 ? `${count} planejamento${count !== 1 ? 's' : ''} atualizado${count !== 1 ? 's' : ''}` : "Nenhum planejamento pendente",
        description: count > 0
          ? "Valores padrão aplicados aos orçamentos ainda não enviados."
          : "Todos os orçamentos já foram enviados ou não há registros pendentes.",
      });
    } catch (err) {
      toast({ title: "Não foi possível aplicar os valores", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    } finally {
      setIsApplyingDefaults(false);
    }
  };

  // Handler para edição inline na planilha — grava override ESPARSO: apenas os
  // campos efetivamente editados entram; o resto continua recalculando (ex.:
  // mobilidade/alimentação reagem à chegada da passagem).
  const handleSheetEdit = useCallback((budget: CalculatedBudget, field: SheetField, rawValue: string) => {
    const val = parseBrNumber(rawValue);
    const valCents = Math.round(val * 100);

    const dias = Math.max(1, budget.weekdays + budget.weekends);

    // NÃO limpar o override quando o valor digitado coincide com o padrão.
    //
    // Zerar é uma decisão legítima do usuário e precisa ser gravada como
    // override. Para voltar ao padrão já existem três caminhos explícitos: o
    // ↩ de cada célula, o "Restaurar" da linha e o "Restaurar Padrão em Todos".

    // Edição manual da sessão: o banner "rascunho restaurado" deixa de valer
    setDraftRestored(false);

    setBudgetOverrides(prev => {
    const existingOvr = prev[budget.inclusion.id];
    const updated: BudgetOverride = { ...(existingOvr || { inclusionId: budget.inclusion.id }) };
    if (field === 'valorDia') {
      // Diária PLANA: um único valor, espelhado nos campos legados
      updated.valorDiaria = valCents; updated.valorDiariaUtil = valCents; updated.valorDiariaFds = valCents;
    }
    else if (field === 'alimentacao') {
      // valCents é por dia → converter para total do período.
      // Distribui SOMENTE entre buckets com dias > 0 (bucket sem dia conta 0 —
      // mesmo zeroing efetivo do modal e do calculatedBudgets).
      const totalCents = valCents * dias;
      const slots: ('almocoSemana' | 'jantarSemana' | 'almocoFds' | 'jantarFds')[] = [];
      if (budget.weekdays > 0) slots.push('almocoSemana', 'jantarSemana');
      if (budget.weekends > 0) slots.push('almocoFds', 'jantarFds');
      // Buckets sem dias saem do override — o zeroing efetivo os mantém em 0
      if (budget.weekdays === 0) { delete updated.almocoSemana; delete updated.jantarSemana; }
      if (budget.weekends === 0) { delete updated.almocoFds; delete updated.jantarFds; }
      if (slots.length > 0) {
        const existingBySlot = {
          almocoSemana: budget.almocoSemana, jantarSemana: budget.jantarSemana,
          almocoFds: budget.almocoFds, jantarFds: budget.jantarFds,
        };
        const existingTotal = slots.reduce((s, k) => s + existingBySlot[k], 0);
        if (existingTotal === 0) {
          // Divide igualmente entre as refeições dos buckets com dias;
          // resto do arredondamento vai no último para a soma bater exata.
          const q = Math.round(totalCents / slots.length);
          slots.forEach(k => { updated[k] = q; });
          updated[slots[slots.length - 1]] = totalCents - q * (slots.length - 1);
        } else {
          // Proporcional ao existente; resto no último componente
          let acc = 0;
          slots.forEach((k, i) => {
            if (i < slots.length - 1) {
              const v = Math.round(existingBySlot[k] * totalCents / existingTotal);
              updated[k] = v;
              acc += v;
            }
          });
          updated[slots[slots.length - 1]] = totalCents - acc;
        }
      }
    } else if (field === 'alimentacaoUtil') {
      // valCents é por dia útil → propaga sobre almocoSemana + jantarSemana
      const totalCents = valCents * Math.max(1, budget.weekdays);
      const existingWd = budget.almocoSemana + budget.jantarSemana;
      if (existingWd === 0) {
        updated.almocoSemana = Math.round(totalCents / 2);
        updated.jantarSemana = totalCents - Math.round(totalCents / 2);
      } else {
        const f = totalCents / existingWd;
        updated.almocoSemana = Math.round(budget.almocoSemana * f);
        updated.jantarSemana = totalCents - Math.round(budget.almocoSemana * f);
      }
    } else if (field === 'alimentacaoFds') {
      // valCents é por dia de fim de semana → propaga sobre almocoFds + jantarFds
      const totalCents = valCents * Math.max(1, budget.weekends);
      const existingWe = budget.almocoFds + budget.jantarFds;
      if (existingWe === 0) {
        updated.almocoFds = Math.round(totalCents / 2);
        updated.jantarFds = totalCents - Math.round(totalCents / 2);
      } else {
        const f = totalCents / existingWe;
        updated.almocoFds = Math.round(budget.almocoFds * f);
        updated.jantarFds = totalCents - Math.round(budget.almocoFds * f);
      }
    } else if (field === 'mobilidade') {
      // valCents é o total (Ida + Volta) — não multiplica por dias
      updated.mobilidade = valCents;
      updated.mobilidadeIda = Math.round(valCents / 2);
      updated.mobilidadeVolta = valCents - Math.round(valCents / 2);
    }
    // Sem nenhum campo além do inclusionId (ex.: lote de alimentação numa
    // linha sem dias), não grava override vazio — a linha não foi editada.
    const { inclusionId: _iid, ...camposEditados } = updated;
    if (Object.keys(camposEditados).length === 0) {
      const next = { ...prev };
      delete next[budget.inclusion.id];
      return next;
    }
    return { ...prev, [budget.inclusion.id]: updated };
    });
  }, []);

  // Restaurar padrão de um campo: REMOVE o campo do override — o cálculo reassume
  const restoreSheetField = useCallback((sid: string, field: SheetField) => {
    setDraftRestored(false);
    setBudgetOverrides(prev => {
      const ovr = prev[sid];
      if (!ovr) return prev;
      const updated: BudgetOverride = { ...ovr };
      if (field === 'valorDia') { delete updated.valorDiaria; delete updated.valorDiariaUtil; delete updated.valorDiariaFds; }
      else if (field === 'alimentacao') { delete updated.almocoSemana; delete updated.jantarSemana; delete updated.almocoFds; delete updated.jantarFds; }
      else if (field === 'alimentacaoUtil') { delete updated.almocoSemana; delete updated.jantarSemana; }
      else if (field === 'alimentacaoFds') { delete updated.almocoFds; delete updated.jantarFds; }
      else if (field === 'mobilidade') { delete updated.mobilidade; delete updated.mobilidadeIda; delete updated.mobilidadeVolta; }
      const hasAny = Object.keys(updated).some(k => k !== 'inclusionId');
      const n = { ...prev };
      if (!hasAny) delete n[sid];
      else n[sid] = updated;
      return n;
    });
  }, []);

  const toggleRowSelection = useCallback((sid: string, v: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (v) next.add(sid); else next.delete(sid);
      return next;
    });
  }, []);

  const toggleSubtotalPopover = useCallback((sid: string) => {
    setSubtotalOpenId(prev => prev === sid ? null : sid);
  }, []);

  const applyBatchEdit = (field: 'vdia'|'alim'|'mob', rawValue: string) => {
    // Precisa do mesmo parser do handleSheetEdit: com parseFloat, um "0,50"
    // virava 0 e a edição em lote saía daqui sem aplicar nada, em silêncio.
    const val = parseBrNumber(rawValue);
    // Zerar é decisão legítima (ver comentário no handleSheetEdit) — rejeita
    // apenas negativo ou não numérico.
    if (!Number.isFinite(val) || val < 0) {
      toast({ title: "Valor inválido", description: "Informe um valor igual ou maior que zero.", variant: "destructive" });
      return;
    }
    const domainField: SheetField = field === 'vdia' ? 'valorDia' : field === 'alim' ? 'alimentacao' : 'mobilidade';
    const prevOverrides = { ...budgetOverrides };
    // Linha enviada ou ausente NUNCA recebe override em lote
    const targets = filteredBudgets.filter(b =>
      !isCardNotAttended(b) && !sentToActual.has(b.inclusion.id)
    );
    targets.forEach(b => handleSheetEdit(b, domainField, rawValue));
    setBatchApplied(prev => { const next = new Set(prev); next.add(field); return next; });
    setBatchHistory({ fields: [field], prev: prevOverrides });
  };

  const undoBatch = () => {
    if (!batchHistory) return;
    setBudgetOverrides(batchHistory.prev);
    setBatchApplied(prev => {
      const next = new Set(prev);
      batchHistory.fields.forEach(f => next.delete(f));
      return next;
    });
    setBatchHistory(null);
  };

  const applyAdvancedBatch = () => {
    if (!advancedBatch) return;
    const { target, field, value } = advancedBatch;
    // Mesmo motivo do applyBatchEdit: guarda precisa entender vírgula e
    // aceitar zero — rejeita apenas negativo ou não numérico.
    const val = parseBrNumber(value);
    if (!Number.isFinite(val) || val < 0) {
      toast({ title: "Valor inválido", description: "Informe um valor igual ou maior que zero.", variant: "destructive" });
      return;
    }
    const domainField: SheetField =
      field === 'vdia' ? 'valorDia' :
      field === 'alimUtil' ? 'alimentacaoUtil' :
      field === 'alimFds' ? 'alimentacaoFds' : 'mobilidade';
    const targets = filteredBudgets.filter(b => {
      if (isCardNotAttended(b)) return false;
      if (sentToActual.has(b.inclusion.id)) return false;
      const isCasa = b.collaborator?.type === 'casa' || b.collaborator?.type === 'local';
      if (target === 'casa' && !isCasa) return false;
      if (target === 'freela' && isCasa) return false;
      if (target === 'selected' && !selectedIds.has(b.inclusion.id)) return false;
      return true;
    });
    if (targets.length === 0) return;
    const prevOverrides = { ...budgetOverrides };
    targets.forEach(b => handleSheetEdit(b, domainField, value));
    // Marca o flag do campo realmente editado — antes era sempre 'vdia',
    // mesmo em edições de alimentação/mobilidade.
    const batchFlag: 'vdia' | 'alim' | 'mob' =
      field === 'vdia' ? 'vdia' :
      field === 'mob' ? 'mob' : 'alim';
    setBatchApplied(prev => { const next = new Set(prev); next.add(batchFlag); return next; });
    setBatchHistory({ fields: [batchFlag], prev: prevOverrides });
    setAdvancedBatch(null);
    toast({ title: `Lote aplicado`, description: `${targets.length} colaborador${targets.length !== 1 ? 'es' : ''} atualizados` });
  };

  // Close batch popover on outside click or Esc
  useEffect(() => {
    if (!batchPopover) return;
    const handler = (e: MouseEvent) => {
      if (batchPopoverRef.current && !batchPopoverRef.current.contains(e.target as Node)) {
        setBatchPopover(null);
      }
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setBatchPopover(null); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', keyHandler); };
  }, [batchPopover]);

  useEffect(() => {
    if (!subtotalOpenId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const popover = document.getElementById(`subtotal-popover-${subtotalOpenId}`);
      // O botão dono fica de fora do "clique fora": sem isso, o mousedown
      // fechava e o click seguinte reabria — o botão nunca conseguia FECHAR.
      const ownerBtn = document.getElementById(`subtotal-btn-${subtotalOpenId}`);
      if (ownerBtn && ownerBtn.contains(target)) return;
      if (popover && !popover.contains(target)) {
        setSubtotalOpenId(null);
      }
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSubtotalOpenId(null); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', keyHandler); };
  }, [subtotalOpenId]);

  // A11y: quando o popover de lote fecha, o foco volta ao ✏ que o abriu.
  // Depende só do CAMPO aberto (não do objeto inteiro) para não roubar o foco
  // do input a cada tecla digitada.
  const batchPopoverField = batchPopover?.field ?? null;
  useEffect(() => {
    if (!batchPopoverField) return;
    return () => { batchTriggerRef.current?.focus(); };
  }, [batchPopoverField]);

  // Modal de edição em lote fecha com Esc
  useEffect(() => {
    if (!advancedBatch) return;
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setAdvancedBatch(null); };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  }, [advancedBatch]);

  // Avatar color based on first letter
  const avatarColor = (name: string) => {
    const colors = [
      "bg-primary","bg-primary","bg-success-strong","bg-warning-strong",
      "bg-danger-strong","bg-info-strong","bg-info-strong","bg-warning-strong",
    ];
    return colors[(name.charCodeAt(0) || 0) % colors.length];
  };

  return (
    <div className="space-y-7 max-w-5xl mx-auto pb-32">

      {/* ── Cabeçalho ── */}
      <PageHeader
        icon={Calculator}
        title="Planejado"
        subtitle="Orçamento planejado por colaborador — cálculo automático das escalações confirmadas"
        actions={<>
          {isRhOrAdmin(user) && (
            <MotivoDesabilitado motivo="Aplica os valores padrão configurados em Sistema a todos os orçamentos ainda não enviados" desabilitado={isApplyingDefaults}>
              <Button
              variant="outline"
              size="sm"
              onClick={handleApplyDefaults}
              disabled={isApplyingDefaults}
             
              className="gap-1.5 text-xs font-semibold rounded-lg whitespace-nowrap hover:text-primary hover:border-primary"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isApplyingDefaults ? 'animate-spin' : ''}`} aria-hidden="true" />
              {isApplyingDefaults ? 'Atualizando…' : 'Atualizar padrões'}
            </Button>
            </MotivoDesabilitado>
          )}
          {selectedEventId && (
            /* Tokens no lugar de `style={{}}`/hex (23/09), ao ligar o seletor ao evento em foco. */
            <div className="flex flex-col items-end gap-1">
              <EventSearchSelect value={selectedEventId} onValueChange={setSelectedEventId} events={eventsWithInclusions} />
              {selectedEvent?.startDate && (
                <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <Calendar className="w-3 h-3" aria-hidden="true" />
                  {formatEventDate(selectedEvent.startDate)}
                </span>
              )}
            </div>
          )}
        </>}
      />

      {/* ── Tela 1: Seleção de evento ── */}
      {!selectedEventId ? (
        <EmptyState
          live={false}
          icon={Calculator}
          title="Selecione um evento"
          description="Visualize o orçamento previsto com base nas escalações confirmadas. Valores calculados automaticamente."
          className="py-20"
          action={
            <div className="w-full max-w-sm text-left">
              <EventSearchSelect value={selectedEventId} onValueChange={setSelectedEventId} events={eventsWithInclusions} />
            </div>
          }
        />
      ) : (
          <>
            {/* ── Dashboard Bar Superior ── */}
            <div className="bg-card/85 border border-primary/12 rounded-xl shadow-2 overflow-hidden" style={{
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}>
              {/* Faixa accent azul topo */}
              <div className="h-[3px] bg-primary" />

              {/* flex-wrap: em telas <900px o hero e os stats quebram em linhas */}
              <div className="flex flex-wrap items-stretch">
                {/* Total Planejado — hero section */}
                <div className="px-7 py-5 flex flex-col justify-center gap-1 relative overflow-hidden grow max-[900px]:w-full bg-primary min-w-[230px]">
                  <p className="text-2xs font-extrabold uppercase tracking-[0.14em] text-white/75 relative">Total Planejado</p>
                  {selectedEvent?.startDate && (
                    <p className="flex items-center gap-1 text-2xs text-white/70 relative">
                      <Calendar className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                      {formatEventDate(selectedEvent.startDate)}
                    </p>
                  )}
                  <div className="text-3xl font-semibold text-white leading-none tracking-tight mt-1.5 relative tracking-[-0.03em]">
                    {formatCurrency(totalGeral)}
                  </div>
                </div>

                {/* Separador vertical */}
                <div className="max-[900px]:hidden bg-primary/10" style={{ width: 1 }} />

                {/* Stats */}
                <div className="flex-1 px-6 py-5 flex flex-wrap items-center gap-y-3 min-w-[280px]">
                  {/* Colaboradores */}
                  <div className="flex-1 min-w-[110px] flex flex-col items-center gap-1 px-4">
                    <div className="text-2xl font-black leading-none tracking-tight text-primary">{stats.total}</div>
                    <div className="flex items-center gap-1 text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      <Users className="w-3 h-3" aria-hidden="true" />Colaboradores
                    </div>
                  </div>

                  <div className="max-[900px]:hidden bg-primary/8" style={{ width:1, height:36 }} />

                  {/* Casa */}
                  <div className="flex-1 min-w-[90px] flex flex-col items-center gap-1 px-4">
                    <div className="text-2xl font-black leading-none tracking-tight text-primary">{stats.totalCasa}</div>
                    <div className="flex items-center gap-1 text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      <Home className="w-3 h-3" aria-hidden="true" />Casa
                    </div>
                  </div>

                  <div className="max-[900px]:hidden bg-primary/8" style={{ width:1, height:36 }} />

                  {/* Freela */}
                  <div className="flex-1 min-w-[90px] flex flex-col items-center gap-1 px-4">
                    <div className="text-2xl font-black leading-none tracking-tight text-warning">{stats.totalFreela}</div>
                    <div className="flex items-center gap-1 text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      <UserCheck className="w-3 h-3" aria-hidden="true" />Freela
                    </div>
                  </div>

                  <div className="max-[900px]:hidden bg-primary/8" style={{ width:1, height:36 }} />

                  {/* Período do evento */}
                  <div className="flex-1 min-w-[90px] flex flex-col items-center gap-1 px-4">
                    {selectedEvent?.startDate && selectedEvent?.endDate ? (
                      <div className="flex flex-col items-center gap-0">
                        <div className="text-sm font-black leading-none tracking-tight tabular-nums text-info">
                          {new Date(selectedEvent.startDate + 'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                        </div>
                        <div className="text-2xs font-bold text-muted-foreground leading-none my-0.5">→</div>
                        <div className="text-sm font-black leading-none tracking-tight tabular-nums text-info">
                          {new Date(selectedEvent.endDate + 'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm font-black leading-none tracking-tight text-muted-foreground">—</div>
                    )}
                    <div className="flex items-center gap-1 text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      <Calendar className="w-3 h-3" aria-hidden="true" />Período
                    </div>
                  </div>
                </div>
              </div>
            </div>


            {/* ── Timeline de etapas ── */}
            {(() => {
              // Etapa derivada do progresso real: com tudo enviado, o RH concluiu
              // o planejamento e a bola passa para a Prestação.
              const currentStep = stats.total > 0 && stats.progressoEnvio >= 100 ? 2 : 1;
              const steps = [
                { label: "Escalação", desc: "Inclusões confirmadas" },
                { label: "Planejamento RH", desc: "Valores previstos" },
                { label: "Prestação", desc: "Resp. preenche realizado" },
                { label: "Aprovação RH", desc: "Análise e aprovação" },
              ];
              return (
                <div className="bg-card rounded-xl px-6 py-5 border border-primary/25 shadow-2">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <span className="text-2xs font-black uppercase tracking-[0.12em] text-muted-foreground">Etapa atual</span>
                      <div className="text-sm font-bold text-primary mt-0.5">{steps[currentStep].label}</div>
                    </div>
                  </div>
                  {/* flex-wrap + min-width por etapa: abaixo de ~900px o stepper quebra em 2 linhas */}
                  <div className="flex items-center flex-wrap gap-y-4">
                    {steps.map((step, i) => {
                      const isDone = i < currentStep;
                      const isActive = i === currentStep;
                      const isLast = i === steps.length - 1;
                      return (
                        <div key={i} className="flex items-center flex-1 min-w-[150px]">
                          <div className="flex flex-col items-center gap-2">
                            {/* Bolinha */}
                            <div className="relative shrink-0">
                              {/* Ping no step ativo */}
                              {isActive && (
                                <span className="stepper-ping absolute rounded-full border-2 border-primary/35" style={{
                                  inset: -4,
                                  animation: 'stepperPing 1.6s ease-out infinite',
                                }} />
                              )}
                              <div className={cn("rounded-full flex items-center justify-center",
                                isDone ? "w-8 h-8 bg-success-strong shadow-1"
                                  : isActive ? "w-9 h-9 bg-primary ring-4 ring-primary/10 shadow-2"
                                  : "w-8 h-8 bg-muted")}>
                                {isDone ? (
                                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <span className={cn("text-xs font-extrabold", (isActive ? "text-white" : "text-muted-foreground"))}>{i + 1}</span>
                                )}
                              </div>
                            </div>
                            {/* Labels */}
                            <div className="text-center">
                              <div className={cn("text-2xs font-bold leading-tight", (isDone ? "text-success" : isActive ? "text-primary" : "text-muted-foreground"))}>{step.label}</div>
                              <div className="text-2xs text-muted-foreground mt-0.5">{step.desc}</div>
                            </div>
                          </div>
                          {!isLast && (
                            <div className="mb-7 ml-1.5 mr-1.5 rounded-full" style={{
                              flex: 1,
                              height: 3,
                              background: isDone
                                ? 'var(--success-strong)'
                                : 'var(--muted)',
                            }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

              {/* Casa */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-xl bg-card cursor-default border-t-[3px] border-t-primary shadow-1">
                      <div className="px-5 py-4 pb-4">
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-primary/8">
                            <Home className="text-primary" style={{ width:13, height:13 }} aria-hidden="true" />
                          </div>
                          <span className="text-2xs font-semibold tracking-widest uppercase text-muted-foreground">Casa</span>
                        </div>
                        <div className="text-lg font-medium text-primary tracking-[-0.02em] tabular-nums leading-none">
                          {formatCurrency(stats.valorCasa)}
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-2xs text-muted-foreground font-normal">{stats.totalCasa} colaborador{stats.totalCasa !== 1 ? 'es' : ''}</span>
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[180px] text-center">Colaboradores que trabalham no próprio estado</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Freela */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-xl bg-card cursor-default border-t-[3px] border-t-warning-strong shadow-1">
                      <div className="px-5 py-4 pb-4">
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-warning/8">
                            <UserCheck className="text-warning" style={{ width:13, height:13 }} aria-hidden="true" />
                          </div>
                          <span className="text-2xs font-semibold tracking-widest uppercase text-muted-foreground">Freela</span>
                        </div>
                        <div className="text-lg font-medium text-warning tracking-[-0.02em] tabular-nums leading-none">
                          {formatCurrency(stats.valorFreela)}
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-2xs text-muted-foreground font-normal">{stats.totalFreela} colaborador{stats.totalFreela !== 1 ? 'es' : ''}</span>
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[180px] text-center">Colaboradores contratados por evento</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Médio / Pessoa */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-xl bg-card cursor-default border-t-[3px] border-t-primary shadow-1">
                      <div className="px-5 py-4 pb-4">
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-primary/8">
                            <Users className="text-primary" style={{ width:13, height:13 }} aria-hidden="true" />
                          </div>
                          <span className="text-2xs font-semibold tracking-widest uppercase text-muted-foreground">Médio / Pessoa</span>
                        </div>
                        <div className="text-lg font-medium text-primary tracking-[-0.02em] tabular-nums leading-none">
                          {formatCurrency(stats.media)}
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-2xs text-muted-foreground font-normal">por colaborador</span>
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[180px] text-center">Média de custo por colaborador neste evento</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Médio / Dia */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-xl bg-card cursor-default border-t-[3px] border-t-info shadow-1">
                      <div className="px-5 py-4 pb-4">
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-info/8">
                            <BarChart3 className="text-info" style={{ width:13, height:13 }} aria-hidden="true" />
                          </div>
                          <span className="text-2xs font-semibold tracking-widest uppercase text-muted-foreground">Médio / Dia</span>
                        </div>
                        <div className="text-lg font-medium text-info tracking-[-0.02em] tabular-nums leading-none">
                          {formatCurrency(stats.mediaPorDia)}
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-2xs text-muted-foreground font-normal">por dia trabalhado</span>
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[180px] text-center">Média de custo por dia trabalhado neste evento</TooltipContent>
                </Tooltip>
              </TooltipProvider>

            </div>

            {/* ── Aviso de rascunho restaurado ── */}
            {draftRestored && Object.keys(budgetOverrides).length > 0 && (
              <div role="status" className="flex items-center gap-2 px-3 py-2 rounded-lg text-2xs bg-warning-soft border border-warning/25 text-warning">
                <span className="w-1.5 h-1.5 rounded-full bg-warning-strong shrink-0" />
                <span>Rascunho de edições restaurado</span>
                <span className="text-warning-strong">·</span>
                <button
                  onClick={() => { setBudgetOverrides({}); setDraftRestored(false); }}
                  className="font-semibold underline underline-offset-2 hover:text-warning transition-colors"
                  aria-label="Descartar rascunho de edições restaurado"
                >
                  Descartar
                </button>
              </div>
            )}

            {/* ── Seletor de Abas ── */}
            <div className="flex items-center gap-1 border-b border-border">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${activeTab === 'overview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-slate-600'}`}
              >
                Visão Geral
              </button>
              <button
                onClick={() => setActiveTab('sheet')}
                className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${activeTab === 'sheet' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-slate-600'}`}
              >
                Planilha de Edição
              </button>
            </div>

            {activeTab === 'overview' ? (<>
            {/* ── Filtros e Busca — minimal ── */}
            <div className="flex flex-wrap items-center gap-3 px-0">
              {selectableFiltered.length > 0 && (
                <Checkbox
                  checked={selectableFiltered.every(b => selectedIds.has(b.inclusion.id))}
                  onCheckedChange={(checked) => checked ? selectAllCards() : clearSelection()}
                  className="shrink-0"
                  aria-label="Selecionar todos os colaboradores pendentes visíveis"
                />
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Buscar por nome…"
                  aria-label="Buscar colaborador por nome"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cn("pl-7 pr-3 bg-surface-muted border-0 border-b-[1.5px] rounded-t-md text-xs text-slate-700 outline-none transition-colors focus:border-b-primary", searchTerm ? "border-b-primary" : "border-b-border")} style={{
                    height: 34,
                    width: 180,
                  }}
                />
              </div>

              <Select value={filterFunction} onValueChange={setFilterFunction}>
                <SelectTrigger className="w-auto min-w-[140px] h-[34px] text-xs shrink-0 bg-surface-muted border-0 border-b border-border rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0 focus:border-b-primary">
                  <SelectValue placeholder="Função" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-3 border border-border min-w-[180px] p-1.5 backdrop-blur-md bg-card/96">
                  <SelectItem value="all" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-brand-soft data-[highlighted]:text-primary data-[highlighted]:border-l-primary focus:bg-brand-soft focus:text-primary-hover">Todas as funções</SelectItem>
                  {uniqueFunctions.map(f => (
                    <SelectItem key={f} value={f} className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-brand-soft data-[highlighted]:text-primary data-[highlighted]:border-l-primary focus:bg-brand-soft focus:text-primary-hover">{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-28 h-[34px] text-xs shrink-0 bg-surface-muted border-0 border-b border-border rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-3 border border-border min-w-[140px] p-1.5 backdrop-blur-md bg-card/96">
                  <SelectItem value="all" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-brand-soft data-[highlighted]:text-primary data-[highlighted]:border-l-primary focus:bg-brand-soft focus:text-primary-hover">Todos</SelectItem>
                  <SelectItem value="casa" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-brand-soft data-[highlighted]:text-primary data-[highlighted]:border-l-primary focus:bg-brand-soft focus:text-primary-hover">Casa</SelectItem>
                  <SelectItem value="freela" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-brand-soft data-[highlighted]:text-primary data-[highlighted]:border-l-primary focus:bg-brand-soft focus:text-primary-hover">Freela</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-auto min-w-[120px] h-[34px] text-xs shrink-0 bg-surface-muted border-0 border-b border-border rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-3 border border-border min-w-[160px] p-1.5 backdrop-blur-md bg-card/96">
                  <SelectItem value="name_asc" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-brand-soft data-[highlighted]:text-primary data-[highlighted]:border-l-primary focus:bg-brand-soft focus:text-primary-hover">Nome A-Z</SelectItem>
                  <SelectItem value="name_desc" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-brand-soft data-[highlighted]:text-primary data-[highlighted]:border-l-primary focus:bg-brand-soft focus:text-primary-hover">Nome Z-A</SelectItem>
                  <SelectItem value="days_desc" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-brand-soft data-[highlighted]:text-primary data-[highlighted]:border-l-primary focus:bg-brand-soft focus:text-primary-hover">Mais Dias</SelectItem>
                  <SelectItem value="days_asc" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-brand-soft data-[highlighted]:text-primary data-[highlighted]:border-l-primary focus:bg-brand-soft focus:text-primary-hover">Menos Dias</SelectItem>
                  <SelectItem value="function" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-brand-soft data-[highlighted]:text-primary data-[highlighted]:border-l-primary focus:bg-brand-soft focus:text-primary-hover">Por Função</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex-1" />
              <span className="text-2xs text-muted-foreground font-semibold bg-surface-muted rounded-lg py-1 px-2.5" aria-live="polite">
                {filteredBudgets.length} resultado{filteredBudgets.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* ── Cards de Colaboradores ── */}
            {isLoadingInclusions || isLoadingFunctionValues ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
              </div>
            ) : (isErrorInclusions || isErrorFunctionValues) ? (
              <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-border">
                <RefreshCw className="w-16 h-16 text-slate-200 mb-4" aria-hidden="true" />
                <h3 className="text-base font-semibold text-slate-700">Erro ao carregar os dados</h3>
                <p className="text-sm text-muted-foreground mt-1">Não foi possível buscar as escalações deste evento</p>
                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                  onClick={() => { if (isErrorInclusions) refetchInclusions(); if (isErrorFunctionValues) refetchFunctionValues(); }}
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  Tentar novamente
                </Button>
              </div>
            ) : filteredBudgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-border">
                <Users className="w-16 h-16 text-slate-200 mb-4" aria-hidden="true" />
                <h3 className="text-base font-semibold text-slate-700">
                  {calculatedBudgets.length === 0 ? 'Nenhuma escalação confirmada' : 'Nenhum resultado encontrado'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {calculatedBudgets.length === 0 ? 'Apenas escalações confirmadas aparecem aqui' : 'Tente ajustar os filtros'}
                </p>
              </div>
            ) : (
              <div
                ref={cardsScrollRef}
                className="overflow-auto max-h-[calc(100vh-var(--sticky-top,3.5rem)-12rem)] -mx-1 px-1"
                data-testid="budget-cards-scroll"
              >
              <div className="relative" style={cardsVirtuais.ativo ? { height: cardsVirtuais.alturaTotal } : undefined}>
              {cardsVirtuais.fileiras.map(fileira => (
              <div
                key={fileira.index}
                ref={fileira.medir}
                data-index={fileira.index}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch pb-4"
                style={cardsVirtuais.ativo ? { position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${fileira.inicio}px)` } : undefined}
              >
                {fileira.itens.map((budget) => {
                  const isSent = sentToActual.has(budget.inclusion.id);
                  const isSelected = selectedIds.has(budget.inclusion.id);
                  const isCollapsed = collapsedCards.has(budget.inclusion.id);
                  const isCasa = budget.collaborator?.type === 'casa' || budget.collaborator?.type === 'local';
                  const name = nomeDaVaga(budget.inclusion);
                  const initials = name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
                  const collabFuncKey = `${budget.inclusion.collaboratorId}|${budget.inclusion.functionId}`;
                  const planRecord = plannedByCollabFunc.get(collabFuncKey);
                  const isNotAttended = !!planRecord?.didNotAttend;
                  const cardActual = actualsByCollabFunc.get(collabFuncKey);
                  
                  return (
                    <div 
                      key={budget.inclusion.id}
                      data-card-id={budget.inclusion.id}
                      className={`rounded-xl border transition-all duration-500 ease-in-out overflow-hidden flex flex-col group h-full ${
                        isNotAttended ? 'bg-surface-muted border-border shadow-1' :
                        highlightCardId === budget.inclusion.id ? 'bg-card ring-2 ring-primary shadow-3' :
                        isSelected ? 'bg-card ring-2 ring-success-strong border-success/25 shadow-2' : 
                        isSent ? 'bg-card border-primary/25 opacity-85 shadow-1' :
                        budget.hasOverride ? 'bg-card border-warning/25 shadow-1' : 'bg-card border-border shadow-1'
                      } ${!isNotAttended && !isSelected ? 'hover:-translate-y-1 hover:shadow-3  hover:border-primary/25' : ''}`}
                    >
                      {/* stripe top */}
                      <div className={`h-[3px] ${isSelected ? 'bg-success-strong' : isSent ? 'bg-primary/40' : isNotAttended ? 'bg-slate-300' : 'bg-primary'}`} />
                      {/* ── Header do card — estado INATIVO (Não Participou) ── */}
                      {isNotAttended ? (
                        <div className="px-4 py-3 bg-card">
                          {/* Linha superior: avatar + nome + botão restaurar */}
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground text-xs font-bold shrink-0 bg-border">
                              {initials || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-slate-600 text-sm truncate block">{name}</span>
                              <span className="text-2xs text-muted-foreground">{getFunctionName(budget.inclusion.functionId)}</span>
                            </div>
                            {canMarkNotAttended && planRecord && (
                              <button
                                className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary-hover active:scale-95 transition-all shrink-0 disabled:opacity-60 shadow-1"
                                onClick={() => setRestoreModal({
                                  id: planRecord.id, name,
                                  functionName: getFunctionName(budget.inclusion.functionId),
                                  startDate: budget.inclusion.scheduleStartDate ?? undefined,
                                  endDate: budget.inclusion.scheduleEndDate ?? undefined,
                                })}
                                disabled={toggleNotAttendedMutation.isPending}
                              >
                                <Undo2 style={{width:14, height:14}} aria-hidden="true" />
                                Restaurar
                              </button>
                            )}
                          </div>

                          {/* Linha inferior: data + badge motivo */}
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {/* Data do período */}
                            {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-2xs font-normal text-muted-foreground">
                                <Calendar className="text-muted-foreground shrink-0" style={{ width:10, height:10 }} aria-hidden="true" />
                                {new Date(budget.inclusion.scheduleStartDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                                <span className="text-muted-foreground">–</span>
                                {new Date(budget.inclusion.scheduleEndDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                              </span>
                            )}
                            {/* Badge ausência */}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-medium bg-warning-soft text-warning border border-warning/25">
                              <UserX style={{width:10, height:10}} aria-hidden="true" />
                              Não participou
                            </span>
                            {/* Motivo */}
                            {planRecord?.didNotAttendReason && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-medium bg-warning-soft text-warning border border-warning/25">
                                "{planRecord.didNotAttendReason}"
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                      /* ── Header do card — estado ATIVO ── */
                      <div className={`flex items-center justify-between px-4 py-3 ${
                        isSent ? 'bg-brand-soft/40' : 'bg-surface-muted/60'
                      }`}>
                        <div className="flex items-center gap-3">
                          {/* Checkbox / lock */}
                          {!isSent ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleCardSelection(budget.inclusion.id)}
                              aria-label={`Selecionar ${name}`}
                            />
                          ) : (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Lock className="w-4 h-4 text-primary/70 shrink-0 cursor-default" aria-hidden="true" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="text-xs">
                                  Aguardando prestação de contas
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}

                          {/* Avatar */}
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarColor(name)}`}>
                            {initials || '?'}
                          </div>

                          <div className="min-w-0 flex-1 flex flex-col gap-y-1">
                            {/* Linha 1: nome + dot */}
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-foreground text-sm truncate">{name}</span>
                              {budget.hasOverride && (
                                <span className="w-2 h-2 rounded-full bg-warning-strong shrink-0" title="Valores personalizados" />
                              )}
                              {cardActual?.rhAdjusted && (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-xs shrink-0 cursor-default text-warning">✏</span>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="text-xs">RH ajustou o realizado deste colaborador</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            {/* Linha 2: badge de data */}
                            {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && (
                              <span className="inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded-md bg-muted text-2xs font-normal text-muted-foreground tracking-[0.01em]">
                                <Calendar className="text-muted-foreground shrink-0" style={{ width:10, height:10 }} aria-hidden="true" />
                                {new Date(budget.inclusion.scheduleStartDate + 'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                                <span className="text-muted-foreground">–</span>
                                {new Date(budget.inclusion.scheduleEndDate + 'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                              </span>
                            )}
                            {/* Linha 3: badges de função/tipo */}
                            <div className="flex items-center gap-1 overflow-hidden flex-wrap">
                              <span className="text-2xs font-semibold text-slate-600 bg-border px-2 py-0.5 rounded-full truncate shrink min-w-0">{getFunctionName(budget.inclusion.functionId)}</span>
                              {isAtendimentoFunction(getFunctionName(budget.inclusion.functionId)) && (
                                budget.inclusion.atendimentoTipo ? (
                                  <span className="text-2xs font-semibold text-primary bg-brand-soft px-2 py-0.5 rounded-full shrink-0" title="Tipo de atendimento — troque no modal de edição">
                                    {budget.inclusion.atendimentoTipo === 'key_account' ? 'Key Account' : 'Exec. Contas'}
                                  </span>
                                ) : (
                                  <span className="text-2xs font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded-full shrink-0" title="Defina Key Account ou Executivo de Contas no modal de edição">
                                    definir tipo
                                  </span>
                                )
                              )}
                              {budget.isPercurso && (
                                budget.percurseiroTipo ? (
                                  <span className="text-2xs font-semibold text-primary bg-brand-soft px-2 py-0.5 rounded-full shrink-0" title="Tipo do percurseiro (pacote fechado) — troque no modal de edição">
                                    {PERCURSEIRO_TIPOS.find(t => t.value === budget.percurseiroTipo)?.label}
                                  </span>
                                ) : (
                                  <span className="text-2xs font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded-full shrink-0" title="Defina Tipo 1 ou Tipo 2 no modal de edição — Tipo 1 usado provisoriamente">
                                    definir tipo
                                  </span>
                                )
                              )}
                              {budget.cenoEmpreitaVaga && (
                                budget.cenoFreelaTipo ? (
                                  <span className="text-2xs font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded-full shrink-0" title="Modalidade da empreita cenotécnica — definida na tela de Escalação (somente leitura aqui)">
                                    {CENO_FREELA_TIPO_LABELS[budget.cenoFreelaTipo]}
                                  </span>
                                ) : (
                                  <span className="text-2xs font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded-full shrink-0" title="Sem modalidade de empreita: o cálculo segue a diária padrão. A escolha é feita na tela de Escalação (somente leitura aqui)">
                                    definir tipo na Escalação
                                  </span>
                                )
                              )}
                              {budget.funcaoLocal && !budget.isPercurso && (
                                <span className="text-2xs font-semibold text-slate-600 bg-muted border border-border px-2 py-0.5 rounded-full shrink-0" title={FUNCAO_LOCAL_RAZAO}>
                                  só diária
                                </span>
                              )}
                              <span className={`text-2xs font-bold px-2 py-0.5 rounded-full shrink-0 ${isCasa ? 'bg-brand-soft text-primary' : 'bg-warning-soft text-warning'}`}>{isCasa ? 'Casa' : 'Freela'}</span>
                              {isSent && (
                                <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap bg-brand-soft text-primary border border-primary/25">
                                  <CheckCheck style={{width:10,height:10}} aria-hidden="true" />
                                  Salvo
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-0.5">
                          {canMarkNotAttended && !isSent && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-danger-strong hover:bg-danger-soft rounded-lg"
                                    aria-label={`Marcar ${name} como não participou`}
                                    onClick={() => setNotAttendedModal({
                                      id: planRecord?.id,
                                      budget: planRecord ? undefined : budget,
                                      name,
                                      functionName: getFunctionName(budget.inclusion.functionId)
                                    })}>
                                    <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">Marcar como não participou</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          {canEdit && !isSent && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary-hover hover:bg-brand-soft rounded-lg" title="Editar valores" aria-label={`Editar valores de ${name}`} onClick={() => openEditModal(budget)}>
                              <Edit className="w-3.5 h-3.5" aria-hidden="true" />
                            </Button>
                          )}
                          {isSent && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-primary/70 hover:text-primary-hover hover:bg-brand-soft rounded-lg" onClick={() => openEditModal(budget, true)} aria-label={`Visualizar detalhes de ${name}`}>
                                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">Visualizar detalhes e observações</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {!isSent && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 rounded-lg text-success hover:text-success hover:bg-success-soft"
                              title="Enviar para o Realizado"
                              aria-label={`Enviar ${name} para o Realizado`}
                              onClick={() => setConfirmSend({ ids: [budget.inclusion.id], source: 'single' })}
                            >
                              <Send className="w-3.5 h-3.5" aria-hidden="true" />
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-slate-600 rounded-lg"
                            title={isCollapsed ? "Expandir" : "Recolher"}
                            aria-label={isCollapsed ? `Expandir card de ${name}` : `Recolher card de ${name}`}
                            onClick={() => toggleCollapse(budget.inclusion.id)}
                          >
                            {isCollapsed ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronUp className="w-4 h-4" aria-hidden="true" />}
                          </Button>
                          </div>
                        </div>
                      </div>
                      )}
                      
                      {/* ── Corpo colapsável ── */}
                      {!isCollapsed && (
                        <div className={`px-4 pt-3 pb-3 flex-1 flex flex-col gap-3 transition-all duration-500${isNotAttended ? ' opacity-25 grayscale pointer-events-none select-none' : ''}`}>
                          {/* 3 blocos — hierarquia tipográfica + altura mínima consistente */}
                          <div className="flex flex-col gap-2">
                            {/* ── Diárias ── */}
                            <div className="rounded-xl flex items-stretch bg-brand-soft" style={{ minHeight: 50 }}>
                              {/* Esquerda: ícone + label + total */}
                              <div className="flex items-center px-3 py-2.5 shrink-0" style={{minWidth: 112}}>
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="w-2.5 h-2.5 shrink-0 text-primary" aria-hidden="true" />
                                    <span className="text-2xs font-semibold uppercase tracking-[0.1em] text-primary">Diárias</span>
                                  </div>
                                  <span className={cn("tabular-nums font-medium text-sm leading-none text-foreground tracking-[-0.01em]", (isNotAttended ? "line-through" : "no-underline"))}>{formatCurrency(budget.subtotalDiarias)}</span>
                                </div>
                              </div>
                              {/* Separador */}
                              <div className="bg-primary/7" style={{ width: 1, margin: '9px 0' }} />
                              {/* Direita: detalhes */}
                              <div className="flex-1 flex flex-col justify-center gap-1 px-3 py-2.5">
                                {/* Percurso: pacote fechado × diárias fixas (viagem 2 / local 1) */}
                                {budget.isPercurso && (
                                  <>
                                    <div className="flex items-center justify-between gap-x-2">
                                      <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground">
                                        {budget.diasComDiaria} {budget.diasComDiaria === 1 ? 'diária' : 'diárias'} ({budget.inclusion.needsTicket ? 'percurso em viagem — regra fixa' : 'percurso local — regra fixa'})
                                      </span>
                                      <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.valorDiaria)}</span>
                                    </div>
                                    {budget.percurseiro && (
                                      <span className="text-2xs leading-tight text-muted-foreground tabular-nums"
                                        title="Composição do pacote por diária: motoqueiro + fee Ivan + alimentação (3 refeições) + ajuda transporte + NF">
                                        {formatCurrency(budget.percurseiro.motoqueiro)} + fee {formatCurrency(budget.percurseiro.fee)} + alim. {formatCurrency(budget.percurseiro.alimentacao)} + transp. {formatCurrency(budget.percurseiro.transporte)} + NF {formatCurrency(budget.percurseiro.nf)}
                                      </span>
                                    )}
                                  </>
                                )}
                                {/* Empreita cenotécnica: valor FECHADO por nº de dias (tipo definido na Escalação) */}
                                {!budget.isPercurso && budget.cenoEmpreita && (
                                  <>
                                    <div className="flex items-center justify-between gap-x-2">
                                      <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground"
                                        title="Empreita: valor fechado da tabela pelo nº de dias — não é diária × dias, e não sofre deflação por período. A modalidade é definida na tela de Escalação.">
                                        Empreita — {CENO_FREELA_TIPO_LABELS[budget.cenoEmpreita.tipo]} · {budget.cenoEmpreita.dias} {budget.cenoEmpreita.dias === 1 ? 'dia' : 'dias'} · valor fechado
                                      </span>
                                      <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.subtotalDiarias)}</span>
                                    </div>
                                    {budget.cenoEmpreita.extrapolado && (
                                      <span className="text-2xs leading-tight font-semibold text-warning"
                                        title="Fora da faixa da tabela: o valor foi extrapolado pelo incremento constante da modalidade">
                                        valor extrapolado (tabela cobre 2 a 6 dias)
                                      </span>
                                    )}
                                  </>
                                )}
                                {!budget.isPercurso && !budget.cenoEmpreita && budget.regraDiaria === 'nenhuma' && (budget.weekdays > 0 || budget.weekends > 0) && (
                                  <span className="font-normal text-2xs leading-tight text-muted-foreground"
                                    title="Cenotécnica da casa (CLT): não recebe diária (nem em fim de semana)">
                                    sem diária (cenotécnica CLT)
                                  </span>
                                )}
                                {!budget.isPercurso && !budget.cenoEmpreita && budget.regraDiaria !== 'nenhuma' && budget.weekdays > 0 && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground" style={{ minWidth:'fit-content' }}>{formatDiasUteis(budget.weekdays)}</span>
                                    {budget.regraDiaria === 'fds' ? (
                                      <span className="font-normal text-2xs leading-tight shrink-0 text-muted-foreground"
                                        title="Colaborador da casa (CLT): em dia útil já é assalariado — diária só nos fins de semana">
                                        sem diária (CLT)
                                      </span>
                                    ) : (
                                      <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.valorDiariaUtil)}</span>
                                    )}
                                  </div>
                                )}
                                {!budget.isPercurso && !budget.cenoEmpreita && budget.regraDiaria !== 'nenhuma' && budget.weekends > 0 && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground" style={{ minWidth:'fit-content' }}>{formatFds(budget.weekends)}</span>
                                    <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.valorDiariaFds)}</span>
                                  </div>
                                )}
                                {!budget.isPercurso && !budget.cenoEmpreita && budget.weekdays === 0 && budget.weekends === 0 && (
                                  <span className="text-2xs font-normal text-muted-foreground">—</span>
                                )}
                                {/* Memória da deflação por período (>4 dias) */}
                                {budget.deflationSegments.length > 1 && (
                                  <span className="text-2xs leading-tight font-normal tabular-nums text-primary"
                                    title="Deflação por período: 100% até o 4º dia; fatores reduzidos nas faixas seguintes">
                                    {formatSegmentsMemo(budget.deflationSegments)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* ── Alimentação ── */}
                            <div className="rounded-xl flex items-stretch bg-warning-soft" style={{ minHeight: 50 }}>
                              <div className="flex items-center px-3 py-2.5 shrink-0" style={{minWidth: 112}}>
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <Utensils className="w-2.5 h-2.5 shrink-0 text-warning" aria-hidden="true" />
                                    <span className="text-2xs font-semibold uppercase tracking-[0.1em] text-warning">Alimentação</span>
                                    {budget.alimEstimada && (
                                      <span className="inline-flex items-center px-1 py-px rounded-full text-2xs font-semibold shrink-0 bg-warning-soft text-warning"
                                        title="Sem horários da passagem registrada — refeições estimadas até a compra">
                                        estimado
                                      </span>
                                    )}
                                  </div>
                                  <span className={cn("tabular-nums font-medium text-sm leading-none text-foreground tracking-[-0.01em]", (isNotAttended ? "line-through" : "no-underline"))}>{formatCurrency(budget.almocoSemana + budget.jantarSemana + budget.almocoFds + budget.jantarFds)}</span>
                                </div>
                              </div>
                              <div className="bg-warning/8" style={{ width: 1, margin: '9px 0' }} />
                              <div className="flex-1 flex flex-col justify-center gap-1 px-3 py-2.5">
                                {(budget.almocoSemana > 0 || budget.jantarSemana > 0) && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground" style={{ minWidth:'fit-content' }}>Semana</span>
                                    <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-warning">{formatCurrency(budget.almocoSemana + budget.jantarSemana)}</span>
                                  </div>
                                )}
                                {(budget.almocoFds > 0 || budget.jantarFds > 0) && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground" style={{ minWidth:'fit-content' }}>Fim de semana</span>
                                    <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-warning">{formatCurrency(budget.almocoFds + budget.jantarFds)}</span>
                                  </div>
                                )}
                                {budget.almocoSemana === 0 && budget.jantarSemana === 0 && budget.almocoFds === 0 && budget.jantarFds === 0 && (
                                  budget.isPercurso
                                    ? <span className="text-2xs font-normal text-muted-foreground" title="Alimentação (3 refeições) já está dentro do pacote do percurseiro">incluída no pacote</span>
                                    : budget.funcaoLocal
                                      ? <span className="text-2xs font-normal text-muted-foreground" title={FUNCAO_LOCAL_RAZAO}>sem alimentação (função local)</span>
                                      : <span className="text-2xs font-normal text-muted-foreground">—</span>
                                )}
                              </div>
                            </div>

                            {/* ── Mobilidade ── */}
                            <div className="rounded-xl flex items-stretch bg-brand-soft" style={{ minHeight: 50 }}>
                              <div className="flex items-center px-3 py-2.5 shrink-0" style={{minWidth: 112}}>
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <Car className="w-2.5 h-2.5 shrink-0 text-primary" aria-hidden="true" />
                                    <span className="text-2xs font-semibold uppercase tracking-[0.1em] text-primary">Mobilidade</span>
                                  </div>
                                  <span className={cn("tabular-nums font-medium text-sm leading-none text-foreground tracking-[-0.01em]", (isNotAttended ? "line-through" : "no-underline"))}>{formatCurrency(budget.mobilidade)}</span>
                                </div>
                              </div>
                              <div className="bg-primary-hover/8" style={{ width: 1, margin: '9px 0' }} />
                              <div className="flex-1 flex flex-col justify-center gap-1 px-3 py-2.5">
                                {budget.mobilidadeIda > 0 && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground" style={{ minWidth:'fit-content' }}>Ida</span>
                                    <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.mobilidadeIda)}</span>
                                  </div>
                                )}
                                {budget.mobilidadeVolta > 0 && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground" style={{ minWidth:'fit-content' }}>Volta</span>
                                    <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.mobilidadeVolta)}</span>
                                  </div>
                                )}
                                {budget.mobilidadeIda === 0 && budget.mobilidadeVolta === 0 && (
                                  budget.isPercurso
                                    ? <span className="text-2xs font-normal text-muted-foreground" title="Ajuda de custo transporte já está dentro do pacote do percurseiro">incluída no pacote</span>
                                    : budget.funcaoLocal
                                      ? <span className="text-2xs font-normal text-muted-foreground" title={FUNCAO_LOCAL_RAZAO}>sem mobilidade (função local)</span>
                                      : <span className="text-2xs font-normal text-muted-foreground">—</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── Rodapé Total ── */}
                      <div
                        className={cn(`transition-all duration-500${isNotAttended ? ' opacity-30 grayscale' : ''}`, "flex justify-between items-center py-2.5 px-4", (isNotAttended ? "bg-surface-muted" : "bg-brand-soft"))}
                        style={{
                          borderTop: isNotAttended ? '1px solid var(--border)' : '1px solid var(--brand-soft)',
                          marginTop: 'auto',
                        }}>
                        <span className={cn("text-2xs font-semibold uppercase tracking-widest", (isNotAttended ? "text-muted-foreground" : "text-primary"))}>
                          {isNotAttended ? 'Não contabilizado' : 'Total Planejado'}
                        </span>
                        <span className={cn("text-base font-medium tracking-[-0.02em] tabular-nums", (isNotAttended ? "text-muted-foreground" : "text-primary"), (isNotAttended ? "line-through" : "no-underline"))}>
                          {formatCurrency(budget.totalFinal)}
                        </span>
                      </div>
                      {planRecord && eventNotes.length > 0 && (
                        <div className="px-4 pb-2 flex flex-col gap-1">
                          <BudgetNotesBadge notes={eventNotes} entityId={planRecord.id} />
                          <BudgetNotesSnippet notes={eventNotes} entityId={planRecord.id} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              ))}
              </div>
              </div>
            )}
            </>) : (
            <>
              {/* ── Planilha de Edição ── */}
              {/* Toolbar */}
              <div className="flex items-center justify-between px-1 py-1">
                <span className="text-2xs text-muted-foreground font-medium" aria-live="polite">{filteredBudgets.length} colaborador{filteredBudgets.length !== 1 ? 'es' : ''}</span>
                {confirmReset ? (
                  <div className="flex items-center gap-2 text-2xs">
                    <span className="text-muted-foreground">Isso limpa os ajustes manuais de todos os visíveis (filtro atual). Confirmar?</span>
                    <button
                      onClick={() => {
                        setBudgetOverrides(prev => {
                          const updated = { ...prev };
                          filteredBudgets.forEach(b => { delete updated[b.inclusion.id]; });
                          return updated;
                        });
                        setConfirmReset(false);
                      }}
                      className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold text-2xs hover:bg-primary-hover transition-colors"
                    >
                      Sim, aplicar
                    </button>
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="px-2.5 py-1 rounded-md border border-border text-muted-foreground font-medium text-2xs hover:bg-surface-muted transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAdvancedBatch({ target: 'all', field: 'vdia', value: '' })}
                      className="text-2xs px-3 py-1.5 rounded-lg text-success bg-success-soft hover:bg-success-soft border border-success/25 transition-colors flex items-center gap-1.5 font-medium"
                    >
                      ✏ Edição em Lote
                    </button>
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setConfirmReset(true)}
                            className="text-2xs px-3 py-1.5 rounded-lg text-primary bg-brand-soft hover:bg-brand-soft border border-primary/25 transition-colors flex items-center gap-1.5 font-medium"
                          >
                            <RotateCcw className="w-3 h-3" aria-hidden="true" />
                            Restaurar Padrão em Todos
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs max-w-[240px] text-center">
                          Limpa os ajustes manuais de todos os visíveis (filtro atual) e volta ao cálculo automático da regra atual: diária plana por tipo (Atendimento/Casa/Freela), deflação por período e alimentação/mobilidade pelos horários de voo
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </div>

              {/* Edição em lote — Radix Dialog (Esc, foco preso, aria); pergunta antes de descartar um valor digitado */}
              <Dialog open={!!advancedBatch} onOpenChange={(v) => { if (!v) descarteLote.pedirParaFechar(() => setAdvancedBatch(null)); }}>
              {advancedBatch && (
                <DialogContent
                  className="max-w-md rounded-xl p-6 gap-0"
                  onOpenAutoFocus={(e) => { e.preventDefault(); batchValueRef.current?.focus(); }}
                >
                    <DialogHeader className="mb-5 text-left">
                      <DialogTitle className="text-base font-bold text-foreground">Edição em lote</DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground">
                        Aplica um mesmo valor a várias vagas de uma vez.
                      </DialogDescription>
                    </DialogHeader>
                    {/* Target */}
                    <fieldset className="mb-4">
                      <legend className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quem será afetado</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {(['all','casa','freela','selected'] as const).map(t => (
                          <button key={t} type="button" aria-pressed={advancedBatch.target === t} onClick={() => setAdvancedBatch(p => p ? {...p, target: t} : p)}
                            className={`text-xs px-3 py-2 rounded-lg border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${advancedBatch.target === t ? 'border-primary bg-brand-soft text-primary' : 'border-border text-slate-600 hover:bg-surface-muted'}`}>
                            {t === 'all' ? 'Todos' : t === 'casa' ? 'Somente CASA' : t === 'freela' ? 'Somente FREELA' : `Selecionados (${selectedIds.size})`}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    {/* Field */}
                    <fieldset className="mb-4">
                      <legend className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">O que alterar</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          ['vdia','Diária (R$/dia)','border-primary bg-surface-muted text-primary'],
                          ['alimUtil','Alimentação útil','border-primary bg-surface-muted text-primary'],
                          ['alimFds','Alimentação FDS','border-warning-strong bg-surface-muted text-warning'],
                          ['mob','Mobilidade','border-primary bg-surface-muted text-primary'],
                        ] as const).map(([f, label, ativo]) => (
                          <button key={f} type="button" aria-pressed={advancedBatch.field === f} onClick={() => setAdvancedBatch(p => p ? {...p, field: f} : p)}
                            className={`text-xs px-3 py-2 rounded-lg border font-medium transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${advancedBatch.field === f ? ativo : 'border-border text-slate-600 hover:bg-surface-muted'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    {/* Value */}
                    <div className="mb-5">
                      <label htmlFor="batch-novo-valor" className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        {advancedBatch.field === 'mob' ? 'Novo valor (R$ total ida+volta)' : 'Novo valor (R$/dia)'}
                      </label>
                      <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/20">
                        <span className="text-muted-foreground text-sm font-medium" aria-hidden="true">R$</span>
                        <input
                          id="batch-novo-valor"
                          ref={batchValueRef}
                          type="text" inputMode="decimal" placeholder="0,00"
                          value={advancedBatch.value}
                          onChange={e => setAdvancedBatch(p => p ? {...p, value: e.target.value} : p)}
                          onKeyDown={e => { if (e.key === 'Enter') applyAdvancedBatch(); }}
                          className="flex-1 text-right text-sm font-mono font-semibold outline-none bg-transparent text-foreground"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => descarteLote.pedirParaFechar(() => setAdvancedBatch(null))} className="flex-1 h-10 rounded-xl">Cancelar</Button>
                      <Button type="button" onClick={applyAdvancedBatch} className="flex-1 h-10 rounded-xl font-bold">
                        Aplicar ajuste
                      </Button>
                    </div>
                </DialogContent>
              )}
              </Dialog>
              {descarteLote.Dialogo}

              {/* Tabela */}
              {(() => {
                const colSpanTotal = 7;

                return (
                <div ref={batchPopoverRef} className="bg-card rounded-xl border border-border overflow-hidden">
                  <div ref={sheetScrollRef} className="overflow-auto max-h-[calc(100vh-var(--sticky-top,3.5rem)-16rem)]" data-testid="budget-sheet-scroll">
                    <table className="w-full">
                      <thead className="sticky top-0 z-10 bg-surface-muted">
                        <tr className="border-b border-border">
                          {/* Checkbox select-all */}
                          <th scope="col" className="w-10 px-3 py-2.5 bg-surface-muted/80">
                            <Checkbox
                              checked={selectableFiltered.length > 0 && selectableFiltered.every(b => selectedIds.has(b.inclusion.id))}
                              onCheckedChange={v => {
                                // Só os SELECIONÁVEIS entram: enviados e "não participou" ficam de fora
                                setSelectedIds(v
                                  ? new Set(selectableFiltered.map(b => b.inclusion.id))
                                  : new Set()
                                );
                              }}
                              className="w-3.5 h-3.5"
                              aria-label="Selecionar todos os colaboradores pendentes visíveis"
                            />
                          </th>
                          {/* Colaborador / Função / Período */}
                          <th scope="col" className="text-left px-4 py-2.5 text-2xs font-semibold uppercase tracking-[0.07em] min-w-[260px] bg-surface-muted/80 text-muted-foreground">Colaborador · Função · Período</th>

                          {/* Diárias (qty) — read-only */}
                          <th scope="col" className="text-center px-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.07em] w-20 bg-muted text-muted-foreground">
                            <div className="flex items-center justify-center gap-1">
                              <Lock className="text-muted-foreground shrink-0" style={{ width:10, height:10 }} aria-hidden="true" />
                              <span>Dias</span>
                            </div>
                          </th>

                          {/* Diária R$/dia — batch edit */}
                          <th scope="col" className="text-right px-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.07em] w-36 relative bg-surface-muted text-slate-700">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-2xs font-semibold text-slate-600">Diária R$/dia</span>
                              <button
                                onClick={e => { batchTriggerRef.current = e.currentTarget; setBatchPopover(batchPopover?.field === 'vdia' ? null : { field: 'vdia', value: '' }); }}
                                className={`text-2xs p-1.5 -m-1 rounded transition-colors cursor-pointer ${batchApplied.has('vdia') ? 'text-primary' : 'text-muted-foreground hover:text-muted-foreground'}`}
                                style={{minWidth:24, minHeight:24}}
                                title="Editar em lote"
                                aria-label="Editar diária em lote"
                                aria-expanded={batchPopover?.field === 'vdia'}
                              >✏</button>
                            </div>
                            {batchPopover?.field === 'vdia' && (
                              <BatchPopover
                                title="Aplicar R$/dia para todos"
                                value={batchPopover.value}
                                onChangeValue={v => setBatchPopover(p => p ? {...p, value: v} : p)}
                                onCancel={() => setBatchPopover(null)}
                                onApply={() => { applyBatchEdit('vdia', batchPopover.value); setBatchPopover(null); }}
                              />
                            )}
                          </th>

                          {/* Alim. R$/dia — batch edit */}
                          <th scope="col" className="text-right px-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.07em] w-36 relative bg-surface-muted text-slate-700">
                            <div className="flex items-center justify-end gap-1">
                              <div className="flex flex-col items-end leading-tight gap-0.5">
                                <span className="text-2xs font-semibold text-slate-600">Alim. R$/dia</span>
                                <div className="flex items-center gap-2 text-2xs font-medium text-muted-foreground">
                                  <span><span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5 bg-primary align-middle" />Útil</span>
                                  <span><span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5 bg-warning-strong align-middle" />FDS</span>
                                </div>
                              </div>
                              <button
                                onClick={e => { batchTriggerRef.current = e.currentTarget; setBatchPopover(batchPopover?.field === 'alim' ? null : { field: 'alim', value: '' }); }}
                                className={`text-2xs p-1.5 -m-1 rounded transition-colors cursor-pointer ${batchApplied.has('alim') ? 'text-primary' : 'text-muted-foreground hover:text-muted-foreground'}`}
                                style={{minWidth:24, minHeight:24}}
                                title="Editar em lote"
                                aria-label="Editar alimentação em lote"
                                aria-expanded={batchPopover?.field === 'alim'}
                              >✏</button>
                            </div>
                            {batchPopover?.field === 'alim' && (
                              <BatchPopover
                                title="Alim. R$/dia — aplicar para todos"
                                value={batchPopover.value}
                                onChangeValue={v => setBatchPopover(p => p ? {...p, value: v} : p)}
                                onCancel={() => setBatchPopover(null)}
                                onApply={() => { applyBatchEdit('alim', batchPopover.value); setBatchPopover(null); }}
                              />
                            )}
                          </th>

                          {/* Mobilidade — batch edit */}
                          <th scope="col" className="text-right px-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.07em] w-28 relative bg-surface-muted text-slate-700">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-slate-600">Mob. R$ total</span>
                                <button
                                  onClick={e => { batchTriggerRef.current = e.currentTarget; setBatchPopover(batchPopover?.field === 'mob' ? null : { field: 'mob', value: '' }); }}
                                  className={`text-2xs p-1.5 -m-1 rounded transition-colors cursor-pointer ${batchApplied.has('mob') ? 'text-primary' : 'text-muted-foreground hover:text-muted-foreground'}`}
                                  style={{minWidth:24, minHeight:24}}
                                  title="Editar em lote"
                                  aria-label="Editar mobilidade em lote"
                                  aria-expanded={batchPopover?.field === 'mob'}
                                >✏</button>
                              </div>
                              {batchPopover?.field === 'mob' && (
                                <BatchPopover
                                  title="Mob. R$ total (Ida+Volta) — aplicar para todos"
                                  value={batchPopover.value}
                                  onChangeValue={v => setBatchPopover(p => p ? {...p, value: v} : p)}
                                  onCancel={() => setBatchPopover(null)}
                                  onApply={() => { applyBatchEdit('mob', batchPopover.value); setBatchPopover(null); }}
                                />
                              )}
                            </th>
                          <th scope="col" className="text-right px-4 py-2.5 text-2xs font-semibold uppercase tracking-[0.07em] w-28 bg-brand-soft/60 text-primary">Subtotal</th>
                        </tr>

                        {/* Banner de edição em lote */}
                        {batchApplied.size > 0 && (
                          <tr>
                            <td colSpan={colSpanTotal} className="bg-brand-soft py-1 px-4">
                              <div className="flex items-center gap-2 text-2xs text-primary">
                                <span>✏ {Array.from(batchApplied).map(f => f === 'vdia' ? 'R$/dia' : f === 'alim' ? 'Alimentação' : 'Mobilidade').join(' e ')} editado{batchApplied.size > 1 ? 's' : ''} em lote</span>
                                {batchHistory && (
                                  <>
                                    <span className="text-primary/70">·</span>
                                    <button onClick={undoBatch} className="cursor-pointer font-semibold px-2 py-0.5 rounded text-2xs transition-colors hover:opacity-80 bg-primary text-primary-foreground">Desfazer</button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-border" aria-rowcount={filteredBudgets.length + 1}>
                        {filteredBudgets.length === 0 ? (
                          <tr>
                            <td colSpan={colSpanTotal} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum colaborador encontrado</td>
                          </tr>
                        ) : (<>
                          <EspacadorLinha altura={linhasPlanilha.espacoAntes} colunas={colSpanTotal} />
                          {linhasPlanilha.linhas.map(({ item: budget, index: rowIdx, medir }) => {
                          const sid = budget.inclusion.id;
                          const prevBudgetCollab = rowIdx > 0 ? filteredBudgets[rowIdx - 1].inclusion.collaboratorId : null;
                          const isNewCollab = prevBudgetCollab !== budget.inclusion.collaboratorId;
                          return (
                            <SheetRow
                              key={sid}
                              ref={medir}
                              index={rowIdx}
                              budget={budget}
                              name={nomeDaVaga(budget.inclusion)}
                              funcName={getFunctionName(budget.inclusion.functionId)}
                              isSent={sentToActual.has(sid)}
                              isNotAttended={isCardNotAttended(budget)}
                              isNewCollab={isNewCollab}
                              showTopBorder={isNewCollab && rowIdx > 0}
                              selected={selectedIds.has(sid)}
                              ovr={budgetOverrides[sid]}
                              matchingActual={actualsByCollabFunc.get(`${budget.inclusion.collaboratorId}|${budget.inclusion.functionId}`)}
                              subtotalOpen={subtotalOpenId === sid}
                              onToggleSelect={toggleRowSelection}
                              onSheetEdit={handleSheetEdit}
                              onRestoreField={restoreSheetField}
                              onToggleSubtotal={toggleSubtotalPopover}
                            />
                          );
                          })}
                          <EspacadorLinha altura={linhasPlanilha.espacoDepois} colunas={colSpanTotal} />
                        </>)}
                      </tbody>
                      {filteredBudgets.length > 0 && (() => {
                        const totalDiariasCols = filteredBudgets.reduce((s, b) => s + b.subtotalDiarias, 0);
                        const totalAlimCols = filteredBudgets.reduce((s, b) => s + b.almocoSemana + b.jantarSemana + b.almocoFds + b.jantarFds, 0);
                        const totalMobCols = filteredBudgets.reduce((s, b) => s + b.mobilidade, 0);
                        return (
                          <tfoot>
                            <tr className="bg-brand-soft border-t-2 border-t-primary">
                              <td style={{width:40}} />
                              <td className="px-4 py-2.5">
                                <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  TOTAL ({filteredBudgets.length})
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-xs font-mono font-semibold text-muted-foreground tabular-nums">
                                  {filteredBudgets.reduce((s, b) => s + b.weekdays + b.weekends, 0)} dias
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-xs font-mono font-semibold text-muted-foreground tabular-nums">
                                  {formatCurrency(totalDiariasCols)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-xs font-mono font-semibold text-muted-foreground tabular-nums">
                                  {formatCurrency(totalAlimCols)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-xs font-mono font-semibold text-muted-foreground tabular-nums">
                                  {formatCurrency(totalMobCols)}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className="text-base font-extrabold font-mono tabular-nums text-primary">{formatCurrency(totalGeral)}</span>
                              </td>
                            </tr>
                          </tfoot>
                        );
                      })()}
                    </table>
                  </div>
                </div>
                );
              })()}

              {/* ── Rodapé de Ações da Planilha ── */}
              {(() => {
                const pendingSheet = filteredBudgets.filter(b => !sentToActual.has(b.inclusion.id) && !isCardNotAttended(b));
                const hasEdits = pendingSheet.some(b => b.hasOverride);
                const isAdmin = isRhOrAdmin(user);
                const hasPending = pendingSheet.length > 0;
                return (
                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
                    <div className="flex items-center gap-2">
                      {hasPending && (
                        <span className="inline-flex items-center gap-1.5 text-2xs font-semibold px-2.5 py-1 rounded-full border bg-warning-soft text-warning border-warning/25">
                          ⏱ {pendingSheet.length} {pendingSheet.length === 1 ? 'pendente' : 'pendentes'}
                        </span>
                      )}
                      {hasEdits && (
                        <span className="inline-flex items-center gap-1 text-2xs font-semibold text-warning bg-warning-soft border border-warning/25 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 bg-warning-strong rounded-full" />
                          Valores editados
                        </span>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-3">
                        {hasEdits && (
                          <button
                            onClick={() => setBudgetOverrides(prev => {
                              const updated = { ...prev };
                              filteredBudgets.forEach(b => { delete updated[b.inclusion.id]; });
                              return updated;
                            })}
                            title="Descarta os ajustes manuais de todos os visíveis (filtro atual) — o cálculo automático reassume"
                            className="text-xs font-medium text-muted-foreground hover:text-slate-700 hover:bg-muted px-3 py-2 rounded-lg transition-colors"
                          >
                            Descartar Alterações
                          </button>
                        )}
                        <button
                          disabled={!hasPending}
                          onClick={() => {
                            if (!hasPending) return;
                            const ids = pendingSheet.map(b => b.inclusion.id);
                            setSelectedIds(new Set(ids));
                            setConfirmSend({ ids, source: 'batch' });
                          }}
                          className={`h-10 flex items-center gap-2 text-sm font-semibold text-white px-5 rounded-lg shadow-2 transition-all
                            ${hasPending
                              ? `bg-success hover:bg-success/90 ${hasEdits ? 'ring-2 ring-success-strong ring-offset-1' : ''}`
                              : 'bg-slate-300 cursor-not-allowed opacity-50 shadow-none'}
                          `}
                        >
                          <Send className="w-4 h-4" aria-hidden="true" />
                          Enviar Planejamento
                          {hasPending && (
                            <span className="ml-1 w-5 h-5 rounded-full bg-card/25 flex items-center justify-center text-2xs font-bold leading-none">
                              {pendingSheet.length}
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
            )}
          </>
        )}

      {/* Modal de Edição */}
      <Dialog open={!!editingBudget} onOpenChange={v => { if (!v) pedirFecharEdicao(fecharModalEdicao); }}>
        <DialogContent className="max-w-[680px] w-[95vw] p-0 gap-0 rounded-xl overflow-hidden border-0 shadow-3 flex flex-col" style={{ maxHeight:'90vh' }}>
          <DialogHeader className="sr-only">
            <DialogTitle>Editar Orçamento Planejado</DialogTitle>
          </DialogHeader>
          
          {editingBudget && editingBudgetInfo && (() => {
            const noWeekdays = editingBudgetInfo.weekdays === 0;
            const noWeekends = editingBudgetInfo.weekends === 0;
            // Dias que recebem diária (casa: só fds) — mesma regra do motor
            const diasDiariaModal = editingBudgetInfo.diasComDiaria;
            // Empreita cenotécnica: valor FECHADO da tabela, sem deflação. Só
            // deixa de valer se o usuário editar a diária à mão (override).
            const empreitaModal = editingBudgetInfo.cenoEmpreita ?? null;
            const empreitaEditadaModal = !!empreitaModal && !!defaultBudgetValues
              && editingBudget.valorDiaria !== defaultBudgetValues.valorDiaria;
            // Mesma conta do card: diária plana COM deflação por período
            const deflatedModal = editingBudgetInfo.isPercurso
              ? { totalCents: editingBudget.valorDiaria * diasDiariaModal, segments: [] as DeflationSegment[] } // pacote fechado: sem deflação
              : empreitaModal
              // Empreita: os dias são os da EMPREITA (`empreitaModal.dias`,
              // vindos de `diasEmpreita`) — o card usa os mesmos, senão o modal
              // mostraria um total e a linha do card outro.
              ? { totalCents: empreitaEditadaModal ? editingBudget.valorDiaria * empreitaModal.dias : empreitaModal.totalCents, segments: [] as DeflationSegment[] }
              : calcDeflatedDailies(editingBudget.valorDiaria, diasDiariaModal, deflationFactorsFromSettings(systemSettings));
            const totalDiarias = deflatedModal.totalCents;
            const effectiveAlmocoSemana = noWeekdays ? 0 : editingBudget.almocoSemana;
            const effectiveJantarSemana = noWeekdays ? 0 : editingBudget.jantarSemana;
            const effectiveAlmocoFds = noWeekends ? 0 : editingBudget.almocoFds;
            const effectiveJantarFds = noWeekends ? 0 : editingBudget.jantarFds;
            const modalTotal = totalDiarias + 
              editingBudget.mobilidade + effectiveAlmocoSemana + effectiveJantarSemana + 
              effectiveAlmocoFds + effectiveJantarFds;
            const totalAlimentacao = effectiveAlmocoSemana + effectiveJantarSemana + effectiveAlmocoFds + effectiveJantarFds;
            const diff = modalTotal - originalModalTotal;
            // Campo a campo: edições que se compensam no total também contam
            // Tipo (atendimento/percurseiro) escolhido e ainda não gravado também
            // é mudança: acende o Salvar mesmo com a diária mantida manualmente.
            const hasPendingTipo = pendingAtendimentoTipo != null || pendingPercurseiroTipo != null;
            const hasChanges = hasPendingTipo || (!!originalModalValues && (Object.keys(editingBudget) as (keyof BudgetEdit)[])
              .some(k => editingBudget[k] !== originalModalValues![k]));
            // Difere do MOTOR ATUAL (override herdado ou edição da sessão) → habilita "Restaurar padrão"
            const differsFromDefault = !!defaultBudgetValues && (Object.keys(editingBudget) as (keyof BudgetEdit)[])
              .some(k => k !== 'inclusionId' && editingBudget[k] !== defaultBudgetValues![k]);
            const modalInitials = editingBudgetInfo.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

            const restoreDefaults = () => {
              if (defaultBudgetValues) {
                setEditingBudget({ ...defaultBudgetValues });
                setModalBufs({});
              }
            };

            const inputCls = "h-9 text-sm w-[88px] text-right font-semibold border-border focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-lg bg-card";
            // Buffer de digitação por campo: preserva o texto enquanto o usuário
            // digita ("540,50" funciona) e normaliza no blur.
            const mBuf = (key: string, fallback: number) => modalBufs[key] ?? String(fallback / 100);
            const mSet = (key: string, raw: string) => setModalBufs(p => ({ ...p, [key]: raw }));
            const mClear = (key: string) => () => setModalBufs(p => { const n = { ...p }; delete n[key]; return n; });
            const toCents = (raw: string) => Math.round(parseBrNumber(raw) * 100) || 0;

            // ── Alimentação em R$/DIA (útil e fim de semana) ──────────────────
            // Mesma semântica dos inputs da planilha (`alimentacaoUtil` /
            // `alimentacaoFds`): o usuário digita o valor POR DIA e ele é
            // rateado entre almoço e jantar do bucket — proporcional ao que já
            // existe, ou meio a meio quando o bucket está zerado. Os 4 campos
            // por refeição continuam disponíveis em "Detalhar por refeição".
            const alimUtilDiaCents = editingBudgetInfo.weekdays > 0
              ? Math.round((editingBudget.almocoSemana + editingBudget.jantarSemana) / editingBudgetInfo.weekdays)
              : 0;
            const alimFdsDiaCents = editingBudgetInfo.weekends > 0
              ? Math.round((editingBudget.almocoFds + editingBudget.jantarFds) / editingBudgetInfo.weekends)
              : 0;
            const rateiaPorDia = (valCents: number, dias: number, almocoAtual: number, jantarAtual: number) => {
              const total = valCents * Math.max(1, dias);
              const existente = almocoAtual + jantarAtual;
              const almoco = existente === 0
                ? Math.round(total / 2)
                : Math.round(almocoAtual * total / existente);
              return { almoco, jantar: total - almoco };
            };
            const setAlimUtilDia = (raw: string) => {
              const { almoco, jantar } = rateiaPorDia(toCents(raw), editingBudgetInfo.weekdays, editingBudget.almocoSemana, editingBudget.jantarSemana);
              setEditingBudget({ ...editingBudget, almocoSemana: almoco, jantarSemana: jantar });
            };
            const setAlimFdsDia = (raw: string) => {
              const { almoco, jantar } = rateiaPorDia(toCents(raw), editingBudgetInfo.weekends, editingBudget.almocoFds, editingBudget.jantarFds);
              setEditingBudget({ ...editingBudget, almocoFds: almoco, jantarFds: jantar });
            };
            // "Editado" = difere do MOTOR (mesma marca ✱ da planilha)
            const alimUtilEditado = !!defaultBudgetValues && !noWeekdays && (
              editingBudget.almocoSemana !== defaultBudgetValues.almocoSemana ||
              editingBudget.jantarSemana !== defaultBudgetValues.jantarSemana);
            const alimFdsEditado = !!defaultBudgetValues && !noWeekends && (
              editingBudget.almocoFds !== defaultBudgetValues.almocoFds ||
              editingBudget.jantarFds !== defaultBudgetValues.jantarFds);
            const clearBufs = (...keys: string[]) => setModalBufs(p => {
              const n = { ...p }; keys.forEach(k => delete n[k]); return n;
            });
            const restoreAlimUtil = () => {
              if (!defaultBudgetValues) return;
              setEditingBudget({ ...editingBudget, almocoSemana: defaultBudgetValues.almocoSemana, jantarSemana: defaultBudgetValues.jantarSemana });
              clearBufs('alimUtilDia', 'almSem', 'janSem');
            };
            const restoreAlimFds = () => {
              if (!defaultBudgetValues) return;
              setEditingBudget({ ...editingBudget, almocoFds: defaultBudgetValues.almocoFds, jantarFds: defaultBudgetValues.jantarFds });
              clearBufs('alimFdsDia', 'almFds', 'janFds');
            };
            const modalRestoreBtn = (onClick: () => void, label: string) => (
              <button
                type="button"
                aria-label={label}
                title="Restaurar padrão (regra atual)"
                onClick={onClick}
                className="text-2xs leading-none px-1.5 py-1 -my-1 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-colors shrink-0"
              >↩</button>
            );
            const modalEditedMark = (
              <span role="img" aria-label="Valor editado manualmente" title="Valor editado manualmente"
                className="text-2xs font-bold text-muted-foreground shrink-0 select-none">✱</span>
            );

            return (
            <>
              {/* ── Header ── */}
              <div className="px-5 py-3.5 relative shrink-0 bg-primary">
                <div className="flex items-center gap-3">
                  {/* Avatar 40px */}
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-base shrink-0 bg-card/15 text-white border border-white/25">
                    {modalInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-bold text-white leading-tight truncate">{editingBudgetInfo.name}</h2>
                    <p className="text-xs text-white/70">{editingBudgetInfo.functionName}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="inline-flex items-center h-[22px] text-2xs font-bold px-2 rounded-md bg-card/15 text-white">
                        {editingBudgetInfo.type}
                      </span>
                      <span className="inline-flex items-center gap-1 h-[22px] text-2xs text-white/70">
                        <Calendar className="w-3 h-3" aria-hidden="true" />
                        {editingBudgetInfo.period}
                      </span>
                      <span className="inline-flex items-center gap-1 h-[22px] text-2xs px-2 rounded-md bg-card/12 text-white/85">
                        <Briefcase className="w-3 h-3" aria-hidden="true" />
                        {editingBudgetInfo.weekdays}d úteis
                        {editingBudgetInfo.regraDiaria === 'fds' && <span className="opacity-70">· sem diária (CLT)</span>}
                        {editingBudgetInfo.regraDiaria === 'nenhuma' && <span className="opacity-70">· sem diária (ceno CLT)</span>}
                      </span>
                      <span className="inline-flex items-center gap-1 h-[22px] text-2xs px-2 rounded-md bg-warning-strong/20 text-warning-soft">
                        <Sun className="w-3 h-3" aria-hidden="true" />
                        {editingBudgetInfo.weekends} fds
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Banner modo visualização ── */}
              {modalViewMode && (
                <div className="flex items-center gap-2.5 px-5 py-2.5 bg-warning-soft border-b border-warning/25 shrink-0">
                  <Eye className="w-3.5 h-3.5 text-warning shrink-0" aria-hidden="true" />
                  <p className="text-2xs font-semibold text-warning">
                    Modo de Visualização — Edição de valores bloqueada para esta fase
                  </p>
                </div>
              )}

              {/* ── Barra de Abas ── */}
              <div className="flex border-b border-border bg-card shrink-0">
                {([
                  { id: 'custos',      label: 'Custos' },
                  { id: 'observacoes', label: 'Observações' },
                  { id: 'historico',   label: 'Histórico' },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setModalTab(id)}
                    className={[
                      'flex-1 h-10 text-sm font-medium transition-colors',
                      modalTab === id
                        ? 'text-primary border-b-2 border-primary bg-brand-soft/40'
                        : 'text-muted-foreground hover:text-slate-700 hover:bg-surface-muted',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Corpo (aba Custos) ── */}
              {modalTab === 'custos' && (
              <div className="flex-1 overflow-y-auto min-h-0 bg-surface-muted">
              <div className="px-4 py-3 space-y-2.5" style={modalViewMode ? {opacity:0.72, userSelect:'none'} : {}}>

                {/* ── BLOCO: Diárias ── */}
                <div className="bg-card rounded-xl border border-border overflow-hidden shadow-1">
                  <div className="flex items-center justify-between px-3.5 py-2 bg-brand-soft border-b border-primary/25">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-md bg-primary flex items-center justify-center">
                        <Calendar className="w-2.5 h-2.5 text-white" aria-hidden="true" />
                      </div>
                      <span className="text-2xs font-bold text-primary uppercase tracking-wider">Diárias</span>
                    </div>
                    <span className="text-sm font-bold text-primary">{formatCurrency(totalDiarias)}</span>
                  </div>

                  {/* Atendimento: escolha da tarifa (Key Account × Exec. de Contas).
                      Necessário aqui porque escalações antigas viraram Planejado
                      antes do flag existir. */}
                  {editingBudgetInfo.isAtend && (
                    <div className="flex items-center gap-2 flex-wrap px-3.5 py-2 bg-brand-soft/40 border-b border-primary/25">
                      <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo de atendimento</span>
                      <div className="flex rounded-lg border border-primary/25 overflow-hidden">
                        {ATENDIMENTO_TIPOS.map(op => {
                          const ativo = editingBudgetInfo.atendimentoTipo === op.value;
                          const valor = atendimentoDailyCents(op.value, systemSettings);
                          return (
                            <button
                              key={op.value}
                              type="button"
                              disabled={savingTipo || modalViewMode}
                              aria-pressed={ativo}
                              onClick={() => {
                                if (!ativo && editingBudgetInfo.inclusionId) chooseLocalAtendimentoTipo(op.value);
                              }}
                              className={`px-2.5 py-1 text-2xs font-semibold transition-colors disabled:opacity-50 ${
                                ativo ? 'bg-primary text-primary-foreground' : 'bg-card text-slate-600 hover:bg-brand-soft'
                              }`}
                            >
                              {op.label}{valor != null ? ` · ${formatCurrency(valor)}` : ''}
                            </button>
                          );
                        })}
                      </div>
                      {!editingBudgetInfo.atendimentoTipo && (
                        <span className="px-1.5 py-0.5 rounded-full bg-warning-soft text-warning text-2xs font-semibold">definir o tipo</span>
                      )}
                      {pendingAtendimentoTipo != null && (
                        <span className="text-2xs text-muted-foreground" title="O tipo é gravado na escalação ao Salvar">grava na escalação ao salvar</span>
                      )}
                    </div>
                  )}

                  {/* Percurso (motoqueiro): pacote fechado Tipo 1 × Tipo 2 */}
                  {editingBudgetInfo.isPercurso && (
                    <div className="flex items-center gap-2 flex-wrap px-3.5 py-2 bg-brand-soft/40 border-b border-primary/25">
                      <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo do percurseiro</span>
                      <div className="flex rounded-lg border border-primary/25 overflow-hidden">
                        {PERCURSEIRO_TIPOS.map(op => {
                          const ativo = editingBudgetInfo.percurseiroTipo === op.value;
                          const valor = percurseiroDiariaCents(op.value, systemSettings)?.total;
                          return (
                            <button
                              key={op.value}
                              type="button"
                              disabled={savingTipo || modalViewMode}
                              aria-pressed={ativo}
                              onClick={() => {
                                if (!ativo && editingBudgetInfo.inclusionId) chooseLocalPercurseiroTipo(op.value);
                              }}
                              className={`px-2.5 py-1 text-2xs font-semibold transition-colors disabled:opacity-50 ${
                                ativo ? 'bg-primary text-primary-foreground' : 'bg-card text-slate-600 hover:bg-brand-soft'
                              }`}
                            >
                              {op.label}{valor != null ? ` · ${formatCurrency(valor)}/diária` : ''}
                            </button>
                          );
                        })}
                      </div>
                      {!editingBudgetInfo.percurseiroTipo && (
                        <span className="px-1.5 py-0.5 rounded-full bg-warning-soft text-warning text-2xs font-semibold" title="Tipo 1 usado provisoriamente até a definição">definir o tipo (Tipo 1 provisório)</span>
                      )}
                      {pendingPercurseiroTipo != null && (
                        <span className="text-2xs text-muted-foreground" title="O tipo é gravado na escalação ao Salvar">grava na escalação ao salvar</span>
                      )}
                      {editingBudgetInfo.percurseiro && (
                        <span className="w-full text-2xs text-muted-foreground tabular-nums">
                          Pacote por diária: motoqueiro {formatCurrency(editingBudgetInfo.percurseiro.motoqueiro)} + fee Ivan {formatCurrency(editingBudgetInfo.percurseiro.fee)} + alimentação {formatCurrency(editingBudgetInfo.percurseiro.alimentacao)} + transporte {formatCurrency(editingBudgetInfo.percurseiro.transporte)} + NF {formatCurrency(editingBudgetInfo.percurseiro.nf)} = <b>{formatCurrency(editingBudgetInfo.percurseiro.total)}</b> · {editingBudgetInfo.voa ? '2 diárias (em viagem — regra fixa)' : '1 diária (local)'} · alimentação e mobilidade incluídas no pacote
                        </span>
                      )}
                    </div>
                  )}
                  {/* Cenotécnica EMPREITA: valor FECHADO por nº de dias.
                      A modalidade é escolhida na ESCALAÇÃO — aqui é só leitura. */}
                  {editingBudgetInfo.cenoEmpreitaVaga && (
                    <div className="flex items-center gap-2 flex-wrap px-3.5 py-2 bg-warning-soft/40 border-b border-warning/25">
                      <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Empreita cenotécnica</span>
                      {editingBudgetInfo.cenoFreelaTipo ? (
                        <span
                          className="px-2 py-0.5 rounded-lg border border-warning/25 bg-card text-2xs font-semibold text-warning cursor-default"
                          title="A modalidade da empreita é definida na tela de Escalação — aqui é somente leitura."
                        >
                          {CENO_FREELA_TIPO_LABELS[editingBudgetInfo.cenoFreelaTipo]}
                        </span>
                      ) : (
                        <span
                          className="px-1.5 py-0.5 rounded-full bg-warning-soft text-warning text-2xs font-semibold"
                          title="Sem modalidade definida: o cálculo segue a diária padrão. A escolha é feita na tela de Escalação — aqui é somente leitura."
                        >
                          definir tipo na Escalação
                        </span>
                      )}
                      {empreitaModal && (
                        <span className="w-full text-2xs text-muted-foreground tabular-nums">
                          Valor fechado por {empreitaModal.dias} {empreitaModal.dias === 1 ? 'dia' : 'dias'}: <b>{formatCurrency(empreitaModal.totalCents)}</b> — sem deflação por período. Alimentação e mobilidade seguem as regras normais (não entram no valor fechado).
                          {empreitaModal.extrapolado && (
                            <span className="text-warning font-semibold"> · valor extrapolado (tabela cobre 2 a 6 dias)</span>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="divide-y divide-border">
                    {/* Diária PLANA — um único valor para todos os dias */}
                    <div className="flex items-center px-3.5 py-2 gap-3">
                      <div className="flex items-center gap-1.5 flex-1">
                        <Briefcase className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
                        <span className="text-xs font-medium text-slate-700">{empreitaModal ? 'Diárias (empreita)' : 'Diária'}</span>
                        <span className="text-2xs text-muted-foreground">
                          {/* Empreita: mostra os dias da EMPREITA (dias efetivamente
                              trabalhados), que são os multiplicados acima */}
                          × {empreitaModal ? empreitaModal.dias : diasDiariaModal} {(empreitaModal ? empreitaModal.dias : diasDiariaModal) === 1 ? 'dia' : 'dias'}
                          {editingBudgetInfo.regraDiaria === 'fds' && ' (só fins de semana)'}
                          {editingBudgetInfo.regraDiaria === 'nenhuma' && ' (cenotécnica CLT: sem diária)'}
                          {editingBudgetInfo.isPercurso && (editingBudgetInfo.voa ? ' (percurso em viagem — regra fixa de 2 diárias)' : ' (percurso local — regra fixa de 1 diária)')}
                        </span>
                        {empreitaModal && (
                          <span
                            className="text-2xs font-semibold text-warning"
                            title="Empreita: o total é o valor fechado da tabela pelo nº de dias — não é diária × dias. Editar a diária aqui substitui o valor fechado."
                          >
                            Empreita — {CENO_FREELA_TIPO_LABELS[empreitaModal.tipo]} · valor fechado
                            {empreitaModal.extrapolado && ' · valor extrapolado (tabela cobre 2 a 6 dias)'}
                            {empreitaEditadaModal && ' · ajustado manualmente'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-2xs text-muted-foreground">R$</span>
                        <CurrencyInput
                          semEstilo className={inputCls}
                          aria-label="Diária (R$/dia)"
                          value={editingBudget.valorDiaria}
                          disabled={modalViewMode}
                          // diária plana: espelha nos campos legados útil/fds
                          onChange={v => setEditingBudget(prev => prev ? {...prev, valorDiaria: v, valorDiariaUtil: v, valorDiariaFds: v} : prev)}
                        />
                        <span className="text-2xs text-muted-foreground">/dia</span>
                      </div>
                      <span className="text-sm font-bold text-slate-700 w-20 text-right shrink-0">{formatCurrency(totalDiarias)}</span>
                    </div>
                    {/* Memória da deflação por período */}
                    {deflatedModal.segments.length > 1 && (
                      <div className="px-3.5 py-1.5 text-2xs bg-brand-soft/30 text-primary">
                        Deflação por período: {formatSegmentsMemo(deflatedModal.segments)} = <b>{formatCurrency(totalDiarias)}</b>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── BLOCO: Mobilidade ── */}
                <div className="bg-card rounded-xl border border-border overflow-hidden shadow-1">
                  <div className="flex items-center justify-between px-3.5 py-2 bg-brand-soft border-b border-primary/25">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-md bg-primary flex items-center justify-center">
                        <Car className="w-2.5 h-2.5 text-white" aria-hidden="true" />
                      </div>
                      <span className="text-2xs font-bold text-primary uppercase tracking-wider">Mobilidade</span>
                      <span className="text-2xs text-primary/70">ida e volta</span>
                    </div>
                    <span className="text-sm font-bold text-primary">{formatCurrency(editingBudget.mobilidadeIda + editingBudget.mobilidadeVolta)}</span>
                  </div>
                  {editingBudgetInfo.funcaoLocal && (
                    <div className="px-3.5 py-1.5 bg-surface-muted border-b border-border text-2xs text-muted-foreground">
                      {FUNCAO_LOCAL_RAZAO}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 px-3.5 py-2.5">
                    <div>
                      <div className="text-2xs text-muted-foreground font-medium mb-1">Ida (R$)</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-2xs text-muted-foreground">R$</span>
                        <CurrencyInput
                          semEstilo className={inputCls}
                          aria-label="Mobilidade — ida (R$)"
                          value={editingBudget.mobilidadeIda}
                          disabled={modalViewMode}
                          onChange={ida => setEditingBudget(prev => prev ? {...prev, mobilidadeIda: ida, mobilidade: ida + prev.mobilidadeVolta} : prev)}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="text-2xs text-muted-foreground font-medium mb-1">Volta (R$)</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-2xs text-muted-foreground">R$</span>
                        <CurrencyInput
                          semEstilo className={inputCls}
                          aria-label="Mobilidade — volta (R$)"
                          value={editingBudget.mobilidadeVolta}
                          disabled={modalViewMode}
                          onChange={volta => setEditingBudget(prev => prev ? {...prev, mobilidadeVolta: volta, mobilidade: prev.mobilidadeIda + volta} : prev)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── BLOCO: Alimentação ── */}
                <div className="bg-card rounded-xl border border-border overflow-hidden shadow-1">
                  <div className="flex items-center justify-between px-3.5 py-2 bg-warning-soft border-b border-warning/25">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-md bg-warning-strong flex items-center justify-center">
                        <Utensils className="w-2.5 h-2.5 text-white" aria-hidden="true" />
                      </div>
                      <span className="text-2xs font-bold text-warning uppercase tracking-wider">Alimentação</span>
                    </div>
                    <span className="text-sm font-bold text-warning">{formatCurrency(totalAlimentacao)}</span>
                  </div>

                  {/* Horários de voo que dirigem o cálculo (passagem manda).
                      Função local não tem refeição calculada — a razão aparece no resumo. */}
                  {editingBudgetInfo.funcaoLocal ? null : editingBudgetInfo.voa ? (
                    <div className="flex items-center gap-2 flex-wrap px-3.5 py-1.5 bg-warning-soft/50 border-b border-warning/25 text-2xs text-muted-foreground">
                      <span>✈ Chegada (ida): <b className="text-slate-700">{editingBudgetInfo.vooChegadaIda || "—"}</b></span>
                      <span>· Partida (volta): <b className="text-slate-700">{editingBudgetInfo.vooPartidaVolta || "—"}</b></span>
                      {editingBudgetInfo.fonteVoo === "passagem" ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-success-soft text-success font-semibold">pela passagem</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full bg-warning-soft text-warning font-semibold" title="Sem horários da passagem registrada — refeições assumem dia cheio até a compra">estimado — aguardando passagem</span>
                      )}
                    </div>
                  ) : (
                    <div className="px-3.5 py-1.5 bg-surface-muted border-b border-border text-2xs text-muted-foreground">
                      Jornada externa (não voa) — almoço e jantar em todos os dias trabalhados.
                    </div>
                  )}

                  {/* Resumo SEMPRE À VISTA e editável em R$/dia (útil e fds).
                      Os 4 campos por refeição continuam no "Detalhar por refeição". */}
                  <div className="px-3.5 py-2.5 space-y-1.5">
                    {editingBudgetInfo.funcaoLocal && (
                      <p className="text-2xs text-muted-foreground">{FUNCAO_LOCAL_RAZAO}</p>
                    )}
                    {totalAlimentacao === 0 && !editingBudgetInfo.funcaoLocal && (
                      <p className="text-2xs text-muted-foreground">
                        {editingBudgetInfo.voa
                          ? 'Nenhuma refeição prevista pelos horários de voo.'
                          : 'Nenhuma refeição prevista para esta escalação.'}
                      </p>
                    )}
                    {/* Dias úteis — R$/dia */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-2xs text-muted-foreground flex-1 min-w-0">Dias úteis ({editingBudgetInfo.weekdays})</span>
                      {alimUtilEditado && modalEditedMark}
                      <span className="text-2xs text-muted-foreground">R$</span>
                      <Input
                        type="text" inputMode="decimal" className={inputCls}
                        aria-label="Alimentação por dia útil (R$)"
                        value={noWeekdays ? '—' : mBuf('alimUtilDia', alimUtilDiaCents)}
                        disabled={noWeekdays || modalViewMode}
                        onChange={e => { mSet('alimUtilDia', e.target.value); setAlimUtilDia(e.target.value); }}
                        onBlur={mClear('alimUtilDia')}
                      />
                      <span className="text-2xs text-muted-foreground shrink-0">/dia</span>
                      {alimUtilEditado && !modalViewMode
                        ? modalRestoreBtn(restoreAlimUtil, 'Restaurar alimentação padrão dos dias úteis')
                        : <span className="w-[22px] shrink-0" aria-hidden="true" />}
                      <span className="text-sm font-bold text-slate-700 w-20 text-right shrink-0 tabular-nums">
                        {formatCurrency(effectiveAlmocoSemana + effectiveJantarSemana)}
                      </span>
                    </div>
                    {/* Fim de semana — R$/dia */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-2xs text-muted-foreground flex-1 min-w-0">Fim de semana ({editingBudgetInfo.weekends})</span>
                      {alimFdsEditado && modalEditedMark}
                      <span className="text-2xs text-muted-foreground">R$</span>
                      <Input
                        type="text" inputMode="decimal" className={inputCls}
                        aria-label="Alimentação por dia de fim de semana (R$)"
                        value={noWeekends ? '—' : mBuf('alimFdsDia', alimFdsDiaCents)}
                        disabled={noWeekends || modalViewMode}
                        onChange={e => { mSet('alimFdsDia', e.target.value); setAlimFdsDia(e.target.value); }}
                        onBlur={mClear('alimFdsDia')}
                      />
                      <span className="text-2xs text-muted-foreground shrink-0">/dia</span>
                      {alimFdsEditado && !modalViewMode
                        ? modalRestoreBtn(restoreAlimFds, 'Restaurar alimentação padrão dos fins de semana')
                        : <span className="w-[22px] shrink-0" aria-hidden="true" />}
                      <span className="text-sm font-bold text-slate-700 w-20 text-right shrink-0 tabular-nums">
                        {formatCurrency(effectiveAlmocoFds + effectiveJantarFds)}
                      </span>
                    </div>
                  </div>

                  {!modalViewMode && (
                    <button
                      type="button"
                      onClick={() => setAlimExpanded(v => !v)}
                      aria-expanded={alimExpanded}
                      className="w-full flex items-center justify-center gap-1 px-3.5 py-1.5 text-2xs font-semibold text-muted-foreground hover:text-slate-700 hover:bg-surface-muted border-t border-border transition-colors"
                    >
                      {alimExpanded ? 'Ocultar detalhe por refeição' : 'Detalhar por refeição (almoço e jantar)'}
                      <ChevronDown className={`w-3 h-3 transition-transform ${alimExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                  )}

                  {alimExpanded && (<>
                  {/* Sub-seção: Dias Úteis */}
                  <div className="px-3.5 pt-2 pb-1.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Briefcase className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                      <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Dias Úteis ({editingBudgetInfo.weekdays})</span>
                    </div>
                    <div className="space-y-1.5 pl-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xs text-slate-600 w-12 shrink-0">Almoço</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-2xs text-muted-foreground">R$</span>
                          <CurrencyInput
                            semEstilo className={inputCls}
                            aria-label="Almoço em dias úteis (R$ total)"
                            value={noWeekdays ? 0 : editingBudget.almocoSemana}
                            disabled={noWeekdays || modalViewMode}
                            onChange={v => setEditingBudget(prev => prev ? {...prev, almocoSemana: v} : prev)}
                          />
                          <span className="text-2xs text-muted-foreground">total</span>
                        </div>
                        <span className="text-2xs text-muted-foreground ml-auto">
                          {editingBudgetInfo.weekdays > 0 ? formatCurrency(Math.round(editingBudget.almocoSemana / editingBudgetInfo.weekdays)) : 'R$ 0'}/dia
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-2xs text-slate-600 w-12 shrink-0">Jantar</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-2xs text-muted-foreground">R$</span>
                          <CurrencyInput
                            semEstilo className={inputCls}
                            aria-label="Jantar em dias úteis (R$ total)"
                            value={noWeekdays ? 0 : editingBudget.jantarSemana}
                            disabled={noWeekdays || modalViewMode}
                            onChange={v => setEditingBudget(prev => prev ? {...prev, jantarSemana: v} : prev)}
                          />
                          <span className="text-2xs text-muted-foreground">total</span>
                        </div>
                        <span className="text-2xs text-muted-foreground ml-auto">
                          {editingBudgetInfo.weekdays > 0 ? formatCurrency(Math.round(editingBudget.jantarSemana / editingBudgetInfo.weekdays)) : 'R$ 0'}/dia
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mx-3.5 border-t border-dashed border-border" />

                  {/* Sub-seção: Fins de Semana */}
                  <div className="px-3.5 pt-2 pb-2.5 bg-warning-soft/30">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sun className="w-3 h-3 text-warning-strong" aria-hidden="true" />
                      <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Fim de Semana ({editingBudgetInfo.weekends})</span>
                    </div>
                    <div className="space-y-1.5 pl-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xs text-slate-600 w-12 shrink-0">Almoço</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-2xs text-muted-foreground">R$</span>
                          <CurrencyInput
                            semEstilo className={inputCls}
                            aria-label="Almoço em fins de semana (R$ total)"
                            value={noWeekends ? 0 : editingBudget.almocoFds}
                            disabled={noWeekends || modalViewMode}
                            onChange={v => setEditingBudget(prev => prev ? {...prev, almocoFds: v} : prev)}
                          />
                          <span className="text-2xs text-muted-foreground">total</span>
                        </div>
                        <span className="text-2xs text-muted-foreground ml-auto">
                          {editingBudgetInfo.weekends > 0 ? formatCurrency(Math.round(editingBudget.almocoFds / editingBudgetInfo.weekends)) : 'R$ 0'}/dia
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-2xs text-slate-600 w-12 shrink-0">Jantar</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-2xs text-muted-foreground">R$</span>
                          <CurrencyInput
                            semEstilo className={inputCls}
                            aria-label="Jantar em fins de semana (R$ total)"
                            value={noWeekends ? 0 : editingBudget.jantarFds}
                            disabled={noWeekends || modalViewMode}
                            onChange={v => setEditingBudget(prev => prev ? {...prev, jantarFds: v} : prev)}
                          />
                          <span className="text-2xs text-muted-foreground">total</span>
                        </div>
                        <span className="text-2xs text-muted-foreground ml-auto">
                          {editingBudgetInfo.weekends > 0 ? formatCurrency(Math.round(editingBudget.jantarFds / editingBudgetInfo.weekends)) : 'R$ 0'}/dia
                        </span>
                      </div>
                    </div>
                  </div>
                  </>)}
                </div>
              </div>
              </div>
              )}

              {/* ── Aba: Observações ── */}
              {modalTab === 'observacoes' && (
                <div className="flex-1 overflow-y-auto min-h-0 bg-surface-muted">
                  {editingBudgetPlannedId ? (
                    <BudgetChat
                      entityType="planned"
                      entityId={editingBudgetPlannedId}
                      eventId={selectedEventId}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-xs">
                      Disponível após o envio para o Realizado.
                    </div>
                  )}
                </div>
              )}

              {/* ── Aba: Histórico ── */}
              {modalTab === 'historico' && (
                <div className="flex-1 overflow-y-auto min-h-0 bg-surface-muted">
                  {editingBudgetPlannedId ? (
                    <ActivityTimeline entityType="budget_planned" entityId={editingBudgetPlannedId} defaultOpen={true} />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-xs">
                      Disponível após o envio para o Realizado.
                    </div>
                  )}
                </div>
              )}

              {/* ── Footer ── */}
              <div className="shrink-0 border-t border-t-border bg-surface-muted">
                {/* Faixa de total */}
                <div className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-2xs uppercase font-semibold tracking-wider text-muted-foreground">Total Planejado</div>
                    <div className="text-2xl font-extrabold leading-none mt-0.5 transition-all text-primary">{formatCurrency(modalTotal)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xs text-muted-foreground leading-tight">
                      Diárias <span className="font-semibold text-slate-600">{formatCurrency(totalDiarias)}</span>
                    </div>
                    <div className="text-2xs text-muted-foreground mt-0.5 leading-tight">
                      Alimentação <span className="font-semibold text-slate-600">{formatCurrency(totalAlimentacao)}</span>
                    </div>
                    <div className="text-2xs text-muted-foreground mt-0.5 leading-tight">
                      Mobilidade <span className="font-semibold text-slate-600">{formatCurrency(editingBudget.mobilidade)}</span>
                    </div>
                    {hasChanges && diff !== 0 && (
                      <div className={`text-2xs font-bold mt-1 ${diff > 0 ? 'text-danger-strong' : 'text-success-strong'}`}>
                        {diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(diff))} vs original
                      </div>
                    )}
                  </div>
                </div>
                {/* Botões */}
                <div className="px-5 pb-3 flex justify-between items-center gap-2 border-t border-t-border pt-2.5 bg-card">
                  <div>
                    {!modalViewMode && differsFromDefault && (
                      <button
                        onClick={restoreDefaults}
                        title="Volta aos valores da regra atual (atendimento/freela/casa + deflação + voo)"
                        className="flex items-center gap-1 text-2xs font-medium text-primary hover:text-primary-hover transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" aria-hidden="true" />
                        Restaurar padrão
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      className="h-9 px-4 text-muted-foreground hover:text-slate-700 rounded-lg text-sm"
                      disabled={savingTipo}
                      onClick={() => pedirFecharEdicao(fecharModalEdicao)}
                    >
                      Cancelar
                    </Button>
                    {!modalViewMode && (
                      <Button
                        onClick={() => { void saveEdit(); }}
                        disabled={!hasChanges || savingTipo}
                        className={`h-9 px-5 text-primary-foreground font-semibold rounded-lg gap-2 text-sm ${hasChanges ? 'bg-primary hover:bg-primary-hover shadow-2' : ''}`}
                      >
                        <CheckCheck className="w-4 h-4" aria-hidden="true" />
                        {savingTipo ? 'Salvando…' : hasChanges && diff !== 0 ? `Salvar (${diff > 0 ? '+' : ''}${formatCurrency(diff)})` : 'Salvar'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          );})()}
        </DialogContent>
      </Dialog>
      {DialogoDescarteEdicao}

      {/* ── Confirmação de envio UNIFICADA (cards, individual e planilha) ── */}
      <AlertDialog
        open={!!confirmSend}
        onOpenChange={v => {
          if (sendToActualMutation.isPending || sendSelectedToActualMutation.isPending) return;
          if (!v) setConfirmSend(null);
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-xl">
          {confirmSend && (() => {
            // Mesmo filtro da mutation: ausente ("não participou") nem entra no
            // resumo/total do envio.
            const targets = calculatedBudgets.filter(b =>
              confirmSend.ids.includes(b.inclusion.id) && !sentToActual.has(b.inclusion.id) && !isCardNotAttended(b)
            );
            const single = confirmSend.source === 'single' && targets.length === 1 ? targets[0] : null;
            const totalEnvio = targets.reduce((s, b) => s + b.totalFinal, 0);
            const anyEdited = targets.some(b => b.hasOverride);
            const isSending = sendToActualMutation.isPending || sendSelectedToActualMutation.isPending;
            const doSend = () => {
              if (single) sendToActualMutation.mutate(single as typeof calculatedBudgets[0]);
              else sendSelectedToActualMutation.mutate();
            };
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-base">Enviar para a prestação de contas?</AlertDialogTitle>
                  <AlertDialogDescription className="text-xs">
                    {single
                      ? `${getCollaboratorName(single.inclusion.collaboratorId)} · ${getFunctionName(single.inclusion.functionId)}`
                      : `${targets.length} ${targets.length === 1 ? 'colaborador selecionado' : 'colaboradores selecionados'}`}
                  </AlertDialogDescription>
                </AlertDialogHeader>

                {/* Resumo de custos */}
                <div className="w-full rounded-xl overflow-hidden border border-border">
                  {single ? (
                    <>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs font-normal text-muted-foreground">Diárias</span>
                        <span className="text-xs font-medium text-slate-600">{formatCurrency(single.subtotalDiarias)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5 border-t border-t-border">
                        <span className="text-xs font-normal text-muted-foreground">Alimentação</span>
                        <span className="text-xs font-medium text-slate-600">{formatCurrency(single.almocoSemana + single.jantarSemana + single.almocoFds + single.jantarFds)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5 border-t border-t-border">
                        <span className="text-xs font-normal text-muted-foreground">Mobilidade</span>
                        <span className="text-xs font-medium text-slate-600">{formatCurrency(single.mobilidade)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        <span className="text-xs font-normal text-muted-foreground">Colaboradores</span>
                      </div>
                      <span className="text-sm font-medium text-slate-700">{targets.length} {targets.length === 1 ? 'pessoa' : 'pessoas'}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-t-border bg-success-soft">
                    <span className="text-xs font-medium text-slate-600">Total a ser enviado</span>
                    <span className="text-base font-medium tabular-nums text-success">{formatCurrency(totalEnvio)}</span>
                  </div>
                </div>

                {/* Copy consistente entre os três fluxos */}
                <p className="text-center text-xs font-normal text-muted-foreground leading-relaxed">
                  {targets.length === 1 ? 'O planejamento será enviado' : 'Os planejamentos serão enviados'} para a prestação de contas (Realizado)
                  {anyEdited ? ' — os valores editados manualmente vão junto' : ''}. Esta ação não pode ser desfeita.
                </p>

                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isSending} className="rounded-xl text-sm">Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isSending || targets.length === 0}
                    onClick={e => { e.preventDefault(); doSend(); }}
                    className="rounded-xl text-sm gap-1.5 text-white bg-success"
                  >
                    {isSending ? (
                      <><RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />Enviando…</>
                    ) : (
                      <><Check className="w-3.5 h-3.5" aria-hidden="true" />Confirmar Envio</>
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Modal de confirmação de restauração ── */}
      <Dialog open={!!restoreModal} onOpenChange={() => setRestoreModal(null)}>
        <DialogContent className="max-w-sm p-0 gap-0 rounded-xl overflow-hidden shadow-3 border border-black/6">
          <DialogHeader className="sr-only">
            <DialogTitle>Restaurar Planejamento</DialogTitle>
          </DialogHeader>
          {restoreModal && (
            <div className="bg-card flex flex-col items-center px-6 pt-7 pb-6 gap-4"
              style={{animation:'modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both'}}>

              {/* Ícone — círculo azul claro */}
              <div className="w-11 h-11 rounded-full flex items-center justify-center bg-brand-soft border border-primary/25">
                <Undo2 className="text-primary" style={{ width:18, height:18 }} aria-hidden="true" />
              </div>

              {/* Título + subtítulo */}
              <div className="text-center space-y-1">
                <h2 className="text-base font-medium text-foreground leading-snug">Restaurar Planejamento?</h2>
                <p className="text-xs font-normal text-muted-foreground">{restoreModal.name} · {restoreModal.functionName}</p>
                {restoreModal.startDate && restoreModal.endDate && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md mt-1 bg-brand-soft text-2xs font-medium text-primary border border-primary/25">
                    <Calendar style={{width:10, height:10}} aria-hidden="true" />
                    {new Date(restoreModal.startDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                    {' – '}
                    {new Date(restoreModal.endDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                  </span>
                )}
              </div>

              {/* Texto explicativo */}
              <p className="text-center text-sm font-normal text-muted-foreground leading-relaxed">
                Deseja incluir novamente este colaborador nos cálculos? Todos os valores de diárias, alimentação e mobilidade serão reativados.
              </p>

              {/* Botões */}
              <div className="flex gap-2 w-full pt-1">
                <button
                  className="flex-1 h-10 rounded-xl text-sm font-medium text-slate-600 bg-muted transition-colors hover:bg-border"
                  onClick={() => setRestoreModal(null)}
                >
                  Voltar
                </button>
                <button
                  className="flex-1 h-10 rounded-xl text-sm font-medium text-primary-foreground flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 bg-primary hover:bg-primary-hover"
                  onClick={() => {
                    toggleNotAttendedMutation.mutate({ id: restoreModal.id, reason: "" });
                    setRestoreModal(null);
                  }}
                  disabled={toggleNotAttendedMutation.isPending}
                >
                  <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                  {toggleNotAttendedMutation.isPending ? 'Restaurando…' : 'Restaurar'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!notAttendedModal} onOpenChange={() => { setNotAttendedModal(null); setNotAttendedReason(""); }}>
        <DialogContent className="max-w-sm p-0 gap-0 rounded-xl overflow-hidden shadow-3 border border-black/6">
          <DialogHeader className="sr-only">
            <DialogTitle>Confirmar Ausência</DialogTitle>
          </DialogHeader>

          {notAttendedModal && (
            <div className="bg-card flex flex-col items-center px-6 pt-7 pb-6 gap-4"
              style={{animation:'modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both'}}>

              {/* Ícone centralizado — círculo rose claro */}
              <div className="w-11 h-11 rounded-full flex items-center justify-center bg-danger-soft border border-danger/25">
                <UserX className="w-4.5 h-4.5 text-danger-strong" style={{ width:18, height:18 }} aria-hidden="true" />
              </div>

              {/* Título + subtítulo */}
              <div className="text-center space-y-1">
                <h2 className="text-base font-medium text-foreground leading-snug">Confirmar Ausência?</h2>
                <p className="text-xs font-normal text-muted-foreground">{notAttendedModal.name} · {notAttendedModal.functionName}</p>
              </div>

              {/* Texto explicativo */}
              <p className="text-center text-sm font-normal text-muted-foreground leading-relaxed">
                Você está marcando que este colaborador não participou deste evento. Os cálculos de diárias e custos associados serão removidos dos totais.
              </p>

              {/* Campo motivo */}
              <div className="w-full">
                <label className="text-2xs font-medium uppercase tracking-widest text-muted-foreground block mb-1.5">
                  Motivo <span className="normal-case tracking-normal font-normal text-muted-foreground">(opcional)</span>
                </label>
                <Textarea
                  className="w-full rounded-xl text-sm resize-none border-border focus:border-danger/25 focus:ring-2 focus:ring-danger/25 placeholder:text-muted-foreground"
                  value={notAttendedReason}
                  onChange={e => setNotAttendedReason(e.target.value)}
                  placeholder='Ex: "Desistência", "Problema de saúde", "Substituído"...'
                  rows={2}
                  autoFocus
                />
              </div>

              {/* Botões */}
              <div className="flex gap-2 w-full pt-1">
                <button
                  className="flex-1 h-10 rounded-xl text-sm font-medium text-slate-600 bg-muted transition-colors hover:bg-border"
                  onClick={() => { setNotAttendedModal(null); setNotAttendedReason(""); }}
                >
                  Voltar
                </button>
                <button
                  className="flex-1 h-10 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 bg-danger-strong hover:bg-danger/90"
                  onClick={() => {
                    if (notAttendedModal.id) {
                      toggleNotAttendedMutation.mutate({ id: notAttendedModal.id, reason: notAttendedReason });
                    } else if (notAttendedModal.budget) {
                      createAndMarkNotAttendedMutation.mutate({ budget: notAttendedModal.budget, reason: notAttendedReason });
                    }
                  }}
                  disabled={toggleNotAttendedMutation.isPending || createAndMarkNotAttendedMutation.isPending}
                >
                  <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                  {(toggleNotAttendedMutation.isPending || createAndMarkNotAttendedMutation.isPending) ? 'Confirmando…' : 'Confirmar'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Sticky Footer — Barra de Progresso do Envio ── */}
      {selectedEventId && calculatedBudgets.length > 0 && (
        <div className="sticky bg-card/82 backdrop-blur-lg border-t border-t-border/70 shadow-2" style={{
          bottom: 0,
          zIndex: 40,
          borderRadius: '14px 14px 0 0',
        }}>
          <div className="mx-auto flex items-center gap-6" style={{ maxWidth: 1024, padding: '9px 24px' }}>

            {/* Esquerda: Total do Evento — label empilhado + valor */}
            <div className="shrink-0 pr-6 border-r border-r-border">
              <div className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground" style={{ marginBottom: 3 }}>
                Valor Total do Evento
              </div>
              <div className="text-lg font-semibold tracking-[-0.02em] text-primary tabular-nums leading-none" style={{
                fontFeatureSettings: '"tnum"',
              }}>
                {formatCurrency(totalGeral)}
              </div>
            </div>

            {/* Centro: progresso do envio */}
            <div style={{flex: 1}}>
              <div className="flex items-center gap-2.5">
                <div className="rounded-full overflow-hidden bg-border/80" style={{ flex: 1, height: 4 }}>
                  <div className={cn("rounded-full", (stats.progressoEnvio >= 100 ? "shadow-1" : "shadow-none"))} style={{
                    height: '100%',
                    transition: 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                    width: `${stats.progressoEnvio}%`,
                    background: stats.progressoEnvio >= 100
                      ? 'var(--success)'
                      : 'var(--primary)',
                  }} />
                </div>
                <span className={cn("text-2xs font-normal tracking-[0.01em] whitespace-nowrap", (stats.progressoEnvio >= 100 ? "text-success" : "text-muted-foreground"))}>
                  {stats.enviados}/{stats.total}
                  {stats.progressoEnvio >= 100 && <span className="ml-1">✓</span>}
                </span>
              </div>
            </div>

            {/* Direita: botão de ação */}
            {stats.progressoEnvio >= 100 ? (
              <div className="flex items-center gap-2 rounded-xl bg-success-soft border border-success/25 shrink-0" style={{
                padding: '8px 18px',
              }}>
                <CheckCheck className="w-4 h-4 text-success" aria-hidden="true" />
                <span className="text-sm font-bold text-success">Todos Enviados</span>
              </div>
            ) : (
              <button
                onClick={() => selectedIds.size > 0 ? setConfirmSend({ ids: Array.from(selectedIds), source: 'batch' }) : undefined}
                disabled={selectedIds.size === 0}
                className={cn("flex items-center rounded-xl border-0 shrink-0 text-sm font-semibold", (selectedIds.size > 0 ? "cursor-pointer" : "cursor-not-allowed"), (selectedIds.size > 0 ? "bg-success" : "bg-border"), (selectedIds.size > 0 ? "text-white" : "text-muted-foreground"), (selectedIds.size > 0 ? "shadow-2" : "shadow-none"), (selectedIds.size === 0 ? "opacity-70" : "opacity-100"))} style={{
                  gap: 7,
                  height: 38,
                  paddingLeft: 18,
                  paddingRight: 18,
                  transition: 'all 0.2s ease',
                }}
              >
                <Send style={{width: 14, height: 14}} aria-hidden="true" />
                {selectedIds.size > 0
                  ? `Enviar Planejamento (${selectedIds.size})`
                  : 'Selecione colaboradores'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
