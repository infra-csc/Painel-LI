/**
 * Tipos e utilitários puros do COMPARATIVO (Planejado × Realizado) — 25/09
 * (modularização). Extraídos de budget-comparison.tsx. Sem React.
 */
import type { BudgetActual, BudgetPlanned, RhAdjustedFields } from "@shared/schema";
import { lerJson } from "@/lib/json-seguro";
import { avatarClasses, formatarMoeda } from "@/lib/format";

export const avatarColor = (name: string) => avatarClasses(name).join(" ");

export function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// Formatador único de moeda (lib/format) — antes cada tela tinha o seu Intl.
export const fmt = formatarMoeda;

// Campos ajustados pelo RH: aceita string (API de hoje) ou objeto (jsonb) —
// devolve o objeto ou {} se ausente/inválido (ver lib/json-seguro).
export function lerAdjustedFields(raw: string | RhAdjustedFields | null | undefined): RhAdjustedFields {
  const parsed = lerJson<RhAdjustedFields>(raw);
  return parsed && typeof parsed === "object" ? parsed : {};
}

// Nomes dos campos ajustados pelo RH — [] se ausente ou inválido
export function parseAdjustedFields(raw: string | RhAdjustedFields | null | undefined): string[] {
  return Object.keys(lerAdjustedFields(raw));
}

// Classe padrão dos SelectItem (evita repetição da string em cada item)
export const SELECT_ITEM_CLS = "hover:bg-brand-soft hover:text-primary-hover cursor-pointer focus:bg-brand-soft focus:text-primary-hover data-[state=checked]:bg-brand-soft data-[state=checked]:text-primary data-[state=checked]:font-medium";

/** Resumo do crédito/estorno automático no Flash devolvido pelas rotas do comparativo. */
export type FlashCreditResumo = { ok?: boolean; movements?: number; collaborators?: number; created?: number; updated?: number; removed?: number; alimentacaoCents?: number; mobilidadeCents?: number };

/** Uma linha do comparativo: prestação (pai ou avulsa) + planejado + filhos da divisão. */
export interface ComparisonRow {
  collaboratorId: string | null;
  collaboratorType: string | null;
  functionId: string | null;
  planned: BudgetPlanned | null;
  actual: BudgetActual;
  variance: number;
  isSplit: boolean;
  splitChildren: BudgetActual[];
  groupActualTotal: number;
}

export type StatusFilterKey = "para_analise" | "aprovado" | "rejeitado" | "devolvido";
export type ActionType = "approve" | "reject" | "return";
export type ItemRhStatus = "pendente" | "aprovado" | "rejeitado" | "devolvido";

export interface SplitDetailState {
  actual: BudgetActual;
  planned: BudgetPlanned | null;
  propPlanned: BudgetPlanned | null;
  isParent: boolean;
  allGroupDays: string[];
}

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export const fmtDate = (dateStr: string) => {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getDate()}/${MONTH_NAMES[d.getMonth()]} (${DAY_NAMES[d.getDay()]})`;
};

export const fmtDateShort = (dateStr: string) => {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getDate()}/${MONTH_NAMES[d.getMonth()]}`;
};

// Returns true if a YYYY-MM-DD string is Saturday or Sunday
export const isWknd = (d: string) => { const day = new Date(d + "T12:00:00").getDay(); return day === 0 || day === 6; };

// Helper: count days from workedDays array or return 0
export const getWorkedDayCount = (item: BudgetActual): number => {
  const wd = (item.workedDays as string[] | null) || [];
  return wd.length;
};

/** Subtotal de diárias derivado do total gravado (total − alimentação − mobilidade − translado). */
export const dailySubtotalOf = (x: Pick<BudgetPlanned, "totalValue" | "weekdayLunch" | "weekdayDinner" | "weekendLunch" | "weekendDinner" | "mobility" | "transport">) =>
  x.totalValue - x.weekdayLunch - x.weekdayDinner - x.weekendLunch - x.weekendDinner - x.mobility - x.transport;
