/**
 * Detalhe da vaga na Aprovação de escala (23/10) — o MESMO detalhe da
 * Validação de escala (dono: "teria que ser no estilo do segundo"), com o
 * rodapé do aprovador. A linha abre a vaga certa, ‹ › percorre a lista da aba,
 * e Aprovar / Reprovar / Devolver usam a MESMA mutação da linha e avançam.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake } from "@/test/fixtures";
import { sugestaoFake } from "@/test/fixtures-dominio";
import type { VagaDecidida } from "@/components/scaling-validation/decided-panel";
import type { StalledRow } from "../types";
import { AwaitingApproval } from "../awaiting-approval";
import { StalledSuggestions } from "../stalled-suggestions";
import { DetalheDaVagaNaAprovacao } from "./detalhe-da-vaga";
import { HistoriaDaDecidida, SelosDaDecidida } from "./da-decidida";
import { useDetalheDaVaga } from "./use-detalhe-da-vaga";

type Props = Parameters<typeof AwaitingApproval>[0];

const validada = (parcial: Partial<StalledRow> = {}) => sugestaoFake({
  status: "sugestao_validada",
  validatedAt: new Date("2026-03-05T12:00:00Z"),
  validatedBy: "u1",
  ...parcial,
});

/** Só o histórico da vaga é buscado (o cartão "Histórico" do detalhe). */
function apiDoDetalhe() {
  return mockarFetch(() => respostaJson([]));
}

function montar(extras: Partial<Props> = {}) {
  const fetchMock = apiDoDetalhe();
  const onApprove = vi.fn().mockResolvedValue(undefined);
  const onDecide = vi.fn().mockResolvedValue(undefined);
  const rows = extras.rows ?? [
    validada({ id: "s1", inclusionNumber: 101, functionId: "funcao-1", observations: "Leva o kit", validationNote: "Chega no dia anterior", city: null }),
    validada({ id: "s2", inclusionNumber: 102, functionId: "funcao-2" }),
  ];
  const utils = renderComTudo(
    <AwaitingApproval
      rows={rows}
      functionNameById={new Map([["funcao-1", "Produção"], ["funcao-2", "Kit"]])}
      userNameById={new Map([["u1", "Marina Dias"]])}
      approverNamesFor={() => ["Paulo Reis"]}
      onApprove={onApprove}
      onDecide={onDecide}
      {...extras}
    />,
    { user: usuarioFake({ role: "production" }) },
  );
  return { ...utils, rows, onApprove, onDecide, fetchMock };
}

const detalhe = () => screen.findByTestId("detalhe-da-vaga");
const numeroNoDetalhe = (n: number) => waitFor(() => expect(screen.getByTestId("detalhe-da-vaga")).toHaveTextContent(`#${n}`));

describe("Aprovação → detalhe da vaga no estilo da Validação", () => {
  it("clicar na linha abre a vaga certa: #, N de total, função, evento, 'você aprova', selo e a observação com quem validou", async () => {
    const { user, fetchMock } = montar();
    await user.click(within(screen.getByTestId("awaiting-row-101")).getByText("Leva o kit"));
    const d = await detalhe();
    expect(d).toHaveTextContent("#101");
    expect(d).toHaveTextContent("1 de 2");
    expect(within(d).getByRole("heading", { name: "Produção" })).toBeInTheDocument();
    expect(d).toHaveTextContent("Circuito Brasília");
    expect(d).toHaveTextContent("você aprova esta função");
    expect(d).toHaveTextContent("Validada pela área — aguardando aprovação");
    // A história: observação da validação, com quem validou.
    const obs = within(d).getByTestId("observacao-validacao");
    expect(obs).toHaveTextContent("Chega no dia anterior");
    expect(obs).toHaveTextContent("Marina Dias");
    // Seções da Validação.
    expect(within(d).getByRole("heading", { name: "Período e diárias" })).toBeInTheDocument();
    expect(within(d).getByRole("heading", { name: "Logística" })).toBeInTheDocument();
    expect(within(d).getByRole("heading", { name: "Observações da vaga" })).toBeInTheDocument();
    expect(d).toHaveTextContent("Sem logística — esta vaga não precisa de passagem nem de hospedagem.");
    // Nada do modal da Escalação (abas Passagem/Hospedagem) nem das consultas dele.
    expect(within(d).queryByRole("tab")).toBeNull();
    expect(urlsChamadas(fetchMock).every((u) => u === "/api/team-inclusions/s1/logs")).toBe(true);
    // Rodapé do aprovador.
    const rodape = within(d).getByTestId("decisao-no-detalhe");
    expect(within(rodape).getAllByRole("button").map((b) => b.textContent?.trim())).toEqual(["Reprovar", "Devolver", "Aprovar"]);
  });

  it("validada sem observação: o aviso 'Validada pela área' diz quem e quando", async () => {
    const { user } = montar();
    await user.click(screen.getByTestId("awaiting-row-102").querySelector("td[data-primeira]") as HTMLElement);
    const d = await detalhe();
    expect(within(d).queryByTestId("observacao-validacao")).toBeNull();
    const aviso = within(d).getByRole("region", { name: "Validada pela área" });
    expect(aviso).toHaveTextContent("Marina Dias");
    expect(aviso).toHaveTextContent("05/03/2026");
  });

  it("clicar no checkbox ou num botão da linha não abre o detalhe", async () => {
    const { user } = montar();
    await user.click(screen.getByRole("checkbox", { name: "Selecionar vaga #101" }));
    await user.click(screen.getByRole("button", { name: "Devolver a vaga #101 para a área" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.queryByTestId("detalhe-da-vaga")).toBeNull();
  });

  it("Enter na linha abre; ‹ › e as setas do teclado andam pela lista da aba", async () => {
    const { user } = montar();
    screen.getByTestId("awaiting-row-101").focus();
    await user.keyboard("{Enter}");
    const d = await detalhe();
    expect(within(d).getByRole("button", { name: "Vaga anterior" })).toBeDisabled();
    await user.click(within(d).getByRole("button", { name: "Próxima vaga" }));
    await numeroNoDetalhe(102);
    expect(screen.getByTestId("detalhe-da-vaga")).toHaveTextContent("2 de 2");
    expect(within(screen.getByTestId("detalhe-da-vaga")).getByRole("heading", { name: "Kit" })).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    await numeroNoDetalhe(101);
  });

  it("Aprovar: o mesmo diálogo e a mesma mutação da linha; o detalhe segue para a próxima", async () => {
    const { user, onApprove, rows } = montar();
    await user.click(within(screen.getByTestId("awaiting-row-101")).getByText("Leva o kit"));
    const d = await detalhe();
    await user.click(within(d).getByTestId("button-aprovar-no-detalhe"));
    const dialogo = await screen.findByRole("alertdialog", { name: "Aprovar 1 vaga?" });
    expect(dialogo).toHaveTextContent("#101");
    // Com o diálogo por cima, as setas são dele: o detalhe não troca de vaga.
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("detalhe-da-vaga")).toHaveTextContent("#101");
    await user.click(within(dialogo).getByRole("button", { name: "Aprovar (1)" }));
    expect(onApprove).toHaveBeenCalledWith([rows[0]]);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await numeroNoDetalhe(102);
  });

  it("Devolver pede o comentário, chama a mutação da linha e avança", async () => {
    const { user, onDecide, rows } = montar();
    await user.click(within(screen.getByTestId("awaiting-row-101")).getByText("Leva o kit"));
    const d = await detalhe();
    await user.click(within(d).getByRole("button", { name: "Devolver" }));
    const dialogo = await screen.findByRole("alertdialog", { name: "Devolver a vaga para a área?" });
    await user.click(within(dialogo).getByLabelText("Comentário para a área (obrigatório)"));
    await user.paste("Revise os dias");
    await user.click(within(dialogo).getByRole("button", { name: "Devolver" }));
    expect(onDecide).toHaveBeenCalledWith(rows[0], "devolver", "Revise os dias");
    await numeroNoDetalhe(102);
  });

  it("Reprovar a última vaga da lista: mesma mutação, e o detalhe fecha", async () => {
    const { user, onDecide, rows } = montar({ rows: [validada({ id: "s9", inclusionNumber: 109, functionId: "funcao-1" })] });
    await user.click(screen.getByTestId("awaiting-row-109").querySelector("td[data-primeira]") as HTMLElement);
    const d = await detalhe();
    await user.click(within(d).getByRole("button", { name: "Reprovar" }));
    const dialogo = await screen.findByRole("alertdialog", { name: "Reprovar vaga validada?" });
    await user.click(within(dialogo).getByLabelText("Comentário para a área (obrigatório)"));
    await user.paste("Escala refeita");
    await user.click(within(dialogo).getByRole("button", { name: "Reprovar" }));
    expect(onDecide).toHaveBeenCalledWith(rows[0], "reprovar", "Escala refeita");
    await waitFor(() => expect(screen.queryByTestId("detalhe-da-vaga")).toBeNull());
  });

  it("vaga de outro aprovador: sem botões de decisão, dizendo quem decide", async () => {
    const { user } = montar({
      rows: [validada({ id: "s1", inclusionNumber: 101, functionId: "funcao-1", canDecide: false })],
    });
    await user.click(screen.getByTestId("awaiting-row-101").querySelector("td[data-primeira]") as HTMLElement);
    const d = await detalhe();
    expect(within(d).queryByTestId("decisao-no-detalhe")).toBeNull();
    expect(within(d).queryByRole("button", { name: /Aprovar|Reprovar|Devolver/ })).toBeNull();
    expect(within(d).getByTestId("quem-decide-no-detalhe")).toHaveTextContent("Quem decide esta vaga: Paulo Reis.");
    expect(d).toHaveTextContent("quem aprova: Paulo Reis");
  });

  it("vaga que voltou do aprovador: selo e o cartão com a história, autor e data", async () => {
    const { user } = montar({
      rows: [validada({
        id: "s5", inclusionNumber: 5171, functionId: "funcao-1",
        lastDecision: { requestId: "p1", requestType: "inclusao", status: "reenviado_validacao", comment: "Faltou o motorista", byName: "Paulo Reis", at: "2026-03-04T15:00:00Z" },
      })],
    });
    await user.click(screen.getByTestId("awaiting-row-5171").querySelector("td[data-primeira]") as HTMLElement);
    const d = await detalhe();
    expect(d).toHaveTextContent("Voltou do aprovador");
    const historia = within(d).getByRole("region", { name: /pedido de inclusão/ });
    expect(historia).toHaveTextContent("Faltou o motorista");
    expect(historia).toHaveTextContent("Paulo Reis");
    expect(historia).toHaveTextContent("04/03/2026");
  });
});

describe("Paradas na área → detalhe", () => {
  it("Aprovar direto pelo detalhe: o mesmo diálogo e a mesma mutação do bypass; segue para a próxima", async () => {
    apiDoDetalhe();
    const onDecide = vi.fn().mockResolvedValue(undefined);
    const rows = [
      sugestaoFake({ id: "p1", inclusionNumber: 301, functionId: "funcao-1", daysPending: 9 }),
      sugestaoFake({ id: "p2", inclusionNumber: 302, functionId: "funcao-1", daysPending: 8 }),
    ];
    const { user } = renderComTudo(
      <StalledSuggestions rows={rows} functionNameById={new Map([["funcao-1", "Produção"]])} canActOn={() => true} onDecide={onDecide} />,
      { user: usuarioFake({ role: "production" }) },
    );
    await user.click(screen.getByTestId("parada-row-301").querySelector("td[data-primeira]") as HTMLElement);
    const d = await detalhe();
    expect(d).toHaveTextContent("Aguardando validação da área");
    expect(d).toHaveTextContent("pendente há 9 dias");
    // Parada: a área nunca validou — não há "Devolver".
    expect(within(within(d).getByTestId("decisao-no-detalhe")).getAllByRole("button").map((b) => b.textContent?.trim())).toEqual(["Reprovar", "Aprovar direto"]);
    await user.click(within(d).getByRole("button", { name: "Aprovar direto" }));
    const dialogo = await screen.findByRole("alertdialog", { name: "Aprovar vaga direto, sem validação da área?" });
    await user.click(within(dialogo).getByRole("button", { name: /Aprovar direto · vira Inclusão/ }));
    expect(onDecide).toHaveBeenCalledWith(rows[0], "approve", undefined);
    await numeroNoDetalhe(302);
  });
});

describe("Decididas → detalhe", () => {
  function Decididas({ vagas }: { vagas: VagaDecidida[] }) {
    const d = useDetalheDaVaga(vagas);
    return (
      <>
        <button type="button" onClick={() => d.abrir(vagas[0])}>abrir</button>
        <DetalheDaVagaNaAprovacao detalhe={d} functionNameById={new Map([["funcao-1", "Produção"]])}
          selos={(v) => <SelosDaDecidida vaga={v} />} historia={(v) => <HistoriaDaDecidida vaga={v} />} />
      </>
    );
  }
  const aprovada: VagaDecidida = {
    ...sugestaoFake({ id: "d1", inclusionNumber: 401, functionId: "funcao-1", phase: "inclusao", status: "planejado" }),
    decididaComo: "aprovada",
    decisao: { action: "suggestion_approved", resumo: "", comment: "Ok, segue", byName: "Paulo Reis", at: "2026-03-06T10:00:00Z" },
  };

  it.each([
    ["production", true],
    ["convidado", false],
  ] as const)("aprovada (%s): selo da decisão, como foi decidida, sem botões; 'Abrir na Escalação' só com acesso (%s)", async (role, comLink) => {
    apiDoDetalhe();
    const { user } = renderComTudo(<Decididas vagas={[aprovada]} />, { user: usuarioFake({ role }) });
    await user.click(screen.getByRole("button", { name: "abrir" }));
    const d = await detalhe();
    expect(d).toHaveTextContent("Aprovada — virou Inclusão");
    expect(d).not.toHaveTextContent("planejado");
    const historia = within(d).getByRole("region", { name: "Aprovada pelo aprovador após a validação da área" });
    expect(historia).toHaveTextContent("Ok, segue");
    expect(historia).toHaveTextContent("Paulo Reis");
    expect(within(d).queryByTestId("decisao-no-detalhe")).toBeNull();
    if (comLink) expect(within(d).getByTestId("detalhe-abrir-na-escalacao")).toHaveTextContent("Abrir na Escalação");
    else expect(within(d).queryByTestId("detalhe-abrir-na-escalacao")).toBeNull();
  });
});
