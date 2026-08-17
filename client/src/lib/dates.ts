/**
 * Datas "de calendário" (YYYY-MM-DD) sem fuso — fonte única.
 *
 * `new Date("2026-08-17")` é interpretado como UTC e em Brasília vira 16/08
 * às 21h: dia errado. Tudo aqui trabalha por string ou por `new Date(y, m, d)`
 * (horário local), então não há off-by-one.
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * "2026-08-17" (ou ISO completo) → Date local à meia-noite. Strings que não
 * começam com YYYY-MM-DD caem em `new Date(value)`. Inválido → null.
 */
export function parseLocalDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const m = ISO_DATE_RE.exec(String(value).trim());
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date local → "YYYY-MM-DD" (sem toISOString, que converte para UTC). */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Hoje, no fuso do navegador, como "YYYY-MM-DD". */
export function todayIso(): string {
  return toIsoDate(new Date());
}

/**
 * "2026-08-17" / "2026-08-17T00:00:00.000Z" → "17/08/2026", por string
 * (o "T..." é ignorado; nada de new Date em UTC). Vazio → "".
 * Se não for ISO, tenta parseLocalDate; se falhar, devolve o texto original.
 */
export function formatDateBr(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  if (typeof iso === "string") {
    const m = ISO_DATE_RE.exec(iso.trim());
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = parseLocalDate(iso);
  if (!d) return typeof iso === "string" ? iso : "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** "17/08/2026" → "17/08" (dd/mm, sem ano). */
export function formatDayMonthBr(iso: string | Date | null | undefined): string {
  const full = formatDateBr(iso);
  return /^\d{2}\/\d{2}\/\d{4}$/.test(full) ? full.slice(0, 5) : full;
}

/**
 * Intervalo compacto: "17/08 – 20/08"; mesmo dia → "17/08"; sem fim → só o
 * início; sem início → "–". Com `withYear`, "17/08/2026 – 20/08/2026".
 */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  opts: { withYear?: boolean } = {}
): string {
  if (!start) return "–";
  const fmt = opts.withYear ? formatDateBr : formatDayMonthBr;
  const s = fmt(start);
  if (!end) return s;
  const e = fmt(end);
  return s === e ? s : `${s} – ${e}`;
}
