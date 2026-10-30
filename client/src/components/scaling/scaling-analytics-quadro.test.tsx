/**
 * Quadro de prazos (16/10): colunas com os prazos do processo do dono (D-N no
 * cabeçalho, Hotel novo), cada vaga numa coluna só, e o detalhe de cada célula
 * — "de quais escalações estão ali": a contagem do modal bate com a da célula.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { TeamInclusion } from "@shared/schema";
import { DIAS_PADRAO } from "@shared/prazos-da-escala";
import { renderComTudo } from "@/test/render";
import { usuarioFake } from "@/test/fixtures";
import { vagaFake } from "@/test/fixtures-dominio";
import { analisarPorEvento, type AnalyticsContext } from "./scaling-analytics-data";
import { QuadroDePrazos } from "./scaling-analytics-quadro";

const HOJE = new Date(2026, 9, 16);
const NOMES: Record<string, string> = { "c-ana": "ANA SOUZA", "c-bia": "BIA LIMA", "c-caio": "CAIO REIS", "c-duda": "DUDA MOTA" };
const ctx: AnalyticsContext = {
  temNome: (i) => !!i.collaboratorId,
  temTroca: () => false,
  temPedido: () => false,
  getEventName: (id) => (id === "nr" ? "Night Run SP" : "Corrida Pronta"),
  getFunctionName: () => "Produtor",
  getCollaboratorName: (id) => (id ? NOMES[id] ?? id : "?"),
  getEventDates: () => ({ startDate: "2026-12-19", endDate: "2026-12-20" }),
  temPassagem: () => false,
  temHotel: () => false,
  getResponsavelDaFuncao: () => "Gabrielle",
};

const base = { eventId: "nr", collaboratorId: null, status: "planejado", phase: "inclusao", deletedAt: null, needsTicket: false, needsAccommodation: false, scheduleStartDate: "2026-12-18", scheduleEndDate: "2026-12-20" };
const v = (over: Partial<TeamInclusion>) => vagaFake({ ...base, ...over } as Partial<TeamInclusion>);

function montar(opcoes: { role?: string } = {}) {
  const validar = [
    v({ phase: "sugestao", status: "sugestao_pendente", collaboratorId: "c-ana" }),
    v({ phase: "sugestao", status: "sugestao_pendente", collaboratorId: "c-bia" }),
    v({ phase: "sugestao", status: "sugestao_pendente" }),
  ];
  const semNome = v({});
  const salva = v({ collaboratorId: "c-caio" });
  const escalada = v({ collaboratorId: "c-duda", status: "escalado" });
  const pronta = v({ eventId: "pronta", collaboratorId: "c-duda", status: "escalado" });
  const eventos = analisarPorEvento([...validar, semNome, salva, escalada, pronta], ctx, HOJE);
  const onVerVagasDoEvento = vi.fn();
  const r = renderComTudo(
    <QuadroDePrazos eventos={eventos} ctx={ctx} hoje={HOJE} dias={DIAS_PADRAO} podeEditar={false} onVerVagasDoEvento={onVerVagasDoEvento} />,
    { user: usuarioFake({ role: opcoes.role ?? "admin" }), rota: "/scaling?aba=analises" },
  );
  return { ...r, validar, semNome, salva, escalada, onVerVagasDoEvento };
}

describe("Quadro de prazos — colunas e travamento", () => {
  it("cabeçalho com os dias do processo (D-58 … D-30) e a coluna Hotel reservado", () => {
    montar();
    const esperado = { registro: 58, validacao: 51, aprovacao: 51, escalacao: 47, escalado: 44, passagem: 37, hotel: 30 };
    for (const [etapa, d] of Object.entries(esperado)) {
      expect(screen.getByTestId(`cabecalho-${etapa}`)).toHaveTextContent(`D-${d}`);
    }
    expect(screen.getByTestId("cabecalho-hotel")).toHaveTextContent("Hotel reservado");
    expect(screen.getByTestId("cabecalho-escalado")).toHaveAttribute("title", expect.stringContaining("Completar escala de pessoas no app"));
  });

  it("a vaga sem nome trava em Escalação; Escalado conta só quem tem nome e falta confirmar", () => {
    montar();
    expect(screen.getByTestId("quadro-validacao-nr")).toHaveTextContent("3a validar");
    expect(screen.getByTestId("quadro-escalacao-nr")).toHaveTextContent("1sem nome");
    expect(screen.getByTestId("quadro-escalado-nr")).toHaveTextContent("1a confirmar");
    // Passagem/Hotel: ninguém do evento precisa.
    expect(screen.getByTestId("quadro-hotel-nr")).toHaveTextContent("ninguém precisa");
    // Registros = soma das células + concluídas.
    expect(screen.getByTestId("quadro-registro-nr")).toHaveTextContent("6vagas");
  });
});

describe("Quadro de prazos — detalhe da célula", () => {
  it("“3 a validar” abre o modal com exatamente essas 3, cada uma com #número e colaborador", async () => {
    const { user, validar } = montar();
    const celula = screen.getByTestId("quadro-validacao-nr");
    const naCelula = Number(celula.textContent?.match(/^\d+/)?.[0]);
    await user.click(within(celula).getByRole("button"));

    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByRole("heading", { name: "Night Run SP" })).toBeInTheDocument();
    expect(within(modal).getByTestId("detalhe-contagem")).toHaveTextContent("3 a validar");
    const itens = within(within(modal).getByTestId("detalhe-lista")).getAllByRole("listitem");
    expect(itens).toHaveLength(naCelula);
    for (const vaga of validar) {
      expect(within(modal).getByTestId(`detalhe-vaga-${vaga.id}`)).toHaveTextContent(`#${vaga.inclusionNumber}`);
    }
    expect(within(modal).getByTestId(`detalhe-vaga-${validar[0].id}`)).toHaveTextContent("ANA SOUZA");
    expect(within(modal).getByTestId(`detalhe-vaga-${validar[2].id}`)).toHaveTextContent("sem nome");
    expect(within(modal).getByTestId(`detalhe-vaga-${validar[0].id}`)).toHaveTextContent("área: Gabrielle");
    // Prazo: evento 20/12, validação D-51 → 30/10.
    expect(modal).toHaveTextContent("Prazo 30/10 (D-51)");
    expect(within(modal).getByTestId("detalhe-situacao")).toHaveTextContent("No prazo");
  });

  it("a contagem do modal bate com a célula em todas as colunas", async () => {
    const { user } = montar();
    for (const etapa of ["validacao", "escalacao", "escalado"]) {
      const celula = screen.getByTestId(`quadro-${etapa}-nr`);
      const naCelula = Number(celula.textContent?.match(/^\d+/)?.[0]);
      await user.click(within(celula).getByRole("button"));
      const modal = await screen.findByRole("dialog");
      expect(within(within(modal).getByTestId("detalhe-lista")).getAllByRole("listitem")).toHaveLength(naCelula);
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }
  });

  it("Escalação mostra quem ainda está antes, recolhido, e a ação abre as vagas do evento", async () => {
    const { user, semNome, onVerVagasDoEvento } = montar();
    await user.click(within(screen.getByTestId("quadro-escalacao-nr")).getByRole("button"));
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByTestId(`detalhe-vaga-${semNome.id}`)).toHaveTextContent("sem nome");
    expect(within(modal).getByTestId("detalhe-antes")).toHaveTextContent(/^3 em etapas anteriores\s*\(3 em validação\)/);
    expect(within(modal).getByTestId("detalhe-cumpridas")).toHaveTextContent("2 já cumpriram esta etapa");
    await user.click(within(modal).getByTestId("detalhe-acao"));
    expect(onVerVagasDoEvento).toHaveBeenCalledWith("nr");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a ação da Validação navega para /scaling-validation já no evento", async () => {
    const { user, historico } = montar();
    await user.click(within(screen.getByTestId("quadro-validacao-nr")).getByRole("button"));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Abrir na Validação/ }));
    expect(historico.at(-1)).toBe("/scaling-validation?eventId=nr");
  });

  it("célula sem pendência: modal vazio com “Nada pendente nesta etapa”", async () => {
    const { user } = montar();
    await user.click(within(screen.getByTestId("quadro-validacao-pronta")).getByRole("button", { name: /concluída/ }));
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByTestId("detalhe-vazio")).toHaveTextContent("Nada pendente nesta etapa");
    expect(within(modal).getByTestId("detalhe-situacao")).toHaveTextContent("Concluída");
    expect(within(modal).queryByTestId("detalhe-copiar")).not.toBeInTheDocument();
  });
});

describe("Quadro de prazos — Dia(s) do evento (30/10)", () => {
  // Viva Esporte: período de montagem a desmontagem; o evento é quinta e sexta.
  const DATAS: Record<string, { startDate: string; endDate: string; diaEventoInicio?: string | null; diaEventoFim?: string | null }> = {
    serra: { startDate: "2026-11-01", endDate: "2026-11-08", diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-06" },
    cariacica: { startDate: "2026-12-06", endDate: "2026-12-12" },
    fundao: { startDate: "2026-11-29", endDate: "2026-12-06" },
  };
  const ctxViva: AnalyticsContext = {
    ...ctx,
    getEventName: (id) => `Viva Esporte - ${id}`,
    getEventDates: (id) => (id ? DATAS[id] : undefined),
  };
  const vagas = Object.keys(DATAS).map((eventId) => v({ eventId, scheduleStartDate: DATAS[eventId].startDate, scheduleEndDate: DATAS[eventId].endDate }));

  it("com os dias informados, a DATA é 05–06/11 e os prazos contam do último dia (06/11)", () => {
    const eventos = analisarPorEvento(vagas, ctxViva, HOJE);
    const serra = eventos.find((e) => e.eventId === "serra")!;
    expect(serra.dataEvento).toBe("2026-11-06");
    expect(serra.dataEventoInicio).toBe("2026-11-05");
    renderComTudo(
      <QuadroDePrazos eventos={eventos} ctx={ctxViva} hoje={HOJE} dias={DIAS_PADRAO} podeEditar={false} onVerVagasDoEvento={vi.fn()} />,
      { user: usuarioFake({ role: "admin" }), rota: "/scaling?aba=analises" },
    );
    expect(screen.getByTestId("quadro-data-serra")).toHaveTextContent(/^05–06\/11$/);
    // Registros D-58: 06/11 − 58 = 09/09 (do domingo 08/11 seria 11/09).
    expect(screen.getByTestId("quadro-registro-serra")).toHaveTextContent("09/09");
  });

  it("sem dias informados, Cariacica deduz o sábado do fim (12/12) e não cai na data do Fundão (06/12)", () => {
    const eventos = analisarPorEvento(vagas, ctxViva, HOJE);
    expect(eventos.find((e) => e.eventId === "cariacica")?.dataEvento).toBe("2026-12-12");
    expect(eventos.find((e) => e.eventId === "fundao")?.dataEvento).toBe("2026-12-06");
    expect(eventos.find((e) => e.eventId === "cariacica")?.dataEventoInicio).toBeNull();
  });
});
