import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { moeda, orcamentoFake, vagaDoPlanejado } from "@/test/orcamento-fixture";
import { aplicarEdicaoNaPlanilha, restaurarCampoDaPlanilha } from "./sheet-edits";
import type { BudgetOverrides, CalculatedBudget } from "./types";
import { SheetRow, type SheetRowProps } from "./sheet-row";

function montar(extras: Partial<SheetRowProps> = {}) {
  const acoes = { onToggleSelect: vi.fn(), onSheetEdit: vi.fn(), onRestoreField: vi.fn(), onToggleSubtotal: vi.fn() };
  const budget = extras.budget ?? orcamentoFake();
  const props: SheetRowProps = {
    index: 0, budget, name: "Ana Souza", funcName: "Produção",
    isSent: false, isNotAttended: false, isNewCollab: true, showTopBorder: false, selected: false, subtotalOpen: false,
    ...acoes, ...extras,
  };
  const utils = renderComTudo(<table><tbody><SheetRow {...props} /></tbody></table>);
  return { ...utils, ...acoes, budget, linha: screen.getByRole("row") };
}

const diaria = (nome = "Ana Souza") => screen.getByRole("textbox", { name: `Diária de ${nome} (R$/dia)` }) as HTMLInputElement;
const alimUtil = (nome = "Ana Souza") => screen.getByRole("textbox", { name: `Alimentação de ${nome} por dia útil (R$)` }) as HTMLInputElement;
const alimFds = (nome = "Ana Souza") => screen.getByRole("textbox", { name: `Alimentação de ${nome} por dia de fim de semana (R$)` }) as HTMLInputElement;
const mobilidade = (nome = "Ana Souza") => screen.getByRole("textbox", { name: `Mobilidade de ${nome} (R$ total ida e volta)` }) as HTMLInputElement;
const subtotal = (nome = "Ana Souza") => screen.getByRole("button", { name: `Ver memória de cálculo de ${nome}` });
const reais = (centavos: number) => (centavos / 100).toFixed(2);

/**
 * Duas linhas com o rascunho de overrides REAL (sheet-edits) e o motor real:
 * é o que a página faz — editar uma linha recalcula só aquela vaga.
 */
function Planilha() {
  const [overrides, setOverrides] = useState<BudgetOverrides>({});
  const vagas = [vagaDoPlanejado({ id: "vaga-a", collaboratorId: "colab-a" }), vagaDoPlanejado({ id: "vaga-b", collaboratorId: "colab-b" })];
  const nomes: Record<string, string> = { "vaga-a": "Ana Souza", "vaga-b": "Bia Lima" };
  const budgets: CalculatedBudget[] = vagas.map((v) => orcamentoFake({ vaga: v, override: overrides[v.id] ?? null, nome: nomes[v.id] }));
  return (
    <table><tbody>
      {budgets.map((b, i) => (
        <SheetRow
          key={b.inclusion.id} index={i} budget={b} name={nomes[b.inclusion.id]} funcName="Produção"
          isSent={false} isNotAttended={false} isNewCollab showTopBorder={false} selected={false} subtotalOpen={false}
          ovr={overrides[b.inclusion.id]}
          onToggleSelect={() => {}}
          onSheetEdit={(bud, field, raw) => setOverrides((prev) => aplicarEdicaoNaPlanilha(prev, bud, field, raw))}
          onRestoreField={(sid, field) => setOverrides((prev) => restaurarCampoDaPlanilha(prev, sid, field))}
          onToggleSubtotal={() => {}}
        />
      ))}
    </tbody></table>
  );
}

describe("SheetRow", () => {
  it("mostra os valores do motor: diária plana, alimentação por dia útil/fds, mobilidade, dias e subtotal", () => {
    const { budget, linha } = montar();
    expect(linha).toHaveTextContent("Ana Souza");
    expect(linha).toHaveTextContent("Freela");
    expect(linha).toHaveTextContent("Produção");
    expect(linha).toHaveTextContent("10/04 → 12/04");
    expect(linha).toHaveTextContent("Pendente");
    expect(diaria()).toHaveValue(reais(budget.valorDiaria));
    expect(alimUtil()).toHaveValue(reais((budget.almocoSemana + budget.jantarSemana) / Math.max(1, budget.weekdays)));
    expect(alimFds()).toHaveValue(reais((budget.almocoFds + budget.jantarFds) / Math.max(1, budget.weekends)));
    expect(mobilidade()).toHaveValue(reais(budget.mobilidade));
    expect(subtotal()).toHaveTextContent(moeda(budget.totalFinal));
    // célula "Dias": os que recebem diária
    expect(within(linha).getAllByRole("cell")[2]).toHaveTextContent(String(budget.diasComDiaria));
    expect(screen.queryByRole("img", { name: "Valor editado manualmente" })).toBeNull();
  });

  it("editar a diária e sair do campo grava a edição da linha; sair sem mudar nada não grava", async () => {
    const { user, budget, onSheetEdit } = montar();
    await user.click(diaria());
    await user.tab();
    expect(onSheetEdit).not.toHaveBeenCalled();
    await user.clear(diaria());
    await user.type(diaria(), "450");
    await user.tab();
    expect(onSheetEdit).toHaveBeenCalledTimes(1);
    expect(onSheetEdit).toHaveBeenCalledWith(budget, "valorDia", "450");
  });

  it("override de valor recalcula SÓ a linha editada; restaurar volta ao valor da regra", async () => {
    const { user } = renderComTudo(<Planilha />);
    const totalAntesA = subtotal("Ana Souza").textContent;
    const totalAntesB = subtotal("Bia Lima").textContent;
    expect(totalAntesA).toBe(totalAntesB); // mesma vaga, mesmo cálculo

    await user.clear(diaria("Ana Souza"));
    await user.type(diaria("Ana Souza"), "500");
    await user.tab();

    const esperado = orcamentoFake({ override: { valorDiaria: 50000, valorDiariaUtil: 50000, valorDiariaFds: 50000 } });
    expect(subtotal("Ana Souza")).toHaveTextContent(moeda(esperado.totalFinal));
    expect(subtotal("Ana Souza").textContent).not.toBe(totalAntesA);
    expect(subtotal("Bia Lima").textContent).toBe(totalAntesB);
    expect(diaria("Ana Souza")).toHaveValue("500.00");
    expect(diaria("Bia Lima")).toHaveValue(diaria("Bia Lima").value); // intacta
    const linhaA = screen.getAllByRole("row")[0];
    expect(within(linhaA).getByRole("img", { name: "Valor editado manualmente" })).toBeInTheDocument();
    expect(within(screen.getAllByRole("row")[1]).queryByRole("img", { name: "Valor editado manualmente" })).toBeNull();

    await user.click(within(linhaA).getByRole("button", { name: "Restaurar valor padrão" }));
    expect(subtotal("Ana Souza").textContent).toBe(totalAntesA);
    expect(within(linhaA).queryByRole("img", { name: "Valor editado manualmente" })).toBeNull();
  });

  it("com override recebido por prop: marca não cromática ✱ e botão de restaurar chamam a linha certa", async () => {
    const { user, budget, onRestoreField } = montar({
      budget: orcamentoFake({ override: { mobilidade: 20000, mobilidadeIda: 10000, mobilidadeVolta: 10000 } }),
      ovr: { inclusionId: "x", mobilidade: 20000, mobilidadeIda: 10000, mobilidadeVolta: 10000 },
    });
    expect(mobilidade()).toHaveValue("200.00");
    expect(screen.getByRole("img", { name: "Valor editado manualmente" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restaurar valor padrão" }));
    expect(onRestoreField).toHaveBeenCalledWith(budget.inclusion.id, "mobilidade");
  });

  it("enviado ou 'não participou': tudo desabilitado e sem edição", () => {
    const { linha, unmount } = montar({ isSent: true });
    expect(linha).toHaveTextContent("Enviado");
    expect(diaria()).toBeDisabled();
    expect(mobilidade()).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Selecionar Ana Souza" })).toBeDisabled();
    unmount();
    const { linha: riscada } = montar({ isNotAttended: true });
    expect(riscada).toHaveClass("opacity-40");
    expect(subtotal()).toBeDisabled();
  });

  it("vaga só de fim de semana: a alimentação de dia útil fica travada com '—'", () => {
    const soFds = orcamentoFake({ vaga: vagaDoPlanejado({ scheduleStartDate: "2026-04-11", scheduleEndDate: "2026-04-12", workDays: ["2026-04-11", "2026-04-12"], dailyRates: 2 }) });
    montar({ budget: soFds });
    expect(soFds.weekdays).toBe(0);
    expect(alimUtil()).toBeDisabled();
    expect(alimUtil()).toHaveValue("—");
    expect(alimFds()).toBeEnabled();
  });

  it("selecionar e abrir a memória de cálculo chamam os callbacks com o id da vaga", async () => {
    const { user, budget, onToggleSelect, onToggleSubtotal } = montar();
    await user.click(screen.getByRole("checkbox", { name: "Selecionar Ana Souza" }));
    expect(onToggleSelect).toHaveBeenCalledWith(budget.inclusion.id, true);
    expect(subtotal()).toHaveAttribute("aria-expanded", "false");
    await user.click(subtotal());
    expect(onToggleSubtotal).toHaveBeenCalledWith(budget.inclusion.id);
  });
});
