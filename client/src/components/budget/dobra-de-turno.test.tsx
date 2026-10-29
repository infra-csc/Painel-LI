/**
 * Dobra de turno nas telas do Realizado (29/10): a grade de dias do modal
 * ganha o "2×" ao lado do ½ (marca/desmarca, com o resumo "1 dobra" na linha
 * de Diárias); enviada ao DP, só o DP marca (os demais só veem o selo); o
 * card do Realizado diz a dobra.
 */
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { usuarioFake } from "@/test/fixtures";
import { realizadoFake } from "@/test/fixtures-dominio";
import type { BudgetActual } from "@shared/schema";
import { useBudgetActualEditor } from "@/hooks/use-budget-actual-editor";
import { EditActualCustosTab } from "./edit-actual-custos-tab";
import { ActualCard, type ActualCardProps } from "./actual-card";

// 07/09/2026 é segunda; 09/09 quarta.
const SEG_A_QUA = { weekdays: 3, weekends: 0, startDate: "2026-09-07", endDate: "2026-09-09" };

function Grade({ item }: { item: BudgetActual }) {
  const editor = useBudgetActualEditor({
    getItemInclusion: () => undefined,
    getItemDayCounts: () => SEG_A_QUA,
    getPlannedRef: () => undefined,
    getFunctionName: () => "Produção",
    functionNameById: new Map([["funcao-1", "Produção"]]),
    ticketByInclusion: new Map(),
    actualsPorGrupo: new Map(),
    systemSettings: {},
  });
  const { openEditModal } = editor;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { openEditModal(item); }, []);
  if (!editor.editingItem || !editor.editFormData) return null;
  const subtotal = editor.editDayEntries.filter((d) => d.active).reduce((s, d) => s + d.valueCents, 0);
  return (
    <EditActualCustosTab
      editor={editor} editingItem={editor.editingItem} editFormData={editor.editFormData}
      isReadOnly={!!editor.editingItem.sentForReview} planned={undefined}
      plannedValorUtil={0} plannedValorFds={0} plannedSubDiarias={0} subtotalDiariasRaw={subtotal}
      modalMobility={0} totalAlimentacao={0} modalVoa={false} modalFuncaoLocal={false} semAlimentacao
    />
  );
}

// Freela seg–qua, diária R$ 100 (sem alimentação).
const freela = realizadoFake({
  collaboratorType: "freela", dailyQuantity: 3, dailyValue: 10_000, totalValue: 30_000, sentForReview: false,
  weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0, mobility: 0, mobilityIda: 0, mobilityVolta: 0, transport: 0,
  workedDays: ["2026-09-07", "2026-09-08", "2026-09-09"],
});

describe("grade de dias do Realizado — dobra de turno (29/10)", () => {
  it("sem ser do DP, marca o 2× no dia (prestação aberta): o botão fica pressionado, a linha de Diárias diz '1 dobra' e o valor do dia dobra", async () => {
    const { user } = renderComTudo(<Grade item={freela} />, { user: usuarioFake({ role: "production" }) });
    const botao = await screen.findByRole("button", { name: "Dobra de turno (2 diárias no dia) em 08/09" });
    expect(botao).toHaveAttribute("aria-pressed", "false");
    // Quem não é do DP não marca o ½ — mas marca a dobra.
    expect(screen.queryByTestId("rea-meia-2026-09-08")).not.toBeInTheDocument();
    await user.click(botao);
    expect(botao).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/3 de 3 dias trabalhados · 1 dobra/)).toBeInTheDocument();
    expect(screen.getByTestId("rea-resumo-dobra")).toHaveTextContent("1 dobra (08/09)");
    expect(screen.getByLabelText("Diária realizada em 08/09")).toHaveValue("200,00");
    await user.click(botao);
    expect(botao).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("rea-resumo-dobra")).not.toBeInTheDocument();
  });

  it("DP: marcar a dobra num dia de 1,5 tira o ½ (um dia não é as duas coisas)", async () => {
    const { user } = renderComTudo(<Grade item={freela} />, { user: usuarioFake({ role: "financial" }) });
    await user.click(await screen.findByTestId("rea-meia-2026-09-07"));
    expect(screen.getByTestId("rea-meia-2026-09-07")).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByTestId("rea-dobra-2026-09-07"));
    expect(screen.getByTestId("rea-meia-2026-09-07")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("rea-dobra-2026-09-07")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Diária realizada em 07/09")).toHaveValue("200,00");
  });

  it("enviada ao DP: quem não é do DP só vê o selo 2×; o DP ainda marca", async () => {
    const enviada = { ...freela, sentForReview: true, rhStatus: "pendente", totalValue: 40_000, dailyQuantity: 4, diasDobra: ["2026-09-08"] };
    const producao = renderComTudo(<Grade item={enviada} />, { user: usuarioFake({ role: "production" }) });
    expect(await screen.findByTestId("rea-dobra-selo-2026-09-08")).toHaveTextContent("2×");
    expect(screen.queryByRole("button", { name: /Dobra de turno/ })).not.toBeInTheDocument();
    producao.unmount();

    renderComTudo(<Grade item={enviada} />, { user: usuarioFake({ role: "financial" }) });
    expect(await screen.findByTestId("rea-dobra-2026-09-08")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("rea-dobra-2026-09-07")).toHaveAttribute("aria-pressed", "false");
  });

  it("aprovada: ninguém marca, nem o DP", async () => {
    const aprovada = { ...freela, sentForReview: true, rhStatus: "aprovado", totalValue: 40_000, dailyQuantity: 4, diasDobra: ["2026-09-08"] };
    renderComTudo(<Grade item={aprovada} />, { user: usuarioFake({ role: "financial" }) });
    expect(await screen.findByTestId("rea-dobra-selo-2026-09-08")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Dobra de turno/ })).not.toBeInTheDocument();
  });
});

describe("card do Realizado — dobra de turno", () => {
  it("diz a dobra na linha de Diárias", () => {
    const props: ActualCardProps = {
      cardItem: { ...freela, totalValue: 40_000, dailyQuantity: 4, diasDobra: ["2026-09-08"] },
      collabName: "Ana Souza", functionName: "Produção", cardDays: SEG_A_QUA, cardPlanned: undefined,
      diverges: false, notAttended: false, isCollapsed: false, isSelected: false, isHighlighted: false,
      eventNotes: [], plannedLogs: [], isRhOrAdmin: false, splitPending: false,
      onToggleSelect: vi.fn(), onToggleCollapse: vi.fn(), onEdit: vi.fn(), onSplit: vi.fn(), onDelete: vi.fn(),
    };
    renderComTudo(<ActualCard {...props} />);
    const linha = screen.getByTestId("realizado-dobra");
    expect(linha).toHaveTextContent("1 dobra (08/09)");
    expect(within(linha).queryByText(/1,5/)).not.toBeInTheDocument();
  });
});
