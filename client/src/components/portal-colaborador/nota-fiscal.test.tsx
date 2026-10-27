import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { BlocoDaNotaEPagamento, TelaDaNotaFiscal, erroDoEnvio, etapasDoPagamento } from "./nota-fiscal";
import { TelaMeusEventos } from "./meus-eventos";
import { TelaDoEvento } from "./evento";
import { ProvedorDeMarcacao } from "./marcacao";
import { ApiError } from "@/lib/queryClient";
import type { EuDoPortal, NotaEPagamentoDoPortal, PrestacaoDoPortal } from "./tipos";
import * as captura from "./captura";

vi.mock("./captura", async (original) => ({
  ...(await original<typeof import("./captura")>()),
  prepararFotoDaNota: vi.fn(),
}));

const HOJE = "2026-10-27";
const eu: EuDoPortal = {
  colaborador: { id: "c-1", nome: "Eduardo Mendes Cardoso", primeiroNome: "Eduardo" },
  termo: { versao: "v1", texto: "", aceito: true, aceitoEm: null, versaoAceita: "v1" },
  configuracao: { selfieObrigatoria: true, localizacao: "registrar" },
};

const SEM_CONTA = { cadastrada: false, mascarada: null, podeInformar: true };
const COM_CONTA = {
  cadastrada: true, podeInformar: false,
  mascarada: { banco: "260 · Nubank", agencia: "••01", conta: "••••37-5", tipoConta: "Conta corrente", pixTipo: null, pixChave: null, titular: "Eduardo Mendes" },
};

function nep(extra: Partial<NotaEPagamentoDoPortal> = {}): NotaEPagamentoDoPortal {
  return {
    estado: "com_oc", rotulo: "OC emitida", frase: "OC emitida — envie a nota fiscal.",
    oc: { numero: "4500120002", valor: 97_500, data: "2026-10-22" },
    nota: null, programadoPara: null, pagoEm: null, podeEnviarNf: true, motivoNaoPodeEnviar: null,
    instrucoes: {
      tomador: { nome: "Norte Eventos Esportivos Ltda", cnpj: "12.345.601/0001-15" }, valor: 97_500, oc: "4500120002",
      descricaoSugerida: "Prestação de serviços de Produtor no evento Corrida Noturna do Recife — OC nº 4500120002.",
    },
    contaBancaria: SEM_CONTA,
    ...extra,
  };
}

const notaEnviada = (extra = {}) => ({
  status: "enviada", enviadaEm: "2026-10-23T17:00:00Z", atualizadaEm: "2026-10-23T17:00:00Z", arquivoNome: "nf.pdf",
  temArquivo: true, numero: "1187", valor: 97_500, comentarioDoDp: null, ...extra,
});

function prestacao(n: NotaEPagamentoDoPortal | null = nep(), extra: Partial<PrestacaoDoPortal> = {}): PrestacaoDoPortal {
  return {
    id: "act-9",
    evento: { id: "ev-9", nome: "Corrida Noturna do Recife", cidade: "Recife - PE", inicio: "2026-10-18", fim: "2026-10-20" },
    funcao: "Produtor",
    dias: [{ dia: "2026-10-18", estado: "concluido", entrada: { em: "", hora: "07:40", comSelfie: true, fotoExpurgada: false, fotoId: "A", porRepresentante: false, comLocalizacao: true }, saida: null, podeEntrar: false, podeSair: false }],
    ocorrencias: [], diasExtras: [], confirmacao: null, podeConfirmar: false, motivoNaoPodeConfirmar: null,
    checkoutFinalFeito: true, valoresOcultos: false,
    valores: { valorCalculado: 97_500, valorDaDiaria: 24_000, memoria: [], valorFinal: 97_500 },
    notaEPagamento: n,
    ...extra,
  };
}

const pdf = () => new File(["%PDF-1.4"], "nota 1187.pdf", { type: "application/pdf" });

describe("Bloco “Nota fiscal e pagamento”", () => {
  it.each([
    ["sem_oc", nep({ estado: "sem_oc", oc: null, instrucoes: null, podeEnviarNf: false }), "Aguardando a ordem de compra", /o DP ainda vai emitir a ordem de compra/],
    ["nf_enviada", nep({ estado: "nf_enviada", nota: notaEnviada(), podeEnviarNf: false }), "Nota enviada · em conferência no DP", /O DP confere o número da OC/],
    ["nf_aprovada", nep({ estado: "nf_aprovada", nota: notaEnviada({ status: "aprovada" }), podeEnviarNf: false }), "Nota aprovada", /o DP programa o pagamento/],
    ["programado", nep({ estado: "programado", programadoPara: "2026-11-01", nota: notaEnviada({ status: "aprovada" }), podeEnviarNf: false, contaBancaria: COM_CONTA }), "Pagamento programado para 01/11", /R\$ 975,00/],
    ["pago", nep({ estado: "pago", pagoEm: "2026-10-25", nota: notaEnviada({ status: "aprovada" }), podeEnviarNf: false, contaBancaria: COM_CONTA }), "Pago em 25/10", /pagos/],
  ])("%s", (_estado, n, titulo, corpo) => {
    renderComTudo(<BlocoDaNotaEPagamento p={prestacao(n)} />);
    expect(screen.getByText(titulo)).toBeInTheDocument();
    expect(screen.getByTestId("bloco-nota-e-pagamento")).toHaveTextContent(corpo);
    expect(screen.queryByRole("button", { name: /Enviar/ })).not.toBeInTheDocument();
  });

  it("OC emitida: botão Enviar nota fiscal leva ao formulário", async () => {
    const { user, historico } = renderComTudo(<BlocoDaNotaEPagamento p={prestacao()} />, { rota: "/evento/act-9" });
    expect(screen.getByText("OC emitida: envie a nota fiscal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enviar nota fiscal" }));
    expect(historico.at(-1)).toBe("/evento/act-9/nota-fiscal");
  });

  it("devolvida: comentário do DP em destaque, Enviar de novo e o link da nota anterior", () => {
    const n = nep({ estado: "nf_devolvida", nota: notaEnviada({ status: "devolvida", comentarioDoDp: "Valor diferente da OC." }) });
    renderComTudo(<BlocoDaNotaEPagamento p={prestacao(n)} />);
    expect(screen.getByText("O DP devolveu a sua nota")).toBeInTheDocument();
    expect(screen.getByText("Comentário do DP").closest("figure")).toHaveTextContent("Valor diferente da OC.");
    expect(screen.getByRole("button", { name: "Enviar de novo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver a nota que você enviou/ })).toHaveAttribute("href", "/api/colaborador/prestacoes/act-9/nota-fiscal/arquivo");
  });

  it("recusada: comentário, sem botão, fale com o DP", () => {
    const n = nep({ estado: "nf_recusada", podeEnviarNf: false, nota: notaEnviada({ status: "recusada", comentarioDoDp: "CNPJ errado." }) });
    renderComTudo(<BlocoDaNotaEPagamento p={prestacao(n)} />);
    expect(screen.getByText("Nota recusada pelo DP")).toBeInTheDocument();
    expect(screen.getByText("CNPJ errado.")).toBeInTheDocument();
    expect(screen.getByTestId("bloco-nota-e-pagamento")).toHaveTextContent("Fale com o DP");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("nota com valor diferente da OC e conta mascarada", () => {
    const n = nep({ estado: "nf_enviada", podeEnviarNf: false, nota: notaEnviada({ valor: 92_500 }), contaBancaria: COM_CONTA });
    renderComTudo(<BlocoDaNotaEPagamento p={prestacao(n)} />);
    expect(screen.getByText("Diferente do valor da OC")).toBeInTheDocument();
    expect(screen.getByText("••••37-5 · Conta corrente")).toBeInTheDocument();
    expect(screen.getByText("Para trocar a conta, fale com o DP.")).toBeInTheDocument();
  });

  it("etapas: devolvida pede atenção na nota; pago fecha tudo", () => {
    const dev = etapasDoPagamento(nep({ estado: "nf_devolvida" }));
    expect(dev.map((e) => e.situacao)).toEqual(["feita", "atencao", "depois", "depois"]);
    const pago = etapasDoPagamento(nep({ estado: "pago", pagoEm: "2026-10-25", nota: notaEnviada({ status: "aprovada" }) }));
    expect(pago.map((e) => e.situacao)).toEqual(["feita", "feita", "feita", "feita"]);
    expect(pago[3].detalhe).toBe("pago em 25/10");
  });
});

describe("Tela do evento", () => {
  it("da OC em diante o bloco vem antes dos dias; selfie apagada pela guarda", () => {
    const p = prestacao(nep(), {
      dias: [{ dia: "2026-10-18", estado: "concluido", entrada: { em: "", hora: "07:40", comSelfie: true, fotoExpurgada: true, fotoId: null, porRepresentante: false, comLocalizacao: true }, saida: null, podeEntrar: false, podeSair: false }],
    });
    renderComTudo(<ProvedorDeMarcacao eu={eu}><TelaDoEvento p={p} hoje={HOJE} /></ProvedorDeMarcacao>);
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos[0]).toBe("Nota fiscal e pagamento");
    expect(screen.getByText(/Selfie apagada pela política de guarda/)).toBeInTheDocument();
    expect(screen.getAllByText("R$ 975,00").length).toBeGreaterThan(0);
  });

  it("sem OC o bloco fica no fim", () => {
    renderComTudo(<ProvedorDeMarcacao eu={eu}><TelaDoEvento p={prestacao(nep({ estado: "sem_oc", oc: null, podeEnviarNf: false, instrucoes: null }))} hoje={HOJE} /></ProvedorDeMarcacao>);
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos.at(-1)).toBe("Nota fiscal e pagamento");
  });
});

describe("Meus eventos", () => {
  it("nota devolvida vira o destaque do topo, com o comentário", async () => {
    const n = nep({ estado: "nf_devolvida", nota: notaEnviada({ status: "devolvida", comentarioDoDp: "Valor diferente." }) });
    const { user, historico } = renderComTudo(<ProvedorDeMarcacao eu={eu}><TelaMeusEventos eu={eu} dados={{ hoje: HOJE, prestacoes: [prestacao(n)], cnpjs: [] }} /></ProvedorDeMarcacao>);
    expect(screen.getByText("Nota devolvida · Corrida Noturna do Recife")).toBeInTheDocument();
    expect(screen.getByText("Valor diferente.")).toBeInTheDocument();
    expect(screen.getByText("Nota devolvida · envie de novo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enviar de novo" }));
    expect(historico.at(-1)).toBe("/evento/act-9/nota-fiscal");
  });

  it("pagamento programado aparece como novidade", () => {
    const n = nep({ estado: "programado", programadoPara: "2026-11-01", podeEnviarNf: false });
    renderComTudo(<ProvedorDeMarcacao eu={eu}><TelaMeusEventos eu={eu} dados={{ hoje: HOJE, prestacoes: [prestacao(n)], cnpjs: [] }} /></ProvedorDeMarcacao>);
    const novidades = screen.getByRole("region", { name: "Pagamentos" });
    expect(within(novidades).getByText("Pagamento programado para 01/11")).toBeInTheDocument();
    expect(within(novidades).getByText(/R\$ 975,00/)).toBeInTheDocument();
  });
});

describe("Envio da nota fiscal", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:previa");
    URL.revokeObjectURL = vi.fn();
    vi.mocked(captura.prepararFotoDaNota).mockReset().mockResolvedValue(new Blob(["jpg"], { type: "image/jpeg" }));
  });

  const resposta = () => respostaJson({ prestacao: prestacao(nep({ estado: "nf_enviada", podeEnviarNf: false, nota: notaEnviada({ arquivoNome: "nota 1187.pdf" }), contaBancaria: COM_CONTA })) }, 201);

  it("o que deve constar na nota, com Copiar", async () => {
    const escrever = vi.fn().mockResolvedValue(undefined);
    const { user } = renderComTudo(<TelaDaNotaFiscal p={prestacao()} />);
    // Depois do render: o userEvent.setup() troca o clipboard pelo dele.
    Object.defineProperty(navigator, "clipboard", { value: { writeText: escrever }, configurable: true });
    expect(screen.getByText("Norte Eventos Esportivos Ltda")).toBeInTheDocument();
    expect(screen.getByText("12.345.601/0001-15")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copiar valor" }));
    expect(escrever).toHaveBeenCalledWith("975,00");
    expect(await screen.findByText("Copiado")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copiar nº da ordem de compra (oc)" }));
    expect(escrever).toHaveBeenLastCalledWith("4500120002");
  });

  it("nada preenchido: aponta cada campo e não envia", async () => {
    const fetchMock = mockarFetch(() => resposta());
    const { user } = renderComTudo(<TelaDaNotaFiscal p={prestacao()} />);
    await user.click(screen.getByRole("button", { name: "Enviar nota fiscal" }));
    expect(screen.getByText("Anexe a nota: o PDF ou uma foto dela.")).toBeInTheDocument();
    expect(screen.getByText("Informe o valor da nota.")).toBeInTheDocument();
    expect(screen.getByText("Informe o banco.")).toBeInTheDocument();
    expect(screen.getByText("Escolha o tipo de conta.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("PDF + valor diferente da OC (avisa, não bloqueia) + conta → envia tudo e mostra o sucesso", async () => {
    const fetchMock = mockarFetch(() => resposta());
    const { user } = renderComTudo(<TelaDaNotaFiscal p={prestacao()} />);
    const entrada = screen.getByTestId("portal-arquivo-da-nota");
    expect(entrada).toHaveAttribute("accept", "application/pdf,image/*");
    await user.upload(entrada, pdf());
    expect(screen.getByText("nota 1187.pdf")).toBeInTheDocument();

    const valor = screen.getByLabelText("Valor da nota");
    await user.type(valor, "92500");
    expect(valor).toHaveValue("925,00");
    expect(screen.getByText(/Diferente do valor da OC \(R\$ 975,00\)/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nº da nota (opcional)"), "1187");
    await user.type(screen.getByLabelText("CNPJ da nota (opcional)"), "11444777000161");
    expect(screen.getByLabelText("CNPJ da nota (opcional)")).toHaveValue("11.444.777/0001-61");

    await user.type(screen.getByLabelText("Banco"), "260");
    expect(screen.getByText("Nubank")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Agência"), "0001");
    await user.type(screen.getByLabelText("Conta com dígito"), "4821937-5");
    await user.click(screen.getByRole("radio", { name: "Corrente" }));
    await user.type(screen.getByLabelText("Titular da conta"), "Eduardo Mendes Cardoso");
    await user.click(screen.getByRole("button", { name: "Enviar nota fiscal" }));

    expect(await screen.findByText("Nota fiscal enviada")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/colaborador/prestacoes/act-9/nota-fiscal");
    const corpo = init?.body as FormData;
    expect(corpo.get("arquivo")).toBeInstanceOf(Blob);
    expect(corpo.get("valorNota")).toBe("92500");
    expect(corpo.get("numeroNota")).toBe("1187");
    expect(corpo.get("cnpjNota")).toBe("11444777000161");
    expect(corpo.get("banco")).toBe("260");
    expect(corpo.get("tipoConta")).toBe("corrente");
    expect(corpo.get("titular")).toBe("Eduardo Mendes Cardoso");
    expect(corpo.get("pixChave")).toBeNull();
    expect(screen.getByText("Conta guardada (protegida)")).toBeInTheDocument();
  });

  it("conta já cadastrada: mostra mascarada e não manda conta", async () => {
    const fetchMock = mockarFetch(() => resposta());
    const { user } = renderComTudo(<TelaDaNotaFiscal p={prestacao(nep({ contaBancaria: COM_CONTA }))} />);
    expect(screen.getByText("••••37-5 · Conta corrente")).toBeInTheDocument();
    expect(screen.queryByLabelText("Banco")).not.toBeInTheDocument();
    await user.upload(screen.getByTestId("portal-arquivo-da-nota"), pdf());
    await user.type(screen.getByLabelText("Valor da nota"), "97500");
    expect(screen.getByText(/O da OC é R\$ 975,00/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enviar nota fiscal" }));
    await screen.findByText("Nota fiscal enviada");
    const corpo = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(corpo.get("banco")).toBeNull();
    expect(corpo.get("cnpjNota")).toBeNull();
  });

  it("foto da nota em papel: reduzida antes de subir", async () => {
    const { user } = renderComTudo(<TelaDaNotaFiscal p={prestacao(nep({ contaBancaria: COM_CONTA }))} />);
    await user.upload(screen.getByTestId("portal-arquivo-da-nota"), new File(["x".repeat(5000)], "IMG_2041.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText("Foto da nota")).toBeInTheDocument();
    expect(captura.prepararFotoDaNota).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("img", { name: "Prévia da foto da nota" })).toBeInTheDocument();
  });

  it("arquivo que não é PDF nem foto é recusado na hora", async () => {
    const { user } = renderComTudo(<TelaDaNotaFiscal p={prestacao()} />, { userEvent: { applyAccept: false } });
    await user.upload(screen.getByTestId("portal-arquivo-da-nota"), new File(["x"], "nota.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    expect(screen.getByText("Envie o PDF da nota ou uma foto dela.")).toBeInTheDocument();
  });

  it("sistema de pagamento sem chave: explica e manda avisar o DP", async () => {
    mockarFetch(() => respostaJson({ message: "chave", codigo: "sem_chave" }, 503));
    const { user } = renderComTudo(<TelaDaNotaFiscal p={prestacao(nep({ contaBancaria: COM_CONTA }))} />);
    await user.upload(screen.getByTestId("portal-arquivo-da-nota"), pdf());
    await user.type(screen.getByLabelText("Valor da nota"), "97500");
    await user.click(screen.getByRole("button", { name: "Enviar nota fiscal" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Sistema de pagamento em manutenção");
    expect(alerta).toHaveTextContent("Avise o DP");
    expect(screen.getByText(/nota 1187\.pdf/)).toBeInTheDocument();
  });

  it("devolvida: mostra o comentário no topo e o botão é Enviar de novo", () => {
    const n = nep({ estado: "nf_devolvida", nota: notaEnviada({ status: "devolvida", comentarioDoDp: "Emita com o valor da OC." }), contaBancaria: COM_CONTA });
    renderComTudo(<TelaDaNotaFiscal p={prestacao(n)} />);
    expect(screen.getByText("O DP devolveu a nota anterior")).toBeInTheDocument();
    expect(screen.getByText("Emita com o valor da OC.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar de novo" })).toBeInTheDocument();
  });

  it("fechada: diz o motivo", () => {
    renderComTudo(<TelaDaNotaFiscal p={prestacao(nep({ estado: "nf_enviada", podeEnviarNf: false, motivoNaoPodeEnviar: "A nota já foi enviada e está em conferência no DP." }))} />);
    expect(screen.getByText("A nota já foi enviada e está em conferência no DP.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar nota fiscal" })).not.toBeInTheDocument();
  });

  it("erros do servidor em língua de gente", () => {
    expect(erroDoEnvio(new ApiError(0, null, "rede")).titulo).toBe("Sem conexão");
    expect(erroDoEnvio(new ApiError(413, { message: "x" }))).toMatchObject({ campo: "arquivo", texto: expect.stringMatching(/10 MB/) });
    expect(erroDoEnvio(new ApiError(415, { message: "x" }))).toMatchObject({ campo: "arquivo", texto: expect.stringMatching(/PDF ou foto/) });
    expect(erroDoEnvio(new ApiError(400, { message: "x", codigo: "conta_obrigatoria" }))).toMatchObject({ campo: "conta" });
    expect(erroDoEnvio(new ApiError(409, { message: "x", codigo: "conta_ja_cadastrada" }))).toMatchObject({ recarregar: true });
    expect(erroDoEnvio(new ApiError(409, { message: "A nota já foi aprovada pelo DP.", codigo: "nf_aprovada" })).texto).toMatch(/aprovada.*Atualizamos a tela/);
  });
});

