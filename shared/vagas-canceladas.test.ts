/**
 * Vagas canceladas no Espelho (23/10, Night Run Curitiba) — regras puras.
 * Rodar: `npx vitest run shared/vagas-canceladas.test.ts --maxWorkers=1`.
 */
import { describe, expect, it } from "vitest";
import { avisoDasCanceladas, avisoDeQuemSaiu, custoDaVagaCancelada, tirarQuemSaiuDoEspelho, type EntradaDaVagaCancelada } from "./vagas-canceladas";
import { ehVagaCancelada } from "./vaga-status";

describe("o que é vaga cancelada", () => {
  it("status OU fase cancelado; sugestão negada e vaga ativa não", () => {
    expect(ehVagaCancelada({ status: "cancelado", phase: "cancelado" })).toBe(true);
    expect(ehVagaCancelada({ status: "cancelado", phase: "hospedagem" })).toBe(true);
    expect(ehVagaCancelada({ status: "escalado", phase: "cancelado" })).toBe(true);
    expect(ehVagaCancelada({ status: "hospedagem_passagem_comprada", phase: "hospedagem" })).toBe(false);
    expect(ehVagaCancelada({ status: "sugestao_negada", phase: "sugestao" })).toBe(false);
    expect(ehVagaCancelada(null)).toBe(false);
  });
});

describe("quem sai dos quartos/carros na leitura", () => {
  const quarto = (id: string, membros: string[], confirmed = false) => ({ id, confirmed, members: membros.map((collaboratorId) => ({ collaboratorId })) });
  const ativos = new Set(["matheus", "bruno"]);
  const cancelados = new Map([["andrew", "Andrew Souza da Silva"]]);

  it("tira a cancelada, mantém o quarto com quem ficou e diz quem saiu", () => {
    const [q] = tirarQuemSaiuDoEspelho([quarto("q1", ["andrew", "matheus"], true)], ativos, cancelados);
    expect(q.members).toEqual([{ collaboratorId: "matheus" }]);
    expect(q.foraDoEspelho).toEqual([{ collaboratorId: "andrew", nome: "Andrew Souza da Silva", motivo: "cancelada" }]);
    expect(q.confirmed).toBe(true);
  });

  it("quarto que fica vazio some; quarto que já vinha vazio fica; vaga excluída também sai", () => {
    const grupos = tirarQuemSaiuDoEspelho(
      [quarto("so-andrew", ["andrew"]), quarto("vazio", []), quarto("excluida", ["sem-vaga", "bruno"])],
      ativos, cancelados, (id) => (id === "sem-vaga" ? "Fulano" : "—"),
    );
    expect(grupos.map((g) => g.id)).toEqual(["vazio", "excluida"]);
    expect(grupos[1].foraDoEspelho).toEqual([{ collaboratorId: "sem-vaga", nome: "Fulano", motivo: "excluida" }]);
  });

  it("o aviso do confirmado", () => {
    expect(avisoDeQuemSaiu([], "quarto")).toBeNull();
    expect(avisoDeQuemSaiu([{ collaboratorId: "a", nome: "Andrew", motivo: "cancelada" }], "quarto"))
      .toBe("Uma vaga deste quarto foi cancelada (Andrew) — a pessoa saiu da lista. Avise o hotel e reabra o quarto para refazer.");
    expect(avisoDeQuemSaiu([{ collaboratorId: "a", nome: "Andrew", motivo: "cancelada" }, { collaboratorId: "b", nome: "Bia", motivo: "cancelada" }], "carro"))
      .toBe("2 vagas deste carro foram canceladas (Andrew, Bia) — a pessoa saiu da lista. Ajuste o carro e reabra-o para refazer.");
  });
});

describe("custo da vaga cancelada", () => {
  const base: EntradaDaVagaCancelada = {
    teamInclusionId: "4114", inclusionNumber: 4114,
    collaborator: { id: "andrew", fullName: "ANDREW SOUZA DA SILVA" },
    function: { name: "Kit", area: "Operações", costCenter: "LI" },
    schedule: { startDate: "2026-10-15", endDate: "2026-10-18", dailyRates: 4 },
    passagem: null, historicoCentavos: 0, hospedagem: null, bagagemCentavos: 0, uberCentavos: 0, locacaoCentavos: 0,
  };

  it("passagem comprada + hospedagem reservada (hotel a definir): soma tudo e pede revisão", () => {
    const c = custoDaVagaCancelada({
      ...base,
      passagem: { value: 98000, ticketStatus: "comprada", actualDepartureDate: "2026-10-14", actualReturnDate: "2026-10-19" },
      hospedagem: { hotelName: null, hotelStatus: "reservada", checkInDate: "2026-10-14", checkOutDate: "2026-10-19", dailyRate: 30000, nightsCount: 5 },
      historicoCentavos: 5000, bagagemCentavos: 15000,
    })!;
    expect(c).toMatchObject({
      passagemCentavos: 103000, hotelCentavos: 150000, bagagemCentavos: 15000, totalCentavos: 268000, revisar: true,
      passagem: { ida: "2026-10-14", volta: "2026-10-19", viva: true, historicoCentavos: 5000 },
      hospedagem: { viva: true, hotelName: null, checkIn: "2026-10-14" },
    });
  });

  it("o total lançado da hospedagem vence a diária × noites (a regra única do hotel)", () => {
    const c = custoDaVagaCancelada({ ...base, hospedagem: { hotelName: "Hotel X", totalCents: 50000, dailyRate: 30000, nightsCount: 5, hotelStatus: "confirmada" } })!;
    expect(c.hotelCentavos).toBe(50000);
  });

  it("passagem e hospedagem já canceladas: o dinheiro fica, mas não pede revisão", () => {
    const c = custoDaVagaCancelada({
      ...base,
      passagem: { value: 98000, ticketStatus: "cancelada" },
      hospedagem: { hotelName: "Hotel X", hotelStatus: "cancelada", totalCents: 20000 },
    })!;
    expect(c).toMatchObject({ totalCentavos: 118000, revisar: false, passagem: { viva: false }, hospedagem: { viva: false } });
  });

  it("sem registro nem valor, não entra no bloco", () => {
    expect(custoDaVagaCancelada(base)).toBeNull();
    // Só um Uber lançado já é dinheiro: entra, sem pedir revisão de passagem/hospedagem.
    expect(custoDaVagaCancelada({ ...base, uberCentavos: 4000 })).toMatchObject({ totalCentavos: 4000, revisar: false, passagem: null, hospedagem: null });
  });

  it("o aviso do topo", () => {
    expect(avisoDasCanceladas(0)).toBeNull();
    expect(avisoDasCanceladas(1)).toBe("1 vaga cancelada ainda tem passagem ou hospedagem — revisar");
    expect(avisoDasCanceladas(2)).toBe("2 vagas canceladas ainda têm passagem ou hospedagem — revisar");
  });
});
