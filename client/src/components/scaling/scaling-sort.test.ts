import { describe, it, expect } from "vitest";
import type { TeamInclusion } from "@shared/schema";
import { ordenarEscalacoes, type NomesParaOrdenar } from "./scaling-sort";

const NOMES: Record<string, string> = {
  c1: "Ana Souza", c2: "bruno lima", c3: "Ápio Costa", c4: "Zeca",
};
const nomes: NomesParaOrdenar = {
  getEventName: (id) => ({ e1: "Etapa 2", e2: "Etapa 10", e3: "Alfa" } as Record<string, string>)[id ?? ""] ?? "",
  getFunctionName: (id) => ({ f1: "cenotecnica", f2: "Atendimento" } as Record<string, string>)[id ?? ""] ?? "",
  getCollaboratorName: (id) => NOMES[id ?? ""] ?? "Não escalado",
  getScalingStatusLabel: (i) => (i.collaboratorId ? "Escalado" : "Vaga aberta"),
};

let seq = 0;
const vaga = (over: Partial<TeamInclusion> = {}) => ({
  id: `v${++seq}`, inclusionNumber: seq, eventId: "e1", functionId: "f1",
  collaboratorId: null, status: "pendente",
  scheduleStartDate: "2026-08-10", scheduleEndDate: "2026-08-12",
  ...over,
}) as TeamInclusion;

const ids = (linhas: TeamInclusion[]) => linhas.map((l) => l.id);

describe("ordenação por colaborador", () => {
  const linhas = [
    vaga({ id: "sem-nome-1", collaboratorId: null }),
    vaga({ id: "zeca", collaboratorId: "c4" }),
    vaga({ id: "ana", collaboratorId: "c1" }),
    vaga({ id: "sem-nome-2", collaboratorId: null }),
    vaga({ id: "bruno", collaboratorId: "c2" }),
  ];

  it("vaga sem nome vai para o FIM nos dois sentidos", () => {
    // Ordenar por colaborador é procurar uma pessoa: "Não escalado"
    // alfabetizado no "N" enfiaria as vazias no meio de quem tem nome.
    const asc = ids(ordenarEscalacoes(linhas, { field: "collaborator", direction: "asc" }, nomes));
    const desc = ids(ordenarEscalacoes(linhas, { field: "collaborator", direction: "desc" }, nomes));
    expect(asc.slice(-2)).toEqual(["sem-nome-1", "sem-nome-2"]);
    expect(desc.slice(-2)).toEqual(["sem-nome-1", "sem-nome-2"]);
    expect(asc[0]).toBe("ana");
    expect(desc[0]).toBe("zeca");
  });

  it("ignora caixa e acento ao comparar nomes", () => {
    const comAcento = [
      vaga({ id: "apio", collaboratorId: "c3" }),   // Ápio
      vaga({ id: "ana", collaboratorId: "c1" }),    // Ana
      vaga({ id: "bruno", collaboratorId: "c2" }),  // bruno, minúsculo
    ];
    expect(ids(ordenarEscalacoes(comAcento, { field: "collaborator", direction: "asc" }, nomes)))
      .toEqual(["ana", "apio", "bruno"]);
  });
});

describe("ordenação estável", () => {
  it("linhas equivalentes mantêm a ordem original", () => {
    // Sem desempate, duas linhas iguais trocavam de lugar a cada rerender e a
    // lista "piscava" sozinha.
    const iguais = [vaga({ id: "a" }), vaga({ id: "b" }), vaga({ id: "c" })];
    expect(ids(ordenarEscalacoes(iguais, { field: "function", direction: "asc" }, nomes))).toEqual(["a", "b", "c"]);
    expect(ids(ordenarEscalacoes(iguais, { field: "function", direction: "desc" }, nomes))).toEqual(["a", "b", "c"]);
  });

  it("não muta o array recebido", () => {
    const original = [vaga({ id: "z", inclusionNumber: 9 }), vaga({ id: "a", inclusionNumber: 1 })];
    const copia = [...original];
    ordenarEscalacoes(original, { field: "id", direction: "asc" }, nomes);
    expect(original).toEqual(copia);
  });
});

describe("ordenação por evento e função", () => {
  it("números dentro do nome ordenam como números", () => {
    // Sem `numeric`, "Etapa 10" vinha antes de "Etapa 2".
    const linhas = [vaga({ id: "dez", eventId: "e2" }), vaga({ id: "dois", eventId: "e1" }), vaga({ id: "alfa", eventId: "e3" })];
    expect(ids(ordenarEscalacoes(linhas, { field: "event", direction: "asc" }, nomes))).toEqual(["alfa", "dois", "dez"]);
  });

  it("função ignora a caixa", () => {
    const linhas = [vaga({ id: "ceno", functionId: "f1" }), vaga({ id: "atend", functionId: "f2" })];
    expect(ids(ordenarEscalacoes(linhas, { field: "function", direction: "asc" }, nomes))).toEqual(["atend", "ceno"]);
  });
});

describe("ordenação por período", () => {
  it("sem data vai para o fim", () => {
    const linhas = [
      vaga({ id: "sem", scheduleStartDate: null }),
      vaga({ id: "depois", scheduleStartDate: "2026-09-01" }),
      vaga({ id: "antes", scheduleStartDate: "2026-08-01" }),
    ];
    expect(ids(ordenarEscalacoes(linhas, { field: "period", direction: "asc" }, nomes)))
      .toEqual(["antes", "depois", "sem"]);
  });
});

describe("sem escolha de ordenação", () => {
  it("cai em evento → função → data", () => {
    const linhas = [
      vaga({ id: "b", eventId: "e3", functionId: "f1" }),
      vaga({ id: "a", eventId: "e3", functionId: "f2" }),
      vaga({ id: "c", eventId: "e1", functionId: "f1" }),
    ];
    // "Alfa" (e3) antes de "Etapa 2" (e1); dentro de Alfa, Atendimento antes de cenotecnica.
    expect(ids(ordenarEscalacoes(linhas, null, nomes))).toEqual(["a", "b", "c"]);
  });
});
