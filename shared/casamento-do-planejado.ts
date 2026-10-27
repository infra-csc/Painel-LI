/**
 * Casamento vaga ↔ linha do Planejado — 27/10 (Módulo de Honorários, Fase 0).
 *
 * A tela e o servidor cruzavam a vaga com a linha do Planejado pela chave
 * "colaborador|função". Vaga SEM colaborador (empreita por empresa, "a
 * definir") tem colaborador nulo: duas na mesma função casavam com a MESMA
 * linha `null|função` (a tela pegava a primeira; o lote de pré-aprovação, a
 * ordem do banco) — uma pré-aprovava o valor da outra.
 *
 * Regra:
 *  - vaga COM colaborador: continua pela chave colaborador|função (a primeira
 *    linha vence, como sempre);
 *  - vaga SEM colaborador: a linha gravada com a MESMA vaga
 *    (`budget_planned.team_inclusion_id`); sem ela, adota uma linha antiga
 *    `null|função` ainda sem vaga que nenhuma outra vaga da função adotou —
 *    em ordem determinística (linhas por created_at, id; vagas pelo número da
 *    escalação, id). Ao pré-aprovar/enviar, o servidor grava a vaga na linha
 *    adotada e o casamento deixa de depender da ordem.
 *
 * Funções puras — a tela (use-budget-engine) e o servidor (lote de
 * pré-aprovação em server/routes/honorarios-fluxo.ts).
 */

export interface VagaParaCasar {
  id: string;
  collaboratorId: string | null;
  functionId: string | null;
  /** Número da escalação (sequência do banco): a ordem estável das vagas. */
  inclusionNumber?: number | null;
}

export interface LinhaParaCasar {
  id: string;
  collaboratorId: string | null;
  functionId: string | null;
  teamInclusionId?: string | null;
  createdAt?: Date | string | null;
}

const chaveColabFuncao = (r: { collaboratorId: string | null; functionId: string | null }) => `${r.collaboratorId}|${r.functionId}`;

function instante(d: Date | string | null | undefined): number {
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

const porId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Ordem das linhas antigas a adotar: created_at, depois id (o mesmo na tela e no servidor). */
export function ordemDeCriacao(a: LinhaParaCasar, b: LinhaParaCasar): number {
  return instante(a.createdAt) - instante(b.createdAt) || porId(a, b);
}

/** Linha antiga de vaga sem colaborador, ainda sem a vaga gravada — pode ser adotada. */
export function linhaAdotavel(p: LinhaParaCasar, functionId: string | null): boolean {
  return !p.collaboratorId && !p.teamInclusionId && p.functionId === functionId;
}

/**
 * A tela: a linha do Planejado de cada vaga (id da vaga → linha). Vaga sem
 * linha não entra no mapa.
 */
export function casarVagasComPlanejado<P extends LinhaParaCasar>(vagas: readonly VagaParaCasar[], linhas: readonly P[]): Map<string, P> {
  const resultado = new Map<string, P>();

  // Com colaborador: chave colaborador|função, a primeira linha vence (sem mudança).
  const porChave = new Map<string, P>();
  for (const p of linhas) {
    if (!p.collaboratorId) continue;
    const k = chaveColabFuncao(p);
    if (!porChave.has(k)) porChave.set(k, p);
  }
  const semColaborador: VagaParaCasar[] = [];
  for (const v of vagas) {
    if (v.collaboratorId) {
      const p = porChave.get(chaveColabFuncao(v));
      if (p) resultado.set(v.id, p);
    } else {
      semColaborador.push(v);
    }
  }
  if (semColaborador.length === 0) return resultado;

  // Sem colaborador: 1º a linha gravada com a vaga…
  const porVaga = new Map<string, P>();
  for (const p of linhas) {
    if (!p.collaboratorId && p.teamInclusionId && !porVaga.has(p.teamInclusionId)) porVaga.set(p.teamInclusionId, p);
  }
  semColaborador.sort((a, b) => (a.inclusionNumber ?? Number.MAX_SAFE_INTEGER) - (b.inclusionNumber ?? Number.MAX_SAFE_INTEGER) || porId(a, b));
  const faltam: VagaParaCasar[] = [];
  for (const v of semColaborador) {
    const p = porVaga.get(v.id);
    if (p && p.functionId === v.functionId) resultado.set(v.id, p);
    else faltam.push(v);
  }

  // …2º adota uma linha antiga da função, na ordem (uma linha por vaga).
  const adotaveis = new Map<string, P[]>();
  for (const p of linhas) {
    if (p.collaboratorId || p.teamInclusionId || !p.functionId) continue;
    const lista = adotaveis.get(p.functionId) ?? [];
    lista.push(p);
    adotaveis.set(p.functionId, lista);
  }
  adotaveis.forEach((lista) => lista.sort(ordemDeCriacao));
  for (const v of faltam) {
    const p = v.functionId ? adotaveis.get(v.functionId)?.shift() : undefined;
    if (p) resultado.set(v.id, p);
  }
  return resultado;
}

/**
 * O servidor (lote de pré-aprovação): a linha de UMA vaga sem colaborador.
 *  1. a linha gravada com a vaga (`teamInclusionId`);
 *  2. a que a tela mostra para a vaga (`sugestaoId`), se ainda for adotável;
 *  3. a primeira linha antiga adotável da função (created_at, id).
 * `usadas`: linhas já tomadas neste pedido (duas vagas nunca levam a mesma).
 */
export function linhaDaVagaSemColaborador<P extends LinhaParaCasar>(
  vaga: { teamInclusionId?: string | null; functionId: string; sugestaoId?: string | null },
  linhas: readonly P[],
  usadas: ReadonlySet<string>,
): P | null {
  const livre = (p: P) => !usadas.has(p.id);
  if (vaga.teamInclusionId) {
    const daVaga = linhas.find((p) => livre(p) && !p.collaboratorId && p.teamInclusionId === vaga.teamInclusionId && p.functionId === vaga.functionId);
    if (daVaga) return daVaga;
  }
  if (vaga.sugestaoId) {
    const sugerida = linhas.find((p) => p.id === vaga.sugestaoId && livre(p) && linhaAdotavel(p, vaga.functionId));
    if (sugerida) return sugerida;
  }
  return linhas.filter((p) => livre(p) && linhaAdotavel(p, vaga.functionId)).sort(ordemDeCriacao)[0] ?? null;
}
