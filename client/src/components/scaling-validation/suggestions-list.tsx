import { Clock, MessageSquareWarning } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatDiarias } from "@/lib/utils";
import { formatDayMonthBr } from "@/lib/dates";
import {
  SUGESTAO_STATUS, SUGESTAO_STATUS_LABELS, TRANSPORT_MODE_LABELS, CHANGE_REQUEST_TYPE_LABELS,
  type SugestaoStatus, type TransportMode, type ChangeRequestType,
} from "@shared/scaling-validation-rules";
import type { SuggestionRow } from "./types";

// ── Badges ───────────────────────────────────────────────────────────────────

const STATUS_CLASS: Record<SugestaoStatus, string> = {
  sugestao_pendente: "bg-amber-50 text-amber-700 border-amber-200",
  sugestao_validada: "bg-sky-50 text-sky-700 border-sky-200",
  sugestao_ajuste: "bg-violet-50 text-violet-700 border-violet-200",
  sugestao_aprovada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sugestao_negada: "bg-slate-100 text-slate-500 border-slate-200",
};

export function SuggestionStatusBadge({ status }: { status: string }) {
  const s = status as SugestaoStatus;
  const label = SUGESTAO_STATUS_LABELS[s] ?? status;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", STATUS_CLASS[s] ?? "bg-slate-100 text-slate-500 border-slate-200")}>
      {label}
    </span>
  );
}

export function PendingDaysBadge({ days, status }: { days: number; status: string }) {
  if (days < 3 || status === SUGESTAO_STATUS.APROVADA || status === SUGESTAO_STATUS.NEGADA) return null;
  const danger = days >= 7;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        danger ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200")}
      title={danger ? "Pendente há 7 dias ou mais" : "Pendente há 3 dias ou mais"}
    >
      <Clock className="w-3 h-3" aria-hidden="true" /> pendente há {days} {days === 1 ? "dia" : "dias"}
    </span>
  );
}

export function PendingRequestBadge({ row }: { row: SuggestionRow }) {
  const r = row.pendingRequest;
  if (!r) return null;
  const label = CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 whitespace-nowrap" title={r.reason ?? undefined}>
      <MessageSquareWarning className="w-3 h-3" aria-hidden="true" /> pedido de {label.toLowerCase()}
    </span>
  );
}

// ── Helpers de exibição ──────────────────────────────────────────────────────

const ymd = (v: unknown) => (v ? String(v).slice(0, 10) : "");
export function workDaysOf(row: SuggestionRow): string[] {
  return (row.workDays ?? []).map(ymd).filter(Boolean).sort();
}
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
function legLabel(mode: string | null | undefined, date: unknown, time: string | null | undefined): string {
  const parts: string[] = [];
  if (mode) parts.push(TRANSPORT_MODE_LABELS[mode as TransportMode] ?? mode);
  if (date) parts.push(formatDayMonthBr(ymd(date)));
  if (time) parts.push(time);
  return parts.length ? parts.join(" ") : "—";
}

// ── Lista ────────────────────────────────────────────────────────────────────

export interface SuggestionsListProps {
  rows: SuggestionRow[];
  functionNameById: Map<string, string>;
  selectableIds: Set<string>;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  showSelection: boolean;
}

const TH = "px-3 py-2 text-left text-[11px] uppercase tracking-widest text-slate-400 font-semibold whitespace-nowrap";

export function SuggestionsList({ rows, functionNameById, selectableIds, selectedIds, onToggle, onToggleAll, showSelection }: SuggestionsListProps) {
  const allSelected = selectableIds.size > 0 && Array.from(selectableIds).every((id) => selectedIds.has(id));

  return (
    <>
      {/* Tabela (≥ md) */}
      <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {showSelection && (
                  <th className={cn(TH, "w-10 text-center")}>
                    <Checkbox checked={allSelected} disabled={selectableIds.size === 0} onCheckedChange={onToggleAll} aria-label="Selecionar todas as vagas que posso editar" />
                  </th>
                )}
                <th className={TH}>ID</th>
                <th className={TH}>Função</th>
                <th className={TH}>Área</th>
                <th className={TH}>Período / diárias</th>
                <th className={TH}>Ida</th>
                <th className={TH}>Volta</th>
                <th className={cn(TH, "text-center")}>Passagem</th>
                <th className={cn(TH, "text-center")}>Hotel</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const selectable = selectableIds.has(row.id);
                const selected = selectedIds.has(row.id);
                const days = workDaysOf(row);
                return (
                  <tr key={row.id} className={cn("border-b border-slate-100 transition-colors", selected ? "bg-brand-soft/50" : i % 2 === 1 ? "bg-slate-50/40" : "bg-white", !row.canEdit && "text-slate-500")}>
                    {showSelection && (
                      <td className="px-3 py-2 text-center">
                        {selectable ? (
                          <Checkbox checked={selected} onCheckedChange={() => onToggle(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} />
                        ) : (
                          <span className="sr-only">Sem ações disponíveis</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 tabular-nums">#{row.inclusionNumber}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800 max-w-[220px]">
                      <span className="block truncate" title={functionNameById.get(row.functionId)}>{functionNameById.get(row.functionId) ?? "—"}</span>
                      {row.observations && <span className="block text-[11px] font-normal text-slate-400 truncate" title={row.observations}>{row.observations}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{row.area ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="font-mono tabular-nums text-slate-700">{periodLabel(row)}</span>
                      <span className="ml-1.5 text-slate-400">· {formatDiarias(days.length || row.dailyRates || 0)}</span>
                      {days.length > 0 && <span className="block text-[11px] text-slate-400 font-mono" title={days.map((d) => formatDayMonthBr(d)).join(", ")}>{days.length} {days.length === 1 ? "dia" : "dias"}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{legLabel(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{legLabel(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime)}</td>
                    <td className="px-3 py-2 text-center text-xs">{row.needsTicket ? <span className="text-violet-700 font-semibold">Sim</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-center text-xs">{row.needsAccommodation ? <span className="text-sky-700 font-semibold">Sim</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <SuggestionStatusBadge status={row.status} />
                        <PendingDaysBadge days={row.daysPending} status={row.status} />
                        <PendingRequestBadge row={row} />
                      </div>
                    </td>
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
          const days = workDaysOf(row);
          return (
            <li key={row.id} className={cn("rounded-2xl border bg-white p-3 space-y-2", selected ? "border-primary/40 bg-brand-soft/40" : "border-slate-200")}>
              <div className="flex items-start gap-2">
                {showSelection && selectable && (
                  <Checkbox checked={selected} onCheckedChange={() => onToggle(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} className="mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    <span className="font-mono text-xs text-slate-400 mr-1.5">#{row.inclusionNumber}</span>
                    {functionNameById.get(row.functionId) ?? "—"}
                  </p>
                  <p className="text-[11px] text-slate-400">{row.area ?? "Sem área"}</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-400">Período</dt><dd className="font-mono text-slate-700">{periodLabel(row)} · {formatDiarias(days.length || row.dailyRates || 0)}</dd>
                <dt className="text-slate-400">Ida</dt><dd className="text-slate-700">{legLabel(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)}</dd>
                <dt className="text-slate-400">Volta</dt><dd className="text-slate-700">{legLabel(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime)}</dd>
                <dt className="text-slate-400">Passagem / hotel</dt><dd className="text-slate-700">{row.needsTicket ? "Passagem" : "—"} / {row.needsAccommodation ? "Hotel" : "—"}</dd>
              </dl>
              {row.observations && <p className="text-[11px] text-slate-500 italic">{row.observations}</p>}
              <div className="flex flex-wrap items-center gap-1">
                <SuggestionStatusBadge status={row.status} />
                <PendingDaysBadge days={row.daysPending} status={row.status} />
                <PendingRequestBadge row={row} />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default SuggestionsList;
