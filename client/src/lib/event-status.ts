import type { Event } from "@shared/schema";

/**
 * Status de evento — fonte única para Eventos e Calendário.
 *
 * Chaves são as MESMAS strings gravadas em `events.status`
 * ("planejado", "em andamento", "concluído", "excluído").
 */
export type EventStatusKey = "planejado" | "em andamento" | "concluído" | "excluído";

export interface EventStatusStyle {
  label: string;
  /** cores hex (usadas em style={{}} na tela de Eventos) */
  dot: string;
  bg: string;
  text: string;
  bar: string;
  border: string;
  /** classes tailwind equivalentes (usadas no Calendário) */
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
  /** ícone material-symbols (Lista do Calendário) */
  iconName: string;
  iconFill: boolean;
  /** animação de "ao vivo" nas listas */
  pulse: boolean;
}

export const STATUS: Record<string, EventStatusStyle> = {
  planejado: {
    label: "Planejado",
    dot: "#8B5CF6", bg: "#F5F3FF", text: "#6D28D9", bar: "#8B5CF6", border: "#DDD6FE",
    tw: {
      bg: "bg-violet-100", text: "text-violet-800", border: "border-violet-200",
      bar: "bg-violet-500", barText: "text-white", dot: "bg-violet-500", iconText: "text-violet-600",
      panelBg: "bg-violet-50", panelBorder: "border-violet-200", edge: "border-violet-500",
    },
    iconName: "schedule", iconFill: false, pulse: false,
  },
  "em andamento": {
    label: "Em andamento",
    dot: "#F97316", bg: "#FFF7ED", text: "#C2410C", bar: "#F97316", border: "#FED7AA",
    tw: {
      bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-200",
      bar: "bg-orange-500", barText: "text-white", dot: "bg-orange-500", iconText: "text-orange-600",
      panelBg: "bg-orange-50", panelBorder: "border-orange-200", edge: "border-orange-500",
    },
    iconName: "play_circle", iconFill: true, pulse: true,
  },
  concluído: {
    label: "Concluído",
    dot: "#22C55E", bg: "#F0FDF4", text: "#15803D", bar: "#22C55E", border: "#BBF7D0",
    tw: {
      bg: "bg-green-100", text: "text-green-800", border: "border-green-200",
      bar: "bg-green-500", barText: "text-white", dot: "bg-green-500", iconText: "text-green-600",
      panelBg: "bg-green-50", panelBorder: "border-green-200", edge: "border-green-500",
    },
    iconName: "check_circle", iconFill: true, pulse: false,
  },
  excluído: {
    label: "Excluído",
    dot: "#94A3B8", bg: "#F8FAFC", text: "#64748B", bar: "#CBD5E1", border: "#E2E8F0",
    tw: {
      bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200",
      bar: "bg-slate-300", barText: "text-slate-700", dot: "bg-slate-400", iconText: "text-slate-500",
      panelBg: "bg-slate-50", panelBorder: "border-slate-200", edge: "border-slate-300",
    },
    iconName: "cancel", iconFill: false, pulse: false,
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
