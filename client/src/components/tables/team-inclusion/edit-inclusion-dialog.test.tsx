import { useMemo } from "react";
import { describe, it, expect } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { Function as Funcao, TeamInclusion } from "@shared/schema";
import { renderComTudo, esperarToast } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { funcaoFake, vagaFake } from "@/test/fixtures-dominio";
import { TEXTOS_DO_DESCARTE } from "@/lib/confirmar-descarte";
import { rotuloDaVaga } from "@/components/common/status-badge";
import { getDisplayStatus } from "./inclusion-shared";
import { useEditInclusion } from "./use-edit-inclusion";
import { EditInclusionDialog } from "./edit-inclusion-dialog";

/** O modal é controlado pelo hook; o harness só dá um botão para abrir a edição da vaga. */
function Harness({ vaga, funcoes }: { vaga: TeamInclusion; funcoes: Funcao[] }) {
  const porId = useMemo(() => new Map([[vaga.id, vaga]]), [vaga]);
  const edit = useEditInclusion(porId);
  return (
    <>
      <button type="button" onClick={() => edit.handleEdit(vaga.id)}>Abrir edição</button>
      <EditInclusionDialog edit={edit} functions={funcoes} />
    </>
  );
}

const FUNCOES = [funcaoFake({ id: "funcao-1", name: "Produção" }), funcaoFake({ id: "funcao-2", name: "Kit" })];

async function abrir(vaga = vagaFake({ id: "vaga-1", inclusionNumber: 101, functionId: "funcao-1", status: "escalado", needsTicket: true })) {
  const utils = renderComTudo(<Harness vaga={vaga} funcoes={FUNCOES} />);
  await utils.user.click(screen.getByRole("button", { name: "Abrir edição" }));
  const dialogo = await screen.findByRole("dialog", { name: "Editar inclusão" });
  return { ...utils, dialogo, vaga };
}

const corpoDoPatch = (fetchMock: ReturnType<typeof mockarFetch>) => {
  const chamada = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
  expect(chamada, "esperava um PATCH").toBeDefined();
  return JSON.parse(String(chamada![1]!.body)) as Record<string, unknown>;
};

describe("EditInclusionDialog", () => {
  it("abre nomeado 'Editar inclusão', com a função da vaga escolhida e o foco no campo de função", async () => {
    const { dialogo } = await abrir();
    expect(dialogo).toHaveAccessibleDescription("Inclusão #101");
    const funcao = screen.getByLabelText(/^Função/) as HTMLSelectElement;
    expect(funcao).toHaveValue("funcao-1");
    expect(funcao).toHaveFocus();
  });

  it("NÃO existe campo de status: só a pílula somente leitura decidida pelo fluxo", async () => {
    const { dialogo, vaga } = await abrir();
    expect(screen.queryByRole("combobox", { name: /status/i })).toBeNull();
    expect(dialogo.querySelector('select[name="status"], input[name="status"]')).toBeNull();
    const chave = getDisplayStatus(vaga); // escalado + needsTicket → aguardando_passagem
    expect(screen.getByTestId("edit-status-readonly")).toHaveTextContent(rotuloDaVaga(chave));
  });

  it("salvar envia PATCH sem status/phase/dailyRates — só função, dias, logística e sugestões de viagem", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ ok: true }, 200, url));
    const { user, vaga } = await abrir();
    await user.selectOptions(screen.getByLabelText(/^Função/), "funcao-2");
    await user.selectOptions(screen.getByLabelText(/Precisa de passagem/), "false");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await esperarToast("Inclusão atualizada");

    const [url] = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(url).toBe(`/api/team-inclusions/${vaga.id}`);
    const corpo = corpoDoPatch(fetchMock);
    expect(corpo).not.toHaveProperty("status");
    expect(corpo).not.toHaveProperty("phase");
    expect(corpo).not.toHaveProperty("dailyRates");
    expect(corpo).toMatchObject({
      functionId: "funcao-2",
      needsTicket: false,
      needsAccommodation: false,
      workDays: ["2026-04-10", "2026-04-11", "2026-04-12"],
      scheduleStartDate: "2026-04-10",
      scheduleEndDate: "2026-04-12",
      collaboratorId: vaga.collaboratorId,
      eventId: vaga.eventId,
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editar inclusão" })).toBeNull());
  });

  it("com alteração, Esc pede confirmação; 'Continuar editando' mantém e 'Descartar' fecha", async () => {
    const { user } = await abrir();
    await user.selectOptions(screen.getByLabelText(/Precisa de hospedagem/), "true");
    await user.keyboard("{Escape}");
    const alerta = await screen.findByRole("alertdialog", { name: TEXTOS_DO_DESCARTE.titulo });
    expect(alerta).toHaveTextContent(TEXTOS_DO_DESCARTE.descricao);

    await user.click(screen.getByRole("button", { name: TEXTOS_DO_DESCARTE.continuar }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByRole("dialog", { name: "Editar inclusão" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(await screen.findByRole("button", { name: TEXTOS_DO_DESCARTE.descartar }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editar inclusão" })).toBeNull());
  });

  it("sem alteração, Cancelar fecha direto (sem perguntar)", async () => {
    const { user } = await abrir();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editar inclusão" })).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("clicar num dia desmarca (aria-pressed) e a contagem acompanha", async () => {
    const { user } = await abrir();
    expect(screen.getByText("3 dias")).toBeInTheDocument();
    const dias = screen.getAllByRole("button", { pressed: true });
    expect(dias).toHaveLength(3);
    await user.click(dias[1]);
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(2);
    expect(screen.getByText("2 dias")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "nenhum" }));
    expect(screen.getByText("0 dias")).toBeInTheDocument();
  });

  it("data de fim anterior à de início mostra a mensagem inline", async () => {
    await abrir();
    fireEvent.change(screen.getByLabelText(/Data de fim/), { target: { value: "2026-04-05" } });
    expect(screen.getByText("A data de fim não pode ser anterior à data de início.")).toBeInTheDocument();
  });

  it("erro do servidor mantém o diálogo aberto e mostra a mensagem dele no toast", async () => {
    mockarFetch((url) => respostaJson({ message: "Vaga travada por pedido de ajuste" }, 400, url));
    const { user } = await abrir();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await esperarToast("Vaga travada por pedido de ajuste");
    expect(screen.getByRole("dialog", { name: "Editar inclusão" })).toBeInTheDocument();
  });
});
