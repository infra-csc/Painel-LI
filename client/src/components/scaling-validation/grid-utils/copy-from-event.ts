/**
 * "Copiar de outro evento" (25/09 — extraído de scaling-grid-utils.ts): converte
 * as vagas de um evento em linhas da grade, reagregando por função + assinatura
 * de logística — é a inversa exata de `decomposeGridRows`.
 */
import type { TransportMode } from "@shared/scaling-validation-rules";
import { YMD_RE, toYmdLocal } from "./grid-dates";
import { QTY_MAX, TRANSPORT_MODE_SET, emptyGridRow, type SuggestionGridRow } from "./grid-rows";

/**
 * O mínimo que a conversão precisa de cada vaga devolvida por
 * GET /api/scaling-suggestions?eventId= (nomes de campo do contrato existente).
 */
export interface CopyableSuggestion {
  functionId: string;
  workDays: (string | Date)[] | null;
  /** Diárias gravadas na vaga: quando diferem dos dias, foram ajustadas à mão (a grade recalcula). */
  dailyRates?: number | null;
  transportModeIda?: string | null;
  flightDepartureDate?: string | Date | null;
  flightArrivalSuggestedTime?: string | null;
  transportModeVolta?: string | null;
  flightReturnDate?: string | Date | null;
  flightReturnSuggestedTime?: string | null;
  needsAccommodation?: boolean | null;
  needsTicket?: boolean | null;
  observations?: string | null;
}

export interface CopyFromEventResult {
  rows: SuggestionGridRow[];
  /** Dias com gente no evento de origem que NÃO cabem no período atual (o diálogo lista). */
  outsideDays: string[];
  /** Vagas cuja função não está mais no catálogo (ficam de fora). */
  unknownFunctions: number;
  /** Células que estouraram o teto `QTY_MAX` e foram clampadas. */
  clampedCells: number;
  /** Vagas lidas do evento de origem (antes de reagregar). */
  totalVagas: number;
  /**
   * Vagas cujas diárias não batem com o nº de dias trabalhados (foram ajustadas à
   * mão na origem). A grade sempre recalcula diárias = dias, então o diálogo avisa.
   */
  manualDailyRates: number;
}

const copyYmd = (v: string | Date | null | undefined): string => {
  if (!v) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : toYmdLocal(v);
  const s = String(v).slice(0, 10);
  return YMD_RE.test(s) ? s : "";
};
// Copiar de outro evento/linha leva o horário COMO ESTÁ (04/09): "8-14h" e
// "20h+" são a informação; antes só "HH:MM" sobrevivia e a faixa sumia na
// cópia. "HH:MM:SS" continua virando "HH:MM"; sem nenhum dígito, vazio.
const copyTime = (v: string | null | undefined): string => {
  const t = (v ?? "").trim();
  const m = /^(\d{2}:\d{2})(?::\d{2})?$/.exec(t);
  if (m) return m[1];
  return /[0-9]/.test(t) ? t.slice(0, 40) : "";
};
const copyMode = (v: string | null | undefined): TransportMode | "" =>
  v && TRANSPORT_MODE_SET.has(v) ? (v as TransportMode) : "";

/**
 * "Assinatura de logística" de UMA vaga: ida (modal/data/hora), volta
 * (modal/data/hora), passagem, hotel e observação, já normalizados como entram na
 * grade. Duas vagas só podem virar a MESMA linha quando a assinatura é idêntica —
 * senão a linha mandaria passagem/hotel de uma para as outras na volta
 * (`decomposeGridRows` copia a logística da linha para cada pessoa).
 */
export function copyLogisticsSignature(s: CopyableSuggestion): string {
  return [
    copyMode(s.transportModeIda),
    copyYmd(s.flightDepartureDate),
    copyTime(s.flightArrivalSuggestedTime),
    copyMode(s.transportModeVolta),
    copyYmd(s.flightReturnDate),
    copyTime(s.flightReturnSuggestedTime),
    s.needsTicket === true ? "1" : "0",
    s.needsAccommodation === true ? "1" : "0",
    (s.observations ?? "").trim(),
  ].join("|"); // a observação é o último campo: um "|" dentro dela não gera ambiguidade
}

/**
 * Converte as VAGAS de outro evento em LINHAS da grade, reagregando por função +
 * assinatura de logística: a quantidade de cada dia é o nº de vagas daquele grupo
 * que trabalham no dia (é a inversa exata de `decomposeGridRows`). A mesma função
 * com logísticas diferentes vira mais de uma linha — a grade suporta isso e é o
 * que preserva a ida-e-volta de cada turma (fundir tudo numa linha só daria a
 * logística da primeira vaga a todas as outras).
 * Dias fora de `dates` não entram na grade — voltam em `outsideDays` para o
 * diálogo deixar claro o que não coube no período atual.
 */
export function rowsFromSuggestions(
  suggestions: CopyableSuggestion[],
  functions: { id: string; name: string }[],
  dates: string[],
): CopyFromEventResult {
  const nameById = new Map(functions.map((f) => [f.id, f.name]));
  const inGrid = new Set(dates);
  const outside = new Set<string>();
  let unknownFunctions = 0;
  let clampedCells = 0;
  let manualDailyRates = 0;

  interface Group { functionId: string; counts: Map<string, number>; sample: CopyableSuggestion }
  const groups = new Map<string, Group>();
  /** functionId → chaves de grupo, na ordem de leitura (linhas da mesma função ficam juntas). */
  const keysByFunction = new Map<string, string[]>();
  const functionOrder: string[] = [];

  for (const s of suggestions) {
    if (!nameById.has(s.functionId)) { unknownFunctions++; continue; }
    const key = `${s.functionId}::${copyLogisticsSignature(s)}`;
    let g = groups.get(key);
    if (!g) {
      g = { functionId: s.functionId, counts: new Map(), sample: s };
      groups.set(key, g);
      let keys = keysByFunction.get(s.functionId);
      if (!keys) { keys = []; keysByFunction.set(s.functionId, keys); functionOrder.push(s.functionId); }
      keys.push(key);
    }
    let workedDays = 0;
    for (const raw of s.workDays ?? []) {
      const d = copyYmd(raw);
      if (!d) continue;
      workedDays++;
      if (!inGrid.has(d)) { outside.add(d); continue; }
      g.counts.set(d, (g.counts.get(d) ?? 0) + 1);
    }
    // Diária ajustada à mão na origem: a grade sempre recalcula diárias = dias.
    if (typeof s.dailyRates === "number" && Number.isFinite(s.dailyRates) && s.dailyRates !== workedDays) manualDailyRates++;
  }

  const stamp = Date.now();
  const rows: SuggestionGridRow[] = functionOrder
    .flatMap((fid) => keysByFunction.get(fid) ?? [])
    .map((key, i) => {
      const g = groups.get(key)!;
      const row = emptyGridRow(g.functionId, nameById.get(g.functionId)!, dates, `${g.functionId}-copy-${stamp}-${i}`);
      g.counts.forEach((n, d) => {
        if (n > QTY_MAX) clampedCells++;
        row.quantities[d] = Math.min(QTY_MAX, n);
      });
      const src = g.sample;
      row.transportModeIda = copyMode(src.transportModeIda);
      row.flightDepartureDate = copyYmd(src.flightDepartureDate);
      row.flightArrivalSuggestedTime = copyTime(src.flightArrivalSuggestedTime);
      row.transportModeVolta = copyMode(src.transportModeVolta);
      row.flightReturnDate = copyYmd(src.flightReturnDate);
      row.flightReturnSuggestedTime = copyTime(src.flightReturnSuggestedTime);
      row.needsAccommodation = src.needsAccommodation === true;
      row.needsTicket = src.needsTicket === true;
      row.observations = (src.observations ?? "").trim();
      return row;
    });

  return {
    rows,
    outsideDays: Array.from(outside).sort(),
    unknownFunctions,
    clampedCells,
    totalVagas: suggestions.length,
    manualDailyRates,
  };
}
