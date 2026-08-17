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
/** Fatores de deflação (0..1) por faixa. Editáveis no Valores Padrão. */
export interface DeflationFactors {
  ate4: number;   // até 4 dias (base, normalmente 1.0)
  d5a8: number;   // do 5º ao 8º dia
  d9mais: number; // a partir do 9º dia
}

export const DEFLATION_FACTORS_DEFAULT: DeflationFactors = { ate4: 1.0, d5a8: 0.9, d9mais: 0.8 };

export function calcDeflatedDailies(
  dailyValueCents: number,
  days: number,
  factors: DeflationFactors = DEFLATION_FACTORS_DEFAULT,
): {
  totalCents: number;
  segments: DeflationSegment[];
} {
  // Faixas do slide (fixas); só os fatores são configuráveis.
  const tiers = [
    { fromDay: 1, toDay: 4, factor: factors.ate4, label: "até 4 dias" },
    { fromDay: 5, toDay: 8, factor: factors.d5a8, label: "do 5º ao 8º dia" },
    { fromDay: 9, toDay: Infinity, factor: factors.d9mais, label: "a partir do 9º dia" },
  ];
  const segments: DeflationSegment[] = [];
  let total = 0;
  for (const tier of tiers) {
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

/** Lê os fatores de deflação (percentuais inteiros) do Valores Padrão. */
export function deflationFactorsFromSettings(
  settings?: Record<string, number | string | undefined> | null,
): DeflationFactors {
  const pct = (key: string, def: number): number => {
    const raw = settings?.[key];
    const n = typeof raw === "string" ? parseInt(raw, 10) : raw;
    return (typeof n === "number" && Number.isFinite(n) && n >= 0) ? n / 100 : def;
  };
  return {
    ate4: pct("deflacao_fator_ate_4", 1.0),
    d5a8: pct("deflacao_fator_5_8", 0.9),
    d9mais: pct("deflacao_fator_9_mais", 0.8),
  };
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

// ── Diária FREELA por regra (slide "Regra de cálculo para time freela") ──────
// A tarifa freela não é por função individual: é uma regra de 3 valores —
// Dir de Prova (R$820), demais funções EM VIAGEM (R$540) ou LOCAL (R$465) —
// editáveis no Valores Padrão. "Em viagem" = a escalação tem passagem
// (needsTicket). Os valores freela antigos gravados por função (ex.: R$250)
// eram legado e não batiam com o slide.
export const FREELA_SETTING_KEYS = {
  local: "freela_diaria_local",
  viagem: "freela_diaria_viagem",
  dirProva: "freela_diaria_dir_prova",
} as const;

export const FREELA_DEFAULTS_CENTS = {
  local: 46500,
  viagem: 54000,
  dirProva: 82000,
} as const;

/** A função é de Direção de Prova? */
export function isDirProvaFunction(functionName: string | null | undefined): boolean {
  if (!functionName) return false;
  const n = functionName.toLowerCase();
  return n.includes("dir") && n.includes("prova");
}

/** Diária freela (centavos) pela regra do slide, lendo o Valores Padrão. */
export function freelaDailyCents(
  functionName: string | null | undefined,
  emViagem: boolean,
  settings?: Record<string, number | string | undefined> | null,
): number {
  const read = (key: string, def: number): number => {
    const raw = settings?.[key];
    const n = typeof raw === "string" ? parseInt(raw, 10) : raw;
    return (typeof n === "number" && Number.isFinite(n) && n > 0) ? n : def;
  };
  if (isDirProvaFunction(functionName)) return read(FREELA_SETTING_KEYS.dirProva, FREELA_DEFAULTS_CENTS.dirProva);
  return emViagem
    ? read(FREELA_SETTING_KEYS.viagem, FREELA_DEFAULTS_CENTS.viagem)
    : read(FREELA_SETTING_KEYS.local, FREELA_DEFAULTS_CENTS.local);
}

// ── Diária CASA por regra (slide "Regra de cálculo para time da casa") ───────
// Grupos do slide (o usuário confirmou: "Produtor" = produção/ativação/kit/
// sup ceno do sistema): Dir. Prova R$750; Produtor R$465; Executivo Vendas O2
// Prime R$260. Atendimento tem regra própria (Key Account / Exec. de Contas).
// Cenotécnica, percurso e montagem ficam FORA (empreita/percurseiro/valor por
// função). Editável no Valores Padrão. Os valores por função no banco estavam
// inconsistentes (diária útil 0 em quase todas).
export const CASA_SETTING_KEYS = {
  dirProva: "casa_diaria_dir_prova",
  produtor: "casa_diaria_produtor",
  execVendas: "casa_diaria_exec_vendas",
} as const;

export const CASA_DEFAULTS_CENTS = {
  dirProva: 75000,
  produtor: 46500,
  execVendas: 26000,
} as const;

/**
 * Diária casa (centavos) pela regra do slide, ou null para funções fora dos
 * grupos (atendimento/cenotécnica/percurso/montagem — cada uma tem seu regime).
 */
export function casaDailyCents(
  functionName: string | null | undefined,
  settings?: Record<string, number | string | undefined> | null,
): number | null {
  if (!functionName) return null;
  const n = functionName.toLowerCase();
  const read = (key: string, def: number): number => {
    const raw = settings?.[key];
    const v = typeof raw === "string" ? parseInt(raw, 10) : raw;
    return (typeof v === "number" && Number.isFinite(v) && v > 0) ? v : def;
  };
  if (n.includes("atend")) return null; // regra própria (KA/EC)
  if (isDirProvaFunction(n)) return read(CASA_SETTING_KEYS.dirProva, CASA_DEFAULTS_CENTS.dirProva);
  if (n.includes("o2") || n.includes("vendas")) return read(CASA_SETTING_KEYS.execVendas, CASA_DEFAULTS_CENTS.execVendas);
  const isSupCeno = n.includes("sup") && n.includes("ceno");
  if (isSupCeno || ((n.includes("produç") || n.includes("producao") || n.includes("ativa") || n.includes("kit")) && !n.includes("ceno"))) {
    return read(CASA_SETTING_KEYS.produtor, CASA_DEFAULTS_CENTS.produtor);
  }
  return null;
}
