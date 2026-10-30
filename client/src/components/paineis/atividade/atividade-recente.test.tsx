/**
 * Atividade recente (30/10): o feed agrupado por dia, o "novo desde a sua
 * última visita" (localStorage por usuário), os filtros que vão ao servidor
 * (tipo) e os do client (só não vistos), e o estado sem permissão.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { DIAS_PADRAO } from "@shared/prazos-da-escala";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import type { ItemDaAtividade, RespostaDaAtividade } from "../comum/atividade-tipos";
import { chaveDaUltimaVisita } from "../comum/ultima-visita";
import AtividadeRecente, { agruparPorDia } from "./atividade-recente";

const agora = Date.now();
const haMin = (m: number) => new Date(agora - m * 60_000).toISOString();

const item = (id: string, at: string, extra: Partial<ItemDaAtividade> = {}): ItemDaAtividade => ({
  id, at, tipo: "mudanca", titulo: "Período alterado", detalhe: "Período: 10/11 a 12/11 → 11/11 a 13/11", linhas: [], comentario: null,
  autor: "Pedro", destaque: false, eventId: "nr", eventName: "Night Run", quantidade: 1, funcoes: ["Staff"],
  precisaPassagem: false, precisaHotel: false, pedidoId: null, eventStartDate: null,
  vagas: [{ id: `v-${id}`, numero: 4821, funcao: "Staff", colaborador: "ANA", fase: "escalacao", status: "escalado", excluida: false, precisaPassagem: false, precisaHotel: false, pedidoPendenteId: null, trocaPendente: false }],
  ...extra,
});

const NOVO = item("a1", haMin(5), { tipo: "inclusao", titulo: "Colaborador incluído: JOANA", destaque: true });
const VELHO = item("a2", haMin(300), { tipo: "pedido", titulo: "Pedido de ajuste aberto", pedidoId: "p7", comentario: "Voo antecipado" });

function resposta(itens: ItemDaAtividade[]): RespostaDaAtividade {
  return {
    itens, proximo: null, total: itens.length, resumo: { inclusao: 1, mudanca: 0, passagem: 0, hotel: 0, pedido: 1 },
    desde: haMin(1440), geradoEm: new Date().toISOString(), cortado: false,
  };
}

function montar(opcoes: { status?: number; rota?: string } = {}) {
  const user = usuarioFake({ id: "u-ana", role: "purchasing" });
  const fetchMock = mockarFetch((url) => {
    if (url.startsWith("/api/paineis/atividade")) {
      if (opcoes.status) return respostaJson({ message: "Sem permissão" }, opcoes.status, url);
      const tipo = new URLSearchParams(url.split("?")[1]).get("tipo");
      return respostaJson(resposta(tipo === "pedido" ? [VELHO] : [NOVO, VELHO]), 200, url);
    }
    if (url.startsWith("/api/escala/prazos")) return respostaJson({ dias: DIAS_PADRAO }, 200, url);
    return respostaJson([], 200, url);
  });
  const r = renderComTudo(<AtividadeRecente />, { user, rota: opcoes.rota ?? "/paineis/atividade", queryClient: criarQueryClientComApi() });
  return { ...r, fetchMock };
}

beforeEach(() => {
  // A última visita foi há 1 h: o item de 5 min é novo, o de 5 h não.
  window.localStorage.setItem(chaveDaUltimaVisita("u-ana"), haMin(60));
});

describe("Atividade recente", () => {
  it("lista o feed por dia, com o selo 'novo' só no que veio depois da última visita", async () => {
    montar();
    const novo = await screen.findByTestId("atividade-a1");
    expect(within(novo).getByTestId("selo-novo")).toBeInTheDocument();
    expect(within(screen.getByTestId("atividade-a2")).queryByTestId("selo-novo")).toBeNull();
    expect(screen.getByTestId("contagem-novos")).toHaveTextContent("1 novo desde a sua última visita");
    // Cada linha leva à tela onde se resolve.
    expect(screen.getByTestId("atividade-a2")).toHaveAttribute("href", "/scaling-approval?eventId=nr&request=p7");
    expect(screen.getByText("“Voo antecipado”")).toBeInTheDocument();
  });

  it("tipo vai ao servidor; a contagem de cada tipo vem do resumo", async () => {
    const { user, fetchMock } = montar();
    await screen.findByTestId("atividade-a1");
    expect(screen.getByTestId("tipo-pedido")).toHaveTextContent("1");
    await user.click(screen.getByTestId("tipo-pedido"));
    await waitFor(() => expect(urlsChamadas(fetchMock).some((u) => u.includes("tipo=pedido"))).toBe(true));
    await waitFor(() => expect(screen.queryByTestId("atividade-a1")).toBeNull());
    expect(screen.getByTestId("atividade-a2")).toBeInTheDocument();
  });

  it("'Só não vistos' esconde o que já foi visto; 'Marcar tudo como visto' tira os selos e grava a visita", async () => {
    const { user } = montar();
    await screen.findByTestId("atividade-a1");
    await user.click(screen.getByTestId("filtro-nao-vistos"));
    expect(screen.queryByTestId("atividade-a2")).toBeNull();
    expect(screen.getByTestId("atividade-a1")).toBeInTheDocument();
    await user.click(screen.getByTestId("filtro-nao-vistos"));
    await user.click(screen.getByTestId("button-marcar-vistos"));
    expect(screen.queryAllByTestId("selo-novo")).toHaveLength(0);
    expect(new Date(window.localStorage.getItem(chaveDaUltimaVisita("u-ana"))!).getTime()).toBeGreaterThan(agora - 1000);
  });

  it("os filtros vêm da URL (link da Visão geral)", async () => {
    const { fetchMock } = montar({ rota: "/paineis/atividade?tipo=pedido&periodo=7d" });
    await screen.findByTestId("atividade-a2");
    expect(urlsChamadas(fetchMock).find((u) => u.startsWith("/api/paineis/atividade"))).toContain("periodo=7d");
    expect(screen.getByTestId("tipo-pedido")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("periodo-7d")).toHaveAttribute("aria-checked", "true");
  });

  it("403 → sem acesso, sem filtros", async () => {
    montar({ status: 403 });
    expect(await screen.findByText("Sem acesso à atividade")).toBeInTheDocument();
    expect(screen.queryByTestId("filtros-atividade")).toBeNull();
  });
});

describe("agruparPorDia", () => {
  it("cabeçalho por dia, na ordem do feed", () => {
    const hoje = new Date(2026, 9, 30, 15);
    const g = agruparPorDia([
      item("1", new Date(2026, 9, 30, 14).toISOString()),
      item("2", new Date(2026, 9, 30, 9).toISOString()),
      item("3", new Date(2026, 9, 29, 20).toISOString()),
    ], hoje);
    expect(g.map((x) => [x.dia, x.itens.length])).toEqual([["Hoje", 2], ["Ontem", 1]]);
  });
});
