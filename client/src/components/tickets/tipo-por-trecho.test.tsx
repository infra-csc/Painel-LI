/**
 * Tipo de transporte POR TRECHO no client (28/10 — Compras, vaga #4618):
 * a ida AÉREA GRU→SDU estava comprada e a volta passou a ser de ÔNIBUS
 * (Novo Rio → Barra Funda). Subir o bilhete do ônibus virava a passagem
 * inteira em "Rodoviário" ("Rodoviária de origem: GRU" na ida).
 */
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { screen, within, waitFor } from "@testing-library/react";
import { renderComTudo, esperarToast } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { vagaFake } from "@/test/fixtures-dominio";
import {
  buildPlannedImpact,
  buildTicketPayload,
  getMissingRequiredFields,
  getRequiredFields,
  ticketToFormValues,
  tiposDoFormulario,
  type TicketFormValues,
} from "@/lib/ticket-form";
import { MOBILIDADE_TRECHO_PADRAO_CENTS, MOBILIDADE_TRECHO_MADRUGADA_CENTS } from "@shared/atendimento";
import { juntarIdaEVolta, ladoSugerido, precisaEscolherOTrecho, substituirUmTrecho } from "./juntar-trechos";
import { useVoucherFill } from "./use-voucher-fill";
import { PerguntaDoTrecho } from "./pergunta-do-trecho";
import TicketFormFields from "./ticket-form-fields";
import VoucherLoteDialog from "./voucher-lote-dialog";
import { ticketSummaryLine } from "./ticket-row";

/** A passagem do Erick antes do bilhete do ônibus: ida e volta aéreas. */
const idaEVoltaAereas: TicketFormValues = {
  transportType: "aereo", returnTransportType: "", isOneWay: false, isReturnOnly: false,
  value: "388,93", purchaseOrderNumber: "JPLN7F8J", purchaseDate: "2026-10-20",
  departureAirport: "GRU", destinationAirport: "SDU", departureCityOrigin: "São Paulo", departureCityDestination: "Rio de Janeiro",
  actualDepartureDate: "2026-11-11", actualDepartureTime: "12:05", actualArrivalTime: "13:10",
  returnOriginAirport: "SDU", returnDestinationAirport: "GRU", returnCityOrigin: "Rio de Janeiro", returnCityDestination: "São Paulo",
  actualReturnDate: "2026-11-15", actualReturnTime: "21:00", returnArrivalTime: "22:05",
};

/** Como o leitor devolve o bilhete do ônibus "VIAGEM DE VOLTA" (shared/voucher-parse). */
const bilheteOnibusVolta = {
  transportType: "rodoviario", purchaseOrderNumber: "4471",
  returnOriginAirport: "Rodoviária Novo Rio", returnCityOrigin: "Rio de Janeiro",
  returnDestinationAirport: "Terminal Barra Funda", returnCityDestination: "São Paulo",
  actualReturnDate: "2026-11-15", actualReturnTime: "23:45", returnArrivalTime: "06:25",
};

describe("formulário — regras por trecho", () => {
  it("tipos do formulário: volta \"\" = igual à ida; só ida/só volta têm um tipo só", () => {
    expect(tiposDoFormulario({ transportType: "aereo", returnTransportType: "" })).toEqual({ ida: "aereo", volta: "aereo" });
    expect(tiposDoFormulario({ transportType: "aereo", returnTransportType: "rodoviario" })).toEqual({ ida: "aereo", volta: "rodoviario" });
    expect(tiposDoFormulario({ transportType: "aereo", returnTransportType: "rodoviario", isOneWay: true })).toEqual({ ida: "aereo", volta: "aereo" });
    expect(tiposDoFormulario({ transportType: "rodoviario", returnTransportType: "aereo", isReturnOnly: true })).toEqual({ ida: "rodoviario", volta: "rodoviario" });
  });

  it("rótulos da volta seguem o tipo da volta; com voo em algum trecho o valor é obrigatório", () => {
    const soVolta = getRequiredFields("rodoviario", false, true);
    expect(soVolta.map((f) => f.label)).toContain("Rodoviária Origem (volta)");
    expect(soVolta.some((f) => f.field === "value")).toBe(false);
    const mista = getRequiredFields("aereo", false, false, "rodoviario");
    expect(mista.find((f) => f.field === "purchaseOrderNumber")?.label).toBe("LOC / Bilhete");
    expect(mista.some((f) => f.field === "value")).toBe(true);
    expect(mista.find((f) => f.field === "departureAirport")?.label).toBe("Aeroporto de origem");
  });

  it("payload: grava o tipo da volta só quando diferente e com as duas pernas", () => {
    expect(buildTicketPayload({ ...idaEVoltaAereas, returnTransportType: "rodoviario" }).returnTransportType).toBe("rodoviario");
    expect(buildTicketPayload(idaEVoltaAereas).returnTransportType).toBeNull();
    expect(buildTicketPayload({ ...idaEVoltaAereas, returnTransportType: "aereo" }).returnTransportType).toBeNull();
    expect(buildTicketPayload({ ...idaEVoltaAereas, returnTransportType: "rodoviario", isOneWay: true }).returnTransportType).toBeNull();
    expect(buildTicketPayload({ ...idaEVoltaAereas, transportType: "van", returnTransportType: "rodoviario" }).returnTransportType).toBeNull();
  });

  it("passagem gravada → formulário → payload: o tipo da volta faz a volta inteira", () => {
    const form = ticketToFormValues({ ...idaEVoltaAereas, value: 38893, transportType: "aereo", returnTransportType: "rodoviario" } as never);
    expect(form.returnTransportType).toBe("rodoviario");
    expect(buildTicketPayload(form).returnTransportType).toBe("rodoviario");
    expect(ticketToFormValues({ transportType: "aereo", returnTransportType: null }).returnTransportType).toBe("");
  });

  it("volta comprada à parte: o banco guarda o TOTAL em value e a parte da volta em returnValue (dono: \"SOMAR\")", () => {
    const form = { ...idaEVoltaAereas, returnTransportType: "rodoviario", returnValue: "150,00", returnPurchaseOrderNumber: "4471" };
    expect(buildTicketPayload(form)).toMatchObject({ value: 53893, returnValue: 15000, purchaseOrderNumber: "JPLN7F8J", returnPurchaseOrderNumber: "4471" });
    // De volta ao formulário: ida e volta separadas de novo.
    const reaberto = ticketToFormValues({ ...idaEVoltaAereas, value: 53893, returnValue: 15000, returnPurchaseOrderNumber: "4471" } as never);
    expect(reaberto).toMatchObject({ value: "388.93", returnValue: "150", returnPurchaseOrderNumber: "4471" });
    expect(buildTicketPayload(reaberto).value).toBe(53893);
    // Só ida ou van: não há volta à parte.
    expect(buildTicketPayload({ ...form, isOneWay: true })).toMatchObject({ value: 38893, returnValue: null, returnPurchaseOrderNumber: null });
    expect(buildTicketPayload({ ...form, transportType: "van" })).toMatchObject({ value: null, returnValue: null });
    // Passagem de uma compra só: como sempre.
    expect(buildTicketPayload(idaEVoltaAereas)).toMatchObject({ value: 38893, returnValue: null, returnPurchaseOrderNumber: null });
  });

  it("impacto no Planejado: a volta de ônibus noturna é R$29 (terrestre), não a madrugada do aeroporto", () => {
    const aereo = buildPlannedImpact({ ...idaEVoltaAereas, actualReturnTime: "23:45", returnArrivalTime: "06:25" }, { eventLocation: "Rio de Janeiro - RJ" });
    expect(aereo?.mobilidade.volta?.cents).toBe(MOBILIDADE_TRECHO_MADRUGADA_CENTS);
    const mista = buildPlannedImpact({ ...idaEVoltaAereas, returnTransportType: "rodoviario", actualReturnTime: "23:45", returnArrivalTime: "06:25" }, { eventLocation: "Rio de Janeiro - RJ" });
    expect(mista?.mobilidade.volta?.cents).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
    expect(mista?.mobilidade.ida?.cents).toBe(aereo?.mobilidade.ida?.cents);
  });

  it("faltando campos: o rótulo do número da compra numa passagem mista é \"LOC / Bilhete\"", () => {
    const faltam = getMissingRequiredFields({ ...idaEVoltaAereas, returnTransportType: "rodoviario", purchaseOrderNumber: "" });
    expect(faltam.map((f) => f.label)).toEqual(["LOC / Bilhete"]);
  });
});

describe("bilhete de UM trecho numa passagem com ida e volta", () => {
  const lido = { campos: bilheteOnibusVolta, trechoUnico: true };

  it("precisa perguntar; o leitor do ônibus já diz que é a volta", () => {
    expect(precisaEscolherOTrecho(idaEVoltaAereas, lido)).toBe(true);
    expect(ladoSugerido(idaEVoltaAereas, lido)).toBe("volta");
    // Só com a ida: não pergunta — junta (15/09).
    const soIda = { ...idaEVoltaAereas, returnOriginAirport: "", returnDestinationAirport: "", returnCityOrigin: "", returnCityDestination: "", actualReturnDate: "", actualReturnTime: "", returnArrivalTime: "" };
    expect(precisaEscolherOTrecho(soIda, lido)).toBe(false);
    // Bilhete com ida e volta: não pergunta.
    expect(precisaEscolherOTrecho(idaEVoltaAereas, { ...lido, trechoUnico: false })).toBe(false);
  });

  it("voucher do voo (um trecho, sempre nos campos de ida): sugere pela data mais próxima", () => {
    const vooDaVolta = { campos: { transportType: "aereo", departureAirport: "SDU", destinationAirport: "GRU", actualDepartureDate: "2026-11-16", actualDepartureTime: "09:00" }, trechoUnico: true };
    expect(ladoSugerido(idaEVoltaAereas, vooDaVolta)).toBe("volta");
    expect(ladoSugerido(idaEVoltaAereas, { ...vooDaVolta, campos: { ...vooDaVolta.campos, actualDepartureDate: "2026-11-10" } })).toBe("ida");
  });

  it("trocar a volta: mexe SÓ na volta e no tipo dela; a ida aérea e o LOC do voo ficam", () => {
    const { campos, resumo } = substituirUmTrecho(idaEVoltaAereas, lido, "volta");
    const final = { ...idaEVoltaAereas, ...campos };
    expect(final.transportType).toBe("aereo");
    expect(final.returnTransportType).toBe("rodoviario");
    expect(final.departureAirport).toBe("GRU");
    expect(final.destinationAirport).toBe("SDU");
    expect(final.actualDepartureTime).toBe("12:05");
    expect(final.returnOriginAirport).toBe("Rodoviária Novo Rio");
    expect(final.returnDestinationAirport).toBe("Terminal Barra Funda");
    expect(final.actualReturnTime).toBe("23:45");
    expect(final.returnArrivalTime).toBe("06:25");
    // Cada trecho com o seu LOC/bilhete e o seu valor (dono, 28/10: "SOMAR os valores").
    expect(final.purchaseOrderNumber).toBe("JPLN7F8J");
    expect(final.returnPurchaseOrderNumber).toBe("4471");
    expect(final.value).toBe("388,93"); // a compra que estava fica como a da ida
    expect(final.returnValue).toBe(""); // o bilhete não traz valor: não inventa
    expect(resumo).toContain("Troquei só a volta");
    expect(resumo).toContain("A ida ficou como estava (aérea · GRU → SDU · 11/11 12:05)");
    expect(resumo).toContain("O bilhete não traz valor: informe o Valor da volta");
    expect(resumo).toContain("ficou como Valor da ida");
    expect(buildTicketPayload(final).returnTransportType).toBe("rodoviario");
  });

  it("bilhete com valor: volta com o valor dela e o total = ida + volta; o mesmo bilhete relido não dobra", () => {
    const comValor = { campos: { ...bilheteOnibusVolta, value: "150,00" } };
    const r = substituirUmTrecho(idaEVoltaAereas, comValor, "volta");
    expect(r.campos.value).toBe("388,93");
    expect(r.campos.returnValue).toBe("150,00");
    expect(r.resumo).toContain("Total: ida R$ 388,93 + volta R$ 150,00 = R$ 538,93");
    const payload = buildTicketPayload({ ...idaEVoltaAereas, ...r.campos });
    expect(payload).toMatchObject({ value: 53893, returnValue: 15000, purchaseOrderNumber: "JPLN7F8J", returnPurchaseOrderNumber: "4471" });
    const relido = substituirUmTrecho({ ...idaEVoltaAereas, ...r.campos }, comValor, "volta");
    expect(buildTicketPayload({ ...idaEVoltaAereas, ...r.campos, ...relido.campos }).value).toBe(53893);
    expect(relido.campos.returnPurchaseOrderNumber).toBe("4471");
  });

  it("juntar ida (passagem) + volta (bilhete) de tipos diferentes: cada trecho com o seu tipo", () => {
    const soIda = { transportType: "aereo", value: "388,93", purchaseOrderNumber: "JPLN7F8J", departureAirport: "GRU", destinationAirport: "SDU", actualDepartureDate: "2026-11-11", actualDepartureTime: "12:05" };
    const r = juntarIdaEVolta(soIda, lido);
    expect(r?.campos.transportType).toBe("aereo");
    expect(r?.campos.returnTransportType).toBe("rodoviario");
    expect(r?.campos.returnOriginAirport).toBe("Rodoviária Novo Rio");
    expect(r?.resumo).toContain("Ida aérea e volta de ônibus");
  });
});

/** Harness: o hook do modal + a pergunta, com o formulário em estado. */
function Leitor({ inicial, onPreencher }: { inicial: TicketFormValues; onPreencher: (c: Partial<TicketFormValues>) => void }) {
  const [form, setForm] = useState(inicial);
  const voucher = useVoucherFill({
    colaborador: "Erick Ramos da Silva", trecho: "ida_volta", atual: form,
    onPreencher: (c) => { setForm((f) => ({ ...f, ...c })); onPreencher(c); },
  });
  return (
    <>
      <input type="file" data-testid="arquivo" onChange={(e) => { const f = e.target.files?.[0]; if (f) void voucher.lerArquivo(f); }} />
      <PerguntaDoTrecho pergunta={voucher.pergunta} />
    </>
  );
}

describe("aplicar o bilhete no modal (useVoucherFill + pergunta)", () => {
  const pdf = new File(["%PDF-1.4"], "onibus.pdf", { type: "application/pdf" });
  const leitura = { arquivo: "onibus.pdf", tipo: "passagem", formato: "Passagem rodoviária", pessoa: "Erick Ramos da Silva", trechoUnico: true, campos: bilheteOnibusVolta, avisos: [] };

  it("pergunta qual trecho trocar, com a volta sugerida; \"Trocar a volta\" mexe só nela", async () => {
    mockarFetch((url) => respostaJson({ leituras: [leitura] }, 200, url));
    const onPreencher = vi.fn();
    const { user } = renderComTudo(<Leitor inicial={idaEVoltaAereas} onPreencher={onPreencher} />);
    await user.upload(screen.getByTestId("arquivo"), pdf);
    const dialogo = await screen.findByTestId("pergunta-do-trecho");
    expect(within(dialogo).getByText("Este bilhete troca a ida ou a volta?")).toBeInTheDocument();
    expect(within(dialogo).getByText(/de ônibus · Rodoviária Novo Rio → Terminal Barra Funda · 15\/11 23:45/)).toBeInTheDocument();
    expect(within(dialogo).getByText("aérea · GRU → SDU · 11/11 12:05")).toBeInTheDocument();
    expect(onPreencher).not.toHaveBeenCalled(); // nada muda antes da resposta
    await user.click(within(dialogo).getByTestId("pergunta-do-trecho-volta"));
    await waitFor(() => expect(onPreencher).toHaveBeenCalledTimes(1));
    const campos = onPreencher.mock.calls[0][0];
    expect(campos).toMatchObject({ transportType: "aereo", returnTransportType: "rodoviario", returnOriginAirport: "Rodoviária Novo Rio", purchaseOrderNumber: "JPLN7F8J", returnPurchaseOrderNumber: "4471" });
    expect(campos).not.toHaveProperty("departureAirport");
    await esperarToast("Volta trocada pelo bilhete");
  });

  it("\"Só anexar\" não mexe na passagem", async () => {
    mockarFetch((url) => respostaJson({ leituras: [leitura] }, 200, url));
    const onPreencher = vi.fn();
    const { user } = renderComTudo(<Leitor inicial={idaEVoltaAereas} onPreencher={onPreencher} />);
    await user.upload(screen.getByTestId("arquivo"), pdf);
    await user.click(await screen.findByTestId("pergunta-do-trecho-so-anexar"));
    await esperarToast("a passagem não mudou");
    expect(onPreencher).not.toHaveBeenCalled();
  });

  it("passagem só com a ida: junta sem perguntar, volta rodoviária e ida aérea", async () => {
    mockarFetch((url) => respostaJson({ leituras: [leitura] }, 200, url));
    const onPreencher = vi.fn();
    const soIda = { ...idaEVoltaAereas, returnOriginAirport: "", returnDestinationAirport: "", returnCityOrigin: "", returnCityDestination: "", actualReturnDate: "", actualReturnTime: "", returnArrivalTime: "" };
    const { user } = renderComTudo(<Leitor inicial={soIda} onPreencher={onPreencher} />);
    await user.upload(screen.getByTestId("arquivo"), pdf);
    await waitFor(() => expect(onPreencher).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("pergunta-do-trecho")).toBeNull();
    expect(onPreencher.mock.calls[0][0]).toMatchObject({ transportType: "aereo", returnTransportType: "rodoviario" });
  });
});

describe("campos do formulário (modal) — rótulos e ícone por trecho", () => {
  const helpers = { errCls: () => "", fieldErrorMsg: () => null };
  const handlers = { onFieldChange: vi.fn(), onPatch: vi.fn() };

  it("ida \"Aeroporto de origem\" e volta \"Rodoviária de origem\", com o tipo no título de cada trecho", () => {
    renderComTudo(
      <TicketFormFields scope="v1" variant="modal" form={{ ...idaEVoltaAereas, returnTransportType: "rodoviario" }} helpers={helpers} handlers={handlers} testId={(n) => `input-${n}`} />,
    );
    const ida = screen.getByText("Ida · Aérea").closest("section")!;
    const volta = screen.getByText("Volta · Rodoviária").closest("section")!;
    expect(within(ida).getByText("Aeroporto de origem")).toBeInTheDocument();
    expect(within(ida).queryByText("Rodoviária de origem")).toBeNull();
    expect(within(volta).getByText("Rodoviária de origem")).toBeInTheDocument();
    expect(within(volta).getByText("Rodoviária de destino")).toBeInTheDocument();
    expect(screen.getByText("LOC da ida")).toBeInTheDocument();
  });

  it("volta de outro tipo abre bilhete e valor da volta; o total é a soma", async () => {
    renderComTudo(
      <TicketFormFields scope="v1" variant="modal" form={{ ...idaEVoltaAereas, returnTransportType: "rodoviario", returnValue: "150,00", returnPurchaseOrderNumber: "4471" }} helpers={helpers} handlers={handlers} testId={(n) => `input-${n}`} />,
    );
    expect(screen.getByText("LOC da ida")).toBeInTheDocument();
    expect(screen.getByText("Valor da ida")).toBeInTheDocument();
    expect(screen.getByText("Bilhete da volta")).toBeInTheDocument();
    expect(screen.getByText("Valor da volta")).toBeInTheDocument();
    expect(screen.getByTestId("total-ida-volta-v1")).toHaveTextContent("R$ 538,93");
  });

  it("mesmo tipo: \"Volta comprada à parte?\" abre os campos da volta", async () => {
    const { user } = renderComTudo(<TicketFormFields scope="v1" variant="modal" form={idaEVoltaAereas} helpers={helpers} handlers={handlers} testId={(n) => `input-${n}`} />);
    expect(screen.queryByText("Valor da volta")).toBeNull();
    await user.click(screen.getByTestId("abrir-volta-a-parte-v1"));
    expect(screen.getByText("LOC da volta")).toBeInTheDocument();
    expect(screen.getByText("Valor da volta")).toBeInTheDocument();
  });

  it("volta igual à ida: títulos de sempre", () => {
    renderComTudo(<TicketFormFields scope="v1" variant="modal" form={idaEVoltaAereas} helpers={helpers} handlers={handlers} testId={(n) => `input-${n}`} />);
    expect(screen.getByText("Ida")).toBeInTheDocument();
    expect(screen.getByText("Volta")).toBeInTheDocument();
    expect(screen.getAllByText("Aeroporto de origem")).toHaveLength(2);
  });
});

describe("linha de Passagens — resumo por trecho", () => {
  it("LOC da ida, bilhete da volta, total e \"ida R$ … + volta R$ …\"", () => {
    const t = { transportType: "aereo", returnTransportType: "rodoviario", value: 53893, returnValue: 15000, purchaseOrderNumber: "JPLN7F8J", returnPurchaseOrderNumber: "4471" };
    // formatarMoeda usa espaço não separável depois do "R$".
    const texto = (s: string) => s.replace(/\s/g, " ");
    expect(texto(ticketSummaryLine(t as never))).toBe("LOC JPLN7F8J · Bilhete 4471 · R$ 538,93 (ida R$ 388,93 + volta R$ 150,00) · Ida aérea · volta rodoviária");
    expect(texto(ticketSummaryLine({ transportType: "aereo", value: 150000, purchaseOrderNumber: "AX782Q" } as never))).toBe("LOC AX782Q · R$ 1.500,00 · Aéreo");
  });
});

describe("lote de vouchers — bilhete de um trecho numa vaga com ida e volta", () => {
  it("não entra no lote (não grava por cima) e diz para anexar na passagem da vaga", async () => {
    mockarFetch((url) => respostaJson({ leituras: [{ arquivo: "onibus.pdf", tipo: "passagem", pessoa: "Ana Souza", trechoUnico: true, campos: bilheteOnibusVolta, avisos: [] }] }, 200, url));
    const onRegistrar = vi.fn().mockResolvedValue(undefined);
    const { user } = renderComTudo(
      <VoucherLoteDialog
        open onOpenChange={vi.fn()}
        inclusions={[vagaFake({ id: "vaga-1", inclusionNumber: 101, collaboratorId: "colab-ana" })]}
        getCollaboratorName={() => "Ana Souza"} getEventName={() => "Running Hour"}
        onRegistrar={onRegistrar} registrando={false}
        getPassagemAtual={() => idaEVoltaAereas}
      />,
    );
    await user.upload(screen.getByTestId("input-vouchers"), new File(["%PDF-1.4"], "onibus.pdf", { type: "application/pdf" }));
    expect(await screen.findByTestId("lote-precisa-do-modal-0")).toHaveTextContent("a tela pergunta qual trecho trocar");
    expect(screen.getByText("Nenhuma linha pronta — confira as vagas acima.")).toBeInTheDocument();
    expect(screen.getByTestId("button-registrar-lote-vouchers")).toBeDisabled();
    expect(onRegistrar).not.toHaveBeenCalled();
  });
});
