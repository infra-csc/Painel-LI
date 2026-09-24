import { Clock, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBr, formatDayMonthBr } from "@/lib/dates";
import { StatusBadge, toneDoStatus, type Tone } from "@/components/common/status-badge";
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
// Todas as pílulas deste módulo são o `StatusBadge` único (23/09): antes cada
// uma tinha borda e paleta própria (violeta para "Pendente", ciano para "Já
// escalado"), diferentes das da Validação para o mesmo estado.

/** Tom do TIPO do pedido: ajuste = atenção, inclusão = cresce a escala, exclusão = tira gente. */
export const REQUEST_TYPE_TONE: Record<ChangeRequestType, Tone> = {
  ajuste: "warning",
  inclusao: "success",
  exclusao: "danger",
};

export function RequestTypeBadge({ type, className }: { type: string; className?: string }) {
  const t = type as ChangeRequestType;
  return (
    <StatusBadge tone={REQUEST_TYPE_TONE[t] ?? "neutral"} className={cn("uppercase tracking-wide", className)}>
      {CHANGE_REQUEST_TYPE_LABELS[t] ?? type}
    </StatusBadge>
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
    <StatusBadge
      tone="info"
      icon={UserCheck}
      className={className}
      title="A pessoa já está escalada — a decisão é aplicada direto na escalação."
      data-testid="badge-ja-escalado"
    >
      Já escalado
    </StatusBadge>
  );
}

// ── Status do pedido ─────────────────────────────────────────────────────────

/**
 * Tom do STATUS do pedido — pelo dicionário semântico (`toneDoStatus`):
 * pendente/reenviado = warning, aprovado = success, reajustado = info,
 * negado = danger. Rótulo de recusa do pedido: "Negado" (shared; o pedido é
 * masculino) — a sugestão é "Negada" e a troca "Rejeitada".
 */
export function RequestStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = status as ChangeRequestStatus;
  return (
    <StatusBadge tone={toneDoStatus(status)} className={className}>
      {CHANGE_REQUEST_STATUS_LABELS[s] ?? status}
    </StatusBadge>
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
    <StatusBadge
      tone={toneDaSeveridade(sev)}
      icon={Clock}
      className={className}
      title={sev === "danger" ? `Aguardando decisão há ${DANGER_DAYS} dias ou mais` : sev === "warn" ? `Aguardando decisão há ${STALLED_DAYS} dias ou mais` : undefined}
    >
      {ageLabel(days)}
    </StatusBadge>
  );
}

/** Severidade de atraso (shared `pendingSeverity`) → tom: ok = neutral, warn = warning, danger = danger. */
export function toneDaSeveridade(sev: ReturnType<typeof pendingSeverity>): Tone {
  return sev === "danger" ? "danger" : sev === "warn" ? "warning" : "neutral";
}

/** "Você decide" — o usuário logado é aprovador da função deste pedido (ou admin). Ação sua = primary. */
export function CanDecideBadge({ className }: { className?: string }) {
  return (
    <StatusBadge tone="primary" icon={UserCheck} className={className} title="Você é aprovador desta função: a decisão é sua.">
      Você decide
    </StatusBadge>
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
