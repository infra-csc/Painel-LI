import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake } from "@/test/fixtures";
import { analisarPassagens, type PassagemParaAnalise } from "@shared/analise-de-passagens";
import AnalisesDePassagens from "./analises-de-passagens";
import { AbasDePassagens, abaDaUrl, comAba } from "./abas-de-passagens";
import { VISAO_PADRAO, visaoDaUrl, type VisaoDaAnalise } from "./url-da-analise";
import { filtersFromSearch } from "../filters-url";

/** A página guarda a visão (e a escreve na URL); aqui um estado local faz esse papel. */
function ComVisao({ onVerEvento, inicial = VISAO_PADRAO, onVisao }: { onVerEvento: (id: string) => void; inicial?: VisaoDaAnalise; onVisao?: (v: VisaoDaAnalise) => void }) {
  const [visao, setVisao] = useState(inicial);
  return <AnalisesDePassagens visao={visao} onVisao={(v) => { setVisao(v); onVisao?.(v); }} onVerEvento={onVerEvento} />;
}

const admin = usuarioFake({ id: "admin-1", role: "admin" });
const compras = usuarioFake({ id: "compras-1", role: "purchasing" });

let n = 0;
function p(x: Partial<PassagemParaAnalise>): PassagemParaAnalise {
  n += 1;
  return {
    ticketId: `t${n}`, teamInclusionId: `v${n}`, eventId: "ev-salvador", eventName: "Maratona de Salvador", eventStartDate: "2026-10-18",
    pessoaId: `p${n}`, arquivada: false, valor: 100_000, bagagem: null, dataCompra: "2026-09-01", dataIda: "2026-10-16", dataVolta: "2026-10-19",
    companhia: "LATAM", transporte: "aereo", origem: "GRU", destino: "SSA", ...x,
  };
}

// 2026-10-16 é sexta; 2026-10-13 é terça.
const RESULTADO = analisarPassagens([
  p({ valor: 150_000 }), p({ valor: 140_000 }), p({ valor: 130_000, bagagem: 20_000 }),
  p({ eventId: "ev-poa", eventName: "Night Run Porto Alegre", dataIda: "2026-10-13", valor: 60_000, destino: "POA" }),
  p({ eventId: "ev-poa", eventName: "Night Run Porto Alegre", dataIda: "2026-10-13", valor: 70_000, destino: "POA" }),
  p({ eventId: "ev-poa", eventName: "Night Run Porto Alegre", dataIda: "2026-10-13", valor: 80_000, destino: "POA" }),
  p({ eventId: "ev-poa", eventName: "Night Run Porto Alegre", valor: null }),
  p({ valor: 50_000, arquivada: true }),
], [{ eventId: "ev-salvador", resolvido: false }]);

const VAZIO = analisarPassagens([], []);

function montar(resposta: () => Response | Promise<Response>, user = admin, inicial?: VisaoDaAnalise) {
  const fetchMock = mockarFetch((url) => (url.startsWith("/api/tickets/analises") ? resposta() : respostaJson([])));
  const onVerEvento = vi.fn();
  const onVisao = vi.fn();
  const utils = renderComTudo(<ComVisao onVerEvento={onVerEvento} inicial={inicial} onVisao={onVisao} />, { user });
  return { ...utils, fetchMock, onVerEvento, onVisao };
}

describe("AnalisesDePassagens", () => {
  it("com dados: números do topo, dia mais caro/barato e evento que mais e menos gastou", async () => {
    const { fetchMock } = montar(() => respostaJson(RESULTADO));
    expect(screen.getByTestId("analise-carregando")).toBeInTheDocument();

    expect(await screen.findByTestId("kpi-gasto")).toHaveTextContent("R$ 7.000"); // R$ 6.800 de passagens (troca incluída) + R$ 200 de bagagem
    const url = urlsChamadas(fetchMock).find((u) => u.startsWith("/api/tickets/analises"))!;
    expect(url).toMatch(/^\/api\/tickets\/analises\?de=\d{4}-\d{2}-\d{2}$/); // padrão: últimos 3 meses e próximos

    expect(screen.getByTestId("kpi-passagens")).toHaveTextContent("8");
    expect(screen.getByTestId("kpi-passagens")).toHaveTextContent("em 2 eventos");
    expect(screen.getByTestId("kpi-trocas")).toHaveTextContent("R$ 500");
    expect(screen.getByTestId("fora-das-medias")).toHaveTextContent("1 passagem sem valor");
    expect(screen.getByTestId("poucos-dados")).toBeInTheDocument();

    // Que dia fica mais caro e mais barato.
    const dias = screen.getByTestId("analise-dias");
    expect(within(dias).getByTestId("dia-ida-Sex")).toHaveAttribute("data-destaque", "caro");
    expect(within(dias).getByTestId("dia-ida-Ter")).toHaveAttribute("data-destaque", "barato");
    expect(screen.getByTestId("analise-dias-resposta")).toHaveTextContent("na sexta");
    expect(screen.getByTestId("analise-dias-resposta")).toHaveTextContent("na terça");
    expect(dias).toHaveTextContent("passagem inteira (ida e volta juntas)");

    // Qual evento gastamos mais e menos.
    const resp = screen.getByTestId("analise-eventos-resposta");
    expect(resp).toHaveTextContent("Gastamos mais em Maratona de Salvador");
    expect(resp).toHaveTextContent("menos em Night Run Porto Alegre");

    expect(screen.getByTestId("remarcacoes-total")).toHaveTextContent("1");
  });

  it("alternar para 'Por pessoa' reordena, muda a frase e sobe para a visão (que vai para a URL)", async () => {
    const { user, onVisao } = montar(() => respostaJson(RESULTADO));
    await screen.findByTestId("analise-eventos");
    await user.click(screen.getByTestId("eventos-modo-pessoa"));
    expect(screen.getByTestId("analise-eventos-resposta")).toHaveTextContent("Por pessoa, gastamos mais em Maratona de Salvador");
    expect(onVisao).toHaveBeenLastCalledWith(expect.objectContaining({ ordem: "pessoa" }));
  });

  it("abre na visão que veio da URL: filtros na consulta e alternadores já escolhidos", async () => {
    const inicial = visaoDaUrl("aba=analises&an_periodo=tudo&an_cia=LATAM&an_trecho=volta&an_ordem=pessoa&an_grupo=companhias");
    const { fetchMock } = montar(() => respostaJson(RESULTADO), admin, inicial);
    await screen.findByTestId("analise-conteudo");
    expect(urlsChamadas(fetchMock)).toContain("/api/tickets/analises?companhia=LATAM");
    expect(screen.getByTestId("dias-trecho-volta")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("eventos-modo-pessoa")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("rotas-visao-companhias")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("tabela-companhias")).toBeInTheDocument();
  });

  it("clicar no evento leva à Lista filtrada por ele", async () => {
    const { user, onVerEvento } = montar(() => respostaJson(RESULTADO));
    await user.click(await screen.findByTestId("evento-ev-poa"));
    expect(onVerEvento).toHaveBeenCalledWith("ev-poa");
  });

  it("vazio: 'Nenhuma passagem registrada neste período' com saída para todo o histórico", async () => {
    const { user, fetchMock } = montar(() => respostaJson(VAZIO));
    expect(await screen.findByText("Nenhuma passagem registrada neste período")).toBeInTheDocument();
    await user.click(screen.getByTestId("vazio-ver-tudo"));
    expect(urlsChamadas(fetchMock)).toContain("/api/tickets/analises");
  });

  it("erro: alerta com 'Tentar de novo' que refaz a consulta", async () => {
    let chamadas = 0;
    const { user } = montar(() => {
      chamadas += 1;
      return chamadas === 1 ? respostaJson({ message: "Erro ao calcular as análises de passagens" }, 500) : respostaJson(RESULTADO);
    });
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível carregar as análises");
    await user.click(within(alerta).getByRole("button", { name: /Tentar de novo/ }));
    expect(await screen.findByTestId("kpi-gasto")).toBeInTheDocument();
  });
});

describe("AbasDePassagens", () => {
  it("admin vê Lista | Análises", () => {
    renderComTudo(<AbasDePassagens aba="lista" onAba={() => {}} />, { user: admin });
    expect(screen.getByRole("tablist", { name: "Modo da tela" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Análises/ })).toHaveAttribute("aria-selected", "false");
  });

  it("Compras não vê as abas (a tela fica como era)", () => {
    renderComTudo(<AbasDePassagens aba="analises" onAba={() => {}} />, { user: compras });
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByText("Análises")).not.toBeInTheDocument();
  });

  it("visão das Análises vai e volta pela URL, convivendo com os filtros da Lista", () => {
    const visao: VisaoDaAnalise = {
      filtros: { preset: "custom", de: "2026-01-01", ate: "2026-06-30", eventId: "ev-9", companhia: "", transporte: "rodoviario" },
      trecho: "volta", ordem: "pessoa", grupo: "transporte",
    };
    const qsLista = "event=ev-1&transport=aereo&periodo=custom&de=2026-10-01&ate=2026-10-31";
    const qs = comAba(qsLista, "analises", visao);
    // A visão volta igual…
    expect(visaoDaUrl(qs)).toEqual(visao);
    // …e os filtros da Lista também (os de/ate dela não se misturam com an_de/an_ate).
    expect(filtersFromSearch(qs).filters).toEqual(filtersFromSearch(qsLista).filters);
    // Padrão não suja a URL; lixo na URL cai no padrão.
    expect(comAba("", "analises", VISAO_PADRAO)).toBe("aba=analises");
    expect(visaoDaUrl("an_periodo=xyz&an_trecho=lado&an_de=31/12")).toEqual(VISAO_PADRAO);
    // Na Lista, a visão não vai para a URL.
    expect(comAba(qsLista, "lista", visao)).toBe(qsLista);
  });

  it("aba na URL sem quebrar os filtros", () => {
    expect(abaDaUrl("event=ev-1&aba=analises")).toBe("analises");
    expect(abaDaUrl("event=ev-1")).toBe("lista");
    expect(comAba("event=ev-1&status=pending", "analises")).toBe("event=ev-1&status=pending&aba=analises");
    expect(comAba("", "analises")).toBe("aba=analises");
    expect(comAba("event=ev-1", "lista")).toBe("event=ev-1");
  });
});
