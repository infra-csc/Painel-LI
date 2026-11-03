/**
 * Histórico de emissões (29/10) — GET /api/contratos/historico-de-emissoes,
 * sobre o PGlite.
 *
 *  - permissão: a mesma da tela de Contratos (admin + financial); produção,
 *    compras, área e Honorários → 403; sem login → 401;
 *  - só conta nota ENVIADA ou APROVADA (pendente, devolvida e recusada não);
 *  - a empresa é o CNPJ da nota (ou o da prestação, sem ele); CNPJ inválido
 *    não conta; agrupa por CNPJ com eventos, notas, datas e valor;
 *  - razão social do contrato quando há; formato mascarado do CNPJ;
 *  - só as notas do colaborador pedido; colaborador inexistente → 404; sem
 *    parâmetro → 400;
 *  - a resposta não carrega dado bancário nem CPF.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { completarCnpj, digitosDoCnpj } from "@shared/cnpj";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, mutacao, type Contexto, type TestAgent } from "./harness";

let ctx: Contexto;
let dp: { agent: TestAgent; user: { id: string } };

beforeAll(async () => {
  ctx = await criarApp();
  dp = await agenteLogado("financial");
});

let seq = 810_000;
const cnpjNovo = () => digitosDoCnpj(completarCnpj(`${String(++seq).padStart(8, "0")}0001`));

async function nota(o: {
  collaboratorId: string;
  eventName: string;
  status: string;
  nfCnpj?: string | null;
  nfValor?: number | null;
  prestacao?: { cnpj?: string | null; razao?: string | null; total?: number };
  aprovadaEm?: Date | null;
  criadaEm?: Date;
  history?: unknown[];
}) {
  const evento = await criarEvento({ name: o.eventName });
  const funcao = await criarFuncao();
  let budgetActualId: string | null = null;
  if (o.prestacao) {
    const [a] = await ctx.db.insert(ctx.schema.budgetActual).values({
      eventId: evento.id, collaboratorId: o.collaboratorId, functionId: funcao.id, collaboratorType: "freela", dailyQuantity: 1, dailyValue: 10_000,
      totalValue: o.prestacao.total ?? 10_000, sentForReview: true, rhStatus: "aprovado",
      cnpjEmissor: o.prestacao.cnpj ?? null, razaoSocialEmissor: o.prestacao.razao ?? null,
    }).returning();
    budgetActualId = a.id;
  }
  const [n] = await ctx.db.insert(ctx.schema.invoices).values({
    eventId: evento.id, collaboratorId: o.collaboratorId, functionId: funcao.id, budgetActualId, status: o.status,
    nfCnpj: o.nfCnpj ?? null, nfValor: o.nfValor ?? null, approvedAt: o.aprovadaEm ?? null,
    ...(o.criadaEm ? { createdAt: o.criadaEm } : {}),
    ...(o.history ? { history: o.history as never } : {}),
  }).returning();
  return { nota: n, evento };
}

const consultar = (id: string, agent: TestAgent = dp.agent) => agent.get(`/api/contratos/historico-de-emissoes?colaboradorId=${id}`);

describe("Histórico de emissões — permissão e parâmetros", () => {
  it("sem login → 401; admin e financial leem; os demais papéis → 403", async () => {
    const colab = await criarColaborador();
    const anonimo = await (await import("supertest")).default(ctx.app).get(`/api/contratos/historico-de-emissoes?colaboradorId=${colab.id}`);
    expect(anonimo.status).toBe(401);
    expect((await consultar(colab.id)).status).toBe(200);
    expect((await consultar(colab.id, (await agenteLogado("admin")).agent)).status).toBe(200);
    for (const papel of ["production", "purchasing", "function_area", "honorarios"] as const) {
      const { agent } = await agenteLogado(papel);
      expect((await consultar(colab.id, agent)).status, papel).toBe(403);
    }
  });

  it("sem colaboradorId → 400; colaborador que não existe → 404", async () => {
    expect((await dp.agent.get("/api/contratos/historico-de-emissoes")).status).toBe(400);
    expect((await consultar("nao-existe")).status).toBe(404);
  });

  it("não é engolida pela rota /api/contratos/:id", async () => {
    const colab = await criarColaborador();
    const r = await consultar(colab.id);
    expect(r.status).toBe(200);
    expect(r.body.colaborador.id).toBe(colab.id);
  });
});

describe("Histórico de emissões — o que conta e como agrupa", () => {
  it("colaborador sem notas → lista vazia", async () => {
    const colab = await criarColaborador();
    const r = await consultar(colab.id);
    expect(r.body.empresas).toEqual([]);
    expect(r.body.totalDeNotas).toBe(0);
    expect(r.body.truncado).toBe(false);
    expect(r.headers["cache-control"]).toContain("no-store");
  });

  it("só nota enviada ou aprovada conta; pendente, devolvida e recusada ficam de fora", async () => {
    const colab = await criarColaborador();
    const cnpj = cnpjNovo();
    await nota({ collaboratorId: colab.id, eventName: "Enviado", status: "enviada", nfCnpj: cnpj, nfValor: 50_000 });
    await nota({ collaboratorId: colab.id, eventName: "Aprovado", status: "aprovada", nfCnpj: cnpj, nfValor: 70_000 });
    for (const status of ["pendente", "devolvida", "recusada"]) {
      await nota({ collaboratorId: colab.id, eventName: `Fora ${status}`, status, nfCnpj: cnpj, nfValor: 99_000 });
    }
    const r = await consultar(colab.id);
    expect(r.body.empresas).toHaveLength(1);
    const e = r.body.empresas[0];
    expect(e.notas).toBe(2);
    expect(e.valorTotal).toBe(120_000);
    expect(e.emissoes.map((m: { eventoNome: string }) => m.eventoNome).sort()).toEqual(["Aprovado", "Enviado"]);
    expect(e.emissoes.map((m: { status: string }) => m.status).sort()).toEqual(["aprovada", "enviada"]);
  });

  it("agrupa por CNPJ: eventos, notas, primeira e última data, valor, CNPJ formatado e razão social do contrato", async () => {
    const colab = await criarColaborador();
    const a = cnpjNovo();
    const b = cnpjNovo();
    await ctx.db.insert(ctx.schema.contratos).values({ cnpj: a, razaoSocial: "Montagens do Contrato Ltda", tipo: "empresa" });
    await nota({ collaboratorId: colab.id, eventName: "Antigo", status: "aprovada", nfCnpj: a, nfValor: 10_000, aprovadaEm: new Date("2026-03-10T15:00:00Z"), prestacao: { cnpj: a, razao: "Razão da prestação" } });
    await nota({ collaboratorId: colab.id, eventName: "Recente", status: "aprovada", nfCnpj: a, nfValor: 25_000, aprovadaEm: new Date("2026-09-20T15:00:00Z") });
    await nota({ collaboratorId: colab.id, eventName: "Outra empresa", status: "enviada", nfCnpj: b, nfValor: 5_000, history: [{ type: "enviado", at: "2026-10-05T12:00:00Z" }, { type: "reenviado", at: "2026-10-08T12:00:00Z" }], prestacao: { cnpj: b, razao: "Segunda Empresa ME" } });

    const r = await consultar(colab.id);
    expect(r.status).toBe(200);
    expect(r.body.empresas.map((e: { cnpj: string }) => e.cnpj)).toEqual([b, a]); // a mais recente primeiro
    const [segunda, primeira] = r.body.empresas;
    expect(primeira).toMatchObject({
      cnpj: a, cnpjFormatado: completarCnpj(a), razaoSocial: "Montagens do Contrato Ltda", eventos: 2, notas: 2,
      primeiraData: "2026-03-10", ultimaData: "2026-09-20", valorTotal: 35_000, semValor: 0,
    });
    expect(primeira.contratoId).toBeTruthy();
    expect(primeira.emissoes.map((m: { eventoNome: string }) => m.eventoNome)).toEqual(["Recente", "Antigo"]);
    expect(segunda).toMatchObject({ razaoSocial: "Segunda Empresa ME", contratoId: null, eventos: 1, notas: 1, primeiraData: "2026-10-08", ultimaData: "2026-10-08" });
    expect(r.body.totalDeNotas).toBe(3);
  });

  it("sem CNPJ na nota usa o da prestação; valor cai para o total da prestação; CNPJ inválido ou ausente não conta", async () => {
    const colab = await criarColaborador();
    const cnpj = cnpjNovo();
    await nota({ collaboratorId: colab.id, eventName: "Pela prestação", status: "aprovada", aprovadaEm: new Date("2026-08-01T15:00:00Z"), prestacao: { cnpj, razao: "Empresa da Prestação", total: 88_000 } });
    await nota({ collaboratorId: colab.id, eventName: "CNPJ inválido", status: "aprovada", nfCnpj: "11222333000100", aprovadaEm: new Date("2026-08-02T15:00:00Z") });
    await nota({ collaboratorId: colab.id, eventName: "Sem CNPJ", status: "aprovada", aprovadaEm: new Date("2026-08-03T15:00:00Z") });
    const r = await consultar(colab.id);
    expect(r.body.empresas).toHaveLength(1);
    expect(r.body.empresas[0]).toMatchObject({ cnpj, razaoSocial: "Empresa da Prestação", valorTotal: 88_000, notas: 1 });
  });

  it("devolve só as notas do colaborador pedido (nota de outra pessoa no mesmo CNPJ não entra)", async () => {
    const eu = await criarColaborador();
    const outro = await criarColaborador();
    const cnpj = cnpjNovo();
    await nota({ collaboratorId: eu.id, eventName: "Minha", status: "aprovada", nfCnpj: cnpj, nfValor: 1_000, aprovadaEm: new Date("2026-07-01T15:00:00Z") });
    await nota({ collaboratorId: outro.id, eventName: "Do outro", status: "aprovada", nfCnpj: cnpj, nfValor: 2_000, aprovadaEm: new Date("2026-07-02T15:00:00Z") });
    const r = await consultar(eu.id);
    expect(r.body.empresas[0].emissoes.map((m: { eventoNome: string }) => m.eventoNome)).toEqual(["Minha"]);
    expect(r.body.empresas[0].valorTotal).toBe(1_000);
  });

  it("não expõe dado bancário nem CPF", async () => {
    const colab = await criarColaborador();
    await nota({ collaboratorId: colab.id, eventName: "Qualquer", status: "aprovada", nfCnpj: cnpjNovo(), nfValor: 1_000 });
    const texto = JSON.stringify((await consultar(colab.id)).body);
    for (const proibido of ["officialDocument", "doc-", "banco", "agencia", "pixChave", "conta"]) expect(texto).not.toContain(proibido);
  });

  it("é leitura: POST na mesma rota não existe", async () => {
    const colab = await criarColaborador();
    const r = await mutacao(dp.agent.post(`/api/contratos/historico-de-emissoes?colaboradorId=${colab.id}`)).send({});
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});
