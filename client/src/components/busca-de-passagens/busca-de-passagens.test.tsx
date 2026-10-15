import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { eventoFake, vagaFake } from "@/test/fixtures-dominio";
import type { RespostaDaBusca, RotaNaTela, ItinerarioDeVoo } from "@shared/busca-de-passagens";
import type { TicketsData } from "@/components/tickets/use-tickets-data";
import { BarraDeSelecao } from "./barra-de-selecao";
import { PainelDeResultados, type AcoesDaRota } from "./painel-de-resultados";
import { RegistroPeloVoo } from "./registro-pelo-voo";

const rota = (chave: string, comResultado: boolean, itinerarios: ItinerarioDeVoo[] = []): RotaNaTela => ({
  chave, perna: "ida", origem: "GRU", destino: "JPA", dataIda: "2026-11-12", dataVolta: null, maxParadas: 1,
  horarioIda: null, horarioVolta: null, vagas: [{ vagaId: "v1", perna: "ida" }], eventoIds: ["e1"], faixaIda: null, faixaVolta: null,
  trechoDireto: false, alternativasDeCasa: ["CGH"], diariaCentavos: null, variantes: null, consultasDoFlex: 2, erro: null,
  resultado: comResultado ? { itinerarios, observadoEm: null, consultadoEm: new Date().toISOString(), doCache: true } : null,
});
const resposta = (rotas: RotaNaTela[]): RespostaDaBusca => ({
  rotas, faltando: [{ vagaId: "v9", tipo: "sem_data_ida", mensagem: "Sem data de ida sugerida." }], gastou: 0,
  consumo: { usadas: 10, teto: 1000, fornecedor: { nome: "simulado", simulado: true }, cacheHoras: 3 },
});
const voo: ItinerarioDeVoo = {
  id: "it-1", precoCentavos: 123456, moeda: "BRL",
  pernas: [{ companhia: "G3", duracaoMin: 200, segmentos: [{ companhia: "G3", numero: "1500", origem: "GRU", destino: "JPA", partida: "2026-11-12T08:00", chegada: "2026-11-12T11:20" }] }],
};

describe("Barra de seleção — prévia de consumo antes de gastar", () => {
  it("diz quantas rotas, quantas no cache e quantas consultas a busca gasta", async () => {
    const onBuscar = vi.fn();
    const { user } = renderComTudo(
      <BarraDeSelecao nSel={4} resposta={resposta([rota("a", true), rota("b", false), rota("c", false)])} previaCarregando={false} erro={null}
        buscando={false} painelAberto={false} bloqueadoPeloTeto={false} naoConfigurada={false} compradas={1}
        onLimpar={vi.fn()} onVerPainel={vi.fn()} onBuscar={onBuscar} />,
    );
    const previa = screen.getByTestId("previa-consumo");
    expect(previa).toHaveTextContent("3 rotas · 1 já em cache · gasta 2 consultas");
    expect(previa).toHaveTextContent("1 escalação com dado faltando fica de fora");
    expect(previa).toHaveTextContent("1 comprada (compara com o pago)");
    await user.click(screen.getByTestId("buscar-precos"));
    expect(onBuscar).toHaveBeenCalledTimes(1);
  });

  it("tudo no cache: \"Ver preços\" sem gastar; no teto ou buscando, o botão trava", () => {
    const { rerender } = renderComTudo(
      <BarraDeSelecao nSel={1} resposta={resposta([rota("a", true)])} previaCarregando={false} erro={null} buscando={false} painelAberto
        bloqueadoPeloTeto={false} naoConfigurada={false} compradas={0} onLimpar={vi.fn()} onVerPainel={vi.fn()} onBuscar={vi.fn()} />,
    );
    expect(screen.getByTestId("previa-consumo")).toHaveTextContent("não gasta consulta");
    expect(screen.getByTestId("buscar-precos")).toHaveTextContent("Ver preços");
    rerender(
      <BarraDeSelecao nSel={1} resposta={resposta([rota("b", false)])} previaCarregando={false} erro={null} buscando={false} painelAberto={false}
        bloqueadoPeloTeto naoConfigurada={false} compradas={0} onLimpar={vi.fn()} onVerPainel={vi.fn()} onBuscar={vi.fn()} />,
    );
    expect(screen.getByTestId("buscar-precos")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("teto de consultas do mês");
  });
});

describe("Painel de resultados", () => {
  const acoes = (): AcoesDaRota => ({ atualizar: vi.fn(), datasFlexiveis: vi.fn(), duasConexoes: vi.fn(), trocarSaida: vi.fn(), consultar: vi.fn(), usar: vi.fn() });
  const vagas = new Map([["v1", { id: "v1", numero: 4045, nome: "Ana Souza", comprada: false, valorPagoCentavos: null }]]);

  it("opção com preço e \"Usar este voo\"; sem resultado sugere 2 conexões (custa 1)", async () => {
    const a = acoes();
    const { user } = renderComTudo(
      <PainelDeResultados aberto onFechar={vi.fn()} resposta={resposta([rota("com", true, [voo]), { ...rota("sem", true, []), origem: "GIG" }])} erro={null}
        buscando={false} chavesEmAndamento={new Set()} vagaPorId={vagas} acoes={a} onBuscarTudo={vi.fn()} previstas={0} />,
    );
    const painel = await screen.findByTestId("painel-resultados");
    expect(within(painel).getByTestId("preco-it-1")).toHaveTextContent("R$ 1.234,56");
    expect(within(painel).getByText("Preços simulados")).toBeInTheDocument();
    await user.click(within(painel).getByTestId("usar-voo-it-1"));
    expect(a.usar).toHaveBeenCalledWith("v1", expect.objectContaining({ chave: "com" }), expect.objectContaining({ itinerario: voo }), expect.anything());
    const duas = within(painel).getByTestId("duas-conexoes-sem");
    expect(duas).toHaveTextContent("1 consulta");
    await user.click(duas);
    expect(a.duasConexoes).toHaveBeenCalled();
    expect(within(painel).getByTestId("flex-com")).toHaveTextContent("2 consultas");
  });
});

describe("\"Usar este voo\" preenche o modal de registro de Passagens", () => {
  it("companhia, aeroportos, datas, horários e valor já nos campos", async () => {
    mockarFetch((url) => {
      if (url.includes("/api/tickets/sinais-de-viagem")) return respostaJson({ porVaga: {}, totais: { viagensQueSeCruzam: 0, passagensComDataImpossivel: 0 } });
      return respostaJson([]);
    });
    const evento = eventoFake({ id: "e1", name: "Makai João Pessoa", location: "Tambaú, João Pessoa - PB", aeroportoIata: "JPA", endDate: "2099-01-01" });
    const vaga = vagaFake({ id: "v1", eventId: "e1", needsTicket: true, city: "São Paulo - SP", status: "escalado" });
    const data = {
      eventById: new Map([[evento.id, evento]]),
      collaboratorById: new Map(),
      getTicket: () => undefined,
      getCollaborator: () => null,
      getCollaboratorName: () => "Ana Souza",
      getFunctionName: () => "Montagem",
      getEventName: () => evento.name,
      getEventLocation: () => evento.location,
      getUserName: () => "Usuário",
      isPurchasingRole: true,
      systemSettings: undefined,
    } as unknown as TicketsData;
    renderComTudo(
      <RegistroPeloVoo data={data} user={usuarioFake({ role: "purchasing" })} vaga={vaga}
        voo={{ itinerario: voo, perna: "ida", chave: "ida|GRU>JPA", vistoEm: "2026-10-09T17:32:00Z" }} onFechar={vi.fn()} />,
      { user: usuarioFake({ role: "purchasing" }) },
    );
    expect(await screen.findByTestId("aviso-voo-da-busca-v1")).toHaveTextContent("GOL · G3 1500 · R$ 1.234,56 visto na busca");
    await waitFor(() => expect(screen.getByTestId("input-departure-airport-v1")).toHaveValue("GRU"));
    expect(screen.getByTestId("input-destination-airport-v1")).toHaveValue("JPA");
    expect(screen.getByTestId("input-departure-date-v1")).toHaveValue("2026-11-12");
    expect(screen.getByTestId("input-departure-time-v1")).toHaveValue("08:00");
    expect(screen.getByTestId("input-arrival-time-v1")).toHaveValue("11:20");
    expect(screen.getByTestId("trecho-so_ida-v1")).toHaveAttribute("aria-checked", "true");
    expect((screen.getByTestId("textarea-ticket-observations-v1") as HTMLTextAreaElement).value).toMatch(/Busca de preços .*GOL — ida G3 1500/);
  });
});
