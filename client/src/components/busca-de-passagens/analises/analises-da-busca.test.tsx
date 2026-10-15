import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake } from "@/test/fixtures";
import { melhorMomento, pagoXEncontrado, type ConsultaDoHistorico, type UsoDaBusca } from "@shared/analise-da-busca";
import { preverEscalacoes, type VagaParaPrevisao } from "@shared/previsao-da-busca";
import { AbaMelhorMomento } from "./melhor-momento";
import { AbaPrevisao } from "./previsao";
import { AbaPagoXEncontrado } from "./pago-x-encontrado";
import { abasVisiveis } from "../abas-da-busca";

const admin = usuarioFake({ id: "admin-1", role: "admin" });
let seq = 0;
const consulta = (x: Partial<ConsultaDoHistorico> & { preco: number }): ConsultaDoHistorico => {
  const { preco, ...resto } = x;
  const dia = resto.dia ?? "2026-09-01";
  return {
    id: `c${++seq}`, consultadoEm: `${dia}T12:00:00Z`, dia, usuarioId: "u1", perna: "ida_e_volta", origem: "GRU", destino: "JPA",
    dataIda: "2026-08-20", dataVolta: "2026-08-24", deslocada: false, antecedenciaDias: 20, menorPrecoCentavos: preco,
    menorPorCia: null, eventoIds: [], vagaIds: [], ...resto,
  };
};
function historico(): ConsultaDoHistorico[] {
  const out: ConsultaDoHistorico[] = [];
  for (const [ant, f] of [[3, 1.4], [10, 1.15], [20, 1], [45, 0.85]] as const) for (let i = 0; i < 3; i++) out.push(consulta({ antecedenciaDias: ant, preco: Math.round(100000 * f) }));
  return out;
}

describe("abas da busca — regra única de quem vê", () => {
  it("admin vê as análises; Compras só a Buscar", () => {
    expect(abasVisiveis(admin)).toEqual(["buscar", "previsao", "melhor-momento", "preco-por-rota", "pago-x-encontrado", "orcamento", "consumo"]);
    expect(abasVisiveis(usuarioFake({ role: "purchasing" }))).toEqual(["buscar"]);
    expect(abasVisiveis(usuarioFake({ role: "administrador" }))).toContain("previsao");
  });
});

describe("Melhor momento", () => {
  it("frases diretas no topo com a fonte; período pede de novo ao servidor", async () => {
    const corpo = { periodo: "180", ...melhorMomento({ consultas: historico(), opcoes: [], passagens: [] }) };
    const fetchMock = mockarFetch(() => respostaJson(corpo));
    const onPeriodo = vi.fn();
    const { user } = renderComTudo(<AbaMelhorMomento periodo="180" onPeriodo={onPeriodo} onIrParaBuscar={vi.fn()} />, { user: admin });
    const frases = await screen.findByTestId("frases-do-topo");
    expect(frases).toHaveTextContent("Pesquisado");
    expect(frases).toHaveTextContent(/Mais barato comprando com 31 a 60 dias: \d+% abaixo do típico da rota/);
    expect(screen.getByTestId("amostra-pequena")).toHaveTextContent("Amostra pequena");
    expect(within(screen.getByTestId("momento-antecedencia")).getByText("Menos de 7 dias")).toBeInTheDocument();
    await user.click(screen.getByTestId("periodo-analise-365"));
    expect(onPeriodo).toHaveBeenCalledWith("365");
    expect(urlsChamadas(fetchMock)).toContain("/api/busca-de-passagens/analises/melhor-momento?periodo=180");
  });

  it("sem dado: estado vazio com saída", async () => {
    mockarFetch(() => respostaJson({ periodo: "90", ...melhorMomento({ consultas: [], opcoes: [], passagens: [] }) }));
    const onPeriodo = vi.fn();
    const { user } = renderComTudo(<AbaMelhorMomento periodo="90" onPeriodo={onPeriodo} onIrParaBuscar={vi.fn()} />, { user: admin });
    expect(await screen.findByTestId("momento-vazio")).toHaveTextContent("Ainda sem preços para comparar");
    await user.click(screen.getByRole("button", { name: "Ver todo o histórico" }));
    expect(onPeriodo).toHaveBeenCalledWith("tudo");
  });

  it("erro: \"Tentar de novo\"", async () => {
    mockarFetch(() => respostaJson({ message: "falhou" }, 500));
    renderComTudo(<AbaMelhorMomento periodo="180" onPeriodo={vi.fn()} onIrParaBuscar={vi.fn()} />, { user: admin });
    expect(await screen.findByTestId("analise-busca-erro")).toBeInTheDocument();
    expect(screen.getByTestId("analise-busca-tentar")).toBeInTheDocument();
  });
});

describe("Previsão por escalação", () => {
  const vaga = (id: string, dataIda: string): VagaParaPrevisao => ({
    vagaId: id, numero: Number(id.slice(1)), colaborador: "ANA SOUZA", funcao: "Montagem", eventId: "e1", eventName: "Makai", eventStart: dataIda,
    rotas: [{ perna: "ida_e_volta", origem: "GRU", destino: "JPA", dataIda, dataVolta: "2026-12-30", chave: "k" }], falta: null,
  });

  it("diz a tendência e o porquê, nunca certeza; \"Buscar preços\" leva a escalação para a Buscar", async () => {
    const corpo = { hoje: "2026-10-09", consultas: 12, ...preverEscalacoes([vaga("v1", "2026-10-18"), vaga("v2", "2027-03-01")], { consultas: historico(), hoje: "2026-10-09" }) };
    mockarFetch(() => respostaJson(corpo));
    const onBuscar = vi.fn();
    const { user } = renderComTudo(<AbaPrevisao onBuscarVagas={onBuscar} onIrParaBuscar={vi.fn()} />, { user: admin });
    const linha = await screen.findByTestId("previsao-v1");
    expect(linha).toHaveTextContent("Compre agora — tende a subir");
    expect(linha).toHaveTextContent("Estimativa");
    expect(linha).toHaveTextContent("Ana Souza");
    expect(screen.getByTestId("previsao-compre-primeiro")).toHaveTextContent("tende a subir com voo em até 14 dias");
    await user.click(screen.getByTestId("previsao-buscar-v1"));
    expect(onBuscar).toHaveBeenCalledWith(["v1"]);
    // A fila filtra.
    await user.click(screen.getByTestId("previsao-fila-sem_dado"));
    expect(screen.queryByTestId("previsao-v1")).not.toBeInTheDocument();
  });

  it("nenhuma pendente: estado vazio honesto", async () => {
    mockarFetch(() => respostaJson({ hoje: "2026-10-09", consultas: 0, ...preverEscalacoes([], { consultas: [], hoje: "2026-10-09" }) }));
    renderComTudo(<AbaPrevisao onBuscarVagas={vi.fn()} onIrParaBuscar={vi.fn()} />, { user: admin });
    expect(await screen.findByTestId("previsao-vazia")).toHaveTextContent("Nenhuma escalação esperando passagem");
  });
});

describe("Pago × encontrado", () => {
  it("totais, economia acumulada e as compras", async () => {
    const chave = "ida_e_volta|GRU>JPA|2026-08-20|2026-08-24|p1|-|-";
    const usos: UsoDaBusca[] = [{ id: "u1", dia: "2026-09-03", usuarioId: "a", usuarioNome: "CAMILA DUARTE", ticketId: "t1", valorPago: 101000, companhia: "GOL", eventId: "e1", eventName: "Makai", chave, precoEncontrado: 98000 }];
    mockarFetch(() => respostaJson({ periodo: "180", ...pagoXEncontrado({ usos, consultas: historico(), hoje: "2026-10-09" }) }));
    renderComTudo(<AbaPagoXEncontrado periodo="180" onPeriodo={vi.fn()} onIrParaBuscar={vi.fn()} />, { user: admin });
    expect(await screen.findByTestId("kpi-acima")).toHaveTextContent("1 de 1");
    expect(screen.getByTestId("compra-u1")).toHaveTextContent("GRU ⇄ JPA");
    await waitFor(() => expect(screen.getByTestId("economia-por-mes")).toHaveTextContent("set/26"));
  });
});
