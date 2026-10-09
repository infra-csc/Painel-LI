import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { Invoice } from "@shared/schema";
import { renderComTudo, criarQueryClient } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { eventoFake, notaFiscalFake, realizadoFake } from "@/test/fixtures-dominio";
import { CHAVE_CONTROLE_RH } from "@/components/rh/prestacao-utils";
import { getEffectiveStatus, getStatusCfg } from "./invoice-status";
import { useAprovacaoMutations } from "./use-invoice-actions";
import { AprovacaoActionPanel } from "./aprovacao-action-panel";
import { InvoiceStepper } from "./invoice-stepper";
import { InvoiceCard, type InvoiceCardProps } from "./invoice-card";

// ── Card do colaborador (aba Lançamento) ─────────────────────────────────────

function montarCard(extras: Partial<InvoiceCardProps> = {}) {
  const qc = criarQueryClient();
  const toast = vi.fn();
  const actual = extras.actual ?? realizadoFake({ id: "realizado-1", totalValue: 101600 });
  const props: InvoiceCardProps = {
    actual, invoice: undefined,
    getName: () => "ANA SOUZA", getFuncName: () => "Produção",
    selectedEvent: eventoFake({ id: "evento-1", paymentCompanyName: "CSC Esporte", paymentCompanyCnpj: "00.000.000/0001-00" }),
    selectedEventId: "evento-1", qc, toast: toast as unknown as InvoiceCardProps["toast"],
    ...extras,
  };
  const utils = renderComTudo(<InvoiceCard {...props} />, { queryClient: qc });
  return { ...utils, qc, toast, actual };
}

const campoOc = () => screen.getByLabelText(/Número OC/) as HTMLInputElement;
/** O botão do anexo muda de nome com o arquivo escolhido; o id é estável. */
const botaoAnexo = (actualId = "realizado-1") => document.getElementById(`nf-file-btn-${actualId}`) as HTMLButtonElement;

describe("InvoiceCard", () => {
  it("sem nota: pílula 'Pendente', valor formatado, OC obrigatória e anexo obrigatório", () => {
    montarCard();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("Produção")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.016,00")).toBeInTheDocument();
    expect(screen.getByText("Pendente")).toBeInTheDocument();
    expect(campoOc()).toBeRequired();
    expect(screen.getByRole("button", { name: "Enviar nota" })).toBeEnabled();
  });

  it("enviar sem OC: campo aria-invalid com a mensagem, foco nele e nenhuma chamada à API", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    const { user, toast } = montarCard();
    await user.click(screen.getByRole("button", { name: "Enviar nota" }));
    await waitFor(() => expect(campoOc()).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("alert")).toHaveTextContent("Informe o número da OC.");
    expect(campoOc()).toHaveAccessibleDescription("Informe o número da OC.");
    expect(campoOc()).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Não foi possível enviar a nota", variant: "destructive" }));
    // digitar limpa o erro
    await user.type(campoOc(), "OC-1");
    expect(campoOc()).not.toHaveAttribute("aria-invalid");
  });

  it("com OC mas sem anexo: o botão de anexo é o campo inválido e recebe o foco", async () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    const { user } = montarCard();
    await user.type(campoOc(), "OC-1234");
    await user.click(screen.getByRole("button", { name: "Enviar nota" }));
    await waitFor(() => expect(botaoAnexo()).toHaveAttribute("aria-invalid", "true"));
    expect(botaoAnexo()).toHaveFocus();
  });

  // DEFEITO (invoice-card.tsx:141): `campoComErro("nf-file-btn-<id>", erros.anexo)` põe
  // aria-describedby="nf-file-btn-<id>-erro", mas nenhum <MensagemDeErro id="nf-file-btn-<id>">
  // é renderizado — o leitor de tela não recebe "Anexe o arquivo da nota fiscal."; só o
  // toast (transitório) diz isso.
  it("sem anexo, a mensagem 'Anexe o arquivo da nota fiscal.' fica ligada ao botão por aria-describedby", async () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    const { user } = montarCard();
    await user.type(campoOc(), "OC-1234");
    await user.click(screen.getByRole("button", { name: "Enviar nota" }));
    await waitFor(() => expect(botaoAnexo()).toHaveAccessibleDescription("Anexe o arquivo da nota fiscal."));
  });

  it("OC + arquivo: sobe o arquivo, cria a NF como 'enviada' e invalida a lista do evento e o Controle RH", async () => {
    const fetchMock = mockarFetch((url) =>
      url === "/api/upload" ? respostaJson([{ url: "https://arquivos/nf.pdf" }], 200, url) : respostaJson({ id: "nf-novo" }, 200, url),
    );
    const { user, qc, toast, actual, container } = montarCard();
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    await user.type(campoOc(), "OC-1234");
    const arquivo = new File(["%PDF"], "nota.pdf", { type: "application/pdf" });
    await user.upload(container.querySelector('input[type="file"]')!, arquivo);
    expect(botaoAnexo()).toHaveTextContent("nota.pdf");
    await user.click(screen.getByRole("button", { name: "Enviar nota" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Nota enviada!" })));

    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls).toEqual(["/api/upload", "/api/invoices"]);
    const corpo = JSON.parse(String(fetchMock.mock.calls[1][1]!.body));
    expect(corpo).toMatchObject({
      eventId: "evento-1", budgetActualId: actual.id, oc: "OC-1234", status: "enviada",
      attachmentUrl: "https://arquivos/nf.pdf", attachmentName: "nota.pdf",
      paymentText: "Este pagamento deve ser realizado de ANA SOUZA para CSC Esporte / CNPJ: 00.000.000/0001-00.",
    });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["/api/invoices", "evento-1"] });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: [CHAVE_CONTROLE_RH] });
  });

  it("nota enviada: somente leitura com 'Aguardando RH', OC e link 'Ver nota'; sem formulário", () => {
    montarCard({ invoice: notaFiscalFake({ status: "enviada", oc: "OC-77" }) });
    expect(screen.getByText("Aguardando RH")).toBeInTheDocument();
    expect(screen.getByText("OC-77")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver nota/ })).toHaveAttribute("href", "https://arquivos.exemplo/nf.pdf");
    expect(screen.queryByLabelText(/Número OC/)).toBeNull();
  });

  it("devolvida: abre com o motivo visível, botão 'Reenviar' e OC preenchida para corrigir", () => {
    montarCard({ invoice: notaFiscalFake({ status: "devolvida", oc: "OC-77", returnComment: "OC errada" }) });
    expect(screen.getByText("Devolvida")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recolher motivo da devolução" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("OC errada")).toBeInTheDocument();
    expect(campoOc()).toHaveValue("OC-77");
    expect(screen.getByRole("button", { name: "Reenviar" })).toBeInTheDocument();
  });

  it("recusada é terminal: sem formulário e com o aviso definitivo", () => {
    montarCard({ invoice: notaFiscalFake({ status: "recusada", returnComment: "Fora do prazo" }) });
    expect(screen.getByText("NF recusada")).toBeInTheDocument();
    expect(screen.getByText("NF recusada — decisão definitiva, sem reenvio")).toBeInTheDocument();
    expect(screen.getByText("Fora do prazo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enviar nota|Reenviar/ })).toBeNull();
  });

  it("aprovada: aguardando check-in até o RH fazer; depois 'Check-in realizado' com a data de pagamento", () => {
    const { unmount } = montarCard({ invoice: notaFiscalFake({ status: "aprovada" }) });
    expect(getEffectiveStatus(notaFiscalFake({ status: "aprovada" }))).toBe("checkin-pendente");
    expect(screen.getByText("Aguard. check-in")).toBeInTheDocument();
    // 08/10 (redesenho): a linha diz o que falta embaixo da pílula.
    expect(screen.getByText("aprovada, falta o check-in")).toBeInTheDocument();
    unmount();
    montarCard({ invoice: notaFiscalFake({ status: "aprovada", checkinAt: new Date("2026-03-10T12:00:00Z"), paymentDate: "2026-03-15" }) });
    // A pílula "Check-in realizado" e, embaixo dela, a data de pagamento e a do check-in.
    expect(screen.getByText("Check-in realizado")).toBeInTheDocument();
    expect(screen.getByText("Pgto: 15/03/2026")).toBeInTheDocument();
    expect(screen.getByText("check-in em 10/03/2026")).toBeInTheDocument();
  });
});

// ── Painel do RH (aba Aprovação): devolver exige motivo ──────────────────────

function PainelDevolver({ inv, fechar, tipo = "return" }: { inv: Invoice; fechar: () => void; tipo?: "return" | "reject" }) {
  const [comment, setComment] = useState("");
  const [tocouMotivo, setTocouMotivo] = useState(false);
  const [checkinDate, setCheckinDate] = useState("");
  const qc = criarQueryClient();
  const toast = vi.fn() as unknown as Parameters<typeof useAprovacaoMutations>[0]["toast"];
  const m = useAprovacaoMutations({ selectedEventId: "evento-1", qc, toast, comment, checkinDate, closeAction: fechar });
  return (
    <table><tbody>
      <AprovacaoActionPanel
        inv={inv} cfg={getStatusCfg("enviada")} type={tipo}
        comment={comment} setComment={setComment} tocouMotivo={tocouMotivo} setTocouMotivo={setTocouMotivo}
        checkinDate={checkinDate} setCheckinDate={setCheckinDate} closeAction={fechar}
        approveMutation={m.approveMutation} returnMutation={m.returnMutation} rejectMutation={m.rejectMutation} checkinMutation={m.checkinMutation}
      />
    </tbody></table>
  );
}

describe("AprovacaoActionPanel — devolver", () => {
  const nota = () => notaFiscalFake({ id: "nf-7", status: "enviada" });
  const motivo = () => screen.getByLabelText(/Motivo da devolução/) as HTMLTextAreaElement;
  const confirmar = () => screen.getByRole("button", { name: /Confirmar devolução|Devolvendo…/ });

  it("sem motivo: botão desabilitado; ao sair do campo vazio, aria-invalid e mensagem", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    const { user } = renderComTudo(<PainelDevolver inv={nota()} fechar={vi.fn()} />);
    expect(motivo()).toHaveFocus(); // autoFocus
    expect(motivo()).toBeRequired();
    expect(confirmar()).toBeDisabled();
    await user.tab();
    expect(motivo()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Informe o motivo da devolução.");
    await user.type(motivo(), "   ");
    expect(confirmar()).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("com motivo: POST /api/invoices/:id/return com o comentário e fecha o painel", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    const fechar = vi.fn();
    const { user } = renderComTudo(<PainelDevolver inv={nota()} fechar={fechar} />);
    await user.type(motivo(), "OC divergente da planilha");
    expect(motivo()).not.toHaveAttribute("aria-invalid");
    expect(confirmar()).toBeEnabled();
    await user.click(confirmar());
    await waitFor(() => expect(fechar).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/invoices/nf-7/return");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init!.body))).toEqual({ comment: "OC divergente da planilha" });
  });

  it("'Cancelar' fecha sem chamar a API", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    const fechar = vi.fn();
    const { user } = renderComTudo(<PainelDevolver inv={nota()} fechar={fechar} />);
    await user.click(screen.getByRole("button", { name: /Cancelar/ }));
    expect(fechar).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("AprovacaoActionPanel — recusar (08/10: mesma validação do motivo)", () => {
  const motivo = () => screen.getByLabelText(/Motivo da recusa/) as HTMLTextAreaElement;
  it("sem motivo: aria-invalid ao sair do campo; Esc cancela; com motivo, Ctrl+Enter recusa", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    const fechar = vi.fn();
    const { user } = renderComTudo(<PainelDevolver inv={notaFiscalFake({ id: "nf-9", status: "enviada" })} fechar={fechar} tipo="reject" />);
    expect(motivo()).toHaveFocus();
    expect(motivo()).toBeRequired();
    await user.tab();
    expect(motivo()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Informe o motivo da recusa.");
    await user.type(motivo(), "CNPJ errado");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(fechar).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/invoices/nf-9/reject");
  });

  it("Esc dentro do painel fecha sem chamar a API", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    const fechar = vi.fn();
    const { user } = renderComTudo(<PainelDevolver inv={notaFiscalFake({ status: "enviada" })} fechar={fechar} tipo="reject" />);
    await user.keyboard("{Escape}");
    expect(fechar).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── Stepper do topo ──────────────────────────────────────────────────────────

describe("InvoiceStepper", () => {
  // 08/10 (redesenho): cada etapa é um bloco do resumo — número grande, o que
  // ele quer dizer ("a enviar", "em análise", "a fazer" ou "em dia") e quanto soma.
  it("etapa com pendências fica atual (com contagem); etapa sem pendências aparece concluída", () => {
    renderComTudo(<InvoiceStepper counts={{ lancamento: 2, aprovacao: 0, checkin: 1 }} valores={{ lancamento: 203200, aprovacao: 0, checkin: 101600 }} />);
    const lista = screen.getByRole("list", { name: "Etapas das notas fiscais" });
    const [lancamento, aprovacao, checkin] = within(lista).getAllByRole("listitem");
    expect(lancamento).toHaveTextContent("Lançamento");
    expect(lancamento).toHaveTextContent("2a enviar");
    expect(lancamento).toHaveAttribute("title", "2 itens sem nota enviada ou com nota devolvida");
    expect(within(lancamento).getByText("R$ 2.032,00")).toBeInTheDocument();
    expect(within(lancamento).getByText("Lançamento")).toHaveClass("text-primary");
    expect(within(aprovacao).getByText("Aprovação RH")).toHaveClass("text-success");
    expect(within(aprovacao).getByText("em dia")).toBeInTheDocument();
    expect(checkin).toHaveAttribute("title", "1 item com nota aprovada, aguardando o check-in financeiro");
  });

  it("tudo zerado: as três etapas concluídas", () => {
    renderComTudo(<InvoiceStepper counts={{ lancamento: 0, aprovacao: 0, checkin: 0 }} />);
    expect(screen.getAllByText("em dia")).toHaveLength(3);
    ["Lançamento", "Aprovação RH", "Check-in"].forEach((etapa) => expect(screen.getByText(etapa)).toHaveClass("text-success"));
  });
});
