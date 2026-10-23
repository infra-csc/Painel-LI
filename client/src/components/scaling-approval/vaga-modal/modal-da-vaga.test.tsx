/**
 * Modal da vaga da Escalação aberto pela Aprovação de escala (23/10): a linha
 * abre a vaga certa, ‹ › percorre a lista da aba, e decidir pelo modal usa a
 * MESMA mutação da linha e segue para a próxima vaga.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake } from "@/test/fixtures";
import { eventoFake, funcaoFake, sugestaoFake } from "@/test/fixtures-dominio";
import type { StalledRow } from "../types";
import { AwaitingApproval } from "../awaiting-approval";

type Props = Parameters<typeof AwaitingApproval>[0];

const validada = (parcial: Partial<StalledRow> = {}) => sugestaoFake({
  status: "sugestao_validada",
  validatedAt: new Date("2026-03-05T12:00:00Z"),
  validatedBy: "u1",
  ...parcial,
});

/** API mínima da Escalação: listas vazias, eventos e funções da vaga. */
function apiDaEscalacao() {
  return mockarFetch((url) => {
    if (url.startsWith("/api/events")) return respostaJson([eventoFake({ id: "ev-1", name: "Circuito Brasília" })]);
    if (url.startsWith("/api/functions")) return respostaJson([funcaoFake({ id: "funcao-1", name: "Produção" }), funcaoFake({ id: "funcao-2", name: "Kit" })]);
    return respostaJson([]);
  });
}

function montar(extras: Partial<Props> = {}, opcoes: { semAcesso?: boolean } = {}) {
  const fetchMock = apiDaEscalacao();
  const onApprove = vi.fn().mockResolvedValue(undefined);
  const onDecide = vi.fn().mockResolvedValue(undefined);
  const rows = extras.rows ?? [
    validada({ id: "s1", inclusionNumber: 101, functionId: "funcao-1", eventId: "ev-1", observations: "Leva o kit" }),
    validada({ id: "s2", inclusionNumber: 102, functionId: "funcao-2", eventId: "ev-1" }),
  ];
  const utils = renderComTudo(
    <AwaitingApproval
      rows={rows}
      functionNameById={new Map([["funcao-1", "Produção"], ["funcao-2", "Kit"]])}
      userNameById={new Map([["u1", "Marina Dias"]])}
      onApprove={onApprove}
      onDecide={onDecide}
      {...extras}
    />,
    { user: opcoes.semAcesso ? null : usuarioFake({ role: "production" }), queryClient: criarQueryClientComApi() },
  );
  return { ...utils, rows, onApprove, onDecide, fetchMock };
}

const modalAberto = () => screen.findByRole("dialog");

describe("Aprovação → modal da vaga da Escalação", () => {
  it("nada da Escalação é buscado antes de abrir; clicar na linha abre a vaga certa", async () => {
    const { user, fetchMock } = montar();
    expect(urlsChamadas(fetchMock)).toEqual([]);

    await user.click(within(screen.getByTestId("awaiting-row-101")).getByText("Leva o kit"));
    const modal = await modalAberto();
    expect(within(modal).getByTestId("text-modal-id")).toHaveTextContent("#101");
    expect(within(modal).getByTestId("text-nav-position")).toHaveTextContent("1 / 2");
    // Vaga em validação: só leitura — nada de Salvar/Confirmar da Escalação.
    expect(within(modal).getByTestId("text-vaga-em-validacao")).toBeInTheDocument();
    expect(within(modal).queryByTestId("button-confirm-scaling")).toBeNull();
    expect(within(modal).queryByTestId("button-save-scaling")).toBeNull();
    // Valores padrão são do financeiro: produção não pede /api/system-settings (era 403).
    await waitFor(() => expect(urlsChamadas(fetchMock).some((u) => u.startsWith("/api/collaborators"))).toBe(true));
    expect(urlsChamadas(fetchMock).some((u) => u.startsWith("/api/system-settings"))).toBe(false);
  });

  it("clicar no checkbox ou num botão da linha não abre o modal", async () => {
    const { user } = montar();
    await user.click(screen.getByRole("checkbox", { name: "Selecionar vaga #101" }));
    await user.click(screen.getByRole("button", { name: "Devolver a vaga #101 para a área" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Enter na linha em foco abre; ‹ › navega pela lista da aba", async () => {
    const { user } = montar();
    screen.getByTestId("awaiting-row-101").focus();
    await user.keyboard("{Enter}");
    const modal = await modalAberto();
    expect(within(modal).getByTestId("text-modal-id")).toHaveTextContent("#101");
    expect(within(modal).getByTestId("button-nav-prev")).toBeDisabled();

    await user.click(within(modal).getByTestId("button-nav-next"));
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByTestId("text-modal-id")).toHaveTextContent("#102"));
    expect(within(screen.getByRole("dialog")).getByTestId("text-nav-position")).toHaveTextContent("2 / 2");
    expect(within(screen.getByRole("dialog")).getByTestId("button-nav-next")).toBeDisabled();

    await user.click(within(screen.getByRole("dialog")).getByTestId("button-nav-prev"));
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByTestId("text-modal-id")).toHaveTextContent("#101"));
  });

  it("Aprovar pelo modal: o mesmo diálogo e a mesma mutação da linha, e o modal segue para a próxima vaga", async () => {
    const { user, onApprove, rows } = montar();
    await user.click(within(screen.getByTestId("awaiting-row-101")).getByText("Leva o kit"));
    const modal = await modalAberto();
    await user.click(within(modal).getByTestId("button-aprovar-no-modal"));
    const dialogo = await screen.findByRole("alertdialog", { name: "Aprovar 1 vaga?" });
    expect(dialogo).toHaveTextContent("#101");
    await user.click(within(dialogo).getByRole("button", { name: "Aprovar (1)" }));
    expect(onApprove).toHaveBeenCalledWith([rows[0]]);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByTestId("text-modal-id")).toHaveTextContent("#102"));
  });

  it("Reprovar pelo modal pede o comentário; decidida a última vaga, o modal fecha", async () => {
    const { user, onDecide, rows } = montar({ rows: [validada({ id: "s9", inclusionNumber: 109, functionId: "funcao-1", eventId: "ev-1" })] });
    await user.click(screen.getByTestId("awaiting-row-109").querySelector("td[data-primeira]") as HTMLElement);
    const modal = await modalAberto();
    await user.click(within(modal).getByRole("button", { name: "Reprovar" }));
    const dialogo = await screen.findByRole("alertdialog", { name: "Reprovar vaga validada?" });
    await user.click(within(dialogo).getByLabelText("Comentário para a área (obrigatório)"));
    await user.paste("Escala refeita");
    await user.click(within(dialogo).getByRole("button", { name: "Reprovar" }));
    expect(onDecide).toHaveBeenCalledWith(rows[0], "reprovar", "Escala refeita");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("vaga de outro aprovador: o modal abre, mas sem botões de decisão — diz quem decide", async () => {
    const { user } = montar({
      rows: [validada({ id: "s1", inclusionNumber: 101, functionId: "funcao-1", eventId: "ev-1", canDecide: false })],
      approverNamesFor: () => ["Paulo Reis"],
    });
    await user.click(screen.getByTestId("awaiting-row-101").querySelector("td[data-primeira]") as HTMLElement);
    const modal = await modalAberto();
    expect(within(modal).queryByTestId("decisao-no-modal")).toBeNull();
    expect(within(modal).getByTestId("quem-decide-no-modal")).toHaveTextContent("Paulo Reis");
  });

  it.each([
    ["production", false],
    ["admin", true],
  ] as const)("vaga de cenotécnica aberta por %s: /api/system-settings só para o financeiro (pedido = %s)", async (role, pede) => {
    const fetchMock = mockarFetch((url) => {
      if (url.startsWith("/api/functions")) return respostaJson([funcaoFake({ id: "funcao-ceno", name: "Cenotécnica" })]);
      if (url.startsWith("/api/system-settings")) return respostaJson({});
      return respostaJson([]);
    });
    const { user } = renderComTudo(
      <AwaitingApproval
        rows={[validada({ id: "c1", inclusionNumber: 201, functionId: "funcao-ceno" })]}
        functionNameById={new Map([["funcao-ceno", "Cenotécnica"]])}
        onApprove={vi.fn()}
        onDecide={vi.fn()}
      />,
      { user: usuarioFake({ role }), queryClient: criarQueryClientComApi() },
    );
    await user.click(screen.getByTestId("awaiting-row-201").querySelector("td[data-primeira]") as HTMLElement);
    await modalAberto();
    // A função carregou (o modal já sabe que é cenotécnica) antes de conferir.
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByTestId("text-modal-contexto")).toHaveTextContent("Cenotécnica ·"));
    if (pede) await waitFor(() => expect(urlsChamadas(fetchMock).some((u) => u.startsWith("/api/system-settings"))).toBe(true));
    else expect(urlsChamadas(fetchMock).some((u) => u.startsWith("/api/system-settings"))).toBe(false);
  });

  it("sem acesso à Escalação a linha não abre nada", async () => {
    const { user } = montar({}, { semAcesso: true });
    expect(screen.getByTestId("awaiting-row-101")).not.toHaveAttribute("tabindex");
    await user.click(within(screen.getByTestId("awaiting-row-101")).getByText("Leva o kit"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
