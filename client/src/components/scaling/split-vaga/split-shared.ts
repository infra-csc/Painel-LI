/**
 * Dividir escalação — tipos e utilitários compartilhados pelo modal, pelos
 * passos e pelo hook de estado (25/09, extraídos de split-vaga-modal.tsx).
 */
import type { BudgetActual, Collaborator, TeamInclusion } from "@shared/schema";
import { formatarMoeda } from "@/lib/format";

export function getDaysInRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const cur = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  while (cur <= end) {
    days.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function isWeekend(d: string) {
  const day = new Date(d + "T12:00:00").getDay();
  return day === 0 || day === 6;
}

export function formatDay(d: string) {
  const dt = new Date(d + "T12:00:00");
  const wd = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const mo = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${wd[dt.getDay()]} ${dt.getDate()}/${mo[dt.getMonth()]}`;
}

export function formatDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export const fmtR$ = formatarMoeda;

export function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase() || "?";
}

/** "DÉBORA freitas" → "Débora Freitas". Só a 1ª letra de cada palavra (29/10:
 *  `\b\w` tratava "é" como fronteira e escrevia "DéBora"). */
export function capitalizeName(name: string): string {
  return name.toLowerCase().replace(/(^|[\s'-])(\S)/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

// `type`, não `interface` (25/09): o Realizado passa este objeto a um parâmetro
// `Record<string, unknown>`, e só o tipo-objeto literal carrega a assinatura de
// índice implícita que torna isso válido — era o que o tipo inline antigo dava.
export type SplitPayload = {
  collaboratorId: string;
  /** Tipo do NOVO colaborador (casa | freela | local) — 29/10: o servidor já
   *  aceitava; sem ele o filho herdava o tipo do titular. */
  collaboratorType?: string | null;
  workedDays: string[];
  parentWorkedDays: string[];
  mobility: number;
  weekdayLunch: number;
  weekdayDinner: number;
  weekendLunch: number;
  weekendDinner: number;
  dailyValue: number;
  dailyQuantity: number;
  totalValue: number;
  parentValues: {
    weekdayLunch: number;
    weekdayDinner: number;
    weekendLunch: number;
    weekendDinner: number;
    mobility: number;
    dailyQuantity: number;
    totalValue: number;
  };
}

export interface SplitVagaModalProps {
  item: BudgetActual;
  collaborators: Collaborator[];
  teamInclusion: TeamInclusion | undefined;
  /** Datas do evento — fallback quando a escalação não tem período definido */
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  takenDays?: string[];
  /** Nome da função da vaga — perfil da refeição do novo colaborador (29/10). */
  functionName?: string | null;
  /** Valores Padrão (`/api/system-settings`) — valores de refeição do novo colaborador (29/10). */
  systemSettings?: Record<string, number | string | undefined> | null;
  onClose: () => void;
  onConfirm: (payload: SplitPayload) => void;
  isPending?: boolean;
}

export interface Step2Form {
  valorDiariaUtil: number;
  valorDiariaFds: number;
  weekdayLunch: number;
  weekdayDinner: number;
  weekendLunch: number;
  weekendDinner: number;
  mobility: number;
}
