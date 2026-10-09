/**
 * Aba Análises de passagens e alerta "sem passagem a 30 dias" (07/10) — só admin.
 *
 * Cobre: o admin recebe os números certos num cenário pequeno (atual +
 * histórico de troca, dia da semana, evento, antecedência, remarcação, sem
 * valor); os outros papéis levam 403; parâmetro inválido vira 400; e o
 * contador do sino conta só vaga escalada, que precisa de passagem, sem
 * passagem atual e com a ida nos próximos 30 dias.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hojeISO } from "@shared/hoje-sp";
import { somarDias } from "@shared/analise-de-passagens";
import {
  agenteLogado, criarApp, criarColaborador, criarEvento, criarVaga, mutacao,
  type Contexto, type TestAgent,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

/**
 * Datas de 2091 isolam o cenário do resto do banco — mas, desde 09/10, o POST
 * de passagem recusa ano além de hoje + 2 (shared/janela-de-viagem). Passagens com
 * data em 209x entram direto no banco; o resto continua passando pela rota.
 */
async function registrar(agent: TestAgent, vagaId: string, dados: Record<string, unknown>) {
  const temAnoDistante = Object.values(dados).some((v) => typeof v === "string" && /^209\d-/.test(v));
  if (temAnoDistante) {
    const [linha] = await ctx.db.insert(ctx.schema.tickets).values({ teamInclusionId: vagaId, transportType: "aereo", ...dados } as typeof ctx.schema.tickets.$inferInsert).returning();
    return { id: linha.id };
  }
  const res = await mutacao(agent.post("/api/tickets")).send({ teamInclusionId: vagaId, transportType: "aereo", ...dados });
  expect(res.status).toBe(200);
  return res.body as { id: string };
}

describe("GET /api/tickets/analises", () => {
  it("admin: números certos num cenário pequeno (atual + histórico, dia, evento, antecedência, remarcação)", async () => {
    const { agent, user } = await agenteLogado("admin");
    // Ano distante e só deste teste: o período isola o cenário do resto do banco.
    const grande = await criarEvento({ name: "Maratona Grande 2091", startDate: "2091-10-12", endDate: "2091-10-13" });
    const pequeno = await criarEvento({ name: "Corrida Pequena 2091", startDate: "2091-11-20", endDate: "2091-11-20" });
    const foraDoPeriodo = await criarEvento({ name: "Fora 2092", startDate: "2092-01-10", endDate: "2092-01-10" });

    const [ana, bia, caio, dani, edu] = await Promise.all(["Ana", "Bia", "Caio", "Dani", "Edu"].map((n) => criarColaborador({ fullName: `${n} Analise` })));
    const vaga = (eventId: string, collaboratorId: string) => criarVaga({ userId: user.id, eventId, collaboratorId, status: "escalado", phase: "escalacao" });

    // 2091-10-12 é sexta-feira; 2091-10-09 é terça.
    const v1 = await vaga(grande.id, ana.id);
    const v2 = await vaga(grande.id, bia.id);
    const v3 = await vaga(grande.id, caio.id);
    await registrar(agent, v1.id, { value: 120_000, baggageTotalCents: 15_000, purchaseDate: "2091-10-08", actualDepartureDate: "2091-10-12", actualReturnDate: "2091-10-14", ticketCompany: "LATAM", departureAirport: "GRU", destinationAirport: "SSA" });
    await registrar(agent, v2.id, { value: 100_000, purchaseDate: "2091-09-01", actualDepartureDate: "2091-10-12", actualReturnDate: "2091-10-14", ticketCompany: "latam ", departureAirport: "gru", destinationAirport: "ssa" });
    await registrar(agent, v3.id, { value: 80_000, purchaseDate: "2091-08-01", actualDepartureDate: "2091-10-09", actualReturnDate: "2091-10-14", ticketCompany: "Gol" });
    // Histórico de troca no evento grande: custo fica, pessoa não conta.
    const vTroca = await vaga(grande.id, dani.id);
    const troca = await registrar(agent, vTroca.id, { value: 50_000, purchaseDate: "2091-09-01", actualDepartureDate: "2091-10-12", ticketCompany: "Azul" });
    await ctx.db.update(ctx.schema.tickets)
      .set({ archivedAt: new Date(), archivedCollaboratorId: dani.id, archivedReason: "troca" })
      .where(eq(ctx.schema.tickets.id, troca.id));
    // Evento pequeno: uma passagem com valor e uma sem valor nem datas.
    const v5 = await vaga(pequeno.id, edu.id);
    await registrar(agent, v5.id, { value: 60_000, purchaseDate: "2091-11-15", actualDepartureDate: "2091-11-19", ticketCompany: "Azul Linhas Aéreas" });
    const v6 = await vaga(pequeno.id, ana.id);
    await registrar(agent, v6.id, {});
    // Fora do período.
    const v7 = await vaga(foraDoPeriodo.id, bia.id);
    await registrar(agent, v7.id, { value: 999_000, purchaseDate: "2091-12-01", actualDepartureDate: "2092-01-09" });
    // Remarcação: um aviso pendente e um resolvido no evento grande.
    await ctx.db.insert(ctx.schema.avisosDeAlteracao).values([
      { teamInclusionId: v1.id, eventId: grande.id, mudancas: [], afetaPassagem: true, aprovadoPorNome: "Pedro", aprovadoEm: new Date() },
      { teamInclusionId: v2.id, eventId: grande.id, mudancas: [], afetaPassagem: true, aprovadoPorNome: "Pedro", aprovadoEm: new Date(), resolvidoEm: new Date(), resolvidoPorNome: "Compras" },
      // Só hospedagem: não é remarcação de passagem.
      { teamInclusionId: v3.id, eventId: grande.id, mudancas: [], afetaPassagem: false, afetaHospedagem: true, aprovadoPorNome: "Pedro", aprovadoEm: new Date() },
    ]);

    const res = await agent.get("/api/tickets/analises?de=2091-01-01&ate=2091-12-31");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const r = res.body;
    expect(r.totais).toMatchObject({
      passagens: 6, comValor: 5, semValor: 1, eventos: 2,
      totalPassagem: 410_000, totalBagagem: 15_000, gasto: 425_000, media: 82_000,
      semDataCompra: 1, semDataIda: 1,
    });
    // Ida: sexta tem 3 (120k, 100k, 50k), terça 1 — nenhum dia com o mínimo de 3 em dois dias → sem destaque.
    const sexta = r.diasDaIda.find((d: { curto: string }) => d.curto === "Sex");
    expect(sexta).toMatchObject({ passagens: 3, comValor: 3, media: 90_000 });
    expect(r.diasDaIda.every((d: { destaque: string | null }) => d.destaque === null)).toBe(true);
    // Eventos: grande gasta mais; 3 pessoas (a da troca não conta).
    expect(r.porEvento.map((e: { nome: string }) => e.nome)).toEqual(["Maratona Grande 2091", "Corrida Pequena 2091"]);
    expect(r.porEvento[0]).toMatchObject({ gasto: 365_000, pessoas: 3, trocas: 1, porPessoa: 121_667 });
    expect(r.porEvento[1]).toMatchObject({ gasto: 60_000, pessoas: 2, passagens: 2 });
    // Antecedência: 4, 41, 72, 41, 4 dias.
    const faixa = (k: string) => r.antecedencia.faixas.find((f: { chave: string }) => f.chave === k);
    expect(faixa("0-6").passagens).toBe(2);
    expect(faixa("30-59").passagens).toBe(2);
    expect(faixa("60+").passagens).toBe(1);
    expect(r.antecedencia).toMatchObject({ base: 5, menosDe14: 2, pctMenosDe14: 40 });
    // Companhia normalizada, rota e trocas.
    expect(r.porCompanhia.find((c: { chave: string }) => c.chave === "LATAM")).toMatchObject({ passagens: 2, totalPassagem: 220_000 });
    expect(r.porRota[0]).toMatchObject({ chave: "GRU→SSA", passagens: 2 });
    expect(r.trocas).toEqual({ passagens: 1, gasto: 50_000 });
    expect(r.remarcacoes).toEqual({ total: 2, pendentes: 1, resolvidos: 1 });
    expect(r.bagagem).toEqual({ passagens: 1, total: 15_000 });

    // Filtros: evento e companhia.
    const soPequeno = await agent.get(`/api/tickets/analises?de=2091-01-01&ate=2091-12-31&eventId=${pequeno.id}`);
    expect(soPequeno.body.totais.passagens).toBe(2);
    expect(soPequeno.body.remarcacoes.total).toBe(0);
    const soLatam = await agent.get("/api/tickets/analises?de=2091-01-01&ate=2091-12-31&companhia=LATAM");
    expect(soLatam.body.totais.passagens).toBe(2);
    expect(soLatam.body.opcoes.companhias.length).toBeGreaterThanOrEqual(3);
  });

  it("período inválido → 400", async () => {
    const { agent } = await agenteLogado("admin");
    expect((await agent.get("/api/tickets/analises?de=10/10/2026")).status).toBe(400);
    expect((await agent.get("/api/tickets/analises?de=2026-12-01&ate=2026-01-01")).status).toBe(400);
  });

  it.each(["purchasing", "production", "function_area", "financial"] as const)("%s → 403", async (papel) => {
    const { agent } = await agenteLogado(papel);
    expect((await agent.get("/api/tickets/analises")).status).toBe(403);
    expect((await agent.get("/api/shell/sem-passagem-30d")).status).toBe(403);
  });
});

describe("GET /api/shell/sem-passagem-30d", () => {
  it("conta só vaga escalada, precisando de passagem, sem passagem atual e com a ida nos próximos 30 dias", async () => {
    const { agent, user } = await agenteLogado("admin");
    const antes = (await agent.get("/api/shell/sem-passagem-30d")).body.count as number;

    const hoje = hojeISO();
    const daqui = (d: number) => somarDias(hoje, d);
    const evento = await criarEvento({ name: "Prova próxima", startDate: daqui(10), endDate: daqui(11) });
    const colab = () => criarColaborador();
    const vaga = async (o: { ida?: string | null; inicio?: string; colaborador?: boolean; needsTicket?: boolean; status?: string; phase?: string; excluida?: boolean }) => {
      const v = await criarVaga({
        userId: user.id, eventId: evento.id,
        collaboratorId: o.colaborador === false ? null : (await colab()).id,
        status: o.status ?? "escalado", phase: o.phase ?? "escalacao",
        needsTicket: o.needsTicket ?? true,
        scheduleStartDate: o.inicio ?? daqui(9), scheduleEndDate: daqui(12),
      });
      await ctx.db.update(ctx.schema.teamInclusions)
        .set({ flightDepartureDate: o.ida === undefined ? daqui(9) : o.ida, ...(o.excluida ? { deletedAt: new Date() } : {}) })
        .where(eq(ctx.schema.teamInclusions.id, v.id));
      return v;
    };

    // CONTAM (3):
    await vaga({ ida: daqui(5) });
    await vaga({ ida: daqui(30) }); // a ponta entra
    await vaga({ ida: null, inicio: daqui(0) }); // sem ida → usa o início da escala
    // NÃO contam:
    await vaga({ ida: daqui(31) }); // longe demais
    await vaga({ ida: daqui(-1) }); // já passou
    await vaga({ colaborador: false }); // sem colaborador
    await vaga({ needsTicket: false });
    await vaga({ status: "cancelado" });
    await vaga({ phase: "sugestao", status: "sugestao_validada" });
    await vaga({ excluida: true });
    const comPassagem = await vaga({ ida: daqui(5) });
    await registrar(agent, comPassagem.id, { value: 10_000 });
    // Passagem só de histórico NÃO conta como passagem atual → a vaga conta.
    const soHistorico = await vaga({ ida: daqui(6) });
    const hist = await registrar(agent, soHistorico.id, { value: 10_000 });
    await ctx.db.update(ctx.schema.tickets).set({ archivedAt: new Date() }).where(eq(ctx.schema.tickets.id, hist.id));

    const depois = await agent.get("/api/shell/sem-passagem-30d");
    expect(depois.status).toBe(200);
    expect(depois.body.count - antes).toBe(4);
  });
});
