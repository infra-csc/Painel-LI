import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderComTudo, esperarToast } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { idDoErro } from "@/lib/campo-com-erro";
import { colaboradorFake, eventoFake, funcaoFake, hospedagemFake, vagaFake } from "@/test/fixtures-dominio";
import AccommodationModal, { type AccommodationModalProps } from "./accommodation-modal";

function montar(extras: Partial<AccommodationModalProps> = {}) {
  // Comentários, histórico e trocas da vaga: listas vazias.
  mockarFetch((url) => respostaJson([], 200, url));
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const inclusion = extras.inclusion ?? vagaFake({ id: "vaga-1", inclusionNumber: 101, needsAccommodation: true });
  const props: AccommodationModalProps = {
    open: true, onClose, inclusion, accommodation: undefined,
    event: eventoFake({ id: "evento-1", name: "Circuito Brasília" }),
    func: funcaoFake({ id: "funcao-1", name: "Produção" }),
    collaborator: colaboradorFake({ id: "colab-1", fullName: "Ana Souza" }),
    collaboratorById: new Map(), users: [],
    canEditRecord: true, isPurchasingRole: true, lockedForRole: false, isPostPurchase: false, isSaving: false,
    onSave, ...extras,
  };
  const utils = renderComTudo(<AccommodationModal {...props} />, { queryClient: criarQueryClientComApi() });
  return { ...utils, onClose, onSave, inclusion };
}

const hotel = () => screen.getByLabelText(/Nome do hotel/) as HTMLInputElement;
const localizacao = () => screen.getByLabelText(/^Localização/) as HTMLInputElement;
const checkIn = () => screen.getByTestId("input-checkin-date") as HTMLInputElement;
const checkOut = () => screen.getByTestId("input-checkout-date") as HTMLInputElement;
const registrar = () => screen.getByRole("button", { name: "Registrar hospedagem" });
/** A mensagem inline do campo — o toast repete o mesmo texto; aqui é o <p role=alert> ligado ao campo. */
const erroDe = (campo: string) => document.getElementById(idDoErro(`${campo}-vaga-1`));
/** Há dois "Fechar": o X do Dialog (sr-only) e o do rodapé, com texto visível. */
const fechar = () => screen.getAllByRole("button", { name: "Fechar" }).find((b) => b.textContent === "Fechar")!;
const mudarData = (input: HTMLInputElement, valor: string) => fireEvent.change(input, { target: { value: valor } });

describe("AccommodationModal", () => {
  it("vaga pendente abre em 'Dados', com as datas da escala já preenchidas e o progresso em 2 de 4", () => {
    montar();
    expect(screen.getByRole("dialog", { name: "Registro de hospedagem" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Dados da hospedagem/ })).toHaveAttribute("aria-selected", "true");
    expect(checkIn()).toHaveValue("2026-04-10");
    expect(checkOut()).toHaveValue("2026-04-12");
    expect(hotel()).toHaveValue("");
    const progresso = screen.getByRole("progressbar", { name: "Campos obrigatórios preenchidos" });
    expect(progresso).toHaveAttribute("aria-valuenow", "2");
    expect(progresso).toHaveAttribute("aria-valuemax", "4");
    expect(screen.getByText("Pendente")).toBeInTheDocument();
  });

  it("obrigatórios vazios: Registrar marca hotel e localização com aria-invalid + mensagens, foca o primeiro e NÃO salva", async () => {
    const { user, onSave } = montar();
    expect(hotel()).toBeRequired();
    await user.click(registrar());
    expect(hotel()).toHaveAttribute("aria-invalid", "true");
    expect(localizacao()).toHaveAttribute("aria-invalid", "true");
    expect(erroDe("hotelName")).toHaveTextContent("Informe o nome do hotel.");
    expect(erroDe("hotelName")).toHaveAttribute("role", "alert");
    expect(erroDe("hotelLocation")).toHaveTextContent("Informe a localização.");
    expect(hotel()).toHaveAccessibleDescription("Informe o nome do hotel.");
    await esperarToast("Preencha os campos obrigatórios");
    await waitFor(() => expect(hotel()).toHaveFocus());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("hotel preenchido mas sem check-in: não envia e marca a data", async () => {
    const { user, onSave } = montar();
    await user.type(hotel(), "Hotel Nacional");
    await user.type(localizacao(), "Asa Sul");
    mudarData(checkIn(), "");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
    await user.click(registrar());
    expect(checkIn()).toHaveAttribute("aria-invalid", "true");
    expect(erroDe("checkInDate")).toHaveTextContent("Informe a data do check-in.");
    expect(hotel()).not.toHaveAttribute("aria-invalid");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("check-out anterior ao check-in: alerta na hora e o envio é barrado", async () => {
    const { user, onSave } = montar();
    await user.type(hotel(), "Hotel Nacional");
    await user.type(localizacao(), "Asa Sul");
    mudarData(checkOut(), "2026-04-09");
    expect(screen.getByText("O check-out deve ser igual ou posterior ao check-in.")).toHaveAttribute("role", "alert");
    await user.click(registrar());
    expect(checkOut()).toHaveAttribute("aria-invalid", "true");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("tudo preenchido chama onSave com o rascunho completo", async () => {
    const { user, onSave } = montar();
    await user.type(hotel(), "Hotel Nacional");
    await user.type(localizacao(), "Asa Sul, Brasília");
    await user.type(screen.getByLabelText("Número da reserva"), "RES-9");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
    await user.click(registrar());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      hotelName: "Hotel Nacional", hotelLocation: "Asa Sul, Brasília", reservationNumber: "RES-9",
      checkInDate: "2026-04-10", checkOutDate: "2026-04-12", attachmentIds: [],
    }));
  });

  it("digitar no campo com erro limpa a marcação", async () => {
    const { user } = montar();
    await user.click(registrar());
    expect(hotel()).toHaveAttribute("aria-invalid", "true");
    await user.type(hotel(), "H");
    expect(hotel()).not.toHaveAttribute("aria-invalid");
    expect(erroDe("hotelName")).toBeNull();
  });

  it("'Usar o período da escala' preenche só as datas vazias", async () => {
    const { user } = montar();
    mudarData(checkIn(), "");
    mudarData(checkOut(), "2026-04-13");
    await user.click(screen.getByRole("button", { name: "Usar o período da escala" }));
    expect(checkIn()).toHaveValue("2026-04-10");
    expect(checkOut()).toHaveValue("2026-04-13"); // o que já estava digitado fica
    expect(screen.getByTestId("periodo-da-escala")).toHaveTextContent("Escala: 10/04 a 12/04/2026 · 2 diárias");
  });

  it("somente leitura: sem 'Registrar', campos desabilitados e sem card do voucher", () => {
    montar({ canEditRecord: false });
    expect(screen.queryByRole("button", { name: /Registrar hospedagem|Atualizar hospedagem/ })).toBeNull();
    expect(hotel()).toBeDisabled();
    expect(checkIn()).toBeDisabled();
    expect(screen.queryByTestId("card-voucher")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("hospedagem registrada abre em 'Resumo', com pílula 'Registrada' e o botão vira 'Atualizar hospedagem'", async () => {
    const { user } = montar({ accommodation: hospedagemFake({ teamInclusionId: "vaga-1" }), isPostPurchase: true });
    expect(screen.getByRole("tab", { name: "Resumo" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("Registrada").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Atualizar hospedagem" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Dados da hospedagem/ }));
    expect(hotel()).toHaveValue("Hotel Nacional");
    expect(screen.getByTestId("mirror-readonly-block")).toBeInTheDocument();
  });

  it("evento encerrado: banner e aviso no rodapé", () => {
    montar({ eventLocked: true, eventLockMessage: "Evento encerrado — só o administrador altera" });
    expect(screen.getByTestId("banner-evento-encerrado")).toHaveTextContent("Evento encerrado — só o administrador altera");
    expect(screen.getByTestId("footer-past-event-block")).toHaveTextContent("Evento encerrado — só o administrador altera");
  });

  it("'Fechar' chama onClose", async () => {
    const { user, onClose } = montar();
    await user.click(fechar());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // DEFEITO (accommodation-modal.tsx:59): `onOpenChange={(o) => { if (!o) onClose(); }}`
  // fecha no Esc/clique fora mesmo com o rascunho alterado — o texto digitado se
  // perde sem aviso. Os outros modais do app passam por `useConfirmarDescarte`.
  it("com alterações não salvas, Esc pede 'Descartar alterações?' e só fecha em 'Descartar'", async () => {
    const { user, onClose } = montar();
    await user.type(hotel(), "Hotel Nacional");
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("alertdialog", { name: "Descartar alterações?" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
