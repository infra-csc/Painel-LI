/**
 * Retorno do M4 por planilha (28/10), sobre o PGlite:
 *  - a prévia não grava; aplicar registra a OC (origem "m4"), programa a NF
 *    aprovada, marca pago e paga o lote Flash, com a auditoria "(retorno do M4)";
 *  - reimportar o mesmo arquivo não muda nada ("sem mudança");
 *  - valor divergente e evento do fluxo antigo ficam de fora;
 *  - CNPJ sem contrato ativo só entra com a justificativa;
 *  - papéis: só admin e DP (o resto → 403).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { hojeISO } from "@shared/hoje-sp";
import { completarCpf } from "@shared/pagamento";
import { completarCnpj, digitosDoCnpj } from "@shared/cnpj";
import { matrizDoCsv } from "@shared/retorno-m4";
import { agenteLogado, criarApp, criarEvento, criarFuncao, mutacao, unico, type Contexto, type TestAgent } from "./harness";

let ctx: Contexto;
let hoje: string;
let dp: { agent: TestAgent; user: { id: string } };

beforeAll(async () => {
  ctx = await criarApp();
  hoje = hojeISO();
  dp = await agenteLogado("financial");
});

let seqCpf = 910_000;
const cpfNovo = () => { seqCpf += 7; return completarCpf(`${String(Date.now() % 1000).padStart(3, "0")}${String(seqCpf).padStart(6, "0")}`); };
let seqCnpj = 920_000;
const cnpjNovo = () => digitosDoCnpj(completarCnpj(`${String(++seqCnpj).padStart(8, "0")}0001`));
let seqLote = 70_000 + Math.floor(Math.random() * 10_000);

const CAB = "Referência;Nº da OC;Situação;Data programada;Data de liquidação;Valor (R$)";
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");

async function prestacaoAprovada(eventId: string, total: number, o: { semContrato?: boolean } = {}) {
  const colab = await ctx.storage.createCollaborator({
    fullName: `Freela ${unico()}`, officialDocument: cpfNovo(), documentType: "cpf", type: "freela", city: "Campinas - SP", status: "aprovado", active: true,
  } as any);
  const funcao = await criarFuncao();
  const cnpj = cnpjNovo();
  if (!o.semContrato) {
    const [k] = await ctx.db.insert(ctx.schema.contratos).values({ cnpj, razaoSocial: `Empresa ${unico()} ME`, tipo: "mei", vigenciaInicio: "2026-01-01", vigenciaFim: "2099-12-31" }).returning();
    await ctx.db.insert(ctx.schema.contratosColaboradores).values({ contratoId: k.id, collaboratorId: colab.id });
  }
  const [a] = await ctx.db.insert(ctx.schema.budgetActual).values({
    eventId, collaboratorId: colab.id, functionId: funcao.id, collaboratorType: "freela", dailyQuantity: 1, dailyValue: total, totalValue: total,
    sentForReview: true, rhStatus: "aprovado", cnpjEmissor: cnpj, razaoSocialEmissor: "Prestadora Teste ME",
  }).returning();
  return a;
}

/** Prestação com OC registrada e a NF APROVADA (falta o "Lançar no M4"). */
async function comNotaAprovada(eventId: string, total: number, oc: string) {
  const a = await prestacaoAprovada(eventId, total);
  const r = await mutacao(dp.agent.post("/api/ordens-de-compra")).send({ actualId: a.id, numero: oc });
  expect(r.status, r.text).toBe(201);
  const [nf] = await ctx.db.insert(ctx.schema.invoices).values({
    eventId, collaboratorId: a.collaboratorId!, functionId: a.functionId!, budgetActualId: a.id, status: "aprovada", oc, nfValor: total, approvedAt: new Date(),
  }).returning();
  return { a, nf };
}

async function loteFlash(totalCents: number) {
  const [l] = await ctx.db.insert(ctx.schema.flashCompras).values({
    numero: ++seqLote, periodoInicio: "2099-10-01", periodoFim: "2099-10-31", status: "gerado", formato: "flash-provisorio-v1",
    colaboradores: 1, lancamentos: 1, totalAlimentacaoCents: totalCents, totalMobilidadeCents: 0, totalCents, itens: [],
  }).returning();
  return l;
}

const previa = (csv: string, agent: TestAgent = dp.agent) => mutacao(agent.post("/api/ordens-de-compra/retorno-m4/previa")).send({ matriz: matrizDoCsv(csv) });
const aplicar = (csv: string, justificativa?: string, agent: TestAgent = dp.agent) =>
  mutacao(agent.post("/api/ordens-de-compra/retorno-m4")).send({ matriz: matrizDoCsv(csv), justificativa });

const actual = async (id: string) => (await ctx.db.select().from(ctx.schema.budgetActual).where(eq(ctx.schema.budgetActual.id, id)))[0];
const nota = async (id: string) => (await ctx.db.select().from(ctx.schema.invoices).where(eq(ctx.schema.invoices.id, id)))[0];
const lote = async (id: string) => (await ctx.db.select().from(ctx.schema.flashCompras).where(eq(ctx.schema.flashCompras.id, id)))[0];
const logsDe = async (id: string) => JSON.stringify(await ctx.db.select().from(ctx.schema.systemLogs).where(eq(ctx.schema.systemLogs.entityId, id)));

describe("retorno do M4: prévia, aplicar e reimportar", () => {
  it("a prévia não grava; aplicar grava OC, programado, pago e o lote Flash; reimportar não muda nada", async () => {
    const evento = await criarEvento();
    const novo = await prestacaoAprovada(evento.id, 123_456);
    const { a: comNf, nf } = await comNotaAprovada(evento.id, 80_000, "OC-77");
    const divergente = await prestacaoAprovada(evento.id, 50_000);
    const l = await loteFlash(57_000);
    const csv = [
      "LAYOUT PROVISÓRIO — retorno do M4",
      `Tipo;${CAB}`,
      `Prestador;${novo.id};4500123;Emitida;;;1.234,56`,
      `Prestador;${comNf.id};OC-77;Liquidado;${dataBr(hoje)};${dataBr(hoje)};${reais(80_000)}`,
      `Prestador;${divergente.id};4500999;;;;499,99`,
      `Flash;Lote ${l.numero};OC-F;Liquidado;;${hoje};570,00`,
      "",
    ].join("\r\n");

    const pv = await previa(csv);
    expect(pv.status, pv.text).toBe(200);
    expect(pv.body.erro).toBeNull();
    expect(pv.body.formato.provisorio).toBe(true);
    expect(pv.body.resumo).toMatchObject({ total: 4, registrarOc: 1, programar: 1, marcarPago: 2, semMudanca: 0, problema: 1, aplicar: 3 });
    const porLinha = new Map(pv.body.linhas.map((x: { linha: number }) => [x.linha, x]));
    expect(porLinha.get(5)).toMatchObject({ resultado: "problema" });
    expect((porLinha.get(5) as { problemas: string[] }).problemas[0]).toMatch(/difere do aprovado/);
    // Nada gravado pela prévia.
    expect((await actual(novo.id)).ocNumero).toBeNull();
    expect((await nota(nf.id)).checkinAt).toBeNull();
    expect((await actual(comNf.id)).pagoEm).toBeNull();
    expect((await lote(l.id)).status).toBe("gerado");

    const r = await aplicar(csv);
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({ aplicadas: 3, ocsRegistradas: 1, programadas: 1, pagas: 1, lotesFlashPagos: 1, comProblema: 1, recusadas: [] });
    const depoisNovo = await actual(novo.id);
    expect(depoisNovo).toMatchObject({ ocNumero: "4500123", ocValor: 123_456, ocOrigem: "m4", ocRegistradaPor: dp.user.id });
    expect(String(depoisNovo.ocData).slice(0, 10)).toBe(hoje);
    const nfDepois = await nota(nf.id);
    expect(nfDepois.checkinAt).not.toBeNull();
    expect(String(nfDepois.paymentDate).slice(0, 10)).toBe(hoje);
    expect(JSON.stringify(nfDepois.history)).toContain("retorno do M4");
    expect(String((await actual(comNf.id)).pagoEm).slice(0, 10)).toBe(hoje);
    expect(await lote(l.id)).toMatchObject({ status: "pago" });
    expect((await actual(divergente.id)).ocNumero).toBeNull();
    expect(await logsDe(novo.id)).toContain("OC registrada (retorno do M4)");
    expect(await logsDe(nf.id)).toContain("NF lançada no M4 (retorno do M4)");
    expect(await logsDe(comNf.id)).toContain("marcada como paga (retorno do M4)");
    expect(await logsDe(l.id)).toContain("(retorno do M4)");
    const resumoDoImport = await ctx.db.select().from(ctx.schema.systemLogs).where(like(ctx.schema.systemLogs.entityId, "retorno-m4"));
    expect(resumoDoImport.length).toBeGreaterThan(0);

    // Reimportar o mesmo arquivo: nada muda, "já estava assim".
    const de_novo = await previa(csv);
    expect(de_novo.body.resumo).toMatchObject({ aplicar: 0, semMudanca: 3, problema: 1 });
    expect(de_novo.body.linhas.find((x: { linha: number }) => x.linha === 3).frase).toMatch(/já estava assim/);
    const pagoAntes = (await actual(comNf.id)).pagoRegistradoEm;
    const r2 = await aplicar(csv);
    expect(r2.status, r2.text).toBe(200);
    expect(r2.body).toMatchObject({ aplicadas: 0, semMudanca: 3, comProblema: 1 });
    expect((await actual(comNf.id)).pagoRegistradoEm).toEqual(pagoAntes);
  });

  it("evento do fluxo antigo é recusado e nada é gravado", async () => {
    const legado = await criarEvento({ startDate: "2020-01-01", endDate: "2020-01-02" });
    const a = await prestacaoAprovada(legado.id, 10_000);
    const csv = `${CAB}\n${a.id};4500;;;;100,00\n`;
    const pv = await previa(csv);
    expect(pv.body.linhas[0]).toMatchObject({ resultado: "problema" });
    expect(pv.body.linhas[0].problemas[0]).toMatch(/fluxo antigo/);
    const r = await aplicar(csv);
    expect(r.body).toMatchObject({ aplicadas: 0, comProblema: 1 });
    expect((await actual(a.id)).ocNumero).toBeNull();
  });

  it("CNPJ sem contrato ativo: sem justificativa a linha é recusada; com ela, entra", async () => {
    const evento = await criarEvento();
    const a = await prestacaoAprovada(evento.id, 20_000, { semContrato: true });
    const csv = `${CAB}\n${a.id};4600;;;;200,00\n`;
    const pv = await previa(csv);
    expect(pv.body.resumo).toMatchObject({ aplicar: 1, exigemJustificativa: 1 });
    const sem = await aplicar(csv);
    expect(sem.body.aplicadas).toBe(0);
    expect(sem.body.recusadas[0].motivos[0]).toMatch(/justificativa/);
    expect((await actual(a.id)).ocNumero).toBeNull();
    const com = await aplicar(csv, "Contrato em renovação no jurídico");
    expect(com.body.aplicadas).toBe(1);
    expect(await actual(a.id)).toMatchObject({ ocNumero: "4600", ocOrigem: "m4", ocJustificativa: "Contrato em renovação no jurídico" });
  });

  it("arquivo sem cabeçalho: a prévia diz o porquê e aplicar responde 400; corpo inválido → 400", async () => {
    const pv = await previa("A;B\n1;2\n");
    expect(pv.status).toBe(200);
    expect(pv.body.erro).toMatch(/cabeçalho/);
    expect((await aplicar("A;B\n1;2\n")).status).toBe(400);
    expect((await mutacao(dp.agent.post("/api/ordens-de-compra/retorno-m4/previa")).send({ texto: "x" })).status).toBe(400);
  });
});

describe("papéis", () => {
  it("Compras, produção e o perfil Honorários → 403; admin passa", async () => {
    const evento = await criarEvento();
    const a = await prestacaoAprovada(evento.id, 10_000);
    const csv = `${CAB}\n${a.id};4700;;;;100,00\n`;
    for (const papel of ["purchasing", "production", "honorarios"] as const) {
      const { agent } = await agenteLogado(papel);
      expect((await previa(csv, agent)).status, papel).toBe(403);
      expect((await aplicar(csv, undefined, agent)).status, papel).toBe(403);
    }
    expect((await actual(a.id)).ocNumero).toBeNull();
    const { agent: admin } = await agenteLogado("admin");
    expect((await previa(csv, admin)).status).toBe(200);
  });
});
