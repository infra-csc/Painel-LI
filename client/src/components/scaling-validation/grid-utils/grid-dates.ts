/**
 * Datas e período da grade função × dia (25/09 — extraído de scaling-grid-utils.ts).
 * Listas "YYYY-MM-DD" em horário local, tetos de dias, problemas de período e a
 * ampliação do período para cobrir dias colados.
 */

/** Teto de dias da GRADE de sugestão — acima disso a lista de datas vem vazia (grade inutilizável). */
export const MAX_GRID_DAYS = 90;
/**
 * Teto de dias para LEITURA (quadro da Escala e CSV do Histórico). Aqui NÃO vale
 * o "tudo ou nada" da grade: um evento longo continua visível, a lista só é
 * truncada e a tela avisa quantos dias ficaram de fora.
 */
export const MAX_READ_DAYS = 370;
/** Folga permitida para a grade antes/depois do período do evento (min/max dos inputs). */
export const PERIOD_MARGIN_DAYS = 7;

export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

const ymdToDate = (ymd: string): Date => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Nº de dias entre as duas datas (inclusive); 0 se o período for inválido. Arredonda p/ absorver horário de verão. */
export function countDaysInclusive(startDate: string, endDate: string): number {
  if (!YMD_RE.test(startDate) || !YMD_RE.test(endDate) || startDate > endDate) return 0;
  return Math.round((ymdToDate(endDate).getTime() - ymdToDate(startDate).getTime()) / MS_PER_DAY) + 1;
}

/**
 * Lista "YYYY-MM-DD" entre início e fim (inclusive), em horário local (sem UTC).
 *
 * Semântica "tudo ou nada": acima de `maxDays` devolve [] — é a proteção original
 * da grade de sugestão, onde uma grade gigante seria inutilizável. Para telas de
 * LEITURA use `buildReadDateList`, que trunca e informa o que ficou de fora.
 */
export function buildDateList(startDate: string, endDate: string, options?: { maxDays?: number }): string[] {
  const maxDays = options?.maxDays ?? MAX_GRID_DAYS;
  const total = countDaysInclusive(startDate, endDate);
  if (total === 0 || total > maxDays) return [];
  const list: string[] = [];
  const cur = ymdToDate(startDate);
  for (let i = 0; i < total; i++) {
    list.push(toYmdLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return list;
}

export interface ReadDateList {
  /** Datas efetivamente listadas (no máximo `maxDays`). */
  dates: string[];
  /** Total de dias do período pedido — inclusive quando passa do teto. */
  totalDays: number;
  /** true quando o período não coube e a lista foi cortada. */
  truncated: boolean;
}

/**
 * Variante de LEITURA (quadro/CSV): nunca "some" com as colunas de dia — trunca
 * no teto e devolve `truncated`/`totalDays` para a tela avisar o usuário.
 * Passe `Infinity` para não truncar.
 */
export function buildReadDateList(startDate: string, endDate: string, maxDays: number = MAX_READ_DAYS): ReadDateList {
  const totalDays = countDaysInclusive(startDate, endDate);
  if (totalDays === 0) return { dates: [], totalDays: 0, truncated: false };
  const take = Math.max(1, Math.min(totalDays, maxDays));
  return {
    dates: buildDateList(startDate, addDaysYmd(startDate, take - 1), { maxDays: take }),
    totalDays,
    truncated: totalDays > take,
  };
}

export type PeriodProblem = "incompleto" | "invertido" | "longo";

/** Por que o período não serve para a grade (null = ok). Não altera a grade — quem chama decide. */
export function periodProblem(startDate: string, endDate: string): PeriodProblem | null {
  if (!YMD_RE.test(startDate) || !YMD_RE.test(endDate)) return "incompleto";
  if (endDate < startDate) return "invertido";
  if (buildDateList(startDate, endDate).length === 0) return "longo";
  return null;
}

export const PERIOD_PROBLEM_MESSAGES: Record<PeriodProblem, string> = {
  incompleto: "Informe as duas datas do período (a grade continua com o período anterior).",
  invertido: "O fim da grade não pode ser antes do início.",
  longo: `A grade aceita no máximo ${MAX_GRID_DAYS} dias.`,
};

/** Limites sugeridos para os inputs de período: evento ± folga. */
export function periodBounds(eventStart: string, eventEnd: string): { min: string; max: string } {
  return {
    min: YMD_RE.test(eventStart) ? addDaysYmd(eventStart, -PERIOD_MARGIN_DAYS) : "",
    max: YMD_RE.test(eventEnd) ? addDaysYmd(eventEnd, PERIOD_MARGIN_DAYS) : "",
  };
}

export function toYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Soma/subtrai dias a uma data "YYYY-MM-DD" (local). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toYmdLocal(dt);
}

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export interface DateHeader { date: string; dayName: string; isWeekend: boolean }
const headerCache = new Map<string, DateHeader>();
/** Cabeçalho "dd/mm + dia da semana" — memoizado por data (é puro e chamado por célula). */
export function formatDateHeader(ymd: string): DateHeader {
  const cached = headerCache.get(ymd);
  if (cached) return cached;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const h: DateHeader = {
    date: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`,
    dayName: DAY_NAMES[dow],
    isWeekend: dow === 0 || dow === 6,
  };
  headerCache.set(ymd, h);
  return h;
}

/**
 * Novo período que cobriria as datas de fora, respeitando os limites da grade
 * (evento ± `PERIOD_MARGIN_DAYS` e o teto de `MAX_GRID_DAYS` dias).
 * `ignored` = datas que continuam de fora mesmo assim (a tela avisa quais).
 */
export interface PeriodExpansion {
  start: string;
  end: string;
  /** false = não dá para ampliar (nada muda e tudo cai em `ignored`). */
  changed: boolean;
  covered: string[];
  ignored: string[];
}
export function expandPeriodForDates(
  period: { start: string; end: string },
  extraDates: string[],
  bounds: { min: string; max: string },
): PeriodExpansion {
  const keep = { start: period.start, end: period.end };
  const valid = Array.from(new Set(extraDates.filter((d) => YMD_RE.test(d)))).sort();
  const noChange = (ignored: string[]): PeriodExpansion => ({ ...keep, changed: false, covered: [], ignored });
  if (valid.length === 0 || periodProblem(period.start, period.end)) return noChange(valid);

  const fits = valid.filter((d) => (!bounds.min || d >= bounds.min) && (!bounds.max || d <= bounds.max));
  const ignored = valid.filter((d) => !fits.includes(d));
  let start = period.start;
  let end = period.end;
  for (const d of fits) {
    if (d < start) start = d;
    if (d > end) end = d;
  }
  if (periodProblem(start, end)) return noChange(valid); // estourou o teto de dias
  return { start, end, changed: start !== period.start || end !== period.end, covered: fits, ignored };
}
