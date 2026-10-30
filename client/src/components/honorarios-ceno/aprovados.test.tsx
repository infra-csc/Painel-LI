/**
 * Honorários da cenotécnica — 30/10:
 *  - a aba "Aprovados (todos os eventos)" de quem lança (gaveta da Escalação):
 *    totais, agrupamento por evento com subtotal, filtros, "Abrir no evento"
 *    já na pessoa, CSV com o preâmbulo do Financeiro;
 *  - a OC/DP opcional na liberação e o DP informando a OC depois (Liberados,
 *    "Liberados sem OC" e a aba Aprovados no Financeiro).
 * O fetch é mockado por URL, como em honorarios.test.tsx.
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake, type RoteadorDeFetch } from "@/test/fixtures";
import HonorariosCenoPage from "@/pages/honorarios-ceno";
import { PedidoPainel } from "./pedido-painel";
import type { Honorario, HonorarioAprovado, HonorarioDoFinanceiro, Liberacao, PedidoDoEvento } from "./api";

const csv = vi.hoisted(() => ({ chamadas: [] as { nome: string; cabecalho: string[]; linhas: string[][]; preambulo: string[][] }[] }));
vi.mock("@/components/scaling-validation/event-view/event-view-shared", async (original) => ({
  ...(await original<typeof import("@/components/scaling-validation/event-view/event-view-shared")>()),
  downloadCsv: (nome: string, cabecalho: string[], linhas: string[][], preambulo: string[][] = []) => { csv.chamadas.push({ nome, cabecalho, linhas, preambulo }); },
}));

const quemLanca = usuarioFake({ id: "u-pede", role: "production", name: "Quem Lança" });
const dp = usuarioFake({ id: "u-dp", role: "financial", name: "Pessoa do DP" });

function honorario(p: Partial<Honorario> = {}): Honorario {
  return {
    id: "h1", eventId: "ev1", tipo: "vaga", teamInclusionId: "v1", functionId: "f1", collaboratorId: "c1", nome: "Pessoa Um",
    pessoas: null, descricao: null, setor: "montagem", posicao: "freela_local", inicio: "2099-10-10", fim: "2099-10-12", diarias: 3,
    valorPedido: 100_000, valorAprovado: 100_000, observacao: null, status: "aprovado", versao: 4, criadoPor: "u-pede", criadoPorNome: "Quem Lança",
    enviadoPor: "u-pede", enviadoPorNome: "Quem Lança", enviadoEm: "2099-10-01T10:00:00Z", decididoPor: "u-aprova", decididoPorNome: "Marcos Vieira",
    decididoEm: "2099-10-02T13:00:00Z", motivoDecisao: null, createdAt: "2099-10-01T10:00:00Z", updatedAt: "2099-10-02T13:00:00Z",
    liberado: 0, falta: 100_000, eventName: "Night Run Teste", eventStartDate: "2099-10-11", eventEndDate: "2099-10-12", inclusionNumber: 101,
    functionName: "Cenotécnica", vagaStatus: "escalado", vagaExcluida: false, avisoDaVaga: null, colaboradorAtualId: "c1", colaboradorAtual: "Pessoa Um",
    eventoExcluido: false, tipoFreela: "outro", semColaborador: false, vagasDaEmpreita: [], avisosDaEmpreita: [],
    podeEditar: false, podeRemover: false, podeDecidir: false, podeDevolver: false, podeLiberar: false, eAprovador: false,
    ...p,
  };
}
const aprovado = (p: Partial<HonorarioAprovado> = {}): HonorarioAprovado => ({ ...honorario(p), liberacoes: [], ...p });

/** Dois eventos: Night Run (próximo) com 2 aprovados e Meia de Floripa (depois) com 1 já liberado. */
const APROVADOS: HonorarioAprovado[] = [
  aprovado({ id: "a3", eventId: "ev2", eventName: "Meia Maratona de Florianópolis", eventStartDate: "2099-12-06", eventEndDate: "2099-12-07", nome: "Equipe Pórtico Sul", tipo: "empreita", pessoas: 3, functionId: null, inclusionNumber: null, functionName: null, valorPedido: 300_000, valorAprovado: 300_000, liberado: 300_000, falta: 0, liberacoes: [{ id: "l3", data: "2099-12-10", oc: "45900", valor: 300_000 }] }),
  aprovado({ id: "a1", nome: "Ana Beatriz Cardoso", liberado: 40_000, falta: 60_000, liberacoes: [{ id: "l1", data: "2099-10-20", oc: "", valor: 40_000 }] }),
  aprovado({ id: "a2", nome: "Bruno Lima", status: "aprovado_ajuste", valorPedido: 150_000, valorAprovado: 120_000, falta: 120_000 }),
];

type Chamada = { url: string; metodo: string; corpo: unknown };
function roteador(rotas: Record<string, (c: Chamada) => Response>, chamadas: Chamada[]): RoteadorDeFetch {
  return (url, init) => {
    const c: Chamada = { url, metodo: init?.method ?? "GET", corpo: init?.body ? JSON.parse(String(init.body)) : null };
    chamadas.push(c);
    const r = rotas[`${c.metodo} ${url.split("?")[0]}`];
    return r ? r(c) : respostaJson([]);
  };
}
const ACESSO = (p: Partial<{ podePedir: boolean; podeAprovar: boolean; podeLiberar: boolean; podeInformarOc: boolean; admin: boolean }>) =>
  () => respostaJson({ podePedir: false, podeAprovar: false, podeLiberar: false, podeInformarOc: false, admin: false, ...p });

/** A gaveta de verdade guarda o evento escolhido; aqui, o mesmo. */
function Gaveta() {
  const [evento, setEvento] = useState<string | null>(null);
  return <PedidoPainel eventId={evento} onEscolherEvento={(id) => setEvento(id || null)} />;
}

function pedidoDoEv1(): PedidoDoEvento {
  const linha = (h: Honorario) => ({ vaga: null, sugestao: null, tabela: null, honorario: h, foraDaEscala: false });
  return {
    evento: { id: "ev1", name: "Night Run Teste", startDate: "2099-10-11", endDate: "2099-10-12", location: "Curitiba - PR", status: "planejado" },
    linhas: [linha(honorario({ id: "a1", nome: "Ana Beatriz Cardoso" })), linha(honorario({ id: "a2", teamInclusionId: "v2", nome: "Bruno Lima" }))],
    empreitas: [], vagasDoEvento: [], casa: [], funcoes: [{ id: "f1", name: "Cenotécnica" }],
  };
}

describe("Aprovados (todos os eventos) — quem lança, na gaveta da Escalação", () => {
  it("totais, grupos por evento com subtotal (próximos primeiro), filtros e sem botão de OC para quem lança", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/aprovados": () => respostaJson(APROVADOS),
    }, chamadas));
    const { user } = renderComTudo(<Gaveta />, { user: quemLanca });

    // A aba só busca quando aberta.
    await screen.findByTestId("hon-lista-tab-eventos");
    expect(chamadas.some((c) => c.url.includes("/aprovados"))).toBe(false);
    await user.click(screen.getByRole("tab", { name: /Aprovados \(todos os eventos\)/ }));

    const totais = await screen.findByTestId("hon-apr-totais");
    expect(totais).toHaveTextContent("R$ 5.200"); // 1.000 + 1.200 + 3.000
    expect(totais).toHaveTextContent("R$ 3.400"); // liberado
    expect(totais).toHaveTextContent("R$ 1.800"); // a liberar
    expect(totais).toHaveTextContent("1 liberação sem OC");

    const grupos = screen.getAllByTestId(/^hon-apr-evento-ev/);
    expect(grupos.map((g) => g.getAttribute("aria-label"))).toEqual(["Night Run Teste", "Meia Maratona de Florianópolis"]);
    expect(within(grupos[0]).getByTestId("hon-apr-subtotal")).toHaveTextContent(/Aprovado\s*R\$ 2\.200/);
    // Ajuste: o pedido riscado ao lado do aprovado; quem aprovou.
    const bruno = screen.getByTestId("hon-apr-a2");
    expect(within(bruno).getByLabelText(/Pedido: R\$\s?1\.500,00/)).toBeInTheDocument();
    expect(bruno).toHaveTextContent("Aprovado c/ ajuste por Marcos Vieira");
    // Liberação sem OC aparece marcada, mas quem lança não informa OC.
    const ana = screen.getByTestId("hon-apr-a1");
    expect(within(ana).getByText("sem OC")).toBeInTheDocument();
    expect(within(ana).queryByRole("button", { name: /Informar a OC/ })).not.toBeInTheDocument();

    // Situação: "Liberado" deixa só a empreita; "Sem OC" só a Ana.
    await user.click(screen.getByRole("radio", { name: /^Liberado\s*1$/ }));
    expect(screen.queryByTestId("hon-apr-a1")).not.toBeInTheDocument();
    expect(screen.getByTestId("hon-apr-a3")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /^Sem OC/ }));
    expect(screen.getByTestId("hon-apr-a1")).toBeInTheDocument();
    expect(screen.queryByTestId("hon-apr-a3")).not.toBeInTheDocument();

    // Busca por OC.
    await user.click(screen.getByRole("radio", { name: /^Todas/ }));
    await user.type(screen.getByTestId("hon-apr-busca"), "45900");
    await waitFor(() => expect(screen.queryByTestId("hon-apr-a1")).not.toBeInTheDocument());
    expect(screen.getByTestId("hon-apr-a3")).toBeInTheDocument();

    // Desagrupar: uma lista só, cada cartão com o evento.
    await user.clear(screen.getByTestId("hon-apr-busca"));
    await user.click(screen.getByRole("switch", { name: "Agrupar por evento" }));
    expect(screen.queryAllByTestId(/^hon-apr-evento-ev/)).toHaveLength(0);
    expect(screen.getByTestId("hon-apr-a1")).toHaveTextContent("Night Run Teste");
  });

  it("a partir de 1280px vira tabela: colunas do pedido e, desagrupada, a do evento", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes("min-width: 1280px"), media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
    try {
      mockarFetch(roteador({
        "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
        "GET /api/honorarios-ceno/aprovados": () => respostaJson(APROVADOS),
      }, []));
      const { user } = renderComTudo(<Gaveta />, { user: quemLanca });
      await user.click(await screen.findByRole("tab", { name: /Aprovados \(todos os eventos\)/ }));
      await screen.findByTestId("hon-apr-a1");
      for (const c of ["Nome / empreita", "Setor / posição", "Aprovado", "Liberado", "A liberar", "OC/DP", "Situação"]) {
        expect(screen.getAllByRole("columnheader", { name: c }).length).toBeGreaterThan(0);
      }
      expect(screen.queryByRole("columnheader", { name: "Evento · data" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("switch", { name: "Agrupar por evento" }));
      expect(screen.getByRole("columnheader", { name: "Evento · data" })).toBeInTheDocument();
      // Desagrupada, setor/posição vão para debaixo do nome (a coluna do nome não fica estreita).
      expect(screen.queryByRole("columnheader", { name: "Setor / posição" })).not.toBeInTheDocument();
      expect(screen.getByTestId("hon-apr-a1")).toHaveTextContent("Montagem · Freela local");
      expect(screen.getAllByRole("row")).toHaveLength(4); // cabeçalho + 3
    } finally {
      window.matchMedia = original;
    }
  });

  it("Abrir no evento: o evento abre só com a linha da pessoa; voltar devolve à aba Aprovados", async () => {
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/aprovados": () => respostaJson(APROVADOS),
      "GET /api/honorarios-ceno/pedido": () => respostaJson(pedidoDoEv1()),
    }, []));
    const { user } = renderComTudo(<Gaveta />, { user: quemLanca });
    await user.click(await screen.findByRole("tab", { name: /Aprovados \(todos os eventos\)/ }));
    await user.click(await screen.findByRole("button", { name: "Abrir Bruno Lima no evento Night Run Teste" }));

    const foco = await screen.findByTestId("hon-pedido-foco");
    expect(foco).toHaveTextContent("Mostrando só Bruno Lima");
    expect(screen.getAllByText("Bruno Lima").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ana Beatriz Cardoso")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("hon-pedido-foco-limpar"));
    expect(await screen.findAllByText("Ana Beatriz Cardoso")).not.toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /Aprovados \(todos os eventos\)/ }));
    expect(await screen.findByTestId("hon-aprovados")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Aprovados \(todos os eventos\)/ })).toHaveAttribute("aria-selected", "true");
  });

  it("exporta CSV com o preâmbulo do Financeiro e só o que está filtrado", async () => {
    csv.chamadas.length = 0;
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }),
      "GET /api/honorarios-ceno/aprovados": () => respostaJson(APROVADOS),
    }, []));
    const { user } = renderComTudo(<Gaveta />, { user: quemLanca });
    await user.click(await screen.findByRole("tab", { name: /Aprovados \(todos os eventos\)/ }));
    await user.click(await screen.findByRole("radio", { name: /^A liberar/ }));
    await user.click(screen.getByTestId("hon-apr-exportar"));
    expect(csv.chamadas).toHaveLength(1);
    const c = csv.chamadas[0];
    expect(c.nome).toBe("honorarios-cenotecnica-aprovados-a-liberar.csv");
    expect(c.preambulo).toEqual([["Honorários da cenotécnica — aprovados (todos os eventos)"], ["Período", "todo o período"], ["Situação", "A liberar"], []]);
    expect(c.cabecalho).toEqual(expect.arrayContaining(["Evento", "Nome", "Valor aprovado (R$)", "Ajuste (R$)", "Aprovado por", "A liberar (R$)", "OC/DP (data · valor)"]));
    expect(c.linhas.map((l) => l[c.cabecalho.indexOf("Nome")])).toEqual(["Bruno Lima"]);
    expect(c.linhas[0][c.cabecalho.indexOf("Ajuste (R$)")]).toBe("-300,00");
  });

  it("sem aprovados: estado vazio que explica", async () => {
    mockarFetch(roteador({ "GET /api/honorarios-ceno/acesso": ACESSO({ podePedir: true }), "GET /api/honorarios-ceno/aprovados": () => respostaJson([]) }, []));
    const { user } = renderComTudo(<Gaveta />, { user: quemLanca });
    await user.click(await screen.findByRole("tab", { name: /Aprovados \(todos os eventos\)/ }));
    expect(await screen.findByTestId("hon-apr-vazio")).toHaveTextContent("Nenhum honorário aprovado ainda");
  });
});

describe("OC/DP opcional e informada depois pelo DP (Financeiro)", () => {
  const lib = (p: Partial<Liberacao>): Liberacao => ({ id: "l1", honorarioId: "f1", data: "2099-10-20", oc: "", valor: 100_000, observacao: null, porNome: "Controladoria", createdAt: "2099-10-20T10:00:00Z", estornadaEm: null, estornadaPorNome: null, motivoEstorno: null, ...p });
  const fin = (p: Partial<HonorarioDoFinanceiro>): HonorarioDoFinanceiro => ({ ...honorario({ podeLiberar: true }), liberacoes: [], ...p });

  it("libera sem OC: o pedido vai sem OC, sem erro", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podeLiberar: true }),
      "GET /api/honorarios-ceno/financeiro": () => respostaJson([fin({ id: "f1", nome: "Pessoa Um" })]),
      "POST /api/honorarios-ceno/f1/liberacoes": () => respostaJson(fin({ id: "f1", liberado: 100_000, falta: 0 }), 201),
    }, chamadas));
    const { user } = renderComTudo(<HonorariosCenoPage />, { user: usuarioFake({ id: "u-ctrl", role: "honorarios", name: "Controladoria" }), rota: "/honorarios-ceno" });
    await user.click(await screen.findByRole("button", { name: "Registrar liberação de Pessoa Um" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByLabelText(/^Nº da OC\/DP/)).toHaveAccessibleName(/opcional/);
    await user.click(within(dialogo).getByRole("button", { name: /^Liberar R\$/ }));
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith("/f1/liberacoes"))).toBe(true));
    expect(chamadas.find((c) => c.url.endsWith("/f1/liberacoes"))!.corpo).toMatchObject({ oc: "", valor: 100_000 });
    // O perfil Honorários (controladoria) não tem a aba Aprovados.
    expect(screen.queryByRole("tab", { name: /Aprovados/ })).not.toBeInTheDocument();
  });

  it("DP: Liberados mostra \"sem OC\", o atalho filtra e Informar OC manda a OC com a lida", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podeLiberar: true, podeInformarOc: true }),
      "GET /api/honorarios-ceno/financeiro": () => respostaJson([
        fin({ id: "f1", nome: "Pessoa Um", liberado: 100_000, falta: 0, liberacoes: [lib({})] }),
        fin({ id: "f2", nome: "Pessoa Dois", liberado: 100_000, falta: 0, liberacoes: [lib({ id: "l2", honorarioId: "f2", oc: "45777" })] }),
      ]),
      "PATCH /api/honorarios-ceno/f1/liberacoes/l1/oc": () => respostaJson({ honorario: fin({ id: "f1" }), liberacao: lib({ oc: "45123" }) }),
    }, chamadas));
    const { user } = renderComTudo(<HonorariosCenoPage />, { user: dp, rota: "/honorarios-ceno?aba=liberados&base=evento" });

    expect(await screen.findByTestId("hon-liberado-f1")).toHaveTextContent("sem OC");
    expect(screen.getByTestId("hon-liberado-f2")).toHaveTextContent("OC/DP 45777");
    const atalho = screen.getByTestId("hon-fin-sem-oc");
    expect(atalho).toHaveAccessibleName("Liberados sem OC (1)");
    await user.click(atalho);
    await waitFor(() => expect(screen.queryByTestId("hon-liberado-f2")).not.toBeInTheDocument());
    expect(atalho).toHaveAttribute("aria-pressed", "true");

    await user.click(within(screen.getByTestId("hon-liberado-f1")).getByRole("button", { name: /Informar a OC da liberação/ }));
    const dialogo = await screen.findByTestId("hon-informar-oc-dialogo");
    await user.type(within(dialogo).getByLabelText("Nº da OC/DP"), "45123");
    await user.click(within(dialogo).getByRole("button", { name: "Informar OC" }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "PATCH")).toBe(true));
    expect(chamadas.find((c) => c.metodo === "PATCH")).toMatchObject({ url: "/api/honorarios-ceno/f1/liberacoes/l1/oc", corpo: { oc: "45123", ocAnterior: "" } });

    // A aba Aprovados existe para o DP, com Informar OC.
    expect(screen.getByRole("tab", { name: /Aprovados \(todos os eventos\)/ })).toBeInTheDocument();
  });

  it("DP na aba Aprovados: Informar OC na linha sem OC", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({
      "GET /api/honorarios-ceno/acesso": ACESSO({ podeLiberar: true, podeInformarOc: true }),
      "GET /api/honorarios-ceno/financeiro": () => respostaJson([fin({ id: "a1", nome: "Ana Beatriz Cardoso" })]),
      "GET /api/honorarios-ceno/aprovados": () => respostaJson(APROVADOS),
      "PATCH /api/honorarios-ceno/a1/liberacoes/l1/oc": () => respostaJson({ honorario: honorario({ id: "a1" }), liberacao: lib({ honorarioId: "a1", oc: "45555" }) }),
    }, chamadas));
    const { user } = renderComTudo(<HonorariosCenoPage />, { user: dp, rota: "/honorarios-ceno?aba=aprovados" });
    const ana = await screen.findByTestId("hon-apr-a1");
    // A barra não mostra o período/evento do Financeiro (a aba tem os seus).
    expect(screen.queryByTestId("hon-exportar-linhas")).not.toBeInTheDocument();
    await user.click(within(ana).getByRole("button", { name: /Informar a OC da liberação/ }));
    const dialogo = await screen.findByTestId("hon-informar-oc-dialogo");
    await user.type(within(dialogo).getByLabelText("Nº da OC/DP"), "45555");
    await user.click(within(dialogo).getByRole("button", { name: "Informar OC" }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === "PATCH")).toMatchObject({ corpo: { oc: "45555", ocAnterior: "" } }));
  });
});
