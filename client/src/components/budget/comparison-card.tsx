/**
 * Card de uma prestação no Comparativo — 25/09 (modularização).
 *
 * Extraído do `.map` de budget-comparison.tsx. Memoizado (item de lista):
 * cabeçalho colapsável (valores Plan./Real./Dif.) e corpo expandido (sub-linhas
 * da divisão OU blocos por categoria, rodapé, justificativa, comentários, chat
 * e histórico).
 */
import { memo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle, Calendar, Car, CheckCircle, ChevronDown, ClipboardList, GitFork, MessageSquare, Pencil, RotateCcw,
  UserX, Utensils, XCircle,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BudgetChat, BudgetNotesBadge, BudgetNotesSnippet } from "@/components/budget-chat";
import { ActivityTimeline, PlannedEditedBadge, type ActivityLog } from "@/components/activity-timeline";
import type { BudgetActual, BudgetNote, BudgetPlanned, TeamInclusion } from "@shared/schema";
import { CategoryBlock } from "./comparison-blocks";
import { ratearPlanejadoPorDias } from "./actual-utils";
import { avatarColor, dailySubtotalOf, fmt, getWorkedDayCount, initials, type ComparisonRow, type SplitDetailState } from "./comparison-utils";

export interface ComparisonCardProps {
  row: ComparisonRow;
  isExpanded: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  cardTi: TeamInclusion | undefined;
  eventNotes: BudgetNote[];
  plannedLogs: ActivityLog[];
  rhComment: string | null | undefined;
  isRhOrAdmin: boolean;
  getCollaboratorName: (id?: string | null) => string;
  getFunctionName: (id?: string | null) => string;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onEdit: (a: BudgetActual) => void;
  onSplitDetail: (s: SplitDetailState) => void;
}

const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; icon: LucideIcon; label: string; cardBg: string; cardBorder: string }> = {
  aprovado: { bg: "bg-success-soft", border: "border-success/25", text: "text-success", icon: CheckCircle, label: "Aprovado", cardBg: "bg-success-soft/40", cardBorder: "border-success/25" },
  rejeitado: { bg: "bg-danger-soft", border: "border-danger/25", text: "text-danger", icon: XCircle, label: "Recusado", cardBg: "bg-danger-soft/40", cardBorder: "border-danger/25" },
  devolvido: { bg: "bg-warning-soft", border: "border-warning/25", text: "text-warning", icon: RotateCcw, label: "Devolvido", cardBg: "bg-warning-soft/40", cardBorder: "border-warning/25" },
};

const fmtPeriodDate = (d: string) => {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

/** Sub-linhas da divisão (Detalhamento por Colaborador). */
function SplitRows({ row, p: pl, plannedTotal, actualTotal, diff, getCollaboratorName, getFunctionName, onSplitDetail }: {
  row: ComparisonRow; p: BudgetPlanned | null; plannedTotal: number; actualTotal: number; diff: number;
  getCollaboratorName: (id?: string | null) => string; getFunctionName: (id?: string | null) => string; onSplitDetail: (s: SplitDetailState) => void;
}) {
  const a = row.actual;
  return (
    <div className="rounded-xl border border-primary/25 overflow-hidden">
      <div className="h-[3px] bg-primary" />
      <div className="flex items-center gap-1.5 px-3 py-2 bg-brand-soft/80 border-b border-primary/25">
        <div className="w-4 h-4 rounded bg-primary flex items-center justify-center">
          <GitFork className="w-2.5 h-2.5 text-white" aria-hidden="true" />
        </div>
        <span className="text-2xs font-black uppercase tracking-wide text-primary">
          Detalhamento por Colaborador
        </span>
      </div>
      {/* Tabela larga: rola horizontalmente em telas estreitas */}
      <div className="overflow-x-auto">
      <div className="min-w-[560px]">
      <div className="grid grid-cols-6 gap-2 px-3 py-1.5 bg-surface-muted border-b border-border">
        <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-wider col-span-2">Colaborador</span>
        <span className="text-2xs uppercase text-primary font-bold tracking-wider text-right">Plan. prop.</span>
        <span className="text-2xs uppercase text-primary font-bold tracking-wider text-right">Realizado</span>
        <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-wider text-right">Diferença</span>
        <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-wider text-center"></span>
      </div>
      {[a, ...row.splitChildren].map((colItem, ci) => {
        const isParent = ci === 0;
        const colItemName = getCollaboratorName(colItem.collaboratorId);
        const allGroupDays = [...(a.workedDays as string[] || []), ...row.splitChildren.flatMap(c => (c.workedDays as string[] || []))].sort();
        const colProp = pl ? ratearPlanejadoPorDias(pl, colItem, allGroupDays, getFunctionName) : null;
        const colPlanned = colProp?.totalValue || 0;
        const colActual = colItem.totalValue;
        const colDiff = colActual - colPlanned;
        const colDays = getWorkedDayCount(colItem);
        return (
          <div key={ci} className={`grid grid-cols-6 gap-2 px-3 py-2.5 items-center text-2xs border-b border-border ${ci % 2 === 1 ? "bg-surface-muted/50" : "bg-card"}`}>
            <div className="col-span-2 flex items-center gap-2 min-w-0">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-black flex-shrink-0 ${avatarColor(colItemName)}`}>
                {initials(colItemName)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-700 truncate text-2xs">{colItemName}</p>
                <div className="flex items-center gap-1">
                  <span className={`text-2xs font-bold px-1 py-0 rounded-full ${isParent ? "bg-brand-soft text-primary" : "bg-brand-soft text-primary"}`}>
                    {isParent ? "Titular" : "Divisão"}
                  </span>
                  {colDays > 0 && (
                    <span className="text-2xs text-muted-foreground">{colDays}d</span>
                  )}
                </div>
              </div>
            </div>
            <span className="text-right tabular-nums text-primary font-medium">{fmt(colPlanned)}</span>
            <span className="text-right tabular-nums text-primary font-semibold">{fmt(colActual)}</span>
            <div className="text-right">
              {colDiff === 0 ? (
                <span className="text-muted-foreground tabular-nums">—</span>
              ) : (
                <span className={`tabular-nums font-bold text-2xs ${colDiff > 0 ? "text-danger" : "text-success"}`}>
                  {colDiff > 0 ? "+" : "−"}{fmt(Math.abs(colDiff))}
                </span>
              )}
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onSplitDetail({ actual: colItem, planned: pl, propPlanned: colProp, isParent, allGroupDays });
                }}
                className="w-6 h-6 rounded-md flex items-center justify-center bg-muted hover:bg-brand-soft text-muted-foreground hover:text-primary-hover transition-colors"
                title="Ver detalhes completos"
                aria-label={`Ver detalhes completos de ${colItemName}`}
              >
                <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        );
      })}
      <div className={`grid grid-cols-6 gap-2 px-3 py-2 text-2xs items-center border-t-2 border-border font-bold ${diff > 0 ? "bg-danger-soft/40" : diff < 0 ? "bg-success-soft/40" : "bg-surface-muted"}`}>
        <span className="text-muted-foreground uppercase text-2xs tracking-wider col-span-2">Total do Grupo</span>
        <span className="text-right tabular-nums text-primary">{fmt(plannedTotal)}</span>
        <span className="text-right tabular-nums text-primary">{fmt(actualTotal)}</span>
        <div className="text-right col-span-2">
          {diff === 0 ? (
            <span className="text-muted-foreground tabular-nums">—</span>
          ) : (
            <span className={`tabular-nums text-2xs ${diff > 0 ? "text-danger" : "text-success"}`}>
              {diff > 0 ? "+" : "−"}{fmt(Math.abs(diff))}
            </span>
          )}
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}

/** Corpo expandido do card. */
function ComparisonCardBody(props: ComparisonCardProps & { plannedTotal: number; actualTotal: number; diff: number; itemRhStatus: string; isNotAttended: boolean }) {
  const { row, plannedLogs, rhComment, getCollaboratorName, getFunctionName, onSplitDetail, plannedTotal, actualTotal, diff, itemRhStatus, isNotAttended } = props;
  const p = row.planned;
  const a = row.actual;
  // Subtotal de diárias derivado do total gravado (total − alimentação −
  // mobilidade − translado, como no Realizado): qty × média arredondada
  // não reproduz o subtotal dia a dia e deixava o card sem fechar
  const dailyPlanned = p ? dailySubtotalOf(p) : 0;
  const dailyActual = dailySubtotalOf(a);
  const planId = row.planned?.id;
  const plannedEdits = planId ? plannedLogs.filter(l => l.entity_id === planId && l.action === "update") : [];
  const lastEdit = plannedEdits.length > 0
    ? [...plannedEdits].sort((x, y) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime())[0]
    : null;
  return (
    <div className="border-t border-border bg-surface-muted">
      <div className="p-6 space-y-4">

        {/* ── Not attended notice ── */}
        {isNotAttended && (
          <div className="flex items-start gap-2.5 bg-muted rounded-xl px-4 py-3 border border-border">
            <UserX className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-slate-600">Colaborador não participou do evento</p>
              <p className="text-2xs text-muted-foreground mt-0.5">Planejado, Realizado e Diferença deste colaborador são excluídos dos totais. Os valores abaixo permanecem apenas para referência.</p>
              {row.planned?.didNotAttendReason && <p className="text-2xs text-muted-foreground mt-1 italic">Motivo: {row.planned.didNotAttendReason}</p>}
            </div>
          </div>
        )}

        {/* ── Split group sub-rows ── */}
        {row.isSplit && (
          <SplitRows row={row} p={p} plannedTotal={plannedTotal} actualTotal={actualTotal} diff={diff} getCollaboratorName={getCollaboratorName} getFunctionName={getFunctionName} onSplitDetail={onSplitDetail} />
        )}

        {/* ── Detail blocks (only for non-split) ── */}
        {!row.isSplit && <>
        {/* Shared column headers — shown once above all sections */}
        <div className="grid grid-cols-4 gap-2 px-3 border border-border rounded-lg bg-surface-muted/80" style={{ height: 28 }}>
          <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-wider flex items-center">Item</span>
          <span className="text-2xs uppercase text-primary font-semibold tracking-wider flex items-center justify-end">Planejado</span>
          <span className="text-2xs uppercase text-primary font-semibold tracking-wider flex items-center justify-end">Realizado</span>
          <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-wider flex items-center justify-end">Diferença</span>
        </div>
        <CategoryBlock
          title="Diárias"
          icon={Calendar}
          iconColor="text-primary"
          bgColor="bg-brand-soft/60"
          stripColor="bg-primary"
          rows={[
            { label: "Qtd. Diárias", planned: p?.dailyQuantity || 0, actual: a.dailyQuantity, isQuantity: true },
            { label: "Valor Unitário", planned: p?.dailyValue || 0, actual: a.dailyValue },
            { label: "Subtotal Diárias", planned: dailyPlanned, actual: dailyActual },
          ]}
        />

        <CategoryBlock
          title="Alimentação"
          icon={Utensils}
          iconColor="text-warning"
          bgColor="bg-warning-soft/60"
          stripColor="bg-warning-strong"
          rows={[
            { label: "Almoço (Sem.)", planned: p?.weekdayLunch || 0, actual: a.weekdayLunch },
            { label: "Jantar (Sem.)", planned: p?.weekdayDinner || 0, actual: a.weekdayDinner },
            { label: "Almoço (FdS)", planned: p?.weekendLunch || 0, actual: a.weekendLunch },
            { label: "Jantar (FdS)", planned: p?.weekendDinner || 0, actual: a.weekendDinner },
          ]}
        />

        <CategoryBlock
          title="Mobilidade"
          icon={Car}
          iconColor="text-primary"
          bgColor="bg-brand-soft/60"
          stripColor="bg-primary"
          rows={[
            { label: "Mobilidade", planned: p?.mobility || 0, actual: a.mobility },
            // Translado precisa aparecer aqui: o total do card o inclui,
            // e sem esta linha os subtotais não fechavam com o total
            { label: "Translado", planned: p?.transport || 0, actual: a.transport },
          ]}
        />
        </>}

        {/* Expanded card footer — compact single row */}
        <div className={`flex items-center gap-0 rounded-xl border-2 overflow-hidden ${
          diff > 0 ? "border-danger/25" : diff < 0 ? "border-success/25" : "border-border"
        }`} style={{ height: 44 }}>
          <div className="flex-1 flex items-center justify-center gap-2 bg-card border-r border-border h-full">
            <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-widest">Planejado</span>
            <span className="text-sm font-semibold text-muted-foreground tabular-nums">{fmt(plannedTotal)}</span>
          </div>
          <div className="flex-1 flex items-center justify-center gap-2 h-full bg-brand-soft">
            <span className="text-2xs uppercase text-primary font-bold tracking-widest">Realizado</span>
            <span className="text-base font-extrabold text-primary tabular-nums">{fmt(actualTotal)}</span>
          </div>
          <div className={`flex-1 flex items-center justify-center gap-2 h-full ${
            diff > 0 ? "bg-danger-soft" : diff < 0 ? "bg-success-soft" : "bg-surface-muted"
          }`}>
            <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-widest">Diferença</span>
            {diff === 0 ? (
              <span className="text-sm text-muted-foreground tabular-nums">—</span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-bold tabular-nums ${diff > 0 ? "text-danger" : "text-success"}`}>
                  {diff > 0 ? "+" : "−"}{fmt(Math.abs(diff))}
                </span>
                {plannedTotal > 0 && (
                  <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${
                    diff > 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
                  }`}>
                    {Math.abs(diff / plannedTotal * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Justification */}
        {a.changeReason && (
          <div className="p-3 rounded-xl bg-card border border-border flex items-start gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <span className="text-2xs uppercase text-muted-foreground font-bold tracking-wider">Justificativa do Responsável</span>
              <p className="text-xs text-slate-600 mt-0.5">{a.changeReason}</p>
            </div>
          </div>
        )}

        {/* RH comment per item */}
        {a.rhComment && (
          <div className={`p-3 rounded-xl border flex items-start gap-2 ${
            itemRhStatus === "aprovado" ? "bg-success-soft/60 border-success/25" :
            itemRhStatus === "rejeitado" ? "bg-danger-soft/60 border-danger/25" :
            "bg-warning-soft/60 border-warning/25"
          }`}>
            <MessageSquare className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${itemRhStatus === "aprovado" ? "text-success-strong" : itemRhStatus === "rejeitado" ? "text-danger-strong" : "text-warning-strong"}`} aria-hidden="true" />
            <div>
              <span className={`text-2xs uppercase font-bold tracking-wider ${itemRhStatus === "aprovado" ? "text-success-strong" : itemRhStatus === "rejeitado" ? "text-danger-strong" : "text-warning-strong"}`}>
                Comentário do RH
              </span>
              <p className={`text-xs mt-0.5 ${itemRhStatus === "aprovado" ? "text-success" : itemRhStatus === "rejeitado" ? "text-danger" : "text-warning"}`}>
                {a.rhComment}
              </p>
            </div>
          </div>
        )}

        {rhComment && !a.rhComment && (
          <div className="p-3 rounded-xl bg-warning-soft/60 border border-warning/25 flex items-start gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-warning-strong mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <span className="text-2xs uppercase text-warning-strong font-bold tracking-wider">Comentário do RH (geral)</span>
              <p className="text-xs text-warning mt-0.5">{rhComment}</p>
            </div>
          </div>
        )}

        {/* ── Observação do ajuste do RH ── */}
        {a.rhAdjustNote && (
          <div className="p-3 rounded-xl bg-warning-soft/80 border border-warning/25 flex items-start gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-warning-strong mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <span className="text-2xs uppercase text-warning font-bold tracking-wider">Observação do Ajuste (RH)</span>
              <p className="text-xs text-warning mt-0.5">{a.rhAdjustNote}</p>
            </div>
          </div>
        )}

        {/* ── Aviso: planejamento alterado pelo RH ── */}
        {planId && plannedEdits.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-warning/25 bg-warning-soft">
            <span aria-hidden="true" className="text-warning-strong text-base leading-none shrink-0">⚠️</span>
            <div>
              <p className="text-2xs font-semibold text-warning">Orçamento Planejado foi alterado pelo RH</p>
              {lastEdit && <p className="text-2xs text-warning mt-0.5">Última edição por {lastEdit.user_name || "?"} — os valores de referência podem ter mudado após o envio.</p>}
            </div>
          </div>
        )}

        {/* ── Chat de Auditoria ── */}
        <BudgetChat
          entityType="actual"
          entityId={a.id}
          eventId={a.eventId}
          linkedEntityType={a.plannedId ? "planned" : undefined}
          linkedEntityId={a.plannedId || undefined}
        />

        {/* ── Histórico de alterações ── */}
        <ActivityTimeline entityType="budget_actual" entityId={a.id} />
      </div>
    </div>
  );
}

export const ComparisonCard = memo(function ComparisonCard(props: ComparisonCardProps) {
  const { row, isExpanded, isSelected, isHighlighted, cardTi, eventNotes, plannedLogs, isRhOrAdmin, getCollaboratorName, getFunctionName, onToggleExpand, onToggleSelect, onEdit } = props;
  const p = row.planned;
  const a = row.actual;
  const plannedTotal = p?.totalValue || 0;
  const actualTotal = row.groupActualTotal;
  const diff = actualTotal - plannedTotal;
  const hasJustification = !!a.changeReason;
  const hasDiff = diff !== 0;

  const itemRhStatus = a.rhStatus || "pendente";
  const isDecided = itemRhStatus === "aprovado" || itemRhStatus === "rejeitado" || itemRhStatus === "devolvido";
  const isResubmitted = a.resubmitted;
  const decidedStyle = STATUS_STYLES[itemRhStatus];

  const colName = getCollaboratorName(row.collaboratorId);
  const cardKey = `${row.collaboratorId}-${row.functionId}`;

  const isNotAttended = !!row.planned?.didNotAttend;

  // Period from team inclusion
  const tiStart = cardTi?.actualStartDate || cardTi?.scheduleStartDate;
  const tiEnd   = cardTi?.actualEndDate   || cardTi?.scheduleEndDate;
  const periodLabel = tiStart && tiEnd ? `${fmtPeriodDate(tiStart)} – ${fmtPeriodDate(tiEnd)}` : null;

  return (
    <div
      data-card-id={cardKey}
      className={`rounded-xl border overflow-hidden transition-all duration-200 ${
        isNotAttended ? "bg-surface-muted border-slate-300 border-dashed opacity-75" :
        isHighlighted ? "ring-2 ring-success-strong shadow-2 " :
        isDecided ? `${decidedStyle.cardBg} ${decidedStyle.cardBorder}` :
        isSelected ? "bg-card border-success-strong ring-1 ring-success/60 shadow-2 " :
        "bg-card border-border hover:border-slate-300"
      }`}
    >
      {/* Status stripe on top */}
      {isDecided && (
        <div className={`h-[2.5px] ${itemRhStatus === "aprovado" ? "bg-success-strong" : itemRhStatus === "rejeitado" ? "bg-danger-strong" : "bg-warning-strong"}`} />
      )}

      {/* Card header row — collapsible. O clique no header expande, mas o
          role="button" acessível fica no chevron: controles interativos
          (checkbox, lápis) não podem viver dentro de um elemento com role="button" */}
      <div
        className="flex flex-wrap items-center justify-between gap-y-2 px-4 py-3 cursor-pointer"
        onClick={() => onToggleExpand(a.id)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isRhOrAdmin && !isDecided && (
            <Checkbox
              checked={isSelected}
              aria-label={`Selecionar ${colName}`}
              onCheckedChange={(checked) => onToggleSelect(a.id, !!checked)}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 border-slate-300 data-[state=checked]:bg-success data-[state=checked]:border-success"
            />
          )}

          {/* Avatar */}
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-2xs font-black flex-shrink-0 ${avatarColor(colName)}`}>
            {initials(colName)}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-foreground truncate">{colName}</span>
              {row.isSplit && (
                <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-brand-soft text-2xs font-semibold text-primary shrink-0">
                  <GitFork className="w-2.5 h-2.5" aria-hidden="true" /> Dividida
                </span>
              )}
              {isDecided && decidedStyle && (
                <span className={`flex items-center gap-1 text-2xs font-semibold px-3 py-1 rounded-full ${decidedStyle.bg} ${decidedStyle.text} shrink-0`}>
                  <decidedStyle.icon className="w-2.5 h-2.5" /> {decidedStyle.label}
                </span>
              )}
              {isResubmitted && (
                <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-brand-soft text-2xs font-semibold text-primary shrink-0">
                  <RotateCcw className="w-2.5 h-2.5" aria-hidden="true" /> Reenviado
                </span>
              )}
              {isNotAttended && (
                <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-muted text-2xs font-semibold text-muted-foreground shrink-0">
                  <UserX className="w-2.5 h-2.5" aria-hidden="true" /> Não participou
                </span>
              )}
              {eventNotes.length > 0 && (
                <BudgetNotesBadge notes={eventNotes} entityId={a.id} />
              )}
              {row.planned && (
                <PlannedEditedBadge logs={plannedLogs} entityId={row.planned.id} />
              )}
            </div>
            {eventNotes.length > 0 && (
              <BudgetNotesSnippet notes={eventNotes} entityId={a.id} />
            )}
            {/* Not-attended reason snippet */}
            {isNotAttended && row.planned?.didNotAttendReason && (
              <p className="text-2xs italic mt-0.5 text-muted-foreground leading-snug max-w-xs truncate">
                {row.planned.didNotAttendReason}
              </p>
            )}
            {/* RH comment snippet */}
            {isDecided && a.rhComment && (itemRhStatus === "rejeitado" || itemRhStatus === "devolvido") && (
              <p className={`text-2xs italic mt-0.5 leading-snug max-w-xs truncate ${itemRhStatus === "rejeitado" ? "text-danger-strong" : "text-warning-strong"}`}>
                "{a.rhComment}"
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
              <span className="text-2xs text-muted-foreground truncate shrink min-w-0">{getFunctionName(row.functionId)}</span>
              <span className="text-muted-foreground shrink-0">·</span>
              <span className={`text-2xs font-semibold shrink-0 ${row.collaboratorType === "casa" ? "text-primary" : "text-warning-strong"}`}>
                {row.collaboratorType === "casa" ? "Casa" : "Freela"}
              </span>
              {periodLabel && (
                <>
                  <span className="text-muted-foreground shrink-0">·</span>
                  <span className="text-2xs text-muted-foreground shrink-0 tabular-nums">{periodLabel}</span>
                </>
              )}
              {row.isSplit && (
                <>
                  <span className="text-muted-foreground shrink-0">·</span>
                  <span className="text-2xs text-primary font-medium truncate shrink min-w-0">
                    {[a, ...row.splitChildren].map(c => getCollaboratorName(c.collaboratorId)).join(" + ")}
                  </span>
                </>
              )}
              {hasDiff && !hasJustification && !row.isSplit && (
                <>
                  <span className="text-muted-foreground shrink-0">·</span>
                  <span className="flex items-center gap-0.5 text-2xs text-warning-strong font-medium shrink-0">
                    <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" /> Sem justificativa
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Mini values strip */}
          <div className="flex items-center divide-x divide-border border border-border rounded-lg overflow-hidden">
            {/* Plan. — referência discreta */}
            <div className="px-2 sm:px-3 py-1.5 text-center w-20 sm:w-28">
              <span className="text-2xs uppercase font-medium text-muted-foreground tracking-wider block leading-tight">Plan.</span>
              <span className="text-sm tabular-nums text-muted-foreground font-light">{fmt(plannedTotal)}</span>
            </div>
            {/* Real. — protagonista */}
            <div className="px-2 sm:px-3 py-1.5 text-center w-20 sm:w-28 bg-brand-soft">
              <span className="text-2xs uppercase font-medium text-muted-foreground tracking-wider block leading-tight">Real.</span>
              <span className="text-base tabular-nums text-foreground font-bold">{fmt(actualTotal)}</span>
            </div>
            {/* Dif. — alerta imediato */}
            <div className={`px-2 sm:px-3 py-1.5 text-center w-20 sm:w-28 ${hasDiff ? (diff > 0 ? "bg-danger-soft" : "bg-success-soft") : ""}`}>
              <span className="text-2xs uppercase font-medium text-muted-foreground tracking-wider block leading-tight">Dif.</span>
              {hasDiff ? (
                <span className={`text-sm tabular-nums font-bold ${diff > 0 ? "text-danger" : "text-success"}`}>
                  {diff > 0 ? "+" : "−"}{fmt(Math.abs(diff))}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground tabular-nums font-normal">—</span>
              )}
            </div>
          </div>
          {/* Item devolvido está com o responsável — o RH não edita até o reenvio */}
          {isRhOrAdmin && !["aprovado", "rejeitado", "devolvido"].includes(a.rhStatus || "") && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Editar realizado de ${colName} (RH)`}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-warning-soft transition-colors"
                    onClick={(e) => { e.stopPropagation(); onEdit(a); }}
                  >
                    <Pencil className="w-3.5 h-3.5 text-warning-strong" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">Editar realizado (RH)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Recolher" : "Expandir"} detalhes de ${colName}`}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(a.id); }}
          >
            <ChevronDown className={`w-4 h-4 text-muted-foreground hover:text-slate-700 transition-all duration-200 ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <ComparisonCardBody {...props} plannedTotal={plannedTotal} actualTotal={actualTotal} diff={diff} itemRhStatus={itemRhStatus} isNotAttended={isNotAttended} />
      )}
    </div>
  );
});

export default ComparisonCard;
