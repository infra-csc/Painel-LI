/**
 * Regras da Conta Corrente Flash — crédito na APROVAÇÃO DO COMPARATIVO (19/08).
 *
 * ┌─ REGRA VIGENTE (decisão do usuário em 19/08/2026) ───────────────────────┐
 * │ Alimentação e mobilidade entram na Conta Corrente Flash do colaborador   │
 * │ quando o COMPARATIVO do evento é APROVADO — de uma vez, para todas as    │
 * │ prestações do evento. "A NF/OC depois não mexe mais no saldo (só         │
 * │ documenta)". A diária continua FORA do Flash (regra de 17/08 mantida).   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Esta regra SUBSTITUI a de 17/08 ("após o lançamento da OC, mobilidade e
 * alimentação entram no Flash"), que creditava no POST/PATCH /api/invoices e
 * estornava na recusa da NF. Aquele gatilho foi desligado: a nota fiscal não
 * altera mais o saldo do Flash. Lançamentos antigos com `sourceType = 'oc'`
 * (nenhum em produção — a conta estava vazia) ficam congelados como legado.
 *
 * Contrato do flash_movements na regra nova:
 *   sourceType = 'comparativo'   → lançamento automático (somente leitura)
 *   sourceRef  = budget_actual.id → a prestação que originou o crédito
 *   (sourceType, sourceRef, category) é a chave lógica → sync idempotente:
 *   reaprovar o comparativo atualiza os mesmos lançamentos em vez de duplicar.
 *
 * A granularidade é por PRESTAÇÃO (não por comparativo) para o extrato
 * continuar rastreável por pessoa/função: um colaborador com duas funções no
 * mesmo evento recebe dois pares de lançamentos, um por prestação.
 *
 * Tudo em centavos. Funções puras — testadas em flash-rules.test.ts.
 */

/** Origem do lançamento gravada em flash_movements.source_type. */
export const FLASH_SOURCE_MANUAL = "manual";
/** Crédito automático da aprovação do comparativo (regra vigente, 19/08). */
export const FLASH_SOURCE_COMPARATIVO = "comparativo";
/** Legado: crédito automático da OC da NF (regra de 17/08, desligada). */
export const FLASH_SOURCE_OC = "oc";

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

/** Prestação (budget_actual) como a regra do comparativo a enxerga. */
export interface FlashComparisonActual extends FlashSourceActual {
  id: string;
  eventId?: string | null;
  collaboratorId?: string | null;
  functionId?: string | null;
  /** vínculo com o planejado (filho de divisão herda o do pai) */
  plannedId?: string | null;
  didNotAttend?: boolean | null;
  sentForReview?: boolean | null;
  rhStatus?: string | null;
}

/** Linha do planejado que a regra consulta (só para "não participou"). */
export interface FlashComparisonPlanned {
  id: string;
  eventId?: string | null;
  collaboratorId?: string | null;
  functionId?: string | null;
  didNotAttend?: boolean | null;
}

/** Um lançamento automático desejado, já amarrado à prestação de origem. */
export interface FlashComparisonMovement {
  /** vira flash_movements.source_ref */
  actualId: string;
  collaboratorId: string;
  category: FlashCategory;
  amountCents: number;
}

/**
 * A prestação entra no crédito do comparativo?
 *
 * Mesmo critério de fluxo que a NF usa (`isNfEligible`) e que o
 * `resolveBudgetActual` da regra antiga preferia: aprovada pelo RH, ou
 * enviada e ainda pendente. Devolvida/rejeitada ficam de fora até o reenvio.
 * "Não participou" nunca entra. Sem colaborador também não — a coluna
 * flash_movements.collaborator_id é NOT NULL.
 *
 * Filhos de divisão de vaga (splitParentId) entram normalmente: cada um é uma
 * pessoa com valores próprios no Realizado.
 */
export function isFlashCreditableActual(actual: FlashComparisonActual | null | undefined): boolean {
  if (!actual) return false;
  if (!actual.collaboratorId) return false;
  if (actual.didNotAttend) return false;
  if (actual.rhStatus === "aprovado") return true;
  return Boolean(actual.sentForReview) && (actual.rhStatus ?? "pendente") === "pendente";
}

/**
 * "Não participou" também pode estar marcado no PLANEJADO — e é essa a marca
 * que o cálculo do comparativo usa para zerar o grupo (routes.ts, rota
 * /api/budget-comparison/calculate). Se o comparativo conta zero para a
 * pessoa, o Flash também não pode creditar.
 *
 * Casamento igual ao do cálculo: por plannedId quando existe (filho de divisão
 * herda o do pai), senão por evento + colaborador + função.
 */
export function plannedSaysNotAttended(
  actual: FlashComparisonActual,
  planned: Array<FlashComparisonPlanned> | null | undefined,
): boolean {
  if (!planned || planned.length === 0) return false;
  const match = actual.plannedId
    ? planned.find(p => p.id === actual.plannedId)
    : planned.find(p =>
        p.collaboratorId === actual.collaboratorId &&
        p.functionId === actual.functionId &&
        p.eventId === actual.eventId);
  return Boolean(match?.didNotAttend);
}

/**
 * Monta TODOS os lançamentos automáticos de um comparativo a partir das
 * prestações do evento. Um par (alimentação, mobilidade) por prestação;
 * categoria zerada não vira lançamento. `planned` é opcional e serve só para
 * respeitar o "não participou" marcado no planejado.
 */
export function flashMovementsForComparison(
  actuals: Array<FlashComparisonActual> | null | undefined,
  planned?: Array<FlashComparisonPlanned> | null,
): FlashComparisonMovement[] {
  const out: FlashComparisonMovement[] = [];
  for (const a of actuals ?? []) {
    if (!isFlashCreditableActual(a)) continue;
    if (plannedSaysNotAttended(a, planned)) continue;
    const amounts = flashAmountsFromBudgetActual(a);
    for (const w of flashMovementsToSync(amounts)) {
      out.push({
        actualId: a.id,
        collaboratorId: a.collaboratorId as string,
        category: w.category,
        amountCents: w.amountCents,
      });
    }
  }
  return out;
}

/** Soma por categoria de um conjunto de lançamentos (resumo para o toast). */
export function flashComparisonTotals(movements: FlashComparisonMovement[]): FlashAmounts {
  let alimentacaoCents = 0, mobilidadeCents = 0;
  for (const m of movements) {
    if (m.category === "alimentacao") alimentacaoCents += m.amountCents;
    else mobilidadeCents += m.amountCents;
  }
  return { alimentacaoCents, mobilidadeCents };
}

/** Chave lógica do lançamento automático dentro de um comparativo. */
export function flashMovementKey(m: { sourceRef?: string | null; category?: string | null }): string {
  return `${m.sourceRef ?? ""}|${m.category ?? ""}`;
}

/** Descrição padrão do crédito do comparativo no extrato (regra 19/08). */
export function flashComparativoDescription(eventName: string | null | undefined): string {
  const parts = ["Automático — Comparativo aprovado"];
  if (eventName && eventName.trim()) parts.push(eventName.trim());
  return parts.join(" · ");
}

/**
 * O gerador da descrição do crédito da OC saiu com a regra de 17/08 — ninguém
 * cria mais lançamento 'oc'. O formato antigo ("Automático — OC nº X · Evento")
 * só é LIDO pelo extrato, para etiquetar as linhas legadas
 * (client/src/pages/flash-account.tsx → ocFromDescription).
 */

/**
 * Lançamento automático = TUDO que não é 'manual' (hoje 'comparativo'; 'oc' é
 * legado). Automático é somente leitura na tela e na API — quem mexe nele é o
 * sync do comparativo.
 *
 * Origem ausente conta como 'manual': a coluna é NOT NULL DEFAULT 'manual' no
 * banco, então um objeto sem o campo só pode ser um lançamento de tela.
 */
export function isAutomaticFlashMovement(m: { sourceType?: string | null } | null | undefined): boolean {
  if (!m) return false;
  return (m.sourceType ?? FLASH_SOURCE_MANUAL) !== FLASH_SOURCE_MANUAL;
}

/** Rótulo curto da origem para extrato/CSV. */
export function flashSourceLabel(sourceType: string | null | undefined): string {
  switch (sourceType ?? FLASH_SOURCE_MANUAL) {
    case FLASH_SOURCE_COMPARATIVO: return "Comparativo";
    case FLASH_SOURCE_OC: return "OC (legado)";
    default: return "Manual";
  }
}
