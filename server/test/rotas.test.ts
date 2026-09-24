/**
 * Testes de rota HTTP (integração) — app real sobre PGlite (24/09).
 *
 * Cada `describe` cobre um bloco: segurança (gate, CSRF, papéis, projeção de
 * PII), máquina de estados da vaga, solicitações de troca, trava de evento
 * encerrado e contrato das listagens. Os dados são criados direto no banco
 * pelos helpers de ./harness; as chamadas passam pelo HTTP como o client faz —
 * inclusive Origin + Content-Type JSON em toda mutação (CSRF fail-closed).
 *
 * Rodar: `npm run test:rotas` (ou `npx vitest run server/test`).
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  criarEvento,
  criarFuncao,
  criarUsuario,
  criarVaga,
  mutacao,
  ORIGEM_PERMITIDA,
  type Contexto,
} from "./harness";

let ctx: Contexto;

// O boot do banco/app e o silêncio do console.log/warn acontecem em
// ./setup.ts (setupFiles do projeto "rotas"); aqui só se pega a instância.
beforeAll(async () => {
  ctx = await criarApp();
});

// ── Segurança ───────────────────────────────────────────────────────────────
describe("Segurança: gate global, CSRF e papéis", () => {
  it("GET /api/collaborators sem sessão → 401", async () => {
    const res = await request(ctx.app).get("/api/collaborators");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Não autenticado" });
  });

  it("POST /api/events sem Origin → 403 (CSRF fail-closed)", async () => {
    const { agent } = await agenteLogado("admin");
    const res = await agent.post("/api/events").set("Content-Type", "application/json").send({ name: "x" });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Origem não informada");
  });

  it("POST /api/events com Origin: null → 403", async () => {
    const { agent } = await agenteLogado("admin");
    const res = await agent.post("/api/events").set("Origin", "null").set("Content-Type", "application/json").send({ name: "x" });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Origem não permitida");
  });

  it("POST /api/events em urlencoded → 415", async () => {
    const { agent } = await agenteLogado("admin");
    const res = await agent.post("/api/events").set("Origin", ORIGEM_PERMITIDA).type("form").send("name=x");
    expect(res.status).toBe(415);
    expect(res.body.message).toBe("Tipo de conteúdo não permitido");
  });

  it("PATCH /api/users/:id/approval por production pedindo role admin → 403", async () => {
    const { agent } = await agenteLogado("production");
    const alvo = await criarUsuario("production", { status: "pending" });
    const res = await mutacao(agent.patch(`/api/users/${alvo.id}/approval`)).send({ status: "approved", role: "admin" });
    expect(res.status).toBe(403);
    const noBanco = await ctx.storage.getUser(alvo.id);
    expect(noBanco?.role).toBe("production");
    expect(noBanco?.status).toBe("pending");
  });

  it("PATCH /api/users/:id/approval por admin → 200 e o papel muda", async () => {
    const { agent } = await agenteLogado("admin");
    const alvo = await criarUsuario("production", { status: "pending" });
    const res = await mutacao(agent.patch(`/api/users/${alvo.id}/approval`)).send({ status: "approved", role: "purchasing" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("purchasing");
    expect(res.body.status).toBe("approved");
    expect(res.body).not.toHaveProperty("password");
    const noBanco = await ctx.storage.getUser(alvo.id);
    expect(noBanco?.role).toBe("purchasing");
  });

  it("PATCH /api/users/:id/toggle-active: resposta sem segredos e usuário inativado perde a sessão (401)", async () => {
    const { agent: admin } = await agenteLogado("admin");
    const { agent: agenteDoAlvo, user: alvo } = await agenteLogado("production");

    // Antes de inativar, o alvo acessa normalmente
    expect((await agenteDoAlvo.get("/api/events")).status).toBe(200);

    const res = await mutacao(admin.patch(`/api/users/${alvo.id}/toggle-active`)).send({});
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    expect(res.body).not.toHaveProperty("password");
    expect(res.body).not.toHaveProperty("resetToken");
    expect(res.body).not.toHaveProperty("resetTokenExpiry");

    // Próxima request do inativado: o gate relê o usuário e nega
    const depois = await agenteDoAlvo.get("/api/events");
    expect(depois.status).toBe(401);
    expect(depois.body.message).toBe("Conta sem acesso. Contate o administrador.");
  });

  it("POST /api/auth/login em modo seguro (produção) → 403", async () => {
    // A rota lê process.env.NODE_ENV diretamente (server/routes.ts); o
    // `modoSeguro` do createApp cobre o resto das regras. Liga só neste teste.
    const user = await criarUsuario("admin");
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await mutacao(request(ctx.app).post("/api/auth/login")).send({ email: user.email, password: user.senha });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Em produção o acesso é pelo Portal Norte");
    } finally {
      process.env.NODE_ENV = anterior;
    }
  });

  it("GET /api/collaborators: function_area não vê officialDocument; admin vê", async () => {
    const colab = await criarColaborador();
    const { agent: area } = await agenteLogado("function_area");
    const { agent: admin } = await agenteLogado("admin");

    const paraArea = await area.get("/api/collaborators");
    expect(paraArea.status).toBe(200);
    const linhaArea = paraArea.body.find((c: any) => c.id === colab.id);
    expect(linhaArea).toBeDefined();
    expect(linhaArea).not.toHaveProperty("officialDocument");
    expect(linhaArea).not.toHaveProperty("phone");
    expect(linhaArea.fullName).toBe(colab.fullName);

    const paraAdmin = await admin.get("/api/collaborators");
    expect(paraAdmin.status).toBe(200);
    const linhaAdmin = paraAdmin.body.find((c: any) => c.id === colab.id);
    expect(linhaAdmin.officialDocument).toBe(colab.officialDocument);
  });
});

// ── Vagas (team_inclusions) ─────────────────────────────────────────────────
describe("Vagas: criação, máquina de estados e troca direta", () => {
  it("POST /api/team-inclusions com status 'aprovado' no corpo → nasce 'planejado'", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const res = await mutacao(agent.post("/api/team-inclusions")).send({
      eventId: evento.id,
      functionId: funcao.id,
      userId: user.id,
      dailyRates: 2,
      scheduleStartDate: "2099-10-10",
      scheduleEndDate: "2099-10-11",
      status: "aprovado",
      phase: "aprovado",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("planejado");
    expect(res.body.phase).toBe("inclusao");
    const noBanco = await ctx.storage.getTeamInclusion(res.body.id);
    expect(noBanco?.status).toBe("planejado");
  });

  it("PATCH /api/team-inclusions/:id com status 'cancelado' → 400 (use /cancel)", async () => {
    const { agent, user } = await agenteLogado("admin");
    const vaga = await criarVaga({ userId: user.id });
    const res = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}`)).send({ status: "cancelado" });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("/cancel");
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.status).toBe("planejado");
  });

  it("POST /:id/cancel → 200 e 'cancelado'; segundo cancel → 409", async () => {
    const { agent, user } = await agenteLogado("admin");
    const vaga = await criarVaga({ userId: user.id });
    const res = await mutacao(agent.post(`/api/team-inclusions/${vaga.id}/cancel`)).send({ reason: "teste" });
    expect(res.status).toBe(200);
    expect(res.body.inclusion.status).toBe("cancelado");
    expect(res.body.inclusion.previousStatus).toBe("planejado");

    const denovo = await mutacao(agent.post(`/api/team-inclusions/${vaga.id}/cancel`)).send({});
    expect(denovo.status).toBe(409);
  });

  it("POST /:id/confirm em vaga 'planejado' com colaborador ativo → 200 confirmada; confirmar de novo → 409 sem mudar", async () => {
    const { agent, user } = await agenteLogado("admin");
    const colab = await criarColaborador();
    const vaga = await criarVaga({ userId: user.id, collaboratorId: colab.id, needsTicket: true });

    const res = await mutacao(agent.post(`/api/team-inclusions/${vaga.id}/confirm`)).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("escalado");
    expect(res.body.phase).toBe("escalacao");
    expect(res.body.collaboratorId).toBe(colab.id);

    const denovo = await mutacao(agent.post(`/api/team-inclusions/${vaga.id}/confirm`)).send({});
    expect(denovo.status).toBe(409);
    const noBanco = await agent.get(`/api/team-inclusions/${vaga.id}`);
    expect(noBanco.body.status).toBe("escalado");
  });

  it("POST /:id/confirm com colaborador inativo → 400", async () => {
    const { agent, user } = await agenteLogado("admin");
    const inativo = await criarColaborador({ active: false });
    const vaga = await criarVaga({ userId: user.id, collaboratorId: inativo.id });
    const res = await mutacao(agent.post(`/api/team-inclusions/${vaga.id}/confirm`)).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("inativo");
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.status).toBe("planejado");
  });

  it("POST /:id/confirm: agenda sobreposta (2+ dias) → 409; um dia em comum → 200 com avisosDeAgenda", async () => {
    const { agent, user } = await agenteLogado("admin");
    const colab = await criarColaborador();
    // Já confirmado em outro evento de 10 a 12/10
    const ocupada = await criarVaga({
      userId: user.id, collaboratorId: colab.id, status: "escalado", phase: "escalacao",
      scheduleStartDate: "2099-10-10", scheduleEndDate: "2099-10-12",
    });

    // 11 a 13/10: divide 11 e 12 → bloqueia
    const sobreposta = await criarVaga({ userId: user.id, collaboratorId: colab.id, scheduleStartDate: "2099-10-11", scheduleEndDate: "2099-10-13" });
    const bloqueio = await mutacao(agent.post(`/api/team-inclusions/${sobreposta.id}/confirm`)).send({});
    expect(bloqueio.status).toBe(409);
    expect(bloqueio.body.message).toContain("datas sobrepostas");
    expect((await ctx.storage.getTeamInclusion(sobreposta.id))?.status).toBe("planejado");

    // 12 a 14/10: só o dia 12 em comum → confirma com aviso
    const mesmoDia = await criarVaga({ userId: user.id, collaboratorId: colab.id, scheduleStartDate: "2099-10-12", scheduleEndDate: "2099-10-14" });
    const aviso = await mutacao(agent.post(`/api/team-inclusions/${mesmoDia.id}/confirm`)).send({});
    expect(aviso.status).toBe(200);
    expect(aviso.body.status).toBe("escalado");
    expect(Array.isArray(aviso.body.avisosDeAgenda)).toBe(true);
    expect(aviso.body.avisosDeAgenda).toHaveLength(1);
    expect(aviso.body.avisosDeAgenda[0].vagaId).toBe(ocupada.id);
  });

  it("PATCH /:id/reactivate de vaga cancelada → 'reaberto'", async () => {
    const { agent, user } = await agenteLogado("admin");
    const vaga = await criarVaga({ userId: user.id, status: "cancelado", phase: "cancelado" });
    const res = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}/reactivate`)).send({});
    expect(res.status).toBe(200);
    expect(res.body.inclusion.status).toBe("reaberto");
    expect(res.body.inclusion.phase).toBe("inclusao");
  });

  it("PATCH trocando collaboratorId em vaga confirmada → 403 (use a Solicitação de Troca)", async () => {
    const { agent, user } = await agenteLogado("admin");
    const atual = await criarColaborador();
    const outro = await criarColaborador();
    const vaga = await criarVaga({ userId: user.id, collaboratorId: atual.id, status: "escalado", phase: "escalacao" });
    const res = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}`)).send({ collaboratorId: outro.id });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Solicitação de Troca");
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.collaboratorId).toBe(atual.id);
  });
});

// ── Solicitações de troca ───────────────────────────────────────────────────
describe("Trocas: permissão, duplicidade e concorrência na aprovação", () => {
  async function vagaComColaborador(userId: string) {
    const atual = await criarColaborador();
    const novo = await criarColaborador();
    const vaga = await criarVaga({ userId, collaboratorId: atual.id, status: "escalado", phase: "escalacao" });
    return { vaga, atual, novo };
  }

  const corpoDaTroca = (vagaId: string, novoId: string) => ({
    teamInclusionId: vagaId,
    newCollaboratorId: novoId,
    reason: "Colaborador atual ficou doente",
    newCity: "Curitiba - PR",
  });

  it("POST /api/swap-requests por function_area sem responsabilidade pela função → 403", async () => {
    const admin = await criarUsuario("admin");
    const { vaga, novo } = await vagaComColaborador(admin.id);
    const { agent } = await agenteLogado("function_area");
    const res = await mutacao(agent.post("/api/swap-requests")).send(corpoDaTroca(vaga.id, novo.id));
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Sem permissão");
  });

  it("POST /api/swap-requests: segunda pendente para a mesma vaga → 409", async () => {
    const { agent, user } = await agenteLogado("admin");
    const { vaga, novo } = await vagaComColaborador(user.id);
    const primeira = await mutacao(agent.post("/api/swap-requests")).send(corpoDaTroca(vaga.id, novo.id));
    expect(primeira.status).toBe(201);
    expect(primeira.body.status).toBe("pendente");

    const segunda = await mutacao(agent.post("/api/swap-requests")).send(corpoDaTroca(vaga.id, novo.id));
    expect(segunda.status).toBe(409);
  });

  it("duas aprovações concorrentes → exatamente uma 200 e uma 409", async () => {
    const { agent, user } = await agenteLogado("admin");
    const { vaga, atual, novo } = await vagaComColaborador(user.id);
    const pedido = await mutacao(agent.post("/api/swap-requests")).send(corpoDaTroca(vaga.id, novo.id));
    expect(pedido.status).toBe(201);

    const [a, b] = await Promise.all([
      mutacao(agent.patch(`/api/swap-requests/${pedido.body.id}/approve`)).send({}),
      mutacao(agent.patch(`/api/swap-requests/${pedido.body.id}/approve`)).send({}),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);

    // A vaga trocou UMA vez, para o novo colaborador, com a cidade do pedido
    const depois = await ctx.storage.getTeamInclusion(vaga.id);
    expect(depois?.collaboratorId).toBe(novo.id);
    expect(depois?.collaboratorId).not.toBe(atual.id);
    expect(depois?.city).toBe("Curitiba - PR");
  });

  it("aprovar quando o colaborador da vaga mudou desde o pedido → 409", async () => {
    const { agent, user } = await agenteLogado("admin");
    const { vaga, novo } = await vagaComColaborador(user.id);
    const pedido = await mutacao(agent.post("/api/swap-requests")).send(corpoDaTroca(vaga.id, novo.id));
    expect(pedido.status).toBe(201);

    // Alguém trocou o colaborador por baixo (direto no banco)
    const terceiro = await criarColaborador();
    await ctx.db.update(ctx.schema.teamInclusions)
      .set({ collaboratorId: terceiro.id })
      .where(eq(ctx.schema.teamInclusions.id, vaga.id));

    const res = await mutacao(agent.patch(`/api/swap-requests/${pedido.body.id}/approve`)).send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("mudou desde o pedido");
    // O pedido continua pendente e a vaga continua com o terceiro
    const [sr] = await ctx.db.select().from(ctx.schema.swapRequests).where(eq(ctx.schema.swapRequests.id, pedido.body.id));
    expect(sr.status).toBe("pendente");
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.collaboratorId).toBe(terceiro.id);
  });
});

// ── Espelho operacional ─────────────────────────────────────────────────────
describe("Espelho: evento encerrado", () => {
  it("PATCH .../operational-mirror/rows/:rowId em evento encerrado por purchasing → 403", async () => {
    const admin = await criarUsuario("admin");
    const encerrado = await criarEvento({ startDate: "2020-01-01", endDate: "2020-01-05" });
    const vaga = await criarVaga({ userId: admin.id, eventId: encerrado.id, status: "escalado", phase: "escalacao" });
    const { agent } = await agenteLogado("purchasing");
    const res = await mutacao(agent.patch(`/api/events/${encerrado.id}/operational-mirror/rows/${vaga.id}`))
      .send({ field: "observations", value: "tentativa" });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Evento encerrado");
  });
});

// ── Contrato das listagens ──────────────────────────────────────────────────
describe("Contrato: listagens", () => {
  it("GET /api/team-inclusions sem recorte como function_area → 400; com ?eventId= → 200", async () => {
    const admin = await criarUsuario("admin");
    const evento = await criarEvento();
    const vaga = await criarVaga({ userId: admin.id, eventId: evento.id });
    const { agent } = await agenteLogado("function_area");

    const semRecorte = await agent.get("/api/team-inclusions");
    expect(semRecorte.status).toBe(400);
    expect(semRecorte.body.message).toContain("eventId");

    const comEvento = await agent.get(`/api/team-inclusions?eventId=${evento.id}`);
    expect(comEvento.status).toBe(200);
    expect(Array.isArray(comEvento.body)).toBe(true);
    expect(comEvento.body.map((v: any) => v.id)).toEqual([vaga.id]);
  });

  it("GET /api/swap-requests devolve chaves snake_case (team_inclusion_id)", async () => {
    const { agent, user } = await agenteLogado("admin");
    const atual = await criarColaborador();
    const novo = await criarColaborador();
    const vaga = await criarVaga({ userId: user.id, collaboratorId: atual.id, status: "escalado", phase: "escalacao" });
    const pedido = await mutacao(agent.post("/api/swap-requests")).send({
      teamInclusionId: vaga.id, newCollaboratorId: novo.id, reason: "motivo", newCity: "Santos - SP",
    });
    expect(pedido.status).toBe(201);

    const lista = await agent.get(`/api/swap-requests?eventId=${vaga.eventId}`);
    expect(lista.status).toBe(200);
    expect(lista.body).toHaveLength(1);
    const linha = lista.body[0];
    expect(linha.team_inclusion_id).toBe(vaga.id);
    expect(linha.new_collaborator_id).toBe(novo.id);
    expect(linha.current_collaborator_name).toBe(atual.fullName);
    expect(linha).not.toHaveProperty("teamInclusionId");
  });
});
