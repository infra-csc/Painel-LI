/**
 * Cenotécnicos EMPREITA — valor fechado por nº de dias (slide "Regra de cálculo
 * para time Cenotécnicos Empreitas", confirmado pelo usuário em 19/08/2026).
 *
 * Quatro modalidades de freela, escolhidas NA ESCALAÇÃO (flag por vaga):
 *   Freela Viagem · Freela SP · Freela Local (A) · Freela Local (B)
 *
 * O valor é FECHADO pelo número de dias trabalhados (tabela de 2 a 6 dias) —
 * não é diária × dias e NÃO sofre deflação por período. Fora da faixa da tabela
 * (1 dia, ou 7+) o valor é extrapolado pelo incremento constante da própria
 * modalidade (a tabela é linear: Viagem +367,50/dia, SP +350,175, Local A +315,
 * Local B +250) e o resultado é marcado como `extrapolado` para a tela avisar.
 *
 * Cenotécnico de CASA (CLT) continua sem diária (regra 17/08) — esta tabela vale
 * para quem NÃO é casa. Alimentação e mobilidade seguem as regras normais (o
 * usuário confirmou em 18/08 que cenotécnico em evento tem alimentação e, fora
 * de SP, mobilidade); o valor fechado cobre só a mão de obra.
 *
 * Funções puras — sem I/O, testáveis.
 */

export const CENO_FREELA_TIPOS = ["viagem", "sp", "local_a", "local_b"] as const;
export type CenoFreelaTipo = (typeof CENO_FREELA_TIPOS)[number];

export const CENO_FREELA_TIPO_LABELS: Record<CenoFreelaTipo, string> = {
  viagem: "Freela Viagem",
  sp: "Freela SP",
  local_a: "Freela Local (A)",
  local_b: "Freela Local (B)",
};

/** Dias cobertos explicitamente pela tabela do slide. */
export const CENO_EMPREITA_TABLE_DAYS = [2, 3, 4, 5, 6] as const;
export type CenoEmpreitaTableDay = (typeof CENO_EMPREITA_TABLE_DAYS)[number];

/** Valores do slide, em CENTAVOS, por modalidade e nº de dias. */
export const CENO_EMPREITA_DEFAULTS: Record<CenoFreelaTipo, Record<CenoEmpreitaTableDay, number>> = {
  viagem:  { 2: 89013, 3: 125763, 4: 162513, 5: 199263, 6: 236013 },
  sp:      { 2: 70035, 3: 105053, 4: 140070, 5: 175088, 6: 210105 },
  local_a: { 2: 67725, 3: 99225,  4: 130725, 5: 162225, 6: 193725 },
  local_b: { 2: 53750, 3: 78750,  4: 103750, 5: 128750, 6: 153750 },
};

/** Chave do Valores Padrão para uma célula da tabela (ex.: ceno_empreita_viagem_3d). */
export function cenoEmpreitaSettingKey(tipo: CenoFreelaTipo, dias: CenoEmpreitaTableDay): string {
  return `ceno_empreita_${tipo}_${dias}d`;
}

/** Todas as 20 chaves editáveis (para allowlist/defaults do servidor). */
export const CENO_EMPREITA_SETTING_KEYS: string[] = CENO_FREELA_TIPOS.flatMap((t) =>
  CENO_EMPREITA_TABLE_DAYS.map((d) => cenoEmpreitaSettingKey(t, d)),
);

export function cenoEmpreitaDefaultsMap(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of CENO_FREELA_TIPOS) {
    for (const d of CENO_EMPREITA_TABLE_DAYS) out[cenoEmpreitaSettingKey(t, d)] = CENO_EMPREITA_DEFAULTS[t][d];
  }
  return out;
}

export function isCenoFreelaTipo(v: unknown): v is CenoFreelaTipo {
  return typeof v === "string" && (CENO_FREELA_TIPOS as readonly string[]).includes(v);
}

function readCents(
  settings: Record<string, number | string | undefined> | null | undefined,
  key: string,
  def: number,
): number {
  const raw = settings?.[key];
  const v = typeof raw === "string" ? parseInt(raw, 10) : raw;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : def;
}

/** A linha da tabela (2..6 dias) já com os Valores Padrão aplicados. */
export function cenoEmpreitaRow(
  tipo: CenoFreelaTipo,
  settings?: Record<string, number | string | undefined> | null,
): Record<CenoEmpreitaTableDay, number> {
  const out = {} as Record<CenoEmpreitaTableDay, number>;
  for (const d of CENO_EMPREITA_TABLE_DAYS) {
    out[d] = readCents(settings, cenoEmpreitaSettingKey(tipo, d), CENO_EMPREITA_DEFAULTS[tipo][d]);
  }
  return out;
}

export interface CenoEmpreitaValor {
  tipo: CenoFreelaTipo;
  dias: number;
  totalCents: number;
  /** true quando os dias estão fora da tabela (1, ou 7+) e o valor foi extrapolado */
  extrapolado: boolean;
  /** incremento por dia usado na extrapolação (centavos) */
  incrementoCents: number;
}

/**
 * Valor FECHADO da empreita para a modalidade e o nº de dias trabalhados.
 * Dias <= 0 → null (nada a pagar). Fora de 2..6 → extrapola pelo incremento
 * médio da tabela ((6 dias − 2 dias) / 4), nunca negativo.
 */
export function cenoEmpreitaTotalCents(
  tipo: CenoFreelaTipo | null | undefined,
  dias: number,
  settings?: Record<string, number | string | undefined> | null,
): CenoEmpreitaValor | null {
  if (!isCenoFreelaTipo(tipo)) return null;
  if (!Number.isFinite(dias) || dias <= 0) return null;
  const row = cenoEmpreitaRow(tipo, settings);
  const incremento = Math.round((row[6] - row[2]) / 4);
  const d = Math.round(dias);
  if (d >= 2 && d <= 6) {
    return { tipo, dias: d, totalCents: row[d as CenoEmpreitaTableDay], extrapolado: false, incrementoCents: incremento };
  }
  const base = d < 2 ? row[2] + incremento * (d - 2) : row[6] + incremento * (d - 6);
  return { tipo, dias: d, totalCents: Math.max(0, Math.round(base)), extrapolado: true, incrementoCents: incremento };
}

/**
 * A vaga usa a tabela de empreita? Cenotécnica (exceto "sup ceno", que é
 * produtor) e colaborador que NÃO é casa. `isCenotecnicaFunction` mora em
 * shared/alimentacao para não duplicar a regra de nome.
 */
export function usaEmpreitaCenotecnica(
  cenotecnica: boolean,
  tipoColaborador: string | null | undefined,
): boolean {
  return cenotecnica && tipoColaborador !== "casa";
}
