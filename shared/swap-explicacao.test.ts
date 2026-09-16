import { describe, it, expect } from "vitest";
import { explicarTroca } from "./swap-explicacao";

const base = {
  inclusionNumber: 3623, eventName: "Corrida A",
  pairedInclusionNumber: 3577, pairedEventName: "Corrida B", pairedFunctionName: "atendimento",
  currentCollaboratorName: "João", newCollaboratorName: "Maria",
  newCity: "Campinas - SP", pairedNewCity: "São Paulo",
};

describe("explicação da troca (16/09)", () => {
  it("troca entre vagas: cada um vai para a vaga do outro, saindo da própria cidade", () => {
    const e = explicarTroca({ ...base, swapKind: "permuta" });
    expect(e.tipo).toBe("Troca entre vagas");
    expect(e.vagas).toEqual([
      { chave: "esta", vaga: "Vaga #3623 · Corrida A", antes: "João", depois: "Maria", saiDe: "Campinas - SP" },
      { chave: "outra", vaga: "Vaga #3577 · Corrida B · atendimento", antes: "Maria", depois: "João", saiDe: "São Paulo" },
    ]);
    expect(e.recusa).toContain("vale para as duas vagas");
    expect(e.recusa).toContain("João continua na vaga #3623");
  });

  it("transferência: a vaga aberta recebe a pessoa e a de origem fica aberta", () => {
    const e = explicarTroca({ ...base, swapKind: "transferencia", currentCollaboratorName: null });
    expect(e.vagas[0]).toMatchObject({ antes: "Vaga aberta", depois: "Maria", saiDe: "Campinas - SP" });
    expect(e.vagas[1]).toMatchObject({ antes: "Maria", depois: "Vaga aberta", saiDe: null });
    expect(e.observacoes.join(" ")).toContain("A vaga #3577 volta a ficar aberta");
  });

  it("troca simples: uma vaga só", () => {
    const e = explicarTroca({ ...base, swapKind: "substituicao", pairedInclusionNumber: null });
    expect(e.vagas).toHaveLength(1);
    expect(e.recusa).toBe("Recusar mantém João na vaga #3623.");
  });

  it("dado faltando não quebra o texto", () => {
    const e = explicarTroca({ swapKind: "permuta" });
    expect(e.vagas[0].vaga).toBe("Vaga #?");
    expect(e.vagas[0].antes).toBe("?");
    expect(e.vagas[0].saiDe).toBeNull();
  });
});
