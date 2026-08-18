import type { ReactNode } from "react";
import { Clock, Hotel, Lock, MessageSquareWarning, Plane, Undo2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import SortableHeader, { type SortConfig } from "@/components/common/sortable-header";
import { cn, formatDiarias } from "@/lib/utils";
import { formatDateBr, formatDayMonthBr } from "@/lib/dates";
import {
  SUGESTAO_STATUS, SUGESTAO_STATUS_LABELS, TRANSPORT_MODE_LABELS, CHANGE_REQUEST_TYPE_LABELS,
  STALLED_DAYS, DANGER_DAYS, pendingSeverity,
  type SugestaoStatus, type TransportMode, type ChangeRequestType, type LastDecisionInfo,
} from "@shared/scaling-validation-rules";
import { DECISION_TONE_CLASS, describeLastDecision, lockReason, workDaysOf, ymd, type SuggestionRow } from "./types";

// Reexport: outros módulos (ex.: scaling-approval) importam daqui.
export { workDaysOf } from "./types";

// ── Badges ───────────────────────────────────────────────────────────────────

const STATUS_CLASS: Record<SugestaoStatus, string> = {
  sugestao_pendente: "bg-amber-50 text-amber-700 border-amber-200",
  sugestao_validada: "bg-sky-50 text-sky-700 border-sky-200",
  sugestao_ajuste: "bg-violet-50 text-violet-700 border-violet-200",
  sugestao_aprovada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sugestao_negada: "bg-slate-100 text-slate-600 border-slate-200",
};

const BADGE = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap";

export function SuggestionStatusBadge({ status }: { status: string }) {
  const s = status as SugestaoStatus;
  const label = SUGESTAO_STATUS_LABELS[s] ?? status;
  return <span className={cn(BADGE, STATUS_CLASS[s] ?? "bg-slate-100 text-slate-600 border-slate-200")}>{label}</span>;
}

/** Contador de dias parado — limiares vêm do shared (STALLED_DAYS / DANGER_DAYS). */
export function PendingDaysBadge({ days, status }: { days: number; status: string }) {
  if (status === SUGESTAO_STATUS.APROVADA || status === SUGESTAO_STATUS.NEGADA) return null;
  const sev = pendingSeverity(days);
  if (sev === "ok") return null;
  const danger = sev === "danger";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn(BADGE, danger ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200")}>
          <Clock className="w-3 h-3" aria-hidden="true" /> pendente há {days} {days === 1 ? "dia" : "dias"}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {danger ? `Parada há ${DANGER_DAYS} dias ou mais — priorize.` : `Parada há ${STALLED_DAYS} dias ou mais.`}
      </TooltipContent>
    </Tooltip>
  );
}

function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDateBr(d)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function PendingRequestBadge({ row }: { row: SuggestionRow }) {
  const r = row.pendingRequest;
  if (!r) return null;
  const label = CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn(BADGE, "border-violet-200 bg-violet-50 text-violet-700")}>
          <MessageSquareWarning className="w-3 h-3" aria-hidden="true" /> pedido de {label.toLowerCase()}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
        <p className="font-semibold">Aguardando o aprovador</p>
        {r.reason && <p className="whitespace-pre-wrap">{r.reason}</p>}
        <p className="text-muted-foreground">por {r.requestedByName}{r.createdAt ? ` · ${fmtDateTime(r.createdAt)}` : ""}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** "Devolvida pelo aprovador" / "Pedido negado" — com comentário, quem e quando no tooltip. */
export function LastDecisionBadge({ info }: { info: LastDecisionInfo | null | undefined }) {
  const d = describeLastDecision(info);
  if (!info || !d) return null;
  const typeLabel = CHANGE_REQUEST_TYPE_LABELS[info.requestType] ?? info.requestType;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn(BADGE, DECISION_TONE_CLASS[d.tone])}>
          <Undo2 className="w-3 h-3" aria-hidden="true" /> {d.title}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
        <p className="font-semibold">{d.title} · pedido de {typeLabel.toLowerCase()}</p>
        <p className="whitespace-pre-wrap">{info.comment?.trim() ? info.comment : <span className="italic text-muted-foreground">Sem comentário do aprovador.</span>}</p>
        <p className="text-muted-foreground">{info.byName ?? "Aprovador"}{info.at ? ` · ${fmtDateTime(info.at)}` : ""}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Todos os badges de status de uma vaga (mesma ordem na tabela e nos cards). */
export function StatusCell({ row }: { row: SuggestionRow }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <SuggestionStatusBadge status={row.status} />
      <PendingDaysBadge days={row.daysPending} status={row.status} />
      <PendingRequestBadge row={row} />
      <LastDecisionBadge info={row.lastDecision} />
    </div>
  );
}

// ── Helpers de exibição ──────────────────────────────────────────────────────

export function periodLabel(row: SuggestionRow): string {
  const days = workDaysOf(row);
  if (days.length === 0) {
    const s = ymd(row.scheduleStartDate); const e = ymd(row.scheduleEndDate);
    if (!s) return "—";
    return s === e || !e ? formatDayMonthBr(s) : `${formatDayMonthBr(s)} – ${formatDayMonthBr(e)}`;
  }
  const first = days[0]; const last = days[days.length - 1];
  return first === last ? formatDayMonthBr(first) : `${formatDayMonthBr(first)} – ${formatDayMonthBr(last)}`;
}
export function legLabel(mode: string | null | undefined, date: unknown, time: string | null | undefined): string {
  const parts: string[] = [];
  if (mode) parts.push(TRANSPORT_MODE_LABELS[mode as TransportMode] ?? mode);
  if (date) parts.push(formatDayMonthBr(ymd(date as string)));
  if (time) parts.push(time);
  return parts.length ? parts.join(" ") : "—";
}

/** "05/09 – 08/09 · 4 diárias" com "N dias" (lista de dias) em tooltip. */
function PeriodCell({ row, className }: { row: SuggestionRow; className?: string }) {
  const days = workDaysOf(row);
  const label = (
    <span className={cn("font-mono tabular-nums", className)}>
      {periodLabel(row)} <span className="text-slate-500 font-sans">· {formatDiarias(days.length || row.dailyRates || 0)}</span>
    </span>
  );
  if (days.length === 0) return label;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2">{label}</span></TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <p className="font-semibold">{days.length} {days.length === 1 ? "dia" : "dias"} de trabalho</p>
        <p className="font-mono">{days.map((d) => formatDayMonthBr(d)).join(", ")}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function YesNoIcon({ yes, icon: Icon, label, colorClass }: { yes: boolean | null | undefined; icon: typeof Plane; label: string; colorClass: string }) {
  if (!yes) return <span className="text-slate-300" aria-label={`Sem ${label.toLowerCase()}`}>—</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn("inline-flex items-center justify-center", colorClass)} aria-label={`Precisa de ${label.toLowerCase()}`}>
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">Precisa de {label.toLowerCase()}</TooltipContent>
    </Tooltip>
  );
}

function IdChip({ row, onClick }: { row: SuggestionRow; onClick?: () => void }) {
  const cls = "inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-blue-800";
  if (!onClick) return <span className={cls}>#{row.inclusionNumber}</span>;
  return (
    <button type="button" onClick={onClick} className={cn(cls, "hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40")}
      aria-label={`Ver detalhes da vaga #${row.inclusionNumber}`}>
      #{row.inclusionNumber}
    </button>
  );
}

function LockedHint({ reason }: { reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex items-center justify-center text-slate-400" aria-label={reason}>
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

// ── Lista ────────────────────────────────────────────────────────────────────

export type SuggestionSortField = "id" | "function" | "period";

export interface SuggestionsListProps {
  rows: SuggestionRow[];
  functionNameById: Map<string, string>;
  /** Vagas (visíveis) que aceitam ação do usuário. */
  selectableIds: Set<string>;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  showSelection: boolean;
  sortConfig: SortConfig<SuggestionSortField> | null;
  onSort: (field: SuggestionSortField) => void;
  onOpenDetail?: (row: SuggestionRow) => void;
  /** Linha que acabou de receber um pedido — pulsa por 2s. */
  highlightId?: string | null;
}

const TH = "px-3 py-2 text-left text-xs uppercase tracking-widest text-slate-500 font-semibold whitespace-nowrap";
// SortableHeader do kit tem padding/cor próprios; alinhamos com o resto do cabeçalho.
const SORT_TH = "!px-3 !py-2 !text-xs !font-semibold !text-slate-500 !tracking-widest";

export function SuggestionsList({
  rows, functionNameById, selectableIds, selectedIds, onToggle, onToggleAll, showSelection, sortConfig, onSort, onOpenDetail, highlightId,
}: SuggestionsListProps) {
  const selectableList = Array.from(selectableIds);
  const selectedVisible = selectableList.filter((id) => selectedIds.has(id)).length;
  const allSelected = selectableList.length > 0 && selectedVisible === selectableList.length;
  const someSelected = selectedVisible > 0 && !allSelected;

  const nameOf = (row: SuggestionRow) => functionNameById.get(row.functionId) ?? "—";
  const rowTone = (row: SuggestionRow) => (row.canEdit ? "text-slate-800" : "text-slate-600");
  const pulse = (row: SuggestionRow) => highlightId === row.id && "animate-pulse ring-2 ring-inset ring-primary/40";

  const nameCell = (row: SuggestionRow, extra?: ReactNode) => (
    <>
      {onOpenDetail ? (
        <button type="button" onClick={() => onOpenDetail(row)} className="block max-w-full truncate text-left font-semibold hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm" title={nameOf(row)}>
          {nameOf(row)}
        </button>
      ) : (
        <span className="block truncate font-semibold" title={nameOf(row)}>{nameOf(row)}</span>
      )}
      {extra}
    </>
  );

  return (
    <>
      {/* Tabela (≥ md) */}
      <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full min-w-[1040px] text-sm">
            <caption className="sr-only">Vagas sugeridas do evento</caption>
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-[0_1px_0_0_rgb(226_232_240)]">
              <tr>
                {showSelection && (
                  <th scope="col" className={cn(TH, "w-10 text-center")}>
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      disabled={selectableList.length === 0}
                      onCheckedChange={onToggleAll}
                      className="data-[state=indeterminate]:bg-primary/70 data-[state=indeterminate]:text-primary-foreground"
                      aria-label={allSelected ? "Desmarcar todas as vagas visíveis" : "Selecionar todas as vagas visíveis que posso validar"}
                    />
                  </th>
                )}
                <SortableHeader<SuggestionSortField> field="id" sortConfig={sortConfig} onSort={onSort} className={SORT_TH}>ID</SortableHeader>
                <SortableHeader<SuggestionSortField> field="function" sortConfig={sortConfig} onSort={onSort} className={SORT_TH}>Função</SortableHeader>
                <th scope="col" className={TH}>Área</th>
                <SortableHeader<SuggestionSortField> field="period" sortConfig={sortConfig} onSort={onSort} className={SORT_TH}>Período / diárias</SortableHeader>
                <th scope="col" className={TH}>Ida</th>
                <th scope="col" className={TH}>Volta</th>
                <th scope="col" className={cn(TH, "text-center")}><span className="inline-flex items-center gap-1"><Plane className="w-3.5 h-3.5" aria-hidden="true" /> Passagem</span></th>
                <th scope="col" className={cn(TH, "text-center")}><span className="inline-flex items-center gap-1"><Hotel className="w-3.5 h-3.5" aria-hidden="true" /> Hotel</span></th>
                <th scope="col" className={cn(TH, "min-w-[220px]")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const selectable = selectableIds.has(row.id);
                const selected = selectedIds.has(row.id);
                const reason = selectable ? null : lockReason(row);
                return (
                  <tr key={row.id} data-testid={`suggestion-row-${row.inclusionNumber}`}
                    className={cn("border-b border-slate-100 transition-colors", selected ? "bg-brand-soft/50" : i % 2 === 1 ? "bg-slate-50/40" : "bg-white", rowTone(row), pulse(row))}>
                    {showSelection && (
                      <td className="px-3 py-2 text-center">
                        {selectable ? (
                          <Checkbox checked={selected} onCheckedChange={() => onToggle(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} />
                        ) : (
                          <LockedHint reason={reason ?? "Sem ações disponíveis"} />
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2"><IdChip row={row} onClick={onOpenDetail ? () => onOpenDetail(row) : undefined} /></td>
                    <td className="px-3 py-2 max-w-[240px]">
                      {nameCell(row, row.observations && <span className="block text-[11px] font-normal text-slate-500 truncate" title={row.observations}>{row.observations}</span>)}
                    </td>
                    <td className="px-3 py-2 text-xs">{row.area ?? "—"}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap"><PeriodCell row={row} /></td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{legLabel(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{legLabel(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime)}</td>
                    <td className="px-3 py-2 text-center text-xs"><YesNoIcon yes={row.needsTicket} icon={Plane} label="Passagem" colorClass="text-violet-700" /></td>
                    <td className="px-3 py-2 text-center text-xs"><YesNoIcon yes={row.needsAccommodation} icon={Hotel} label="Hotel" colorClass="text-sky-700" /></td>
                    <td className="px-3 py-2 min-w-[220px]"><StatusCell row={row} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards (< md) */}
      <ul className="md:hidden space-y-2" aria-label="Vagas sugeridas">
        {rows.map((row) => {
          const selectable = selectableIds.has(row.id);
          const selected = selectedIds.has(row.id);
          const reason = selectable ? null : lockReason(row);
          const days = workDaysOf(row);
          return (
            <li key={row.id} className={cn("rounded-2xl border bg-white p-3 space-y-2", selected ? "border-primary/40 bg-brand-soft/40" : "border-slate-200", rowTone(row), pulse(row))}>
              <div className="flex items-start gap-2">
                {showSelection && (
                  <span className="w-4 h-4 mt-0.5 shrink-0 inline-flex items-center justify-center">
                    {selectable
                      ? <Checkbox checked={selected} onCheckedChange={() => onToggle(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} />
                      : <LockedHint reason={reason ?? "Sem ações disponíveis"} />}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm">
                    <IdChip row={row} onClick={onOpenDetail ? () => onOpenDetail(row) : undefined} />
                    <span className="min-w-0 flex-1 truncate">{nameCell(row)}</span>
                  </div>
                  <p className="text-xs text-slate-500">{row.area ?? "Sem área"}</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-500">Período</dt><dd><PeriodCell row={row} /></dd>
                <dt className="text-slate-500">Ida</dt><dd>{legLabel(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)}</dd>
                <dt className="text-slate-500">Volta</dt><dd>{legLabel(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime)}</dd>
                <dt className="text-slate-500">Passagem / hotel</dt>
                <dd className="flex items-center gap-2">
                  <YesNoIcon yes={row.needsTicket} icon={Plane} label="Passagem" colorClass="text-violet-700" />
                  <span className="text-slate-300">/</span>
                  <YesNoIcon yes={row.needsAccommodation} icon={Hotel} label="Hotel" colorClass="text-sky-700" />
                  {days.length > 0 && <span className="ml-auto text-slate-500">{days.length} {days.length === 1 ? "dia" : "dias"}</span>}
                </dd>
              </dl>
              {row.observations && <p className="text-[11px] text-slate-600 italic line-clamp-2">{row.observations}</p>}
              <StatusCell row={row} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default SuggestionsList;
