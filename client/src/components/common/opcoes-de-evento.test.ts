import { describe, expect, it } from "vitest";
import { eventoFake } from "@/test/fixtures-dominio";
import { opcoesDeEvento } from "./opcoes-de-evento";

const eventos = [
  eventoFake({ id: "e1", name: "Maratona SP" }),
  eventoFake({ id: "e2", name: "Corrida Rio" }),
  eventoFake({ id: "e3", name: "Night Run" }),
  eventoFake({ id: "x", name: "Apagado", status: "excluido" }),
];

describe("opções do seletor de evento (28/10, dono)", () => {
  it("sem evento escolhido: tudo como antes — número de cada um (0 quando não há linha)", () => {
    const n = new Map([["e1", 3], ["e2", 1]]);
    expect(opcoesDeEvento(eventos, n, [])).toEqual([
      { id: "e1", nome: "Maratona SP", n: 3 },
      { id: "e2", nome: "Corrida Rio", n: 1 },
      { id: "e3", nome: "Night Run", n: 0 },
    ]);
    // Passagens só lista quem tem linha.
    expect(opcoesDeEvento(eventos, n, [], { somenteComLinhas: true }).map((o) => o.id)).toEqual(["e1", "e2"]);
  });

  it("com evento escolhido: ele mantém o número; os outros aparecem SEM número (nem 0) e não somem", () => {
    // A lista veio só do e1 (`?eventId=`): o mapa só conhece ele.
    const n = new Map([["e1", 4]]);
    const r = opcoesDeEvento(eventos, n, ["e1"], { somenteComLinhas: true });
    expect(r).toEqual([
      { id: "e1", nome: "Maratona SP", n: 4 },
      { id: "e2", nome: "Corrida Rio", n: null },
      { id: "e3", nome: "Night Run", n: null },
    ]);
  });

  it("escolhido sem linha no recorte fica com 0; excluído nunca entra", () => {
    const r = opcoesDeEvento(eventos, new Map(), ["e2", "e3"]);
    expect(r).toEqual([
      { id: "e1", nome: "Maratona SP", n: null },
      { id: "e2", nome: "Corrida Rio", n: 0 },
      { id: "e3", nome: "Night Run", n: 0 },
    ]);
  });
});
