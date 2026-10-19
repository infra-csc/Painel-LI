/**
 * Honorários da cenotécnica (16/10) — rotas sobre o PGlite.
 *
 * Cobre o fluxo do dono (pedir → aprovar com ajuste → liberar parcial →
 * relatório), quem vê o quê (403 antes de 409), a trava de corrida, as
 * empreitas, o sino e — o mais importante — que NADA disso muda a escala.
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

interface Cenario {
  eventoId: string;
  funcaoId: string;
  vagaFreela: { id: string };
  vagaCasa: { id: string };
  vagaViagem: { id: string };
  pede: { agent: TestAgent; user: UsuarioDeTeste };
  aprova: { agent: TestAgent; user: UsuarioDeTeste };
}

async function agenteDe(user: UsuarioDeTeste): Promise<TestAgent> {
  const agent = request.agent(ctx.app);
  await logarComo(agent, user);
  return agent;
}

/** Função de cenotécnica com validador (quem pede) e aprovador da escala; 3 vagas escaladas. */
async function cenario(): Promise<Cenario> {
  const evento = await criarEvento({ name: `Night Run ${unico()}` });
  const funcao = await criarFuncao({ name: `Cenotécnica ${unico()}` });
  const quemPede = await criarUsuario("production");
  const quemAprova = await criarUsuario("production");
  await ctx.db.insert(ctx.schema.scalingFunctionManagers).values([
    { functionId: funcao.id, userId: quemPede.id, role: "validador" },
    { functionId: funcao.id, userId: quemAprova.id, role: "aprovador" },
  ]);
  const freela = await criarColaborador({ fullName: `Freela Local ${unico()}` });
  const viajante = await criarColaborador({ fullName: `Freela Viagem ${unico()}` });
  const casa = await criarColaborador({ fullName: `Funcionário Casa ${unico()}` });
  await ctx.db.update(ctx.schema.collaborators).set({ type: "casa" }).where(eq(ctx.schema.collaborators.id, casa.id));
  const base = { userId: quemPede.id, eventId: evento.id, functionId: funcao.id, status: "escalado", phase: "escalacao" };
  const vagaFreela = await criarVaga({ ...base, collaboratorId: freela.id, needsTicket: false });
  const vagaViagem = await criarVaga({ ...base, collaboratorId: viajante.id, needsTicket: true });
  const vagaCasa = await criarVaga({ ...base, collaboratorId: casa.id });
  // Vaga que NÃO está escalada (planejada) não entra.
  await criarVaga({ ...base, status: "planejado", phase: "inclusao", collaboratorId: null });
  return {
    eventoId: evento.id, funcaoId: funcao.id, vagaFreela, vagaCasa, vagaViagem,
    pede: { agent: await agenteDe(quemPede), user: quemPede },
    aprova: { agent: await agenteDe(quemAprova), user: quemAprova },
  };
}

async function criarRascunho(c: Cenario, vagaId: string, valorPedido = 120_000) {
  const r = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({
    eventId: c.eventoId, tipo: "vaga", teamInclusionId: vagaId, valorPedido, setor: "montagem",
  });
  expect(r.status, r.text).toBe(201);
  return r.body as { id: string; versao: number; status: string; valorPedido: number };
}

async function enviar(c: Cenario, itens: { id: string; versao: number }[]) {
  const r = await mutacao(c.pede.agent.post("/api/honorarios-ceno/enviar")).send({ itens });
  expect(r.status, r.text).toBe(200);
  return r.body as { enviados: string[]; recusados: unknown[] };
}

async function lerPedido(agent: TestAgent, id: string) {
  const r = await agent.get(`/api/honorarios-ceno/${id}/historico`);
  expect(r.status, r.text).toBe(200);
  return r.body as { honorario: { id: string; versao: number; status: string; valorAprovado: number | null; liberado: number; falta: number }; historico: { acao: string; valorAnterior: number | null; valorNovo: number | null; motivo: string | null; porNome: string }[]; liberacoes: { id: string; valor: number; estornadaEm: string | null }[] };
}

describe("Honorários da cenotécnica — fluxo do dono", () => {
  it("pedir → aprovar com ajuste → liberar parcial → relatório por evento, sem mexer na escala", async () => {
    const c = await cenario();
    const vagaAntes = await ctx.storage.getTeamInclusion(c.vagaFreela.id);

    // Quem pede vê as vagas escaladas freela; a da casa vai para a nota de rodapé.
    const tela = await c.pede.agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`);
    expect(tela.status).toBe(200);
    const ids = tela.body.linhas.map((l: { vaga: { id: string } }) => l.vaga.id).sort();
    expect(ids).toEqual([c.vagaFreela.id, c.vagaViagem.id].sort());
    expect(tela.body.casa.map((v: { id: string }) => v.id)).toEqual([c.vagaCasa.id]);
    const viagem = tela.body.linhas.find((l: { vaga: { id: string } }) => l.vaga.id === c.vagaViagem.id);
    expect(viagem.sugestao.posicao).toBe("freela_viagem");
    expect(viagem.sugestao.diarias).toBe(3);

    // Rascunho → envio.
    const rascunho = await criarRascunho(c, c.vagaFreela.id, 120_000);
    expect(rascunho.status).toBe("rascunho");
    const enviado = await enviar(c, [{ id: rascunho.id, versao: rascunho.versao }]);
    expect(enviado.enviados).toEqual([rascunho.id]);

    // Aprovador vê na fila e aprova com ajuste (motivo obrigatório).
    const fila = await c.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`);
    expect(fila.status).toBe(200);
    expect(fila.body).toHaveLength(1);
    expect(fila.body[0]).toMatchObject({ id: rascunho.id, status: "aguardando", podeDecidir: true, eAprovador: true });
    const semMotivo = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${rascunho.id}/aprovar-com-ajuste`)).send({ versao: fila.body[0].versao, valor: 100_000, motivo: "" });
    expect(semMotivo.status).toBe(400);
    const ajuste = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${rascunho.id}/aprovar-com-ajuste`))
      .send({ versao: fila.body[0].versao, valor: 100_000, motivo: "Negociado com a produção: 4 diárias" });
    expect(ajuste.status, ajuste.text).toBe(200);
    expect(ajuste.body).toMatchObject({ status: "aprovado_ajuste", valorAprovado: 100_000, valorPedido: 120_000 });

    // Aprovado não se edita mais.
    const editar = await mutacao(c.pede.agent.patch(`/api/honorarios-ceno/${rascunho.id}`)).send({ versao: ajuste.body.versao, valorPedido: 1 });
    expect(editar.status).toBe(409);

    // Financeiro libera parcial; acima do que falta é recusado.
    const rh = await agenteLogado("financial");
    const acima = await mutacao(rh.agent.post(`/api/honorarios-ceno/${rascunho.id}/liberacoes`)).send({ versao: ajuste.body.versao, data: "2099-10-20", oc: "45123", valor: 150_000 });
    expect(acima.status).toBe(400);
    const parcial = await mutacao(rh.agent.post(`/api/honorarios-ceno/${rascunho.id}/liberacoes`)).send({ versao: ajuste.body.versao, data: "2099-10-20", oc: "45123", valor: 60_000 });
    expect(parcial.status, parcial.text).toBe(201);
    expect(parcial.body).toMatchObject({ liberado: 60_000, falta: 40_000 });

    // Com verba liberada o aprovador não devolve mais.
    const devolver = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${rascunho.id}/devolver`)).send({ versao: parcial.body.versao, motivo: "Rever" });
    expect(devolver.status).toBe(409);
    expect(devolver.body.message).toMatch(/verba liberada/);

    // Relatório: a linha chega ao Financeiro com as liberações.
    const fin = await rh.agent.get(`/api/honorarios-ceno/financeiro?eventId=${c.eventoId}`);
    expect(fin.status).toBe(200);
    expect(fin.body).toHaveLength(1);
    expect(fin.body[0]).toMatchObject({ valorPedido: 120_000, valorAprovado: 100_000, liberado: 60_000, falta: 40_000 });
    expect(fin.body[0].liberacoes).toHaveLength(1);

    // Histórico: quem, valor anterior → novo e o motivo.
    const h = await lerPedido(c.pede.agent, rascunho.id);
    expect(h.historico.map((x) => x.acao)).toEqual(["liberacao", "aprovado_ajuste", "enviado", "criado"]);
    const aj = h.historico.find((x) => x.acao === "aprovado_ajuste")!;
    expect(aj).toMatchObject({ valorAnterior: 120_000, valorNovo: 100_000, motivo: "Negociado com a produção: 4 diárias", porNome: c.aprova.user.name });

    // A escala não mudou nada.
    const vagaDepois = await ctx.storage.getTeamInclusion(c.vagaFreela.id);
    expect(vagaDepois?.status).toBe(vagaAntes?.status);
    expect(vagaDepois?.dailyValue).toBe(vagaAntes?.dailyValue);
    expect(new Date(vagaDepois!.updatedAt).getTime()).toBe(new Date(vagaAntes!.updatedAt).getTime());
  });

  it("devolver para negociar volta para quem pediu; reeditar e reenviar; aprovar em lote", async () => {
    const c = await cenario();
    const a = await criarRascunho(c, c.vagaFreela.id, 80_000);
    const b = await criarRascunho(c, c.vagaViagem.id, 90_000);
    await enviar(c, [{ id: a.id, versao: a.versao }, { id: b.id, versao: b.versao }]);
    const fila = (await c.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`)).body as { id: string; versao: number }[];
    const va = fila.find((x) => x.id === a.id)!;

    const devolvido = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${a.id}/devolver`)).send({ versao: va.versao, motivo: "Acima da tabela — renegociar" });
    expect(devolvido.status).toBe(200);
    expect(devolvido.body).toMatchObject({ status: "devolvido", motivoDecisao: "Acima da tabela — renegociar" });

    // O sino de quem pediu conta a devolução.
    const sino = await c.pede.agent.get("/api/honorarios-ceno/pendencias");
    expect(sino.body.devolvidosParaMim).toBe(1);

    const editado = await mutacao(c.pede.agent.patch(`/api/honorarios-ceno/${a.id}`)).send({ versao: devolvido.body.versao, valorPedido: 70_000 });
    expect(editado.status, editado.text).toBe(200);
    await enviar(c, [{ id: a.id, versao: editado.body.versao }]);

    const fila2 = (await c.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`)).body as { id: string; versao: number }[];
    expect(fila2).toHaveLength(2);
    const lote = await mutacao(c.aprova.agent.post("/api/honorarios-ceno/decidir-lote")).send({ acao: "aprovar", itens: fila2.map((x) => ({ id: x.id, versao: x.versao })) });
    expect(lote.status, lote.text).toBe(200);
    expect(lote.body.feitos).toHaveLength(2);

    const h = await lerPedido(c.pede.agent, a.id);
    expect(h.historico.map((x) => x.acao)).toEqual(["aprovado", "enviado", "editado", "devolvido", "enviado", "criado"]);
    expect(h.historico.find((x) => x.acao === "editado")).toMatchObject({ valorAnterior: 80_000, valorNovo: 70_000 });
    expect(h.honorario.valorAprovado).toBe(70_000);
  });

  it("empreita: responsável obrigatório, posição fixa e entra no total do evento", async () => {
    const c = await cenario();
    const sem = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "empreita", valorPedido: 400_000 });
    expect(sem.status).toBe(400);
    const r = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({
      eventId: c.eventoId, tipo: "empreita", nome: "Equipe Horizonte", pessoas: 3, descricao: "R$ 4.000 + R$ 400 de ajuda de custo",
      setor: "montagem", diarias: 4, valorPedido: 440_000,
    });
    expect(r.status, r.text).toBe(201);
    expect(r.body).toMatchObject({ tipo: "empreita", posicao: "empreita", nome: "Equipe Horizonte", pessoas: 3, functionId: null });
    const tela = await c.pede.agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`);
    expect(tela.body.empreitas.map((e: { id: string }) => e.id)).toEqual([r.body.id]);
    // Rascunho de empreita pode ser removido; depois de enviado, não.
    const removido = await mutacao(c.pede.agent.delete(`/api/honorarios-ceno/${r.body.id}`)).send({ versao: r.body.versao });
    expect(removido.status).toBe(200);
  });
});

describe("Honorários da cenotécnica — quem vê e quem decide", () => {
  it("quem não participa recebe 403 nas listas e zeros no sino", async () => {
    const c = await cenario();
    const fora = await agenteLogado("function_area");
    expect((await fora.agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`)).status).toBe(403);
    expect((await fora.agent.get("/api/honorarios-ceno/aprovacao")).status).toBe(403);
    expect((await fora.agent.get("/api/honorarios-ceno/financeiro")).status).toBe(403);
    const acesso = await fora.agent.get("/api/honorarios-ceno/acesso");
    expect(acesso.body).toMatchObject({ podePedir: false, podeAprovar: false, podeLiberar: false });
    const sino = await fora.agent.get("/api/honorarios-ceno/pendencias");
    expect(sino.body).toEqual({ aguardandoMinhaAprovacao: 0, aguardandoPodeDecidir: 0, devolvidosParaMim: 0, aLiberar: 0 });
  });

  it("quem pede não aprova nem libera; o aprovador não libera; o Financeiro não pede — 403 antes de 409", async () => {
    const c = await cenario();
    const p = await criarRascunho(c, c.vagaFreela.id);
    await enviar(c, [{ id: p.id, versao: p.versao }]);
    const { honorario } = await lerPedido(c.pede.agent, p.id);

    expect((await mutacao(c.pede.agent.post(`/api/honorarios-ceno/${p.id}/aprovar`)).send({ versao: honorario.versao })).status).toBe(403);
    const ok = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${p.id}/aprovar`)).send({ versao: honorario.versao });
    expect(ok.status).toBe(200);
    // Já aprovado: quem não decide continua levando 403 (não 409).
    expect((await mutacao(c.pede.agent.post(`/api/honorarios-ceno/${p.id}/aprovar`)).send({ versao: ok.body.versao })).status).toBe(403);
    expect((await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${p.id}/liberacoes`)).send({ versao: ok.body.versao, data: "2099-10-20", oc: "1", valor: 1 })).status).toBe(403);

    const rh = await agenteLogado("financial");
    expect((await mutacao(rh.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "empreita", nome: "Equipe" })).status).toBe(403);

    // Aprovador de OUTRA função de cenotécnica não decide esta.
    const outraFuncao = await criarFuncao({ name: `Sup Ceno ${unico()}` });
    const outro = await criarUsuario("production");
    await ctx.db.insert(ctx.schema.scalingFunctionManagers).values({ functionId: outraFuncao.id, userId: outro.id, role: "aprovador" });
    const outroAgent = await agenteDe(outro);
    const filaOutro = await outroAgent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}&situacao=decididos`);
    expect(filaOutro.status).toBe(200);
    expect(filaOutro.body).toHaveLength(0);
  });

  it("validador de função que NÃO é de cenotécnica não pede honorário", async () => {
    const evento = await criarEvento();
    const funcao = await criarFuncao({ name: `Fotografia ${unico()}` });
    const u = await criarUsuario("production");
    await ctx.db.insert(ctx.schema.scalingFunctionManagers).values({ functionId: funcao.id, userId: u.id, role: "validador" });
    const agent = await agenteDe(u);
    expect((await agent.get(`/api/honorarios-ceno/pedido?eventId=${evento.id}`)).status).toBe(403);
  });

  it("trava de corrida: versão velha → 409 com o estado atual", async () => {
    const c = await cenario();
    const p = await criarRascunho(c, c.vagaFreela.id);
    const ed = await mutacao(c.pede.agent.patch(`/api/honorarios-ceno/${p.id}`)).send({ versao: p.versao, valorPedido: 130_000 });
    expect(ed.status).toBe(200);
    const velha = await mutacao(c.pede.agent.patch(`/api/honorarios-ceno/${p.id}`)).send({ versao: p.versao, valorPedido: 140_000 });
    expect(velha.status).toBe(409);
    expect(velha.body.atual.valorPedido).toBe(130_000);
    // Duas vagas iguais não: a segunda criação da mesma vaga é 409.
    const dup = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "vaga", teamInclusionId: c.vagaFreela.id });
    expect(dup.status).toBe(409);
    // Casa nunca.
    const casa = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "vaga", teamInclusionId: c.vagaCasa.id });
    expect(casa.status).toBe(400);
  });

  it("estorno de liberação: sai da soma, fica no histórico, não estorna duas vezes", async () => {
    const c = await cenario();
    const p = await criarRascunho(c, c.vagaFreela.id, 50_000);
    await enviar(c, [{ id: p.id, versao: p.versao }]);
    const { honorario } = await lerPedido(c.aprova.agent, p.id);
    const ap = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${p.id}/aprovar`)).send({ versao: honorario.versao });
    const rh = await agenteLogado("financial");
    const sino = await rh.agent.get("/api/honorarios-ceno/pendencias");
    expect(sino.body.aLiberar).toBeGreaterThanOrEqual(1);
    const lib = await mutacao(rh.agent.post(`/api/honorarios-ceno/${p.id}/liberacoes`)).send({ versao: ap.body.versao, data: "2099-10-21", oc: "DP-77", valor: 50_000 });
    expect(lib.status).toBe(201);
    expect(lib.body.falta).toBe(0);
    const { liberacoes } = await lerPedido(rh.agent, p.id);
    const estorno = await mutacao(rh.agent.post(`/api/honorarios-ceno/${p.id}/liberacoes/${liberacoes[0].id}/estornar`)).send({ versao: lib.body.versao, motivo: "OC digitada errada" });
    expect(estorno.status, estorno.text).toBe(200);
    expect(estorno.body).toMatchObject({ liberado: 0, falta: 50_000 });
    const deNovo = await mutacao(rh.agent.post(`/api/honorarios-ceno/${p.id}/liberacoes/${liberacoes[0].id}/estornar`)).send({ versao: estorno.body.versao, motivo: "de novo" });
    expect(deNovo.status).toBe(409);
    const h = await lerPedido(rh.agent, p.id);
    expect(h.historico[0]).toMatchObject({ acao: "liberacao_estornada", valorAnterior: 50_000, motivo: "OC digitada errada" });
  });

  it("quem não participa do módulo leva 403 mesmo com id que não existe (sem oráculo de 404)", async () => {
    const c = await cenario();
    const p = await criarRascunho(c, c.vagaFreela.id);
    const fora = await agenteLogado("function_area");
    for (const id of [p.id, "nao-existe"]) {
      expect((await mutacao(fora.agent.patch(`/api/honorarios-ceno/${id}`)).send({ versao: 1 })).status).toBe(403);
      expect((await mutacao(fora.agent.delete(`/api/honorarios-ceno/${id}`)).send({ versao: 1 })).status).toBe(403);
      expect((await mutacao(fora.agent.post(`/api/honorarios-ceno/${id}/aprovar`)).send({ versao: 1 })).status).toBe(403);
      expect((await fora.agent.get(`/api/honorarios-ceno/${id}/historico`)).status).toBe(403);
    }
  });
});

describe("Honorários da cenotécnica — corrida, lote e somas", () => {
  async function aguardando(c: Cenario, vagaId: string, valor: number) {
    const p = await criarRascunho(c, vagaId, valor);
    await enviar(c, [{ id: p.id, versao: p.versao }]);
    return (await lerPedido(c.aprova.agent, p.id)).honorario;
  }

  it("dois aprovadores ao mesmo tempo: só uma decisão vale, a outra leva 409 com o estado atual", async () => {
    const c = await cenario();
    const h = await aguardando(c, c.vagaFreela.id, 100_000);
    const admin = await agenteLogado("admin");
    const [x, y] = await Promise.all([
      mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${h.id}/aprovar`)).send({ versao: h.versao }),
      mutacao(admin.agent.post(`/api/honorarios-ceno/${h.id}/devolver`)).send({ versao: h.versao, motivo: "Rever o valor" }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    const perdeu = x.status === 409 ? x : y;
    expect(perdeu.body.atual.status).toMatch(/aprovado|devolvido/);
    const hist = await lerPedido(c.aprova.agent, h.id);
    expect(hist.historico.filter((e) => e.acao === "aprovado" || e.acao === "devolvido")).toHaveLength(1);
  });

  it("duas liberações simultâneas do que falta: só uma entra e o liberado nunca passa do aprovado", async () => {
    const c = await cenario();
    const h = await aguardando(c, c.vagaFreela.id, 80_000);
    const ap = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${h.id}/aprovar`)).send({ versao: h.versao });
    const rh = await agenteLogado("financial");
    const corpo = (oc: string) => ({ versao: ap.body.versao, data: "2026-10-16", oc, valor: 80_000 });
    const [x, y] = await Promise.all([
      mutacao(rh.agent.post(`/api/honorarios-ceno/${h.id}/liberacoes`)).send(corpo("OC-1")),
      mutacao(rh.agent.post(`/api/honorarios-ceno/${h.id}/liberacoes`)).send(corpo("OC-2")),
    ]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
    const depois = await lerPedido(rh.agent, h.id);
    expect(depois.honorario).toMatchObject({ liberado: 80_000, falta: 0 });
    expect(depois.liberacoes).toHaveLength(1);
    // Mais nada a liberar: 409 (estado), não 400.
    const extra = await mutacao(rh.agent.post(`/api/honorarios-ceno/${h.id}/liberacoes`)).send({ ...corpo("OC-3"), versao: depois.honorario.versao, valor: 1 });
    expect(extra.status).toBe(409);
  });

  it("estorno total reabre a devolução; o novo valor aprovado manda no que falta liberar", async () => {
    const c = await cenario();
    const h = await aguardando(c, c.vagaFreela.id, 100_000);
    const ap = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${h.id}/aprovar`)).send({ versao: h.versao });
    const rh = await agenteLogado("financial");
    const lib = await mutacao(rh.agent.post(`/api/honorarios-ceno/${h.id}/liberacoes`)).send({ versao: ap.body.versao, data: "2026-10-16", oc: "OC-9", valor: 30_000 });
    const { liberacoes } = await lerPedido(rh.agent, h.id);
    const est = await mutacao(rh.agent.post(`/api/honorarios-ceno/${h.id}/liberacoes/${liberacoes[0].id}/estornar`)).send({ versao: lib.body.versao, motivo: "Pago pela verba errada" });
    expect(est.body.liberado).toBe(0);
    const dev = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${h.id}/devolver`)).send({ versao: est.body.versao, motivo: "Fechar em 4 diárias" });
    expect(dev.status, dev.text).toBe(200);
    expect(dev.body).toMatchObject({ status: "devolvido", valorAprovado: null, falta: 0 });
    const ed = await mutacao(c.pede.agent.patch(`/api/honorarios-ceno/${h.id}`)).send({ versao: dev.body.versao, valorPedido: 90_000 });
    await enviar(c, [{ id: h.id, versao: ed.body.versao }]);
    const fila = (await c.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`)).body as { id: string; versao: number }[];
    const aj = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${h.id}/aprovar-com-ajuste`)).send({ versao: fila[0].versao, valor: 85_000, motivo: "Tabela nova" });
    expect(aj.body).toMatchObject({ valorAprovado: 85_000, liberado: 0, falta: 85_000 });
  });

  it("lote parcial: o que já mudou fica de fora com o motivo e o resto é decidido", async () => {
    const c = await cenario();
    const a = await aguardando(c, c.vagaFreela.id, 50_000);
    const b = await aguardando(c, c.vagaViagem.id, 60_000);
    await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${a.id}/aprovar`)).send({ versao: a.versao });
    const lote = await mutacao(c.aprova.agent.post("/api/honorarios-ceno/decidir-lote")).send({ acao: "aprovar", itens: [{ id: a.id, versao: a.versao }, { id: b.id, versao: b.versao }] });
    expect(lote.status).toBe(200);
    expect(lote.body.feitos).toEqual([b.id]);
    expect(lote.body.recusados).toEqual([expect.objectContaining({ id: a.id, motivo: expect.stringMatching(/Aprovado/) })]);
  });

  it("as somas batem: lista de eventos de quem pede × Financeiro × relatório; devolvido e rascunho fora", async () => {
    const { somar, totalPorEvento } = await import("@shared/honorarios-ceno");
    const c = await cenario();
    const a = await aguardando(c, c.vagaFreela.id, 100_050);           // vai ser aprovado com ajuste
    const b = await aguardando(c, c.vagaViagem.id, 70_000);            // vai ser devolvido
    const emp = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "empreita", nome: "Equipe Sul", setor: "montagem", diarias: 2, valorPedido: 33_333 });
    await enviar(c, [{ id: emp.body.id, versao: emp.body.versao }]); // fica aguardando
    await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "empreita", nome: "Rascunho", valorPedido: 999_999 });
    const aj = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${a.id}/aprovar-com-ajuste`)).send({ versao: a.versao, valor: 90_001, motivo: "Ajuste" });
    await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${b.id}/devolver`)).send({ versao: b.versao, motivo: "Rever" });
    const rh = await agenteLogado("financial");
    await mutacao(rh.agent.post(`/api/honorarios-ceno/${a.id}/liberacoes`)).send({ versao: aj.body.versao, data: "2026-10-16", oc: "1", valor: 45_000 });

    const fin = (await rh.agent.get(`/api/honorarios-ceno/financeiro?eventId=${c.eventoId}`)).body;
    const t = somar(fin);
    expect(t).toMatchObject({ linhas: 2, pedido: 133_383, aguardando: 33_333, aprovado: 90_001, liberado: 45_000, aLiberar: 45_001, emNegociacao: 1 });
    const [grupo] = totalPorEvento(fin);
    expect(grupo).toMatchObject({ pedido: t.pedido, aprovado: t.aprovado, liberado: t.liberado, aLiberar: t.aLiberar });
    const eventos = (await c.pede.agent.get("/api/honorarios-ceno/eventos")).body as { id: string; totalPedido: number; totalAprovado: number }[];
    expect(eventos.find((e) => e.id === c.eventoId)).toMatchObject({ totalPedido: t.pedido, totalAprovado: t.aprovado });
  });

  it("ver como usuário: lê como o simulado e não grava nada", async () => {
    const c = await cenario();
    const admin = await agenteLogado("admin");
    const ini = await mutacao(admin.agent.post("/api/simulation/start")).send({ userId: c.pede.user.id });
    expect(ini.status, ini.text).toBe(200);
    const acesso = await admin.agent.get("/api/honorarios-ceno/acesso");
    expect(acesso.body).toMatchObject({ podePedir: true, podeAprovar: false, podeLiberar: false, admin: false });
    const criar = await mutacao(admin.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "empreita", nome: "Equipe" });
    expect(criar.status).toBe(403);
    await mutacao(admin.agent.post("/api/simulation/stop")).send({});
  });
});

describe("Honorários da cenotécnica — a vaga muda depois do pedido", () => {
  const trocarColaborador = async (vagaId: string, colaboradorId: string) =>
    ctx.db.update(ctx.schema.teamInclusions).set({ collaboratorId: colaboradorId }).where(eq(ctx.schema.teamInclusions.id, vagaId));

  it("troca de colaborador: avisa nas três telas, não envia com o nome antigo e atualiza ao confirmar", async () => {
    const c = await cenario();
    const p = await criarRascunho(c, c.vagaFreela.id, 100_000);
    const substituto = await criarColaborador({ fullName: `Substituto ${unico()}` });
    await trocarColaborador(c.vagaFreela.id, substituto.id);

    const tela = await c.pede.agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`);
    const linha = tela.body.linhas.find((l: { vaga: { id: string } | null }) => l.vaga?.id === c.vagaFreela.id);
    expect(linha.honorario).toMatchObject({ avisoDaVaga: "colaborador_trocado", colaboradorAtual: substituto.fullName });

    // Enviar com o nome antigo não passa: o valor foi negociado com outra pessoa.
    const env = await mutacao(c.pede.agent.post("/api/honorarios-ceno/enviar")).send({ itens: [{ id: p.id, versao: linha.honorario.versao }] });
    expect(env.status).toBe(409);
    expect(env.body.recusados[0].motivo).toMatch(/trocou de colaborador/);

    // Confirmar (PATCH sem campos) passa o pedido para quem está na vaga, com histórico.
    const conf = await mutacao(c.pede.agent.patch(`/api/honorarios-ceno/${p.id}`)).send({ versao: linha.honorario.versao });
    expect(conf.status, conf.text).toBe(200);
    expect(conf.body).toMatchObject({ nome: substituto.fullName, collaboratorId: substituto.id, avisoDaVaga: null });
    await enviar(c, [{ id: p.id, versao: conf.body.versao }]);
    const h = await lerPedido(c.pede.agent, p.id);
    expect(h.historico.map((x) => x.acao)).toContain("colaborador_trocado");

    // Trocou de novo com o pedido no aprovador: ele vê o aviso (e quem recebe hoje).
    const outro = await criarColaborador({ fullName: `Outro ${unico()}` });
    await trocarColaborador(c.vagaFreela.id, outro.id);
    const fila = await c.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`);
    expect(fila.body[0]).toMatchObject({ avisoDaVaga: "colaborador_trocado", colaboradorAtual: outro.fullName, nome: substituto.fullName });
  });

  it("vaga cancelada, excluída, da casa ou de outra função: não envia, não edita e não fica no sino", async () => {
    const c = await cenario();
    const ti = ctx.schema.teamInclusions;
    const a = await criarRascunho(c, c.vagaFreela.id, 100_000);
    const b = await criarRascunho(c, c.vagaViagem.id, 90_000);
    await ctx.db.update(ti).set({ status: "cancelado" }).where(eq(ti.id, c.vagaFreela.id));
    await ctx.db.update(ti).set({ deletedAt: new Date() }).where(eq(ti.id, c.vagaViagem.id));

    const tela = await c.pede.agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`);
    const fora = tela.body.linhas.filter((l: { foraDaEscala: boolean }) => l.foraDaEscala);
    expect(fora).toHaveLength(2);
    const porId = new Map(fora.map((l: { honorario: { id: string } }) => [l.honorario.id, l.honorario]));
    expect(porId.get(a.id)).toMatchObject({ avisoDaVaga: "fora_da_escala", podeEditar: false, podeRemover: true });
    expect(porId.get(b.id)).toMatchObject({ avisoDaVaga: "excluida", podeEditar: false });

    const env = await mutacao(c.pede.agent.post("/api/honorarios-ceno/enviar")).send({ itens: [{ id: a.id, versao: a.versao }, { id: b.id, versao: b.versao }] });
    expect(env.status).toBe(409);
    expect(env.body.enviados).toEqual([]);
    const ed = await mutacao(c.pede.agent.patch(`/api/honorarios-ceno/${a.id}`)).send({ versao: a.versao, valorPedido: 1 });
    expect(ed.status).toBe(409);

    // Já no aprovador quando a vaga sai: ele vê o aviso; devolvido parado não fica no sino de quem pede.
    const c2 = await cenario();
    const p = await criarRascunho(c2, c2.vagaFreela.id, 100_000);
    await enviar(c2, [{ id: p.id, versao: p.versao }]);
    await ctx.db.update(ti).set({ functionId: (await criarFuncao({ name: `Fotografia ${unico()}` })).id }).where(eq(ti.id, c2.vagaFreela.id));
    const fila = await c2.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c2.eventoId}`);
    expect(fila.body[0]).toMatchObject({ id: p.id, avisoDaVaga: "outra_funcao" });
    const dev = await mutacao(c2.aprova.agent.post(`/api/honorarios-ceno/${p.id}/devolver`)).send({ versao: fila.body[0].versao, motivo: "Vaga saiu da cenotécnica" });
    expect(dev.status).toBe(200);
    const sino = await c2.pede.agent.get("/api/honorarios-ceno/pendencias");
    expect(sino.body.devolvidosParaMim).toBe(0);
  });

  it("evento excluído: o pedido não segue para o aprovador e aparece marcado para quem decide", async () => {
    const c = await cenario();
    const a = await criarRascunho(c, c.vagaFreela.id, 100_000);
    const b = await criarRascunho(c, c.vagaViagem.id, 90_000);
    await enviar(c, [{ id: b.id, versao: b.versao }]);
    await ctx.db.update(ctx.schema.events).set({ status: "excluído" }).where(eq(ctx.schema.events.id, c.eventoId));
    const env = await mutacao(c.pede.agent.post("/api/honorarios-ceno/enviar")).send({ itens: [{ id: a.id, versao: a.versao }] });
    expect(env.status).toBe(409);
    expect(env.body.recusados[0].motivo).toMatch(/evento foi excluído/);
    const fila = await c.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`);
    expect(fila.body[0]).toMatchObject({ id: b.id, eventoExcluido: true });
  });

  it("vaga trocada para colaborador da casa sai da lista e não envia", async () => {
    const c = await cenario();
    const p = await criarRascunho(c, c.vagaFreela.id, 100_000);
    const vagaCasa = await ctx.storage.getTeamInclusion(c.vagaCasa.id);
    await trocarColaborador(c.vagaFreela.id, vagaCasa!.collaboratorId!);
    const tela = await c.pede.agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`);
    const linha = tela.body.linhas.find((l: { honorario: { id: string } | null }) => l.honorario?.id === p.id);
    expect(linha).toMatchObject({ foraDaEscala: true, honorario: { avisoDaVaga: "casa" } });
    const env = await mutacao(c.pede.agent.post("/api/honorarios-ceno/enviar")).send({ itens: [{ id: p.id, versao: p.versao }] });
    expect(env.status).toBe(409);
  });
});
