/**
 * Conflito de agenda do colaborador — regra pura, compartilhada (23/09).
 *
 * `tipoDeConflitoDeAgenda` morava em client/src/components/scaling/
 * scaling-utils.ts; o servidor precisava da mesma regra para recusar a
 * confirmação (hoje só a tela bloqueia — quem chama a API direto passa).
 * Movida SEM mudar o comportamento; o cliente re-exporta daqui.
 */
import { ACTIVE_CONFLICT_STATUSES, ehSugestao } from "./vaga-status";

export interface PeriodoDaVaga {
  scheduleStartDate?: string | Date | null;
  scheduleEndDate?: string | Date | null;
}

/**
 * Conflito de agenda entre duas vagas do mesmo colaborador (dono, 18/09: "tem
 * casos com 2 viagens no mesmo dia, horários compatíveis, mas está bloqueando").
 * - "sobreposicao": dividem 2 ou mais dias — a pessoa estaria em dois lugares; bloqueia.
 * - "mesmo_dia": dividem UM dia só (uma termina no dia em que a outra começa, ou as
 *   duas são no mesmo dia) — duas viagens no mesmo dia podem ser compatíveis; vira
 *   aviso para conferir os horários das passagens.
 */
export function tipoDeConflitoDeAgenda(
  a: PeriodoDaVaga,
  b: PeriodoDaVaga,
): "sobreposicao" | "mesmo_dia" | null {
  const dia = (v: string | Date | null | undefined) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
  const [ai, af, bi, bf] = [dia(a.scheduleStartDate), dia(a.scheduleEndDate), dia(b.scheduleStartDate), dia(b.scheduleEndDate)];
  if (!ai || !af || !bi || !bf) return null;
  const inicio = ai > bi ? ai : bi;
  const fim = af < bf ? af : bf;
  if (inicio > fim) return null;
  return inicio === fim ? "mesmo_dia" : "sobreposicao";
}

export interface VagaParaConflito extends PeriodoDaVaga {
  id?: string | null;
  status?: string | null;
  phase?: string | null;
  deletedAt?: Date | string | null;
}

/**
 * A outra vaga ocupa a agenda? Fora: excluída (soft delete), cancelada,
 * sugestão (ainda não é escalação) e qualquer status que não seja de
 * confirmação (ACTIVE_CONFLICT_STATUSES) — vaga só salva não prende ninguém.
 */
export function ocupaAgenda(vaga: VagaParaConflito): boolean {
  if (vaga.deletedAt) return false;
  const status = vaga.status ?? "";
  if (status === "cancelado") return false;
  if (ehSugestao(status) || ehSugestao(vaga.phase)) return false;
  return ACTIVE_CONFLICT_STATUSES.includes(status);
}

export interface ConflitosDoColaborador<V> {
  /** Sobreposição de 2+ dias: a pessoa estaria em dois lugares. */
  bloqueia: V[];
  /** Um dia só em comum: conferir horários das passagens. */
  avisos: V[];
}

/**
 * Conflitos entre `vaga` e as OUTRAS vagas do mesmo colaborador. Ignora a
 * própria vaga (mesmo id) e tudo que não ocupa agenda (ver `ocupaAgenda`).
 * A própria `vaga` NÃO é filtrada por status: normalmente é a que está sendo
 * confirmada (ainda planejado/reaberto). Mesmo evento × evento diferente fica
 * a cargo de quem chama — a regra aqui é só de datas.
 */
export function conflitosDoColaborador<V extends VagaParaConflito>(
  vaga: V,
  outrasVagasDoMesmoColaborador: readonly V[],
): ConflitosDoColaborador<V> {
  const bloqueia: V[] = [];
  const avisos: V[] = [];
  for (const outra of outrasVagasDoMesmoColaborador) {
    if (outra === vaga) continue;
    if (vaga.id && outra.id && outra.id === vaga.id) continue;
    if (!ocupaAgenda(outra)) continue;
    const tipo = tipoDeConflitoDeAgenda(vaga, outra);
    if (tipo === "sobreposicao") bloqueia.push(outra);
    else if (tipo === "mesmo_dia") avisos.push(outra);
  }
  return { bloqueia, avisos };
}
