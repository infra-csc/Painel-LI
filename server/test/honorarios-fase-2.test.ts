/**
 * Módulo de Honorários, Fase 2 em modo MANUAL (28/10) — OC, NF com a OC,
 * conferência, pago, trilha e expurgo das selfies, sobre o PGlite.
 *
 *  - OC individual (padrão = aprovado; uma vez; legado e não aprovada → 409),
 *    sem contrato ativo exige justificativa, lote (prévia não grava; a
 *    confirmação relê o texto e grava só as válidas), desfazer bloqueado com NF;
 *  - portal: valores liberados depois da OC mesmo com "não exibir", envio da
 *    NF só com OC (OC travada na registrada, conta gravada cifrada), devolução
 *    visível e reenvio, "programado para" e "pago em";
 *  - pago só depois de programado (individual e lote), trilha com OC/Pago,
 *    exportação CSV, expurgo (prévia e execução, só pagas além do prazo);
 *  - papéis: Compras, produção (fora a NF como representante) e o perfil
 *    Honorários → 403.
 *
 * MOCK (só neste arquivo, como em anexos.test.ts): o Object Storage vira um
 * Map em memória — também o `apagarAnexo` do expurgo.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { hojeISO } from "@shared/hoje-sp";
import { completarCpf } from "@shared/pagamento";
import { completarCnpj, digitosDoCnpj } from "@shared/cnpj";
import {
  agenteLogado, criarApp, criarEvento, criarFuncao, mutacao, unico, ORIGEM_PERMITIDA, type Contexto, type TestAgent,
} from "./harness";

const armazenamento = vi.hoisted(() => ({ objetos: new Map<string, { conteudo: Buffer; metadata: Record<string, any> }>() }));

vi.mock("../objectStorage", async (importOriginal) => {
  const original = await importOriginal<typeof import("../objectStorage")>();
  const { gravarMetadadosDoAnexo } = await import("../objectAcl");
  const { Readable } = await import("node:stream");
  const { objetos } = armazenamento;
  class ArquivoEmMemoria {
    constructor(readonly id: string) {}
    async getMetadata() {
      const o = objetos.get(this.id);
      if (!o) { const err: any = new Error("No such object"); err.code = 404; throw err; }
      return [o.metadata];
    }
    async setMetadata(patch: Record<string, any>) {
      const o = objetos.get(this.id);
      if (!o) { const err: any = new Error("No such object"); err.code = 404; throw err; }
      o.metadata = { ...o.metadata, ...patch, metadata: { ...(o.metadata.metadata ?? {}), ...(patch.metadata ?? {}) } };
    }
    createReadStream() { return Readable.from([objetos.get(this.id)!.conteudo]); }
  }
  class ObjectStorageService extends original.ObjectStorageService {
    arquivoDoAnexo(id: string) {
      if (!original.ATTACHMENT_ID_RE.test(id)) throw new original.ObjectNotFoundError();
      return new ArquivoEmMemoria(id) as any;
    }
    async enviarAnexo(id: string, conteudo: Buffer, contentType: string, meta: { ownerId: string; nomeOriginal: string; classe?: "contrato" | "presenca" }) {
      objetos.set(id, { conteudo, metadata: { size: conteudo.length } });
      await gravarMetadadosDoAnexo(this.arquivoDoAnexo(id), { ...meta, contentType });
    }
    async apagarAnexo(id: string) {
      objetos.delete(id);
      return true;
    }
  }
  return { ...original, ObjectStorageService };
});

let ctx: Contexto;
let hoje: string;
let dp: { agent: TestAgent; user: { id: string } };
const CHAVE = randomBytes(32).toString("base64");
const SENHA = "senha-do-portal-2";
const PDF = Buffer.from("%PDF-1.4\n% nota fiscal de teste\n1 0 obj << >> endobj\n%%EOF\n");
const CONTA = "88123-4";

beforeAll(async () => {
  ctx = await criarApp();
  hoje = hojeISO();
  process.env.PAGAMENTO_CHAVE = CHAVE;
  dp = await agenteLogado("financial");
});
afterEach(() => { process.env.PAGAMENTO_CHAVE = CHAVE; });

const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

let sequencia = 300_000;
function cpfNovo(): string {
  sequencia += 11;
  return completarCpf(`${String(Date.now() % 1000).padStart(3, "0")}${String(sequencia).padStart(6, "0")}`);
}
let seqCnpj = 500_000;
const cnpjNovo = () => digitosDoCnpj(completarCnpj(`${String(++seqCnpj).padStart(8, "0")}0001`));

async function colaborador() {
  const cpf = cpfNovo();
  const colab = await ctx.storage.createCollaborator({
    fullName: `Freela ${unico()}`, officialDocument: cpf, documentType: "cpf",
    type: "freela", city: "Campinas - SP", status: "aprovado", active: true,
  } as any);
  return { colab, cpf };
}

/** Colaborador com senha e termo aceito, e o agente do portal logado. */
async function colaboradorNoPortal() {
  const { colab, cpf } = await colaborador();
  const prod = await agenteLogado("production");
  const c = await mutacao(prod.agent.post(`/api/colaboradores/${colab.id}/codigo-de-acesso`)).send({});
  expect(c.status, c.text).toBe(201);
  const portal = request.agent(ctx.app);
  const r = await mutacao(portal.post("/api/colaborador/primeiro-acesso")).send({ cpf, codigo: c.body.codigo, senha: SENHA });
  expect(r.status, r.text).toBe(200);
  const t = await mutacao(portal.post("/api/colaborador/termo")).send({ versao: r.body.termo.versao });
  expect(t.status, t.text).toBe(200);
  return { colab, cpf, portal };
}

/** Contrato ATIVO do CNPJ, ligado ao colaborador. */
async function contratoAtivo(collaboratorId: string) {
  const cnpj = cnpjNovo();
  const [k] = await ctx.db.insert(ctx.schema.contratos).values({
    cnpj, razaoSocial: `Empresa ${unico()} ME`, tipo: "mei", vigenciaInicio: "2026-01-01", vigenciaFim: "2099-12-31",
  }).returning();
  await ctx.db.insert(ctx.schema.contratosColaboradores).values({ contratoId: k.id, collaboratorId });
  return { cnpj, contrato: k };
}

/** Prestação (com planejado) APROVADA pela Conferência DP; CNPJ com contrato ativo por padrão. */
async function prestacaoAprovada(o: { collaboratorId?: string; eventId?: string; rhStatus?: string; contrato?: boolean; total?: number } = {}) {
  const collaboratorId = o.collaboratorId ?? (await colaborador()).colab.id;
  const eventId = o.eventId ?? (await criarEvento()).id;
  const funcao = await criarFuncao();
  const total = o.total ?? 120_000;
  const cnpj = o.contrato === false ? null : (await contratoAtivo(collaboratorId)).cnpj;
  const [planejado] = await ctx.db.insert(ctx.schema.budgetPlanned).values({
    eventId, collaboratorId, functionId: funcao.id, collaboratorType: "freela", dailyQuantity: 3, dailyValue: 40_000, totalValue: total, status: "pre_aprovado",
  }).returning();
  const [a] = await ctx.db.insert(ctx.schema.budgetActual).values({
    plannedId: planejado.id, eventId, collaboratorId, functionId: funcao.id, collaboratorType: "freela",
    dailyQuantity: 3, dailyValue: 40_000, totalValue: total, workedDays: ["2099-10-10", "2099-10-11", "2099-10-12"],
    sentForReview: true, rhStatus: o.rhStatus ?? "aprovado", cnpjEmissor: cnpj, razaoSocialEmissor: cnpj ? "Empresa ME" : null,
  }).returning();
  return { actual: a, eventId, funcaoId: funcao.id, collaboratorId, cnpj };
}

const registrarOc = (corpo: Record<string, unknown>, agent: TestAgent = dp.agent) => mutacao(agent.post("/api/ordens-de-compra")).send(corpo);

const enviarNotaPeloPortal = (portal: TestAgent, actualId: string, campos: Record<string, string> = {}) => {
  let r = portal.post(`/api/colaborador/prestacoes/${actualId}/nota-fiscal`).set("Origin", ORIGEM_PERMITIDA)
    .attach("arquivo", PDF, { filename: "nota.pdf", contentType: "application/pdf" });
  for (const [k, v] of Object.entries({ valorNota: "120000", numeroNota: "123", ...campos })) r = r.field(k, v);
  return r;
};

async function lerActual(id: string) {
  const [a] = await ctx.db.select().from(ctx.schema.budgetActual).where(eq(ctx.schema.budgetActual.id, id));
  return a;
}
async function notaDa(actualId: string) {
  const [n] = await ctx.db.select().from(ctx.schema.invoices).where(eq(ctx.schema.invoices.budgetActualId, actualId));
  return n;
}
async function logsDe(entityId: string) {
  return ctx.db.select().from(ctx.schema.systemLogs).where(eq(ctx.schema.systemLogs.entityId, entityId));
}

/** Prestação com OC, NF aprovada e lançada no M4 (programado). */
async function prestacaoProgramada(eventId?: string, pagamentoEm = somarDias(hoje, 5)) {
  const p = await prestacaoAprovada({ eventId });
  expect((await registrarOc({ actualId: p.actual.id, numero: `OC-${unico()}` })).status).toBe(201);
  const a = await lerActual(p.actual.id);
  const [nota] = await ctx.db.insert(ctx.schema.invoices).values({
    eventId: p.eventId, collaboratorId: p.collaboratorId, functionId: p.funcaoId, budgetActualId: p.actual.id,
    oc: a.ocNumero, status: "enviada", nfValor: a.ocValor, nfCnpj: p.cnpj,
  }).returning();
  expect((await mutacao(dp.agent.post(`/api/invoices/${nota.id}/approve`)).send({})).status).toBe(200);
  const ck = await mutacao(dp.agent.post(`/api/invoices/${nota.id}/checkin`)).send({ paymentDate: pagamentoEm });
  expect(ck.status, ck.text).toBe(200);
  return { ...p, nota };
}

describe("OC (etapa 4)", () => {
  it("individual: valor padrão = aprovado, data de hoje, uma vez só; auditoria sem CPF", async () => {
    const { colab, cpf } = await colaborador();
    const p = await prestacaoAprovada({ collaboratorId: colab.id });
    const r = await registrarOc({ actualId: p.actual.id, numero: " 4500 012345 " });
    expect(r.status, r.text).toBe(201);
    expect(r.body.linha).toMatchObject({ estado: "com_oc", oc: { numero: "4500 012345", valor: 120_000, data: hoje, origem: "manual" } });
    expect(r.body.linha.oc.registradaPor.id).toBe(dp.user.id);
    const de2 = await registrarOc({ actualId: p.actual.id, numero: "999" });
    expect(de2.status).toBe(409);
    expect(de2.body.codigo).toBe("oc_ja_registrada");
    const logs = JSON.stringify(await logsDe(p.actual.id));
    expect(logs).toContain("OC registrada");
    expect(logs).not.toContain(cpf);
  });

  it("não aprovada, valor/data inválidos e evento legado → recusados", async () => {
    const pendente = await prestacaoAprovada({ rhStatus: "pendente" });
    const r1 = await registrarOc({ actualId: pendente.actual.id, numero: "1" });
    expect(r1.status).toBe(409);
    expect(r1.body.codigo).toBe("nao_aprovada");
    const ok = await prestacaoAprovada();
    expect((await registrarOc({ actualId: ok.actual.id, numero: "1", valor: 0 })).status).toBe(400);
    expect((await registrarOc({ actualId: ok.actual.id, numero: "1", data: somarDias(hoje, 1) })).status).toBe(400);
    expect((await registrarOc({ actualId: ok.actual.id, numero: "" })).status).toBe(400);
    const legado = await criarEvento({ startDate: "2019-05-01", endDate: "2019-05-03" });
    const pl = await prestacaoAprovada({ eventId: legado.id });
    const r2 = await registrarOc({ actualId: pl.actual.id, numero: "1" });
    expect(r2.status).toBe(409);
    expect(r2.body.codigo).toBe("evento_legado");
    expect((await dp.agent.get(`/api/ordens-de-compra?eventId=${legado.id}`)).body.codigo).toBe("evento_legado");
  });

  it("CNPJ sem contrato ativo: só com justificativa", async () => {
    const p = await prestacaoAprovada({ contrato: false });
    const sem = await registrarOc({ actualId: p.actual.id, numero: "4500777" });
    expect(sem.status).toBe(409);
    expect(sem.body).toMatchObject({ codigo: "justificativa_obrigatoria", situacaoDoCnpj: "sem_cnpj" });
    const com = await registrarOc({ actualId: p.actual.id, numero: "4500777", justificativa: "Contrato em renovação no jurídico" });
    expect(com.status, com.text).toBe(201);
    expect(com.body.linha.oc.justificativa).toBe("Contrato em renovação no jurídico");
    expect(com.body.linha.acoes.exigeJustificativa).toBe(true);
  });

  it("lote: a prévia não grava; a confirmação relê o texto, grava as válidas e devolve as inválidas", async () => {
    const evento = await criarEvento();
    const boa = await prestacaoAprovada({ eventId: evento.id });
    const semContrato = await prestacaoAprovada({ eventId: evento.id, contrato: false });
    const pendente = await prestacaoAprovada({ eventId: evento.id, rhStatus: "pendente" });
    const texto = [`${boa.actual.id};4501001;1.300,00`, `${semContrato.actual.id};4501002`, `${pendente.actual.id};4501003`, "Ninguém;4501004"].join("\n");

    const previa = await mutacao(dp.agent.post("/api/ordens-de-compra/lote/previa")).send({ eventId: evento.id, texto });
    expect(previa.status, previa.text).toBe(200);
    expect(previa.body.resumo).toMatchObject({ ok: 2, erro: 2, exigemJustificativa: 1 });
    expect((await lerActual(boa.actual.id)).ocNumero).toBeNull();

    const sem = await mutacao(dp.agent.post("/api/ordens-de-compra/lote")).send({ eventId: evento.id, texto });
    expect(sem.status, sem.text).toBe(200);
    expect(sem.body.registradas).toBe(1);
    expect(sem.body.recusadas.map((r: { linha: number }) => r.linha)).toEqual([2, 3, 4]);
    const a = await lerActual(boa.actual.id);
    expect(a).toMatchObject({ ocNumero: "4501001", ocValor: 130_000, ocOrigem: "lote" });

    const com = await mutacao(dp.agent.post("/api/ordens-de-compra/lote")).send({ eventId: evento.id, texto, justificativa: "Contrato em análise" });
    expect(com.body.registradas).toBe(1);
    expect((await lerActual(semContrato.actual.id))).toMatchObject({ ocNumero: "4501002", ocJustificativa: "Contrato em análise" });
    // A primeira linha agora "já tem OC".
    expect(com.body.recusadas[0].motivos.join(" ")).toMatch(/já tem a OC/);

    const lista = await dp.agent.get(`/api/ordens-de-compra?eventId=${evento.id}`);
    expect(lista.status).toBe(200);
    expect(lista.body.linhas).toHaveLength(2); // a pendente não está aprovada
    expect(lista.body.contadores).toMatchObject({ com_oc: 2, total: 2 });
  });

  it("desfazer: sem NF desfaz (com motivo); com NF → 409", async () => {
    const p = await prestacaoAprovada();
    await registrarOc({ actualId: p.actual.id, numero: "4502000" });
    expect((await mutacao(dp.agent.post(`/api/ordens-de-compra/${p.actual.id}/desfazer`)).send({ motivo: "" })).status).toBe(400);
    const ok = await mutacao(dp.agent.post(`/api/ordens-de-compra/${p.actual.id}/desfazer`)).send({ motivo: "Número digitado errado" });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.body.linha.estado).toBe("sem_oc");
    expect((await lerActual(p.actual.id)).ocNumero).toBeNull();

    await registrarOc({ actualId: p.actual.id, numero: "4502001" });
    await ctx.db.insert(ctx.schema.invoices).values({ eventId: p.eventId, collaboratorId: p.collaboratorId, functionId: p.funcaoId, budgetActualId: p.actual.id, oc: "4502001", status: "enviada" });
    const bloqueado = await mutacao(dp.agent.post(`/api/ordens-de-compra/${p.actual.id}/desfazer`)).send({ motivo: "Número digitado errado" });
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.body.codigo).toBe("com_nf");
  });

  it("exportação CSV: BOM, ';', CPF completo, só aprovadas sem OC; a auditoria não guarda o CPF", async () => {
    const evento = await criarEvento();
    const { colab, cpf } = await colaborador();
    const semOc = await prestacaoAprovada({ eventId: evento.id, collaboratorId: colab.id, total: 123_456 });
    const comOc = await prestacaoAprovada({ eventId: evento.id });
    await registrarOc({ actualId: comOc.actual.id, numero: "4503000" });
    const r = await dp.agent.get(`/api/ordens-de-compra/exportar?eventId=${evento.id}`).buffer(true);
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/csv/);
    const texto = r.text;
    expect(texto.charCodeAt(0)).toBe(0xfeff);
    const linhas = texto.replace(/^﻿/, "").trim().split("\r\n");
    expect(linhas[0].split(";")[0]).toBe("Prestação");
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toContain(semOc.actual.id);
    expect(linhas[1]).toContain(cpf);
    expect(linhas[1]).toContain("1234,56");
    const logs = JSON.stringify(await logsDe(evento.id));
    expect(logs).toContain("exportou");
    expect(logs).not.toContain(cpf);
    const xlsx = await dp.agent.get(`/api/ordens-de-compra/exportar?eventId=${evento.id}&formato=xlsx`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers["content-type"]).toMatch(/spreadsheetml/);
  });
});

describe("portal: valores, NF com a OC, devolução e reenvio (etapas 5 e 6)", () => {
  it("valores liberados depois da OC mesmo com \"não exibir\"; o bloco mostra o que a nota deve ter", async () => {
    const { colab, portal } = await colaboradorNoPortal();
    const evento = await criarEvento();
    await ctx.db.update(ctx.schema.events).set({ paymentCompanyName: "Norte Eventos Ltda", paymentCompanyCnpj: "11222333000181" }).where(eq(ctx.schema.events.id, evento.id));
    const p = await prestacaoAprovada({ collaboratorId: colab.id, eventId: evento.id });
    const antes = (await portal.get("/api/colaborador/prestacoes")).body.prestacoes.find((x: { id: string }) => x.id === p.actual.id);
    expect(antes.valoresOcultos).toBe(true);
    expect(antes.valores).toBeNull();
    expect(antes.notaEPagamento).toMatchObject({ estado: "sem_oc", podeEnviarNf: false, instrucoes: null, oc: null });

    await registrarOc({ actualId: p.actual.id, numero: "4504000" });
    const depois = (await portal.get("/api/colaborador/prestacoes")).body.prestacoes.find((x: { id: string }) => x.id === p.actual.id);
    expect(depois.valoresOcultos).toBe(false);
    expect(depois.valores).not.toBeNull();
    expect(depois.notaEPagamento).toMatchObject({
      estado: "com_oc", podeEnviarNf: true, oc: { numero: "4504000", valor: 120_000 },
      instrucoes: { tomador: { nome: "Norte Eventos Ltda", cnpj: "11.222.333/0001-81" }, valor: 120_000, oc: "4504000" },
      contaBancaria: { cadastrada: false, podeInformar: true },
    });
    expect(depois.notaEPagamento.instrucoes.descricaoSugerida).toMatch(/OC nº 4504000/);
  });

  it("envio da NF: só com OC; conta obrigatória e gravada CIFRADA; a nota nasce com a OC registrada; segundo envio → 409", async () => {
    const { colab, cpf, portal } = await colaboradorNoPortal();
    const p = await prestacaoAprovada({ collaboratorId: colab.id });
    const semOc = await enviarNotaPeloPortal(portal, p.actual.id);
    expect(semOc.status).toBe(409);
    expect(semOc.body.codigo).toBe("aguardando_oc");

    await registrarOc({ actualId: p.actual.id, numero: "4505000" });
    const semConta = await enviarNotaPeloPortal(portal, p.actual.id);
    expect(semConta.status).toBe(400);
    expect(semConta.body.codigo).toBe("conta_obrigatoria");
    const semValor = await enviarNotaPeloPortal(portal, p.actual.id, { valorNota: "" });
    expect(semValor.status).toBe(400);

    const ok = await enviarNotaPeloPortal(portal, p.actual.id, { banco: "341", agencia: "1234", conta: CONTA, tipoConta: "corrente", titular: "Fulano ME", valorNota: "110000" });
    expect(ok.status, ok.text).toBe(201);
    expect(ok.body.prestacao.notaEPagamento).toMatchObject({ estado: "nf_enviada", podeEnviarNf: false, contaBancaria: { cadastrada: true } });
    expect(JSON.stringify(ok.body)).not.toContain(CONTA);
    const nota = await notaDa(p.actual.id);
    expect(nota).toMatchObject({ status: "enviada", oc: "4505000", nfValor: 110_000, nfNumero: "123", nfCnpj: p.cnpj });
    expect(nota.attachmentUrl).toMatch(/^\/api\/attachments\/ATT-[A-Z0-9-]+\/view$/);
    const [pg] = await ctx.db.select().from(ctx.schema.colaboradoresPagamento).where(eq(ctx.schema.colaboradoresPagamento.collaboratorId, colab.id));
    expect(pg.contaCifrada).toBeTruthy();
    expect(pg.contaCifrada).not.toContain("88123");
    const logs = JSON.stringify([...await logsDe(colab.id), ...await logsDe(nota.id)]);
    expect(logs).not.toContain(CONTA);
    expect(logs).not.toContain(cpf);
    // A mudança de conta fica pendente de conferência do DP (sino).
    const [alt] = await ctx.db.select().from(ctx.schema.colaboradoresPagamentoAlteracoes).where(eq(ctx.schema.colaboradoresPagamentoAlteracoes.collaboratorId, colab.id));
    expect(alt.mudaConta).toBe(true);

    const de2 = await enviarNotaPeloPortal(portal, p.actual.id);
    expect(de2.status).toBe(409);
    expect(de2.body.codigo).toBe("nf_em_analise");
    // O colaborador abre a própria nota.
    const arq = await portal.get(`/api/colaborador/prestacoes/${p.actual.id}/nota-fiscal/arquivo`);
    expect(arq.status).toBe(200);
    // A conferência do DP: OC confere, valor R$ 100 abaixo, CNPJ confere.
    const conf = await dp.agent.get(`/api/invoices/conferencia?eventId=${p.eventId}`);
    const c = conf.body.find((x: { actualId: string }) => x.actualId === p.actual.id);
    expect(c.conferencia).toMatchObject({ oc: { confere: true }, valor: { confere: false, diferenca: -10_000 }, cnpj: { confere: true } });
  });

  it("a NF de outro colaborador não abre nem recebe envio (404)", async () => {
    const a = await colaboradorNoPortal();
    const b = await colaboradorNoPortal();
    const p = await prestacaoAprovada({ collaboratorId: a.colab.id });
    await registrarOc({ actualId: p.actual.id, numero: "4505100" });
    expect((await enviarNotaPeloPortal(b.portal, p.actual.id, { banco: "341", agencia: "1", conta: CONTA, tipoConta: "corrente" })).status).toBe(404);
    expect((await b.portal.get(`/api/colaborador/prestacoes/${p.actual.id}/nota-fiscal/arquivo`)).status).toBe(404);
  });

  it("devolução aparece no portal com o comentário; o reenvio volta a nota para 'enviada' (conta já cadastrada não muda pelo portal)", async () => {
    const { colab, portal } = await colaboradorNoPortal();
    const p = await prestacaoAprovada({ collaboratorId: colab.id });
    await registrarOc({ actualId: p.actual.id, numero: "4506000" });
    expect((await enviarNotaPeloPortal(portal, p.actual.id, { pixTipo: "email", pixChave: "fulano@exemplo.com" })).status).toBe(201);
    const nota = await notaDa(p.actual.id);
    const dev = await mutacao(dp.agent.post(`/api/invoices/${nota.id}/return`)).send({ comment: "Valor diferente da OC" });
    expect(dev.status).toBe(200);
    const vista = (await portal.get("/api/colaborador/prestacoes")).body.prestacoes.find((x: { id: string }) => x.id === p.actual.id);
    expect(vista.notaEPagamento).toMatchObject({ estado: "nf_devolvida", podeEnviarNf: true, nota: { status: "devolvida", comentarioDoDp: "Valor diferente da OC" } });
    const trocaConta = await enviarNotaPeloPortal(portal, p.actual.id, { banco: "001", agencia: "1", conta: "1-1", tipoConta: "corrente" });
    expect(trocaConta.status).toBe(409);
    expect(trocaConta.body.codigo).toBe("conta_ja_cadastrada");
    const reenvio = await enviarNotaPeloPortal(portal, p.actual.id, { valorNota: "120000" });
    expect(reenvio.status, reenvio.text).toBe(200);
    const depois = await notaDa(p.actual.id);
    expect(depois).toMatchObject({ status: "enviada", returnComment: null, nfValor: 120_000, oc: "4506000" });
    expect((depois.history as { type: string }[]).map((h) => h.type)).toEqual(["enviado", "devolvido", "reenviado"]);
  });

  it("lançamento interno (Notas fiscais) fica travado na OC registrada", async () => {
    const p = await prestacaoAprovada();
    await registrarOc({ actualId: p.actual.id, numero: "4507000" });
    const corpo = { eventId: p.eventId, collaboratorId: p.collaboratorId, functionId: p.funcaoId, budgetActualId: p.actual.id, attachmentUrl: "/api/attachments/ATT-1700000000000-ABC123XYZ/view", attachmentName: "nota.pdf", status: "enviada" };
    const outra = await mutacao(dp.agent.post("/api/invoices")).send({ ...corpo, oc: "9999" });
    expect(outra.status).toBe(409);
    expect(outra.body.codigo).toBe("oc_travada");
    const vazia = await mutacao(dp.agent.post("/api/invoices")).send({ ...corpo, oc: "" });
    expect(vazia.status, vazia.text).toBe(200);
    expect(vazia.body.oc).toBe("4507000");
  });

  it("a produção envia a NF como representante (Área de Função não)", async () => {
    const p = await prestacaoAprovada();
    await registrarOc({ actualId: p.actual.id, numero: "4508000" });
    const area = await agenteLogado("function_area");
    const negado = await area.agent.post(`/api/ordens-de-compra/${p.actual.id}/nota-fiscal`).set("Origin", ORIGEM_PERMITIDA)
      .attach("arquivo", PDF, { filename: "nota.pdf", contentType: "application/pdf" }).field("valorNota", "120000");
    expect(negado.status).toBe(403);
    const prod = await agenteLogado("production");
    const ok = await prod.agent.post(`/api/ordens-de-compra/${p.actual.id}/nota-fiscal`).set("Origin", ORIGEM_PERMITIDA)
      .attach("arquivo", PDF, { filename: "nota.pdf", contentType: "application/pdf" }).field("valorNota", "120000");
    expect(ok.status, ok.text).toBe(201);
    expect(ok.body.linha).toMatchObject({ estado: "nf_enviada", nota: { oc: "4508000", valor: 120_000 } });
  });
});

describe("pagamento (etapa 7), status no portal e trilha", () => {
  it("pago só depois de programado; portal mostra 'programado para' e 'pago em'; de novo → 409", async () => {
    const { colab, portal } = await colaboradorNoPortal();
    const p = await prestacaoAprovada({ collaboratorId: colab.id });
    await registrarOc({ actualId: p.actual.id, numero: "4509000" });
    const cedo = await mutacao(dp.agent.post("/api/pagamentos/marcar-pago")).send({ actualIds: [p.actual.id], pagoEm: hoje });
    expect(cedo.status).toBe(409);
    expect(cedo.body.codigo).toBe("nao_programado");

    expect((await enviarNotaPeloPortal(portal, p.actual.id, { pixTipo: "email", pixChave: "x@exemplo.com" })).status).toBe(201);
    const nota = await notaDa(p.actual.id);
    await mutacao(dp.agent.post(`/api/invoices/${nota.id}/approve`)).send({});
    const programadoPara = somarDias(hoje, 7);
    await mutacao(dp.agent.post(`/api/invoices/${nota.id}/checkin`)).send({ paymentDate: programadoPara });
    const prog = (await portal.get("/api/colaborador/prestacoes")).body.prestacoes.find((x: { id: string }) => x.id === p.actual.id);
    expect(prog.notaEPagamento).toMatchObject({ estado: "programado", programadoPara, frase: `Pagamento programado para ${diaMes(programadoPara)}.` });

    expect((await mutacao(dp.agent.post("/api/pagamentos/marcar-pago")).send({ actualIds: [p.actual.id], pagoEm: somarDias(hoje, 1) })).status).toBe(400);
    const pago = await mutacao(dp.agent.post("/api/pagamentos/marcar-pago")).send({ actualIds: [p.actual.id], pagoEm: hoje, observacao: "TED 123" });
    expect(pago.status, pago.text).toBe(200);
    expect(pago.body).toMatchObject({ pagas: 1, recusadas: [] });
    expect(pago.body.linhas[0]).toMatchObject({ estado: "pago", pagamento: { pagoEm: hoje, observacao: "TED 123" } });
    const vista = (await portal.get("/api/colaborador/prestacoes")).body.prestacoes.find((x: { id: string }) => x.id === p.actual.id);
    expect(vista.notaEPagamento).toMatchObject({ estado: "pago", pagoEm: hoje, frase: `Pago em ${diaMes(hoje)}.` });
    const de2 = await mutacao(dp.agent.post("/api/pagamentos/marcar-pago")).send({ actualIds: [p.actual.id], pagoEm: hoje });
    expect(de2.status).toBe(409);
    expect(de2.body.codigo).toBe("ja_pago");
    expect(JSON.stringify(await logsDe(p.actual.id))).toContain("marcada como paga");
  });

  it("lote: paga as programadas e devolve as outras; a trilha do Painel marca OC emitida e Pago", async () => {
    const evento = await criarEvento();
    const a = await prestacaoProgramada(evento.id);
    const b = await prestacaoProgramada(evento.id);
    const c = await prestacaoAprovada({ eventId: evento.id });
    const r = await mutacao(dp.agent.post("/api/pagamentos/marcar-pago")).send({ actualIds: [a.actual.id, b.actual.id, c.actual.id], pagoEm: hoje });
    expect(r.status, r.text).toBe(200);
    expect(r.body.pagas).toBe(2);
    expect(r.body.recusadas).toEqual([expect.objectContaining({ actualId: c.actual.id, codigo: "nao_programado" })]);

    const painel = await dp.agent.get(`/api/rh/controle?eventId=${evento.id}&recorte=todos`);
    expect(painel.status).toBe(200);
    const doA = painel.body.itens.find((i: { actual: { id: string } | null }) => i.actual?.id === a.actual.id);
    expect(doA.trilha.etapa).toBe("pago");
    expect(doA.trilha.estados).toMatchObject({ oc_emitida: "feita", pago: "feita" });
    const doC = painel.body.itens.find((i: { actual: { id: string } | null }) => i.actual?.id === c.actual.id);
    expect(doC.trilha).toMatchObject({ etapa: "validado", proxima: "oc_emitida" });

    const desfaz = await mutacao(dp.agent.post(`/api/pagamentos/${a.actual.id}/desfazer`)).send({ motivo: "Lançado no evento errado" });
    expect(desfaz.status, desfaz.text).toBe(200);
    expect(desfaz.body.linha.estado).toBe("programado");
  });
});

describe("expurgo das selfies (LGPD)", () => {
  it("prévia não apaga; a execução apaga só as fotos de prestações pagas além do prazo e mantém os horários", async () => {
    const { ObjectStorageService, novoIdDeAnexo } = await import("../objectStorage");
    const servico = new ObjectStorageService();
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const comSelfies = async (pagoEm: string | null) => {
      const p = await prestacaoAprovada();
      if (pagoEm) await ctx.db.update(ctx.schema.budgetActual).set({ pagoEm }).where(eq(ctx.schema.budgetActual.id, p.actual.id));
      const fotos = [novoIdDeAnexo(), novoIdDeAnexo()];
      for (const id of fotos) await servico.enviarAnexo(id, PNG, "image/png", { ownerId: `colaborador:${p.collaboratorId}`, nomeOriginal: "selfie.png", classe: "presenca" });
      const [presenca] = await ctx.db.insert(ctx.schema.presencas).values({
        actualId: p.actual.id, eventId: p.eventId, collaboratorId: p.collaboratorId, dia: "2099-10-10",
        checkinEm: new Date("2099-10-10T11:00:00Z"), checkinFotoId: fotos[0], checkoutEm: new Date("2099-10-10T21:00:00Z"), checkoutFotoId: fotos[1],
      }).returning();
      return { p, fotos, presenca };
    };
    const antiga = await comSelfies(somarDias(hoje, -400));
    const recente = await comSelfies(somarDias(hoje, -10));
    const naoPaga = await comSelfies(null);

    const previa = await mutacao(dp.agent.post("/api/presenca/expurgo?simular=1")).send({});
    expect(previa.status, previa.text).toBe(200);
    expect(previa.body).toMatchObject({ simulacao: true, retencaoDias: 365, presencas: 1, fotos: 2, prestacoes: 1, apagadas: 0 });
    expect(armazenamento.objetos.has(antiga.fotos[0])).toBe(true);

    const exec = await mutacao(dp.agent.post("/api/presenca/expurgo")).send({});
    expect(exec.status, exec.text).toBe(200);
    expect(exec.body).toMatchObject({ simulacao: false, fotos: 2, apagadas: 2, falhas: 0 });
    for (const id of antiga.fotos) expect(armazenamento.objetos.has(id)).toBe(false);
    for (const id of [...recente.fotos, ...naoPaga.fotos]) expect(armazenamento.objetos.has(id)).toBe(true);
    const [depois] = await ctx.db.select().from(ctx.schema.presencas).where(eq(ctx.schema.presencas.id, antiga.presenca.id));
    expect(depois).toMatchObject({ checkinFotoId: null, checkoutFotoId: null });
    expect(depois.fotoExpurgadaEm).not.toBeNull();
    expect(new Date(depois.checkinEm!).toISOString()).toBe("2099-10-10T11:00:00.000Z");
    const [intacta] = await ctx.db.select().from(ctx.schema.presencas).where(eq(ctx.schema.presencas.id, recente.presenca.id));
    expect(intacta.checkinFotoId).toBe(recente.fotos[0]);
    expect(JSON.stringify(await logsDe("expurgo-de-selfies"))).toContain("fotosApagadas");

    // De novo: nada mais a apagar.
    expect((await mutacao(dp.agent.post("/api/presenca/expurgo?simular=1")).send({})).body.fotos).toBe(0);
    const situacao = await dp.agent.get("/api/presenca/expurgo");
    expect(situacao.body).toMatchObject({ automatico: true, rotinaDiariaAtiva: false, podeMudarAutomatico: false });
    expect((await mutacao(dp.agent.put("/api/presenca/expurgo/automatico")).send({ ligado: false })).status).toBe(403);
    const admin = await agenteLogado("admin");
    const desliga = await mutacao(admin.agent.put("/api/presenca/expurgo/automatico")).send({ ligado: false });
    expect(desliga.status).toBe(200);
    expect(desliga.body.automatico).toBe(false);
  });
});

describe("papéis", () => {
  it("Compras, produção e o perfil Honorários não veem OC, pago, exportação nem expurgo (403)", async () => {
    const p = await prestacaoAprovada();
    for (const papel of ["purchasing", "production", "honorarios", "function_area"] as const) {
      const { agent } = await agenteLogado(papel);
      const chamadas = [
        agent.get(`/api/ordens-de-compra?eventId=${p.eventId}`),
        mutacao(agent.post("/api/ordens-de-compra")).send({ actualId: p.actual.id, numero: "1" }),
        mutacao(agent.post("/api/ordens-de-compra/lote/previa")).send({ eventId: p.eventId, texto: "x;1" }),
        mutacao(agent.post("/api/ordens-de-compra/lote")).send({ eventId: p.eventId, texto: "x;1" }),
        mutacao(agent.post(`/api/ordens-de-compra/${p.actual.id}/desfazer`)).send({ motivo: "motivo qualquer" }),
        agent.get(`/api/ordens-de-compra/exportar?eventId=${p.eventId}`),
        agent.get(`/api/invoices/conferencia?eventId=${p.eventId}`),
        mutacao(agent.post("/api/pagamentos/marcar-pago")).send({ actualIds: [p.actual.id], pagoEm: hoje }),
        mutacao(agent.post(`/api/pagamentos/${p.actual.id}/desfazer`)).send({ motivo: "motivo qualquer" }),
        agent.get("/api/presenca/expurgo"),
        mutacao(agent.post("/api/presenca/expurgo?simular=1")).send({}),
      ];
      for (const r of await Promise.all(chamadas)) expect(r.status, `${papel} ${r.req.method} ${r.req.path}`).toBe(403);
    }
    {
      // A NF como representante é da produção/DP — o perfil Honorários não passa.
      const { agent } = await agenteLogado("honorarios");
      const r = await agent.post(`/api/ordens-de-compra/${p.actual.id}/nota-fiscal`).set("Origin", ORIGEM_PERMITIDA)
        .attach("arquivo", PDF, { filename: "nota.pdf", contentType: "application/pdf" }).field("valorNota", "1");
      expect(r.status).toBe(403);
    }
    expect((await lerActual(p.actual.id)).ocNumero).toBeNull();
  });

  it("a sessão do colaborador não chega às rotas internas da Fase 2", async () => {
    const { portal } = await colaboradorNoPortal();
    expect((await portal.get("/api/ordens-de-compra?eventId=x")).status).toBe(401);
    expect((await mutacao(portal.post("/api/pagamentos/marcar-pago")).send({ actualIds: ["x"], pagoEm: hoje })).status).toBe(401);
  });
});


describe("demonstração", () => {
  it("o seed da demo tem um evento do fluxo novo com uma prestação em cada estado", async () => {
    const { semearDemo } = await import("../dev/demo-seed");
    const { semearContratosDemo } = await import("../dev/demo-seed-contratos");
    const { semearPresencaDemo } = await import("../dev/demo-seed-presenca");
    const { semearPagamentoDemo } = await import("../dev/demo-seed-pagamento");
    await semearDemo(ctx.db as any);
    await semearContratosDemo(ctx.db as any);
    await semearPresencaDemo(ctx.db as any);
    const r = await semearPagamentoDemo(ctx.db as any);
    expect(r.prestacoes).toBe(6);
    expect(r.portal).toHaveLength(2);
    const [evento] = await ctx.db.select().from(ctx.schema.events).where(eq(ctx.schema.events.name, "Corrida Noturna do Recife"));
    const lista = await dp.agent.get(`/api/ordens-de-compra?eventId=${evento.id}`);
    expect(lista.status, lista.text).toBe(200);
    expect(lista.body.linhas.map((l: { estado: string }) => l.estado).sort())
      .toEqual(["com_oc", "nf_devolvida", "nf_enviada", "pago", "programado", "sem_oc"]);
    const enviada = lista.body.linhas.find((l: { estado: string }) => l.estado === "nf_enviada");
    expect(enviada.conferencia.valor).toMatchObject({ confere: false, diferenca: -5_000 });
    // Idempotente: rodar de novo não duplica.
    expect((await semearPagamentoDemo(ctx.db as any)).prestacoes).toBe(0);
  }, 120_000);
});
