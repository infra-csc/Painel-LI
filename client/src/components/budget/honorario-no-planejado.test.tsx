/**
 * Honorário aprovado no Planejado (21/10) — o que o card e a memória de
 * cálculo mostram, a partir do MESMO motor (orcamentoFake → calcularPlanejadoDaVaga).
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { HonorarioNaVaga } from "@shared/honorarios-ceno";
import { renderComTudo } from "@/test/render";
import { realizadoFake } from "@/test/fixtures-dominio";
import { moeda, orcamentoFake, vagaDoPlanejado } from "@/test/orcamento-fixture";
import { BudgetCard, type BudgetCardProps } from "./budget-card";
import { MemoriaCalculoPopover } from "./memoria-calculo-popover";
import { aprovadoDepoisDoEnvio, fonteDoHonorario, textoDoHonorarioPendente, usarHonorarioAprovado } from "./honorario-no-planejado";

const vagaCeno = vagaDoPlanejado({ cenoFreelaTipo: "sp" });
const honorario = (o: Partial<HonorarioNaVaga> = {}): HonorarioNaVaga => ({
  honorarioId: "h1", tipo: "vaga", nome: "Ana Souza", status: "aprovado_ajuste", situacao: "aprovado", valorCents: 90_000,
  empreita: null, aprovadoPor: "Marcos Vieira", aprovadoEm: "2026-10-21T13:00:00.000Z", colaboradorTrocado: false, ...o,
});
const ceno = (o: Parameters<typeof orcamentoFake>[0] = {}) => orcamentoFake({ vaga: vagaCeno, functionName: "Cenotécnica", ...o });

function montar(extras: Partial<BudgetCardProps> = {}) {
  const acoes = { onToggleSelect: vi.fn(), onToggleCollapse: vi.fn(), onEdit: vi.fn(), onSend: vi.fn(), onNotAttended: vi.fn(), onRestore: vi.fn(), onUsarHonorario: vi.fn(), onPreAprovar: vi.fn(), onDesfazerPreAprovacao: vi.fn() };
  const props: BudgetCardProps = {
    budget: ceno(), name: "Ana Souza", functionName: "Cenotécnica",
    isSent: false, isSelected: false, isCollapsed: false, isHighlighted: false,
    planRecord: undefined, cardActual: undefined, eventNotes: [],
    canEdit: true, canMarkNotAttended: true, restorePending: false,
    // 26/10: pré-aprovado pelo DP — o envio fica disponível (os testes de pré-aprovação mudam isto).
    situacao: "pre_aprovado",
    ...acoes, ...extras,
  };
  const utils = renderComTudo(<BudgetCard {...props} />);
  return { ...utils, ...acoes, card: utils.container.querySelector("[data-card-id]") as HTMLElement };
}

describe("textos do honorário", () => {
  it("vaga: quem aprovou e quando; empreita: a parte e o rateio", () => {
    expect(fonteDoHonorario(honorario())).toBe("Honorário aprovado c/ ajuste por Marcos Vieira em 21/10/2026");
    expect(fonteDoHonorario(honorario({ status: "aprovado" }))).toBe("Honorário aprovado por Marcos Vieira em 21/10/2026");
    const parte = honorario({ tipo: "empreita", nome: "Equipe Sul", valorCents: 33_334, empreita: { totalCents: 100_000, vagas: 3, primeira: true } });
    expect(fonteDoHonorario(parte).replace(/\u00a0/g, " ")).toBe("parte da empreita Equipe Sul (R$ 1.000,00 ÷ 3) · aprovada por Marcos Vieira em 21/10/2026");
    expect(textoDoHonorarioPendente(honorario({ situacao: "pendente", status: "aguardando", valorCents: 200_000 })).replace(/\u00a0/g, " "))
      .toBe("honorário aguardando aprovação · R$ 2.000,00");
  });

  it("\"Usar o honorário aprovado\" tira só o ajuste da diária; sem outro ajuste, a vaga sai do rascunho", () => {
    const so = usarHonorarioAprovado({ v1: { inclusionId: "v1", valorDiaria: 1, valorDiariaUtil: 1, valorDiariaFds: 1 } }, "v1");
    expect(so).toEqual({});
    const comMob = usarHonorarioAprovado({ v1: { inclusionId: "v1", valorDiaria: 1, valorDiariaUtil: 1, valorDiariaFds: 1, mobilidade: 500 } }, "v1");
    expect(comMob).toEqual({ v1: { inclusionId: "v1", mobilidade: 500 } });
  });
});

describe("BudgetCard com honorário (21/10)", () => {
  it("aprovado: Diárias = o aprovado, com a origem e o valor da tabela que ele substituiu", () => {
    const tabela = ceno();
    const budget = ceno({ honorario: honorario() });
    expect(budget.subtotalDiarias).toBe(90_000);
    const { card } = montar({ budget });
    expect(within(card).getByTestId("planejado-honorario-aprovado")).toHaveTextContent("Honorário aprovado");
    expect(within(card).getByTestId("planejado-fonte-honorario")).toHaveTextContent("Honorário aprovado c/ ajuste por Marcos Vieira em 21/10/2026");
    expect(card).toHaveTextContent(`no lugar de ${moeda(tabela.subtotalDiarias)} (tabela)`);
    expect(within(card).getAllByText(moeda(90_000)).length).toBeGreaterThan(0);
    expect(within(card).queryByTestId("planejado-honorario-aviso")).toBeNull();
  });

  it("aguardando: o valor é o da tabela e o pedido aparece num selo discreto", () => {
    const tabela = ceno();
    const budget = ceno({ honorario: honorario({ situacao: "pendente", status: "aguardando", valorCents: 120_000, aprovadoPor: null, aprovadoEm: null }) });
    expect(budget.totalFinal).toBe(tabela.totalFinal);
    const { card } = montar({ budget });
    expect(within(card).getByTestId("planejado-honorario-pendente")).toHaveTextContent(`honorário aguardando aprovação · ${moeda(120_000)}`);
    expect(within(card).queryByTestId("planejado-fonte-honorario")).toBeNull();
  });

  it("ajuste manual vence com o aviso \"difere do honorário aprovado\" e o botão limpa só a mão de obra", () => {
    const budget = ceno({ honorario: honorario(), override: { valorDiaria: 50_000, valorDiariaUtil: 50_000, valorDiariaFds: 50_000 } });
    expect(budget.honorarioDifere).toBe(true);
    const { card, onUsarHonorario } = montar({ budget });
    const aviso = within(card).getByTestId("planejado-honorario-aviso");
    expect(aviso).toHaveTextContent(`difere do honorário aprovado (${moeda(90_000)})`);
    fireEvent.click(within(aviso).getByRole("button", { name: "Usar o honorário aprovado" }));
    expect(onUsarHonorario).toHaveBeenCalledWith(budget.inclusion.id);
  });

  it("enviado ao Realizado ANTES da aprovação: avisa para revisar, sem reabrir nada", () => {
    const budget = ceno({ honorario: honorario() });
    const actual = realizadoFake({ createdAt: new Date("2026-10-20T12:00:00.000Z"), dailyQuantity: 3, dailyValue: 35_000 });
    expect(aprovadoDepoisDoEnvio(budget, actual)).toBe(true);
    expect(aprovadoDepoisDoEnvio(budget, realizadoFake({ createdAt: new Date("2026-10-22T12:00:00.000Z") }))).toBe(false);
    const { card } = montar({ budget, isSent: true, cardActual: actual });
    const aviso = within(card).getByTestId("planejado-honorario-depois-do-envio");
    expect(aviso).toHaveTextContent("Honorário aprovado depois do envio — revise.");
    expect(aviso).toHaveTextContent(moeda(105_000));
    expect(within(card).queryByRole("button", { name: "Usar o honorário aprovado" })).toBeNull();
  });
});

describe("Memória de cálculo com honorário (21/10)", () => {
  it("diz a origem: aprovado por quem e quando, ou a parte da empreita", () => {
    renderComTudo(<MemoriaCalculoPopover sid="s1" name="Ana Souza" budget={ceno({ honorario: honorario() })} onClose={() => {}} />);
    const memoria = screen.getByRole("dialog", { name: /Memória de cálculo/ });
    expect(memoria).toHaveTextContent("Diárias (Honorário aprovado c/ ajuste por Marcos Vieira em 21/10/2026)");
    expect(memoria).toHaveTextContent("Substitui");
  });

  it("pendente: só uma nota — ainda não entra na conta", () => {
    renderComTudo(<MemoriaCalculoPopover sid="s2" name="Ana Souza" budget={ceno({ honorario: honorario({ situacao: "pendente", status: "aguardando" }) })} onClose={() => {}} />);
    expect(screen.getByTestId("memoria-honorario-pendente")).toHaveTextContent("ainda não entra na conta");
  });
});
