/**
 * Ajustes de regra da reunião de 29/10 (deck de Honorários, slide 4). Critério
 * do slide: "regra conservadora — melhor incluir exceções à mão do que remover
 * valores depois".
 *
 *  - Sem logística, não entra janta (`calcAlimentacao`): quem não viaja recebe
 *    só o almoço; a janta entra à mão, ou pelo dia de carregamento.
 *  - Dia de carregamento marcado na vaga: esse dia tem janta (descarregamento
 *    noturno).
 *  - Night que termina no sábado inclui o domingo (`domingoDaNight`).
 *
 * Valem para eventos que TERMINAM a partir de `REGRAS_DE_29_10_DESDE`: evento
 * já acontecido não muda de valor ao reabrir o Realizado ou recalcular.
 */
import { isFuncaoLocal, isPercursoFunction, regraDiariaPorTipo } from "./calculation-rules";

export const REGRAS_DE_29_10_DESDE = "2026-11-04";

/** O evento (pela data de fim) já entra nas regras de 29/10? Sem data: não. */
export function valemRegrasDe2910(fimDoEvento: string | null | undefined): boolean {
  const fim = fimDoEvento ? String(fimDoEvento).slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(fim) && fim >= REGRAS_DE_29_10_DESDE;
}

const EVENTO_NIGHT = /\bnight\b/i;

function diaSeguinte(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * O domingo que a vaga ganha em evento Night, ou null. "Escala termina no
 * sábado e o domingo é lançado à mão" — a prova vira a noite.
 *
 * Só a CASA: em produção (Night Run, 03/11) o domingo lançado à mão foi sempre
 * de colaborador casa, que recebe diária no fim de semana; freela e local que
 * terminam no sábado ficaram sem o domingo — e são a maioria das vagas. Casa
 * na cenotécnica não recebe diária: fica de fora; percurso (pacote) e função
 * local também. O domingo tem de estar dentro do período do evento.
 */
export function domingoDaNight(a: {
  nomeDoEvento: string | null | undefined;
  fimDoEvento: string | null | undefined;
  fimDaEscala: string | null | undefined;
  collaboratorType: string | null | undefined;
  nomeDaFuncao: string | null | undefined;
}): string | null {
  if (!valemRegrasDe2910(a.fimDoEvento) || !EVENTO_NIGHT.test(a.nomeDoEvento ?? "")) return null;
  if (a.collaboratorType !== "casa" || regraDiariaPorTipo(a.collaboratorType, a.nomeDaFuncao) !== "fds") return null;
  if (isPercursoFunction(a.nomeDaFuncao) || isFuncaoLocal(a.nomeDaFuncao)) return null;
  const fim = a.fimDaEscala ? String(a.fimDaEscala).slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fim)) return null;
  const [ano, mes, dia] = fim.split("-").map(Number);
  if (new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() !== 6) return null;
  const domingo = diaSeguinte(fim);
  return domingo <= String(a.fimDoEvento).slice(0, 10) ? domingo : null;
}

/** "Dia de carregamento" na tela. */
export const CARREGAMENTO_ROTULO = "dia de carregamento";

/** "1 dia de carregamento (12/10)" · "2 dias de carregamento (11/10 e 12/10)". Vazio → "". */
export function resumoDosDiasDeCarregamento(dias: readonly string[] | null | undefined): string {
  const lista = Array.from(new Set((dias ?? []).filter(Boolean))).sort();
  if (lista.length === 0) return "";
  const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const nomes = lista.map(ddmm);
  const texto = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return `${lista.length} ${lista.length === 1 ? "dia" : "dias"} de carregamento (${texto})`;
}
