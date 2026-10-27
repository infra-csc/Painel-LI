/**
 * 1,5 diária num dia — pedido do DP (27/10), regra de 28/10.
 *
 * "Acontece quando tem carregamento/descarregamento e uma diária do dia, como
 * na Night Run." Quem escala marca o dia na vaga (Escalação), o Planejado já
 * calcula, e o DP marca/desmarca no Planejado (ajuste da linha) e no
 * Realizado (dias trabalhados).
 *
 * Regra (uma só, usada pelo motor do Planejado, pelo Realizado e pelo servidor):
 *  - O dia marcado tem de ser um dia de TRABALHO da vaga (`workDays`; sem
 *    eles, o período início→fim). Dia fora disso é ignorado.
 *  - O ½ é metade da diária DAQUELE dia, com o MESMO fator de deflação do dia
 *    (o 6º dia paga 90%: o ½ dele também é 90%) — decisão de 28/10: a meia
 *    diária é parte do dia, não um dia novo, então não empurra a contagem das
 *    faixas nem paga 100% num dia que já é deflacionado.
 *  - Dia que não recebe diária pela regra do colaborador (casa/CLT em dia
 *    útil, cenotécnica da casa) continua sem diária: ½ de zero é zero — o
 *    "1,5" da casa só vale no fim de semana (mesma regra do dia).
 *  - Percurso e empreita da tabela (valor fechado): o ½ é metade do valor do
 *    dia (pacote do dia / valor fechado ÷ dias), sem deflação, como o dia.
 *  - Honorário APROVADO da cenotécnica e empreita por EMPRESA: o valor é o
 *    aprovado/fechado da vaga inteira — o ½ não se soma (o DP ajusta à mão).
 *
 * Gravação: a quantidade de diárias continua inteira (dias com diária) e a
 * diária gravada é a média (subtotal ÷ dias), como já acontece com a
 * deflação — por isso Realizado, Comparativo, trilha e Conferência fecham
 * sem mudar de fórmula. A lista `diasMeiaExtra` diz QUAIS dias (o Realizado
 * nasce com eles marcados).
 */
import { MAX_DIAS_DE_TRABALHO, listarDiasDeTrabalho } from "./dias-de-trabalho";

/** Rótulo curto do dia marcado (Escalação, Planejado, Realizado). */
export const MEIA_DIARIA_ROTULO = "1,5 diária (carga/descarga)";

/** Por que o ½ não entra quando o valor da vaga é fechado. */
export const MEIA_DIARIA_SEM_EFEITO_RAZAO = "O valor da vaga é fechado (honorário aprovado ou empreita por empresa) — o ½ não se soma; ajuste à mão se for o caso.";

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" de verdade (rejeita 2026-02-31). */
export function dataIsoValida(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = ISO.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export interface VagaComDiasDeTrabalho {
  workDays?: (string | null | undefined)[] | null;
  scheduleStartDate?: string | null;
  scheduleEndDate?: string | null;
}

/** Dias de trabalho da vaga: os marcados (`workDays`) ou, sem eles, o período início→fim. Ordenados, sem repetição. */
export function diasDeTrabalhoDaVaga(vaga: VagaComDiasDeTrabalho | null | undefined): string[] {
  if (!vaga) return [];
  const marcados = Array.from(new Set(
    (vaga.workDays ?? []).map((d) => (typeof d === "string" ? d.slice(0, 10) : "")).filter(dataIsoValida),
  )).sort();
  if (marcados.length > 0) return marcados;
  return listarDiasDeTrabalho(vaga.scheduleStartDate, vaga.scheduleEndDate);
}

/**
 * Lista limpa dos dias com 1,5: só datas válidas, sem repetição, ordenadas e
 * DENTRO de `diasPermitidos` (os dias de trabalho da vaga, ou os dias ativos
 * no Realizado). Qualquer outra coisa (não-array, lixo) vira lista vazia.
 */
export function normalizarDiasMeiaExtra(dias: unknown, diasPermitidos: readonly string[]): string[] {
  if (!Array.isArray(dias) || diasPermitidos.length === 0) return [];
  const permitidos = new Set(diasPermitidos);
  return Array.from(new Set(
    dias.slice(0, MAX_DIAS_DE_TRABALHO).map((d) => (typeof d === "string" ? d.slice(0, 10) : "")).filter((d) => dataIsoValida(d) && permitidos.has(d)),
  )).sort();
}

export interface MeiaDiariaDoDia {
  dia: string;
  /** Valor do ½ deste dia (0 quando o dia não recebe diária pela regra). */
  valorCents: number;
}

/**
 * O ½ de cada dia marcado no Planejado. `diasComDiaria` são os dias que
 * recebem diária pela regra, em ordem (a posição dá o fator da deflação);
 * `diariaDoDia(posicao)` devolve a diária daquele dia (posição 0 = 1º dia).
 */
export function meiasDiariasDoPlanejado(
  marcados: readonly string[],
  diasComDiaria: readonly string[],
  diariaDoDia: (posicao: number) => number,
): { dias: MeiaDiariaDoDia[]; totalCents: number } {
  const posicao = new Map(diasComDiaria.map((d, i) => [d, i] as const));
  const dias = marcados.map((dia) => {
    const p = posicao.get(dia);
    return { dia, valorCents: p === undefined ? 0 : Math.round(Math.max(0, diariaDoDia(p)) / 2) };
  });
  return { dias, totalCents: dias.reduce((s, d) => s + d.valorCents, 0) };
}

/** Valor do dia com o ½ (Realizado: o DP marca o dia na grade). */
export function comMeiaDiaria(valorDoDiaCents: number): number {
  return Math.round(valorDoDiaCents * 1.5);
}

/** Valor do dia sem o ½ (o DP desmarca). Volta ao valor de antes para qualquer centavo marcado por `comMeiaDiaria`. */
export function semMeiaDiaria(valorDoDiaComMeiaCents: number): number {
  return Math.round(valorDoDiaComMeiaCents / 1.5);
}

/** "12/10" a partir de "2026-10-12". */
function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** "1 dia com 1,5 diária (12/10)" · "2 dias com 1,5 diária (11/10 e 12/10)". Lista vazia → "". */
export function resumoDasMeiasDiarias(dias: readonly string[] | null | undefined): string {
  const lista = Array.from(new Set((dias ?? []).filter(dataIsoValida))).sort();
  if (lista.length === 0) return "";
  const datas = lista.map(ddmm);
  const texto = datas.length === 1 ? datas[0] : `${datas.slice(0, -1).join(", ")} e ${datas[datas.length - 1]}`;
  return `${lista.length} ${lista.length === 1 ? "dia" : "dias"} com 1,5 diária (${texto})`;
}
