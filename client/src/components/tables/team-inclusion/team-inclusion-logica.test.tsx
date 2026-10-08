/**
 * Inclusão de equipe — correções de lógica de 08/10:
 *  - "Diárias em lote" só marca/grava a vaga que a pessoa mexeu;
 *  - com vários eventos no filtro, só as vagas DELES são pedidas;
 *  - "Passagem"/"Hospedagem" contam pelo mesmo status que a lista mostra.
 */
import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { TeamInclusion } from "@shared/schema";
import { criarWrapper } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas } from "@/test/fixtures";
import { vagaFake } from "@/test/fixtures-dominio";
import { diasDoLoteMudaram } from "./inclusion-shared";
import { useBulkDays } from "./use-bulk-days";
import { passaNoRecorte, statusDoRecorte, useTeamInclusionData, type InclusionFilters } from "./use-team-inclusion-data";

const SEM_FILTRO: InclusionFilters = { eventId: [], functionId: [], collaboratorId: [], status: [], escalationStatus: [], searchId: "" };

describe("diárias em lote — 'alterada' só quando os dias mudaram", () => {
  it("compara com os dias com que o diálogo abriu, não com o salvo", () => {
    expect(diasDoLoteMudaram(["2026-04-10", "2026-04-11"], ["2026-04-11", "2026-04-10"])).toBe(false);
    expect(diasDoLoteMudaram(["2026-04-10"], ["2026-04-10", "2026-04-11"])).toBe(true);
    expect(diasDoLoteMudaram(["2026-04-10", "2026-04-11"], ["2026-04-10"])).toBe(true);
  });

  function montarLote(vagas: TeamInclusion[]) {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    const { Wrapper } = criarWrapper();
    const data = {
      inclusionById: new Map(vagas.map((v) => [v.id, v])),
      selectedRows: new Set<string>(),
      filteredAndSortedInclusions: vagas,
      isEventLocked: () => false,
    };
    const hook = renderHook(() => useBulkDays(data), { wrapper: Wrapper });
    return { ...hook, fetchMock };
  }

  it("abrir e salvar sem mexer: nenhuma vaga alterada, nenhum PATCH (nem a sem dias salvos ou com diárias legadas)", () => {
    const semDias = vagaFake({ id: "sem-dias", workDays: [], dailyRates: 0 });
    const legado = vagaFake({ id: "legado", dailyRates: 5 }); // 3 dias salvos, 5 diárias antigas
    const { result, fetchMock } = montarLote([semDias, legado]);
    act(() => result.current.openBatchDiarias());
    expect(result.current.changedIds.size).toBe(0);
    act(() => result.current.handleSaveBatchDiarias());
    expect(urlsChamadas(fetchMock).filter((u) => u.includes("/api/team-inclusions/"))).toEqual([]);
  });

  it("mexeu numa vaga: só ela fica alterada e só ela vai no PATCH", async () => {
    const a = vagaFake({ id: "a" });
    const b = vagaFake({ id: "b", workDays: [], dailyRates: 0 });
    const { result, fetchMock } = montarLote([a, b]);
    act(() => result.current.openBatchDiarias());
    act(() => result.current.toggleBatchDay("a", "2026-04-12"));
    expect(Array.from(result.current.changedIds)).toEqual(["a"]);
    // Desfazer a mudança volta a "não alterada".
    act(() => result.current.toggleBatchDay("a", "2026-04-12"));
    expect(result.current.changedIds.size).toBe(0);
    act(() => result.current.toggleBatchDay("a", "2026-04-12"));
    act(() => result.current.handleSaveBatchDiarias());
    await waitFor(() => expect(urlsChamadas(fetchMock).filter((u) => u.includes("/api/team-inclusions/"))).toEqual(["/api/team-inclusions/a"]));
  });
});

describe("contagem de Passagem/Hospedagem = o status que a lista mostra", () => {
  it("vaga escalada que precisa de passagem conta (e filtra) como 'Aguardando passagem'", () => {
    const escalada = vagaFake({ status: "escalado", needsTicket: true });
    const hosp = vagaFake({ status: "escalado", needsAccommodation: true });
    expect(statusDoRecorte(escalada)).toBe("passagem");
    expect(statusDoRecorte(hosp)).toBe("hospedagem");
    expect(statusDoRecorte(vagaFake({ status: "passagem_comprada" }))).toBe("passagem_comprada");
    expect(passaNoRecorte(escalada, { ...SEM_FILTRO, status: ["passagem"] })).toBe(true);
    expect(passaNoRecorte(vagaFake({ status: "escalado" }), { ...SEM_FILTRO, status: ["passagem"] })).toBe(false);
  });

  it("resumo e lista do hook batem", async () => {
    const vagas = [
      vagaFake({ status: "passagem" }),
      vagaFake({ status: "escalado", needsTicket: true }),
      vagaFake({ status: "escalado" }),
    ];
    mockarFetch((url) => respostaJson(url.startsWith("/api/team-inclusions") ? vagas : [], 200, url));
    const { Wrapper } = criarWrapper();
    const { result } = renderHook(() => useTeamInclusionData(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.teamInclusions).toHaveLength(3));
    expect(result.current.totals.aguardando_passagem).toBe(2);
    act(() => result.current.setFilters((f) => ({ ...f, status: ["passagem"] })));
    expect(result.current.filteredAndSortedInclusions).toHaveLength(2);
    expect(result.current.opcoesDosFiltros.status.find((o) => o.id === "passagem")?.n).toBe(2);
  });
});

describe("lista: com eventos no filtro, só as vagas deles são pedidas", () => {
  it("dois eventos marcados → um GET por evento (?eventId=), nunca a lista inteira", async () => {
    const porEvento: Record<string, TeamInclusion[]> = {
      "ev-a": [vagaFake({ eventId: "ev-a" })],
      "ev-b": [vagaFake({ eventId: "ev-b" }), vagaFake({ eventId: "ev-b" })],
    };
    const fetchMock = mockarFetch((url) => {
      const ev = new URL(url, "http://x").searchParams.get("eventId");
      return respostaJson(url.startsWith("/api/team-inclusions") ? (ev ? porEvento[ev] ?? [] : []) : [], 200, url);
    });
    const { Wrapper } = criarWrapper();
    const { result } = renderHook(() => useTeamInclusionData(), { wrapper: Wrapper });
    act(() => result.current.setFilters((f) => ({ ...f, eventId: ["ev-a", "ev-b"] })));
    await waitFor(() => expect(result.current.teamInclusions).toHaveLength(3));
    const pedidos = urlsChamadas(fetchMock).filter((u) => u.startsWith("/api/team-inclusions"));
    expect(pedidos).toContain("/api/team-inclusions?eventId=ev-a");
    expect(pedidos).toContain("/api/team-inclusions?eventId=ev-b");
    // A lista inteira só foi pedida no primeiro render (sem filtro), não depois.
    expect(pedidos.filter((u) => u === "/api/team-inclusions").length).toBeLessThanOrEqual(1);
    expect(result.current.filteredAndSortedInclusions).toHaveLength(3);
  });
});
