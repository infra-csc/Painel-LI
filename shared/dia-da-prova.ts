/**
 * O dia da PROVA dentro do período do evento (dono, 22/09: "o evento sempre
 * ocorre sábado ou domingo — geralmente domingo, um ou outro é sábado").
 *
 * O cadastro guarda uma JANELA ("22/09 a 28/09"), que é montagem + prova +
 * desmontagem: a data de início é quase sempre terça ou quarta. Quem fala "o
 * evento é dia 27" fala do dia da prova.
 *
 * **Dias informados (30/10).** O cadastro passou a ter "Dia(s) do evento"
 * (`events.dia_evento_inicio`/`dia_evento_fim`): os dias reais, dentro do
 * período. O circuito Viva Esporte acontece quinta e sexta (Serra: período
 * 01/11 dom → 08/11 dom, evento 05 e 06/11) e nenhuma dedução por fim de
 * semana acerta isso. Com os dias informados:
 *  - a JANELA da prova é de..até;
 *  - o DIA da prova é o ÚLTIMO dia informado. É o mesmo critério da dedução
 *    (sábado + domingo → o domingo) e é dele que os prazos D-N do Quadro
 *    contam: `prazoDaEtapa` (shared/prazos-da-escala.ts) subtrai N dias da
 *    `dataEvento` das Análises, que é este dia. Serra: D-37 = 06/11 − 37 = 30/09.
 *
 * **Sem dias informados, a dedução** (conferida nos 232 eventos da base em
 * 22/09; corrigida em 30/10): o fim de semana MAIS PERTO DO FIM do período —
 * o último sábado ou domingo, varrendo do fim para o começo. O domingo só
 * ganha do sábado quando é o dia seguinte a ele dentro do período (sábado +
 * domingo → domingo). Sem fim de semana nenhum, a data de fim.
 * Até 30/10 a regra era "o último DOMINGO, senão o último sábado": no
 * Viva Esporte - Cariacica (06/12 dom → 12/12 sáb) ela pegava o domingo do
 * INÍCIO, 4 dias antes do evento real, e o evento caía na mesma data do Fundão.
 *
 * Quando o sábado anterior também está no período, a janela deduzida vai de
 * sábado a domingo — há evento que acontece nos dois dias.
 */

const MS_DIA = 86_400_000;

type DataSolta = string | Date | null | undefined;

/** Os dias reais do evento, como vêm do cadastro (`Event`). */
export interface DiasDoEvento {
  diaEventoInicio?: DataSolta;
  diaEventoFim?: DataSolta;
}

/** "2026-09-27" ou "2026-09-27T00:00:00.000Z" → Date de meia-noite LOCAL. */
function dia(valor: DataSolta): Date | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  const m = String(valor ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // 2026-02-30 viraria 02/03 no Date: data que não existe não é data.
  if (Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Os dias informados, normalizados: só um dos dois preenchido = um dia só;
 * invertidos, na ordem. null quando nenhum foi informado.
 */
export function diasInformados(dias: DiasDoEvento | null | undefined): { de: Date; ate: Date } | null {
  const a = dia(dias?.diaEventoInicio);
  const b = dia(dias?.diaEventoFim);
  const de = a ?? b;
  const ate = b ?? a;
  if (!de || !ate) return null;
  return de <= ate ? { de, ate } : { de: ate, ate: de };
}

/** A dedução pelo período (sem dias informados) — ver o cabeçalho. */
function deduzir(inicio: DataSolta, fim: DataSolta): Date | null {
  const de = dia(inicio);
  const ate = dia(fim) ?? de;
  if (!de || !ate) return de ?? ate ?? null;
  const [primeiro, ultimo] = de <= ate ? [de, ate] : [ate, de];
  // Do fim para o começo, o primeiro dia de fim de semana. Se for domingo, o
  // sábado (se houver) é o dia ANTERIOR — o domingo é a prova. Se for sábado,
  // o domingo seguinte já está fora do período: vale o sábado. Um domingo do
  // começo do período nunca passa na frente de um sábado do fim.
  for (let t = ultimo.getTime(); t >= primeiro.getTime(); t -= MS_DIA) {
    const d = new Date(t);
    if (d.getDay() === 0 || d.getDay() === 6) return d;
  }
  return ultimo;
}

/** O dia da prova (Date local) ou null quando o evento não tem datas. */
export function diaDaProva(inicio: DataSolta, fim: DataSolta, dias?: DiasDoEvento | null): Date | null {
  const informados = diasInformados(dias);
  if (informados) return informados.ate;
  return deduzir(inicio, fim);
}

/** O mesmo, em "AAAA-MM-DD". */
export function diaDaProvaISO(inicio: DataSolta, fim: DataSolta, dias?: DiasDoEvento | null): string | null {
  const d = diaDaProva(inicio, fim, dias);
  return d ? iso(d) : null;
}

/**
 * A janela da prova: os dias informados (de..até); sem eles, normalmente um
 * dia só — sábado + domingo quando o sábado anterior também está dentro do
 * período do evento.
 */
export function janelaDaProva(inicio: DataSolta, fim: DataSolta, dias?: DiasDoEvento | null): { de: Date; ate: Date } | null {
  const informados = diasInformados(dias);
  if (informados) return informados;
  const prova = deduzir(inicio, fim);
  if (!prova) return null;
  const a = dia(inicio);
  const b = dia(fim);
  const comeco = a && b && b < a ? b : a;
  if (prova.getDay() === 0 && comeco) {
    const sabado = new Date(prova.getTime() - MS_DIA);
    if (sabado >= comeco) return { de: sabado, ate: prova };
  }
  return { de: prova, ate: prova };
}

// ── Cadastro: normalizar e validar (servidor e formulário usam o mesmo) ─────

const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "" / null / undefined → null; o resto aparado (a validação diz se presta). */
const limpo = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * O que se grava: só "de" (ou só "até") = um dia só, os dois iguais; nada =
 * os dois nulos. Não valida — ver `erroDosDiasDoEvento`.
 */
export function normalizarDiasDoEvento(
  diaEventoInicio: string | null | undefined,
  diaEventoFim: string | null | undefined,
): { diaEventoInicio: string | null; diaEventoFim: string | null } {
  const de = limpo(diaEventoInicio);
  const ate = limpo(diaEventoFim);
  return { diaEventoInicio: de ?? ate, diaEventoFim: ate ?? de };
}

export type CampoDosDias = "diaEventoInicio" | "diaEventoFim";

export const MENSAGEM_FORA_DO_PERIODO = "O dia do evento precisa estar dentro do período (início a fim).";

/**
 * Regras do cadastro (30/10): opcionais; datas válidas; "até" ≥ "de"; os
 * dois dentro do período do evento (podem coincidir com o início e o fim).
 * Só "de" preenchido vale como um dia.
 */
export function erroDosDiasDoEvento(dados: {
  startDate?: string | null;
  endDate?: string | null;
  diaEventoInicio?: string | null;
  diaEventoFim?: string | null;
}): { campo: CampoDosDias; mensagem: string } | null {
  const de = limpo(dados.diaEventoInicio);
  const ate = limpo(dados.diaEventoFim);
  if (!de && !ate) return null;
  if (de && (!RE_ISO.test(de) || !dia(de))) return { campo: "diaEventoInicio", mensagem: "Data inválida." };
  if (ate && (!RE_ISO.test(ate) || !dia(ate))) return { campo: "diaEventoFim", mensagem: "Data inválida." };
  if (de && ate && ate < de) return { campo: "diaEventoFim", mensagem: "O último dia não pode ser antes do primeiro." };
  const ini = limpo(dados.startDate);
  const fim = limpo(dados.endDate) ?? ini;
  // Datas "AAAA-MM-DD": a comparação de texto já é cronológica.
  const fora = (d: string) => (!!ini && d < ini) || (!!fim && d > fim);
  if (de && fora(de)) return { campo: "diaEventoInicio", mensagem: MENSAGEM_FORA_DO_PERIODO };
  if (ate && fora(ate)) return { campo: "diaEventoFim", mensagem: MENSAGEM_FORA_DO_PERIODO };
  return null;
}
