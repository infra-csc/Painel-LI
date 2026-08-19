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
import { isCenotecnicaFunction } from "./alimentacao";

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
// Tabela CONFIRMADA pelo usuário em 17/08 ("Motoqueiros em viagem (2 diárias)"):
// NF Tipo 1 = R$ 172,76 e Tipo 2 = R$ 194,67 (totais 1.129,76 / 1.266,67).
// A versão "planilha base" antiga (172,26 / 192,96) foi descartada.
// ATENÇÃO: os "16%" da NF NÃO são deriváveis da tabela (16% do subtotal 957,00
// = 153,12; gross-up 957/0,84 = 1.139,29; 16% do total = 180,76 — nenhum bate
// com 172,76). Por isso a NF é guardada como VALOR editável, não como fórmula.
export const PERCURSEIRO_TYPES = [
  {
    tipo: "Tipo 1",
    motoqueiroCents: 70000,
    feeIvanCents: 10500,        // Fee Ivan (15%)
    alimentacaoCents: 10200,    // 3 refeições
    transporteCents: 5000,      // ajuda de custo transporte
    nfCents: 17276,             // NF ("16%") — valor da tabela, não derivável
    totalCents: 112976,
  },
  {
    tipo: "Tipo 2",
    motoqueiroCents: 80000,
    feeIvanCents: 12000,
    alimentacaoCents: 10200,
    transporteCents: 5000,
    nfCents: 19467,
    totalCents: 126667,
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

// ─────────────────────────────────────────────────────────────────────────────
// Dias com direito a diária, por tipo de colaborador (regra de negócio 17/08):
//   • `casa`  (produção CLT)  → diária SÓ nos fins de semana (sáb/dom); em dia
//                               útil já é assalariado → diária = 0.
//   • `local` (produção local) → diária em TODOS os dias.
//   • freela / demais          → diária em TODOS os dias (inalterado).
// Atenção: `local` continua usando a TABELA DE VALORES de casa (casaDailyCents);
// a diferença entre casa e local é apenas na CONTAGEM de dias.
// ─────────────────────────────────────────────────────────────────────────────
//   • casa + CENOTÉCNICA (regra 17/08): diária = 0 sempre (nem fds) → "nenhuma".
export type RegraDiaria = "nenhuma" | "fds" | "todos";

/** A função é de cenotécnica? Fonte única em shared/alimentacao (exclui "Sup Ceno" = produtor). */
const isCenoName = isCenotecnicaFunction;

/**
 * Regra de contagem aplicável ao tipo do colaborador (e à função).
 * Precedência: casa+cenotécnica → "nenhuma" · casa → "fds" · demais → "todos".
 */
export function regraDiariaPorTipo(
  tipoColaborador: string | null | undefined,
  functionName?: string | null,
): RegraDiaria {
  if (tipoColaborador === "casa" && isCenoName(functionName)) return "nenhuma";
  return tipoColaborador === "casa" ? "fds" : "todos";
}

/** Quantidade de dias que recebem diária para o tipo (e função) informados. */
export function diasComDiaria(
  tipoColaborador: string | null | undefined,
  weekdays: number,
  weekends: number,
  functionName?: string | null,
): number {
  const wd = Math.max(0, weekdays || 0);
  const we = Math.max(0, weekends || 0);
  const regra = regraDiariaPorTipo(tipoColaborador, functionName);
  if (regra === "nenhuma") return 0;
  return regra === "fds" ? we : wd + we;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPREITA CENOTÉCNICA — quantos dias a tabela de valor fechado deve usar.
//
// A tabela do slide (shared/cenotecnica-empreita) cobra por Nº DE DIAS. Havia
// DUAS contagens divergentes para a MESMA vaga:
//   • Escalação (card "Tipo de freela") → `workDays.length || dailyRates`
//   • Planejado                          → `diasComDiaria` (derivado do
//     intervalo COMPLETO scheduleStart→scheduleEnd)
// Quando os `workDays` são um subconjunto não contíguo do intervalo (ex.: 3 dias
// marcados dentro de uma janela de 5), a Escalação anunciava o valor de 3 dias e
// o Planejado pagava o de 5.
//
// REGRA ÚNICA (19/08): valem os DIAS EFETIVAMENTE TRABALHADOS —
//   1. `workDays` marcados (dias específicos), quando houver;
//   2. senão, o intervalo completo scheduleStartDate→scheduleEndDate (inclusive);
//   3. senão, `dailyRates` (grades antigas sem datas).
// É a leitura mais fiel ao negócio: a empreita remunera o dia trabalhado, e
// `workDays` é justamente a marcação de quais dias a pessoa trabalha.
//
// Função PURA e estrutural (não importa o schema) para valer no client e no
// server sem acoplar a tabela de escalação.
export interface DiasEmpreitaInput {
  workDays?: (string | null | undefined)[] | null;
  scheduleStartDate?: string | null;
  scheduleEndDate?: string | null;
  dailyRates?: number | null;
}

/** Data ISO (YYYY-MM-DD) → epoch UTC do dia, ou null se inválida. */
function isoDayUTC(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return Date.UTC(y, mo - 1, d);
}

const DIA_MS = 86_400_000;

/** Dias trabalhados da vaga para a tabela de EMPREITA cenotécnica. */
export function diasEmpreita(inclusion: DiasEmpreitaInput | null | undefined): number {
  if (!inclusion) return 0;
  // 1) dias específicos marcados (deduplicados — a coluna é um array livre)
  const marcados = new Set(
    (inclusion.workDays || [])
      .map(d => (typeof d === "string" ? d.slice(0, 10) : null))
      .filter((d): d is string => !!d && isoDayUTC(d) !== null),
  );
  if (marcados.size > 0) return marcados.size;
  // 2) intervalo completo do período de trabalho
  const ini = isoDayUTC(inclusion.scheduleStartDate);
  const fim = isoDayUTC(inclusion.scheduleEndDate);
  if (ini !== null && fim !== null && fim >= ini) {
    return Math.round((fim - ini) / DIA_MS) + 1;
  }
  // 3) legado sem datas
  const dr = inclusion.dailyRates;
  return typeof dr === "number" && Number.isFinite(dr) && dr > 0 ? Math.floor(dr) : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÃO LOCAL (regra 19/08): "só diária".
//
// Quando o NOME DA FUNÇÃO traz a palavra isolada "local" (ex.: "produção local",
// "ativação local", "cenotécnica local", "kit local", "sup ceno local",
// "percurso local"), a vaga é de um freela CONTRATADO NA CIDADE DO EVENTO: ele
// não viaja (dorme em casa, vai por conta própria) e não recebe refeição — o
// cachê da diária já cobre alimentação e deslocamento. Logo, no Planejado:
//   • alimentação = 0
//   • mobilidade (ida e volta) = 0
//   • a DIÁRIA continua normal (contagem e valor pelas regras já existentes)
// O override manual continua valendo: se o usuário digitar um valor, ele manda.
//
// Casos que NÃO mudam:
//   • "percurso local" já era pacote fechado (isPercursoFunction) — a regra do
//     percurseiro zera alimentação/mobilidade antes e continua mandando na
//     contagem de diárias; aqui o resultado é o mesmo.
//   • "cenotécnica de casa" (sem diária) segue como está: esta regra só mexe em
//     alimentação e mobilidade, nunca na diária.
//
// A palavra tem de estar ISOLADA: "localidade", "localização" ou "vocal" não
// contam. Comparação sem acentos e sem caixa.
// ─────────────────────────────────────────────────────────────────────────────
const LOCAL_WORD_RE = /(^|[^a-z0-9])local([^a-z0-9]|$)/;

/** Marcas de acento da forma NFD (U+0300–U+036F). */
const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

/** Remove acentos e caixa — para casar o nome da função de forma tolerante. */
function normalizeFunctionName(functionName: string | null | undefined): string {
  return (functionName ?? "")
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase();
}

/**
 * A função é de contratação LOCAL (freela da cidade do evento)?
 * Nesse caso a vaga recebe SOMENTE diária: sem alimentação e sem mobilidade.
 */
export function isFuncaoLocal(functionName: string | null | undefined): boolean {
  if (!functionName) return false;
  return LOCAL_WORD_RE.test(normalizeFunctionName(functionName));
}

/** Texto curto exibido no card/modal quando a regra de função local se aplica. */
export const FUNCAO_LOCAL_RAZAO = "Função local — sem alimentação e sem mobilidade (só diária)";

// ─────────────────────────────────────────────────────────────────────────────
// PERCURSEIRO (função "percurso" — motoqueiro): pacote FECHADO por diária,
// Tipo 1 x Tipo 2 (regra do usuário 17/08). Alimentação e mobilidade do
// Planejado ficam em 0 (já estão dentro do pacote). Sem deflação.
//   • Em VIAGEM (needsTicket): SEMPRE 2 diárias, independente do período.
//   • LOCAL (sem passagem — SP/Grande SP): 1 diária. Mesma tabela.
// A NF ("16%") NÃO é derivável da tabela (ver comentário em PERCURSEIRO_TYPES),
// por isso é um VALOR editável por tipo; o total é a soma das 5 parcelas.
// ─────────────────────────────────────────────────────────────────────────────
export type PercurseiroTipo = "tipo_1" | "tipo_2";

export const PERCURSEIRO_TIPOS: { value: PercurseiroTipo; label: string }[] = [
  { value: "tipo_1", label: "Tipo 1" },
  { value: "tipo_2", label: "Tipo 2" },
];

export const PERCURSEIRO_SETTING_KEYS = {
  t1Motoqueiro: "percurseiro_t1_motoqueiro",
  t2Motoqueiro: "percurseiro_t2_motoqueiro",
  feePct: "percurseiro_fee_pct",           // percentual inteiro (15)
  alimentacao: "percurseiro_alimentacao",  // centavos (3 refeições)
  transporte: "percurseiro_transporte",    // centavos
  nfPct: "percurseiro_nf_pct",             // percentual inteiro (16) — informativo
  t1Nf: "percurseiro_t1_nf",               // centavos (valor da tabela, editável)
  t2Nf: "percurseiro_t2_nf",
} as const;

export const PERCURSEIRO_DEFAULTS = {
  t1Motoqueiro: 70000,
  t2Motoqueiro: 80000,
  feePct: 15,
  alimentacao: 10200,
  transporte: 5000,
  nfPct: 16,
  t1Nf: 17276,
  t2Nf: 19467,
} as const;

/** A função é de percurso (motoqueiro/percurseiro)? */
export function isPercursoFunction(functionName: string | null | undefined): boolean {
  if (!functionName) return false;
  return functionName.toLowerCase().includes("percurs");
}

export interface PercurseiroDiaria {
  motoqueiro: number;
  fee: number;
  alimentacao: number;
  transporte: number;
  nf: number;
  total: number;
}

/** Composição da diária do percurseiro (centavos) para o tipo, lendo os Valores Padrão. */
export function percurseiroDiariaCents(
  tipo: PercurseiroTipo | null | undefined,
  settings?: Record<string, number | string | undefined> | null,
): PercurseiroDiaria | null {
  if (tipo !== "tipo_1" && tipo !== "tipo_2") return null;
  const read = (key: string, def: number): number => {
    const raw = settings?.[key];
    const v = typeof raw === "string" ? parseInt(raw, 10) : raw;
    return (typeof v === "number" && Number.isFinite(v) && v >= 0) ? v : def;
  };
  const K = PERCURSEIRO_SETTING_KEYS, D = PERCURSEIRO_DEFAULTS;
  const motoqueiro = tipo === "tipo_1" ? read(K.t1Motoqueiro, D.t1Motoqueiro) : read(K.t2Motoqueiro, D.t2Motoqueiro);
  const fee = Math.round(motoqueiro * read(K.feePct, D.feePct) / 100);
  const alimentacao = read(K.alimentacao, D.alimentacao);
  const transporte = read(K.transporte, D.transporte);
  const nf = tipo === "tipo_1" ? read(K.t1Nf, D.t1Nf) : read(K.t2Nf, D.t2Nf);
  return { motoqueiro, fee, alimentacao, transporte, nf, total: motoqueiro + fee + alimentacao + transporte + nf };
}

/** Diárias do percurseiro: em viagem (passagem) sempre 2; local 1. */
export function diasPercurseiro(needsTicket: boolean | null | undefined): number {
  return needsTicket ? 2 : 1;
}
