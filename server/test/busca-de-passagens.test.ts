/**
 * Busca de passagens na internet (09/10) — rotas.
 *
 * Regras do dono garantidas no servidor: só admin e Compras; nada consulta
 * sem pedido explícito (a prévia é grátis); vagas iguais = uma consulta;
 * cache compartilhado não conta consumo; no teto a busca para; vaga com dado
 * faltando não consulta. Fornecedor FALSO que conta as chamadas.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, criarVaga, mutacao, type Contexto, type TestAgent } from "./harness";
import type { ConsultaDePassagens, ResultadoDaConsulta, RespostaDaBusca } from "@shared/busca-de-passagens";
import type { FornecedorDePassagens } from "../busca-de-passagens/fornecedor";

let ctx: Contexto;
let servico: typeof import("../busca-de-passagens/servico");
const chamadas: ConsultaDePassagens[] = [];
let links = 0;

const RESULTADO: ResultadoDaConsulta = {
  observadoEm: "2027-01-01T12:00:00Z",
  itinerarios: [
    { id: "it-barato", precoCentavos: 45000, moeda: "BRL", pernas: [{ companhia: "G3", duracaoMin: 200, segmentos: [{ companhia: "G3", numero: "1500", origem: "GRU", destino: "JPA", partida: "2027-03-10T08:00", chegada: "2027-03-10T11:20" }] }] },
    { id: "it-caro", precoCentavos: 81000, moeda: "BRL", pernas: [{ companhia: "LA", duracaoMin: 200, segmentos: [{ companhia: "LA", numero: "3001", origem: "GRU", destino: "JPA", partida: "2027-03-10T09:00", chegada: "2027-03-10T12:20" }] }] },
  ],
};

const falso: FornecedorDePassagens = {
  nome: "falso",
  simulado: true,
  async buscar(c) {
    chamadas.push(c);
    if (c.perna === "ida_e_volta") {
      return { ...RESULTADO, itinerarios: RESULTADO.itinerarios.map((i) => ({ ...i, id: `${i.id}-rt`, pernas: [i.pernas[0], i.pernas[0]] })) };
    }
    return RESULTADO;
  },
  async linksDeCompra() {
    links++;
    return [{ nome: "GOL", url: "https://www.voegol.com.br", tipo: "airline", vooExato: true, precoCentavos: 45000 }];
  },
};

beforeAll(async () => {
  ctx = await criarApp();
  servico = await import("../busca-de-passagens/servico");
  servico.definirFornecedorParaTestes(falso);
});

beforeEach(async () => {
  chamadas.length = 0;
  links = 0;
  // Teto alto por padrão; cada teste começa com o cache vazio.
  await ctx.db.delete(ctx.schema.buscaPassagensCache);
  await ctx.db.delete(ctx.schema.buscaPassagensConsumo);
  await ctx.db.delete(ctx.schema.systemSettings).where(eq(ctx.schema.systemSettings.key, "busca_passagens_teto_mensal"));
});

/** Datas no futuro (o plano recusa data que já passou). */
const D = (md: string) => `2027-${md}`;

async function cenario(opts: { aeroporto?: string | null; vagas?: number; cidade?: string } = {}) {
  const { user } = await agenteLogado("admin");
  const evento = await criarEvento({ name: "Makai João Pessoa", location: "Praia de Tambaú, João Pessoa - PB", startDate: D("03-11"), endDate: D("03-14") });
  if (opts.aeroporto !== null) await ctx.db.update(ctx.schema.events).set({ aeroportoIata: opts.aeroporto ?? "JPA" }).where(eq(ctx.schema.events.id, evento.id));
  const funcao = await criarFuncao();
  const vagas = [];
  for (let i = 0; i < (opts.vagas ?? 1); i++) {
    const colab = await criarColaborador({ city: "São Paulo - SP" });
    const v = await criarVaga({ userId: user.id, eventId: evento.id, functionId: funcao.id, collaboratorId: colab.id, status: "escalado", phase: "escalacao", city: opts.cidade ?? "São Paulo - SP", scheduleStartDate: D("03-11"), scheduleEndDate: D("03-14") });
    await ctx.db.update(ctx.schema.teamInclusions).set({
      flightDepartureDate: D("03-10"), flightArrivalSuggestedTime: "até 14h", flightReturnDate: D("03-15"), flightReturnSuggestedTime: "18h+",
    }).where(eq(ctx.schema.teamInclusions.id, v.id));
    vagas.push(v);
  }
  return { evento, vagas };
}

const buscar = (agent: TestAgent, corpo: Record<string, unknown>) => mutacao(agent.post("/api/busca-de-passagens")).send(corpo);

describe("POST /api/busca-de-passagens", () => {
  it("só admin e Compras", async () => {
    const { vagas } = await cenario();
    for (const papel of ["production", "function_area", "financial"] as const) {
      const { agent } = await agenteLogado(papel);
      const r = await buscar(agent, { vagas: [{ id: vagas[0].id }] });
      expect(r.status, papel).toBe(403);
    }
    const { agent } = await agenteLogado("purchasing");
    expect((await buscar(agent, { vagas: [{ id: vagas[0].id }] })).status).toBe(200);
    expect(chamadas).toHaveLength(0);
  });

  it("prévia é grátis; 3 vagas iguais = 1 consulta; cache compartilhado não conta consumo", async () => {
    const { vagas } = await cenario({ vagas: 3 });
    const { agent } = await agenteLogado("purchasing");
    const pedido = { vagas: vagas.map((v) => ({ id: v.id })) };

    const previa = (await buscar(agent, pedido)).body as RespostaDaBusca;
    expect(previa.rotas).toHaveLength(1);
    expect(previa.rotas[0]).toMatchObject({ perna: "ida_e_volta", origem: "GRU", destino: "JPA", resultado: null });
    expect(previa.rotas[0].vagas).toHaveLength(3);
    expect(previa.gastou).toBe(0);
    expect(chamadas).toHaveLength(0);

    const chave = previa.rotas[0].chave;
    const busca = (await buscar(agent, { ...pedido, consultar: [chave] })).body as RespostaDaBusca;
    expect(busca.gastou).toBe(1);
    expect(chamadas).toHaveLength(1);
    // Nada pessoal vai ao fornecedor: só aeroportos, datas e filtros.
    expect(Object.keys(chamadas[0]).sort()).toEqual(["dataIda", "dataVolta", "destino", "horarioIda", "horarioVolta", "maxParadas", "origem", "perna"]);
    expect(chamadas[0].horarioIda).toEqual({ chegadaAte: 14 });
    expect(busca.rotas[0].resultado?.doCache).toBe(false);
    expect(busca.consumo.usadas).toBe(1);

    // Outra pessoa, mesma rota: vem do cache, não chama o fornecedor, não conta.
    const outra = (await agenteLogado("admin")).agent;
    const deNovo = (await buscar(outra, { ...pedido, consultar: [chave] })).body as RespostaDaBusca;
    expect(deNovo.gastou).toBe(0);
    expect(deNovo.rotas[0].resultado?.doCache).toBe(true);
    expect(chamadas).toHaveLength(1);
    expect(deNovo.consumo.usadas).toBe(1);
    // …mas fica registrado como acerto do cache (aba Consumo), uma vez só.
    await buscar(outra, pedido);
    const acertos = await ctx.db.select().from(ctx.schema.buscaPassagensConsumo).where(eq(ctx.schema.buscaPassagensConsumo.doCache, true));
    expect(acertos).toHaveLength(1);

    // "Atualizar" força nova consulta (e conta).
    const atualizada = (await buscar(agent, { ...pedido, atualizar: [chave] })).body as RespostaDaBusca;
    expect(atualizada.gastou).toBe(1);
    expect(chamadas).toHaveLength(2);
    expect(atualizada.consumo.usadas).toBe(2);
  });

  it("guarda o histórico de cada consulta real (rota, data do voo, menor por companhia, top opções)", async () => {
    const { vagas } = await cenario();
    const { agent, user } = await agenteLogado("purchasing");
    const previa = (await buscar(agent, { vagas: [{ id: vagas[0].id }] })).body as RespostaDaBusca;
    await buscar(agent, { vagas: [{ id: vagas[0].id }], consultar: [previa.rotas[0].chave] });
    const [h] = await ctx.db.select().from(ctx.schema.buscaPassagensConsultas).where(eq(ctx.schema.buscaPassagensConsultas.usuarioId, user.id));
    expect(h).toMatchObject({ usuarioId: user.id, perna: "ida_e_volta", origem: "GRU", destino: "JPA", dataIda: D("03-10"), dataVolta: D("03-15"), qtdOpcoes: 2, menorPrecoCentavos: 45000 });
    expect(h.menorPorCia).toEqual({ G3: 45000, LA: 81000 });
    expect(h.vagaIds).toEqual([vagas[0].id]);
    const opcoes = await ctx.db.select().from(ctx.schema.buscaPassagensOpcoes).where(eq(ctx.schema.buscaPassagensOpcoes.consultaId, h.id));
    expect(opcoes.map((o) => [o.posicao, o.companhia, o.precoCentavos])).toEqual(expect.arrayContaining([[1, "G3", 45000], [2, "LA", 81000]]));
  });

  it("teto atingido: a busca para com aviso claro e não chama o fornecedor", async () => {
    const { vagas } = await cenario();
    const { agent } = await agenteLogado("purchasing");
    await ctx.db.insert(ctx.schema.systemSettings).values({ key: "busca_passagens_teto_mensal", value: "1" });
    await ctx.db.insert(ctx.schema.buscaPassagensConsumo).values({ tipo: "ida", chave: "x", fornecedor: "falso", usuarioId: null });
    const previa = (await buscar(agent, { vagas: [{ id: vagas[0].id }] })).body as RespostaDaBusca;
    expect(previa.consumo).toMatchObject({ usadas: 1, teto: 1 });
    const r = await buscar(agent, { vagas: [{ id: vagas[0].id }], consultar: [previa.rotas[0].chave] });
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: "teto_atingido", usadas: 1, teto: 1, precisa: 1 });
    expect(r.body.message).toMatch(/teto de 1 consultas deste mês foi atingido/);
    expect(chamadas).toHaveLength(0);
    // Link de compra também respeita o teto.
    const l = await mutacao(agent.post("/api/busca-de-passagens/link")).send({ itinerarioId: "it-barato" });
    expect(l.status).toBe(429);
    expect(links).toBe(0);
  });

  it("dado faltando não consulta; confirmar o aeroporto do evento libera a rota", async () => {
    const { evento, vagas } = await cenario({ aeroporto: null });
    const { agent } = await agenteLogado("purchasing");
    const previa = (await buscar(agent, { vagas: [{ id: vagas[0].id }], consultarVagas: [vagas[0].id] })).body as RespostaDaBusca;
    expect(previa.rotas).toEqual([]);
    expect(previa.faltando[0]).toMatchObject({ tipo: "evento_sem_aeroporto", eventId: evento.id, sugestoes: ["JPA"] });
    expect(chamadas).toHaveLength(0);

    const conf = await mutacao(agent.put(`/api/busca-de-passagens/eventos/${evento.id}/aeroporto`)).send({ iata: "jpa" });
    expect(conf.status).toBe(200);
    expect(conf.body.aeroportoIata).toBe("JPA");
    const depois = (await buscar(agent, { vagas: [{ id: vagas[0].id }] })).body as RespostaDaBusca;
    expect(depois.rotas).toHaveLength(1);
    expect((await mutacao(agent.put(`/api/busca-de-passagens/eventos/${evento.id}/aeroporto`)).send({ iata: "JP" })).status).toBe(400);
  });

  it("\"Tentar com 2 conexões\" (consultarVagas) consulta só a rota daquela vaga", async () => {
    const { vagas } = await cenario({ vagas: 2 });
    await ctx.db.update(ctx.schema.teamInclusions).set({ flightDepartureDate: D("03-09") }).where(eq(ctx.schema.teamInclusions.id, vagas[1].id));
    const { agent } = await agenteLogado("purchasing");
    const r = (await buscar(agent, { vagas: [{ id: vagas[0].id, ajuste: { maxParadas: 2 } }, { id: vagas[1].id }], consultarVagas: [vagas[0].id] })).body as RespostaDaBusca;
    expect(r.rotas).toHaveLength(2);
    expect(r.gastou).toBe(1);
    expect(chamadas[0].maxParadas).toBe(2);
  });
});

describe("link, uso e consumo", () => {
  it("link de compra só no clique, em cache; uso liga o preço encontrado à passagem", async () => {
    const { vagas } = await cenario();
    const { agent } = await agenteLogado("purchasing");
    const a = await mutacao(agent.post("/api/busca-de-passagens/link")).send({ itinerarioId: "it-barato" });
    expect(a.status).toBe(200);
    expect(a.body.links[0].url).toBe("https://www.voegol.com.br");
    const b = await mutacao(agent.post("/api/busca-de-passagens/link")).send({ itinerarioId: "it-barato" });
    expect(b.body.doCache).toBe(true);
    expect(links).toBe(1);

    const reg = await mutacao(agent.post("/api/tickets")).send({
      teamInclusionId: vagas[0].id, transportType: "aereo", value: 46000, purchaseOrderNumber: "ABC123",
      actualDepartureDate: D("03-10"), actualDepartureTime: "08:00", actualArrivalTime: "11:20",
    });
    expect(reg.status).toBe(200);
    const uso = await mutacao(agent.post("/api/busca-de-passagens/uso")).send({
      teamInclusionId: vagas[0].id, chave: "ida|GRU>JPA|x", perna: "ida", itinerarioId: "it-barato", companhia: "GOL", voos: "G3 1500", precoCentavos: 45000, precoVistoEm: "2027-01-01T10:00:00Z",
    });
    expect(uso.status).toBe(200);
    expect(uso.body.ticketId).toBeTruthy();
    const [linha] = await ctx.db.select().from(ctx.schema.buscaPassagensUsos).where(eq(ctx.schema.buscaPassagensUsos.teamInclusionId, vagas[0].id));
    expect(linha).toMatchObject({ precoEncontradoCentavos: 45000, ticketId: uso.body.ticketId, companhia: "GOL" });
  });

  it("consumo: Compras lê o contador; o detalhe (aba Consumo) e o teto são só do admin", async () => {
    const compras = (await agenteLogado("purchasing")).agent;
    const c = await compras.get("/api/busca-de-passagens/consumo");
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({ usadas: 0, teto: 1000, cacheHoras: 3 });
    expect((await compras.get("/api/busca-de-passagens/consumo/detalhe")).status).toBe(403);
    expect((await mutacao(compras.put("/api/busca-de-passagens/teto")).send({ teto: 5 })).status).toBe(403);
    const admin = (await agenteLogado("admin")).agent;
    const t = await mutacao(admin.put("/api/busca-de-passagens/teto")).send({ teto: 1500 });
    expect(t.body.teto).toBe(1500);
    const d = await admin.get("/api/busca-de-passagens/consumo/detalhe");
    expect(d.status).toBe(200);
    expect(d.body.mesAtual).toMatchObject({ reais: 0, teto: 1500, situacao: "ok" });
    expect(d.body.porMes).toHaveLength(6);
  });
});
