/**
 * Tipo de transporte POR TRECHO (28/10 — Compras, vaga #4618 Erick Ramos,
 * Running Hour Rio): ida aérea GRU→SDU já comprada e a volta trocada para
 * ônibus (Novo Rio → Barra Funda). `tickets.return_transport_type` guarda o
 * tipo da volta só quando DIFERENTE da ida; null = igual à ida.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  criarEvento,
  criarFuncao,
  criarVaga,
  mutacao,
  type Contexto,
  type TestAgent,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

const A = (d: string) => `2027-${d}`;

async function cenarioErick() {
  const { agent, user } = await agenteLogado("purchasing");
  const evento = await criarEvento({ name: "Running Hour – Wellhub – Rio de Janeiro", location: "Aterro do Flamengo, Rio de Janeiro - RJ", startDate: A("11-12"), endDate: A("11-15") });
  const funcao = await criarFuncao();
  const erick = await criarColaborador({ fullName: "Erick Ramos da Silva" });
  const vaga = await criarVaga({ userId: user.id, eventId: evento.id, functionId: funcao.id, collaboratorId: erick.id, status: "escalado", phase: "escalacao", scheduleStartDate: A("11-11"), scheduleEndDate: A("11-15") });
  return { agent, vaga };
}

/** Ida aérea GRU→SDU + volta de ônibus Novo Rio → Barra Funda (o caso #4618). */
const idaAereaVoltaOnibus = (vagaId: string, extra: Record<string, unknown> = {}) => ({
  teamInclusionId: vagaId, transportType: "aereo", returnTransportType: "rodoviario",
  // Valor e bilhete por trecho (dono, 28/10: "SOMAR"): value = TOTAL; returnValue = a parte da volta.
  value: 53893, purchaseOrderNumber: "JPLN7F8J", returnValue: 15000, returnPurchaseOrderNumber: "4471",
  departureAirport: "GRU", destinationAirport: "SDU", departureCityOrigin: "São Paulo", departureCityDestination: "Rio de Janeiro",
  actualDepartureDate: A("11-11"), actualDepartureTime: "12:05", actualArrivalTime: "13:10",
  returnOriginAirport: "Rodoviária Novo Rio", returnDestinationAirport: "Terminal Barra Funda",
  returnCityOrigin: "Rio de Janeiro", returnCityDestination: "São Paulo",
  actualReturnDate: A("11-15"), actualReturnTime: "23:45", returnArrivalTime: "06:25",
  ...extra,
});

const registrar = (agent: TestAgent, body: Record<string, unknown>) => mutacao(agent.post("/api/tickets")).send(body);
const editar = (agent: TestAgent, id: string, body: Record<string, unknown>) => mutacao(agent.patch(`/api/tickets/${id}`)).send(body);

describe("POST /api/tickets — cada trecho com o seu tipo", () => {
  it("grava ida aérea + volta rodoviária (o caso #4618)", async () => {
    const { agent, vaga } = await cenarioErick();
    const res = await registrar(agent, idaAereaVoltaOnibus(vaga.id));
    expect(res.status).toBe(200);
    expect(res.body.transportType).toBe("aereo");
    expect(res.body.returnTransportType).toBe("rodoviario");
    const [gravada] = await ctx.storage.getTicketsByInclusionId(vaga.id);
    expect(gravada.returnTransportType).toBe("rodoviario");
    expect(gravada.departureAirport).toBe("GRU");
  });

  it("volta igual à ida, só ida e só volta gravam null (uma representação só para \"igual\")", async () => {
    const igual = await cenarioErick();
    expect((await registrar(igual.agent, idaAereaVoltaOnibus(igual.vaga.id, { returnTransportType: "aereo" }))).body.returnTransportType).toBeNull();

    const soIda = await cenarioErick();
    const r1 = await registrar(soIda.agent, idaAereaVoltaOnibus(soIda.vaga.id, {
      returnOriginAirport: null, returnDestinationAirport: null, returnCityOrigin: null, returnCityDestination: null,
      actualReturnDate: null, actualReturnTime: null, returnArrivalTime: null,
    }));
    expect(r1.status).toBe(200);
    expect(r1.body.returnTransportType).toBeNull();

    const soVolta = await cenarioErick();
    const r2 = await registrar(soVolta.agent, idaAereaVoltaOnibus(soVolta.vaga.id, {
      transportType: "rodoviario", departureAirport: null, destinationAirport: null, departureCityOrigin: null, departureCityDestination: null,
      actualDepartureDate: null, actualDepartureTime: null, actualArrivalTime: null,
    }));
    expect(r2.status).toBe(200);
    expect(r2.body.transportType).toBe("rodoviario");
    expect(r2.body.returnTransportType).toBeNull();
  });

  it("recusa tipo de volta inválido (van não é tipo de trecho)", async () => {
    const { agent, vaga } = await cenarioErick();
    expect((await registrar(agent, idaAereaVoltaOnibus(vaga.id, { returnTransportType: "van" }))).status).toBe(400);
  });

  it("o ônibus noturno da volta (23:45 → 06:25) não é barrado: o teto de preço é só de voo", async () => {
    const { agent, vaga } = await cenarioErick();
    // Valor alto: numa passagem mista não há típico de rota que compare.
    const res = await registrar(agent, idaAereaVoltaOnibus(vaga.id, { value: 999999 }));
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/tickets/:id — o tipo da volta acompanha a edição", () => {
  it("trocar só a volta para ônibus mantém a ida aérea; voltar para \"igual\" limpa", async () => {
    const { agent, vaga } = await cenarioErick();
    const criada = await registrar(agent, idaAereaVoltaOnibus(vaga.id, { returnTransportType: null }));
    expect(criada.body.returnTransportType).toBeNull();

    const mista = await editar(agent, criada.body.id, { returnTransportType: "rodoviario" });
    expect(mista.status).toBe(200);
    expect(mista.body.transportType).toBe("aereo");
    expect(mista.body.returnTransportType).toBe("rodoviario");

    const igual = await editar(agent, criada.body.id, { returnTransportType: null });
    expect(igual.body.returnTransportType).toBeNull();
  });

  it("mudar a ida para rodoviário com a volta rodoviária = igual (null); apagar a volta também limpa", async () => {
    const { agent, vaga } = await cenarioErick();
    const criada = await registrar(agent, idaAereaVoltaOnibus(vaga.id));
    const tudoOnibus = await editar(agent, criada.body.id, { transportType: "rodoviario" });
    expect(tudoOnibus.body.returnTransportType).toBeNull();

    const outra = await cenarioErick();
    const mista = await registrar(outra.agent, idaAereaVoltaOnibus(outra.vaga.id));
    const semVolta = await editar(outra.agent, mista.body.id, {
      actualReturnDate: null, actualReturnTime: null, returnArrivalTime: null, returnCityOrigin: null, returnCityDestination: null,
    });
    expect(semVolta.status).toBe(200);
    expect(semVolta.body.returnTransportType).toBeNull();
  });

  it("editar só o LOC não mexe no tipo da volta", async () => {
    const { agent, vaga } = await cenarioErick();
    const criada = await registrar(agent, idaAereaVoltaOnibus(vaga.id));
    const res = await editar(agent, criada.body.id, { purchaseOrderNumber: "JPLN7F8J" });
    expect(res.body.returnTransportType).toBe("rodoviario");
  });
});

describe("volta comprada à parte — valor e bilhete por trecho, total somado", () => {
  it("grava o total (ida + volta) em value e a parte da volta em returnValue; o custo lê o total", async () => {
    const { agent, vaga } = await cenarioErick();
    const res = await registrar(agent, idaAereaVoltaOnibus(vaga.id));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ value: 53893, returnValue: 15000, purchaseOrderNumber: "JPLN7F8J", returnPurchaseOrderNumber: "4471" });
  });

  it("recusa a parte da volta maior que o total", async () => {
    const { agent, vaga } = await cenarioErick();
    const res = await registrar(agent, idaAereaVoltaOnibus(vaga.id, { value: 10000, returnValue: 15000 }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valor da volta/i);
  });

  it("sem a perna de volta (só ida) não há volta à parte: os dois ficam null", async () => {
    const { agent, vaga } = await cenarioErick();
    const res = await registrar(agent, idaAereaVoltaOnibus(vaga.id, {
      returnOriginAirport: null, returnDestinationAirport: null, returnCityOrigin: null, returnCityDestination: null,
      actualReturnDate: null, actualReturnTime: null, returnArrivalTime: null,
    }));
    expect(res.body).toMatchObject({ returnValue: null, returnPurchaseOrderNumber: null });
  });

  it("o Espelho edita só o total: a volta à parte fica e a ida absorve a diferença", async () => {
    const { agent, vaga } = await cenarioErick();
    const criada = await registrar(agent, idaAereaVoltaOnibus(vaga.id));
    const res = await editar(agent, criada.body.id, { value: 60000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ value: 60000, returnValue: 15000, returnPurchaseOrderNumber: "4471" });
  });
});
