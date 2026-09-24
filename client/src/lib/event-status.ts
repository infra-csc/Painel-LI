import type { Event } from "@shared/schema";
import type { Tone } from "@/components/common/status-badge";

/**
 * Status de evento — fonte única para Eventos e Calendário.
 *
 * Chaves são as MESMAS strings gravadas em `events.status`
 * ("planejado", "em andamento", "concluído", "excluído").
 *
 * Cores (23/09): só tokens semânticos. Antes cada status tinha hex próprio
 * (usado em `style={{}}`) e "Planejado" era violeta aqui e laranja no CSS
 * global. Agora: planejado = info (agendado), em andamento = primary (ao
 * vivo), concluído = success, excluído = neutral.
 */
export type EventStatusKey = "planejado" | "em andamento" | "concluído" | "excluído";

export interface EventStatusStyle {
  label: string;
  /** Tom semântico — o `StatusBadge` de components/common desenha a pílula. */
  tone: Tone;
  /** classes tailwind (Calendário: chips, barras, painéis) */
  tw: {
    bg: string;
    text: string;
    border: string;
    bar: string;
    barText: string;
    dot: string;
    iconText: string;
    panelBg: string;
    panelBorder: string;
    /** borda lateral do card da Semana */
    edge: string;
  };
  /** animação de "ao vivo" nas listas */
  pulse: boolean;
}

export const STATUS: Record<string, EventStatusStyle> = {
  planejado: {
    label: "Planejado",
    tone: "info",
    tw: {
      bg: "bg-info-soft", text: "text-info", border: "border-info/20",
      bar: "bg-info-strong", barText: "text-white", dot: "bg-info-strong", iconText: "text-info",
      panelBg: "bg-info-soft", panelBorder: "border-info/20", edge: "border-info-strong",
    },
    pulse: false,
  },
  "em andamento": {
    label: "Em andamento",
    tone: "primary",
    tw: {
      bg: "bg-brand-soft", text: "text-primary", border: "border-primary/20",
      bar: "bg-primary", barText: "text-white", dot: "bg-primary", iconText: "text-primary",
      panelBg: "bg-brand-soft", panelBorder: "border-primary/20", edge: "border-primary",
    },
    pulse: true,
  },
  concluído: {
    label: "Concluído",
    tone: "success",
    tw: {
      bg: "bg-success-soft", text: "text-success", border: "border-success/20",
      bar: "bg-success-strong", barText: "text-white", dot: "bg-success-strong", iconText: "text-success",
      panelBg: "bg-success-soft", panelBorder: "border-success/20", edge: "border-success-strong",
    },
    pulse: false,
  },
  excluído: {
    label: "Excluído",
    tone: "neutral",
    tw: {
      bg: "bg-neutral-soft", text: "text-neutral", border: "border-border",
      bar: "bg-neutral/40", barText: "text-foreground", dot: "bg-neutral", iconText: "text-neutral",
      panelBg: "bg-surface-muted", panelBorder: "border-border", edge: "border-neutral/40",
    },
    pulse: false,
  },
};

/** Estilo do status com fallback seguro para "planejado". */
export function statusStyle(status: string): EventStatusStyle {
  return STATUS[status] ?? STATUS["planejado"];
}

/**
 * startDate/endDate vêm do backend como "YYYY-MM-DD" (coluna `date`).
 * `new Date("2025-01-01")` é interpretado como UTC — em Brasília (UTC-3) isso
 * vira 31/12/2024 21:00 e todo cálculo de dia/mês/ano volta um dia.
 * Aqui a data é montada no fuso local, sem deslocamento.
 */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Status efetivo do evento: "excluído" manual sempre vence; senão as datas
 * decidem "concluído"/"em andamento"; futuro respeita o status gravado.
 * Mesma regra da tela de Eventos — o Calendário usa esta função para nunca
 * divergir de lá.
 */
export function getEventStatus(ev: Pick<Event, "status" | "startDate" | "endDate">): string {
  const raw = (ev.status || "").toLowerCase().trim();
  if (raw.startsWith("exclu") || raw === "cancelado" || raw === "inativo") return "excluído";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end   = parseLocalDate(ev.endDate);
  const start = parseLocalDate(ev.startDate);
  // Status gravado só é respeitado se for um dos conhecidos — valores legados
  // ("em_andamento", "Planejado"...) caem em "planejado" em vez de sumirem
  // das telas que filtram pelo trio conhecido (Calendário).
  const known = STATUS[raw] ? raw : "planejado";
  if (!end || !start) return known;
  if (end < today)    return "concluído";
  if (start <= today) return "em andamento";
  return known;
}
