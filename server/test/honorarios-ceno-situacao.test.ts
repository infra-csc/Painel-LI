/**
 * Honorários da cenotécnica — situação agregada para a Fila da Escalação
 * (23/10, GET /api/honorarios-ceno/situacao), sobre o PGlite.
 *
 * Cobre: a etapa de cada vaga (falta lançar, rascunho, aguardando, aprovado,
 * empreita, casa), quem lançou ("meu"), a permissão (só quem lança e o admin;
 * as funções de outra pessoa não aparecem) e que a leitura não grava nada.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
  agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, criarUsuario, criarVaga, logarComo, mutacao, unico,
  type Contexto, type TestAgent, type UsuarioDeTeste,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

async function agenteDe(user: UsuarioDeTeste): Promise<TestAgent> {
  const agent = request.agent(ctx.app);
  await logarComo(agent, user);
  return agent;
}

interface Linha { vagaId: string; situacao: string; valorCents: number | null; meu: boolean; criadoPorNome: string | null; empreita: { nome: string; vagas: number } | null; honorarioId: string | null }

async function cenario() {
  const evento = await criarEvento({ name: `Night Run ${unico()}` });
  const funcao = await criarFuncao({ name: `Cenotécnica ${unico()}` });
  const quemPede = await criarUsuario("production");
  const quemAprova = await criarUsuario("production");
  await ctx.db.insert(ctx.schema.scalingFunctionManagers).values([
    { functionId: funcao.id, userId: quemPede.id, role: "validador" },
    { functionId: funcao.id, userId: quemAprova.id, role: "aprovador" },
  ]);
  const casa = await criarColaborador({ fullName: `Casa ${unico()}` });
  await ctx.db.update(ctx.schema.collaborators).set({ type: "casa" }).where(eq(ctx.schema.collaborators.id, casa.id));
  const base = { userId: quemPede.id, eventId: evento.id, functionId: funcao.id, status: "escalado", phase: "escalacao" };
  const rascunho = await criarVaga({ ...base, collaboratorId: (await criarColaborador({ fullName: `Freela A ${unico()}` })).id });
  const enviado = await criarVaga({ ...base, collaboratorId: (await criarColaborador({ fullName: `Freela B ${unico()}` })).id });
  const naEmpreita = await criarVaga({ ...base, collaboratorId: (await criarColaborador({ fullName: `Freela C ${unico()}` })).id });
  const vagaCasa = await criarVaga({ ...base, collaboratorId: casa.id });
  const aberta = await criarVaga({ ...base, status: "planejado", phase: "inclusao", collaboratorId: null });
  return {
    eventoId: evento.id, vagas: { rascunho, enviado, naEmpreita, casa: vagaCasa, aberta },
    pede: { agent: await agenteDe(quemPede), user: quemPede },
    aprova: { agent: await agenteDe(quemAprova), user: quemAprova },
  };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

async function pedir(c: Cenario, vagaId: string, valorPedido: number) {
  const r = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "vaga", teamInclusionId: vagaId, tipoFreela: "outro", valorPedido, observacao: "Negociado" });
  expect(r.status, r.text).toBe(201);
  return r.body as { id: string; versao: number };
}

async function situacao(agent: TestAgent, eventIds: string[]) {
  return agent.get(`/api/honorarios-ceno/situacao?eventIds=${encodeURIComponent(eventIds.join(","))}`);
}

const porVaga = (linhas: Linha[]) => new Map(linhas.map((l) => [l.vagaId, l]));

describe("GET /api/honorarios-ceno/situacao — a Fila da Escalação", () => {
  it("cada vaga com a etapa, o valor e quem lançou; empreita e casa à parte", async () => {
    const c = await cenario();
    await pedir(c, c.vagas.rascunho.id, 99_200);
    const env = await pedir(c, c.vagas.enviado.id, 120_000);
    const e = await mutacao(c.pede.agent.post("/api/honorarios-ceno/enviar")).send({ itens: [{ id: env.id, versao: env.versao }] });
    expect(e.status, e.text).toBe(200);
    const emp = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "empreita", nome: "Equipe Sul", valorPedido: 400_000, vagaIds: [c.vagas.naEmpreita.id] });
    expect(emp.status, emp.text).toBe(201);

    const r = await situacao(c.pede.agent, [c.eventoId]);
    expect(r.status, r.text).toBe(200);
    const m = porVaga(r.body as Linha[]);
    expect(m.size).toBe(5);
    expect(m.get(c.vagas.rascunho.id)).toMatchObject({ situacao: "rascunho", valorCents: 99_200, meu: true, criadoPorNome: c.pede.user.name });
    expect(m.get(c.vagas.enviado.id)).toMatchObject({ situacao: "aguardando", valorCents: 120_000, meu: true });
    expect(m.get(c.vagas.naEmpreita.id)).toMatchObject({ situacao: "rascunho", valorCents: 400_000, empreita: { nome: "Equipe Sul", vagas: 1 }, honorarioId: emp.body.id });
    expect(m.get(c.vagas.aberta.id)).toMatchObject({ situacao: "falta_lancar", valorCents: null, honorarioId: null, meu: false });
    expect(m.get(c.vagas.casa.id)).toMatchObject({ situacao: "casa", honorarioId: null });

    // O aprovador aprova com ajuste: a vaga passa a "aprovado" com o valor aprovado.
    const fila = await c.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`);
    const item = (fila.body as { id: string; versao: number }[]).find((x) => x.id === env.id)!;
    const ap = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${env.id}/aprovar-com-ajuste`)).send({ versao: item.versao, valor: 100_000, motivo: "Fechado em R$ 1.000" });
    expect(ap.status, ap.text).toBe(200);
    const depois = porVaga((await situacao(c.pede.agent, [c.eventoId])).body as Linha[]);
    expect(depois.get(c.vagas.enviado.id)).toMatchObject({ situacao: "aprovado", valorCents: 100_000, valorPedidoCents: 120_000 });
  });

  it("“meu” é de quem lançou: o admin vê tudo, mas o que o outro lançou não é dele", async () => {
    const c = await cenario();
    await pedir(c, c.vagas.rascunho.id, 50_000);
    const admin = await agenteLogado("admin");
    const r = await situacao(admin.agent, [c.eventoId]);
    expect(r.status, r.text).toBe(200);
    const m = porVaga(r.body as Linha[]);
    expect(m.get(c.vagas.rascunho.id)).toMatchObject({ situacao: "rascunho", meu: false });
    expect(m.size).toBeGreaterThanOrEqual(5);
  });

  it("permissão: quem não lança recebe 403; quem lança outra função não vê estas vagas", async () => {
    const c = await cenario();
    // O aprovador da escala (sem papel de validador/responsável) não lança.
    expect((await situacao(c.aprova.agent, [c.eventoId])).status).toBe(403);
    expect((await situacao((await agenteLogado("financial")).agent, [c.eventoId])).status).toBe(403);
    // Validador de OUTRA função de cenotécnica: lança, mas não por esta.
    const outra = await criarFuncao({ name: `Cenotécnica ${unico()}` });
    const vizinho = await criarUsuario("production");
    await ctx.db.insert(ctx.schema.scalingFunctionManagers).values({ functionId: outra.id, userId: vizinho.id, role: "validador" });
    const r = await situacao(await agenteDe(vizinho), [c.eventoId]);
    expect(r.status, r.text).toBe(200);
    expect(r.body).toEqual([]);
  });

  it("valida os eventos: sem nenhum → 400; mais de 100 → 400", async () => {
    const c = await cenario();
    expect((await c.pede.agent.get("/api/honorarios-ceno/situacao")).status).toBe(400);
    const muitos = Array.from({ length: 101 }, (_, i) => `ev-${i}`);
    expect((await situacao(c.pede.agent, muitos)).status).toBe(400);
  });

  it("é só leitura: a vaga aberta escalada depois não grava o colaborador no pedido", async () => {
    const c = await cenario();
    const p = await pedir(c, c.vagas.aberta.id, 70_000);
    const freela = await criarColaborador({ fullName: `Freela D ${unico()}` });
    await ctx.db.update(ctx.schema.teamInclusions).set({ collaboratorId: freela.id }).where(eq(ctx.schema.teamInclusions.id, c.vagas.aberta.id));
    const r = await situacao(c.pede.agent, [c.eventoId]);
    expect(porVaga(r.body as Linha[]).get(c.vagas.aberta.id)).toMatchObject({ situacao: "rascunho", valorCents: 70_000 });
    const [linha] = await ctx.db.select().from(ctx.schema.honorariosCeno).where(eq(ctx.schema.honorariosCeno.id, p.id));
    expect(linha.collaboratorId).toBeNull();
    expect(linha.versao).toBe(p.versao);
  });
});
