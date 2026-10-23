/**
 * Honorários — filtro por PERÍODO na tela do Financeiro (23/10).
 * A liberar e Relatórios pela data do evento; Liberados pela data da
 * liberação (padrão) ou do evento; faixa de totais e CSV no mesmo recorte.
 * O período vem pela URL (de/até fixos), para não depender de hoje.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import HonorariosCenoPage from "@/pages/honorarios-ceno";
import type { HonorarioDoFinanceiro, Liberacao } from "./api";

const csv = vi.hoisted(() => ({ chamadas: [] as { arquivo: string; cabecalho: string[]; linhas: string[][]; preambulo: string[][] }[] }));
vi.mock("@/components/scaling-validation/event-view/event-view-shared", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/scaling-validation/event-view/event-view-shared")>();
  return {
    ...original,
    downloadCsv: (arquivo: string, cabecalho: string[], linhas: string[][], preambulo: string[][] = []) => {
      csv.chamadas.push({ arquivo, cabecalho, linhas, preambulo });
    },
  };
});

const rh = usuarioFake({ id: "u-rh", role: "financial", name: "Financeiro" });
const honorarios = usuarioFake({ id: "u-hon", role: "honorarios", name: "Romilson Teste" });

const lib = (id: string, data: string, valor: number): Liberacao => ({
  id, honorarioId: "x", data, oc: `OC-${id}`, valor, observacao: null, porNome: "Financeiro", createdAt: `${data}T10:00:00Z`,
  estornadaEm: null, estornadaPorNome: null, motivoEstorno: null,
});

function linha(id: string, nome: string, evento: { id: string; nome: string; inicio: string }, p: Partial<HonorarioDoFinanceiro> = {}): HonorarioDoFinanceiro {
  return {
    id, eventId: evento.id, tipo: "vaga", teamInclusionId: `v-${id}`, functionId: "f1", collaboratorId: `c-${id}`, nome,
    pessoas: null, descricao: null, setor: "montagem", posicao: "freela_local", inicio: evento.inicio, fim: evento.inicio, diarias: 1,
    valorPedido: 100_000, valorAprovado: 100_000, observacao: null, status: "aprovado", versao: 2, criadoPor: "u-pede", criadoPorNome: "Quem Pede",
    enviadoPor: "u-pede", enviadoPorNome: "Quem Pede", enviadoEm: "2026-09-01T10:00:00Z", decididoPor: "u-aprova", decididoPorNome: "Quem Aprova", decididoEm: "2026-09-02T10:00:00Z", motivoDecisao: null,
    createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", liberado: 0, falta: 100_000, eventName: evento.nome,
    eventStartDate: evento.inicio, eventEndDate: evento.inicio, inclusionNumber: 100, functionName: "Cenotécnica", vagaStatus: "escalado",
    vagaExcluida: false, avisoDaVaga: null, colaboradorAtualId: `c-${id}`, colaboradorAtual: nome, eventoExcluido: false,
    tipoFreela: "outro", semColaborador: false, vagasDaEmpreita: [], avisosDaEmpreita: [],
    podeEditar: false, podeRemover: false, podeDecidir: false, podeDevolver: false, podeLiberar: true, eAprovador: false,
    liberacoes: [],
    ...p,
  };
}

const OUT = { id: "e-out", nome: "Corrida de Outubro", inicio: "2026-10-18" };
const SET = { id: "e-set", nome: "Corrida de Setembro", inicio: "2026-09-13" };
const DADOS: HonorarioDoFinanceiro[] = [
  // A liberar: um de outubro (entra) e um de setembro (fica fora).
  linha("a1", "Ana Outubro", OUT),
  linha("a2", "Beto Setembro", SET),
  // Evento de SETEMBRO pago em OUTUBRO.
  linha("p1", "Caio Pago Em Outubro", SET, { liberado: 100_000, falta: 0, liberacoes: [lib("l1", "2026-10-05", 100_000)] }),
  // Evento de OUTUBRO pago em SETEMBRO (adiantado).
  linha("p2", "Duda Paga Em Setembro", OUT, { liberado: 100_000, falta: 0, liberacoes: [lib("l2", "2026-09-28", 100_000)] }),
];

const OUTUBRO = "periodo=personalizado&de=2026-10-01&ate=2026-10-31";

function montar(rota: string, user = rh) {
  mockarFetch((url) => {
    const caminho = url.split("?")[0];
    if (caminho === "/api/honorarios-ceno/acesso") return respostaJson({ podePedir: false, podeAprovar: false, podeLiberar: true, admin: false });
    if (caminho === "/api/honorarios-ceno/financeiro") return respostaJson(DADOS);
    return respostaJson([]);
  });
  return renderComTudo(<HonorariosCenoPage />, { user, rota });
}

beforeEach(() => { csv.chamadas = []; });

describe("Honorários — filtro por período", () => {
  it("A liberar: só os eventos que começam no período, com a faixa de totais no mesmo recorte", async () => {
    montar(`/honorarios-ceno?${OUTUBRO}`, honorarios);
    expect(await screen.findByRole("button", { name: "Registrar liberação de Ana Outubro" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar liberação de Beto Setembro" })).not.toBeInTheDocument();
    // Aprovado do período: Ana (1.000) + Duda (evento de outubro, 1.000).
    const totais = screen.getByTestId("hon-fin-totais");
    expect(totais).toHaveTextContent("R$ 2.000");
    expect(screen.getByTestId("hon-periodo-resumo")).toHaveTextContent("01/10/2026 a 31/10/2026");
    expect(screen.getByTestId("hon-periodo")).toHaveTextContent("01/10/2026 a 31/10/2026");
    expect(screen.getByRole("tab", { name: /A liberar/ })).toHaveTextContent("1");
  });

  it("Liberados: pela data da liberação (padrão) e, trocando a base, pela data do evento", async () => {
    const { user, historico } = montar(`/honorarios-ceno?aba=liberados&${OUTUBRO}`);
    expect(await screen.findByTestId("hon-liberado-p1")).toHaveTextContent("Caio Pago Em Outubro");
    expect(screen.queryByTestId("hon-liberado-p2")).not.toBeInTheDocument();
    const totais = screen.getByTestId("hon-fin-totais");
    expect(totais).toHaveTextContent("Liberado no período");
    expect(totais).toHaveTextContent("R$ 1.000");

    await user.click(screen.getByTestId("hon-periodo"));
    const painel = await screen.findByTestId("hon-periodo-painel");
    await user.click(within(painel).getByRole("radio", { name: "Data do evento" }));
    await waitFor(() => expect(screen.getByTestId("hon-liberado-p2")).toHaveTextContent("Duda Paga Em Setembro"));
    expect(screen.queryByTestId("hon-liberado-p1")).not.toBeInTheDocument();
    expect(historico.at(-1)).toContain("base=evento");
  });

  it("Relatórios: por evento só com o evento do período; o CSV leva o período no nome e nas linhas de abertura", async () => {
    const { user } = montar(`/honorarios-ceno?aba=relatorios&${OUTUBRO}`);
    const rel = await screen.findByTestId("hon-relatorios");
    expect(within(rel).getAllByText("Corrida de Outubro").length).toBeGreaterThan(0);
    expect(within(rel).queryByText("Corrida de Setembro")).not.toBeInTheDocument();
    expect(rel).toHaveTextContent("Período: eventos que começam em 01/10/2026 a 31/10/2026.");

    await user.click(screen.getByTestId("hon-exportar-relatorio"));
    expect(csv.chamadas).toHaveLength(1);
    const c = csv.chamadas[0];
    expect(c.arquivo).toBe("honorarios-cenotecnica-evento-2026-10-01-a-2026-10-31.csv");
    expect(c.preambulo).toContainEqual(["Período", "01/10/2026 a 31/10/2026 (data do evento)"]);
    expect(c.linhas.map((l) => l[0])).toEqual(["Corrida de Outubro", "Total"]);
  });

  it("Exportar linhas respeita o período e a base: em Liberados, só o pago no período, com a coluna do período", async () => {
    const { user } = montar(`/honorarios-ceno?aba=liberados&${OUTUBRO}`);
    await screen.findByTestId("hon-liberado-p1");
    await user.click(screen.getByTestId("hon-exportar-linhas"));
    const c = csv.chamadas[0];
    expect(c.arquivo).toBe("honorarios-cenotecnica-linhas-2026-10-01-a-2026-10-31-por-liberacao.csv");
    expect(c.preambulo[1]).toEqual(["Período", "01/10/2026 a 31/10/2026 (data da liberação)"]);
    expect(c.cabecalho).toContain("Liberado no período (R$)");
    expect(c.linhas.map((l) => l[2])).toEqual(["Caio Pago Em Outubro"]);
  });

  it("A liberar: Exportar linhas leva só os eventos do período; Limpar volta a tudo e tira o período da URL", async () => {
    const { user, historico } = montar(`/honorarios-ceno?${OUTUBRO}`);
    await screen.findByRole("button", { name: "Registrar liberação de Ana Outubro" });
    await user.click(screen.getByTestId("hon-exportar-linhas"));
    expect(csv.chamadas[0].arquivo).toBe("honorarios-cenotecnica-linhas-2026-10-01-a-2026-10-31.csv");
    expect(csv.chamadas[0].linhas.map((l) => l[2]).sort()).toEqual(["Ana Outubro", "Duda Paga Em Setembro"]);

    await user.click(screen.getByRole("button", { name: "Limpar período" }));
    expect(await screen.findByRole("button", { name: "Registrar liberação de Beto Setembro" })).toBeInTheDocument();
    expect(historico.at(-1)).not.toContain("periodo=");
    expect(screen.getByTestId("hon-periodo")).toHaveTextContent("Todo o período");
  });

  it("os atalhos gravam na URL (recarregar mantém) e o de/até livre vira “personalizado”", async () => {
    const { user, historico } = montar("/honorarios-ceno");
    await screen.findByRole("button", { name: "Registrar liberação de Ana Outubro" });
    await user.click(screen.getByTestId("hon-periodo"));
    const painel = await screen.findByTestId("hon-periodo-painel");
    await user.click(within(painel).getByRole("radio", { name: "Mês passado" }));
    expect(historico.at(-1)).toContain("periodo=mes-passado");
    await user.click(within(painel).getByRole("radio", { name: "Tudo" }));
    expect(historico.at(-1)).not.toContain("periodo=");
    const de = within(painel).getByTestId("hon-periodo-de");
    await user.type(de, "2026-09-01");
    await waitFor(() => expect(historico.at(-1)).toContain("periodo=personalizado"));
    expect(historico.at(-1)).toContain("de=2026-09-01");
  });

  it("período sem nada: estado próprio com “Limpar período”", async () => {
    const { user } = montar("/honorarios-ceno?periodo=personalizado&de=2030-01-01&ate=2030-01-31");
    expect(await screen.findByTestId("hon-fin-periodo-vazio")).toHaveTextContent("Nenhum evento neste período");
    await user.click(screen.getByTestId("hon-limpar-periodo"));
    expect(await screen.findByRole("button", { name: "Registrar liberação de Ana Outubro" })).toBeInTheDocument();
  });
});
