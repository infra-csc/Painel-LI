/**
 * Painéis (30/10) — GET /api/paineis/atividade: o feed das últimas inclusões e
 * mudanças. Cobre papéis (os mesmos das telas: admin, Compras, Produção), o
 * vocabulário do histórico da vaga ("Colaborador incluído", "Passagem
 * registrada"), o lote (vagas criadas juntas viram uma linha), os filtros do
 * servidor (tipo, evento, com passagem), a paginação por cursor, o pedido de
 * inclusão sem vaga e o que NÃO sai (texto das observações).
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  criarEvento,
  criarFuncao,
  criarVaga,
  mutacao,
  type Contexto,
} from "./harness";
import {
  agruparEmLote, aposOCursor, inicioDoPeriodo, lerFiltros, tipoDaEntrada,
  type ItemDaAtividade, type RespostaDaAtividade, type VagaDaAtividade,
} from "../routes/paineis";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

const itensDe = (body: RespostaDaAtividade) => body.itens;
const titulos = (body: RespostaDaAtividade) => body.itens.map((i) => i.titulo);

describe("GET /api/paineis/atividade — papéis", () => {
  it("sem sessão → 401", async () => {
    expect((await request(ctx.app).get("/api/paineis/atividade")).status).toBe(401);
  });

  it("Logística, Área de Função e Financeiro → 403 (os Painéis são só de admin e Compras, 30/10)", async () => {
    for (const papel of ["production", "function_area", "financial"] as const) {
      const { agent } = await agenteLogado(papel);
      expect((await agent.get("/api/paineis/atividade")).status).toBe(403);
    }
  });

  it("admin e Compras → 200 com o contrato do feed", async () => {
    for (const papel of ["admin", "purchasing"] as const) {
      const { agent } = await agenteLogado(papel);
      const res = await agent.get("/api/paineis/atividade?periodo=hoje");
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toContain("no-store");
      expect(Array.isArray(res.body.itens)).toBe(true);
      expect(Object.keys(res.body.resumo).sort()).toEqual(["hotel", "inclusao", "mudanca", "passagem", "pedido"]);
    }
  });
});

describe("GET /api/paineis/atividade — o que entra no feed", () => {
  it("colaborador incluído, passagem registrada e vaga criada, no vocabulário do histórico da vaga", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento({ name: `Maratona do Feed ${Date.now()}` });
    const vaga = await criarVaga({ userId: user.id, eventId: evento.id, needsTicket: true });
    const colab = await criarColaborador({ fullName: "Joana Feed Ribeiro" });
    // Incluir o nome e confirmar (passagem só se registra em vaga escalada).
    await ctx.storage.updateTeamInclusion(vaga.id, { collaboratorId: colab.id, status: "escalado", phase: "escalacao", updatedBy: user.id } as never);
    const passagem = await mutacao(agent.post("/api/tickets")).send({
      teamInclusionId: vaga.id, transportType: "aereo", value: 85000, purchaseOrderNumber: "FEED1",
      actualDepartureDate: "2027-10-10", actualDepartureTime: "08:00",
    });
    expect(passagem.status, JSON.stringify(passagem.body)).toBe(200);

    const res = await agent.get(`/api/paineis/atividade?periodo=hoje&eventId=${evento.id}`);
    expect(res.status).toBe(200);
    const body = res.body as RespostaDaAtividade;
    expect(titulos(body)).toEqual(expect.arrayContaining(["Colaborador incluído: Joana Feed Ribeiro", "Passagem registrada", "Vaga criada"]));
    const incluido = itensDe(body).find((i) => i.titulo.startsWith("Colaborador incluído"))!;
    expect(incluido.tipo).toBe("inclusao");
    expect(incluido.destaque).toBe(true);
    expect(incluido.eventName).toBe(evento.name);
    expect(incluido.vagas[0]).toMatchObject({ id: vaga.id, numero: vaga.inclusionNumber, colaborador: "Joana Feed Ribeiro", precisaPassagem: true, fase: "escalacao" });
    expect(itensDe(body).find((i) => i.titulo === "Passagem registrada")!.tipo).toBe("passagem");
    // O status derivado da passagem é eco do registro — não vira notícia.
    expect(titulos(body).some((t) => t.startsWith("Status: Passagem"))).toBe(false);
    // Mais recente primeiro.
    const ats = itensDe(body).map((i) => i.at);
    expect([...ats].sort().reverse()).toEqual(ats);
  });

  it("vagas criadas no mesmo instante, no mesmo evento, viram UMA linha (lote)", async () => {
    const { agent, user } = await agenteLogado("purchasing");
    const evento = await criarEvento();
    const f1 = await criarFuncao({ name: "Staff de largada" });
    const f2 = await criarFuncao({ name: "Hidratação" });
    const base = { eventId: evento.id, userId: user.id, status: "planejado", phase: "inclusao", scheduleStartDate: "2099-10-10", scheduleEndDate: "2099-10-12", dailyRates: 3, needsTicket: false, needsAccommodation: true };
    await ctx.storage.createTeamInclusionsBatch([
      { ...base, functionId: f1.id }, { ...base, functionId: f1.id }, { ...base, functionId: f2.id },
    ] as never);

    const body = (await agent.get(`/api/paineis/atividade?periodo=hoje&eventId=${evento.id}`)).body as RespostaDaAtividade;
    expect(body.itens).toHaveLength(1);
    expect(body.itens[0]).toMatchObject({ titulo: "3 vagas criadas", quantidade: 3, tipo: "inclusao", precisaHotel: true });
    expect(body.itens[0].vagas).toHaveLength(3);
    expect(body.itens[0].detalhe).toContain("Staff de largada");
    expect(body.itens[0].detalhe).toContain("Hidratação");
  });

  it("filtros do servidor: tipo, com passagem e evento; o resumo conta por tipo", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const comPassagem = await criarVaga({ userId: user.id, eventId: evento.id, needsTicket: true });
    await criarVaga({ userId: user.id, eventId: evento.id, needsTicket: false });
    const colab = await criarColaborador();
    await ctx.storage.updateTeamInclusion(comPassagem.id, { collaboratorId: colab.id, updatedBy: user.id } as never);

    const tudo = (await agent.get(`/api/paineis/atividade?periodo=hoje&eventId=${evento.id}`)).body as RespostaDaAtividade;
    expect(tudo.resumo.inclusao).toBe(tudo.itens.filter((i) => i.tipo === "inclusao").length);

    const soInclusao = (await agent.get(`/api/paineis/atividade?periodo=hoje&eventId=${evento.id}&tipo=inclusao`)).body as RespostaDaAtividade;
    expect(soInclusao.itens.every((i) => i.tipo === "inclusao")).toBe(true);
    // O resumo não depende do filtro de tipo (é o que os chips mostram).
    expect(soInclusao.resumo).toEqual(tudo.resumo);

    const soComPassagem = (await agent.get(`/api/paineis/atividade?periodo=hoje&eventId=${evento.id}&passagem=1`)).body as RespostaDaAtividade;
    expect(soComPassagem.itens.length).toBeGreaterThan(0);
    expect(soComPassagem.itens.every((i) => i.precisaPassagem)).toBe(true);

    const outroEvento = await criarEvento();
    const vazio = (await agent.get(`/api/paineis/atividade?periodo=hoje&eventId=${outroEvento.id}`)).body as RespostaDaAtividade;
    expect(vazio.itens).toEqual([]);
    expect(vazio.total).toBe(0);
  });

  it("paginação por cursor: a segunda página continua da primeira, sem repetir", async () => {
    const { agent, user } = await agenteLogado("purchasing");
    const evento = await criarEvento();
    for (const n of [1, 2, 3]) {
      const v = await criarVaga({ userId: user.id, eventId: evento.id });
      await ctx.storage.updateTeamInclusion(v.id, { observations: `obs ${n}`, updatedBy: user.id } as never);
    }
    const p1 = (await agent.get(`/api/paineis/atividade?periodo=hoje&eventId=${evento.id}&limite=1`)).body as RespostaDaAtividade;
    // As 3 criações e as 3 observações viram 2 lotes: uma linha por página.
    expect(p1.itens).toHaveLength(1);
    expect(p1.proximo).toBeTruthy();
    const p2 = (await agent.get(`/api/paineis/atividade?periodo=hoje&eventId=${evento.id}&limite=1&cursor=${encodeURIComponent(p1.proximo!)}`)).body as RespostaDaAtividade;
    const ids1 = new Set(p1.itens.map((i) => i.id));
    expect(p2.itens.length).toBeGreaterThan(0);
    expect(p2.itens.some((i) => ids1.has(i.id))).toBe(false);
    expect(p1.total).toBe(p2.total);
  });

  it("observação alterada aparece SEM o texto (pode ter dado pessoal)", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const v = await criarVaga({ userId: user.id, eventId: evento.id });
    await ctx.storage.updateTeamInclusion(v.id, { observations: "telefone 11 99999-0000", updatedBy: user.id } as never);
    const body = (await agent.get(`/api/paineis/atividade?periodo=hoje&eventId=${evento.id}&tipo=mudanca`)).body as RespostaDaAtividade;
    const obs = body.itens.find((i) => i.titulo === "Observações alteradas");
    expect(obs).toBeTruthy();
    expect(obs!.detalhe).toBeNull();
    expect(JSON.stringify(body)).not.toContain("99999-0000");
  });

  it("pedido de inclusão sem vaga entra pelo próprio pedido, com o id para a Aprovação", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const funcao = await criarFuncao({ name: "Locutor" });
    const [pedido] = await ctx.db.insert(ctx.schema.scalingChangeRequests).values({
      teamInclusionId: null, eventId: evento.id, functionId: funcao.id, requestType: "inclusao",
      requestedBy: user.id, requestedByName: "Paula Produção", reason: "Faltou um locutor na largada", status: "pendente",
    } as never).returning();
    const body = (await agent.get(`/api/paineis/atividade?periodo=hoje&eventId=${evento.id}&tipo=pedido`)).body as RespostaDaAtividade;
    expect(body.itens).toHaveLength(1);
    expect(body.itens[0]).toMatchObject({
      titulo: "Pedido de inclusão aberto", tipo: "pedido", pedidoId: (pedido as { id: string }).id,
      autor: "Paula Produção", comentario: "Faltou um locutor na largada", funcoes: ["Locutor"],
    });
  });
});

// ── Funções puras ───────────────────────────────────────────────────────────

const vagaFeed = (id: string, extra: Partial<VagaDaAtividade> = {}): VagaDaAtividade => ({
  id, numero: 1, funcao: "Staff", colaborador: null, fase: "escalacao", status: "planejado", excluida: false,
  precisaPassagem: false, precisaHotel: false, pedidoPendenteId: null, trocaPendente: false, ...extra,
});
const item = (id: string, at: string, extra: Partial<ItemDaAtividade> = {}): ItemDaAtividade => ({
  id, at, tipo: "inclusao", titulo: "Vaga criada", detalhe: null, linhas: [], comentario: null, autor: "Ana",
  destaque: false, eventId: "e1", eventName: "Evento", vagas: [vagaFeed(id)], quantidade: 1, funcoes: ["Staff"],
  precisaPassagem: false, precisaHotel: false, pedidoId: null, eventStartDate: null, ...extra,
});

describe("Atividade — regras puras", () => {
  it("lote só junta mesmo evento, tipo, título, autor e até 10 s", () => {
    const t = "2026-10-30T12:00:00.000Z";
    const out = agruparEmLote([
      item("a", t), item("b", t), item("c", "2026-10-30T11:59:55.000Z"),
      item("d", "2026-10-30T11:59:55.000Z", { eventId: "e2" }),
      item("e", "2026-10-30T11:00:00.000Z"),
    ]);
    expect(out.map((i) => i.titulo)).toEqual(["3 vagas criadas", "Vaga criada", "Vaga criada"]);
    expect(out[0].quantidade).toBe(3);
  });

  it("lote intercalado com outros atos (criação e envio no mesmo segundo) continua um lote só", () => {
    const t = (s: number) => `2026-10-30T12:00:0${s}.000Z`;
    const envio = (id: string, s: number) => item(id, t(s), { tipo: "mudanca", titulo: "Enviada para validação da área" });
    const out = agruparEmLote([item("a", t(5)), envio("a", 5), item("b", t(4)), envio("b", 4), item("c", t(3))]);
    expect(out.map((i) => i.titulo)).toEqual(["3 vagas criadas", "2 vagas enviadas para validação da área"]);
  });

  it("colaboradores incluídos em lote listam os nomes no detalhe", () => {
    const t = "2026-10-30T12:00:00.000Z";
    const inc = (id: string, nome: string) => item(id, t, { titulo: `Colaborador incluído: ${nome}`, destaque: true, vagas: [vagaFeed(id, { colaborador: nome })] });
    const [lote] = agruparEmLote([inc("a", "ANA"), inc("b", "BIA"), inc("c", "CAIO"), inc("d", "DUDA")]);
    expect(lote.titulo).toBe("4 colaboradores incluídos");
    expect(lote.detalhe).toBe("ANA, BIA, CAIO +1");
  });

  it("tipo de cada linha do histórico", () => {
    expect(tipoDaEntrada({ categoria: "passagem", titulo: "Passagem emitida" })).toBe("passagem");
    expect(tipoDaEntrada({ categoria: "hospedagem", titulo: "Hospedagem registrada" })).toBe("hotel");
    expect(tipoDaEntrada({ categoria: "troca", titulo: "Troca aprovada" })).toBe("pedido");
    expect(tipoDaEntrada({ categoria: "pedido", titulo: "Pedido de ajuste aberto" })).toBe("pedido");
    expect(tipoDaEntrada({ categoria: "escala", titulo: "Colaborador incluído: ANA", destaque: true })).toBe("inclusao");
    expect(tipoDaEntrada({ categoria: "vaga", titulo: "Vaga criada" })).toBe("inclusao");
    expect(tipoDaEntrada({ categoria: "alteracao", titulo: "Período alterado" })).toBe("mudanca");
    expect(tipoDaEntrada({ categoria: "vaga", titulo: "Vaga excluída" })).toBe("mudanca");
  });

  it("janela: hoje começa à meia-noite de São Paulo; 24h e 7d contam para trás", () => {
    const agora = new Date("2026-10-30T02:30:00.000Z"); // 29/10 23:30 em SP
    expect(inicioDoPeriodo("hoje", agora).toISOString()).toBe("2026-10-29T03:00:00.000Z");
    expect(inicioDoPeriodo("24h", agora).toISOString()).toBe("2026-10-29T02:30:00.000Z");
    expect(inicioDoPeriodo("7d", agora).toISOString()).toBe("2026-10-23T02:30:00.000Z");
  });

  it("cursor: continua depois do item; se ele sumiu, do instante dele", () => {
    const lista = [item("a", "2026-10-30T12:00:03.000Z"), item("b", "2026-10-30T12:00:02.000Z"), item("c", "2026-10-30T12:00:01.000Z")];
    expect(aposOCursor(lista, "2026-10-30T12:00:03.000Z|a").map((i) => i.id)).toEqual(["b", "c"]);
    expect(aposOCursor(lista, "2026-10-30T12:00:02.500Z|sumiu").map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("filtros inválidos caem no padrão; limite entre 1 e 200", () => {
    expect(lerFiltros({ periodo: "1ano", tipo: "xpto", limite: "9999" })).toMatchObject({ periodo: "24h", tipo: null, limite: 200 });
    expect(lerFiltros({ periodo: "7d", tipo: "hotel", limite: "0", passagem: "1" })).toMatchObject({ periodo: "7d", tipo: "hotel", limite: 1, comPassagem: true });
  });
});
