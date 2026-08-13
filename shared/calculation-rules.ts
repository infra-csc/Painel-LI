/**
 * Regras de cálculo de diárias — slides 7 a 10 do deck "Ações de melhoria
 * APP LI" (tabelas de referência 2026).
 *
 * Valores em CENTAVOS, seguindo a convenção do restante do sistema.
 *
 * Deflação por período (casa e freela): os 4 primeiros dias pagam 100% da
 * diária; do 5º ao 8º dia cada dia paga 90% (redução de 10% "do valor desses
 * dias", como descreve o slide do time freela); do 9º em diante cada dia paga
 * 80%. A deflação é por dia trabalhado, não sobre o total.
 */

export const DEFLATION_TIERS = [
  { fromDay: 1, toDay: 4, factor: 1.0, label: "até 4 dias" },
  { fromDay: 5, toDay: 8, factor: 0.9, label: "do 5º ao 8º dia" },
  { fromDay: 9, toDay: Infinity, factor: 0.8, label: "a partir do 9º dia" },
] as const;

export interface DeflationSegment {
  days: number;
  factor: number;
  dailyCents: number; // diária já deflacionada (arredondada por dia)
  totalCents: number;
  label: string;
}

/** Total de diárias com deflação progressiva por dia + memória de cálculo. */
export function calcDeflatedDailies(dailyValueCents: number, days: number): {
  totalCents: number;
  segments: DeflationSegment[];
} {
  const segments: DeflationSegment[] = [];
  let total = 0;
  for (const tier of DEFLATION_TIERS) {
    if (days < tier.fromDay) break;
    const daysInTier = Math.min(days, tier.toDay) - tier.fromDay + 1;
    if (daysInTier <= 0) continue;
    const daily = Math.round(dailyValueCents * tier.factor);
    const subtotal = daily * daysInTier;
    total += subtotal;
    segments.push({ days: daysInTier, factor: tier.factor, dailyCents: daily, totalCents: subtotal, label: tier.label });
  }
  return { totalCents: total, segments };
}

// ── Slide 7: time da casa ────────────────────────────────────────────────────
export const CASA_DAILY_RATES = [
  { funcao: "Dir. Prova", cents: 75000 },
  { funcao: "Produtor (Produção, Ativação, Kit, SupCeno)", cents: 46500 },
  { funcao: "Executivo Vendas O2 Prime", cents: 26000 },
  { funcao: "Atendimento (Key Account)", cents: 58000 },
  { funcao: "Atendimento (Executivo de Contas)", cents: 46500 },
] as const;

export const CASA_FOOD_2026 = {
  jornadaExterna: [
    { refeicao: "Almoço (a partir 12h c/ 4h de jornada)", demaisCents: 4000, cenotecnicaCents: 3500 },
    { refeicao: "Jantar (a partir das 20h c/ 10h de jornada)", demaisCents: 4000, cenotecnicaCents: 3500 },
  ],
  emViagem: [
    { refeicao: "Almoço (chegada voo 11h)", demaisCents: 4000, cenotecnicaCents: 3500 },
    { refeicao: "Jantar (chegada voo 19h)", demaisCents: 4000, cenotecnicaCents: 3500 },
  ],
} as const;

// Ajuda de custo — mobilidade (deslocamento aeroporto por trecho); igual para casa e freela
export const MOBILITY_2026 = [
  { faixa: "Demais horários", cents: 2900 },
  { faixa: "Voo partindo das 23h30 até 9h30", cents: 5800 },
  { faixa: "Voo chegando das 20h00 até 5h00", cents: 5800 },
] as const;

// ── Slide 9: time freela ─────────────────────────────────────────────────────
export const FREELA_DAILY_RATES = [
  { funcao: "Produtor / Sup Ceno / Kit / Ativação / Percurso — Local", cents: 46500 },
  { funcao: "Produtor / Sup Ceno / Kit / Ativação / Percurso — em viagem", cents: 54000 },
  { funcao: "Dir de Prova", cents: 82000 },
] as const;

// Ajuda de custo — deslocamento em dias adicionais (frilas)
export const FREELA_EXTRA_DAY_ALLOWANCE = [
  { situacao: "Saindo antes das 14h do dia anterior", cents: 7000 },
  { situacao: "Saindo depois das 14h do dia anterior", cents: 3500 },
  { situacao: "Retornando antes das 14h do dia seguinte", cents: 3500 },
  { situacao: "Retornando depois das 14h do dia seguinte", cents: 7000 },
] as const;

// ── Slide 8: cenotécnicos empreitas (valor fechado por nº de dias) ──────────
export const EMPREITA_CLOSED_VALUES = [
  { modalidade: "Freela Viagem", porDias: { 2: 89013, 3: 125763, 4: 162513, 5: 199263, 6: 236013 } },
  { modalidade: "Freela SP", porDias: { 2: 70035, 3: 105053, 4: 140070, 5: 175088, 6: 210105 } },
  { modalidade: "Freela Local (A)", porDias: { 2: 67725, 3: 99225, 4: 130725, 5: 162225, 6: 193725 } },
  { modalidade: "Freela Local (B)", porDias: { 2: 53750, 3: 78750, 4: 103750, 5: 128750, 6: 153750 } },
] as const;

// ── Slide 10: percurseiro (motoqueiros em viagem — sempre 2 diárias, com NF) ─
// O slide aponta divergência nos 16% de NF entre a proposta e a planilha base;
// mantemos os dois conjuntos até a definição final.
export const PERCURSEIRO_TYPES = [
  {
    tipo: "Tipo 1",
    motoqueiroCents: 70000,
    feeIvanCents: 10500,        // Fee Ivan (15%)
    alimentacaoCents: 10200,    // 3 refeições
    transporteCents: 5000,      // ajuda de custo transporte
    nfPropostaCents: 17276,     // NF (16%) — proposta
    nfPlanilhaCents: 17226,     // NF (16%) — planilha base
    totalPropostaCents: 112976,
    totalPlanilhaCents: 112926,
  },
  {
    tipo: "Tipo 2",
    motoqueiroCents: 80000,
    feeIvanCents: 12000,
    alimentacaoCents: 10200,
    transporteCents: 5000,
    nfPropostaCents: 19467,
    nfPlanilhaCents: 19296,
    totalPropostaCents: 126667,
    totalPlanilhaCents: 126496,
  },
] as const;
