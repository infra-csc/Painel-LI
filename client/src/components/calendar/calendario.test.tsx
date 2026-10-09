/**
 * Calendário (07/10, redesenho) — a tela inteira com a API simulada e "hoje"
 * fixo em 07/10/2026.
 *
 * O que se garante: o resumo da barra (ativos, em andamento agora, recorte),
 * a grade do mês com as barras faladas por extenso, o painel do evento com a
 * escala e os atalhos que o papel abre (a Área de Função não vê "Espelho
 * operacional", que ela não acessa), o período vazio dizendo por quê e
 * levando ao período do evento, o erro com "Tentar novamente", a Lista com o
 * marco dos meses anteriores, o "nenhum resultado" com "Limpar filtros" e as
 * setas do teclado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { eventoFake, vagaFake } from "@/test/fixtures-dominio";
import CalendarPage from "@/pages/calendar";

const admin = usuarioFake({ id: "admin-1", role: "admin", name: "Helena Martins" });
const area = usuarioFake({ id: "u-bruno", role: "function_area", name: "Bruno Cardoso" });

const maratona = eventoFake({ id: "ev-sp", name: "Maratona de São Paulo", location: "Ibirapuera, São Paulo - SP", startDate: "2026-10-06", endDate: "2026-10-09" });
const meia = eventoFake({ id: "ev-rio", name: "Meia do Rio", location: "Aterro do Flamengo", startDate: "2026-10-16", endDate: "2026-10-17" });
const antiga = eventoFake({ id: "ev-bh", name: "Corrida de Setembro", location: "Belo Horizonte", startDate: "2026-09-10", endDate: "2026-09-12" });
const novembro = eventoFake({ id: "ev-poa", name: "Prova de Novembro", location: "Porto Alegre", startDate: "2026-11-14", endDate: "2026-11-15" });
const excluida = eventoFake({ id: "ev-x", name: "Prova Excluída", status: "excluído", startDate: "2026-10-20", endDate: "2026-10-20" });

function montar({ user = admin, rota = "/calendar", eventos = [maratona, meia, antiga, novembro, excluida], falharEventos = 0 } = {}) {
  let falhas = falharEventos;
  const fetchMock = mockarFetch((url) => {
    const caminho = url.split("?")[0];
    if (caminho === "/api/events") {
      if (falhas > 0) { falhas--; return respostaJson({ message: "Falha ao consultar o banco." }, 500); }
      return respostaJson(eventos);
    }
    if (caminho === "/api/team-inclusions") return respostaJson([
      vagaFake({ eventId: "ev-sp", collaboratorId: "c1", functionId: "f1" }),
      vagaFake({ eventId: "ev-sp", collaboratorId: "c2", functionId: "f1" }),
    ]);
    return respostaJson([]);
  });
  const utils = renderComTudo(<CalendarPage />, { user, queryClient: criarQueryClientComApi(), rota });
  return { ...utils, fetchMock };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 7, 10, 0, 0));
});
afterEach(() => { vi.useRealTimers(); });

describe("Calendário — Mês", () => {
  it("resume os ativos na barra e desenha as barras do mês com o nome falado", async () => {
    montar();
    expect(await screen.findByTestId("cal-resumo")).toHaveTextContent("4 eventos ativos · 1 em andamento agora");
    expect(screen.getByTestId("cal-periodo")).toHaveTextContent("outubro de 2026");
    expect(screen.getByTestId("cal-contagem-periodo")).toHaveTextContent("2 eventos no mês");
    expect(screen.getByRole("button", { name: "Maratona de São Paulo, 6 a 9 de outubro de 2026, Em andamento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Meia do Rio, .*Planejado$/ })).toBeInTheDocument();
    // Excluído nunca aparece no calendário.
    expect(screen.queryByText("Prova Excluída")).not.toBeInTheDocument();
  });

  it("abre o painel com a escala do evento e os dois atalhos para quem acessa as duas telas", async () => {
    const { user, fetchMock } = montar();
    await user.click(await screen.findByRole("button", { name: /^Maratona de São Paulo,/ }));
    const painel = await screen.findByRole("dialog", { name: "Maratona de São Paulo" });
    expect(within(painel).getByText("Ibirapuera, São Paulo - SP")).toBeInTheDocument();
    expect(within(painel).getByText(/4 dias/)).toBeInTheDocument();
    await waitFor(() => expect(within(painel).getByTestId("cal-painel-colaboradores")).toHaveTextContent("2"));
    expect(within(painel).getByTestId("cal-painel-funcoes")).toHaveTextContent("1");
    expect(within(painel).getByText("função")).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(c => String(c[0]))).toContain("/api/team-inclusions?eventId=ev-sp");
    expect(within(painel).getByRole("link", { name: "Ver escala" })).toHaveAttribute("href", "/scaling");
    expect(within(painel).getByRole("link", { name: "Espelho operacional" })).toHaveAttribute("href", "/operational-mirror?eventId=ev-sp");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Área de Função (entra pelo Calendário) não recebe o atalho do Espelho, que não abre para ela", async () => {
    const { user } = montar({ user: area });
    await user.click(await screen.findByRole("button", { name: /^Maratona de São Paulo,/ }));
    const painel = await screen.findByRole("dialog", { name: "Maratona de São Paulo" });
    expect(within(painel).getByRole("link", { name: "Ver escala" })).toBeInTheDocument();
    expect(within(painel).queryByRole("link", { name: "Espelho operacional" })).not.toBeInTheDocument();
  });

  it("período vazio por filtro: diz por quê e volta para o mês do último evento", async () => {
    const { user } = montar({ rota: "/calendar?status=concluído" });
    expect(await screen.findByTestId("cal-resumo")).toHaveTextContent("1 de 4 eventos · com busca ou filtro");
    const aviso = screen.getByTestId("cal-aviso-periodo");
    expect(aviso).toHaveTextContent("Nenhum evento em outubro com esses filtros");
    expect(aviso).toHaveTextContent("Último: Corrida de Setembro");
    await user.click(within(aviso).getByRole("button", { name: /Voltar para setembro/ }));
    expect(await screen.findByTestId("cal-periodo")).toHaveTextContent("setembro de 2026");
    expect(screen.getByRole("button", { name: /^Corrida de Setembro,/ })).toBeInTheDocument();
  });

  it("mês sem evento leva ao próximo; as setas do teclado mudam o mês e H volta para hoje", async () => {
    const { user } = montar({ rota: "/calendar?mes=2026-08" });
    const aviso = await screen.findByTestId("cal-aviso-periodo");
    expect(aviso).toHaveTextContent("Nenhum evento em agosto");
    expect(aviso).toHaveTextContent("Próximo: Corrida de Setembro");
    await user.click(within(aviso).getByRole("button", { name: /Ir para setembro/ }));
    expect(await screen.findByTestId("cal-periodo")).toHaveTextContent("setembro de 2026");
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByTestId("cal-periodo")).toHaveTextContent("outubro de 2026");
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByTestId("cal-periodo")).toHaveTextContent("novembro de 2026");
    await user.keyboard("h");
    expect(await screen.findByTestId("cal-periodo")).toHaveTextContent("outubro de 2026");
    expect(screen.getByTestId("cal-hoje")).toBeDisabled();
  });

  it("erro ao carregar mostra o motivo e 'Tentar novamente' busca de novo", async () => {
    const { user } = montar({ falharEventos: 1 });
    const erro = await screen.findByTestId("cal-erro");
    expect(erro).toHaveTextContent("Não foi possível carregar o calendário");
    expect(erro).toHaveTextContent("Falha ao consultar o banco.");
    await user.click(within(erro).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("button", { name: /^Maratona de São Paulo,/ })).toBeInTheDocument();
  });
});

describe("Calendário — Semana e Lista", () => {
  it("Semana: o chip diz em que dia do evento se está", async () => {
    montar({ rota: "/calendar?visao=week" });
    const semana = await screen.findByTestId("cal-semana");
    expect(screen.getByTestId("cal-periodo")).toHaveTextContent("5–11 de outubro de 2026");
    const quarta = within(semana).getByRole("region", { name: /^Quarta, 7:/ });
    expect(quarta).toHaveTextContent("Dia 2 de 4");
  });

  it("Lista: meses a partir do atual, o marco dos anteriores e a linha que abre o painel", async () => {
    const { user } = montar({ rota: "/calendar?visao=list" });
    const lista = await screen.findByTestId("cal-lista");
    const titulos = within(lista).getAllByRole("heading", { level: 2 }).map(h => h.textContent);
    expect(titulos).toEqual(["outubro de 2026", "novembro de 2026", "setembro de 2026"]);
    expect(within(lista).getByText("Meses anteriores")).toBeInTheDocument();
    expect(within(lista).getByText("termina em 2 dias")).toBeInTheDocument();
    await user.click(within(lista).getByRole("button", { name: /^Meia do Rio,/ }));
    expect(await screen.findByRole("dialog", { name: "Meia do Rio" })).toBeInTheDocument();
  });

  it("Lista sem resultado: diz o que a busca procura e 'Limpar filtros' devolve tudo", async () => {
    const { user } = montar({ rota: "/calendar?visao=list&q=zzz" });
    const vazio = await screen.findByTestId("cal-lista-vazia");
    expect(vazio).toHaveTextContent("Nenhum evento com esses filtros");
    await user.click(within(vazio).getByRole("button", { name: "Limpar filtros" }));
    expect(await screen.findByTestId("cal-lista")).toBeInTheDocument();
    expect(screen.getByTestId("cal-busca")).toHaveValue("");
  });
});
