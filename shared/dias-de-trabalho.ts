/**
 * Dias de trabalho de uma vaga a partir do período da escala (23/09).
 *
 * A regra vivia só no PATCH /api/team-inclusions/:id (routes.ts): ao mudar
 * scheduleStartDate/scheduleEndDate sem mandar workDays, a lista era refeita
 * dia a dia, do início ao fim (inclusive nas duas pontas), e dailyRates virava
 * o tamanho dela. O Espelho Operacional também edita essas datas — e não
 * recalculava nada, deixando diárias e dias de trabalho desalinhados da escala.
 *
 * Extraída para cá para os dois caminhos usarem a MESMA regra. Regra pura, em
 * UTC: "2026-09-01" é uma data sem hora, e contar em fuso local faria o dia
 * pular ou repetir na virada do horário de verão.
 */

const ISO_DATA = /^(\d{4})-(\d{2})-(\d{2})/;

/** Converte "YYYY-MM-DD" (ou ISO com hora) em dias desde a época, em UTC. */
function diaUTC(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const m = ISO_DATA.exec(String(valor).trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(ms)) return null;
  // Rejeita "2026-02-31" e afins: Date.UTC normaliza em silêncio.
  const d = new Date(ms);
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return Math.floor(ms / 86_400_000);
}

function isoDoDia(dia: number): string {
  return new Date(dia * 86_400_000).toISOString().slice(0, 10);
}

/** Tamanho máximo da lista: uma escala não dura anos; acima disso é dado errado. */
export const MAX_DIAS_DE_TRABALHO = 400;

/**
 * Lista "YYYY-MM-DD" de cada dia entre início e fim, inclusive.
 * Sem uma das datas, data inválida ou fim antes do início → lista vazia.
 */
export function listarDiasDeTrabalho(inicio: string | null | undefined, fim: string | null | undefined): string[] {
  const a = diaUTC(inicio);
  const b = diaUTC(fim);
  if (a === null || b === null || b < a) return [];
  if (b - a + 1 > MAX_DIAS_DE_TRABALHO) return [];
  const dias: string[] = [];
  for (let d = a; d <= b; d += 1) dias.push(isoDoDia(d));
  return dias;
}

export interface DiasDaVaga {
  workDays: string[];
  dailyRates: number;
}

/**
 * O par que a vaga grava quando as datas da escala mudam: a lista de dias e a
 * quantidade de diárias (sempre o tamanho da lista — é o que o PATCH faz).
 * Devolve null quando não há como calcular (falta data), para quem chama
 * NÃO sobrescrever o que já está gravado.
 */
export function recalcularDiasDaVaga(
  scheduleStartDate: string | null | undefined,
  scheduleEndDate: string | null | undefined,
): DiasDaVaga | null {
  if (!scheduleStartDate || !scheduleEndDate) return null;
  const workDays = listarDiasDeTrabalho(scheduleStartDate, scheduleEndDate);
  if (workDays.length === 0) return null;
  return { workDays, dailyRates: workDays.length };
}
