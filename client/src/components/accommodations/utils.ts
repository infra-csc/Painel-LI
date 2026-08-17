import { fixEncoding } from "@/lib/utils";
import type { Accommodation, TeamInclusion } from "@shared/schema";
import { EMPTY_DRAFT, type AccommodationDraft, type NormalizedSwap } from "./types";

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
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

// A API de trocas devolve SQL cru (snake_case + joins). Aceita também camelCase
// para o caso de a rota passar a usar o ORM.
type RawSwap = Record<string, unknown>;
const pick = (r: RawSwap, ...keys: string[]): unknown => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null) return r[k];
  return null;
};
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function normalizeSwap(raw: RawSwap): NormalizedSwap {
  return {
    id: String(pick(raw, "id") ?? ""),
    teamInclusionId: String(pick(raw, "team_inclusion_id", "teamInclusionId") ?? ""),
    status: String(pick(raw, "status") ?? "pendente"),
    currentCollaboratorId: str(pick(raw, "current_collaborator_id", "currentCollaboratorId")),
    newCollaboratorId: str(pick(raw, "new_collaborator_id", "newCollaboratorId")),
    currentCollaboratorName: str(pick(raw, "current_collaborator_name", "currentCollaboratorName")),
    newCollaboratorName: str(pick(raw, "new_collaborator_name", "newCollaboratorName")),
    requestedByName: str(pick(raw, "requested_by_name", "requestedByName")),
    reason: str(pick(raw, "reason")),
    reviewComment: str(pick(raw, "review_comment", "reviewComment")),
    createdAt: str(pick(raw, "created_at", "createdAt")),
  };
}

export async function fetchSwaps(url: string): Promise<NormalizedSwap[]> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) return [];
  const rows: unknown = await r.json();
  return Array.isArray(rows) ? rows.map((x) => normalizeSwap(x as RawSwap)) : [];
}
