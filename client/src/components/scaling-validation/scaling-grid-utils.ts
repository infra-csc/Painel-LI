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
  if (!m) return "";
  const hh = Number(m[1]);
  const mm = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  if (hh > 23 || mm > 59) return "";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Horário como a logística escreve → "HH:MM".
 *
 * Além do que `parseTimeHHMM` já entende ("14h30", "14:30", "1430", "9"), aceita
 * as formas soltas da planilha e sempre fica com a PRIMEIRA hora citada, porque
 * as duas colunas de horário são limites de início:
 * - "23h" → 23:00 · "11h" → 11:00
 * - "20h+" → 20:00 (a partir das 20h)
 * - "14-18h" → 14:00 (a partir das 14h; o 18h é só o fim da janela)
 * - "8h às 10h" → 08:00
 */
export function parsePtBrTime(raw: string): string {
  const strict = parseTimeHHMM(raw);
  if (strict) return strict;
  const s = normalizeStr(raw).replace(/\s+/g, "");
  const m = /^(\d{1,2})(?:[h:](\d{2}))?/.exec(s);
  if (!m) return "";
  const hh = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
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
  logistica: "Planilha da logística (cabeçalho com ida/retorno e os dias)",
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
  /** Formato efetivamente usado (detectado ou forçado). */
  format: PasteFormat;
  /** true quando havia cabeçalho e ele foi ignorado. */
  hadHeader: boolean;
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
  /** Índice da linha do cabeçalho dentro do texto colado. */
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
 * Regras de reconhecimento (todas necessárias para NÃO confundir com os formatos
 * "grade"/"briefing", cujo cabeçalho começa com "Função"):
 * - a 1ª coluna é VAZIA (é a coluna dos nomes de função, sem rótulo);
 * - a linha tem ≥ 3 colunas; e
 * - traz ≥ 2 colunas com data curta OU ≥ 2 rótulos de viagem conhecidos.
 */
export function findLogisticaHeader(grid: string[][]): LogisticaHeader | null {
  const limit = Math.min(grid.length, LOGISTICA_SCAN_LINES);
  for (let i = 0; i < limit; i++) {
    const cols = grid[i];
    if (cols.length < 3) continue;
    if ((cols[0] ?? "").trim() !== "") continue; // a coluna da função não tem rótulo
    const h: LogisticaHeader = {
      lineIndex: i, colFunction: 0,
      colDepartureDate: -1, colArrivalTime: -1, colReturnDate: -1, colReturnTime: -1, colObs: -1,
      dayColumns: [],
    };
    let labels = 0;
    cols.forEach((raw, idx) => {
      const c = normalizeStr(raw);
      if (!c) return;
      if (isDayHeaderCell(c)) { h.dayColumns.push({ index: idx, raw }); return; }
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
    if (h.dayColumns.length >= 2 || labels >= 2) return h;
  }
  return null;
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

function parseLogisticaText(
  text: string,
  functions: { id: string; name: string }[],
  dates: string[],
  defaultYear: string,
  options?: PasteOptions,
): PasteResult {
  const grid = text.replace(/\r/g, "").split("\n").map(splitCols);
  const header = findLogisticaHeader(grid);
  if (!header) {
    return { rows: [], skippedNames: [], unknownNames: [], datesOutsideGrid: [], format: "logistica", hadHeader: false, problem: "cabecalho-nao-encontrado" };
  }
  const dayColumns = header.dayColumns
    .map((c) => ({ index: c.index, date: resolveHeaderDate(c.raw, dates, defaultYear) }))
    .filter((c) => c.date);
  const inGrid = new Set(dates);
  const match = buildFunctionMatcher(functions, options?.nameMap);
  const cell = (cols: string[], idx: number) => (idx >= 0 ? (cols[idx] ?? "").trim() : "");

  const rows: SuggestionGridRow[] = [];
  const skippedNames: string[] = [];
  const outside = new Set<string>();
  for (let i = header.lineIndex + 1; i < grid.length; i++) {
    const cols = grid[i];
    // Sem nome na 1ª coluna não há linha de dados — é o que descarta a linha das
    // abreviações de dia da semana (ter/qua/qui…), que ainda pode vir desalinhada.
    const name = cell(cols, header.colFunction);
    if (!name) continue;
    const func = match(name);
    if (!func) { skippedNames.push(name); continue; }

    const row = emptyGridRow(func.id, func.name, dates, `${func.id}-paste-${Date.now()}-${i}`);
    row.flightDepartureDate = parseSheetDate(cell(cols, header.colDepartureDate), defaultYear);
    row.flightArrivalSuggestedTime = parsePtBrTime(cell(cols, header.colArrivalTime));
    row.flightReturnDate = parseSheetDate(cell(cols, header.colReturnDate), defaultYear);
    row.flightReturnSuggestedTime = parsePtBrTime(cell(cols, header.colReturnTime));
    row.observations = cell(cols, header.colObs);
    // A planilha não tem coluna de passagem nem de hotel: quem viaja (tem data de
    // ida ou de volta) precisa de passagem; as linhas "local" ficam sem nada.
    // Hotel e os modais de ida/volta continuam em branco, para preencher na grade.
    row.needsTicket = !!(row.flightDepartureDate || row.flightReturnDate);

    for (const dc of dayColumns) {
      const n = parseInt(cell(cols, dc.index) || "0", 10);
      if (Number.isNaN(n) || n <= 0) continue;
      if (inGrid.has(dc.date)) row.quantities[dc.date] = Math.min(QTY_MAX, n);
      else outside.add(dc.date); // fora do período: a tela oferece ampliar a grade
    }
    rows.push(row);
  }
  return {
    rows, skippedNames, unknownNames: dedupe(skippedNames),
    datesOutsideGrid: Array.from(outside).sort(),
    format: "logistica", hadHeader: true,
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
  if (findLogisticaHeader(lines.map(splitCols))) return { format: "logistica", hadHeader: true }; // (0)
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
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const cols = splitCols(line);
    if (!headerSkipped && rows.length === 0 && skippedNames.length === 0 && isHeaderLine(cols)) { headerSkipped = true; return; }
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
      const n = parseInt(cols[j] || "0", 10);
      row.quantities[dates[j - qtyStart]] = Number.isNaN(n) ? 0 : Math.max(0, Math.min(QTY_MAX, n));
    }
    rows.push(row);
  });
  return { rows, skippedNames, unknownNames: dedupe(skippedNames), datesOutsideGrid: [], format, hadHeader: headerSkipped };
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

/** Problemas por linha: erros bloqueiam o envio, avisos não. Linha sem quantidade é ignorada. */
export function validateGridRow(row: SuggestionGridRow): RowValidation {
  const hasQty = Object.values(row.quantities).some((q) => q > 0);
  if (!hasQty) return NO_ISSUES; // linha vazia é ignorada no envio
  const errors: string[] = [];
  const warnings: string[] = [];
  const hhmm = /^\d{2}:\d{2}$/;
  if (row.flightArrivalSuggestedTime && !hhmm.test(row.flightArrivalSuggestedTime)) errors.push("horário de desembarque inválido (HH:MM)");
  if (row.flightReturnSuggestedTime && !hhmm.test(row.flightReturnSuggestedTime)) errors.push("horário de embarque inválido (HH:MM)");
  if (row.flightDepartureDate && row.flightReturnDate && row.flightReturnDate < row.flightDepartureDate) errors.push("data de volta anterior à data de ida");
  if (row.needsTicket && (!row.flightDepartureDate || !row.flightReturnDate)) warnings.push("passagem marcada sem data de ida/volta");
  if (errors.length === 0 && warnings.length === 0) return NO_ISSUES;
  return { errors, warnings };
}
