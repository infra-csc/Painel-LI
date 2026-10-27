/**
 * Módulo de Honorários, Fase 0 (26/10) — componentes:
 *  - menu novo (grupo "Honorários", etapas, "Configuração e apoio", nomes
 *    antigos na busca, Contratos só com a página, perfil Honorários);
 *  - trilha única (registro e evento, "em breve", desvios);
 *  - pré-aprovação (diálogo com a prévia; interruptor "não exibir valores");
 *  - legado (seletor de evento esconde; "Concluir em lote" pede motivo).
 */
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { eventoFake, linhaRhFake } from "@/test/fixtures-dominio";
import { orcamentoFake, vagaDoPlanejado } from "@/test/orcamento-fixture";
import { SidebarProvider } from "@/contexts/sidebar-context";
import Sidebar from "@/components/layout/sidebar";
import CommandPalette from "@/components/layout/command-palette";
import { MENU_GROUPS, TELAS_PRESENTES, breadcrumbFor, rotuloComEtapa, tabById, visibleGroups } from "@/components/layout/nav-items";
import { EventSearchSelect } from "@/components/event-select";
import { posicaoNaTrilha, contarNaTrilha } from "@shared/trilha-honorarios";
import { TrilhaDoEvento, TrilhaDoRegistro } from "./trilha-do-honorario";
import { OcultarValoresDoEvento, PreAprovarDialog } from "@/components/budget/pre-aprovacao";
import { ConcluirLegadoDialog } from "@/components/rh/legado";

const dp = usuarioFake({ id: "u-dp", role: "financial", name: "Diana DP" });
const semFetch = () => mockarFetch(() => respostaJson([]));

describe("Menu: o grupo Financeiro virou Honorários (slide 11)", () => {
  it("o fluxo na ordem (sem números) e a configuração embaixo; Ordens de compra e Pagamentos não existem ainda", () => {
    const grupo = MENU_GROUPS.find((g) => g.title === "Honorários");
    expect(grupo).toBeDefined();
    expect(MENU_GROUPS.some((g) => g.title === "Financeiro")).toBe(false);
    const nomes = grupo!.ids.map((id) => tabById(id)).filter(Boolean).map((t) => rotuloComEtapa(t!));
    // 27/10 (Fase 1): "Presença no evento" entra entre a Pré-aprovação e o Realizado.
    expect(nomes.slice(0, 6)).toEqual(["Painel de honorários", "Pré-aprovação de valores", "Presença no evento", "Realizado", "Conferência DP", "Notas fiscais"]);
    expect(grupo!.subgroup).toMatchObject({ label: "Configuração e apoio" });
    expect(grupo!.subgroup!.ids.map((id) => tabById(id)?.label)).toEqual([
      "Tabela de valores", "Regras de cálculo", "Honorários da cenotécnica", "Cartão Flash", "Contratos (CNPJ)",
    ]);
    expect(nomes.join(" ")).not.toMatch(/Ordens de compra|Pagamentos/);
    // Decisão do dono (26/10): "Aprovação de honorários" segue no Operacional › Escala.
    const operacional = MENU_GROUPS.find((g) => g.title === "Operacional")!;
    expect(operacional.ids.indexOf("aprovacao-de-honorarios")).toBe(operacional.ids.indexOf("scaling-approval") + 1);
  });

  it("trilha do topo e título com os nomes novos (sem o número)", () => {
    expect(breadcrumbFor("/budget-planned")).toMatchObject({ trail: ["Honorários"], label: "Pré-aprovação de valores" });
    expect(breadcrumbFor("/flash-account")).toMatchObject({ trail: ["Honorários", "Configuração e apoio"], label: "Cartão Flash" });
    expect(breadcrumbFor("/rh-control")?.label).toBe("Painel de honorários");
  });

  it("Contratos (CNPJ) aparece só se a página existir no build — para admin e DP", () => {
    const temPagina = TELAS_PRESENTES.has("contratos");
    const telasDoDp = visibleGroups(dp).flatMap((g) => g.items.map((i) => i.id));
    expect(telasDoDp.includes("contratos")).toBe(temPagina);
    const producao = visibleGroups(usuarioFake({ role: "production" })).flatMap((g) => g.items.map((i) => i.id));
    expect(producao).not.toContain("contratos");
  });

  it("o menu desenha o sub-rótulo, sem números; a busca acha pelo nome antigo", async () => {
    semFetch();
    const { user } = renderComTudo(<SidebarProvider><Sidebar /></SidebarProvider>, { user: dp, rota: "/budget-planned" });
    const menu = screen.getByRole("complementary", { name: "Menu principal" });
    expect(within(menu).queryByTestId("etapa-budget-planned")).toBeNull();
    expect(within(menu).getByText("Configuração e apoio")).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: /Pré-aprovação de valores/ })).toHaveAttribute("aria-current", "page");
    await user.type(within(menu).getByLabelText("Buscar tela no menu"), "Controle RH");
    expect(within(menu).getByText("Painel de honorários")).toBeInTheDocument();
    expect(within(menu).queryByText("Pré-aprovação de valores")).toBeNull();
  });

  it("⌘K acha a tela pelo nome antigo ('Comparativo' → Conferência DP)", async () => {
    semFetch();
    const { user } = renderComTudo(<CommandPalette open onOpenChange={() => {}} />, { user: dp, rota: "/" });
    const dialogo = await screen.findByRole("dialog");
    await user.type(within(dialogo).getByPlaceholderText(/Buscar tela/), "Comparativo");
    await waitFor(() => expect(within(dialogo).getAllByRole("option").map((o) => o.textContent)).toEqual([expect.stringContaining("Conferência DP")]));
  });
});

describe("Trilha única do honorário (slide 8)", () => {
  it("registro: feitas, a esperada, OC e Pago 'em breve' e o que falta", () => {
    renderComTudo(<TrilhaDoRegistro posicao={posicaoNaTrilha({ realizado: { sentForReview: true, rhStatus: "pendente" } })} />);
    const trilha = screen.getByTestId("trilha-do-registro");
    expect(trilha).toHaveAttribute("data-etapa", "confirmado");
    const etapas = within(trilha).getAllByRole("listitem");
    expect(etapas).toHaveLength(9);
    expect(etapas.map((e) => e.getAttribute("data-estado"))).toEqual(["feita", "feita", "feita", "feita", "atual", "em_breve", "futura", "futura", "em_breve"]);
    expect(screen.getByTestId("trilha-aguardando")).toHaveTextContent("Aguardando a conferência do DP");
  });

  it("registro devolvido: o selo do desvio aparece", () => {
    renderComTudo(<TrilhaDoRegistro posicao={posicaoNaTrilha({ realizado: { sentForReview: true, rhStatus: "devolvido" } })} />);
    expect(screen.getByTestId("trilha-aguardando")).toHaveTextContent(/Devolvido.*corre/);
  });

  it("evento: quantos estão em cada etapa e os desvios", () => {
    const contagem = contarNaTrilha([
      posicaoNaTrilha({}), posicaoNaTrilha({}),
      posicaoNaTrilha({ planejado: { status: "pre_aprovado" } }),
      posicaoNaTrilha({ realizado: { sentForReview: true, rhStatus: "rejeitado" } }),
    ]);
    renderComTudo(<TrilhaDoEvento contagem={contagem} foco={["previsto", "pre_aprovado"]} />);
    expect(screen.getByTestId("trilha-evento-previsto")).toHaveTextContent("2");
    expect(screen.getByTestId("trilha-evento-pre_aprovado")).toHaveTextContent("1");
    expect(screen.getByTestId("trilha-evento-pago")).toHaveTextContent(/em breve/i);
    expect(screen.getByTestId("trilha-desvios")).toHaveTextContent("1 recusado");
  });

  it("o cartão do Painel abre com a trilha do registro (fixture com NF enviada)", () => {
    const linha = linhaRhFake();
    expect(linha.trilha.etapa).toBe("confirmado");
  });
});

describe("Pré-aprovação do DP", () => {
  const nome = () => "Ana Souza";
  const funcao = () => "Produção";
  it("o diálogo mostra quem entra, o total e o que fica de fora; confirma com as vagas", async () => {
    const a = orcamentoFake();
    const b = orcamentoFake({ vaga: vagaDoPlanejado({ id: "vaga-2", collaboratorId: "colab-2" }) });
    const onConfirm = vi.fn();
    const { user } = renderComTudo(
      <PreAprovarDialog
        pedido={{ alvos: [a, b], origem: "evento", deFora: { enviados: 2, ausentes: 1, jaPreAprovados: 0 } }}
        onClose={() => {}} onConfirm={onConfirm} pending={false}
        nomeDaVaga={nome} getFunctionName={funcao} situacaoDe={() => "pendente"}
      />,
    );
    const dialogo = screen.getByTestId("dialogo-pre-aprovar");
    expect(within(dialogo).getByText("Pré-aprovar 2 colaboradores?")).toBeInTheDocument();
    expect(screen.getByTestId("pre-aprovar-de-fora")).toHaveTextContent("2 já no Realizado · 1 não participou");
    await user.click(screen.getByTestId("pre-aprovar-confirmar"));
    expect(onConfirm).toHaveBeenCalledWith([a, b]);
  });

  it("'Não exibir valores': ligado por padrão; o DP desliga (PATCH), quem não é DP só lê", async () => {
    const evento = eventoFake({ id: "ev-1", ocultarValoresColaborador: true });
    const fetchMock = mockarFetch((url, init) => {
      if (url.includes("/ocultar-valores") && init?.method === "PATCH") return respostaJson({ ...evento, ocultarValoresColaborador: false });
      return respostaJson([]);
    });
    const { user, unmount } = renderComTudo(<OcultarValoresDoEvento evento={evento} podeMudar />, { user: dp });
    const chave = screen.getByTestId("ocultar-valores-chave");
    expect(chave).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("ocultar-valores")).toHaveTextContent("O colaborador não verá os valores até a OC.");
    await user.click(chave);
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u).includes("/api/events/ev-1/ocultar-valores") && (i as RequestInit)?.body === JSON.stringify({ ocultar: false }))).toBe(true));
    unmount();

    renderComTudo(<OcultarValoresDoEvento evento={evento} podeMudar={false} />, { user: usuarioFake({ role: "production" }) });
    expect(screen.getByTestId("ocultar-valores-chave")).toBeDisabled();
  });
});

describe("Legado (data de corte 01/11/2026)", () => {
  it("o seletor de evento esconde o legado por padrão e mostra com o filtro", async () => {
    semFetch();
    const antigo = eventoFake({ id: "ev-antigo", name: "Corrida de Outubro", startDate: "2026-10-10", endDate: "2026-10-12" });
    const novo = eventoFake({ id: "ev-novo", name: "Maratona de Dezembro", startDate: "2026-12-05", endDate: "2026-12-07" });
    let mostrar = false;
    const ehLegado = (e: { endDate?: string | null } | null | undefined) => (e?.endDate ?? "") < "2026-11-01";
    const legado = { ehLegado, ocultavel: ehLegado, mostrar, setMostrar: (v: boolean) => { mostrar = v; }, dataDeCorte: "2026-11-01" };
    const { user, rerender } = renderComTudo(<EventSearchSelect value="" onValueChange={() => {}} events={[antigo, novo]} legado={legado} />);
    await user.click(screen.getByRole("button", { name: "Selecionar evento" }));
    const lista = screen.getByRole("listbox", { name: "Eventos" });
    expect(within(lista).getByText("Maratona de Dezembro")).toBeInTheDocument();
    expect(within(lista).queryByText("Corrida de Outubro")).toBeNull();
    expect(screen.getByTestId("evento-mostrar-legado")).toHaveTextContent("1 terminou antes de 01/11/2026");
    rerender(<EventSearchSelect value="" onValueChange={() => {}} events={[antigo, novo]} legado={{ ...legado, mostrar: true }} />);
    expect(within(screen.getByRole("listbox", { name: "Eventos" })).getByText("Corrida de Outubro")).toBeInTheDocument();
    expect(within(screen.getByRole("listbox", { name: "Eventos" })).getByText("Legado")).toBeInTheDocument();
  });

  it("'Concluir em lote' exige motivo e manda os ids das linhas", async () => {
    const fetchMock = mockarFetch((url) => (url.includes("/legado/concluir") ? respostaJson({ concluidas: 2, jaConcluidas: 0, recusadas: [] }) : respostaJson([])));
    const itens = [linhaRhFake({ id: "pl-1" }), linhaRhFake({ id: "ti-2" })];
    const onClose = vi.fn();
    const { user } = renderComTudo(<ConcluirLegadoDialog itens={itens} aberto onClose={onClose} recorteDescrito="Todos os eventos do legado" />, { user: dp });
    const confirmar = screen.getByTestId("concluir-legado-confirmar");
    expect(confirmar).toBeDisabled();
    await user.type(screen.getByTestId("motivo-legado"), "ok");
    expect(confirmar).toBeDisabled();
    await user.type(screen.getByTestId("motivo-legado"), " — pagos fora do sistema");
    await user.click(confirmar);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const chamada = fetchMock.mock.calls.find(([u]) => String(u).includes("/legado/concluir"));
    expect(JSON.parse(String((chamada?.[1] as RequestInit).body))).toEqual({ ids: ["pl-1", "ti-2"], motivo: "ok — pagos fora do sistema" });
  });
});
