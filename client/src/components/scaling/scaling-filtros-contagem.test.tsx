/**
 * Escalação: o número de cada filtro = o que a lista mostra ao aplicá-lo (28/10).
 *
 * O hook de verdade (useScalingFilters + useScalingRecorte), com dados montados:
 *  - o contador do Período contava sobre a lista sem "Futuros" e sem função;
 *  - o contador de cada evento tirava as canceladas (que a lista mostra) e
 *    ignorava período, "Futuros" e função;
 *  - "Reservada" (Hospedagem) lia o primeiro registro da vaga, de qualquer
 *    situação — o cartão "Hotel" das Análises lê a hospedagem válida.
 */
import { describe, it, expect, vi } from "vitest";
import { act } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { Accommodation, TeamInclusion } from "@shared/schema";
import { renderComTudo } from "@/test/render";
import { usuarioFake } from "@/test/fixtures";
import { eventoFake, funcaoFake, hospedagemFake, vagaFake } from "@/test/fixtures-dominio";
import { contarLogistica } from "./scaling-analytics-data";
import { contadoresDasFlags, fazTesteDeFlags } from "./scaling-queue";
import { fazTesteDePeriodo } from "./scaling-period";
import type { ScalingData } from "./use-scaling-data";
import { useScalingFilters, type ScalingFiltersState } from "./scaling-page/use-scaling-filters";
import { useScalingRecorte, type ScalingRecorte } from "./scaling-page/use-scaling-recorte";

vi.mock("./scaling-validation", () => ({ getBulkConfirmBlockReason: () => null }));

const FUTURO = eventoFake({ id: "ev-fut", name: "Corrida Futura", startDate: "2099-03-10", endDate: "2099-03-12" });
const PASSADO = eventoFake({ id: "ev-pas", name: "Corrida Passada", startDate: "2000-03-10", endDate: "2000-03-12" });
const FN_A = funcaoFake({ id: "fn-a", name: "Kit" });
const FN_B = funcaoFake({ id: "fn-b", name: "Hidratação" });

const fut = (over: Partial<TeamInclusion>) => vagaFake({ eventId: FUTURO.id, functionId: FN_A.id, scheduleStartDate: "2099-03-10", scheduleEndDate: "2099-03-12", ...over });
const pas = (over: Partial<TeamInclusion>) => vagaFake({ eventId: PASSADO.id, functionId: FN_A.id, scheduleStartDate: "2000-03-10", scheduleEndDate: "2000-03-12", ...over });

function dadosFake(vagas: TeamInclusion[], accommodations: Accommodation[] = []): ScalingData {
  const eventById = new Map([[FUTURO.id, FUTURO], [PASSADO.id, PASSADO]]);
  const functionById = new Map([[FN_A.id, FN_A], [FN_B.id, FN_B]]);
  const accommodationByInclusion = new Map<string, Accommodation>();
  for (const a of accommodations) if (a.teamInclusionId && !accommodationByInclusion.has(a.teamInclusionId)) accommodationByInclusion.set(a.teamInclusionId, a);
  return {
    teamInclusions: vagas, filteredTeamInclusions: vagas, scalingInclusions: vagas, vagasDasOpcoesDeEvento: vagas,
    eventById, functionById, collaboratorById: new Map(), userFunctionIds: new Set(), isAdminRole: true,
    pendingSwapByInclusion: new Map(), pendingChangeByInclusion: new Map(),
    purchasedTicketByInclusion: new Map(), accommodationByInclusion, accommodations,
    isCenotecnicaFunction: () => false, getResponsavelDaFuncao: () => null,
    getEventName: (id: string | null) => (id && eventById.get(id)?.name) || "Evento não encontrado",
    getFunctionName: (id: string | null) => (id && functionById.get(id)?.name) || "Função não encontrada",
    getCollaboratorName: (id?: string | null) => (id ? "Maria" : "Não escalado"),
    getCollaboratorCity: () => null,
  } as unknown as ScalingData;
}

let filtros: ScalingFiltersState;
let recorte: ScalingRecorte;

function Tela({ data }: { data: ScalingData }) {
  const f = useScalingFilters();
  filtros = f;
  recorte = useScalingRecorte({ data, filtros: f, user: null });
  return null;
}

function montar(vagas: TeamInclusion[], accommodations: Accommodation[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  renderComTudo(<Tela data={dadosFake(vagas, accommodations)} />, { user: usuarioFake({ role: "admin" }), rota: "/scaling", queryClient });
}

const nDoEvento = (id: string) => recorte.opcoesDeEvento.find((o) => o.id === id)?.n;

describe("Escalação — contadores dos filtros batem com a lista (28/10)", () => {
  it("Período: a base do contador já tem o recorte Futuros e a função", () => {
    montar([fut({ id: "f1" }), fut({ id: "f2", functionId: FN_B.id }), pas({ id: "p1" })]);
    act(() => filtros.setFuncoes({ [FN_A.id]: true }));
    // "Qualquer data" com Futuros + Kit: a lista tem 1 vaga; o contador tem que dizer 1.
    const qualquerData = recorte.linhasSemPeriodo.filter(fazTesteDePeriodo(filtros.periodo, filtros.hoje)).length;
    expect(recorte.comPeriodo).toHaveLength(1);
    expect(qualquerData).toBe(1);
  });

  it("Evento: conta as canceladas (a lista mostra) e respeita Futuros e a função", () => {
    montar([
      fut({ id: "f1" }), fut({ id: "f2", status: "cancelado" }), fut({ id: "f3", functionId: FN_B.id }), fut({ id: "f4", functionId: FN_B.id }),
      pas({ id: "p1" }), pas({ id: "p2" }),
    ]);
    act(() => filtros.setFuncoes({ [FN_A.id]: true }));
    expect(nDoEvento(FUTURO.id)).toBe(2);
    // Evento já realizado continua na lista de opções (com 0 em "Futuros").
    expect(nDoEvento(PASSADO.id)).toBe(0);

    act(() => filtros.setEventos({ [FUTURO.id]: true }));
    expect(recorte.visibleRows).toHaveLength(2);

    act(() => filtros.setRecorteEventos("todos"));
    expect(nDoEvento(PASSADO.id)).toBe(2);
  });

  it('"Reservada" conta a mesma hospedagem que o cartão "Hotel" das Análises', () => {
    const comHotel = fut({ id: "h1", needsAccommodation: true });
    const cancelada = fut({ id: "h2", needsAccommodation: true });
    const semHotel = fut({ id: "h3", needsAccommodation: true });
    montar([comHotel, cancelada, semHotel], [
      hospedagemFake({ id: "a1", teamInclusionId: "h1", hotelName: "Hotel Central", hotelStatus: "reservada" }),
      hospedagemFake({ id: "a2", teamInclusionId: "h2", hotelName: "Hotel Velho", hotelStatus: "cancelada" }),
      hospedagemFake({ id: "a3", teamInclusionId: "h3", hotelName: "", hotelStatus: "pendente" }),
    ]);
    const cartao = contarLogistica(recorte.comFlags, recorte.analyticsContext).hoteis.reservados;
    const contador = contadoresDasFlags(recorte.linhasSemFlags, {}, recorte.queueContext)["hosp:reservada"];
    expect(cartao).toBe(1);
    expect(contador).toBe(1);
    expect(recorte.comFlags.filter(fazTesteDeFlags({ "hosp:reservada": true }, recorte.queueContext)).map((i) => i.id)).toEqual(["h1"]);
  });
});
