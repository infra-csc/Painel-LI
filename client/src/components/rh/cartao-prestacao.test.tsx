import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { linhaRhFake, notaRhFake, realizadoRhFake } from "@/test/fixtures-dominio";
import { queryClient } from "@/lib/queryClient";
import { CHAVE_CONTROLE_RH } from "./prestacao-utils";
import { CartaoPrestacao, type CartaoPrestacaoProps } from "./cartao-prestacao";

function montar(extras: Partial<CartaoPrestacaoProps> = {}) {
  const acoes = {
    toggleExpand: vi.fn(), toggleDetails: vi.fn(), navigate: vi.fn(), setApprovingInvoiceId: vi.fn(), setNfApproving: vi.fn(), toast: vi.fn(),
  };
  const item = extras.item ?? linhaRhFake();
  const props: CartaoPrestacaoProps = {
    item, expandido: false, detalhes: false, approvingInvoiceId: null, nfApproving: false, canRh: true,
    ...(acoes as unknown as Pick<CartaoPrestacaoProps, keyof typeof acoes>), ...extras,
  };
  const utils = renderComTudo(<CartaoPrestacao {...props} />);
  return { ...utils, ...acoes, item };
}

const aprovadaParaFaturamento = (extras: Parameters<typeof linhaRhFake>[0] = {}) =>
  linhaRhFake({ status: "aprovada_faturamento", actual: realizadoRhFake({ rhStatus: "aprovado" }), ...extras });

describe("CartaoPrestacao", () => {
  it("comparativo recebido: nome em Title Case, função · tipo, badge 'Comparativo' e o botão 'Analisar' leva ao comparativo", async () => {
    const { user, navigate } = montar();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText(/Produção/)).toHaveTextContent("Produção· Freela");
    expect(screen.getByText("Comparativo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Analisar" }));
    expect(navigate).toHaveBeenCalledWith("/budget-comparison?event=evento-1&collaborator=colab-1&function=funcao-1");
  });

  it("planejamento pendente: badge 'Planejamento' e botão 'Planejar' para o Planejado", async () => {
    const { user, navigate } = montar({ item: linhaRhFake({ status: "planejamento_pendente", planned: null, actual: null }) });
    expect(screen.getByText("Planejamento")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Planejar" }));
    expect(navigate).toHaveBeenCalledWith("/budget-planned?event=evento-1&collaborator=colab-1&function=funcao-1");
  });

  it("isento na escalação: badge 'Não emite NF' e nada a cobrar", () => {
    const { container } = montar({ item: aprovadaParaFaturamento({ emiteNf: false, invoice: null }) });
    expect(screen.getByText("Não emite NF")).toBeInTheDocument();
    expect(screen.queryByText("Ag. nota fiscal")).toBeNull();
    // Sem o filete âmbar de "nota pendente" (08/10).
    const linha = container.querySelector("[data-prestacao-id]");
    expect(linha).toHaveClass("crh-tom-sem-nf");
    expect(linha).not.toHaveClass("crh-tom-nf-pendente");
  });

  it("aprovada sem NF enviada: 'Ag. nota fiscal'; expandido, o rodapé diz 'Aguardando envio da nota fiscal'", () => {
    const { unmount } = montar({ item: aprovadaParaFaturamento({ invoice: null }) });
    expect(screen.getAllByText("Ag. nota fiscal").length).toBeGreaterThan(0);
    unmount();
    montar({ item: aprovadaParaFaturamento({ invoice: null }), expandido: true });
    expect(screen.getByText("Aguardando envio da nota fiscal")).toBeInTheDocument();
  });

  it("NF enviada: RH vê 'Aprovar NF' e o clique abre a confirmação inline pelo id da nota", async () => {
    const { user, setApprovingInvoiceId } = montar({ item: aprovadaParaFaturamento({ invoice: notaRhFake({ id: "nf-7", status: "enviada" }) }) });
    expect(screen.getByText("NF em análise")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aprovar NF" }));
    expect(setApprovingInvoiceId).toHaveBeenCalledWith("nf-7");
  });

  it("quem não é RH vê só o chip 'NF em análise', sem ação", () => {
    montar({ item: aprovadaParaFaturamento({ invoice: notaRhFake({ status: "enviada" }) }), canRh: false });
    expect(screen.queryByRole("button", { name: "Aprovar NF" })).toBeNull();
    expect(screen.getAllByText("NF em análise").length).toBeGreaterThan(0);
  });

  it("confirmar a aprovação: POST /api/invoices/:id/approve, invalida ['/api/rh/controle'] e ['/api/invoices'], fecha e avisa", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ ok: true }, 200, url));
    const invalidar = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const item = aprovadaParaFaturamento({ invoice: notaRhFake({ id: "nf-7", status: "enviada" }) });
    const { user, setApprovingInvoiceId, setNfApproving, toast } = montar({ item, approvingInvoiceId: "nf-7" });
    expect(screen.getByText("Aprovar esta nota?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(setApprovingInvoiceId).toHaveBeenCalledWith(null));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/invoices/nf-7/approve");
    expect(init?.method).toBe("POST");
    expect(invalidar).toHaveBeenCalledWith({ queryKey: [CHAVE_CONTROLE_RH] });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["/api/invoices"] });
    expect(setNfApproving).toHaveBeenNthCalledWith(1, true);
    expect(setNfApproving).toHaveBeenLastCalledWith(false);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Nota aprovada!" }));
  });

  it("erro ao aprovar mostra a mensagem do servidor e mantém a confirmação aberta", async () => {
    mockarFetch((url) => respostaJson({ message: "Nota já aprovada por outro usuário" }, 409, url));
    const item = aprovadaParaFaturamento({ invoice: notaRhFake({ id: "nf-7", status: "enviada" }) });
    const { user, setApprovingInvoiceId, toast } = montar({ item, approvingInvoiceId: "nf-7" });
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Erro ao aprovar nota", description: "Nota já aprovada por outro usuário", variant: "destructive" })));
    expect(setApprovingInvoiceId).not.toHaveBeenCalled();
    // 'Cancelar aprovação' desiste sem chamar a API
    await user.click(screen.getByRole("button", { name: "Cancelar aprovação" }));
    expect(setApprovingInvoiceId).toHaveBeenCalledWith(null);
  });

  it("NF aprovada com check-in feito: badge 'Concluído'; sem check-in: 'Ag. Check-in' e o CTA 'Ir para Check-in' (só RH)", () => {
    const { unmount } = montar({ item: aprovadaParaFaturamento({ invoice: notaRhFake({ status: "aprovada", checkinAt: "2026-03-10T12:00:00.000Z", paymentDate: "2026-03-15" }) }) });
    expect(screen.getByText("Concluído")).toBeInTheDocument();
    unmount();
    montar({ item: aprovadaParaFaturamento({ invoice: notaRhFake({ status: "aprovada" }) }), expandido: true });
    expect(screen.getByText("Ag. Check-in")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ir para Check-in/ })).toBeInTheDocument();
  });

  it("expandido mostra Planejado × Realizado (idênticos) e 'Ver detalhes' alterna o detalhamento", async () => {
    const { user, toggleDetails, item } = montar({ expandido: true });
    expect(screen.getByText(/Idênticos/)).toHaveTextContent("Idênticos · R$ 1.108,00");
    await user.click(screen.getByRole("button", { name: /Ver detalhes/ }));
    expect(toggleDetails).toHaveBeenCalledWith(item.id);
  });

  it("a linha expande pelo clique e por Enter (aria-expanded acompanha)", async () => {
    const { user, toggleExpand, item, unmount } = montar();
    const linha = screen.getByRole("button", { expanded: false });
    await user.click(linha);
    linha.focus();
    await user.keyboard("{Enter}");
    expect(toggleExpand).toHaveBeenCalledTimes(2);
    expect(toggleExpand).toHaveBeenCalledWith(item.id);
    unmount();
    montar({ expandido: true });
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
  });

  // DEFEITO de acessibilidade (cartao-prestacao-linha.tsx:606-618): a linha
  // inteira é `role="button"` e contém <button>s reais (Analisar, Aprovar NF,
  // Confirmar…) — controle interativo dentro de controle interativo (WAI-ARIA
  // 1.2 proíbe; leitores de tela anunciam um botão só). O correto é um <button>
  // próprio para expandir e as ações fora dele.
  it("a linha não aninha botões dentro de role=button", () => {
    montar({ item: aprovadaParaFaturamento({ invoice: notaRhFake({ status: "enviada" }) }) });
    const linha = screen.getByRole("button", { expanded: false });
    expect(linha.querySelector("button")).toBeNull();
  });
});
