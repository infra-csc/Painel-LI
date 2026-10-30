/**
 * Testes de rota — Dia(s) do evento no cadastro (30/10).
 * Os dias reais do evento ficam dentro do período (montagem a desmontagem);
 * opcionais; só o primeiro = um dia; até ≥ de. A regra mora em
 * shared/dia-da-prova.ts (erroDosDiasDoEvento) e vale no POST e no PUT.
 * Rodar: `npm run test:rotas`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { agenteLogado, criarApp, criarEvento, mutacao, unico, type Contexto } from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

// Viva Esporte Serra: período 01/11 (dom) → 08/11 (dom); evento 05 e 06/11.
const SERRA = { location: "Serra - ES", startDate: "2026-11-01", endDate: "2026-11-08" };

describe("POST /api/events com os dias do evento", () => {
  it("aceita os dois dias dentro do período e grava", async () => {
    const { agent } = await agenteLogado("purchasing");
    const res = await mutacao(agent.post("/api/events")).send({
      ...SERRA, name: `Viva Esporte Serra ${unico()}`, diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-06",
    });
    expect(res.status).toBe(200);
    const gravado = await ctx.storage.getEvent(res.body.id);
    expect(gravado?.diaEventoInicio).toBe("2026-11-05");
    expect(gravado?.diaEventoFim).toBe("2026-11-06");
  });

  it("sem os dias (ou com vazio) → 200 e os dois nulos", async () => {
    const { agent } = await agenteLogado("purchasing");
    const semCampo = await mutacao(agent.post("/api/events")).send({ ...SERRA, name: `Sem dias ${unico()}` });
    expect(semCampo.status).toBe(200);
    expect(semCampo.body.diaEventoInicio).toBeNull();
    const vazio = await mutacao(agent.post("/api/events")).send({ ...SERRA, name: `Vazio ${unico()}`, diaEventoInicio: "", diaEventoFim: "" });
    expect(vazio.status).toBe(200);
    expect(vazio.body.diaEventoInicio).toBeNull();
    expect(vazio.body.diaEventoFim).toBeNull();
  });

  it("só o primeiro dia → um dia só (grava os dois iguais)", async () => {
    const { agent } = await agenteLogado("admin");
    const res = await mutacao(agent.post("/api/events")).send({ ...SERRA, name: `Um dia ${unico()}`, diaEventoInicio: "2026-11-05", diaEventoFim: "" });
    expect(res.status).toBe(200);
    expect(res.body.diaEventoInicio).toBe("2026-11-05");
    expect(res.body.diaEventoFim).toBe("2026-11-05");
  });

  it("recusa dia fora do período, até antes de de, e data mal formada — nada é criado", async () => {
    const { agent } = await agenteLogado("purchasing");
    const casos = [
      { dias: { diaEventoInicio: "2026-10-31", diaEventoFim: "2026-11-01" }, campo: "diaEventoInicio" },
      { dias: { diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-09" }, campo: "diaEventoFim" },
      { dias: { diaEventoInicio: "2026-11-06", diaEventoFim: "2026-11-05" }, campo: "diaEventoFim" },
    ];
    for (const { dias, campo } of casos) {
      const nome = `Recusado ${unico()}`;
      const res = await mutacao(agent.post("/api/events")).send({ ...SERRA, name: nome, ...dias });
      expect(res.status).toBe(400);
      expect(res.body.campo).toBe(campo);
      expect((await ctx.storage.getEvents(true)).some((e) => e.name === nome)).toBe(false);
    }
    const malFormada = await mutacao(agent.post("/api/events")).send({ ...SERRA, name: `Mal formada ${unico()}`, diaEventoInicio: "05/11/2026" });
    expect(malFormada.status).toBe(400);
  });
});

describe("PUT /api/events/:id com os dias do evento", () => {
  it("informa, troca e apaga os dias", async () => {
    const { agent } = await agenteLogado("purchasing");
    const evento = await criarEvento({ ...SERRA });

    const informa = await mutacao(agent.put(`/api/events/${evento.id}`)).send({ diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-06" });
    expect(informa.status).toBe(200);
    expect(informa.body.diaEventoFim).toBe("2026-11-06");

    const apaga = await mutacao(agent.put(`/api/events/${evento.id}`)).send({ diaEventoInicio: "", diaEventoFim: "" });
    expect(apaga.status).toBe(200);
    expect((await ctx.storage.getEvent(evento.id))?.diaEventoInicio).toBeNull();
    expect((await ctx.storage.getEvent(evento.id))?.diaEventoFim).toBeNull();
  });

  it("PUT sem os campos não apaga os dias gravados", async () => {
    const { agent } = await agenteLogado("purchasing");
    const evento = await criarEvento({ ...SERRA });
    await mutacao(agent.put(`/api/events/${evento.id}`)).send({ diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-06" });
    const res = await mutacao(agent.put(`/api/events/${evento.id}`)).send({ name: `${evento.name} (editado)` });
    expect(res.status).toBe(200);
    expect(res.body.diaEventoInicio).toBe("2026-11-05");
    expect(res.body.diaEventoFim).toBe("2026-11-06");
  });

  it("dia fora do período → 400; encolher o período para fora dos dias gravados → 400 e nada muda", async () => {
    const { agent } = await agenteLogado("purchasing");
    const evento = await criarEvento({ ...SERRA });
    const fora = await mutacao(agent.put(`/api/events/${evento.id}`)).send({ diaEventoInicio: "2026-11-09" });
    expect(fora.status).toBe(400);
    expect(fora.body.campo).toBe("diaEventoInicio");

    await mutacao(agent.put(`/api/events/${evento.id}`)).send({ diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-06" });
    const encolhe = await mutacao(agent.put(`/api/events/${evento.id}`)).send({ startDate: "2026-11-06", endDate: "2026-11-08" });
    expect(encolhe.status).toBe(400);
    expect(encolhe.body.message).toContain("dentro do período");
    expect((await ctx.storage.getEvent(evento.id))?.startDate).toBe("2026-11-01");
  });
});
