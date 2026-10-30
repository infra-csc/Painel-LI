/**
 * Painel da escala (30/10) — componentes: as células levam ao detalhe exato
 * do Quadro, as esperas ao lugar onde se resolvem, a comparação respeita quem
 * vê valores, e a aba/eventos ficam na URL.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { TeamInclusion } from "@shared/schema";
import { DIAS_PADRAO } from "@shared/prazos-da-escala";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { eventoFake, vagaFake } from "@/test/fixtures-dominio";
import { analisarPorEvento } from "@/components/scaling/scaling-analytics-data";
import { atrasosPorEvento, esperasPorEvento, type ContextoDaComparacao, type ContextoDoPainel } from "./painel-escala-dados";
import { AtrasosPorEvento } from "./atrasos-por-evento";
import { AguardandoDecisao } from "./aguardando-decisao";
import { CompararEventos } from "./comparar-eventos";
import { SeletorDeAba, useEstadoNaUrl } from "./painel-da-escala";

const HOJE = new Date(2026, 9, 30);
const NOMES: Record<string, string> = {
  serra: "VIVA ESPORTE - SERRA - ETAPA COM UM NOME BEM LONGO PARA CORTAR",
  fundao: "Viva Esporte - Fundão",
  recife: "Night Run - Recife",
};
const DATAS: Record<string, { startDate: string; endDate: string; diaEventoInicio?: string; diaEventoFim?: string }> = {
  serra: { startDate: "2026-11-01", endDate: "2026-11-08", diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-06" },
  fundao: { startDate: "2026-11-15", endDate: "2026-11-22", diaEventoFim: "2026-11-20" },
  recife: { startDate: "2027-02-01", endDate: "2027-02-07", diaEventoFim: "2027-02-07" },
};
const ctx: ContextoDoPainel = {
  temNome: (i) => !!i.collaboratorId,
  temTroca: () => false,
  temPedido: () => false,
  getEventName: (id) => NOMES[id ?? ""] ?? "?",
  getFunctionName: (id) => ({ prod: "Produtor", kit: "Kit" } as Record<string, string>)[id ?? ""] ?? "?",
  getCollaboratorName: (id) => (id ? `Colab ${id}` : "Não escalado"),
  getEventDates: (id) => (id ? DATAS[id] : undefined),
  temPassagem: () => false,
  temHotel: () => false,
  quemAge: (tipo) => (tipo === "validacao" ? ["Gabrielle"] : ["Marcos"]),
};
const v = (over: Partial<TeamInclusion>) => vagaFake({
  collaboratorId: null, functionId: "prod", status: "planejado", phase: "inclusao", eventId: "serra",
  scheduleStartDate: "2026-11-01", scheduleEndDate: "2026-11-08", workDays: null, updatedAt: new Date(2026, 9, 29), ...over,
});

function linhas() {
  return [
    v({ phase: "sugestao", status: "sugestao_pendente", suggestionSentAt: new Date(2026, 9, 22) }),
    v({ phase: "sugestao", status: "sugestao_pendente", suggestionSentAt: new Date(2026, 9, 25) }),
    v({}),
    // Fundão (20/11): validação D-51 = 30/09 vencida; aprovação esperando há 1 dia, prazo vencido.
    v({ eventId: "fundao", phase: "sugestao", status: "sugestao_validada", validatedAt: new Date(2026, 9, 29), scheduleStartDate: "2026-11-15", scheduleEndDate: "2026-11-22" }),
    v({ eventId: "fundao", collaboratorId: "c1", status: "escalado", functionId: "kit", scheduleStartDate: "2026-11-15", scheduleEndDate: "2026-11-22" }),
    // Recife (07/02/2027): esperando validação há 1 dia, tudo no prazo.
    v({ eventId: "recife", phase: "sugestao", status: "sugestao_pendente", suggestionSentAt: new Date(2026, 9, 29), scheduleStartDate: "2027-02-01", scheduleEndDate: "2027-02-07" }),
  ];
}

describe("Atrasos por evento", () => {
  it("uma linha por evento atrasado, com as vagas e os dias de atraso de cada etapa", () => {
    const eventos = analisarPorEvento(linhas(), ctx, HOJE);
    renderComTudo(<AtrasosPorEvento linhas={atrasosPorEvento(eventos, ctx, HOJE, DIAS_PADRAO)} ctx={ctx} hoje={HOJE} dias={DIAS_PADRAO} />, { user: usuarioFake({ role: "admin" }), rota: "/paineis/escala" });
    expect(screen.getByTestId("atraso-serra")).toBeInTheDocument();
    expect(screen.queryByTestId("atraso-recife")).not.toBeInTheDocument();
    expect(screen.getByTestId("celula-validacao-serra")).toHaveTextContent("244 dias de atraso");
    expect(screen.getByTestId("celula-escalacao-serra")).toHaveTextContent("140 dias de atraso");
    // Nome longo: inteiro no title, em até 2 linhas na tela.
    expect(within(screen.getByTestId("atraso-serra")).getByTitle(NOMES.serra)).toHaveClass("line-clamp-2");
    expect(screen.getByTestId("grafico-etapa-validacao")).toHaveTextContent("2 atrasadas");
  });

  it("a célula abre o detalhe do Quadro com exatamente aquelas vagas e o atalho para a Validação", async () => {
    const eventos = analisarPorEvento(linhas(), ctx, HOJE);
    const { user, historico } = renderComTudo(<AtrasosPorEvento linhas={atrasosPorEvento(eventos, ctx, HOJE, DIAS_PADRAO)} ctx={ctx} hoje={HOJE} dias={DIAS_PADRAO} />, { user: usuarioFake({ role: "admin" }), rota: "/paineis/escala" });
    await user.click(screen.getByTestId("celula-validacao-serra"));
    const detalhe = await screen.findByTestId("detalhe-etapa");
    expect(detalhe).toHaveTextContent("2 a validar");
    await user.click(within(detalhe).getByRole("button", { name: /Abrir na Validação/ }));
    expect(historico.at(-1)).toBe("/scaling-validation?eventId=serra");
  });

  it("nada atrasado: estado vazio que diz o que foi conferido", () => {
    renderComTudo(<AtrasosPorEvento linhas={[]} ctx={ctx} hoje={HOJE} dias={DIAS_PADRAO} />, { user: usuarioFake({ role: "admin" }) });
    expect(screen.getByTestId("atrasos-vazio")).toHaveTextContent("Nenhuma etapa da escala atrasada");
  });
});

describe("Aguardando decisão", () => {
  it("abre em Atrasados; Tudo esperando mostra também o que está no prazo", async () => {
    const esperas = esperasPorEvento(analisarPorEvento(linhas(), ctx, HOJE), ctx, HOJE, DIAS_PADRAO);
    const { user } = renderComTudo(<AguardandoDecisao esperas={esperas} />, { user: usuarioFake({ role: "admin" }) });
    expect(screen.getByTestId("evento-espera-serra")).toBeInTheDocument();
    expect(screen.queryByTestId("evento-espera-recife")).not.toBeInTheDocument();
    expect(screen.getByTestId("espera-validacao-serra")).toHaveTextContent("há 8 dias");
    expect(screen.getByTestId("quem-age-validacao-serra")).toHaveTextContent("Gabrielle");
    expect(screen.getByTestId("espera-aprovacao-fundao")).toHaveTextContent("prazo vencido");
    expect(screen.getByTestId("link-espera-aprovacao-fundao")).toHaveAttribute("href", "/scaling-approval?eventId=fundao");
    expect(screen.getByTestId("carga-Gabrielle")).toBeInTheDocument();

    await user.click(screen.getByTestId("filtro-espera-todos"));
    expect(screen.getByTestId("evento-espera-recife")).toBeInTheDocument();
  });

  it("sem nada esperando", () => {
    renderComTudo(<AguardandoDecisao esperas={[]} />, { user: usuarioFake({ role: "admin" }) });
    expect(screen.getByTestId("esperas-vazio")).toHaveTextContent("Nada esperando decisão");
  });
});

const ctxComparacao: ContextoDaComparacao = { temNome: ctx.temNome, getFunctionName: ctx.getFunctionName, tipoDoColaborador: () => "freela" };
const events = [
  eventoFake({ id: "serra", name: NOMES.serra }),
  eventoFake({ id: "fundao", name: NOMES.fundao }),
  eventoFake({ id: "recife", name: NOMES.recife }),
];

function montarComparacao(selecionados: string[], podeVerValores: boolean) {
  const todas = linhas();
  const onSelecionados = vi.fn();
  const r = renderComTudo(
    <CompararEventos selecionados={selecionados} onSelecionados={onSelecionados} eventos={analisarPorEvento(todas, ctx, HOJE)} events={events} linhas={todas} ctx={ctxComparacao} podeVerValores={podeVerValores} hoje={HOJE} />,
    { user: usuarioFake({ role: podeVerValores ? "financial" : "production" }) },
  );
  return { ...r, onSelecionados };
}

describe("Eventos lado a lado", () => {
  it("sem eventos: atalho do circuito escolhe as etapas parecidas", async () => {
    const { user, onSelecionados } = montarComparacao([], false);
    expect(screen.getByTestId("comparar-vazio")).toHaveTextContent("Nenhum evento escolhido");
    await user.click(screen.getByTestId("atalho-viva esporte"));
    expect(onSelecionados).toHaveBeenCalledWith(["serra", "fundao"]);
  });

  it("um evento: “Comparar com parecidos” completa com o mesmo nome-base", async () => {
    const { user, onSelecionados } = montarComparacao(["fundao"], false);
    await user.click(screen.getByTestId("button-parecidos"));
    expect(onSelecionados).toHaveBeenCalledWith(["fundao", "serra"]);
  });

  it("dois eventos lado a lado; quem não vê valores não vê o Planejado nem dispara a consulta", () => {
    const fetchMock = mockarFetch(() => respostaJson([]));
    montarComparacao(["serra", "fundao"], false);
    expect(screen.getByTestId("metrica-pessoas-serra")).toHaveTextContent("3");
    expect(screen.getByTestId("metrica-diarias-serra")).toHaveTextContent("24"); // 3 pessoas × 8 dias
    expect(screen.getByTestId("metrica-pessoas-fundao")).toHaveTextContent("2");
    expect(screen.queryByTestId("metrica-valor-planejado")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("funcao-prod")).toBeInTheDocument();
  });

  it("quem vê valores vê a soma do Planejado de cada evento", async () => {
    mockarFetch((url) => respostaJson(url.includes("serra") ? [{ totalValue: 150000 }, { totalValue: 50000 }] : []));
    montarComparacao(["serra", "fundao"], true);
    expect(await screen.findByText(/R\$\s?2\.000,00/)).toBeInTheDocument();
    expect(await screen.findByText("sem Planejado")).toBeInTheDocument();
  });
});

function Harness() {
  const u = useEstadoNaUrl();
  return (
    <>
      <SeletorDeAba aba={u.aba} onAba={u.setAba} />
      <button type="button" onClick={() => u.setEventos(["a", "b"])}>escolher</button>
      <span data-testid="estado">{u.aba}|{u.eventos.join(",")}</span>
    </>
  );
}

describe("estado na URL", () => {
  it("lê e grava aba e eventos (link copiado abre a mesma comparação)", async () => {
    const { user, historico } = renderComTudo(<Harness />, { user: usuarioFake({ role: "admin" }), rota: "/paineis/escala?aba=comparar&eventos=x,y" });
    expect(screen.getByTestId("estado")).toHaveTextContent("comparar|x,y");
    await user.click(screen.getByRole("button", { name: "escolher" }));
    expect(historico.at(-1)).toBe("/paineis/escala?aba=comparar&eventos=a,b");
    await user.click(screen.getByTestId("aba-painel-atrasos"));
    expect(historico.at(-1)).toBe("/paineis/escala?eventos=a,b");
  });
});
