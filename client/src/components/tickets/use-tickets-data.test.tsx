/**
 * Passagens: os números da fila e dos filtros batem com a lista (28/10).
 *
 *  - Com um bloco da fila aceso ("Comprar"), os outros blocos caíam para 0:
 *    os KPIs eram contados sobre a lista JÁ cortada pelo próprio bloco.
 *  - O "de M" do rodapé era a lista base antes de juntar as duplicadas — sem
 *    filtro nenhum dizia "Mostrando 2 de 3".
 *  - Os contadores dos popovers não sabiam da regra "passagem registrada
 *    continua na lista" (vaga só salva, com passagem).
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { TeamInclusion } from "@shared/schema";
import { criarWrapper } from "@/test/render";
import { usuarioFake } from "@/test/fixtures";
import { colaboradorFake, eventoFake, funcaoFake, passagemFake, vagaFake } from "@/test/fixtures-dominio";
import { SWAP_REQUESTS_QUERY_KEY } from "@/hooks/use-swap-requests";
import { DEFAULT_TICKET_FILTERS, type TicketFilters } from "./types";
import { contarPorOpcao } from "./tickets-filtering";
import { useTicketsData } from "./use-tickets-data";

const EV = eventoFake({ id: "ev1", name: "Corrida", startDate: "2099-05-01", endDate: "2099-05-02" });
const FN = funcaoFake({ id: "fn1", name: "Kit" });
const C1 = colaboradorFake({ id: "c1", fullName: "Ana" });
const C2 = colaboradorFake({ id: "c2", fullName: "Bia" });
const C3 = colaboradorFake({ id: "c3", fullName: "Caio" });

const base = { eventId: EV.id, functionId: FN.id, needsTicket: true, scheduleStartDate: "2099-05-01", scheduleEndDate: "2099-05-02" };
const comprada = vagaFake({ ...base, id: "v-comp", inclusionNumber: 1, collaboratorId: "c1", status: "escalado" });
const pendente = vagaFake({ ...base, id: "v-pend", inclusionNumber: 2, collaboratorId: "c2", status: "escalado" });
/** A mesma pessoa, evento e função duas vezes: a lista junta numa linha só. */
const duplicada = vagaFake({ ...base, id: "v-dup", inclusionNumber: 3, collaboratorId: "c2", status: "escalado" });
/** Só salva (não confirmada), mas já com passagem registrada: continua na lista (15/09). */
const salvaComPassagem = vagaFake({ ...base, id: "v-salva", inclusionNumber: 4, collaboratorId: "c3", status: "planejado" });

function montar(filters: Partial<TicketFilters> = {}, vagas: TeamInclusion[] = [comprada, pendente, duplicada, salvaComPassagem]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  queryClient.setQueryData(["/api/team-inclusions"], vagas);
  queryClient.setQueryData(["/api/events"], [EV]);
  queryClient.setQueryData(["/api/functions"], [FN]);
  queryClient.setQueryData(["/api/collaborators"], [C1, C2, C3]);
  queryClient.setQueryData(["/api/tickets"], [
    passagemFake({ id: "t1", teamInclusionId: comprada.id, actualArrivalTime: "10:00" }),
    passagemFake({ id: "t2", teamInclusionId: salvaComPassagem.id, actualArrivalTime: "10:00" }),
  ]);
  queryClient.setQueryData(["/api/tickets", "historico", { eventId: "todos" }], []);
  queryClient.setQueryData(["/api/tickets", "terrestres"], []);
  queryClient.setQueryData(["/api/accommodations"], []);
  queryClient.setQueryData(["/api/users"], []);
  queryClient.setQueryData([...SWAP_REQUESTS_QUERY_KEY], []);
  const { Wrapper } = criarWrapper({ user: usuarioFake({ role: "admin" }), queryClient });
  const f = { ...DEFAULT_TICKET_FILTERS, ...filters };
  return renderHook(() => useTicketsData({ filters: f, showOnlyPendingSwaps: false, sortConfig: null, user: usuarioFake({ role: "admin" }) }), { wrapper: Wrapper }).result;
}

describe("Passagens — fila, rodapé e contadores (28/10)", () => {
  it('com "Comprar" aceso, o bloco "Compradas" continua contando as compradas', () => {
    const r = montar({ ticketStatus: "pending" });
    expect(r.current.filteredTicketInclusions.map((i) => i.id)).toEqual(["v-dup"]);
    expect(r.current.kpis.aguardando).toBe(1);
    expect(r.current.kpis.compradas).toBe(2);
  });

  it('o "de M" é o universo sem filtro (já sem as duplicadas)', () => {
    const r = montar();
    expect(r.current.filteredTicketInclusions).toHaveLength(3);
    expect(r.current.totalSemRecorte).toBe(3);
  });

  it("o contador do evento conta a vaga só salva que já tem passagem — como a lista", () => {
    const r = montar();
    const n = contarPorOpcao(r.current.teamInclusions ?? [], { ...DEFAULT_TICKET_FILTERS }, "eventId", r.current.contextoDosFiltros, r.current.completarPipeline);
    expect(n.get(EV.id)).toBe(r.current.filteredTicketInclusions.length);
  });
});
