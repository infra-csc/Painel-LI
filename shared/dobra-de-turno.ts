/**
 * Dobra de turno no Realizado — pedido do dono (29/10).
 *
 * "No Realizado ter a opção de dobrar": a MESMA pessoa trabalhou dobrado num
 * dia, então aquele dia paga 2 diárias — a diária do dia + mais uma diária
 * cheia do MESMO dia. Só no Realizado (a Escalação e o Planejado não têm).
 *
 * Regra (uma só, usada pelo modal do Realizado, pelo servidor e pela presença):
 *  - A dobra vale uma diária cheia DAQUELE dia, com o fator da deflação do dia
 *    (o 6º dia paga 90%: a dobra dele também é 90%) — o mesmo caminho do ½
 *    (shared/meia-diaria → `valoresDosDiasDoSubtotal`, `dobraDaDiaria`).
 *  - Só dia TRABALHADO (ativo na prestação) e que recebe diária pela regra do
 *    colaborador; desmarcar o dia tira a dobra. Casa/CLT em dia útil não tem
 *    diária: não tem dobra.
 *  - Um dia não é ½ e dobra ao mesmo tempo: a dobra SUBSTITUI o ½ (marcar a
 *    dobra tira o ½ do dia; marcar o ½ tira a dobra). Nas duas listas, vale a dobra.
 *  - Alimentação não muda (só diária); horas extras continuam à parte (a hora
 *    do dia com dobra é a da diária do dia, não a dobrada).
 *  - Gravação: o valor da dobra já está no valor do dia e no total; a lista
 *    `diasDobra` (budget_actual.dias_dobra) diz QUAIS dias. Diferente do ½
 *    (que não é inteiro), a dobra CONTA na quantidade de diárias (o dia paga 2):
 *    3 dias com 1 dobra = 4 diárias, e a diária gravada é a média.
 *  - Presença (fluxo novo): é um FATO do dia, não um ajuste — entra no valor
 *    calculado (não consome o limite de ±10% da produção). A falta no dia com
 *    dobra tira as duas diárias do dia. Marcada depois do 1º check-out final,
 *    a base do recálculo acompanha (`baseComDobras` em shared/presenca.ts).
 *  - Prestação travada (enviada ao DP / aprovada): só o DP marca — a mesma
 *    trava das outras edições do Realizado.
 */
import { MAX_DIAS_DE_TRABALHO } from "./dias-de-trabalho";
import { dataIsoValida, dobraDaDiaria, normalizarDiasMeiaExtra } from "./meia-diaria";

export { dobraDaDiaria };

/** Rótulo do dia marcado (grade do Realizado, cards, Conferência). */
export const DOBRA_ROTULO = "Dobra de turno (2 diárias no dia)";

/** Selo curto do dia com dobra. */
export const DOBRA_SELO = "2×";

/** Começo do trecho que a dobra põe no motivo da mudança (`change_reason`). */
export const DOBRA_MOTIVO_PREFIXO = "Dobra de turno em";

/**
 * Lista limpa dos dias com dobra: só datas válidas, sem repetição, ordenadas
 * e DENTRO de `diasPermitidos` (os dias ativos da prestação). Lixo vira [].
 */
export function normalizarDiasDobra(dias: unknown, diasPermitidos: readonly string[]): string[] {
  return normalizarDiasMeiaExtra(dias, diasPermitidos);
}

/**
 * ½ e dobra no mesmo dia: fica a dobra (ela substitui o ½). Devolve as duas
 * listas limpas (ordenadas, sem repetir) e sem conflito.
 */
export function separarMeiaEDobra(a: {
  diasMeiaExtra: readonly string[];
  diasDobra: readonly string[];
}): { diasMeiaExtra: string[]; diasDobra: string[] } {
  const dobra = Array.from(new Set(a.diasDobra)).sort();
  const comDobra = new Set(dobra);
  return { diasDobra: dobra, diasMeiaExtra: Array.from(new Set(a.diasMeiaExtra)).filter((d) => !comDobra.has(d)).sort() };
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const datasPorExtenso = (lista: readonly string[]) => {
  const datas = lista.map(ddmm);
  return datas.length === 1 ? datas[0] : `${datas.slice(0, -1).join(", ")} e ${datas[datas.length - 1]}`;
};
const limpa = (dias: readonly (string | null | undefined)[] | null | undefined) =>
  Array.from(new Set((dias ?? []).map((d) => String(d ?? "").slice(0, 10)).filter(dataIsoValida))).sort().slice(0, MAX_DIAS_DE_TRABALHO);

/** "1 dobra" · "2 dobras". Zero → "". */
export function contagemDasDobras(n: number): string {
  if (!n || n <= 0) return "";
  return `${n} ${n === 1 ? "dobra" : "dobras"}`;
}

/** "1 dobra (12/10)" · "2 dobras (11/10 e 12/10)". Lista vazia → "". */
export function resumoDasDobras(dias: readonly (string | null | undefined)[] | null | undefined): string {
  const lista = limpa(dias);
  if (lista.length === 0) return "";
  return `${contagemDasDobras(lista.length)} (${datasPorExtenso(lista)})`;
}

/**
 * O motivo da mudança (`change_reason`) com a dobra registrada (29/10): tira
 * o trecho "Dobra de turno em …" de antes e põe o atual — "dobra em dd/mm" na
 * justificativa que a Conferência DP lê. Sem dobra, só o resto (ou null).
 */
export function motivoComDobras(motivoAnterior: string | null | undefined, dias: readonly (string | null | undefined)[] | null | undefined): string | null {
  const partes = String(motivoAnterior ?? "").split(" · ").map((p) => p.trim()).filter((p) => p && !p.startsWith(DOBRA_MOTIVO_PREFIXO));
  const lista = limpa(dias);
  if (lista.length > 0) partes.push(`${DOBRA_MOTIVO_PREFIXO} ${datasPorExtenso(lista)} (2 diárias no dia)`);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** Mesmas datas (ignora ordem, repetição e lixo)? */
export function mesmosDiasDeDobra(a: readonly (string | null | undefined)[] | null | undefined, b: readonly (string | null | undefined)[] | null | undefined): boolean {
  const x = limpa(a);
  const y = limpa(b);
  return x.length === y.length && x.every((d, i) => d === y[i]);
}
