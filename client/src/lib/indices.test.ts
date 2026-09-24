import { describe, it, expect } from "vitest";
import { indexarPorId, nomePorId, agruparPor, chaveComposta } from "./indices";

describe("indexarPorId", () => {
  it("indexa por id e o primeiro repetido vence (como Array.find)", () => {
    const lista = [{ id: "a", v: 1 }, { id: "b", v: 2 }, { id: "a", v: 3 }];
    const m = indexarPorId(lista);
    expect(m.size).toBe(2);
    expect(m.get("a")?.v).toBe(1);
    expect(m.get("b")?.v).toBe(2);
  });

  it("aceita lista nula/indefinida", () => {
    expect(indexarPorId(null).size).toBe(0);
    expect(indexarPorId(undefined).size).toBe(0);
  });
});

describe("nomePorId", () => {
  const m = new Map([["c1", "Maria"], ["c2", ""]]);
  it("devolve o nome quando existe", () => {
    expect(nomePorId(m, "c1")).toBe("Maria");
  });
  it("usa o fallback para id vazio, ausente ou nome vazio", () => {
    expect(nomePorId(m, null)).toBe("—");
    expect(nomePorId(m, undefined, "Não definido")).toBe("Não definido");
    expect(nomePorId(m, "zzz", "-")).toBe("-");
    expect(nomePorId(m, "c2", "-")).toBe("-");
  });
});

describe("agruparPor", () => {
  const vagas = [
    { id: "1", eventId: "e1", collaboratorId: "c1" },
    { id: "2", eventId: "e2", collaboratorId: "c1" },
    { id: "3", eventId: "e1", collaboratorId: null },
    { id: "4", eventId: "e1", collaboratorId: "c1" },
  ];

  it("agrupa por nome de campo preservando a ordem", () => {
    const g = agruparPor(vagas, "eventId");
    expect([...g.keys()]).toEqual(["e1", "e2"]);
    expect(g.get("e1")?.map(v => v.id)).toEqual(["1", "3", "4"]);
  });

  it("agrupa por função de chave (composta)", () => {
    const g = agruparPor(vagas, v => chaveComposta(v.eventId, v.collaboratorId));
    expect(g.get("e1|c1")?.map(v => v.id)).toEqual(["1", "4"]);
    expect(g.get("e2|c1")?.map(v => v.id)).toEqual(["2"]);
  });

  it("chave nula vira grupo vazio ''", () => {
    const g = agruparPor(vagas, "collaboratorId");
    expect(g.get("")?.map(v => v.id)).toEqual(["3"]);
  });

  it("lista nula devolve mapa vazio", () => {
    expect(agruparPor(null, "eventId").size).toBe(0);
  });
});
