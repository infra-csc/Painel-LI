/**
 * Transporte terrestre da vaga (16/10) — leitura e gravação da tabela
 * `transportes_terrestres`. A regra (o que é válido, o que cobre a vaga) mora
 * em shared/transporte-terrestre.ts; aqui só o banco.
 */
import { and, eq, exists, gte, inArray, sql as drizzleSql } from "drizzle-orm";
import { db } from "./db";
import { events, teamInclusions, transportesTerrestres, type TransporteTerrestre } from "@shared/schema";
import {
  coberturaTerrestre,
  type ItemTerrestre,
  type ModoDeRegistro,
  type PernaDaViagem,
  type ResumoDoGrupo,
  type TrechoTerrestre,
  type VagaDasPernas,
} from "@shared/transporte-terrestre";

/** Registro do banco → o formato da regra (modo/trecho como os tipos fechados). */
export const comoTrecho = (r: TransporteTerrestre): TrechoTerrestre => ({
  trecho: r.trecho as PernaDaViagem,
  modo: r.modo as TrechoTerrestre["modo"],
  empresa: r.empresa ?? null,
  valorCentavos: r.valorCentavos,
});

/** Todos, de um evento, ou só de eventos que terminam a partir de um dia (mesmo recorte de GET /api/tickets). */
export async function listarTerrestres(eventId?: string, opts: { eventoTerminaDesde?: string } = {}): Promise<TransporteTerrestre[]> {
  if (!eventId && !opts.eventoTerminaDesde) return await db.select().from(transportesTerrestres);
  const daVaga = eq(teamInclusions.id, transportesTerrestres.teamInclusionId);
  const doEvento = eventId ? eq(teamInclusions.eventId, eventId) : undefined;
  const sub = opts.eventoTerminaDesde
    ? db.select({ id: teamInclusions.id }).from(teamInclusions)
      .innerJoin(events, eq(events.id, teamInclusions.eventId))
      .where(and(daVaga, doEvento, gte(events.endDate, opts.eventoTerminaDesde)))
    : db.select({ id: teamInclusions.id }).from(teamInclusions).where(and(daVaga, doEvento));
  return await db.select().from(transportesTerrestres).where(exists(sub));
}

/**
 * Cada linha com o resumo do grupo dela (21/10): o total e quantas vagas o
 * dividem HOJE, contando a tabela inteira — o recorte (um evento, os futuros)
 * não pode encolher a van. Grupo que sobrou com uma vaga só não é grupo.
 */
export async function comResumoDosGrupos(linhas: TransporteTerrestre[]): Promise<Array<TransporteTerrestre & ResumoDoGrupo>> {
  const ids = Array.from(new Set(linhas.map((l) => l.grupoId).filter((g): g is string => !!g)));
  const resumo = new Map<string, { total: number; vagas: number }>();
  if (ids.length > 0) {
    const t = transportesTerrestres;
    const agregados = await db.select({
      grupoId: t.grupoId,
      total: drizzleSql<number>`sum(${t.valorCentavos})::int`,
      vagas: drizzleSql<number>`count(distinct ${t.teamInclusionId})::int`,
    }).from(t).where(inArray(t.grupoId, ids)).groupBy(t.grupoId);
    for (const a of agregados) if (a.grupoId) resumo.set(a.grupoId, { total: Number(a.total), vagas: Number(a.vagas) });
  }
  return linhas.map((l) => {
    const g = l.grupoId ? resumo.get(l.grupoId) : undefined;
    return g && g.vagas > 1 ? { ...l, grupoTotalCentavos: g.total, grupoVagas: g.vagas } : { ...l, grupoTotalCentavos: null, grupoVagas: null };
  });
}

export async function terrestresDoGrupo(grupoId: string): Promise<TransporteTerrestre[]> {
  return await db.select().from(transportesTerrestres).where(eq(transportesTerrestres.grupoId, grupoId));
}

/**
 * A van inteira com outro valor/empresa (21/10): as mesmas linhas (mesmas
 * vagas, mesmos trechos), com os valores já repartidos por quem chamou.
 * Devolve antes e depois de cada linha (auditoria).
 */
export async function regravarGrupo(
  grupoId: string,
  partes: ReadonlyArray<{ id: string; valorCentavos: number }>,
  campos: { modo: ModoDeRegistro; empresa: string | null },
  atorId: string,
): Promise<Array<{ anterior: TransporteTerrestre; gravado: TransporteTerrestre }>> {
  return await db.transaction(async (tx) => {
    const antes = new Map((await tx.select().from(transportesTerrestres).where(eq(transportesTerrestres.grupoId, grupoId))).map((r) => [r.id, r]));
    const out: Array<{ anterior: TransporteTerrestre; gravado: TransporteTerrestre }> = [];
    const agora = new Date();
    for (const p of partes) {
      const anterior = antes.get(p.id);
      if (!anterior) continue;
      const [gravado] = await tx.update(transportesTerrestres)
        .set({ modo: campos.modo, empresa: campos.empresa, valorCentavos: p.valorCentavos, updatedAt: agora, updatedBy: atorId })
        .where(eq(transportesTerrestres.id, p.id))
        .returning();
      out.push({ anterior, gravado });
    }
    return out;
  });
}

/** Remove todas as linhas do grupo (desfazer a van inteira). Devolve o que saiu. */
export async function removerGrupo(grupoId: string): Promise<TransporteTerrestre[]> {
  return await db.delete(transportesTerrestres).where(eq(transportesTerrestres.grupoId, grupoId)).returning();
}

export async function terrestresDasVagas(ids: readonly string[]): Promise<TransporteTerrestre[]> {
  if (ids.length === 0) return [];
  return await db.select().from(transportesTerrestres).where(inArray(transportesTerrestres.teamInclusionId, [...ids]));
}

export async function terrestresDaVaga(id: string): Promise<TransporteTerrestre[]> {
  return await db.select().from(transportesTerrestres).where(eq(transportesTerrestres.teamInclusionId, id));
}

/**
 * A mesma pergunta de `terrestreCobreAVaga`, em SQL, para as consultas que
 * contam "sem passagem" direto no banco (alerta de 30 dias, pendentes da
 * busca). A vaga precisa estar com o alias `ti`. Mesma leitura de pernas de
 * shared/transporte-terrestre.ts · pernasDaVaga.
 */
export const SQL_TERRESTRE_COBRE_A_VAGA = drizzleSql`(
  EXISTS (SELECT 1 FROM transportes_terrestres tt WHERE tt.team_inclusion_id = ti.id)
  AND (ti.trechos_sugeridos IS NOT DISTINCT FROM 'so_volta'
       OR EXISTS (SELECT 1 FROM transportes_terrestres tt WHERE tt.team_inclusion_id = ti.id AND tt.trecho = 'ida'))
  AND (ti.trechos_sugeridos IS NOT DISTINCT FROM 'so_ida' OR ti.volta_segue_para_evento_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM transportes_terrestres tt WHERE tt.team_inclusion_id = ti.id AND tt.trecho = 'volta'))
)`;

/** Todas as pernas da vaga são terrestres? (não há passagem a comprar) */
export function terrestreCobreAVaga(vaga: VagaDasPernas, registros: readonly TransporteTerrestre[]): boolean {
  return registros.length > 0 && coberturaTerrestre(vaga, registros.map(comoTrecho)).cobreTudo;
}

/**
 * Grava (insere ou substitui) um trecho por vaga+perna. Devolve o registro
 * gravado e o anterior (auditoria). `grupoId` nulo tira a perna de um grupo
 * em que ela estivesse (editar "só esta vaga").
 */
export async function gravarTrecho(
  item: ItemTerrestre,
  atorId: string,
  grupoId: string | null = null,
): Promise<{ gravado: TransporteTerrestre; anterior: TransporteTerrestre | null }> {
  return await db.transaction(async (tx) => {
    const [anterior] = await tx.select().from(transportesTerrestres)
      .where(and(eq(transportesTerrestres.teamInclusionId, item.teamInclusionId), eq(transportesTerrestres.trecho, item.trecho)));
    const agora = new Date();
    const campos = { modo: item.modo, empresa: item.empresa, valorCentavos: item.valorCentavos, grupoId, updatedAt: agora, updatedBy: atorId };
    const [gravado] = anterior
      ? await tx.update(transportesTerrestres).set(campos).where(eq(transportesTerrestres.id, anterior.id)).returning()
      : await tx.insert(transportesTerrestres).values({ teamInclusionId: item.teamInclusionId, trecho: item.trecho, ...campos, createdBy: atorId }).returning();
    return { gravado, anterior: anterior ?? null };
  });
}

/** Remove os trechos da vaga (uma perna ou as duas). Devolve o que saiu. */
export async function removerTrechos(teamInclusionId: string, pernas: readonly PernaDaViagem[]): Promise<TransporteTerrestre[]> {
  if (pernas.length === 0) return [];
  return await db.delete(transportesTerrestres)
    .where(and(eq(transportesTerrestres.teamInclusionId, teamInclusionId), inArray(transportesTerrestres.trecho, [...pernas])))
    .returning();
}
