/**
 * Busca de passagens — etapa 2 (09/10): "Ver sem o horário sugerido",
 * aeroportos alternativos, mala, abas de análise (só admin), acompanhar preço
 * (limite, teto, para sozinho, sino), agendador com lock no banco, teto por
 * trecho com justificativa e os ajustes do admin. Fornecedor FALSO que conta.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, criarVaga, mutacao, type Contexto, type TestAgent } from "./harness";
import type { ConsultaDePassagens, ResultadoDaConsulta, RespostaDaBusca } from "@shared/busca-de-passagens";
import type { FornecedorDePassagens } from "../busca-de-passagens/fornecedor";

let ctx: Contexto;
let servico: typeof import("../busca-de-passagens/servico");
let agendador: typeof import("../busca-de-passagens/agendador");
const chamadas: ConsultaDePassagens[] = [];

const voo = (id: string, preco: number, partida: string, chegada: string, despachada = 0) => ({
  id, precoCentavos: preco, moeda: "BRL", bagagem: { mao: 1, despachada },
  pernas: [{ companhia: "G3", duracaoMin: 200, segmentos: [{ companhia: "G3", numero: "1500", origem: "GRU", destino: "JPA", partida, chegada }] }],
});
let precoDoFalso = 45000;
const falso: FornecedorDePassagens = {
  nome: "falso",
  simulado: true,
  async buscar(c): Promise<ResultadoDaConsulta> {
    chamadas.push(c);
    const ida = voo(`it-${chamadas.length}`, precoDoFalso, `${c.dataIda}T08:00`, `${c.dataIda}T11:20`);
    if (c.perna === "ida_e_volta") return { observadoEm: null, itinerarios: [{ ...ida, pernas: [ida.pernas[0], { ...ida.pernas[0], segmentos: [{ ...ida.pernas[0].segmentos[0], partida: `${c.dataVolta}T17:45`, chegada: `${c.dataVolta}T21:00` }] }] }] };
    return { observadoEm: null, itinerarios: [ida] };
  },
  async linksDeCompra() { return []; },
};

beforeAll(async () => {
  ctx = await criarApp();
  servico = await import("../busca-de-passagens/servico");
  agendador = await import("../busca-de-passagens/agendador");
  servico.definirFornecedorParaTestes(falso);
});

beforeEach(async () => {
  chamadas.length = 0;
  precoDoFalso = 45000;
  await ctx.db.delete(ctx.schema.buscaPassagensCache);
  await ctx.db.delete(ctx.schema.buscaPassagensConsumo);
  await ctx.db.delete(ctx.schema.buscaPassagensAcompanhamentos);
  await ctx.db.delete(ctx.schema.systemSettings).where(eq(ctx.schema.systemSettings.key, "busca_passagens_teto_mensal"));
});

const D = (md: string) => `2027-${md}`;

async function cenario(opts: { vagas?: number; funcao?: string; aeroporto?: string } = {}) {
  const { user } = await agenteLogado("admin");
  const evento = await criarEvento({ name: "Meia do Rio", location: "Aterro, Rio de Janeiro - RJ", startDate: D("03-11"), endDate: D("03-14") });
  await ctx.db.update(ctx.schema.events).set({ aeroportoIata: opts.aeroporto ?? "GIG" }).where(eq(ctx.schema.events.id, evento.id));
  const funcao = await criarFuncao(opts.funcao ? { name: opts.funcao } : {});
  const vagas = [];
  for (let i = 0; i < (opts.vagas ?? 1); i++) {
    const colab = await criarColaborador({ city: "São Paulo - SP" });
    const v = await criarVaga({ userId: user.id, eventId: evento.id, functionId: funcao.id, collaboratorId: colab.id, status: "escalado", phase: "escalacao", city: "São Paulo - SP", scheduleStartDate: D("03-11"), scheduleEndDate: D("03-14") });
    await ctx.db.update(ctx.schema.teamInclusions).set({
      needsTicket: true, flightDepartureDate: D("03-10"), flightArrivalSuggestedTime: "até 14h", flightReturnDate: D("03-15"), flightReturnSuggestedTime: "18h+",
    }).where(eq(ctx.schema.teamInclusions.id, v.id));
    vagas.push(v);
  }
  return { evento, vagas, funcao };
}

const buscar = (agent: TestAgent, corpo: Record<string, unknown>) => mutacao(agent.post("/api/busca-de-passagens")).send(corpo);

describe("busca: \"Ver sem o horário sugerido\", alternativas e mala", () => {
  it("sem horário: 1 consulta SEM filtro (outra chave); a volta 17:45 vem marcada", async () => {
    const { vagas } = await cenario();
    const { agent } = await agenteLogado("purchasing");
    const r = (await buscar(agent, { vagas: [{ id: vagas[0].id, ajuste: { semHorario: true } }], consultarVagas: [vagas[0].id] })).body as RespostaDaBusca;
    expect(r.gastou).toBe(1);
    expect(chamadas[0]).toMatchObject({ horarioIda: null, horarioVolta: null });
    expect(r.rotas[0]).toMatchObject({ semHorario: true, faixaVolta: { desde: 18 * 60, ate: null } });
  });

  it("aeroportos alternativos: só no pedido, uma consulta por alternativa, e a troca depois vem do cache", async () => {
    const { vagas } = await cenario();
    const { agent } = await agenteLogado("purchasing");
    const previa = (await buscar(agent, { vagas: [{ id: vagas[0].id }] })).body as RespostaDaBusca;
    expect(previa.rotas[0].consultasDasAlternativas).toBe(3); // CGH, VCP (casa) e SDU (evento)
    expect(previa.rotas[0].alternativas).toBeNull();
    const chave = previa.rotas[0].chave;
    const teste = (await buscar(agent, { vagas: [{ id: vagas[0].id }], alternativas: [chave] })).body as RespostaDaBusca;
    expect(teste.gastou).toBe(3);
    expect(teste.rotas[0].alternativas?.map((a) => [a.rotulo, !!a.resultado])).toEqual([["Sair de CGH", true], ["Sair de VCP", true], ["Evento por SDU", true]]);
    const trocado = (await buscar(agent, { vagas: [{ id: vagas[0].id, ajuste: { aeroportoDoEvento: "SDU" } }], consultarVagas: [vagas[0].id] })).body as RespostaDaBusca;
    expect(trocado.gastou).toBe(0);
    expect(trocado.rotas[0]).toMatchObject({ destino: "SDU" });
    expect(trocado.rotas[0].resultado?.doCache).toBe(true);
  });

  it("quem despacha mala (cenotécnica por padrão; lista do admin manda) recebe o valor da mala na rota", async () => {
    const { vagas } = await cenario({ funcao: "Cenotécnica" });
    const { agent } = await agenteLogado("purchasing");
    const r = (await buscar(agent, { vagas: [{ id: vagas[0].id }] })).body as RespostaDaBusca;
    expect(r.rotas[0].malaCentavos).toBe(15000);
    const admin = (await agenteLogado("admin")).agent;
    expect((await mutacao(admin.put("/api/busca-de-passagens/ajustes")).send({ funcoesComMala: [], valorDaMalaCentavos: 18000 })).status).toBe(200);
    expect(((await buscar(agent, { vagas: [{ id: vagas[0].id }] })).body as RespostaDaBusca).rotas[0].malaCentavos).toBeNull();
    await mutacao(admin.put("/api/busca-de-passagens/ajustes")).send({ funcoesComMala: null });
  });
});

describe("abas de análise — só admin", () => {
  it("Compras recebe 403; admin recebe cada aba", async () => {
    await cenario();
    const compras = (await agenteLogado("purchasing")).agent;
    const admin = (await agenteLogado("admin")).agent;
    for (const aba of ["melhor-momento", "preco-por-rota", "pago-x-encontrado", "previsao", "orcamento"]) {
      expect((await compras.get(`/api/busca-de-passagens/analises/${aba}`)).status, aba).toBe(403);
      const r = await admin.get(`/api/busca-de-passagens/analises/${aba}?periodo=365`);
      expect(r.status, aba).toBe(200);
    }
    const prev = await admin.get("/api/busca-de-passagens/analises/previsao");
    expect(prev.body.resumo.total).toBeGreaterThan(0);
    expect(prev.body.linhas[0]).toHaveProperty("titulo");
    expect((await compras.get("/api/busca-de-passagens/ajustes")).status).toBe(403);
  });
});

describe("acompanhar preço", () => {
  it("marcar não gasta; checar gasta dentro do teto; queda de 10% vira aviso no sino; Compras vê", async () => {
    const { vagas } = await cenario();
    const { agent } = await agenteLogado("purchasing");
    const criar = await mutacao(agent.post("/api/busca-de-passagens/acompanhamentos")).send({ teamInclusionId: vagas[0].id });
    expect(criar.status).toBe(200);
    expect(chamadas).toHaveLength(0);
    // Mesma vaga de novo: devolve o que já existe.
    expect((await mutacao(agent.post("/api/busca-de-passagens/acompanhamentos")).send({ teamInclusionId: vagas[0].id })).body.jaExistia).toBe(true);

    const admin = (await agenteLogado("admin")).agent;
    const c1 = await mutacao(admin.post("/api/busca-de-passagens/acompanhamentos/checar")).send({});
    expect(c1.body).toMatchObject({ checadas: 1, consultas: 1, avisos: 0 });
    // O preço caiu 20%: o cache expira (simulado aqui) e a próxima checagem avisa.
    await ctx.db.delete(ctx.schema.buscaPassagensCache);
    precoDoFalso = 36000;
    const c2 = await mutacao(admin.post("/api/busca-de-passagens/acompanhamentos/checar")).send({});
    expect(c2.body).toMatchObject({ checadas: 1, consultas: 1, avisos: 1 });
    expect((await agent.get("/api/shell/precos-acompanhados")).body.count).toBe(1);
    const lista = (await agent.get("/api/busca-de-passagens/acompanhamentos")).body;
    expect(lista.itens[0]).toMatchObject({ aviso: "caiu", avisoNovo: true, ultimoPreco: 36000, precoInicial: 45000 });
    expect(lista.itens[0].avisoTexto).toMatch(/^Caiu 20%/);
    await mutacao(agent.post("/api/busca-de-passagens/acompanhamentos/vistos")).send({});
    expect((await agent.get("/api/shell/precos-acompanhados")).body.count).toBe(0);
    // Produção não acompanha.
    const producao = (await agenteLogado("production")).agent;
    expect((await producao.get("/api/shell/precos-acompanhados")).status).toBe(403);
  });

  it("no teto do mês a checagem pula (e diz); limite de acompanhadas; para sozinho com a passagem registrada", async () => {
    const { vagas } = await cenario({ vagas: 2 });
    await ctx.db.update(ctx.schema.teamInclusions).set({ flightDepartureDate: D("03-09") }).where(eq(ctx.schema.teamInclusions.id, vagas[1].id));
    const { agent } = await agenteLogado("purchasing");
    const admin = (await agenteLogado("admin")).agent;
    await mutacao(admin.put("/api/busca-de-passagens/ajustes")).send({ limiteDeAcompanhamentos: 1 });
    expect((await mutacao(agent.post("/api/busca-de-passagens/acompanhamentos")).send({ teamInclusionId: vagas[0].id })).status).toBe(200);
    const cheio = await mutacao(agent.post("/api/busca-de-passagens/acompanhamentos")).send({ teamInclusionId: vagas[1].id });
    expect(cheio.status).toBe(409);
    expect(cheio.body.message).toMatch(/limite/);
    await mutacao(admin.put("/api/busca-de-passagens/ajustes")).send({ limiteDeAcompanhamentos: 20 });

    await ctx.db.insert(ctx.schema.systemSettings).values({ key: "busca_passagens_teto_mensal", value: "0" });
    const pulou = await mutacao(admin.post("/api/busca-de-passagens/acompanhamentos/checar")).send({});
    expect(pulou.body).toMatchObject({ puladas: 1, consultas: 0 });
    expect(chamadas).toHaveLength(0);

    await mutacao(agent.post("/api/tickets")).send({ teamInclusionId: vagas[0].id, transportType: "aereo", purchaseOrderNumber: "LOC1" });
    const lista = (await agent.get("/api/busca-de-passagens/acompanhamentos")).body;
    expect(lista.itens[0]).toMatchObject({ ativo: false, motivoParada: "Passagem registrada" });
  });
});

describe("agendador — uma vez por dia, lock no banco", () => {
  it("só uma instância pega o dia; antes da hora não roda", async () => {
    expect(await agendador.pegarODia("2030-01-01", "a")).toBe(true);
    expect(await agendador.pegarODia("2030-01-01", "b")).toBe(false);
    const madrugada = new Date("2030-01-02T05:00:00-03:00");
    expect(await agendador.talvezRodar(madrugada)).toBe("fora_da_hora");
    const manha = new Date("2030-01-02T09:00:00-03:00");
    expect(await agendador.talvezRodar(manha)).toBe("rodou");
    expect(await agendador.talvezRodar(manha)).toBe("ja_rodou");
    expect(agendador.horaEmSaoPaulo(new Date("2030-01-02T12:30:00Z"))).toBe(9);
  });
});

describe("teto por trecho — acima do típico só com justificativa", () => {
  it("422 com a explicação; com justificativa grava na passagem e na auditoria", async () => {
    const { vagas } = await cenario();
    for (const preco of [100000, 98000, 104000]) {
      await ctx.db.insert(ctx.schema.buscaPassagensConsultas).values({
        fornecedor: "falso", chave: `x-${preco}`, perna: "ida_e_volta", origem: "CWB", destino: "FLN", dataIda: D("02-01"), maxParadas: 1, menorPrecoCentavos: preco,
      });
    }
    const { agent } = await agenteLogado("purchasing");
    const passagem = {
      teamInclusionId: vagas[0].id, transportType: "aereo", value: 150000, purchaseOrderNumber: "TETO1",
      departureAirport: "CWB", destinationAirport: "FLN", returnOriginAirport: "FLN", returnDestinationAirport: "CWB",
      actualDepartureDate: D("03-10"), actualDepartureTime: "08:00", actualArrivalTime: "09:05", actualReturnDate: D("03-15"), actualReturnTime: "19:00",
    };
    const r = await mutacao(agent.post("/api/tickets")).send(passagem);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("preco_acima_do_teto");
    expect(r.body.teto).toMatchObject({ tipico: 100000, limite: 130000, pctAcimaDoTipico: 50, rota: "CWB ⇄ FLN" });
    expect(r.body.message).toMatch(/50% acima do preço típico de CWB ⇄ FLN/);
    expect((await mutacao(agent.post("/api/tickets")).send({ ...passagem, justificativaPreco: "ok" })).status).toBe(422);
    const ok = await mutacao(agent.post("/api/tickets")).send({ ...passagem, justificativaPreco: "Único voo que chega antes da montagem" });
    expect(ok.status).toBe(200);
    expect(ok.body.justificativaPreco).toBe("Único voo que chega antes da montagem");
    const [log] = await ctx.db.select().from(ctx.schema.systemLogs).where(eq(ctx.schema.systemLogs.entityId, ok.body.id));
    expect(JSON.stringify(log.newData)).toContain("Único voo que chega antes da montagem");
    // Editar só o LOC não pede de novo; subir o valor pede justificativa nova.
    expect((await mutacao(agent.patch(`/api/tickets/${ok.body.id}`)).send({ purchaseOrderNumber: "TETO2" })).status).toBe(200);
    expect((await mutacao(agent.patch(`/api/tickets/${ok.body.id}`)).send({ value: 160000 })).status).toBe(422);
    // Abaixo do teto passa sem pergunta.
    expect((await mutacao(agent.patch(`/api/tickets/${ok.body.id}`)).send({ value: 120000 })).status).toBe(200);
  });
});

describe("ajustes do admin", () => {
  it("valida e audita", async () => {
    const admin = (await agenteLogado("admin")).agent;
    expect((await mutacao(admin.put("/api/busca-de-passagens/ajustes")).send({ tetoPorTrechoPct: 1 })).status).toBe(400);
    const r = await mutacao(admin.put("/api/busca-de-passagens/ajustes")).send({ tetoPorTrechoPct: 40, horaDoAcompanhamento: 6 });
    expect(r.body.ajustes).toMatchObject({ tetoPorTrechoPct: 40, horaDoAcompanhamento: 6 });
    const logs = await ctx.db.select().from(ctx.schema.systemLogs).where(eq(ctx.schema.systemLogs.entityId, "busca_passagens_ajustes"));
    expect(logs.length).toBeGreaterThan(0);
    await mutacao(admin.put("/api/busca-de-passagens/ajustes")).send({ tetoPorTrechoPct: 30, horaDoAcompanhamento: 7 });
  });
});
