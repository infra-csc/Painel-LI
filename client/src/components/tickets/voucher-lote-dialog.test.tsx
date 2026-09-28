import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo, esperarToast } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { vagaFake } from "@/test/fixtures-dominio";
import VoucherLoteDialog from "./voucher-lote-dialog";

type Props = Parameters<typeof VoucherLoteDialog>[0];

const URL_LER = "/api/vouchers/ler";
const pdf = (nome = "voucher.pdf") => new File(["%PDF-1.4"], nome, { type: "application/pdf" });

function leitura(extras: Record<string, unknown> = {}) {
  return {
    arquivo: "voucher.pdf", tipo: "passagem", formato: "latam", pessoa: "Ana Souza", avisos: [],
    campos: { purchaseOrderNumber: "AX782Q", departureAirport: "GRU", destinationAirport: "BSB", actualDepartureDate: "2026-04-09", actualDepartureTime: "08:00", value: "1500,00", transportType: "aereo" },
    ...extras,
  };
}

function montar(extras: Partial<Props> = {}) {
  const onOpenChange = vi.fn();
  const onRegistrar = vi.fn().mockResolvedValue(undefined);
  const inclusions = extras.inclusions ?? [
    vagaFake({ id: "vaga-1", inclusionNumber: 101, collaboratorId: "colab-ana" }),
    vagaFake({ id: "vaga-2", inclusionNumber: 102, collaboratorId: "colab-bia" }),
  ];
  const nomes: Record<string, string> = { "colab-ana": "Ana Souza", "colab-bia": "Bia Lima" };
  const utils = renderComTudo(
    <VoucherLoteDialog
      open
      onOpenChange={onOpenChange}
      inclusions={inclusions}
      getCollaboratorName={(id) => (id && nomes[id]) || ""}
      getEventName={() => "Circuito Brasília"}
      onRegistrar={onRegistrar}
      registrando={false}
      {...extras}
    />,
  );
  return { ...utils, onOpenChange, onRegistrar, input: screen.getByTestId("input-vouchers") as HTMLInputElement };
}

describe("VoucherLoteDialog", () => {
  it("aceita só PDF: o input declara accept=application/pdf e um PNG nem chega ao servidor", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ leituras: [] }, 200, url));
    const { user, input } = montar();
    expect(input).toHaveAttribute("accept", "application/pdf");
    expect(input).toHaveAttribute("multiple");
    await user.upload(input, new File(["x"], "foto.png", { type: "image/png" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Nenhum arquivo ainda.")).toBeInTheDocument();
  });

  it("PDF vai em POST /api/vouchers/ler (multipart) e vira uma linha por passageiro, já casada com a vaga pelo nome", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ leituras: [leitura()] }, 200, url));
    const { user, input } = montar();
    await user.upload(input, pdf());
    const item = await screen.findByRole("listitem");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL_LER);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init!.body as FormData).getAll("files")).toHaveLength(1);

    expect(item).toHaveTextContent("voucher.pdf");
    expect(item).toHaveTextContent("Passageiro: Ana Souza");
    expect(item).toHaveTextContent("LOC AX782Q · GRU→BSB · ida 09/04/2026 08:00 · R$ 1500,00");
    expect(within(item).queryByText(/não achei a vaga pelo nome/)).toBeNull();
    expect(screen.getByText("1 pronta(s) para registrar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar 1" })).toBeEnabled();
  });

  it("voucher de grupo (várias pessoas no mesmo PDF) vira uma linha por pessoa", async () => {
    mockarFetch((url) => respostaJson({ leituras: [leitura({ pessoas: ["Ana Souza", "Bia Lima"] })] }, 200, url));
    const { user, input } = montar();
    await user.upload(input, pdf("grupo.pdf"));
    const itens = await screen.findAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(itens[0]).toHaveTextContent("Passageiro: Ana Souza");
    expect(itens[1]).toHaveTextContent("Passageiro: Bia Lima");
    expect(screen.getByText("2 pronta(s) para registrar")).toBeInTheDocument();
  });

  it("passageiro desconhecido fica sem vaga e pede que o operador escolha; voucher de hotel é recusado com o motivo", async () => {
    mockarFetch((url) => respostaJson({
      leituras: [leitura({ arquivo: "carlos.pdf", pessoa: "Carlos Lima" }), leitura({ arquivo: "hotel.pdf", tipo: "hospedagem", pessoa: "Ana Souza" })],
    }, 200, url));
    const { user, input } = montar();
    await user.upload(input, [pdf("carlos.pdf"), pdf("hotel.pdf")]);
    const itens = await screen.findAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("não achei a vaga pelo nome — escolha");
    expect(itens[1]).toHaveTextContent("Isto é um voucher de hotel (Ana Souza) — registre pela tela de Hospedagens.");
    expect(screen.getByText("Nenhuma linha pronta — confira as vagas acima.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar" })).toBeDisabled();
  });

  it("'Registrar' grava por vaga com os campos lidos, marca a linha como registrada e avisa", async () => {
    mockarFetch((url) => respostaJson({ leituras: [leitura()] }, 200, url));
    const { user, input, onRegistrar } = montar();
    await user.upload(input, pdf());
    await user.click(await screen.findByRole("button", { name: "Registrar 1" }));
    await esperarToast("Lote concluído");
    expect(onRegistrar).toHaveBeenCalledTimes(1);
    const [vaga, form] = onRegistrar.mock.calls[0];
    expect(vaga.id).toBe("vaga-1");
    expect(form).toMatchObject({ purchaseOrderNumber: "AX782Q", departureAirport: "GRU", destinationAirport: "BSB" });
    expect(screen.getByRole("listitem")).toHaveTextContent("Passagem registrada");
    expect(screen.getByRole("button", { name: "Registrar" })).toBeDisabled();
  });

  it("falha ao gravar mantém a linha com o erro para tentar de novo", async () => {
    mockarFetch((url) => respostaJson({ leituras: [leitura()] }, 200, url));
    const onRegistrar = vi.fn().mockRejectedValue(new Error("Vaga já tem passagem emitida"));
    const { user, input } = montar({ onRegistrar });
    await user.upload(input, pdf());
    await user.click(await screen.findByRole("button", { name: "Registrar 1" }));
    await esperarToast("Lote concluído com pendências");
    expect(screen.getByRole("listitem")).toHaveTextContent("Vaga já tem passagem emitida");
    expect(screen.getByRole("button", { name: "Registrar 1" })).toBeEnabled();
  });

  it("erro do servidor na leitura vira toast e não deixa linha fantasma", async () => {
    mockarFetch((url) => respostaJson({ message: "Arquivo corrompido" }, 422, url));
    const { user, input } = montar();
    await user.upload(input, pdf());
    await esperarToast("Arquivo corrompido");
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("'Tirar da lista' remove a linha; 'Fechar' avisa o pai", async () => {
    mockarFetch((url) => respostaJson({ leituras: [leitura()] }, 200, url));
    const { user, input, onOpenChange } = montar();
    await user.upload(input, pdf());
    await user.click(await screen.findByRole("button", { name: "Tirar voucher.pdf da lista" }));
    await waitFor(() => expect(screen.queryByRole("listitem")).toBeNull());
    // Há dois "Fechar": o X do Dialog (sr-only) e o botão do rodapé — o do rodapé tem o texto visível.
    await user.click(screen.getAllByRole("button", { name: "Fechar" }).find((b) => b.textContent === "Fechar")!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // DEFEITO (voucher-lote-dialog.tsx:581 e :712): com linhas lidas e ainda não
  // registradas, fechar (Esc, clique fora ou o botão Fechar) descarta a
  // conferência em silêncio — `onOpenChange` + `setLinhas([])` sem perguntar.
  // O padrão do app é `useConfirmarDescarte` ("Descartar alterações?").
  it("fechar com revisão pendente pede confirmação de descarte e só limpa as linhas em 'Descartar'", async () => {
    mockarFetch((url) => respostaJson({ leituras: [leitura()] }, 200, url));
    const { user, input, onOpenChange } = montar();
    await user.upload(input, pdf());
    await screen.findByRole("listitem");
    await user.click(screen.getAllByRole("button", { name: "Fechar" }).find((b) => b.textContent === "Fechar")!);
    const aviso = await screen.findByRole("alertdialog", { name: "Descartar alterações?" });
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.click(within(aviso).getByRole("button", { name: "Continuar editando" }));
    expect(screen.getByRole("listitem")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Descartar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
