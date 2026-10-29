import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { colaboradorFake, realizadoFake, vagaFake } from "@/test/fixtures-dominio";
import { SplitVagaModal } from "./modal";
import type { SplitVagaModalProps } from "./split-shared";

// Vaga 10–12/04/2026: sexta (útil), sábado e domingo.
function montar(novoTipo: "casa" | "freela" = "casa", extras: Partial<SplitVagaModalProps> = {}) {
  const titular = colaboradorFake({ id: "colab-1", fullName: "Aline Barbosa", type: "freela" });
  const novo = colaboradorFake({ id: "colab-2", fullName: "DÉBORA freitas", type: novoTipo });
  // Titular freela: sem alimentação e sem mobilidade — antes o novo nascia só com a diária.
  const item = realizadoFake({
    id: "realizado-1", collaboratorId: "colab-1", collaboratorType: "freela", sentForReview: false,
    dailyValue: 15000, dailyQuantity: 3, workedDays: ["2026-04-10", "2026-04-11", "2026-04-12"],
  });
  const onConfirm = vi.fn();
  const props: SplitVagaModalProps = {
    item,
    collaborators: [titular, novo],
    teamInclusion: vagaFake({ id: "vaga-1", scheduleStartDate: "2026-04-10", scheduleEndDate: "2026-04-12" }),
    functionName: "Produtor",
    systemSettings: {},
    onClose: vi.fn(),
    onConfirm,
    ...extras,
  };
  const utils = renderComTudo(<SplitVagaModal {...props} />);
  return { ...utils, onConfirm };
}

async function irAoPasso2(user: ReturnType<typeof montar>["user"]) {
  const dialogo = screen.getByRole("dialog", { name: "Dividir escalação" });
  await user.click(within(dialogo).getByText("Buscar colaborador…"));
  fireEvent.mouseDown(await screen.findByRole("button", { name: /Débora Freitas/ }));
  await user.click(within(dialogo).getByRole("button", { name: /^Sex 10\/Abr/ }));
  await user.click(within(dialogo).getByRole("button", { name: /^Sáb 11\/Abr/ }));
  await user.click(within(dialogo).getByRole("button", { name: /Próximo/ }));
  return dialogo;
}

describe("Dividir escalação — passo 2 do novo colaborador", () => {
  it("titular freela + novo casa: alimentação pela regra dele, cartão visível e de onde veio o valor", async () => {
    const { user } = montar("casa");
    await irAoPasso2(user);

    const cartao = screen.getByTestId("split-card-alimentacao");
    expect(cartao).toBeVisible();
    expect(screen.getByLabelText("Almoço em dias úteis")).toHaveValue("5,00");
    expect(screen.getByLabelText("Jantar em dias úteis")).toHaveValue("40,00");
    expect(screen.getByLabelText("Almoço no fim de semana")).toHaveValue("40,00");
    expect(screen.getByLabelText("Jantar no fim de semana")).toHaveValue("40,00");
    expect(screen.getByTestId("split-origem-alimentacao")).toHaveTextContent(/Pela regra do colaborador \(casa\)/);
    expect(screen.getByTestId("split-origem-mobilidade")).toHaveTextContent(/não tem mobilidade/);
    // Composição sempre no rodapé, com a Alimentação
    expect(screen.getByTestId("split-composicao")).toHaveTextContent(/Alimentação\s*R\$\s*125,00/);
    // Nome com acento: "Débora", não "DéBora"
    expect(screen.getByRole("heading", { name: "Débora Freitas" })).toBeInTheDocument();
    expect(screen.getByTestId("split-tipo-do-novo")).toHaveTextContent("Casa");
    // Diária pela regra da casa (CLT): 0 em dia útil, a do titular no fim de semana
    expect(screen.getByLabelText("Diária por dia útil")).toHaveValue("0,00");
    expect(screen.getByLabelText("Diária por dia de fim de semana")).toHaveValue("150,00");
    expect(screen.getByTestId("split-origem-diarias")).toHaveTextContent("Casa (CLT): sem diária em dia útil");
  });

  it("confirmar manda o tipo do novo colaborador e a alimentação calculada", async () => {
    const { user, onConfirm } = montar("casa");
    await irAoPasso2(user);
    await user.click(screen.getByRole("button", { name: /Confirmar divisão/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const payload = onConfirm.mock.calls[0][0];
    expect(payload).toMatchObject({
      collaboratorId: "colab-2", collaboratorType: "casa",
      weekdayLunch: 500, weekdayDinner: 4000, weekendLunch: 4000, weekendDinner: 4000, mobility: 0,
      workedDays: ["2026-04-10", "2026-04-11"], parentWorkedDays: ["2026-04-12"],
    });
    // Diárias: 0 (sexta, casa) + 150 (sábado) — dailyValue é a média por dia
    expect(payload).toMatchObject({ dailyQuantity: 2, dailyValue: 7500 });
    expect(payload.totalValue).toBe(15000 + 12500);
  });

  it("novo freela: diária do titular em todos os dias e alimentação zerada com o motivo", async () => {
    const { user } = montar("freela");
    await irAoPasso2(user);
    expect(screen.getByLabelText("Almoço em dias úteis")).toHaveValue("0,00");
    expect(screen.getByTestId("split-origem-alimentacao")).toHaveTextContent(/Freela não recebe alimentação/);
    expect(screen.getByLabelText("Diária por dia útil")).toHaveValue("150,00");
    expect(screen.getByLabelText("Diária por dia de fim de semana")).toHaveValue("150,00");
    expect(screen.getByTestId("split-origem-diarias")).toHaveTextContent(/Freela: R\$\s*150,00 por dia/);
  });
});
