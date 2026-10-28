/**
 * Módulo de Honorários, Fase 3 (28/10) — prazos e cobranças, sobre o PGlite.
 *
 *  - configuração dos prazos: admin e DP leem; só o admin muda (validação e
 *    auditoria); produção e o perfil Honorários → 403;
 *  - Painel de honorários: prazo da etapa atual por linha (confirmação e
 *    check-out final atrasados, Conferência DP), contadores de atrasados;
 *    legado sem prazo;
 *  - contestação do colaborador volta ao DP: aberta no Painel (pendência do
 *    DP), resposta só do DP (auditoria), o colaborador vê no portal;
 *    contestação nova reabre;
 *  - portal: "Confirme até" do próprio colaborador;
 *  - presença: a produção vê só o prazo do check-out final; o DP, a etapa;
 *  - sino do DP: contagem; produção → 403.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { hojeISO } from "@shared/hoje-sp";
import { completarCpf } from "@shared/pagamento";
import { PRAZOS_PADRAO, somarDias } from "@shared/prazos-honorarios";
import {
  agenteLogado, criarApp, criarEvento, criarFuncao, mutacao, unico, type Contexto, type TestAgent,
} from "./harness";

let ctx: Contexto;
let hoje: string;
let dp: { agent: TestAgent; user: { id: string } };
let admin: { agent: TestAgent; user: { id: string } };
let prod: { agent: TestAgent; user: { id: string } };
const SENHA = "senha-do-portal-3";

beforeAll(async () => {
  ctx = await criarApp();
  hoje = hojeISO();
  dp = await agenteLogado("financial");
  admin = await agenteLogado("admin");
  prod = await agenteLogado("production");
});

let sequencia = 700_000;
function cpfNovo(): string {
  sequencia += 13;
  return completarCpf(`${String(Date.now() % 1000).padStart(3, "0")}${String(sequencia).padStart(6, "0")}`);
}

async function colaborador() {
  const cpf = cpfNovo();
  const colab = await ctx.storage.createCollaborator({
    fullName: `Freela ${unico()}`, officialDocument: cpf, documentType: "cpf",
    type: "freela", city: "Campinas - SP", status: "aprovado", active: true,
  } as any);
  return { colab, cpf };
}

async function colaboradorNoPortal() {
  const { colab, cpf } = await colaborador();
  // 28/10 (revisão S4): a produção só gera para quem está escalado — aqui o DP gera.
  const c = await mutacao(dp.agent.post(`/api/colaboradores/${colab.id}/codigo-de-acesso`)).send({});
  expect(c.status, c.text).toBe(201);
  const portal = request.agent(ctx.app);
  const r = await mutacao(portal.post("/api/colaborador/primeiro-acesso")).send({ cpf, codigo: c.body.codigo, senha: SENHA });
  expect(r.status, r.text).toBe(200);
  const t = await mutacao(portal.post("/api/colaborador/termo")).send({ versao: r.body.termo.versao });
  expect(t.status, t.text).toBe(200);
  return { colab, portal };
}

/** Evento do FLUXO NOVO (termina depois da data de corte) com trabalho que terminou há dias. */
async function eventoNovo() {
  return criarEvento({ startDate: somarDias(hoje, -8), endDate: "2099-12-31" });
}

/** Prestação (planejado + realizado) com os dias trabalhados dados; ainda com a produção. */
async function prestacao(o: { eventId: string; collaboratorId: string; dias: string[]; extras?: Record<string, unknown> }) {
  const funcao = await criarFuncao();
  const [planejado] = await ctx.db.insert(ctx.schema.budgetPlanned).values({
    eventId: o.eventId, collaboratorId: o.collaboratorId, functionId: funcao.id, collaboratorType: "freela",
    dailyQuantity: o.dias.length, dailyValue: 40_000, totalValue: o.dias.length * 40_000, status: "pre_aprovado",
  }).returning();
  const [a] = await ctx.db.insert(ctx.schema.budgetActual).values({
    plannedId: planejado.id, eventId: o.eventId, collaboratorId: o.collaboratorId, functionId: funcao.id, collaboratorType: "freela",
    dailyQuantity: o.dias.length, dailyValue: 40_000, totalValue: o.dias.length * 40_000, workedDays: o.dias,
    ...(o.extras ?? {}),
  }).returning();
  return a;
}

const linhaDo = async (eventId: string, actualId: string, agent: TestAgent = dp.agent) => {
  const r = await agent.get(`/api/rh/controle?eventId=${eventId}&recorte=fluxo_novo`);
  expect(r.status, r.text).toBe(200);
  return { linha: r.body.itens.find((i: { actual: { id: string } | null }) => i.actual?.id === actualId), corpo: r.body };
};

const diasPassados = () => [somarDias(hoje, -6), somarDias(hoje, -5), somarDias(hoje, -4)];

describe("configuração dos prazos", () => {
  it("DP lê (sem editar); só o admin muda, com validação e auditoria", async () => {
    const lido = await dp.agent.get("/api/honorarios/prazos");
    expect(lido.status).toBe(200);
    expect(lido.body).toMatchObject({ padrao: PRAZOS_PADRAO, provisorio: true, podeEditar: false });

    expect((await mutacao(dp.agent.put("/api/honorarios/prazos")).send({ enviarNf: 7 })).status).toBe(403);
    const ruim = await mutacao(admin.agent.put("/api/honorarios/prazos")).send({ enviarNf: 0 });
    expect(ruim.status).toBe(400);
    expect(ruim.body.campo).toBe("enviarNf");

    const ok = await mutacao(admin.agent.put("/api/honorarios/prazos")).send({ enviarNf: 7 });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.body.prazos.enviarNf).toBe(7);
    expect((await dp.agent.get("/api/honorarios/prazos")).body.prazos.enviarNf).toBe(7);
    const logs = await ctx.db.select().from(ctx.schema.systemLogs).where(eq(ctx.schema.systemLogs.entityId, "honorarios-prazos"));
    expect(logs.length).toBeGreaterThan(0);
    // Volta ao padrão para não mexer nos outros testes.
    expect((await mutacao(admin.agent.put("/api/honorarios/prazos")).send({ enviarNf: PRAZOS_PADRAO.enviarNf })).status).toBe(200);
  });

  it("produção e o perfil Honorários não leem", async () => {
    expect((await prod.agent.get("/api/honorarios/prazos")).status).toBe(403);
    const hon = await agenteLogado("honorarios");
    expect((await hon.agent.get("/api/honorarios/prazos")).status).toBe(403);
    expect((await hon.agent.get("/api/shell/honorarios-prazos")).status).toBe(403);
  });
});

describe("Painel de honorários", () => {
  it("terminou há 4 dias sem confirmar: confirmação (colaborador) e check-out final (produção) atrasados", async () => {
    const evento = await eventoNovo();
    const { colab } = await colaborador();
    const a = await prestacao({ eventId: evento.id, collaboratorId: colab.id, dias: diasPassados() });
    const { linha, corpo } = await linhaDo(evento.id, a.id);
    expect(linha.prazo.atual).toMatchObject({ etapa: "confirmar_presenca", quem: "colaborador", venceEm: somarDias(hoje, -2), situacao: "atrasado", dias: 2 });
    expect(linha.prazo.paralelo).toMatchObject({ etapa: "checkout_final", quem: "producao", situacao: "atrasado", dias: 1 });
    expect(linha.prazo.pior.etapa).toBe("confirmar_presenca");
    expect(corpo.contadores.prazos).toMatchObject({ atrasados: 1, venceHoje: 0, atrasadosPorQuem: { colaborador: 1 } });
  });

  it("com o DP: a Conferência DP conta do check-out final", async () => {
    const evento = await eventoNovo();
    const { colab } = await colaborador();
    const a = await prestacao({
      eventId: evento.id, collaboratorId: colab.id, dias: diasPassados(),
      extras: { sentForReview: true, rhStatus: "pendente", checkoutFinalEm: new Date(`${somarDias(hoje, -3)}T15:00:00Z`) },
    });
    const { linha } = await linhaDo(evento.id, a.id);
    expect(linha.prazo.atual).toMatchObject({ etapa: "conferencia_dp", quem: "dp", venceEm: hoje, situacao: "vence_hoje" });
  });

  it("evento legado não tem prazo nem contestação", async () => {
    const legado = await criarEvento({ startDate: "2019-05-01", endDate: "2019-05-03" });
    const { colab } = await colaborador();
    const a = await prestacao({ eventId: legado.id, collaboratorId: colab.id, dias: ["2019-05-01", "2019-05-02"] });
    const r = await dp.agent.get(`/api/rh/controle?eventId=${legado.id}&recorte=legado`);
    const linha = r.body.itens.find((i: { actual: { id: string } | null }) => i.actual?.id === a.id);
    expect(linha.prazo).toBeNull();
    expect(linha.contestacao).toBeNull();
  });
});

describe("contestação do colaborador → DP", () => {
  it("aberta vira pendência do DP; só o DP responde; o colaborador vê a resposta; contestação nova reabre", async () => {
    const evento = await eventoNovo();
    const { colab, portal } = await colaboradorNoPortal();
    const dias = diasPassados();
    const a = await prestacao({ eventId: evento.id, collaboratorId: colab.id, dias });

    // O portal mostra o prazo da confirmação (atrasado) antes de confirmar.
    const antes = await portal.get("/api/colaborador/prestacoes");
    expect(antes.status).toBe(200);
    const minha = antes.body.prestacoes.find((p: { id: string }) => p.id === a.id);
    expect(minha.prazo).toMatchObject({ etapa: "confirmar_presenca", venceEm: somarDias(hoje, -2), situacao: "atrasado", dias: 2 });

    const conf = await mutacao(portal.post(`/api/colaborador/prestacoes/${a.id}/confirmar`))
      .send({ dias, cnpj: "11222333000181", contestacao: "Faltou a hora extra de sábado." });
    expect(conf.status, conf.text).toBe(200);

    const { linha, corpo } = await linhaDo(evento.id, a.id);
    expect(linha.contestacao).toMatchObject({ texto: "Faltou a hora extra de sábado.", respondida: false });
    expect(linha.rhPrecisaAgir).toBe(true);
    expect(corpo.contadores.contestacoesAbertas).toBe(1);
    // Confirmou: sobra o check-out final da produção (atrasado 1 dia).
    expect(linha.prazo.atual).toMatchObject({ etapa: "checkout_final", situacao: "atrasado", dias: 1 });
    expect((await portal.get("/api/colaborador/prestacoes")).body.prestacoes.find((p: { id: string }) => p.id === a.id).prazo).toBeNull();

    const url = `/api/presenca/${a.id}/contestacao/resposta`;
    expect((await mutacao(prod.agent.post(url)).send({ resposta: "Vou ver." })).status).toBe(403);
    expect((await mutacao(dp.agent.post(url)).send({ resposta: "x" })).status).toBe(400);
    const r = await mutacao(dp.agent.post(url)).send({ resposta: "Conferimos: entra na próxima OC." });
    expect(r.status, r.text).toBe(200);
    expect(r.body.contestacao).toMatchObject({ respondida: true, resposta: "Conferimos: entra na próxima OC." });
    const logs = await ctx.db.select().from(ctx.schema.systemLogs).where(eq(ctx.schema.systemLogs.entityType, "presenca_contestacao"));
    expect(logs.some((l) => JSON.stringify(l).includes(a.id))).toBe(true);

    const depois = await linhaDo(evento.id, a.id);
    expect(depois.linha.contestacao.respondida).toBe(true);
    expect(depois.linha.rhPrecisaAgir).toBe(false);
    const noPortal = (await portal.get("/api/colaborador/prestacoes")).body.prestacoes.find((p: { id: string }) => p.id === a.id);
    expect(noPortal.confirmacao.respostaDoDp).toMatchObject({ texto: "Conferimos: entra na próxima OC." });

    // Refaz a confirmação com OUTRA contestação: volta a ficar aberta.
    const refeita = await mutacao(portal.post(`/api/colaborador/prestacoes/${a.id}/confirmar`))
      .send({ dias, cnpj: "11222333000181", contestacao: "E o almoço do domingo?" });
    expect(refeita.status, refeita.text).toBe(200);
    expect((await linhaDo(evento.id, a.id)).linha.contestacao).toMatchObject({ texto: "E o almoço do domingo?", respondida: false, resposta: null });
  });

  it("sem contestação → 409; prestação de legado → 409", async () => {
    const evento = await eventoNovo();
    const { colab } = await colaborador();
    const a = await prestacao({ eventId: evento.id, collaboratorId: colab.id, dias: diasPassados() });
    const r = await mutacao(dp.agent.post(`/api/presenca/${a.id}/contestacao/resposta`)).send({ resposta: "Tudo certo." });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("sem_contestacao");
    const legado = await criarEvento({ startDate: "2019-05-01", endDate: "2019-05-03" });
    const l = await prestacao({ eventId: legado.id, collaboratorId: colab.id, dias: ["2019-05-01"] });
    expect((await mutacao(dp.agent.post(`/api/presenca/${l.id}/contestacao/resposta`)).send({ resposta: "Tudo certo." })).body.codigo).toBe("evento_legado");
  });
});

describe("presença e sino", () => {
  it("a produção vê só o prazo do check-out final; o DP vê a etapa", async () => {
    const evento = await eventoNovo();
    const { colab } = await colaborador();
    const a = await prestacao({ eventId: evento.id, collaboratorId: colab.id, dias: diasPassados() });
    const daProducao = await prod.agent.get(`/api/presenca/eventos/${evento.id}`);
    expect(daProducao.status, daProducao.text).toBe(200);
    const p = daProducao.body.prestacoes.find((x: { actualId: string }) => x.actualId === a.id);
    expect(p.prazos.checkoutFinal).toMatchObject({ etapa: "checkout_final", venceEm: somarDias(hoje, -1), situacao: "atrasado", dias: 1 });
    expect(p.prazos.atual).toBeNull();
    const doDp = (await dp.agent.get(`/api/presenca/eventos/${evento.id}`)).body.prestacoes.find((x: { actualId: string }) => x.actualId === a.id);
    expect(doDp.prazos.atual.etapa).toBe("confirmar_presenca");
  });

  it("o sino do DP conta atrasados (por quem) e contestações; produção não lê", async () => {
    const evento = await eventoNovo();
    const { colab } = await colaborador();
    await prestacao({ eventId: evento.id, collaboratorId: colab.id, dias: diasPassados() });
    const r = await dp.agent.get("/api/shell/honorarios-prazos");
    expect(r.status, r.text).toBe(200);
    expect(r.body.atrasados).toBeGreaterThanOrEqual(1);
    expect(r.body.atrasadosComOColaborador).toBeGreaterThanOrEqual(1);
    expect(typeof r.body.contestacoesAbertas).toBe("number");
    expect((await prod.agent.get("/api/shell/honorarios-prazos")).status).toBe(403);
  });
});
