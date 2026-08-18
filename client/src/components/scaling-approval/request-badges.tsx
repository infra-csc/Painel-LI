import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBr, formatDayMonthBr } from "@/lib/dates";
import {
  CHANGE_REQUEST_TYPE_LABELS, CHANGE_REQUEST_STATUS_LABELS, TRANSPORT_MODE_LABELS,
  type ChangeRequestType, type ChangeRequestStatus, type ProposedField, type TransportMode,
} from "@shared/scaling-validation-rules";

// ── Tipo do pedido ───────────────────────────────────────────────────────────

export const REQUEST_TYPE_CLASS: Record<ChangeRequestType, string> = {
  ajuste: "bg-amber-50 text-amber-800 border-amber-200",
  inclusao: "bg-emerald-50 text-emerald-800 border-emerald-200",
  exclusao: "bg-red-50 text-red-700 border-red-200",
};

export function RequestTypeBadge({ type, className }: { type: string; className?: string }) {
  const t = type as ChangeRequestType;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap", REQUEST_TYPE_CLASS[t] ?? "bg-slate-100 text-slate-600 border-slate-200", className)}>
      {CHANGE_REQUEST_TYPE_LABELS[t] ?? type}
    </span>
  );
}

// ── Status do pedido ─────────────────────────────────────────────────────────

const REQUEST_STATUS_CLASS: Record<ChangeRequestStatus, string> = {
  pendente: "bg-violet-50 text-violet-700 border-violet-200",
  aprovado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reajustado: "bg-sky-50 text-sky-700 border-sky-200",
  negado: "bg-slate-100 text-slate-600 border-slate-200",
  reenviado_validacao: "bg-amber-50 text-amber-700 border-amber-200",
};

export function RequestStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = status as ChangeRequestStatus;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", REQUEST_STATUS_CLASS[s] ?? "bg-slate-100 text-slate-500 border-slate-200", className)}>
      {CHANGE_REQUEST_STATUS_LABELS[s] ?? status}
    </span>
  );
}

// ── "há N dias" ──────────────────────────────────────────────────────────────

export function ageLabel(days: number): string {
  if (days <= 0) return "hoje";
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

/** Idade do pedido: neutro < 3 dias, âmbar ≥ 3, vermelho ≥ 7. */
export function RequestAgeBadge({ days, className }: { days: number; className?: string }) {
  const danger = days >= 7;
  const warn = days >= 3;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        danger ? "bg-red-50 text-red-700 border-red-200" : warn ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-500 border-slate-200",
        className,
      )}
      title={danger ? "Aguardando decisão há 7 dias ou mais" : warn ? "Aguardando decisão há 3 dias ou mais" : undefined}
    >
      <Clock className="w-3 h-3" aria-hidden="true" /> {ageLabel(days)}
    </span>
  );
}

// ── Formatação de valores do "de/para" ───────────────────────────────────────

const ymd = (v: unknown) => (v ? String(v).slice(0, 10) : "");

/** Valor legível de um campo de proposedChanges/diff (pt-BR). */
export function formatProposedValue(field: ProposedField, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (field) {
    case "workDays":
      return Array.isArray(v) ? v.map((d) => formatDayMonthBr(ymd(d))).join(", ") : String(v);
    case "needsTicket":
    case "needsAccommodation":
      return v ? "Sim" : "Não";
    case "transportModeIda":
    case "transportModeVolta":
      return TRANSPORT_MODE_LABELS[v as TransportMode] ?? String(v);
    case "flightDepartureDate":
    case "flightReturnDate":
      return formatDateBr(ymd(v));
    case "dailyRates":
      return `${v} ${Number(v) === 1 ? "diária" : "diárias"}`;
    default:
      return String(v);
  }
}
