// Extraído de system-settings.tsx em 25/09 (modularização): schema zod do
// formulário de Valores padrão, rótulos das chaves, conjuntos de chaves
// especiais (percentuais, zona legada), valores iniciais e a conversão
// settings(GET) → valores do formulário. Tudo puro: sem React, sem rede.
import { z } from "zod";
import { parseBrNumber } from "@/lib/utils";
import {
  CENO_FREELA_TIPOS, CENO_FREELA_TIPO_LABELS, CENO_EMPREITA_TABLE_DAYS,
  CENO_EMPREITA_DEFAULTS, CENO_EMPREITA_SETTING_KEYS, cenoEmpreitaSettingKey,
  type CenoFreelaTipo, type CenoEmpreitaTableDay,
} from "@shared/cenotecnica-empreita";
import { centavosToReais } from "./settings-utils";

// Validação numérica no client, entendendo o formato pt-BR completo (vírgula
// decimal E ponto de milhar): "1.500,00" e "1.500" valem 1500 — a conversão
// real é sempre do parseBrNumber, o mesmo usado nas telas do Financeiro.
// Sem isso, "1.500" passava num regex ingênuo e o parseFloat salvava R$ 1,50.
const isNumericString = (v: string) =>
  /^[\d.,\s]+$/.test(v.trim()) && /\d/.test(v) && Number.isFinite(parseBrNumber(v));

// Campo monetário (reais<->centavos): número >= 0.
const moneyField = () =>
  z.string()
    .min(1, "Obrigatório")
    .refine(isNumericString, "Informe um valor numérico válido (ex.: 40,00)");

// Campo percentual inteiro: número entre 0 e 100, com mensagem própria.
const percentField = () =>
  z.string()
    .min(1, "Obrigatório")
    .refine(isNumericString, "Informe um percentual numérico válido (ex.: 90)")
    .refine(v => {
      const n = parseBrNumber(v);
      return n >= 0 && n <= 100;
    }, "O percentual deve estar entre 0 e 100");

/* ── Cenotécnicos Empreita: valor FECHADO por nº de dias ────────────────────
   A grade tem 4 modalidades × 5 colunas de dias (2 a 6) = 20 campos monetários.
   As chaves NUNCA são escritas à mão aqui: vêm de cenoEmpreitaSettingKey /
   CENO_EMPREITA_SETTING_KEYS (@shared/cenotecnica-empreita), a mesma fonte que
   o motor de cálculo usa — assim schema, defaults, labels e inputs não podem
   divergir da regra. */
export type CenoEmpreitaKey = `ceno_empreita_${CenoFreelaTipo}_${CenoEmpreitaTableDay}d`;

export const cenoEmpreitaKey = (tipo: CenoFreelaTipo, dias: CenoEmpreitaTableDay): CenoEmpreitaKey =>
  cenoEmpreitaSettingKey(tipo, dias) as CenoEmpreitaKey;

/** Percorre a grade na ordem de exibição (modalidade × dias). */
function cenoEmpreitaCells<T>(fn: (tipo: CenoFreelaTipo, dias: CenoEmpreitaTableDay) => T): T[] {
  return CENO_FREELA_TIPOS.flatMap(t => CENO_EMPREITA_TABLE_DAYS.map(d => fn(t, d)));
}

/** As 20 chaves como campos monetários do formulário. */
const cenoEmpreitaSchemaShape = Object.fromEntries(
  CENO_EMPREITA_SETTING_KEYS.map(k => [k, moneyField()]),
) as Record<CenoEmpreitaKey, ReturnType<typeof moneyField>>;

/** Grade em reais: valor salvo nos settings, com fallback na tabela do slide. */
export function cenoEmpreitaReais(s?: Record<string, number>): Record<CenoEmpreitaKey, string> {
  return Object.fromEntries(
    cenoEmpreitaCells((t, d) => [
      cenoEmpreitaKey(t, d),
      centavosToReais(s?.[cenoEmpreitaKey(t, d)] ?? CENO_EMPREITA_DEFAULTS[t][d]),
    ]),
  ) as Record<CenoEmpreitaKey, string>;
}

/** Rótulos das 20 chaves para o histórico de alterações. */
const cenoEmpreitaFieldLabels: Record<string, string> = Object.fromEntries(
  cenoEmpreitaCells((t, d) => [
    cenoEmpreitaKey(t, d),
    `Cenotécnicos Empreita — ${CENO_FREELA_TIPO_LABELS[t]} (${d} dias)`,
  ]),
);

export const formSchema = z.object({
  // Casa
  default_daily_value_weekday: moneyField(),
  default_daily_value_weekend: moneyField(),
  default_mobility_ida: moneyField(),
  default_mobility_volta: moneyField(),
  default_weekday_lunch: moneyField(),
  default_weekday_dinner: moneyField(),
  default_weekend_lunch: moneyField(),
  default_weekend_dinner: moneyField(),
  // Freela
  default_daily_value_weekday_freela: moneyField(),
  default_daily_value_weekend_freela: moneyField(),
  default_mobility_ida_freela: moneyField(),
  default_mobility_volta_freela: moneyField(),
  default_weekday_lunch_freela: moneyField(),
  default_weekday_dinner_freela: moneyField(),
  default_weekend_lunch_freela: moneyField(),
  default_weekend_dinner_freela: moneyField(),
  // Atendimento
  atendimento_key_account: moneyField(),
  atendimento_executivo_contas: moneyField(),
  // Diárias Freela (regra por viagem) — monetárias normais (reais<->centavos)
  freela_diaria_local: moneyField(),
  freela_diaria_viagem: moneyField(),
  freela_diaria_dir_prova: moneyField(),
  // Diárias Casa (regra por grupo de função) — monetárias normais (reais<->centavos)
  casa_diaria_dir_prova: moneyField(),
  casa_diaria_produtor: moneyField(),
  casa_diaria_exec_vendas: moneyField(),
  // Regra de deflação (diárias) — percentuais inteiros 0..100, NÃO monetários
  deflacao_fator_ate_4: percentField(),
  deflacao_fator_5_8: percentField(),
  deflacao_fator_9_mais: percentField(),
  // Alimentação por refeição (regra por voo) — monetárias normais (reais<->centavos)
  alimentacao_almoco: moneyField(),
  alimentacao_jantar: moneyField(),
  alimentacao_almoco_ceno: moneyField(),
  alimentacao_almoco_casa_util: moneyField(),
  alimentacao_almoco_casa_util_ceno: moneyField(),
  alimentacao_jantar_ceno: moneyField(),
  alimentacao_almoco_gestao: moneyField(),
  alimentacao_jantar_gestao: moneyField(),
  // Percurseiro (motoqueiro): pacote fechado por diária, Tipo 1 × Tipo 2
  percurseiro_t1_motoqueiro: moneyField(),
  percurseiro_t2_motoqueiro: moneyField(),
  percurseiro_fee_pct: percentField(),
  percurseiro_alimentacao: moneyField(),
  percurseiro_transporte: moneyField(),
  percurseiro_nf_pct: percentField(),
  percurseiro_t1_nf: moneyField(),
  percurseiro_t2_nf: moneyField(),
  // Cenotécnicos Empreita — valor fechado por nº de dias (4 modalidades × 2..6 dias)
  ...cenoEmpreitaSchemaShape,
});

// Chaves percentuais inteiras (0..100). NÃO passam por conversão reais<->centavos.
export const PERCENT_KEYS = new Set<string>([
  "deflacao_fator_ate_4",
  "deflacao_fator_5_8",
  "deflacao_fator_9_mais",
  "percurseiro_fee_pct",
  "percurseiro_nf_pct",
]);

// Campos que vivem dentro da zona legada (Collapsible fechado por padrão).
// Quando a validação falha num deles, a seção precisa ser aberta e o campo
// levado à vista — senão o erro fica invisível e o Salvar parece quebrado.
export const LEGACY_ZONE_FIELDS = new Set<string>([
  "default_daily_value_weekday",
  "default_daily_value_weekend",
  "default_daily_value_weekday_freela",
  "default_daily_value_weekend_freela",
  "default_weekday_lunch",
  "default_weekday_dinner",
  "default_weekend_lunch",
  "default_weekend_dinner",
  "default_weekday_lunch_freela",
  "default_weekday_dinner_freela",
  "default_weekend_lunch_freela",
  "default_weekend_dinner_freela",
]);
export type FormValues = z.infer<typeof formSchema>;

export const FIELD_LABELS: Record<string, string> = {
  ...cenoEmpreitaFieldLabels,
  default_daily_value_weekday: "Diária Casa — Dia Útil",
  default_daily_value_weekend: "Diária Casa — Fim de Semana",
  default_mobility_ida: "Mobilidade Casa — Ida",
  default_mobility_volta: "Mobilidade Casa — Volta",
  default_weekday_lunch: "Almoço Casa — Dia Útil",
  default_weekday_dinner: "Jantar Casa — Dia Útil",
  default_weekend_lunch: "Almoço Casa — Fim de Semana",
  default_weekend_dinner: "Jantar Casa — Fim de Semana",
  default_daily_value_weekday_freela: "Diária Freela — Dia Útil",
  default_daily_value_weekend_freela: "Diária Freela — Fim de Semana",
  default_mobility_ida_freela: "Mobilidade Freela — Ida",
  default_mobility_volta_freela: "Mobilidade Freela — Volta",
  default_weekday_lunch_freela: "Almoço Freela — Dia Útil",
  default_weekday_dinner_freela: "Jantar Freela — Dia Útil",
  default_weekend_lunch_freela: "Almoço Freela — Fim de Semana",
  default_weekend_dinner_freela: "Jantar Freela — Fim de Semana",
  atendimento_key_account: "Atendimento — Key Account",
  atendimento_executivo_contas: "Atendimento — Executivo de Contas",
  freela_diaria_local: "Diária Freela — Local (sem viagem)",
  freela_diaria_viagem: "Diária Freela — Em viagem",
  freela_diaria_dir_prova: "Diária Freela — Dir de Prova",
  casa_diaria_dir_prova: "Diária Casa — Dir. de Prova",
  casa_diaria_produtor: "Diária Casa — Produtor",
  casa_diaria_exec_vendas: "Diária Casa — Exec. Vendas O2 Prime",
  deflacao_fator_ate_4: "Deflação — Até 4 dias (%)",
  deflacao_fator_5_8: "Deflação — Do 5º ao 8º dia (%)",
  deflacao_fator_9_mais: "Deflação — A partir do 9º dia (%)",
  alimentacao_almoco: "Alimentação por Refeição — Almoço (Demais)",
  alimentacao_jantar: "Alimentação por Refeição — Jantar (Demais)",
  alimentacao_almoco_ceno: "Alimentação por Refeição — Almoço (Cenotécnica)",
  alimentacao_almoco_casa_util: "Alimentação por Refeição — Almoço (Casa em dia útil)",
  alimentacao_almoco_casa_util_ceno: "Alimentação por Refeição — Almoço (Cenotécnica de casa em dia útil)",
  percurseiro_t1_motoqueiro: "Percurseiro — Motoqueiro Tipo 1",
  percurseiro_t2_motoqueiro: "Percurseiro — Motoqueiro Tipo 2",
  percurseiro_fee_pct: "Percurseiro — Fee (%)",
  percurseiro_alimentacao: "Percurseiro — Alimentação (3 refeições)",
  percurseiro_transporte: "Percurseiro — Ajuda de custo transporte",
  percurseiro_nf_pct: "Percurseiro — NF (%) informativo",
  percurseiro_t1_nf: "Percurseiro — NF Tipo 1",
  percurseiro_t2_nf: "Percurseiro — NF Tipo 2",
  alimentacao_jantar_ceno: "Alimentação por Refeição — Jantar (Cenotécnica)",
  alimentacao_almoco_gestao: "Alimentação por Refeição — Almoço (Key Account / Gerente)",
  alimentacao_jantar_gestao: "Alimentação por Refeição — Jantar (Key Account / Gerente)",
};

/** Valores iniciais do formulário (antes do GET chegar) — os mesmos de sempre. */
export const FORM_DEFAULT_VALUES: FormValues = {
  default_daily_value_weekday: "50.00",
  default_daily_value_weekend: "50.00",
  default_mobility_ida: "12.50",
  default_mobility_volta: "12.50",
  default_weekday_lunch: "35.00",
  default_weekday_dinner: "40.00",
  default_weekend_lunch: "40.00",
  default_weekend_dinner: "45.00",
  default_daily_value_weekday_freela: "50.00",
  default_daily_value_weekend_freela: "50.00",
  default_mobility_ida_freela: "0.00",
  default_mobility_volta_freela: "0.00",
  default_weekday_lunch_freela: "35.00",
  default_weekday_dinner_freela: "40.00",
  default_weekend_lunch_freela: "40.00",
  default_weekend_dinner_freela: "45.00",
  atendimento_key_account: "580.00",
  atendimento_executivo_contas: "465.00",
  freela_diaria_local: "465.00",
  freela_diaria_viagem: "540.00",
  freela_diaria_dir_prova: "820.00",
  casa_diaria_dir_prova: "750.00",
  casa_diaria_produtor: "465.00",
  casa_diaria_exec_vendas: "260.00",
  deflacao_fator_ate_4: "100",
  deflacao_fator_5_8: "90",
  deflacao_fator_9_mais: "80",
  alimentacao_almoco: "40.00",
  alimentacao_jantar: "40.00",
  alimentacao_almoco_ceno: "35.00",
  alimentacao_almoco_casa_util: "5.00",
  alimentacao_almoco_casa_util_ceno: "3.00",
  percurseiro_t1_motoqueiro: "700.00",
  percurseiro_t2_motoqueiro: "800.00",
  percurseiro_fee_pct: "15",
  percurseiro_alimentacao: "102.00",
  percurseiro_transporte: "50.00",
  percurseiro_nf_pct: "16",
  percurseiro_t1_nf: "172.76",
  percurseiro_t2_nf: "194.67",
  alimentacao_jantar_ceno: "35.00",
  alimentacao_almoco_gestao: "44.00",
  alimentacao_jantar_gestao: "44.00",
  // Cenotécnicos Empreita — tabela do slide (valores em reais)
  ...cenoEmpreitaReais(),
};

/**
 * Converte o GET de /api/system-settings (centavos e percentuais crus) nos
 * valores de texto do formulário — era o corpo do `form.reset` da página.
 */
export function settingsToFormValues(settings: Record<string, number>): FormValues {
  const legacyTotal = settings.default_mobility ?? 2500;
  const half = Math.round(legacyTotal / 2);
  const s = settings as Record<string, number>;
  return {
    default_daily_value_weekday: centavosToReais(s.default_daily_value_weekday ?? s.default_daily_value ?? 5000),
    default_daily_value_weekend: centavosToReais(s.default_daily_value_weekend ?? s.default_daily_value ?? 5000),
    default_mobility_ida: centavosToReais(s.default_mobility_ida ?? Math.ceil(half)),
    default_mobility_volta: centavosToReais(s.default_mobility_volta ?? Math.floor(half)),
    default_weekday_lunch: centavosToReais(s.default_weekday_lunch ?? 3500),
    default_weekday_dinner: centavosToReais(s.default_weekday_dinner ?? 4000),
    default_weekend_lunch: centavosToReais(s.default_weekend_lunch ?? 4000),
    default_weekend_dinner: centavosToReais(s.default_weekend_dinner ?? 4500),
    default_daily_value_weekday_freela: centavosToReais(s.default_daily_value_weekday_freela ?? s.default_daily_value_weekday ?? s.default_daily_value ?? 5000),
    default_daily_value_weekend_freela: centavosToReais(s.default_daily_value_weekend_freela ?? s.default_daily_value_weekend ?? s.default_daily_value ?? 5000),
    default_mobility_ida_freela: centavosToReais(s.default_mobility_ida_freela ?? 0),
    default_mobility_volta_freela: centavosToReais(s.default_mobility_volta_freela ?? 0),
    default_weekday_lunch_freela: centavosToReais(s.default_weekday_lunch_freela ?? s.default_weekday_lunch ?? 3500),
    default_weekday_dinner_freela: centavosToReais(s.default_weekday_dinner_freela ?? s.default_weekday_dinner ?? 4000),
    default_weekend_lunch_freela: centavosToReais(s.default_weekend_lunch_freela ?? s.default_weekend_lunch ?? 4000),
    default_weekend_dinner_freela: centavosToReais(s.default_weekend_dinner_freela ?? s.default_weekend_dinner ?? 4500),
    atendimento_key_account: centavosToReais(s.atendimento_key_account ?? 58000),
    atendimento_executivo_contas: centavosToReais(s.atendimento_executivo_contas ?? 46500),
    freela_diaria_local: centavosToReais(s.freela_diaria_local ?? 46500),
    freela_diaria_viagem: centavosToReais(s.freela_diaria_viagem ?? 54000),
    freela_diaria_dir_prova: centavosToReais(s.freela_diaria_dir_prova ?? 82000),
    casa_diaria_dir_prova: centavosToReais(s.casa_diaria_dir_prova ?? 75000),
    casa_diaria_produtor: centavosToReais(s.casa_diaria_produtor ?? 46500),
    casa_diaria_exec_vendas: centavosToReais(s.casa_diaria_exec_vendas ?? 26000),
    // Percentuais inteiros — usar o valor cru do GET, SEM centavosToReais
    deflacao_fator_ate_4: String(s.deflacao_fator_ate_4 ?? 100),
    deflacao_fator_5_8: String(s.deflacao_fator_5_8 ?? 90),
    deflacao_fator_9_mais: String(s.deflacao_fator_9_mais ?? 80),
    alimentacao_almoco: centavosToReais(s.alimentacao_almoco ?? 4000),
    alimentacao_jantar: centavosToReais(s.alimentacao_jantar ?? 4000),
    alimentacao_almoco_ceno: centavosToReais(s.alimentacao_almoco_ceno ?? 3500),
    alimentacao_almoco_casa_util: centavosToReais(s.alimentacao_almoco_casa_util ?? 500),
    alimentacao_almoco_casa_util_ceno: centavosToReais(s.alimentacao_almoco_casa_util_ceno ?? 300),
    percurseiro_t1_motoqueiro: centavosToReais(s.percurseiro_t1_motoqueiro ?? 70000),
    percurseiro_t2_motoqueiro: centavosToReais(s.percurseiro_t2_motoqueiro ?? 80000),
    percurseiro_fee_pct: String(s.percurseiro_fee_pct ?? 15),
    percurseiro_alimentacao: centavosToReais(s.percurseiro_alimentacao ?? 10200),
    percurseiro_transporte: centavosToReais(s.percurseiro_transporte ?? 5000),
    percurseiro_nf_pct: String(s.percurseiro_nf_pct ?? 16),
    percurseiro_t1_nf: centavosToReais(s.percurseiro_t1_nf ?? 17276),
    percurseiro_t2_nf: centavosToReais(s.percurseiro_t2_nf ?? 19467),
    alimentacao_jantar_ceno: centavosToReais(s.alimentacao_jantar_ceno ?? 3500),
    alimentacao_almoco_gestao: centavosToReais(s.alimentacao_almoco_gestao ?? 4400),
    alimentacao_jantar_gestao: centavosToReais(s.alimentacao_jantar_gestao ?? 4400),
    // Cenotécnicos Empreita — 20 células, cada uma com fallback na tabela do slide
    ...cenoEmpreitaReais(s),
  };
}
