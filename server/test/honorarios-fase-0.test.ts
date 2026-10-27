/**
 * Módulo de Honorários, Fase 0 (26/10) — rotas sobre o PGlite.
 *
 *  - pré-aprovação do DP no Planejado: uma linha, o lote (com o que fica de
 *    fora), desfazer, e a mudança de valor que devolve a linha a pendente;
 *  - "Enviar ao Realizado" (liberar para a Produção) exige a pré-aprovação;
 *  - "não exibir valores" por evento (padrão ligado, só o DP muda);
 *  - data de corte do legado (só o administrador muda);
 *  - Painel de honorários: recorte Fluxo novo × Legado e "Concluir em lote";
 *  - permissões (Produção e o perfil Honorários ficam de fora) e auditoria.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  criarEvento,
  criarFuncao,
  criarVaga,
  mutacao,
  type Contexto,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

/** Os campos que a tela manda para pré-aprovar (os mesmos do "Enviar"). */
function linha(collaboratorId: string, functionId: string, total = 30_000) {
  return {
    collaboratorId, functionId, collaboratorType: "freela",
    dailyQuantity: 3, dailyValue: 10_000, costAssistance: 0,
    weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0,
    mobility: total - 30_000, mobilityIda: null, mobilityVolta: null, transport: 0, totalValue: total,
  };
}

async function cenario() {
  const evento = await criarEvento();
  const funcao = await criarFuncao();
  const colab = await criarColaborador();
  return { evento, funcao, colab };
}

async function logs(entityId: string) {
  return ctx.db.select().from(ctx.schema.systemLogs).where(eq(ctx.schema.systemLogs.entityId, entityId));
}

describe("POST /api/budget-planned/pre-aprovar", () => {
  it("DP pré-aprova uma linha: grava os valores, status pre_aprovado, quem e quando, com auditoria", async () => {
    const { agent, user } = await agenteLogado("financial");
    const { evento, funcao, colab } = await cenario();
    const res = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [linha(colab.id, funcao.id)] });
    expect(res.status).toBe(200);
    expect(res.body.preAprovadas).toBe(1);
    expect(res.body.total).toBe(30_000);
    const [gravada] = await ctx.storage.getBudgetPlanned(evento.id);
    expect(gravada.status).toBe("pre_aprovado");
    expect(gravada.approvedBy).toBe(user.id);
    expect(gravada.approvedAt).toBeTruthy();
    expect(gravada.totalValue).toBe(30_000);
    const auditoria = await logs(gravada.id);
    expect(auditoria.some((l) => JSON.stringify(l.newData).includes("pré-aprovação do DP"))).toBe(true);

    // GET devolve o nome de quem pré-aprovou
    const lista = await agent.get(`/api/budget-planned?eventId=${evento.id}`);
    expect(lista.body[0].approvedByName).toBe(user.name);
  });

  it("lote: pré-aprova o evento e deixa de fora quem já está no Realizado e quem não participou", async () => {
    const { agent, user } = await agenteLogado("admin");
    const { evento, funcao } = await cenario();
    const [a, b, enviado, ausente] = await Promise.all([criarColaborador(), criarColaborador(), criarColaborador(), criarColaborador()]);
    await ctx.db.insert(ctx.schema.budgetActual).values({ eventId: evento.id, collaboratorId: enviado.id, functionId: funcao.id, createdBy: user.id });
    await ctx.storage.createBudgetPlanned({ eventId: evento.id, collaboratorId: ausente.id, functionId: funcao.id, didNotAttend: true } as any);

    const res = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({
      eventId: evento.id,
      linhas: [linha(a.id, funcao.id, 30_000), linha(b.id, funcao.id, 40_000), linha(enviado.id, funcao.id), linha(ausente.id, funcao.id)],
    });
    expect(res.status).toBe(200);
    expect(res.body.preAprovadas).toBe(2);
    expect(res.body.total).toBe(70_000);
    expect(res.body.ignoradas.map((i: { motivo: string }) => i.motivo).sort()).toEqual(["já está no Realizado", "marcado como não participou"]);
    const gravadas = await ctx.storage.getBudgetPlanned(evento.id);
    expect(gravadas.filter((p) => p.status === "pre_aprovado")).toHaveLength(2);
  });

  it("vaga sem colaborador (empreita por empresa, 'a definir'): pré-aprova, desfaz e pré-aprova de novo na MESMA linha", async () => {
    const { agent } = await agenteLogado("financial");
    const { evento, funcao } = await cenario();
    const semColab = { ...linha("x", funcao.id), collaboratorId: null };
    const primeira = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [semColab] });
    expect(primeira.status).toBe(200);
    await mutacao(agent.post("/api/budget-planned/desfazer-pre-aprovacao")).send({ ids: [primeira.body.linhas[0].id] });
    const segunda = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [semColab] });
    expect(segunda.body.linhas[0].id).toBe(primeira.body.linhas[0].id);
    const gravadas = await ctx.storage.getBudgetPlanned(evento.id);
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]).toMatchObject({ collaboratorId: null, status: "pre_aprovado" });
  });

  // 28/10: a trava de evento encerrado é da escala — o DP faz os honorários depois do evento.
  it("evento encerrado: o DP pré-aprova assim mesmo (200)", async () => {
    const { agent } = await agenteLogado("financial");
    const encerrado = await criarEvento({ startDate: "2020-01-01", endDate: "2020-01-05" });
    const funcao = await criarFuncao();
    const colab = await criarColaborador();
    const res = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: encerrado.id, linhas: [linha(colab.id, funcao.id)] });
    expect(res.status, res.text).toBe(200);
  });

  it("corpo inválido → 400; linha repetida → 400", async () => {
    const { agent } = await agenteLogado("financial");
    const { evento, funcao, colab } = await cenario();
    expect((await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [] })).status).toBe(400);
    const repetida = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [linha(colab.id, funcao.id), linha(colab.id, funcao.id)] });
    expect(repetida.status).toBe(400);
  });

  it.each(["production", "function_area", "purchasing", "honorarios"] as const)("%s não pré-aprova (403)", async (papel) => {
    const { agent } = await agenteLogado(papel);
    const { evento, funcao, colab } = await cenario();
    const res = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [linha(colab.id, funcao.id)] });
    expect(res.status).toBe(403);
    expect(await ctx.storage.getBudgetPlanned(evento.id)).toHaveLength(0);
  });
});

describe("Enviar ao Realizado exige a pré-aprovação do DP", () => {
  it("sem pré-aprovação → 409 sem_pre_aprovacao; depois de pré-aprovar → 201", async () => {
    const { agent } = await agenteLogado("financial");
    const { evento, funcao, colab } = await cenario();
    const planejado = await ctx.storage.createBudgetPlanned({ eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, totalValue: 30_000 } as any);
    // Os mesmos valores que serão pré-aprovados (27/10: o envio confere o valor).
    const corpo = { ...linha(colab.id, funcao.id), eventId: evento.id, plannedId: planejado.id, paymentStatus: "pendente" };

    const recusado = await mutacao(agent.post("/api/budget-actual")).send(corpo);
    expect(recusado.status).toBe(409);
    expect(recusado.body.codigo).toBe("sem_pre_aprovacao");
    expect(await ctx.storage.getBudgetActual(evento.id)).toHaveLength(0);

    await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [linha(colab.id, funcao.id)] });
    const aceito = await mutacao(agent.post("/api/budget-actual")).send(corpo);
    expect(aceito.status).toBe(201);
  });

  it("o valor muda depois da pré-aprovação (PATCH): a linha volta a pendente e o envio é recusado", async () => {
    const { agent } = await agenteLogado("financial");
    const { evento, funcao, colab } = await cenario();
    const pre = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [linha(colab.id, funcao.id)] });
    const id = pre.body.linhas[0].id;

    // Mesmos valores: continua pré-aprovada (o "Enviar" sempre faz este PATCH antes do POST).
    const igual = await mutacao(agent.patch(`/api/budget-planned/${id}`)).send({ totalValue: 30_000, dailyValue: 10_000 });
    expect(igual.body.preAprovacaoDesfeita).toBe(false);
    expect(igual.body.status).toBe("pre_aprovado");

    const mudou = await mutacao(agent.patch(`/api/budget-planned/${id}`)).send({ totalValue: 35_000, mobility: 5_000 });
    expect(mudou.status).toBe(200);
    expect(mudou.body.preAprovacaoDesfeita).toBe(true);
    expect(mudou.body.status).toBe("pendente");
    expect(mudou.body.approvedBy).toBeNull();
    const auditoria = await logs(id);
    expect(auditoria.some((l) => JSON.stringify(l.newData).includes("o valor mudou"))).toBe(true);

    const envio = await mutacao(agent.post("/api/budget-actual")).send({ eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, plannedId: id, totalValue: 35_000 });
    expect(envio.status).toBe(409);
  });

  it("o PATCH não aceita status nem approvedBy do corpo", async () => {
    const { agent } = await agenteLogado("financial");
    const { evento, funcao, colab } = await cenario();
    const planejado = await ctx.storage.createBudgetPlanned({ eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id } as any);
    const res = await mutacao(agent.patch(`/api/budget-planned/${planejado.id}`)).send({ status: "pre_aprovado", approvedBy: "x" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pendente");
    expect(res.body.approvedBy).toBeNull();
  });

  it("marcar não participou derruba a pré-aprovação", async () => {
    const { agent } = await agenteLogado("financial");
    const { evento, funcao, colab } = await cenario();
    const pre = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [linha(colab.id, funcao.id)] });
    const res = await mutacao(agent.post(`/api/budget-planned/${pre.body.linhas[0].id}/toggle-not-attended`)).send({ reason: "faltou" });
    expect(res.body.didNotAttend).toBe(true);
    expect(res.body.status).toBe("pendente");
  });
});

describe("POST /api/budget-planned/desfazer-pre-aprovacao", () => {
  it("desfaz antes do envio; depois do envio fica (ignorada)", async () => {
    const { agent, user } = await agenteLogado("financial");
    const { evento, funcao } = await cenario();
    const [a, b] = await Promise.all([criarColaborador(), criarColaborador()]);
    const pre = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [linha(a.id, funcao.id), linha(b.id, funcao.id)] });
    const [la, lb] = pre.body.linhas as { id: string; collaboratorId: string }[];
    await ctx.db.insert(ctx.schema.budgetActual).values({ eventId: evento.id, plannedId: lb.id, collaboratorId: lb.collaboratorId, functionId: funcao.id, createdBy: user.id });

    const res = await mutacao(agent.post("/api/budget-planned/desfazer-pre-aprovacao")).send({ ids: [la.id, lb.id] });
    expect(res.status).toBe(200);
    expect(res.body.desfeitas).toBe(1);
    expect(res.body.ignoradas[0].motivo).toBe("já está no Realizado");
    const gravadas = await ctx.storage.getBudgetPlanned(evento.id);
    expect(gravadas.find((p) => p.id === la.id)?.status).toBe("pendente");
    expect(gravadas.find((p) => p.id === la.id)?.approvedBy).toBeNull();
    expect(gravadas.find((p) => p.id === lb.id)?.status).toBe("pre_aprovado");
    expect((await logs(la.id)).some((l) => JSON.stringify(l.newData).includes("desfeita"))).toBe(true);
  });

  it("Produção não desfaz (403)", async () => {
    const { agent } = await agenteLogado("production");
    expect((await mutacao(agent.post("/api/budget-planned/desfazer-pre-aprovacao")).send({ ids: ["x"] })).status).toBe(403);
  });
});

describe("PATCH /api/events/:id/ocultar-valores", () => {
  it("evento novo nasce com 'não exibir valores' ligado; o DP desliga, com auditoria", async () => {
    const { agent } = await agenteLogado("financial");
    const evento = await criarEvento();
    expect(evento.ocultarValoresColaborador).toBe(true);
    const res = await mutacao(agent.patch(`/api/events/${evento.id}/ocultar-valores`)).send({ ocultar: false });
    expect(res.status).toBe(200);
    expect(res.body.ocultarValoresColaborador).toBe(false);
    expect((await logs(evento.id)).some((l) => JSON.stringify(l.newData).includes("exibir valores"))).toBe(true);
  });

  it("Produção e Compras não mudam (403); o PATCH comum do evento ignora o campo", async () => {
    const evento = await criarEvento();
    for (const papel of ["production", "purchasing"] as const) {
      const { agent } = await agenteLogado(papel);
      expect((await mutacao(agent.patch(`/api/events/${evento.id}/ocultar-valores`)).send({ ocultar: false })).status).toBe(403);
    }
    const { agent } = await agenteLogado("admin");
    await mutacao(agent.patch(`/api/events/${evento.id}`)).send({ ocultarValoresColaborador: false });
    const [depois] = await ctx.db.select().from(ctx.schema.events).where(eq(ctx.schema.events.id, evento.id));
    expect(depois.ocultarValoresColaborador).toBe(true);
  });

  it("corpo inválido → 400", async () => {
    const { agent } = await agenteLogado("financial");
    const evento = await criarEvento();
    expect((await mutacao(agent.patch(`/api/events/${evento.id}/ocultar-valores`)).send({ ocultar: "sim" })).status).toBe(400);
  });
});

describe("Legado no Painel de honorários", () => {
  it("recorte Fluxo novo × Legado com contagens e 'Concluir em lote' só no legado", async () => {
    const { agent, user } = await agenteLogado("financial");
    // Termina antes de 01/11/2026 → legado; o outro é fluxo novo.
    const antigo = await criarEvento({ startDate: "2026-10-10", endDate: "2026-10-12" });
    const novo = await criarEvento({ startDate: "2099-10-10", endDate: "2099-10-12" });
    const funcao = await criarFuncao();
    const [c1, c2, c3] = await Promise.all([criarColaborador(), criarColaborador(), criarColaborador()]);
    const vagaSemPlanejado = await criarVaga({ eventId: antigo.id, functionId: funcao.id, collaboratorId: c1.id, userId: user.id, scheduleStartDate: "2026-10-10", scheduleEndDate: "2026-10-12" });
    const planejado = await ctx.storage.createBudgetPlanned({ eventId: antigo.id, collaboratorId: c2.id, functionId: funcao.id, totalValue: 10_000 } as any);
    const vagaNova = await criarVaga({ eventId: novo.id, functionId: funcao.id, collaboratorId: c3.id, userId: user.id });

    const legado = await agent.get(`/api/rh/controle?eventId=${antigo.id}&recorte=legado`);
    expect(legado.status).toBe(200);
    expect(legado.body.itens.map((i: { id: string }) => i.id).sort()).toEqual([`pl-${planejado.id}`, `ti-${vagaSemPlanejado.id}`].sort());
    expect(legado.body.itens.every((i: { legado: boolean }) => i.legado)).toBe(true);
    expect(legado.body.contadores.recortes).toMatchObject({ legado: 2, fluxoNovo: 0 });
    expect(legado.body.dataDeCorte).toBe("2026-11-01");
    // Cada linha leva a posição na trilha única
    expect(legado.body.itens[0].trilha.etapa).toBe("previsto");

    const fluxoNovo = await agent.get(`/api/rh/controle?eventId=${antigo.id}&recorte=fluxo_novo`);
    expect(fluxoNovo.body.itens).toHaveLength(0);
    const doNovo = await agent.get(`/api/rh/controle?eventId=${novo.id}&recorte=fluxo_novo`);
    expect(doNovo.body.itens.map((i: { id: string }) => i.id)).toEqual([`ti-${vagaNova.id}`]);
    expect((await agent.get("/api/rh/controle?recorte=qualquer")).status).toBe(400);

    // Motivo curto → 400; não-legado é recusado; legado é concluído com auditoria.
    expect((await mutacao(agent.post("/api/rh/controle/legado/concluir")).send({ ids: [`ti-${vagaSemPlanejado.id}`], motivo: "ok" })).status).toBe(400);
    const res = await mutacao(agent.post("/api/rh/controle/legado/concluir")).send({
      ids: [`ti-${vagaSemPlanejado.id}`, `pl-${planejado.id}`, `ti-${vagaNova.id}`],
      motivo: "Pago fora do sistema antes do fluxo novo",
    });
    expect(res.status).toBe(200);
    expect(res.body.concluidas).toBe(2);
    expect(res.body.recusadas).toEqual([{ id: `ti-${vagaNova.id}`, motivo: "o evento não é legado" }]);
    const auditoria = await ctx.db.select().from(ctx.schema.systemLogs)
      .where(and(eq(ctx.schema.systemLogs.entityType, "honorarios_legado"), eq(ctx.schema.systemLogs.userId, user.id)));
    expect(auditoria).toHaveLength(1);

    const deNovo = await mutacao(agent.post("/api/rh/controle/legado/concluir")).send({ ids: [`ti-${vagaSemPlanejado.id}`], motivo: "Pago fora do sistema" });
    expect(deNovo.body).toMatchObject({ concluidas: 0, jaConcluidas: 1 });

    const depois = await agent.get(`/api/rh/controle?eventId=${antigo.id}&recorte=legado`);
    const linhaConcluida = depois.body.itens.find((i: { id: string }) => i.id === `ti-${vagaSemPlanejado.id}`);
    expect(linhaConcluida.conclusaoForaDoFluxo).toMatchObject({ motivo: "Pago fora do sistema antes do fluxo novo", porNome: user.name });
    expect(linhaConcluida.trilha.desvio).toBe("concluido_fora_do_fluxo");
    expect(linhaConcluida.rhPrecisaAgir).toBe(false);
    expect(depois.body.contadores.recortes.legadoConcluido).toBe(2);
    // Nada foi apagado
    expect(await ctx.storage.getBudgetPlanned(antigo.id)).toHaveLength(1);
  });

  it("Produção não conclui o legado (403)", async () => {
    const { agent } = await agenteLogado("production");
    expect((await mutacao(agent.post("/api/rh/controle/legado/concluir")).send({ ids: ["ti-x"], motivo: "qualquer motivo" })).status).toBe(403);
  });
});

describe("Data de corte do legado", () => {
  it("DP lê (padrão 01/11/2026) e não muda; o administrador muda, com validação e auditoria", async () => {
    const dp = await agenteLogado("financial");
    const lida = await dp.agent.get("/api/honorarios/data-de-corte");
    expect(lida.status).toBe(200);
    expect(lida.body).toEqual({ dataDeCorte: "2026-11-01", padrao: "2026-11-01", podeEditar: false });
    expect((await mutacao(dp.agent.put("/api/honorarios/data-de-corte")).send({ dataDeCorte: "2026-12-01" })).status).toBe(403);

    const admin = await agenteLogado("admin");
    expect((await mutacao(admin.agent.put("/api/honorarios/data-de-corte")).send({ dataDeCorte: "2026-02-30" })).status).toBe(400);
    const salva = await mutacao(admin.agent.put("/api/honorarios/data-de-corte")).send({ dataDeCorte: "2026-12-01" });
    expect(salva.status).toBe(200);
    expect((await dp.agent.get("/api/honorarios/data-de-corte")).body.dataDeCorte).toBe("2026-12-01");
    expect((await logs("honorarios_data_corte")).length).toBeGreaterThan(0);
    // Volta ao padrão (os outros testes do arquivo contam com 01/11/2026).
    await mutacao(admin.agent.put("/api/honorarios/data-de-corte")).send({ dataDeCorte: "2026-11-01" });

    const producao = await agenteLogado("production");
    expect((await producao.agent.get("/api/honorarios/data-de-corte")).status).toBe(403);
  });
});

// ── Revisão de 27/10 ─────────────────────────────────────────────────────────
describe("Achado A — evento legado não exige a pré-aprovação", () => {
  it("legado (termina antes do corte): POST com plannedId pendente → 201; fluxo novo continua 409", async () => {
    const { agent } = await agenteLogado("financial");
    const funcao = await criarFuncao();
    const colab = await criarColaborador();
    const antigo = await criarEvento({ startDate: "2026-10-10", endDate: "2026-10-12" });
    const pendenteAntigo = await ctx.storage.createBudgetPlanned({ eventId: antigo.id, collaboratorId: colab.id, functionId: funcao.id, totalValue: 30_000 } as any);
    const legado = await mutacao(agent.post("/api/budget-actual")).send({ ...linha(colab.id, funcao.id, 31_000), eventId: antigo.id, plannedId: pendenteAntigo.id });
    expect(legado.status).toBe(201);

    const novo = await criarEvento();
    const pendenteNovo = await ctx.storage.createBudgetPlanned({ eventId: novo.id, collaboratorId: colab.id, functionId: funcao.id, totalValue: 30_000 } as any);
    const recusado = await mutacao(agent.post("/api/budget-actual")).send({ ...linha(colab.id, funcao.id), eventId: novo.id, plannedId: pendenteNovo.id });
    expect(recusado.status).toBe(409);
    expect(recusado.body.codigo).toBe("sem_pre_aprovacao");
  });
});

describe("Achado B — vagas sem colaborador na mesma função", () => {
  async function duasVagas() {
    const { agent, user } = await agenteLogado("financial");
    const { evento, funcao } = await cenario();
    const v1 = await criarVaga({ eventId: evento.id, functionId: funcao.id, collaboratorId: null, userId: user.id });
    const v2 = await criarVaga({ eventId: evento.id, functionId: funcao.id, collaboratorId: null, userId: user.id });
    const semColab = (vaga: string, total: number, plannedId?: string) => ({ ...linha("x", funcao.id, total), collaboratorId: null, teamInclusionId: vaga, plannedId });
    return { agent, user, evento, funcao, v1, v2, semColab };
  }

  it("pré-aprova as duas com valores diferentes: cada uma com a SUA linha; pré-aprovar só a 2ª não mexe na 1ª", async () => {
    const { agent, evento, v1, v2, semColab } = await duasVagas();
    const res = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [semColab(v1.id, 30_000), semColab(v2.id, 40_000)] });
    expect(res.status).toBe(200);
    expect(res.body.preAprovadas).toBe(2);
    let gravadas = await ctx.storage.getBudgetPlanned(evento.id);
    expect(gravadas).toHaveLength(2);
    const daVaga = (id: string) => gravadas.find((p) => p.teamInclusionId === id)!;
    expect(daVaga(v1.id).totalValue).toBe(30_000);
    expect(daVaga(v2.id).totalValue).toBe(40_000);
    const primeiraAntes = daVaga(v1.id);

    const so2 = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [semColab(v2.id, 45_000)] });
    expect(so2.status).toBe(200);
    gravadas = await ctx.storage.getBudgetPlanned(evento.id);
    expect(gravadas).toHaveLength(2);
    expect(daVaga(v2.id).totalValue).toBe(45_000);
    expect(daVaga(v1.id)).toMatchObject({ id: primeiraAntes.id, totalValue: 30_000, status: "pre_aprovado" });
    expect(new Date(daVaga(v1.id).updatedAt).getTime()).toBe(new Date(primeiraAntes.updatedAt).getTime());
  });

  it("linhas antigas (sem vaga): a 2ª vaga adota a linha que a tela mostra e grava a vaga nela; a 1ª fica intacta", async () => {
    const { agent, evento, funcao, v2, semColab } = await duasVagas();
    const velha1 = await ctx.storage.createBudgetPlanned({ eventId: evento.id, collaboratorId: null, functionId: funcao.id, totalValue: 30_000 } as any);
    const velha2 = await ctx.storage.createBudgetPlanned({ eventId: evento.id, collaboratorId: null, functionId: funcao.id, totalValue: 40_000 } as any);
    const res = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [semColab(v2.id, 41_000, velha2.id)] });
    expect(res.status).toBe(200);
    expect(res.body.linhas[0].id).toBe(velha2.id);
    const gravadas = await ctx.storage.getBudgetPlanned(evento.id);
    expect(gravadas.find((p) => p.id === velha2.id)).toMatchObject({ teamInclusionId: v2.id, totalValue: 41_000, status: "pre_aprovado" });
    expect(gravadas.find((p) => p.id === velha1.id)).toMatchObject({ teamInclusionId: null, totalValue: 30_000, status: "pendente" });
  });

  it("vaga de outro evento ou repetida → 400", async () => {
    const { agent, user, evento, v1, semColab } = await duasVagas();
    const deOutroEvento = await criarVaga({ collaboratorId: null, userId: user.id });
    expect((await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [semColab(deOutroEvento.id, 30_000)] })).status).toBe(400);
    expect((await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [semColab(v1.id, 30_000), semColab(v1.id, 30_000)] })).status).toBe(400);
  });
});

describe("Achado C — o envio ao Realizado confere com o pré-aprovado", () => {
  it("valor ou pessoa diferente → 409 valor_diferente_do_pre_aprovado; igual → 201", async () => {
    const { agent } = await agenteLogado("financial");
    const { evento, funcao, colab } = await cenario();
    const outro = await criarColaborador();
    const pre = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [linha(colab.id, funcao.id)] });
    const plannedId = pre.body.linhas[0].id;
    const base = { ...linha(colab.id, funcao.id), eventId: evento.id, plannedId };

    const maisCaro = await mutacao(agent.post("/api/budget-actual")).send({ ...base, totalValue: 99_000 });
    expect(maisCaro.status).toBe(409);
    expect(maisCaro.body.codigo).toBe("valor_diferente_do_pre_aprovado");
    expect(maisCaro.body.message).toMatch(/pré-aprovou/);
    const outraPessoa = await mutacao(agent.post("/api/budget-actual")).send({ ...base, collaboratorId: outro.id });
    expect(outraPessoa.status).toBe(409);
    expect(outraPessoa.body.codigo).toBe("valor_diferente_do_pre_aprovado");
    expect(await ctx.storage.getBudgetActual(evento.id)).toHaveLength(0);

    expect((await mutacao(agent.post("/api/budget-actual")).send(base)).status).toBe(201);
  });
});

describe("Achado D — PATCH que troca a vaga desfaz a pré-aprovação", () => {
  it("trocar o colaborador volta a pendente, com auditoria do que mudou; o mesmo colaborador não desfaz", async () => {
    const { agent } = await agenteLogado("financial");
    const { evento, funcao, colab } = await cenario();
    const outro = await criarColaborador();
    const pre = await mutacao(agent.post("/api/budget-planned/pre-aprovar")).send({ eventId: evento.id, linhas: [linha(colab.id, funcao.id)] });
    const id = pre.body.linhas[0].id;

    const mesmo = await mutacao(agent.patch(`/api/budget-planned/${id}`)).send({ collaboratorId: colab.id, functionId: funcao.id, eventId: evento.id });
    expect(mesmo.body).toMatchObject({ status: "pre_aprovado", preAprovacaoDesfeita: false });

    const trocou = await mutacao(agent.patch(`/api/budget-planned/${id}`)).send({ collaboratorId: outro.id });
    expect(trocou.status).toBe(200);
    expect(trocou.body).toMatchObject({ status: "pendente", approvedBy: null, preAprovacaoDesfeita: true, collaboratorId: outro.id });
    const registro = (await logs(id)).find((l) => JSON.stringify(l.newData).includes("a vaga mudou"));
    expect(registro).toBeTruthy();
    expect((registro!.newData as { camposQueMudaram: string[] }).camposQueMudaram).toEqual(["collaboratorId"]);
  });
});
