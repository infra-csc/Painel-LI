/**
 * Honorários da cenotécnica — testes das telas: quem pede (desde 20/10 na
 * Escalação — o painel do evento e a aba Honorário do modal da vaga), o
 * aprovador (tela Aprovação de honorários) e o Financeiro (página).
 * O fetch é mockado por URL; o que importa é o que a tela manda ao servidor
 * e o que ela mostra em cada estado.
 */
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { TeamInclusion } from "@shared/schema";
import { Tabs } from "@/components/ui/tabs";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake, type RoteadorDeFetch } from "@/test/fixtures";
import { visibleTabs } from "@/components/layout/nav-items";
import { PedidoPainel } from "./pedido-painel";
import { AprovacaoPainel } from "./aprovacao-painel";
import { AbaHonorarioDaVaga, useHonorarioDaVaga } from "./aba-da-vaga";
import HonorariosCenoPage from "@/pages/honorarios-ceno";
import AprovacaoDeHonorariosPage from "@/pages/aprovacao-de-honorarios";
import type { Honorario, HonorarioDoFinanceiro, PedidoDoEvento, SugestaoDaVaga, TabelaDaVaga, VagaParaEmpreita } from "./api";

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
    vagaExcluida: false, avisoDaVaga: null, colaboradorAtualId: "c1", colaboradorAtual: "Pessoa Um", eventoExcluido: false,
    tipoFreela: "outro", semColaborador: false, vagasDaEmpreita: [], avisosDaEmpreita: [],
    podeEditar: true, podeRemover: true, podeDecidir: false, podeDevolver: false, podeLiberar: false, eAprovador: false,
    ...p,
  };
}

const vaga = (id: string, n: number, nome: string, cenoFreelaTipo: string | null = "sp") => ({
  id, eventId: "ev1", inclusionNumber: n, functionId: "f1", functionName: "Cenotécnica", collaboratorId: `c-${id}`, collaboratorName: nome,
  collaboratorType: "freela", status: "escalado", scheduleStartDate: "2099-10-10", scheduleEndDate: "2099-10-12", dailyRates: 3,
  cenoFreelaTipo, needsTicket: false, empreitaEmpresa: null, empreitaPessoas: null, empreitaValor: null, dias: 3,
});

/** Valores da tabela (3 dias) — o servidor manda; aqui, os da tabela do dono. */
const TABELA: TabelaDaVaga = {
  dias: 3,
  valores: { viagem: { total: 125_700, extrapolado: false }, sp: { total: 105_000, extrapolado: false }, local_a: { total: 99_200, extrapolado: false }, local_b: { total: 78_700, extrapolado: false } },
};

const sugestao = (nome: string, p: Partial<SugestaoDaVaga> = {}): SugestaoDaVaga => ({
  setor: "montagem", posicao: "freela_local", inicio: "2099-10-10", fim: "2099-10-12", diarias: 3, nome, tipoFreela: null, semColaborador: false, ...p,
});

const paraEmpreita = (id: string, n: number, nome: string | null, p: Partial<VagaParaEmpreita> = {}): VagaParaEmpreita => ({
  id, inclusionNumber: n, functionName: "Cenotécnica", collaboratorName: nome, semColaborador: !nome, scheduleStartDate: "2099-10-10",
  scheduleEndDate: "2099-10-12", dias: 3, empreita: null, pedidoProprio: null, ...p,
});

function pedido(): PedidoDoEvento {
  return {
    evento: { id: "ev1", name: "Night Run Teste", startDate: "2099-10-11", endDate: "2099-10-12", location: "Curitiba - PR", status: "planejado" },
    linhas: [
      { vaga: vaga("v1", 101, "Pessoa Um"), sugestao: sugestao("Pessoa Um", { tipoFreela: "sp" }), tabela: TABELA, honorario: honorario(), foraDaEscala: false },
      { vaga: vaga("v2", 102, "Pessoa Dois"), sugestao: sugestao("Pessoa Dois", { tipoFreela: "outro" }), tabela: TABELA, honorario: null, foraDaEscala: false },
    ],
    empreitas: [],
    vagasDoEvento: [
      paraEmpreita("v1", 101, "Pessoa Um", { pedidoProprio: { id: "h1", status: "rascunho", valorPedido: 120_000 } }),
      paraEmpreita("v2", 102, "Pessoa Dois"),
    ],
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
    // "Outro valor" (o tipo que veio pré-selecionado) vai junto com o valor digitado.
    expect(criar.corpo).toMatchObject({ eventId: "ev1", tipo: "vaga", teamInclusionId: "v2", tipoFreela: "outro", valorPedido: 150_000 });

    await user.click(screen.getByTestId("hon-enviar"));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Pessoa Um")).toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: /^Enviar · / }));
    await waitFor(() => expect(chamadas.some((c) => c.url === "/api/honorarios-ceno/enviar")).toBe(true));
    expect(chamadas.find((c) => c.url === "/api/honorarios-ceno/enviar")!.corpo).toEqual({ itens: [{ id: "h1", versao: 2 }] });
  });
});

describe("Honorários — quem pede: vaga trocada de colaborador", () => {
  it("segura o envio e “Passar o pedido para…” confirma com um PATCH só com a versão", async () => {
    const chamadas: Chamada[] = [];
    const p = pedido();
    p.linhas[0] = { ...p.linhas[0], vaga: { ...vaga("v1", 101, "Pessoa Nova"), collaboratorId: "c9" }, honorario: honorario({ avisoDaVaga: "colaborador_trocado", colaboradorAtualId: "c9", colaboradorAtual: "Pessoa Nova" }) };
    p.linhas = [p.linhas[0]];
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(p),
      "PATCH /api/honorarios-ceno/h1": () => respostaJson(honorario({ nome: "Pessoa Nova", collaboratorId: "c9", versao: 3 })),
    }, chamadas));
    const { user } = renderComTudo(<PedidoPainel eventId="ev1" onEscolherEvento={() => {}} />, { user: producao });
    expect(await screen.findByTestId("hon-aviso-da-vaga")).toHaveTextContent("hoje: Pessoa Nova");
    expect(screen.getByTestId("hon-enviar")).toBeDisabled();
    await user.click(screen.getByTestId("hon-confirmar-troca-101"));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "PATCH")).toBe(true));
    expect(chamadas.find((c) => c.metodo === "PATCH")!.corpo).toEqual({ versao: 2 });
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

  it("avisa o aprovador quando a vaga trocou de colaborador ou o evento foi excluído", async () => {
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/aprovacao": () => respostaJson([
        pendente({ id: "a1", nome: "Pessoa Um", avisoDaVaga: "colaborador_trocado", colaboradorAtual: "Pessoa Nova" }),
        pendente({ id: "a2", nome: "Pessoa Dois", eventoExcluido: true }),
      ]),
    }, []));
    renderComTudo(<AprovacaoPainel eventId={null} />, { user: aprovador });
    const avisos = await screen.findAllByTestId("hon-aviso-da-vaga");
    expect(avisos[0]).toHaveTextContent("A vaga trocou de colaborador — hoje: Pessoa Nova");
    expect(avisos[1]).toHaveTextContent("O evento foi excluído");
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

  it("“Liberar o resto” abre o diálogo limpo: OC em branco e o valor que falta (não o da liberação anterior)", async () => {
    const chamadas: Chamada[] = [];
    let liberou = false;
    const lib = { id: "l1", honorarioId: "f1", data: "2099-10-20", oc: "45123", valor: 40_000, observacao: null, porNome: "Financeiro", createdAt: "2099-10-20T10:00:00Z", estornadaEm: null, estornadaPorNome: null, motivoEstorno: null };
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podeLiberar: true }),
      "GET /api/honorarios-ceno/financeiro": () => respostaJson([liberou
        ? aprovado({ id: "f1", nome: "Pessoa Um", versao: 3, liberado: 40_000, falta: 60_000, liberacoes: [lib] })
        : aprovado({ id: "f1", nome: "Pessoa Um" })]),
      "POST /api/honorarios-ceno/f1/liberacoes": () => { liberou = true; return respostaJson(aprovado({ id: "f1", versao: 3, liberado: 40_000, falta: 60_000 }), 201); },
    }, chamadas));
    const { user } = renderComTudo(<HonorariosCenoPage />, { user: rh, rota: "/honorarios-ceno" });

    await user.click(await screen.findByRole("button", { name: "Registrar liberação de Pessoa Um" }));
    let dialogo = await screen.findByRole("dialog");
    await user.type(within(dialogo).getByLabelText("Nº da OC/DP"), "45123");
    const valor = within(dialogo).getByLabelText("Valor liberado");
    await user.clear(valor);
    await user.type(valor, "400");
    await user.click(within(dialogo).getByRole("button", { name: /^Liberar R\$/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(await screen.findByRole("button", { name: "Registrar liberação de Pessoa Um" }));
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByLabelText("Nº da OC/DP")).toHaveValue("");
    expect(within(dialogo).getByLabelText("Valor liberado")).toHaveValue("600,00");
    expect(within(dialogo).queryByText("Passa do que falta liberar.")).not.toBeInTheDocument();
  });

  it("Esc fecha o diálogo de liberação e o foco volta ao botão que o abriu", async () => {
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podeLiberar: true }),
      "GET /api/honorarios-ceno/financeiro": () => respostaJson([aprovado({ id: "f1", nome: "Pessoa Um" })]),
    }, []));
    const { user } = renderComTudo(<HonorariosCenoPage />, { user: rh, rota: "/honorarios-ceno" });
    const botao = await screen.findByRole("button", { name: "Registrar liberação de Pessoa Um" });
    await user.click(botao);
    const dialogo = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialogo).getByLabelText("Nº da OC/DP")).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Registrar liberação de Pessoa Um" })).toHaveFocus());
  });

  it("quem não é do Financeiro vê a tela fechada, sem buscar valores", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({ "GET /api/honorarios-ceno/acesso": ACESSO({}) }, chamadas));
    renderComTudo(<HonorariosCenoPage />, { user: producao, rota: "/honorarios-ceno" });
    expect(await screen.findByTestId("hon-fin-sem-acesso")).toBeInTheDocument();
    expect(chamadas.some((c) => c.url.includes("/financeiro"))).toBe(false);
  });
});

// ── 20/10: pedir na Escalação (modal da vaga) e aprovar em tela própria ─────

function NaVaga({ vagaId = "v1", funcao = "Cenotécnica", collaboratorId = "c1" }: { vagaId?: string; funcao?: string; collaboratorId?: string | null }) {
  const inclusion = { id: vagaId, eventId: "ev1", functionId: "f1", collaboratorId } as unknown as TeamInclusion;
  const hon = useHonorarioDaVaga(inclusion, funcao, true);
  const [rodape, setRodape] = useState<HTMLDivElement | null>(null);
  return (
    <Tabs value="honorario">
      <span data-testid="aba-visivel">{hon.visivel ? "sim" : "nao"}</span>
      {hon.visivel && <AbaHonorarioDaVaga inclusion={inclusion} hon={hon} rodape={rodape} onFechar={() => {}} />}
      <div ref={setRodape} />
    </Tabs>
  );
}

describe("Honorários — aba Honorário no modal da vaga (Escalação)", () => {
  it("vaga que não é da cenotécnica: nenhuma consulta de honorário e nada aparece", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({ "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }) }, chamadas));
    renderComTudo(<NaVaga funcao="Ativação" />, { user: producao });
    expect(await screen.findByTestId("aba-visivel")).toHaveTextContent("nao");
    await new Promise((r) => setTimeout(r, 30));
    expect(chamadas.some((c) => c.url.includes("/api/honorarios-ceno"))).toBe(false);
  });

  it("quem não pede honorário não vê a aba (e não busca os valores do evento)", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({ "GET /api/honorarios-ceno/acesso": ACESSO({ podeAprovar: true }) }, chamadas));
    renderComTudo(<NaVaga />, { user: aprovador });
    await waitFor(() => expect(chamadas.some((c) => c.url.includes("/acesso"))).toBe(true));
    expect(screen.getByTestId("aba-visivel")).toHaveTextContent("nao");
    expect(chamadas.some((c) => c.url.includes("/pedido"))).toBe(false);
  });

  it("vaga da casa (fora das linhas do pedido): a aba aparece e explica que não recebe honorário (20/10)", async () => {
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(pedido()),
    }, []));
    renderComTudo(<NaVaga vagaId="v3" />, { user: producao });
    expect(await screen.findByTestId("hon-vaga-sem-linha")).toHaveTextContent("Esta vaga não recebe honorário");
    expect(screen.getByTestId("aba-visivel")).toHaveTextContent("sim");
  });

  it("vaga ABERTA (dono 20/10: \"não precisa escalar\"): a aba mostra o formulário normal, com a linha de vaga sem colaborador, e envia", async () => {
    const chamadas: Chamada[] = [];
    const p = pedido();
    p.linhas.push({
      vaga: { ...vaga("v9", 109, "", null), collaboratorId: null, collaboratorName: null, collaboratorType: null },
      sugestao: sugestao("Vaga #109 sem nome · Cenotécnica", { semColaborador: true, tipoFreela: null }), tabela: TABELA, honorario: null, foraDaEscala: false,
    });
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(p),
      "POST /api/honorarios-ceno": () => respostaJson(honorario({ id: "h9", teamInclusionId: "v9", collaboratorId: null, semColaborador: true, nome: "Vaga #109 sem nome · Cenotécnica", tipoFreela: "local_a", valorPedido: 99_200, versao: 1 }), 201),
      "POST /api/honorarios-ceno/enviar": () => respostaJson({ enviados: ["h9"], recusados: [] }),
      "PATCH /api/team-inclusions/v9/ceno-freela-tipo": () => respostaJson({}),
    }, chamadas));
    const { user } = renderComTudo(<NaVaga vagaId="v9" collaboratorId={null} />, { user: producao });
    expect(await screen.findByTestId("hon-vaga-form")).toBeInTheDocument();
    expect(screen.queryByTestId("hon-vaga-sem-linha")).not.toBeInTheDocument();
    expect(screen.getByTestId("hon-vaga-sem-colaborador")).toHaveTextContent("Vaga ainda sem colaborador — o pedido segue assim mesmo");
    expect(screen.getByTestId("hon-vaga-falta")).toHaveTextContent("Escolha o tipo de freela");

    // Escolher Freela Local (A): o valor é o da tabela para os 3 dias; a tela não manda valor.
    await user.click(screen.getByTestId("hon-vaga-tipo-local_a"));
    expect(screen.getByTestId("hon-vaga-tipo-local_a")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("hon-vaga-valor-do-pedido")).toHaveTextContent(/992,00/);
    expect(screen.getByTestId("hon-tipo-na-vaga")).toHaveTextContent("a vaga também fica como Freela Local (A)");
    await user.click(screen.getByTestId("hon-vaga-enviar"));
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("Freela Local (A) · tabela");
    await user.click(within(dialogo).getByRole("button", { name: /^Enviar · / }));
    await waitFor(() => expect(chamadas.some((c) => c.url === "/api/honorarios-ceno/enviar")).toBe(true));
    const criar = chamadas.find((c) => c.metodo === "POST" && c.url === "/api/honorarios-ceno")!;
    expect(criar.corpo).toEqual({ eventId: "ev1", tipo: "vaga", teamInclusionId: "v9", tipoFreela: "local_a", observacao: null });
    // A vaga não tinha tipo no Resumo: passa a ter o escolhido (para o Planejado bater).
    await waitFor(() => expect(chamadas.find((c) => c.url === "/api/team-inclusions/v9/ceno-freela-tipo")?.corpo).toEqual({ cenoFreelaTipo: "local_a" }));
  });

  it("a vaga já tem OUTRO tipo no Resumo: avisa e NÃO muda a vaga", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(pedido()),
      "PATCH /api/honorarios-ceno/h1": () => respostaJson(honorario({ versao: 3, tipoFreela: "local_b", valorPedido: 78_700 })),
    }, chamadas));
    const { user } = renderComTudo(<NaVaga />, { user: producao });
    await user.click(await screen.findByTestId("hon-vaga-tipo-local_b"));
    expect(screen.getByTestId("hon-tipo-diferente")).toHaveTextContent("O tipo da vaga no Resumo é Freela SP");
    await user.click(screen.getByTestId("hon-vaga-salvar"));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "PATCH")).toBe(true));
    expect(chamadas.find((c) => c.metodo === "PATCH")!.corpo).toEqual({ versao: 2, tipoFreela: "local_b", observacao: null });
    expect(chamadas.some((c) => c.url.includes("ceno-freela-tipo"))).toBe(false);
  });

  it("rascunho: muda o valor, Enviar grava e manda a versão nova para o aprovador", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(pedido()),
      "GET /api/honorarios-ceno/h1/historico": () => respostaJson({ honorario: honorario(), historico: [], liberacoes: [] }),
      "PATCH /api/honorarios-ceno/h1": (c) => respostaJson(honorario({ versao: 3, valorPedido: (c.corpo as { valorPedido: number }).valorPedido })),
      "POST /api/honorarios-ceno/enviar": () => respostaJson({ enviados: ["h1"], recusados: [] }),
    }, chamadas));
    const { user } = renderComTudo(<NaVaga />, { user: producao });

    expect(await screen.findByTestId("hon-vaga-situacao")).toHaveTextContent("Rascunho");
    const valor = screen.getByLabelText("Valor negociado");
    await user.clear(valor);
    await user.type(valor, "2000");
    expect(screen.getByTestId("hon-vaga-salvo")).toHaveTextContent("Alterações não salvas");
    expect(screen.getByTestId("hon-vaga-por-diaria")).toHaveTextContent(/666,67/);

    await user.click(screen.getByTestId("hon-vaga-enviar"));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(within(dialogo).getByRole("button", { name: /^Enviar · R\$\s?2\.000,00/ }));
    await waitFor(() => expect(chamadas.some((c) => c.url === "/api/honorarios-ceno/enviar")).toBe(true));
    expect(chamadas.find((c) => c.metodo === "PATCH")!.corpo).toEqual({ versao: 2, tipoFreela: "outro", valorPedido: 200_000, observacao: null });
    expect(chamadas.find((c) => c.url === "/api/honorarios-ceno/enviar")!.corpo).toEqual({ itens: [{ id: "h1", versao: 3 }] });
  });

  it("vaga sem pedido, \"Outro valor\": sem valor o Enviar fica travado com o motivo; Salvar cria o pedido com o valor digitado", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(pedido()),
      "POST /api/honorarios-ceno": () => respostaJson(honorario({ id: "h2", teamInclusionId: "v2", nome: "Pessoa Dois" }), 201),
    }, chamadas));
    const { user } = renderComTudo(<NaVaga vagaId="v2" />, { user: producao });
    expect(await screen.findByTestId("hon-vaga-situacao")).toHaveTextContent("Falta lançar");
    expect(screen.getByTestId("hon-vaga-enviar")).toBeDisabled();
    expect(screen.getByTestId("hon-vaga-falta")).toHaveTextContent("Informe o valor negociado.");
    expect(screen.getByLabelText(/Por que outro valor\?/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Valor negociado"), "900");
    expect(screen.queryByTestId("hon-vaga-falta")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Por que outro valor\?/), "Montagem noturna");
    await user.click(screen.getByTestId("hon-vaga-salvar"));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "POST" && c.url === "/api/honorarios-ceno")).toBe(true));
    expect(chamadas.find((c) => c.metodo === "POST" && c.url === "/api/honorarios-ceno")!.corpo)
      .toEqual({ eventId: "ev1", tipo: "vaga", teamInclusionId: "v2", tipoFreela: "outro", valorPedido: 90_000, observacao: "Montagem noturna" });
  });

  it("devolvido: mostra o motivo e oferece Reenviar", async () => {
    const p = pedido();
    p.linhas[0] = { ...p.linhas[0], honorario: honorario({ status: "devolvido", enviadoEm: "2099-10-02T10:00:00Z", decididoPorNome: "Quem Aprova", decididoEm: new Date().toISOString(), motivoDecisao: "Acima do combinado", podeRemover: false }) };
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(p),
    }, []));
    renderComTudo(<NaVaga />, { user: producao });
    expect(await screen.findByTestId("hon-vaga-motivo")).toHaveTextContent("Acima do combinado");
    expect(screen.getByTestId("hon-vaga-enviar")).toHaveTextContent("Reenviar para aprovação");
  });

  it("aguardando: só leitura (sem Salvar/Enviar); aprovado com ajuste mostra o valor aprovado", async () => {
    const p = pedido();
    p.linhas[0] = { ...p.linhas[0], honorario: honorario({ status: "aguardando", podeEditar: false, podeRemover: false, enviadoPorNome: "Quem Pede", enviadoEm: new Date().toISOString() }) };
    p.linhas[1] = { ...p.linhas[1], honorario: honorario({ id: "h2", teamInclusionId: "v2", status: "aprovado_ajuste", valorPedido: 120_000, valorAprovado: 100_000, falta: 100_000, podeEditar: false, podeRemover: false, decididoPorNome: "Quem Aprova", decididoEm: "2099-10-05T10:00:00Z", motivoDecisao: "3 diárias" }) };
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(p),
    }, []));
    const { unmount } = renderComTudo(<NaVaga />, { user: producao });
    expect(await screen.findByTestId("hon-vaga-situacao")).toHaveTextContent("Aguardando aprovação");
    expect(screen.getByTestId("hon-vaga-pedido")).toBeInTheDocument();
    expect(screen.queryByTestId("hon-vaga-enviar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hon-vaga-salvar")).not.toBeInTheDocument();
    unmount();
    renderComTudo(<NaVaga vagaId="v2" />, { user: producao });
    expect(await screen.findByTestId("hon-vaga-valor-aprovado")).toHaveTextContent("R$ 1.000,00");
    expect(screen.getByTestId("hon-vaga-situacao")).toHaveTextContent("3 diárias");
  });
});

describe("Honorários — tela Aprovação de honorários", () => {
  const pendente = (p: Partial<Honorario>) => honorario({ status: "aguardando", podeEditar: false, podeRemover: false, podeDecidir: true, eAprovador: true, enviadoPorNome: "Quem Pede", enviadoEm: new Date().toISOString(), ...p });

  it("totais, aba Aguardando com o contador e a troca para Decididos", async () => {
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podeAprovar: true }),
      "GET /api/honorarios-ceno/aprovacao": (c) => respostaJson(c.url.includes("decididos")
        ? [honorario({ id: "d1", nome: "Já Aprovado", status: "aprovado", valorAprovado: 50_000, valorPedido: 50_000, falta: 50_000, podeEditar: false, decididoPorNome: "Quem Aprova", decididoEm: new Date().toISOString() })]
        : [pendente({ id: "a1", valorPedido: 120_000 }), pendente({ id: "a2", nome: "Pessoa Dois", valorPedido: 80_000 })]),
    }, []));
    const { user } = renderComTudo(<AprovacaoDeHonorariosPage />, { user: aprovador, rota: "/aprovacao-de-honorarios" });
    const totais = await screen.findByTestId("hon-apr-totais");
    expect(totais).toHaveTextContent("R$ 2.000");
    expect(totais).toHaveTextContent("R$ 500");
    expect(screen.getByRole("tab", { name: /Aguardando/ })).toHaveTextContent("2");
    expect(await screen.findByTestId("hon-apr-total-evento")).toHaveTextContent("R$ 2.000,00");
    await user.click(screen.getByRole("tab", { name: /Decididos/ }));
    expect(await screen.findByTestId("hon-decididos")).toHaveTextContent("Já Aprovado");
  });

  it("quem não aprova honorário vê a tela fechada, sem buscar a fila", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({ "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }) }, chamadas));
    renderComTudo(<AprovacaoDeHonorariosPage />, { user: producao, rota: "/aprovacao-de-honorarios" });
    expect(await screen.findByTestId("hon-apr-sem-acesso")).toBeInTheDocument();
    expect(chamadas.some((c) => c.url.includes("/aprovacao"))).toBe(false);
  });

  it("o item do menu só aparece para quem aprova honorário, logo depois da Aprovação de escala", () => {
    const ids = (extra?: { aprovaHonorarios?: boolean }) => visibleTabs(aprovador, extra).map((t) => t.id);
    expect(ids()).not.toContain("aprovacao-de-honorarios");
    expect(ids({ aprovaHonorarios: false })).not.toContain("aprovacao-de-honorarios");
    const comAcesso = ids({ aprovaHonorarios: true });
    expect(comAcesso).toContain("aprovacao-de-honorarios");
    expect(comAcesso.indexOf("aprovacao-de-honorarios")).toBe(comAcesso.indexOf("scaling-approval") + 1);
  });
});

// ── 20/10: tipo de freela na aprovação e a empreita que agrupa vagas ────────

const empreita = (p: Partial<Honorario> = {}): Honorario => honorario({
  id: "e1", tipo: "empreita", teamInclusionId: null, functionId: null, collaboratorId: null, nome: "Equipe Horizonte", pessoas: 2,
  setor: "montagem", posicao: "empreita", tipoFreela: null, valorPedido: 400_000, inclusionNumber: null, functionName: null,
  colaboradorAtualId: null, colaboradorAtual: null,
  vagasDaEmpreita: [
    { id: "v1", inclusionNumber: 101, functionId: "f1", functionName: "Cenotécnica", collaboratorId: "c1", collaboratorName: "Pessoa Um", scheduleStartDate: "2099-10-10", scheduleEndDate: "2099-10-12", dias: 3, aviso: null },
    { id: "v9", inclusionNumber: 109, functionId: "f1", functionName: "Cenotécnica", collaboratorId: null, collaboratorName: null, scheduleStartDate: "2099-10-10", scheduleEndDate: "2099-10-12", dias: 3, aviso: null },
  ],
  ...p,
});

describe("Honorários — empreita que agrupa vagas", () => {
  it("na gaveta: criar a empreita marcando 2 vagas — o nº de pessoas acompanha e o rascunho próprio pede confirmação para descartar", async () => {
    const chamadas: Chamada[] = [];
    let tentativas = 0;
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(pedido()),
      "POST /api/honorarios-ceno": (c) => {
        tentativas++;
        const corpo = c.corpo as { descartarRascunhos?: boolean };
        if (!corpo.descartarRascunhos) return respostaJson({ message: "A vaga #101 Pessoa Um tem pedido próprio em rascunho — confirme para descartá-lo e colocar na empreita.", precisaConfirmar: [{ id: "h1", nome: "Pessoa Um", status: "rascunho", inclusionNumber: 101 }] }, 409);
        return respostaJson(empreita(), 201);
      },
    }, chamadas));
    const { user } = renderComTudo(<PedidoPainel eventId="ev1" onEscolherEvento={() => {}} />, { user: producao });
    await user.click((await screen.findAllByRole("button", { name: /Adicionar empreita/ }))[0]);
    const dialogo = await screen.findByTestId("hon-detalhes");
    await user.type(within(dialogo).getByLabelText("Responsável ou equipe"), "Equipe Horizonte");
    const lista = within(dialogo).getByTestId("hon-vagas");
    expect(lista).toHaveTextContent("tem pedido próprio em rascunho");
    await user.click(within(lista).getByRole("checkbox", { name: /#101/ }));
    await user.click(within(lista).getByRole("checkbox", { name: /#102/ }));
    expect(within(dialogo).getByLabelText("Pessoas")).toHaveValue("2");
    await user.type(within(dialogo).getByLabelText("Valor fechado"), "4000");
    await user.click(within(dialogo).getByTestId("hon-detalhes-salvar"));

    const confirmar = await screen.findByTestId("hon-confirmar-descarte");
    expect(confirmar).toHaveTextContent("#101 Pessoa Um · rascunho");
    await user.click(within(confirmar).getByRole("button", { name: "Descartar e salvar" }));
    await waitFor(() => expect(tentativas).toBe(2));
    const posts = chamadas.filter((c) => c.metodo === "POST" && c.url === "/api/honorarios-ceno");
    expect(posts[0].corpo).toEqual({ eventId: "ev1", tipo: "empreita", nome: "Equipe Horizonte", pessoas: 2, valorPedido: 400_000, observacao: null, vagaIds: ["v1", "v2"] });
    expect(posts[1].corpo).toMatchObject({ vagaIds: ["v1", "v2"], descartarRascunhos: true });
  });

  it("vaga já numa empreita ou com pedido enviado: o checkbox fica travado com o motivo", async () => {
    const p = pedido();
    p.vagasDoEvento = [
      paraEmpreita("v1", 101, "Pessoa Um", { empreita: { id: "e9", nome: "Equipe Norte" } }),
      paraEmpreita("v2", 102, "Pessoa Dois", { pedidoProprio: { id: "h2", status: "aguardando", valorPedido: 1 } }),
      paraEmpreita("v9", 109, null),
    ];
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(p),
    }, []));
    const { user } = renderComTudo(<PedidoPainel eventId="ev1" onEscolherEvento={() => {}} />, { user: producao });
    await user.click((await screen.findAllByRole("button", { name: /Adicionar empreita/ }))[0]);
    const lista = within(await screen.findByTestId("hon-detalhes")).getByTestId("hon-vagas");
    expect(within(lista).getByRole("checkbox", { name: /#101/ })).toBeDisabled();
    expect(lista).toHaveTextContent("já está na empreita Equipe Norte");
    expect(within(lista).getByRole("checkbox", { name: /#102/ })).toBeDisabled();
    expect(lista).toHaveTextContent("peça para o aprovador devolver");
    expect(within(lista).getByRole("checkbox", { name: /#109/ })).toBeEnabled();
    expect(lista).toHaveTextContent("sem nome");
  });

  it("aba da vaga que está numa empreita: mostra a empreita e “Tirar desta empreita” manda a lista sem ela", async () => {
    const chamadas: Chamada[] = [];
    const p = pedido();
    p.linhas = p.linhas.filter((l) => l.vaga?.id !== "v1");
    p.empreitas = [empreita()];
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(p),
      "PATCH /api/honorarios-ceno/e1": () => respostaJson(empreita({ versao: 3, vagasDaEmpreita: [empreita().vagasDaEmpreita[1]] })),
    }, chamadas));
    const { user } = renderComTudo(<NaVaga vagaId="v1" />, { user: producao });
    const card = await screen.findByTestId("hon-vaga-na-empreita");
    expect(card).toHaveTextContent("Faz parte da empreita Equipe Horizonte (R$ 4.000,00, 2 vagas)");
    expect(screen.queryByTestId("hon-vaga-form")).not.toBeInTheDocument();
    await user.click(within(card).getByTestId("hon-empreita-vagas-botao"));
    expect(within(card).getByTestId("hon-empreita-vagas")).toHaveTextContent("#109 sem nome");
    await user.click(screen.getByTestId("hon-vaga-tirar-da-empreita"));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(within(dialogo).getByRole("button", { name: "Tirar da empreita" }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "PATCH")).toBe(true));
    expect(chamadas.find((c) => c.metodo === "PATCH")!.corpo).toEqual({ versao: 2, vagaIds: ["v9"] });
  });

  it("aprovador vê a origem do valor (tabela × outro valor) e a empreita como um pedido com as vagas", async () => {
    const pendente = (p: Partial<Honorario>) => honorario({ status: "aguardando", podeEditar: false, podeRemover: false, podeDecidir: true, eAprovador: true, enviadoPorNome: "Quem Pede", enviadoEm: new Date().toISOString(), ...p });
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/aprovacao": () => respostaJson([
        pendente({ id: "a1", nome: "Pessoa Um", tipoFreela: "local_a" }),
        pendente({ id: "a2", nome: "Vaga #109 sem nome · Cenotécnica", semColaborador: true, collaboratorId: null, tipoFreela: "outro", observacao: "Montagem noturna" }),
        { ...empreita({ id: "a3" }), status: "aguardando", podeEditar: false, podeRemover: false, podeDecidir: true, eAprovador: true },
      ]),
    }, []));
    const { user } = renderComTudo(<AprovacaoPainel eventId={null} />, { user: aprovador });
    const origens = await screen.findAllByTestId("hon-origem-do-valor");
    expect(origens.map((o) => o.textContent)).toEqual(["Freela Local (A) · tabela", "Outro valor · Montagem noturna", "Valor fechado da equipe · 2 vagas da escala"]);
    expect(screen.getByText("Vaga #109 sem nome · Cenotécnica")).toBeInTheDocument();
    expect(screen.getByText("Vaga ainda sem colaborador escalado")).toBeInTheDocument();
    await user.click(screen.getByTestId("hon-empreita-vagas-botao"));
    expect(screen.getByTestId("hon-empreita-vagas")).toHaveTextContent("#101 Pessoa Um");
  });
});

describe("Honorários — gaveta do evento: o que já foi lançado e o que falta (23/10)", () => {
  /** 4 vagas: rascunho meu, sem pedido, enviada por outra pessoa e devolvida minha. */
  function pedidoMisto(): PedidoDoEvento {
    const p = pedido();
    p.linhas = [
      { vaga: vaga("v1", 101, "Pessoa Um"), sugestao: sugestao("Pessoa Um"), tabela: TABELA, honorario: honorario(), foraDaEscala: false },
      { vaga: vaga("v2", 102, "Pessoa Dois"), sugestao: sugestao("Pessoa Dois", { tipoFreela: "outro" }), tabela: TABELA, honorario: null, foraDaEscala: false },
      {
        vaga: vaga("v3", 103, "Pessoa Três"), sugestao: sugestao("Pessoa Três"), tabela: TABELA, foraDaEscala: false,
        honorario: honorario({ id: "h3", teamInclusionId: "v3", nome: "Pessoa Três", status: "aguardando", podeEditar: false, podeRemover: false, criadoPor: "u-outra", criadoPorNome: "Outra Pessoa", enviadoPor: "u-outra", enviadoPorNome: "Outra Pessoa", enviadoEm: "2099-10-02T10:00:00Z" }),
      },
      {
        vaga: vaga("v4", 104, "Pessoa Quatro"), sugestao: sugestao("Pessoa Quatro"), tabela: TABELA, foraDaEscala: false,
        honorario: honorario({ id: "h4", teamInclusionId: "v4", nome: "Pessoa Quatro", status: "devolvido", podeRemover: false, enviadoPor: "u-pede", enviadoPorNome: "Quem Pede", enviadoEm: "2099-10-02T10:00:00Z", decididoPorNome: "Quem Aprova", decididoEm: "2099-10-03T10:00:00Z", motivoDecisao: "Rever as diárias" }),
      },
    ];
    return p;
  }

  it("resumo do topo, abas com contagem, atalhos do resumo, quem lançou e “Lançados por mim”", async () => {
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(pedidoMisto()),
    }, []));
    const { user } = renderComTudo(<PedidoPainel eventId="ev1" onEscolherEvento={() => {}} />, { user: producao });

    const resumo = await screen.findByTestId("hon-resumo");
    expect(resumo).toHaveTextContent("3 de 4 lançadas");
    expect(resumo).toHaveTextContent("2 enviadas, 1 em rascunho");
    expect(resumo).toHaveTextContent("1 falta lançar");
    expect(resumo).toHaveTextContent("1 devolvida");

    const abas = screen.getByTestId("hon-abas");
    expect(within(abas).getByTestId("hon-aba-todas")).toHaveTextContent("4");
    expect(within(abas).getByTestId("hon-aba-falta")).toHaveTextContent("1");
    expect(within(abas).getByTestId("hon-aba-rascunho")).toHaveTextContent("1");
    expect(within(abas).getByTestId("hon-aba-enviados")).toHaveTextContent("1");
    expect(within(abas).getByTestId("hon-aba-decididos")).toHaveTextContent("1");

    // Quem lançou, e quando: "você" para a pessoa logada.
    expect(within(screen.getByTestId("hon-linha-101")).getByTestId("hon-autoria")).toHaveTextContent(/Você lançou/);
    expect(within(screen.getByTestId("hon-linha-103")).getByTestId("hon-autoria")).toHaveTextContent(/Enviado por Outra Pessoa/);
    // Sem pedido: "Falta lançar"; o que pede ação tem o marcador.
    expect(within(screen.getByTestId("hon-linha-102")).getByTestId("hon-falta-lancar")).toBeInTheDocument();
    expect(screen.getByTestId("hon-linha-102")).toHaveAttribute("data-pede-acao", "true");
    expect(screen.getByTestId("hon-linha-103")).not.toHaveAttribute("data-pede-acao");

    // O atalho do resumo leva à aba; a lista mostra só aquela etapa.
    await user.click(screen.getByTestId("hon-resumo-falta"));
    expect(screen.getByTestId("hon-aba-falta")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("hon-linha-102")).toBeInTheDocument();
    expect(screen.queryByTestId("hon-linha-101")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("hon-aba-decididos"));
    expect(screen.getByTestId("hon-linha-104")).toBeInTheDocument();
    expect(screen.queryByTestId("hon-linha-102")).not.toBeInTheDocument();

    // "Lançados por mim": o rascunho e o devolvido são meus; o enviado pela outra pessoa não.
    await user.click(screen.getByTestId("hon-aba-todas"));
    await user.click(screen.getByTestId("hon-so-meus"));
    expect(screen.getByTestId("hon-so-meus")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("hon-linha-101")).toBeInTheDocument();
    expect(screen.getByTestId("hon-linha-104")).toBeInTheDocument();
    expect(screen.queryByTestId("hon-linha-103")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hon-linha-102")).not.toBeInTheDocument();

    // Aba sem nada: explica e oferece voltar.
    await user.click(screen.getByTestId("hon-aba-enviados"));
    expect(screen.getByTestId("hon-aba-vazia")).toBeInTheDocument();
  });

  it("lista de eventos: “N faltam lançar · N rascunhos · N enviados” e o total dos próximos", async () => {
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/eventos": () => respostaJson([
        { id: "ev1", name: "Night Run Teste", startDate: "2099-10-11", endDate: "2099-10-12", location: "Curitiba", vagas: 6, semColaborador: 1, semPedido: 3, empreitas: 0, rascunhos: 2, aguardando: 4, devolvidos: 0, aprovados: 1, totalPedido: 500_000, totalAprovado: 100_000, passado: false },
      ]),
    }, []));
    renderComTudo(<PedidoPainel eventId={null} onEscolherEvento={() => {}} />, { user: producao });
    const linha = await screen.findByTestId("hon-evento-ev1");
    expect(within(linha).getByTestId("hon-evento-contadores")).toHaveTextContent("3 faltam lançar2 rascunhos5 enviados");
    expect(linha).toHaveTextContent("7/10");
    expect(screen.getByTestId("hon-eventos-resumo")).toHaveTextContent("3 vagas faltam lançar · 2 rascunhos não enviados");
  });
});
