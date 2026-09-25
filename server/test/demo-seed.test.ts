/**
 * Testes de rota — modo demonstração e estado compartilhado (25/09).
 *
 * Cobre, sobre o PGlite do arquivo:
 *  - o seed de demonstração (server/dev/demo-seed.ts): contagens e cobertura
 *    de TODOS os status canônicos da vaga;
 *  - o login automático `GET /__demo/entrar?papel=…`: existe só com
 *    PAINEL_DEMO=1 fora de produção (com NODE_ENV=production → 404);
 *  - o anti-reuso do JWT do SSO na tabela `sso_tokens_usados`;
 *  - o store do express-rate-limit na tabela `rate_limits`;
 *  - o endpoint agregado GET /api/rh/controle sobre os dados semeados.
 *
 * Rodar: `npm run test:rotas`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Options } from "express-rate-limit";
import { STATUS_DA_VAGA } from "@shared/vaga-status";
import { agenteLogado, criarApp, criarUsuario, mutacao, tokenDoPortal, type Contexto } from "./harness";
import { DEMO_PAPEIS, DEMO_USUARIOS, semearDemo, type ResumoDoSeed } from "../dev/demo-seed";
import { PostgresRateLimitStore } from "../rate-limit-store";

let ctx: Contexto;
let resumo: ResumoDoSeed;
/** App criado com PAINEL_DEMO=1 (NODE_ENV=test) — tem a rota /__demo/entrar. */
let appDemo: Express;

/** Cria uma instância do app com o ambiente indicado e restaura o ambiente depois. */
async function criarAppCom(env: Record<string, string | undefined>): Promise<Express> {
  const anterior: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    anterior[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try {
    const { createApp } = await import("../app");
    const { app } = await createApp({ modoSeguro: false, cookieSecure: false });
    return app;
  } finally {
    for (const [k, v] of Object.entries(anterior)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

beforeAll(async () => {
  ctx = await criarApp();
  resumo = await semearDemo(ctx.db);
  appDemo = await criarAppCom({ PAINEL_DEMO: "1" });
}, 180_000);

afterAll(() => {
  delete process.env.PAINEL_DEMO;
});

async function entrarComo(papel: (typeof DEMO_PAPEIS)[number]): Promise<request.Agent> {
  const agent = request.agent(appDemo);
  const res = await agent.get(`/__demo/entrar?papel=${papel}`);
  expect(res.status).toBe(302);
  expect(res.headers.location).toBe("/");
  return agent;
}

// ── Seed ────────────────────────────────────────────────────────────────────
describe("seed de demonstração", () => {
  it("semeia 6 usuários, 12 funções, 60 colaboradores, 8 eventos e 150 vagas", () => {
    expect(Object.keys(resumo.usuarios)).toEqual([...DEMO_PAPEIS]);
    expect(resumo.funcoes).toBe(12);
    expect(resumo.colaboradores).toBe(60);
    expect(resumo.eventos).toBe(8);
    expect(resumo.vagas).toBe(150);
    expect(resumo.passagens).toBeGreaterThan(10);
    expect(resumo.hospedagens).toBeGreaterThan(10);
    expect(resumo.trocas).toBe(4);
    expect(resumo.pedidosDeAjuste).toBe(5);
    expect(resumo.planejado).toBeGreaterThan(40);
    expect(resumo.realizado).toBeGreaterThan(30);
    expect(resumo.notasFiscais).toBeGreaterThan(8);
  });

  it("cobre TODOS os status canônicos da vaga (shared/vaga-status)", async () => {
    const linhas = await ctx.db.select({ status: ctx.schema.teamInclusions.status, phase: ctx.schema.teamInclusions.phase }).from(ctx.schema.teamInclusions);
    const presentes = new Set(linhas.map((l) => l.status));
    for (const s of STATUS_DA_VAGA) expect(presentes.has(s), `status ${s} ausente no seed`).toBe(true);
    const fases = new Set(linhas.map((l) => l.phase));
    for (const f of ["sugestao", "inclusao", "escalacao", "passagem", "hospedagem", "aprovacao", "aprovado", "cancelado"]) {
      expect(fases.has(f), `fase ${f} ausente no seed`).toBe(true);
    }
  });

  it("um evento excluído, um em andamento, passados e futuros; vagas com validationNote e empreita por empresa", async () => {
    const eventos = await ctx.db.select().from(ctx.schema.events);
    expect(eventos.filter((e) => e.status === "excluído")).toHaveLength(1);
    expect(eventos.filter((e) => e.status === "em_andamento")).toHaveLength(1);
    expect(eventos.filter((e) => e.status === "concluido")).toHaveLength(1);
    const vagas = await ctx.db.select().from(ctx.schema.teamInclusions);
    expect(vagas.filter((v) => v.validationNote).length).toBeGreaterThan(2);
    expect(vagas.filter((v) => v.empreitaEmpresa).length).toBeGreaterThanOrEqual(1);
    expect(vagas.filter((v) => v.emitsNf === false && v.collaboratorId).length).toBeGreaterThan(3);
  });

  it("é idempotente: rodar de novo não duplica", async () => {
    const outra = await semearDemo(ctx.db);
    expect(outra.vagas).toBe(150);
    expect(outra.usuarios.admin).toBe(resumo.usuarios.admin);
  });

  it("os seis usuários existem com o papel certo e o aprovador tem canApproveCenotecnica", async () => {
    for (const papel of DEMO_PAPEIS) {
      const u = await ctx.storage.getUserByEmail(DEMO_USUARIOS[papel].email);
      expect(u, papel).toBeTruthy();
      expect(u!.role).toBe(DEMO_USUARIOS[papel].role);
      expect(u!.status).toBe("approved");
    }
    const aprovador = await ctx.storage.getUserByEmail(DEMO_USUARIOS.aprovador.email);
    expect(aprovador!.canApproveCenotecnica).toBe(true);
  });
});

// ── Login automático ────────────────────────────────────────────────────────
describe("GET /__demo/entrar (só com PAINEL_DEMO=1 fora de produção)", () => {
  it("cria a sessão do papel pedido e /api/auth/me devolve o usuário", async () => {
    for (const papel of DEMO_PAPEIS) {
      const agent = await entrarComo(papel);
      const me = await agent.get("/api/auth/me");
      expect(me.status, papel).toBe(200);
      expect(me.body.user.email).toBe(DEMO_USUARIOS[papel].email);
    }
  });

  it("a sessão criada passa pelo gate global da API", async () => {
    const agent = await entrarComo("production");
    const res = await agent.get("/api/events");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(7); // o excluído fica de fora
  });

  it("papel inválido → 400", async () => {
    const res = await request(appDemo).get("/__demo/entrar?papel=chefe");
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("papel");
  });

  it("no app padrão dos testes (sem PAINEL_DEMO) a rota não existe", async () => {
    const res = await request(ctx.app).get("/__demo/entrar?papel=admin");
    expect(res.status).toBe(404);
  });

  it("com NODE_ENV=production a rota NÃO é registrada mesmo com PAINEL_DEMO=1 → 404", async () => {
    const appProd = await criarAppCom({ PAINEL_DEMO: "1", NODE_ENV: "production" });
    const res = await request(appProd).get("/__demo/entrar?papel=admin");
    expect(res.status).toBe(404);
  });
});

// ── Estado compartilhado ────────────────────────────────────────────────────
describe("anti-reuso do JWT do SSO em sso_tokens_usados", () => {
  it("o mesmo token cria sessão UMA vez; o segundo uso é recusado e o jti fica gravado", async () => {
    const user = await criarUsuario("production");
    const token = await tokenDoPortal(user);
    const primeiro = await request(ctx.app).get(`/?portal_sso=${encodeURIComponent(token)}`);
    expect(primeiro.status).toBe(302);
    expect(primeiro.headers.location).toBe("/");

    const segundo = await request(ctx.app).get(`/?portal_sso=${encodeURIComponent(token)}`);
    expect(segundo.status).not.toBe(302);

    const jti = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).jti as string;
    const gravados = await ctx.db.select().from(ctx.schema.ssoTokensUsados);
    const linha = gravados.find((g) => g.jti === `jti:${jti}`);
    expect(linha).toBeTruthy();
    expect(new Date(linha!.expiraEm).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("PostgresRateLimitStore (tabela rate_limits)", () => {
  it("increment/get/decrement/resetKey funcionam e a janela vem do init", async () => {
    const store = new PostgresRateLimitStore(`teste-${Date.now()}`);
    store.init({ windowMs: 60_000 } as Options);
    const a = await store.increment("1.2.3.4");
    const b = await store.increment("1.2.3.4");
    const c = await store.increment("1.2.3.4");
    expect([a.totalHits, b.totalHits, c.totalHits]).toEqual([1, 2, 3]);
    expect(c.resetTime!.getTime()).toBeGreaterThan(Date.now() + 50_000);
    expect(a.resetTime!.getTime()).toBe(c.resetTime!.getTime()); // a janela não é reiniciada a cada hit

    await store.decrement("1.2.3.4");
    expect((await store.get("1.2.3.4"))!.totalHits).toBe(2);

    expect(await store.get("outro")).toBeUndefined();
    await store.resetKey("1.2.3.4");
    expect(await store.get("1.2.3.4")).toBeUndefined();
  });

  it("janela vencida recomeça em 1", async () => {
    const store = new PostgresRateLimitStore(`curto-${Date.now()}`);
    store.init({ windowMs: 1 } as Options);
    await store.increment("k");
    await new Promise((r) => setTimeout(r, 20));
    const depois = await store.increment("k");
    expect(depois.totalHits).toBe(1);
  });

  it("uma tentativa de login grava um contador com o prefixo login:", async () => {
    await mutacao(request(ctx.app).post("/api/auth/login")).send({ email: "x@y.z", password: "123456" });
    const linhas = await ctx.db.select().from(ctx.schema.rateLimits);
    expect(linhas.some((l) => l.chave.startsWith("login:") && l.hits >= 1)).toBe(true);
  });
});

// ── Endpoint agregado do Controle RH ────────────────────────────────────────
describe("GET /api/rh/controle", () => {
  it("papel de produção → 403; RH → 200 com itens, contadores e funções", async () => {
    const producao = await entrarComo("production");
    expect((await producao.get("/api/rh/controle")).status).toBe(403);

    const rh = await entrarComo("financial");
    const res = await rh.get("/api/rh/controle");
    expect(res.status).toBe(200);
    const { itens, contadores, funcoes, geradoEm } = res.body;
    expect(Array.isArray(itens)).toBe(true);
    expect(itens.length).toBeGreaterThan(50);
    expect(typeof geradoEm).toBe("string");
    expect(funcoes.length).toBeGreaterThan(5);
    expect(Object.keys(contadores.status).sort()).toEqual([
      "aguardando_prestacao", "aprovada_faturamento", "devolvida_para_ajuste", "planejamento_pendente", "prestacao_recebida", "recusada",
    ]);
    expect(Object.keys(contadores.nf).sort()).toEqual(["aprovada", "checkinDone", "checkinPending", "devolvida", "enviada", "pending"]);
    // O seed tem os seis status representados
    for (const s of Object.keys(contadores.status)) expect(contadores.status[s], s).toBeGreaterThan(0);
    expect(contadores.nf.checkinDone).toBeGreaterThan(0);
    expect(contadores.nf.enviada).toBeGreaterThan(0);
    expect(contadores.rhAction).toBeGreaterThan(0);

    const linha = itens.find((i: { planned: unknown; actual: unknown; invoice: unknown }) => i.planned && i.actual && i.invoice);
    expect(linha).toBeTruthy();
    for (const campo of ["id", "status", "responsavelAtual", "lastActivityDate", "event", "collaboratorId", "collaboratorName", "functionId", "functionName", "teamInclusion", "planned", "actual", "invoice", "emiteNf", "nfElegivel", "rhActionByName", "rhPrecisaAgir"]) {
      expect(linha, campo).toHaveProperty(campo);
    }
    expect(linha.event).toMatchObject({ id: expect.any(String), name: expect.any(String), startDate: expect.any(String) });
    expect(typeof linha.collaboratorName).toBe("string");
  });

  it("?eventId= restringe tudo ao evento (contadores inclusive) e ?status= filtra os itens", async () => {
    const rh = await entrarComo("financial");
    const eventos = (await rh.get("/api/events")).body as { id: string; name: string }[];
    const sp = eventos.find((e) => e.name.startsWith("Maratona Internacional"))!;
    const res = await rh.get(`/api/rh/controle?eventId=${sp.id}`);
    expect(res.status).toBe(200);
    expect(res.body.itens.length).toBeGreaterThan(10);
    for (const item of res.body.itens) expect(item.event.id).toBe(sp.id);
    // Evento fechado: todo Realizado aprovado → o contador de "aguardando" é zero
    expect(res.body.contadores.status.aguardando_prestacao).toBe(0);

    const filtrado = await rh.get(`/api/rh/controle?eventId=${sp.id}&status=concluidos`);
    expect(filtrado.status).toBe(200);
    expect(filtrado.body.itens.length).toBeGreaterThan(0);
    for (const item of filtrado.body.itens) {
      expect(item.status).toBe("aprovada_faturamento");
      expect(item.invoice.status).toBe("aprovada");
      expect(item.invoice.checkinAt).toBeTruthy();
    }
    // Contadores não mudam com o filtro
    expect(filtrado.body.contadores).toEqual(res.body.contadores);
  });

  it("isenção de NF vem da escalação (emitsNf=false → emiteNf=false na linha)", async () => {
    const rh = await entrarComo("financial");
    const res = await rh.get("/api/rh/controle");
    const isentas = res.body.itens.filter((i: { teamInclusion: { emitsNf: boolean } | null; emiteNf: boolean }) => i.teamInclusion?.emitsNf === false);
    expect(isentas.length).toBeGreaterThan(0);
    for (const i of isentas) expect(i.emiteNf).toBe(false);
  });

  it("status inválido → 400; evento inexistente → 404; status=all é aceito", async () => {
    const rh = await entrarComo("financial");
    expect((await rh.get("/api/rh/controle?status=qualquer")).status).toBe(400);
    expect((await rh.get("/api/rh/controle?eventId=nao-existe")).status).toBe(404);
    expect((await rh.get("/api/rh/controle?status=all")).status).toBe(200);
  });

  it("no app padrão (modo seguro), o RH logado pelo SSO também acessa", async () => {
    const { agent } = await agenteLogado("financial");
    const res = await agent.get("/api/rh/controle?status=rh_action");
    expect(res.status).toBe(200);
    for (const item of res.body.itens) expect(item.rhPrecisaAgir).toBe(true);
  });
});
