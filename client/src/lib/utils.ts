import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fixEncoding(str: string | null | undefined): string {
  if (!str) return str || '';
  return str
    // Minúsculas (byte range A0-BF → Latin-1 printable → match direto)
    .replace(/Ã§/g, 'ç').replace(/Ã£/g, 'ã').replace(/Ãµ/g, 'õ')
    .replace(/Ã©/g, 'é').replace(/Ã¡/g, 'á').replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú').replace(/Ã /g, 'à')
    // Maiúsculas — versão C1 control (U+0080-U+009F, raw bytes)
    .replace(/Ã\u0087/g, 'Ç').replace(/Ã\u0083/g, 'Ã')
    .replace(/Ã\u0089/g, 'É').replace(/Ã\u0093/g, 'Ó').replace(/Ã\u0095/g, 'Õ')
    .replace(/Ã\u0082/g, 'Â').replace(/Ã\u0081/g, 'Á').replace(/Ã\u009a/g, 'Ú')
    // Maiúsculas — versão Windows-1252 (caso o BD tenha convertido C1→printable)
    .replace(/Ã‡/g, 'Ç').replace(/Ãƒ/g, 'Ã')
    .replace(/Ã‰/g, 'É').replace(/Ã"/g, 'Ó').replace(/Ã•/g, 'Õ')
    .replace(/Ã‚/g, 'Â').replace(/Ãâ/g, 'Â').replace(/â€™/g, "'");
}

export function normalizeId(val: string | number | null | undefined): string {
  return String(val ?? '').replace(/#/g, '').trim().toLowerCase();
}

/**
 * Converte texto digitado em número, aceitando o formato brasileiro.
 *
 * parseFloat("40,50") devolve 40 — ele para na vírgula e descarta os centavos
 * sem avisar. Como os campos monetários são type="text" inputMode="decimal"
 * com placeholder "0,00", a interface pede vírgula e o valor era perdido.
 *
 * Regra: se houver vírgula, ela é o separador decimal e os pontos são de
 * milhar ("1.234,56" → 1234.56). Sem vírgula, o ponto continua sendo tratado
 * como decimal ("1234.56" → 1234.56), preservando o comportamento de quem
 * digita no teclado numérico.
 *
 * Usar apenas em inputs de texto. Em type="number" o navegador já entrega
 * ponto decimal e parseFloat basta.
 */
export function parseBrNumber(raw: string | number | null | undefined): number {
  return parseBrNumberOrNull(raw) ?? 0;
}

/**
 * Igual ao parseBrNumber, mas devolve null quando não há número válido em vez
 * de 0.
 *
 * Os campos de moeda só chamam onChange quando o texto é um número — sem isso,
 * apagar o conteúdo para digitar de novo zeraria o valor a cada tecla. Zero e
 * "vazio" precisam ser distinguíveis, e por isso este existe separado.
 */
export function parseBrNumberOrNull(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw ?? '').trim();
  if (!s) return null;
  // Com vírgula, ela é o decimal e os pontos são separador de milhar
  // ("1.234,56" → 1234.56). Sem vírgula, o ponto é decimal ("40.50" → 40.5),
  // preservando quem digita no teclado numérico.
  const normalized = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : s;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

export function formatDias(n: number): string {
  return `${n} ${n === 1 ? 'dia' : 'dias'}`;
}

export function formatDiarias(n: number): string {
  return `${n} ${n === 1 ? 'diária' : 'diárias'}`;
}

export function formatDiasUteis(n: number): string {
  return `${n} ${n === 1 ? 'dia útil' : 'dias úteis'}`;
}

export function formatFds(n: number): string {
  return `${n} ${n === 1 ? 'fim de semana' : 'fins de semana'}`;
}

export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  if (!start) return '–';
  const toDDMM = (s: string) => {
    const d = new Date(s.length === 10 ? s + 'T12:00:00' : s);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const s = toDDMM(start);
  if (!end) return s;
  const e = toDDMM(end);
  return s === e ? s : `${s} – ${e}`;
}
