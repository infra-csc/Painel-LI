import { describe, it, expect } from "vitest";
import { motivoTrocaDesatualizada, ocupantesEsperados } from "./troca-desatualizada";
import { explicarTroca } from "./swap-explicacao";

const ROBERTO = "c-roberto";
const MATHEUS = "c-matheus";
const OUTRA = "c-outra";

/** O caso do dono (09/10): transferência na #4287 (Roberto) trazendo o Matheus da #4290. */
const transferencia = {
  swapKind: "transferencia",
  inclusionNumber: 4287,
  pairedInclusionNumber: 4290,
  currentCollaboratorId: ROBERTO,
  currentCollaboratorName: "Roberto Carlos de Souza",
  newCollaboratorId: MATHEUS,
  newCollaboratorName: "Matheus Pereira Silva",
};

describe("pedido de troca ainda vale? (09/10)", () => {
  describe("transferência", () => {
    it("vale quando a vaga do pedido tem quem estava e a de origem tem quem vem", () => {
      expect(motivoTrocaDesatualizada({ ...transferencia, inclusionCollaboratorId: ROBERTO, pairedCollaboratorId: MATHEUS })).toBeNull();
    });

    it("vale para vaga aberta que segue aberta", () => {
      expect(motivoTrocaDesatualizada({
        ...transferencia, currentCollaboratorId: null, currentCollaboratorName: null,
        inclusionCollaboratorId: null, pairedCollaboratorId: MATHEUS,
      })).toBeNull();
    });

    it("o caso real: a vaga de origem passou a ter o Roberto", () => {
      expect(motivoTrocaDesatualizada({
        ...transferencia,
        inclusionCollaboratorId: ROBERTO,
        pairedCollaboratorId: ROBERTO, pairedCollaboratorName: "Roberto Carlos de Souza",
      })).toBe("A vaga #4290 hoje está com Roberto Carlos de Souza, não com Matheus Pereira Silva.");
    });

    it("vaga aberta no pedido que ganhou alguém, e origem que ficou aberta: diz as duas", () => {
      expect(motivoTrocaDesatualizada({
        ...transferencia, currentCollaboratorId: null, currentCollaboratorName: null,
        inclusionCollaboratorId: OUTRA, inclusionCollaboratorName: "Outra Pessoa",
        pairedCollaboratorId: null,
      })).toBe("A vaga #4287 hoje está com Outra Pessoa, e no pedido estava aberta. A vaga #4290 hoje está aberta, não com Matheus Pereira Silva.");
    });
  });

  describe("permuta", () => {
    const permuta = { ...transferencia, swapKind: "permuta" };
    it("vale com cada um na própria vaga", () => {
      expect(motivoTrocaDesatualizada({ ...permuta, inclusionCollaboratorId: ROBERTO, pairedCollaboratorId: MATHEUS })).toBeNull();
    });
    it("mudou quando a vaga do pedido trocou de pessoa", () => {
      expect(motivoTrocaDesatualizada({ ...permuta, inclusionCollaboratorId: OUTRA, inclusionCollaboratorName: "Outra Pessoa", pairedCollaboratorId: MATHEUS }))
        .toBe("A vaga #4287 hoje está com Outra Pessoa, não com Roberto Carlos de Souza.");
    });
    it("sem quem estava no pedido nunca vale (o servidor recusa)", () => {
      expect(motivoTrocaDesatualizada({ ...permuta, currentCollaboratorId: null, inclusionCollaboratorId: null, pairedCollaboratorId: MATHEUS }))
        .toContain("não diz quem estava na vaga #4287");
    });
  });

  describe("troca simples", () => {
    const simples = { ...transferencia, swapKind: "substituicao", pairedInclusionNumber: null };
    it("vale com quem estava na vaga", () => {
      expect(motivoTrocaDesatualizada({ ...simples, inclusionCollaboratorId: ROBERTO })).toBeNull();
    });
    it("mudou quando a vaga ficou aberta", () => {
      expect(motivoTrocaDesatualizada({ ...simples, inclusionCollaboratorId: null }))
        .toBe("A vaga #4287 hoje está aberta, não com Roberto Carlos de Souza.");
    });
    it("a outra vaga não conta na troca simples", () => {
      expect(motivoTrocaDesatualizada({ ...simples, inclusionCollaboratorId: ROBERTO, pairedCollaboratorId: OUTRA })).toBeNull();
      expect(ocupantesEsperados(simples)).toEqual({ esta: ROBERTO });
    });
  });

  it("ocupante que não veio (undefined) não é conferido", () => {
    expect(motivoTrocaDesatualizada(transferencia)).toBeNull();
    expect(motivoTrocaDesatualizada({ ...transferencia, pairedCollaboratorId: ROBERTO })).not.toBeNull();
  });
});

describe("\"Hoje\" na explicação usa quem está DE FATO (09/10)", () => {
  it("transferência com a origem mudada: Hoje mostra o Roberto, não o Matheus", () => {
    const e = explicarTroca({
      ...transferencia,
      inclusionCollaboratorId: ROBERTO, inclusionCollaboratorName: "Roberto Carlos de Souza",
      pairedCollaboratorId: ROBERTO, pairedCollaboratorName: "Roberto Carlos de Souza",
    });
    expect(e.vagas[0].antes).toBe("Roberto Carlos de Souza");
    expect(e.vagas[1].antes).toBe("Roberto Carlos de Souza");
    expect(e.vagas[1].depois).toBe("Vaga aberta");
  });

  it("vaga que ficou aberta mostra \"Vaga aberta\"", () => {
    const e = explicarTroca({ ...transferencia, swapKind: "substituicao", inclusionCollaboratorId: null });
    expect(e.vagas[0].antes).toBe("Vaga aberta");
  });

  it("sem divergência o texto é o do pedido", () => {
    const e = explicarTroca({ ...transferencia, inclusionCollaboratorId: ROBERTO, inclusionCollaboratorName: "ROBERTO", pairedCollaboratorId: MATHEUS, pairedCollaboratorName: "MATHEUS" });
    expect(e.vagas[0].antes).toBe("Roberto Carlos de Souza");
    expect(e.vagas[1].antes).toBe("Matheus Pereira Silva");
  });
});
