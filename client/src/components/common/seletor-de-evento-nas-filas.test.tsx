/**
 * Seletor de evento com um evento já escolhido (28/10, dono) — nas telas.
 *
 * Com evento escolhido a lista vem só dele (`?eventId=`): os outros eventos
 * apareciam com 0 (Hospedagem, Inclusão de equipe). Agora aparecem SEM
 * número, e o escolhido continua com o dele — sem pedir a lista inteira.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { renderComTudo, criarWrapper } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { colaboradorFake, eventoFake, funcaoFake, vagaFake } from "@/test/fixtures-dominio";
import { useTeamInclusionData } from "@/components/tables/team-inclusion/use-team-inclusion-data";
import Accommodations from "@/pages/accommodations";

beforeEach(() => { localStorage.clear(); });

const eventoA = eventoFake({ id: "ev-a", name: "Circuito das Estações", startDate: "2099-10-09", endDate: "2099-10-11", status: "ativo" });
const eventoB = eventoFake({ id: "ev-b", name: "Night Run Porto Alegre", startDate: "2099-11-07", endDate: "2099-11-08", status: "ativo" });
const vagaA = vagaFake({ id: "v-a", inclusionNumber: 50, eventId: "ev-a", functionId: "f1", collaboratorId: "c1", needsAccommodation: true, status: "escalado", phase: "escalacao" });
const vagaB = vagaFake({ id: "v-b", inclusionNumber: 77, eventId: "ev-b", functionId: "f1", collaboratorId: "c1", needsAccommodation: true, status: "escalado", phase: "escalacao" });

function api() {
  return mockarFetch((url) => {
    const [caminho, qs = ""] = url.split("?");
    const ev = new URLSearchParams(qs).get("eventId");
    switch (caminho) {
      case "/api/team-inclusions": return respostaJson(ev ? [vagaA, vagaB].filter((v) => v.eventId === ev) : [vagaA, vagaB], 200, url);
      case "/api/events": return respostaJson([eventoA, eventoB]);
      case "/api/functions": return respostaJson([funcaoFake({ id: "f1", name: "Cenotécnica" })]);
      case "/api/collaborators": return respostaJson([colaboradorFake({ id: "c1", fullName: "Luana Cardoso" })]);
      default: return respostaJson([]);
    }
  });
}

describe("Hospedagem — seletor de evento com um evento escolhido", () => {
  it("o escolhido mostra o número; o outro aparece sem número (nem 0)", async () => {
    const fetchMock = api();
    const { user } = renderComTudo(<Accommodations />, { user: usuarioFake({ role: "purchasing" }), queryClient: criarQueryClientComApi(), rota: "/accommodations" });
    await user.click(await screen.findByTestId("filter-event"));
    await user.click(await screen.findByTestId("filter-event-opcao-ev-a"));
    await waitFor(() => expect(urlsChamadas(fetchMock)).toContain("/api/team-inclusions?eventId=ev-a"));
    await user.click(screen.getByTestId("filter-event"));
    await waitFor(() => expect(screen.getByTestId("filter-event-opcao-ev-a")).toHaveTextContent(/1$/));
    const outro = screen.getByTestId("filter-event-opcao-ev-b");
    expect(outro).toHaveTextContent(/^Night Run Porto Alegre$/);
    expect(outro.querySelector(".tabular-nums")).toBeNull();
  });
});

describe("Inclusão de equipe — seletor de evento com evento marcado", () => {
  it("o marcado conta as vagas dele; o outro vem sem número (nem 0); sem marcar, todos com número", async () => {
    api();
    const { Wrapper } = criarWrapper({ queryClient: criarQueryClientComApi() });
    const { result } = renderHook(() => useTeamInclusionData(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.opcoesDosFiltros.eventos.map((o) => o.n)).toEqual([1, 1]));
    act(() => result.current.setFilters((f) => ({ ...f, eventId: ["ev-a"] })));
    await waitFor(() => expect(result.current.teamInclusions?.map((i) => i.id)).toEqual(["v-a"]));
    expect(result.current.opcoesDosFiltros.eventos).toEqual([
      { id: "ev-a", nome: "Circuito das Estações", n: 1 },
      { id: "ev-b", nome: "Night Run Porto Alegre", n: null },
    ]);
  });
});
