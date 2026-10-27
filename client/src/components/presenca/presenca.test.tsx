/**
 * Presença no evento (27/10, Honorários Fase 1) — telas internas:
 *  - regras de tela (fila por situação, selo, ajuste, mensagem do código);
 *  - check-out final (dias pendentes, limite do produtor, justificativa, 409);
 *  - código de acesso (aparece uma vez, com o texto do WhatsApp);
 *  - página (na arena, fila que recorta, evento legado sem chamar a API);
 *  - configuração (texto do termo exige versão nova);
 *  - menu e permissão (produção/Área de Função veem; perfil Honorários não).
 */
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake } from "@/test/fixtures";
import { eventoFake } from "@/test/fixtures-dominio";
import { hasPermission } from "@/lib/role-utils";
import { visibleGroups } from "@/components/layout/nav-items";
import { CONFIGURACAO_PADRAO } from "@shared/presenca";
import PresencaNoEventoPage from "@/pages/presenca-no-evento";
import {
  atendeAoFiltro, codigoEmGrupos, contarPorFiltro, dentroDaFaixa, mensagemDoCodigo, seloPrincipal, textoDoAjuste,
} from "./presenca-utils";
import { corpoDaCorrecao } from "./dialogo-corrigir";
import { montarOcorrencia } from "./dialogo-ocorrencia";
import { DialogoCheckoutFinal } from "./dialogo-checkout-final";
import { DialogoCodigoDeAcesso } from "./codigo-de-acesso";
import { useAcoesDaPresenca } from "./use-presenca";
import { diferencaDaConfiguracao } from "@/components/settings/presenca-config-card";
import type { DiaDaPresenca, MarcacaoDaPresenca, PrestacaoDaPresenca, RespostaDaPresenca } from "./tipos";

const HOJE = "2026-11-03";

const marca = (hora: string, extra: Partial<MarcacaoDaPresenca> = {}): MarcacaoDaPresenca => ({
  em: `2026-11-01T${hora}:00.000Z`, hora, por: "colaborador", porUsuario: null, comSelfie: true,
  fotoId: "F1", fotoUrl: "/api/attachments/F1/view", lat: -27.5, lng: -48.5, precisaoM: 12, ...extra,
});

const dia = (d: string, estado: DiaDaPresenca["estado"], e?: string, s?: string): DiaDaPresenca => ({
  dia: d, estado, rotulo: estado, entrada: e ? marca(e) : null, saida: s ? marca(s) : null, observacao: null,
});

function prestacao(p: Partial<PrestacaoDaPresenca> = {}): PrestacaoDaPresenca {
  return {
    actualId: "a1",
    colaborador: { id: "c1", nome: "ANA PAULA SOUZA", numero: 7, tipo: "freela" },
    funcao: { id: "f1", nome: "Produtor" },
    fonteDosDias: "dias_trabalhados",
    dias: [dia("2026-11-01", "concluido", "07:30", "18:00"), dia("2026-11-02", "concluido", "07:40", "17:50")],
    diasExtras: [],
    ocorrencias: [],
    confirmacao: null,
    podeConfirmar: true,
    calculo: { valorBase: 100000, valorCalculado: 100000, linhas: ["Realizado: 2 diárias.", "Valor calculado: R$ 1.000,00."], diasPagos: ["2026-11-01", "2026-11-02"], diasComFalta: [], diasExtras: [], horasExtras: 0, valorDaHora: 5000, valorHorasExtras: 0 },
    limiteDoAjuste: { pct: 10, minimo: 90000, maximo: 110000 },
    diasPendentes: [],
    checkoutFinal: { feito: false, em: null, por: null, valorCalculado: null, valorFinal: null, ajustePct: null, horasExtras: 0, valorHorasExtras: 0, podeFazer: true },
    cnpj: { informado: null, razaoSocial: null, origem: null, situacao: "sem_cnpj", rotulo: "CNPJ não informado", contratoId: null },
    situacaoContratual: "sem_cnpj",
    acesso: { temSenha: false, codigoValidoAte: null, bloqueadoAte: null, termoAceito: false, ultimoAcessoEm: null },
    realizado: { rhStatus: "pendente", sentForReview: false, totalValue: 100000, dailyValue: 40000 },
    ...p,
  };
}

const confirmacao = { por: "colaborador" as const, porUsuario: null, dias: ["2026-11-01", "2026-11-02"], valorVisto: null, cnpj: "11.222.333/0001-81", razaoSocial: "ANA MEI", contratoId: "k1", contestacao: null, confirmadoEm: "2026-11-02T21:00:00.000Z" };

describe("regras de tela da presença", () => {
  it("fila: pendente de dia, sem saída, pronto para fechar, enviado — e 'não confirmou' só depois do último dia", () => {
    const pronta = prestacao();
    const semRegistro = prestacao({ dias: [dia("2026-11-01", "ausente"), dia("2026-11-02", "concluido", "07:00", "17:00")], diasPendentes: ["2026-11-01"] });
    const semSaida = prestacao({ dias: [dia("2026-11-01", "sem_checkout", "07:00")] });
    const emCurso = prestacao({ dias: [dia(HOJE, "em_andamento", "08:00"), dia("2026-11-04", "futuro")], podeConfirmar: false, diasPendentes: ["2026-11-04"] });
    const enviada = prestacao({ confirmacao, checkoutFinal: { ...pronta.checkoutFinal, feito: true, podeFazer: false } });

    expect(atendeAoFiltro(pronta, "pronto")).toBe(true);
    expect(atendeAoFiltro(semRegistro, "pendente_dia")).toBe(true);
    expect(atendeAoFiltro(semRegistro, "pronto")).toBe(false);
    expect(atendeAoFiltro(semSaida, "sem_saida")).toBe(true);
    expect(atendeAoFiltro(emCurso, "nao_confirmou")).toBe(false); // ainda não podia confirmar
    // Entrada sem saída conta como presença (o servidor deixa fechar): sem saída também está pronta.
    expect(atendeAoFiltro(semSaida, "pronto")).toBe(true);
    expect(atendeAoFiltro(pronta, "nao_confirmou")).toBe(true);
    expect(atendeAoFiltro(enviada, "enviado")).toBe(true);
    expect(atendeAoFiltro(enviada, "pronto")).toBe(false);
    expect(contarPorFiltro([pronta, semRegistro, semSaida, emCurso, enviada])).toMatchObject({ pronto: 2, pendente_dia: 1, sem_saida: 1, enviado: 1, confirmou: 1 });

    expect(seloPrincipal(semRegistro, HOJE).rotulo).toBe("Sem registro em 01/11");
    expect(seloPrincipal(emCurso, HOJE).rotulo).toBe("Na arena desde 08:00");
    expect(seloPrincipal(pronta, HOJE).rotulo).toBe("Pronto para fechar");
    expect(seloPrincipal(enviada, HOJE).rotulo).toBe("Enviado ao DP");
  });

  it("ajuste, faixa e o texto do código", () => {
    expect(dentroDaFaixa(110000, { pct: 10, minimo: 90000, maximo: 110000 })).toBe(true);
    expect(dentroDaFaixa(110001, { pct: 10, minimo: 90000, maximo: 110000 })).toBe(false);
    expect(dentroDaFaixa(999999, null)).toBe(true); // DP: sem limite
    expect(textoDoAjuste(100000, 105000)).toBe("+5%");
    expect(textoDoAjuste(100000, 100000)).toBe("sem ajuste");
    expect(codigoEmGrupos("123456")).toBe("123 456");
    expect(mensagemDoCodigo("123456", "2026-11-05T17:00:00.000Z", "https://app.exemplo/")).toBe(
      "Seu código de primeiro acesso ao app de honorários é 123456, vale até 05/11 14:00. Entre em https://app.exemplo/colaborador com seu CPF.",
    );
  });

  it("correção manda só o que mudou; ocorrência valida pelo tipo", () => {
    expect(corpoDaCorrecao({ entrada: "07:50", saida: "" }, { entrada: "07:50", saida: "18:30" })).toEqual({ saida: "18:30" });
    expect(corpoDaCorrecao({ entrada: "07:50", saida: "18:00" }, { entrada: "", saida: "18:00" })).toEqual({ entrada: null });
    const p = prestacao();
    expect(montarOcorrencia({ tipo: "falta", dia: "", horas: "", substitutoId: "", observacao: "" }, p)).toEqual({ erro: "Escolha um dia de diária desta prestação." });
    expect(montarOcorrencia({ tipo: "diaria_extra", dia: "2026-11-01", horas: "", substitutoId: "", observacao: "" }, p)).toMatchObject({ erro: expect.stringContaining("dia a mais") });
    expect(montarOcorrencia({ tipo: "horas_extras", dia: "", horas: "1,5", substitutoId: "", observacao: " ok " }, p)).toEqual({ tipo: "horas_extras", dia: null, horas: 1.5, observacao: "ok" });
    expect(montarOcorrencia({ tipo: "substituicao", dia: "2026-11-01", horas: "", substitutoId: "", observacao: "" }, p)).toEqual({ erro: "Escolha quem substituiu." });
  });

  it("configuração: texto do termo novo exige versão nova; número fora da faixa explica", () => {
    const atual = CONFIGURACAO_PADRAO;
    const base = { selfieObrigatoria: true, localizacao: "registrar" as const, horaExtraDivisor: "8", produtorAjusteMaxPct: "10", retencaoDias: "365", termoVersao: atual.termoVersao, termoTexto: atual.termoTexto };
    expect(diferencaDaConfiguracao(base, atual)).toEqual({ corpo: {}, erro: null });
    expect(diferencaDaConfiguracao({ ...base, termoTexto: `${atual.termoTexto} Mais uma linha.` }, atual).erro).toMatch(/versão nova/);
    expect(diferencaDaConfiguracao({ ...base, termoTexto: `${atual.termoTexto} Mais uma linha.`, termoVersao: "v2" }, atual).corpo).toMatchObject({ termoVersao: "v2" });
    expect(diferencaDaConfiguracao({ ...base, produtorAjusteMaxPct: "12,5" }, atual).corpo).toEqual({ produtorAjusteMaxPct: 12.5 });
    expect(diferencaDaConfiguracao({ ...base, retencaoDias: "10" }, atual).erro).toMatch(/Guarda das selfies/);
  });
});

function Checkout({ p, hoje = HOJE }: { p: PrestacaoDaPresenca; hoje?: string }) {
  const acoes = useAcoesDaPresenca("e1");
  return <DialogoCheckoutFinal alvo={{ prestacao: p, nome: "Ana Paula Souza" }} hoje={hoje} checkoutFinal={acoes.checkoutFinal} onClose={() => {}} />;
}

describe("check-out final", () => {
  const producao = usuarioFake({ role: "production" });

  it("dia sem registro e dia que ainda vem travam o envio, com a explicação", () => {
    mockarFetch(() => respostaJson({}));
    renderComTudo(<Checkout p={prestacao({ diasPendentes: ["2026-11-01", "2026-11-05"] })} />, { user: producao });
    const alerta = screen.getByTestId("prs-checkout-pendentes");
    expect(alerta).toHaveTextContent("Sem registro em 01/11");
    expect(alerta).toHaveTextContent("Ainda faltam 05/11");
    expect(screen.getByTestId("prs-enviar-checkout")).toBeDisabled();
  });

  it("fora do limite da produção: mostra o intervalo em R$ e não envia", async () => {
    mockarFetch(() => respostaJson({}));
    const { user } = renderComTudo(<Checkout p={prestacao({ confirmacao })} />, { user: producao });
    const campo = screen.getByLabelText("Valor final em reais");
    await user.clear(campo);
    await user.type(campo, "1200");
    await user.tab();
    expect(screen.getByTestId("prs-fora-do-limite")).toHaveTextContent("entre R$ 900,00 e R$ 1.100,00");
    expect(screen.getByTestId("prs-enviar-checkout")).toBeDisabled();
  });

  it("sem confirmação pede a justificativa e manda o corpo certo; 409 do servidor vira explicação", async () => {
    const chamadas: { url: string; corpo: unknown }[] = [];
    let vez = 0;
    mockarFetch((url, init) => {
      if (url.includes("/checkout-final")) {
        chamadas.push({ url, corpo: JSON.parse(String(init?.body)) });
        vez++;
        if (vez === 1) return respostaJson({ message: "x", codigo: "fora_do_limite", minimo: 95000, maximo: 105000 }, 409, url);
        return respostaJson(prestacao({ checkoutFinal: { ...prestacao().checkoutFinal, feito: true, podeFazer: false } }), 200, url);
      }
      return respostaJson({});
    });
    const { user } = renderComTudo(<Checkout p={prestacao()} />, { user: producao });
    await user.click(screen.getByTestId("prs-enviar-checkout"));
    expect(await screen.findByText(/pelo menos 5 caracteres/)).toBeInTheDocument();
    expect(chamadas).toHaveLength(0);
    await user.type(screen.getByTestId("prs-ck-justificativa"), "Sem celular no evento.");
    await user.click(screen.getByTestId("prs-enviar-checkout"));
    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(await screen.findByTestId("prs-checkout-erro")).toHaveTextContent("entre R$ 950,00 e R$ 1.050,00");
    expect(chamadas[0]).toEqual({ url: "/api/presenca/a1/checkout-final", corpo: { valorFinal: 100000, cnpj: null, razaoSocial: null, justificativa: "Sem celular no evento." } });
  });

  it("DP: sem limite de ajuste", () => {
    mockarFetch(() => respostaJson({}));
    renderComTudo(<Checkout p={prestacao({ limiteDoAjuste: null, confirmacao })} />, { user: usuarioFake({ role: "financial" }) });
    expect(screen.getByText("DP: sem limite de ajuste")).toBeInTheDocument();
  });
});

describe("código de acesso", () => {
  it("gera, mostra o código em dois grupos e o texto do WhatsApp", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ codigo: "482913", validoAte: "2026-11-05T17:00:00.000Z", colaborador: { id: "c1", nome: "Ana", cpf: "•••.456.789-••" }, jaTemSenha: false }, 201, url));
    const { user } = renderComTudo(<DialogoCodigoDeAcesso alvo={{ collaboratorId: "c1", nome: "Ana Paula Souza" }} onClose={() => {}} />, { user: usuarioFake({ role: "production" }) });
    expect(screen.queryByTestId("prs-codigo-gerado")).toBeNull();
    await user.click(screen.getByTestId("prs-gerar-codigo"));
    expect(await screen.findByTestId("prs-codigo-gerado")).toHaveTextContent("482 913");
    expect(screen.getByTestId("prs-codigo-mensagem")).toHaveTextContent("é 482913, vale até 05/11 14:00");
    expect(urlsChamadas(fetchMock)).toContain("/api/colaboradores/c1/codigo-de-acesso");
  });
});

function resposta(prestacoes: PrestacaoDaPresenca[]): RespostaDaPresenca {
  return {
    evento: { id: "e1", nome: "Meia de Floripa", cidade: "Florianópolis", inicio: "2026-11-01", fim: "2026-11-05", ocultarValoresColaborador: true },
    hoje: HOJE,
    configuracao: { selfieObrigatoria: true, localizacao: "registrar", horaExtraDivisor: 8, produtorAjusteMaxPct: 10, provisorio: true },
    permissoes: { verFotos: true, representante: true, corrigir: true, checkoutFinal: true, gerarCodigo: true, ajusteSemLimite: false },
    naArenaAgora: [{ actualId: "a2", colaborador: "BRUNO LIMA", funcao: "Fotografia", desde: "08:05" }],
    prestacoes,
  };
}

describe("página Presença no evento", () => {
  it("na arena, fila que recorta e o check-out de quem está pronto", async () => {
    const pronta = prestacao({ confirmacao });
    const naArena = prestacao({ actualId: "a2", colaborador: { id: "c2", nome: "BRUNO LIMA", numero: 8, tipo: "freela" }, dias: [dia(HOJE, "em_andamento", "08:05")], podeConfirmar: false });
    mockarFetch((url) => {
      if (url.startsWith("/api/events")) return respostaJson([eventoFake({ id: "e1", name: "Meia de Floripa", startDate: "2026-11-01", endDate: "2026-11-05" })], 200, url);
      if (url.startsWith("/api/presenca/eventos/e1")) return respostaJson(resposta([pronta, naArena]), 200, url);
      return respostaJson({}, 200, url);
    });
    const { user } = renderComTudo(<PresencaNoEventoPage />, { user: usuarioFake({ role: "production" }), rota: "/presenca?event=e1", queryClient: criarQueryClientComApi() });
    const arena = await screen.findByTestId("prs-na-arena");
    expect(arena).toHaveTextContent("Na arena agora (1)");
    expect(within(arena).getByText("Bruno Lima")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await user.click(screen.getByTestId("prs-fila-pronto"));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByTestId("prs-checkout-a1")).toBeInTheDocument();
  });

  it("evento legado: explica o fluxo antigo e nem pergunta a presença", async () => {
    const fetchMock = mockarFetch((url) => {
      if (url.startsWith("/api/events")) return respostaJson([eventoFake({ id: "e9", name: "Maratona Velha", startDate: "2026-09-01", endDate: "2026-09-03" })], 200, url);
      return respostaJson({}, 200, url);
    });
    renderComTudo(<PresencaNoEventoPage />, { user: usuarioFake({ role: "production" }), rota: "/presenca?event=e9", queryClient: criarQueryClientComApi() });
    expect(await screen.findByTestId("prs-legado")).toHaveTextContent("Evento do fluxo antigo");
    await waitFor(() => expect(urlsChamadas(fetchMock).some((u) => u.includes("/api/presenca/eventos"))).toBe(false));
  });
});

describe("menu e permissão", () => {
  it("Presença no evento: admin, DP, produção e Área de Função; perfil Honorários e Compras não", () => {
    for (const role of ["admin", "financial", "production", "function_area"]) expect(hasPermission(usuarioFake({ role }), "canAccessPresenca")).toBe(true);
    for (const role of ["honorarios", "purchasing"]) expect(hasPermission(usuarioFake({ role }), "canAccessPresenca")).toBe(false);
    const daProducao = visibleGroups(usuarioFake({ role: "production" })).find((g) => g.group.title === "Honorários");
    expect(daProducao?.items.map((i) => i.label)).toEqual(["Presença no evento"]);
  });
});

describe("28/10 (Fase 2): a nota fiscal na presença", () => {
  it("o selo da nota, a foto apagada pela guarda e 'Enviar nota fiscal' como representante (multipart, presa à OC)", async () => {
    const expurgada = { comSelfie: false, fotoExpurgada: true, fotoId: null, fotoUrl: null };
    const comOc = prestacao({
      confirmacao, checkoutFinal: { ...prestacao().checkoutFinal, feito: true, podeFazer: false, valorFinal: 100000, valorCalculado: 100000 },
      cnpj: { informado: "11.222.333/0001-81", razaoSocial: "ANA MEI", origem: "confirmacao", situacao: "contrato_ativo", rotulo: "Contrato ativo", contratoId: "k1" },
      dias: [{ ...dia("2026-11-01", "concluido"), entrada: marca("07:30", expurgada), saida: marca("18:00", expurgada) }],
      notaFiscal: { estado: "com_oc", rotulo: "OC emitida", oc: { numero: "4500123456", valor: 100000, data: "2026-11-02" }, nota: null, pagoEm: null, podeEnviar: true },
    });
    const fetchMock = mockarFetch((url, init) => {
      if (url.startsWith("/api/events")) return respostaJson([eventoFake({ id: "e1", name: "Meia de Floripa", startDate: "2026-11-01", endDate: "2026-11-05" })], 200, url);
      if (url.startsWith("/api/presenca/eventos/e1")) return respostaJson({
        evento: { id: "e1", nome: "Meia de Floripa", cidade: null, inicio: "2026-11-01", fim: "2026-11-05", ocultarValoresColaborador: false }, hoje: HOJE,
        configuracao: { selfieObrigatoria: true, localizacao: "registrar", horaExtraDivisor: 8, produtorAjusteMaxPct: 10, provisorio: true },
        permissoes: { verFotos: true, representante: true, corrigir: true, checkoutFinal: true, gerarCodigo: true, ajusteSemLimite: false },
        naArenaAgora: [], prestacoes: [comOc],
      }, 200, url);
      if (url === "/api/ordens-de-compra/a1/nota-fiscal" && init?.method === "POST") return respostaJson({ linha: {} }, 201, url);
      return respostaJson({}, 200, url);
    });
    const { user } = renderComTudo(<PresencaNoEventoPage />, { user: usuarioFake({ role: "production" }), rota: "/presenca?event=e1", queryClient: criarQueryClientComApi() });
    const cartao = await screen.findByTestId("prs-pessoa-a1");
    expect(within(cartao).getByText("OC emitida")).toBeInTheDocument();
    await user.click(within(cartao).getByTestId("prs-detalhar-a1"));
    expect(within(cartao).getByTestId("prs-expurgadas-a1")).toHaveTextContent("2 fotos apagadas pela política de guarda");
    await user.click(within(cartao).getByTestId("prs-enviar-nota-a1"));
    const dialogo = await screen.findByTestId("oc-dialogo-nota");
    expect(within(dialogo).getByTestId("oc-nota-o-que-consta")).toHaveTextContent("4500123456");
    await user.click(within(dialogo).getByTestId("oc-nota-enviar"));
    expect(within(dialogo).getByText("Anexe a nota fiscal.")).toBeInTheDocument();
    await user.upload(within(dialogo).getByTestId("oc-nota-arquivo"), new File(["%PDF-1.4"], "nf.pdf", { type: "application/pdf" }));
    await user.click(within(dialogo).getByTestId("oc-nota-enviar"));
    await waitFor(() => expect(urlsChamadas(fetchMock)).toContain("/api/ordens-de-compra/a1/nota-fiscal"));
    const corpo = fetchMock.mock.calls.find(([u]) => u === "/api/ordens-de-compra/a1/nota-fiscal")![1]!.body as FormData;
    expect(corpo.get("valorNota")).toBe("100000");
    expect(corpo.get("cnpjNota")).toBe("11222333000181");
    expect((corpo.get("arquivo") as File).name).toBe("nf.pdf");
  });
});
