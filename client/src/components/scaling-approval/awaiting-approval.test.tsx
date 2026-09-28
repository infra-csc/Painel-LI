import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { sugestaoFake } from "@/test/fixtures-dominio";
import { VALIDATION_NOTE_HINT_LABEL } from "@/components/scaling-validation/validation-note-blocks";
import type { StalledRow } from "./types";
import { AwaitingApproval } from "./awaiting-approval";

type Props = Parameters<typeof AwaitingApproval>[0];

const validada = (parcial: Partial<StalledRow> = {}) => sugestaoFake({
  status: "sugestao_validada",
  validatedAt: new Date("2026-03-05T12:00:00Z"),
  validatedBy: "u1",
  ...parcial,
});

function montar(extras: Partial<Props> = {}) {
  const onApprove = vi.fn().mockResolvedValue(undefined);
  const onDecide = vi.fn().mockResolvedValue(undefined);
  const rows = extras.rows ?? [
    validada({ id: "s1", inclusionNumber: 101, functionId: "funcao-1", validationNote: "Chega no dia anterior", needsTicket: true, observations: "Leva o kit" }),
    validada({ id: "s2", inclusionNumber: 102, functionId: "funcao-2" }),
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
  );
  return { ...utils, rows, onApprove, onDecide };
}

const comentario = () => screen.getByLabelText("Comentário para a área (obrigatório)");

describe("AwaitingApproval", () => {
  it("lista cada vaga com número, função, quem validou (nome, não uuid), data e a dica da observação", () => {
    montar();
    const linha = screen.getByTestId("awaiting-row-101");
    expect(linha).toHaveTextContent("#101");
    expect(linha).toHaveTextContent("Produção");
    expect(linha).toHaveTextContent("Leva o kit");
    expect(linha).toHaveTextContent("Marina Dias");
    expect(linha).toHaveTextContent("05/03/2026");
    expect(linha).not.toHaveTextContent("u1");
    expect(within(linha).getByLabelText(VALIDATION_NOTE_HINT_LABEL)).toBeInTheDocument();
    expect(within(linha).getByTitle("Precisa de passagem")).toHaveTextContent("Passagem");
    // Sem observação da validação: nada de dica na outra linha.
    expect(within(screen.getByTestId("awaiting-row-102")).queryByLabelText(VALIDATION_NOTE_HINT_LABEL)).toBeNull();
    expect(screen.getByTestId("awaiting-row-102")).toHaveTextContent("Sem logística");
  });

  it("sem vagas mostra o estado vazio", () => {
    montar({ rows: [] });
    expect(screen.getByText("Nenhuma vaga aguardando aprovação")).toBeInTheDocument();
  });

  it("quem não decide vê o cadeado com o motivo e nenhum botão de decisão", () => {
    montar({ rows: [validada({ id: "s1", inclusionNumber: 101, canDecide: false })], approverNamesFor: () => ["Paulo Reis"] });
    const linha = screen.getByTestId("awaiting-row-101");
    expect(linha).toHaveTextContent("Aprovador: Paulo Reis");
    expect(within(linha).queryByRole("button", { name: /Aprovar a vaga/ })).toBeNull();
    expect(within(linha).queryByRole("checkbox")).toBeNull();
    expect(within(linha).getByText("Você não é aprovador desta função. Aprovador: Paulo Reis")).toHaveClass("sr-only");
  });

  it("Aprovar pela linha: o diálogo repete a vaga COM a observação da validação e só fecha quando o servidor responde", async () => {
    const { user, onApprove, rows } = montar();
    await user.click(screen.getByRole("button", { name: "Aprovar a vaga #101" }));
    const dialogo = await screen.findByRole("alertdialog", { name: "Aprovar 1 vaga?" });
    expect(dialogo).toHaveTextContent("#101");
    expect(dialogo).toHaveTextContent("Observação da validação: Chega no dia anterior");
    expect(dialogo).toHaveTextContent("validada por Marina Dias · 05/03/2026");
    expect(dialogo).toHaveTextContent("Com passagem1 de 1");
    await user.click(screen.getByRole("button", { name: "Aprovar (1)" }));
    expect(onApprove).toHaveBeenCalledWith([rows[0]]);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("Reprovar exige comentário: o botão só habilita com texto e envia o texto sem espaços sobrando", async () => {
    const { user, onDecide, rows } = montar();
    await user.click(screen.getByRole("button", { name: "Reprovar a vaga #101" }));
    const dialogo = await screen.findByRole("alertdialog", { name: "Reprovar vaga validada?" });
    expect(dialogo).toHaveTextContent("A vaga sai da escala e fica registrada como negada.");
    // Tom danger: o foco inicial vai para o Voltar, não para o botão destrutivo.
    expect(screen.getByRole("button", { name: "Voltar" })).toHaveFocus();
    const reprovar = screen.getByRole("button", { name: "Reprovar" });
    expect(reprovar).toBeDisabled();
    expect(comentario()).toBeRequired();
    await user.type(comentario(), "   ");
    expect(reprovar).toBeDisabled();
    await user.type(comentario(), "Faltou a logística ");
    expect(reprovar).toBeEnabled();
    await user.click(reprovar);
    expect(onDecide).toHaveBeenCalledWith(rows[0], "reprovar", "Faltou a logística");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("Devolver para a área: diálogo no tom padrão, mesma exigência de comentário", async () => {
    const { user, onDecide, rows } = montar();
    await user.click(screen.getByRole("button", { name: "Devolver a vaga #102 para a área" }));
    await screen.findByRole("alertdialog", { name: "Devolver a vaga para a área?" });
    expect(screen.getByRole("button", { name: "Devolver" })).toBeDisabled();
    await user.type(comentario(), "Revisar as datas");
    await user.click(screen.getByRole("button", { name: "Devolver" }));
    expect(onDecide).toHaveBeenCalledWith(rows[1], "devolver", "Revisar as datas");
  });

  it("falha do servidor mantém o diálogo aberto com o comentário preservado; 409 (vaga mudou) fecha", async () => {
    const onDecide = vi.fn().mockRejectedValueOnce({ status: 500 }).mockRejectedValueOnce({ status: 409 });
    const { user } = montar({ onDecide });
    await user.click(screen.getByRole("button", { name: "Reprovar a vaga #101" }));
    await screen.findByRole("alertdialog");
    await user.type(comentario(), "Motivo longo");
    await user.click(screen.getByRole("button", { name: "Reprovar" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(comentario()).toHaveValue("Motivo longo");

    await user.click(screen.getByRole("button", { name: "Reprovar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("seleção: a barra conta as vagas; sem onDecideMany, reprovar/devolver ficam travados com a explicação visível", async () => {
    const { user } = montar();
    await user.click(screen.getByRole("checkbox", { name: "Selecionar vaga #101" }));
    await user.click(screen.getByRole("checkbox", { name: "Selecionar vaga #102" }));
    const barra = screen.getByRole("region", { name: "Ações para as vagas selecionadas" });
    expect(barra).toHaveTextContent("2 vagas selecionadas");
    expect(barra).toHaveTextContent("deixe só uma marcada para usar esses botões");
    const reprovar = within(barra).getByRole("button", { name: "Reprovar" });
    expect(reprovar).toBeDisabled();
    expect(reprovar).toHaveAttribute("aria-describedby", "awaiting-uma-por-vez");
    await user.click(within(barra).getByRole("button", { name: "Aprovar (2)" }));
    const dialogo = await screen.findByRole("alertdialog", { name: "Aprovar 2 vagas?" });
    expect(dialogo).toHaveTextContent("Com passagem1 de 2");
  });

  it("com onDecideMany a barra reprova em lote com um comentário só", async () => {
    const onDecideMany = vi.fn().mockResolvedValue(undefined);
    const { user, rows } = montar({ onDecideMany });
    await user.click(screen.getByRole("checkbox", { name: "Selecionar todas as vagas que você pode decidir" }));
    const barra = screen.getByRole("region", { name: "Ações para as vagas selecionadas" });
    await user.click(within(barra).getByRole("button", { name: "Reprovar (2)" }));
    const dialogo = await screen.findByRole("alertdialog", { name: "Reprovar 2 vagas?" });
    expect(within(dialogo).getByTestId("decisao-lote-lista")).toHaveTextContent("#101");
    expect(within(dialogo).getByTestId("decisao-lote-lista")).toHaveTextContent("#102");
    await user.type(comentario(), "Escala refeita");
    await user.click(screen.getByRole("button", { name: "Reprovar (2)" }));
    expect(onDecideMany).toHaveBeenCalledWith(rows, "reprovar", "Escala refeita");
  });

  it("busy: botões de decisão travados e o diálogo não fecha no Esc", async () => {
    const { user } = montar({ busy: true });
    expect(screen.getByRole("button", { name: "Aprovar a vaga #101" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reprovar a vaga #101" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
