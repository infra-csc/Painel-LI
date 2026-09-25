/**
 * Linhas da grade função × dia (25/09 — extraído de scaling-grid-utils.ts):
 * tipos, linha vazia, reencaixe de período, blindagem do rascunho, decomposição
 * "1 registro por pessoa", totais e a fusão sem duplicar de linhas coladas.
 */
import { TRANSPORT_MODES, type TransportMode } from "@shared/scaling-validation-rules";
import { YMD_RE } from "./grid-dates";

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

export const TRANSPORT_MODE_SET = new Set<string>(TRANSPORT_MODES);
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
