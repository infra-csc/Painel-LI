/**
 * Validação de linha e leitura de campo de logística (25/09 — extraído de scaling-grid-utils.ts).
 */
import type { SuggestionGridRow } from "./grid-rows";

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
  // Horário sugerido é texto livre com faixa (04/09): "8-14h", "20h+" valem.
  // Só é erro quando não tem nenhum dígito (não dá para Compras usar).
  const horarioOk = (v: string) => /[0-9]/.test(v) && v.trim().length <= 40;
  if (row.flightArrivalSuggestedTime && !horarioOk(row.flightArrivalSuggestedTime)) errors.push("horário de desembarque inválido (ex.: 11:00 ou 8-14h)");
  if (row.flightReturnSuggestedTime && !horarioOk(row.flightReturnSuggestedTime)) errors.push("horário de embarque inválido (ex.: 11:00 ou 8-14h)");
  if (row.flightDepartureDate && row.flightReturnDate && row.flightReturnDate < row.flightDepartureDate) errors.push("data de volta anterior à data de ida");
  // Só ida ou só volta é legítimo (04/09); o aviso é para NENHUMA data.
  if (row.needsTicket && !row.flightDepartureDate && !row.flightReturnDate) warnings.push("passagem marcada sem data de ida nem de volta");
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
