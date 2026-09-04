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

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
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

/** Quantidades que ficariam FORA de um novo período (para pedir confirmação antes de descartar). */
export function countOutsidePeriod(rows: SuggestionGridRow[], newDates: string[]): { pessoasDia: number; dias: number } {
  const keep = new Set(newDates);
  const dias = new Set<string>();
  let pessoasDia = 0;
  for (const row of rows) {
    for (const [d, q] of Object.entries(row.quantities)) {
      if (q > 0 && !keep.has(d)) { pessoasDia += q; dias.add(d); }
    }
  }
  return { pessoasDia, dias: dias.size };
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

// ── Blindagem do rascunho salvo em localStorage ─────────────────────────────

const TRANSPORT_MODE_SET = new Set<string>(TRANSPORT_MODES);
const draftStr = (v: unknown): string => (typeof v === "string" ? v : "");
const draftMode = (v: unknown): TransportMode | "" =>
  typeof v === "string" && TRANSPORT_MODE_SET.has(v) ? (v as TransportMode) : "";

/**
 * Reconstrói UMA linha vinda do rascunho do localStorage, campo a campo, com o
 * shape garantido de `SuggestionGridRow` — ou null quando a linha não tem nem o
 * mínimo (functionId/functionName). Um rascunho corrompido (extensão, versão
 * antiga, edição manual) não pode derrubar o render da grade.
 */
export function sanitizeDraftRow(raw: unknown): SuggestionGridRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.functionId !== "string" || !r.functionId.trim()) return null;
  if (typeof r.functionName !== "string" || !r.functionName.trim()) return null;
  const quantities: Record<string, number> = {};
  if (r.quantities && typeof r.quantities === "object" && !Array.isArray(r.quantities)) {
    for (const [d, q] of Object.entries(r.quantities as Record<string, unknown>)) {
      if (!YMD_RE.test(d)) continue;
      const n = typeof q === "number" && Number.isFinite(q) ? Math.floor(q) : 0;
      quantities[d] = Math.max(0, Math.min(QTY_MAX, n));
    }
  }
  return {
    rowId: typeof r.rowId === "string" && r.rowId
      ? r.rowId
      : `${r.functionId}-draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    functionId: r.functionId,
    functionName: r.functionName,
    quantities,
    transportModeIda: draftMode(r.transportModeIda),
    flightDepartureDate: draftStr(r.flightDepartureDate),
    flightArrivalSuggestedTime: draftStr(r.flightArrivalSuggestedTime),
    transportModeVolta: draftMode(r.transportModeVolta),
    flightReturnDate: draftStr(r.flightReturnDate),
    flightReturnSuggestedTime: draftStr(r.flightReturnSuggestedTime),
    needsAccommodation: r.needsAccommodation === true,
    needsTicket: r.needsTicket === true,
    observations: draftStr(r.observations),
  };
}

/** Sanitiza a lista de linhas do rascunho: linha inválida é descartada, o resto sobrevive. */
export function sanitizeDraftRows(raw: unknown): SuggestionGridRow[] {
  if (!Array.isArray(raw)) return [];
  const out: SuggestionGridRow[] = [];
  for (const item of raw) {
    const row = sanitizeDraftRow(item);
    if (row) out.push(row);
  }
  return out;
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

/**
 * Data por extenso em pt-BR → "YYYY-MM-DD".
 *
 * Aceita "quarta-feira, 9 de setembro de 2026", "9 de setembro de 2026",
 * "09 de set de 2026" e "9 de setembro" (ano = `defaultYear`), com ou sem acento,
 * com ou sem dia da semana na frente. O mês pode vir por nome completo ou
 * abreviação ("set", "sete", "setembro" → 09).
 */
const LONG_DATE_RE = /(\d{1,2})\s+de\s+([a-z]{3,})\.?(?:\s+de\s+(\d{2,4}))?/;
export function parseLongDateBr(raw: string, defaultYear: string): string {
  const s = normalizeStr(raw).replace(/\s+/g, " ");
  const m = LONG_DATE_RE.exec(s);
  if (!m) return "";
  const dayNum = Number(m[1]);
  if (dayNum < 1 || dayNum > 31) return "";
  const month = MONTHS[m[2].slice(0, 3)];
  if (!month) return "";
  let year = m[3] ?? defaultYear;
  if (year.length === 2) year = `20${year}`;
  if (!/^\d{4}$/.test(year)) return "";
  return `${year}-${month}-${String(dayNum).padStart(2, "0")}`;
}

/** Data de planilha em qualquer das grafias aceitas: ISO, por extenso (pt-BR) ou curta. */
export function parseSheetDate(raw: string, defaultYear: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (YMD_RE.test(s)) return s;
  return parseLongDateBr(s, defaultYear) || parseShortDate(s, defaultYear);
}

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
  // Não é UMA hora ("8-14h", "20h+", "depois das 18h"): fica o texto, não
  // some (04/09). O horário sugerido é uma janela para Compras, e a faixa é a
  // informação — reduzir a uma hora ou descartar era perder o que a área disse.
  if (!m) return /\d/.test(s) ? raw.trim() : "";
  const hh = Number(m[1]);
  const mm = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  if (hh > 23 || mm > 59) return "";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Horário como a logística escreve.
 *
 * Uma hora só ("14h30", "14:30", "1430", "9", "23h") vira "HH:MM". Faixa ou
 * janela ("20h+", "14-18h", "8h às 10h") fica COMO ESTÁ (04/09): antes virava a
 * primeira hora citada e a área perdia o "até 18h" — e Compras precisa da
 * janela inteira para escolher o voo. Sem nenhum dígito, é vazio.
 */
export function parsePtBrTime(raw: string): string {
  return parseTimeHHMM(raw);
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

/**
 * Formatos aceitos na colagem (colunas separadas por TAB):
 * - "grade"     : Função | Modal ida | Data ida | Hora desembarque | Modal volta | Data volta |
 *                 Hora embarque | Hotel | Passagem | Observação | qtd dia 1 | qtd dia 2 | …
 * - "briefing"  : Função | Modal ida | Data ida | Hora desembarque | Modal volta | Data volta |
 *                 Hora embarque | Hotel | qtd dia 1 | qtd dia 2 | …   (sem Passagem/Observação)
 * - "logistica" : a planilha real da logística — ver `findLogisticaHeader`. Aqui as
 *                 colunas NÃO têm posição fixa: são lidas pelo CABEÇALHO.
 *
 * Nos dois primeiros as quantidades seguem a ORDEM das colunas de dia da grade.
 */
export type PasteFormat = "grade" | "briefing" | "logistica";
export const PASTE_FORMAT_LABELS: Record<PasteFormat, string> = {
  grade: "Formato completo (com Passagem e Observação)",
  briefing: "Formato do briefing (Hotel e depois as quantidades)",
  logistica: "Planilha da logística (com ou sem a linha de datas)",
};
const QTY_COL_START: Record<"grade" | "briefing", number> = { grade: 10, briefing: 8 };

export interface PasteResult {
  rows: SuggestionGridRow[];
  /** Nomes de função não encontrados no catálogo, na ordem de leitura (pode repetir). */
  skippedNames: string[];
  /** Os mesmos nomes, sem repetição — é o que o diálogo oferece para mapear à mão. */
  unknownNames: string[];
  /**
   * Datas de coluna que a planilha traz COM quantidade mas estão fora do período
   * da grade. Só é preenchido no formato "logistica" (é o único que sabe a data de
   * cada coluna). Dias vazios fora do período não entram aqui — não há o que perder.
   */
  datesOutsideGrid: string[];
  /**
   * Células de quantidade cujo valor aplicado NÃO é o que estava escrito: texto
   * coagido pelo parseInt ("2x" → 2, "abc" → 0) ou número clampado pelo teto
   * (`QTY_MAX`) / pelo piso 0. O resumo transforma isso num aviso visível —
   * ajustar em silêncio esconderia diferenças entre a planilha e a grade.
   */
  adjustedQtyCells: number;
  /** Formato efetivamente usado (detectado ou forçado). */
  format: PasteFormat;
  /** true quando havia cabeçalho e ele foi ignorado. */
  hadHeader: boolean;
  /**
   * true quando a planilha da logística veio SEM a linha de datas e os dias foram
   * alinhados pela ordem do período da grade (ver `alignHeaderlessDayColumns`).
   * É um palpite: a tela DEVE avisar antes de aplicar, com algo como
   * "Sem a linha de datas — os dias foram alinhados pelo período da grade
   * (dd/mm a dd/mm). Confira antes de aplicar."
   *
   * Onde ligar isso na tela (`client/src/pages/scaling-suggestion.tsx`): no bloco do
   * preview da colagem, ao lado de `PASTE_FORMAT_LABELS[pastePreview.format]` /
   * `pastePreview.hadHeader` (hoje por volta da linha 986) — `summarizePaste` já
   * repassa o mesmo campo em `PasteSummary.alignedWithoutHeader`, e o período
   * (dd/mm a dd/mm) sai das `targetDates` que a própria tela já tem.
   */
  alignedWithoutHeader: boolean;
  /**
   * O que a leitura entendeu de cada coluna (só no formato "logistica", que é o
   * que passa pelo classificador): mapa papel → índice, de onde vieram as datas
   * dos dias, confiança e avisos prontos para exibir. Ver `PasteLayout`.
   */
  layout?: PasteLayout;
  /** Por que a leitura não produziu nada (quando aplicável). */
  problem?: "cabecalho-nao-encontrado";
}

export interface PasteOptions {
  /**
   * Mapeamento manual de nomes que o catálogo não reconhece:
   * { chave de `functionNameKey(nome colado)` → id da função }.
   */
  nameMap?: Record<string, string>;
}

const splitCols = (line: string) => line.split("\t").map((c) => c.trim());

/**
 * Lê uma célula de quantidade e diz se o valor aplicado difere do que estava
 * escrito: coerção do parseInt ("2x" → 2, "abc" → 0) ou clamp pelo teto
 * (`QTY_MAX`) / pelo piso 0. Célula vazia não é ajuste — é só um dia sem gente.
 */
export function readQtyCell(raw: string): { value: number; adjusted: boolean } {
  const s = raw.trim();
  if (!s) return { value: 0, adjusted: false };
  const n = parseInt(s, 10);
  const value = Number.isNaN(n) ? 0 : Math.max(0, Math.min(QTY_MAX, n));
  return { value, adjusted: !/^\d+$/.test(s) || n > QTY_MAX };
}

// ── Casamento tolerante de nomes de função ───────────────────────────────────

/** Plural pt-BR → singular, só o suficiente para casar nomes ("ativações" → "ativacao"). */
function depluralize(word: string): string {
  if (word.length > 4) {
    if (word.endsWith("oes") || word.endsWith("aes")) return `${word.slice(0, -3)}ao`;
    if (word.endsWith("ais")) return `${word.slice(0, -3)}al`;
    if (word.endsWith("eis")) return `${word.slice(0, -3)}el`;
  }
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/**
 * Chave de comparação de nome de função: sem acento, sem caixa, sem pontuação,
 * espaços repetidos colapsados e cada palavra no singular. É a mesma chave usada
 * no mapeamento manual guardado em localStorage — por isso é exportada.
 */
export function functionNameKey(name: string): string {
  const base = normalizeStr(name).replace(/[^a-z0-9]+/g, " ").trim();
  if (!base) return "";
  return base.split(" ").map(depluralize).join(" ");
}

/**
 * Localizador de função por nome colado, em três tentativas: (1) mapeamento manual
 * do usuário, (2) nome idêntico ignorando acento/caixa, (3) chave tolerante
 * (pontuação, espaços repetidos, singular/plural). Nunca "chuta" por semelhança —
 * o que não casar volta como não reconhecido para o usuário mapear.
 */
export function buildFunctionMatcher<T extends { id: string; name: string }>(
  functions: T[],
  nameMap?: Record<string, string>,
): (raw: string) => T | undefined {
  const exact = new Map<string, T>();
  const loose = new Map<string, T>();
  const byId = new Map<string, T>();
  for (const f of functions) {
    byId.set(f.id, f);
    const n = normalizeStr(f.name);
    if (n && !exact.has(n)) exact.set(n, f);
    const k = functionNameKey(f.name);
    if (k && !loose.has(k)) loose.set(k, f);
  }
  return (raw: string) => {
    const n = normalizeStr(raw);
    if (!n) return undefined;
    const key = functionNameKey(raw);
    const mappedId = nameMap?.[key] ?? nameMap?.[n];
    const mapped = mappedId ? byId.get(mappedId) : undefined;
    return mapped ?? exact.get(n) ?? loose.get(key);
  };
}

const dedupe = (names: string[]) => {
  const seen = new Set<string>();
  return names.filter((n) => {
    const k = functionNameKey(n);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Cabeçalho = 1ª coluna "Função" em qualquer grafia: com/sem acento, caixa livre,
 * singular ou plural e com sufixos ("Funções", "Função/Área", "Função - Área",
 * "FUNCAO "). O `(?![a-z0-9])` evita confundir com um NOME de função que por
 * acaso comece com "funcao". Reconhecer o cabeçalho importa duas vezes: ele é
 * pulado na leitura E não pode entrar como linha de dados na detecção de formato.
 */
const HEADER_FUNCTION_RE = /^func(ao|oes)(?![a-z0-9])/;
const isHeaderLine = (cols: string[]) => HEADER_FUNCTION_RE.test(normalizeStr(cols[0] ?? ""));
const isQtyToken = (s: string) => /^\d+$/.test(s);
/** Tokens que podem ser sim/não. "0" e "1" estão aqui de propósito: são ambíguos (quantidade ou sim/não). */
const YESNO_TOKENS = new Set(["", "sim", "s", "nao", "n", "x", "true", "false", "y", "yes", "no", "0", "1"]);

// ── Formato "logistica": a planilha real usada pela logística ────────────────

/**
 * Mapa das colunas da planilha da logística. Tudo é índice de coluna descoberto
 * NO CABEÇALHO (-1 = coluna ausente) porque essa planilha tem colunas vazias de
 * separação entre o bloco de viagem e o bloco de dias — qualquer contagem fixa
 * de posição erraria. As quantidades também são lidas pela DATA da coluna, não
 * pela ordem.
 *
 * Layout típico (a 1ª linha do arquivo é o título livre do evento e é ignorada):
 *
 *   (vazio) | ida | chegada (até...) | retorno | horario do retorno (a partir) |
 *   (vazio) | 08/set | 09/set | … | (vazias) | obs
 *
 * Semântica das duas colunas de horário:
 * - "chegada (até...)"              → horário de DESEMBARQUE da ida.
 * - "horario do retorno (a partir)" → horário de EMBARQUE da volta.
 */
export interface LogisticaHeader {
  /**
   * Índice da PRIMEIRA linha do bloco de cabeçalho dentro do texto colado. O bloco
   * pode ter mais de uma linha (ver `findLogisticaHeader`): as seguintes têm a 1ª
   * coluna vazia e, por isso, já são puladas na leitura dos dados.
   */
  lineIndex: number;
  colFunction: number;
  colDepartureDate: number;
  colArrivalTime: number;
  colReturnDate: number;
  colReturnTime: number;
  colObs: number;
  /** Colunas de dia na ordem da planilha (a data é resolvida depois, com a grade). */
  dayColumns: { index: number; raw: string }[];
}

/** Quantas linhas do topo podem conter o cabeçalho (título do evento costuma vir antes). */
const LOGISTICA_SCAN_LINES = 6;

/** "08/set", "08/09", "08/09/2026" — rótulo de coluna de dia (já normalizado). */
const DAY_HEADER_RE = /^\d{1,2}\s*[/\-.]\s*([a-z]{3,}\.?|\d{1,2})(\s*[/\-.]\s*\d{2,4})?$/;
const isDayHeaderCell = (normalized: string) =>
  DAY_HEADER_RE.test(normalized) && parseShortDate(normalized, "2000") !== "";

/**
 * Acha e mapeia o cabeçalho da planilha da logística nas primeiras linhas.
 *
 * O cabeçalho pode ocupar MAIS DE UMA LINHA — cada planilha do time monta de um
 * jeito, e as duas reais que chegaram são diferentes:
 *
 *   A) rótulos e datas na MESMA linha, e embaixo a linha de dias da semana:
 *      `| ida | chegada (até...) | retorno | horario do retorno | (vazia) | 08/set | 09/set | …`
 *      `|     |                  |         |                    |         | ter    | qua    | …`
 *   B) datas em uma linha e rótulos na linha SEGUINTE (com os dias da semana junto):
 *      `|     |                  |         |                    | (vazias) | 14/out | 15/out | … | obs`
 *      `| ida | chegada (até...) | retorno | horario do retorno | (vazias) | qua    | qui    | …`
 *
 * Por isso as linhas candidatas são COMBINADAS num mapa único: cada uma contribui
 * com o que souber (rótulos de viagem, colunas de data, coluna de observação) e a
 * primeira a definir cada coluna manda. A linha de dias da semana (ter/qua/qui…)
 * entra na varredura e simplesmente não contribui com nada.
 *
 * Só entram na combinação as linhas que (para NÃO confundir com os formatos
 * "grade"/"briefing", cujo cabeçalho começa com "Função"):
 * - têm a 1ª coluna VAZIA (é a coluna dos nomes de função, sem rótulo); e
 * - têm ≥ 3 colunas.
 * O resultado só vale se somar ≥ 2 colunas com data curta OU ≥ 2 rótulos de viagem.
 *
 * `lineIndex` é a PRIMEIRA linha aproveitada; as demais linhas do bloco são puladas
 * na leitura dos dados porque a 1ª coluna delas é vazia.
 */
export function findLogisticaHeader(grid: string[][]): LogisticaHeader | null {
  const limit = Math.min(grid.length, LOGISTICA_SCAN_LINES);
  const h: LogisticaHeader = {
    lineIndex: -1, colFunction: 0,
    colDepartureDate: -1, colArrivalTime: -1, colReturnDate: -1, colReturnTime: -1, colObs: -1,
    dayColumns: [],
  };
  let labels = 0;
  const takenDayColumns = new Set<number>();
  for (let i = 0; i < limit; i++) {
    const cols = grid[i];
    if (cols.length < 3) continue;
    if ((cols[0] ?? "").trim() !== "") continue; // a coluna da função não tem rótulo
    const before = { labels, days: h.dayColumns.length, obs: h.colObs };
    cols.forEach((raw, idx) => {
      const c = normalizeStr(raw);
      if (!c) return;
      if (isDayHeaderCell(c)) {
        if (!takenDayColumns.has(idx)) { takenDayColumns.add(idx); h.dayColumns.push({ index: idx, raw }); }
        return;
      }
      if (c.startsWith("obs")) { if (h.colObs < 0) h.colObs = idx; return; }
      if (c.includes("chegada") || c.includes("desembarque")) {
        if (h.colArrivalTime < 0) h.colArrivalTime = idx;
        labels++; return;
      }
      if (c.includes("retorno") || c.includes("volta")) {
        // "horario do retorno (a partir)" é HORA; "retorno" sozinho é DATA.
        if (c.includes("hora")) { if (h.colReturnTime < 0) h.colReturnTime = idx; }
        else if (h.colReturnDate < 0) h.colReturnDate = idx;
        labels++; return;
      }
      if (c === "ida" || c.startsWith("ida ") || c.includes("data ida") || c.includes("saida")) {
        if (h.colDepartureDate < 0) h.colDepartureDate = idx;
        labels++; return;
      }
      if (c.startsWith("hor")) { if (h.colReturnTime < 0) h.colReturnTime = idx; labels++; }
    });
    // Só marca o início do bloco quando a linha realmente acrescentou algo.
    const contributed = labels > before.labels || h.dayColumns.length > before.days || h.colObs !== before.obs;
    if (contributed && h.lineIndex < 0) h.lineIndex = i;
  }
  if (h.lineIndex < 0) return null;
  if (h.dayColumns.length < 2 && labels < 2) return null;
  h.dayColumns.sort((a, b) => a.index - b.index);
  return h;
}

/**
 * Data de uma coluna de dia → ISO. O ano quase nunca está no rótulo ("08/set"),
 * então ele vem da GRADE: se dia/mês bate com algum dia do período atual, usa
 * aquele ano; senão cai no ano do evento (`defaultYear`).
 */
export function resolveHeaderDate(raw: string, dates: string[], defaultYear: string): string {
  const s = raw.trim();
  if (!s) return "";
  const iso = parseShortDate(s, defaultYear);
  if (!iso) return "";
  const parts = s.split(/[/\-.\s]+/).filter(Boolean);
  if (parts.length >= 3) return iso; // o ano veio escrito no rótulo
  const mmdd = iso.slice(5);
  return dates.find((d) => d.slice(5) === mmdd) ?? iso;
}

// ── Classificador de colunas da colagem ─────────────────────────────────────

/**
 * A planilha da logística muda de evento para evento: às vezes os rótulos e as
 * datas estão na mesma linha do cabeçalho, às vezes em linhas separadas; às vezes
 * há uma coluna vazia entre o bloco de viagem e os dias, às vezes duas; e muita
 * gente cola só as LINHAS DE DADOS, sem cabeçalho nenhum. Por isso a leitura não
 * conta colunas: ela CLASSIFICA cada coluna pelo conteúdo, e usa o cabeçalho só
 * como reforço.
 *
 * O rito é:
 * 1. separar as linhas de CABEÇALHO (as primeiras sem nenhuma função reconhecível)
 *    das linhas de DADOS;
 * 2. montar o perfil de cada coluna olhando TODAS as linhas de dados (quantas
 *    células são vazias, nome de função, data, horário, inteiro pequeno, sim/não
 *    ou texto livre) e somar os rótulos que o cabeçalho der àquela coluna,
 *    combinando TODAS as linhas de cabeçalho (uma pode ter as datas e outra os
 *    rótulos);
 * 3. atribuir os papéis por maior evidência: função → datas de viagem → horários →
 *    hotel/passagem → dias → observação.
 *
 * O que a leitura entendeu volta em `PasteResult.layout` para a tela mostrar.
 */

export type PasteConfidence = "alta" | "media" | "baixa";

/** Papel → índice da coluna (-1 = a colagem não tem essa coluna). */
export interface PasteColumnMap {
  funcao: number;
  dataIda: number;
  horaChegada: number;
  dataVolta: number;
  horaRetorno: number;
  hotel: number;
  passagem: number;
  obs: number;
  /** Colunas de dia na ordem da planilha, já com a data resolvida. */
  dias: { index: number; date: string }[];
}

export interface PasteLayout {
  columns: PasteColumnMap;
  /** Linhas do topo tratadas como cabeçalho (e puladas na leitura). */
  headerLines: number[];
  /** true = a data de cada dia veio do cabeçalho; false = alinhada pelo período da grade. */
  daysFromHeader: boolean;
  /** Atalho de `!daysFromHeader`: é o palpite que a tela precisa avisar. */
  alignedWithoutHeader: boolean;
  confidence: PasteConfidence;
  /** Avisos prontos para exibir (pt-BR). */
  warnings: string[];
}

const SMALL_INT_RE = /^\d{1,2}$/;
const WEEKDAY_RE = /^(seg|ter|qua|qui|sex|sab|dom)\.?$/;
const YESNO_LABELS = new Set(["sim", "s", "nao", "n", "x", "true", "false", "y", "yes", "no"]);

/**
 * Célula de horário. Exige a marca "h" ou ":" — é ela que separa "23h"/"14-18h"/
 * "14:30" de uma data curta ("09/09") ou de uma quantidade ("2").
 */
const TIME_CHARS = /^[0-9h:+\-as]+$/;
export function isTimeCell(raw: string): boolean {
  const s = normalizeStr(raw).replace(/\s+/g, "");
  if (!s || !/[h:]/.test(s) || !TIME_CHARS.test(s)) return false;
  return parsePtBrTime(raw) !== "";
}

/** Idem, mas exigindo o "h" da planilha da logística ("10:00" do formato antigo não conta). */
export function isLogisticaTimeCell(raw: string): boolean {
  return normalizeStr(raw).includes("h") && isTimeCell(raw);
}

/**
 * A linha TEM A FORMA de uma linha de dados da logística? É o que permite
 * reconhecer a planilha quando o usuário cola só as linhas de dados: basta uma
 * pista forte nas posições do modelo — data por extenso em pt-BR na 2ª ou na 4ª
 * coluna, ou horário com "h" na 3ª/5ª com a coluna de data ao lado vazia ou com
 * data de verdade (senão "Aéreo | 09/09 | 10h" do formato antigo se passaria por
 * planilha da logística).
 */
function looksLikeLogisticaRow(cols: string[]): boolean {
  if (!(cols[0] ?? "").trim()) return false;
  if (isHeaderLine(cols)) return false;
  const SHAPE_YEAR = "2000"; // ano só para testar o formato da célula
  const dateAt = (i: number) => parseLongDateBr(cols[i] ?? "", SHAPE_YEAR) !== "";
  const timeAt = (i: number) => {
    if (!isLogisticaTimeCell(cols[i] ?? "")) return false;
    const dateCell = (cols[i - 1] ?? "").trim();
    return dateCell === "" || parseSheetDate(dateCell, SHAPE_YEAR) !== "";
  };
  return dateAt(1) || dateAt(3) || timeAt(2) || timeAt(4);
}

/** Alguma linha do texto colado tem a forma de dados da planilha da logística. */
export function hasLogisticaRowShape(grid: string[][]): boolean {
  return grid.some(looksLikeLogisticaRow);
}

type HeaderLabel = "" | "funcao" | "ida" | "chegada" | "retorno" | "horaRetorno" | "hotel" | "passagem" | "obs" | "dia" | "semana";

/** Que papel um RÓTULO de cabeçalho anuncia (a data curta volta junto, para o dia). */
function headerLabelOf(raw: string): { label: HeaderLabel; date: string } {
  const c = normalizeStr(raw);
  if (!c) return { label: "", date: "" };
  if (isDayHeaderCell(c)) return { label: "dia", date: raw.trim() };
  if (WEEKDAY_RE.test(c)) return { label: "semana", date: "" };
  if (HEADER_FUNCTION_RE.test(c)) return { label: "funcao", date: "" };
  if (c.startsWith("obs")) return { label: "obs", date: "" };
  if (c.startsWith("hotel") || c.includes("hospedagem")) return { label: "hotel", date: "" };
  if (c.includes("passagem")) return { label: "passagem", date: "" };
  if (c.includes("chegada") || c.includes("desembarque")) return { label: "chegada", date: "" };
  if (c.includes("retorno") || c.includes("volta") || c.includes("embarque")) {
    // "horario do retorno (a partir)" e "hora embarque" são HORA; "retorno"/"data volta" são DATA.
    const isTime = c.includes("hora") || c.includes("embarque");
    return { label: isTime ? "horaRetorno" : "retorno", date: "" };
  }
  if (c === "ida" || c.startsWith("ida ") || c.includes("data ida") || c.includes("saida")) return { label: "ida", date: "" };
  if (c.startsWith("hor")) return { label: "horaRetorno", date: "" };
  return { label: "", date: "" };
}

interface ColumnProfile {
  index: number;
  nonEmpty: number;
  funcName: number;
  date: number;
  time: number;
  smallInt: number;
  yesNo: number;
  /** Texto que não é data, hora, número nem sim/não. */
  text: number;
  label: HeaderLabel;
  /** Rótulo de data curta do cabeçalho ("08/set"), como veio escrito. */
  headerDate: string;
}

/** Uma linha de cabeçalho: não traz função nenhuma e só tem rótulos/datas/dias da semana. */
function isHeaderish(cols: string[]): boolean {
  let labels = 0;
  let days = 0;
  let weekdays = 0;
  let nonEmpty = 0;
  let others = 0;
  for (const raw of cols) {
    if (!raw.trim()) continue;
    nonEmpty++;
    const { label } = headerLabelOf(raw);
    if (label === "dia") days++;
    else if (label === "semana") weekdays++;
    else if (label) labels++;
    else others++;
  }
  if (nonEmpty === 0) return false;
  if (labels >= 2 || days >= 2 || weekdays >= 2) return true;
  // Linha de título do evento: uma única célula de texto, sem número nem data.
  return nonEmpty === 1 && others === 1 && !cols.some((c) => SMALL_INT_RE.test(c.trim()));
}

/** Quantas linhas do topo podem ser cabeçalho (o título do evento costuma vir antes). */
const HEADER_SCAN_LINES = 6;

interface SplitLines {
  headerLines: number[];
  dataLines: number[];
}
function splitHeaderAndData(grid: string[][], match: (raw: string) => { id: string } | undefined): SplitLines {
  const headerLines: number[] = [];
  const dataLines: number[] = [];
  grid.forEach((cols, i) => {
    if (cols.every((c) => !c.trim())) return; // linha em branco: não é nada
    const hasFunction = cols.some((c) => c.trim() && match(c));
    if (!hasFunction && i < HEADER_SCAN_LINES && isHeaderish(cols)) { headerLines.push(i); return; }
    dataLines.push(i);
  });
  return { headerLines, dataLines };
}

function profileColumns(
  grid: string[][],
  lines: SplitLines,
  match: (raw: string) => { id: string } | undefined,
  defaultYear: string,
): ColumnProfile[] {
  let maxCols = 0;
  for (const i of [...lines.headerLines, ...lines.dataLines]) maxCols = Math.max(maxCols, grid[i].length);
  const profiles: ColumnProfile[] = [];
  for (let j = 0; j < maxCols; j++) {
    const p: ColumnProfile = {
      index: j, nonEmpty: 0, funcName: 0, date: 0, time: 0, smallInt: 0, yesNo: 0, text: 0,
      label: "", headerDate: "",
    };
    for (const i of lines.dataLines) {
      const raw = (grid[i][j] ?? "").trim();
      if (!raw) continue;
      p.nonEmpty++;
      if (match(raw)) p.funcName++;
      const isDate = parseSheetDate(raw, defaultYear) !== "";
      const isTime = !isDate && isTimeCell(raw);
      const isInt = !isDate && !isTime && SMALL_INT_RE.test(raw);
      const isYesNo = YESNO_LABELS.has(normalizeStr(raw));
      if (isDate) p.date++;
      if (isTime) p.time++;
      if (isInt) p.smallInt++;
      if (isYesNo) p.yesNo++;
      if (!isDate && !isTime && !isInt && !isYesNo) p.text++;
    }
    // O cabeçalho é reforço: a 1ª linha que der um rótulo à coluna manda.
    for (const i of lines.headerLines) {
      const { label, date } = headerLabelOf(grid[i][j] ?? "");
      if (!label || label === "semana") continue;
      if (!p.label) p.label = label;
      if (label === "dia" && !p.headerDate) p.headerDate = date;
    }
    profiles.push(p);
  }
  return profiles;
}

/** dd/mm legível, para os avisos. */
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/**
 * Alinha as colunas de dia QUANDO NÃO HÁ datas no cabeçalho.
 *
 * Sem as datas, o bloco de dias é uma janela contígua de `dates.length` colunas
 * depois do bloco de viagem — e só o conteúdo diz onde ela começa. Duas evidências
 * são combinadas:
 *
 * - GEOMETRIA: a janela precisa conter todos os inteiros da colagem, e fica o mais
 *   à ESQUERDA possível respeitando isso (colunas vazias antes dela são as
 *   separadoras do modelo, quantas forem).
 * - DATA DE VOLTA: numa planilha da logística, quem viaja costuma trabalhar até o
 *   dia em que embarca de volta. Então cada linha com data de volta dentro do
 *   período "vota" em um começo de janela (última coluna com número − posição da
 *   data de volta na grade). Vence o mais votado, se ele couber na geometria.
 *
 * Concordância entre as duas → confiança "media"; discordância (ou nenhuma data de
 * volta para conferir) → "baixa", e o aviso diz para conferir antes de aplicar.
 */
function alignDayColumns(
  grid: string[][],
  dataLines: number[],
  candidates: number[],
  dates: string[],
  colReturnDate: number,
  defaultYear: string,
): { dias: { index: number; date: string }[]; confidence: PasteConfidence; warnings: string[] } {
  const warnings: string[] = [];
  const periodo = dates.length ? `${ddmm(dates[0])} a ${ddmm(dates[dates.length - 1])}` : "";
  const aviso = `Sem a linha de datas — os dias foram alinhados pelo período da grade (${periodo}). Confira antes de aplicar.`;
  if (dates.length === 0 || candidates.length === 0) return { dias: [], confidence: "baixa", warnings: [aviso] };

  const isInt = (i: number, j: number) => SMALL_INT_RE.test((grid[i][j] ?? "").trim());
  const first = candidates[0];
  let firstInt = -1;
  let lastInt = -1;
  for (const i of dataLines) {
    for (const j of candidates) {
      if (!isInt(i, j)) continue;
      if (firstInt < 0 || j < firstInt) firstInt = j;
      if (j > lastInt) lastInt = j;
    }
  }
  if (firstInt < 0) return { dias: [], confidence: "baixa", warnings: [aviso] };

  // Geometria: o mais à esquerda que ainda cobre o último número.
  let start = Math.max(first, lastInt - dates.length + 1);
  if (start > firstInt) start = firstInt; // bloco maior que a grade: o excedente vira "dia fora do período"
  const fits = (s: number) => s >= first && s <= firstInt && s + dates.length - 1 >= lastInt;

  // Votação pela data de volta.
  const votes = new Map<number, number>();
  if (colReturnDate >= 0) {
    for (const i of dataLines) {
      const back = parseSheetDate((grid[i][colReturnDate] ?? "").trim(), defaultYear);
      const backIdx = dates.indexOf(back);
      if (backIdx < 0) continue;
      let lastNum = -1;
      for (const j of candidates) if (isInt(i, j)) lastNum = j;
      if (lastNum < 0) continue;
      const s = lastNum - backIdx;
      votes.set(s, (votes.get(s) ?? 0) + 1);
    }
  }
  const tally: { start: number; count: number }[] = [];
  votes.forEach((count, start) => tally.push({ start, count }));
  const winner = tally.sort((a, b) => b.count - a.count || a.start - b.start)[0];
  let confidence: PasteConfidence = "baixa";
  // A data de volta é evidência mais forte que a geometria: ela vence desde que não
  // jogue nenhum número para ANTES do bloco (aí sim haveria quantidade perdida).
  if (winner && winner.start >= first && winner.start <= firstInt) {
    confidence = winner.start === start ? "media" : "baixa";
    if (winner.start !== start) {
      warnings.push("As datas de volta e a posição das colunas discordam sobre onde começam os dias — confira a grade.");
    }
    start = winner.start;
    if (!fits(start)) {
      warnings.push("A planilha tem mais colunas de dia do que o período da grade — as que sobram viram dias fora do período.");
    }
  } else if (!winner) {
    warnings.push("Nenhuma linha tem data de volta dentro do período para conferir o alinhamento dos dias.");
  }
  warnings.unshift(aviso);
  return { dias: dates.map((date, k) => ({ index: start + k, date })), confidence, warnings };
}

/**
 * Atribui os papéis às colunas por maior evidência. Colunas 100% vazias não
 * ganham papel nenhum (só entram no bloco de dias, se caírem dentro dele).
 */
function assignColumnRoles(
  grid: string[][],
  lines: SplitLines,
  profiles: ColumnProfile[],
  dates: string[],
  defaultYear: string,
): PasteLayout {
  const used = new Set<number>();
  const take = (i: number) => { if (i >= 0) used.add(i); return i; };
  const byLabel = (label: HeaderLabel) => profiles.find((p) => p.label === label)?.index ?? -1;
  const free = (p: ColumnProfile) => !used.has(p.index);
  /** "majoritariamente X": X é o conteúdo mais comum das células preenchidas. */
  const mostly = (count: number, p: ColumnProfile) => count > 0 && count * 2 >= p.nonEmpty;

  // (1) FUNÇÃO: a coluna com mais nomes do catálogo; sem catálogo, a 1ª com texto.
  let funcao = byLabel("funcao");
  if (funcao < 0) {
    const best = profiles.filter((p) => p.funcName > 0).sort((a, b) => b.funcName - a.funcName || a.index - b.index)[0];
    funcao = best ? best.index : (profiles.find((p) => p.text > 0)?.index ?? 0);
  }
  take(funcao);

  // (2) DATAS de viagem: as colunas majoritariamente data; a 1ª é ida, a 2ª é volta.
  //     O rótulo do cabeçalho, quando existe, manda.
  const dateCols = profiles.filter((p) => free(p) && mostly(p.date, p)).map((p) => p.index);
  const dataIda = take(byLabel("ida") >= 0 ? byLabel("ida") : (dateCols[0] ?? -1));
  const dataVolta = take(byLabel("retorno") >= 0 ? byLabel("retorno") : (dateCols.find((i) => i !== dataIda) ?? -1));

  // (3) HORÁRIOS: colunas majoritariamente horário. Sem rótulo, vale a vizinhança —
  //     o horário depois da data de ida é o desembarque; depois da volta, o embarque.
  const timeCols = profiles.filter((p) => free(p) && mostly(p.time, p)).map((p) => p.index);
  const afterIda = timeCols.find((i) => i > dataIda && (dataVolta < 0 || i < dataVolta));
  const horaChegada = take(byLabel("chegada") >= 0 ? byLabel("chegada") : (dataIda >= 0 ? afterIda ?? -1 : timeCols[0] ?? -1));
  const afterVolta = timeCols.find((i) => i > dataVolta && i !== horaChegada);
  const horaRetorno = take(
    byLabel("horaRetorno") >= 0 ? byLabel("horaRetorno")
      : dataVolta >= 0 ? afterVolta ?? -1
        : timeCols.find((i) => i !== horaChegada) ?? -1,
  );

  // (4) HOTEL/PASSAGEM: sim/não é ambíguo demais sem rótulo (um "1" tanto pode ser
  //     "sim" quanto uma vaga), então só entram quando o cabeçalho os nomeia.
  const hotel = take(byLabel("hotel"));
  const passagem = take(byLabel("passagem"));
  const obsLabel = take(byLabel("obs"));

  // (5) DIAS: as colunas de inteiro pequeno (as vazias no meio contam, são dias sem
  //     ninguém). Com datas no cabeçalho, cada coluna já sabe seu dia; sem elas, o
  //     bloco é alinhado pelo período da grade.
  const headerDays = profiles
    .filter((p) => free(p) && p.headerDate)
    .map((p) => ({ index: p.index, date: resolveHeaderDate(p.headerDate, dates, defaultYear) }))
    .filter((d) => d.date);
  let dias = headerDays;
  let daysFromHeader = headerDays.length > 0;
  let confidence: PasteConfidence = "alta";
  let warnings: string[] = [];
  if (!daysFromHeader) {
    const candidates = profiles
      .filter((p) => free(p) && p.text === 0 && p.date === 0 && p.time === 0 && p.yesNo === 0)
      .map((p) => p.index)
      .filter((i) => i > Math.max(funcao, dataIda, horaChegada, dataVolta, horaRetorno, hotel, passagem));
    const aligned = alignDayColumns(grid, lines.dataLines, candidates, dates, dataVolta, defaultYear);
    dias = aligned.dias;
    confidence = aligned.confidence;
    warnings = aligned.warnings;
  }
  for (const d of dias) used.add(d.index);

  // (6) OBSERVAÇÃO: o texto livre que sobrou — normalmente a última coluna.
  let obs = obsLabel;
  if (obs < 0) {
    const textCols = profiles.filter((p) => free(p) && p.text > 0).map((p) => p.index);
    obs = textCols.length ? textCols[textCols.length - 1] : -1;
  }
  take(obs);

  return {
    columns: { funcao, dataIda, horaChegada, dataVolta, horaRetorno, hotel, passagem, obs, dias },
    headerLines: lines.headerLines,
    daysFromHeader,
    alignedWithoutHeader: !daysFromHeader,
    confidence,
    warnings,
  };
}

/** Lê a colagem como matriz e devolve o que cada coluna significa. */
export function classifyPasteColumns(
  grid: string[][],
  functions: { id: string; name: string }[],
  dates: string[],
  defaultYear: string,
  options?: PasteOptions,
): PasteLayout {
  const match = buildFunctionMatcher(functions, options?.nameMap);
  const lines = splitHeaderAndData(grid, match);
  const profiles = profileColumns(grid, lines, match, defaultYear);
  return assignColumnRoles(grid, lines, profiles, dates, defaultYear);
}

/** Linha só com o nome da função e mais nada: não é vaga nenhuma, é resto de planilha. */
const isEmptyDataRow = (cols: string[], colFunction: number) =>
  cols.every((c, i) => i === colFunction || !c.trim());

function parseLogisticaText(
  text: string,
  functions: { id: string; name: string }[],
  dates: string[],
  defaultYear: string,
  options?: PasteOptions,
): PasteResult {
  const grid = text.replace(/\r/g, "").split("\n").map(splitCols);
  // Sem cabeçalho E sem nenhuma linha com a cara da planilha, não há o que ler:
  // avisar é melhor do que inventar colunas a partir de um texto qualquer.
  if (!findLogisticaHeader(grid) && !hasLogisticaRowShape(grid)) {
    return {
      rows: [], skippedNames: [], unknownNames: [], datesOutsideGrid: [], adjustedQtyCells: 0,
      format: "logistica", hadHeader: false, alignedWithoutHeader: false, problem: "cabecalho-nao-encontrado",
    };
  }
  const layout = classifyPasteColumns(grid, functions, dates, defaultYear, options);
  const cols3 = layout.columns;
  const inGrid = new Set(dates);
  const match = buildFunctionMatcher(functions, options?.nameMap);
  const cell = (cols: string[], idx: number) => (idx >= 0 ? (cols[idx] ?? "").trim() : "");
  const headerLines = new Set(layout.headerLines);
  const lastDayCol = cols3.dias.length ? cols3.dias[cols3.dias.length - 1].index : -1;
  const lastDate = dates.length ? dates[dates.length - 1] : "";

  const rows: SuggestionGridRow[] = [];
  const skippedNames: string[] = [];
  const outside = new Set<string>();
  let adjustedQtyCells = 0;
  for (let i = 0; i < grid.length; i++) {
    if (headerLines.has(i)) continue;
    const cols = grid[i];
    const name = cell(cols, cols3.funcao);
    if (!name || isHeaderLine(cols)) continue;
    // Linha sem viagem e sem nenhuma quantidade não vira vaga — e também não é
    // "nome não reconhecido": a planilha só listou a função e deixou tudo em branco.
    if (isEmptyDataRow(cols, cols3.funcao)) continue;
    const func = match(name);
    if (!func) { skippedNames.push(name); continue; }

    const row = emptyGridRow(func.id, func.name, dates, `${func.id}-paste-${Date.now()}-${i}`);
    row.flightDepartureDate = parseSheetDate(cell(cols, cols3.dataIda), defaultYear);
    row.flightArrivalSuggestedTime = parsePtBrTime(cell(cols, cols3.horaChegada));
    row.flightReturnDate = parseSheetDate(cell(cols, cols3.dataVolta), defaultYear);
    row.flightReturnSuggestedTime = parsePtBrTime(cell(cols, cols3.horaRetorno));
    row.observations = cell(cols, cols3.obs);
    // Sem coluna de hotel na planilha, vaga com VIAGEM entra com hotel marcado
    // (regra do dono, 28/08). Com a coluna presente, ela manda.
    row.needsAccommodation = cols3.hotel >= 0
      ? parseYesNo(cell(cols, cols3.hotel))
      : !!(row.needsTicket || row.transportModeIda || row.transportModeVolta || row.flightDepartureDate || row.flightReturnDate);
    // Quando a planilha não tem coluna de passagem, quem viaja (tem data de ida ou
    // de volta) precisa de passagem; as linhas "local" ficam sem nada. Hotel e os
    // modais de ida/volta continuam em branco, para preencher na grade.
    row.needsTicket = cols3.passagem >= 0
      ? parseYesNo(cell(cols, cols3.passagem))
      : !!(row.flightDepartureDate || row.flightReturnDate);

    for (const dc of cols3.dias) {
      const q = readQtyCell(cell(cols, dc.index));
      if (q.adjusted) adjustedQtyCells++;
      if (q.value <= 0) continue;
      if (inGrid.has(dc.date)) row.quantities[dc.date] = q.value;
      else outside.add(dc.date); // fora do período: a tela oferece ampliar a grade
    }
    // Sem as datas do cabeçalho, um número DEPOIS do bloco de dias só pode ser um
    // dia seguinte ao fim da grade (até onde a grade conseguiria ampliar).
    if (layout.alignedWithoutHeader && lastDayCol >= 0 && lastDate) {
      for (let j = lastDayCol + 1; j < cols.length; j++) {
        const raw = (cols[j] ?? "").trim();
        if (!raw || !SMALL_INT_RE.test(raw)) continue;
        const offset = j - lastDayCol;
        if (parseInt(raw, 10) > 0 && offset <= PERIOD_MARGIN_DAYS) outside.add(addDaysYmd(lastDate, offset));
      }
    }
    rows.push(row);
  }
  return {
    rows, skippedNames, unknownNames: dedupe(skippedNames),
    datesOutsideGrid: Array.from(outside).sort(),
    adjustedQtyCells,
    format: "logistica",
    hadHeader: layout.headerLines.length > 0,
    alignedWithoutHeader: layout.alignedWithoutHeader,
    layout,
  };
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

/**
 * Detecta o formato da colagem, nesta ordem:
 *
 * 0. Cabeçalho da planilha da logística (1ª coluna vazia + colunas de dia/rótulos
 *    de viagem) → "logistica". Vem antes porque esse formato não tem posição fixa.
 * 0b. FORMA das linhas de dados (data por extenso na 2ª/4ª coluna ou horário com
 *    "h" na 3ª/5ª) → "logistica" sem cabeçalho. Também vem antes de tudo: colar só
 *    as linhas de dados é o normal de quem seleciona no Excel, e sem essa regra a
 *    planilha caía em "briefing" e os dias saíam trocados EM SILÊNCIO.
 * 1. Cabeçalho reconhecido → decide pelas colunas "Passagem"/"Observação".
 * 2. Texto livre na 10ª coluna, ou sim/não por extenso na 9ª → formato da grade.
 * 3. POSIÇÃO das colunas (só quando o nº de dias da grade é conhecido): vence o
 *    formato cujo total de colunas depois do bloco fixo bate EXATAMENTE com o nº
 *    de dias — briefing = 8 colunas fixas, grade = 10. É o que desempata a grade
 *    de 1 dia, em que a quantidade "0"/"1" é indistinguível de um sim/não.
 * 4. Quantidade inequívoca (número ≥ 2 na 9ª coluna, ou número na 10ª) → briefing.
 * 5. Linhas curtas: se nenhuma linha alcança a 11ª coluna e da 9ª em diante só há
 *    números, ler como "grade" não produziria quantidade nenhuma → briefing.
 * 6. Nada disso → grade (formato completo, o padrão da tela).
 */
export function detectPasteFormat(text: string, options?: { dayCount?: number }): { format: PasteFormat; hadHeader: boolean } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { format: "grade", hadHeader: false };
  const grid = lines.map(splitCols);
  if (findLogisticaHeader(grid)) return { format: "logistica", hadHeader: true }; // (0)
  if (hasLogisticaRowShape(grid)) return { format: "logistica", hadHeader: false }; // (0b)
  const first = splitCols(lines[0]);
  if (isHeaderLine(first)) {
    const norm = first.map(normalizeStr);
    const hasGradeCols = norm.some((c) => c.startsWith("passagem") || c.startsWith("observ"));
    return { format: hasGradeCols ? "grade" : "briefing", hadHeader: true };
  }

  let maxCols = 0;
  let sawQty = false; // número que não pode ser sim/não
  let tailAllNumeric = true; // da 9ª coluna em diante só há números (ou vazios)
  for (const line of lines) {
    const cols = splitCols(line);
    maxCols = Math.max(maxCols, cols.length);
    const c8 = cols[8] ?? "", c9 = cols[9] ?? "";
    // (2) Observação com texto livre ou Passagem com sim/não explícito → formato da grade.
    if ((c9 && !isQtyToken(c9)) || (c8 && !isQtyToken(c8) && YESNO_TOKENS.has(normalizeStr(c8)))) return { format: "grade", hadHeader: false };
    if ((c8 && !YESNO_TOKENS.has(normalizeStr(c8)) && isQtyToken(c8)) || (c9 && isQtyToken(c9))) sawQty = true;
    for (let j = QTY_COL_START.briefing; j < cols.length; j++) if (cols[j] && !isQtyToken(cols[j])) tailAllNumeric = false;
  }

  // (3) Desempate por posição — só quando um formato encaixa e o outro não.
  const dayCount = options?.dayCount ?? 0;
  if (dayCount > 0) {
    const briefingFits = maxCols - QTY_COL_START.briefing === dayCount;
    const gradeFits = maxCols - QTY_COL_START.grade === dayCount;
    if (briefingFits && !gradeFits && tailAllNumeric) return { format: "briefing", hadHeader: false };
    if (gradeFits && !briefingFits) return { format: "grade", hadHeader: false };
  }

  if (sawQty) return { format: "briefing", hadHeader: false }; // (4)
  // (5) No formato da grade não sobraria NENHUMA coluna de dia.
  if (tailAllNumeric && maxCols > QTY_COL_START.briefing && maxCols <= QTY_COL_START.grade) return { format: "briefing", hadHeader: false };
  return { format: "grade", hadHeader: false }; // (6)
}

export function parsePastedRows(
  text: string,
  functions: { id: string; name: string }[],
  dates: string[],
  defaultYear: string,
  forcedFormat?: PasteFormat,
  options?: PasteOptions,
): PasteResult {
  const rows: SuggestionGridRow[] = [];
  const skippedNames: string[] = [];
  // O nº de dias da grade é o melhor desempate quando "0"/"1" pode ser quantidade ou sim/não.
  const detected = detectPasteFormat(text, { dayCount: dates.length });
  const format = forcedFormat ?? detected.format;
  if (format === "logistica") return parseLogisticaText(text, functions, dates, defaultYear, options);
  const qtyStart = QTY_COL_START[format];
  const lines = text.trim().split(/\r?\n/);
  const match = buildFunctionMatcher(functions, options?.nameMap);
  let headerSkipped = false;
  let adjustedQtyCells = 0;
  const seenHeaderLines = new Set<string>();
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const cols = splitCols(line);
    if (isHeaderLine(cols)) {
      const headerKey = cols.join("\t");
      if (!headerSkipped && rows.length === 0 && skippedNames.length === 0) {
        headerSkipped = true;
        seenHeaderLines.add(headerKey);
        return;
      }
      // Cabeçalho REPETIDO no meio do texto (duas colagens emendadas): pular de
      // novo, em vez de devolvê-lo como "função não reconhecida".
      if (seenHeaderLines.has(headerKey)) return;
    }
    const name = cols[0];
    if (!name) return;
    const func = match(name);
    if (!func) { skippedNames.push(name); return; }
    const row = emptyGridRow(func.id, func.name, dates, `${func.id}-paste-${Date.now()}-${i}`);
    row.transportModeIda = parseTransportMode(cols[1] ?? "");
    row.flightDepartureDate = parseShortDate(cols[2] ?? "", defaultYear);
    row.flightArrivalSuggestedTime = parseTimeHHMM(cols[3] ?? "");
    row.transportModeVolta = parseTransportMode(cols[4] ?? "");
    row.flightReturnDate = parseShortDate(cols[5] ?? "", defaultYear);
    row.flightReturnSuggestedTime = parseTimeHHMM(cols[6] ?? "");
    row.needsAccommodation = parseYesNo(cols[7] ?? "");
    if (format === "grade") {
      row.needsTicket = parseYesNo(cols[8] ?? "");
      row.observations = cols[9] ?? "";
    }
    for (let j = qtyStart; j < cols.length && j - qtyStart < dates.length; j++) {
      const q = readQtyCell(cols[j] ?? "");
      if (q.adjusted) adjustedQtyCells++;
      row.quantities[dates[j - qtyStart]] = q.value;
    }
    rows.push(row);
  });
  return {
    rows, skippedNames, unknownNames: dedupe(skippedNames), datesOutsideGrid: [], adjustedQtyCells,
    format, hadHeader: headerSkipped, alignedWithoutHeader: false,
  };
}

/** Resumo legível de uma colagem — o que o diálogo mostra ao vivo antes de aplicar. */
export interface PasteSummary {
  format: PasteFormat;
  hadHeader: boolean;
  /** Linhas de dados consideradas na leitura (reconhecidas + não reconhecidas). */
  lines: number;
  /** Linhas cuja função foi encontrada no catálogo (é o que seria aplicado). */
  recognized: number;
  /** Nomes que o catálogo não reconheceu, sem repetição. */
  unknownNames: string[];
  /** Dias distintos da grade que vieram com quantidade > 0. */
  mappedDays: number;
  /** Dias com quantidade que caem fora do período da grade (só no formato da logística). */
  outsideDays: number;
  /** Linhas reconhecidas que não trouxeram nenhuma quantidade. */
  rowsWithoutQty: number;
  /** Células de quantidade coagidas ("2x" → 2) ou clampadas pelo teto — ver `PasteResult.adjustedQtyCells`. */
  adjustedQtyCells: number;
  /**
   * Planilha da logística colada SEM a linha de datas: os dias foram alinhados
   * pela ordem do período da grade. A tela deve avisar antes de aplicar — ver o
   * comentário em `PasteResult.alignedWithoutHeader`.
   */
  alignedWithoutHeader: boolean;
  /** Quanta certeza a leitura tem do mapa de colunas (só no formato "logistica"). */
  confidence?: PasteConfidence;
  /** Avisos prontos para exibir (pt-BR) — inclui o do alinhamento sem cabeçalho. */
  warnings: string[];
  /** Mapa papel → coluna, para a tela mostrar o que foi entendido. */
  columns?: PasteColumnMap;
  /** Repassa o problema estrutural da leitura (ex.: cabeçalho da logística ausente). */
  problem?: PasteResult["problem"];
}

/** Conta o que a leitura produziu, sem tocar na grade (função pura, usada no preview do diálogo). */
export function summarizePaste(res: PasteResult): PasteSummary {
  const days = new Set<string>();
  let rowsWithoutQty = 0;
  for (const row of res.rows) {
    let hasQty = false;
    for (const [date, qty] of Object.entries(row.quantities)) {
      if (qty > 0) { days.add(date); hasQty = true; }
    }
    if (!hasQty) rowsWithoutQty += 1;
  }
  // Ajuste silencioso de quantidade ("2x" → 2, clamp no teto) vira aviso visível.
  const warnings = [...(res.layout?.warnings ?? [])];
  if (res.adjustedQtyCells > 0) {
    warnings.push(`${res.adjustedQtyCells} célula(s) de quantidade foram ajustadas — confira`);
  }
  return {
    format: res.format,
    hadHeader: res.hadHeader,
    lines: res.rows.length + res.skippedNames.length,
    recognized: res.rows.length,
    unknownNames: res.unknownNames,
    mappedDays: days.size,
    outsideDays: res.datesOutsideGrid.length,
    rowsWithoutQty,
    adjustedQtyCells: res.adjustedQtyCells,
    alignedWithoutHeader: res.alignedWithoutHeader,
    confidence: res.layout?.confidence,
    warnings,
    columns: res.layout?.columns,
    problem: res.problem,
  };
}

/** Funções da colagem que já existem na grade (para pedir confirmação antes de substituir). */
export function pasteConflicts(existing: SuggestionGridRow[], pasted: SuggestionGridRow[]): string[] {
  const present = new Map(existing.map((r) => [r.functionId, r.functionName]));
  const seen = new Set<string>();
  const names: string[] = [];
  for (const p of pasted) {
    if (present.has(p.functionId) && !seen.has(p.functionId)) { seen.add(p.functionId); names.push(present.get(p.functionId)!); }
  }
  return names;
}

/**
 * Aplica a colagem SEM duplicar: linhas já na grade com a mesma função são
 * substituídas (na posição da primeira ocorrência); funções novas entram ao final.
 */
export function mergePastedRows(existing: SuggestionGridRow[], pasted: SuggestionGridRow[]): SuggestionGridRow[] {
  const byFunction = new Map<string, SuggestionGridRow[]>();
  for (const p of pasted) {
    const list = byFunction.get(p.functionId) ?? [];
    list.push(p);
    byFunction.set(p.functionId, list);
  }
  const out: SuggestionGridRow[] = [];
  const placed = new Set<string>();
  for (const row of existing) {
    const repl = byFunction.get(row.functionId);
    if (!repl) { out.push(row); continue; }
    if (!placed.has(row.functionId)) { placed.add(row.functionId); out.push(...repl); }
  }
  byFunction.forEach((list, fid) => { if (!placed.has(fid)) out.push(...list); });
  return out;
}

export interface RowValidation {
  /** Impedem o envio. */
  errors: string[];
  /** Só avisam (envio permitido). */
  warnings: string[];
}
const NO_ISSUES: RowValidation = { errors: [], warnings: [] };

// ── Totais por dia (tfoot da grade) ─────────────────────────────────────────

export interface DayTotalsSummary {
  /** Total de pessoas em cada dia da grade ("YYYY-MM-DD" → soma das linhas). */
  byDay: Record<string, number>;
  /** Soma de todos os dias (= pessoas-dia da grade). */
  grand: number;
  /** Dia de maior total ("" quando a grade não tem quantidade nenhuma). Empate: vence o primeiro dia. */
  peakDate: string;
  peakTotal: number;
}

/** Totais por coluna para o rodapé "Pessoas por dia" + o pico do evento. */
export function totalsByDay(rows: SuggestionGridRow[], dates: string[]): DayTotalsSummary {
  const byDay: Record<string, number> = {};
  let grand = 0;
  let peakDate = "";
  let peakTotal = 0;
  for (const d of dates) {
    let t = 0;
    for (const row of rows) t += row.quantities[d] || 0;
    byDay[d] = t;
    grand += t;
    if (t > peakTotal) { peakTotal = t; peakDate = d; }
  }
  return { byDay, grand, peakDate, peakTotal };
}

// ── Copiar de outro evento ──────────────────────────────────────────────────

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

/** Problemas por linha: erros bloqueiam o envio, avisos não. Linha sem quantidade é ignorada. */
export function validateGridRow(row: SuggestionGridRow): RowValidation {
  const hasQty = Object.values(row.quantities).some((q) => q > 0);
  if (!hasQty) return NO_ISSUES; // linha vazia é ignorada no envio
  const errors: string[] = [];
  const warnings: string[] = [];
  const hhmm = /^\d{2}:\d{2}$/;
  // Horário sugerido é texto livre com faixa (04/09): "8-14h", "20h+" valem.
  // Só é erro quando não tem nenhum dígito (não dá para Compras usar).
  const horarioOk = (v: string) => /[0-9]/.test(v) && v.trim().length <= 40;
  if (row.flightArrivalSuggestedTime && !horarioOk(row.flightArrivalSuggestedTime)) errors.push("horário de desembarque inválido (ex.: 11:00 ou 8-14h)");
  if (row.flightReturnSuggestedTime && !horarioOk(row.flightReturnSuggestedTime)) errors.push("horário de embarque inválido (ex.: 11:00 ou 8-14h)");
  if (row.flightDepartureDate && row.flightReturnDate && row.flightReturnDate < row.flightDepartureDate) errors.push("data de volta anterior à data de ida");
  if (row.needsTicket && (!row.flightDepartureDate || !row.flightReturnDate)) warnings.push("passagem marcada sem data de ida/volta");
  if (errors.length === 0 && warnings.length === 0) return NO_ISSUES;
  return { errors, warnings };
}

/**
 * Conteúdo REAL de um campo de logística, ou `null` quando não há nada.
 *
 * Não basta checar `null`/`""`: o dado vem de planilha e de import antigo, onde
 * "vazio" às vezes é um travessão. Sem esta normalização o chip da lista virava
 * "Volta · —", que AFIRMA uma viagem que não existe — pior do que não mostrar
 * nada. Conta como ausência: vazio e qualquer string só de traços/pontuação
 * ("—", "-", "--", "--:--", "/", ".").
 *
 * Mora aqui (e não no arquivo dos chips) porque é regra de leitura de dado, com
 * teste próprio — os chips só a consomem.
 */
const EMPTY_MARKS = /^[\s‐-―\-.:_/]*$/;
export function legValue(v: string | Date | null | undefined): string | Date | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (!s || EMPTY_MARKS.test(s)) return null;
  return s;
}
