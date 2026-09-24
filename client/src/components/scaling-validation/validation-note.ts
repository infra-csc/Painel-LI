/**
 * Observação opcional de quem VALIDA a vaga (dono, 24/09) — regras puras,
 * espelho do que o servidor faz em POST /api/scaling-suggestions/validate:
 * `trim`, vazio vira `null`, no máximo `VALIDATION_NOTE_MAX` caracteres. O
 * mesmo texto vale para todas as vagas do lote.
 */
export const VALIDATION_NOTE_MAX = 1000;

/** Texto digitado → o que vai no corpo da requisição (`null` quando não há nada a dizer). */
export function normalizeValidationNote(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  return t ? t : null;
}

/** Quantos caracteres ainda cabem (nunca negativo — o campo tem `maxLength`). */
export function validationNoteRemaining(text: string): number {
  return Math.max(0, VALIDATION_NOTE_MAX - text.length);
}
