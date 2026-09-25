/**
 * CARD de prestação do Orçamento Realizado — 25/09 (modularização).
 *
 * Extraído de `renderSingleCard` em budget-actual.tsx. Memoizado (item de
 * lista); cabeçalho, corpo e rodapé em componentes próprios (< 300 linhas).
 * Os derivados (planejado de referência, dias, divergência) chegam prontos
 * da lista para o card não precisar dos índices.
 */
import { memo } from "react";
import {
  AlertCircle, Calendar, Car, CheckCheck, CheckCircle2, ChevronDown, ChevronUp, Clock, Copy, Edit, Eye, GitFork, Lock,
  Trash2, TrendingDown, TrendingUp, Utensils,
} from "lucide-react";
import { formatDiasUteis, formatFds } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import { lerAdjustedFields } from "./comparison-utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BudgetNotesBadge, BudgetNotesSnippet } from "@/components/budget-chat";
import { PlannedEditedBadge, type ActivityLog } from "@/components/activity-timeline";
import type { BudgetActual, BudgetNote, BudgetPlanned } from "@shared/schema";
import { avatarColorAct, formatWorkedDays, reconstructDailyValues, subtotalDiariasDe, type DayCounts, type ModalActualTab } from "./actual-utils";

const formatCurrency = formatarMoeda;

export interface ActualCardProps {
  cardItem: BudgetActual;
  isGParent?: boolean;
  isGChild?: boolean;
  collabName: string;
  functionName: string;
  cardDays: DayCounts;
  cardPlanned: BudgetPlanned | undefined;
  diverges: boolean;
  notAttended: boolean;
  isCollapsed: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  eventNotes: BudgetNote[];
  plannedLogs: ActivityLog[];
  isRhOrAdmin: boolean;
  splitPending: boolean;
  onToggleSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onEdit: (item: BudgetActual, tab?: ModalActualTab) => void;
  onSplit: (item: BudgetActual) => void;
  onDelete: (id: string) => void;
}

type Derivados = { isInGroup: boolean; isItemLocked: boolean; isItemEditable: boolean; initials: string; avatarBg: string; workedDaysStr: string | null };

function StatusBadge({ cardItem }: { cardItem: BudgetActual }) {
  const isDuplicated = cardItem.observations?.includes("Duplicado no Realizado");
  const hasBeenEdited = !!(cardItem.updatedAt && cardItem.createdAt && new Date(cardItem.updatedAt).getTime() > new Date(cardItem.createdAt).getTime() + 1000);
  const fmtDT = (d: string | Date) => {
    const dt = new Date(d);
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };
  // Badge baseado diretamente em rhStatus: o rh-action zera sentForReview ao devolver/recusar,
  // então condicionar Devolvido/Recusado a sentForReview tornava esses ramos inalcançáveis
  return cardItem.rhStatus === "aprovado" ? <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full font-semibold bg-success-soft text-success border border-success/25"><CheckCheck className="w-2.5 h-2.5" aria-hidden="true" /> Aprovado</span>
    : cardItem.rhStatus === "devolvido" ? <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full font-semibold bg-warning-soft text-warning border border-warning/25"><AlertCircle className="w-2.5 h-2.5" aria-hidden="true" /> Devolvido</span>
    : cardItem.rhStatus === "rejeitado" ? <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full font-semibold bg-danger-soft text-danger border border-danger/25"><AlertCircle className="w-2.5 h-2.5" aria-hidden="true" /> Recusado</span>
    : cardItem.sentForReview ? <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full font-semibold bg-brand-soft text-primary border border-primary/25"><Clock className="w-2.5 h-2.5" aria-hidden="true" /> Em revisão</span>
    : isDuplicated ? <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full font-semibold bg-brand-soft text-primary border border-primary/25"><Copy className="w-2.5 h-2.5" aria-hidden="true" /> Duplicado</span>
    : hasBeenEdited ? <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full font-semibold bg-success-soft text-success border border-success/25"><CheckCircle2 className="w-2.5 h-2.5" aria-hidden="true" /> Salvo {fmtDT(cardItem.updatedAt!)}</span>
    : <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full font-semibold bg-muted text-muted-foreground border border-border">Não preenchido</span>;
}

function ActualCardHeader(p: ActualCardProps & Derivados) {
  const { cardItem, isGParent, isGChild, collabName, functionName, diverges, notAttended, isCollapsed, isSelected, eventNotes, plannedLogs, splitPending, isInGroup, isItemLocked, isItemEditable, initials, avatarBg, workedDaysStr } = p;
  const isCasa = cardItem.collaboratorType === "casa";
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${isItemLocked ? "bg-brand-soft/40" : "bg-surface-muted/60"}`}>
      <div className="flex items-center gap-3">
        {isItemLocked ? (
          <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0 cursor-default" aria-hidden="true" />
          </TooltipTrigger><TooltipContent side="right" className="text-xs">Prestação bloqueada para edição</TooltipContent></Tooltip></TooltipProvider>
        ) : isItemEditable ? (
          <button
            onClick={() => p.onToggleSelect(cardItem.id)}
            className="flex-shrink-0"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`Selecionar prestação de ${collabName}`}
          >
            <div className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-colors ${isSelected ? "bg-primary border-primary" : "border-slate-300 hover:border-primary"}`}>
              {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </div>
          </button>
        ) : null}
        <div className={`w-9 h-9 rounded-lg ${avatarBg} flex items-center justify-center flex-shrink-0`}>
          <span className="text-white text-xs font-bold">{initials || "?"}</span>
        </div>
        <div>
          <span className="font-medium text-foreground text-sm">{collabName}</span>
          <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
            <span className="text-2xs font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md truncate shrink min-w-0">{functionName}</span>
            <span className={`text-2xs font-bold px-1.5 py-0.5 rounded-md shrink-0 ${isCasa ? "bg-brand-soft text-primary" : "bg-warning-soft text-warning"}`}>{isCasa ? "Casa" : "Freela"}</span>
            <span className="shrink-0"><StatusBadge cardItem={cardItem} /></span>
            {notAttended && (
              <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full font-semibold bg-muted text-muted-foreground border border-border shrink-0 whitespace-nowrap">
                <AlertCircle className="w-2.5 h-2.5" aria-hidden="true" /> Não participou
              </span>
            )}
            {cardItem.rhAdjusted && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap bg-warning-soft text-warning border border-warning/25">
                ⚠ Realizado ajustado pelo RH
              </span>
            )}
            {diverges && <span className="inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded-md bg-warning-soft text-warning shrink-0 whitespace-nowrap">Divergência</span>}
            {isGParent && <span className="text-2xs font-bold px-1.5 py-0.5 rounded-md bg-brand-soft text-primary shrink-0 whitespace-nowrap">Titular</span>}
            {isGChild && <span className="text-2xs font-bold px-1.5 py-0.5 rounded-md bg-brand-soft text-primary flex items-center gap-0.5 shrink-0 whitespace-nowrap"><GitFork className="w-2.5 h-2.5" aria-hidden="true" />Divisão</span>}
            {cardItem.plannedId && <PlannedEditedBadge logs={plannedLogs} entityId={cardItem.plannedId} />}
          </div>
          {workedDaysStr && isInGroup && (
            <div className="flex items-center gap-1 mt-1">
              <Calendar className="w-3 h-3 text-primary/70 flex-shrink-0" aria-hidden="true" />
              <span className="text-2xs text-primary leading-tight">{workedDaysStr}</span>
            </div>
          )}
          <BudgetNotesSnippet notes={eventNotes} entityId={cardItem.id} />
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-brand-soft transition-colors"
          onClick={() => p.onEdit(cardItem, "observacoes")}
          title="Ver observações"
          aria-label={`Ver observações de ${collabName}`}
        >
          <BudgetNotesBadge notes={eventNotes} entityId={cardItem.id} />
        </button>
        {isItemEditable ? (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary-hover hover:bg-brand-soft rounded-lg" onClick={() => p.onEdit(cardItem)} aria-label="Editar lançamento"><Edit className="w-3.5 h-3.5" aria-hidden="true" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary-hover hover:bg-brand-soft rounded-lg" onClick={() => p.onSplit(cardItem)} aria-label="Dividir lançamento" disabled={splitPending}><GitFork className="w-3.5 h-3.5" aria-hidden="true" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-danger-strong hover:bg-danger-soft rounded-lg" onClick={() => p.onDelete(cardItem.id)} aria-label="Remover lançamento"><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></Button>
          </>
        ) : (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-slate-600 hover:bg-muted rounded-lg" onClick={() => p.onEdit(cardItem)} aria-label="Visualizar lançamento"><Eye className="w-3.5 h-3.5" aria-hidden="true" /></Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-slate-600 rounded-lg" onClick={() => p.onToggleCollapse(cardItem.id)} aria-expanded={!isCollapsed} aria-label={isCollapsed ? "Expandir lançamento" : "Recolher lançamento"}>
          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

function ActualCardBody({ cardItem, cardDays, cardPlanned: planned, isRhOrAdmin, onEdit }: Pick<ActualCardProps, "cardItem" | "cardDays" | "cardPlanned" | "isRhOrAdmin" | "onEdit">) {
  const totalAlimentacao = cardItem.weekdayLunch + cardItem.weekdayDinner + cardItem.weekendLunch + cardItem.weekendDinner;
  // Translado (transport) não é diária — subtraído para o subtotal do card não misturar as verbas
  const cardSubtotalDiarias = subtotalDiariasDe(cardItem);
  const { valorUtil: cardValorUtil, valorFds: cardValorFds } = reconstructDailyValues(cardSubtotalDiarias, cardDays.weekdays, cardDays.weekends);
  const plannedAlim = planned ? (planned.weekdayLunch + planned.weekdayDinner + planned.weekendLunch + planned.weekendDinner) : 0;
  const plannedDiarias = planned ? (planned.totalValue - plannedAlim - planned.mobility - planned.transport) : 0;
  // jsonb pode chegar como string (API de hoje) ou objeto — ver lib/json-seguro.
  const rhFields: Record<string, { from: number; to: number; label: string }> = lerAdjustedFields(cardItem.rhAdjustedFields);
  const diffInline = (actual: number, plan: number) => {
    if (!planned) return null;
    const d = actual - plan;
    if (Math.abs(d) <= 1) return null;
    return <span className={`text-2xs tabular-nums font-bold ml-1 ${d < 0 ? "text-success" : "text-danger-strong"}`}>{d > 0 ? "+" : "−"}{formatCurrency(Math.abs(d))}</span>;
  };
  const hasRhFields = Object.keys(rhFields).length > 0;
  const semana = cardItem.weekdayLunch + cardItem.weekdayDinner;
  const fds = cardItem.weekendLunch + cardItem.weekendDinner;
  const wkd = cardDays.weekdays;
  const wke = cardDays.weekends;
  const perWkd = wkd > 0 && semana > 0 ? Math.round(semana / wkd) : 0;
  const perWke = wke > 0 && fds > 0 ? Math.round(fds / wke) : 0;
  const ida = cardItem.mobilityIda;
  const volta = cardItem.mobilityVolta;
  return (
    <div className="px-4 py-3 border-t border-border space-y-3">
      {/* Banner laranja para não-RH quando RH ajustou */}
      {!isRhOrAdmin && cardItem.rhAdjusted && (
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-xl bg-warning-soft border border-warning/25">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚠</span>
            <span className="text-2xs font-medium text-warning">
              O RH ajustou alguns valores do seu realizado. Veja o histórico para detalhes.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onEdit(cardItem, "historico")}
            className="shrink-0 text-2xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap cursor-pointer border-0 hover:opacity-90 transition-opacity bg-warning-strong text-white"
          >
            Ver alterações
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* Diárias */}
        <div className="rounded-xl p-2.5 border border-primary/25 bg-brand-soft/50">
          <div className="flex items-center gap-1 mb-2">
            <div className="w-3.5 h-3.5 rounded bg-primary flex items-center justify-center shrink-0"><Calendar className="w-2 h-2 text-white" aria-hidden="true" /></div>
            <span className="text-2xs font-semibold text-primary uppercase tracking-wide">Diárias</span>
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-sm font-medium text-foreground tabular-nums">{formatCurrency(cardSubtotalDiarias)}</span>
            {diffInline(cardSubtotalDiarias, plannedDiarias)}
          </div>
          {planned && Math.abs(cardSubtotalDiarias - plannedDiarias) > 1 && <div className="text-2xs text-muted-foreground tabular-nums mt-0.5">plan: {formatCurrency(plannedDiarias)}</div>}
          <div className="mt-1.5 space-y-0.5">
            {cardDays.weekdays > 0 && <div className="text-2xs text-primary tabular-nums">{formatDiasUteis(cardDays.weekdays)} × {formatCurrency(cardValorUtil)}</div>}
            {cardDays.weekends > 0 && <div className="text-2xs text-primary tabular-nums">{formatFds(cardDays.weekends)} × {formatCurrency(cardValorFds)}</div>}
          </div>
        </div>
        {/* Alimentação */}
        <div className="rounded-xl p-2.5 border border-warning/25 bg-warning-soft/50">
          <div className="flex items-center gap-1 mb-2">
            <div className="w-3.5 h-3.5 rounded bg-warning-strong flex items-center justify-center shrink-0"><Utensils className="w-2 h-2 text-white" aria-hidden="true" /></div>
            <span className="text-2xs font-semibold text-warning uppercase tracking-wide">Alimentação</span>
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-sm font-medium text-foreground tabular-nums">{formatCurrency(totalAlimentacao)}</span>
            {diffInline(totalAlimentacao, plannedAlim)}
          </div>
          {planned && Math.abs(totalAlimentacao - plannedAlim) > 1 && <div className="text-2xs text-muted-foreground tabular-nums mt-0.5">plan: {formatCurrency(plannedAlim)}</div>}
          {(semana !== 0 || fds !== 0) && (
            <div className="mt-1.5 space-y-0.5">
              {wkd > 0 && semana > 0 && <div className="text-2xs text-warning tabular-nums">{formatDiasUteis(wkd)} × {formatCurrency(perWkd)}</div>}
              {wke > 0 && fds > 0 && <div className="text-2xs text-warning-strong tabular-nums">{formatFds(wke)} × {formatCurrency(perWke)}</div>}
            </div>
          )}
        </div>
        {/* Mobilidade */}
        <div className="rounded-xl p-2.5 border border-primary/25 bg-brand-soft/50">
          <div className="flex items-center gap-1 mb-2">
            <div className="w-3.5 h-3.5 rounded bg-primary flex items-center justify-center shrink-0"><Car className="w-2 h-2 text-white" aria-hidden="true" /></div>
            <span className="text-2xs font-semibold text-primary uppercase tracking-wide">Mobilidade</span>
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-sm font-medium text-foreground tabular-nums">{formatCurrency(cardItem.mobility)}</span>
            {diffInline(cardItem.mobility, planned?.mobility ?? 0)}
          </div>
          {typeof ida === "number" && (ida > 0 || (volta ?? 0) > 0)
            ? <div className="text-2xs text-primary/70 tabular-nums mt-0.5">Ida: {formatCurrency(ida)} · Volta: {formatCurrency(volta ?? 0)}</div>
            : planned && Math.abs(cardItem.mobility - (planned?.mobility ?? 0)) > 1
              ? <div className="text-2xs text-muted-foreground tabular-nums mt-0.5">plan: {formatCurrency(planned.mobility)}</div>
              : null}
        </div>
      </div>

      {/* Campos ajustados pelo RH — inline */}
      {hasRhFields && (
        <div className="rounded-xl px-3 py-2.5 space-y-1 bg-warning-soft border border-warning/25">
          <span className="text-2xs font-bold uppercase tracking-widest text-warning">Ajustes do RH</span>
          {Object.values(rhFields).map((f, i) => (
            <div key={i} className="flex items-center gap-1 text-2xs text-muted-foreground">
              <span>·</span>
              <span>{f.label}:</span>
              <span className="tabular-nums line-through text-muted-foreground">{formatCurrency(f.from)}</span>
              <span>→</span>
              <span className="tabular-nums font-semibold text-warning">{formatCurrency(f.to)}</span>
              <span className="text-2xs text-warning">(RH)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const ActualCard = memo(function ActualCard(p: ActualCardProps) {
  const { cardItem, isGParent = false, isGChild = false, collabName, diverges, notAttended, isCollapsed, isSelected, isHighlighted, cardPlanned: planned } = p;
  const isSelectedCls = isSelected;
  const isItemLocked = !!cardItem.sentForReview;
  const isItemEditable = !cardItem.sentForReview;
  const initials = collabName.split(" ").filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
  const avatarBg = avatarColorAct(collabName);
  const workedDaysStr = formatWorkedDays(cardItem.workedDays || []);
  const isInGroup = isGParent || isGChild;

  const stripeColor = isSelected ? "var(--primary)"
    : notAttended ? "var(--muted-foreground)"
    : cardItem.rhStatus === "aprovado" ? "var(--success)"
    : cardItem.rhStatus === "devolvido" ? "var(--warning)"
    : cardItem.rhStatus === "rejeitado" ? "var(--danger-strong)"
    : cardItem.sentForReview ? "var(--primary)"
    : diverges ? "var(--warning-strong)"
    : "var(--primary)";

  const diff = planned ? cardItem.totalValue - planned.totalValue : 0;

  return (
    <div
      data-card-id={cardItem.id}
      className={[
        "rounded-xl border overflow-hidden transition-all duration-300 bg-card flex flex-col",
        notAttended ? "opacity-60 grayscale-[30%]" : "",
        isInGroup ? "border-l-[3px] border-l-primary/40" : "",
        isHighlighted ? "ring-2 ring-ring shadow-3"
          : isSelectedCls ? "ring-2 ring-primary/40 border-primary/25 shadow-2"
          : diverges ? "border-warning/25 shadow-1"
          : isInGroup ? "border-primary/25 shadow-1"
          : "border-border shadow-1",
        !isSelectedCls ? "hover:-translate-y-1 hover:shadow-3 hover:border-primary/25" : "",
      ].join(" ")}
    >
        <div className="h-[3px]" style={{ background: stripeColor }} />

        {/* Card Header */}
        <ActualCardHeader {...p} isGParent={isGParent} isGChild={isGChild} isInGroup={isInGroup} isItemLocked={isItemLocked} isItemEditable={isItemEditable} initials={initials} avatarBg={avatarBg} workedDaysStr={workedDaysStr} />

        {/* Card Body */}
        {!isCollapsed && <ActualCardBody cardItem={cardItem} cardDays={p.cardDays} cardPlanned={planned} isRhOrAdmin={p.isRhOrAdmin} onEdit={p.onEdit} />}
      {/* Card Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface-muted/40 mt-auto">
        <div className="flex flex-col gap-0.5">
          <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-widest">Total Realizado</span>
          <span className="text-lg font-medium tabular-nums text-primary tracking-[-0.02em]">{formatCurrency(cardItem.totalValue)}</span>
        </div>
        <div>
          {!planned ? null
            : Math.abs(diff) <= 1 ? (
              <span className="text-2xs font-medium text-muted-foreground px-2.5 py-1 rounded-lg bg-muted">Dentro do previsto</span>
            ) : diff < 0 ? (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold tabular-nums text-success px-2.5 py-1 rounded-lg bg-success-soft">
                <TrendingDown className="w-3 h-3" aria-hidden="true" />− {formatCurrency(Math.abs(diff))}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold tabular-nums text-danger px-2.5 py-1 rounded-lg bg-danger-soft">
                <TrendingUp className="w-3 h-3" aria-hidden="true" />+ {formatCurrency(diff)}
              </span>
            )
          }
        </div>
      </div>
    </div>
  );
});

export default ActualCard;
