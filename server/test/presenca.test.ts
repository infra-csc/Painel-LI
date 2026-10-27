/**
 * Módulo de Honorários, Fase 1 (27/10) — presença no evento e portal do
 * colaborador, sobre o PGlite.
 *
 *  - acesso do colaborador: código de primeiro acesso (uso único, 72 h),
 *    entrar (certo, errado, bloqueio no 5º erro, CPF no documento secundário,
 *    inativo), resposta igual para "CPF sem cadastro" e "senha errada";
 *  - dois mundos de sessão: colaborador não passa em rota interna e o usuário
 *    interno não passa no portal;
 *  - o portal: só fluxo novo (legado invisível), valores ocultos quando o
 *    evento oculta, check-in só no dia, check-out só depois do check-in,
 *    selfie obrigatória, as próprias fotos;
 *  - selfie nos anexos: DP/produção abrem, Compras e Área de Função não;
 *  - produção/DP: ocorrências, correção, check-out final (limite de 10% para a
 *    produção, DP sem limite, dias pendentes, justificativa sem confirmação)
 *    e o envio ao DP pelo caminho do "Enviar para revisão";
 *  - o perfil Honorários não vê nada disto.
 *
 * MOCK (só neste arquivo, como em anexos.test.ts): o Object Storage do Replit
 * vira um Map em memória; a ACL e os cabeçalhos do download são os de produção.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { hojeISO } from "@shared/hoje-sp";
import { completarCpf } from "@shared/pagamento";
import { completarCnpj, digitosDoCnpj } from "@shared/cnpj";
import {
  agenteLogado, criarApp, criarEvento, criarFuncao, criarUsuario, criarVaga, mutacao, unico, ORIGEM_PERMITIDA,
  type Contexto, type TestAgent,
} from "./harness";

vi.mock("../objectStorage", async (importOriginal) => {
  const original = await importOriginal<typeof import("../objectStorage")>();
  const { gravarMetadadosDoAnexo } = await import("../objectAcl");
  const { Readable } = await import("node:stream");
  const objetos = new Map<string, { conteudo: Buffer; metadata: Record<string, any> }>();
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
  }
  return { ...original, ObjectStorageService };
});

let ctx: Contexto;
let hoje: string;
const SENHA = "senha-do-portal-1";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("IHDR-selfie-de-teste-0123456789")]);

const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  ctx = await criarApp();
  hoje = hojeISO();
  // Data de corte antiga: todo evento dos testes (2026) é do fluxo novo; o
  // "legado" aqui é um evento de 2019.
  await ctx.storage.upsertSystemSetting("honorarios_data_corte", "2020-01-01");
});

let sequencia = 100_000;
function cpfNovo(): string {
  sequencia += 7;
  return completarCpf(`${String(Date.now() % 1000).padStart(3, "0")}${String(sequencia).padStart(6, "0")}`);
}

async function colaboradorComCpf(o: { secundario?: boolean; ativo?: boolean } = {}) {
  const cpf = cpfNovo();
  const formatado = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
  const colab = await ctx.storage.createCollaborator({
    fullName: `Freela ${unico()}`,
    officialDocument: o.secundario ? `RG-${unico()}` : formatado,
    documentType: o.secundario ? "rg" : "cpf",
    secondaryDocument: o.secundario ? cpf : null,
    secondaryDocumentType: o.secundario ? "cpf" : null,
    type: "freela", city: "Campinas - SP", status: "aprovado", active: o.ativo ?? true,
  } as any);
  return { colab, cpf };
}

async function gerarCodigo(colabId: string): Promise<string> {
  const { agent } = await agenteLogado("production");
  const r = await mutacao(agent.post(`/api/colaboradores/${colabId}/codigo-de-acesso`)).send({});
  expect(r.status, r.text).toBe(201);
  return r.body.codigo as string;
}

/** Colaborador com senha criada e o agente do portal já logado (termo aceito, se pedido). */
async function colaboradorNoPortal(o: { aceitarTermo?: boolean } = {}) {
  const { colab, cpf } = await colaboradorComCpf();
  const codigo = await gerarCodigo(colab.id);
  const portal = request.agent(ctx.app);
  const r = await mutacao(portal.post("/api/colaborador/primeiro-acesso")).send({ cpf, codigo, senha: SENHA });
  expect(r.status, r.text).toBe(200);
  if (o.aceitarTermo !== false) {
    const t = await mutacao(portal.post("/api/colaborador/termo")).send({ versao: r.body.termo.versao });
    expect(t.status, t.text).toBe(200);
  }
  return { colab, cpf, portal };
}

async function prestacao(o: { collaboratorId: string; eventId: string; functionId: string; workedDays: string[]; dailyValue?: number }) {
  const daily = o.dailyValue ?? 20_000;
  const [a] = await ctx.db.insert(ctx.schema.budgetActual).values({
    eventId: o.eventId, collaboratorId: o.collaboratorId, functionId: o.functionId, collaboratorType: "freela",
    dailyQuantity: o.workedDays.length, dailyValue: daily, totalValue: daily * o.workedDays.length, workedDays: o.workedDays,
  }).returning();
  return a;
}

/** Evento com o colaborador na escala e a prestação no Realizado (dias: ontem, hoje, amanhã). */
async function eventoDeHoje(colabId: string, o: { ocultar?: boolean } = {}) {
  const evento = await criarEvento({ startDate: somarDias(hoje, -1), endDate: somarDias(hoje, 1) });
  if (o.ocultar === false) await ctx.db.update(ctx.schema.events).set({ ocultarValoresColaborador: false }).where(eq(ctx.schema.events.id, evento.id));
  const funcao = await criarFuncao();
  const dono = await criarUsuario("production");
  await criarVaga({ userId: dono.id, eventId: evento.id, functionId: funcao.id, collaboratorId: colabId, status: "escalado", phase: "escalacao", scheduleStartDate: somarDias(hoje, -1), scheduleEndDate: somarDias(hoje, 1) });
  const actual = await prestacao({ collaboratorId: colabId, eventId: evento.id, functionId: funcao.id, workedDays: [somarDias(hoje, -1), hoje, somarDias(hoje, 1)] });
  return { evento, funcao, actual };
}

/** Prestação passada (01–03/10/2026) com as presenças dos dias informados gravadas direto. */
async function prestacaoPassada(colabId: string, diasComPresenca: string[] = ["2026-10-01", "2026-10-02", "2026-10-03"]) {
  const evento = await criarEvento({ startDate: "2026-10-01", endDate: "2026-10-03" });
  const funcao = await criarFuncao();
  const actual = await prestacao({ collaboratorId: colabId, eventId: evento.id, functionId: funcao.id, workedDays: ["2026-10-01", "2026-10-02", "2026-10-03"] });
  for (const dia of diasComPresenca) {
    await ctx.db.insert(ctx.schema.presencas).values({
      actualId: actual.id, eventId: evento.id, collaboratorId: colabId, dia,
      checkinEm: new Date(`${dia}T11:00:00Z`), checkinPor: "colaborador", checkoutEm: new Date(`${dia}T21:00:00Z`), checkoutPor: "colaborador",
    });
  }
  return { evento, funcao, actual };
}

const selfie = (agent: TestAgent, url: string) =>
  agent.post(url).set("Origin", ORIGEM_PERMITIDA).attach("foto", PNG, { filename: "selfie.png", contentType: "image/png" }).field("lat", "-23.55").field("lng", "-46.63").field("precisao", "12");

describe("acesso do colaborador ao portal", () => {
  it("código de acesso: só a produção/DP gera, devolve 6 dígitos uma vez e a auditoria não guarda o código nem o CPF", async () => {
    const { colab, cpf } = await colaboradorComCpf();
    const compras = await agenteLogado("purchasing");
    expect((await mutacao(compras.agent.post(`/api/colaboradores/${colab.id}/codigo-de-acesso`)).send({})).status).toBe(403);
    const { agent } = await agenteLogado("financial");
    const r = await mutacao(agent.post(`/api/colaboradores/${colab.id}/codigo-de-acesso`)).send({});
    expect(r.status).toBe(201);
    expect(r.body.codigo).toMatch(/^\d{6}$/);
    expect(r.body.colaborador.cpf).toBe(`•••.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-••`);
    const logs = await ctx.db.select().from(ctx.schema.systemLogs).where(eq(ctx.schema.systemLogs.entityId, colab.id));
    const texto = JSON.stringify(logs);
    expect(logs.length).toBeGreaterThan(0);
    expect(texto).not.toContain(r.body.codigo);
    expect(texto).not.toContain(cpf);
    const [acesso] = await ctx.db.select().from(ctx.schema.colaboradoresAcesso).where(eq(ctx.schema.colaboradoresAcesso.collaboratorId, colab.id));
    expect(acesso.codigoHash).not.toContain(r.body.codigo);
  });

  it("primeiro acesso cria a senha e entra; o código vale UMA vez; depois entra com CPF + senha", async () => {
    const { colab, cpf } = await colaboradorComCpf();
    const codigo = await gerarCodigo(colab.id);
    const portal = request.agent(ctx.app);
    const fraca = await mutacao(portal.post("/api/colaborador/primeiro-acesso")).send({ cpf, codigo, senha: "123" });
    expect(fraca.status).toBe(400);
    const ok = await mutacao(portal.post("/api/colaborador/primeiro-acesso")).send({ cpf, codigo, senha: SENHA });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.body.colaborador.id).toBe(colab.id);
    expect(ok.body.termo.aceito).toBe(false);
    expect(JSON.stringify(ok.body)).not.toContain(cpf);
    expect((await portal.get("/api/colaborador/eu")).status).toBe(200);
    const outro = request.agent(ctx.app);
    expect((await mutacao(outro.post("/api/colaborador/primeiro-acesso")).send({ cpf, codigo, senha: "outra-senha-2" })).status).toBe(401);
    const entrou = await mutacao(outro.post("/api/colaborador/entrar")).send({ cpf: `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`, senha: SENHA });
    expect(entrou.status, entrou.text).toBe(200);
    // sair encerra a sessão
    await mutacao(outro.post("/api/colaborador/sair")).send({});
    expect((await outro.get("/api/colaborador/eu")).status).toBe(401);
  });

  it("código vencido (72 h) não vale", async () => {
    const { colab, cpf } = await colaboradorComCpf();
    const codigo = await gerarCodigo(colab.id);
    await ctx.db.update(ctx.schema.colaboradoresAcesso).set({ codigoExpiraEm: new Date(Date.now() - 1000) }).where(eq(ctx.schema.colaboradoresAcesso.collaboratorId, colab.id));
    const r = await mutacao(request.agent(ctx.app).post("/api/colaborador/primeiro-acesso")).send({ cpf, codigo, senha: SENHA });
    expect(r.status).toBe(401);
  });

  it("senha errada e CPF sem cadastro respondem IGUAL; 5 erros seguidos bloqueiam 15 min (os dois casos)", async () => {
    const { cpf } = await colaboradorNoPortal({ aceitarTermo: false });
    const semCadastro = cpfNovo();
    const tentar = (c: string, senha: string) => mutacao(request(ctx.app).post("/api/colaborador/entrar")).send({ cpf: c, senha });
    const errada = await tentar(cpf, "senha-errada-9");
    const inexistente = await tentar(semCadastro, "senha-errada-9");
    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(errada.body).toEqual(inexistente.body);
    for (let i = 0; i < 3; i++) { await tentar(cpf, "senha-errada-9"); await tentar(semCadastro, "senha-errada-9"); }
    const quinta = await tentar(cpf, "senha-errada-9");
    const quintaSem = await tentar(semCadastro, "senha-errada-9");
    expect(quinta.status).toBe(429);
    expect(quintaSem.status).toBe(429);
    expect(quinta.body).toEqual(quintaSem.body);
    // Bloqueado: nem a senha certa entra
    expect((await tentar(cpf, SENHA)).status).toBe(429);
  });

  it("CPF no documento SECUNDÁRIO também entra", async () => {
    const { colab, cpf } = await colaboradorComCpf({ secundario: true });
    const codigo = await gerarCodigo(colab.id);
    const r = await mutacao(request.agent(ctx.app).post("/api/colaborador/primeiro-acesso")).send({ cpf, codigo, senha: SENHA });
    expect(r.status, r.text).toBe(200);
  });

  it("colaborador inativo não entra (e não ganha código)", async () => {
    const { colab, cpf, portal } = await colaboradorNoPortal({ aceitarTermo: false });
    await ctx.db.update(ctx.schema.collaborators).set({ active: false }).where(eq(ctx.schema.collaborators.id, colab.id));
    // a sessão aberta cai
    expect((await portal.get("/api/colaborador/eu")).status).toBe(401);
    const r = await mutacao(request(ctx.app).post("/api/colaborador/entrar")).send({ cpf, senha: SENHA });
    expect(r.status).toBe(401);
    const { agent } = await agenteLogado("production");
    expect((await mutacao(agent.post(`/api/colaboradores/${colab.id}/codigo-de-acesso`)).send({})).status).toBe(409);
  });
});

describe("dois mundos de sessão", () => {
  it("sessão do colaborador não passa em rota interna (401)", async () => {
    const { portal } = await colaboradorNoPortal();
    expect((await portal.get("/api/events")).status).toBe(401);
    expect((await portal.get("/api/budget-actual")).status).toBe(401);
    expect((await portal.get("/api/presenca/configuracao")).status).toBe(401);
    expect((await portal.get("/api/collaborators")).status).toBe(401);
  });
  it("sessão interna não passa no portal do colaborador (401), nem a do admin", async () => {
    for (const papel of ["admin", "financial", "production"] as const) {
      const { agent } = await agenteLogado(papel);
      expect((await agent.get("/api/colaborador/eu")).status).toBe(401);
      expect((await agent.get("/api/colaborador/prestacoes")).status).toBe(401);
    }
  });
  it("sem sessão: as rotas abertas existem, o resto é 401", async () => {
    expect((await request(ctx.app).get("/api/colaborador/prestacoes")).status).toBe(401);
    expect((await mutacao(request(ctx.app).post("/api/colaborador/entrar")).send({ cpf: "1", senha: "x" })).status).toBe(400);
  });
});

describe("portal: meus eventos", () => {
  it("só o fluxo novo: prestação de evento legado não aparece; legado na tela interna → 409", async () => {
    const { colab, portal } = await colaboradorNoPortal();
    const { actual } = await eventoDeHoje(colab.id);
    const legado = await criarEvento({ startDate: "2019-05-01", endDate: "2019-05-02" });
    const funcao = await criarFuncao();
    const velho = await prestacao({ collaboratorId: colab.id, eventId: legado.id, functionId: funcao.id, workedDays: ["2019-05-01"] });
    const r = await portal.get("/api/colaborador/prestacoes");
    expect(r.status).toBe(200);
    const ids = r.body.prestacoes.map((p: { id: string }) => p.id);
    expect(ids).toContain(actual.id);
    expect(ids).not.toContain(velho.id);
    const { agent } = await agenteLogado("production");
    const tela = await agent.get(`/api/presenca/eventos/${legado.id}`);
    expect(tela.status).toBe(409);
    expect(tela.body.codigo).toBe("evento_legado");
  });

  it("valores ocultos pelo evento: o servidor não manda o número", async () => {
    const { colab, portal } = await colaboradorNoPortal();
    const oculto = await eventoDeHoje(colab.id); // padrão: ocultar ligado
    const r = await portal.get("/api/colaborador/prestacoes");
    const p = r.body.prestacoes.find((x: { id: string }) => x.id === oculto.actual.id);
    expect(p.valoresOcultos).toBe(true);
    expect(p.valores).toBeNull();
    expect(JSON.stringify(p)).not.toContain("60000");
    expect(JSON.stringify(p)).not.toContain("valorCalculado");

    const { colab: c2, portal: portal2 } = await colaboradorNoPortal();
    const visivel = await eventoDeHoje(c2.id, { ocultar: false });
    const r2 = await portal2.get("/api/colaborador/prestacoes");
    const p2 = r2.body.prestacoes.find((x: { id: string }) => x.id === visivel.actual.id);
    expect(p2.valores.valorCalculado).toBe(60_000);
    expect(p2.valores.memoria.length).toBeGreaterThan(0);
  });

  it("não vê a prestação de outra pessoa (404)", async () => {
    const a = await colaboradorNoPortal();
    const b = await colaboradorNoPortal();
    const { actual } = await eventoDeHoje(a.colab.id);
    const r = await selfie(b.portal, `/api/colaborador/presencas/${actual.id}/${hoje}/entrada`);
    expect(r.status).toBe(404);
  });
});

describe("portal: check-in e check-out", () => {
  it("termo pendente → 409; selfie obrigatória; fora do dia → 409; saída sem entrada → 409; entrada e saída de hoje → 201", async () => {
    const { colab, portal } = await colaboradorNoPortal({ aceitarTermo: false });
    const { actual } = await eventoDeHoje(colab.id);
    const urlHoje = `/api/colaborador/presencas/${actual.id}/${hoje}`;
    const semTermo = await selfie(portal, `${urlHoje}/entrada`);
    expect(semTermo.status).toBe(409);
    expect(semTermo.body.codigo).toBe("termo_pendente");
    const eu = await portal.get("/api/colaborador/eu");
    expect((await mutacao(portal.post("/api/colaborador/termo")).send({ versao: "outra" })).status).toBe(409);
    expect((await mutacao(portal.post("/api/colaborador/termo")).send({ versao: eu.body.termo.versao })).status).toBe(200);

    const semFoto = await mutacao(portal.post(`${urlHoje}/entrada`)).send({});
    expect(semFoto.status).toBe(400);
    expect(semFoto.body.codigo).toBe("selfie_obrigatoria");
    expect((await selfie(portal, `/api/colaborador/presencas/${actual.id}/${somarDias(hoje, 1)}/entrada`)).status).toBe(409);
    expect((await selfie(portal, `/api/colaborador/presencas/${actual.id}/${somarDias(hoje, -1)}/entrada`)).status).toBe(409);
    expect((await selfie(portal, `${urlHoje}/saida`)).status).toBe(409);

    const entrada = await selfie(portal, `${urlHoje}/entrada`);
    expect(entrada.status, entrada.text).toBe(201);
    expect(entrada.body.entrada.comSelfie).toBe(true);
    expect(entrada.body.entrada.comLocalizacao).toBe(true);
    expect((await selfie(portal, `${urlHoje}/entrada`)).status).toBe(409); // uma vez por dia
    const saida = await selfie(portal, `${urlHoje}/saida`);
    expect(saida.status, saida.text).toBe(201);
    expect(saida.body.saida.hora).toMatch(/^\d{2}:\d{2}$/);

    const lista = await portal.get("/api/colaborador/prestacoes");
    const dia = lista.body.prestacoes.find((p: { id: string }) => p.id === actual.id).dias.find((d: { dia: string }) => d.dia === hoje);
    expect(dia.estado).toBe("concluido");
    // Auditoria do check-in sem a foto e sem as coordenadas
    const [p] = await ctx.db.select().from(ctx.schema.presencas).where(eq(ctx.schema.presencas.actualId, actual.id));
    const logs = await ctx.db.select().from(ctx.schema.systemLogs).where(eq(ctx.schema.systemLogs.entityId, p.id));
    expect(logs.length).toBe(2);
    expect(JSON.stringify(logs)).not.toContain(p.checkinFotoId!);
    expect(JSON.stringify(logs)).not.toContain("-23.55");
  });

  it("foto: o colaborador vê as próprias; outro colaborador não; DP/produção abrem nos anexos, Compras e Área de Função não", async () => {
    const a = await colaboradorNoPortal();
    const b = await colaboradorNoPortal();
    const { actual } = await eventoDeHoje(a.colab.id);
    expect((await selfie(a.portal, `/api/colaborador/presencas/${actual.id}/${hoje}/entrada`)).status).toBe(201);
    const [p] = await ctx.db.select().from(ctx.schema.presencas).where(eq(ctx.schema.presencas.actualId, actual.id));
    const foto = p.checkinFotoId!;
    expect(foto).toMatch(/^ATT-/);
    expect((await a.portal.get(`/api/colaborador/fotos/${foto}`)).status).toBe(200);
    expect((await b.portal.get(`/api/colaborador/fotos/${foto}`)).status).toBe(404);
    for (const [papel, status] of [["financial", 200], ["admin", 200], ["production", 200], ["purchasing", 403], ["function_area", 403]] as const) {
      const { agent } = await agenteLogado(papel);
      expect((await agent.get(`/api/attachments/${foto}/view`)).status, papel).toBe(status);
    }
    const hon = await agenteLogado("honorarios");
    expect((await hon.agent.get(`/api/attachments/${foto}/view`)).status).toBe(403);
  });
});

describe("presença no evento (produção/DP)", () => {
  it("a tela do evento: dias, quem está na arena agora, fotos só para quem pode, Área de Função só nas funções dela", async () => {
    const { colab, portal } = await colaboradorNoPortal();
    const { evento, funcao, actual } = await eventoDeHoje(colab.id);
    expect((await selfie(portal, `/api/colaborador/presencas/${actual.id}/${hoje}/entrada`)).status).toBe(201);

    const { agent } = await agenteLogado("production");
    const r = await agent.get(`/api/presenca/eventos/${evento.id}`);
    expect(r.status, r.text).toBe(200);
    expect(r.body.naArenaAgora.map((x: { actualId: string }) => x.actualId)).toContain(actual.id);
    const linha = r.body.prestacoes.find((p: { actualId: string }) => p.actualId === actual.id);
    expect(linha.dias.map((d: { estado: string }) => d.estado)).toEqual(["ausente", "em_andamento", "futuro"]);
    expect(linha.dias[1].entrada.fotoUrl).toMatch(/^\/api\/attachments\/ATT-/);
    expect(linha.acesso.temSenha).toBe(true);
    expect(linha.limiteDoAjuste).toMatchObject({ pct: 10 });

    const area = await agenteLogado("function_area");
    const semFuncao = await area.agent.get(`/api/presenca/eventos/${evento.id}`);
    expect(semFuncao.body.prestacoes).toHaveLength(0);
    await ctx.db.insert(ctx.schema.functionManagers).values({ functionId: funcao.id, userId: area.user.id });
    const comFuncao = await area.agent.get(`/api/presenca/eventos/${evento.id}`);
    expect(comFuncao.body.prestacoes).toHaveLength(1);
    expect(comFuncao.body.prestacoes[0].dias[1].entrada.fotoId).toBeNull();

    const compras = await agenteLogado("purchasing");
    expect((await compras.agent.get(`/api/presenca/eventos/${evento.id}`)).status).toBe(403);
  });

  it("representante faz o check-in pelo colaborador (no dia) e a produção corrige o check-out esquecido com motivo", async () => {
    const { colab } = await colaboradorComCpf();
    const { actual } = await eventoDeHoje(colab.id);
    const { agent, user } = await agenteLogado("production");
    const r = await selfie(agent, `/api/presenca/${actual.id}/${hoje}/entrada`);
    expect(r.status, r.text).toBe(201);
    expect(r.body.dias[1].entrada.por).toBe("representante");
    expect(r.body.dias[1].entrada.porUsuario.id).toBe(user.id);

    const semMotivo = await mutacao(agent.patch(`/api/presenca/${actual.id}/${somarDias(hoje, -1)}`)).send({ entrada: "08:00", saida: "18:00" });
    expect(semMotivo.status).toBe(400);
    const corrigido = await mutacao(agent.patch(`/api/presenca/${actual.id}/${somarDias(hoje, -1)}`)).send({ entrada: "08:00", saida: "18:00", motivo: "Esqueceu o check-out na saída" });
    expect(corrigido.status, corrigido.text).toBe(200);
    expect(corrigido.body.dias[0]).toMatchObject({ estado: "concluido" });
    expect(corrigido.body.dias[0].entrada.hora).toBe("08:00");
    expect(corrigido.body.dias[0].saida.hora).toBe("18:00");
    expect(corrigido.body.dias[0].observacao).toContain("Esqueceu o check-out");

    const area = await agenteLogado("function_area");
    expect((await mutacao(area.agent.patch(`/api/presenca/${actual.id}/${hoje}`)).send({ saida: "18:00", motivo: "teste de papel" })).status).toBe(403);
  });

  it("ocorrências: falta tira o dia do cálculo; remover devolve", async () => {
    const { colab } = await colaboradorComCpf();
    const { actual } = await prestacaoPassada(colab.id);
    const { agent } = await agenteLogado("production");
    const foraDoDia = await mutacao(agent.post(`/api/presenca/${actual.id}/ocorrencias`)).send({ tipo: "falta", dia: "2026-09-30" });
    expect(foraDoDia.status).toBe(400);
    const falta = await mutacao(agent.post(`/api/presenca/${actual.id}/ocorrencias`)).send({ tipo: "falta", dia: "2026-10-02", observacao: "Não apareceu" });
    expect(falta.status, falta.text).toBe(201);
    expect(falta.body.calculo.valorCalculado).toBe(40_000);
    expect(falta.body.dias[1].estado).toBe("falta");
    expect((await mutacao(agent.post(`/api/presenca/${actual.id}/ocorrencias`)).send({ tipo: "falta", dia: "2026-10-02" })).status).toBe(409);
    const horas = await mutacao(agent.post(`/api/presenca/${actual.id}/ocorrencias`)).send({ tipo: "horas_extras", horas: 4 });
    expect(horas.body.calculo.valorCalculado).toBe(40_000 + 10_000);
    const id = falta.body.ocorrencias.find((o: { tipo: string }) => o.tipo === "falta").id;
    const removida = await agent.delete(`/api/presenca/ocorrencias/${id}`).set("Origin", ORIGEM_PERMITIDA);
    expect(removida.status, removida.text).toBe(200);
    expect(removida.body.calculo.valorCalculado).toBe(60_000 + 10_000);
  });

  it("check-out final: dias pendentes → 409 com a lista", async () => {
    const { colab } = await colaboradorComCpf();
    const { actual } = await prestacaoPassada(colab.id, ["2026-10-01"]);
    const { agent } = await agenteLogado("production");
    const r = await mutacao(agent.post(`/api/presenca/${actual.id}/checkout-final`)).send({ valorFinal: 60_000, justificativa: "Fechamento do evento" });
    expect(r.status).toBe(409);
    expect(r.body.diasPendentes).toEqual(["2026-10-02", "2026-10-03"]);
  });

  it("check-out final pela produção: fora de ±10% → 409; sem confirmação exige justificativa; dentro → grava, recalcula e manda ao DP", async () => {
    const { colab } = await colaboradorComCpf();
    const { actual } = await prestacaoPassada(colab.id);
    const { agent, user } = await agenteLogado("production");
    const fora = await mutacao(agent.post(`/api/presenca/${actual.id}/checkout-final`)).send({ valorFinal: 66_001, justificativa: "Dobrou no último dia" });
    expect(fora.status).toBe(409);
    expect(fora.body).toMatchObject({ codigo: "fora_do_limite", minimo: 54_000, maximo: 66_000 });
    expect(fora.body.message).toContain("R$ 660,00");
    const semJust = await mutacao(agent.post(`/api/presenca/${actual.id}/checkout-final`)).send({ valorFinal: 66_000 });
    expect(semJust.status).toBe(409);
    expect(semJust.body.codigo).toBe("justificativa_obrigatoria");
    const cnpj = completarCnpj("998887770001");
    const ok = await mutacao(agent.post(`/api/presenca/${actual.id}/checkout-final`)).send({ valorFinal: 66_000, cnpj, razaoSocial: "FREELA ME", justificativa: "Colaborador sem celular no evento" });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.body.checkoutFinal).toMatchObject({ feito: true, valorCalculado: 60_000, valorFinal: 66_000, ajustePct: 10 });
    expect(ok.body.cnpj).toMatchObject({ situacao: "sem_contrato", origem: "checkout_final" });
    const gravado = await ctx.storage.getBudgetActualById(actual.id);
    expect(gravado).toMatchObject({
      sentForReview: true, rhStatus: "pendente", totalValue: 66_000, valorCalculado: 60_000,
      cnpjEmissor: digitosDoCnpj(cnpj), razaoSocialEmissor: "FREELA ME", checkoutFinalPor: user.id,
      workedDays: ["2026-10-01", "2026-10-02", "2026-10-03"], dailyQuantity: 3, dailyValue: 22_000,
    });
    expect(gravado!.observations).toContain("sem a confirmação do colaborador");
    // O motivo da mudança vai junto (a Conferência DP cobra changeReason).
    expect(gravado!.changeReason).toMatch(/^Check-out final da presença por .+ · ajuste de 10% sobre o calculado · sem a confirmação do colaborador: Colaborador sem celular no evento$/);
    const logs = await ctx.db.select().from(ctx.schema.systemLogs).where(eq(ctx.schema.systemLogs.entityId, actual.id));
    expect(logs.some((l) => l.action === "send_review")).toBe(true);
    // Já está com o DP: não refaz
    expect((await mutacao(agent.post(`/api/presenca/${actual.id}/checkout-final`)).send({ valorFinal: 60_000, justificativa: "de novo" })).status).toBe(409);
  });

  it("check-out final pelo DP: sem limite; com a confirmação do colaborador não precisa de justificativa", async () => {
    const { colab, portal } = await colaboradorNoPortal();
    const { actual } = await prestacaoPassada(colab.id);
    const cnpj = completarCnpj("554443330001");
    const [contrato] = await ctx.db.insert(ctx.schema.contratos).values({ cnpj: digitosDoCnpj(cnpj), razaoSocial: "FREELA LTDA", vigenciaInicio: "2026-01-01" }).returning();
    await ctx.db.insert(ctx.schema.contratosColaboradores).values({ contratoId: contrato.id, collaboratorId: colab.id });
    const conf = await mutacao(portal.post(`/api/colaborador/prestacoes/${actual.id}/confirmar`)).send({ dias: ["2026-10-01", "2026-10-02", "2026-10-03"], cnpj });
    expect(conf.status, conf.text).toBe(200);
    expect(conf.body.confirmacao.cnpjComContrato).toBe(true);
    expect((await mutacao(portal.post(`/api/colaborador/prestacoes/${actual.id}/confirmar`)).send({ dias: ["2026-10-01"], cnpj: "11.111.111/1111-11" })).status).toBe(400);

    const { agent } = await agenteLogado("financial");
    const ok = await mutacao(agent.post(`/api/presenca/${actual.id}/checkout-final`)).send({ valorFinal: 90_000 });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.body.checkoutFinal.ajustePct).toBe(50);
    // O CNPJ da confirmação vira o CNPJ emissor gravado no check-out final.
    expect(ok.body.cnpj).toMatchObject({ situacao: "contrato_ativo", origem: "checkout_final", contratoId: contrato.id, informado: cnpj });
    expect((await ctx.storage.getBudgetActualById(actual.id))!.cnpjEmissor).toBe(digitosDoCnpj(cnpj));
    expect(ok.body.limiteDoAjuste).toBeNull();
    // Depois do check-out final o colaborador não refaz a confirmação
    expect((await mutacao(portal.post(`/api/colaborador/prestacoes/${actual.id}/confirmar`)).send({ dias: ["2026-10-01"], cnpj })).status).toBe(409);
  });

  it("confirmação antes do último dia → 409; CNPJ sem contrato grava assim mesmo", async () => {
    const { colab, portal } = await colaboradorNoPortal();
    const hojeEvento = await eventoDeHoje(colab.id);
    expect((await mutacao(portal.post(`/api/colaborador/prestacoes/${hojeEvento.actual.id}/confirmar`)).send({ dias: [hoje], cnpj: completarCnpj("123123120001") })).status).toBe(409);
    const { actual } = await prestacaoPassada(colab.id);
    const r = await mutacao(portal.post(`/api/colaborador/prestacoes/${actual.id}/confirmar`)).send({ dias: ["2026-10-01", "2026-10-02"], cnpj: completarCnpj("123123120001"), contestacao: "Trabalhei também no dia 03." });
    expect(r.status, r.text).toBe(200);
    expect(r.body.confirmacao.cnpjComContrato).toBe(false);
    const { agent } = await agenteLogado("financial");
    const [linha] = (await agent.get(`/api/presenca/eventos/${actual.eventId}`)).body.prestacoes;
    expect(linha.cnpj.situacao).toBe("sem_contrato");
    expect(linha.confirmacao.contestacao).toContain("dia 03");
  });
});

describe("configurações da presença", () => {
  it("DP lê; só o admin muda; valores inválidos → 400", async () => {
    const dp = await agenteLogado("financial");
    const lido = await dp.agent.get("/api/presenca/configuracao");
    expect(lido.status).toBe(200);
    expect(lido.body).toMatchObject({ provisorio: true, podeEditar: false, configuracao: { produtorAjusteMaxPct: 10, horaExtraDivisor: 8, selfieObrigatoria: true } });
    expect((await mutacao(dp.agent.put("/api/presenca/configuracao")).send({ produtorAjusteMaxPct: 12 })).status).toBe(403);
    const adm = await agenteLogado("admin");
    expect((await mutacao(adm.agent.put("/api/presenca/configuracao")).send({ produtorAjusteMaxPct: 500 })).status).toBe(400);
    const ok = await mutacao(adm.agent.put("/api/presenca/configuracao")).send({ retencaoDias: 400 });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.body.configuracao.retencaoDias).toBe(400);
    const prod = await agenteLogado("production");
    expect((await prod.agent.get("/api/presenca/configuracao")).status).toBe(403);
  });
});

describe("perfil Honorários não vê nada da presença", () => {
  it("403 em todas as rotas internas novas", async () => {
    const { colab } = await colaboradorComCpf();
    const { evento, actual } = await eventoDeHoje(colab.id);
    const { agent } = await agenteLogado("honorarios");
    const pedidos = [
      () => agent.get(`/api/presenca/eventos/${evento.id}`),
      () => agent.get("/api/presenca/configuracao"),
      () => mutacao(agent.put("/api/presenca/configuracao")).send({}),
      () => mutacao(agent.post(`/api/colaboradores/${colab.id}/codigo-de-acesso`)).send({}),
      () => mutacao(agent.post(`/api/presenca/${actual.id}/${hoje}/entrada`)).send({}),
      () => mutacao(agent.patch(`/api/presenca/${actual.id}/${hoje}`)).send({ saida: "18:00", motivo: "teste" }),
      () => mutacao(agent.post(`/api/presenca/${actual.id}/ocorrencias`)).send({ tipo: "falta", dia: hoje }),
      () => agent.delete("/api/presenca/ocorrencias/qualquer").set("Origin", ORIGEM_PERMITIDA),
      () => mutacao(agent.post(`/api/presenca/${actual.id}/confirmar`)).send({ dias: [], cnpj: "x" }),
      () => mutacao(agent.post(`/api/presenca/${actual.id}/checkout-final`)).send({ valorFinal: 1 }),
    ];
    for (const pedir of pedidos) expect((await pedir()).status).toBe(403);
    expect((await agent.get("/api/colaborador/eu")).status).toBe(401);
  });
});

describe("seed da demonstração (server/dev/demo-seed-presenca.ts)", () => {
  it("cria o evento do fluxo novo com 4 pessoas, 2 na arena, ocorrências, uma confirmação e o acesso ao portal", async () => {
    const [{ semearDemo }, { semearContratosDemo }, { semearPresencaDemo, DEMO_SENHA_DO_COLABORADOR }] = await Promise.all([
      import("../dev/demo-seed"), import("../dev/demo-seed-contratos"), import("../dev/demo-seed-presenca"),
    ]);
    await semearDemo(ctx.db);
    await semearContratosDemo(ctx.db);
    const resumo = await semearPresencaDemo(ctx.db);
    expect(resumo.pessoas).toBe(4);
    expect(resumo.portal).toHaveLength(2);
    const [evento] = await ctx.db.select().from(ctx.schema.events).where(eq(ctx.schema.events.name, "Meia Maratona de Florianópolis"));
    const { agent } = await agenteLogado("financial");
    const tela = await agent.get(`/api/presenca/eventos/${evento.id}`);
    expect(tela.status, tela.text).toBe(200);
    expect(tela.body.prestacoes).toHaveLength(4);
    expect(tela.body.naArenaAgora).toHaveLength(2);
    expect(tela.body.prestacoes.some((p: { confirmacao: unknown }) => p.confirmacao)).toBe(true);
    expect(tela.body.prestacoes.flatMap((p: { ocorrencias: unknown[] }) => p.ocorrencias)).toHaveLength(2);
    const portal = request.agent(ctx.app);
    const entrou = await mutacao(portal.post("/api/colaborador/entrar")).send({ cpf: resumo.portal[0].cpf, senha: DEMO_SENHA_DO_COLABORADOR });
    expect(entrou.status, entrou.text).toBe(200);
    expect(entrou.body.termo.aceito).toBe(true);
    const minhas = await portal.get("/api/colaborador/prestacoes");
    expect(minhas.body.prestacoes.map((p: { evento: { id: string } }) => p.evento.id)).toContain(evento.id);
  }, 120_000);
});
