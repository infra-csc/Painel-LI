/**
 * Pedido de troca órfão (dono, 09/10): "temos que ter tratamento para isso não
 * acontecer".
 *
 * Caso real (produção, 07/10): transferência pendente (#4287 ← Matheus da
 * #4290); o gestor reprovou as duas vagas e a vaga foi re-escalada direto. O
 * pedido ficou pendente apontando para um estado que não existia mais. Agora
 * todo caminho que muda o colaborador da vaga (ou a exclui/cancela) cancela o
 * pedido pendente na mesma transação (storage/trocas.ts cancelarTrocasOrfas).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, criarVaga, mutacao, unico,
  type Contexto, type TestAgent,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

interface LinhaDaTroca { id: string; status: string; review_comment: string | null; reviewed_by_name: string | null }

async function trocaPorId(agent: TestAgent, vagaId: string, trocaId: string): Promise<LinhaDaTroca | undefined> {
  const r = await agent.get(`/api/swap-requests/inclusion/${vagaId}`);
  expect(r.status).toBe(200);
  return (r.body as LinhaDaTroca[]).find((t) => t.id === trocaId);
}

async function logsDeTroca(vagaId: string) {
  return (await ctx.storage.getTeamInclusionLogs(vagaId)).filter((l) => l.action === "swap_cancelled");
}

async function pedirTroca(agent: TestAgent, corpo: Record<string, unknown>) {
  const r = await mutacao(agent.post("/api/swap-requests")).send({ reason: "Teste", newCity: "São Paulo - SP", ...corpo });
  expect(r.status).toBe(201);
  return r.body as { id: string };
}

describe("Troca pendente é cancelada quando a vaga muda por fora (09/10)", () => {
  it("reprovação do gestor cancela a transferência pendente (caso real 07/10) — nas duas vagas", async () => {
    const { agent, user } = await agenteLogado("admin");
    const ceno = await criarFuncao({ name: `Cenotécnica ${unico()}` });
    const roberto = await criarColaborador({ fullName: "Roberto Carlos de Souza" });
    const matheus = await criarColaborador({ fullName: "Matheus Pereira Silva" });
    const destino = await criarVaga({ userId: user.id, eventId: (await criarEvento()).id, functionId: ceno.id, collaboratorId: roberto.id, status: "aguardando_producao", phase: "escalacao" });
    const origem = await criarVaga({ userId: user.id, eventId: (await criarEvento()).id, collaboratorId: matheus.id, status: "escalado", phase: "escalacao" });
    const pedido = await pedirTroca(agent, { teamInclusionId: destino.id, newCollaboratorId: matheus.id, kind: "transferencia", pairedInclusionId: origem.id });

    const reprova = await mutacao(agent.patch(`/api/team-inclusions/${destino.id}/reject-production`)).send({});
    expect(reprova.status).toBe(200);

    const troca = await trocaPorId(agent, destino.id, pedido.id);
    expect(troca?.status).toBe("cancelado");
    expect(troca?.reviewed_by_name).toBe("Sistema");
    expect(troca?.review_comment).toBe(`Cancelado automaticamente: a vaga #${destino.inclusionNumber} mudou (gestor reprovou — ${user.name}) depois do pedido.`);
    // Histórico nas DUAS vagas.
    expect(await logsDeTroca(destino.id)).toHaveLength(1);
    expect(await logsDeTroca(origem.id)).toHaveLength(1);
    // Auditoria.
    const { systemLogs } = ctx.schema;
    const auditoria = await ctx.db.select().from(systemLogs).where(and(eq(systemLogs.entityId, pedido.id), eq(systemLogs.action, "cancel")));
    expect(auditoria).toHaveLength(1);
    // Não dá mais para aprovar: já decidido.
    const aprova = await mutacao(agent.patch(`/api/swap-requests/${pedido.id}/approve`)).send({});
    expect(aprova.status).toBe(409);
    expect(aprova.body.message).toBe("Este pedido já foi decidido");
  });

  it("editar o colaborador da vaga (PATCH) cancela a troca pendente", async () => {
    const { agent, user } = await agenteLogado("admin");
    const ana = await criarColaborador({ fullName: "Ana Edição" });
    const bia = await criarColaborador({ fullName: "Bia Edição" });
    const caio = await criarColaborador({ fullName: "Caio Edição" });
    const vaga = await criarVaga({ userId: user.id, collaboratorId: ana.id });
    const pedido = await pedirTroca(agent, { teamInclusionId: vaga.id, newCollaboratorId: bia.id });

    const edita = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}`)).send({ collaboratorId: caio.id });
    expect(edita.status).toBe(200);

    const troca = await trocaPorId(agent, vaga.id, pedido.id);
    expect(troca?.status).toBe("cancelado");
    expect(troca?.review_comment).toContain(`a vaga #${vaga.inclusionNumber} mudou (colaborador alterado por ${user.name})`);
    expect(await logsDeTroca(vaga.id)).toHaveLength(1);
  });

  it("editar outro campo da vaga NÃO cancela a troca pendente", async () => {
    const { agent, user } = await agenteLogado("admin");
    const ana = await criarColaborador();
    const bia = await criarColaborador();
    const vaga = await criarVaga({ userId: user.id, collaboratorId: ana.id });
    const pedido = await pedirTroca(agent, { teamInclusionId: vaga.id, newCollaboratorId: bia.id });
    const edita = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}`)).send({ observations: "só uma observação" });
    expect(edita.status).toBe(200);
    expect((await trocaPorId(agent, vaga.id, pedido.id))?.status).toBe("pendente");
  });

  it("excluir a vaga cancela a troca pendente", async () => {
    const { agent, user } = await agenteLogado("admin");
    const ana = await criarColaborador();
    const bia = await criarColaborador();
    const vaga = await criarVaga({ userId: user.id, collaboratorId: ana.id });
    const pedido = await pedirTroca(agent, { teamInclusionId: vaga.id, newCollaboratorId: bia.id });
    const exclui = await mutacao(agent.delete(`/api/team-inclusions/${vaga.id}`)).send();
    expect(exclui.status).toBe(200);
    const troca = await trocaPorId(agent, vaga.id, pedido.id);
    expect(troca?.status).toBe("cancelado");
    expect(troca?.review_comment).toContain(`(vaga excluída por ${user.name})`);
  });

  it("aprovar OUTRA troca cancela a pendente que dependia da mesma vaga; a aprovada não se autocancela", async () => {
    const { agent, user } = await agenteLogado("admin");
    const ana = await criarColaborador({ fullName: "Ana Outra" });
    const bia = await criarColaborador({ fullName: "Bia Outra" });
    const caio = await criarColaborador({ fullName: "Caio Outra" });
    const vagaA = await criarVaga({ userId: user.id, eventId: (await criarEvento()).id, collaboratorId: ana.id, status: "escalado", phase: "escalacao" });
    const vagaB = await criarVaga({ userId: user.id, eventId: (await criarEvento()).id, collaboratorId: bia.id, status: "escalado", phase: "escalacao" });
    const pedido1 = await pedirTroca(agent, { teamInclusionId: vagaA.id, newCollaboratorId: caio.id });
    // Pedido legado (de antes da trava de "um pedido por vaga"): permuta B ↔ A,
    // pendente ao mesmo tempo — direto no banco, como existia em produção.
    const [legado] = await ctx.db.insert(ctx.schema.swapRequests).values({
      teamInclusionId: vagaB.id, requestedBy: user.id, requestedByName: user.name, currentCollaboratorId: bia.id,
      newCollaboratorId: ana.id, reason: "legado", status: "pendente", newCity: "Campinas - SP", swapKind: "permuta",
      pairedInclusionId: vagaA.id, pairedNewCity: "Campinas - SP",
    }).returning();

    const aprova = await mutacao(agent.patch(`/api/swap-requests/${pedido1.id}/approve`)).send({});
    expect(aprova.status).toBe(200);

    expect((await trocaPorId(agent, vagaA.id, pedido1.id))?.status).toBe("aprovado");
    const orfa = await trocaPorId(agent, vagaB.id, legado.id);
    expect(orfa?.status).toBe("cancelado");
    expect(orfa?.review_comment).toContain(`a vaga #${vagaA.inclusionNumber} mudou (outra troca aprovada por ${user.name})`);
  });

  it("a própria aprovação da transferência não se autocancela", async () => {
    const { agent, user } = await agenteLogado("admin");
    const ana = await criarColaborador();
    const bia = await criarColaborador();
    const destino = await criarVaga({ userId: user.id, eventId: (await criarEvento()).id, collaboratorId: ana.id, status: "escalado", phase: "escalacao" });
    const origem = await criarVaga({ userId: user.id, eventId: (await criarEvento()).id, collaboratorId: bia.id, status: "escalado", phase: "escalacao" });
    const pedido = await pedirTroca(agent, { teamInclusionId: destino.id, newCollaboratorId: bia.id, kind: "transferencia", pairedInclusionId: origem.id });
    const aprova = await mutacao(agent.patch(`/api/swap-requests/${pedido.id}/approve`)).send({});
    expect(aprova.status).toBe(200);
    expect((await trocaPorId(agent, destino.id, pedido.id))?.status).toBe("aprovado");
    expect(await logsDeTroca(destino.id)).toHaveLength(0);
    expect(await logsDeTroca(origem.id)).toHaveLength(0);
  });

  it("troca já recusada não é tocada quando a vaga muda depois", async () => {
    const { agent, user } = await agenteLogado("admin");
    const ana = await criarColaborador();
    const bia = await criarColaborador();
    const caio = await criarColaborador();
    const vaga = await criarVaga({ userId: user.id, collaboratorId: ana.id });
    const pedido = await pedirTroca(agent, { teamInclusionId: vaga.id, newCollaboratorId: bia.id });
    const recusa = await mutacao(agent.patch(`/api/swap-requests/${pedido.id}/reject`)).send({ reviewComment: "Não precisa" });
    expect(recusa.status).toBe(200);

    const edita = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}`)).send({ collaboratorId: caio.id });
    expect(edita.status).toBe(200);
    const troca = await trocaPorId(agent, vaga.id, pedido.id);
    expect(troca?.status).toBe("rejeitado");
    expect(troca?.review_comment).toBe("Não precisa");
    expect(await logsDeTroca(vaga.id)).toHaveLength(0);
  });
});
