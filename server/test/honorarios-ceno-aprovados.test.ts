/**
 * Honorários da cenotécnica — 30/10, sobre o PGlite:
 *  - GET /api/honorarios-ceno/aprovados ("Aprovados — todos os eventos", de
 *    quem lança; o DP e o admin também): só aprovados, só das funções de quem
 *    lança, de vários eventos, com as liberações que valem;
 *  - a OC/DP deixou de ser obrigatória na liberação e o DP a informa depois
 *    (PATCH /api/honorarios-ceno/:id/liberacoes/:liberacaoId/oc).
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, criarUsuario, criarVaga, logarComo, mutacao, unico,
  type Contexto, type TestAgent, type UsuarioDeTeste,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

async function agenteDe(user: UsuarioDeTeste): Promise<TestAgent> {
  const agent = request.agent(ctx.app);
  await logarComo(agent, user);
  return agent;
}

interface Liberacao { id: string; data: string; oc: string; valor: number }
interface Aprovado {
  id: string; eventId: string; eventName: string; eventStartDate: string; nome: string; status: string; functionName: string;
  valorPedido: number; valorAprovado: number; liberado: number; falta: number; decididoPorNome: string | null; decididoEm: string | null;
  setor: string | null; posicao: string | null; tipo: string; liberacoes: Liberacao[];
}

/** Uma função de cenotécnica com quem lança e o aprovador; N vagas escaladas em um evento. */
async function funcaoComGente(nome: string) {
  const funcao = await criarFuncao({ name: `${nome} ${unico()}` });
  const pede = await criarUsuario("production");
  const aprova = await criarUsuario("production");
  await ctx.db.insert(ctx.schema.scalingFunctionManagers).values([
    { functionId: funcao.id, userId: pede.id, role: "validador" },
    { functionId: funcao.id, userId: aprova.id, role: "aprovador" },
  ]);
  return { funcao, pede: { agent: await agenteDe(pede), user: pede }, aprova: { agent: await agenteDe(aprova), user: aprova } };
}
type Gente = Awaited<ReturnType<typeof funcaoComGente>>;

async function vagaEscalada(g: Gente, eventId: string) {
  const c = await criarColaborador({ fullName: `Freela ${unico()}` });
  return criarVaga({ userId: g.pede.user.id, eventId, functionId: g.funcao.id, status: "escalado", phase: "escalacao", collaboratorId: c.id });
}

/** Pede ("Outro valor"), envia e — conforme `ate` — aprova, aprova com ajuste ou devolve. */
async function pedido(g: Gente, eventId: string, valor: number, ate: "rascunho" | "aguardando" | "aprovado" | "ajuste" | "devolvido") {
  const v = await vagaEscalada(g, eventId);
  const r = await mutacao(g.pede.agent.post("/api/honorarios-ceno")).send({ eventId, tipo: "vaga", teamInclusionId: v.id, tipoFreela: "outro", valorPedido: valor, observacao: "Negociado" });
  expect(r.status, r.text).toBe(201);
  let h = r.body as { id: string; versao: number };
  if (ate === "rascunho") return h;
  const e = await mutacao(g.pede.agent.post("/api/honorarios-ceno/enviar")).send({ itens: [{ id: h.id, versao: h.versao }] });
  expect(e.status, e.text).toBe(200);
  h = { id: h.id, versao: h.versao + 1 };
  if (ate === "aguardando") return h;
  const rota = ate === "aprovado" ? "aprovar" : ate === "ajuste" ? "aprovar-com-ajuste" : "devolver";
  const corpo = ate === "aprovado" ? { versao: h.versao } : ate === "ajuste" ? { versao: h.versao, valor: valor - 10_000, motivo: "Fechado com a produção" } : { versao: h.versao, motivo: "Rever o valor" };
  const d = await mutacao(g.aprova.agent.post(`/api/honorarios-ceno/${h.id}/${rota}`)).send(corpo);
  expect(d.status, d.text).toBe(200);
  return d.body as { id: string; versao: number };
}

async function liberar(agent: TestAgent, h: { id: string; versao: number }, valor: number, oc?: string) {
  const r = await mutacao(agent.post(`/api/honorarios-ceno/${h.id}/liberacoes`)).send({ versao: h.versao, data: "2099-11-05", valor, ...(oc !== undefined ? { oc } : {}) });
  expect(r.status, r.text).toBe(201);
  return r.body as { id: string; versao: number; liberado: number; falta: number };
}

async function aprovados(agent: TestAgent) {
  const r = await agent.get("/api/honorarios-ceno/aprovados");
  expect(r.status, r.text).toBe(200);
  return r.body as Aprovado[];
}

async function historico(agent: TestAgent, id: string) {
  const r = await agent.get(`/api/honorarios-ceno/${id}/historico`);
  expect(r.status, r.text).toBe(200);
  return r.body as { historico: { acao: string; detalhe: string | null; porNome: string }[]; liberacoes: { id: string; oc: string; estornadaEm: string | null }[] };
}

describe("GET /api/honorarios-ceno/aprovados — todos os eventos", () => {
  it("quem lança vê só os APROVADOS das funções dele, de vários eventos, com as liberações que valem", async () => {
    const ev1 = await criarEvento({ name: `Night Run ${unico()}`, startDate: "2099-11-01", endDate: "2099-11-02" });
    const ev2 = await criarEvento({ name: `Meia de Floripa ${unico()}`, startDate: "2099-12-06", endDate: "2099-12-07" });
    const ceno = await funcaoComGente("Cenotécnica");
    const sup = await funcaoComGente("Sup Ceno");

    const aprovado1 = await pedido(ceno, ev1.id, 120_000, "aprovado");
    const ajuste1 = await pedido(ceno, ev1.id, 150_000, "ajuste");
    const aprovado2 = await pedido(ceno, ev2.id, 90_000, "aprovado");
    const rascunho = await pedido(ceno, ev1.id, 50_000, "rascunho");
    const aguardando = await pedido(ceno, ev1.id, 60_000, "aguardando");
    const devolvido = await pedido(ceno, ev2.id, 70_000, "devolvido");
    const daOutraFuncao = await pedido(sup, ev1.id, 200_000, "aprovado");

    // Financeiro libera parte do ajuste em duas OCs e estorna uma delas.
    const rh = await agenteLogado("financial");
    const l1 = await liberar(rh.agent, ajuste1, 40_000, "45001");
    const l2 = await liberar(rh.agent, l1, 30_000, "45002");
    const hist = await historico(rh.agent, ajuste1.id);
    const doEstorno = hist.liberacoes.find((l) => l.oc === "45002")!;
    const est = await mutacao(rh.agent.post(`/api/honorarios-ceno/${ajuste1.id}/liberacoes/${doEstorno.id}/estornar`)).send({ versao: l2.versao, motivo: "OC errada" });
    expect(est.status, est.text).toBe(200);

    const lista = await aprovados(ceno.pede.agent);
    const ids = lista.map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining([aprovado1.id, ajuste1.id, aprovado2.id]));
    for (const fora of [rascunho.id, aguardando.id, devolvido.id, daOutraFuncao.id]) expect(ids).not.toContain(fora);
    expect(new Set(lista.filter((h) => [aprovado1.id, ajuste1.id, aprovado2.id].includes(h.id)).map((h) => h.eventId))).toEqual(new Set([ev1.id, ev2.id]));

    const aj = lista.find((h) => h.id === ajuste1.id)!;
    expect(aj).toMatchObject({
      status: "aprovado_ajuste", valorPedido: 150_000, valorAprovado: 140_000, liberado: 40_000, falta: 100_000,
      eventName: ev1.name, eventStartDate: "2099-11-01", decididoPorNome: ceno.aprova.user.name, tipo: "vaga",
    });
    expect(aj.decididoEm).toBeTruthy();
    // Só a liberação que vale, com data, OC e valor — nada além disso.
    expect(aj.liberacoes).toEqual([{ id: expect.any(String), data: "2099-11-05", oc: "45001", valor: 40_000 }]);
    // Sem dado bancário/CPF.
    expect(JSON.stringify(lista)).not.toMatch(/cpf|pix|banco|agencia/i);

    // O outro que lança vê o dele e não os da Cenotécnica.
    const doSup = (await aprovados(sup.pede.agent)).map((h) => h.id);
    expect(doSup).toContain(daOutraFuncao.id);
    expect(doSup).not.toContain(aprovado1.id);

    // DP e admin (quem controla as OCs) veem todas as funções.
    const doDp = (await aprovados(rh.agent)).map((h) => h.id);
    expect(doDp).toEqual(expect.arrayContaining([aprovado1.id, daOutraFuncao.id]));
  });

  it("quem não lança nem é do DP recebe 403 (inclusive o aprovador e o perfil Honorários)", async () => {
    const ceno = await funcaoComGente("Cenotécnica");
    const fora = await agenteLogado("function_area");
    expect((await fora.agent.get("/api/honorarios-ceno/aprovados")).status).toBe(403);
    expect((await ceno.aprova.agent.get("/api/honorarios-ceno/aprovados")).status).toBe(403);
    const controladoria = await agenteLogado("honorarios");
    expect((await controladoria.agent.get("/api/honorarios-ceno/aprovados")).status).toBe(403);
  });
});

describe("Liberação sem OC e a OC informada depois pelo DP (30/10)", () => {
  it("libera sem OC (201, histórico \"sem OC\"); o DP informa depois (200, histórico); trocar exige a OC lida", async () => {
    const ev = await criarEvento({ name: `Night Run ${unico()}` });
    const ceno = await funcaoComGente("Cenotécnica");
    const h = await pedido(ceno, ev.id, 100_000, "aprovado");

    const controladoria = await agenteLogado("honorarios");
    const semOc = await liberar(controladoria.agent, h, 60_000);
    expect(semOc).toMatchObject({ liberado: 60_000, falta: 40_000 });
    const comVazia = await liberar(controladoria.agent, semOc, 10_000, "   ");
    expect(comVazia.liberado).toBe(70_000);

    const dp = await agenteLogado("financial");
    let hist = await historico(dp.agent, h.id);
    expect(hist.historico.filter((x) => x.acao === "liberacao").map((x) => x.detalhe)).toEqual(expect.arrayContaining([expect.stringMatching(/^sem OC · /)]));
    expect(hist.liberacoes.every((l) => l.oc === "")).toBe(true);
    const alvo = hist.liberacoes[0];

    // Quem lança, o aprovador e o perfil Honorários não informam OC.
    for (const agent of [ceno.pede.agent, ceno.aprova.agent, controladoria.agent]) {
      expect((await mutacao(agent.patch(`/api/honorarios-ceno/${h.id}/liberacoes/${alvo.id}/oc`)).send({ oc: "45999" })).status).toBe(403);
    }
    // Vazia não vale.
    expect((await mutacao(dp.agent.patch(`/api/honorarios-ceno/${h.id}/liberacoes/${alvo.id}/oc`)).send({ oc: "  " })).status).toBe(400);

    const ok = await mutacao(dp.agent.patch(`/api/honorarios-ceno/${h.id}/liberacoes/${alvo.id}/oc`)).send({ oc: " 45123 ", ocAnterior: "" });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.body.liberacao).toMatchObject({ id: alvo.id, oc: "45123" });
    hist = await historico(dp.agent, h.id);
    const registro = hist.historico.find((x) => x.acao === "oc_informada")!;
    expect(registro.detalhe).toMatch(/^OC 45123 informada na liberação de \d\d\/\d\d .* por /);
    expect(registro.porNome).toBe(dp.user.name);

    // Outra pessoa do DP com a tela velha (achava "sem OC"): 409, nada muda.
    const velho = await mutacao(dp.agent.patch(`/api/honorarios-ceno/${h.id}/liberacoes/${alvo.id}/oc`)).send({ oc: "77777", ocAnterior: "" });
    expect(velho.status).toBe(409);
    // Corrigir com a OC lida: vale e fica no histórico.
    const troca = await mutacao(dp.agent.patch(`/api/honorarios-ceno/${h.id}/liberacoes/${alvo.id}/oc`)).send({ oc: "45124", ocAnterior: "45123" });
    expect(troca.status, troca.text).toBe(200);

    // Quem lança vê a OC na aba "Aprovados".
    const linha = (await aprovados(ceno.pede.agent)).find((x) => x.id === h.id)!;
    expect(linha.liberacoes.map((l) => l.oc).sort()).toEqual(["", "45124"]);

    // Auditoria registrada.
    const logs = await ctx.db.select().from(ctx.schema.systemLogs);
    expect(logs.some((l) => l.action === "informar_oc_liberacao" && l.entityId === h.id)).toBe(true);
  });

  it("liberação estornada não recebe OC (409); liberação de outro pedido: 404", async () => {
    const ev = await criarEvento({ name: `Night Run ${unico()}` });
    const ceno = await funcaoComGente("Cenotécnica");
    const h = await pedido(ceno, ev.id, 100_000, "aprovado");
    const outro = await pedido(ceno, ev.id, 80_000, "aprovado");
    const dp = await agenteLogado("financial");
    const lib = await liberar(dp.agent, h, 50_000);
    const { liberacoes } = await historico(dp.agent, h.id);
    const est = await mutacao(dp.agent.post(`/api/honorarios-ceno/${h.id}/liberacoes/${liberacoes[0].id}/estornar`)).send({ versao: lib.versao, motivo: "Lançada em dobro" });
    expect(est.status, est.text).toBe(200);
    const r = await mutacao(dp.agent.patch(`/api/honorarios-ceno/${h.id}/liberacoes/${liberacoes[0].id}/oc`)).send({ oc: "45123" });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/estornada/);
    const errado = await mutacao(dp.agent.patch(`/api/honorarios-ceno/${outro.id}/liberacoes/${liberacoes[0].id}/oc`)).send({ oc: "45123" });
    expect(errado.status).toBe(404);
  });
});
