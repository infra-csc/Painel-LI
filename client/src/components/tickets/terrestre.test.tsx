import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { vagaFake } from "@/test/fixtures-dominio";
import { FORMULARIO_TERRESTRE_VAZIO, coberturaTerrestre, type TrechoTerrestre } from "@shared/transporte-terrestre";
import TicketRow, { type TicketRowProps } from "./ticket-row";
import TerrestreDialog from "./terrestre-dialog";
import TerrestreLote, { itensDoLote } from "./terrestre-lote";

// Prints do dono (16/10, Blue Run - Campinas): a Sugestão diz "van - 7h saindo".
const vagaDaVan = () => vagaFake({ id: "vaga-1", inclusionNumber: 4810, needsTicket: true, flightArrivalSuggestedTime: "van - 7h saindo", flightReturnSuggestedTime: "van - 18h" });

function linha(extras: Partial<TicketRowProps> = {}) {
  const acoes = { onToggleSelect: vi.fn(), onOpen: vi.fn(), onToggleEmitida: vi.fn(), onTerrestre: vi.fn() };
  const inclusion = extras.inclusion ?? vagaDaVan();
  const props: TicketRowProps = {
    inclusion, ticket: undefined, rowIdx: 0,
    eventName: "Blue Run - Campinas - 2026", functionName: "Staff", collaboratorName: "MARINA SOUZA", eventLocation: "Campinas - SP",
    hasPendingSwap: false, hasApprovedSwap: false, selected: false, canEdit: true,
    ...acoes, ...extras,
  };
  renderComTudo(<table><tbody><TicketRow {...props} /></tbody></table>);
  return { ...acoes, inclusion, linha: screen.getByRole("row") };
}

const van = (trecho: "ida" | "volta"): TrechoTerrestre => ({ trecho, modo: "van", empresa: "Transluz", valorCentavos: 60_000 });

describe("Linha de Passagens com transporte terrestre", () => {
  it("vaga sem passagem com a Sugestão de van: o atalho diz 'Vai de van' e abre já com van", async () => {
    const { onTerrestre, onOpen, inclusion } = linha();
    const atalho = screen.getByTestId("atalho-terrestre-vaga-1");
    expect(atalho).toHaveTextContent("Vai de van");
    await userEvent.click(atalho);
    expect(onTerrestre).toHaveBeenCalledWith(inclusion, "van");
    // O clique no atalho não abre o modal da passagem por baixo.
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("toda terrestre: sai de 'Pendente', mostra 'Vai de van' e o valor, sem caixa de seleção nem 'Emitida'", () => {
    const terrestres = [van("ida"), van("volta")];
    const { linha: tr } = linha({ terrestres, cobertura: coberturaTerrestre({}, terrestres) });
    expect(within(tr).queryByText("Pendente")).not.toBeInTheDocument();
    expect(screen.getByTestId("ticket-terrestre-vaga-1")).toHaveTextContent("Vai de van");
    expect(screen.getByTestId("ticket-terrestre-vaga-1").textContent?.replace(/ /g, " ")).toContain("R$ 1.200,00 · sem passagem");
    const viagem = screen.getByTestId("terrestre-vaga-1").textContent?.replace(/ /g, " ") ?? "";
    // A mesma van na ida e na volta é uma entrada só, com o valor da viagem toda (21/10: sem "por trecho").
    for (const trecho of ["Ida e volta · Van", "Transluz · R$ 1.200,00"]) expect(viagem).toContain(trecho);
    expect(viagem).not.toContain("cada trecho");
    expect(screen.queryByTestId("terrestre-grupo-vaga-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("checkbox-ticket-vaga-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toggle-emitida-vaga-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("atalho-terrestre-vaga-1")).not.toBeInTheDocument();
  });

  it("só a ida terrestre: continua 'Pendente' e diz que a volta não foi comprada", () => {
    const terrestres = [van("ida")];
    const { linha: tr } = linha({ terrestres, cobertura: coberturaTerrestre({}, terrestres) });
    expect(within(tr).getByText("Pendente")).toBeInTheDocument();
    expect(tr).toHaveTextContent("Volta: passagem não comprada");
    expect(screen.getByTestId("checkbox-ticket-vaga-1")).toBeInTheDocument();
  });

  it("clicar no terrestre registrado abre a edição", async () => {
    const terrestres = [van("ida"), van("volta")];
    const { onTerrestre, inclusion } = linha({ terrestres, cobertura: coberturaTerrestre({}, terrestres) });
    await userEvent.click(screen.getByTestId("editar-terrestre-vaga-1"));
    expect(onTerrestre).toHaveBeenCalledWith(inclusion, undefined, undefined);
  });

  it("vaga que divide a van (21/10): 'Van · Transluz · R$ 150,00' e 'parte de R$ 1.200,00 · 8 vagas'", () => {
    const grupo = { id: "g1", totalCentavos: 120_000, vagas: 8 };
    const terrestres: TrechoTerrestre[] = [{ ...van("ida"), valorCentavos: 7_500, grupo }, { ...van("volta"), valorCentavos: 7_500, grupo }];
    linha({ terrestres, cobertura: coberturaTerrestre({}, terrestres) });
    const viagem = screen.getByTestId("terrestre-vaga-1").textContent?.replace(/ /g, " ") ?? "";
    expect(viagem).toContain("Ida e volta · Van");
    expect(viagem).toContain("Transluz · R$ 150,00");
    expect(screen.getByTestId("terrestre-grupo-vaga-1").textContent?.replace(/ /g, " ")).toBe("parte de R$ 1.200,00 · 8 vagas");
  });

  it("ida de van e volta que falta: 'de carro/van?' abre só a volta; ida e volta diferentes abrem cada uma a sua", async () => {
    const terrestres = [van("ida")];
    const { onTerrestre, inclusion } = linha({ terrestres, cobertura: coberturaTerrestre({}, terrestres) });
    await userEvent.click(screen.getByTestId("terrestre-falta-vaga-1"));
    expect(onTerrestre).toHaveBeenCalledWith(inclusion, undefined, ["volta"]);
  });

  it("ida de van e volta de carro: duas entradas, cada uma edita a sua perna", async () => {
    const terrestres: TrechoTerrestre[] = [van("ida"), { trecho: "volta", modo: "carro", empresa: null, valorCentavos: 30_000 }];
    const { onTerrestre, inclusion } = linha({ terrestres, cobertura: coberturaTerrestre({}, terrestres) });
    await userEvent.click(screen.getByTestId("editar-terrestre-vaga-1-volta"));
    expect(onTerrestre).toHaveBeenCalledWith(inclusion, undefined, ["volta"]);
  });

  it("Sugestão '9h - onibus': o atalho fica neutro ('Vai de carro/van'), não chuta van", async () => {
    const { onTerrestre, inclusion } = linha({ inclusion: vagaFake({ id: "vaga-1", inclusionNumber: 4812, needsTicket: true, flightArrivalSuggestedTime: "9h - onibus" }) });
    const atalho = screen.getByTestId("atalho-terrestre-vaga-1");
    expect(atalho).toHaveTextContent("Vai de carro/van");
    await userEvent.click(atalho);
    expect(onTerrestre).toHaveBeenCalledWith(inclusion, undefined);
  });
});

function dialogo(extras: Partial<Parameters<typeof TerrestreDialog>[0]> = {}) {
  const onClose = vi.fn();
  renderComTudo(
    <TerrestreDialog
      abertura={{ inclusion: vagaDaVan(), modo: "van" }}
      onClose={onClose}
      registros={[]}
      ticket={undefined}
      collaboratorName="Marina Souza"
      eventName="Blue Run - Campinas - 2026"
      functionName="Staff"
      {...extras}
    />,
  );
  return { onClose };
}

describe("Diálogo 'Vai de carro ou van'", () => {
  it("van sem empresa e sem valor: os dois campos obrigatórios em vermelho, nada vai ao servidor", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    dialogo();
    await userEvent.click(screen.getByTestId("terrestre-salvar"));
    expect(await screen.findByText("Nome da empresa é obrigatório")).toBeInTheDocument();
    expect(screen.getByText("Valor da van é obrigatório")).toBeInTheDocument();
    expect(screen.getByTestId("terrestre-empresa")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("carro pede só o valor ('Valor do carro'); sem empresa na tela", async () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    dialogo({ abertura: { inclusion: vagaDaVan(), modo: "carro" } });
    expect(screen.queryByTestId("terrestre-empresa")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("terrestre-salvar"));
    expect(await screen.findByText("Valor do carro é obrigatório")).toBeInTheDocument();
  });

  it("só Carro e Van (21/10): sem Ônibus, sem 'por trecho' e sem 'Volta igual à ida'", () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    dialogo();
    expect(screen.getByTestId("terrestre-modo-carro")).toBeInTheDocument();
    expect(screen.getByTestId("terrestre-modo-van")).toBeInTheDocument();
    expect(screen.queryByTestId("terrestre-modo-onibus")).not.toBeInTheDocument();
    expect(screen.queryByText(/por trecho/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Volta igual à ida/)).not.toBeInTheDocument();
    expect(screen.getByText("Valor da van")).toBeInTheDocument();
    expect(screen.getByTestId("terrestre-valor-dica")).toHaveTextContent("O valor da van para esta vaga: cobre a ida e a volta.");
  });

  it("van preenchida: o valor é a viagem toda da vaga — R$ 150,01 vira R$ 75,01 na ida e R$ 75,00 na volta", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ gravados: 2, vagas: 1, falhas: [], statusPorVaga: { "vaga-1": "passagem_comprada" } }, 200, url));
    const { onClose } = dialogo();
    await userEvent.type(screen.getByTestId("terrestre-empresa"), "Transluz Transportes");
    await userEvent.type(screen.getByTestId("terrestre-valor"), "150,01");
    await userEvent.click(screen.getByTestId("terrestre-salvar"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const chamada = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/transportes-terrestres"));
    expect(chamada?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(chamada?.[1]?.body))).toEqual({
      itens: [
        { teamInclusionId: "vaga-1", trecho: "ida", modo: "van", empresa: "Transluz Transportes", valorCentavos: 7_501 },
        { teamInclusionId: "vaga-1", trecho: "volta", modo: "van", empresa: "Transluz Transportes", valorCentavos: 7_500 },
      ],
    });
  });

  it("Sugestão com van na ida e carro na volta: abre de van só com a ida e diz como registrar a volta", () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    const mista = vagaFake({ id: "vaga-1", inclusionNumber: 4811, needsTicket: true, flightArrivalSuggestedTime: "van - 7h saindo", flightReturnSuggestedTime: "carro - 18h" });
    dialogo({ abertura: { inclusion: mista, modo: "van" } });
    expect(screen.getByTestId("terrestre-modo-van")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("terrestre-perna-ida")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("terrestre-perna-volta")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("terrestre-aviso-sugestao")).toHaveTextContent("A Sugestão diz carro na volta");
  });

  it("aberto só para a volta (a ida já é de van): a ida fica travada e só a volta é gravada", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ gravados: 1, vagas: 1, falhas: [], statusPorVaga: {} }, 200, url));
    const { onClose } = dialogo({ abertura: { inclusion: vagaDaVan(), pernas: ["volta"] }, registros: [van("ida")] });
    expect(screen.getByTestId("terrestre-perna-ida")).toBeDisabled();
    expect(screen.getByTestId("dialogo-terrestre")).toHaveTextContent("A ida está de van — edite pela linha da vaga");
    await userEvent.click(screen.getByTestId("terrestre-modo-carro"));
    await userEvent.type(screen.getByTestId("terrestre-valor"), "300");
    await userEvent.click(screen.getByTestId("terrestre-salvar"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const chamadas = fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/transportes-terrestres"));
    // Nada de desfazer a ida: só o POST da volta.
    expect(chamadas.map(([, init]) => init?.method)).toEqual(["POST"]);
    expect(JSON.parse(String(chamadas[0][1]?.body)).itens).toEqual([{ teamInclusionId: "vaga-1", trecho: "volta", modo: "carro", empresa: null, valorCentavos: 30_000 }]);
  });

  it("ônibus antigo: aparece com o aviso, sem modo marcado; salvar pede carro ou van", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    dialogo({ abertura: { inclusion: vagaDaVan() }, registros: [{ trecho: "ida", modo: "onibus", empresa: "Cometa", valorCentavos: 9_000 }, { trecho: "volta", modo: "onibus", empresa: "Cometa", valorCentavos: 9_000 }] });
    expect(screen.getByTestId("terrestre-aviso-onibus")).toBeInTheDocument();
    expect(screen.getByTestId("terrestre-modo-carro")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("terrestre-modo-van")).toHaveAttribute("aria-checked", "false");
    await userEvent.click(screen.getByTestId("terrestre-salvar"));
    expect(await screen.findByText("Escolha carro ou van.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    // Desfazer continua disponível.
    expect(screen.getByTestId("terrestre-desfazer")).toBeInTheDocument();
  });

  it("vaga da van de 8: começa em 'Só esta vaga'; 'A van inteira' manda o total novo para o grupo", async () => {
    const fetchMock = mockarFetch((url) => respostaJson(String(url).includes("/grupos/") ? { atualizados: 16, vagas: 8 } : { gravados: 2, vagas: 1, falhas: [], statusPorVaga: {} }, 200, url));
    const grupo = { id: "g1", totalCentavos: 120_000, vagas: 8 };
    const registros: TrechoTerrestre[] = [{ ...van("ida"), valorCentavos: 7_500, grupo }, { ...van("volta"), valorCentavos: 7_500, grupo }];
    const { onClose } = dialogo({ abertura: { inclusion: vagaDaVan() }, registros });
    expect(screen.getByTestId("terrestre-escopo-vaga")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("terrestre-valor")).toHaveValue("150,00");
    await userEvent.click(screen.getByTestId("terrestre-escopo-grupo"));
    expect(screen.getByTestId("terrestre-valor")).toHaveValue("1.200,00");
    expect(screen.getByText("Valor total da van")).toBeInTheDocument();
    expect(screen.getByTestId("terrestre-perna-ida")).toBeDisabled();
    await userEvent.clear(screen.getByTestId("terrestre-valor"));
    await userEvent.type(screen.getByTestId("terrestre-valor"), "1.000,00");
    expect(screen.getByTestId("terrestre-total")).toHaveTextContent("R$ 125,00 por vaga · 8 vagas · total R$ 1.000,00");
    await userEvent.click(screen.getByTestId("terrestre-salvar"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const chamada = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/transportes-terrestres/grupos/g1"));
    expect(chamada?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(chamada?.[1]?.body))).toEqual({ modo: "van", empresa: "Transluz", totalCentavos: 100_000 });
  });

  it("desfazer a van inteira chama o DELETE do grupo", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ removidos: 16, vagas: 8, statusPorVaga: {} }, 200, url));
    const grupo = { id: "g1", totalCentavos: 120_000, vagas: 8 };
    const { onClose } = dialogo({ abertura: { inclusion: vagaDaVan() }, registros: [{ ...van("ida"), grupo }, { ...van("volta"), grupo }] });
    await userEvent.click(screen.getByTestId("terrestre-escopo-grupo"));
    await userEvent.click(screen.getByTestId("terrestre-desfazer"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("As 8 vagas voltam para a fila Comprar.");
    await userEvent.click(screen.getByTestId("terrestre-confirmar-desfazer"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const chamada = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/transportes-terrestres/grupos/g1"));
    expect(chamada?.[1]?.method).toBe("DELETE");
  });

  it("perna com passagem fica travada (só a outra pode ser terrestre)", () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    dialogo({ ticket: { actualDepartureDate: "2026-10-20", actualDepartureTime: "07:00" } as never });
    expect(screen.getByTestId("terrestre-perna-ida")).toBeDisabled();
    expect(screen.getByTestId("terrestre-perna-ida")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("terrestre-perna-volta")).toHaveAttribute("aria-pressed", "true");
  });
});

// ── Revisão 16/10 (segunda passada): lote ──────────────────────────────────

function lote(vagas: ReturnType<typeof vagaFake>[]) {
  const onConcluido = vi.fn();
  renderComTudo(<TerrestreLote vagas={vagas} nomeDaVaga={(v) => `#${v.inclusionNumber}`} canEdit onConcluido={onConcluido} />);
  return { onConcluido };
}

describe("Lote 'Carro / van' (revisão 16/10)", () => {
  it("van (21/10): o valor total da van dividido entre as vagas e, em cada vaga, entre os trechos — soma exata, mesmo com vaga 'só ida'", () => {
    const vagas = [
      vagaFake({ id: "c", inclusionNumber: 3, trechosSugeridos: "so_ida" }),
      vagaFake({ id: "a", inclusionNumber: 1 }),
      vagaFake({ id: "b", inclusionNumber: 2 }),
    ];
    const r = itensDoLote({ ...FORMULARIO_TERRESTRE_VAZIO, modo: "van", empresa: "Transluz", valor: "1.000,01" }, vagas);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.agrupar).toBe(true);
    // Ordem do número da vaga: #1 e #2 ficam com o centavo a mais; a #3 (só ida) leva a parte dela inteira na ida.
    expect(r.itens.map((i) => [i.teamInclusionId, i.trecho, i.valorCentavos])).toEqual([
      ["a", "ida", 16_667], ["a", "volta", 16_667],
      ["b", "ida", 16_667], ["b", "volta", 16_667],
      ["c", "ida", 33_333],
    ]);
    expect(r.itens.reduce((s, i) => s + i.valorCentavos, 0)).toBe(100_001);
  });

  it("van: um campo só ('Valor total da van'), sem o 'De cada vaga', e 'R$ X por vaga' na hora", async () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    lote(Array.from({ length: 8 }, (_, i) => vagaFake({ id: `v${i}`, inclusionNumber: 100 + i })));
    expect(screen.queryByTestId("lote-terrestre-modo-onibus")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("lote-terrestre-modo-van"));
    expect(screen.getByText("Valor total da van", { selector: "label" })).toBeInTheDocument();
    expect(screen.queryByTestId("lote-terrestre-divisao-cada")).not.toBeInTheDocument();
    expect(screen.queryByText(/Volta igual à ida/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByTestId("lote-terrestre-valor"), "1.200,00");
    expect(screen.getByTestId("lote-terrestre-total")).toHaveTextContent("R$ 150,00 por vaga · 8 vagas · total R$ 1.200,00");
    await userEvent.type(screen.getByTestId("lote-terrestre-valor"), "{Backspace}1");
    expect(screen.getByTestId("lote-terrestre-total")).toHaveTextContent("R$ 150,00 a R$ 150,01 por vaga · 8 vagas · total R$ 1.200,01");
  });

  it("carro: 'De cada vaga' é o padrão (sem grupo); o total do lote é valor × vagas", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ gravados: 4, vagas: 2, falhas: [], statusPorVaga: {} }, 200, url));
    lote([vagaFake({ id: "a", inclusionNumber: 1 }), vagaFake({ id: "b", inclusionNumber: 2 })]);
    await userEvent.click(screen.getByTestId("lote-terrestre-modo-carro"));
    expect(screen.getByTestId("lote-terrestre-divisao-cada")).toHaveAttribute("aria-checked", "true");
    await userEvent.type(screen.getByTestId("lote-terrestre-valor"), "300");
    expect(screen.getByTestId("lote-terrestre-total")).toHaveTextContent("R$ 300,00 por vaga · 2 vagas · total do lote R$ 600,00");
    await userEvent.click(screen.getByTestId("lote-terrestre-aplicar"));
    await userEvent.click(await screen.findByTestId("lote-terrestre-confirmar"));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/transportes-terrestres"))).toBe(true));
    const corpo = JSON.parse(String(fetchMock.mock.calls.find(([u]) => String(u).includes("/api/transportes-terrestres"))?.[1]?.body));
    expect(corpo.agrupar).toBeUndefined();
    expect(corpo.itens.map((i: { valorCentavos: number }) => i.valorCentavos)).toEqual([15_000, 15_000, 15_000, 15_000]);
  });

  it("nenhuma vaga marcada tem o trecho escolhido: erro no formulário, sem confirmação com 'R$ ∞'", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    lote([vagaFake({ id: "a", inclusionNumber: 1, trechosSugeridos: "so_volta" }), vagaFake({ id: "b", inclusionNumber: 2, trechosSugeridos: "so_volta" })]);
    await userEvent.click(screen.getByTestId("lote-terrestre-modo-carro"));
    await userEvent.type(screen.getByTestId("lote-terrestre-valor"), "100,00");
    await userEvent.click(screen.getByTestId("lote-terrestre-perna-volta"));
    await userEvent.click(screen.getByTestId("lote-terrestre-aplicar"));
    expect(await screen.findByText(/Nenhuma das vagas marcadas tem o trecho escolhido\. Marque a volta\./)).toBeInTheDocument();
    expect(screen.queryByText(/Registrar transporte terrestre em/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dividir manda tudoOuNada; o servidor recusando uma vaga, nada é gravado e a tela diz por quê", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({
      code: "lote_dividido_incompleto",
      message: "Nada foi registrado: o total dividido precisa valer para todas as vagas, e 1 vaga não pode receber o transporte. Desmarque essa vaga e registre de novo.",
      falhas: [{ teamInclusionId: "b", numero: 2, mensagem: "a ida já tem passagem registrada — edite a passagem antes" }],
    }, 409, url));
    const { onConcluido } = lote([vagaFake({ id: "a", inclusionNumber: 1 }), vagaFake({ id: "b", inclusionNumber: 2 })]);
    await userEvent.click(screen.getByTestId("lote-terrestre-modo-carro"));
    await userEvent.type(screen.getByTestId("lote-terrestre-valor"), "100,01");
    await userEvent.click(screen.getByTestId("lote-terrestre-divisao-dividir"));
    await userEvent.click(screen.getByTestId("lote-terrestre-aplicar"));
    await userEvent.click(await screen.findByTestId("lote-terrestre-confirmar"));
    expect(await screen.findByText("Nada foi registrado")).toBeInTheDocument();
    expect(screen.getAllByText(/#2: a ida já tem passagem/).length).toBeGreaterThan(0);
    const chamada = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/transportes-terrestres"));
    const corpo = JSON.parse(String(chamada?.[1]?.body));
    expect(corpo.tudoOuNada).toBe(true);
    expect(corpo.agrupar).toBe(true);
    // 21/10: o total é da viagem toda — ida + volta das 2 vagas somam o digitado.
    expect(corpo.itens.reduce((s: number, i: { valorCentavos: number }) => s + i.valorCentavos, 0)).toBe(10_001);
    expect(onConcluido).not.toHaveBeenCalled();
  });
});

describe("Diálogo — teclado e foco (revisão 16/10)", () => {
  it("abre com o foco no primeiro campo (a empresa da van), não no 'Cancelar'", async () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    dialogo();
    await waitFor(() => expect(screen.getByTestId("terrestre-empresa")).toHaveFocus());
  });

  it("Enter no valor registra, como num formulário", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ gravados: 2, vagas: 1, falhas: [], statusPorVaga: {} }, 200, url));
    const { onClose } = dialogo({ abertura: { inclusion: vagaDaVan(), modo: "carro" } });
    await userEvent.type(screen.getByTestId("terrestre-valor"), "300{Enter}");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/transportes-terrestres"))).toBe(true);
  });

  it("'Desfazer' leva o foco para o 'Manter' (a saída segura)", async () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    dialogo({ registros: [van("ida"), van("volta")] });
    await userEvent.click(screen.getByTestId("terrestre-desfazer"));
    await waitFor(() => expect(screen.getByTestId("terrestre-manter")).toHaveFocus());
  });
});

describe("Diálogo — Esc (revisão 16/10)", () => {
  it("Esc fecha sem gravar nada", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    const { onClose } = dialogo();
    await waitFor(() => expect(screen.getByTestId("terrestre-empresa")).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/transportes-terrestres"))).toBe(false);
  });
});
