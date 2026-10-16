/**
 * Honorários da cenotécnica — testes das três telas (16/10): quem pede (aba
 * da Validação), o aprovador (aba da Aprovação) e o Financeiro (página).
 * O fetch é mockado por URL; o que importa é o que a tela manda ao servidor
 * e o que ela mostra em cada estado.
 */
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake, type RoteadorDeFetch } from "@/test/fixtures";
import { PedidoPainel } from "./pedido-painel";
import { AprovacaoPainel } from "./aprovacao-painel";
import HonorariosCenoPage from "@/pages/honorarios-ceno";
import type { Honorario, HonorarioDoFinanceiro, PedidoDoEvento } from "./api";

const producao = usuarioFake({ id: "u-pede", role: "production", name: "Quem Pede" });
const aprovador = usuarioFake({ id: "u-aprova", role: "production", name: "Quem Aprova" });
const rh = usuarioFake({ id: "u-rh", role: "financial", name: "Financeiro" });

function honorario(p: Partial<Honorario> = {}): Honorario {
  return {
    id: "h1", eventId: "ev1", tipo: "vaga", teamInclusionId: "v1", functionId: "f1", collaboratorId: "c1", nome: "Pessoa Um",
    pessoas: null, descricao: null, setor: "montagem", posicao: "freela_local", inicio: "2099-10-10", fim: "2099-10-12", diarias: 3,
    valorPedido: 120_000, valorAprovado: null, observacao: null, status: "rascunho", versao: 2, criadoPor: "u-pede", criadoPorNome: "Quem Pede",
    enviadoPor: null, enviadoPorNome: null, enviadoEm: null, decididoPor: null, decididoPorNome: null, decididoEm: null, motivoDecisao: null,
    createdAt: "2099-10-01T10:00:00Z", updatedAt: "2099-10-01T10:00:00Z", liberado: 0, falta: 0, eventName: "Night Run Teste",
    eventStartDate: "2099-10-11", eventEndDate: "2099-10-12", inclusionNumber: 101, functionName: "Cenotécnica", vagaStatus: "escalado",
    vagaExcluida: false, podeEditar: true, podeRemover: true, podeDecidir: false, podeDevolver: false, podeLiberar: false, eAprovador: false,
    ...p,
  };
}

const vaga = (id: string, n: number, nome: string) => ({
  id, eventId: "ev1", inclusionNumber: n, functionId: "f1", functionName: "Cenotécnica", collaboratorId: `c-${id}`, collaboratorName: nome,
  collaboratorType: "freela", status: "escalado", scheduleStartDate: "2099-10-10", scheduleEndDate: "2099-10-12", dailyRates: 3,
  cenoFreelaTipo: "sp", needsTicket: false, empreitaEmpresa: null, empreitaPessoas: null, empreitaValor: null,
});

function pedido(): PedidoDoEvento {
  return {
    evento: { id: "ev1", name: "Night Run Teste", startDate: "2099-10-11", endDate: "2099-10-12", location: "Curitiba - PR", status: "planejado" },
    linhas: [
      { vaga: vaga("v1", 101, "Pessoa Um"), sugestao: { setor: "montagem", posicao: "freela_local", inicio: "2099-10-10", fim: "2099-10-12", diarias: 3, nome: "Pessoa Um" }, honorario: honorario(), foraDaEscala: false },
      { vaga: vaga("v2", 102, "Pessoa Dois"), sugestao: { setor: null, posicao: "freela_local", inicio: "2099-10-10", fim: "2099-10-12", diarias: 3, nome: "Pessoa Dois" }, honorario: null, foraDaEscala: false },
    ],
    empreitas: [],
    casa: [{ id: "v3", inclusionNumber: 103, functionName: "Cenotécnica", collaboratorName: "Funcionário" }],
    funcoes: [{ id: "f1", name: "Cenotécnica" }],
  };
}

type Chamada = { url: string; metodo: string; corpo: unknown };
function roteador(rotas: Record<string, (c: Chamada) => Response>, chamadas: Chamada[]): RoteadorDeFetch {
  return (url, init) => {
    const c: Chamada = { url, metodo: init?.method ?? "GET", corpo: init?.body ? JSON.parse(String(init.body)) : null };
    chamadas.push(c);
    const caminho = url.split("?")[0];
    const r = rotas[`${c.metodo} ${caminho}`];
    return r ? r(c) : respostaJson([]);
  };
}

const ACESSO = (p: Partial<{ podePedir: boolean; podeAprovar: boolean; podeLiberar: boolean }>) =>
  () => respostaJson({ podePedir: false, podeAprovar: false, podeLiberar: false, admin: false, ...p });

describe("Honorários — quem pede", () => {
  it("sem cadastro na cenotécnica: explica quem lança, sem lista", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({ "GET /api/honorarios-ceno/acesso": ACESSO({}) }, chamadas));
    renderComTudo(<PedidoPainel eventId="ev1" onEscolherEvento={() => {}} />, { user: producao });
    expect(await screen.findByText("Honorários são lançados pela cenotécnica")).toBeInTheDocument();
    expect(chamadas.some((c) => c.url.includes("/pedido"))).toBe(false);
  });

  it("digitar o valor na linha cria o rascunho; Enviar manda só os prontos", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(pedido()),
      "POST /api/honorarios-ceno": (c) => respostaJson(honorario({ id: "h2", teamInclusionId: "v2", nome: "Pessoa Dois", valorPedido: (c.corpo as { valorPedido: number }).valorPedido }), 201),
      "POST /api/honorarios-ceno/enviar": () => respostaJson({ enviados: ["h1"], recusados: [] }),
    }, chamadas));
    const { user } = renderComTudo(<PedidoPainel eventId="ev1" onEscolherEvento={() => {}} />, { user: producao });

    expect(await screen.findByText("Pessoa Dois")).toBeInTheDocument();
    expect(screen.getByText(/1 vaga da casa/)).toBeInTheDocument();

    const campo = screen.getByRole("textbox", { name: "Valor negociado de Pessoa Dois" });
    await user.click(campo);
    await user.type(campo, "1.500,00");
    await user.tab();
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "POST" && c.url === "/api/honorarios-ceno")).toBe(true));
    const criar = chamadas.find((c) => c.metodo === "POST" && c.url === "/api/honorarios-ceno")!;
    expect(criar.corpo).toMatchObject({ eventId: "ev1", tipo: "vaga", teamInclusionId: "v2", valorPedido: 150_000 });

    await user.click(screen.getByTestId("hon-enviar"));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Pessoa Um")).toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: /^Enviar · / }));
    await waitFor(() => expect(chamadas.some((c) => c.url === "/api/honorarios-ceno/enviar")).toBe(true));
    expect(chamadas.find((c) => c.url === "/api/honorarios-ceno/enviar")!.corpo).toEqual({ itens: [{ id: "h1", versao: 2 }] });
  });
});

describe("Honorários — aprovador", () => {
  const pendente = (p: Partial<Honorario>) => honorario({ status: "aguardando", podeEditar: false, podeRemover: false, podeDecidir: true, eAprovador: true, enviadoPorNome: "Quem Pede", enviadoEm: new Date().toISOString(), ...p });

  it("mostra o total do evento e aprova com ajuste só com motivo", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/aprovacao": () => respostaJson([pendente({ id: "a1", nome: "Pessoa Um", valorPedido: 120_000 }), pendente({ id: "a2", nome: "Pessoa Dois", valorPedido: 80_000 })]),
      "POST /api/honorarios-ceno/a1/aprovar-com-ajuste": () => respostaJson(pendente({ id: "a1", status: "aprovado_ajuste", valorAprovado: 100_000 })),
    }, chamadas));
    const { user } = renderComTudo(<AprovacaoPainel eventId={null} />, { user: aprovador });

    expect(await screen.findByTestId("hon-apr-total-evento")).toHaveTextContent("R$ 2.000,00");
    await user.click(screen.getByRole("button", { name: "Aprovar Pessoa Um com ajuste" }));
    const dialogo = await screen.findByRole("dialog");
    const valor = within(dialogo).getByLabelText("Valor aprovado");
    await user.clear(valor);
    await user.type(valor, "1000");
    await user.click(within(dialogo).getByRole("button", { name: /^Aprovar R\$/ }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("motivo do ajuste");
    expect(chamadas.some((c) => c.url.includes("aprovar-com-ajuste"))).toBe(false);

    await user.type(within(dialogo).getByLabelText(/Motivo do ajuste/), "Fechado em 3 diárias");
    await user.click(within(dialogo).getByRole("button", { name: /^Aprovar R\$/ }));
    await waitFor(() => expect(chamadas.some((c) => c.url.includes("aprovar-com-ajuste"))).toBe(true));
    expect(chamadas.find((c) => c.url.includes("aprovar-com-ajuste"))!.corpo).toEqual({ versao: 2, valor: 100_000, motivo: "Fechado em 3 diárias" });
  });

  it("fila vazia diz que não há nada aguardando (e não é erro)", async () => {
    mockarFetch(roteador({}, []));
    renderComTudo(<AprovacaoPainel eventId={null} />, { user: aprovador });
    expect(await screen.findByTestId("hon-apr-vazio")).toHaveTextContent("Nenhum honorário aguardando aprovação");
  });

  it("falha do servidor vira erro com Tentar de novo", async () => {
    mockarFetch(roteador({ "GET /api/honorarios-ceno/aprovacao": () => respostaJson({ message: "Erro interno" }, 500) }, []));
    renderComTudo(<AprovacaoPainel eventId={null} />, { user: aprovador });
    expect(await screen.findByTestId("hon-apr-erro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });
});

describe("Honorários — Financeiro", () => {
  const aprovado = (p: Partial<HonorarioDoFinanceiro>): HonorarioDoFinanceiro => ({
    ...honorario({ status: "aprovado", valorAprovado: 100_000, valorPedido: 100_000, falta: 100_000, podeEditar: false, podeRemover: false, podeLiberar: true, decididoPorNome: "Quem Aprova" }),
    liberacoes: [],
    ...p,
  });

  it("totais, liberação parcial e o relatório por evento", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podeLiberar: true }),
      "GET /api/honorarios-ceno/financeiro": () => respostaJson([
        aprovado({ id: "f1", nome: "Pessoa Um" }),
        aprovado({ id: "f2", nome: "Pessoa Dois", status: "aguardando", valorAprovado: null, falta: 0, podeLiberar: false, valorPedido: 50_000 }),
      ]),
      "POST /api/honorarios-ceno/f1/liberacoes": () => respostaJson(aprovado({ id: "f1", liberado: 40_000, falta: 60_000 }), 201),
    }, chamadas));
    const { user } = renderComTudo(<HonorariosCenoPage />, { user: rh, rota: "/honorarios-ceno" });

    const totais = await screen.findByTestId("hon-fin-totais");
    expect(totais).toHaveTextContent("R$ 1.000");
    expect(totais).toHaveTextContent("R$ 500");

    await user.click(screen.getByRole("button", { name: "Registrar liberação de Pessoa Um" }));
    const dialogo = await screen.findByRole("dialog");
    await user.type(within(dialogo).getByLabelText("Nº da OC/DP"), "45123");
    const valor = within(dialogo).getByLabelText("Valor liberado");
    await user.clear(valor);
    await user.type(valor, "400");
    expect(within(dialogo).getByText(/Liberação parcial — ficam R\$\s?600,00/)).toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: /^Liberar R\$/ }));
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith("/f1/liberacoes"))).toBe(true));
    expect(chamadas.find((c) => c.url.endsWith("/f1/liberacoes"))!.corpo).toMatchObject({ versao: 2, oc: "45123", valor: 40_000 });

    await user.click(screen.getByRole("tab", { name: /Relatórios/ }));
    const rel = await screen.findByTestId("hon-relatorios");
    expect(within(rel).getByText("Night Run Teste")).toBeInTheDocument();
    expect(within(rel).getByText("Total")).toBeInTheDocument();
  });

  it("quem não é do Financeiro vê a tela fechada, sem buscar valores", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({ "GET /api/honorarios-ceno/acesso": ACESSO({}) }, chamadas));
    renderComTudo(<HonorariosCenoPage />, { user: producao, rota: "/honorarios-ceno" });
    expect(await screen.findByTestId("hon-fin-sem-acesso")).toBeInTheDocument();
    expect(chamadas.some((c) => c.url.includes("/financeiro"))).toBe(false);
  });
});
