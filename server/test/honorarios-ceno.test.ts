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
  /** Vaga ABERTA (planejada, sem colaborador) — desde 20/10 também pede. */
  vagaAberta: { id: string; inclusionNumber: number };
  funcaoNome: string;
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
  // Vaga ABERTA (planejada, sem ninguém): desde 20/10 entra ("não precisa escalar").
  const vagaAberta = await criarVaga({ ...base, status: "planejado", phase: "inclusao", collaboratorId: null });
  return {
    eventoId: evento.id, funcaoId: funcao.id, funcaoNome: funcao.name, vagaFreela, vagaCasa, vagaViagem, vagaAberta,
    pede: { agent: await agenteDe(quemPede), user: quemPede },
    aprova: { agent: await agenteDe(quemAprova), user: quemAprova },
  };
}

/** Rascunho com "Outro valor" (o valor digitado vale); o tipo de tabela tem teste próprio. */
async function criarRascunho(c: Cenario, vagaId: string, valorPedido = 120_000) {
  const r = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({
    eventId: c.eventoId, tipo: "vaga", teamInclusionId: vagaId, tipoFreela: "outro", valorPedido, observacao: "Negociado à parte",
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

    // Quem pede vê as vagas freela, escaladas ou abertas; a da casa vai para a nota de rodapé.
    const tela = await c.pede.agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`);
    expect(tela.status).toBe(200);
    const ids = tela.body.linhas.map((l: { vaga: { id: string } }) => l.vaga.id).sort();
    expect(ids).toEqual([c.vagaFreela.id, c.vagaViagem.id, c.vagaAberta.id].sort());
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
    // 30/10: quem lança acompanha a Aprovação de honorários, sem decidir.
    const filaDeQuemPede = await c.pede.agent.get("/api/honorarios-ceno/aprovacao");
    expect(filaDeQuemPede.status).toBe(200);
    expect(filaDeQuemPede.body.map((h: { id: string }) => h.id)).toContain(p.id);
    expect(filaDeQuemPede.body.find((h: { id: string }) => h.id === p.id)).toMatchObject({ podeDecidir: false, podeDevolver: false });
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

// ── 20/10: vaga aberta, tipo de freela e empreita que agrupa vagas ──────────

describe("Honorários da cenotécnica — vaga ABERTA (dono: \"não precisa escalar\")", () => {
  const escalar = async (vagaId: string, colaboradorId: string) =>
    ctx.db.update(ctx.schema.teamInclusions).set({ collaboratorId: colaboradorId, status: "escalado", phase: "escalacao" }).where(eq(ctx.schema.teamInclusions.id, vagaId));

  it("vaga sem colaborador pede e envia; a linha se chama \"Vaga #N sem nome · função\"", async () => {
    const c = await cenario();
    const tela = await c.pede.agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`);
    const linha = tela.body.linhas.find((l: { vaga: { id: string } | null }) => l.vaga?.id === c.vagaAberta.id);
    expect(linha.sugestao).toMatchObject({ nome: `Vaga #${c.vagaAberta.inclusionNumber} sem nome · ${c.funcaoNome}`, semColaborador: true });
    expect(linha.tabela.dias).toBe(3);

    const p = await criarRascunho(c, c.vagaAberta.id, 95_000);
    expect(p).toMatchObject({ nome: `Vaga #${c.vagaAberta.inclusionNumber} sem nome · ${c.funcaoNome}`, collaboratorId: null, semColaborador: true, avisoDaVaga: null, podeEditar: true });
    const env = await enviar(c, [{ id: p.id, versao: p.versao }]);
    expect(env.enviados).toEqual([p.id]);
    const fila = await c.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`);
    expect(fila.body[0]).toMatchObject({ id: p.id, semColaborador: true, nome: expect.stringMatching(/^Vaga #\d+ sem nome/) });
  });

  it("escalar um FREELA depois: o pedido passa a mostrar o nome, sem aviso de troca e sem travar o envio", async () => {
    const c = await cenario();
    const p = await criarRascunho(c, c.vagaAberta.id, 95_000);
    const freela = await criarColaborador({ fullName: `Escalado Depois ${unico()}` });
    await escalar(c.vagaAberta.id, freela.id);

    const tela = await c.pede.agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`);
    const linha = tela.body.linhas.find((l: { honorario: { id: string } | null }) => l.honorario?.id === p.id);
    expect(linha.honorario).toMatchObject({ nome: freela.fullName, collaboratorId: freela.id, avisoDaVaga: null, semColaborador: false, podeEditar: true });
    // Não é troca: a versão não muda (quem estava com a tela aberta envia normalmente).
    expect(linha.honorario.versao).toBe(p.versao);
    const env = await enviar(c, [{ id: p.id, versao: p.versao }]);
    expect(env.enviados).toEqual([p.id]);
    const h = await lerPedido(c.pede.agent, p.id);
    expect(h.historico.map((x) => x.acao)).toContain("colaborador_escalado");

    // Depois disso, trocar a pessoa volta a ser troca (aviso + "Passar o pedido").
    const outro = await criarColaborador({ fullName: `Outro ${unico()}` });
    await escalar(c.vagaAberta.id, outro.id);
    const fila = await c.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`);
    expect(fila.body[0]).toMatchObject({ avisoDaVaga: "colaborador_trocado", colaboradorAtual: outro.fullName, nome: freela.fullName });
  });

  it("escalar um funcionário da CASA depois: o pedido para, com o aviso, e não envia", async () => {
    const c = await cenario();
    const p = await criarRascunho(c, c.vagaAberta.id, 95_000);
    const casa = (await ctx.storage.getTeamInclusion(c.vagaCasa.id))!.collaboratorId!;
    await escalar(c.vagaAberta.id, casa);
    const tela = await c.pede.agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`);
    const linha = tela.body.linhas.find((l: { honorario: { id: string } | null }) => l.honorario?.id === p.id);
    expect(linha).toMatchObject({ foraDaEscala: true, honorario: { avisoDaVaga: "casa", podeEditar: false, collaboratorId: null } });
    const env = await mutacao(c.pede.agent.post("/api/honorarios-ceno/enviar")).send({ itens: [{ id: p.id, versao: p.versao }] });
    expect(env.status).toBe(409);
    expect(env.body.recusados[0].motivo).toMatch(/funcionário da casa/);
  });

  it("vaga cancelada continua fora: não pede", async () => {
    const c = await cenario();
    await ctx.db.update(ctx.schema.teamInclusions).set({ status: "cancelado", phase: "cancelado" }).where(eq(ctx.schema.teamInclusions.id, c.vagaAberta.id));
    const r = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "vaga", teamInclusionId: c.vagaAberta.id, tipoFreela: "outro", valorPedido: 1 });
    expect(r.status).toBe(404);
  });
});

describe("Honorários da cenotécnica — tipo de freela (tabela) ou outro valor", () => {
  it("tipo de tabela: o valor é o da tabela pelos dias da vaga (a tela não manda valor); posição e setor saem do tipo e da função", async () => {
    const c = await cenario();
    const { cenoEmpreitaTotalCents } = await import("@shared/cenotecnica-empreita");
    const esperado = cenoEmpreitaTotalCents("local_a", 3)!.totalCents;
    const r = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "vaga", teamInclusionId: c.vagaViagem.id, tipoFreela: "local_a", valorPedido: 1 });
    expect(r.status, r.text).toBe(201);
    expect(r.body).toMatchObject({ tipoFreela: "local_a", valorPedido: esperado, posicao: "freela_local", setor: "montagem", diarias: 3, inicio: "2099-10-10", fim: "2099-10-12" });

    // Trocar para Freela Viagem recalcula; para "Outro valor" o digitado vale.
    const viagem = await mutacao(c.pede.agent.patch(`/api/honorarios-ceno/${r.body.id}`)).send({ versao: r.body.versao, tipoFreela: "viagem" });
    expect(viagem.body).toMatchObject({ tipoFreela: "viagem", valorPedido: cenoEmpreitaTotalCents("viagem", 3)!.totalCents, posicao: "freela_viagem" });
    const outro = await mutacao(c.pede.agent.patch(`/api/honorarios-ceno/${r.body.id}`)).send({ versao: viagem.body.versao, tipoFreela: "outro", valorPedido: 150_000, observacao: "Montagem noturna" });
    expect(outro.body).toMatchObject({ tipoFreela: "outro", valorPedido: 150_000, observacao: "Montagem noturna" });

    // Sem tipo não envia; tipo inválido é 400.
    const semTipo = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "vaga", teamInclusionId: c.vagaFreela.id, valorPedido: 10_000 });
    const env = await mutacao(c.pede.agent.post("/api/honorarios-ceno/enviar")).send({ itens: [{ id: semTipo.body.id, versao: semTipo.body.versao }] });
    expect(env.status).toBe(409);
    expect(env.body.recusados[0].motivo).toMatch(/tipo de freela/);
    const invalido = await mutacao(c.pede.agent.patch(`/api/honorarios-ceno/${semTipo.body.id}`)).send({ versao: semTipo.body.versao, tipoFreela: "casa" });
    expect(invalido.status).toBe(400);
  });

  it("o período da vaga mudou depois do rascunho: o envio leva o valor da tabela de hoje", async () => {
    const c = await cenario();
    const { cenoEmpreitaTotalCents } = await import("@shared/cenotecnica-empreita");
    const r = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "vaga", teamInclusionId: c.vagaFreela.id, tipoFreela: "sp" });
    expect(r.body.valorPedido).toBe(cenoEmpreitaTotalCents("sp", 3)!.totalCents);
    await ctx.db.update(ctx.schema.teamInclusions).set({ scheduleEndDate: "2099-10-14" }).where(eq(ctx.schema.teamInclusions.id, c.vagaFreela.id));
    await enviar(c, [{ id: r.body.id, versao: r.body.versao }]);
    const fila = await c.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`);
    expect(fila.body[0]).toMatchObject({ status: "aguardando", valorPedido: cenoEmpreitaTotalCents("sp", 5)!.totalCents, diarias: 5 });
  });
});

describe("Honorários da cenotécnica — empreita que agrupa vagas", () => {
  async function criarEmpreita(c: Cenario, vagaIds: string[], extra: Record<string, unknown> = {}) {
    return mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "empreita", nome: "Equipe Horizonte", valorPedido: 400_000, vagaIds, ...extra });
  }

  it("criar com 2 vagas (aberta e escalada): elas saem das linhas próprias e o nº de pessoas segue as vagas", async () => {
    const c = await cenario();
    const r = await criarEmpreita(c, [c.vagaAberta.id, c.vagaFreela.id]);
    expect(r.status, r.text).toBe(201);
    expect(r.body).toMatchObject({ tipo: "empreita", posicao: "empreita", pessoas: 2, setor: "montagem" });
    expect(r.body.vagasDaEmpreita.map((v: { id: string }) => v.id).sort()).toEqual([c.vagaAberta.id, c.vagaFreela.id].sort());

    const tela = await c.pede.agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`);
    const ids = tela.body.linhas.map((l: { vaga: { id: string } | null }) => l.vaga?.id);
    expect(ids).not.toContain(c.vagaAberta.id);
    expect(ids).not.toContain(c.vagaFreela.id);
    const naLista = tela.body.vagasDoEvento.find((v: { id: string }) => v.id === c.vagaFreela.id);
    expect(naLista.empreita).toMatchObject({ id: r.body.id, nome: "Equipe Horizonte" });

    // A vaga da empreita não tem pedido próprio; nem entra em outra empreita.
    const proprio = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "vaga", teamInclusionId: c.vagaFreela.id, tipoFreela: "outro", valorPedido: 1 });
    expect(proprio.status).toBe(409);
    expect(proprio.body.message).toMatch(/empreita Equipe Horizonte/);
    const outra = await criarEmpreita(c, [c.vagaFreela.id], { nome: "Equipe Norte" });
    expect(outra.status).toBe(409);
    expect(outra.body.message).toMatch(/já está na empreita/);
  });

  it("vaga com rascunho próprio: pede confirmação e, confirmado, descarta o rascunho; enviado bloqueia", async () => {
    const c = await cenario();
    const rasc = await criarRascunho(c, c.vagaFreela.id, 50_000);
    const enviado = await criarRascunho(c, c.vagaViagem.id, 60_000);
    await enviar(c, [{ id: enviado.id, versao: enviado.versao }]);

    const bloqueada = await criarEmpreita(c, [c.vagaViagem.id]);
    expect(bloqueada.status).toBe(409);
    expect(bloqueada.body.message).toMatch(/peça para o aprovador devolver/);

    const semConfirmar = await criarEmpreita(c, [c.vagaFreela.id]);
    expect(semConfirmar.status).toBe(409);
    expect(semConfirmar.body.precisaConfirmar).toEqual([expect.objectContaining({ id: rasc.id, status: "rascunho" })]);

    const ok = await criarEmpreita(c, [c.vagaFreela.id], { descartarRascunhos: true });
    expect(ok.status, ok.text).toBe(201);
    expect((await c.pede.agent.get(`/api/honorarios-ceno/${rasc.id}/historico`)).status).toBe(404);
    const h = await lerPedido(c.pede.agent, ok.body.id);
    expect(h.historico.map((x) => x.acao)).toContain("pedido_individual_descartado");
  });

  it("tirar uma vaga da empreita (PATCH com a lista) devolve a vaga às linhas próprias", async () => {
    const c = await cenario();
    const r = await criarEmpreita(c, [c.vagaAberta.id, c.vagaFreela.id]);
    const ed = await mutacao(c.pede.agent.patch(`/api/honorarios-ceno/${r.body.id}`)).send({ versao: r.body.versao, vagaIds: [c.vagaAberta.id] });
    expect(ed.status, ed.text).toBe(200);
    expect(ed.body).toMatchObject({ pessoas: 1 });
    expect(ed.body.vagasDaEmpreita.map((v: { id: string }) => v.id)).toEqual([c.vagaAberta.id]);
    const tela = await c.pede.agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`);
    expect(tela.body.linhas.map((l: { vaga: { id: string } | null }) => l.vaga?.id)).toContain(c.vagaFreela.id);
  });

  it("vaga da empreita cancelada depois: aviso na empreita e o envio fica preso até tirá-la", async () => {
    const c = await cenario();
    const r = await criarEmpreita(c, [c.vagaAberta.id, c.vagaFreela.id]);
    await ctx.db.update(ctx.schema.teamInclusions).set({ status: "cancelado", phase: "cancelado" }).where(eq(ctx.schema.teamInclusions.id, c.vagaFreela.id));
    const tela = await c.pede.agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`);
    const emp = tela.body.empreitas[0];
    expect(emp.avisosDaEmpreita).toEqual([expect.stringMatching(/cancelada na escala/)]);
    const env = await mutacao(c.pede.agent.post("/api/honorarios-ceno/enviar")).send({ itens: [{ id: r.body.id, versao: emp.versao }] });
    expect(env.status).toBe(409);
    expect(env.body.recusados[0].motivo).toMatch(/tire-a da empreita/);
    const ed = await mutacao(c.pede.agent.patch(`/api/honorarios-ceno/${r.body.id}`)).send({ versao: emp.versao, vagaIds: [c.vagaAberta.id] });
    expect(ed.status, ed.text).toBe(200);
    expect(ed.body.avisosDaEmpreita).toEqual([]);
    await enviar(c, [{ id: r.body.id, versao: ed.body.versao }]);
  });

  it("aprovar → liberar: a empreita é UM pedido com as vagas dela e conta uma vez no relatório", async () => {
    const { totalPorEvento } = await import("@shared/honorarios-ceno");
    const c = await cenario();
    const r = await criarEmpreita(c, [c.vagaAberta.id, c.vagaFreela.id]);
    await enviar(c, [{ id: r.body.id, versao: r.body.versao }]);
    const fila = await c.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`);
    expect(fila.body).toHaveLength(1);
    expect(fila.body[0].vagasDaEmpreita).toHaveLength(2);
    const ap = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${r.body.id}/aprovar`)).send({ versao: fila.body[0].versao });
    expect(ap.status).toBe(200);
    const rh = await agenteLogado("financial");
    const lib = await mutacao(rh.agent.post(`/api/honorarios-ceno/${r.body.id}/liberacoes`)).send({ versao: ap.body.versao, data: "2099-10-20", oc: "OC-EMP", valor: 400_000 });
    expect(lib.status, lib.text).toBe(201);
    const fin = (await rh.agent.get(`/api/honorarios-ceno/financeiro?eventId=${c.eventoId}`)).body;
    expect(fin).toHaveLength(1);
    expect(fin[0].vagasDaEmpreita).toHaveLength(2);
    expect(totalPorEvento(fin)[0]).toMatchObject({ linhas: 1, aprovado: 400_000, liberado: 400_000 });
    // Empreita enviada não muda de vagas.
    const ed = await mutacao(c.pede.agent.patch(`/api/honorarios-ceno/${r.body.id}`)).send({ versao: lib.body.versao, vagaIds: [] });
    expect(ed.status).toBe(409);
  });
});

// ── No Planejado (21/10): "a aprovação do honorário tem que afetar o planejado" ──
describe("Honorários da cenotécnica — no Planejado (21/10)", () => {
  type ParaPlanejado = import("@shared/honorarios-ceno").HonorarioParaPlanejado;
  const lerNoPlanejado = async (agent: TestAgent, eventoId: string) => {
    const r = await agent.get(`/api/budget-planned/honorarios?eventId=${eventoId}`);
    expect(r.status, r.text).toBe(200);
    return r.body as ParaPlanejado[];
  };

  it("só quem vê o Planejado lê; o aguardando não muda nada e o aprovado c/ ajuste vira a mão de obra (tela e Atualizar padrões)", async () => {
    const { honorariosNasVagas } = await import("@shared/honorarios-ceno");
    const { calcularPlanejadoDaVaga, linhaDoPlanejado } = await import("@shared/budget-engine");
    const c = await cenario();
    const rascunho = await criarRascunho(c, c.vagaFreela.id, 120_000);
    await enviar(c, [{ id: rascunho.id, versao: rascunho.versao }]);

    // Mesma permissão do Planejado: Produção (quem pede/aprova) não lê; sem evento → 400.
    expect((await c.pede.agent.get(`/api/budget-planned/honorarios?eventId=${c.eventoId}`)).status).toBe(403);
    const rh = await agenteLogado("financial");
    expect((await rh.agent.get("/api/budget-planned/honorarios")).status).toBe(400);

    const aguardando = honorariosNasVagas(await lerNoPlanejado(rh.agent, c.eventoId)).get(c.vagaFreela.id);
    expect(aguardando).toMatchObject({ situacao: "pendente", status: "aguardando", valorCents: 120_000 });

    const fila = await c.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`);
    const ajuste = await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${rascunho.id}/aprovar-com-ajuste`))
      .send({ versao: fila.body[0].versao, valor: 100_000, motivo: "Fechado em R$ 1.000" });
    expect(ajuste.status, ajuste.text).toBe(200);
    const lidos = await lerNoPlanejado(rh.agent, c.eventoId);
    const aprovado = honorariosNasVagas(lidos).get(c.vagaFreela.id);
    expect(aprovado).toMatchObject({ situacao: "aprovado", status: "aprovado_ajuste", valorCents: 100_000, aprovadoPor: c.aprova.user.name });
    expect(aprovado?.aprovadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // "Atualizar padrões" grava o aprovado como a mão de obra (mesmo motor da tela).
    const vaga = (await ctx.storage.getTeamInclusion(c.vagaFreela.id))!;
    const planejado = await ctx.storage.createBudgetPlanned({ eventId: c.eventoId, collaboratorId: vaga.collaboratorId, functionId: vaga.functionId, collaboratorType: "freela", totalValue: 0 } as any);
    const admin = await agenteLogado("admin");
    const ap = await mutacao(admin.agent.post("/api/budget-planned/apply-defaults")).send({ eventId: c.eventoId });
    expect(ap.status, ap.text).toBe(200);
    const cfg: Record<string, number> = {};
    for (const st of await ctx.storage.getSystemSettings()) { const v = parseInt(st.value, 10); if (Number.isFinite(v)) cfg[st.key] = v; }
    const resultado = calcularPlanejadoDaVaga({
      vaga, functionName: c.funcaoNome, collaboratorType: "freela", functionValue: null, settings: cfg, eventLocation: "São Paulo - SP", ticket: null, honorario: aprovado,
    });
    expect(resultado.subtotalDiarias).toBe(100_000);
    const gravado = (await ctx.storage.getBudgetPlanned(c.eventoId)).find((p) => p.id === planejado.id)!;
    expect(gravado.totalValue).toBe(linhaDoPlanejado(resultado).totalValue);

    // E nada disso mexe na escala.
    expect((await ctx.storage.getTeamInclusion(c.vagaFreela.id))?.updatedAt).toEqual(vaga.updatedAt);
  });

  it("empreita aprovada com 3 vagas: rateio com os centavos na primeira; a vaga cancelada sai e o rateio refaz", async () => {
    const { honorariosNasVagas } = await import("@shared/honorarios-ceno");
    const c = await cenario();
    const vagas = [c.vagaAberta.id, c.vagaFreela.id, c.vagaViagem.id];
    const r = await mutacao(c.pede.agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "empreita", nome: "Equipe Rateio", valorPedido: 100_000, vagaIds: vagas });
    expect(r.status, r.text).toBe(201);
    await enviar(c, [{ id: r.body.id, versao: r.body.versao }]);
    const fila = await c.aprova.agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`);
    expect((await mutacao(c.aprova.agent.post(`/api/honorarios-ceno/${r.body.id}/aprovar`)).send({ versao: fila.body[0].versao })).status).toBe(200);

    const rh = await agenteLogado("financial");
    const porVaga = honorariosNasVagas(await lerNoPlanejado(rh.agent, c.eventoId));
    const numeros = await Promise.all(vagas.map(async (id) => ({ id, n: (await ctx.storage.getTeamInclusion(id))!.inclusionNumber })));
    const [primeira, ...demais] = numeros.sort((a, b) => a.n - b.n);
    expect(porVaga.get(primeira.id)).toMatchObject({ tipo: "empreita", valorCents: 33_334, empreita: { totalCents: 100_000, vagas: 3, primeira: true } });
    for (const v of demais) expect(porVaga.get(v.id)?.valorCents).toBe(33_333);

    // A vaga cancelada depois sai do rateio: as duas que ficam dividem o aprovado.
    await ctx.db.update(ctx.schema.teamInclusions).set({ status: "cancelado", phase: "cancelado" }).where(eq(ctx.schema.teamInclusions.id, demais[0].id));
    const depois = honorariosNasVagas(await lerNoPlanejado(rh.agent, c.eventoId));
    expect(depois.has(demais[0].id)).toBe(false);
    expect(depois.get(primeira.id)?.valorCents).toBe(50_000);
    expect(depois.get(demais[1].id)?.valorCents).toBe(50_000);
  });

  it("pedido de vaga cancelada não entra no Planejado", async () => {
    const { honorariosNasVagas } = await import("@shared/honorarios-ceno");
    const c = await cenario();
    const p = await criarRascunho(c, c.vagaViagem.id, 90_000);
    await enviar(c, [{ id: p.id, versao: p.versao }]);
    await ctx.db.update(ctx.schema.teamInclusions).set({ status: "cancelado", phase: "cancelado" }).where(eq(ctx.schema.teamInclusions.id, c.vagaViagem.id));
    const rh = await agenteLogado("financial");
    const lidos = await lerNoPlanejado(rh.agent, c.eventoId);
    expect(lidos.find((h) => h.id === p.id)?.avisoDaVaga).toBe("fora_da_escala");
    expect(honorariosNasVagas(lidos).has(c.vagaViagem.id)).toBe(false);
  });
});
