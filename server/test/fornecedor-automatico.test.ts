/**
 * Fornecedor aprovado automaticamente pelo histórico (28/10), sobre o PGlite.
 *
 *  - gatilhos na hora: nota fiscal aprovada (inclusive a do fluxo antigo, sem
 *    prestação) e pagamento marcado → o CNPJ vira contrato ATIVO (origem
 *    "automatico", vigência aberta, histórico, auditoria sem CPF) e a próxima
 *    OC não pede justificativa;
 *  - 28/10 (revisão, R6): registrar a OC (individual e lote) NÃO aprova — a
 *    pendência com justificativa continua;
 *  - 28/10 (revisão, S1): o automático só cria contrato novo ou confirma o que
 *    já é de quem passou — nunca liga o colaborador ao contrato de OUTRA
 *    pessoa (pendência "CNPJ já é de outro contrato" na varredura); a nota só
 *    conta com o CNPJ da prestação;
 *  - idempotência (não duplica contrato nem histórico);
 *  - encerrado à mão não volta; vigência do DP vencida não é mexida; contrato
 *    sem datas de quem passou ganha a vigência aberta;
 *  - varredura do passado: prévia (`?simular=1`) não grava, execução grava,
 *    segunda execução não faz nada;
 *  - papéis: só admin + financial; produção, compras, área e o perfil
 *    Honorários → 403.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hojeISO } from "@shared/hoje-sp";
import { completarCnpj, digitosDoCnpj, mascararCnpj } from "@shared/cnpj";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, mutacao, unico, type Contexto, type TestAgent } from "./harness";

let ctx: Contexto;
let hoje: string;
let dp: { agent: TestAgent; user: { id: string } };

beforeAll(async () => {
  ctx = await criarApp();
  hoje = hojeISO();
  dp = await agenteLogado("financial");
});

let seqCnpj = 700_000;
const cnpjNovo = () => digitosDoCnpj(completarCnpj(`${String(++seqCnpj).padStart(8, "0")}0001`));

/** Prestação aprovada pela Conferência DP com o CNPJ do check-out final (sem contrato). */
async function prestacao(o: { collaboratorId?: string; eventId?: string; cnpj?: string | null; razao?: string; extras?: Record<string, unknown> } = {}) {
  const collaboratorId = o.collaboratorId ?? (await criarColaborador()).id;
  const eventId = o.eventId ?? (await criarEvento({ name: `Evento ${unico()}`, startDate: "2099-10-10", endDate: "2099-10-12" })).id;
  const funcao = await criarFuncao();
  const cnpj = o.cnpj === undefined ? cnpjNovo() : o.cnpj;
  const [a] = await ctx.db.insert(ctx.schema.budgetActual).values({
    eventId, collaboratorId, functionId: funcao.id, collaboratorType: "freela", dailyQuantity: 3, dailyValue: 40_000, totalValue: 120_000,
    sentForReview: true, rhStatus: "aprovado", cnpjEmissor: cnpj, razaoSocialEmissor: cnpj ? (o.razao ?? "Fulano Eventos ME") : null,
    ...(o.extras ?? {}),
  }).returning();
  return { actual: a, eventId, funcaoId: funcao.id, collaboratorId, cnpj };
}

const registrarOc = (corpo: Record<string, unknown>, agent: TestAgent = dp.agent) => mutacao(agent.post("/api/ordens-de-compra")).send(corpo);
const JUST = "Contrato ainda não cadastrado (teste)";

/** NF da prestação (enviada) aprovada pelo DP — o gatilho "nota fiscal aprovada". */
async function aprovarNota(p: Awaited<ReturnType<typeof prestacao>>, nfCnpj: string | null = p.cnpj) {
  const [nota] = await ctx.db.insert(ctx.schema.invoices).values({
    eventId: p.eventId, collaboratorId: p.collaboratorId, functionId: p.funcaoId, budgetActualId: p.actual.id, status: "enviada", nfCnpj,
  }).returning();
  const r = await mutacao(dp.agent.post(`/api/invoices/${nota.id}/approve`)).send({});
  expect(r.status, r.text).toBe(200);
  return nota;
}

async function contratoDo(cnpj: string) {
  const [c] = await ctx.db.select().from(ctx.schema.contratos).where(eq(ctx.schema.contratos.cnpj, cnpj));
  return c ?? null;
}
async function contratosDo(cnpj: string) {
  return ctx.db.select().from(ctx.schema.contratos).where(eq(ctx.schema.contratos.cnpj, cnpj));
}
async function vinculosDo(contratoId: string) {
  return (await ctx.db.select().from(ctx.schema.contratosColaboradores).where(eq(ctx.schema.contratosColaboradores.contratoId, contratoId))).map((l) => l.collaboratorId).sort();
}
async function historicoDo(contratoId: string) {
  return ctx.db.select().from(ctx.schema.contratosHistorico).where(eq(ctx.schema.contratosHistorico.contratoId, contratoId));
}
const varrer = (simular: boolean, agent: TestAgent = dp.agent) => mutacao(agent.post(`/api/contratos/aprovacao-automatica${simular ? "?simular=1" : ""}`)).send({});

describe("gatilhos na hora", () => {
  it("OC registrada NÃO aprova (R6): a pendência fica; a nota aprovada cria o contrato e a OC seguinte do mesmo CNPJ sai SEM justificativa", async () => {
    const p = await prestacao({ razao: "LUCAS VINICIUS EVENTOS ME" });
    const sem = await registrarOc({ actualId: p.actual.id, numero: "4500100" });
    expect(sem.status).toBe(409);
    expect(sem.body.situacaoDoCnpj).toBe("sem_contrato");
    const r = await registrarOc({ actualId: p.actual.id, numero: "4500100", justificativa: JUST });
    expect(r.status, r.text).toBe(201);
    // A OC com justificativa continua como pendência — nada de contrato.
    expect(r.body.linha.cnpjEmissor.situacao).toBe("sem_contrato");
    expect(r.body.linha.oc.justificativa).toBe(JUST);
    expect(await contratoDo(p.cnpj!)).toBeNull();

    await aprovarNota(p);
    const c = (await contratoDo(p.cnpj!))!;
    expect(c).toMatchObject({ origem: "automatico", razaoSocial: "LUCAS VINICIUS EVENTOS ME", tipo: "empresa", vigenciaInicio: hoje, vigenciaFim: null, encerradoEm: null });
    // Vigência aberta: o menor entre o início do evento (2099) e a data da aprovação (hoje).
    expect(c.origemDetalhe).toMatch(/^Aprovado automaticamente: CNPJ já pago em Evento .+ em \d{2}\/\d{2}\/\d{4} \(nota fiscal aprovada\)\.$/);
    expect(await vinculosDo(c.id)).toEqual([p.collaboratorId]);
    const hist = await historicoDo(c.id);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ acao: "aprovado_automaticamente", porNome: "Aprovação automática", por: dp.user.id });
    expect(hist[0].detalhes[0]).toBe(c.origemDetalhe);

    const logs = await ctx.db.select().from(ctx.schema.systemLogs).where(eq(ctx.schema.systemLogs.entityId, c.id));
    expect(logs).toHaveLength(1);
    const dadosDoLog = JSON.stringify(logs[0]);
    expect(dadosDoLog).toContain(mascararCnpj(p.cnpj!));
    expect(dadosDoLog).toContain("Fornecedor aprovado automaticamente");

    // Mesmo CNPJ, outro evento: sem justificativa.
    const outra = await prestacao({ collaboratorId: p.collaboratorId, cnpj: p.cnpj });
    const r2 = await registrarOc({ actualId: outra.actual.id, numero: "4500101" });
    expect(r2.status, r2.text).toBe(201);
    expect(r2.body.linha.oc.justificativa).toBeNull();
    expect(r2.body.linha.acoes.exigeJustificativa).toBe(false);
    // Idempotente: nenhum contrato novo, nenhuma linha nova no histórico.
    await aprovarNota(outra);
    expect(await contratosDo(p.cnpj!)).toHaveLength(1);
    expect(await historicoDo(c.id)).toHaveLength(1);
  });

  it("outro colaborador com o MESMO CNPJ (S1): não é ligado ao contrato alheio; a OC dele pede justificativa e a varredura mostra a pendência", async () => {
    const a = await prestacao();
    await aprovarNota(a);
    const c = (await contratoDo(a.cnpj!))!;
    const b = await prestacao({ cnpj: a.cnpj });
    await aprovarNota(b);
    expect(await contratosDo(a.cnpj!)).toHaveLength(1);
    expect(await vinculosDo(c.id)).toEqual([a.collaboratorId]);
    expect(await historicoDo(c.id)).toHaveLength(1);
    expect((await contratoDo(a.cnpj!))!.versao).toBe(c.versao);
    // A pendência continua na OC dele…
    const oc = await registrarOc({ actualId: b.actual.id, numero: "4500201" });
    expect(oc.status).toBe(409);
    expect(oc.body.codigo).toBe("justificativa_obrigatoria");
    // …e aparece para o DP na varredura, sem gravar nada.
    const previa = await varrer(true);
    const item = previa.body.itens.find((i: { cnpj: string }) => i.cnpj === mascararCnpj(a.cnpj!));
    expect(item).toMatchObject({ decisao: "ja_aprovado", contratoId: c.id, pendentes: [{ id: b.collaboratorId }] });
    expect(item.descricao).toContain("CNPJ já é de outro contrato");
    expect(previa.body.resumo.pendentes).toBeGreaterThanOrEqual(1);
    await varrer(false);
    expect(await vinculosDo(c.id)).toEqual([a.collaboratorId]);
  });

  it("contrato do DP com OUTRA pessoa: a nota aprovada de quem não está nele não vincula (S1)", async () => {
    const dono = await criarColaborador();
    const p = await prestacao();
    const [k] = await ctx.db.insert(ctx.schema.contratos).values({ cnpj: p.cnpj!, razaoSocial: "Empresa do Dono ME", tipo: "mei", vigenciaInicio: "2026-01-01" }).returning();
    await ctx.db.insert(ctx.schema.contratosColaboradores).values({ contratoId: k.id, collaboratorId: dono.id });
    await aprovarNota(p);
    expect(await vinculosDo(k.id)).toEqual([dono.id]);
    expect((await contratoDo(p.cnpj!))!.versao).toBe(k.versao);
    const previa = await varrer(true);
    const item = previa.body.itens.find((i: { cnpj: string }) => i.cnpj === mascararCnpj(p.cnpj!));
    expect(item).toMatchObject({ decisao: "pendente", contratoId: k.id, pendentes: [{ id: p.collaboratorId }] });
  });

  it("nota com CNPJ digitado diferente do da prestação não aprova ninguém (S1)", async () => {
    const p = await prestacao();
    const outroCnpj = cnpjNovo();
    await aprovarNota(p, outroCnpj);
    expect(await contratoDo(outroCnpj)).toBeNull();
    expect(await contratoDo(p.cnpj!)).toBeNull();
  });

  it("OC em lote também NÃO aprova (R6)", async () => {
    const evento = await criarEvento();
    const p = await prestacao({ eventId: evento.id });
    const r = await mutacao(dp.agent.post("/api/ordens-de-compra/lote")).send({ eventId: evento.id, texto: `${p.actual.id};4500300`, justificativa: JUST });
    expect(r.status, r.text).toBe(200);
    expect(r.body.registradas).toBe(1);
    expect(r.body.linhas[0].cnpjEmissor.situacao).toBe("sem_contrato");
    expect(await contratoDo(p.cnpj!)).toBeNull();
  });

  it("prestação sem CNPJ → nada a aprovar", async () => {
    const p = await prestacao({ cnpj: null });
    const antes = (await ctx.db.select().from(ctx.schema.contratos)).length;
    await aprovarNota(p, null);
    expect((await ctx.db.select().from(ctx.schema.contratos)).length).toBe(antes);
  });

  it("nota fiscal aprovada (fluxo antigo, sem prestação) com o CNPJ da nota → aprova (cria; nunca vincula a contrato alheio)", async () => {
    const colab = await criarColaborador();
    const evento = await criarEvento({ startDate: "2025-03-01", endDate: "2025-03-02" });
    const funcao = await criarFuncao();
    const cnpj = cnpjNovo();
    const [nota] = await ctx.db.insert(ctx.schema.invoices).values({
      eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, status: "enviada", nfCnpj: cnpj,
    }).returning();
    const r = await mutacao(dp.agent.post(`/api/invoices/${nota.id}/approve`)).send({});
    expect(r.status, r.text).toBe(200);
    const c = (await contratoDo(cnpj))!;
    expect(c).toMatchObject({ origem: "automatico", razaoSocial: "Razão social não informada", vigenciaInicio: "2025-03-01" });
    expect(c.origemDetalhe).toContain("(nota fiscal aprovada)");
    expect(await vinculosDo(c.id)).toEqual([colab.id]);
  });

  it("pagamento marcado → aprova (prestação que passou pela OC e pela nota sem o gatilho)", async () => {
    // OC e nota gravadas direto no banco (como um importador faria): só o pago dispara.
    const p = await prestacao({ extras: { ocNumero: "4500500", ocValor: 120_000, ocData: hoje, ocRegistradaEm: new Date() } });
    await ctx.db.insert(ctx.schema.invoices).values({
      eventId: p.eventId, collaboratorId: p.collaboratorId, functionId: p.funcaoId, budgetActualId: p.actual.id, oc: "4500500",
      status: "aprovada", approvedAt: new Date(), checkinAt: new Date(), paymentDate: hoje, nfValor: 120_000,
    });
    expect(await contratoDo(p.cnpj!)).toBeNull();
    const r = await mutacao(dp.agent.post("/api/pagamentos/marcar-pago")).send({ actualIds: [p.actual.id], pagoEm: hoje });
    expect(r.status, r.text).toBe(200);
    expect(r.body.pagas).toBe(1);
    const c = (await contratoDo(p.cnpj!))!;
    expect(c.origem).toBe("automatico");
    expect(await vinculosDo(c.id)).toEqual([p.collaboratorId]);
  });
});

describe("decisões do DP valem", () => {
  it("contrato automático ENCERRADO à mão não volta: a OC seguinte pede justificativa e a varredura o lista como ignorado", async () => {
    const p = await prestacao();
    await aprovarNota(p);
    const c = (await contratoDo(p.cnpj!))!;
    const enc = await mutacao(dp.agent.post(`/api/contratos/${c.id}/encerrar`)).send({ versao: c.versao, motivo: "CNPJ baixado" });
    expect(enc.status, enc.text).toBe(200);

    const outra = await prestacao({ collaboratorId: p.collaboratorId, cnpj: p.cnpj });
    const sem = await registrarOc({ actualId: outra.actual.id, numero: "4500601" });
    expect(sem.status).toBe(409);
    expect(sem.body.situacaoDoCnpj).toBe("contrato_inativo");
    expect((await registrarOc({ actualId: outra.actual.id, numero: "4500601", justificativa: JUST })).status).toBe(201);
    await aprovarNota(outra);
    const depois = (await contratoDo(p.cnpj!))!;
    expect(depois.encerradoEm).not.toBeNull();
    expect(depois.versao).toBe(enc.body.versao);

    const previa = await varrer(true);
    const item = previa.body.itens.find((i: { cnpj: string }) => i.cnpj === mascararCnpj(p.cnpj!));
    expect(item).toMatchObject({ decisao: "ignorado", contratoId: c.id });
    expect(item.descricao).toMatch(/encerrado/i);
  });

  it("vigência do DP vencida não é mexida; contrato do DP sem datas, de quem passou, ganha a vigência aberta", async () => {
    const vencido = await prestacao();
    const [kv] = await ctx.db.insert(ctx.schema.contratos).values({ cnpj: vencido.cnpj!, razaoSocial: "Vencida ME", tipo: "mei", vigenciaInicio: "2020-01-01", vigenciaFim: "2020-12-31" }).returning();
    await ctx.db.insert(ctx.schema.contratosColaboradores).values({ contratoId: kv.id, collaboratorId: vencido.collaboratorId });
    await aprovarNota(vencido);
    expect(await contratoDo(vencido.cnpj!)).toMatchObject({ vigenciaFim: "2020-12-31", versao: kv.versao, origem: "cadastro" });

    const semDatas = await prestacao();
    const [ks] = await ctx.db.insert(ctx.schema.contratos).values({ cnpj: semDatas.cnpj!, razaoSocial: "Sem Datas ME", tipo: "mei" }).returning();
    await ctx.db.insert(ctx.schema.contratosColaboradores).values({ contratoId: ks.id, collaboratorId: semDatas.collaboratorId });
    await aprovarNota(semDatas);
    const k = (await contratoDo(semDatas.cnpj!))!;
    expect(k).toMatchObject({ vigenciaInicio: hoje, vigenciaFim: null, origem: "cadastro", versao: ks.versao + 1 });
    expect(await vinculosDo(k.id)).toEqual([semDatas.collaboratorId]);
    expect((await historicoDo(k.id))[0].detalhes.join(" ")).toContain("Vigência aberta");
    const r = await registrarOc({ actualId: semDatas.actual.id, numero: "4500701" });
    expect(r.status, r.text).toBe(201);
    expect(r.body.linha.cnpjEmissor.situacao).toBe("contrato_ativo");
  });
});

describe("varredura do passado", () => {
  it("prévia não grava; execução grava; a segunda execução não faz nada; OC sem pago não entra (R6)", async () => {
    // Histórico gravado direto (antes desta função existir): OC, pago e nota antiga.
    const comOc = await prestacao({ extras: { ocNumero: "4500800", ocData: "2026-09-01", ocRegistradaEm: new Date() } });
    const pago = await prestacao({ extras: { pagoEm: "2026-09-05" } });
    const colab = await criarColaborador();
    const evAntigo = await criarEvento({ name: `Antigo ${unico()}`, startDate: "2025-01-10", endDate: "2025-01-11" });
    const funcao = await criarFuncao();
    const cnpjAntigo = cnpjNovo();
    await ctx.db.insert(ctx.schema.invoices).values([
      { eventId: evAntigo.id, collaboratorId: colab.id, functionId: funcao.id, status: "aprovada", nfCnpj: cnpjAntigo, approvedAt: new Date("2025-01-20T12:00:00Z") },
      // Nota antiga SEM CNPJ e nota não aprovada: não contam.
      { eventId: evAntigo.id, collaboratorId: colab.id, functionId: funcao.id, status: "aprovada" },
      { eventId: evAntigo.id, collaboratorId: colab.id, functionId: funcao.id, status: "enviada", nfCnpj: cnpjNovo() },
    ]);
    const nossos = [pago.cnpj!, cnpjAntigo].map(mascararCnpj);
    const antes = (await ctx.db.select().from(ctx.schema.contratos)).length;

    const previa = await varrer(true);
    expect(previa.status, previa.text).toBe(200);
    expect(previa.headers["cache-control"]).toContain("no-store");
    expect(previa.body.simulado).toBe(true);
    expect(previa.body.itens.find((i: { cnpj: string }) => i.cnpj === mascararCnpj(comOc.cnpj!))).toBeUndefined();
    const itens = previa.body.itens.filter((i: { cnpj: string }) => nossos.includes(i.cnpj));
    expect(itens).toHaveLength(2);
    for (const i of itens) expect(i.decisao).toBe("criar");
    const antigo = itens.find((i: { cnpj: string }) => i.cnpj === mascararCnpj(cnpjAntigo));
    expect(antigo).toMatchObject({ evento: evAntigo.name, data: "2025-01-20", gatilho: "nota fiscal aprovada", colaboradores: [{ id: colab.id, nome: colab.fullName }], pendentes: [] });
    expect(antigo.frase).toBe(`Aprovado automaticamente: CNPJ já pago em ${evAntigo.name} em 20/01/2025 (nota fiscal aprovada).`);
    expect((await ctx.db.select().from(ctx.schema.contratos)).length).toBe(antes);

    const exec = await varrer(false);
    expect(exec.status, exec.text).toBe(200);
    expect(exec.body.simulado).toBe(false);
    expect(exec.body.aprovados).toBeGreaterThanOrEqual(2);
    expect(exec.body.restantes.criar + exec.body.restantes.atualizar).toBe(0);
    for (const d of [pago.cnpj!, cnpjAntigo]) expect((await contratoDo(d))?.origem).toBe("automatico");
    expect(await contratoDo(comOc.cnpj!)).toBeNull();
    expect((await contratoDo(cnpjAntigo))?.vigenciaInicio).toBe("2025-01-10");

    const de2 = await varrer(false);
    expect(de2.body.aprovados).toBe(0);
    expect(de2.body.resumo.criar + de2.body.resumo.atualizar).toBe(0);
    for (const d of [pago.cnpj!, cnpjAntigo]) expect(await contratosDo(d)).toHaveLength(1);

    // A lista da tela traz a origem.
    const lista = await dp.agent.get("/api/contratos");
    const k = lista.body.contratos.find((c: { cnpj: string }) => c.cnpj === cnpjAntigo);
    expect(k).toMatchObject({ origem: "automatico", situacao: "ativo" });
    expect(k.origemDetalhe).toContain("nota fiscal aprovada");
  });

  it("papéis: admin roda; produção, compras, área de função e o perfil Honorários → 403", async () => {
    const admin = await agenteLogado("admin");
    expect((await varrer(true, admin.agent)).status).toBe(200);
    for (const papel of ["production", "purchasing", "function_area", "honorarios"] as const) {
      const { agent } = await agenteLogado(papel);
      expect((await varrer(true, agent)).status, papel).toBe(403);
      expect((await varrer(false, agent)).status, papel).toBe(403);
    }
  });
});
