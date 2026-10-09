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

/**
 * "09/10 – 11/10/2026" (ou só o dia, quando começa e termina no mesmo) — a
 * segunda linha do seletor de evento da barra, igual à do Planejado (08/10).
 */
export function periodoDoEvento(e: { startDate?: string | null; endDate?: string | null } | undefined): string {
  if (!e?.startDate) return "";
  const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  if (!e.endDate || e.endDate === e.startDate) return `${ddmm(e.startDate)}/${e.startDate.slice(0, 4)}`;
  return `${ddmm(e.startDate)} – ${ddmm(e.endDate)}/${e.endDate.slice(0, 4)}`;
}

/** Texto para a busca: minúsculo e sem acento ("João" acha "joao"). */
export function paraBusca(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** "há 3 dias", "hoje", "há 1 dia" — prazo da nota na fila do RH. */
export function haDias(d: number): string {
  if (d <= 0) return "hoje";
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
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
