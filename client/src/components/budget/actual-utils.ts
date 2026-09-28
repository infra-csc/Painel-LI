/**
 * Utilitários puros do Orçamento REALIZADO — 25/09 (modularização).
 *
 * Extraídos de budget-actual.tsx para hooks e componentes compartilharem
 * tipos e contas sem importar a página. Sem React.
 */
import type { BudgetActual, BudgetPlanned } from "@shared/schema";
import { diasComDiaria } from "@shared/calculation-rules";

// ── Viagem no Realizado ──────────────────────────────────────────────────────
// De onde veio cada horário exibido no bloco "Viagem" do modal.
export type TravelSource = "passagem" | "sugerido" | "manual" | "nenhum";

export const TRAVEL_SOURCE_LABEL: Record<TravelSource, string> = {
  passagem: "pela passagem",
  sugerido: "sugerido na escalação",
  manual: "informado aqui",
  nenhum: "sem horário",
};

// Assinatura dos dados que dirigem a alimentação (dias ativos + horários).
// Enquanto ela não muda, a alimentação salva é mantida como está.
export function alimSignature(dates: string[], chegadaIda: string, partidaVolta: string): string {
  return `${[...dates].sort().join(",")}|${chegadaIda}|${partidaVolta}`;
}

// Reconstrói os valores de diária útil/fds a partir do subtotal gravado.
// Fórmula única (antes o modal e o card divergiam): média simples subtotal/(úteis+fds)
// para o dia útil e o restante distribuído no fds — a MESMA base do saveEdit
// (dailyValue = Math.round(subtotal/qtdDiarias)), então reabrir o modal ou renderizar
// o card reproduz o valor efetivamente gravado. A antiga fórmula do card usava peso 2×
// para fds e não batia com a gravação.
export function reconstructDailyValues(subtotal: number, weekdays: number, weekends: number): { valorUtil: number; valorFds: number } {
  if (subtotal <= 0 || weekdays + weekends === 0) return { valorUtil: 0, valorFds: 0 };
  if (weekdays === 0) return { valorUtil: 0, valorFds: Math.round(subtotal / weekends) };
  if (weekends === 0) return { valorUtil: Math.round(subtotal / weekdays), valorFds: 0 };
  const valorUtil = Math.round(subtotal / (weekdays + weekends));
  return { valorUtil, valorFds: Math.round((subtotal - weekdays * valorUtil) / weekends) };
}

/** Formulário do modal (o que foi digitado). */
export interface EditFormBase {
  valorDiariaUtil: number;
  valorDiariaFds: number;
  weekdayLunch: number;
  weekdayDinner: number;
  weekendLunch: number;
  weekendDinner: number;
  mobilityIda: number;
  mobilityVolta: number;
}

export type AlimField = "weekdayLunch" | "weekdayDinner" | "weekendLunch" | "weekendDinner";

export interface DayEntry { date: string; valueCents: number; active: boolean; isWeekend: boolean }

export interface DayCounts { weekdays: number; weekends: number; startDate: string | null; endDate: string | null }

export type ModalActualTab = "custos" | "observacoes" | "historico";

export const isWeekendDate = (d: string) => { const day = new Date(d + "T12:00:00").getDay(); return day === 0 || day === 6; };

// Avatar color helper
export const avatarColorAct = (name: string) => {
  const colors = ["bg-primary", "bg-primary", "bg-primary", "bg-danger-strong", "bg-success-strong", "bg-warning-strong", "bg-info-strong", "bg-info-strong"];
  return colors[(name.charCodeAt(0) || 0) % colors.length];
};

const MON = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const formatWorkedDays = (days: string[]) => {
  if (!days || days.length === 0) return null;
  return [...days].sort().map(d => {
    const dt = new Date(d + "T12:00:00");
    return `${dt.getDate()}/${MON[dt.getMonth()]} (${DAY[dt.getDay()]})`;
  }).join(" · ");
};

/** "12/Jan" a partir de "YYYY-MM-DD". */
export const fmtDiaMes = (d: string) => { const dt = new Date(d + "T12:00:00"); return `${dt.getDate()}/${MON[dt.getMonth()]}`; };

/** Item ainda com badge "Não preenchido" (nunca salvo) — informado na confirmação do envio */
export const isUnfilledItem = (i: BudgetActual): boolean => {
  if (i.sentForReview) return false;
  if (["aprovado", "devolvido", "rejeitado"].includes(i.rhStatus || "")) return false;
  if (i.observations?.includes("Duplicado no Realizado")) return false;
  const edited = !!(i.updatedAt && i.createdAt && new Date(i.updatedAt).getTime() > new Date(i.createdAt).getTime() + 1000);
  return !edited;
};

/** Subtotal de diárias derivado do total gravado (total − alimentação − mobilidade − translado). */
export const subtotalDiariasDe = (i: Pick<BudgetActual, "totalValue" | "weekdayLunch" | "weekdayDinner" | "weekendLunch" | "weekendDinner" | "mobility" | "transport">) =>
  i.totalValue - i.weekdayLunch - i.weekdayDinner - i.weekendLunch - i.weekendDinner - i.mobility - i.transport;

// Rateio proporcional do planejado para itens de uma escalação dividida:
// escala diárias, alimentação (por dias úteis/fds) e mobilidade/translado (por dias)
// conforme os dias que couberam a este item dentro do grupo. Usada no card e no modal.
export function getProportionalPlanned(
  item: BudgetActual,
  rawPlan: BudgetPlanned,
  allGroupItems: BudgetActual[],
  getFunctionName: (id?: string | null) => string,
): BudgetPlanned {
  const allGroupDays = Array.from(new Set(allGroupItems.flatMap(a => a.workedDays || []))).sort();
  return ratearPlanejadoPorDias(rawPlan, item, allGroupDays, getFunctionName);
}

/**
 * Núcleo do rateio (também usado pelo Comparativo, que já tem os dias do grupo
 * em mãos): escala o planejado pelos dias que couberam a este item.
 */
export function ratearPlanejadoPorDias(
  rawPlan: BudgetPlanned,
  item: BudgetActual,
  allGroupDays: string[],
  getFunctionName: (id?: string | null) => string,
): BudgetPlanned {
  const myDays = (item.workedDays as string[] | null) || [];

  if (allGroupDays.length === 0) return rawPlan;
  // Item que cedeu todos os dias na divisão: o planejado proporcional é ZERO —
  // devolver o rawPlan fazia o titular sem dias herdar o planejado cheio
  if (myDays.length === 0) {
    return {
      ...rawPlan,
      dailyQuantity: 0,
      weekdayLunch: 0,
      weekdayDinner: 0,
      weekendLunch: 0,
      weekendDinner: 0,
      mobility: 0,
      transport: 0,
      totalValue: 0,
    };
  }
  if (myDays.length >= allGroupDays.length) return rawPlan;

  const origWkdays = allGroupDays.filter(d => !isWeekendDate(d)).length;
  const origWknds  = allGroupDays.filter(d =>  isWeekendDate(d)).length;
  const myWkdays   = myDays.filter(d => !isWeekendDate(d)).length;
  const myWknds    = myDays.filter(d =>  isWeekendDate(d)).length;

  const wkdayRatio = origWkdays > 0 ? myWkdays / origWkdays : 0;
  const wkndRatio  = origWknds  > 0 ? myWknds  / origWknds  : 0;
  const dayRatio   = myDays.length / allGroupDays.length;

  // Regra 17/08: casa (CLT) só recebe diária nos fins de semana — usa a mesma
  // função do Planejado (shared/calculation-rules) sobre os dias herdados
  const myDiasDiaria    = diasComDiaria(rawPlan.collaboratorType, myWkdays, myWknds, getFunctionName(rawPlan.functionId));
  const propDiarias     = myDiasDiaria * rawPlan.dailyValue;
  const propWkdayLunch  = Math.round(rawPlan.weekdayLunch  * wkdayRatio);
  const propWkdayDinner = Math.round(rawPlan.weekdayDinner * wkdayRatio);
  const propWkndLunch   = Math.round(rawPlan.weekendLunch   * wkndRatio);
  const propWkndDinner  = Math.round(rawPlan.weekendDinner  * wkndRatio);
  const propMobility    = Math.round(rawPlan.mobility       * dayRatio);
  const propTransport   = Math.round(rawPlan.transport      * dayRatio);

  return {
    ...rawPlan,
    dailyQuantity: myDiasDiaria,
    weekdayLunch:  propWkdayLunch,
    weekdayDinner: propWkdayDinner,
    weekendLunch:  propWkndLunch,
    weekendDinner: propWkndDinner,
    mobility:      propMobility,
    transport:     propTransport,
    totalValue:    propDiarias + propWkdayLunch + propWkdayDinner + propWkndLunch + propWkndDinner + propMobility + propTransport,
  };
}
