/**
 * Honorários, Fase 2 manual (28/10) — as telas internas: Ordens de compra
 * (fila, registrar OC com e sem justificativa, lote com erro, marcar pago em
 * lote), a conferência em Notas fiscais, o estado da nota na Presença e o
 * expurgo das selfies na Tabela de valores.
 */
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { eventoFake, notaFiscalFake } from "@/test/fixtures-dominio";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { conferirNotaComOc } from "@shared/honorarios-pagamento";
import OrdensDeCompraPage from "@/pages/ordens-de-compra";
import { contarOcs, filtrarOcs, proximoPasso } from "./oc-utils";
import { resultadoDaConferencia } from "./conferencia-da-nota";
import type { LinhaDaOc, RespostaDasOcs } from "./tipos";
import { AprovacaoRow } from "@/components/invoices/aprovacao-row";
import { getStatusCfg } from "@/components/invoices/invoice-status";
import { ExpurgoSelfiesCard, fraseDaPrevia, type SituacaoDoExpurgo } from "@/components/settings/expurgo-selfies-card";
import { hasPermission } from "@/lib/role-utils";
import { visibleGroups } from "@/components/layout/nav-items";

const HOJE = "2026-11-03";

function linha(p: Partial<LinhaDaOc> & { actualId: string }): LinhaDaOc {
  return {
    eventId: "e1",
    colaborador: { id: `c-${p.actualId}`, nome: "ANA SOUZA", numero: 12 },
    funcao: { id: "f1", nome: "Produtor", centroDeCusto: "1007" },
    valorAprovado: 97500,
    rhActionAt: null,
    emiteNf: true,
    cnpjEmissor: { cnpj: "70.000.002/0001-66", razaoSocial: "ANA PRODUCOES LTDA", origem: "checkout_final", situacao: "contrato_ativo", rotulo: "Contrato ativo", contratoId: "k1" },
    oc: null, nota: null, conferencia: null, programadoPara: null, pagamento: null,
    estado: "sem_oc", rotuloDoEstado: "Sem OC",
    acoes: { registrarOc: true, exigeJustificativa: false, desfazerOc: false, marcarPago: false, desfazerPago: false, motivoSemOc: null },
    ...p,
  };
}

const oc = (numero: string, valor = 97500) => ({ numero, valor, data: "2026-11-02", registradaEm: null, registradaPor: null, origem: "manual", justificativa: null });
const nota = (status: string, valor: number, extra: Partial<NonNullable<LinhaDaOc["nota"]>> = {}) => ({
  id: `n-${status}`, status, oc: "45", numero: "2026", valor, cnpj: "70.000.002/0001-66", arquivoNome: "nf.pdf", arquivoUrl: "/api/attachments/ATT-1/view",
  comentarioDoDp: null, enviadaEm: "2026-11-02T12:00:00.000Z", paymentDate: null, lancadaNoM4Em: null, ...extra,
});

const semOc = linha({ actualId: "a1", colaborador: { id: "c1", nome: "MURILO CUNHA", numero: 3 } });
const semContrato = linha({
  actualId: "a2", colaborador: { id: "c2", nome: "EDUARDO MENDES", numero: 23 },
  cnpjEmissor: { cnpj: null, razaoSocial: null, origem: null, situacao: "sem_cnpj", rotulo: "CNPJ não informado", contratoId: null },
  acoes: { registrarOc: true, exigeJustificativa: true, desfazerOc: false, marcarPago: false, desfazerPago: false, motivoSemOc: null },
});
const divergente = linha({
  actualId: "a3", colaborador: { id: "c3", nome: "RAQUEL OLIVEIRA", numero: 4 }, oc: oc("45", 70500), estado: "nf_enviada", rotuloDoEstado: "NF enviada",
  nota: nota("enviada", 65500),
  conferencia: conferirNotaComOc({ ocNumero: "45", ocValor: 70500, cnpjEmissor: "70000002000166" }, { oc: "45", nfValor: 65500, nfCnpj: "70000002000166" }),
  acoes: { registrarOc: false, exigeJustificativa: false, desfazerOc: false, marcarPago: false, desfazerPago: false, motivoSemOc: "já tem OC" },
});
const programado = linha({
  actualId: "a4", colaborador: { id: "c4", nome: "RODRIGO COSTA", numero: 5 }, oc: oc("46", 70500), estado: "programado", rotuloDoEstado: "Programado",
  nota: nota("aprovada", 70500, { lancadaNoM4Em: "2026-11-02T13:00:00.000Z", paymentDate: "2026-11-05" }), programadoPara: "2026-11-05",
  acoes: { registrarOc: false, exigeJustificativa: false, desfazerOc: false, marcarPago: true, desfazerPago: false, motivoSemOc: "já tem OC" },
});
const recusada = linha({ actualId: "a5", colaborador: { id: "c5", nome: "FERNANDA PINTO", numero: 24 }, oc: oc("47"), estado: "nf_recusada", rotuloDoEstado: "NF recusada", nota: nota("recusada", 97500),
  acoes: { registrarOc: false, exigeJustificativa: false, desfazerOc: false, marcarPago: false, desfazerPago: false, motivoSemOc: "já tem OC" } });
const isento = linha({ actualId: "a6", colaborador: { id: "c6", nome: "ALICE ISENTA", numero: 30 }, emiteNf: false, rotuloDoEstado: "Não emite NF",
  acoes: { registrarOc: false, exigeJustificativa: false, desfazerOc: false, marcarPago: false, desfazerPago: false, motivoSemOc: "Não emite NF" } });

const TODAS = [semOc, semContrato, divergente, programado, recusada, isento];

function resposta(linhas: LinhaDaOc[]): RespostaDasOcs {
  return {
    evento: { id: "e1", nome: "Corrida Noturna do Recife", cidade: "Recife", inicio: "2026-11-01", fim: "2026-11-02", empresaPagadora: { nome: "Norte Eventos Ltda", cnpj: "12.345.601/0001-15" } },
    hoje: HOJE, linhas,
    contadores: { sem_oc: 2, com_oc: 0, nf_enviada: 1, nf_devolvida: 0, nf_recusada: 1, nf_aprovada: 0, programado: 1, pago: 0, naoEmiteNf: 1, exigemJustificativa: 1, total: 6 },
  };
}

function montarPagina(rotear?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetchMock = mockarFetch((url, init) => {
    const r = rotear?.(url, init);
    if (r) return r;
    if (url.startsWith("/api/events")) return respostaJson([eventoFake({ id: "e1", name: "Corrida Noturna do Recife", startDate: "2026-11-01", endDate: "2026-11-02" })], 200, url);
    if (url.startsWith("/api/ordens-de-compra?eventId=e1")) return respostaJson(resposta(TODAS), 200, url);
    return respostaJson({}, 200, url);
  });
  const r = renderComTudo(<OrdensDeCompraPage />, { user: usuarioFake({ role: "financial" }), rota: "/ordens-de-compra?event=e1", queryClient: criarQueryClientComApi() });
  return { ...r, fetchMock };
}

const corpoDa = (fetchMock: ReturnType<typeof mockarFetch>, url: string) => {
  const chamada = fetchMock.mock.calls.find(([u, init]) => String(u) === url && (init as RequestInit | undefined)?.method === "POST");
  return chamada ? JSON.parse(String((chamada[1] as RequestInit).body)) : undefined;
};

describe("regras de tela das Ordens de compra", () => {
  it("a fila conta por estado (a recusada entra em Devolvida; o isento fica fora) e a busca acha por OC, CNPJ e nome", () => {
    const c = contarOcs(TODAS);
    expect(c.porFiltro).toMatchObject({ sem_oc: 2, nf_enviada: 1, nf_devolvida: 1, programado: 1, pago: 0 });
    expect(c.naoEmiteNf).toBe(1);
    expect(c.semOcExigemJustificativa).toBe(1);
    expect(c.divergentes).toBe(1);
    expect(filtrarOcs(TODAS, "", "nf_devolvida").map((l) => l.actualId)).toEqual(["a5"]);
    expect(filtrarOcs(TODAS, "46", null).map((l) => l.actualId)).toEqual(["a4"]);
    expect(filtrarOcs(TODAS, "70000002", null)).toHaveLength(5);
    expect(filtrarOcs(TODAS, "raquel", null).map((l) => l.actualId)).toEqual(["a3"]);
    // Ordem de nome; quem não emite NF vai para o fim.
    expect(filtrarOcs(TODAS, "", null).at(-1)?.actualId).toBe("a6");
  });

  it("o próximo passo e o resultado da conferência", () => {
    expect(proximoPasso(semContrato)).toMatch(/justificativa/);
    expect(proximoPasso(programado)).toContain("05/11/2026");
    expect(resultadoDaConferencia(divergente.conferencia)).toBe("divergente");
    expect(resultadoDaConferencia(conferirNotaComOc({ ocNumero: "1", ocValor: 10, cnpjEmissor: "70000002000166" }, { oc: "1", nfValor: 10, nfCnpj: "70000002000166" }))).toBe("confere");
    expect(resultadoDaConferencia(conferirNotaComOc({ ocNumero: "1", ocValor: 10, cnpjEmissor: "70000002000166" }, { oc: "1", nfValor: null, nfCnpj: null }))).toBe("incompleta");
  });

  it("permissão: só admin e DP (a do financeiro); o menu põe Ordens de compra entre a Conferência DP e as Notas fiscais", () => {
    for (const role of ["admin", "financial"]) expect(hasPermission(usuarioFake({ role }), "canAccessFinanceiro")).toBe(true);
    for (const role of ["production", "function_area", "purchasing", "honorarios"]) expect(hasPermission(usuarioFake({ role }), "canAccessFinanceiro")).toBe(false);
    const doDp = visibleGroups(usuarioFake({ role: "financial" })).find((g) => g.group.title === "Honorários")!.items.map((i) => i.label);
    expect(doDp.indexOf("Ordens de compra")).toBe(doDp.indexOf("Conferência DP") + 1);
    expect(doDp.indexOf("Notas fiscais")).toBe(doDp.indexOf("Ordens de compra") + 1);
    const daProducao = visibleGroups(usuarioFake({ role: "production" })).flatMap((g) => g.items.map((i) => i.id));
    expect(daProducao).not.toContain("ordens-de-compra");
  });
});

describe("página Ordens de compra", () => {
  it("lista com a fila, o destaque da divergência e a fila que recorta", async () => {
    const { user } = montarPagina();
    expect(await screen.findByTestId("oc-linha-a3")).toHaveClass("oc-linha-divergente");
    expect(screen.getByTestId("oc-divergencia-a3")).toHaveTextContent("abaixo do valor da OC");
    expect(screen.getByTestId("oc-aviso-divergentes")).toHaveTextContent("1 nota diverge da OC");
    expect(within(screen.getByTestId("oc-fila-sem_oc")).getByText("2")).toBeInTheDocument();
    await user.click(screen.getByTestId("oc-fila-programado"));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByTestId("oc-pagar-a4")).toBeInTheDocument();
  });

  it("registrar OC: valida o número, manda valor e data; sem contrato ativo exige a justificativa", async () => {
    const { user, fetchMock } = montarPagina((url, init) =>
      url === "/api/ordens-de-compra" && init?.method === "POST" ? respostaJson({ linha: { ...semOc, oc: oc("4500123456", 97500), estado: "com_oc", rotuloDoEstado: "OC emitida" } }, 201, url) : undefined);
    await user.click(await screen.findByTestId("oc-registrar-a1"));
    const dialogo = await screen.findByTestId("oc-dialogo-registrar");
    expect(within(dialogo).queryByTestId("oc-bloco-justificativa")).toBeNull();
    await user.click(within(dialogo).getByTestId("oc-salvar"));
    expect(within(dialogo).getByText("Informe o número da OC.")).toBeInTheDocument();
    await user.type(within(dialogo).getByTestId("oc-numero"), "4500123456");
    await user.click(within(dialogo).getByTestId("oc-salvar"));
    await waitFor(() => expect(corpoDa(fetchMock, "/api/ordens-de-compra")).toEqual({ actualId: "a1", numero: "4500123456", valor: 97500, data: HOJE, justificativa: null }));
    await waitFor(() => expect(screen.queryByTestId("oc-dialogo-registrar")).toBeNull());

    await user.click(screen.getByTestId("oc-registrar-a2"));
    const outro = await screen.findByTestId("oc-dialogo-registrar");
    expect(within(outro).getByTestId("oc-bloco-justificativa")).toHaveTextContent("cnpj não informado");
    await user.type(within(outro).getByTestId("oc-numero"), "4500123457");
    await user.click(within(outro).getByTestId("oc-salvar"));
    expect(within(outro).getByText(/Escreva a justificativa/)).toBeInTheDocument();
  });

  it("lote: a prévia mostra a linha com erro; confirmar manda o MESMO texto e o servidor relê", async () => {
    const texto = "#3 ; 4500130001\nFulano ; 4500130003";
    const { user, fetchMock } = montarPagina((url, init) => {
      if (url === "/api/ordens-de-compra/lote/previa" && init?.method === "POST") return respostaJson({
        comCabecalho: false, resumo: { ok: 1, erro: 1, ignorada: 0, exigemJustificativa: 0 },
        linhas: [
          { linha: 1, referencia: "#3", actualId: "a1", colaborador: "MURILO CUNHA", numero: "4500130001", valor: 97500, data: HOJE, situacao: "ok", erros: [], avisos: [], exigeJustificativa: false },
          { linha: 2, referencia: "Fulano", actualId: null, colaborador: null, numero: "4500130003", valor: null, data: HOJE, situacao: "erro", erros: ["Colaborador não encontrado entre as prestações deste evento."], avisos: [], exigeJustificativa: false },
        ],
      }, 200, url);
      if (url === "/api/ordens-de-compra/lote" && init?.method === "POST") return respostaJson({ registradas: 1, ignoradas: 0, recusadas: [{ linha: 2, referencia: "Fulano", motivos: ["Colaborador não encontrado entre as prestações deste evento."] }], linhas: [] }, 200, url);
      return undefined;
    });
    await user.click(await screen.findByTestId("oc-abrir-lote"));
    await user.type(screen.getByTestId("oc-lote-texto"), texto.replace(/\n/g, "{Enter}"));
    await user.click(screen.getByTestId("oc-lote-ver-previa"));
    // Abre no recorte "Com erro" quando há erro.
    expect(await screen.findByTestId("oc-lote-linha-2")).toHaveTextContent("Colaborador não encontrado");
    expect(screen.queryByTestId("oc-lote-linha-1")).toBeNull();
    expect(screen.getByTestId("oc-lote-confirmar")).toHaveTextContent("Registrar 1 OC");
    await user.click(screen.getByTestId("oc-lote-confirmar"));
    expect(await screen.findByTestId("oc-lote-resultado")).toHaveTextContent("Linha 2");
    expect(corpoDa(fetchMock, "/api/ordens-de-compra/lote")).toEqual({ eventId: "e1", texto, justificativa: null });
  });

  it("marcar como pago em lote: seleciona os programados, data de hoje, POST com os ids", async () => {
    const { user, fetchMock } = montarPagina((url, init) =>
      url === "/api/pagamentos/marcar-pago" && init?.method === "POST" ? respostaJson({ pagas: 1, recusadas: [], linhas: [] }, 200, url) : undefined);
    await user.click(await screen.findByTestId("oc-selecionar-a4"));
    expect(screen.getByTestId("oc-barra-selecao")).toHaveTextContent("1 programada selecionada");
    await user.click(screen.getByTestId("oc-marcar-selecionadas"));
    const dialogo = await screen.findByTestId("oc-dialogo-pago");
    expect(within(dialogo).getByTestId("oc-pago-em")).toHaveValue(HOJE);
    await user.click(within(dialogo).getByTestId("oc-confirmar-pago"));
    await waitFor(() => expect(corpoDa(fetchMock, "/api/pagamentos/marcar-pago")).toEqual({ actualIds: ["a4"], pagoEm: HOJE, observacao: null, comprovanteId: null }));
  });

  it("evento legado: 'não se aplica' e nem pergunta as OCs", async () => {
    const fetchMock = mockarFetch((url) => {
      if (url.startsWith("/api/events")) return respostaJson([eventoFake({ id: "e9", name: "Maratona Velha", startDate: "2026-09-01", endDate: "2026-09-03" })], 200, url);
      return respostaJson({}, 200, url);
    });
    renderComTudo(<OrdensDeCompraPage />, { user: usuarioFake({ role: "financial" }), rota: "/ordens-de-compra?event=e9", queryClient: criarQueryClientComApi() });
    expect(await screen.findByTestId("oc-legado")).toHaveTextContent("Não se aplica");
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/ordens-de-compra"))).toBe(false);
  });
});

describe("Notas fiscais — Aprovação DP com a conferência e o pago", () => {
  it("selo divergente, a frase da divergência e 'Marcar como pago' só no programado", async () => {
    const inv = notaFiscalFake({ id: "n1", budgetActualId: "a3", status: "enviada", oc: "45" });
    const onMarcarPago = vi.fn();
    const base = { actualId: "a3", legado: false, ocRegistrada: oc("45", 70500), cnpjEmissor: null, valorAprovado: 70500, estado: "nf_enviada" as const, rotuloDoEstado: "NF enviada", programadoPara: null, pagamento: null, podeDesfazerPago: false };
    const { unmount } = renderComTudo(<table><tbody><AprovacaoRow inv={inv} actual={undefined} name="RAQUEL" funcName="Montagem" effSt="enviada" cfg={getStatusCfg("enviada")} activeType={null} isHistOpen={false} historyCount={1} isTarget={false} actualBlocked={false} onOpenAction={vi.fn()} onToggleHistory={vi.fn()}
      conferencia={{ ...base, invoiceId: "n1", conferencia: divergente.conferencia, podeMarcarPago: false }} onMarcarPago={onMarcarPago} /></tbody></table>);
    expect(screen.getByTestId("nf-conferencia-n1")).toHaveAttribute("data-resultado", "divergente");
    expect(screen.getByTestId("nf-divergencia-n1")).toHaveTextContent("R$ 50,00");
    expect(screen.queryByTestId("nf-marcar-pago-n1")).toBeNull();
    unmount();
    const lancada = notaFiscalFake({ id: "n2", budgetActualId: "a4", status: "aprovada", oc: "46", checkinAt: new Date("2026-11-02T13:00:00Z"), paymentDate: "2026-11-05" });
    const { user } = renderComTudo(<table><tbody><AprovacaoRow inv={lancada} actual={undefined} name="RODRIGO" funcName="Montagem" effSt="checkin-realizado" cfg={getStatusCfg("checkin-realizado")} activeType={null} isHistOpen={false} historyCount={3} isTarget={false} actualBlocked={false} onOpenAction={vi.fn()} onToggleHistory={vi.fn()}
      conferencia={{ ...base, invoiceId: "n2", actualId: "a4", conferencia: null, podeMarcarPago: true }} onMarcarPago={onMarcarPago} /></tbody></table>);
    await user.click(screen.getByTestId("nf-marcar-pago-n2"));
    expect(onMarcarPago).toHaveBeenCalledTimes(1);
  });
});

describe("Tabela de valores — expurgo das selfies", () => {
  const situacao = (fotos: number): SituacaoDoExpurgo => ({
    automatico: true, rotinaDiariaAtiva: false, podeMudarAutomatico: false,
    previa: { simulacao: true, retencaoDias: 365, dataLimite: "2025-11-03", presencas: 4, fotos, prestacoes: 2, apagadas: 0, falhas: 0 },
  });

  it("a frase da prévia", () => {
    expect(fraseDaPrevia(situacao(7).previa)).toBe("Sairiam 7 fotos de 2 prestações pagas antes de 03/11/2025.");
    expect(fraseDaPrevia(situacao(0).previa)).toMatch(/^Nenhuma foto a apagar/);
  });

  it("'Apagar agora' só com a palavra digitada; na demo o 409 vira a explicação", async () => {
    mockarFetch((url, init) => {
      if (url === "/api/presenca/expurgo" && init?.method === "POST") return respostaJson({ message: "Na demonstração o expurgo só mostra a prévia (o storage é de mentira).", codigo: "demo" }, 409, url);
      if (url.startsWith("/api/presenca/expurgo")) return respostaJson(situacao(7), 200, url);
      return respostaJson({}, 200, url);
    });
    const { user } = renderComTudo(<ExpurgoSelfiesCard />, { user: usuarioFake({ role: "financial" }), queryClient: criarQueryClientComApi() });
    expect(await screen.findByTestId("cfg-exp-previa")).toHaveTextContent("Sairiam 7 fotos");
    // DP vê o interruptor, mas só o administrador muda.
    expect(screen.getByTestId("cfg-exp-automatico")).toBeDisabled();
    await user.click(screen.getByTestId("cfg-exp-apagar"));
    const botao = await screen.findByTestId("cfg-exp-confirmar-botao");
    expect(botao).toBeDisabled();
    await user.type(screen.getByTestId("cfg-exp-palavra"), "apagar");
    expect(botao).toBeEnabled();
    await user.click(botao);
    expect(await screen.findByTestId("cfg-exp-demo")).toHaveTextContent("Na demonstração o expurgo só mostra a prévia");
  });
});
