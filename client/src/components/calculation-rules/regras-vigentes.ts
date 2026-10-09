/**
 * Valores VIGENTES das Regras de cálculo — os mesmos `system_settings` que o
 * motor do Planejado lê (Valores Padrão), com o padrão do slide 2026 quando a
 * chave não existe. Só leitura e só apresentação: nenhuma regra mora aqui,
 * tudo vem de `@shared/*` (redesenho 08/10, extraído de pages/calculation-rules).
 */
import { useMemo } from "react";
import {
  deflationFactorsFromSettings, type DeflationFactors,
  CASA_DAILY_RATES, CASA_FOOD_2026,
  FREELA_DAILY_RATES,
  PERCURSEIRO_TIPOS, PERCURSEIRO_SETTING_KEYS, PERCURSEIRO_DEFAULTS, percurseiroDiariaCents, type PercurseiroDiaria,
  CASA_SETTING_KEYS, FREELA_SETTING_KEYS,
} from "@shared/calculation-rules";
import {
  ALIMENTACAO_ALMOCO_CASA_UTIL_KEY, ALIMENTACAO_ALMOCO_CASA_UTIL_DEFAULT_CENTS,
  ALIMENTACAO_ALMOCO_CASA_UTIL_CENO_KEY, ALIMENTACAO_ALMOCO_CASA_UTIL_CENO_DEFAULT_CENTS,
} from "@shared/alimentacao";
import {
  CENO_FREELA_TIPOS, CENO_FREELA_TIPO_LABELS, CENO_EMPREITA_TABLE_DAYS,
  CENO_EMPREITA_DEFAULTS, cenoEmpreitaRow, type CenoFreelaTipo, type CenoEmpreitaTableDay,
} from "@shared/cenotecnica-empreita";

export type SystemSettings = Record<string, number>;

/** Valor vigente de uma tarifa: settings do Valores Padrão com fallback na constante 2026. */
export function effectiveCents(settings: SystemSettings | undefined, key: string, fallback: number): number {
  const v = settings?.[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Chave editável (Valores Padrão) correspondente a cada linha das tabelas exibidas. */
const CASA_RATE_KEYS: Record<string, string> = {
  "Dir. Prova": CASA_SETTING_KEYS.dirProva,
  "Produtor (Produção, Ativação, Kit, SupCeno)": CASA_SETTING_KEYS.produtor,
  "Executivo Vendas O2 Prime": CASA_SETTING_KEYS.execVendas,
  "Atendimento (Key Account)": "atendimento_key_account",
  "Atendimento (Executivo de Contas)": "atendimento_executivo_contas",
};
const FREELA_RATE_KEYS: Record<string, string> = {
  "Produtor / Sup Ceno / Kit / Ativação / Percurso — Local": FREELA_SETTING_KEYS.local,
  "Produtor / Sup Ceno / Kit / Ativação / Percurso — em viagem": FREELA_SETTING_KEYS.viagem,
  "Dir de Prova": FREELA_SETTING_KEYS.dirProva,
};

/** Uma tarifa exibida: valor vigente e o do slide (para marcar o que foi editado). */
export interface Tarifa { funcao: string; cents: number; padraoCents: number }

export interface RefeicaoLinha {
  refeicao: string;
  demaisCents: number; demaisPadrao: number;
  cenotecnicaCents: number; cenotecnicaPadrao: number;
  gestaoCents: number; gestaoPadrao: number;
}

export interface LinhaEmpreita {
  tipo: CenoFreelaTipo;
  label: string;
  row: Record<CenoEmpreitaTableDay, number>;
  incremento: number;
  editada: boolean;
}

export interface RegrasVigentes {
  factors: DeflationFactors;
  casaRates: Tarifa[];
  freelaRates: Tarifa[];
  food: { jornadaExterna: RefeicaoLinha[]; emViagem: RefeicaoLinha[] };
  /** Almoço do colaborador de casa (CLT) em dia útil — demais / cenotécnica. */
  almocoCasaUtil: { demais: number; ceno: number };
  empreita: LinhaEmpreita[];
  percurseiro: { label: string; d: PercurseiroDiaria }[];
  /** Percentuais exibidos no rótulo (o fee entra na conta; a NF é informativa). */
  percurseiroFeePct: number;
  percurseiroNfPct: number;
  /** Algum valor das tabelas difere do padrão do slide (mostra a legenda do âmbar). */
  algumAlterado: boolean;
}

/** Leitura igual à de `percurseiroDiariaCents` (aceita zero). */
function lerPct(settings: SystemSettings | undefined, key: string, def: number): number {
  const v = settings?.[key];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : def;
}

export function useRegrasVigentes(settings: SystemSettings | undefined): RegrasVigentes {
  return useMemo(() => {
    const factors = deflationFactorsFromSettings(settings);
    const casaRates = CASA_DAILY_RATES.map(r => ({ funcao: r.funcao, cents: effectiveCents(settings, CASA_RATE_KEYS[r.funcao], r.cents), padraoCents: r.cents }));
    const freelaRates = FREELA_DAILY_RATES.map(r => ({ funcao: r.funcao, cents: effectiveCents(settings, FREELA_RATE_KEYS[r.funcao], r.cents), padraoCents: r.cents }));

    // Alimentação: valor vigente dos Valores Padrão (alimentacao_*) com
    // fallback nas constantes 2026 do slide.
    const mapRow = (f: { refeicao: string; demaisCents: number; cenotecnicaCents: number }): RefeicaoLinha => {
      const isAlmoco = f.refeicao.toLowerCase().startsWith("almoço");
      return {
        refeicao: f.refeicao,
        demaisCents: effectiveCents(settings, isAlmoco ? "alimentacao_almoco" : "alimentacao_jantar", f.demaisCents),
        demaisPadrao: f.demaisCents,
        cenotecnicaCents: effectiveCents(settings, isAlmoco ? "alimentacao_almoco_ceno" : "alimentacao_jantar_ceno", f.cenotecnicaCents),
        cenotecnicaPadrao: f.cenotecnicaCents,
        // Key Account / Gerente (regra 18/08): R$ 44 por refeição por padrão
        gestaoCents: effectiveCents(settings, isAlmoco ? "alimentacao_almoco_gestao" : "alimentacao_jantar_gestao", 4400),
        gestaoPadrao: 4400,
      };
    };
    const food = {
      jornadaExterna: CASA_FOOD_2026.jornadaExterna.map(mapRow),
      emViagem: CASA_FOOD_2026.emViagem.map(mapRow),
    };
    const almocoCasaUtil = {
      demais: effectiveCents(settings, ALIMENTACAO_ALMOCO_CASA_UTIL_KEY, ALIMENTACAO_ALMOCO_CASA_UTIL_DEFAULT_CENTS),
      ceno: effectiveCents(settings, ALIMENTACAO_ALMOCO_CASA_UTIL_CENO_KEY, ALIMENTACAO_ALMOCO_CASA_UTIL_CENO_DEFAULT_CENTS),
    };

    // Empreita: valores VIGENTES, com fallback na tabela do slide 19/08
    const empreita = CENO_FREELA_TIPOS.map(tipo => {
      const row = cenoEmpreitaRow(tipo, settings);
      return {
        tipo,
        label: CENO_FREELA_TIPO_LABELS[tipo],
        row,
        incremento: Math.round((row[6] - row[2]) / 4),
        editada: CENO_EMPREITA_TABLE_DAYS.some(d => row[d] !== CENO_EMPREITA_DEFAULTS[tipo][d]),
      };
    });

    // Percurseiro: valores VIGENTES, com fallback na tabela do usuário 17/08
    const percurseiro = PERCURSEIRO_TIPOS.map(t => ({ label: t.label, d: percurseiroDiariaCents(t.value, settings)! }));

    const refeicaoAlterada = (f: RefeicaoLinha) =>
      f.demaisCents !== f.demaisPadrao || f.cenotecnicaCents !== f.cenotecnicaPadrao || f.gestaoCents !== f.gestaoPadrao;
    const algumAlterado =
      [...casaRates, ...freelaRates].some(t => t.cents !== t.padraoCents) ||
      [...food.jornadaExterna, ...food.emViagem].some(refeicaoAlterada) ||
      empreita.some(l => l.editada);

    return {
      factors, casaRates, freelaRates, food, almocoCasaUtil, empreita, percurseiro, algumAlterado,
      percurseiroFeePct: lerPct(settings, PERCURSEIRO_SETTING_KEYS.feePct, PERCURSEIRO_DEFAULTS.feePct),
      percurseiroNfPct: lerPct(settings, PERCURSEIRO_SETTING_KEYS.nfPct, PERCURSEIRO_DEFAULTS.nfPct),
    };
  }, [settings]);
}
