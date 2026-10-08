// Valores padrão — redesenho 08/10: o mapa das seções da tela (índice
// lateral, contagem de alterações por seção, lista "o que mudou" da barra de
// alterações e o painel de resumo). Só apresentação: nenhuma chave nova, nenhum
// valor — as chaves são as do formSchema e os rótulos dizem o campo do jeito
// que aparece na tela (o FIELD_LABELS do histórico tem outra redação; os
// rótulos dele cobrem todas as chaves — conferido em settings-salvamento.test.ts).
import { CENO_FREELA_TIPOS, CENO_FREELA_TIPO_LABELS, CENO_EMPREITA_TABLE_DAYS } from "@shared/cenotecnica-empreita";
import { parseBrNumber } from "@/lib/utils";
import { cenoEmpreitaKey, PERCENT_KEYS, type FormValues } from "./settings-schema";

export type SecaoId =
  | "diarias" | "deflacao" | "alimentacao" | "percurseiro" | "mobilidade" | "cenotecnicos"
  | "empresas" | "legado" | "historico";

export interface SecaoDaTela {
  id: SecaoId;
  titulo: string;
  /** Campos do formulário (barra de alterações) que moram nesta seção. */
  campos: (keyof FormValues)[];
}

const CENO_CAMPOS = CENO_FREELA_TIPOS.flatMap(t => CENO_EMPREITA_TABLE_DAYS.map(d => cenoEmpreitaKey(t, d)));

export const SECOES: SecaoDaTela[] = [
  { id: "diarias", titulo: "Diárias", campos: [
    "casa_diaria_dir_prova", "casa_diaria_produtor", "casa_diaria_exec_vendas",
    "freela_diaria_local", "freela_diaria_viagem", "freela_diaria_dir_prova",
    "atendimento_key_account", "atendimento_executivo_contas",
  ] },
  { id: "deflacao", titulo: "Deflação", campos: ["deflacao_fator_ate_4", "deflacao_fator_5_8", "deflacao_fator_9_mais"] },
  { id: "alimentacao", titulo: "Alimentação", campos: [
    "alimentacao_almoco", "alimentacao_jantar", "alimentacao_almoco_ceno", "alimentacao_jantar_ceno",
    "alimentacao_almoco_gestao", "alimentacao_jantar_gestao", "alimentacao_almoco_casa_util", "alimentacao_almoco_casa_util_ceno",
  ] },
  { id: "percurseiro", titulo: "Percurseiro", campos: [
    "percurseiro_t1_motoqueiro", "percurseiro_t2_motoqueiro", "percurseiro_fee_pct", "percurseiro_alimentacao",
    "percurseiro_transporte", "percurseiro_nf_pct", "percurseiro_t1_nf", "percurseiro_t2_nf",
  ] },
  { id: "mobilidade", titulo: "Mobilidade", campos: ["default_mobility_ida", "default_mobility_volta", "default_mobility_ida_freela", "default_mobility_volta_freela"] },
  { id: "cenotecnicos", titulo: "Cenotécnicos empreita", campos: CENO_CAMPOS },
  { id: "empresas", titulo: "Empresas pagadoras", campos: [] },
  { id: "legado", titulo: "Valores legados", campos: [
    "default_daily_value_weekday", "default_daily_value_weekend", "default_daily_value_weekday_freela", "default_daily_value_weekend_freela",
    "default_weekday_lunch", "default_weekday_dinner", "default_weekend_lunch", "default_weekend_dinner",
    "default_weekday_lunch_freela", "default_weekday_dinner_freela", "default_weekend_lunch_freela", "default_weekend_dinner_freela",
  ] },
  { id: "historico", titulo: "Histórico", campos: [] },
];

/** Âncora da seção na página (o índice e o resumo rolam até ela). */
export const ancoraDaSecao = (id: SecaoId) => `cfg-secao-${id}`;

const ROTULOS: Record<string, string> = {
  casa_diaria_dir_prova: "Diária casa · Dir. de prova",
  casa_diaria_produtor: "Diária casa · Produtor",
  casa_diaria_exec_vendas: "Diária casa · Exec. vendas O2 Prime",
  freela_diaria_local: "Diária freela · Local",
  freela_diaria_viagem: "Diária freela · Em viagem",
  freela_diaria_dir_prova: "Diária freela · Dir. de prova",
  atendimento_key_account: "Atendimento · Key Account",
  atendimento_executivo_contas: "Atendimento · Executivo de contas",
  deflacao_fator_ate_4: "Deflação · até 4 dias",
  deflacao_fator_5_8: "Deflação · 5º ao 8º dia",
  deflacao_fator_9_mais: "Deflação · a partir do 9º dia",
  alimentacao_almoco: "Almoço · demais",
  alimentacao_jantar: "Jantar · demais",
  alimentacao_almoco_ceno: "Almoço · cenotécnica",
  alimentacao_jantar_ceno: "Jantar · cenotécnica",
  alimentacao_almoco_gestao: "Almoço · Key Account / Gerente",
  alimentacao_jantar_gestao: "Jantar · Key Account / Gerente",
  alimentacao_almoco_casa_util: "Almoço · casa (CLT) em dia útil",
  alimentacao_almoco_casa_util_ceno: "Almoço · cenotécnica de casa em dia útil",
  percurseiro_t1_motoqueiro: "Percurseiro · motoqueiro tipo 1",
  percurseiro_t2_motoqueiro: "Percurseiro · motoqueiro tipo 2",
  percurseiro_fee_pct: "Percurseiro · fee",
  percurseiro_alimentacao: "Percurseiro · alimentação",
  percurseiro_transporte: "Percurseiro · transporte",
  percurseiro_nf_pct: "Percurseiro · NF (informativo)",
  percurseiro_t1_nf: "Percurseiro · NF tipo 1",
  percurseiro_t2_nf: "Percurseiro · NF tipo 2",
  default_mobility_ida: "Mobilidade casa · ida",
  default_mobility_volta: "Mobilidade casa · volta",
  default_mobility_ida_freela: "Mobilidade freela · ida",
  default_mobility_volta_freela: "Mobilidade freela · volta",
  default_daily_value_weekday: "Legado · diária casa, dia útil",
  default_daily_value_weekend: "Legado · diária casa, fim de semana",
  default_daily_value_weekday_freela: "Legado · diária freela, dia útil",
  default_daily_value_weekend_freela: "Legado · diária freela, fim de semana",
  default_weekday_lunch: "Legado · almoço casa, dia útil",
  default_weekday_dinner: "Legado · jantar casa, dia útil",
  default_weekend_lunch: "Legado · almoço casa, fim de semana",
  default_weekend_dinner: "Legado · jantar casa, fim de semana",
  default_weekday_lunch_freela: "Legado · almoço freela, dia útil",
  default_weekday_dinner_freela: "Legado · jantar freela, dia útil",
  default_weekend_lunch_freela: "Legado · almoço freela, fim de semana",
  default_weekend_dinner_freela: "Legado · jantar freela, fim de semana",
  ...Object.fromEntries(CENO_FREELA_TIPOS.flatMap(t => CENO_EMPREITA_TABLE_DAYS.map(d => [
    cenoEmpreitaKey(t, d), `Empreita · ${CENO_FREELA_TIPO_LABELS[t]}, ${d} dias`,
  ]))),
};

export function rotuloDoCampo(key: string): string {
  return ROTULOS[key] ?? key;
}

const NUMERO_BR = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Texto do formulário → número pt-BR para LER ("1257.63" → "1.257,63").
 * Não muda o valor do formulário; texto que não é número volta como veio.
 */
export function numeroParaLer(raw: string | undefined | null): string {
  const s = String(raw ?? "").trim();
  if (!s || !/\d/.test(s) || !/^[\d.,\s]+$/.test(s)) return s;
  return NUMERO_BR.format(parseBrNumber(s));
}

/** "R$ 1.257,63" / "90%" para a lista de alterações e o resumo. */
export function valorParaLer(key: string, raw: string | undefined | null): string {
  if (PERCENT_KEYS.has(key)) {
    const s = String(raw ?? "").trim();
    return s ? `${s.replace(".", ",")}%` : "—";
  }
  const n = numeroParaLer(raw);
  return n ? `R$ ${n}` : "—";
}

/**
 * Valor de sistema → texto para EDITAR: "465.00" (como o servidor manda) vira
 * "465,00" no campo focado. O que o usuário digita fica como ele digitou.
 */
export function numeroParaEditar(raw: string | undefined | null): string {
  const s = String(raw ?? "");
  return /^\d+\.\d{1,2}$/.test(s) ? s.replace(".", ",") : s;
}
