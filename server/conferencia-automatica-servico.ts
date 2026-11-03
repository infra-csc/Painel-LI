/**
 * Conferência automática (deck do dono, 29/10; regra em
 * shared/conferencia-automatica.ts): depois do envio ao DP, a prestação sem
 * divergência é aprovada ali mesmo, na MESMA transação do envio. Os dois
 * caminhos do envio passam por aqui: o "Enviar para revisão" do Realizado e o
 * check-out final da presença.
 */
import type { Request } from "express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  budgetActual as budgetActualTable, budgetComparison, budgetPlanned as budgetPlannedTable, events as eventsTable, functions as functionsTable,
  presencaConfirmacoes, presencaOcorrencias, presencas, systemSettings, teamInclusions,
  type BudgetActual, type InsertSystemLog,
} from "@shared/schema";
import { CHAVE_DATA_DE_CORTE, lerDataDeCorte } from "@shared/legado-honorarios";
import { CONFERENCIA_AUTOMATICA, conferirSemDivergencia } from "@shared/conferencia-automatica";
import { inclusaoDaPrestacao } from "@shared/presenca";
import { montarLogDeAuditoria } from "./routes/_compartilhado";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const semNulos = (l: readonly (string | null)[]) => l.filter((v): v is string => !!v);
const diaDe = (d: unknown) => String(d ?? "").slice(0, 10);

/**
 * Aprova, com a marca da conferência automática, as prestações `enviadas` que
 * não têm divergência; devolve as linhas aprovadas. Tudo é lido dentro da
 * transação de quem chama. UPDATE guardado como o da decisão do DP (só o que
 * está em análise): chamar de novo não muda nada. Sem autor (`rh_action_by`
 * nulo): nenhuma pessoa decidiu — quem enviou fica em `updated_by`.
 */
export async function aplicarConferenciaAutomatica(tx: Tx, enviadas: readonly BudgetActual[], actorId: string): Promise<BudgetActual[]> {
  if (enviadas.length === 0) return [];
  const ids = enviadas.map((a) => a.id);
  const idsDoPlanejado = semNulos(enviadas.map((a) => a.plannedId));
  const idsDeEventos = Array.from(new Set(enviadas.map((a) => a.eventId)));
  const colaboradores = semNulos(enviadas.map((a) => a.collaboratorId));

  const idsDeFuncoes = Array.from(new Set(semNulos(enviadas.map((a) => a.functionId))));
  const [funcoes, planejados, eventos, vagas, divisoes, ocorrencias, marcacoes, confirmacoes, corte, comparativos] = await Promise.all([
    idsDeFuncoes.length ? tx.select({ id: functionsTable.id, name: functionsTable.name }).from(functionsTable).where(inArray(functionsTable.id, idsDeFuncoes)) : Promise.resolve([]),
    idsDoPlanejado.length ? tx.select().from(budgetPlannedTable).where(inArray(budgetPlannedTable.id, idsDoPlanejado)) : Promise.resolve([]),
    tx.select().from(eventsTable).where(inArray(eventsTable.id, idsDeEventos)),
    colaboradores.length
      ? tx.select().from(teamInclusions).where(and(inArray(teamInclusions.eventId, idsDeEventos), inArray(teamInclusions.collaboratorId, colaboradores), isNull(teamInclusions.deletedAt)))
      : Promise.resolve([]),
    tx.select({ pai: budgetActualTable.splitParentId }).from(budgetActualTable).where(inArray(budgetActualTable.splitParentId, ids)),
    tx.select().from(presencaOcorrencias).where(inArray(presencaOcorrencias.actualId, ids)),
    tx.select().from(presencas).where(inArray(presencas.actualId, ids)),
    tx.select().from(presencaConfirmacoes).where(inArray(presencaConfirmacoes.actualId, ids)),
    tx.select({ valor: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, CHAVE_DATA_DE_CORTE)),
    tx.select({ eventId: budgetComparison.eventId }).from(budgetComparison).where(and(inArray(budgetComparison.eventId, idsDeEventos), eq(budgetComparison.status, "aprovado"))),
  ]);
  const eventosComComparativo = new Set(comparativos.map((c) => c.eventId));
  const nomeDaFuncao = new Map(funcoes.map((f) => [f.id, f.name]));
  const planejadoPorId = new Map(planejados.map((p) => [p.id, p]));
  const eventoPorId = new Map(eventos.map((e) => [e.id, e]));
  const comDivisoes = new Set(divisoes.map((d) => d.pai));
  const confirmacaoPorPrestacao = new Map(confirmacoes.map((c) => [c.actualId, c]));
  const dataDeCorte = lerDataDeCorte(corte[0]?.valor);

  const semDivergencia = enviadas.filter((a) => conferirSemDivergencia({
    prestacao: a,
    planejado: a.plannedId ? planejadoPorId.get(a.plannedId) : null,
    evento: eventoPorId.get(a.eventId),
    inclusao: inclusaoDaPrestacao(a, vagas) ?? null,
    nomeDaFuncao: a.functionId ? nomeDaFuncao.get(a.functionId) ?? null : null,
    dataDeCorte,
    temDivisoes: comDivisoes.has(a.id),
    ocorrencias: ocorrencias.filter((o) => o.actualId === a.id).map((o) => ({ tipo: o.tipo, dia: o.dia ? diaDe(o.dia) : null, removidoEm: o.removidoEm })),
    presencas: marcacoes.filter((m) => m.actualId === a.id).map((m) => ({ dia: diaDe(m.dia), checkinEm: m.checkinEm, checkoutEm: m.checkoutEm, checkinPor: m.checkinPor, checkoutPor: m.checkoutPor })),
    comparativoAprovado: eventosComComparativo.has(a.eventId),
    confirmacao: confirmacaoPorPrestacao.get(a.id) ?? null,
  }).automatica);
  if (semDivergencia.length === 0) return [];

  const agora = new Date();
  return tx.update(budgetActualTable)
    .set({ rhStatus: "aprovado", rhComment: CONFERENCIA_AUTOMATICA, rhActionBy: null, rhActionAt: agora, updatedAt: agora, updatedBy: actorId })
    .where(and(inArray(budgetActualTable.id, semDivergencia.map((a) => a.id)), eq(budgetActualTable.sentForReview, true), eq(budgetActualTable.rhStatus, "pendente")))
    .returning();
}

/** Auditoria por ITEM, em nome da conferência automática (a mesma ação da aprovação do DP). */
export function logsDaConferenciaAutomatica(aprovadas: readonly BudgetActual[], enviadas: readonly BudgetActual[], req: Request): InsertSystemLog[] {
  const enviadaPorId = new Map(enviadas.map((a) => [a.id, a]));
  return aprovadas.map((a) => montarLogDeAuditoria(
    "approve", "budget_actual", a.id, { ...a, acao: CONFERENCIA_AUTOMATICA },
    undefined, CONFERENCIA_AUTOMATICA, enviadaPorId.get(a.id), req,
  ));
}
