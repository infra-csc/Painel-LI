/**
 * Lógica pura da grade função × dia usada pela Sugestão de Escala.
 *
 * POR QUE NÃO REUSAR `components/forms/grid-team-inclusion-form.tsx` DIRETO:
 * aquele componente é um `export default` monolítico (1.770 linhas) sem props —
 * o estado da grade, o formulário react-hook-form, o POST em /api/team-inclusions/bulk
 * e o rascunho ficam todos dentro dele. Parametrizá-lo (payload diferente,
 * colunas extras de modal/observação, endpoint diferente) exigiria mexer no
 * comportamento da Inclusão de Equipe. Então extraímos AQUI só a lógica mínima
 * (lista de datas, decomposição "1 registro por pessoa" e parser de colagem),
 * fiel ao original, sem tocar na Inclusão de Equipe.
 */
import { TRANSPORT_MODES, type TransportMode } from "@shared/scaling-validation-rules";

export const QTY_MAX = 15;

/** Linha da grade de sugestão (1 função → quantidade por dia + dados de viagem). */
export interface SuggestionGridRow {
  rowId: string;
  functionId: string;
  functionName: string;
  quantities: Record<string, number>; // "YYYY-MM-DD" -> pessoas naquele dia
  transportModeIda: TransportMode | "";
  flightDepartureDate: string;
  flightArrivalSuggestedTime: string; // horário de desembarque (HH:MM)
  transportModeVolta: TransportMode | "";
  flightReturnDate: string;
  flightReturnSuggestedTime: string; // horário de embarque da volta (HH:MM)
  needsAccommodation: boolean;
  needsTicket: boolean;
  observations: string;
}

/** Registro (1 por pessoa) que será enviado em POST /api/scaling-suggestions/bulk. */
export interface SuggestionRecord {
  functionId: string;
  functionName: string;
  workDays: string[];
  dailyRates: number;
  rowOrder: number;
  transportModeIda: TransportMode | null;
  flightDepartureDate: string | null;
  flightArrivalSuggestedTime: string | null;
  transportModeVolta: TransportMode | null;
  flightReturnDate: string | null;
  flightReturnSuggestedTime: string | null;
  needsAccommodation: boolean;
  needsTicket: boolean;
  observations: string | null;
}

// Mesma ordem "de casa" usada na grade da Inclusão de Equipe.
const FUNCTION_ORDER = [
  "atendimento", "dir prova", "produção", "produção local", "ativação sp", "ativação local",
  "sup ceno", "cenotecnica", "cenotecnica local", "percurso", "kit", "kit local", "o2 prime",
];

export function sortFunctionsByOrder<T extends { name: string }>(functions: T[]): T[] {
  return [...functions].sort((a, b) => {
    const ai = FUNCTION_ORDER.indexOf(a.name.toLowerCase());
    const bi = FUNCTION_ORDER.indexOf(b.name.toLowerCase());
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

/** Lista "YYYY-MM-DD" entre início e fim (inclusive), em horário local (sem UTC). */
export function buildDateList(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const list: string[] = [];
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (cur <= end) {
    list.push(toYmdLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return list;
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
export function formatDateHeader(ymd: string): { date: string; dayName: string; isWeekend: boolean } {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  return {
    date: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`,
    dayName: DAY_NAMES[dow],
    isWeekend: dow === 0 || dow === 6,
  };
}

export function emptyGridRow(functionId: string, functionName: string, dates: string[], rowId?: string): SuggestionGridRow {
  const quantities: Record<string, number> = {};
  for (const d of dates) quantities[d] = 0;
  return {
    rowId: rowId ?? `${functionId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    functionId,
    functionName,
    quantities,
    transportModeIda: "",
    flightDepartureDate: "",
    flightArrivalSuggestedTime: "",
    transportModeVolta: "",
    flightReturnDate: "",
    flightReturnSuggestedTime: "",
    needsAccommodation: false,
    needsTicket: false,
    observations: "",
  };
}

/** Reencaixa as quantidades das linhas num novo período (dias que saem são descartados). */
export function reframeRows(rows: SuggestionGridRow[], dates: string[]): SuggestionGridRow[] {
  return rows.map((row) => {
    const quantities: Record<string, number> = {};
    for (const d of dates) quantities[d] = row.quantities[d] || 0;
    return { ...row, quantities };
  });
}

/**
 * Decomposição "por pessoa" — mesma regra da grade da Inclusão de Equipe:
 * para cada linha, a pessoa N trabalha em todos os dias cuja quantidade é ≥ N.
 * Cada pessoa vira 1 registro com seus workDays; dailyRates = nº de dias.
 */
export function decomposeGridRows(rows: SuggestionGridRow[], dates: string[]): SuggestionRecord[] {
  const out: SuggestionRecord[] = [];
  const sortedDates = [...dates].sort();
  rows.forEach((row, rowIndex) => {
    const active = sortedDates.filter((d) => (row.quantities[d] || 0) > 0);
    if (active.length === 0) return;
    const maxPeople = Math.max(...active.map((d) => row.quantities[d] || 0));
    for (let person = 1; person <= maxPeople; person++) {
      const workDays = active.filter((d) => (row.quantities[d] || 0) >= person);
      if (workDays.length === 0) continue;
      out.push({
        functionId: row.functionId,
        functionName: row.functionName,
        workDays,
        dailyRates: workDays.length,
        rowOrder: rowIndex,
        transportModeIda: row.transportModeIda || null,
        flightDepartureDate: row.flightDepartureDate || null,
        flightArrivalSuggestedTime: row.flightArrivalSuggestedTime || null,
        transportModeVolta: row.transportModeVolta || null,
        flightReturnDate: row.flightReturnDate || null,
        flightReturnSuggestedTime: row.flightReturnSuggestedTime || null,
        needsAccommodation: !!row.needsAccommodation,
        needsTicket: !!row.needsTicket,
        observations: row.observations.trim() || null,
      });
    }
  });
  return out;
}

/** Resumo para a barra da grade. */
export function summarizeGrid(rows: SuggestionGridRow[], dates: string[]) {
  let pessoasDia = 0;
  for (const row of rows) for (const d of dates) pessoasDia += row.quantities[d] || 0;
  return { funcoes: rows.length, pessoasDia };
}

// ── Parser de colagem (planilha) ─────────────────────────────────────────────

const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
export const normalizeStr = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");

const MONTHS: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

/** "15/nov", "15/11", "15-11-2026", "15/11/26", "2026-11-15" → "YYYY-MM-DD" (ano padrão informado). */
export function parseShortDate(raw: string, defaultYear: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split(/[/\-.]/);
  if (parts.length < 2) return "";
  const day = parts[0].padStart(2, "0");
  let month = normalizeStr(parts[1]);
  month = MONTHS[month.slice(0, 3)] ?? month.padStart(2, "0");
  let year = defaultYear;
  if (parts[2]) {
    const y = parts[2].trim();
    year = y.length === 2 ? `20${y}` : y;
  }
  if (!/^\d{2}$/.test(day) || !/^\d{2}$/.test(month) || !/^\d{4}$/.test(year)) return "";
  return `${year}-${month}-${day}`;
}

/** "14h30", "14:30", "1430", "14" → "14:30" / "14:00" (ou "" se inválido). */
export function parseTimeHHMM(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return "";
  const m = /^(\d{1,2})(?:[:h](\d{0,2}))?$/.exec(s) ?? /^(\d{2})(\d{2})$/.exec(s);
  if (!m) return "";
  const hh = Number(m[1]);
  const mm = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  if (hh > 23 || mm > 59) return "";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const MODE_ALIASES: Record<string, TransportMode> = {
  aereo: "aereo", aviao: "aereo", voo: "aereo", "a": "aereo",
  onibus: "onibus", bus: "onibus",
  van: "van",
  carro: "carro", proprio: "carro",
  transfer: "transfer", traslado: "transfer",
};
export function parseTransportMode(raw: string): TransportMode | "" {
  const s = normalizeStr(raw);
  if (!s) return "";
  if ((TRANSPORT_MODES as readonly string[]).includes(s)) return s as TransportMode;
  return MODE_ALIASES[s] ?? "";
}

const YES = new Set(["sim", "s", "1", "x", "true", "y", "yes"]);
export const parseYesNo = (raw: string) => YES.has(normalizeStr(raw));

export interface PasteResult {
  rows: SuggestionGridRow[];
  skippedNames: string[];
}

/**
 * Colagem de planilha (colunas separadas por TAB):
 * Função | Modal ida | Data ida | Hora desembarque | Modal volta | Data volta |
 * Hora embarque | Hotel | Passagem | Observação | qtd dia 1 | qtd dia 2 | …
 * (as quantidades seguem a ordem das colunas de dia da grade)
 */
export function parsePastedRows(
  text: string,
  functions: { id: string; name: string }[],
  dates: string[],
  defaultYear: string,
): PasteResult {
  const rows: SuggestionGridRow[] = [];
  const skippedNames: string[] = [];
  const lines = text.trim().split(/\r?\n/);
  const byName = new Map(functions.map((f) => [normalizeStr(f.name), f]));
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const cols = line.split("\t").map((c) => c.trim());
    const name = cols[0];
    if (!name) return;
    const func = byName.get(normalizeStr(name));
    if (!func) { skippedNames.push(name); return; }
    const row = emptyGridRow(func.id, func.name, dates, `${func.id}-paste-${Date.now()}-${i}`);
    row.transportModeIda = parseTransportMode(cols[1] ?? "");
    row.flightDepartureDate = parseShortDate(cols[2] ?? "", defaultYear);
    row.flightArrivalSuggestedTime = parseTimeHHMM(cols[3] ?? "");
    row.transportModeVolta = parseTransportMode(cols[4] ?? "");
    row.flightReturnDate = parseShortDate(cols[5] ?? "", defaultYear);
    row.flightReturnSuggestedTime = parseTimeHHMM(cols[6] ?? "");
    row.needsAccommodation = parseYesNo(cols[7] ?? "");
    row.needsTicket = parseYesNo(cols[8] ?? "");
    row.observations = cols[9] ?? "";
    for (let j = 10; j < cols.length && j - 10 < dates.length; j++) {
      const n = parseInt(cols[j] || "0", 10);
      row.quantities[dates[j - 10]] = Number.isNaN(n) ? 0 : Math.max(0, Math.min(QTY_MAX, n));
    }
    rows.push(row);
  });
  return { rows, skippedNames };
}

/** Problemas que impedem o envio (por linha). */
export function validateGridRow(row: SuggestionGridRow): string[] {
  const issues: string[] = [];
  const hasQty = Object.values(row.quantities).some((q) => q > 0);
  if (!hasQty) return issues; // linha vazia é ignorada no envio
  const hhmm = /^\d{2}:\d{2}$/;
  if (row.flightArrivalSuggestedTime && !hhmm.test(row.flightArrivalSuggestedTime)) issues.push("horário de desembarque inválido (HH:MM)");
  if (row.flightReturnSuggestedTime && !hhmm.test(row.flightReturnSuggestedTime)) issues.push("horário de embarque inválido (HH:MM)");
  if (row.flightDepartureDate && row.flightReturnDate && row.flightReturnDate < row.flightDepartureDate) issues.push("data de volta anterior à data de ida");
  if (row.needsTicket && (!row.flightDepartureDate || !row.flightReturnDate)) issues.push("passagem marcada sem data de ida/volta");
  return issues;
}
