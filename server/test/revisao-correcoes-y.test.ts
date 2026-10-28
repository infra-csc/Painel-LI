/**
 * Revisão de 28/10 (Frente Y) — sobre o PGlite:
 *
 *  - S6: o expurgo das selfies conta o prazo do MAIS RECENTE entre a data do
 *    pagamento e o registro dele (`pago_registrado_em`) — pagamento lançado
 *    com data retroativa não apaga as fotos na hora;
 *  - S9: o portal só entrega o arquivo da nota que o próprio colaborador
 *    enviou ou que o DP/produção enviou para aquela prestação — nunca selfie,
 *    contrato, a nota de outro colaborador ou arquivo de outra prestação;
 *  - R7: a divisão (filha, colaborador próprio) segue o fluxo de OC → NF →
 *    pago como prestação própria: lista de OC, registrar OC (individual e
 *    lote), NF pelo representante e pelo portal do substituto, pago, trilha e
 *    prazos no Painel, arquivo de OC — e a presença continua fora (404).
 *
 * MOCK (só neste arquivo, como em honorarios-fase-2.test.ts): o Object
 * Storage vira um Map em memória.
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
const SENHA = "senha-do-portal-9";
const PDF = Buffer.from("%PDF-1.4\n% nota fiscal de teste\n1 0 obj << >> endobj\n%%EOF\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JUST = "Substituto sem CNPJ informado (teste)";

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

let sequencia = 610_000;
function cpfNovo(): string {
  sequencia += 11;
  return completarCpf(`${String(Date.now() % 1000).padStart(3, "0")}${String(sequencia).padStart(6, "0")}`);
}
let seqCnpj = 810_000;
const cnpjNovo = () => digitosDoCnpj(completarCnpj(`${String(++seqCnpj).padStart(8, "0")}0001`));

async function colaborador() {
  const cpf = cpfNovo();
  const colab = await ctx.storage.createCollaborator({
    fullName: `Freela ${unico()}`, officialDocument: cpf, documentType: "cpf",
    type: "freela", city: "Campinas - SP", status: "aprovado", active: true,
  } as any);
  return { colab, cpf };
}

/** Colaborador com senha e termo aceito, e o agente do portal logado (código gerado pelo DP). */
async function colaboradorNoPortal() {
  const { colab, cpf } = await colaborador();
  const c = await mutacao(dp.agent.post(`/api/colaboradores/${colab.id}/codigo-de-acesso`)).send({});
  expect(c.status, c.text).toBe(201);
  const portal = request.agent(ctx.app);
  const r = await mutacao(portal.post("/api/colaborador/primeiro-acesso")).send({ cpf, codigo: c.body.codigo, senha: SENHA });
  expect(r.status, r.text).toBe(200);
  const t = await mutacao(portal.post("/api/colaborador/termo")).send({ versao: r.body.termo.versao });
  expect(t.status, t.text).toBe(200);
  return { colab, cpf, portal };
}

async function contratoAtivo(collaboratorId: string) {
  const cnpj = cnpjNovo();
  const [k] = await ctx.db.insert(ctx.schema.contratos).values({
    cnpj, razaoSocial: `Empresa ${unico()} ME`, tipo: "mei", vigenciaInicio: "2026-01-01", vigenciaFim: "2099-12-31",
  }).returning();
  await ctx.db.insert(ctx.schema.contratosColaboradores).values({ contratoId: k.id, collaboratorId });
  return { cnpj, contrato: k };
}

/** Prestação (com planejado) APROVADA pela Conferência DP; CNPJ com contrato ativo. */
async function prestacaoAprovada(o: { collaboratorId?: string; eventId?: string } = {}) {
  const collaboratorId = o.collaboratorId ?? (await colaborador()).colab.id;
  const eventId = o.eventId ?? (await criarEvento()).id;
  const funcao = await criarFuncao();
  const cnpj = (await contratoAtivo(collaboratorId)).cnpj;
  const [planejado] = await ctx.db.insert(ctx.schema.budgetPlanned).values({
    eventId, collaboratorId, functionId: funcao.id, collaboratorType: "freela", dailyQuantity: 3, dailyValue: 40_000, totalValue: 120_000, status: "pre_aprovado",
  }).returning();
  const [a] = await ctx.db.insert(ctx.schema.budgetActual).values({
    plannedId: planejado.id, eventId, collaboratorId, functionId: funcao.id, collaboratorType: "freela",
    dailyQuantity: 3, dailyValue: 40_000, totalValue: 120_000, workedDays: ["2099-10-10", "2099-10-11", "2099-10-12"],
    sentForReview: true, rhStatus: "aprovado", rhActionAt: new Date(), cnpjEmissor: cnpj, razaoSocialEmissor: "Empresa ME",
  }).returning();
  return { actual: a, eventId, funcaoId: funcao.id, collaboratorId, cnpj, planejadoId: planejado.id };
}

/** A divisão ("Dividir escalação"): filha do titular, com o substituto, aprovada junto. */
async function divisao(titular: Awaited<ReturnType<typeof prestacaoAprovada>>, collaboratorId: string, extras: Record<string, unknown> = {}) {
  const [filha] = await ctx.db.insert(ctx.schema.budgetActual).values({
    splitParentId: titular.actual.id, plannedId: titular.planejadoId, eventId: titular.eventId, collaboratorId, functionId: titular.funcaoId,
    collaboratorType: "freela", dailyQuantity: 1, dailyValue: 40_000, totalValue: 40_000, workedDays: ["2099-10-11"],
    observations: "Divisão de escalação — colaborador adicional", sentForReview: true, rhStatus: "aprovado", rhActionAt: new Date(), ...extras,
  }).returning();
  return filha;
}

const registrarOc = (corpo: Record<string, unknown>, agent: TestAgent = dp.agent) => mutacao(agent.post("/api/ordens-de-compra")).send(corpo);

const enviarNotaPeloPortal = (portal: TestAgent, actualId: string, campos: Record<string, string> = {}) => {
  let r = portal.post(`/api/colaborador/prestacoes/${actualId}/nota-fiscal`).set("Origin", ORIGEM_PERMITIDA)
    .attach("arquivo", PDF, { filename: "nota.pdf", contentType: "application/pdf" });
  for (const [k, v] of Object.entries({ valorNota: "40000", numeroNota: "77", ...campos })) r = r.field(k, v);
  return r;
};

async function notaDa(actualId: string) {
  const [n] = await ctx.db.select().from(ctx.schema.invoices).where(eq(ctx.schema.invoices.budgetActualId, actualId));
  return n;
}

// ── S6 ──────────────────────────────────────────────────────────────────────
describe("S6 — expurgo: o prazo conta do mais recente entre a data do pagamento e o registro", () => {
  it("pagamento lançado HOJE com data de 400 dias atrás não apaga as selfies; registrado há 400 dias (ou antigo, sem registro) apaga", async () => {
    const { ObjectStorageService, novoIdDeAnexo } = await import("../objectStorage");
    const servico = new ObjectStorageService();
    const comSelfies = async (pagoEm: string, pagoRegistradoEm: Date | null) => {
      const p = await prestacaoAprovada();
      await ctx.db.update(ctx.schema.budgetActual).set({ pagoEm, pagoRegistradoEm }).where(eq(ctx.schema.budgetActual.id, p.actual.id));
      const foto = novoIdDeAnexo();
      await servico.enviarAnexo(foto, PNG, "image/png", { ownerId: `colaborador:${p.collaboratorId}`, nomeOriginal: "selfie.png", classe: "presenca" });
      await ctx.db.insert(ctx.schema.presencas).values({
        actualId: p.actual.id, eventId: p.eventId, collaboratorId: p.collaboratorId, dia: "2099-10-10",
        checkinEm: new Date("2099-10-10T11:00:00Z"), checkinFotoId: foto,
      });
      return foto;
    };
    const antigo = somarDias(hoje, -400);
    const retroativa = await comSelfies(antigo, new Date());
    const registradaHaMuito = await comSelfies(antigo, new Date(`${antigo}T15:00:00Z`));
    const semRegistro = await comSelfies(antigo, null);

    const exec = await mutacao(dp.agent.post("/api/presenca/expurgo")).send({});
    expect(exec.status, exec.text).toBe(200);
    expect(armazenamento.objetos.has(retroativa)).toBe(true);
    expect(armazenamento.objetos.has(registradaHaMuito)).toBe(false);
    expect(armazenamento.objetos.has(semRegistro)).toBe(false);
  });
});

// ── S9 ──────────────────────────────────────────────────────────────────────
describe("S9 — arquivo da nota no portal: só o que é da nota daquela prestação", () => {
  /** Prestação do colaborador do portal com OC e a nota (o arquivo é trocado no banco, como um lançamento interno faria). */
  async function comNota(attachmentId: string, o: { portal?: Awaited<ReturnType<typeof colaboradorNoPortal>> } = {}) {
    const quem = o.portal ?? await colaboradorNoPortal();
    const p = await prestacaoAprovada({ collaboratorId: quem.colab.id });
    expect((await registrarOc({ actualId: p.actual.id, numero: `OC-${unico()}` })).status).toBe(201);
    await ctx.db.insert(ctx.schema.invoices).values({
      eventId: p.eventId, collaboratorId: p.collaboratorId, functionId: p.funcaoId, budgetActualId: p.actual.id, oc: "1",
      status: "enviada", attachmentUrl: `/api/attachments/${attachmentId}/view`, attachmentName: "nota.pdf",
    });
    return { ...quem, p };
  }
  const baixar = (portal: TestAgent, actualId: string) => portal.get(`/api/colaborador/prestacoes/${actualId}/nota-fiscal/arquivo`);

  it("nega selfie (de outro colaborador), arquivo de contrato, a nota de outro colaborador e arquivo de compras", async () => {
    const { ObjectStorageService, novoIdDeAnexo } = await import("../objectStorage");
    const servico = new ObjectStorageService();
    const outro = await colaborador();
    const selfie = novoIdDeAnexo();
    await servico.enviarAnexo(selfie, PNG, "image/png", { ownerId: `colaborador:${outro.colab.id}`, nomeOriginal: "selfie.png", classe: "presenca" });
    const contrato = novoIdDeAnexo();
    await servico.enviarAnexo(contrato, PDF, "application/pdf", { ownerId: dp.user.id, nomeOriginal: "contrato.pdf", classe: "contrato" });
    const notaAlheia = novoIdDeAnexo();
    await servico.enviarAnexo(notaAlheia, PDF, "application/pdf", { ownerId: `colaborador:${outro.colab.id}`, nomeOriginal: "nota.pdf" });
    const compras = await agenteLogado("purchasing");
    const deCompras = novoIdDeAnexo();
    await servico.enviarAnexo(deCompras, PDF, "application/pdf", { ownerId: compras.user.id, nomeOriginal: "voucher.pdf" });
    for (const id of [selfie, contrato, notaAlheia, deCompras]) {
      const { portal, p } = await comNota(id);
      const r = await baixar(portal, p.actual.id);
      expect(r.status, id).toBe(404);
    }
  });

  it("entrega a nota do próprio colaborador e a que o DP/produção enviou para aquela prestação — mas não o arquivo de OUTRA prestação", async () => {
    const { ObjectStorageService, novoIdDeAnexo } = await import("../objectStorage");
    const servico = new ObjectStorageService();
    const eu = await colaboradorNoPortal();
    const minha = novoIdDeAnexo();
    await servico.enviarAnexo(minha, PDF, "application/pdf", { ownerId: `colaborador:${eu.colab.id}`, nomeOriginal: "nota.pdf" });
    const a = await comNota(minha, { portal: eu });
    expect((await baixar(eu.portal, a.p.actual.id)).status).toBe(200);

    const prod = await agenteLogado("production");
    const doRepresentante = novoIdDeAnexo();
    await servico.enviarAnexo(doRepresentante, PDF, "application/pdf", { ownerId: prod.user.id, nomeOriginal: "nota.pdf" });
    const b = await comNota(doRepresentante, { portal: eu });
    expect((await baixar(eu.portal, b.p.actual.id)).status).toBe(200);

    // O mesmo arquivo do DP numa SEGUNDA prestação (de outra pessoa): não é a nota "daquela" prestação.
    const doDp = novoIdDeAnexo();
    await servico.enviarAnexo(doDp, PDF, "application/pdf", { ownerId: dp.user.id, nomeOriginal: "nota.pdf" });
    await comNota(doDp);
    const c = await comNota(doDp, { portal: eu });
    expect((await baixar(eu.portal, c.p.actual.id)).status).toBe(404);
  });
});

// ── R7 ──────────────────────────────────────────────────────────────────────
describe("R7 — a divisão (substituto) segue OC → NF → pago como prestação própria", () => {
  it("lista de OC, OC com justificativa (sem CNPJ), NF pelo portal do substituto, pago, trilha, prazos e arquivo de OC; a presença continua fora", async () => {
    const titular = await prestacaoAprovada();
    const [nomeDoTitular] = await ctx.db.select().from(ctx.schema.collaborators).where(eq(ctx.schema.collaborators.id, titular.collaboratorId));
    const sub = await colaboradorNoPortal();
    const filha = await divisao(titular, sub.colab.id);
    // A divisão que "não participou" fica fora.
    const ausente = await divisao(titular, (await colaborador()).colab.id, { didNotAttend: true });

    // Lista de OC: a divisão entra com o titular.
    const lista = await dp.agent.get(`/api/ordens-de-compra?eventId=${titular.eventId}`);
    expect(lista.status, lista.text).toBe(200);
    const linha = lista.body.linhas.find((l: { actualId: string }) => l.actualId === filha.id);
    expect(linha).toMatchObject({
      colaborador: { id: sub.colab.id }, valorAprovado: 40_000, estado: "sem_oc",
      divisao: { titularActualId: titular.actual.id, titularNome: nomeDoTitular.fullName },
      acoes: { registrarOc: true, exigeJustificativa: true }, cnpjEmissor: { situacao: "sem_cnpj" },
    });
    expect(lista.body.linhas.find((l: { actualId: string }) => l.actualId === ausente.id)).toBeUndefined();
    // O titular segue sem a marca de divisão.
    expect(lista.body.linhas.find((l: { actualId: string }) => l.actualId === titular.actual.id).divisao).toBeNull();

    // Painel: a divisão é uma linha própria; o prazo da etapa é o da OC.
    const antes = await dp.agent.get(`/api/rh/controle?eventId=${titular.eventId}&recorte=todos`);
    expect(antes.status, antes.text).toBe(200);
    const noPainel = antes.body.itens.find((i: { actual: { id: string } | null }) => i.actual?.id === filha.id);
    expect(noPainel).toMatchObject({ collaboratorId: sub.colab.id, divisaoDe: { actualId: titular.actual.id }, status: "aprovada_faturamento" });
    expect(noPainel.trilha).toMatchObject({ etapa: "validado", proxima: "oc_emitida" });
    expect(noPainel.prazo.atual.etapa).toBe("registrar_oc");
    expect(antes.body.itens.find((i: { actual: { id: string } | null }) => i.actual?.id === ausente.id)).toBeUndefined();

    // Arquivo de OC do M4: titular + divisão.
    const previa = await dp.agent.get(`/api/ordens-de-compra/arquivo-m4/previa?eventId=${titular.eventId}`);
    expect(previa.status, previa.text).toBe(200);
    expect(previa.body.prestadores.linhas).toBe(2);

    // Registrar a OC: sem CNPJ → só com justificativa.
    const sem = await registrarOc({ actualId: filha.id, numero: "4590001" });
    expect(sem.status).toBe(409);
    expect(sem.body.codigo).toBe("justificativa_obrigatoria");
    const oc = await registrarOc({ actualId: filha.id, numero: "4590001", justificativa: JUST });
    expect(oc.status, oc.text).toBe(201);
    expect(oc.body.linha).toMatchObject({ estado: "com_oc", oc: { numero: "4590001", valor: 40_000 } });

    // Portal do substituto: a divisão aparece com a nota e o pagamento — sem check-in nem confirmação.
    const meus = await sub.portal.get("/api/colaborador/prestacoes");
    expect(meus.status, meus.text).toBe(200);
    const vista = meus.body.prestacoes.find((x: { id: string }) => x.id === filha.id);
    expect(vista).toMatchObject({ divisao: true, podeConfirmar: false, notaEPagamento: { estado: "com_oc", podeEnviarNf: true, oc: { numero: "4590001" } } });
    for (const d of vista.dias) expect(d).toMatchObject({ podeEntrar: false, podeSair: false });
    expect(vista.prazo).toMatchObject({ etapa: "enviar_nf" });
    // Presença e confirmação seguem no titular: a divisão não tem.
    const entrada = await sub.portal.post(`/api/colaborador/presencas/${filha.id}/2099-10-11/entrada`).set("Origin", ORIGEM_PERMITIDA)
      .attach("foto", PNG, { filename: "selfie.png", contentType: "image/png" });
    expect(entrada.status).toBe(404);
    const confirmar = await mutacao(sub.portal.post(`/api/colaborador/prestacoes/${filha.id}/confirmar`)).send({ dias: ["2099-10-11"], cnpj: cnpjNovo() });
    expect(confirmar.status).toBe(404);

    const enviada = await enviarNotaPeloPortal(sub.portal, filha.id, { pixTipo: "email", pixChave: "sub@exemplo.com" });
    expect(enviada.status, enviada.text).toBe(201);
    expect(enviada.body.prestacao).toMatchObject({ divisao: true, notaEPagamento: { estado: "nf_enviada" } });
    expect((await sub.portal.get(`/api/colaborador/prestacoes/${filha.id}/nota-fiscal/arquivo`)).status).toBe(200);
    const nota = await notaDa(filha.id);
    expect(nota).toMatchObject({ status: "enviada", oc: "4590001", collaboratorId: sub.colab.id });

    // DP aprova, lança no M4 e marca pago.
    expect((await mutacao(dp.agent.post(`/api/invoices/${nota.id}/approve`)).send({})).status).toBe(200);
    expect((await mutacao(dp.agent.post(`/api/invoices/${nota.id}/checkin`)).send({ paymentDate: somarDias(hoje, 3) })).status).toBe(200);
    const pago = await mutacao(dp.agent.post("/api/pagamentos/marcar-pago")).send({ actualIds: [filha.id], pagoEm: hoje });
    expect(pago.status, pago.text).toBe(200);
    expect(pago.body.pagas).toBe(1);

    // Trilha: a linha da divisão chega a Pago (o titular continua na dele).
    const depois = await dp.agent.get(`/api/rh/controle?eventId=${titular.eventId}&recorte=todos`);
    const final = depois.body.itens.find((i: { actual: { id: string } | null }) => i.actual?.id === filha.id);
    expect(final.trilha.etapa).toBe("pago");
    expect(final.trilha.estados).toMatchObject({ oc_emitida: "feita", pago: "feita" });
    expect(final.prazo.atual).toBeNull();
    const doTitular = depois.body.itens.find((i: { actual: { id: string } | null }) => i.actual?.id === titular.actual.id);
    expect(doTitular.divisaoDe).toBeNull();
  });

  it("NF pelo representante e OC em lote também valem para a divisão", async () => {
    const titular = await prestacaoAprovada();
    const filha = await divisao(titular, (await colaborador()).colab.id);
    const outra = await divisao(titular, (await colaborador()).colab.id);
    const lote = await mutacao(dp.agent.post("/api/ordens-de-compra/lote")).send({ eventId: titular.eventId, texto: `${filha.id};4590100\n${outra.id};4590101`, justificativa: JUST });
    expect(lote.status, lote.text).toBe(200);
    expect(lote.body.registradas).toBe(2);
    const prod = await agenteLogado("production");
    const r = await prod.agent.post(`/api/ordens-de-compra/${filha.id}/nota-fiscal`).set("Origin", ORIGEM_PERMITIDA)
      .attach("arquivo", PDF, { filename: "nota.pdf", contentType: "application/pdf" }).field("valorNota", "40000");
    expect(r.status, r.text).toBe(201);
    expect(r.body.linha).toMatchObject({ estado: "nf_enviada", nota: { oc: "4590100" }, divisao: { titularActualId: titular.actual.id } });
  });
});
