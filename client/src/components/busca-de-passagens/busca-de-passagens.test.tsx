import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { eventoFake, vagaFake } from "@/test/fixtures-dominio";
import type { RespostaDaBusca, RotaNaTela, ItinerarioDeVoo } from "@shared/busca-de-passagens";
import type { TicketsData } from "@/components/tickets/use-tickets-data";
import { BarraDeSelecao } from "./barra-de-selecao";
import { RotaEscolhida } from "./resultados/rota-escolhida";
import type { AcoesDaRota } from "./resultados/acoes-que-gastam";
import { FILTROS_DAS_OPCOES_PADRAO } from "./resultados/estado-dos-resultados";
import { RegistroPeloVoo } from "./registro-pelo-voo";
import { BarraDeFiltrosDaBusca } from "./barra-de-filtros-da-busca";
import { FILTROS_PADRAO } from "./filtros-da-busca";
import { EventosAConfirmar, SeloDeAeroportoSugerido } from "./aeroportos-do-evento";

const rota = (chave: string, comResultado: boolean, itinerarios: ItinerarioDeVoo[] = []): RotaNaTela => ({
  chave, perna: "ida", origem: "GRU", destino: "JPA", dataIda: "2026-11-12", dataVolta: null, maxParadas: 1,
  horarioIda: null, horarioVolta: null, vagas: [{ vagaId: "v1", perna: "ida" }], eventoIds: ["e1"], faixaIda: null, faixaVolta: null,
  trechoDireto: false, alternativasDeCasa: ["CGH"], alternativasDoEvento: [], semHorario: false, vagasComMala: 0, diariaCentavos: null, variantes: null, consultasDoFlex: 2, erro: null,
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
        buscando={false} bloqueadoPeloTeto={false} naoConfigurada={false} compradas={1}
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
      <BarraDeSelecao nSel={1} resposta={resposta([rota("a", true)])} previaCarregando={false} erro={null} buscando={false}
        bloqueadoPeloTeto={false} naoConfigurada={false} compradas={0} onLimpar={vi.fn()} onVerPainel={vi.fn()} onBuscar={vi.fn()} />,
    );
    expect(screen.getByTestId("previa-consumo")).toHaveTextContent("não gasta consulta");
    expect(screen.getByTestId("buscar-precos")).toHaveTextContent("Ver preços");
    rerender(
      <BarraDeSelecao nSel={1} resposta={resposta([rota("b", false)])} previaCarregando={false} erro={null} buscando={false}
        bloqueadoPeloTeto naoConfigurada={false} compradas={0} onLimpar={vi.fn()} onVerPainel={vi.fn()} onBuscar={vi.fn()} />,
    );
    expect(screen.getByTestId("buscar-precos")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("teto de consultas do mês");
  });
});

describe("Rota aberta na tela de resultados", () => {
  const acoes = (): AcoesDaRota => ({ atualizar: vi.fn(), datasFlexiveis: vi.fn(), duasConexoes: vi.fn(), trocarSaida: vi.fn(), consultar: vi.fn(), usar: vi.fn() });
  const vagas = [{ id: "v1", numero: 4045, nome: "Ana Souza", comprada: false, valorPagoCentavos: null }];
  const abrir = (r: RotaNaTela, a: AcoesDaRota) => renderComTudo(
    <RotaEscolhida rota={r} vagas={vagas} acoes={a} ocupado={false} carregandoEsta={false} simulado filtros={FILTROS_DAS_OPCOES_PADRAO} onFiltros={vi.fn()} />,
  );

  it("opção com preço e \"Usar este voo\"; as ações que gastam dizem quanto", async () => {
    const a = acoes();
    const { user } = abrir(rota("com", true, [voo]), a);
    expect(await screen.findByTestId("preco-it-1")).toHaveTextContent("R$ 1.234,56");
    await user.click(screen.getByTestId("usar-voo-it-1"));
    expect(a.usar).toHaveBeenCalledWith("v1", expect.objectContaining({ chave: "com" }), expect.objectContaining({ itinerario: voo }), expect.anything());
    expect(screen.getByTestId("flex-com")).toHaveTextContent("2 consultas");
    expect(screen.getByTestId("duas-conexoes-com")).toHaveTextContent("1 consulta");
    expect(screen.getByTestId("atualizar-com")).toHaveTextContent("1 consulta");
  });

  it("sem voo: explica o porquê e oferece as saídas com o custo de cada uma", async () => {
    const a = acoes();
    const { user } = abrir({ ...rota("sem", true, []), origem: "GIG" }, a);
    const vazio = await screen.findByTestId("sem-voos-sem");
    expect(vazio).toHaveTextContent("Nenhum voo com estes filtros");
    expect(vazio).toHaveTextContent("GIG → JPA");
    expect(vazio).toHaveTextContent("com no máximo 1 conexão");
    const duas = within(vazio).getByTestId("duas-conexoes-sem");
    expect(duas).toHaveTextContent("1 consulta");
    await user.click(duas);
    expect(a.duasConexoes).toHaveBeenCalled();
    // A mesma saída não se repete na coluna lateral.
    expect(screen.getAllByTestId("duas-conexoes-sem")).toHaveLength(1);
  });

  it("\"Abrir na companhia\" nunca abre agência; o menu compara nos confiáveis e deixa o Kiwi no fim, em reais (16/10)", async () => {
    const fetchMock = mockarFetch((url) => {
      if (url.includes("/api/busca-de-passagens/link")) {
        return respostaJson({
          doCache: false,
          links: [
            { nome: "Kiwi.com", url: "https://www.kiwi.com/en/booking?token=t&currency=EUR", tipo: "third_party", vooExato: true, precoCentavos: 61974, moeda: "EUR" },
            { nome: "Decolar", url: "https://www.decolar.com/checkout/x", tipo: "third_party", vooExato: true, precoCentavos: 210000, moeda: "BRL" },
          ],
        });
      }
      return respostaJson([]);
    });
    const janela = { opener: {}, location: { href: "" }, close: vi.fn() };
    const abrirJanela = vi.spyOn(window, "open").mockReturnValue(janela as unknown as Window);
    const { user } = abrir(rota("com", true, [voo]), acoes());

    await user.click(await screen.findByTestId("outros-sites-it-1"));
    const menu = await screen.findByTestId("menu-outros-sites-it-1");
    expect(menu).toHaveTextContent("Comparar em");
    expect(within(menu).getByTestId("confiavel-it-1-Google Voos")).toHaveAttribute("href", expect.stringContaining("curr=BRL"));
    expect(within(menu).getByTestId("confiavel-it-1-Decolar")).toHaveTextContent("ver preço no site");
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(menu).getByTestId("carregar-outros-sites-it-1"));
    const kiwi = await within(menu).findByTestId("outro-site-it-1-0");
    expect(kiwi).toHaveTextContent("agência — pode cobrar taxa própria");
    expect(kiwi).toHaveTextContent("preço pode variar");
    expect(kiwi.getAttribute("href")).toContain("currency=BRL");
    expect(within(menu).getByTestId("confiavel-it-1-Decolar")).toHaveTextContent("R$ 2.100,00");
    expect(menu.textContent!.indexOf("Comparar em")).toBeLessThan(menu.textContent!.indexOf("menos conhecidos"));

    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("abrir-companhia-it-1"));
    await waitFor(() => expect(janela.location.href).toMatch(/^https:\/\/b2c\.voegol\.com\.br\/compra\/busca-parceiros\?pv=br/));
    expect(janela.location.href).toContain("de=GRU&para=JPA&ida=12-11-2026");
    // Os links já pedidos não são pedidos de novo.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    abrirJanela.mockRestore();
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

describe("\"Incluir eventos passados\" (15/10)", () => {
  const barra = (filtros = FILTROS_PADRAO, onChange = vi.fn()) => renderComTudo(
    <BarraDeFiltrosDaBusca filtros={filtros} onChange={onChange} eventos={[]} saidas={[]} destinos={[]} funcoes={[]} count={3} total={3} />,
  );

  it("vem desligado; ligar pede o histórico (passados=true) sem mexer no resto", async () => {
    const onChange = vi.fn();
    const { user } = barra({ ...FILTROS_PADRAO, situacao: "compradas" }, onChange);
    const chave = screen.getByRole("switch", { name: /Incluir eventos passados/ });
    expect(chave).toHaveAttribute("aria-checked", "false");
    await user.click(chave);
    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_PADRAO, situacao: "compradas", passados: true });
  });

  it("ligado: etiqueta \"Com eventos passados\" removível; desligar volta ao padrão", async () => {
    const onChange = vi.fn();
    const { user } = barra({ ...FILTROS_PADRAO, passados: true }, onChange);
    expect(screen.getByRole("switch", { name: /Incluir eventos passados/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Com eventos passados")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: /Incluir eventos passados/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...FILTROS_PADRAO, passados: false });
  });
});

describe("Aeroporto do evento: uma vez por evento, num lugar só (15/10)", () => {
  it("faixa lista cada evento uma vez; o de vários aeroportos já busca com o principal e abre a confirmação com ele marcado", async () => {
    const { user } = renderComTudo(
      <EventosAConfirmar podeCorrigir eventos={[
        { eventId: "ev-x", nome: "Corrida da Ilha", local: "Arena Multiuso", sugerido: null, sugestoes: [], escalacoes: 3, primeiraData: "2026-11-10" },
        { eventId: "ev-bh", nome: "Circuito das Estações - Verão - Belo Horizonte - 2026", local: "", sugerido: "CNF", sugestoes: ["CNF", "PLU"], escalacoes: 12, primeiraData: "2026-11-12" },
      ]} />,
    );
    const faixa = screen.getByTestId("eventos-a-confirmar");
    expect(faixa).toHaveTextContent("2 eventos com o aeroporto a confirmar");
    expect(faixa).toHaveTextContent("1 evento sem cidade reconhecida espera o aeroporto para buscar");
    expect(within(screen.getByTestId("evento-a-confirmar-ev-bh")).getByText(/usando/)).toHaveTextContent("usando CNF · ou PLU");
    expect(within(screen.getByTestId("evento-a-confirmar-ev-x")).getByText("aguardando o aeroporto")).toBeInTheDocument();
    await user.click(screen.getByTestId("confirmar-aeroporto-ev-bh"));
    expect(await screen.findByRole("radio", { name: /CNF/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /PLU/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("input-aeroporto-evento")).toHaveValue("CNF");
  });

  it("selo \"sugerido · trocar\" abre a troca (que grava no evento) com o sugerido marcado", async () => {
    const { user } = renderComTudo(<SeloDeAeroportoSugerido vagaId="v1" eventId="ev-the" nomeDoEvento="Corrida Teresina" iata="THE" opcoes={["THE"]} podeCorrigir />);
    const selo = screen.getByTestId("aeroporto-sugerido-v1");
    expect(selo).toHaveAccessibleName("Aeroporto sugerido: THE. Trocar o aeroporto do evento");
    await user.click(selo);
    expect(await screen.findByTestId("input-aeroporto-evento")).toHaveValue("THE");
    expect(screen.getByText(/o único aeroporto da cidade do evento/)).toBeInTheDocument();
    await user.clear(screen.getByTestId("input-aeroporto-evento"));
    await user.type(screen.getByTestId("input-aeroporto-evento"), "slz");
    expect(screen.getByTestId("confirmar-aeroporto-evento")).toHaveTextContent("Trocar e salvar no evento");
  });
});
