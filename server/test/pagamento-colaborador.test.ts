/**
 * Dados de pagamento do colaborador — rotas (26/10).
 *
 * Cobre: criptografia em repouso (o banco guarda cifrado, a tela do DP vê
 * decifrado); sem a chave o app não quebra (campos cifrados recusados com
 * 503, o resto grava); permissões (só admin + financial; os outros 403) e
 * NENHUMA rota de colaborador vaza os campos — nem a integração com o
 * Maratona; validações (PIX conforme o tipo, banco, conta tudo-ou-nada);
 * versão; auditoria mascarada; aviso do sino e conferência por OUTRA pessoa.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { completarCnpj } from "@shared/cnpj";
import { completarCpf } from "@shared/pagamento";
import { pareceCifrado } from "../cripto-pagamento";
import { agenteLogado, criarApp, criarColaborador, mutacao, type Contexto } from "./harness";

let ctx: Contexto;
const CHAVE = randomBytes(32).toString("base64");
beforeAll(async () => {
  ctx = await criarApp();
  process.env.PAGAMENTO_CHAVE = CHAVE;
  process.env.MARATONA_API_TOKEN ||= "token-do-maratona-nos-testes";
});
afterEach(() => {
  process.env.PAGAMENTO_CHAVE = CHAVE;
});

// Valores fictícios e fáceis de achar em qualquer resposta (para provar que não vazam).
const CONTA = "7766554-3";
const AGENCIA = "4321";
const PIX_CPF = completarCpf("731846205");

const url = (id: string) => `/api/colaboradores/${id}/pagamento`;
const completo = { banco: "341", agencia: AGENCIA, conta: CONTA, tipoConta: "corrente", pixTipo: "cpf", pixChave: PIX_CPF, titular: "Pessoa Fictícia", email: "contato@exemplo.com" };

async function linhaNoBanco(collaboratorId: string) {
  const [l] = await ctx.db.select().from(ctx.schema.colaboradoresPagamento).where(eq(ctx.schema.colaboradoresPagamento.collaboratorId, collaboratorId));
  return l;
}

describe("Pagamento — criptografia em repouso", () => {
  it("o banco guarda cifrado; o DP lê decifrado; GET sem cache", async () => {
    const { agent } = await agenteLogado("financial");
    const c = await criarColaborador();
    const put = await mutacao(agent.put(url(c.id))).send({ versao: 0, ...completo });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ ok: true, versao: 1, mudouConta: true });

    const l = await linhaNoBanco(c.id);
    for (const v of [l.bancoCifrado, l.agenciaCifrada, l.contaCifrada, l.pixChaveCifrada]) expect(pareceCifrado(v)).toBe(true);
    const cru = JSON.stringify(l);
    expect(cru).not.toContain("7766554");
    expect(cru).not.toContain(PIX_CPF);
    expect(cru).not.toContain(AGENCIA);

    const get = await agent.get(url(c.id));
    expect(get.status).toBe(200);
    expect(get.headers["cache-control"]).toContain("no-store");
    expect(get.body.chaveConfigurada).toBe(true);
    expect(get.body.pagamento).toMatchObject({ banco: "341", agencia: AGENCIA, conta: CONTA, tipoConta: "corrente", pixTipo: "cpf", pixChave: PIX_CPF, versao: 1 });
    expect(get.body.ilegiveis).toEqual([]);
  });

  it("sem a chave: GET avisa e não quebra; PUT de banco/conta/PIX → 503; e-mail e titular gravam e o cifrado fica intacto", async () => {
    const { agent } = await agenteLogado("admin");
    const c = await criarColaborador();
    await mutacao(agent.put(url(c.id))).send({ versao: 0, ...completo });
    const antes = await linhaNoBanco(c.id);

    delete process.env.PAGAMENTO_CHAVE;
    const get = await agent.get(url(c.id));
    expect(get.status).toBe(200);
    expect(get.body.chaveConfigurada).toBe(false);
    expect(get.body.pagamento.conta).toBeNull();
    expect(get.body.ilegiveis.map((i: { campo: string }) => i.campo).sort()).toEqual(["agencia", "banco", "conta", "pixChave"]);
    expect(get.body.pagamento.tipoConta).toBe("corrente");

    const bloqueado = await mutacao(agent.put(url(c.id))).send({ versao: 1, conta: "1-1" });
    expect(bloqueado.status).toBe(503);
    expect(bloqueado.body.codigo).toBe("sem_chave");

    const email = await mutacao(agent.put(url(c.id))).send({ versao: 1, email: "novo@exemplo.com", titular: "Pessoa Fictícia" });
    expect(email.status).toBe(200);
    const depois = await linhaNoBanco(c.id);
    expect(depois.email).toBe("novo@exemplo.com");
    expect(depois.contaCifrada).toBe(antes.contaCifrada);
    expect(depois.tipoConta).toBe("corrente");

    process.env.PAGAMENTO_CHAVE = CHAVE;
    expect((await agent.get(url(c.id))).body.pagamento.conta).toBe(CONTA);
  });

  it("chave trocada: avisa 'outra chave' por campo; digitar de novo grava com a chave nova", async () => {
    const { agent } = await agenteLogado("financial");
    const c = await criarColaborador();
    await mutacao(agent.put(url(c.id))).send({ versao: 0, ...completo });
    process.env.PAGAMENTO_CHAVE = randomBytes(32).toString("base64");
    const get = await agent.get(url(c.id));
    expect(get.body.ilegiveis[0].mensagem).toMatch(/outra chave/);
    const r = await mutacao(agent.put(url(c.id))).send({ versao: 1, banco: "260", agencia: "1", conta: "2-2", pixChave: null, pixTipo: null });
    expect(r.status).toBe(200);
    const novo = await agent.get(url(c.id));
    expect(novo.body.ilegiveis).toEqual([]);
    expect(novo.body.pagamento).toMatchObject({ banco: "260", conta: "2-2", pixChave: null });
  });
});

describe("Pagamento — permissões e vazamento", () => {
  it.each(["production", "purchasing", "function_area", "honorarios"] as const)("%s leva 403 nas rotas de pagamento", async (papel) => {
    const { agent } = await agenteLogado(papel);
    const c = await criarColaborador();
    expect((await agent.get(url(c.id))).status).toBe(403);
    expect((await mutacao(agent.put(url(c.id))).send({ versao: 0, email: "x@y.com" })).status).toBe(403);
    expect((await agent.get("/api/pagamento/alteracoes")).status).toBe(403);
    expect((await agent.get("/api/shell/contas-alteradas")).status).toBe(403);
  });

  it("nenhuma rota de colaborador devolve os dados de pagamento — nem para o DP, nem na integração", async () => {
    const dp = await agenteLogado("financial");
    const c = await criarColaborador();
    await mutacao(dp.agent.put(url(c.id))).send({ versao: 0, ...completo });

    const procurar = (texto: string) => {
      expect(texto).not.toContain("7766554");
      expect(texto).not.toContain(PIX_CPF);
      expect(texto).not.toMatch(/banco_cifrado|bancoCifrado|contaCifrada|pixChave|tipoConta|"titular"/);
    };
    for (const papel of ["admin", "financial", "production", "purchasing", "function_area"] as const) {
      const { agent } = await agenteLogado(papel);
      const lista = await agent.get("/api/collaborators");
      expect(lista.status).toBe(200);
      expect(lista.body.some((x: { id: string }) => x.id === c.id)).toBe(true);
      procurar(lista.text);
    }
    const integracao = await request(ctx.app).get("/api/integration/employees").set("Authorization", `Bearer ${process.env.MARATONA_API_TOKEN}`);
    expect(integracao.status).toBe(200);
    procurar(integracao.text);
  });
});

describe("Pagamento — validações e versão", () => {
  it("PIX conforme o tipo, conta tudo-ou-nada, banco de 3 dígitos, e-mail", async () => {
    const { agent } = await agenteLogado("financial");
    const c = await criarColaborador();
    const tenta = (corpo: Record<string, unknown>) => mutacao(agent.put(url(c.id))).send({ versao: 0, ...corpo });
    expect((await tenta({ pixTipo: "cpf", pixChave: "123.456.789-00" })).body).toMatchObject({ campo: "pixChave" });
    expect((await tenta({ pixTipo: "email", pixChave: "sem-arroba" })).body).toMatchObject({ campo: "pixChave" });
    expect((await tenta({ pixTipo: "cnpj", pixChave: completarCnpj("123456780001") })).status).toBe(200);
    const c2 = await criarColaborador();
    const t2 = (corpo: Record<string, unknown>) => mutacao(agent.put(url(c2.id))).send({ versao: 0, ...corpo });
    expect((await t2({ banco: "341" })).body).toMatchObject({ campo: "agencia" });
    expect((await t2({ banco: "34100", agencia: "1", conta: "1-1", tipoConta: "corrente" })).body).toMatchObject({ campo: "banco" });
    expect((await t2({ email: "nao-e-email" })).body).toMatchObject({ campo: "email" });
    expect((await t2({ pixTipo: "boleto", pixChave: "x" })).status).toBe(400);
  });

  it("versão velha → 409; nada mudou → semMudanca sem gravar alteração", async () => {
    const { agent } = await agenteLogado("admin");
    const c = await criarColaborador();
    await mutacao(agent.put(url(c.id))).send({ versao: 0, ...completo });
    expect((await mutacao(agent.put(url(c.id))).send({ versao: 0, ...completo })).status).toBe(409);
    const igual = await mutacao(agent.put(url(c.id))).send({ versao: 1, ...completo });
    expect(igual.body).toMatchObject({ semMudanca: true });
    expect((await agent.get(url(c.id))).body.alteracoes).toHaveLength(1);
  });
});

describe("Pagamento — auditoria e aviso no sino", () => {
  it("mudança de conta: antes/depois mascarados, aviso para OUTRA pessoa do DP, quem alterou não confere", async () => {
    const ana = await agenteLogado("financial");
    const bia = await agenteLogado("financial");
    const c = await criarColaborador();
    const contagemDaBiaAntes = (await bia.agent.get("/api/shell/contas-alteradas")).body.count;
    const contagemDaAnaAntes = (await ana.agent.get("/api/shell/contas-alteradas")).body.count;
    await mutacao(ana.agent.put(url(c.id))).send({ versao: 0, ...completo });
    await mutacao(ana.agent.put(url(c.id))).send({ versao: 1, conta: "1122334-5" });

    expect((await bia.agent.get("/api/shell/contas-alteradas")).body.count).toBe(contagemDaBiaAntes + 2);
    // As próprias mudanças não entram no sino de quem as fez.
    expect((await ana.agent.get("/api/shell/contas-alteradas")).body.count).toBe(contagemDaAnaAntes);

    const pendentes = (await bia.agent.get("/api/pagamento/alteracoes")).body.filter((a: { collaboratorId: string }) => a.collaboratorId === c.id);
    expect(pendentes).toHaveLength(2);
    const troca = pendentes[0];
    expect(troca.campos).toEqual(["conta"]);
    expect(troca.antes.conta).toMatch(/•/);
    expect(troca.depois.conta).toMatch(/•/);
    expect(JSON.stringify(troca)).not.toContain("1122334");
    expect(JSON.stringify(troca)).not.toContain("7766554");
    expect(troca.podeConferir).toBe(true);

    const propria = await mutacao(ana.agent.post(`/api/pagamento/alteracoes/${troca.id}/conferir`));
    expect(propria.status).toBe(403);
    const ok = await mutacao(bia.agent.post(`/api/pagamento/alteracoes/${troca.id}/conferir`));
    expect(ok.status).toBe(200);
    expect((await mutacao(bia.agent.post(`/api/pagamento/alteracoes/${troca.id}/conferir`))).status).toBe(409);
    expect((await bia.agent.get("/api/shell/contas-alteradas")).body.count).toBe(contagemDaBiaAntes + 1);

    // Log do sistema: só valores mascarados.
    const logs = await ctx.db.select().from(ctx.schema.systemLogs).where(eq(ctx.schema.systemLogs.entityId, c.id));
    const texto = JSON.stringify(logs);
    expect(logs.some((l) => l.entityType === "colaborador_pagamento")).toBe(true);
    expect(texto).not.toContain("1122334");
    expect(texto).not.toContain("7766554");
    expect(texto).not.toContain(PIX_CPF);
  });

  it("só e-mail mudou: registra a alteração, mas não vira aviso de conta", async () => {
    const ana = await agenteLogado("admin");
    const bia = await agenteLogado("financial");
    const c = await criarColaborador();
    await mutacao(ana.agent.put(url(c.id))).send({ versao: 0, email: "a@exemplo.com" });
    const lista = (await bia.agent.get("/api/pagamento/alteracoes?situacao=todas")).body.filter((a: { collaboratorId: string }) => a.collaboratorId === c.id);
    expect(lista).toHaveLength(1);
    expect(lista[0].mudaConta).toBe(false);
    expect(lista[0].podeConferir).toBe(false);
  });

  it("titular que não bate com a razão social do CNPJ ligado vira aviso", async () => {
    const { agent } = await agenteLogado("financial");
    const c = await criarColaborador();
    const contrato = (await mutacao(agent.post("/api/contratos")).send({ cnpj: completarCnpj("987654320001"), razaoSocial: "Montagens Fictícias Ltda", tipo: "empresa", vigenciaInicio: "2020-01-01", colaboradorIds: [c.id] })).body;
    expect(contrato.id).toBeTruthy();
    await mutacao(agent.put(url(c.id))).send({ versao: 0, titular: "Outra Pessoa Qualquer" });
    const get = await agent.get(url(c.id));
    expect(get.body.contratos).toHaveLength(1);
    expect(get.body.situacaoContratual).toBe("com_contrato_ativo");
    expect(get.body.avisos[0]).toMatch(/não bate com a razão social/);
  });
});
