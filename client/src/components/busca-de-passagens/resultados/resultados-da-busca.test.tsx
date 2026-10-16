/**
 * Tela de RESULTADOS da busca (16/10): a lista leva para ela, os filtros dela
 * não chamam a API, "Usar este voo" abre o registro e "Voltar às escalações"
 * devolve a seleção.
 */
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { Route, Switch } from "wouter";
import { renderComTudo } from "@/test/render";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { eventoFake, vagaFake } from "@/test/fixtures-dominio";
import type { ItinerarioDeVoo, PedidoDaBusca, RespostaDaBusca, RotaNaTela } from "@shared/busca-de-passagens";
import BuscaDePassagens from "@/pages/busca-de-passagens";
import ResultadosDaBusca from "@/pages/resultados-da-busca";

const compras = usuarioFake({ id: "u-compras", role: "purchasing" });
const evento = eventoFake({ id: "e1", name: "Makai João Pessoa", location: "Tambaú, João Pessoa - PB", aeroportoIata: "JPA", startDate: "2099-11-13", endDate: "2099-11-15" });
const vaga = vagaFake({
  id: "v1", inclusionNumber: 4045, eventId: "e1", functionId: "f1", collaboratorId: "c1", needsTicket: true, city: "São Paulo - SP", status: "escalado",
  flightDepartureDate: "2099-11-12", flightReturnDate: "2099-11-16", scheduleStartDate: "2099-11-13", scheduleEndDate: "2099-11-15",
});
const voo = (id: string, cia: string, preco: number, paradas = 0): ItinerarioDeVoo => ({
  id, precoCentavos: preco, moeda: "BRL",
  pernas: [{
    companhia: cia, duracaoMin: 200,
    segmentos: Array.from({ length: paradas + 1 }, (_, i) => ({ companhia: cia, numero: `${1500 + i}`, origem: i ? "REC" : "GRU", destino: i === paradas ? "JPA" : "REC", partida: `2099-11-12T0${8 + i}:00`, chegada: `2099-11-12T0${8 + i}:50` })),
  }],
});
const rota = (comPreco: boolean): RotaNaTela => ({
  chave: "ida|GRU>JPA|2099-11-12|-|p1|-|-", perna: "ida", origem: "GRU", destino: "JPA", dataIda: "2099-11-12", dataVolta: null, maxParadas: 1,
  horarioIda: null, horarioVolta: null, vagas: [{ vagaId: "v1", perna: "ida" }], eventoIds: ["e1"], faixaIda: null, faixaVolta: null,
  trechoDireto: false, alternativasDeCasa: [], alternativasDoEvento: [], semHorario: false, vagasComMala: 0, diariaCentavos: null, variantes: null, consultasDoFlex: 2, erro: null,
  resultado: comPreco ? { itinerarios: [voo("it-la", "LA", 98000), voo("it-g3", "G3", 87000, 1)], observadoEm: null, consultadoEm: new Date().toISOString(), doCache: false } : null,
});
const resposta = (comPreco: boolean): RespostaDaBusca => ({
  rotas: [rota(comPreco)], faltando: [], gastou: comPreco ? 1 : 0, consumo: { usadas: 10, teto: 1000, fornecedor: { nome: "simulado", simulado: true }, cacheHoras: 3 },
});

/** Servidor falso: a prévia volta sem preço até alguém mandar consultar. */
function servidor() {
  const pedidos: PedidoDaBusca[] = [];
  let consultado = false;
  const fetchMock = mockarFetch((url, init) => {
    const caminho = url.split("?")[0];
    if (caminho === "/api/busca-de-passagens" && init?.method === "POST") {
      const corpo = JSON.parse(String(init.body)) as PedidoDaBusca;
      pedidos.push(corpo);
      if (corpo.consultar?.length) consultado = true;
      return respostaJson(resposta(consultado));
    }
    if (caminho.startsWith("/api/team-inclusions")) return respostaJson([vaga]);
    if (caminho === "/api/events") return respostaJson([evento]);
    if (caminho === "/api/functions") return respostaJson([{ id: "f1", name: "Montagem" }]);
    if (caminho === "/api/collaborators") return respostaJson([{ id: "c1", fullName: "ANA SOUZA", city: "São Paulo - SP" }]);
    if (caminho === "/api/busca-de-passagens/consumo") return respostaJson({ usadas: 10, teto: 1000, fornecedor: { nome: "simulado", simulado: true }, cacheHoras: 3 });
    if (caminho === "/api/busca-de-passagens/acompanhamentos") return respostaJson({ itens: [], limite: 20, ativos: 0, hora: 7, quedaPct: 10 });
    if (caminho === "/api/tickets/sinais-de-viagem") return respostaJson({ porVaga: {}, totais: { viagensQueSeCruzam: 0, passagensComDataImpossivel: 0 } });
    return respostaJson([]);
  });
  return { fetchMock, pedidos };
}

const Telas = () => (
  <Switch>
    <Route path="/busca-de-passagens/resultados"><ResultadosDaBusca /></Route>
    <Route path="/busca-de-passagens"><BuscaDePassagens /></Route>
  </Switch>
);

describe("Lista → resultados → voltar", () => {
  it("\"Buscar preços\" leva à tela de resultados, consulta UMA vez o que falta e volta com a seleção", async () => {
    const { pedidos } = servidor();
    const { user, historico } = renderComTudo(<Telas />, { user: compras, queryClient: criarQueryClientComApi(), rota: "/busca-de-passagens?vagas=v1&situacao=todas" });
    const buscar = await screen.findByTestId("buscar-precos");
    await waitFor(() => expect(screen.getByTestId("previa-consumo")).toHaveTextContent("gasta 1 consulta"));
    await user.click(buscar);

    // A tela nova: a URL leva a seleção e o recorte; a consulta autorizada roda uma vez.
    expect(await screen.findByTestId("opcao-it-la", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByTestId("barra-busca")).not.toBeInTheDocument();
    expect(historico.some((h) => h.startsWith("/busca-de-passagens/resultados?") && h.includes("vagas=v1"))).toBe(true);
    expect(pedidos.filter((p) => p.consultar?.length)).toHaveLength(1);
    expect(screen.getByTestId("resumo-resultados")).toHaveTextContent("1 rota · 1 escalação · LATAM, GOL e Azul · preço por pessoa");
    expect(screen.getByTestId("pessoa-v1")).toHaveTextContent("Ana Souza");
    // `buscar=1` não fica na URL (recarregar não gasta de novo).
    await waitFor(() => expect(historico[historico.length - 1]).not.toContain("buscar=1"));

    // Voltar: a lista com o mesmo recorte e a escalação ainda marcada.
    const voltar = screen.getByTestId("voltar-as-escalacoes");
    expect(voltar.getAttribute("href")).toContain("situacao=todas");
    expect(voltar.getAttribute("href")).toContain("vagas=v1");
    await user.click(voltar);
    expect(await screen.findByTestId("barra-busca", {}, { timeout: 3000 })).toHaveTextContent("1 escalação selecionada");
  });
});

describe("Tela de resultados", () => {
  const abrir = (qs = "vagas=v1") => renderComTudo(<Telas />, { user: compras, queryClient: criarQueryClientComApi(), rota: `/busca-de-passagens/resultados?${qs}` });

  it("os filtros da tela recortam o que já veio sem chamar a API", async () => {
    const { pedidos } = servidor();
    const { user } = abrir("vagas=v1&buscar=1");
    await screen.findByTestId("opcao-it-g3", {}, { timeout: 3000 });
    const antes = pedidos.length;
    await user.click(screen.getByTestId("filtro-cia-LA"));
    expect(screen.queryByTestId("opcao-it-g3")).not.toBeInTheDocument();
    expect(screen.getByTestId("opcao-it-la")).toBeInTheDocument();
    expect(screen.getByTestId("contagem-opcoes")).toHaveTextContent("1 de 2 opções");
    await user.click(screen.getByTestId("filtro-cia-LA"));
    await user.click(screen.getByTestId("filtro-paradas-0"));
    expect(screen.queryByTestId("opcao-it-g3")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("filtro-cia-G3"));
    expect(await screen.findByTestId("opcoes-filtradas-vazias")).toHaveTextContent("Nenhuma das 2 opções passa nos filtros desta tela");
    await user.click(screen.getByTestId("vazio-limpar-filtros"));
    expect(screen.getByTestId("opcao-it-g3")).toBeInTheDocument();
    expect(pedidos.length).toBe(antes);
  });

  it("aberta por link (sem \"Buscar preços\"): não gasta sozinha — mostra a rota sem preço e o custo para buscar", async () => {
    const { pedidos } = servidor();
    abrir();
    expect(await screen.findByTestId("nao-consultada-ida|GRU>JPA|2099-11-12|-|p1|-|-", {}, { timeout: 3000 })).toHaveTextContent("Esta rota ainda não tem preço");
    expect(screen.getByTestId("buscar-as-que-faltam")).toHaveTextContent("1 consulta");
    expect(pedidos.every((p) => !p.consultar?.length)).toBe(true);
  });

  it("\"Usar este voo\" abre o registro de Passagens já preenchido", async () => {
    servidor();
    const { user } = abrir("vagas=v1&buscar=1");
    await user.click(await screen.findByTestId("usar-voo-it-la", {}, { timeout: 3000 }));
    const aviso = await screen.findByTestId("aviso-voo-da-busca-v1");
    expect(aviso).toHaveTextContent("LATAM · LA 1500 · R$ 980,00 visto na busca");
    expect(within(screen.getByRole("dialog")).getByTestId("input-departure-airport-v1")).toHaveValue("GRU");
  });
});
