// Extraído de invoices.tsx em 25/09 (modularização): formatação de datas e
// moeda usada pelo card de NF, pela tabela de aprovação e pelo histórico.
// Existe à parte porque três módulos precisam das mesmas funções sem
// depender uns dos outros.
import { formatarMoeda } from "@/lib/format";

export const formatCurrency = formatarMoeda;

/** Timestamps do schema são `Date` no tipo, mas chegam como ISO pelo JSON — aceita os dois. */
export function iso(v: string | Date | null | undefined): string | null {
  if (v == null || v === "") return null;
  return v instanceof Date ? v.toISOString() : v;
}

export function fmtDate(raw?: string | Date | null) {
  const d = iso(raw);
  if (!d) return "—";
  // Aceita "YYYY-MM-DD" e timestamps ISO ("YYYY-MM-DDTHH:mm:ss…")
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}

export function fmtDateTime(raw?: string | Date | null) {
  const s = iso(raw);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}
