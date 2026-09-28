/**
 * Orçamento PLANEJADO de uma vaga fixa para os testes de componente (28/09).
 *
 * Passa pelo MESMO motor do servidor (`calcularPlanejadoDaVaga`, shared) — os
 * testes conferem o que a tela mostra contra o que o motor devolve, nunca
 * contra números decorados. Vaga: sex 10/04 → dom 12/04 (1 dia útil + 2 fds),
 * função "Produção", colaborador freela.
 */
import { calcularPlanejadoDaVaga, type OverrideDoPlanejado } from "@shared/budget-engine";
import type { TeamInclusion } from "@shared/schema";
import type { CalculatedBudget } from "@/components/budget/types";
import { formatarMoeda } from "@/lib/format";
import { colaboradorFake, vagaFake } from "./fixtures-dominio";

/**
 * Moeda como a Testing Library LÊ do DOM: `Intl` separa "R$" do número com um
 * espaço não separável (U+00A0) e o normalizador padrão dos matchers o troca
 * por espaço comum — comparar com `formatarMoeda` cru nunca bate.
 */
export const moeda = (centavos: number) => formatarMoeda(centavos).replace(/ /g, " ");

export const VALORES_DA_FUNCAO = {
  dailyValue: 40000,
  dailyValueWeekend: 40000,
  dailyValueFreela: 30000,
  dailyValueFreelaWeekend: 35000,
};

export function vagaDoPlanejado(parcial: Partial<TeamInclusion> = {}): TeamInclusion {
  return vagaFake({
    inclusionNumber: 501,
    collaboratorId: "colab-1",
    scheduleStartDate: "2026-04-10",
    scheduleEndDate: "2026-04-12",
    workDays: ["2026-04-10", "2026-04-11", "2026-04-12"],
    dailyRates: 3,
    ...parcial,
  });
}

export interface OpcoesDoOrcamento {
  vaga?: TeamInclusion;
  override?: OverrideDoPlanejado | null;
  collaboratorType?: "casa" | "freela" | "local";
  nome?: string;
}

export function orcamentoFake(opcoes: OpcoesDoOrcamento = {}): CalculatedBudget {
  const vaga = opcoes.vaga ?? vagaDoPlanejado();
  const tipo = opcoes.collaboratorType ?? "freela";
  const resultado = calcularPlanejadoDaVaga({
    vaga,
    functionName: "Produção",
    collaboratorType: tipo,
    functionValue: VALORES_DA_FUNCAO,
    settings: {},
    override: opcoes.override ?? null,
  });
  return {
    ...resultado,
    inclusion: vaga,
    collaborator: colaboradorFake({ id: vaga.collaboratorId ?? "colab-1", fullName: opcoes.nome ?? "Ana Souza", type: tipo }),
    functionValue: null,
  };
}
