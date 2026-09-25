/**
 * Leitura de VALORES de planilha (25/09 — extraído de scaling-grid-utils.ts):
 * datas em qualquer grafia, horários como a logística escreve, modal, sim/não,
 * quantidade com ajuste visível e o casamento tolerante de nomes de função.
 */
import { TRANSPORT_MODES, type TransportMode } from "@shared/scaling-validation-rules";
import { YMD_RE } from "./grid-dates";
import { QTY_MAX } from "./grid-rows";

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

export const splitCols = (line: string) => line.split("\t").map((c) => c.trim());

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

/** Nomes sem repetição, comparados pela chave tolerante. */
export const dedupe = (names: string[]) => {
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
export const HEADER_FUNCTION_RE = /^func(ao|oes)(?![a-z0-9])/;
export const isHeaderLine = (cols: string[]) => HEADER_FUNCTION_RE.test(normalizeStr(cols[0] ?? ""));
export const isQtyToken = (s: string) => /^\d+$/.test(s);
/** Tokens que podem ser sim/não. "0" e "1" estão aqui de propósito: são ambíguos (quantidade ou sim/não). */
export const YESNO_TOKENS = new Set(["", "sim", "s", "nao", "n", "x", "true", "false", "y", "yes", "no", "0", "1"]);

export const SMALL_INT_RE = /^\d{1,2}$/;

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
