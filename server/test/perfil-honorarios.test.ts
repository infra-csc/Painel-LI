/**
 * Perfil "Honorários (liberação)" (23/10) — rotas sobre o PGlite.
 *
 * Pedido do dono: uma pessoa que só "libera a verba e extrai relatório" nos
 * Honorários da cenotécnica. Cobre:
 *  - o que ela faz: lista do Financeiro (base dos relatórios e do CSV),
 *    liberar (parcial), estornar, histórico e o sino "a liberar";
 *  - o que ela NÃO faz: lançar, enviar ou aprovar honorário (nem com cadastro
 *    de validador/aprovador numa função de cenotécnica) e qualquer outra rota
 *    do app — inclusive as que qualquer logado lê;
 *  - como o papel chega: Portal Norte ("Honorários (liberação)" no SSO e na
 *    API de usuários; a chave `honorarios` gravada direto) e Cadastro de usuários;
 *  - o "Ver como usuário" do admin enxerga o mesmo recorte.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, criarUsuario, criarVaga, logarComo, mutacao, tokenDoPortal, unico,
  type Contexto, type TestAgent,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

async function agenteDe(user: { email: string; name?: string }): Promise<TestAgent> {
  const agent = request.agent(ctx.app);
  await logarComo(agent, user);
  return agent;
}

/** Pedido de honorário APROVADO (R$ 1.200,00) num evento novo, pronto para liberar. */
async function aprovado() {
  const evento = await criarEvento({ name: `Night Run ${unico()}` });
  const funcao = await criarFuncao({ name: `Cenotécnica ${unico()}` });
  const quemPede = await criarUsuario("production");
  const quemAprova = await criarUsuario("production");
  await ctx.db.insert(ctx.schema.scalingFunctionManagers).values([
    { functionId: funcao.id, userId: quemPede.id, role: "validador" },
    { functionId: funcao.id, userId: quemAprova.id, role: "aprovador" },
  ]);
  const freela = await criarColaborador({ fullName: `Freela ${unico()}` });
  const vaga = await criarVaga({ userId: quemPede.id, eventId: evento.id, functionId: funcao.id, status: "escalado", phase: "escalacao", collaboratorId: freela.id, needsTicket: false });
  const pede = await agenteDe(quemPede);
  const aprova = await agenteDe(quemAprova);
  const r = await mutacao(pede.post("/api/honorarios-ceno")).send({ eventId: evento.id, tipo: "vaga", teamInclusionId: vaga.id, tipoFreela: "outro", valorPedido: 120_000, observacao: "Negociado" });
  expect(r.status, r.text).toBe(201);
  const env = await mutacao(pede.post("/api/honorarios-ceno/enviar")).send({ itens: [{ id: r.body.id, versao: r.body.versao }] });
  expect(env.status, env.text).toBe(200);
  const fila = await aprova.get(`/api/honorarios-ceno/aprovacao?eventId=${evento.id}`);
  const ok = await mutacao(aprova.post(`/api/honorarios-ceno/${r.body.id}/aprovar`)).send({ versao: fila.body[0].versao });
  expect(ok.status, ok.text).toBe(200);
  return { eventoId: evento.id, funcaoId: funcao.id, vagaId: vaga.id, honorario: ok.body as { id: string; versao: number } };
}

describe("Perfil Honorários — libera a verba e extrai os relatórios", () => {
  it("vê a lista do Financeiro, libera parcial, estorna, lê o histórico e recebe o sino", async () => {
    const c = await aprovado();
    const hon = await agenteLogado("honorarios");

    const acesso = await hon.agent.get("/api/honorarios-ceno/acesso");
    expect(acesso.status).toBe(200);
    expect(acesso.body).toMatchObject({ podePedir: false, podeAprovar: false, podeLiberar: true, admin: false });

    const sino = await hon.agent.get("/api/honorarios-ceno/pendencias");
    expect(sino.status).toBe(200);
    expect(sino.body.aLiberar).toBeGreaterThanOrEqual(1);
    expect(sino.body).toMatchObject({ aguardandoMinhaAprovacao: 0, devolvidosParaMim: 0 });

    // A lista do Financeiro é a base dos relatórios e do CSV (montados na tela).
    const fin = await hon.agent.get(`/api/honorarios-ceno/financeiro?eventId=${c.eventoId}`);
    expect(fin.status).toBe(200);
    expect(fin.body).toHaveLength(1);
    expect(fin.body[0]).toMatchObject({ id: c.honorario.id, valorAprovado: 120_000, liberado: 0, falta: 120_000, podeLiberar: true });

    const parcial = await mutacao(hon.agent.post(`/api/honorarios-ceno/${c.honorario.id}/liberacoes`)).send({ versao: c.honorario.versao, data: "2099-10-20", oc: "OC-778", valor: 50_000 });
    expect(parcial.status, parcial.text).toBe(201);
    expect(parcial.body).toMatchObject({ liberado: 50_000, falta: 70_000 });

    const hist = await hon.agent.get(`/api/honorarios-ceno/${c.honorario.id}/historico`);
    expect(hist.status).toBe(200);
    expect(hist.body.liberacoes).toHaveLength(1);
    expect(hist.body.historico[0]).toMatchObject({ acao: "liberacao", porNome: hon.user.name });

    const est = await mutacao(hon.agent.post(`/api/honorarios-ceno/${c.honorario.id}/liberacoes/${hist.body.liberacoes[0].id}/estornar`))
      .send({ versao: parcial.body.versao, motivo: "OC lançada no pedido errado" });
    expect(est.status, est.text).toBe(200);
    expect(est.body).toMatchObject({ liberado: 0, falta: 120_000 });

    const resto = await mutacao(hon.agent.post(`/api/honorarios-ceno/${c.honorario.id}/liberacoes`)).send({ versao: est.body.versao, data: "2099-10-21", oc: "OC-779", valor: 120_000 });
    expect(resto.status, resto.text).toBe(201);
    expect(resto.body).toMatchObject({ liberado: 120_000, falta: 0 });
  });

  it("não lança, não envia, não aprova nem devolve — nem com cadastro de validador/aprovador na cenotécnica", async () => {
    const c = await aprovado();
    const user = await criarUsuario("honorarios");
    await ctx.db.insert(ctx.schema.scalingFunctionManagers).values([
      { functionId: c.funcaoId, userId: user.id, role: "validador" },
      { functionId: c.funcaoId, userId: user.id, role: "aprovador" },
    ]);
    const agent = await agenteDe(user);
    const acesso = await agent.get("/api/honorarios-ceno/acesso");
    expect(acesso.body).toMatchObject({ podePedir: false, podeAprovar: false, podeLiberar: true });

    // Uma de cada vez (em paralelo o supertest sobe um servidor por chamada).
    const tentativas = [
      () => agent.get("/api/honorarios-ceno/eventos"),
      () => agent.get(`/api/honorarios-ceno/pedido?eventId=${c.eventoId}`),
      () => agent.get(`/api/honorarios-ceno/aprovacao?eventId=${c.eventoId}`),
      () => agent.get(`/api/honorarios-ceno/situacao?eventIds=${c.eventoId}`),
      () => mutacao(agent.post("/api/honorarios-ceno")).send({ eventId: c.eventoId, tipo: "vaga", teamInclusionId: c.vagaId, tipoFreela: "outro", valorPedido: 1 }),
      () => mutacao(agent.post("/api/honorarios-ceno/enviar")).send({ itens: [] }),
      () => mutacao(agent.patch(`/api/honorarios-ceno/${c.honorario.id}`)).send({ versao: c.honorario.versao, valorPedido: 1 }),
      () => mutacao(agent.delete(`/api/honorarios-ceno/${c.honorario.id}`)).send({ versao: c.honorario.versao }),
      () => mutacao(agent.post(`/api/honorarios-ceno/${c.honorario.id}/devolver`)).send({ versao: c.honorario.versao, motivo: "Rever" }),
      () => mutacao(agent.post(`/api/honorarios-ceno/${c.honorario.id}/aprovar`)).send({ versao: c.honorario.versao }),
      () => mutacao(agent.post("/api/honorarios-ceno/decidir-lote")).send({ acao: "aprovar", itens: [] }),
    ];
    for (const tentar of tentativas) {
      const r = await tentar();
      expect(r.status, `${r.req.method} ${r.req.path}`).toBe(403);
    }
  });

  it("recebe 403 em todas as outras telas — Escalação, Passagens, Planejado, NF, usuários, colaboradores e as leituras globais", async () => {
    const c = await aprovado();
    const hon = await agenteLogado("honorarios");
    const rotas = [
      "/api/team-inclusions", `/api/team-inclusions?eventId=${c.eventoId}`, "/api/tickets", "/api/accommodations",
      `/api/budget-planned?eventId=${c.eventoId}`, "/api/budget-actual", "/api/budget-comparison", "/api/invoices",
      "/api/users", "/api/collaborators", "/api/events", "/api/functions", "/api/system-settings", "/api/payment-companies",
      "/api/swap-requests", "/api/scaling-suggestions", "/api/scaling-change-requests", "/api/system-logs",
      "/api/flash-movements", "/api/rh-control", "/api/shell/aguardando-gestor", "/api/avisos-de-alteracao",
      `/api/budget-planned/honorarios?eventId=${c.eventoId}`, "/API/EVENTS",
    ];
    for (const url of rotas) {
      const r = await hon.agent.get(url);
      expect(r.status, url).toBe(403);
      expect(r.body.message, url).toBe("Seu acesso é só à tela Honorários da cenotécnica.");
    }
    // Escritas também.
    const criarEvento = await mutacao(hon.agent.post("/api/events")).send({ name: "X" });
    expect(criarEvento.status).toBe(403);
    const criarUsuarioRes = await mutacao(hon.agent.post("/api/users")).send({ email: `x.${unico()}@teste.local`, name: "X", role: "admin" });
    expect(criarUsuarioRes.status).toBe(403);

    // A casca continua: /api/auth/me devolve só o próprio usuário, sem segredos.
    const me = await hon.agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ id: hon.user.id, role: "honorarios" });
    expect(me.body.user.password).toBeUndefined();
  });

  it("ver como usuário: o admin simulando o perfil enxerga o mesmo recorte e sai da simulação", async () => {
    const user = await criarUsuario("honorarios");
    const admin = await agenteLogado("admin");
    const ini = await mutacao(admin.agent.post("/api/simulation/start")).send({ userId: user.id });
    expect(ini.status, ini.text).toBe(200);
    expect((await admin.agent.get("/api/events")).status).toBe(403);
    expect((await admin.agent.get("/api/honorarios-ceno/financeiro")).status).toBe(200);
    const fim = await mutacao(admin.agent.post("/api/simulation/stop")).send({});
    expect(fim.status, fim.text).toBe(200);
    expect((await admin.agent.get("/api/events")).status).toBe(200);
  });
});

describe("Perfil Honorários — como o papel chega", () => {
  const BEARER = () => `Bearer ${process.env.PORTAL_API_TOKEN}`;

  it("SSO do Portal com \"Honorários (liberação)\": a conta nasce no perfil e fica sem o resto do app", async () => {
    const email = `romilson.${unico()}@teste.local`;
    const token = await tokenDoPortal({ email, name: "Romilson Teste" }, { role: "Honorários (liberação)" });
    const agent = request.agent(ctx.app);
    const login = await agent.get(`/?portal_sso=${encodeURIComponent(token)}`);
    expect(login.status).toBe(302);
    const criado = await ctx.storage.getUserByEmail(email);
    expect(criado?.role).toBe("honorarios");
    expect((await agent.get("/api/honorarios-ceno/financeiro")).status).toBe(200);
    expect((await agent.get("/api/team-inclusions")).status).toBe(403);
    expect((await agent.get("/api/collaborators")).status).toBe(403);
  });

  it("caixa, acentos e espaços nas pontas não importam; a chave `honorarios` também vale", async () => {
    for (const papel of ["  HONORARIOS (LIBERACAO) ", "honorários (liberação)", "honorarios"]) {
      const email = `variacao.${unico()}@teste.local`;
      const token = await tokenDoPortal({ email }, { role: papel });
      const r = await request.agent(ctx.app).get(`/?portal_sso=${encodeURIComponent(token)}`);
      expect(r.status, papel).toBe(302);
      expect((await ctx.storage.getUserByEmail(email))?.role, papel).toBe("honorarios");
    }
  });

  it("o papel gravado no app é preservado no login: o SSO não troca honorarios pelo papel do token", async () => {
    const user = await criarUsuario("honorarios");
    const token = await tokenDoPortal(user, { role: "Administrador" });
    const r = await request.agent(ctx.app).get(`/?portal_sso=${encodeURIComponent(token)}`);
    expect(r.status).toBe(302);
    expect((await ctx.storage.getUser(user.id))?.role).toBe("honorarios");
  });

  it("API de usuários do Portal (sincronismo de permissões): cria e atualiza com \"Honorários (liberação)\"", async () => {
    const email = `renan.${unico()}@teste.local`;
    const criar = await mutacao(request(ctx.app).post("/api/portal/users")).set("Authorization", BEARER())
      .send({ email, name: "Renan Teste", role: "Honorários (liberação)" });
    expect(criar.status, criar.text).toBe(201);
    expect(criar.body.role).toBe("honorarios");

    const outro = await criarUsuario("production");
    const atualizar = await mutacao(request(ctx.app).patch(`/api/portal/users/${encodeURIComponent(outro.email)}`)).set("Authorization", BEARER())
      .send({ role: " Honorarios (Liberacao)" });
    expect(atualizar.status, atualizar.text).toBe(200);
    expect(atualizar.body.role).toBe("honorarios");
    const agent = await agenteDe(outro);
    expect((await agent.get("/api/tickets")).status).toBe(403);
    expect((await agent.get("/api/honorarios-ceno/acesso")).body).toMatchObject({ podeLiberar: true, podePedir: false });
  });

  it("Cadastro de usuários: o admin cria e muda para o perfil; DP e Compras não criam", async () => {
    const admin = await agenteLogado("admin");
    const email = `cadastro.${unico()}@teste.local`;
    const criar = await mutacao(admin.agent.post("/api/users")).send({ email, name: "Pessoa da Controladoria", role: "honorarios" });
    expect(criar.status, criar.text).toBe(200);
    expect(criar.body.role).toBe("honorarios");

    const outro = await criarUsuario("financial");
    const mudar = await mutacao(admin.agent.patch(`/api/users/${outro.id}`)).send({ role: "honorarios" });
    expect(mudar.status, mudar.text).toBe(200);
    expect(mudar.body.role).toBe("honorarios");

    const rh = await agenteLogado("financial");
    const recusa = await mutacao(rh.agent.post("/api/users")).send({ email: `rh.${unico()}@teste.local`, name: "X", role: "honorarios" });
    expect(recusa.status).toBe(403);
  });
});

