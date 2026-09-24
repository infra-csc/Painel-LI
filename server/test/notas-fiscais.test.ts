/**
 * Testes de rota — notas fiscais (24/09): quem lança, anexo só do sistema,
 * aprovação/devolução e check-in único. Rodar: `npm run test:rotas`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  criarEvento,
  criarFuncao,
  mutacao,
  type Contexto,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

/** Evento + função + colaborador + prestação ENVIADA (elegível para NF). */
async function cenarioComPrestacao(createdBy: string) {
  const evento = await criarEvento();
  const funcao = await criarFuncao();
  const colab = await criarColaborador();
  const [prestacao] = await ctx.db.insert(ctx.schema.budgetActual).values({
    eventId: evento.id,
    collaboratorId: colab.id,
    functionId: funcao.id,
    collaboratorType: "freela",
    dailyQuantity: 2,
    dailyValue: 5000,
    totalValue: 10_000,
    sentForReview: true,
    rhStatus: "pendente",
    createdBy,
  }).returning();
  return { evento, funcao, colab, prestacao };
}

const corpoDaNota = (c: Awaited<ReturnType<typeof cenarioComPrestacao>>, extras: Record<string, unknown> = {}) => ({
  eventId: c.evento.id,
  collaboratorId: c.colab.id,
  functionId: c.funcao.id,
  budgetActualId: c.prestacao.id,
  oc: `OC-${c.prestacao.id.slice(0, 6)}`,
  attachmentUrl: "/api/attachments/ATT-1700000000000-ABC123XYZ/view",
  attachmentName: "nota.pdf",
  status: "enviada",
  ...extras,
});

async function notaEnviada(agent: Awaited<ReturnType<typeof agenteLogado>>["agent"], userId: string) {
  const c = await cenarioComPrestacao(userId);
  const res = await mutacao(agent.post("/api/invoices")).send(corpoDaNota(c));
  expect(res.status).toBe(200);
  expect(res.body.status).toBe("enviada");
  return { ...c, nota: res.body as { id: string } };
}

describe("POST /api/invoices", () => {
  it("por function_area → 403", async () => {
    const admin = await agenteLogado("admin");
    const c = await cenarioComPrestacao(admin.user.id);
    const { agent } = await agenteLogado("function_area");
    const res = await mutacao(agent.post("/api/invoices")).send(corpoDaNota(c));
    expect(res.status).toBe(403);
    expect(await ctx.storage.getInvoices(c.evento.id)).toHaveLength(0);
  });

  it("attachmentUrl fora do padrão /api/attachments/ATT-.../view → 400", async () => {
    const { agent, user } = await agenteLogado("financial");
    const c = await cenarioComPrestacao(user.id);
    for (const url of ["https://evil.example/nota.pdf", "/api/attachments/../../etc/passwd", "javascript:alert(1)"]) {
      const res = await mutacao(agent.post("/api/invoices")).send(corpoDaNota(c, { attachmentUrl: url }));
      expect(res.status, url).toBe(400);
      expect(res.body.message, url).toContain("Anexo da nota inválido");
    }
    expect(await ctx.storage.getInvoices(c.evento.id)).toHaveLength(0);
  });

  it("nasce 'enviada' mesmo mandando status 'aprovada' e paymentDate no corpo", async () => {
    const { agent, user } = await agenteLogado("financial");
    const c = await cenarioComPrestacao(user.id);
    // (checkinAt/approvedAt são timestamp → z.date(): string ISO já cai no 400 do zod)
    const res = await mutacao(agent.post("/api/invoices")).send(corpoDaNota(c, { status: "aprovada", paymentDate: "2099-01-01", checkinBy: user.id }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("enviada");
    expect(res.body.checkinAt).toBeNull();
    expect(res.body.checkinBy).toBeNull();
    expect(res.body.paymentDate).toBeNull();
    expect(res.body.approvedAt).toBeNull();
  });

  it("segunda NF para a mesma prestação → 409", async () => {
    const { agent, user } = await agenteLogado("financial");
    const c = await notaEnviada(agent, user.id);
    const res = await mutacao(agent.post("/api/invoices")).send(corpoDaNota(c));
    expect(res.status).toBe(409);
  });
});

describe("POST /api/invoices/:id/approve", () => {
  /**
   * Comportamento IMPLEMENTADO: a rota checa `podeAprovarNota` ANTES do
   * UPDATE guardado e responde 400 ("Só é possível aprovar uma nota com
   * status 'enviada'") para NF já aprovada. O 409 só sai quando o status muda
   * ENTRE a checagem e o UPDATE (corrida). O briefing esperava 409.
   */
  it("aprovar → 200 'aprovada'; aprovar de novo → 400 e o histórico não ganha 2ª aprovação", async () => {
    const { agent, user } = await agenteLogado("financial");
    const { nota } = await notaEnviada(agent, user.id);

    const res = await mutacao(agent.post(`/api/invoices/${nota.id}/approve`)).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("aprovada");
    expect(res.body.approvedAt).not.toBeNull();

    const denovo = await mutacao(agent.post(`/api/invoices/${nota.id}/approve`)).send({});
    expect(denovo.status).toBe(400);
    expect(denovo.body.message).toContain("enviada");

    const noBanco = await ctx.storage.getInvoice(nota.id);
    const historico = JSON.parse(noBanco?.history || "[]") as { type: string }[];
    expect(historico.filter((h) => h.type === "aprovado")).toHaveLength(1);
    expect(historico.map((h) => h.type)).toEqual(["enviado", "aprovado"]);
  });
});

describe("POST /api/invoices/:id/return", () => {
  /**
   * Devolver exige motivo desde 24/09: o colaborador recebe a NF de volta e
   * precisa saber o que corrigir.
   */
  it("devolver sem comentário → 400 (o colaborador precisa saber o que corrigir)", async () => {
    const { agent, user } = await agenteLogado("financial");
    const { nota } = await notaEnviada(agent, user.id);
    const res = await mutacao(agent.post(`/api/invoices/${nota.id}/return`)).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/motivo/i);
    const soEspacos = await mutacao(agent.post(`/api/invoices/${nota.id}/return`)).send({ comment: "   " });
    expect(soEspacos.status).toBe(400);
  });

  it("devolver com comentário → grava o comentário e o evento no histórico; devolver de novo → 400", async () => {
    const { agent, user } = await agenteLogado("financial");
    const { nota } = await notaEnviada(agent, user.id);
    const res = await mutacao(agent.post(`/api/invoices/${nota.id}/return`)).send({ comment: "Falta o número da OC" });
    expect(res.status).toBe(200);
    expect(res.body.returnComment).toBe("Falta o número da OC");
    const historico = JSON.parse(res.body.history) as { type: string; comment?: string }[];
    expect(historico.at(-1)).toMatchObject({ type: "devolvido", comment: "Falta o número da OC" });

    const denovo = await mutacao(agent.post(`/api/invoices/${nota.id}/return`)).send({ comment: "x" });
    expect(denovo.status).toBe(400);
  });
});

describe("POST /api/invoices/:id/checkin", () => {
  /**
   * Comportamento IMPLEMENTADO: `podeFazerCheckin` recusa com 400 ("Esta nota
   * já teve check-in") antes do UPDATE guardado; o 409 é só para a corrida.
   */
  it("check-in exige NF aprovada e data; segundo check-in → 400 e checkinAt não muda", async () => {
    const { agent, user } = await agenteLogado("financial");
    const { nota } = await notaEnviada(agent, user.id);

    // Ainda 'enviada' → 400
    const cedo = await mutacao(agent.post(`/api/invoices/${nota.id}/checkin`)).send({ paymentDate: "2099-10-20" });
    expect(cedo.status).toBe(400);

    expect((await mutacao(agent.post(`/api/invoices/${nota.id}/approve`)).send({})).status).toBe(200);

    // Sem data → 400
    const semData = await mutacao(agent.post(`/api/invoices/${nota.id}/checkin`)).send({});
    expect(semData.status).toBe(400);
    expect(semData.body.message).toContain("data");

    const ok = await mutacao(agent.post(`/api/invoices/${nota.id}/checkin`)).send({ paymentDate: "2099-10-20" });
    expect(ok.status).toBe(200);
    expect(ok.body.checkinAt).not.toBeNull();
    expect(ok.body.checkinBy).toBe(user.id);
    expect(ok.body.paymentDate).toBe("2099-10-20");

    const denovo = await mutacao(agent.post(`/api/invoices/${nota.id}/checkin`)).send({ paymentDate: "2099-10-21" });
    expect(denovo.status).toBe(400);
    expect(denovo.body.message).toContain("check-in");

    const noBanco = await ctx.storage.getInvoice(nota.id);
    expect(noBanco?.checkinAt?.toISOString()).toBe(ok.body.checkinAt);
    expect(noBanco?.paymentDate).toBe("2099-10-20");
  });
});
