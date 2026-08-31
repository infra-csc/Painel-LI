import { Clock, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBr, formatDayMonthBr } from "@/lib/dates";
import {
  CHANGE_REQUEST_TYPE_LABELS, CHANGE_REQUEST_STATUS_LABELS, TRANSPORT_MODE_LABELS,
  DANGER_DAYS, STALLED_DAYS, PROPOSED_FIELD_LABELS, pendingSeverity,
  type ChangeRequestType, type ChangeRequestStatus, type InclusionDiffEntry,
  type ProposedChanges, type ProposedField, type TransportMode,
} from "@shared/scaling-validation-rules";

/** "dd/mm/aaaa hh:mm" (pt-BR) — único ponto de formatação de data+hora do módulo. */
export function formatDateTimeBr(v: string | Date | null | undefined): string {
  if (!v) return "Sem data";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "Sem data";
  return `${formatDateBr(d)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

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

/**
 * "Já escalado" — o pedido é sobre uma vaga que JÁ SAIU da validação (regra do
 * dono, 26/08: a área pede ajuste pelo modal de Escalação até a passagem ser
 * comprada). Muda o que a decisão faz: aprovar aplica direto na escalação e
 * "devolver para a área validar" não existe. Sem este aviso o aprovador decide
 * achando que mexe numa vaga em fila.
 */
export function PostScalingBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-800 whitespace-nowrap", className)}
      title="A pessoa já está escalada — a decisão é aplicada direto na escalação."
      data-testid="badge-ja-escalado"
    >
      <UserCheck className="h-3 w-3" aria-hidden="true" />
      Já escalado
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

/** Idade do pedido: neutro < STALLED_DAYS, âmbar ≥ STALLED_DAYS, vermelho ≥ DANGER_DAYS. */
export function RequestAgeBadge({ days, className }: { days: number; className?: string }) {
  const sev = pendingSeverity(days);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        sev === "danger" ? "bg-red-50 text-red-700 border-red-200" : sev === "warn" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-500 border-slate-200",
        className,
      )}
      title={sev === "danger" ? `Aguardando decisão há ${DANGER_DAYS} dias ou mais` : sev === "warn" ? `Aguardando decisão há ${STALLED_DAYS} dias ou mais` : undefined}
    >
      <Clock className="w-3 h-3" aria-hidden="true" /> {ageLabel(days)}
    </span>
  );
}

/** "Você decide" — o usuário logado é aprovador da função deste pedido (ou admin). */
export function CanDecideBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border border-primary/30 bg-brand-soft/60 px-2 py-0.5 text-[11px] font-semibold text-primary whitespace-nowrap", className)}
      title="Você é aprovador desta função: a decisão é sua."
    >
      <UserCheck className="w-3 h-3" aria-hidden="true" /> Você decide
    </span>
  );
}

// ── Formatação de valores do "de/para" ───────────────────────────────────────

const ymd = (v: unknown) => (v ? String(v).slice(0, 10) : "");

/** Valor legível de um campo de proposedChanges/diff (pt-BR). */
/**
 * O QUE o pedido muda, em uma linha: "Diárias 3 → 4 · Volta 18/10 → 19/10".
 *
 * Existe porque a fila só mostrava o MOTIVO ("teste") — o aprovador tinha de
 * abrir cada pedido para descobrir o que estava sendo pedido (o dono, 26/08:
 * "eu teria que bater o olho e saber o que foi solicitado"). Pedido de inclusão
 * não tem de/para: descreve o que nasce.
 */
export function changeSummary(r: {
  requestType: string;
  diff?: InclusionDiffEntry[] | null;
  proposed?: ProposedChanges | null;
}): string {
  if (r.requestType === "exclusao") return "Tirar a vaga da escala";
  if (r.requestType === "inclusao") {
    const q = r.proposed?.quantity ?? 1;
    const dias = r.proposed?.workDays?.length ?? 0;
    const diarias = r.proposed?.dailyRates ?? dias;
    const partes = [`${q} ${q === 1 ? "vaga nova" : "vagas novas"}`];
    if (diarias) partes.push(`${diarias} ${diarias === 1 ? "diária" : "diárias"}`);
    if (dias) partes.push(`${dias} ${dias === 1 ? "dia" : "dias"}`);
    return partes.join(" · ");
  }
  const diff = r.diff ?? [];
  if (!diff.length) return "";
  return diff
    .map((d) => `${PROPOSED_FIELD_LABELS[d.field] ?? d.field}: ${formatProposedValue(d.field, d.from)} → ${formatProposedValue(d.field, d.to)}`)
    .join(" · ");
}

export function formatProposedValue(field: ProposedField, v: unknown): string {
  // No de/para, campo vazio precisa se dizer: um travessão some no meio da
  // frase e o aprovador não sabe se havia valor antes.
  if (v === null || v === undefined || v === "") return "não definido";
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
