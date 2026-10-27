import { describe, expect, it } from "vitest";
import { casarVagasComPlanejado, linhaDaVagaSemColaborador } from "./casamento-do-planejado";

const vaga = (id: string, collaboratorId: string | null, functionId = "f1", inclusionNumber?: number) => ({ id, collaboratorId, functionId, inclusionNumber });
const linha = (id: string, collaboratorId: string | null, extra: { functionId?: string; teamInclusionId?: string | null; createdAt?: string } = {}) => ({
  id, collaboratorId, functionId: extra.functionId ?? "f1", teamInclusionId: extra.teamInclusionId ?? null, createdAt: extra.createdAt ?? "2026-10-01T00:00:00Z",
});

describe("casarVagasComPlanejado", () => {
  it("vaga com colaborador: pela chave colaborador|função, a primeira linha vence", () => {
    const m = casarVagasComPlanejado([vaga("v1", "c1")], [linha("p1", "c1"), linha("p2", "c1")]);
    expect(m.get("v1")?.id).toBe("p1");
  });

  it("duas vagas sem colaborador na mesma função: cada uma com a SUA linha (pela vaga gravada)", () => {
    const linhas = [linha("pB", null, { teamInclusionId: "v2" }), linha("pA", null, { teamInclusionId: "v1" })];
    const m = casarVagasComPlanejado([vaga("v1", null, "f1", 1), vaga("v2", null, "f1", 2)], linhas);
    expect(m.get("v1")?.id).toBe("pA");
    expect(m.get("v2")?.id).toBe("pB");
  });

  it("só uma linha gravada: a outra vaga fica sem linha (não pega a da vizinha)", () => {
    const m = casarVagasComPlanejado([vaga("v1", null, "f1", 1), vaga("v2", null, "f1", 2)], [linha("p2", null, { teamInclusionId: "v2" })]);
    expect(m.get("v2")?.id).toBe("p2");
    expect(m.has("v1")).toBe(false);
  });

  it("linhas antigas (sem vaga): adotadas uma por vaga, em ordem determinística", () => {
    const linhas = [linha("pTarde", null, { createdAt: "2026-10-02T00:00:00Z" }), linha("pCedo", null, { createdAt: "2026-10-01T00:00:00Z" })];
    const vagas = [vaga("vSegunda", null, "f1", 20), vaga("vPrimeira", null, "f1", 10)];
    const m = casarVagasComPlanejado(vagas, linhas);
    expect(m.get("vPrimeira")?.id).toBe("pCedo");
    expect(m.get("vSegunda")?.id).toBe("pTarde");
    // A ordem de entrada não muda o resultado.
    const m2 = casarVagasComPlanejado([...vagas].reverse(), [...linhas].reverse());
    expect(m2.get("vPrimeira")?.id).toBe("pCedo");
  });

  it("linha antiga só é adotada se nenhuma vaga a tem; outra função não conta", () => {
    const linhas = [linha("pV1", null, { teamInclusionId: "v1" }), linha("pVelha", null), linha("pOutra", null, { functionId: "f2" })];
    const m = casarVagasComPlanejado([vaga("v1", null, "f1", 1), vaga("v2", null, "f1", 2), vaga("v3", null, "f1", 3)], linhas);
    expect(m.get("v1")?.id).toBe("pV1");
    expect(m.get("v2")?.id).toBe("pVelha");
    expect(m.has("v3")).toBe(false);
  });
});

describe("linhaDaVagaSemColaborador (lote do servidor)", () => {
  const linhas = [
    linha("pV1", null, { teamInclusionId: "v1" }),
    linha("pVelha1", null, { createdAt: "2026-10-01T00:00:00Z" }),
    linha("pVelha2", null, { createdAt: "2026-10-02T00:00:00Z" }),
  ];
  it("1º a linha da vaga", () => {
    expect(linhaDaVagaSemColaborador({ teamInclusionId: "v1", functionId: "f1" }, linhas, new Set())?.id).toBe("pV1");
  });
  it("2º a sugerida pela tela (se adotável), 3º a primeira antiga livre", () => {
    expect(linhaDaVagaSemColaborador({ teamInclusionId: "v9", functionId: "f1", sugestaoId: "pVelha2" }, linhas, new Set())?.id).toBe("pVelha2");
    // Sugestão que é de outra vaga não vale.
    expect(linhaDaVagaSemColaborador({ teamInclusionId: "v9", functionId: "f1", sugestaoId: "pV1" }, linhas, new Set())?.id).toBe("pVelha1");
    expect(linhaDaVagaSemColaborador({ teamInclusionId: "v9", functionId: "f1" }, linhas, new Set(["pVelha1"]))?.id).toBe("pVelha2");
    expect(linhaDaVagaSemColaborador({ teamInclusionId: "v9", functionId: "f1" }, linhas, new Set(["pVelha1", "pVelha2"]))).toBeNull();
  });
});
