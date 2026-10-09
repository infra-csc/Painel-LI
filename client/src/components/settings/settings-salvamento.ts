// Valores padrão — regras PURAS do salvamento (08/10, correção de defeitos):
// corpo das tarifas, histórico local (tarifas e diárias por função) com um só
// carimbo de tempo por salvamento, o lote das diárias por função com SÓ as
// células alteradas, e as mesclas que preservam o que foi editado durante o
// envio. Sem React e sem rede — testado em client/src/components/settings/
// settings-salvamento.test.ts.
import type { Function as FunctionType, FunctionValue } from "@shared/schema";
import { parseBrNumber } from "@/lib/utils";
import { FIELD_LABELS, PERCENT_KEYS, settingsToFormValues, type FormValues } from "./settings-schema";
import { centavosToReais, formatCurrency, freelaOuCasa, toTitleCase, type HistoryEntry } from "./settings-utils";

/** Quem e quando: UM por salvamento — o histórico agrupa por ele. */
export interface Carimbo {
  timestamp: string;
  user: string;
}

const mesmoNumero = (a: string | undefined, b: string | undefined) =>
  parseBrNumber(a ?? "") === parseBrNumber(b ?? "");

// ── Tarifas (system_settings) ────────────────────────────────────────────────

/** Corpo do salvamento das tarifas (reais/percentuais; o servidor converte). */
export function corpoDasTarifas(values: FormValues): Record<string, number> {
  const body: Record<string, number> = {};
  for (const [key, val] of Object.entries(values)) body[key] = parseBrNumber(val);
  // Total legado (ida + volta), mantido como sempre foi enviado.
  body["default_mobility"] = (parseBrNumber(values.default_mobility_ida) || 0) + (parseBrNumber(values.default_mobility_volta) || 0);
  return body;
}

/**
 * Entradas do histórico para as tarifas que mudaram. O "antes" é o valor
 * EFETIVO que a tela mostrava (o mesmo `settingsToFormValues` do formulário,
 * com o default real de cada chave) — antes caía em `default_daily_value`
 * (R$ 50,00) para qualquer chave ausente e ainda registrava como "alterada"
 * uma chave que a pessoa nem tocou.
 */
export function historicoDasTarifas(settings: Record<string, number>, values: FormValues, carimbo: Carimbo): HistoryEntry[] {
  const antes = settingsToFormValues(settings);
  const entradas: HistoryEntry[] = [];
  for (const key of Object.keys(values) as (keyof FormValues)[]) {
    const velho = antes[key];
    const novo = values[key];
    if (mesmoNumero(velho, novo)) continue;
    const field = FIELD_LABELS[key] ?? key;
    if (PERCENT_KEYS.has(key)) {
      entradas.push({ ...carimbo, field, oldValue: velho ? `${velho}%` : "—", newValue: `${novo}%` });
    } else {
      entradas.push({ ...carimbo, field, oldValue: velho ? formatCurrency(velho) : "—", newValue: formatCurrency(novo) });
    }
  }
  return entradas;
}

/** Campos cujo valor atual difere do que foi enviado (editados DURANTE o salvamento). */
export function camposEditadosDepoisDoEnvio(enviados: FormValues, atuais: FormValues): (keyof FormValues)[] {
  return (Object.keys(atuais) as (keyof FormValues)[]).filter(k => atuais[k] !== enviados[k]);
}

// ── Diárias por função (function_values) ─────────────────────────────────────

/** Os 4 mapas fnId → texto em reais (casa/freela × dia útil/fim de semana). */
export interface MapasDasFuncoes {
  casaWd: Record<string, string>;
  casaWe: Record<string, string>;
  freelaWd: Record<string, string>;
  freelaWe: Record<string, string>;
}
export type MapaDaFuncao = keyof MapasDasFuncoes;

type ColunaDaFuncao = "dailyValue" | "dailyValueWeekend" | "dailyValueFreela" | "dailyValueFreelaWeekend";

const CELULAS: { mapa: MapaDaFuncao; coluna: ColunaDaFuncao; rotulo: string; salvo: (fv: FunctionValue) => number }[] = [
  { mapa: "casaWd", coluna: "dailyValue", rotulo: "Casa · Dia Útil", salvo: fv => fv.dailyValue },
  { mapa: "casaWe", coluna: "dailyValueWeekend", rotulo: "Casa · Fim de semana", salvo: fv => fv.dailyValueWeekend ?? 0 },
  // Freela 0 = "usa o valor casa": a tela mostra o casa, mas o salvo é 0.
  { mapa: "freelaWd", coluna: "dailyValueFreela", rotulo: "Freela · Dia Útil", salvo: fv => freelaOuCasa(fv.dailyValueFreela, fv.dailyValue) },
  { mapa: "freelaWe", coluna: "dailyValueFreelaWeekend", rotulo: "Freela · Fim de semana", salvo: fv => freelaOuCasa(fv.dailyValueFreelaWeekend, fv.dailyValueWeekend) },
];

export const mapasVazios = (): MapasDasFuncoes => ({ casaWd: {}, casaWe: {}, freelaWd: {}, freelaWe: {} });

/** O que está salvo, como a tela mostra (freela zerado → valor casa). */
export function mapasSalvos(funcoes: FunctionType[], valores: FunctionValue[]): MapasDasFuncoes {
  const m = mapasVazios();
  for (const fn of funcoes) {
    const fv = valores.find(v => v.functionId === fn.id);
    for (const c of CELULAS) m[c.mapa][fn.id] = fv ? centavosToReais(c.salvo(fv)) : "0.00";
  }
  return m;
}

/** Células da função cujo valor atual difere do salvo (comparação numérica). */
function celulasAlteradas(fn: FunctionType, fv: FunctionValue | undefined, atuais: MapasDasFuncoes) {
  return CELULAS
    .map(c => ({ c, salvo: fv ? centavosToReais(c.salvo(fv)) : "0.00", atual: atuais[c.mapa][fn.id] ?? "0" }))
    .filter(x => !mesmoNumero(x.atual, x.salvo));
}

export function funcaoAlterada(fn: FunctionType, valores: FunctionValue[], atuais: MapasDasFuncoes): boolean {
  return celulasAlteradas(fn, valores.find(v => v.functionId === fn.id), atuais).length > 0;
}

/** Item do lote enviado ao servidor (centavos; só as colunas alteradas). */
export interface FuncaoNoLote {
  functionId: string;
  dailyValue?: number;
  dailyValueWeekend?: number;
  dailyValueFreela?: number;
  dailyValueFreelaWeekend?: number;
}

/**
 * Lote das diárias por função: SÓ as células que a pessoa mudou. Antes, mudar
 * qualquer célula gravava as 4 — e o freela que estava em 0 ("usa o casa")
 * virava o valor casa explícito, descolando do casa dali em diante.
 */
export function loteDasFuncoes(funcoes: FunctionType[], valores: FunctionValue[], atuais: MapasDasFuncoes): FuncaoNoLote[] {
  const lote: FuncaoNoLote[] = [];
  for (const fn of funcoes) {
    const alteradas = celulasAlteradas(fn, valores.find(v => v.functionId === fn.id), atuais);
    if (alteradas.length === 0) continue;
    const item: FuncaoNoLote = { functionId: fn.id };
    for (const { c, atual } of alteradas) item[c.coluna] = Math.round(parseBrNumber(atual || "0") * 100);
    lote.push(item);
  }
  return lote;
}

/** Histórico/lista "antes → depois" das diárias por função alteradas. */
export function historicoDasFuncoes(
  funcoes: FunctionType[], valores: FunctionValue[], atuais: MapasDasFuncoes, carimbo: Carimbo,
): HistoryEntry[] {
  const entradas: HistoryEntry[] = [];
  for (const fn of funcoes) {
    for (const { c, salvo, atual } of celulasAlteradas(fn, valores.find(v => v.functionId === fn.id), atuais)) {
      entradas.push({
        ...carimbo,
        field: `Diária por função — ${toTitleCase(fn.name)} (${c.rotulo})`,
        oldValue: formatCurrency(salvo),
        newValue: formatCurrency(atual),
      });
    }
  }
  return entradas;
}

/**
 * Recarga dos valores salvos sem perder edição em andamento: a célula cujo
 * valor atual difere da `base` (o que estava salvo, ou o que foi enviado no
 * salvamento em curso) é edição da pessoa e fica; o resto vem do servidor.
 */
export function mesclarRecarga(frescos: MapasDasFuncoes, atuais: MapasDasFuncoes, base: MapasDasFuncoes): MapasDasFuncoes {
  const m = mapasVazios();
  for (const mapa of Object.keys(m) as MapaDaFuncao[]) {
    m[mapa] = { ...frescos[mapa] };
    for (const [id, valor] of Object.entries(atuais[mapa])) {
      if (id in base[mapa] && valor !== base[mapa][id]) m[mapa][id] = valor;
    }
  }
  return m;
}
