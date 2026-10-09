/**
 * Pedido de troca com as vagas mudadas depois dele (dono, 09/10).
 *
 * Caso real: transferência pedida na vaga #4287 (Roberto) para trazer o
 * Matheus da vaga #4290; depois do pedido a #4290 passou a ter o Roberto. A
 * aprovação continua recusando (409, mesma mensagem) e o GET passa a trazer
 * quem está HOJE em cada vaga — as telas conferem com
 * shared/troca-desatualizada.ts e desabilitam o "Aprovar troca".
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarVaga, mutacao, type Contexto } from "./harness";
import { motivoTrocaDesatualizada } from "@shared/troca-desatualizada";

let ctx: Contexto;

/** Muda o ocupante SEM passar pelo app (simula o pedido órfão de antes de 09/10). */
async function mudarOcupante(vagaId: string, collaboratorId: string) {
  const { teamInclusions } = ctx.schema;
  await ctx.db.update(teamInclusions).set({ collaboratorId }).where(eq(teamInclusions.id, vagaId));
}

beforeAll(async () => {
  ctx = await criarApp();
});

describe("Troca com vagas mudadas desde o pedido (09/10)", () => {
  it("transferência: GET traz os ocupantes atuais e a aprovação recusa com a mesma mensagem", async () => {
    const { agent, user } = await agenteLogado("admin");
    const corrida = await criarEvento();
    const outraProva = await criarEvento();
    const roberto = await criarColaborador({ fullName: "Roberto Carlos de Souza" });
    const matheus = await criarColaborador({ fullName: "Matheus Pereira Silva" });
    const destino = await criarVaga({ userId: user.id, eventId: corrida.id, collaboratorId: roberto.id, status: "escalado", phase: "escalacao" });
    const origem = await criarVaga({ userId: user.id, eventId: outraProva.id, collaboratorId: matheus.id, status: "escalado", phase: "escalacao" });

    const pedido = await mutacao(agent.post("/api/swap-requests")).send({
      teamInclusionId: destino.id, newCollaboratorId: matheus.id, reason: "Roberto não pode mais ir",
      newCity: "São Paulo - SP", kind: "transferencia", pairedInclusionId: origem.id,
    });
    expect(pedido.status).toBe(201);

    // Sem mudança: os ocupantes atuais batem com o pedido.
    const antes = await agent.get(`/api/swap-requests/inclusion/${destino.id}`);
    expect(antes.status).toBe(200);
    expect(antes.body[0]).toMatchObject({
      inclusion_collaborator_id: roberto.id, inclusion_collaborator_name: "Roberto Carlos de Souza",
      paired_collaborator_id: matheus.id, paired_collaborator_name: "Matheus Pereira Silva",
    });

    // Depois do pedido, a vaga de origem passou a ter o Roberto. Direto no banco,
    // como o pedido órfão que já existe em produção (07/10) — pelos caminhos do
    // app o pedido agora é cancelado junto (trocas-orfas.test.ts).
    await mudarOcupante(origem.id, roberto.id);

    const lista = await agent.get(`/api/swap-requests?status=pendente&eventId=${outraProva.id}`);
    expect(lista.status).toBe(200);
    const row = lista.body.find((r: { id: string }) => r.id === pedido.body.id);
    expect(row).toMatchObject({ paired_collaborator_id: roberto.id, paired_collaborator_name: "Roberto Carlos de Souza" });
    expect(motivoTrocaDesatualizada({
      swapKind: row.swap_kind, inclusionNumber: row.inclusion_number, pairedInclusionNumber: row.paired_inclusion_number,
      currentCollaboratorId: row.current_collaborator_id, currentCollaboratorName: row.current_collaborator_name,
      newCollaboratorId: row.new_collaborator_id, newCollaboratorName: row.new_collaborator_name,
      inclusionCollaboratorId: row.inclusion_collaborator_id, inclusionCollaboratorName: row.inclusion_collaborator_name,
      pairedCollaboratorId: row.paired_collaborator_id, pairedCollaboratorName: row.paired_collaborator_name,
    })).toBe(`A vaga #${row.paired_inclusion_number} hoje está com Roberto Carlos de Souza, não com Matheus Pereira Silva.`);

    const aprova = await mutacao(agent.patch(`/api/swap-requests/${pedido.body.id}/approve`)).send({});
    expect(aprova.status).toBe(409);
    expect(aprova.body.message).toBe("As vagas mudaram desde o pedido — recuse e peça a transferência de novo.");
    // Nada mudou; recusar continua possível.
    expect((await ctx.storage.getTeamInclusion(destino.id))?.collaboratorId).toBe(roberto.id);
    const recusa = await mutacao(agent.patch(`/api/swap-requests/${pedido.body.id}/reject`)).send({ reviewComment: "Vagas mudaram" });
    expect(recusa.status).toBe(200);
  });

  it("troca simples: vaga que mudou de pessoa continua 409 com a mensagem de sempre", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const ana = await criarColaborador({ fullName: "Ana Teste" });
    const bia = await criarColaborador({ fullName: "Bia Teste" });
    const caio = await criarColaborador({ fullName: "Caio Teste" });
    const vaga = await criarVaga({ userId: user.id, eventId: evento.id, collaboratorId: ana.id, status: "escalado", phase: "escalacao" });
    const pedido = await mutacao(agent.post("/api/swap-requests")).send({
      teamInclusionId: vaga.id, newCollaboratorId: bia.id, reason: "Ana não pode", newCity: "Campinas - SP",
    });
    expect(pedido.status).toBe(201);
    await mudarOcupante(vaga.id, caio.id);

    const get = await agent.get(`/api/swap-requests/inclusion/${vaga.id}`);
    expect(get.body[0]).toMatchObject({ inclusion_collaborator_id: caio.id, inclusion_collaborator_name: "Caio Teste", paired_collaborator_id: null });

    const aprova = await mutacao(agent.patch(`/api/swap-requests/${pedido.body.id}/approve`)).send({});
    expect(aprova.status).toBe(409);
    expect(aprova.body.message).toBe("O colaborador desta vaga mudou desde o pedido — recuse e peça a troca de novo.");
  });
});
