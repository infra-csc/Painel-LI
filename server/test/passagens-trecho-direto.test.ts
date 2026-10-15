/**
 * Trecho direto entre eventos, viagem sobreposta e data impossível (09/10).
 *
 * Caso real: Alonso, vaga #4045 Night Run Aracaju (ida 21/10 16:15, volta
 * 26/10 03:50) e vaga #4238 Makai João Pessoa (ida 25/10 21:25). As escalas
 * não se cruzam; as viagens sim. Regras do dono: sobreposição de viagem NÃO
 * pode (sem "registrar mesmo assim"), exceto com as vagas encadeadas; quem
 * encadeia as passagens é Compras; o que já se cruza só é listado.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  criarEvento,
  criarFuncao,
  criarVaga,
  mutacao,
  type Contexto,
  type TestAgent,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

/** Datas do caso, um ano à frente (o evento não pode estar encerrado). */
const A = (d: string) => `2027-${d}`;

async function cenarioAlonso(opts: { status?: string } = {}) {
  const { agent, user } = await agenteLogado("admin");
  const aju = await criarEvento({ name: "Night Run Aracaju", location: "Orla de Atalaia, Aracaju - SE", startDate: A("10-23"), endDate: A("10-25") });
  const jpa = await criarEvento({ name: "Makai João Pessoa", location: "Praia de Tambaú, João Pessoa - PB", startDate: A("10-27"), endDate: A("11-02") });
  const funcao = await criarFuncao();
  const alonso = await criarColaborador({ fullName: "Alonso Ferreira Lima" });
  const status = opts.status ?? "escalado";
  const vagaAju = await criarVaga({ userId: user.id, eventId: aju.id, functionId: funcao.id, collaboratorId: alonso.id, status, phase: "escalacao", scheduleStartDate: A("10-22"), scheduleEndDate: A("10-25") });
  const vagaJpa = await criarVaga({ userId: user.id, eventId: jpa.id, functionId: funcao.id, collaboratorId: alonso.id, status, phase: "escalacao", scheduleStartDate: A("10-26"), scheduleEndDate: A("11-02") });
  return { agent, user, aju, jpa, funcao, alonso, vagaAju, vagaJpa };
}

const passagemAracaju = (vagaId: string) => ({
  teamInclusionId: vagaId, transportType: "aereo", value: 120000, purchaseOrderNumber: "AJU001",
  actualDepartureDate: A("10-21"), actualDepartureTime: "16:15", actualArrivalTime: "19:00",
  actualReturnDate: A("10-26"), actualReturnTime: "03:50",
});
const idaJoaoPessoa = (vagaId: string, extra: Record<string, unknown> = {}) => ({
  teamInclusionId: vagaId, transportType: "aereo", value: 98000, purchaseOrderNumber: "JPA001",
  actualDepartureDate: A("10-25"), actualDepartureTime: "21:25", actualArrivalTime: "23:59",
  departureAirport: "GRU", destinationAirport: "JPA",
  ...extra,
});

const registrar = (agent: TestAgent, body: Record<string, unknown>) => mutacao(agent.post("/api/tickets")).send(body);

describe("POST /api/tickets — viagem que cruza outra viagem do colaborador", () => {
  it("bloqueia a ida de João Pessoa que cruza a volta de Aracaju, com a frase que Compras entende", async () => {
    const { agent, vagaAju, vagaJpa } = await cenarioAlonso();
    expect((await registrar(agent, passagemAracaju(vagaAju.id))).status).toBe(200);
    const res = await registrar(agent, idaJoaoPessoa(vagaJpa.id));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("viagem_cruzada");
    expect(res.body.message).toBe(
      `Alonso já está em Aracaju até 26/10 03:50 (#${vagaAju.inclusionNumber} · Night Run Aracaju). Esta ida 25/10 21:25 cruza com essa viagem. Se Alonso vai direto de Aracaju, registre como trecho direto.`,
    );
    expect(res.body.conflito).toMatchObject({ inclusionId: vagaAju.id, podeEncadear: true });
    // Nada foi gravado.
    expect(await ctx.storage.getTicketsByInclusionId(vagaJpa.id)).toHaveLength(0);
  });

  it("como trecho direto (ida de JPA sai da vaga de Aracaju) passa, e avisa que a volta de Aracaju ainda está registrada", async () => {
    const { agent, vagaAju, vagaJpa } = await cenarioAlonso();
    await registrar(agent, passagemAracaju(vagaAju.id));
    const res = await registrar(agent, idaJoaoPessoa(vagaJpa.id, { departureAirport: "AJU", idaVemDeInclusionId: vagaAju.id }));
    expect(res.status).toBe(200);
    expect(res.body.idaVemDeInclusionId).toBe(vagaAju.id);
    expect(res.body.voltaParaCancelar).toMatchObject({ inclusionId: vagaAju.id, quando: "26/10 03:50" });
  });

  it("trecho direto inválido: de outra pessoa, da própria vaga ou sem a perna de ida", async () => {
    const { agent, vagaAju, vagaJpa, user, funcao } = await cenarioAlonso();
    const outraPessoa = await criarColaborador();
    const vagaDeOutro = await criarVaga({ userId: user.id, functionId: funcao.id, collaboratorId: outraPessoa.id, status: "escalado", phase: "escalacao" });
    expect((await registrar(agent, idaJoaoPessoa(vagaJpa.id, { idaVemDeInclusionId: vagaDeOutro.id }))).status).toBe(400);
    expect((await registrar(agent, idaJoaoPessoa(vagaJpa.id, { idaVemDeInclusionId: vagaJpa.id }))).status).toBe(400);
    const soVolta = await registrar(agent, { teamInclusionId: vagaJpa.id, actualReturnDate: A("11-03"), actualReturnTime: "10:00", idaVemDeInclusionId: vagaAju.id });
    expect(soVolta.status).toBe(400);
    expect(soVolta.body.message).toMatch(/IDA desta vaga/);
  });

  it("volta 10:00 e ida 18:00 no mesmo dia não cruzam", async () => {
    const { agent, vagaAju, vagaJpa } = await cenarioAlonso();
    expect((await registrar(agent, { ...passagemAracaju(vagaAju.id), actualReturnDate: A("10-25"), actualReturnTime: "08:00", returnArrivalTime: "10:00" })).status).toBe(200);
    expect((await registrar(agent, idaJoaoPessoa(vagaJpa.id, { actualDepartureTime: "18:00" }))).status).toBe(200);
  });

  it("vaga só salva (não confirmada) não prende a agenda", async () => {
    const { agent, vagaAju, vagaJpa } = await cenarioAlonso();
    await ctx.db.update(ctx.schema.teamInclusions).set({ status: "planejado" }).where(eq(ctx.schema.teamInclusions.id, vagaAju.id));
    await registrar(agent, passagemAracaju(vagaAju.id));
    expect((await registrar(agent, idaJoaoPessoa(vagaJpa.id))).status).toBe(200);
  });
});

describe("datas impossíveis — o servidor é a fonte da verdade", () => {
  it("recusa volta antes da ida e anos fora de 2024…hoje+2, com a mensagem por campo", async () => {
    const { agent, vagaAju } = await cenarioAlonso();
    const antes = await registrar(agent, { ...passagemAracaju(vagaAju.id), actualReturnDate: A("10-20") });
    expect(antes.status).toBe(400);
    expect(antes.body.errors.actualReturnDate).toMatch(/não pode ser antes da ida/);
    const ano2 = await registrar(agent, { ...passagemAracaju(vagaAju.id), actualDepartureDate: "0002-10-21" });
    expect(ano2.status).toBe(400);
    expect(ano2.body.errors.actualDepartureDate).toMatch(/ano 2 /);
  });

  it("passagem só de ida ou só de volta é normal", async () => {
    const { agent, vagaAju, vagaJpa } = await cenarioAlonso();
    expect((await registrar(agent, { teamInclusionId: vagaAju.id, actualDepartureDate: A("10-21"), actualDepartureTime: "16:15" })).status).toBe(200);
    expect((await registrar(agent, { teamInclusionId: vagaJpa.id, actualReturnDate: A("11-03"), actualReturnTime: "10:00" })).status).toBe(200);
  });
});

describe("PATCH /api/tickets — passagem antiga já em conflito", () => {
  it("editar LOC/valor não é bloqueado; mexer na data é conferido", async () => {
    const { agent, vagaAju, vagaJpa } = await cenarioAlonso();
    await registrar(agent, passagemAracaju(vagaAju.id));
    // Passagem antiga, gravada antes da regra (direto no banco).
    const [antiga] = await ctx.db.insert(ctx.schema.tickets).values({
      teamInclusionId: vagaJpa.id, actualDepartureDate: A("10-25"), actualDepartureTime: "21:25", purchaseOrderNumber: "VELHO",
    }).returning();
    const loc = await mutacao(agent.patch(`/api/tickets/${antiga.id}`)).send({ purchaseOrderNumber: "NOVO", actualDepartureDate: A("10-25"), actualDepartureTime: "21:25" });
    expect(loc.status).toBe(200);
    const data = await mutacao(agent.patch(`/api/tickets/${antiga.id}`)).send({ actualDepartureTime: "20:00" });
    expect(data.status).toBe(409);
    // Encadear resolve.
    const encadeia = await mutacao(agent.patch(`/api/tickets/${antiga.id}`)).send({ idaVemDeInclusionId: vagaAju.id });
    expect(encadeia.status).toBe(200);
  });
});

describe("sinais de viagem e Pendências", () => {
  it("a vaga sem passagem recebe a sugestão de ir direto; o par cruzado e a data impossível entram nas contagens", async () => {
    const { agent, vagaAju, vagaJpa } = await cenarioAlonso();
    await registrar(agent, passagemAracaju(vagaAju.id));
    const sinais = await agent.get("/api/tickets/sinais-de-viagem");
    expect(sinais.status).toBe(200);
    expect(sinais.body.porVaga[vagaJpa.id].podeIrDiretoDe).toMatchObject({ inclusionId: vagaAju.id, cidade: "Aracaju", dia: A("10-25") });
    expect(sinais.body.porVaga[vagaAju.id].seguePara).toMatchObject({ inclusionId: vagaJpa.id, cidade: "João Pessoa" });

    const antes = (await agent.get("/api/shell/viagens-e-datas")).body;
    // Passagem antiga cruzada + uma com data impossível, gravadas antes da regra.
    await ctx.db.insert(ctx.schema.tickets).values({ teamInclusionId: vagaJpa.id, actualDepartureDate: A("10-25"), actualDepartureTime: "21:25" });
    const { user } = await agenteLogado("admin");
    const outra = await criarVaga({ userId: user.id, collaboratorId: (await criarColaborador()).id, status: "escalado", phase: "escalacao" });
    await ctx.db.insert(ctx.schema.tickets).values({ teamInclusionId: outra.id, actualDepartureDate: A("10-25"), actualReturnDate: A("10-20") });
    const depois = (await agent.get("/api/shell/viagens-e-datas")).body;
    expect(depois.cruzam).toBe(antes.cruzam + 1);
    expect(depois.datasImpossiveis).toBe(antes.datasImpossiveis + 1);

    const marcados = (await agent.get("/api/tickets/sinais-de-viagem")).body.porVaga;
    expect(marcados[vagaJpa.id].cruzaCom[0]).toMatchObject({ inclusionId: vagaAju.id });
    expect(marcados[outra.id].dataImpossivel).toBe("Data da volta antes da ida");
    // Nada foi corrigido sozinho.
    expect((await ctx.storage.getTicketsByInclusionId(outra.id))[0].actualReturnDate).toBe(A("10-20"));
  });

  it("Pendências: só admin e Compras; sinais: quem registra passagem", async () => {
    const compras = await agenteLogado("purchasing");
    expect((await compras.agent.get("/api/shell/viagens-e-datas")).status).toBe(200);
    const producao = await agenteLogado("production");
    expect((await producao.agent.get("/api/shell/viagens-e-datas")).status).toBe(403);
    expect((await producao.agent.get("/api/tickets/sinais-de-viagem")).status).toBe(200);
    const rh = await agenteLogado("financial");
    expect((await rh.agent.get("/api/tickets/sinais-de-viagem")).status).toBe(403);
  });
});

describe("pedido de ajuste em PAR (Escalação: vai direto de um evento para o outro)", () => {
  async function abrirPar(agent: TestAgent, a: { id: string }, b: { id: string }) {
    return mutacao(agent.post("/api/scaling-change-requests/par")).send({
      anteriorId: a.id, seguinteId: b.id, reason: "Alonso vai direto de Aracaju para João Pessoa",
      idaDaSeguinte: { flightDepartureDate: A("10-26"), flightArrivalSuggestedTime: "12h" },
    });
  }

  it("aprovado: aplica os dois lados numa vez e gera aviso para Compras nas duas vagas com passagem", async () => {
    const { agent, vagaAju, vagaJpa, aju, jpa } = await cenarioAlonso();
    await ctx.db.update(ctx.schema.teamInclusions).set({ flightReturnDate: A("10-26"), transportModeVolta: "aereo" }).where(eq(ctx.schema.teamInclusions.id, vagaAju.id));
    await registrar(agent, passagemAracaju(vagaAju.id));
    await ctx.db.insert(ctx.schema.tickets).values({ teamInclusionId: vagaJpa.id, actualDepartureDate: A("10-25"), actualDepartureTime: "21:25" });
    const par = await abrirPar(agent, vagaAju, vagaJpa);
    expect(par.status).toBe(201);
    expect(par.body.pedidos).toHaveLength(2);
    expect(par.body.pedidos[0].grupoId).toBe(par.body.pedidos[1].grupoId);

    const aprova = await mutacao(agent.patch(`/api/scaling-change-requests/${par.body.pedidos[1].id}/approve`)).send({});
    expect(aprova.status).toBe(200);
    expect(aprova.body.pedidos.every((p: { status: string }) => p.status === "aprovado")).toBe(true);

    const a = await ctx.storage.getTeamInclusion(vagaAju.id);
    const b = await ctx.storage.getTeamInclusion(vagaJpa.id);
    expect(a).toMatchObject({ trechosSugeridos: "so_ida", voltaSegueParaEventoId: jpa.id, flightReturnDate: null, transportModeVolta: null });
    expect(b).toMatchObject({ idaVemDoEventoId: aju.id, flightDepartureDate: A("10-26"), flightArrivalSuggestedTime: "12h" });

    const avisos = await ctx.db.select().from(ctx.schema.avisosDeAlteracao);
    const daA = avisos.find((x) => x.teamInclusionId === vagaAju.id);
    const daB = avisos.find((x) => x.teamInclusionId === vagaJpa.id);
    expect(daA?.afetaPassagem).toBe(true);
    expect(daB?.afetaPassagem).toBe(true);
    expect(JSON.stringify(daA?.mudancas)).toContain("Makai João Pessoa");
    expect(JSON.stringify(daB?.mudancas)).toContain("Night Run Aracaju");
  });

  it("negado: nada muda nas duas vagas", async () => {
    const { agent, vagaAju, vagaJpa } = await cenarioAlonso();
    const par = await abrirPar(agent, vagaAju, vagaJpa);
    const nega = await mutacao(agent.patch(`/api/scaling-change-requests/${par.body.pedidos[0].id}/negar`)).send({ comment: "Vai voltar para casa antes", then: "aprovar_direto" });
    expect(nega.status).toBe(200);
    const pedidos = await ctx.storage.getScalingChangeRequestsByGrupo(par.body.grupoId);
    expect(pedidos.map((p) => p.status)).toEqual(["negado", "negado"]);
    expect((await ctx.storage.getTeamInclusion(vagaAju.id))?.voltaSegueParaEventoId).toBeNull();
    expect((await ctx.storage.getTeamInclusion(vagaJpa.id))?.idaVemDoEventoId).toBeNull();
  });

  it("vaga mudou no meio (outra pessoa numa delas) → 409 e nenhum lado é aplicado", async () => {
    const { agent, vagaAju, vagaJpa } = await cenarioAlonso();
    const par = await abrirPar(agent, vagaAju, vagaJpa);
    const outro = await criarColaborador({ fullName: "Bruno Matos" });
    await ctx.db.update(ctx.schema.teamInclusions).set({ collaboratorId: outro.id }).where(eq(ctx.schema.teamInclusions.id, vagaJpa.id));
    const aprova = await mutacao(agent.patch(`/api/scaling-change-requests/${par.body.pedidos[0].id}/approve`)).send({});
    expect(aprova.status).toBe(409);
    expect(aprova.body.message).toMatch(/mesma pessoa/);
    expect((await ctx.storage.getTeamInclusion(vagaAju.id))?.voltaSegueParaEventoId).toBeNull();
    const pedidos = await ctx.storage.getScalingChangeRequestsByGrupo(par.body.grupoId);
    expect(pedidos.map((p) => p.status)).toEqual(["pendente", "pendente"]);
  });

  it("reajustar um lado só não existe; vaga de outra pessoa não forma par", async () => {
    const { agent, vagaAju, vagaJpa, user, funcao } = await cenarioAlonso();
    const par = await abrirPar(agent, vagaAju, vagaJpa);
    const reajusta = await mutacao(agent.patch(`/api/scaling-change-requests/${par.body.pedidos[0].id}/reajustar`)).send({ comment: "x", then: "aprovar_direto" });
    expect(reajusta.status).toBe(400);
    const deOutro = await criarVaga({ userId: user.id, functionId: funcao.id, collaboratorId: (await criarColaborador()).id, status: "escalado", phase: "escalacao" });
    const { agent: admin2 } = await agenteLogado("admin");
    expect((await abrirPar(admin2, deOutro, (await cenarioAlonso()).vagaJpa)).status).toBe(400);
  });
});
