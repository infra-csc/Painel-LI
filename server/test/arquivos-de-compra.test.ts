/**
 * Honorários, Fase 3 — ARQUIVOS (28/10), sobre o PGlite:
 *
 *  - compra Flash: prévia (CPF mascarado, avisos, manuais só com a opção),
 *    lote (nº, vínculo dos créditos, o segundo clique → 409 e nada em dobro),
 *    arquivo do lote (marca do layout provisório, CPF completo, auditoria sem
 *    CPF), cancelar (motivo; créditos voltam a "a comprar"), pago à Flash;
 *    lançamento manual dentro de lote não muda nem sai;
 *  - arquivo de OC do M4: prestadores aprovados sem OC + linha do lote Flash,
 *    por evento e por período; evento legado → 409;
 *  - papéis: Compras, produção, Área de Função e o perfil Honorários → 403.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hojeISO } from "@shared/hoje-sp";
import { completarCpf } from "@shared/pagamento";
import { completarCnpj, digitosDoCnpj } from "@shared/cnpj";
import { agenteLogado, criarApp, criarEvento, criarFuncao, mutacao, unico, type Contexto, type TestAgent } from "./harness";

let ctx: Contexto;
let hoje: string;
let dp: { agent: TestAgent; user: { id: string } };

beforeAll(async () => {
  ctx = await criarApp();
  hoje = hojeISO();
  dp = await agenteLogado("financial");
});

let seqCpf = 700_000;
const cpfNovo = () => { seqCpf += 7; return completarCpf(`${String(Date.now() % 1000).padStart(3, "0")}${String(seqCpf).padStart(6, "0")}`); };
let seqCnpj = 800_000;
const cnpjNovo = () => digitosDoCnpj(completarCnpj(`${String(++seqCnpj).padStart(8, "0")}0001`));

async function colaborador(o: { semCpf?: boolean; inativo?: boolean; nome?: string } = {}) {
  const cpf = cpfNovo();
  const colab = await ctx.storage.createCollaborator({
    fullName: o.nome ?? `Freela ${unico()}`, officialDocument: o.semCpf ? `RG${unico()}` : cpf, documentType: o.semCpf ? "rg" : "cpf",
    type: "freela", city: "Campinas - SP", status: o.inativo ? "inativo" : "aprovado", active: !o.inativo,
  } as any);
  return { colab, cpf };
}

async function credito(p: { collaboratorId: string; eventId?: string | null; category?: "alimentacao" | "mobilidade"; amountCents?: number; movementDate?: string; sourceType?: string; type?: string }) {
  const [m] = await ctx.db.insert(ctx.schema.flashMovements).values({
    collaboratorId: p.collaboratorId, eventId: p.eventId ?? null, category: p.category ?? "alimentacao", type: p.type ?? "credito",
    amountCents: p.amountCents ?? 1000, movementDate: p.movementDate ?? "2099-10-11", description: "teste",
    sourceType: p.sourceType ?? "comparativo", sourceRef: p.sourceType === "manual" ? null : `ref-${unico()}`,
  }).returning();
  return m;
}

const PERIODO = { inicio: "2099-10-01", fim: "2099-10-31" };
const previa = (q: Record<string, string>, agent: TestAgent = dp.agent) => agent.get(`/api/flash/compras/previa?${new URLSearchParams(q)}`);
const gerar = (corpo: Record<string, unknown>, agent: TestAgent = dp.agent) => mutacao(agent.post("/api/flash/compras")).send(corpo);

async function movimento(id: string) {
  const [m] = await ctx.db.select().from(ctx.schema.flashMovements).where(eq(ctx.schema.flashMovements.id, id));
  return m;
}
async function logsDe(entityId: string) {
  return ctx.db.select().from(ctx.schema.systemLogs).where(eq(ctx.schema.systemLogs.entityId, entityId));
}

/** Evento com dois créditos (alimentação + mobilidade) de um colaborador com CPF; devolve o lote gerado. */
async function loteDoEvento() {
  const evento = await criarEvento();
  const { colab, cpf } = await colaborador();
  const a = await credito({ collaboratorId: colab.id, eventId: evento.id, amountCents: 4500 });
  const b = await credito({ collaboratorId: colab.id, eventId: evento.id, category: "mobilidade", amountCents: 2000 });
  const pv = await previa({ ...PERIODO, eventId: evento.id });
  expect(pv.status, pv.text).toBe(200);
  const r = await gerar({ ...PERIODO, eventId: evento.id, assinatura: pv.body.assinatura });
  expect(r.status, r.text).toBe(201);
  return { evento, colab, cpf, a, b, lote: r.body.lote };
}

describe("compra Flash: prévia", () => {
  it("por colaborador, CPF mascarado; sem CPF fica fora, inativo avisa; manual só com a opção", async () => {
    const evento = await criarEvento();
    const bom = await colaborador({ nome: `Bruno Bom ${unico()}` });
    const semCpf = await colaborador({ semCpf: true, nome: `Ana Sem CPF ${unico()}` });
    const inativo = await colaborador({ inativo: true, nome: `Caio Inativo ${unico()}` });
    await credito({ collaboratorId: bom.colab.id, eventId: evento.id, amountCents: 3000 });
    await credito({ collaboratorId: bom.colab.id, eventId: evento.id, category: "mobilidade", amountCents: 1500 });
    await credito({ collaboratorId: bom.colab.id, eventId: evento.id, amountCents: 999, type: "debito" });
    await credito({ collaboratorId: bom.colab.id, eventId: evento.id, amountCents: 35000, sourceType: "manual" });
    await credito({ collaboratorId: semCpf.colab.id, eventId: evento.id, amountCents: 2000 });
    await credito({ collaboratorId: inativo.colab.id, eventId: evento.id, amountCents: 700 });
    await credito({ collaboratorId: bom.colab.id, eventId: evento.id, amountCents: 100, movementDate: "2099-11-02" });

    const r = await previa({ ...PERIODO, eventId: evento.id });
    expect(r.status, r.text).toBe(200);
    expect(r.text).not.toContain(bom.cpf);
    const porNome = (n: string) => r.body.linhas.find((l: { nome: string }) => l.nome.startsWith(n));
    expect(porNome("Bruno Bom")).toMatchObject({ alimentacaoCents: 3000, mobilidadeCents: 1500, totalCents: 4500, entra: true, lancamentos: 2 });
    expect(porNome("Bruno Bom").cpfMascarado).toMatch(/^•••\./);
    expect(porNome("Ana Sem CPF")).toMatchObject({ entra: false, cpfMascarado: null });
    expect(porNome("Caio Inativo").avisos.map((a: { codigo: string }) => a.codigo)).toEqual(["inativo"]);
    expect(r.body.totais).toMatchObject({ colaboradores: 2, totalCents: 5200 });
    expect(r.body.foraDoLote).toMatchObject({ colaboradores: 1, totalCents: 2000 });
    expect(r.body.formato.provisorio).toBe(true);

    const comManuais = await previa({ ...PERIODO, eventId: evento.id, manuais: "1" });
    expect(comManuais.body.totais.totalCents).toBe(5200 + 35000);
  });

  it("período inválido → 400", async () => {
    expect((await previa({ inicio: "2099-10-31", fim: "2099-10-01" })).status).toBe(400);
    expect((await previa({ inicio: "x", fim: "2099-10-01" })).status).toBe(400);
  });
});

describe("compra Flash: lote", () => {
  it("gera o lote com nº, amarra os créditos; o segundo clique não compra de novo (409)", async () => {
    const evento = await criarEvento();
    const { colab } = await colaborador();
    const a = await credito({ collaboratorId: colab.id, eventId: evento.id, amountCents: 4000 });
    const b = await credito({ collaboratorId: colab.id, eventId: evento.id, category: "mobilidade", amountCents: 1000 });
    const pv = await previa({ ...PERIODO, eventId: evento.id });
    const corpo = { ...PERIODO, eventId: evento.id, assinatura: pv.body.assinatura };
    const [r1, r2] = await Promise.all([gerar(corpo), gerar(corpo)]);
    const ok = [r1, r2].filter((r) => r.status === 201);
    const recusado = [r1, r2].filter((r) => r.status === 409);
    expect(ok).toHaveLength(1);
    expect(recusado).toHaveLength(1);
    expect(recusado[0].body.codigo).toMatch(/mudou|nada_a_comprar/);
    const lote = ok[0].body.lote;
    expect(lote).toMatchObject({ status: "gerado", colaboradores: 1, lancamentos: 2, totalCents: 5000, totalAlimentacaoCents: 4000, totalMobilidadeCents: 1000 });
    expect(lote.numero).toBe(pv.body.proximoNumero);
    expect(lote.evento.id).toBe(evento.id);
    expect((await movimento(a.id)).compraId).toBe(lote.id);
    expect((await movimento(b.id)).compraId).toBe(lote.id);
    const depois = await previa({ ...PERIODO, eventId: evento.id });
    expect(depois.body.linhas).toHaveLength(0);
    const lista = await dp.agent.get("/api/flash/compras");
    expect(lista.status).toBe(200);
    expect(lista.body.lotes.find((l: { id: string }) => l.id === lote.id)).toMatchObject({ numero: lote.numero, acoes: { baixar: true, cancelar: true, marcarPago: true } });
    const logs = JSON.stringify(await logsDe(lote.id));
    expect(logs).toContain("gerou o lote");
  });

  it("assinatura velha (crédito novo depois da prévia) → 409 mudou; nada é gravado", async () => {
    const evento = await criarEvento();
    const { colab } = await colaborador();
    await credito({ collaboratorId: colab.id, eventId: evento.id });
    const pv = await previa({ ...PERIODO, eventId: evento.id });
    const novo = await credito({ collaboratorId: colab.id, eventId: evento.id, category: "mobilidade" });
    const r = await gerar({ ...PERIODO, eventId: evento.id, assinatura: pv.body.assinatura });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("mudou");
    expect((await movimento(novo.id)).compraId).toBeNull();
  });

  it("arquivo do lote: marca do layout provisório, CPF completo; a auditoria não guarda o CPF", async () => {
    const { cpf, lote } = await loteDoEvento();
    const r = await dp.agent.get(`/api/flash/compras/${lote.id}/arquivo?formato=csv`).buffer(true);
    expect(r.status, r.text).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/csv/);
    expect(r.headers["content-disposition"]).toContain(`compra-flash-lote-${lote.numero}-layout-provisorio.csv`);
    const linhas = r.text.replace(/^﻿/, "").trim().split("\r\n");
    expect(linhas[0]).toMatch(/^LAYOUT PROVISÓRIO/);
    expect(linhas[1]).toBe("CPF;Nome;Alimentação (R$);Mobilidade (R$);Total (R$);Lote");
    expect(linhas[2]).toBe(`${cpf.replace(/\D/g, "")};${linhas[2].split(";")[1]};45,00;20,00;65,00;${lote.numero}`);
    const xlsx = await dp.agent.get(`/api/flash/compras/${lote.id}/arquivo?formato=xlsx`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers["content-type"]).toMatch(/spreadsheetml/);
    const logs = JSON.stringify(await logsDe(lote.id));
    expect(logs).toContain("baixou o arquivo");
    expect(logs).not.toContain(cpf.replace(/\D/g, ""));
  });

  it("cancelar: exige motivo, devolve os créditos para \"a comprar\" e o arquivo some; não cancela duas vezes", async () => {
    const { evento, a, b, lote } = await loteDoEvento();
    expect((await mutacao(dp.agent.post(`/api/flash/compras/${lote.id}/cancelar`)).send({ motivo: "x" })).status).toBe(400);
    const r = await mutacao(dp.agent.post(`/api/flash/compras/${lote.id}/cancelar`)).send({ motivo: "Valor errado no comparativo" });
    expect(r.status, r.text).toBe(200);
    expect(r.body.creditosDevolvidos).toBe(2);
    expect(r.body.lote).toMatchObject({ status: "cancelado", cancelamento: { motivo: "Valor errado no comparativo" }, acoes: { baixar: false, cancelar: false, marcarPago: false } });
    expect((await movimento(a.id)).compraId).toBeNull();
    expect((await movimento(b.id)).compraId).toBeNull();
    expect((await previa({ ...PERIODO, eventId: evento.id })).body.totais.lancamentos).toBe(2);
    const de_novo = await mutacao(dp.agent.post(`/api/flash/compras/${lote.id}/cancelar`)).send({ motivo: "Outra vez por engano" });
    expect(de_novo.status).toBe(409);
    expect(de_novo.body.codigo).toBe("lote_cancelado");
    expect((await dp.agent.get(`/api/flash/compras/${lote.id}/arquivo`)).status).toBe(409);
    expect(JSON.stringify(await logsDe(lote.id))).toContain("cancelou o lote");
  });

  it("pago à Flash: data no futuro → 400; depois de pago não cancela", async () => {
    const { lote } = await loteDoEvento();
    const futuro = await mutacao(dp.agent.post(`/api/flash/compras/${lote.id}/pago`)).send({ pagoEm: "2999-01-01" });
    expect(futuro.status).toBe(400);
    const r = await mutacao(dp.agent.post(`/api/flash/compras/${lote.id}/pago`)).send({ pagoEm: hoje });
    expect(r.status, r.text).toBe(200);
    expect(r.body.lote).toMatchObject({ status: "pago", pagoEm: hoje, acoes: { baixar: true, cancelar: false, marcarPago: false } });
    const cancelar = await mutacao(dp.agent.post(`/api/flash/compras/${lote.id}/cancelar`)).send({ motivo: "Tarde demais para isso" });
    expect(cancelar.status).toBe(409);
    expect(cancelar.body.codigo).toBe("lote_pago");
    expect((await mutacao(dp.agent.post(`/api/flash/compras/${lote.id}/pago`)).send({ pagoEm: hoje })).status).toBe(409);
  });

  it("lançamento manual dentro de lote vivo não é editado nem excluído (409 em_lote)", async () => {
    const evento = await criarEvento();
    const { colab } = await colaborador();
    const manual = await credito({ collaboratorId: colab.id, eventId: evento.id, sourceType: "manual", amountCents: 35000 });
    const pv = await previa({ ...PERIODO, eventId: evento.id, manuais: "1" });
    const r = await gerar({ ...PERIODO, eventId: evento.id, incluirManuais: true, assinatura: pv.body.assinatura });
    expect(r.status, r.text).toBe(201);
    const patch = await mutacao(dp.agent.patch(`/api/flash-movements/${manual.id}`)).send({
      collaboratorId: colab.id, category: "alimentacao", type: "credito", amountCents: 1, movementDate: "2099-10-11",
    });
    expect(patch.status).toBe(409);
    expect(patch.body.codigo).toBe("em_lote");
    expect((await mutacao(dp.agent.delete(`/api/flash-movements/${manual.id}`)).send()).status).toBe(409);
    // Cancelado o lote, volta a poder mudar.
    await mutacao(dp.agent.post(`/api/flash/compras/${r.body.lote.id}/cancelar`)).send({ motivo: "Refazer com outro valor" });
    expect((await mutacao(dp.agent.delete(`/api/flash-movements/${manual.id}`)).send()).status).toBe(200);
  });
});

describe("arquivo de OC do M4 (prestadores + Flash)", () => {
  async function prestacaoAprovada(eventId: string, total: number) {
    const { colab } = await colaborador();
    const funcao = await criarFuncao();
    const cnpj = cnpjNovo();
    const [k] = await ctx.db.insert(ctx.schema.contratos).values({ cnpj, razaoSocial: `Empresa ${unico()} ME`, tipo: "mei", vigenciaInicio: "2026-01-01", vigenciaFim: "2099-12-31" }).returning();
    await ctx.db.insert(ctx.schema.contratosColaboradores).values({ contratoId: k.id, collaboratorId: colab.id });
    const [a] = await ctx.db.insert(ctx.schema.budgetActual).values({
      eventId, collaboratorId: colab.id, functionId: funcao.id, collaboratorType: "freela", dailyQuantity: 1, dailyValue: total, totalValue: total,
      sentForReview: true, rhStatus: "aprovado", cnpjEmissor: cnpj, razaoSocialEmissor: "Prestadora Teste ME",
    }).returning();
    return { a, cnpj, funcao };
  }

  it("por evento: a prestação sem OC + uma linha por lote Flash do evento; CSV no layout provisório e auditado", async () => {
    const { evento, lote } = await loteDoEvento();
    const p = await prestacaoAprovada(evento.id, 123_456);
    const comOc = await prestacaoAprovada(evento.id, 50_000);
    expect((await mutacao(dp.agent.post("/api/ordens-de-compra")).send({ actualId: comOc.a.id, numero: "450900" })).status).toBe(201);

    const pv = await dp.agent.get(`/api/ordens-de-compra/arquivo-m4/previa?eventId=${evento.id}`);
    expect(pv.status, pv.text).toBe(200);
    expect(pv.body).toMatchObject({ prestadores: { linhas: 1, valorCents: 123_456 }, flash: { valorCents: lote.totalCents }, totalCents: 123_456 + lote.totalCents, linhas: 2 });
    expect(pv.body.formato.provisorio).toBe(true);

    const r = await dp.agent.get(`/api/ordens-de-compra/arquivo-m4?eventId=${evento.id}&formato=csv`).buffer(true);
    expect(r.status, r.text).toBe(200);
    expect(r.headers["content-disposition"]).toMatch(/oc-m4-evento-\d+-.*-layout-provisorio\.csv/);
    const linhas = r.text.replace(/^﻿/, "").trim().split("\r\n");
    expect(linhas[0]).toMatch(/^LAYOUT PROVISÓRIO/);
    expect(linhas[1].split(";")).toEqual(["Tipo", "CNPJ do fornecedor", "Razão social", "Valor (R$)", "Centro de custo", "Evento", "Data", "Função", "Descrição sugerida", "Referência"]);
    expect(linhas).toHaveLength(4);
    const prestador = linhas[2].split(";");
    expect(prestador[0]).toBe("Prestador");
    expect(prestador[1].replace(/\D/g, "")).toBe(p.cnpj);
    expect(prestador[3]).toBe("1234,56");
    expect(prestador[9]).toBe(p.a.id);
    expect(linhas[2]).toContain("Prestação de serviços de");
    const flash = linhas[3].split(";");
    expect(flash[0]).toBe("Flash");
    expect(flash[3]).toBe((lote.totalCents / 100).toFixed(2).replace(".", ","));
    expect(flash[8]).toContain(`lote ${lote.numero}`);
    expect(flash[9]).toBe(`Lote ${lote.numero}`);
    expect(JSON.stringify(await logsDe(evento.id))).toContain("arquivo de OC do M4");

    // O CSV antigo ("Exportar sem OC") continua igual.
    const antigo = await dp.agent.get(`/api/ordens-de-compra/exportar?eventId=${evento.id}`).buffer(true);
    expect(antigo.status).toBe(200);
    expect(antigo.text.replace(/^﻿/, "").split("\r\n")[0].split(";")[0]).toBe("Prestação");
  });

  it("lote cancelado não entra; por período pega os eventos que terminam nele e os lotes gerados nele", async () => {
    const { evento, lote } = await loteDoEvento();
    const ev2 = await criarEvento({ startDate: "2098-03-01", endDate: "2098-03-02" });
    await prestacaoAprovada(ev2.id, 10_000);
    const porPeriodo = await dp.agent.get("/api/ordens-de-compra/arquivo-m4/previa?inicio=2098-03-01&fim=2098-03-31");
    expect(porPeriodo.status, porPeriodo.text).toBe(200);
    expect(porPeriodo.body.prestadores).toMatchObject({ linhas: 1, valorCents: 10_000, eventos: 1 });
    const hojeNoPeriodo = await dp.agent.get(`/api/ordens-de-compra/arquivo-m4/previa?inicio=${hoje}&fim=${hoje}`);
    expect(hojeNoPeriodo.body.flash.lotes.map((l: { id: string }) => l.id)).toContain(lote.id);
    await mutacao(dp.agent.post(`/api/flash/compras/${lote.id}/cancelar`)).send({ motivo: "Lote gerado errado" });
    const semLote = await dp.agent.get(`/api/ordens-de-compra/arquivo-m4/previa?eventId=${evento.id}`);
    expect(semLote.body.flash.lotes).toHaveLength(0);
    expect((await dp.agent.get(`/api/ordens-de-compra/arquivo-m4?eventId=${evento.id}`)).status).toBe(409);
  });

  it("evento legado → 409; sem escopo → 400", async () => {
    const legado = await criarEvento({ startDate: "2020-01-01", endDate: "2020-01-02" });
    const r = await dp.agent.get(`/api/ordens-de-compra/arquivo-m4/previa?eventId=${legado.id}`);
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("evento_legado");
    expect((await dp.agent.get("/api/ordens-de-compra/arquivo-m4/previa")).status).toBe(400);
  });
});

describe("papéis", () => {
  it("Compras, produção, Área de Função e o perfil Honorários não chegam aos arquivos (403)", async () => {
    const { lote, evento } = await loteDoEvento();
    for (const papel of ["purchasing", "production", "function_area", "honorarios"] as const) {
      const { agent } = await agenteLogado(papel);
      const chamadas = [
        previa(PERIODO, agent),
        gerar({ ...PERIODO, assinatura: "0-00000000" }, agent),
        agent.get("/api/flash/compras"),
        agent.get(`/api/flash/compras/${lote.id}/arquivo`),
        mutacao(agent.post(`/api/flash/compras/${lote.id}/cancelar`)).send({ motivo: "motivo qualquer" }),
        mutacao(agent.post(`/api/flash/compras/${lote.id}/pago`)).send({ pagoEm: hoje }),
        agent.get(`/api/ordens-de-compra/arquivo-m4/previa?eventId=${evento.id}`),
        agent.get(`/api/ordens-de-compra/arquivo-m4?eventId=${evento.id}`),
      ];
      for (const r of await Promise.all(chamadas)) expect(r.status, `${papel} ${r.req.method} ${r.req.path}`).toBe(403);
    }
    const [l] = await ctx.db.select().from(ctx.schema.flashCompras).where(eq(ctx.schema.flashCompras.id, lote.id));
    expect(l.status).toBe("gerado");
  });

  it("admin também gera e baixa", async () => {
    const { agent } = await agenteLogado("admin");
    expect((await agent.get("/api/flash/compras")).status).toBe(200);
  });
});
