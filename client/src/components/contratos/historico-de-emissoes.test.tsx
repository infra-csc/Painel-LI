/**
 * Histórico de emissões (29/10) — testes de tela: a aba dentro de Contratos,
 * a busca do colaborador pelo nome, a lista de empresas (tabela e cartões),
 * a expansão com os eventos, os estados vazio, erro e carregando, e o que a
 * tela manda ao servidor (só GET).
 */
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { mockarFetch, respostaJson, usuarioFake, type RoteadorDeFetch } from "@/test/fixtures";
import ContratosPage from "@/pages/contratos";
import { HistoricoDeEmissoes } from "./historico-de-emissoes";
import type { RespostaDoHistoricoDeEmissoes } from "./api";

const rh = usuarioFake({ id: "u-rh", role: "financial", name: "Pessoa do DP" });

const colaboradores = [
  { id: "c1", fullName: "ANA PAULA DE OLIVEIRA SANTOS COM UM NOME MUITO MUITO COMPRIDO PARA TESTAR A QUEBRA", collaboratorNumber: 7, active: true },
  { id: "c2", fullName: "BRUNO TESTE", collaboratorNumber: 8, active: true },
];

const resposta: RespostaDoHistoricoDeEmissoes = {
  colaborador: { id: "c1", fullName: colaboradores[0].fullName, collaboratorNumber: 7 },
  totalDeNotas: 3,
  truncado: false,
  empresas: [
    {
      cnpj: "12345678000195", cnpjFormatado: "12.345.678/0001-95", razaoSocial: "Montagens e Serviços de Eventos Exemplo Sociedade Limitada ME", contratoId: "k1",
      eventos: 2, notas: 2, primeiraData: "2026-03-10", ultimaData: "2026-09-20", valorTotal: 35_000, semValor: 0,
      emissoes: [
        { notaId: "n2", eventoId: "e2", eventoNome: "NR São Luís", data: "2026-09-20", valor: 25_000, status: "aprovada" },
        { notaId: "n1", eventoId: "e1", eventoNome: "Rock in Rio", data: "2026-03-10", valor: 10_000, status: "enviada" },
      ],
    },
    {
      cnpj: "22345678000100", cnpjFormatado: "22.345.678/0001-00", razaoSocial: "Segunda Empresa ME", contratoId: null,
      eventos: 1, notas: 1, primeiraData: "2026-01-05", ultimaData: "2026-01-05", valorTotal: 0, semValor: 1,
      emissoes: [{ notaId: "n3", eventoId: "e3", eventoNome: "Evento sem valor", data: "2026-01-05", valor: null, status: "aprovada" }],
    },
  ],
};

type Chamada = { url: string; metodo: string };
function rotear(historico: () => Response, chamadas: Chamada[] = []): RoteadorDeFetch {
  return (url, init) => {
    chamadas.push({ url, metodo: init?.method ?? "GET" });
    const caminho = url.split("?")[0];
    if (caminho === "/api/collaborators") return respostaJson(colaboradores);
    if (caminho === "/api/contratos/historico-de-emissoes") return historico();
    if (caminho === "/api/contratos") return respostaJson({ hoje: "2026-10-29", contratos: [] });
    return respostaJson([]);
  };
}

const tela = (props: { colaboradorId?: string; largo?: boolean; onEscolher?: (id: string) => void; onAbrirContrato?: (id: string) => void }) => (
  <HistoricoDeEmissoes colaboradorId={props.colaboradorId ?? "c1"} onEscolher={props.onEscolher ?? (() => {})} onAbrirContrato={props.onAbrirContrato ?? (() => {})} largo={props.largo ?? true} />
);

describe("Histórico de emissões", () => {
  it("a aba existe em Contratos; sem colaborador mostra a busca e a regra, sem consultar o histórico", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(rotear(() => respostaJson(resposta), chamadas));
    renderComTudo(<ContratosPage />, { user: rh, queryClient: criarQueryClientComApi(), rota: "/contratos?aba=emissoes" });
    expect(await screen.findByTestId("ctr-emissoes-inicio")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Histórico de emissões/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("ctr-emissoes-regra")).toHaveTextContent(/enviada ou aprovada/);
    expect(chamadas.some((c) => c.url.includes("historico-de-emissoes"))).toBe(false);
  });

  it("busca pelo nome e sugere só quem casa", async () => {
    mockarFetch(rotear(() => respostaJson(resposta)));
    const { user } = renderComTudo(tela({ colaboradorId: "" }), { user: rh, queryClient: criarQueryClientComApi() });
    await user.type(await screen.findByTestId("ctr-emissoes-busca"), "bruno");
    expect(await screen.findByTestId("ctr-emissoes-sugestao-c2")).toBeInTheDocument();
    expect(screen.queryByTestId("ctr-emissoes-sugestao-c1")).not.toBeInTheDocument();
  });

  it("escolher na busca chama onEscolher com o id", async () => {
    mockarFetch(rotear(() => respostaJson(resposta)));
    const escolhidos: string[] = [];
    const { user } = renderComTudo(tela({ colaboradorId: "", onEscolher: (id) => escolhidos.push(id) }), { user: rh, queryClient: criarQueryClientComApi() });
    await user.type(await screen.findByTestId("ctr-emissoes-busca"), "bruno");
    await user.click(await screen.findByTestId("ctr-emissoes-sugestao-c2"));
    expect(escolhidos).toEqual(["c2"]);
  });

  it("tabela (largo): empresas, valores, expansão com os eventos e o status da nota; só faz GET", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(rotear(() => respostaJson(resposta), chamadas));
    const aberto: string[] = [];
    const { user } = renderComTudo(tela({ onAbrirContrato: (id) => aberto.push(id) }), { user: rh, queryClient: criarQueryClientComApi() });
    const primeira = await screen.findByTestId("ctr-emissoes-empresa-12345678000195");
    expect(primeira).toHaveTextContent("12.345.678/0001-95");
    expect(primeira).toHaveTextContent("Montagens e Serviços de Eventos Exemplo Sociedade Limitada ME");
    expect(primeira).toHaveTextContent("10/03/2026");
    expect(primeira).toHaveTextContent("20/09/2026");
    expect(primeira).toHaveTextContent(/R\$\s?350,00/);
    expect(screen.getByTestId("ctr-emissoes-empresa-22345678000100")).toHaveTextContent("—");
    expect(screen.getByText(/2 empresas · 3 notas/)).toBeInTheDocument();

    expect(screen.queryByTestId("ctr-emissoes-eventos-12345678000195")).not.toBeInTheDocument();
    await user.click(within(primeira).getByRole("button", { expanded: false }));
    const eventos = await screen.findByTestId("ctr-emissoes-eventos-12345678000195");
    expect(eventos).toHaveTextContent("NR São Luís");
    expect(eventos).toHaveTextContent("Aprovada");
    expect(eventos).toHaveTextContent("Rock in Rio");
    expect(eventos).toHaveTextContent("Enviada");
    await user.click(within(eventos).getByRole("button", { name: "Ver contrato" }));
    expect(aberto).toEqual(["k1"]);

    await user.click(within(screen.getByTestId("ctr-emissoes-empresa-22345678000100")).getByRole("button", { expanded: false }));
    expect(await screen.findByText("Este CNPJ ainda não tem contrato cadastrado.")).toBeInTheDocument();
    expect(chamadas.every((c) => c.metodo === "GET")).toBe(true);
  });

  it("cartões (estreito): mesma informação, abre e fecha", async () => {
    mockarFetch(rotear(() => respostaJson(resposta)));
    const { user } = renderComTudo(tela({ largo: false }), { user: rh, queryClient: criarQueryClientComApi() });
    await screen.findByTestId("ctr-emissoes-cartoes");
    const cartao = screen.getByTestId("ctr-emissoes-empresa-12345678000195");
    expect(cartao).toHaveTextContent("2 eventos");
    await user.click(within(cartao).getByRole("button", { expanded: false }));
    expect(await screen.findByTestId("ctr-emissoes-eventos-12345678000195")).toBeInTheDocument();
    await user.click(within(cartao).getByRole("button", { expanded: true }));
    expect(screen.queryByTestId("ctr-emissoes-eventos-12345678000195")).not.toBeInTheDocument();
  });

  it("sem emissões: estado vazio com o nome", async () => {
    mockarFetch(rotear(() => respostaJson({ ...resposta, empresas: [], totalDeNotas: 0 })));
    renderComTudo(tela({}), { user: rh, queryClient: criarQueryClientComApi() });
    expect(await screen.findByTestId("ctr-emissoes-vazio")).toHaveTextContent(/Nenhuma emissão/);
  });

  it("erro da API: mensagem, tentar de novo e trocar colaborador", async () => {
    mockarFetch(rotear(() => respostaJson({ message: "Colaborador não encontrado." }, 404)));
    renderComTudo(tela({}), { user: rh, queryClient: criarQueryClientComApi() });
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/Não foi possível carregar o histórico/);
    expect(within(alerta).getByRole("button", { name: /Trocar colaborador/ })).toBeInTheDocument();
  });

  it("carregando: esqueleto acessível; avisa quando o limite da consulta cortou notas", async () => {
    mockarFetch(rotear(() => respostaJson({ ...resposta, truncado: true })));
    renderComTudo(tela({}), { user: rh, queryClient: criarQueryClientComApi() });
    expect(screen.getByLabelText("Carregando o histórico de emissões")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/aparecem as 1\.000 mais recentes/)).toBeInTheDocument());
  });
});
