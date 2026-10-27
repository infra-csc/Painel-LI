import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { TelaEntrar, TelaPrimeiroAcesso } from "./entrar";
import { BotaoDeMarcacao, ProvedorDeMarcacao } from "./marcacao";
import { TelaDeConfirmacao, avisoDoCnpj } from "./confirmar";
import { TelaMeusEventos } from "./meus-eventos";
import { TelaDoEvento } from "./evento";
import { TelaDoTermo } from "./termo";
import type { EuDoPortal, PrestacaoDoPortal } from "./tipos";
import * as captura from "./captura";

vi.mock("./captura", async (original) => ({
  ...(await original<typeof import("./captura")>()),
  prepararFoto: vi.fn(),
  obterLocalizacao: vi.fn(),
}));

const eu = (extra: Partial<EuDoPortal> = {}): EuDoPortal => ({
  colaborador: { id: "c-1", nome: "Paulo Santos Martins", primeiroNome: "Paulo" },
  termo: { versao: "v1", texto: "Texto do termo.", aceito: true, aceitoEm: null, versaoAceita: "v1" },
  configuracao: { selfieObrigatoria: true, localizacao: "registrar" },
  ...extra,
});

const HOJE = "2026-10-27";
function prestacao(extra: Partial<PrestacaoDoPortal> = {}): PrestacaoDoPortal {
  return {
    id: "act-1",
    evento: { id: "ev-1", nome: "Meia Maratona de Florianópolis", cidade: "Florianópolis - SC", inicio: "2026-10-25", fim: "2026-11-01" },
    funcao: "Produtor",
    dias: [
      { dia: "2026-10-25", estado: "concluido", entrada: { em: "", hora: "07:42", comSelfie: true, fotoId: null, porRepresentante: false, comLocalizacao: true }, saida: { em: "", hora: "18:15", comSelfie: true, fotoId: null, porRepresentante: false, comLocalizacao: true }, podeEntrar: false, podeSair: false },
      { dia: "2026-10-26", estado: "falta", entrada: null, saida: null, podeEntrar: false, podeSair: false },
      { dia: HOJE, estado: "hoje_sem_checkin", entrada: null, saida: null, podeEntrar: true, podeSair: false },
    ],
    ocorrencias: [
      { id: "o-1", tipo: "falta", rotulo: "Falta", dia: "2026-10-26", horas: null },
      { id: "o-2", tipo: "horas_extras", rotulo: "Horas extras", dia: "2026-10-25", horas: 2 },
    ],
    diasExtras: [],
    confirmacao: null,
    podeConfirmar: false,
    motivoNaoPodeConfirmar: "A confirmação abre depois do último dia de trabalho.",
    checkoutFinalFeito: false,
    valoresOcultos: true,
    valores: null,
    ...extra,
  };
}

describe("Entrar", () => {
  it("mascara o CPF, valida antes de enviar e mostra a mensagem do servidor", async () => {
    const fetchMock = mockarFetch(() => respostaJson({ message: "CPF ou senha incorretos." }, 401));
    const aoEntrar = vi.fn();
    const { user } = renderComTudo(<TelaEntrar aoEntrar={aoEntrar} />);

    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByText("Digite os 11 números do CPF.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    const cpf = screen.getByLabelText("CPF");
    expect(cpf).toHaveAttribute("inputmode", "numeric");
    await user.type(cpf, "12345678901");
    expect(cpf).toHaveValue("123.456.789-01");
    await user.type(screen.getByLabelText("Senha"), "errada123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("CPF ou senha incorretos.");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ cpf: "12345678901", senha: "errada123" });
    expect(aoEntrar).not.toHaveBeenCalled();
  });

  it("429: muitas tentativas, aguarde alguns minutos", async () => {
    mockarFetch(() => respostaJson({ message: "Muitas tentativas erradas: o acesso fica bloqueado por 15 minutos.", bloqueado: true }, 429));
    const { user } = renderComTudo(<TelaEntrar aoEntrar={vi.fn()} />);
    await user.type(screen.getByLabelText("CPF"), "12345678901");
    await user.type(screen.getByLabelText("Senha"), "qualquer1");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Muitas tentativas");
    expect(alerta).toHaveTextContent("Aguarde alguns minutos");
  });

  it("mostrar/ocultar a senha", async () => {
    const { user } = renderComTudo(<TelaEntrar aoEntrar={vi.fn()} />);
    const senha = screen.getByLabelText("Senha");
    expect(senha).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(senha).toHaveAttribute("type", "text");
  });

  it("sessão expirada avisa", () => {
    renderComTudo(<TelaEntrar aoEntrar={vi.fn()} sessaoExpirada />);
    expect(screen.getByRole("status")).toHaveTextContent("Sua sessão terminou");
  });
});

describe("Primeiro acesso", () => {
  it("colar o código inteiro funciona, a regra da senha aparece e o corpo vai certo", async () => {
    const meu = eu();
    const fetchMock = mockarFetch(() => respostaJson(meu));
    const aoEntrar = vi.fn();
    const { user } = renderComTudo(<TelaPrimeiroAcesso aoEntrar={aoEntrar} />, { rota: "/primeiro-acesso" });

    expect(screen.getByText(/Peça ao DP ou ao produtor do evento/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("CPF"), "12345678901");
    const codigo = screen.getByLabelText("Código de acesso");
    await user.click(codigo);
    await user.paste("Seu código: 482 913");
    expect(codigo).toHaveValue("482913");

    await user.type(screen.getByLabelText("Senha nova"), "abcdefgh");
    expect(screen.getByText("Letras e números").closest("li")).toHaveTextContent("(falta)");
    await user.type(screen.getByLabelText("Senha nova"), "1");
    expect(screen.getByText("Letras e números").closest("li")).toHaveTextContent("(ok)");
    await user.type(screen.getByLabelText("Repita a senha nova"), "abcdefgh1");
    await user.click(screen.getByRole("button", { name: "Criar senha e entrar" }));

    await waitFor(() => expect(aoEntrar).toHaveBeenCalledWith(meu));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ cpf: "12345678901", codigo: "482913", senha: "abcdefgh1" });
  });

  it("senhas diferentes não enviam", async () => {
    const fetchMock = mockarFetch(() => respostaJson(eu()));
    const { user } = renderComTudo(<TelaPrimeiroAcesso aoEntrar={vi.fn()} />);
    await user.type(screen.getByLabelText("CPF"), "12345678901");
    await user.type(screen.getByLabelText("Código de acesso"), "123456");
    await user.type(screen.getByLabelText("Senha nova"), "abcdefg1");
    await user.type(screen.getByLabelText("Repita a senha nova"), "abcdefg2");
    await user.click(screen.getByRole("button", { name: "Criar senha e entrar" }));
    expect(screen.getByText("As duas senhas não são iguais.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Termo", () => {
  it("o botão só libera com a caixa marcada (ou depois de rolar até o fim)", async () => {
    const aceito = eu();
    mockarFetch(() => respostaJson(aceito));
    const pendente = eu({ termo: { ...aceito.termo, aceito: false, versaoAceita: null } });
    const { user } = renderComTudo(<TelaDoTermo eu={pendente} />);
    const botao = screen.getByRole("button", { name: "Li e aceito" });
    // jsdom não tem layout: o texto "cabe" na caixa e conta como lido.
    expect(botao).toBeEnabled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(botao);
    await waitFor(() => expect(botao).not.toHaveAttribute("aria-busy"));
  });
});

describe("Check-in com selfie", () => {
  beforeEach(() => {
    vi.mocked(captura.prepararFoto).mockClear().mockResolvedValue(new Blob(["jpg"], { type: "image/jpeg" }));
    vi.mocked(captura.obterLocalizacao).mockResolvedValue({ ok: false, motivo: "negada" });
    URL.createObjectURL = vi.fn(() => "blob:previa");
    URL.revokeObjectURL = vi.fn();
  });

  function montar() {
    return renderComTudo(
      <ProvedorDeMarcacao eu={eu()}>
        <BotaoDeMarcacao alvo={{ actualId: "act-1", dia: HOJE, tipo: "entrada", evento: "Meia Maratona" }} />
      </ProvedorDeMarcacao>,
    );
  }

  it("câmera frontal → prévia → envia sem localização → mostra a hora do servidor", async () => {
    const fetchMock = mockarFetch(() => respostaJson({ dia: HOJE, entrada: { em: "", hora: "07:55", comSelfie: true, fotoId: "ATT-1", porRepresentante: false, comLocalizacao: false }, saida: null }, 201));
    const { user } = montar();
    const camera = screen.getByTestId("portal-camera");
    expect(camera).toHaveAttribute("capture", "user");
    expect(camera).toHaveAttribute("accept", "image/*");

    await user.click(screen.getByRole("button", { name: "Fazer check-in" }));
    await user.upload(camera, new File(["x"], "selfie.jpg", { type: "image/jpeg" }));

    expect(await screen.findByRole("img", { name: "Prévia da sua selfie" })).toBeInTheDocument();
    expect(await screen.findByText(/Sem localização — tudo bem, o produtor confere/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enviar check-in" }));

    const sucesso = await screen.findByRole("status");
    expect(sucesso).toHaveTextContent("Check-in registrado");
    expect(sucesso).toHaveTextContent("07:55");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/colaborador/presencas/act-1/${HOJE}/entrada`);
    const corpo = init?.body as FormData;
    expect(corpo.get("foto")).toBeInstanceOf(Blob);
    expect(corpo.get("lat")).toBeNull();
  });

  it("sem rede: a foto fica e “Tentar de novo” reenvia a mesma", async () => {
    let tentativas = 0;
    const fetchMock = mockarFetch(() => {
      tentativas += 1;
      if (tentativas === 1) throw new TypeError("Failed to fetch");
      return respostaJson({ dia: HOJE, entrada: { em: "", hora: "08:01", comSelfie: true, fotoId: "ATT-1", porRepresentante: false, comLocalizacao: true }, saida: null }, 201);
    });
    vi.mocked(captura.obterLocalizacao).mockResolvedValue({ ok: true, lat: -27.58, lng: -48.54, precisao: 12.4 });
    const { user } = montar();
    await user.click(screen.getByRole("button", { name: "Fazer check-in" }));
    await user.upload(screen.getByTestId("portal-camera"), new File(["x"], "selfie.jpg", { type: "image/jpeg" }));
    await user.click(await screen.findByRole("button", { name: "Enviar check-in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A foto continua aqui");
    expect(screen.getByRole("img", { name: "Prévia da sua selfie" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(await screen.findByText("08:01")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [primeira, segunda] = fetchMock.mock.calls.map((c) => c[1]?.body as FormData);
    expect((segunda.get("foto") as File).size).toBe((primeira.get("foto") as File).size);
    expect(captura.prepararFoto).toHaveBeenCalledTimes(1);
    expect(segunda.get("lat")).toBe("-27.58");
    expect(segunda.get("precisao")).toBe("12");
  });
});

describe("Meus eventos e evento", () => {
  it("vazio", () => {
    renderComTudo(<TelaMeusEventos eu={eu()} dados={{ hoje: HOJE, prestacoes: [], cnpjs: [] }} />);
    expect(screen.getByText("Nenhum evento liberado para você ainda")).toBeInTheDocument();
  });

  it("o que fazer hoje vem em destaque no topo", () => {
    renderComTudo(
      <ProvedorDeMarcacao eu={eu()}>
        <TelaMeusEventos eu={eu()} dados={{ hoje: HOJE, prestacoes: [prestacao()], cnpjs: [] }} />
      </ProvedorDeMarcacao>,
    );
    expect(screen.getByText("Hoje · Meia Maratona de Florianópolis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fazer check-in" })).toBeInTheDocument();
  });

  it("dias com ocorrências do produtor e valores ocultos (nunca zero)", () => {
    renderComTudo(<ProvedorDeMarcacao eu={eu()}><TelaDoEvento p={prestacao()} hoje={HOJE} /></ProvedorDeMarcacao>);
    expect(screen.getByText("Falta registrada pelo produtor")).toBeInTheDocument();
    expect(screen.getByText("Horas extras: 2 h")).toBeInTheDocument();
    expect(screen.getByText("Valores: ocultos pelo DP até a ordem de compra")).toBeInTheDocument();
    expect(screen.queryByText(/R\$ 0,00/)).not.toBeInTheDocument();
    expect(screen.getByText("A confirmação abre depois do último dia de trabalho.")).toBeInTheDocument();
  });

  it("valores visíveis com a memória de cálculo em linguagem simples", async () => {
    const p = prestacao({ valoresOcultos: false, valores: { valorCalculado: 81_000, valorDaDiaria: 24_000, memoria: ["Realizado: 4 diárias de R$ 240,00 = R$ 1.300,00.", "Valor calculado: R$ 810,00."], valorFinal: null } });
    const { user } = renderComTudo(<ProvedorDeMarcacao eu={eu()}><TelaDoEvento p={p} hoje={HOJE} /></ProvedorDeMarcacao>);
    expect(screen.getByText("R$ 810,00")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Como chegamos nesse valor/ }));
    expect(screen.getByText(/^Previsto: 4 diárias/)).toBeInTheDocument();
  });
});

describe("Confirmação", () => {
  const cnpjs = [{ cnpj: "11.222.333/0001-81", razaoSocial: "Paulo Martins MEI", ativo: true }];

  it("aviso do CNPJ: contrato ativo, inativo, novo", () => {
    expect(avisoDoCnpj("11.222.333/0001-81", "", cnpjs)).toBeNull();
    expect(avisoDoCnpj("outro", "11.222.333/0001-81", cnpjs)).toBeNull();
    expect(avisoDoCnpj("outro", "11.444.777/0001-61", cnpjs)).toMatch(/ainda não tem contrato/);
    expect(avisoDoCnpj("x", "", [{ cnpj: "x", razaoSocial: null, ativo: false }])).toMatch(/não está ativo/);
  });

  it("CNPJ novo: valida, avisa que o DP confere e envia dias + CNPJ + contestação", async () => {
    const fetchMock = mockarFetch(() => respostaJson({ confirmacao: { dias: ["2026-10-25"], cnpj: "11.444.777/0001-61", razaoSocial: null, contestacao: "Faltou um dia", confirmadoEm: "2026-10-28T12:00:00Z", cnpjComContrato: false } }));
    const p = prestacao({
      podeConfirmar: true, motivoNaoPodeConfirmar: null,
      dias: prestacao().dias.map((d) => (d.dia === HOJE ? { ...d, estado: "ausente" as const, podeEntrar: false } : d)),
    });
    const { user } = renderComTudo(<TelaDeConfirmacao p={p} cnpjs={cnpjs} />);

    expect(screen.getByRole("radio", { name: /11\.222\.333\/0001-81/ })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Outro CNPJ" }));
    await user.type(screen.getByLabelText("CNPJ"), "11444777000100");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.getByText("CNPJ inválido — confira os dígitos verificadores.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    const campo = screen.getByLabelText("CNPJ");
    await user.clear(campo);
    await user.type(campo, "11444777000161");
    expect(campo).toHaveValue("11.444.777/0001-61");
    expect(screen.getByText(/ainda não tem contrato — o DP vai conferir/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Algo não bate? Conte aqui"), { target: { value: "Faltou um dia" } });
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText("Confirmação enviada")).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      dias: ["2026-10-25"], cnpj: "11444777000161", razaoSocial: null, contestacao: "Faltou um dia",
    });
    expect(screen.getByText("CNPJ sem contrato ativo")).toBeInTheDocument();
  });

  it("fechada: mostra o motivo", () => {
    renderComTudo(<TelaDeConfirmacao p={prestacao()} cnpjs={cnpjs} />);
    expect(screen.getByText("A confirmação abre depois do último dia de trabalho.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
  });
});
