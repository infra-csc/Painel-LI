import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { tickets, type Ticket } from "./schema";
import { CAMPOS_QUE_NAO_SAO_DADO, passagemSoComCarimbo } from "./passagem-so-com-carimbo";

/** A linha exatamente como o "Marcar como emitida" cria numa vaga sem passagem: todas as colunas, só o carimbo. */
function linhaDoCarimbo(): Ticket {
  const agora = new Date("2026-10-22T07:18:00Z");
  const linha = Object.fromEntries(Object.keys(getTableColumns(tickets)).map((c) => [c, null])) as unknown as Ticket;
  return { ...linha, id: "t-1", teamInclusionId: "v-4401", emittedAt: agora, emittedBy: "u-compras", createdAt: agora, updatedAt: agora, updatedBy: "u-compras" };
}

/** Um valor preenchido para cada tipo de coluna. */
function valorDe(coluna: { columnType: string; dataType: string }): unknown {
  if (coluna.dataType === "array") return ["anexo-1"];
  if (coluna.dataType === "number") return 1;
  if (coluna.dataType === "date") return new Date("2026-10-22T00:00:00Z");
  if (coluna.dataType === "boolean") return true;
  return "x";
}

describe("passagemSoComCarimbo", () => {
  it("a linha criada pelo 'Marcar como emitida' é só o carimbo", () => {
    expect(passagemSoComCarimbo(linhaDoCarimbo())).toBe(true);
  });

  it("sem carimbo não é 'só o carimbo' (nada a desfazer)", () => {
    expect(passagemSoComCarimbo({ ...linhaDoCarimbo(), emittedAt: null, emittedBy: null })).toBe(false);
    expect(passagemSoComCarimbo(null)).toBe(false);
    expect(passagemSoComCarimbo(undefined)).toBe(false);
  });

  it("texto em branco e lista vazia não contam como dado", () => {
    expect(passagemSoComCarimbo({ ...linhaDoCarimbo(), locator: "   ", ticketObservations: "", attachmentIds: [] })).toBe(true);
  });

  it("valor 0 conta como dado (alguém digitou)", () => {
    expect(passagemSoComCarimbo({ ...linhaDoCarimbo(), value: 0 })).toBe(false);
  });

  it("os campos que o próprio 'emitir' grava existem no schema", () => {
    const colunas = Object.keys(getTableColumns(tickets));
    for (const c of CAMPOS_QUE_NAO_SAO_DADO) expect(colunas).toContain(c);
  });

  // Toda coluna fora da lista é dado — inclusive as que ainda vão nascer.
  const colunasDeDado = Object.entries(getTableColumns(tickets))
    .filter(([nome]) => !(CAMPOS_QUE_NAO_SAO_DADO as readonly string[]).includes(nome));

  it("a lista de dados cobre o que a regra pede", () => {
    const nomes = colunasDeDado.map(([n]) => n);
    for (const c of [
      "transportType", "purchaseDate", "actualDepartureDate", "actualDepartureTime", "actualArrivalTime",
      "actualReturnDate", "actualReturnTime", "returnArrivalTime", "departureCityOrigin", "departureCityDestination",
      "returnCityOrigin", "returnCityDestination", "departureAirport", "destinationAirport", "returnOriginAirport",
      "returnDestinationAirport", "value", "purchaseOrderNumber", "fileUrl", "attachmentIds", "cardLastFourDigits",
      "ticketObservations", "ticketCompany", "ticketStatus", "locator", "checkIn3", "baggageTotalCents", "baggageOc",
      "baggageNotes", "idaVemDeInclusionId", "justificativaPreco", "archivedAt", "archivedCollaboratorId", "archivedReason",
    ]) expect(nomes).toContain(c);
  });

  it.each(colunasDeDado)("%s preenchido: a passagem tem dado", (nome, coluna) => {
    const t = { ...linhaDoCarimbo(), [nome]: valorDe(coluna as unknown as { columnType: string; dataType: string }) } as Ticket;
    expect(passagemSoComCarimbo(t)).toBe(false);
  });
});
