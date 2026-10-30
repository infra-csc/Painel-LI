/**
 * Painéis de passagens e de hospedagem (30/10) — a tela com os dados das
 * MESMAS rotas das telas de trabalho (nenhuma rota nova), os estados e os
 * links que levam à tela de trabalho já filtrada.
 */
import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake } from "@/test/fixtures";
import PainelDePassagens from "./painel-de-passagens";
import PainelDeHospedagem from "../hospedagem/painel-de-hospedagem";

const compras = usuarioFake({ id: "compras-1", role: "purchasing" });

const iso = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Evento informado com dia do evento: daqui a 20 dias (D-37 venceu há 17; D-30 há 10).
const EVENTOS = [
  { id: "ev-1", name: "Corrida com um nome bem comprido para testar o corte do texto na linha", startDate: iso(18), endDate: iso(20), diaEventoInicio: iso(20), diaEventoFim: iso(20), status: "planejado" },
  { id: "ev-2", name: "Maratona Tranquila", startDate: iso(80), endDate: iso(80), diaEventoInicio: iso(80), diaEventoFim: iso(80), status: "planejado" },
];
const FUNCOES = [{ id: "f1", name: "Produção" }];
const vaga = (id: string, eventId: string, over: Record<string, unknown> = {}) => ({
  id, inclusionNumber: Number(id.replace(/\D/g, "")) || 1, eventId, functionId: "f1", collaboratorId: `c-${id}`, status: "escalado",
  phase: "inclusao", deletedAt: null, needsTicket: true, needsAccommodation: true, scheduleStartDate: eventId === "ev-1" ? iso(18) : iso(79), scheduleEndDate: eventId === "ev-1" ? iso(20) : iso(80), ...over,
});
const VAGAS = [vaga("v1", "ev-1"), vaga("v2", "ev-1"), vaga("v3", "ev-1", { collaboratorId: null, status: "planejado" }), vaga("v4", "ev-2")];
const PASSAGENS = [{ id: "t1", teamInclusionId: "v2", purchaseDate: iso(-3), value: 120_000, transportType: "aereo", departureAirport: "GRU", destinationAirport: "SSA", returnOriginAirport: "SSA", returnDestinationAirport: "GRU", actualDepartureDate: iso(18), actualReturnDate: iso(21), ticketCompany: "GOL", archivedAt: null }];
const HOSPEDAGENS = [{ id: "h1", teamInclusionId: "v1", hotelName: "Hotel Farol", hotelStatus: "reservada", roomType: "double", nightsCount: 3, totalCents: 90_000 }];

function montar(tela: "passagens" | "hospedagem", rotas: Partial<Record<string, () => Response>> = {}, rota = `/paineis/${tela}`) {
  const fetchMock = mockarFetch((url) => {
    const caminho = url.split("?")[0];
    const r = rotas[caminho];
    if (r) return r();
    if (caminho === "/api/team-inclusions") return respostaJson(VAGAS);
    if (caminho === "/api/events") return respostaJson(EVENTOS);
    if (caminho === "/api/functions") return respostaJson(FUNCOES);
    if (caminho === "/api/tickets") return respostaJson(PASSAGENS);
    if (caminho === "/api/tickets/historico") return respostaJson([]);
    if (caminho === "/api/accommodations") return respostaJson(HOSPEDAGENS);
    return respostaJson({});
  });
  const utils = renderComTudo(tela === "passagens" ? <PainelDePassagens /> : <PainelDeHospedagem />, { user: compras, rota });
  return { ...utils, fetchMock };
}

describe("Painel de passagens", () => {
  it("fora do prazo, emitidas × não emitidas e o link para Passagens filtrada", async () => {
    const { fetchMock } = montar("passagens");
    expect(screen.getByTestId("painel-carregando")).toBeInTheDocument();
    expect(await screen.findByTestId("kpi-fora-do-prazo")).toHaveTextContent("1");
    expect(screen.getByTestId("kpi-emitidas")).toHaveTextContent("25%"); // 1 de 4 (3 no ev-1 + 1 no ev-2)

    const linha = screen.getByTestId("fora-passagem-ev-1");
    expect(linha).toHaveTextContent("17 dias atrasado");
    expect(linha).toHaveTextContent("1 a emitir");
    expect(linha).toHaveTextContent("1 esperando a escala");
    expect(within(linha).getByTestId("abrir-passagem-ev-1")).toHaveAttribute("href", "/tickets?event=ev-1&status=pending");
    // O evento com folga não está fora do prazo, mas está nas barras.
    expect(screen.queryByTestId("fora-passagem-ev-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("cobertura-passagem-ev-2")).toHaveTextContent("0/1");
    // Nenhuma rota nova: as mesmas listas das telas de trabalho (sem /api/tickets/analises, que é só admin).
    const urls = urlsChamadas(fetchMock).map((u) => u.split("?")[0]);
    expect(urls).not.toContain("/api/tickets/analises");
    expect(urls).toEqual(expect.arrayContaining(["/api/team-inclusions", "/api/tickets", "/api/events"]));
  });

  it("comparação de preços: a rota da passagem com média", async () => {
    montar("passagens", {}, "/paineis/passagens?pr_periodo=tudo");
    const tabela = await screen.findByTestId("precos-tabela-rota");
    expect(tabela).toHaveTextContent("GRU ⇄ SSA");
    expect(tabela).toHaveTextContent("R$ 1.200");
  });

  it("erro com 'Tentar de novo'", async () => {
    montar("passagens", { "/api/events": () => respostaJson({ message: "Banco fora do ar" }, 500) });
    expect(await screen.findByTestId("painel-erro")).toBeInTheDocument();
    expect(screen.getByTestId("painel-tentar-de-novo")).toBeInTheDocument();
  });

  it("filtro de evento sem nada: estado vazio com Limpar filtros", async () => {
    montar("passagens", {}, "/paineis/passagens?evento=nao-existe");
    expect(await screen.findByTestId("painel-sem-eventos")).toBeInTheDocument();
    expect(screen.getByTestId("painel-vazio-limpar")).toBeInTheDocument();
  });
});

describe("Painel de hospedagem", () => {
  it("hotéis fora do prazo levam ao Espelho; room nights do Duplo", async () => {
    montar("hospedagem", {}, "/paineis/hospedagem?ho_periodo=tudo");
    const linha = await screen.findByTestId("fora-hotel-ev-1");
    expect(linha).toHaveTextContent("10 dias atrasado");
    expect(within(linha).getByTestId("abrir-hotel-ev-1")).toHaveAttribute("href", "/accommodations?event=ev-1");
    expect(screen.getByTestId("kpi-registradas")).toHaveTextContent("25%");
    // Duplo, 3 noites, 1 pessoa registrada → 1,5 room night e 3 pessoa-noites.
    expect(screen.getByTestId("hoteis-totais")).toHaveTextContent("1,5 room nights · 3 pessoa-noites");
  });
});
