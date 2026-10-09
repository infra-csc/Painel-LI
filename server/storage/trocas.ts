/**
 * Trocas (swap_requests). As consultas ficam em SQL cru dentro de
 * routes/trocas.ts (SELECT sr.* + joins); o storage só expõe o tipo da linha
 * bruta, o mapeador e o cancelamento automático de pedido órfão (09/10).
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../db";
import { swapRequests, teamInclusions, teamInclusionLogs, systemLogs, USUARIO_SISTEMA } from "@shared/schema";
import { motivoTrocaDesatualizada } from "@shared/troca-desatualizada";
import { idsUnicos } from "./_comum";

/**
 * Linha bruta de swap_requests (SELECT sr.* + joins), como o SQL devolve —
 * snake_case. Até 23/09 cada chave saía DUPLICADA (snake + camel), dobrando o
 * payload da lista de trocas; o client unificou a leitura em
 * client/src/lib/swap-types.ts (`normalizeSwap`), que lê snake_case primeiro.
 * Só as chaves snake ficam; nenhum consumidor lia as camel.
 *
 * As colunas espelham `swapRequests` (shared/schema.ts). `new_collaborator_id`
 * é obrigatório no POST e nunca fica nulo na prática; a coluna é nula só por
 * legado do schema.
 */
export interface SwapRequestRow {
  id: string;
  team_inclusion_id: string;
  requested_by: string;
  requested_by_name: string;
  current_collaborator_id: string | null;
  new_collaborator_id: string;
  reason: string;
  new_city: string | null;
  swap_kind: string;
  paired_inclusion_id: string | null;
  paired_new_city: string | null;
  status: string;
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string | null;
  // Joins de SQL_TROCAS_COM_JOINS (routes/trocas.ts) e do histórico da vaga.
  current_collaborator_name?: string | null;
  new_collaborator_name?: string | null;
  inclusion_status?: string | null;
  inclusion_deleted_at?: Date | string | null;
  inclusion_number?: number | null;
  inclusion_event_id?: string | null;
  event_name?: string | null;
  paired_inclusion_number?: number | null;
  paired_event_name?: string | null;
  paired_function_name?: string | null;
  /** Quem está HOJE em cada vaga (09/10) — ver shared/troca-desatualizada.ts. */
  inclusion_collaborator_id?: string | null;
  inclusion_collaborator_name?: string | null;
  paired_collaborator_id?: string | null;
  paired_collaborator_name?: string | null;
}

export function mapSwapRequestRow(row: SwapRequestRow): SwapRequestRow {
  return { ...row };
}

// ── Pedido de troca órfão (dono, 09/10) ──────────────────────────────────────
// Caso real (07/10): transferência pendente (#4287 ← Matheus da #4290); o
// gestor reprovou as duas vagas e a vaga foi re-escalada direto. O pedido
// ficou pendente apontando para um estado que não existe mais — a aprovação
// só podia dar 409. Agora, TODO caminho que muda a vaga chama
// `cancelarTrocasOrfas` na MESMA transação.

/** Transação do drizzle (ou o próprio `db`, que tem a mesma API de consulta). */
type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export interface AtorDoCancelamento {
  id?: string | null;
  name?: string | null;
}

export interface TrocaCanceladaAutomaticamente {
  id: string;
  requestedBy: string;
  requestedByName: string;
  vagaQueMudou: number | null;
  comentario: string;
}

/**
 * Cancela os pedidos de troca PENDENTES das vagas `vagaIds` (a vaga do pedido
 * ou a outra vaga da permuta/transferência) que deixaram de valer: vaga
 * excluída/cancelada ou ocupante diferente do pedido — a MESMA conferência da
 * aprovação (shared/troca-desatualizada.ts). Pedido que ainda vale não é
 * tocado; pedido já decidido também não (só `status = 'pendente'`). A própria
 * aprovação de uma troca nunca se autocancela: ela marca o pedido como
 * 'aprovado' ANTES de mexer nas vagas.
 *
 * `motivo` é curto ("gestor reprovou", "vaga excluída"…) e entra em
 * "Cancelado automaticamente: a vaga #N mudou (<motivo>) depois do pedido.".
 * Grava log `swap_cancelled` nas duas vagas e a auditoria, tudo em `tx`.
 */
export async function cancelarTrocasOrfas(
  tx: Executor,
  vagaIds: readonly (string | null | undefined)[],
  motivo: string,
  ator?: AtorDoCancelamento | null,
): Promise<TrocaCanceladaAutomaticamente[]> {
  const ids = idsUnicos(vagaIds.filter((v): v is string => !!v));
  if (ids.length === 0) return [];
  const pendentes = await tx.select().from(swapRequests).where(and(
    eq(swapRequests.status, "pendente"),
    or(inArray(swapRequests.teamInclusionId, ids), inArray(swapRequests.pairedInclusionId, ids)),
  ));
  if (pendentes.length === 0) return [];

  const envolvidas = idsUnicos(pendentes.flatMap((p) => [p.teamInclusionId, p.pairedInclusionId].filter((v): v is string => !!v)));
  const vagas = await tx.select({
    id: teamInclusions.id, inclusionNumber: teamInclusions.inclusionNumber, collaboratorId: teamInclusions.collaboratorId,
    status: teamInclusions.status, deletedAt: teamInclusions.deletedAt,
  }).from(teamInclusions).where(inArray(teamInclusions.id, envolvidas));
  const porId = new Map(vagas.map((v) => [v.id, v]));
  const morta = (v: (typeof vagas)[number] | undefined) => !v || !!v.deletedAt || v.status === "cancelado";

  const atorId = ator?.id || USUARIO_SISTEMA.id;
  const atorNome = ator?.name?.trim() || USUARIO_SISTEMA.name;
  const canceladas: TrocaCanceladaAutomaticamente[] = [];
  for (const p of pendentes) {
    const vaga = porId.get(p.teamInclusionId);
    const comOutra = p.swapKind === "permuta" || p.swapKind === "transferencia";
    const outra = p.pairedInclusionId ? porId.get(p.pairedInclusionId) : undefined;
    const quebrou = morta(vaga) || (comOutra && morta(outra)) || !!motivoTrocaDesatualizada({
      swapKind: p.swapKind,
      currentCollaboratorId: p.currentCollaboratorId ?? null,
      newCollaboratorId: p.newCollaboratorId ?? null,
      inclusionCollaboratorId: vaga?.collaboratorId ?? null,
      ...(comOutra ? { pairedCollaboratorId: outra?.collaboratorId ?? null } : {}),
    });
    if (!quebrou) continue;

    // A vaga que o chamador mudou (a do pedido tem prioridade).
    const mudou = ids.includes(p.teamInclusionId) ? vaga : outra;
    const numero = mudou?.inclusionNumber ?? vaga?.inclusionNumber ?? null;
    const comentario = `Cancelado automaticamente: a vaga #${numero ?? "?"} mudou (${motivo}) depois do pedido.`;
    const [cancelado] = await tx.update(swapRequests)
      .set({ status: "cancelado", reviewedBy: USUARIO_SISTEMA.id, reviewedByName: USUARIO_SISTEMA.name, reviewComment: comentario, reviewedAt: new Date() })
      .where(and(eq(swapRequests.id, p.id), eq(swapRequests.status, "pendente")))
      .returning();
    if (!cancelado) continue;
    const vagasDoPedido = [p.teamInclusionId, p.pairedInclusionId].filter((v): v is string => !!v);
    await tx.insert(teamInclusionLogs).values(vagasDoPedido.map((teamInclusionId) => ({
      teamInclusionId, action: "swap_cancelled", details: `Solicitação de troca de ${p.requestedByName} — ${comentario}`,
      previousValue: null, newValue: null, userId: atorId, userName: atorNome,
    })));
    await tx.insert(systemLogs).values({
      action: "cancel", entityType: "swap_request", entityId: p.id, entityName: "troca de colaborador",
      details: comentario, previousData: { status: "pendente" }, newData: { status: "cancelado", reviewComment: comentario },
      userId: atorId, userName: atorNome,
    });
    canceladas.push({ id: p.id, requestedBy: p.requestedBy, requestedByName: p.requestedByName, vagaQueMudou: numero, comentario });
  }
  return canceladas;
}
