/**
 * Regras da Conta Corrente Flash ligadas ao lançamento da OC (17/08).
 *
 * Regra do usuário: "após lançamento da OC, mobilidade e alimentação entram
 * no Flash — apenas a diária não". Ou seja, quando o colaborador lança a NF
 * com número de OC, o sistema credita automaticamente no Flash dele os
 * valores de ALIMENTAÇÃO e MOBILIDADE gravados no Realizado (budget_actual)
 * daquele evento. Diária, ajuda de custo e translado NÃO entram.
 *
 * Tudo em centavos. Funções puras — testadas em flash-rules.test.ts.
 */

/** Subconjunto do budget_actual que a regra usa. */
export interface FlashSourceActual {
  weekdayLunch?: number | null;
  weekdayDinner?: number | null;
  weekendLunch?: number | null;
  weekendDinner?: number | null;
  /** total de mobilidade (ida + volta) — coluna autoritativa */
  mobility?: number | null;
  mobilityIda?: number | null;
  mobilityVolta?: number | null;
}

export interface FlashAmounts {
  alimentacaoCents: number;
  mobilidadeCents: number;
}

export type FlashCategory = "alimentacao" | "mobilidade";

const nz = (v: number | null | undefined): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;

/**
 * Valores que entram no Flash a partir do Realizado.
 *
 * - alimentação = almoço semana + jantar semana + almoço fds + jantar fds
 * - mobilidade  = coluna `mobility` (total ida+volta gravado no Realizado);
 *   se ela estiver zerada mas ida/volta preenchidos (registro legado), usa
 *   ida + volta. `transport` (translado) NÃO é mobilidade — fica de fora.
 * - diária (dailyValue × dailyQuantity) e ajuda de custo são ignoradas.
 *
 * Usa o que está GRAVADO — não recalcula. Colaborador de casa e percurseiro
 * já têm seus valores próprios no Realizado (percurso: alimentação e
 * mobilidade 0 → nada é creditado).
 */
export function flashAmountsFromBudgetActual(actual: FlashSourceActual | null | undefined): FlashAmounts {
  if (!actual) return { alimentacaoCents: 0, mobilidadeCents: 0 };
  const alimentacaoCents =
    nz(actual.weekdayLunch) + nz(actual.weekdayDinner) + nz(actual.weekendLunch) + nz(actual.weekendDinner);
  const total = nz(actual.mobility);
  const idaVolta = nz(actual.mobilityIda) + nz(actual.mobilityVolta);
  const mobilidadeCents = total > 0 ? total : idaVolta;
  return { alimentacaoCents, mobilidadeCents };
}

/** Lançamentos automáticos que devem existir (valor 0 → categoria ausente). */
export function flashMovementsToSync(amounts: FlashAmounts): Array<{ category: FlashCategory; amountCents: number }> {
  const out: Array<{ category: FlashCategory; amountCents: number }> = [];
  if (amounts.alimentacaoCents > 0) out.push({ category: "alimentacao", amountCents: amounts.alimentacaoCents });
  if (amounts.mobilidadeCents > 0) out.push({ category: "mobilidade", amountCents: amounts.mobilidadeCents });
  return out;
}

/** Descrição padrão do lançamento automático no extrato. */
export function flashOcDescription(oc: string | null | undefined, eventName: string | null | undefined): string {
  const ocTxt = (oc || "").trim();
  const parts = [`Automático — OC nº ${ocTxt || "—"}`];
  if (eventName && eventName.trim()) parts.push(eventName.trim());
  return parts.join(" · ");
}

/** Um lançamento automático (origem 'oc') é somente leitura na tela e na API. */
export function isAutomaticFlashMovement(m: { sourceType?: string | null } | null | undefined): boolean {
  return m?.sourceType === "oc";
}
