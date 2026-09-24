import { fixEncoding } from "@/lib/utils";
import { fetchJson } from "@/lib/queryClient";
import { normalizeSwaps, type NormalizedSwap } from "@/lib/swap-types";
import type { Accommodation, TeamInclusion } from "@shared/schema";
import { EMPTY_DRAFT, type AccommodationDraft } from "./types";

import { formatarMoeda } from "@/lib/format";
// Status de inclusão em que a hospedagem já foi registrada — a partir daí só
// Compras/admin alteram (decisão do usuário; espelha isReadOnly em lib/interactions).
export const POST_PURCHASE_STATUSES = ["hospedagem_comprada", "hospedagem_passagem_comprada"];

export const isPostPurchaseStatus = (status: string | null | undefined): boolean =>
  POST_PURCHASE_STATUSES.includes(status || "");

// "YYYY-MM-DD" a partir de string de data (ISO completo ou só data).
export const toDateInput = (v: string | null | undefined): string => (v ? String(v).slice(0, 10) : "");

// Check-out ≥ check-in. Datas "YYYY-MM-DD" e horas "HH:mm" comparam como texto.
// Sem alguma das datas, não há o que validar (retorna true).
export function isCheckOutAfterCheckIn(d: { checkInDate?: string; checkInTime?: string; checkOutDate?: string; checkOutTime?: string }): boolean {
  const ci = (d.checkInDate || "").slice(0, 10), co = (d.checkOutDate || "").slice(0, 10);
  if (!ci || !co) return true;
  if (co !== ci) return co > ci;
  const ti = d.checkInTime || "", to = d.checkOutTime || "";
  if (!ti || !to) return true;
  return to >= ti;
}

// Formatação de data no padrão brasileiro.
// Sem passar por new Date(): "YYYY-MM-DD" no construtor é lido como UTC e
// volta um dia atrás em Brasília. O slice(0,10) protege contra ISO completo.
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  const [year, month, day] = String(dateStr).slice(0, 10).split("-");
  if (!year || !month || !day) return String(dateStr);
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
}

export function formatDateTime(dt: string | Date | null | undefined): string {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function toTitleCase(str: string | null | undefined): string {
  if (!str) return "";
  return fixEncoding(str).replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function initials(name: string | null | undefined): string {
  const n = (name || "").trim();
  if (!n) return "?";
  return n.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function brl(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return formatarMoeda(cents);
}

/**
 * Rascunho NOVO a partir do registro existente (ou do período da inclusão,
 * quando ainda não há hospedagem).
 */
export function draftFrom(acc: Accommodation | undefined | null, inclusion: TeamInclusion): AccommodationDraft {
  return {
    ...EMPTY_DRAFT,
    hotelName: acc?.hotelName || "",
    hotelLocation: acc?.hotelLocation || "",
    reservationNumber: acc?.reservationNumber || "",
    accommodationObservations: acc?.accommodationObservations || "",
    attachmentIds: acc?.attachmentIds || [],
    checkInDate: toDateInput(acc?.checkInDate) || toDateInput(inclusion.scheduleStartDate),
    checkInTime: acc?.checkInTime || "",
    checkOutDate: toDateInput(acc?.checkOutDate) || toDateInput(inclusion.scheduleEndDate),
    checkOutTime: acc?.checkOutTime || "",
  };
}

// Normalização das trocas: uma só para o client (client/src/lib/swap-types.ts,
// 23/09). A lista GLOBAL vem do hook useSwapRequests; `fetchSwaps` fica só
// para a consulta por vaga do modal.
export { normalizeSwap } from "@/lib/swap-types";

export async function fetchSwaps(url: string, signal?: AbortSignal): Promise<NormalizedSwap[]> {
  // Erro (sessão, rede) sobe como ApiError em vez de virar lista vazia muda.
  return normalizeSwaps(await fetchJson<unknown>(url, signal));
}
