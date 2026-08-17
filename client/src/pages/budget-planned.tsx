import { useState, useMemo, useEffect, useRef, useCallback, memo } from "react";
import { formatDiasUteis, formatFds, fixEncoding, parseBrNumber } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { ActivityTimeline } from "@/components/activity-timeline";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calculator, Users, Calendar, RefreshCw, Edit, Send, CheckCheck, Check, Car, Utensils, Sun, Search, Home, UserCheck, DollarSign, Briefcase, ChevronDown, ChevronUp, BarChart3, RotateCcw, Lock, UserX, Undo2, Eye } from "lucide-react";
import { isRhOrAdmin } from "@/lib/permissions";
import { Textarea } from "@/components/ui/textarea";
import { EventSearchSelect } from "@/components/event-select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Event, Function, Collaborator, TeamInclusion, FunctionValue, BudgetNote } from "@shared/schema";
import { isAtendimentoFunction, atendimentoDailyCents, mobilidadeTrechoCents, ATENDIMENTO_TIPOS, type AtendimentoTipo } from "@shared/atendimento";
import { calcDeflatedDailies, deflationFactorsFromSettings, freelaDailyCents, casaDailyCents, diasComDiaria as calcDiasComDiaria, regraDiariaPorTipo, isPercursoFunction, percurseiroDiariaCents, diasPercurseiro, PERCURSEIRO_TIPOS, type DeflationSegment, type RegraDiaria, type PercurseiroTipo, type PercurseiroDiaria } from "@shared/calculation-rules";
import { calcAlimentacao, isCenotecnicaFunction, refeicaoCents, refeicaoCentsDia } from "@shared/alimentacao";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { useSearch } from "wouter";
import { BudgetChat, BudgetNotesBadge, BudgetNotesSnippet } from "@/components/budget-chat";

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

interface CalculatedBudget {
  inclusion: TeamInclusion;
  collaborator?: Collaborator;
  functionValue?: FunctionValue | null;
  qtdDiarias: number;
  valorDiaria: number;
  valorDiariaUtil: number;
  valorDiariaFds: number;
  subtotalDiarias: number;
  subtotalDiariasUtil: number;
  subtotalDiariasFds: number;
  mobilidade: number;
  mobilidadeIda: number;
  mobilidadeVolta: number;
  almocoSemana: number;
  jantarSemana: number;
  almocoFds: number;
  jantarFds: number;
  unitAlmocoSemana: number;
  unitJantarSemana: number;
  unitAlmocoFds: number;
  unitJantarFds: number;
  ajudaCusto: number;
  totalFinal: number;
  weekdays: number;
  weekends: number;
  hasOverride: boolean;
  // Dias que efetivamente recebem diária (casa: só fds; local/freela: todos)
  diasComDiaria: number;
  regraDiaria: RegraDiaria;
  // Percurso (motoqueiro): pacote fechado por diária — composição para a memória
  isPercurso: boolean;
  percurseiroTipo: PercurseiroTipo | null;   // null = "definir tipo" (Tipo 1 provisório)
  percurseiro: PercurseiroDiaria | null;
  // Horários de voo exibidos no modal (fonte: passagem > sugerido)
  vooPartidaIda: string | null;
  vooChegadaIda: string | null;
  vooPartidaVolta: string | null;
  fonteVoo: "passagem" | "sugerido" | "nenhum";
  alimEstimada: boolean;
  // Memória da deflação por período (faixas × diária deflacionada)
  deflationSegments: DeflationSegment[];
  // Valores do MOTOR ATUAL (sem override) — base do "Restaurar padrão" e tooltips
  sysValorDiaria: number;
  sysMobilidade: number;
  sysMobilidadeIda: number;
  sysMobilidadeVolta: number;
  sysAlmocoSemana: number;
  sysJantarSemana: number;
  sysAlmocoFds: number;
  sysJantarFds: number;
}

// Rascunho de edições persistido por evento — sobrevive a F5 e à troca de evento.
// v2: formato ESPARSO (só campos editados). O formato antigo (objeto completo
// por linha) restaurava tudo como override e congelava o recálculo — por isso
// é DESCARTADO, nunca migrado às cegas.
const draftStorageKey = (eventId: string) => `budget-overrides-draft-v2:${eventId}`;
const legacyDraftStorageKey = (eventId: string) => `budget-overrides-draft:${eventId}`;
// Remove um rascunho no formato antigo; retorna true se ele existia e não há v2
// (caso em que o usuário merece um aviso único).
function discardLegacyDraft(eventId: string): boolean {
  if (!eventId) return false;
  try {
    const hadLegacy = localStorage.getItem(legacyDraftStorageKey(eventId)) !== null;
    if (!hadLegacy) return false;
    localStorage.removeItem(legacyDraftStorageKey(eventId));
    return localStorage.getItem(draftStorageKey(eventId)) === null;
  } catch {
    return false;
  }
}
function readDraft(eventId: string): Record<string, BudgetOverride> {
  if (!eventId) return {};
  try {
    const raw = localStorage.getItem(draftStorageKey(eventId));
    const parsed: Record<string, BudgetOverride & { qtdDiarias?: number }> = raw ? JSON.parse(raw) : {};
    // Defesa em profundidade: qtdDiarias saiu do modelo de override
    Object.values(parsed).forEach(o => { if (o) delete o.qtdDiarias; });
    return parsed;
  } catch {
    // rascunho corrompido ou localStorage indisponível — começa vazio
    return {};
  }
}

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.round(cents) / 100);

const toTitleCase = (str: string) => {
  const lower = new Set(['de', 'da', 'das', 'do', 'dos', 'e', 'em', 'a', 'o', 'ao', 'aos']);
  return str.toLowerCase().split(' ').map((word, i) =>
    i === 0 || !lower.has(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word
  ).join(' ');
};

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
      className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-slate-200 shadow-xl p-3 w-56 text-left"
      style={{minWidth:'220px'}}
    >
      <div className="text-[11px] font-semibold text-slate-600 mb-2">{title}</div>
      <input
        type="text" inputMode="decimal" placeholder="0,00"
        aria-label={title}
        value={value}
        onChange={e => onChangeValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onApply(); }}
        autoFocus
        className="w-full h-8 border border-slate-200 rounded-md px-2 text-right text-[12px] font-mono outline-none focus:border-primary focus:shadow-[0_0_0_2px_rgba(59,79,228,0.12)] mb-2"
      />
      <p className="text-[10px] text-slate-400 mb-3">Aplica aos pendentes visíveis (filtro atual)</p>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 h-7 text-[11px] border border-slate-200 rounded-md text-slate-500 hover:bg-slate-50 transition-colors">Cancelar</button>
        <button onClick={onApply} className="flex-1 h-7 text-[11px] rounded-md text-white font-semibold" style={{background:'var(--primary)'}}>Aplicar</button>
      </div>
    </div>
  );
}

type SheetField = 'valorDia' | 'alimentacao' | 'alimentacaoUtil' | 'alimentacaoFds' | 'mobilidade';

interface SheetRowProps {
  budget: CalculatedBudget;
  name: string;
  funcName: string;
  isSent: boolean;
  isNotAttended: boolean;
  isNewCollab: boolean;
  showTopBorder: boolean;
  selected: boolean;
  ovr?: BudgetOverride;
  matchingActual?: any;
  subtotalOpen: boolean;
  onToggleSelect: (sid: string, v: boolean) => void;
  onSheetEdit: (budget: CalculatedBudget, field: SheetField, rawValue: string) => void;
  onRestoreField: (sid: string, field: SheetField) => void;
  onToggleSubtotal: (sid: string) => void;
}

// Linha da planilha memoizada: digitar num input só re-renderiza ESTA linha
// (buffer de digitação local), não a tabela inteira.
const SheetRow = memo(function SheetRow({
  budget, name, funcName, isSent, isNotAttended, isNewCollab, showTopBorder,
  selected, ovr, matchingActual, subtotalOpen,
  onToggleSelect, onSheetEdit, onRestoreField, onToggleSubtotal,
}: SheetRowProps) {
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
    <span aria-label="Valor editado manualmente" title="Valor editado manualmente"
      className="text-[10px] font-bold text-slate-500 shrink-0 select-none">✱</span>
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

  const inputBase = `h-7 text-right font-mono tabular-nums text-[12px] rounded px-2 outline-none transition-all
    ${disabled
      ? 'bg-transparent text-slate-300 cursor-not-allowed'
      : 'bg-transparent border border-transparent text-slate-700 focus:bg-white focus:border-primary focus:shadow-[0_0_0_2px_rgba(37,99,235,0.12)]'}`;

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
              className={`text-[10px] p-1.5 -m-1 rounded transition-colors cursor-pointer shrink-0 ${restored ? 'text-emerald-500' : `text-slate-400 ${hoverColor}`}`}
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
      style={{
        background: isSent ? '#FAFAFA' : undefined,
        borderTop: showTopBorder ? '2px solid #CBD5E1' : undefined,
      }}
      className={`group transition-colors ${isSent ? '' : isNotAttended ? 'opacity-40' : 'hover:bg-blue-50/20'} ${hasOvr && !isSent ? 'bg-amber-50/20' : ''}`}
    >
      {/* Checkbox */}
      <td style={{width:40, paddingLeft:12, verticalAlign:'middle'}}>
        <Checkbox
          checked={selected}
          onCheckedChange={v => onToggleSelect(sid, !!v)}
          className="w-3.5 h-3.5"
          disabled={isSent || isNotAttended}
          aria-label={`Selecionar ${name}`}
        />
      </td>

      {/* Colaborador + Função + Período — coluna rica com avatar */}
      <td className="pl-4 pr-4 py-3" style={{minWidth:'280px', verticalAlign:'middle'}}>
        <div className="flex items-start gap-3">
          {/* Avatar com iniciais */}
          {isNewCollab && (() => {
            const initials = name.split(' ').filter(Boolean).slice(0,2).map((w:string) => w[0]).join('').toUpperCase();
            return (
              <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
                style={isCasaType
                  ? {background:'#DBEAFE', color:'var(--primary)'}
                  : {background:'#FEE2E2', color:'#B91C1C'}}>
                {initials}
              </div>
            );
          })()}
          {!isNewCollab && <div className="shrink-0 w-8" />}

          <div className="flex-1 min-w-0">
            {isNewCollab && (
              <div className="flex items-center gap-1.5 mb-0.5">
                <span style={{fontSize:13, fontWeight:600, color:'#111827', letterSpacing:'-0.01em'}}>{toTitleCase(name)}</span>
                {hasOvr && !isSent && (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{background:'#F97316', boxShadow:'0 0 0 2px #FFF'}} />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Valores editados manualmente pelo RH</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <span className="inline-flex items-center justify-center text-[10px] font-semibold rounded-full"
                  style={{
                    ...(isCasaType ? {background:'#EFF6FF', color:'var(--primary)'} : {background:'#FFF1F2', color:'#BE123C'}),
                    padding: '2px 8px',
                    minWidth: 44,
                  }}>
                  {isCasaType ? 'Casa' : 'Freela'}
                </span>
              </div>
            )}
            {/* Linha 2: Função | Período */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[11px] ${isNotAttended ? 'line-through text-slate-400' : 'text-slate-500'}`}>
                {funcName}
              </span>
              {budget.inclusion.scheduleStartDate && (
                <span className="text-[11px]" style={{color:'#9CA3AF'}}>
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
                      <span className="inline-flex items-center shrink-0 cursor-default" style={{color:'#D97706'}}>✏</span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">RH ajustou o realizado deste colaborador</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            {/* Linha 3: Status discreto */}
            <div className="mt-0.5">
              {isSent ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-px rounded-full" style={{background:'#DCFCE7', color:'#16A34A'}}>
                  <Check className="w-2 h-2" />Enviado
                </span>
              ) : !isNotAttended ? (
                <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-px rounded-full" style={{background:'#FEF3C7', color:'#92400E'}}>
                  Pendente
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </td>

      {/* Diárias qty — somente leitura */}
      <td className="px-3 py-3 text-center" style={{background:'#F8FAFC', verticalAlign:'middle'}}>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[13px] font-semibold tabular-nums font-mono text-slate-600 cursor-default select-none">
                {budget.diasComDiaria}
                {(budget.regraDiaria === 'fds' || budget.regraDiaria === 'nenhuma' || budget.isPercurso) && budget.diasComDiaria !== budget.weekdays + budget.weekends && (
                  <span className="text-[10px] font-sans font-normal text-slate-400">/{budget.weekdays + budget.weekends}</span>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[260px]">
              <div className="flex flex-col gap-0.5">
                {budget.weekdays > 0 && (
                  <span>
                    <span className="text-primary">●</span> Útil: {budget.weekdays}×
                    {budget.regraDiaria === 'fds' && <span className="text-slate-400"> — sem diária (CLT)</span>}
                    {budget.regraDiaria === 'nenhuma' && <span className="text-slate-400"> — sem diária</span>}
                  </span>
                )}
                {budget.weekends > 0 && (
                  <span>
                    <span style={{color:'#F97316'}}>●</span> FDS: {budget.weekends}×
                    {budget.regraDiaria === 'nenhuma' && <span className="text-slate-400"> — sem diária</span>}
                  </span>
                )}
                {budget.regraDiaria === 'fds' && (
                  <span className="text-slate-400 mt-0.5">Casa (CLT): diária só nos fins de semana</span>
                )}
                {budget.regraDiaria === 'nenhuma' && (
                  <span className="text-slate-400 mt-0.5">Cenotécnica de casa (CLT): não recebe diária</span>
                )}
                {budget.isPercurso && (
                  <span className="text-slate-400 mt-0.5">
                    Percurso: {budget.diasComDiaria} {budget.diasComDiaria === 1 ? 'diária' : 'diárias'} ({budget.inclusion.needsTicket ? 'em viagem — regra fixa de 2 diárias' : 'local — 1 diária'}), pacote fechado por diária
                  </span>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>

      {/* Diária R$/dia — valor ÚNICO por linha (a diária é plana) */}
      <td className="px-4 py-3" style={{minWidth:'120px', verticalAlign:'middle'}}>
        <div className="flex items-center justify-end gap-1 rounded-md px-1 -mx-1" style={{background:'rgba(37,99,235,0.05)'}}>
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
                  className={`${inputBase} flex-1 min-w-0 ${!disabled && vdiaEdited ? 'font-bold' : ''}`}
                  style={!disabled && vdiaEdited ? {color:'var(--primary)', borderColor:'#93C5FD'} : !disabled ? {color:'var(--primary)'} : {}}
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
      <td className="px-4 py-3" style={{minWidth:'120px', verticalAlign:'middle'}}>
        {/* Útil */}
        <div className="flex items-center justify-end gap-1 mb-1.5 rounded-md px-1 -mx-1" style={{background:'rgba(37,99,235,0.05)'}}>
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
                  className={`${inputBase} flex-1 min-w-0 ${!disabled && budget.weekdays > 0 && alimUtilEdited ? 'font-bold' : ''}`}
                  style={!disabled && budget.weekdays > 0 && alimUtilEdited ? {color:'var(--primary)', borderColor:'#93C5FD'} : !disabled && budget.weekdays > 0 ? {color:'var(--primary)'} : {color:'#CBD5E1'}}
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
        <div className="flex items-center justify-end gap-1 rounded-md px-1 -mx-1" style={{background:'#FFF8F2'}}>
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
                  className={`${inputBase} flex-1 min-w-0 ${!disabled && budget.weekends > 0 && alimFdsEdited ? 'font-bold' : ''}`}
                  style={!disabled && budget.weekends > 0 && alimFdsEdited ? {color:'#F97316', borderColor:'#FDBA74'} : !disabled && budget.weekends > 0 ? {color:'#92400e'} : {color:'#CBD5E1'}}
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
          {alimFdsEdited && !disabled && budget.weekends > 0 && restoreBtn('alimentacaoFds', 'alimFds', 'hover:text-[#F97316]')}
        </div>
        {budget.alimEstimada && (
          <div className="flex justify-end mt-1">
            <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-semibold" style={{background:'#FEF3C7', color:'#B45309'}}
              title="Sem horários da passagem registrada — refeições estimadas até a compra">
              estimado
            </span>
          </div>
        )}
      </td>

      {/* Mobilidade — coluna individual */}
      <td className="px-4 py-3 text-right" style={{verticalAlign:'middle'}}>
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
                  className={`${inputBase} w-[80px] ${!disabled && mobEdited ? 'text-primary font-bold' : !disabled ? 'text-slate-900' : ''}`}
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
      <td className="px-4 py-3 text-right bg-blue-50/20" style={{position:'relative', verticalAlign:'middle'}}>
        <button
          ref={memoBtnRef}
          id={`subtotal-btn-${sid}`}
          onClick={() => onToggleSubtotal(sid)}
          aria-label={`Ver memória de cálculo de ${name}`}
          aria-expanded={subtotalOpen}
          className={`text-[14px] font-mono font-bold tabular-nums transition-colors ${isNotAttended ? 'text-slate-300 line-through cursor-default' : 'cursor-pointer hover:opacity-80'}`}
          style={isNotAttended ? {} : {color:'var(--primary)'}}
          disabled={isNotAttended}
        >
          {formatCurrency(budget.totalFinal)}
        </button>
        {matchingActual?.rhAdjusted && isSent && (
          <div className="text-[11px] font-mono font-semibold tabular-nums mt-0.5" style={{color:'#D97706'}}>
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
              style={{
                position:'absolute', right:0, top:'100%', zIndex:60,
                background:'#fff', border:'1px solid #E2E8F0',
                borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)',
                padding:'14px 16px', minWidth:270, textAlign:'left', outline:'none',
              }}
            >
              <div style={{fontSize:11, fontWeight:700, color:'var(--primary)', marginBottom:10, letterSpacing:'0.05em', textTransform:'uppercase'}}>
                Memória de Cálculo · {toTitleCase(name)}
              </div>
              <div style={{fontSize:11, color:'#64748B', marginBottom:8}}>
                {totalDias} {totalDias === 1 ? 'dia' : 'dias'}
                {budget.regraDiaria === 'fds' && ` · diária em ${budget.diasComDiaria} (só fins de semana — CLT)`}
                {budget.regraDiaria === 'nenhuma' && ` · sem diária (cenotécnica CLT)`}
                {budget.isPercurso && ` · ${budget.diasComDiaria} ${budget.diasComDiaria === 1 ? 'diária' : 'diárias'} (percurso ${budget.inclusion.needsTicket ? 'em viagem — regra fixa' : 'local'}, pacote fechado)`}
                {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && ` · ${new Date(budget.inclusion.scheduleStartDate + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})} → ${new Date(budget.inclusion.scheduleEndDate + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}`}
              </div>
              <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
                <tbody>
                  {budget.deflationSegments.map((seg, i) => (
                    <tr key={i}>
                      <td style={{paddingBottom:4, color:'var(--primary)', fontWeight:600}}>
                        {seg.days} {seg.days === 1 ? 'dia' : 'dias'} × {formatCurrency(seg.dailyCents)}
                        {seg.factor < 1 && <span style={{color:'#9CA3AF', fontWeight:400}}> ({Math.round(seg.factor * 100)}% · {seg.label})</span>}
                      </td>
                      <td style={{paddingBottom:4, textAlign:'right', color:'#374151', fontFamily:'monospace'}}>{formatCurrency(seg.totalCents)}</td>
                    </tr>
                  ))}
                  {budget.isPercurso && budget.percurseiro && (
                    ([['Motoqueiro', budget.percurseiro.motoqueiro], ['Fee Ivan', budget.percurseiro.fee], ['Alimentação (3 refeições)', budget.percurseiro.alimentacao], ['Ajuda transporte', budget.percurseiro.transporte], ['NF', budget.percurseiro.nf]] as [string, number][]).map(([lbl, v]) => (
                      <tr key={lbl}>
                        <td style={{paddingBottom:2, color:'#9CA3AF', fontSize:10, paddingLeft:8}}>{lbl} <span style={{color:'#CBD5E1'}}>× {budget.diasComDiaria}</span></td>
                        <td style={{paddingBottom:2, textAlign:'right', color:'#94A3B8', fontFamily:'monospace', fontSize:10}}>{formatCurrency(v * budget.diasComDiaria)}</td>
                      </tr>
                    ))
                  )}
                  <tr>
                    <td style={{paddingBottom:8, color:'#9CA3AF', fontSize:10, paddingLeft:8}}>
                      {budget.isPercurso ? `Diárias (pacote fechado — ${PERCURSEIRO_TIPOS.find(t => t.value === (budget.percurseiroTipo ?? 'tipo_1'))?.label}${budget.percurseiroTipo ? '' : ' provisório'})` : budget.regraDiaria === 'nenhuma' ? 'Diárias (cenotécnica CLT: sem diária)' : 'Diárias (com deflação por período)'}
                    </td>
                    <td style={{paddingBottom:8, textAlign:'right', color:'#64748B', fontFamily:'monospace', fontSize:11}}>{formatCurrency(budget.subtotalDiarias)}</td>
                  </tr>
                  {budget.isPercurso && (
                    <tr>
                      <td colSpan={2} style={{paddingBottom:6, color:'#9CA3AF', fontSize:10, paddingLeft:8}}>Alimentação e mobilidade: incluídas no pacote do percurseiro</td>
                    </tr>
                  )}
                  {alimTotal > 0 && (
                    <tr>
                      <td style={{paddingBottom:4, color:'#EA580C', fontWeight:600}}>
                        Alimentação{budget.alimEstimada ? <span style={{color:'#B45309', fontWeight:400, fontSize:10}}> (estimada)</span> : null}
                      </td>
                      <td style={{paddingBottom:4, textAlign:'right', color:'#374151', fontFamily:'monospace'}}>{formatCurrency(alimTotal)}</td>
                    </tr>
                  )}
                  {budget.mobilidade > 0 && (
                    <tr>
                      <td style={{paddingBottom:4, color:'#6D28D9', fontWeight:600}}>Mobilidade (total)</td>
                      <td style={{paddingBottom:4, textAlign:'right', color:'#374151', fontFamily:'monospace'}}>{formatCurrency(budget.mobilidade)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:'2px solid #E2E8F0'}}>
                    <td style={{paddingTop:8, fontWeight:700, color:'var(--primary)', fontSize:13}}>Total</td>
                    <td style={{paddingTop:8, textAlign:'right', fontWeight:700, color:'var(--primary)', fontFamily:'monospace', fontSize:13}}>{formatCurrency(budget.totalFinal)}</td>
                  </tr>
                </tfoot>
              </table>
              <button
                onClick={() => onToggleSubtotal(sid)}
                style={{marginTop:10, fontSize:10, color:'#94A3B8', cursor:'pointer', background:'none', border:'none', display:'block', textAlign:'center', width:'100%'}}
              >fechar</button>
            </div>
          );
        })()}
      </td>
    </tr>
  );
});

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

  const [selectedEventId, setSelectedEventId] = useState<string>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("event") || "";
  });
  const [editingBudget, setEditingBudget] = useState<BudgetEdit | null>(null);
  const [editingBudgetInfo, setEditingBudgetInfo] = useState<{ name: string; functionName: string; type: string; weekdays: number; weekends: number; diasComDiaria: number; regraDiaria: RegraDiaria; period: string; vooChegadaIda?: string | null; vooPartidaVolta?: string | null; fonteVoo?: "passagem" | "sugerido" | "nenhum"; alimEstimada?: boolean; voa?: boolean; isAtend?: boolean; atendimentoTipo?: AtendimentoTipo | null; isPercurso?: boolean; percurseiroTipo?: PercurseiroTipo | null; percurseiro?: PercurseiroDiaria | null; inclusionId?: string } | null>(null);
  const [editingBudgetPlannedId, setEditingBudgetPlannedId] = useState<string | null>(null);
  // Percurso (motoqueiro): Tipo 1 / Tipo 2 definido aqui pelo RH quando a
  // escalação veio sem tipo (rota dedicada espelha a de atendimento).
  const setPercurseiroTipoMutation = useMutation({
    mutationFn: async ({ inclusionId, tipo }: { inclusionId: string; tipo: PercurseiroTipo }) => {
      const r = await apiRequest("PATCH", `/api/team-inclusions/${inclusionId}/percurseiro-tipo`, { percurseiroTipo: tipo });
      return r.json();
    },
    onSuccess: (_updated, { tipo }) => {
      qc.invalidateQueries({ queryKey: ["/api/team-inclusions", selectedEventId] });
      qc.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      const pacote = percurseiroDiariaCents(tipo, systemSettings as any);
      setEditingBudgetInfo(prev => prev ? { ...prev, percurseiroTipo: tipo, percurseiro: pacote } : prev);
      const novoValor = pacote?.total;
      if (novoValor != null) {
        const prevDefault = defaultBudgetValues?.valorDiaria;
        const manualPreserved = !!editingBudget && prevDefault !== undefined && editingBudget.valorDiaria !== prevDefault;
        if (!manualPreserved) {
          setEditingBudget(prev => prev ? { ...prev, valorDiaria: novoValor, valorDiariaUtil: novoValor, valorDiariaFds: novoValor } : prev);
          setModalBufs(p => { const n = { ...p }; delete n.vdia; return n; });
        }
        if (originalModalValues) {
          const dias = editingBudgetInfo?.diasComDiaria ?? 0;
          const origVal = originalModalValues.valorDiaria;
          // Percurso: pacote fechado, sem deflação (dias × valor)
          setOriginalModalTotal(t => t - origVal * dias + novoValor * dias);
          setOriginalModalValues({ ...originalModalValues, valorDiaria: novoValor, valorDiariaUtil: novoValor, valorDiariaFds: novoValor });
        }
        setDefaultBudgetValues(prev => prev ? { ...prev, valorDiaria: novoValor, valorDiariaUtil: novoValor, valorDiariaFds: novoValor } : prev);
        toast({ title: "Tipo do percurseiro atualizado", description: manualPreserved ? "Sua edição manual da diária foi mantida." : "Diária recalculada com o pacote do tipo escolhido." });
      }
    },
    onError: (e: any) => toast({ title: "Não foi possível definir o tipo", description: e?.message, variant: "destructive" }),
  });

  // Muitas escalações de atendimento viraram Planejado ANTES do flag existir
  // (backfill marcou todas como Executivo de Contas). O RH corrige por aqui,
  // sem voltar à escalação — a rota dedicada aceita o papel financeiro.
  const setAtendimentoTipoMutation = useMutation({
    mutationFn: async ({ inclusionId, tipo }: { inclusionId: string; tipo: AtendimentoTipo }) => {
      const r = await apiRequest("PATCH", `/api/team-inclusions/${inclusionId}/atendimento-tipo`, { atendimentoTipo: tipo });
      return r.json();
    },
    onSuccess: (_updated, { tipo }) => {
      qc.invalidateQueries({ queryKey: ["/api/team-inclusions", selectedEventId] });
      qc.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      // Reflete no modal aberto: tipo novo e, sem edição manual em curso, a diária nova
      setEditingBudgetInfo(prev => prev ? { ...prev, atendimentoTipo: tipo } : prev);
      const novoValor = atendimentoDailyCents(tipo, systemSettings as any);
      let manualPreserved = false;
      if (novoValor != null) {
        // Se o usuário editou a diária no modal e ainda não salvou, preserva a
        // edição: só sobrescreve se o valor atual era o padrão anterior.
        const prevDefault = defaultBudgetValues?.valorDiaria;
        manualPreserved = !!editingBudget && prevDefault !== undefined && editingBudget.valorDiaria !== prevDefault;
        if (!manualPreserved) {
          setEditingBudget(prev => prev ? { ...prev, valorDiaria: novoValor, valorDiariaUtil: novoValor, valorDiariaFds: novoValor } : prev);
          setModalBufs(p => { const n = { ...p }; delete n.vdia; return n; });
        }
        // A troca de tipo já está PERSISTIDA no servidor: a nova tarifa vira a
        // linha de base do modal — sem acusar "▲ vs original" por mudança já gravada.
        if (originalModalValues) {
          const dias = editingBudgetInfo?.diasComDiaria ?? ((editingBudgetInfo?.weekdays ?? 0) + (editingBudgetInfo?.weekends ?? 0));
          const factors = deflationFactorsFromSettings(systemSettings as Record<string, number> | undefined);
          const origVal = originalModalValues.valorDiaria;
          setOriginalModalTotal(t => t
            - calcDeflatedDailies(origVal, dias, factors).totalCents
            + calcDeflatedDailies(novoValor, dias, factors).totalCents);
          setOriginalModalValues({ ...originalModalValues, valorDiaria: novoValor, valorDiariaUtil: novoValor, valorDiariaFds: novoValor });
        }
        // O "padrão" do modal acompanha a nova tarifa — assim salvar sem outras
        // edições não cria override desnecessário.
        setDefaultBudgetValues(prev => prev ? { ...prev, valorDiaria: novoValor, valorDiariaUtil: novoValor, valorDiariaFds: novoValor } : prev);
      }
      toast({
        title: "Tipo de atendimento atualizado",
        description: manualPreserved
          ? "Tarifa atualizada — a sua edição manual da diária foi preservada."
          : "A diária foi recalculada para a tarifa escolhida.",
      });
    },
    onError: (e: any) => toast({ title: "Erro ao definir o tipo", description: e?.body?.message || "Tente novamente.", variant: "destructive" }),
  });
  const [budgetOverrides, setBudgetOverrides] = useState<Record<string, BudgetOverride>>(() => readDraft(selectedEventId));
  // Aviso discreto de que um rascunho salvo foi restaurado no load
  const [draftRestored, setDraftRestored] = useState<boolean>(() => Object.keys(readDraft(selectedEventId)).length > 0);
  // Evento dono do rascunho em memória — impede salvar o rascunho de um evento
  // na chave de outro durante a troca de evento.
  const draftEventRef = useRef(selectedEventId);
  const [sentToActual, setSentToActual] = useState<Set<string>>(new Set());
  // Seleção ÚNICA, compartilhada entre a Visão Geral (cards) e a Planilha
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Confirmação de envio unificada (cards, envio individual e planilha)
  const [confirmSend, setConfirmSend] = useState<{ ids: string[]; source: 'single' | 'batch' } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  // Mudou busca/filtro → limpa a seleção. Sem isso, item selecionado e depois
  // oculto pelo filtro seguia no "Enviar Planejamento (N)" sem o usuário ver
  // (mesma classe de bug corrigida no Realizado/Comparativo).
  useEffect(() => { setSelectedIds(new Set()); }, [searchTerm, filterFunction, filterType]);
  const [sortBy, setSortBy] = useState<string>("name_asc");
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const [notAttendedModal, setNotAttendedModal] = useState<{ id?: string; budget?: any; name: string; functionName: string } | null>(null);
  const [notAttendedReason, setNotAttendedReason] = useState("");
  const [activeTab, setActiveTab] = useState<'overview' | 'sheet'>('overview');
  const [isApplyingDefaults, setIsApplyingDefaults] = useState(false);
  const [modalTab, setModalTab] = useState<'custos' | 'observacoes' | 'historico'>('custos');
  const [modalViewMode, setModalViewMode] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [batchPopover, setBatchPopover] = useState<{ field: 'vdia'|'alim'|'mob'; value: string } | null>(null);
  const [batchApplied, setBatchApplied] = useState<Set<'vdia'|'alim'|'mob'>>(new Set());
  const [batchHistory, setBatchHistory] = useState<{ fields: ('vdia'|'alim'|'mob')[]; prev: Record<string, any> } | null>(null);
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
  // Buffer de digitação dos inputs do modal — permite "540,50" sem o controlled
  // input engolir a vírgula (mesmo padrão do SheetRow)
  const [modalBufs, setModalBufs] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const canEdit = user?.role === "admin" || user?.role === "production";
  const canMarkNotAttended = isRhOrAdmin(user);

  // Rascunho no formato ANTIGO (pré-v2): descarta e avisa UMA vez por evento —
  // migrá-lo às cegas restauraria tudo como override e travaria o recálculo.
  const warnedLegacyDraftRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedEventId || warnedLegacyDraftRef.current.has(selectedEventId)) return;
    if (discardLegacyDraft(selectedEventId)) {
      warnedLegacyDraftRef.current.add(selectedEventId);
      toast({
        title: "Rascunho antigo descartado",
        description: "Um rascunho no formato antigo foi descartado para não travar os cálculos automáticos.",
      });
    }
  }, [selectedEventId, toast]);

  // Carrega o rascunho salvo ao trocar de evento
  useEffect(() => {
    if (draftEventRef.current === selectedEventId) return;
    draftEventRef.current = selectedEventId;
    const draft = readDraft(selectedEventId);
    setBudgetOverrides(draft);
    setDraftRestored(Object.keys(draft).length > 0);
  }, [selectedEventId]);

  // Salva o rascunho a cada mudança, sempre na chave do evento dono do rascunho
  useEffect(() => {
    const eventId = draftEventRef.current;
    if (!eventId) return;
    try {
      if (Object.keys(budgetOverrides).length === 0) {
        localStorage.removeItem(draftStorageKey(eventId));
      } else {
        localStorage.setItem(draftStorageKey(eventId), JSON.stringify(budgetOverrides));
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
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const { data: functionValues, isLoading: isLoadingFunctionValues, isError: isErrorFunctionValues, refetch: refetchFunctionValues } = useQuery<FunctionValue[]>({ queryKey: ["/api/function-values"] });
  // Passagens: fonte dos horários de voo para mobilidade e alimentação
  const { data: allTickets } = useQuery<any[]>({ queryKey: ["/api/tickets"] });
  const ticketByInclusion = useMemo(() => {
    const m = new Map<string, any>();
    for (const t of allTickets || []) if (t.teamInclusionId) m.set(t.teamInclusionId, t);
    return m;
  }, [allTickets]);
  const { data: systemSettings } = useQuery<Record<string, number>>({
    queryKey: ["/api/system-settings"],
    queryFn: async () => {
      const res = await fetch("/api/system-settings", { credentials: "include" });
      return res.json();
    },
  });

  const { data: existingActuals } = useQuery<any[]>({
    queryKey: ["/api/budget-actual", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-actual?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch budget actual");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: allBudgetPlanned } = useQuery<any[]>({
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
    onSuccess: (data: any, { id }) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-planned", selectedEventId] });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      setNotAttendedModal(null);
      setNotAttendedReason("");
      if (data.didNotAttend) {
        // Remove de seleção se estava selecionado
        const budget = calculatedBudgets.find(b => allBudgetPlanned?.find((p: any) => p.id === id && p.collaboratorId === b.inclusion.collaboratorId && p.functionId === b.inclusion.functionId));
        if (budget) setSelectedIds(prev => { const s = new Set(Array.from(prev)); s.delete(budget.inclusion.id); return s; });
        toast({ title: "Colaborador marcado como não participou", className: "bg-gray-50 border-gray-200 text-gray-800" });
      } else {
        toast({ title: "Participação restaurada", className: "bg-emerald-50 border-emerald-200 text-emerald-800" });
      }
    },
    onError: () => toast({ title: "Erro ao atualizar participação", variant: "destructive" }),
  });

  const createAndMarkNotAttendedMutation = useMutation({
    mutationFn: async ({ budget, reason }: { budget: any; reason: string }) => {
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
      toast({ title: "Colaborador marcado como não participou", className: "bg-gray-50 border-gray-200 text-gray-800" });
    },
    onError: () => toast({ title: "Erro ao marcar como não participou", variant: "destructive" }),
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
      setHighlightCardId(target.id);
      setTimeout(() => {
        const el = document.querySelector(`[data-card-id="${target.id}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
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

  const getCollaboratorName = (id?: string | null) => {
    if (!id) return "Não definido";
    return collaboratorNamesById.get(id) || "Não definido";
  };

  const getFunctionName = (id?: string | null) => {
    if (!id) return "-";
    return functionNamesById.get(id) || "-";
  };

  const getFunctionValue = (functionId: string | null) => {
    if (!functionId) return null;
    return functionValues?.find(fv => fv.functionId === functionId);
  };

  const selectedEvent = events?.find(e => e.id === selectedEventId);

  function formatEventDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "";
    const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const [year, month, day] = dateStr.split("-");
    return `${parseInt(day)} de ${months[parseInt(month) - 1]} de ${year}`;
  }

  const countWeekdaysAndWeekends = (startDate: string | null, qtdDiarias: number): { weekdays: number; weekends: number } => {
    if (!startDate || qtdDiarias <= 0) return { weekdays: 0, weekends: 0 };
    const start = new Date(startDate + 'T00:00:00');
    if (isNaN(start.getTime())) return { weekdays: 0, weekends: 0 };

    let weekdays = 0;
    let weekends = 0;
    const current = new Date(start);
    let daysLeft = qtdDiarias;

    while (daysLeft > 0) {
      const day = current.getDay();
      if (day === 0 || day === 6) {
        weekends++;
      } else {
        weekdays++;
      }
      current.setDate(current.getDate() + 1);
      daysLeft--;
    }

    return { weekdays, weekends };
  };

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

  useEffect(() => {
    if (existingActuals && confirmedInclusions) {
      const sentIds = new Set<string>();
      confirmedInclusions.forEach(inc => {
        const hasActual = existingActuals.some(a =>
          a.collaboratorId === inc.collaboratorId && a.functionId === inc.functionId
        );
        if (hasActual) sentIds.add(inc.id);
      });
      setSentToActual(sentIds);
    }
  }, [existingActuals, confirmedInclusions]);

  // Calcular orçamento automaticamente baseado nas escalações confirmadas
  const calculatedBudgets = useMemo(() => {
    if (!confirmedInclusions || !functionValues) return [];
    
    return confirmedInclusions.map(inclusion => {
      const fv = getFunctionValue(inclusion.functionId);
      const collab = collaborators?.find(c => c.id === inclusion.collaboratorId);
      const override = budgetOverrides[inclusion.id];
      
      // Calcular dias reais a partir do intervalo de datas (igual ao que a escalação mostra)
      let weekdays = 0;
      let weekends = 0;
      let qtdDiarias: number;
      const diasPeriodo: string[] = [];

      if (inclusion.scheduleStartDate && inclusion.scheduleEndDate) {
        // Usar intervalo completo start→end: mesma lógica que o "Período de Trabalho" na escalação
        const startD = new Date(inclusion.scheduleStartDate + 'T12:00:00');
        const endD = new Date(inclusion.scheduleEndDate + 'T12:00:00');
        const cur = new Date(startD);
        while (cur <= endD) {
          const day = cur.getDay();
          if (day === 0 || day === 6) weekends++;
          else weekdays++;
          diasPeriodo.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}-${String(cur.getDate()).padStart(2,"0")}`);
          cur.setDate(cur.getDate() + 1);
        }
        // Contagem de dias vem SEMPRE do período — qtdDiarias não é editável
        qtdDiarias = weekdays + weekends;
      } else {
        qtdDiarias = inclusion.dailyRates ?? 0;
        const result = countWeekdaysAndWeekends(inclusion.scheduleStartDate, qtdDiarias);
        weekdays = result.weekdays;
        weekends = result.weekends;
      }

      const ss = systemSettings as Record<string, number> | undefined;
      const collabIsCasa = collab?.type === 'casa' || collab?.type === 'local';
      
      // Daily rates: use type-specific function values for weekday/weekend
      // fv.dailyValue = casa weekday, fv.dailyValueWeekend = casa weekend
      // fv.dailyValueFreela = freela weekday, fv.dailyValueFreelaWeekend = freela weekend
      const fvAny = fv as any;
      const fvDailyWd = collabIsCasa ? (fvAny?.dailyValue ?? 0) : (fvAny?.dailyValueFreela ?? 0);
      const fvDailyWe = collabIsCasa ? (fvAny?.dailyValueWeekend ?? fvAny?.dailyValue ?? 0) : (fvAny?.dailyValueFreelaWeekend ?? fvAny?.dailyValueFreela ?? 0);

      const defaultDailyValueWeekday = collabIsCasa
        ? (ss?.default_daily_value_weekday ?? ss?.default_daily_value ?? 5000)
        : (ss?.default_daily_value_weekday_freela ?? ss?.default_daily_value_weekday ?? ss?.default_daily_value ?? 5000);
      const defaultDailyValueWeekend = collabIsCasa
        ? (ss?.default_daily_value_weekend ?? ss?.default_daily_value ?? 5000)
        : (ss?.default_daily_value_weekend_freela ?? ss?.default_daily_value_weekend ?? ss?.default_daily_value ?? 5000);

      const inclusionDailyValue = inclusion.dailyValue ?? defaultDailyValueWeekday;
      // Atendimento (Key Account x Executivo de Contas): a diária é plana (mesmo
      // valor útil e fds), definida pelo tipo escolhido na escalação e editável
      // no Valores Padrão. Tem prioridade sobre fv/inclusion/default — inclusive
      // corrige o dailyValue sujo de R$50/dia da grade antiga.
      const isAtend = isAtendimentoFunction(getFunctionName(inclusion.functionId));
      const atendVal = isAtend ? atendimentoDailyCents((inclusion as any).atendimentoTipo, ss) : null;
      // PERCURSO (motoqueiro) — regra 17/08: pacote FECHADO por diária (Tipo 1 /
      // Tipo 2, definido na escalação; sem tipo → Tipo 1 provisório + aviso).
      // Em viagem SEMPRE 2 diárias, local 1; alimentação e mobilidade = 0 (já
      // estão no pacote); sem deflação. Regra em shared/calculation-rules.
      const isPercurso = isPercursoFunction(getFunctionName(inclusion.functionId));
      const percurseiroTipo = ((inclusion as any).percurseiroTipo ?? null) as PercurseiroTipo | null;
      const percurseiroTipoEfetivo: PercurseiroTipo | null = isPercurso ? (percurseiroTipo ?? "tipo_1") : null;
      const percurseiro = isPercurso ? percurseiroDiariaCents(percurseiroTipoEfetivo, ss) : null;
      const percursoVal = percurseiro ? percurseiro.total : null;
      // Diária FIXA por função — sem distinção útil/fds (decisão de negócio):
      // um único valor aplicado a todos os dias. Prioridade: override manual >
      // atendimento (tipo) > valor da função (útil, senão fds) > inclusão > default.
      const fvDaily = fvDailyWd > 0 ? fvDailyWd : (fvDailyWe > 0 ? fvDailyWe : 0);
      // Diária plana: enquanto o modal ainda mostra dois campos (útil/fds),
      // editar QUALQUER um deles vira o valor único — nada é ignorado.
      // FREELA segue a REGRA do slide (local/viagem/dir de prova, editável no
      // Valores Padrão) — vence os valores freela antigos gravados por função,
      // que eram legado (ex.: R$250) e não batiam com a tabela.
      const freelaVal = !collabIsCasa
        ? freelaDailyCents(getFunctionName(inclusion.functionId), !!inclusion.needsTicket, ss)
        : null;
      // CASA também segue a regra do slide (dir prova / produtor / exec vendas
      // O2); funções fora dos grupos (cenotécnica, percurso, montagem) caem no
      // valor por função como antes.
      const casaVal = collabIsCasa
        ? casaDailyCents(getFunctionName(inclusion.functionId), ss)
        : null;
      // Valor da REGRA ATUAL (motor), sem override — usado por "Restaurar padrão" e tooltips
      const sysValorDiaria = percursoVal ?? atendVal
        ?? freelaVal ?? casaVal ?? (fvDaily > 0 ? fvDaily : null) ?? inclusionDailyValue ?? defaultDailyValueWeekday;
      const valorDiaria = override?.valorDiaria ?? override?.valorDiariaUtil ?? override?.valorDiariaFds ?? sysValorDiaria;
      const valorDiariaUtil = valorDiaria;
      const valorDiariaFds = valorDiaria;
      
      // Deflação por período (slide): 100% até 4 dias, 90% do 5º ao 8º, 80% do
      // 9º em diante — fatores editáveis no Valores Padrão. Aplicada sobre a
      // diária plana, por contagem total de dias.
      // Regra 17/08: colaborador `casa` (CLT) só recebe diária nos fins de
      // semana (dia útil já é assalariado); `local` e freela: todos os dias.
      // A REGRA é única em shared/calculation-rules (diasComDiaria) — aqui só
      // muda QUANTOS dias contam; o valor da diária continua o mesmo.
      // Casa + CENOTÉCNICA (regra 17/08): diária = 0 sempre ("nenhuma").
      const fnName = getFunctionName(inclusion.functionId);
      const regraDiaria: RegraDiaria = isPercurso ? 'todos' : regraDiariaPorTipo(collab?.type, fnName);
      // Percurso: contagem FIXA (viagem 2 / local 1), independente do período.
      const diasComDiaria = isPercurso
        ? diasPercurseiro(inclusion.needsTicket)
        : calcDiasComDiaria(collab?.type, weekdays, weekends, fnName);
      // Percurso é pacote fechado: SEM deflação (segmento único a 100%).
      const deflated = isPercurso
        ? { totalCents: valorDiaria * diasComDiaria, segments: [{ days: diasComDiaria, factor: 1, dailyCents: valorDiaria, totalCents: valorDiaria * diasComDiaria, label: "pacote fechado" }] as DeflationSegment[] }
        : calcDeflatedDailies(valorDiaria, diasComDiaria, deflationFactorsFromSettings(ss));
      const subtotalDiarias = deflated.totalCents;
      // Distribui o total deflacionado entre útil/fds só para exibição (a diária
      // é plana; a deflação é por dia, não por útil/fds). Casa: útil = 0.
      const subtotalDiariasUtil = (regraDiaria === 'fds' || regraDiaria === 'nenhuma')
        ? 0
        : (diasComDiaria > 0 && !isPercurso ? Math.round(subtotalDiarias * weekdays / diasComDiaria) : (isPercurso ? subtotalDiarias : 0));
      const subtotalDiariasFds = subtotalDiarias - subtotalDiariasUtil;
      
      // ── Horários de voo: a PASSAGEM registrada manda; os horários sugeridos
      // da escalação são só fallback enquanto a compra não acontece ──────────
      const voa = !!inclusion.needsTicket;
      const ticket = ticketByInclusion.get(inclusion.id);
      const vooPartidaIda = ticket?.actualDepartureTime || inclusion.flightDepartureSuggestedTime || null;
      const vooChegadaIda = ticket?.actualArrivalTime || inclusion.flightArrivalSuggestedTime || null;
      const vooPartidaVolta = ticket?.actualReturnTime || inclusion.flightReturnSuggestedTime || null;
      const fonteVoo: 'passagem' | 'sugerido' | 'nenhum' =
        (ticket?.actualArrivalTime || ticket?.actualReturnTime || ticket?.actualDepartureTime) ? 'passagem'
        : (vooPartidaIda || vooChegadaIda || vooPartidaVolta) ? 'sugerido' : 'nenhum';

      // Mobilidade (slide "Ajuda de custo"): R$58/trecho para voos de madrugada
      // (parte 23h30–9h30 OU chega 20h–5h), R$29 caso contrário; 0 sem voo.
      // Regra 17/08: trecho de VOLTA partindo a partir das 20h também vale R$58.
      // Percurso: mobilidade já está no pacote → 0.
      const sysMobIda = voa && !isPercurso ? mobilidadeTrechoCents(vooPartidaIda, vooChegadaIda, { trecho: 'ida' }) : 0;
      const sysMobVolta = voa && !isPercurso ? mobilidadeTrechoCents(vooPartidaVolta, null, { trecho: 'volta' }) : 0;
      const sysMob = sysMobIda + sysMobVolta;
      const mobilidade = override?.mobilidade ?? sysMob;
      const mobilidadeIda = override?.mobilidadeIda ?? sysMobIda;
      const mobilidadeVolta = override?.mobilidadeVolta ?? sysMobVolta;

      // ── Alimentação por refeição, dirigida pelos horários da passagem ──────
      // (quem não voa fica sem alimentação — decisão de 14/08, reversível)
      const ceno = isCenotecnicaFunction(getFunctionName(inclusion.functionId));
      const { almocoCents, jantarCents } = refeicaoCents(ceno, ss);
      // Regra 17/08: colaborador `casa` (CLT) em dia ÚTIL tem almoço reduzido
      // (default R$ 8,00 — só a diferença do VR); jantar e fins de semana
      // inalterados. Valor por dia vem de shared/alimentacao (refeicaoCentsDia).
      const refUtil = refeicaoCentsDia(ceno, ss, { tipoColaborador: collab?.type, isWeekend: false });
      const refFds = refeicaoCentsDia(ceno, ss, { tipoColaborador: collab?.type, isWeekend: true });
      const alim = calcAlimentacao({
        workDays: diasPeriodo, voa: voa && !isPercurso, // percurso: alimentação no pacote
        chegadaIda: vooChegadaIda, partidaVolta: vooPartidaVolta,
        almocoCents, jantarCents,
      });
      // Distribui as refeições calculadas entre útil/fds (persistência usa os
      // 4 campos existentes); o VALOR de cada refeição depende do dia (útil/fds)
      let calcAlmSem = 0, calcJanSem = 0, calcAlmFds = 0, calcJanFds = 0;
      for (const d of alim.dias) {
        const dow = new Date(d.date + 'T12:00:00').getDay();
        const fds = dow === 0 || dow === 6;
        if (d.almoco) { if (fds) calcAlmFds += refFds.almocoCents; else calcAlmSem += refUtil.almocoCents; }
        if (d.jantar) { if (fds) calcJanFds += refFds.jantarCents; else calcJanSem += refUtil.jantarCents; }
      }
      // Sem intervalo completo de datas (diasPeriodo vazio) mas com dias
      // contados: assume dia cheio na proporção útil/fds já conhecida
      if (voa && !isPercurso && diasPeriodo.length === 0 && (weekdays + weekends) > 0) {
        calcAlmSem = weekdays * refUtil.almocoCents; calcJanSem = weekdays * refUtil.jantarCents;
        calcAlmFds = weekends * refFds.almocoCents; calcJanFds = weekends * refFds.jantarCents;
      }
      // Percurso: alimentação já está no pacote — nada a "estimar"
      const alimEstimada = voa && !isPercurso && (fonteVoo !== 'passagem' || alim.estimado);
      // Mesmo zeroing EFETIVO do modal: bucket com 0 dias conta 0 — mesmo que
      // um override (ex.: rascunho ou lote antigo) tenha valor gravado nele.
      const almocoSemana = weekdays === 0 ? 0 : (override?.almocoSemana ?? calcAlmSem);
      const jantarSemana = weekdays === 0 ? 0 : (override?.jantarSemana ?? calcJanSem);
      const almocoFds = weekends === 0 ? 0 : (override?.almocoFds ?? calcAlmFds);
      const jantarFds = weekends === 0 ? 0 : (override?.jantarFds ?? calcJanFds);
      // unit values for tooltip display
      const unitAlmocoSemana = refUtil.almocoCents;
      const unitJantarSemana = refUtil.jantarCents;
      const unitAlmocoFds = refFds.almocoCents;
      const unitJantarFds = refFds.jantarCents;
      
      const ajudaCusto = mobilidade + almocoSemana + jantarSemana + almocoFds + jantarFds;
      const totalFinal = subtotalDiarias + ajudaCusto;
      
      return {
        inclusion,
        collaborator: collab,
        functionValue: fv,
        qtdDiarias,
        valorDiaria,
        valorDiariaUtil,
        valorDiariaFds,
        subtotalDiarias,
        subtotalDiariasUtil,
        subtotalDiariasFds,
        mobilidade,
        mobilidadeIda,
        mobilidadeVolta,
        almocoSemana,
        jantarSemana,
        almocoFds,
        jantarFds,
        unitAlmocoSemana,
        unitJantarSemana,
        unitAlmocoFds,
        unitJantarFds,
        ajudaCusto,
        totalFinal,
        weekdays,
        weekends,
        hasOverride: !!override,
        diasComDiaria,
        regraDiaria,
        isPercurso,
        percurseiroTipo,
        percurseiro,
        vooPartidaIda,
        vooChegadaIda,
        vooPartidaVolta,
        fonteVoo,
        alimEstimada,
        deflationSegments: deflated.segments,
        sysValorDiaria,
        sysMobilidade: sysMob,
        sysMobilidadeIda: sysMobIda,
        sysMobilidadeVolta: sysMobVolta,
        sysAlmocoSemana: calcAlmSem,
        sysJantarSemana: calcJanSem,
        sysAlmocoFds: calcAlmFds,
        sysJantarFds: calcJanFds,
      };
    });
  }, [confirmedInclusions, functionValues, collaborators, budgetOverrides, systemSettings, ticketByInclusion]);

  // Set de chaves "collaboratorId|functionId" para cards marcados como "não participou"
  const notAttendedKeys = useMemo(() => {
    const keys = new Set<string>();
    (allBudgetPlanned || []).forEach((p: any) => {
      if (p.didNotAttend) keys.add(`${p.collaboratorId}|${p.functionId}`);
    });
    return keys;
  }, [allBudgetPlanned]);

  const isCardNotAttended = (b: typeof calculatedBudgets[0]) =>
    notAttendedKeys.has(`${b.inclusion.collaboratorId}|${b.inclusion.functionId}`);

  // Registros indexados por "colaborador|função" — evita .find() O(n) por card/linha.
  // O primeiro registro vence, preservando a semântica do Array.find original.
  const plannedByCollabFunc = useMemo(() => {
    const m = new Map<string, any>();
    (allBudgetPlanned || []).forEach((p: any) => {
      const key = `${p.collaboratorId}|${p.functionId}`;
      if (!m.has(key)) m.set(key, p);
    });
    return m;
  }, [allBudgetPlanned]);

  const actualsByCollabFunc = useMemo(() => {
    const m = new Map<string, any>();
    (existingActuals || []).forEach((a: any) => {
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
  }, [calculatedBudgets, functions]);

  // Filtrar e ordenar budgets
  const filteredBudgets = useMemo(() => {
    let result = [...calculatedBudgets];
    
    // Filtro por busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
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
  }, [calculatedBudgets, searchTerm, filterFunction, filterType, sortBy, collaboratorNamesById, functionNamesById]);

  // SELECIONÁVEIS visíveis: respeitam o filtro atual e excluem enviados e
  // "não participou" — base do select-all dos cards E da planilha.
  const selectableFiltered = useMemo(
    () => filteredBudgets.filter(b =>
      !sentToActual.has(b.inclusion.id) &&
      !notAttendedKeys.has(`${b.inclusion.collaboratorId}|${b.inclusion.functionId}`)
    ),
    [filteredBudgets, sentToActual, notAttendedKeys]
  );


  const [originalModalTotal, setOriginalModalTotal] = useState<number>(0);
  // Valores originais campo a campo — comparar só o total esconderia edições
  // que se compensam (ex.: +50 no almoço e -50 no jantar).
  const [originalModalValues, setOriginalModalValues] = useState<BudgetEdit | null>(null);
  const [defaultBudgetValues, setDefaultBudgetValues] = useState<BudgetEdit | null>(null);
  // Alimentação no modal: os 4 campos legados ficam recolhidos ("exceções");
  // abrem automaticamente quando o valor atual difere do motor (override).
  const [alimExpanded, setAlimExpanded] = useState(false);

  const openEditModal = (budget: typeof calculatedBudgets[0], viewMode = false) => {
    const startDate = budget.inclusion.scheduleStartDate;
    const endDate = budget.inclusion.scheduleEndDate;
    const formatDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
    const period = startDate && endDate ? `${formatDate(startDate)} a ${formatDate(endDate)}` : '-';
    
    setEditingBudgetInfo({
      name: getCollaboratorName(budget.inclusion.collaboratorId),
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
      atendimentoTipo: ((budget.inclusion as any).atendimentoTipo ?? null) as AtendimentoTipo | null,
      isPercurso: budget.isPercurso,
      percurseiroTipo: budget.percurseiroTipo,
      percurseiro: budget.percurseiro,
      inclusionId: budget.inclusion.id,
    });

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
      (p: any) => p.collaboratorId === budget.inclusion.collaboratorId && p.functionId === budget.inclusion.functionId
    );
    setEditingBudgetPlannedId(planRec?.id ?? null);
    setModalViewMode(viewMode);
    setModalTab('custos');
    setModalBufs({});
  };

  const saveEdit = () => {
    if (!editingBudget || !originalModalValues || !defaultBudgetValues) return;
    const id = editingBudget.inclusionId;
    const cur = editingBudget;
    const orig = originalModalValues;
    const sys = defaultBudgetValues;
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
    toast({ title: "Valores ajustados", description: "As alterações serão aplicadas no envio para o Realizado." });
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
      (p: any) => p.collaboratorId === budget.inclusion.collaboratorId && p.functionId === budget.inclusion.functionId
    );

    let savedPlanned: any;
    if (existingPlan) {
      const patchRes = await apiRequest("PATCH", `/api/budget-planned/${existingPlan.id}`, {
        ...plannedData,
        didNotAttend: (existingPlan as any).didNotAttend,
        didNotAttendReason: (existingPlan as any).didNotAttendReason,
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

  const sendToActualMutation = useMutation({
    mutationFn: async (budget: typeof calculatedBudgets[0]) => {
      return savePlannedAndSendToActual(budget, "Enviado do planejado");
    },
    onSuccess: (data, variables) => {
      setSentToActual(prev => { const s = new Set(Array.from(prev)); s.add(data.id); return s; });
      clearDraftEntries([data.id]);
      setConfirmSend(null);
      const wasEdited = !!(variables as any).hasOverride;
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
      const results: { id: string; result: any }[] = [];
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
      setSentToActual(prev => { const s = new Set(Array.from(prev)); data.forEach(d => s.add(d.id)); return s; });
      clearDraftEntries(data.map(d => d.id));
      setSelectedIds(new Set());
      setConfirmSend(null);
      toast({ title: "Planejamento enviado com sucesso!", description: `${data.length} ${data.length === 1 ? 'colaborador enviado' : 'colaboradores enviados'} para a prestação de contas.` });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
    },
    onError: (err) => {
      const sent = ((err as any)?.sent ?? []) as { id: string }[];
      const failedCount = ((err as any)?.failedCount ?? 0) as number;
      if (sent.length > 0) {
        // Sucessos parciais contam: marca como enviados e tira da seleção para
        // que uma nova tentativa reenvie apenas os que falharam.
        setSentToActual(prev => { const s = new Set(Array.from(prev)); sent.forEach(d => s.add(d.id)); return s; });
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
      const res = await apiRequest("POST", "/api/budget-planned/apply-defaults", {});
      const data = await res.json();
      const count = data.updated ?? 0;
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      toast({
        title: count > 0 ? `${count} planejamento${count !== 1 ? 's' : ''} atualizado${count !== 1 ? 's' : ''}` : "Nenhum planejamento pendente",
        description: count > 0
          ? "Valores padrão aplicados aos orçamentos ainda não enviados."
          : "Todos os orçamentos já foram enviados ou não há registros pendentes.",
      });
    } catch {
      toast({ title: "Erro ao aplicar valores", variant: "destructive" });
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
    const domainField = field === 'vdia' ? 'valorDia' : field === 'alim' ? 'alimentacao' : 'mobilidade';
    const prevOverrides = { ...budgetOverrides };
    // Linha enviada ou ausente NUNCA recebe override em lote
    const targets = filteredBudgets.filter(b =>
      !isCardNotAttended(b) && !sentToActual.has(b.inclusion.id)
    );
    targets.forEach(b => handleSheetEdit(b, domainField as any, rawValue));
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
    const domainField =
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
    targets.forEach(b => handleSheetEdit(b, domainField as any, value));
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
      "bg-indigo-500","bg-violet-500","bg-emerald-500","bg-amber-500",
      "bg-rose-500","bg-sky-500","bg-teal-500","bg-orange-500",
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyDefaults}
              disabled={isApplyingDefaults}
              title="Aplica os valores padrão configurados em Sistema a todos os orçamentos ainda não enviados"
              className="gap-1.5 text-xs font-semibold rounded-lg whitespace-nowrap hover:text-primary hover:border-primary"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isApplyingDefaults ? 'animate-spin' : ''}`} />
              {isApplyingDefaults ? 'Atualizando...' : 'Atualizar padrões'}
            </Button>
          )}
          {selectedEventId && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <EventSearchSelect value={selectedEventId} onValueChange={setSelectedEventId} events={eventsWithInclusions} />
              {selectedEvent?.startDate && (
                <span style={{ fontSize: 11, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calendar className="w-3 h-3" style={{ color: '#94A3B8' }} />
                  {formatEventDate(selectedEvent.startDate)}
                </span>
              )}
            </div>
          )}
        </>}
      />

      {/* ── Tela 1: Seleção de evento ── */}
      {!selectedEventId ? (
        <div className="rounded-2xl border border-blue-100 shadow-md">
          <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 rounded-2xl px-8 py-20 flex flex-col items-center justify-center text-center">
            {/* Ícone */}
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 flex items-center justify-center rotate-3">
                <Calculator className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-400 rounded-xl flex items-center justify-center shadow-md">
                <DollarSign className="w-4 h-4 text-white" />
              </div>
            </div>

            <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Selecione um evento</h2>
            <p className="text-sm text-gray-400 max-w-xs mx-auto leading-relaxed">
              Visualize o orçamento previsto com base nas escalações confirmadas. Valores calculados automaticamente.
            </p>

            <div className="max-w-sm w-full mx-auto mt-8">
              <EventSearchSelect value={selectedEventId} onValueChange={setSelectedEventId} events={eventsWithInclusions} />
            </div>
          </div>
        </div>
      ) : (
          <>
            {/* ── Dashboard Bar Superior ── */}
            <div style={{
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(0,51,204,0.12)',
              borderRadius: 20,
              boxShadow: '0 4px 24px rgba(0,51,204,0.07), 0 1px 4px rgba(0,0,0,0.04)',
              overflow: 'hidden',
            }}>
              {/* Faixa accent azul topo */}
              <div style={{height: 3, background: 'linear-gradient(90deg, var(--primary) 0%, var(--primary) 50%, #059669 100%)'}} />

              {/* flex-wrap: em telas <900px o hero e os stats quebram em linhas */}
              <div className="flex flex-wrap items-stretch">
                {/* Total Planejado — hero section */}
                <div className="px-7 py-5 flex flex-col justify-center gap-1 relative overflow-hidden grow max-[900px]:w-full" style={{
                  background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary) 50%, var(--primary-hover) 100%)',
                  minWidth: 230,
                }}>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/75 relative">Total Planejado</p>
                  {selectedEvent?.startDate && (
                    <p className="flex items-center gap-1 text-[10px] text-white/70 relative">
                      <Calendar className="w-2.5 h-2.5 shrink-0" />
                      {formatEventDate(selectedEvent.startDate)}
                    </p>
                  )}
                  <div className="text-[30px] font-semibold text-white leading-none tracking-tight mt-1.5 relative"
                    style={{letterSpacing: '-0.03em'}}>
                    {formatCurrency(totalGeral)}
                  </div>
                </div>

                {/* Separador vertical */}
                <div className="max-[900px]:hidden" style={{width: 1, background: 'rgba(0,51,204,0.1)'}} />

                {/* Stats */}
                <div className="flex-1 px-6 py-5 flex flex-wrap items-center gap-y-3 min-w-[280px]">
                  {/* Colaboradores */}
                  <div className="flex-1 min-w-[110px] flex flex-col items-center gap-1 px-4">
                    <div className="text-[26px] font-black leading-none tracking-tight" style={{color:'var(--primary)'}}>{stats.total}</div>
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      <Users className="w-3 h-3" />Colaboradores
                    </div>
                  </div>

                  <div className="max-[900px]:hidden" style={{width:1, height:36, background:'rgba(0,51,204,0.08)'}} />

                  {/* Casa */}
                  <div className="flex-1 min-w-[90px] flex flex-col items-center gap-1 px-4">
                    <div className="text-[26px] font-black leading-none tracking-tight" style={{color:'var(--primary)'}}>{stats.totalCasa}</div>
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      <Home className="w-3 h-3" />Casa
                    </div>
                  </div>

                  <div className="max-[900px]:hidden" style={{width:1, height:36, background:'rgba(0,51,204,0.08)'}} />

                  {/* Freela */}
                  <div className="flex-1 min-w-[90px] flex flex-col items-center gap-1 px-4">
                    <div className="text-[26px] font-black leading-none tracking-tight" style={{color:'#EA580C'}}>{stats.totalFreela}</div>
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      <UserCheck className="w-3 h-3" />Freela
                    </div>
                  </div>

                  <div className="max-[900px]:hidden" style={{width:1, height:36, background:'rgba(0,51,204,0.08)'}} />

                  {/* Período do evento */}
                  <div className="flex-1 min-w-[90px] flex flex-col items-center gap-1 px-4">
                    {selectedEvent?.startDate && selectedEvent?.endDate ? (
                      <div className="flex flex-col items-center gap-0">
                        <div className="text-[14px] font-black leading-none tracking-tight tabular-nums" style={{color:'#0D9488'}}>
                          {new Date(selectedEvent.startDate + 'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                        </div>
                        <div className="text-[10px] font-bold text-slate-300 leading-none my-0.5">→</div>
                        <div className="text-[14px] font-black leading-none tracking-tight tabular-nums" style={{color:'#0D9488'}}>
                          {new Date(selectedEvent.endDate + 'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[14px] font-black leading-none tracking-tight text-slate-300">—</div>
                    )}
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      <Calendar className="w-3 h-3" />Período
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
                <div className="bg-white rounded-2xl px-6 py-5" style={{border:'1px solid #E8EEFF', boxShadow:'0 2px 12px rgba(0,51,204,0.04)'}}>
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Etapa atual</span>
                      <div className="text-[13px] font-bold text-primary mt-0.5">{steps[currentStep].label}</div>
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
                            <div style={{position: 'relative', flexShrink: 0}}>
                              {/* Ping no step ativo */}
                              {isActive && (
                                <span className="stepper-ping" style={{
                                  position: 'absolute', inset: -4,
                                  borderRadius: '50%',
                                  border: '2px solid rgba(0,51,204,0.35)',
                                  animation: 'stepperPing 1.6s ease-out infinite',
                                }} />
                              )}
                              <div style={
                                isDone ? {
                                  width: 32, height: 32, borderRadius: '50%',
                                  background: 'linear-gradient(135deg, #059669, #34d399)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  boxShadow: '0 2px 8px rgba(5,150,105,0.30)',
                                } : isActive ? {
                                  width: 36, height: 36, borderRadius: '50%',
                                  background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  boxShadow: '0 0 0 4px rgba(0,51,204,0.10), 0 0 18px rgba(0,51,204,0.22)',
                                } : {
                                  width: 32, height: 32, borderRadius: '50%',
                                  background: '#F1F5F9',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }
                              }>
                                {isDone ? (
                                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <span style={{
                                    fontSize: 12, fontWeight: 800,
                                    color: isActive ? '#fff' : '#CBD5E1',
                                  }}>{i + 1}</span>
                                )}
                              </div>
                            </div>
                            {/* Labels */}
                            <div className="text-center">
                              <div style={{
                                fontSize: 11, fontWeight: 700, lineHeight: 1.2,
                                color: isDone ? '#059669' : isActive ? 'var(--primary)' : '#CBD5E1',
                              }}>{step.label}</div>
                              <div style={{fontSize: 10, color: '#94A3B8', marginTop: 2}}>{step.desc}</div>
                            </div>
                          </div>
                          {!isLast && (
                            <div style={{
                              flex: 1, height: 3, marginBottom: 28, marginLeft: 6, marginRight: 6,
                              borderRadius: 9999,
                              background: isDone
                                ? 'linear-gradient(90deg, #34d399, #059669)'
                                : '#F1F5F9',
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
                    <div className="rounded-2xl bg-white cursor-default" style={{borderTop:'3px solid #3B82F6', boxShadow:'0 1px 8px rgba(0,0,0,0.05)'}}>
                      <div className="px-5 py-4 pb-4">
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:'rgba(37,99,235,0.08)'}}>
                            <Home style={{width:13, height:13, color:'var(--primary)'}} />
                          </div>
                          <span style={{fontSize:10, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#94A3B8'}}>Casa</span>
                        </div>
                        <div style={{fontSize:17, fontWeight:500, color:'var(--primary)', letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums', lineHeight:1}}>
                          {formatCurrency(stats.valorCasa)}
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <span style={{fontSize:10, color:'#94A3B8', fontWeight:400}}>{stats.totalCasa} colaborador{stats.totalCasa !== 1 ? 'es' : ''}</span>
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
                    <div className="rounded-2xl bg-white cursor-default" style={{borderTop:'3px solid #F97316', boxShadow:'0 1px 8px rgba(0,0,0,0.05)'}}>
                      <div className="px-5 py-4 pb-4">
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:'rgba(234,88,12,0.08)'}}>
                            <UserCheck style={{width:13, height:13, color:'#EA580C'}} />
                          </div>
                          <span style={{fontSize:10, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#94A3B8'}}>Freela</span>
                        </div>
                        <div style={{fontSize:17, fontWeight:500, color:'#EA580C', letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums', lineHeight:1}}>
                          {formatCurrency(stats.valorFreela)}
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <span style={{fontSize:10, color:'#94A3B8', fontWeight:400}}>{stats.totalFreela} colaborador{stats.totalFreela !== 1 ? 'es' : ''}</span>
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
                    <div className="rounded-2xl bg-white cursor-default" style={{borderTop:'3px solid #7C3AED', boxShadow:'0 1px 8px rgba(0,0,0,0.05)'}}>
                      <div className="px-5 py-4 pb-4">
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:'rgba(124,58,237,0.08)'}}>
                            <Users style={{width:13, height:13, color:'#7C3AED'}} />
                          </div>
                          <span style={{fontSize:10, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#94A3B8'}}>Médio / Pessoa</span>
                        </div>
                        <div style={{fontSize:17, fontWeight:500, color:'#7C3AED', letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums', lineHeight:1}}>
                          {formatCurrency(stats.media)}
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <span style={{fontSize:10, color:'#94A3B8', fontWeight:400}}>por colaborador</span>
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
                    <div className="rounded-2xl bg-white cursor-default" style={{borderTop:'3px solid #0D9488', boxShadow:'0 1px 8px rgba(0,0,0,0.05)'}}>
                      <div className="px-5 py-4 pb-4">
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:'rgba(13,148,136,0.08)'}}>
                            <BarChart3 style={{width:13, height:13, color:'#0D9488'}} />
                          </div>
                          <span style={{fontSize:10, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#94A3B8'}}>Médio / Dia</span>
                        </div>
                        <div style={{fontSize:17, fontWeight:500, color:'#0D9488', letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums', lineHeight:1}}>
                          {formatCurrency(stats.mediaPorDia)}
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <span style={{fontSize:10, color:'#94A3B8', fontWeight:400}}>por dia trabalhado</span>
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
              <div role="status" className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px]"
                style={{background:'#FFFBEB', border:'1px solid #FDE68A', color:'#92400E'}}>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span>Rascunho de edições restaurado</span>
                <span style={{color:'#D6BB6C'}}>·</span>
                <button
                  onClick={() => { setBudgetOverrides({}); setDraftRestored(false); }}
                  className="font-semibold underline underline-offset-2 hover:text-amber-900 transition-colors"
                  aria-label="Descartar rascunho de edições restaurado"
                >
                  Descartar
                </button>
              </div>
            )}

            {/* ── Seletor de Abas ── */}
            <div className="flex items-center gap-1 border-b border-slate-100">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${activeTab === 'overview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Visão Geral
              </button>
              <button
                onClick={() => setActiveTab('sheet')}
                className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${activeTab === 'sheet' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
                <input
                  type="text"
                  placeholder="Buscar por nome..."
                  aria-label="Buscar colaborador por nome"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    height: 34, paddingLeft: 28, paddingRight: 12, width: 180,
                    background: '#F8FAFC', border: 'none',
                    borderBottom: `1.5px solid ${searchTerm ? 'var(--primary)' : '#E2E8F0'}`,
                    borderRadius: '6px 6px 0 0',
                    fontSize: 12, color: '#334155', outline: 'none',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--primary)')}
                  onBlur={e => (e.currentTarget.style.borderBottomColor = searchTerm ? 'var(--primary)' : '#E2E8F0')}
                />
              </div>

              <Select value={filterFunction} onValueChange={setFilterFunction}>
                <SelectTrigger className="w-auto min-w-[140px] h-[34px] text-xs shrink-0 bg-[#F8FAFC] border-0 border-b border-slate-200 rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0 focus:border-b-primary">
                  <SelectValue placeholder="Função" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl shadow-xl border border-slate-100 min-w-[180px] p-1.5" style={{backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', background:'rgba(255,255,255,0.96)'}}>
                  <SelectItem value="all" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Todas as funções</SelectItem>
                  {uniqueFunctions.map(f => (
                    <SelectItem key={f} value={f} className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-28 h-[34px] text-xs shrink-0 bg-[#F8FAFC] border-0 border-b border-slate-200 rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl shadow-xl border border-slate-100 min-w-[140px] p-1.5" style={{backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', background:'rgba(255,255,255,0.96)'}}>
                  <SelectItem value="all" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Todos</SelectItem>
                  <SelectItem value="casa" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Casa</SelectItem>
                  <SelectItem value="freela" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Freela</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-auto min-w-[120px] h-[34px] text-xs shrink-0 bg-[#F8FAFC] border-0 border-b border-slate-200 rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl shadow-xl border border-slate-100 min-w-[160px] p-1.5" style={{backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', background:'rgba(255,255,255,0.96)'}}>
                  <SelectItem value="name_asc" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Nome A-Z</SelectItem>
                  <SelectItem value="name_desc" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Nome Z-A</SelectItem>
                  <SelectItem value="days_desc" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Mais Dias</SelectItem>
                  <SelectItem value="days_asc" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Menos Dias</SelectItem>
                  <SelectItem value="function" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Por Função</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex-1" />
              <span style={{
                fontSize: 11, color: '#94A3B8', fontWeight: 600,
                background: '#F8FAFC', borderRadius: 8, padding: '4px 10px',
              }} aria-live="polite">
                {filteredBudgets.length} resultado{filteredBudgets.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* ── Cards de Colaboradores ── */}
            {isLoadingInclusions || isLoadingFunctionValues ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            ) : (isErrorInclusions || isErrorFunctionValues) ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200">
                <RefreshCw className="w-16 h-16 text-gray-200 mb-4" />
                <h3 className="text-base font-semibold text-gray-700">Erro ao carregar os dados</h3>
                <p className="text-sm text-gray-400 mt-1">Não foi possível buscar as escalações deste evento</p>
                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                  onClick={() => { if (isErrorInclusions) refetchInclusions(); if (isErrorFunctionValues) refetchFunctionValues(); }}
                >
                  <RefreshCw className="w-4 h-4" />
                  Tentar novamente
                </Button>
              </div>
            ) : filteredBudgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200">
                <Users className="w-16 h-16 text-gray-200 mb-4" />
                <h3 className="text-base font-semibold text-gray-700">
                  {calculatedBudgets.length === 0 ? 'Nenhuma escalação confirmada' : 'Nenhum resultado encontrado'}
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  {calculatedBudgets.length === 0 ? 'Apenas escalações confirmadas aparecem aqui' : 'Tente ajustar os filtros'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                {filteredBudgets.map((budget) => {
                  const isSent = sentToActual.has(budget.inclusion.id);
                  const isSelected = selectedIds.has(budget.inclusion.id);
                  const isCollapsed = collapsedCards.has(budget.inclusion.id);
                  const isCasa = budget.collaborator?.type === 'casa' || budget.collaborator?.type === 'local';
                  const name = getCollaboratorName(budget.inclusion.collaboratorId);
                  const initials = name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
                  const collabFuncKey = `${budget.inclusion.collaboratorId}|${budget.inclusion.functionId}`;
                  const planRecord = plannedByCollabFunc.get(collabFuncKey);
                  const isNotAttended = !!planRecord?.didNotAttend;
                  const cardActual = actualsByCollabFunc.get(collabFuncKey);
                  
                  return (
                    <div 
                      key={budget.inclusion.id}
                      data-card-id={budget.inclusion.id}
                      className={`rounded-2xl border transition-all duration-500 ease-in-out overflow-hidden flex flex-col group h-full ${
                        isNotAttended ? 'bg-slate-50 border-slate-200 shadow-sm' :
                        highlightCardId === budget.inclusion.id ? 'bg-white ring-2 ring-primary shadow-[0_8px_32px_rgba(0,51,204,0.14)]' :
                        isSelected ? 'bg-white ring-2 ring-emerald-400 border-emerald-200 shadow-md' : 
                        isSent ? 'bg-white border-indigo-200 opacity-85 shadow-sm' :
                        budget.hasOverride ? 'bg-white border-amber-200 shadow-sm' : 'bg-white border-slate-200 shadow-sm'
                      } ${!isNotAttended && !isSelected ? 'hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-100/60 hover:border-blue-200' : ''}`}
                    >
                      {/* stripe top */}
                      <div className={`h-[3px] ${isSelected ? 'bg-emerald-400' : isSent ? 'bg-blue-400' : isNotAttended ? 'bg-slate-300' : 'bg-primary'}`} />
                      {/* ── Header do card — estado INATIVO (Não Participou) ── */}
                      {isNotAttended ? (
                        <div className="px-4 py-3 bg-white">
                          {/* Linha superior: avatar + nome + botão restaurar */}
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-[8px] flex items-center justify-center text-slate-400 text-[12px] font-bold shrink-0 bg-slate-200">
                              {initials || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-slate-600 text-[14px] truncate block">{name}</span>
                              <span className="text-[11px] text-slate-400">{getFunctionName(budget.inclusion.functionId)}</span>
                            </div>
                            {canMarkNotAttended && planRecord && (
                              <button
                                className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shrink-0 disabled:opacity-60 shadow-sm shadow-blue-200"
                                onClick={() => setRestoreModal({
                                  id: planRecord.id, name,
                                  functionName: getFunctionName(budget.inclusion.functionId),
                                  startDate: budget.inclusion.scheduleStartDate ?? undefined,
                                  endDate: budget.inclusion.scheduleEndDate ?? undefined,
                                })}
                                disabled={toggleNotAttendedMutation.isPending}
                              >
                                <Undo2 style={{width:14, height:14}} />
                                Restaurar
                              </button>
                            )}
                          </div>

                          {/* Linha inferior: data + badge motivo */}
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {/* Data do período */}
                            {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                                style={{background:'#F1F5F9', fontSize:10, fontWeight:400, color:'#64748B'}}>
                                <Calendar style={{width:10, height:10, color:'#94A3B8', flexShrink:0}} />
                                {new Date(budget.inclusion.scheduleStartDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                                <span style={{color:'#CBD5E1'}}>–</span>
                                {new Date(budget.inclusion.scheduleEndDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                              </span>
                            )}
                            {/* Badge ausência */}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium"
                              style={{background:'#FEF9C3', color:'#92400E', border:'1px solid #FDE68A'}}>
                              <UserX style={{width:10, height:10}} />
                              Não participou
                            </span>
                            {/* Motivo */}
                            {planRecord?.didNotAttendReason && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium"
                                style={{background:'#FFFBEB', color:'#B45309', border:'1px solid #FDE68A'}}>
                                "{planRecord.didNotAttendReason}"
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                      /* ── Header do card — estado ATIVO ── */
                      <div className={`flex items-center justify-between px-4 py-3 ${
                        isSent ? 'bg-indigo-50/40' : 'bg-slate-50/60'
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
                                  <Lock className="w-4 h-4 text-indigo-400 shrink-0 cursor-default" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="text-xs">
                                  Aguardando prestação de contas
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}

                          {/* Avatar */}
                          <div className={`w-9 h-9 rounded-[8px] flex items-center justify-center text-white text-[12px] font-bold shrink-0 ${avatarColor(name)}`}>
                            {initials || '?'}
                          </div>

                          <div className="min-w-0 flex-1 flex flex-col gap-y-1">
                            {/* Linha 1: nome + dot */}
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-slate-800 text-[14px] truncate">{name}</span>
                              {budget.hasOverride && (
                                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Valores personalizados" />
                              )}
                              {cardActual?.rhAdjusted && (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-[12px] shrink-0 cursor-default" style={{color:'#D97706'}}>✏</span>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="text-xs">RH ajustou o realizado deste colaborador</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            {/* Linha 2: badge de data */}
                            {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && (
                              <span className="inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded-md"
                                style={{background:'#F1F5F9', fontSize:10, fontWeight:400, color:'#64748B', letterSpacing:'0.01em'}}>
                                <Calendar style={{width:10, height:10, color:'#94A3B8', flexShrink:0}} />
                                {new Date(budget.inclusion.scheduleStartDate + 'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                                <span style={{color:'#CBD5E1'}}>–</span>
                                {new Date(budget.inclusion.scheduleEndDate + 'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                              </span>
                            )}
                            {/* Linha 3: badges de função/tipo */}
                            <div className="flex items-center gap-1 overflow-hidden flex-wrap">
                              <span className="text-[10px] font-semibold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full truncate shrink min-w-0">{getFunctionName(budget.inclusion.functionId)}</span>
                              {isAtendimentoFunction(getFunctionName(budget.inclusion.functionId)) && (
                                (budget.inclusion as any).atendimentoTipo ? (
                                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full shrink-0" title="Tipo de atendimento — troque no modal de edição">
                                    {(budget.inclusion as any).atendimentoTipo === 'key_account' ? 'Key Account' : 'Exec. Contas'}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0" title="Defina Key Account ou Executivo de Contas no modal de edição">
                                    definir tipo
                                  </span>
                                )
                              )}
                              {budget.isPercurso && (
                                budget.percurseiroTipo ? (
                                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full shrink-0" title="Tipo do percurseiro (pacote fechado) — troque no modal de edição">
                                    {PERCURSEIRO_TIPOS.find(t => t.value === budget.percurseiroTipo)?.label}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0" title="Defina Tipo 1 ou Tipo 2 no modal de edição — Tipo 1 usado provisoriamente">
                                    definir tipo
                                  </span>
                                )
                              )}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${isCasa ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{isCasa ? 'Casa' : 'Freela'}</span>
                              {isSent && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"
                                  style={{background:'#EFF6FF', color:'var(--primary)', border:'1px solid #BFDBFE'}}>
                                  <CheckCheck style={{width:10,height:10}} />
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
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg"
                                    onClick={() => setNotAttendedModal({
                                      id: planRecord?.id,
                                      budget: planRecord ? undefined : budget,
                                      name,
                                      functionName: getFunctionName(budget.inclusion.functionId)
                                    })}>
                                    <UserX className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">Marcar como não participou</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          {canEdit && !isSent && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg" title="Editar valores" aria-label={`Editar valores de ${name}`} onClick={() => openEditModal(budget)}>
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {isSent && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" onClick={() => openEditModal(budget, true)}>
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">Visualizar detalhes e observações</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {!isSent && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              title="Enviar para o Realizado"
                              aria-label={`Enviar ${name} para o Realizado`}
                              onClick={() => setConfirmSend({ ids: [budget.inclusion.id], source: 'single' })}
                            >
                              <Send className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-gray-400 hover:text-gray-600 rounded-lg"
                            title={isCollapsed ? "Expandir" : "Recolher"}
                            aria-label={isCollapsed ? `Expandir card de ${name}` : `Recolher card de ${name}`}
                            onClick={() => toggleCollapse(budget.inclusion.id)}
                          >
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
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
                            <div className="rounded-xl flex items-stretch" style={{background:'#EEF2FF', minHeight: 50}}>
                              {/* Esquerda: ícone + label + total */}
                              <div className="flex items-center px-3 py-2.5 shrink-0" style={{minWidth: 112}}>
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="w-2.5 h-2.5 shrink-0" style={{color:'var(--primary)'}} />
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{color:'var(--primary)'}}>Diárias</span>
                                  </div>
                                  <span className="tabular-nums font-medium text-[14px] leading-none" style={{color:'#1E293B', letterSpacing:'-0.01em', textDecoration: isNotAttended ? 'line-through' : 'none'}}>{formatCurrency(budget.subtotalDiarias)}</span>
                                </div>
                              </div>
                              {/* Separador */}
                              <div style={{width: 1, background: 'rgba(0,51,204,0.07)', margin: '9px 0'}} />
                              {/* Direita: detalhes */}
                              <div className="flex-1 flex flex-col justify-center gap-1 px-3 py-2.5">
                                {/* Percurso: pacote fechado × diárias fixas (viagem 2 / local 1) */}
                                {budget.isPercurso && (
                                  <>
                                    <div className="flex items-center justify-between gap-x-2">
                                      <span className="text-[11px] leading-tight font-normal flex-1" style={{color:'#94A3B8'}}>
                                        {budget.diasComDiaria} {budget.diasComDiaria === 1 ? 'diária' : 'diárias'} ({budget.inclusion.needsTicket ? 'percurso em viagem — regra fixa' : 'percurso local'})
                                      </span>
                                      <span className="font-normal tabular-nums text-[11px] leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.valorDiaria)}</span>
                                    </div>
                                    {budget.percurseiro && (
                                      <span className="text-[10px] leading-tight text-slate-400 tabular-nums"
                                        title="Composição do pacote por diária: motoqueiro + fee Ivan + alimentação (3 refeições) + ajuda transporte + NF">
                                        {formatCurrency(budget.percurseiro.motoqueiro)} + fee {formatCurrency(budget.percurseiro.fee)} + alim. {formatCurrency(budget.percurseiro.alimentacao)} + transp. {formatCurrency(budget.percurseiro.transporte)} + NF {formatCurrency(budget.percurseiro.nf)}
                                      </span>
                                    )}
                                  </>
                                )}
                                {!budget.isPercurso && budget.regraDiaria === 'nenhuma' && (budget.weekdays > 0 || budget.weekends > 0) && (
                                  <span className="font-normal text-[11px] leading-tight text-slate-400"
                                    title="Cenotécnica da casa (CLT): não recebe diária (nem em fim de semana)">
                                    sem diária (cenotécnica CLT)
                                  </span>
                                )}
                                {!budget.isPercurso && budget.regraDiaria !== 'nenhuma' && budget.weekdays > 0 && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-[11px] leading-tight font-normal flex-1" style={{color:'#94A3B8', minWidth:'fit-content'}}>{formatDiasUteis(budget.weekdays)}</span>
                                    {budget.regraDiaria === 'fds' ? (
                                      <span className="font-normal text-[11px] leading-tight shrink-0 text-slate-400"
                                        title="Colaborador da casa (CLT): em dia útil já é assalariado — diária só nos fins de semana">
                                        sem diária (CLT)
                                      </span>
                                    ) : (
                                      <span className="font-normal tabular-nums text-[11px] leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.valorDiariaUtil)}</span>
                                    )}
                                  </div>
                                )}
                                {!budget.isPercurso && budget.regraDiaria !== 'nenhuma' && budget.weekends > 0 && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-[11px] leading-tight font-normal flex-1" style={{color:'#94A3B8', minWidth:'fit-content'}}>{formatFds(budget.weekends)}</span>
                                    <span className="font-normal tabular-nums text-[11px] leading-tight shrink-0 tracking-wide" style={{color:'#6d28d9'}}>{formatCurrency(budget.valorDiariaFds)}</span>
                                  </div>
                                )}
                                {!budget.isPercurso && budget.weekdays === 0 && budget.weekends === 0 && (
                                  <span className="text-[11px] font-normal" style={{color:'#CBD5E1'}}>—</span>
                                )}
                                {/* Memória da deflação por período (>4 dias) */}
                                {budget.deflationSegments.length > 1 && (
                                  <span className="text-[10px] leading-tight font-normal tabular-nums" style={{color:'var(--primary)'}}
                                    title="Deflação por período: 100% até o 4º dia; fatores reduzidos nas faixas seguintes">
                                    {formatSegmentsMemo(budget.deflationSegments)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* ── Alimentação ── */}
                            <div className="rounded-xl flex items-stretch" style={{background:'#FFF7ED', minHeight: 50}}>
                              <div className="flex items-center px-3 py-2.5 shrink-0" style={{minWidth: 112}}>
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <Utensils className="w-2.5 h-2.5 shrink-0" style={{color:'#EA580C'}} />
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{color:'#EA580C'}}>Alimentação</span>
                                    {budget.alimEstimada && (
                                      <span className="inline-flex items-center px-1 py-px rounded-full text-[10px] font-semibold shrink-0"
                                        style={{background:'#FEF3C7', color:'#B45309'}}
                                        title="Sem horários da passagem registrada — refeições estimadas até a compra">
                                        estimado
                                      </span>
                                    )}
                                  </div>
                                  <span className="tabular-nums font-medium text-[14px] leading-none" style={{color:'#1E293B', letterSpacing:'-0.01em', textDecoration: isNotAttended ? 'line-through' : 'none'}}>{formatCurrency(budget.almocoSemana + budget.jantarSemana + budget.almocoFds + budget.jantarFds)}</span>
                                </div>
                              </div>
                              <div style={{width: 1, background: 'rgba(234,88,12,0.08)', margin: '9px 0'}} />
                              <div className="flex-1 flex flex-col justify-center gap-1 px-3 py-2.5">
                                {(budget.almocoSemana > 0 || budget.jantarSemana > 0) && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-[11px] leading-tight font-normal flex-1" style={{color:'#94A3B8', minWidth:'fit-content'}}>Semana</span>
                                    <span className="font-normal tabular-nums text-[11px] leading-tight shrink-0 tracking-wide" style={{color:'#C2410C'}}>{formatCurrency(budget.almocoSemana + budget.jantarSemana)}</span>
                                  </div>
                                )}
                                {(budget.almocoFds > 0 || budget.jantarFds > 0) && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-[11px] leading-tight font-normal flex-1" style={{color:'#94A3B8', minWidth:'fit-content'}}>Fim de semana</span>
                                    <span className="font-normal tabular-nums text-[11px] leading-tight shrink-0 tracking-wide" style={{color:'#C2410C'}}>{formatCurrency(budget.almocoFds + budget.jantarFds)}</span>
                                  </div>
                                )}
                                {budget.almocoSemana === 0 && budget.jantarSemana === 0 && budget.almocoFds === 0 && budget.jantarFds === 0 && (
                                  budget.isPercurso
                                    ? <span className="text-[11px] font-normal text-slate-400" title="Alimentação (3 refeições) já está dentro do pacote do percurseiro">incluída no pacote</span>
                                    : <span className="text-[11px] font-normal" style={{color:'#CBD5E1'}}>—</span>
                                )}
                              </div>
                            </div>

                            {/* ── Mobilidade ── */}
                            <div className="rounded-xl flex items-stretch" style={{background:'#F5F3FF', minHeight: 50}}>
                              <div className="flex items-center px-3 py-2.5 shrink-0" style={{minWidth: 112}}>
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <Car className="w-2.5 h-2.5 shrink-0" style={{color:'#6d28d9'}} />
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{color:'#6d28d9'}}>Mobilidade</span>
                                  </div>
                                  <span className="tabular-nums font-medium text-[14px] leading-none" style={{color:'#1E293B', letterSpacing:'-0.01em', textDecoration: isNotAttended ? 'line-through' : 'none'}}>{formatCurrency(budget.mobilidade)}</span>
                                </div>
                              </div>
                              <div style={{width: 1, background: 'rgba(109,40,217,0.08)', margin: '9px 0'}} />
                              <div className="flex-1 flex flex-col justify-center gap-1 px-3 py-2.5">
                                {budget.mobilidadeIda > 0 && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-[11px] leading-tight font-normal flex-1" style={{color:'#94A3B8', minWidth:'fit-content'}}>Ida</span>
                                    <span className="font-normal tabular-nums text-[11px] leading-tight shrink-0 tracking-wide" style={{color:'#6d28d9'}}>{formatCurrency(budget.mobilidadeIda)}</span>
                                  </div>
                                )}
                                {budget.mobilidadeVolta > 0 && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-[11px] leading-tight font-normal flex-1" style={{color:'#94A3B8', minWidth:'fit-content'}}>Volta</span>
                                    <span className="font-normal tabular-nums text-[11px] leading-tight shrink-0 tracking-wide" style={{color:'#6d28d9'}}>{formatCurrency(budget.mobilidadeVolta)}</span>
                                  </div>
                                )}
                                {budget.mobilidadeIda === 0 && budget.mobilidadeVolta === 0 && (
                                  budget.isPercurso
                                    ? <span className="text-[11px] font-normal text-slate-400" title="Ajuda de custo transporte já está dentro do pacote do percurseiro">incluída no pacote</span>
                                    : <span className="text-[11px] font-normal" style={{color:'#CBD5E1'}}>—</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── Rodapé Total ── */}
                      <div
                        className={`transition-all duration-500${isNotAttended ? ' opacity-30 grayscale' : ''}`}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 16px',
                          background: isNotAttended ? '#F8FAFC' : '#F5F7FF',
                          borderTop: isNotAttended ? '1px solid #E2E8F0' : '1px solid rgba(224,231,255,0.8)',
                          marginTop: 'auto',
                        }}>
                        <span style={{fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: isNotAttended ? '#94A3B8' : 'var(--primary)'}}>
                          {isNotAttended ? 'Não contabilizado' : 'Total Planejado'}
                        </span>
                        <span style={{
                          fontSize: 16, fontWeight: 500, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
                          color: isNotAttended ? '#94A3B8' : 'var(--primary)',
                          textDecoration: isNotAttended ? 'line-through' : 'none',
                        }}>
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
            )}
            </>) : (
            <>
              {/* ── Planilha de Edição ── */}
              {/* Toolbar */}
              <div className="flex items-center justify-between px-1 py-1">
                <span className="text-[11px] text-slate-400 font-medium" aria-live="polite">{filteredBudgets.length} colaborador{filteredBudgets.length !== 1 ? 'es' : ''}</span>
                {confirmReset ? (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-500">Isso limpa os ajustes manuais de todos os visíveis (filtro atual). Confirmar?</span>
                    <button
                      onClick={() => {
                        setBudgetOverrides(prev => {
                          const updated = { ...prev };
                          filteredBudgets.forEach(b => { delete updated[b.inclusion.id]; });
                          return updated;
                        });
                        setConfirmReset(false);
                      }}
                      className="px-2.5 py-1 rounded-md bg-primary text-white font-semibold text-[11px] hover:bg-primary-hover transition-colors"
                    >
                      Sim, aplicar
                    </button>
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="px-2.5 py-1 rounded-md border border-slate-200 text-slate-500 font-medium text-[11px] hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAdvancedBatch({ target: 'all', field: 'vdia', value: '' })}
                      className="text-[11px] px-3 py-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 transition-colors flex items-center gap-1.5 font-medium"
                    >
                      ✏ Edição em Lote
                    </button>
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setConfirmReset(true)}
                            className="text-[11px] px-3 py-1.5 rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors flex items-center gap-1.5 font-medium"
                          >
                            <RotateCcw className="w-3 h-3" />
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

              {/* Advanced Batch Modal */}
              {advancedBatch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'rgba(0,0,0,0.35)'}}>
                  <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-[420px] max-w-[95vw]">
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-[15px] font-bold text-slate-800">Edição em Lote</span>
                      <button onClick={() => setAdvancedBatch(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                    {/* Target */}
                    <div className="mb-4">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Quem será afetado</div>
                      <div className="grid grid-cols-2 gap-2">
                        {(['all','casa','freela','selected'] as const).map(t => (
                          <button key={t} onClick={() => setAdvancedBatch(p => p ? {...p, target: t} : p)}
                            className={`text-[12px] px-3 py-2 rounded-lg border font-medium transition-colors ${advancedBatch.target === t ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            {t === 'all' ? 'Todos' : t === 'casa' ? 'Somente CASA' : t === 'freela' ? 'Somente FREELA' : `Selecionados (${selectedIds.size})`}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Field */}
                    <div className="mb-4">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">O que alterar</div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          ['vdia','Diária (R$/dia)','var(--primary)'],
                          ['alimUtil','Alimentação Útil','var(--primary)'],
                          ['alimFds','Alimentação FDS','#F97316'],
                          ['mob','Mobilidade','#6D28D9'],
                        ] as const).map(([f, label, color]) => (
                          <button key={f} onClick={() => setAdvancedBatch(p => p ? {...p, field: f} : p)}
                            className={`text-[12px] px-3 py-2 rounded-lg border font-medium transition-colors text-left ${advancedBatch.field === f ? 'border-current' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            style={advancedBatch.field === f ? {borderColor: color, background:'#F8FAFC', color} : {}}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Value */}
                    <div className="mb-5">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        {advancedBatch.field === 'mob' ? 'Novo valor (R$ total Ida+Volta)' : 'Novo valor (R$/dia)'}
                      </div>
                      <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 focus-within:border-primary focus-within:shadow-[0_0_0_2px_rgba(0,51,204,0.1)]">
                        <span className="text-slate-400 text-sm font-medium">R$</span>
                        <input
                          type="text" inputMode="decimal" placeholder="0,00"
                          value={advancedBatch.value}
                          onChange={e => setAdvancedBatch(p => p ? {...p, value: e.target.value} : p)}
                          onKeyDown={e => { if (e.key === 'Enter') applyAdvancedBatch(); }}
                          autoFocus
                          className="flex-1 text-right text-[14px] font-mono font-semibold outline-none bg-transparent text-slate-800"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setAdvancedBatch(null)} className="flex-1 h-10 text-[13px] border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 font-medium transition-colors">Cancelar</button>
                      <button onClick={applyAdvancedBatch}
                        className="flex-1 h-10 text-[13px] rounded-xl text-white font-bold transition-colors"
                        style={{background:'var(--primary)'}}>
                        Aplicar Ajuste
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabela */}
              {(() => {
                const colSpanTotal = 7;

                return (
                <div ref={batchPopoverRef} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200">
                          {/* Checkbox select-all */}
                          <th className="w-10 px-3 py-2.5 bg-slate-50/80">
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
                          <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] min-w-[260px] bg-slate-50/80" style={{color:'#888'}}>Colaborador · Função · Período</th>

                          {/* Diárias (qty) — read-only */}
                          <th className="text-center px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] w-20" style={{background:'#F1F5F9', color:'#94A3B8'}}>
                            <div className="flex items-center justify-center gap-1">
                              <Lock style={{width:10, height:10, color:'#CBD5E1', flexShrink:0}} />
                              <span>Dias</span>
                            </div>
                          </th>

                          {/* Diária R$/dia — batch edit */}
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] w-36 relative" style={{background:'#F8FAFC', color:'#374151'}}>
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-[11px] font-semibold text-slate-600">Diária R$/dia</span>
                              <button
                                onClick={e => { batchTriggerRef.current = e.currentTarget; setBatchPopover(batchPopover?.field === 'vdia' ? null : { field: 'vdia', value: '' }); }}
                                className={`text-[10px] p-1.5 -m-1 rounded transition-colors cursor-pointer ${batchApplied.has('vdia') ? 'text-primary' : 'text-slate-300 hover:text-slate-500'}`}
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
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] w-36 relative" style={{background:'#F8FAFC', color:'#374151'}}>
                            <div className="flex items-center justify-end gap-1">
                              <div className="flex flex-col items-end leading-tight gap-0.5">
                                <span className="text-[11px] font-semibold text-slate-600">Alim. R$/dia</span>
                                <div className="flex items-center gap-2 text-[10px] font-medium" style={{color:'#94A3B8'}}>
                                  <span><span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5" style={{background:'var(--primary)', verticalAlign:'middle'}} />Útil</span>
                                  <span><span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5" style={{background:'#F97316', verticalAlign:'middle'}} />FDS</span>
                                </div>
                              </div>
                              <button
                                onClick={e => { batchTriggerRef.current = e.currentTarget; setBatchPopover(batchPopover?.field === 'alim' ? null : { field: 'alim', value: '' }); }}
                                className={`text-[10px] p-1.5 -m-1 rounded transition-colors cursor-pointer ${batchApplied.has('alim') ? 'text-primary' : 'text-slate-300 hover:text-slate-500'}`}
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
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] w-28 relative" style={{background:'#F8FAFC', color:'#374151'}}>
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-slate-600">Mob. R$ total</span>
                                <button
                                  onClick={e => { batchTriggerRef.current = e.currentTarget; setBatchPopover(batchPopover?.field === 'mob' ? null : { field: 'mob', value: '' }); }}
                                  className={`text-[10px] p-1.5 -m-1 rounded transition-colors cursor-pointer ${batchApplied.has('mob') ? 'text-primary' : 'text-slate-300 hover:text-slate-500'}`}
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
                          <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] w-28 bg-blue-50/60 text-primary">Subtotal</th>
                        </tr>

                        {/* Banner de edição em lote */}
                        {batchApplied.size > 0 && (
                          <tr>
                            <td colSpan={colSpanTotal} style={{background:'#EEF2FF', padding:'4px 16px'}}>
                              <div className="flex items-center gap-2 text-[11px]" style={{color:'var(--primary)'}}>
                                <span>✏ {Array.from(batchApplied).map(f => f === 'vdia' ? 'R$/dia' : f === 'alim' ? 'Alimentação' : 'Mobilidade').join(' e ')} editado{batchApplied.size > 1 ? 's' : ''} em lote</span>
                                {batchHistory && (
                                  <>
                                    <span style={{color:'#a5b4fc'}}>·</span>
                                    <button onClick={undoBatch} className="cursor-pointer font-semibold px-2 py-0.5 rounded text-[10px] transition-colors hover:opacity-80" style={{background:'var(--primary)', color:'#fff'}}>Desfazer</button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredBudgets.length === 0 ? (
                          <tr>
                            <td colSpan={colSpanTotal} className="px-4 py-12 text-center text-sm text-slate-400">Nenhum colaborador encontrado</td>
                          </tr>
                        ) : filteredBudgets.map((budget, rowIdx) => {
                          const sid = budget.inclusion.id;
                          const prevBudgetCollab = rowIdx > 0 ? filteredBudgets[rowIdx - 1].inclusion.collaboratorId : null;
                          const isNewCollab = prevBudgetCollab !== budget.inclusion.collaboratorId;
                          return (
                            <SheetRow
                              key={sid}
                              budget={budget}
                              name={getCollaboratorName(budget.inclusion.collaboratorId)}
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
                      </tbody>
                      {filteredBudgets.length > 0 && (() => {
                        const totalDiariasCols = filteredBudgets.reduce((s, b) => s + b.subtotalDiarias, 0);
                        const totalAlimCols = filteredBudgets.reduce((s, b) => s + b.almocoSemana + b.jantarSemana + b.almocoFds + b.jantarFds, 0);
                        const totalMobCols = filteredBudgets.reduce((s, b) => s + b.mobilidade, 0);
                        return (
                          <tfoot>
                            <tr style={{background:'#F0F4FF', borderTop:'2px solid var(--primary)'}}>
                              <td style={{width:40}} />
                              <td className="px-4 py-2.5">
                                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{color:'#888'}}>
                                  TOTAL ({filteredBudgets.length})
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-[12px] font-mono font-semibold text-slate-500 tabular-nums">
                                  {filteredBudgets.reduce((s, b) => s + b.weekdays + b.weekends, 0)} dias
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-[12px] font-mono font-semibold text-slate-500 tabular-nums">
                                  {formatCurrency(totalDiariasCols)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-[12px] font-mono font-semibold text-slate-500 tabular-nums">
                                  {formatCurrency(totalAlimCols)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-[12px] font-mono font-semibold text-slate-500 tabular-nums">
                                  {formatCurrency(totalMobCols)}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className="text-[15px] font-extrabold font-mono tabular-nums" style={{color:'var(--primary)'}}>{formatCurrency(totalGeral)}</span>
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
                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      {hasPending && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border" style={{background:'#FEF3C7', color:'#D97706', borderColor:'#FDE68A'}}>
                          ⏱ {pendingSheet.length} {pendingSheet.length === 1 ? 'pendente' : 'pendentes'}
                        </span>
                      )}
                      {hasEdits && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
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
                            className="text-[12px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-3 py-2 rounded-lg transition-colors"
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
                          className={`h-10 flex items-center gap-2 text-[13px] font-semibold text-white px-5 rounded-lg shadow-md transition-all
                            ${hasPending
                              ? `bg-[#059669] hover:bg-[#047857] ${hasEdits ? 'shadow-emerald-200 ring-2 ring-emerald-400 ring-offset-1' : 'shadow-emerald-100'}`
                              : 'bg-slate-300 cursor-not-allowed opacity-50 shadow-none'}
                          `}
                        >
                          <Send className="w-4 h-4" />
                          Enviar Planejamento
                          {hasPending && (
                            <span className="ml-1 w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[11px] font-bold leading-none">
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
      <Dialog open={!!editingBudget} onOpenChange={() => { setEditingBudget(null); setEditingBudgetInfo(null); setEditingBudgetPlannedId(null); setModalViewMode(false); setModalBufs({}); }}>
        <DialogContent className="max-w-[680px] w-[95vw] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl" style={{display:'flex', flexDirection:'column', maxHeight:'90vh'}}>
          <DialogHeader className="sr-only">
            <DialogTitle>Editar Orçamento Planejado</DialogTitle>
          </DialogHeader>
          
          {editingBudget && editingBudgetInfo && (() => {
            const noWeekdays = editingBudgetInfo.weekdays === 0;
            const noWeekends = editingBudgetInfo.weekends === 0;
            // Dias que recebem diária (casa: só fds) — mesma regra do motor
            const diasDiariaModal = editingBudgetInfo.diasComDiaria;
            // Mesma conta do card: diária plana COM deflação por período
            const deflatedModal = editingBudgetInfo.isPercurso
              ? { totalCents: editingBudget.valorDiaria * diasDiariaModal, segments: [] as DeflationSegment[] } // pacote fechado: sem deflação
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
            const hasChanges = !!originalModalValues && (Object.keys(editingBudget) as (keyof BudgetEdit)[])
              .some(k => editingBudget[k] !== originalModalValues![k]);
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

            const inputCls = "h-9 text-sm w-[88px] text-right font-semibold border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-lg bg-white";
            // Buffer de digitação por campo: preserva o texto enquanto o usuário
            // digita ("540,50" funciona) e normaliza no blur.
            const mBuf = (key: string, fallback: number) => modalBufs[key] ?? String(fallback / 100);
            const mSet = (key: string, raw: string) => setModalBufs(p => ({ ...p, [key]: raw }));
            const mClear = (key: string) => () => setModalBufs(p => { const n = { ...p }; delete n[key]; return n; });
            const toCents = (raw: string) => Math.round(parseBrNumber(raw) * 100) || 0;

            return (
            <>
              {/* ── Header ── */}
              <div className="px-5 py-3.5 relative shrink-0" style={{background:'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)'}}>
                <div className="flex items-center gap-3">
                  {/* Avatar 40px */}
                  <div className="w-10 h-10 rounded-[10px] flex items-center justify-center font-black text-[15px] shrink-0" style={{background:'rgba(255,255,255,0.15)', color:'#fff', border:'1.5px solid rgba(255,255,255,0.25)'}}>
                    {modalInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[16px] font-bold text-white leading-tight truncate">{editingBudgetInfo.name}</h2>
                    <p className="text-[12px] text-white/70">{editingBudgetInfo.functionName}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="inline-flex items-center h-[22px] text-[11px] font-bold px-2 rounded-md" style={{background:'rgba(255,255,255,0.15)', color:'#fff'}}>
                        {editingBudgetInfo.type}
                      </span>
                      <span className="inline-flex items-center gap-1 h-[22px] text-[11px] text-white/70">
                        <Calendar className="w-3 h-3" />
                        {editingBudgetInfo.period}
                      </span>
                      <span className="inline-flex items-center gap-1 h-[22px] text-[11px] px-2 rounded-md" style={{background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.85)'}}>
                        <Briefcase className="w-3 h-3" />
                        {editingBudgetInfo.weekdays}d úteis
                        {editingBudgetInfo.regraDiaria === 'fds' && <span className="opacity-70">· sem diária (CLT)</span>}
                        {editingBudgetInfo.regraDiaria === 'nenhuma' && <span className="opacity-70">· sem diária (ceno CLT)</span>}
                      </span>
                      <span className="inline-flex items-center gap-1 h-[22px] text-[11px] px-2 rounded-md" style={{background:'rgba(255,200,0,0.2)', color:'rgba(255,220,80,1)'}}>
                        <Sun className="w-3 h-3" />
                        {editingBudgetInfo.weekends} fds
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Banner modo visualização ── */}
              {modalViewMode && (
                <div className="flex items-center gap-2.5 px-5 py-2.5 bg-amber-50 border-b border-amber-200 shrink-0">
                  <Eye className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <p className="text-[11px] font-semibold text-amber-700">
                    Modo de Visualização — Edição de valores bloqueada para esta fase
                  </p>
                </div>
              )}

              {/* ── Barra de Abas ── */}
              <div className="flex border-b border-slate-200 bg-white shrink-0">
                {([
                  { id: 'custos',      label: 'Custos' },
                  { id: 'observacoes', label: 'Observações' },
                  { id: 'historico',   label: 'Histórico' },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setModalTab(id)}
                    className={[
                      'flex-1 h-10 text-[13px] font-medium transition-colors',
                      modalTab === id
                        ? 'text-primary border-b-2 border-primary bg-blue-50/40'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Corpo (aba Custos) ── */}
              {modalTab === 'custos' && (
              <div className="flex-1 overflow-y-auto min-h-0" style={{background:'#F8FAFC'}}>
              <div className="px-4 py-3 space-y-2.5" style={modalViewMode ? {opacity:0.72, userSelect:'none'} : {}}>

                {/* ── BLOCO: Diárias ── */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-3.5 py-2 bg-blue-50 border-b border-blue-100">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-md bg-primary flex items-center justify-center">
                        <Calendar className="w-2.5 h-2.5 text-white" />
                      </div>
                      <span className="text-[11px] font-bold text-primary uppercase tracking-wider">Diárias</span>
                    </div>
                    <span className="text-[13px] font-bold text-primary">{formatCurrency(totalDiarias)}</span>
                  </div>

                  {/* Atendimento: escolha da tarifa (Key Account × Exec. de Contas).
                      Necessário aqui porque escalações antigas viraram Planejado
                      antes do flag existir. */}
                  {editingBudgetInfo.isAtend && (
                    <div className="flex items-center gap-2 flex-wrap px-3.5 py-2 bg-blue-50/40 border-b border-blue-100">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tipo de atendimento</span>
                      <div className="flex rounded-lg border border-blue-200 overflow-hidden">
                        {ATENDIMENTO_TIPOS.map(op => {
                          const ativo = editingBudgetInfo.atendimentoTipo === op.value;
                          const valor = atendimentoDailyCents(op.value, systemSettings as any);
                          return (
                            <button
                              key={op.value}
                              type="button"
                              disabled={setAtendimentoTipoMutation.isPending}
                              onClick={() => {
                                if (!ativo && editingBudgetInfo.inclusionId) {
                                  setAtendimentoTipoMutation.mutate({ inclusionId: editingBudgetInfo.inclusionId, tipo: op.value });
                                }
                              }}
                              className={`px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                                ativo ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-blue-50'
                              }`}
                            >
                              {op.label}{valor != null ? ` · ${formatCurrency(valor)}` : ''}
                            </button>
                          );
                        })}
                      </div>
                      {!editingBudgetInfo.atendimentoTipo && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">definir o tipo</span>
                      )}
                    </div>
                  )}

                  {/* Percurso (motoqueiro): pacote fechado Tipo 1 × Tipo 2 */}
                  {editingBudgetInfo.isPercurso && (
                    <div className="flex items-center gap-2 flex-wrap px-3.5 py-2 bg-blue-50/40 border-b border-blue-100">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tipo do percurseiro</span>
                      <div className="flex rounded-lg border border-blue-200 overflow-hidden">
                        {PERCURSEIRO_TIPOS.map(op => {
                          const ativo = editingBudgetInfo.percurseiroTipo === op.value;
                          const valor = percurseiroDiariaCents(op.value, systemSettings as any)?.total;
                          return (
                            <button
                              key={op.value}
                              type="button"
                              disabled={setPercurseiroTipoMutation.isPending || modalViewMode}
                              aria-pressed={ativo}
                              onClick={() => {
                                if (!ativo && editingBudgetInfo.inclusionId) {
                                  setPercurseiroTipoMutation.mutate({ inclusionId: editingBudgetInfo.inclusionId, tipo: op.value });
                                }
                              }}
                              className={`px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                                ativo ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-blue-50'
                              }`}
                            >
                              {op.label}{valor != null ? ` · ${formatCurrency(valor)}/diária` : ''}
                            </button>
                          );
                        })}
                      </div>
                      {!editingBudgetInfo.percurseiroTipo && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold" title="Tipo 1 usado provisoriamente até a definição">definir o tipo (Tipo 1 provisório)</span>
                      )}
                      {editingBudgetInfo.percurseiro && (
                        <span className="w-full text-[10px] text-slate-500 tabular-nums">
                          Pacote por diária: motoqueiro {formatCurrency(editingBudgetInfo.percurseiro.motoqueiro)} + fee Ivan {formatCurrency(editingBudgetInfo.percurseiro.fee)} + alimentação {formatCurrency(editingBudgetInfo.percurseiro.alimentacao)} + transporte {formatCurrency(editingBudgetInfo.percurseiro.transporte)} + NF {formatCurrency(editingBudgetInfo.percurseiro.nf)} = <b>{formatCurrency(editingBudgetInfo.percurseiro.total)}</b> · {editingBudgetInfo.voa ? '2 diárias (em viagem — regra fixa)' : '1 diária (local)'} · alimentação e mobilidade incluídas no pacote
                        </span>
                      )}
                    </div>
                  )}
                  <div className="divide-y divide-slate-100">
                    {/* Diária PLANA — um único valor para todos os dias */}
                    <div className="flex items-center px-3.5 py-2 gap-3">
                      <div className="flex items-center gap-1.5 flex-1">
                        <Briefcase className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-[12px] font-medium text-slate-700">Diária</span>
                        <span className="text-[10px] text-slate-400">
                          × {diasDiariaModal} {diasDiariaModal === 1 ? 'dia' : 'dias'}
                          {editingBudgetInfo.regraDiaria === 'fds' && ' (só fins de semana)'}
                          {editingBudgetInfo.regraDiaria === 'nenhuma' && ' (cenotécnica CLT: sem diária)'}
                          {editingBudgetInfo.isPercurso && (editingBudgetInfo.voa ? ' (percurso em viagem — regra fixa de 2 diárias)' : ' (percurso local)')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">R$</span>
                        <Input
                          type="text" inputMode="decimal" className={inputCls}
                          aria-label="Diária (R$/dia)"
                          value={mBuf('vdia', editingBudget.valorDiaria)}
                          disabled={modalViewMode}
                          onChange={e => {
                            mSet('vdia', e.target.value);
                            const v = toCents(e.target.value);
                            // diária plana: espelha nos campos legados útil/fds
                            setEditingBudget({...editingBudget, valorDiaria: v, valorDiariaUtil: v, valorDiariaFds: v});
                          }}
                          onBlur={mClear('vdia')}
                        />
                        <span className="text-[10px] text-slate-400">/dia</span>
                      </div>
                      <span className="text-[13px] font-bold text-slate-700 w-20 text-right shrink-0">{formatCurrency(totalDiarias)}</span>
                    </div>
                    {/* Memória da deflação por período */}
                    {deflatedModal.segments.length > 1 && (
                      <div className="px-3.5 py-1.5 text-[10px] bg-blue-50/30" style={{color:'#5B6BB8'}}>
                        Deflação por período: {formatSegmentsMemo(deflatedModal.segments)} = <b>{formatCurrency(totalDiarias)}</b>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── BLOCO: Mobilidade ── */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-3.5 py-2 bg-violet-50 border-b border-violet-100">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-md bg-violet-500 flex items-center justify-center">
                        <Car className="w-2.5 h-2.5 text-white" />
                      </div>
                      <span className="text-[11px] font-bold text-violet-700 uppercase tracking-wider">Mobilidade</span>
                      <span className="text-[10px] text-violet-400">ida e volta</span>
                    </div>
                    <span className="text-[13px] font-bold text-violet-600">{formatCurrency(editingBudget.mobilidadeIda + editingBudget.mobilidadeVolta)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 px-3.5 py-2.5">
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium mb-1">Ida (R$)</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">R$</span>
                        <Input
                          type="text" inputMode="decimal" className={inputCls}
                          aria-label="Mobilidade — ida (R$)"
                          value={mBuf('mobIda', editingBudget.mobilidadeIda)}
                          disabled={modalViewMode}
                          onChange={e => {
                            mSet('mobIda', e.target.value);
                            const ida = toCents(e.target.value);
                            setEditingBudget({...editingBudget, mobilidadeIda: ida, mobilidade: ida + editingBudget.mobilidadeVolta});
                          }}
                          onBlur={mClear('mobIda')}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium mb-1">Volta (R$)</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">R$</span>
                        <Input
                          type="text" inputMode="decimal" className={inputCls}
                          aria-label="Mobilidade — volta (R$)"
                          value={mBuf('mobVolta', editingBudget.mobilidadeVolta)}
                          disabled={modalViewMode}
                          onChange={e => {
                            mSet('mobVolta', e.target.value);
                            const volta = toCents(e.target.value);
                            setEditingBudget({...editingBudget, mobilidadeVolta: volta, mobilidade: editingBudget.mobilidadeIda + volta});
                          }}
                          onBlur={mClear('mobVolta')}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── BLOCO: Alimentação ── */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-3.5 py-2 bg-orange-50 border-b border-orange-100">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-md bg-orange-500 flex items-center justify-center">
                        <Utensils className="w-2.5 h-2.5 text-white" />
                      </div>
                      <span className="text-[11px] font-bold text-orange-700 uppercase tracking-wider">Alimentação</span>
                    </div>
                    <span className="text-[13px] font-bold text-orange-600">{formatCurrency(totalAlimentacao)}</span>
                  </div>

                  {/* Horários de voo que dirigem o cálculo (passagem manda) */}
                  {editingBudgetInfo.voa ? (
                    <div className="flex items-center gap-2 flex-wrap px-3.5 py-1.5 bg-orange-50/50 border-b border-orange-100 text-[10px] text-slate-500">
                      <span>✈ Chegada (ida): <b className="text-slate-700">{editingBudgetInfo.vooChegadaIda || "—"}</b></span>
                      <span>· Partida (volta): <b className="text-slate-700">{editingBudgetInfo.vooPartidaVolta || "—"}</b></span>
                      {editingBudgetInfo.fonteVoo === "passagem" ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">pela passagem</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold" title="Sem horários da passagem registrada — refeições assumem dia cheio até a compra">estimado — aguardando passagem</span>
                      )}
                    </div>
                  ) : (
                    <div className="px-3.5 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] text-slate-500">
                      Sem viagem (não voa) — alimentação não se aplica.
                    </div>
                  )}

                  {/* Resumo compacto: os 4 campos legados só aparecem no ajuste manual */}
                  {!alimExpanded && (
                    <div className="px-3.5 py-2.5">
                      {totalAlimentacao === 0 ? (
                        <p className="text-[11px] text-slate-400">
                          {editingBudgetInfo.voa
                            ? 'Nenhuma refeição prevista pelos horários de voo.'
                            : 'Nenhuma refeição prevista para esta escalação.'}
                        </p>
                      ) : (
                        <div className="space-y-1 text-[11px] text-slate-600">
                          {(editingBudget.almocoSemana > 0 || editingBudget.jantarSemana > 0) && !noWeekdays && (
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">Dias úteis ({editingBudgetInfo.weekdays})</span>
                              <span className="tabular-nums">
                                {editingBudget.almocoSemana > 0 && <>Almoço <b>{formatCurrency(editingBudget.almocoSemana)}</b></>}
                                {editingBudget.almocoSemana > 0 && editingBudget.jantarSemana > 0 && ' · '}
                                {editingBudget.jantarSemana > 0 && <>Jantar <b>{formatCurrency(editingBudget.jantarSemana)}</b></>}
                              </span>
                            </div>
                          )}
                          {(editingBudget.almocoFds > 0 || editingBudget.jantarFds > 0) && !noWeekends && (
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">Fim de semana ({editingBudgetInfo.weekends})</span>
                              <span className="tabular-nums">
                                {editingBudget.almocoFds > 0 && <>Almoço <b>{formatCurrency(editingBudget.almocoFds)}</b></>}
                                {editingBudget.almocoFds > 0 && editingBudget.jantarFds > 0 && ' · '}
                                {editingBudget.jantarFds > 0 && <>Jantar <b>{formatCurrency(editingBudget.jantarFds)}</b></>}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {!modalViewMode && (
                    <button
                      type="button"
                      onClick={() => setAlimExpanded(v => !v)}
                      aria-expanded={alimExpanded}
                      className="w-full flex items-center justify-center gap-1 px-3.5 py-1.5 text-[10px] font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 border-t border-slate-100 transition-colors"
                    >
                      {alimExpanded ? 'Ocultar ajuste manual' : (editingBudgetInfo.voa ? 'Ajustar manualmente' : 'Ajustar manualmente (exceções)')}
                      <ChevronDown className={`w-3 h-3 transition-transform ${alimExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  )}

                  {alimExpanded && (<>
                  {/* Sub-seção: Dias Úteis */}
                  <div className="px-3.5 pt-2 pb-1.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Briefcase className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Dias Úteis ({editingBudgetInfo.weekdays})</span>
                    </div>
                    <div className="space-y-1.5 pl-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-600 w-12 shrink-0">Almoço</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400">R$</span>
                          <Input
                            type="text" inputMode="decimal" className={inputCls}
                            aria-label="Almoço em dias úteis (R$ total)"
                            value={noWeekdays ? '0' : mBuf('almSem', editingBudget.almocoSemana)}
                            disabled={noWeekdays || modalViewMode}
                            onChange={e => { mSet('almSem', e.target.value); setEditingBudget({...editingBudget, almocoSemana: toCents(e.target.value)}); }}
                            onBlur={mClear('almSem')}
                          />
                          <span className="text-[10px] text-slate-400">total</span>
                        </div>
                        <span className="text-[10px] text-slate-300 ml-auto">
                          {editingBudgetInfo.weekdays > 0 ? formatCurrency(Math.round(editingBudget.almocoSemana / editingBudgetInfo.weekdays)) : 'R$ 0'}/dia
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-600 w-12 shrink-0">Jantar</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400">R$</span>
                          <Input
                            type="text" inputMode="decimal" className={inputCls}
                            aria-label="Jantar em dias úteis (R$ total)"
                            value={noWeekdays ? '0' : mBuf('janSem', editingBudget.jantarSemana)}
                            disabled={noWeekdays || modalViewMode}
                            onChange={e => { mSet('janSem', e.target.value); setEditingBudget({...editingBudget, jantarSemana: toCents(e.target.value)}); }}
                            onBlur={mClear('janSem')}
                          />
                          <span className="text-[10px] text-slate-400">total</span>
                        </div>
                        <span className="text-[10px] text-slate-300 ml-auto">
                          {editingBudgetInfo.weekdays > 0 ? formatCurrency(Math.round(editingBudget.jantarSemana / editingBudgetInfo.weekdays)) : 'R$ 0'}/dia
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mx-3.5 border-t border-dashed border-slate-100" />

                  {/* Sub-seção: Fins de Semana */}
                  <div className="px-3.5 pt-2 pb-2.5 bg-amber-50/30">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sun className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Fim de Semana ({editingBudgetInfo.weekends})</span>
                    </div>
                    <div className="space-y-1.5 pl-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-600 w-12 shrink-0">Almoço</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400">R$</span>
                          <Input
                            type="text" inputMode="decimal" className={inputCls}
                            aria-label="Almoço em fins de semana (R$ total)"
                            value={noWeekends ? '0' : mBuf('almFds', editingBudget.almocoFds)}
                            disabled={noWeekends || modalViewMode}
                            onChange={e => { mSet('almFds', e.target.value); setEditingBudget({...editingBudget, almocoFds: toCents(e.target.value)}); }}
                            onBlur={mClear('almFds')}
                          />
                          <span className="text-[10px] text-slate-400">total</span>
                        </div>
                        <span className="text-[10px] text-slate-300 ml-auto">
                          {editingBudgetInfo.weekends > 0 ? formatCurrency(Math.round(editingBudget.almocoFds / editingBudgetInfo.weekends)) : 'R$ 0'}/dia
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-600 w-12 shrink-0">Jantar</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400">R$</span>
                          <Input
                            type="text" inputMode="decimal" className={inputCls}
                            aria-label="Jantar em fins de semana (R$ total)"
                            value={noWeekends ? '0' : mBuf('janFds', editingBudget.jantarFds)}
                            disabled={noWeekends || modalViewMode}
                            onChange={e => { mSet('janFds', e.target.value); setEditingBudget({...editingBudget, jantarFds: toCents(e.target.value)}); }}
                            onBlur={mClear('janFds')}
                          />
                          <span className="text-[10px] text-slate-400">total</span>
                        </div>
                        <span className="text-[10px] text-slate-300 ml-auto">
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
                <div className="flex-1 overflow-y-auto min-h-0" style={{background:'#F8FAFC'}}>
                  {editingBudgetPlannedId ? (
                    <BudgetChat
                      entityType="planned"
                      entityId={editingBudgetPlannedId}
                      eventId={selectedEventId}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-[12px]">
                      Disponível após o envio para o Realizado.
                    </div>
                  )}
                </div>
              )}

              {/* ── Aba: Histórico ── */}
              {modalTab === 'historico' && (
                <div className="flex-1 overflow-y-auto min-h-0" style={{background:'#F8FAFC'}}>
                  {editingBudgetPlannedId ? (
                    <ActivityTimeline entityType="budget_planned" entityId={editingBudgetPlannedId} defaultOpen={true} />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-[12px]">
                      Disponível após o envio para o Realizado.
                    </div>
                  )}
                </div>
              )}

              {/* ── Footer ── */}
              <div className="shrink-0" style={{borderTop:'1px solid #e5e7eb', background:'#F8FAFC'}}>
                {/* Faixa de total */}
                <div className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Total Planejado</div>
                    <div className="text-[22px] font-extrabold leading-none mt-0.5 transition-all" style={{color:'var(--primary)'}}>{formatCurrency(modalTotal)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-500 leading-tight">
                      Diárias <span className="font-semibold text-slate-600">{formatCurrency(totalDiarias)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Alimentação <span className="font-semibold text-slate-600">{formatCurrency(totalAlimentacao)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Mobilidade <span className="font-semibold text-slate-600">{formatCurrency(editingBudget.mobilidade)}</span>
                    </div>
                    {hasChanges && diff !== 0 && (
                      <div className={`text-[10px] font-bold mt-1 ${diff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(diff))} vs original
                      </div>
                    )}
                  </div>
                </div>
                {/* Botões */}
                <div className="px-5 pb-3 flex justify-between items-center gap-2" style={{borderTop:'1px solid #e5e7eb', paddingTop:'10px', background:'white'}}>
                  <div>
                    {!modalViewMode && differsFromDefault && (
                      <button
                        onClick={restoreDefaults}
                        title="Volta aos valores da regra atual (atendimento/freela/casa + deflação + voo)"
                        className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary-hover transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restaurar padrão
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      className="h-9 px-4 text-slate-500 hover:text-slate-700 rounded-lg text-sm"
                      onClick={() => { setEditingBudget(null); setEditingBudgetInfo(null); }}
                    >
                      Cancelar
                    </Button>
                    {!modalViewMode && (
                      <Button
                        onClick={saveEdit}
                        disabled={!hasChanges}
                        className={`h-9 px-5 text-white font-semibold rounded-lg gap-2 text-sm ${hasChanges ? 'bg-primary hover:bg-primary-hover shadow-md' : ''}`}
                      >
                        <CheckCheck className="w-4 h-4" />
                        {hasChanges && diff !== 0 ? `Salvar (${diff > 0 ? '+' : ''}${formatCurrency(diff)})` : 'Salvar'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          );})()}
        </DialogContent>
      </Dialog>

      {/* ── Confirmação de envio UNIFICADA (cards, individual e planilha) ── */}
      <AlertDialog
        open={!!confirmSend}
        onOpenChange={v => {
          if (sendToActualMutation.isPending || sendSelectedToActualMutation.isPending) return;
          if (!v) setConfirmSend(null);
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-3xl">
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
                  <AlertDialogTitle className="text-[15px]">Enviar para a prestação de contas?</AlertDialogTitle>
                  <AlertDialogDescription className="text-[12px]">
                    {single
                      ? `${getCollaboratorName(single.inclusion.collaboratorId)} · ${getFunctionName(single.inclusion.functionId)}`
                      : `${targets.length} ${targets.length === 1 ? 'colaborador selecionado' : 'colaboradores selecionados'}`}
                  </AlertDialogDescription>
                </AlertDialogHeader>

                {/* Resumo de custos */}
                <div className="w-full rounded-2xl overflow-hidden" style={{border:'1px solid #E2E8F0'}}>
                  {single ? (
                    <>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-[12px] font-normal text-slate-500">Diárias</span>
                        <span className="text-[12px] font-medium text-slate-600">{formatCurrency(single.subtotalDiarias)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5" style={{borderTop:'1px solid #F1F5F9'}}>
                        <span className="text-[12px] font-normal text-slate-500">Alimentação</span>
                        <span className="text-[12px] font-medium text-slate-600">{formatCurrency(single.almocoSemana + single.jantarSemana + single.almocoFds + single.jantarFds)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5" style={{borderTop:'1px solid #F1F5F9'}}>
                        <span className="text-[12px] font-normal text-slate-500">Mobilidade</span>
                        <span className="text-[12px] font-medium text-slate-600">{formatCurrency(single.mobilidade)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-400" />
                        <span className="text-[12px] font-normal text-slate-500">Colaboradores</span>
                      </div>
                      <span className="text-[13px] font-medium text-slate-700">{targets.length} {targets.length === 1 ? 'pessoa' : 'pessoas'}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-2.5" style={{borderTop:'1px solid #F1F5F9', background:'#F0FDF4'}}>
                    <span className="text-[12px] font-medium text-slate-600">Total a ser enviado</span>
                    <span className="text-[15px] font-medium tabular-nums" style={{color:'#059669'}}>{formatCurrency(totalEnvio)}</span>
                  </div>
                </div>

                {/* Copy consistente entre os três fluxos */}
                <p className="text-center text-[12px] font-normal text-slate-400 leading-relaxed">
                  {targets.length === 1 ? 'O planejamento será enviado' : 'Os planejamentos serão enviados'} para a prestação de contas (Realizado)
                  {anyEdited ? ' — os valores editados manualmente vão junto' : ''}. Esta ação não pode ser desfeita.
                </p>

                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isSending} className="rounded-xl text-[13px]">Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isSending || targets.length === 0}
                    onClick={e => { e.preventDefault(); doSend(); }}
                    className="rounded-xl text-[13px] gap-1.5 text-white"
                    style={{background:'#059669'}}
                  >
                    {isSending ? (
                      <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Enviando...</>
                    ) : (
                      <><Check className="w-3.5 h-3.5" />Confirmar Envio</>
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
        <DialogContent className="max-w-sm p-0 gap-0 rounded-3xl overflow-hidden shadow-2xl" style={{border:'1px solid rgba(0,0,0,0.06)'}}>
          <DialogHeader className="sr-only">
            <DialogTitle>Restaurar Planejamento</DialogTitle>
          </DialogHeader>
          {restoreModal && (
            <div className="bg-white flex flex-col items-center px-6 pt-7 pb-6 gap-4"
              style={{animation:'modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both'}}>

              {/* Ícone — círculo azul claro */}
              <div className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{background:'#EFF6FF', border:'1.5px solid #BFDBFE'}}>
                <Undo2 style={{color:'var(--primary)', width:18, height:18}} />
              </div>

              {/* Título + subtítulo */}
              <div className="text-center space-y-1">
                <h2 className="text-[15px] font-medium text-slate-800 leading-snug">Restaurar Planejamento?</h2>
                <p className="text-[12px] font-normal" style={{color:'#94A3B8'}}>{restoreModal.name} · {restoreModal.functionName}</p>
                {restoreModal.startDate && restoreModal.endDate && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md mt-1"
                    style={{background:'#EFF6FF', fontSize:11, fontWeight:500, color:'var(--primary)', border:'1px solid #BFDBFE'}}>
                    <Calendar style={{width:10, height:10}} />
                    {new Date(restoreModal.startDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                    {' – '}
                    {new Date(restoreModal.endDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                  </span>
                )}
              </div>

              {/* Texto explicativo */}
              <p className="text-center text-[13px] font-normal text-slate-400 leading-relaxed">
                Deseja incluir novamente este colaborador nos cálculos? Todos os valores de diárias, alimentação e mobilidade serão reativados.
              </p>

              {/* Botões */}
              <div className="flex gap-2 w-full pt-1">
                <button
                  className="flex-1 h-10 rounded-xl text-[13px] font-medium text-slate-600 bg-slate-100 transition-colors hover:bg-slate-200"
                  onClick={() => setRestoreModal(null)}
                >
                  Voltar
                </button>
                <button
                  className="flex-1 h-10 rounded-xl text-[13px] font-medium text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    toggleNotAttendedMutation.mutate({ id: restoreModal.id, reason: "" });
                    setRestoreModal(null);
                  }}
                  disabled={toggleNotAttendedMutation.isPending}
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  {toggleNotAttendedMutation.isPending ? 'Restaurando...' : 'Restaurar'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!notAttendedModal} onOpenChange={() => { setNotAttendedModal(null); setNotAttendedReason(""); }}>
        <DialogContent className="max-w-sm p-0 gap-0 rounded-3xl overflow-hidden shadow-2xl" style={{border:'1px solid rgba(0,0,0,0.06)'}}>
          <DialogHeader className="sr-only">
            <DialogTitle>Confirmar Ausência</DialogTitle>
          </DialogHeader>

          {notAttendedModal && (
            <div className="bg-white flex flex-col items-center px-6 pt-7 pb-6 gap-4"
              style={{animation:'modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both'}}>

              {/* Ícone centralizado — círculo rose claro */}
              <div className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{background:'#FFF1F2', border:'1.5px solid #FECDD3'}}>
                <UserX className="w-4.5 h-4.5" style={{color:'#F43F5E', width:18, height:18}} />
              </div>

              {/* Título + subtítulo */}
              <div className="text-center space-y-1">
                <h2 className="text-[15px] font-medium text-slate-800 leading-snug">Confirmar Ausência?</h2>
                <p className="text-[12px] font-normal" style={{color:'#94A3B8'}}>{notAttendedModal.name} · {notAttendedModal.functionName}</p>
              </div>

              {/* Texto explicativo */}
              <p className="text-center text-[13px] font-normal text-slate-400 leading-relaxed">
                Você está marcando que este colaborador não participou deste evento. Os cálculos de diárias e custos associados serão removidos dos totais.
              </p>

              {/* Campo motivo */}
              <div className="w-full">
                <label className="text-[10px] font-medium uppercase tracking-widest text-slate-400 block mb-1.5">
                  Motivo <span className="normal-case tracking-normal font-normal text-slate-300">(opcional)</span>
                </label>
                <Textarea
                  className="w-full rounded-xl text-[13px] resize-none border-slate-200 focus:border-rose-300 focus:ring-2 focus:ring-rose-50 placeholder:text-slate-300"
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
                  className="flex-1 h-10 rounded-xl text-[13px] font-medium text-slate-600 bg-slate-100 transition-colors hover:bg-slate-200"
                  onClick={() => { setNotAttendedModal(null); setNotAttendedReason(""); }}
                >
                  Voltar
                </button>
                <button
                  className="flex-1 h-10 rounded-xl text-[13px] font-medium text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 bg-rose-500 hover:bg-rose-600"
                  onClick={() => {
                    if (notAttendedModal.id) {
                      toggleNotAttendedMutation.mutate({ id: notAttendedModal.id, reason: notAttendedReason });
                    } else if (notAttendedModal.budget) {
                      createAndMarkNotAttendedMutation.mutate({ budget: notAttendedModal.budget, reason: notAttendedReason });
                    }
                  }}
                  disabled={toggleNotAttendedMutation.isPending || createAndMarkNotAttendedMutation.isPending}
                >
                  <UserX className="w-3.5 h-3.5" />
                  {(toggleNotAttendedMutation.isPending || createAndMarkNotAttendedMutation.isPending) ? 'Confirmando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Sticky Footer — Barra de Progresso do Envio ── */}
      {selectedEventId && calculatedBudgets.length > 0 && (
        <div style={{
          // sticky no container da página: acompanha a largura do conteúdo e o
          // recuo do layout em qualquer estado do sidebar (expandido/compacto/oculto),
          // ao contrário do antigo `position: fixed; left: 256` hardcoded.
          position: 'sticky',
          bottom: 0,
          zIndex: 40,
          borderRadius: '14px 14px 0 0',
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: '1px solid rgba(226,232,240,0.7)',
          boxShadow: '0 -2px 20px rgba(0,0,0,0.05)',
        }}>
          <div style={{maxWidth: 1024, margin: '0 auto', padding: '9px 24px', display: 'flex', alignItems: 'center', gap: 24}}>

            {/* Esquerda: Total do Evento — label empilhado + valor */}
            <div style={{flexShrink: 0, paddingRight: 24, borderRight: '1px solid #E2E8F0'}}>
              <div style={{fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94A3B8', marginBottom: 3}}>
                Valor Total do Evento
              </div>
              <div style={{
                fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em',
                color: 'var(--primary)', fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"', lineHeight: 1,
              }}>
                {formatCurrency(totalGeral)}
              </div>
            </div>

            {/* Centro: progresso do envio */}
            <div style={{flex: 1}}>
              <div style={{display:'flex', alignItems:'center', gap: 10}}>
                <div style={{flex: 1, height: 4, borderRadius: 9999, overflow: 'hidden', background: 'rgba(226,232,240,0.8)'}}>
                  <div style={{
                    height: '100%', borderRadius: 9999,
                    transition: 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                    width: `${stats.progressoEnvio}%`,
                    background: stats.progressoEnvio >= 100
                      ? '#059669'
                      : 'linear-gradient(90deg, var(--primary) 0%, var(--primary) 60%, #059669 100%)',
                    boxShadow: stats.progressoEnvio >= 100
                      ? '0 0 6px rgba(5,150,105,0.45)'
                      : 'none',
                  }} />
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 400, letterSpacing: '0.01em', whiteSpace: 'nowrap',
                  color: stats.progressoEnvio >= 100 ? '#059669' : '#94A3B8',
                }}>
                  {stats.enviados}/{stats.total}
                  {stats.progressoEnvio >= 100 && <span style={{marginLeft: 4}}>✓</span>}
                </span>
              </div>
            </div>

            {/* Direita: botão de ação */}
            {stats.progressoEnvio >= 100 ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 18px', borderRadius: 12,
                background: '#F0FDF4', border: '1px solid #BBF7D0', flexShrink: 0,
              }}>
                <CheckCheck className="w-4 h-4" style={{color:'#059669'}} />
                <span style={{fontSize: 13, fontWeight: 700, color: '#059669'}}>Todos Enviados</span>
              </div>
            ) : (
              <button
                onClick={() => selectedIds.size > 0 ? setConfirmSend({ ids: Array.from(selectedIds), source: 'batch' }) : undefined}
                disabled={selectedIds.size === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  height: 38, paddingLeft: 18, paddingRight: 18,
                  borderRadius: 12, border: 'none', cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                  flexShrink: 0,
                  background: selectedIds.size > 0 ? '#059669' : '#E2E8F0',
                  color: selectedIds.size > 0 ? '#fff' : '#94A3B8',
                  boxShadow: selectedIds.size > 0 ? '0 4px 14px rgba(5,150,105,0.35)' : 'none',
                  fontSize: 13, fontWeight: 600,
                  transition: 'all 0.2s ease',
                  opacity: selectedIds.size === 0 ? 0.7 : 1,
                }}
              >
                <Send style={{width: 14, height: 14}} />
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
