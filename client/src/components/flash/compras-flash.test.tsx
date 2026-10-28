/**
 * Cartão Flash → Compras (28/10, Honorários — Fase 3, arquivos): a prévia do
 * que está "a comprar" (CPF mascarado, avisos, fora do lote), gerar o lote
 * (manda a assinatura da prévia e baixa o arquivo), 409 "mudou", e os lotes
 * (cancelar com motivo, pago à Flash, divergência, cancelado sem ações).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { AVISOS_DA_COMPRA } from "@shared/flash-compras";
import { ComprasFlash } from "./compras-flash";
import type { ListaDeLotes, LoteFlash, PreviaDaCompraApi } from "./use-compras-flash";

const HOJE = "2026-10-28";
const NOME_LONGO = "MARIA APARECIDA DOS SANTOS FERREIRA DE ALBUQUERQUE CAVALCANTI NETA";

const previa: PreviaDaCompraApi = {
  filtro: { inicio: "2026-10-01", fim: HOJE, eventId: null, incluirManuais: false },
  proximoNumero: 8,
  assinatura: "3-abcd1234",
  totais: { colaboradores: 2, lancamentos: 3, alimentacaoCents: 45000, mobilidadeCents: 12000, totalCents: 57000 },
  foraDoLote: { colaboradores: 1, lancamentos: 1, alimentacaoCents: 2000, mobilidadeCents: 0, totalCents: 2000 },
  formato: { id: "flash-provisorio-v1", nome: "Compra de créditos Flash", provisorio: true },
  linhas: [
    { collaboratorId: "c1", nome: "ANA SEM DOCUMENTO", cpfMascarado: null, ativo: true, alimentacaoCents: 2000, mobilidadeCents: 0, totalCents: 2000, lancamentos: 1, avisos: [AVISOS_DA_COMPRA.sem_cpf], entra: false },
    { collaboratorId: "c2", nome: "BRUNO LIMA", cpfMascarado: "•••.456.789-••", ativo: true, alimentacaoCents: 30000, mobilidadeCents: 12000, totalCents: 42000, lancamentos: 2, avisos: [], entra: true },
    { collaboratorId: "c3", nome: NOME_LONGO, cpfMascarado: "•••.111.222-••", ativo: false, alimentacaoCents: 15000, mobilidadeCents: 0, totalCents: 15000, lancamentos: 1, avisos: [AVISOS_DA_COMPRA.inativo], entra: true },
  ],
};

const lote = (p: Partial<LoteFlash> & { id: string; numero: number }): LoteFlash => ({
  periodoInicio: "2026-10-01", periodoFim: "2026-10-15", evento: null, incluiManuais: false, status: "gerado", rotuloDoStatus: "Gerado — a pagar à Flash",
  formato: "flash-provisorio-v1", colaboradores: 12, lancamentos: 20, totalAlimentacaoCents: 300000, totalMobilidadeCents: 100000, totalCents: 400000,
  geradoPorNome: "Dani do DP", geradoEm: "2026-10-16T13:00:00.000Z", pagoEm: null, cancelamento: null, divergencia: null,
  acoes: { baixar: true, cancelar: true, marcarPago: true }, ...p,
});

const lotes: ListaDeLotes = {
  hoje: HOJE,
  formato: { id: "flash-provisorio-v1", nome: "Compra de créditos Flash", provisorio: true },
  lotes: [
    lote({ id: "L7", numero: 7, divergencia: { totalAtualCents: 410000, lancamentosAtuais: 21 } }),
    lote({ id: "L6", numero: 6, status: "pago", pagoEm: "2026-10-10", acoes: { baixar: true, cancelar: false, marcarPago: false } }),
    lote({ id: "L5", numero: 5, status: "cancelado", cancelamento: { em: "2026-10-05T12:00:00.000Z", porNome: "Dani do DP", motivo: "Valor errado" }, acoes: { baixar: false, cancelar: false, marcarPago: false } }),
  ],
};

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());

function arquivo(nome: string) {
  return new Response("conteudo", { status: 200, headers: { "Content-Disposition": `attachment; filename="${nome}"`, "content-type": "text/csv" } });
}

function montar(rotear?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetchMock = mockarFetch((url, init) => {
    const r = rotear?.(url, init);
    if (r) return r;
    if (url.startsWith("/api/events")) return respostaJson([], 200, url);
    if (url.startsWith("/api/flash/compras/previa")) return respostaJson(previa, 200, url);
    if (url === "/api/flash/compras") return respostaJson(lotes, 200, url);
    return respostaJson({}, 200, url);
  });
  const r = renderComTudo(<ComprasFlash hoje={HOJE} />, { user: usuarioFake({ role: "financial" }), queryClient: criarQueryClientComApi() });
  return { ...r, fetchMock };
}

const corpoDo = (fetchMock: ReturnType<typeof mockarFetch>, url: string) => {
  const c = fetchMock.mock.calls.find(([u, init]) => String(u) === url && (init as RequestInit | undefined)?.method === "POST");
  return c ? JSON.parse(String((c[1] as RequestInit).body)) : undefined;
};

describe("Compras Flash: prévia", () => {
  it("período do mês, CPF só mascarado, avisos, o que fica fora e o botão com o nº do lote", async () => {
    const { fetchMock } = montar();
    expect(await screen.findByTestId("compra-total")).toHaveTextContent("R$ 570,00");
    expect(urlsChamadas(fetchMock).some((u) => u.startsWith("/api/flash/compras/previa?inicio=2026-10-01&fim=2026-10-28"))).toBe(true);
    expect(screen.getByTestId("compra-linha-c2")).toHaveTextContent("CPF •••.456.789-••");
    expect(screen.getByTestId("compra-linha-c1")).toHaveTextContent("sem CPF");
    expect(screen.getByTestId("compra-linha-c1")).toHaveTextContent("fica fora do lote");
    expect(screen.getByTestId("compra-linha-c3")).toHaveTextContent(NOME_LONGO);
    expect(screen.getByTestId("compra-linha-c3")).toHaveTextContent("Colaborador inativo");
    expect(screen.getByTestId("compra-fora-do-lote")).toHaveTextContent("1 colaborador fica fora do lote");
    expect(screen.getByTestId("compra-gerar")).toHaveTextContent("Gerar lote nº 8");
    expect(screen.getAllByTestId("marca-layout-provisorio").length).toBeGreaterThan(0);
  });

  it("\"com aviso\" recorta e a busca acha sem acento; manuais entram na consulta", async () => {
    const { user, fetchMock } = montar();
    await user.click(await screen.findByTestId("compra-so-com-aviso"));
    expect(within(screen.getByTestId("compra-lista")).getAllByRole("listitem")).toHaveLength(2);
    await user.click(screen.getByTestId("compra-so-com-aviso"));
    await user.type(screen.getByTestId("compra-busca"), "bruno");
    expect(within(screen.getByTestId("compra-lista")).getAllByRole("listitem")).toHaveLength(1);
    await user.click(screen.getByTestId("compra-manuais"));
    await waitFor(() => expect(urlsChamadas(fetchMock).some((u) => u.includes("manuais=1"))).toBe(true));
  });

  it("nada a comprar mostra o estado vazio sem botão", async () => {
    montar((url) => (url.startsWith("/api/flash/compras/previa")
      ? respostaJson({ ...previa, linhas: [], totais: { ...previa.totais, colaboradores: 0 }, foraDoLote: { ...previa.foraDoLote, colaboradores: 0 } }, 200, url) : undefined));
    expect(await screen.findByTestId("compra-vazio")).toHaveTextContent("Nada a comprar neste período");
    expect(screen.queryByTestId("compra-gerar")).toBeNull();
  });
});

describe("Compras Flash: gerar o lote", () => {
  it("confirma com o resumo, manda a assinatura e baixa o arquivo do lote no formato escolhido", async () => {
    const novo = lote({ id: "L8", numero: 8, totalCents: 57000, colaboradores: 2 });
    const { user, fetchMock } = montar((url, init) => {
      if (url === "/api/flash/compras" && init?.method === "POST") return respostaJson({ lote: novo }, 201, url);
      if (url.startsWith("/api/flash/compras/L8/arquivo")) return arquivo("compra-flash-lote-8-layout-provisorio.csv");
      return undefined;
    });
    await user.click(await screen.findByTestId("compra-formato-csv"));
    await user.click(screen.getByTestId("compra-gerar"));
    const dialogo = await screen.findByTestId("compra-dialogo-gerar");
    expect(within(dialogo).getByTestId("compra-dialogo-total")).toHaveTextContent("R$ 570,00");
    expect(dialogo).toHaveTextContent("CPF completo");
    await user.click(within(dialogo).getByTestId("compra-confirmar"));
    await waitFor(() => expect(corpoDo(fetchMock, "/api/flash/compras")).toEqual({ inicio: "2026-10-01", fim: HOJE, eventId: null, incluirManuais: false, assinatura: "3-abcd1234" }));
    await waitFor(() => expect(urlsChamadas(fetchMock)).toContain("/api/flash/compras/L8/arquivo?formato=csv"));
    await waitFor(() => expect(screen.queryByTestId("compra-dialogo-gerar")).toBeNull());
  });

  it("409 \"mudou\": mostra o erro, trava o confirmar e oferece ver a prévia de novo", async () => {
    const { user } = montar((url, init) => (url === "/api/flash/compras" && init?.method === "POST"
      ? respostaJson({ message: "Os créditos a comprar mudaram desde a prévia.", codigo: "mudou" }, 409, url) : undefined));
    await user.click(await screen.findByTestId("compra-gerar"));
    await user.click(await screen.findByTestId("compra-confirmar"));
    expect(await screen.findByTestId("compra-dialogo-erro")).toHaveTextContent("mudaram desde a prévia");
    expect(screen.getByTestId("compra-confirmar")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ver a prévia de novo" })).toBeInTheDocument();
  });
});

describe("Compras Flash: lotes gerados", () => {
  it("situação de cada lote: divergência, pago com data, cancelado com motivo e sem ações", async () => {
    montar();
    const l7 = await screen.findByTestId("lote-7");
    expect(within(l7).getByTestId("lote-7-divergencia")).toHaveTextContent("R$ 4.100,00");
    expect(within(l7).getByTestId("lote-cancelar-7")).toBeInTheDocument();
    const l6 = screen.getByTestId("lote-6");
    expect(l6).toHaveTextContent("Pago à Flash em 10/10/2026");
    expect(within(l6).queryByTestId("lote-cancelar-6")).toBeNull();
    const l5 = screen.getByTestId("lote-5");
    expect(within(l5).getByTestId("lote-5-motivo")).toHaveTextContent("Valor errado");
    expect(within(l5).queryByTestId("lote-baixar-5")).toBeNull();
  });

  it("cancelar exige motivo e manda o POST; pago à Flash usa hoje", async () => {
    const { user, fetchMock } = montar((url, init) => {
      if (url === "/api/flash/compras/L7/cancelar" && init?.method === "POST") return respostaJson({ lote: lote({ id: "L7", numero: 7, status: "cancelado" }), creditosDevolvidos: 20 }, 200, url);
      if (url === "/api/flash/compras/L7/pago" && init?.method === "POST") return respostaJson({ lote: lote({ id: "L7", numero: 7, status: "pago" }) }, 200, url);
      return undefined;
    });
    await user.click(await screen.findByTestId("lote-cancelar-7"));
    const dialogo = await screen.findByTestId("lote-dialogo-cancelar");
    await user.click(within(dialogo).getByTestId("lote-confirmar-cancelar"));
    expect(within(dialogo).getByText(/Escreva o motivo/)).toBeInTheDocument();
    expect(corpoDo(fetchMock, "/api/flash/compras/L7/cancelar")).toBeUndefined();
    await user.type(within(dialogo).getByTestId("lote-motivo"), "Arquivo não foi enviado");
    await user.click(within(dialogo).getByTestId("lote-confirmar-cancelar"));
    await waitFor(() => expect(corpoDo(fetchMock, "/api/flash/compras/L7/cancelar")).toEqual({ motivo: "Arquivo não foi enviado" }));
    await waitFor(() => expect(screen.queryByTestId("lote-dialogo-cancelar")).toBeNull());

    await user.click(screen.getByTestId("lote-pagar-7"));
    const pagar = await screen.findByTestId("lote-dialogo-pagar");
    expect(within(pagar).getByTestId("lote-pago-em")).toHaveValue(HOJE);
    await user.click(within(pagar).getByTestId("lote-confirmar-pago"));
    await waitFor(() => expect(corpoDo(fetchMock, "/api/flash/compras/L7/pago")).toEqual({ pagoEm: HOJE }));
  });

  it("o recorte por situação conta e filtra", async () => {
    const { user } = montar();
    expect(await screen.findByTestId("lotes-filtro-cancelado")).toHaveTextContent("1");
    await user.click(screen.getByTestId("lotes-filtro-pago"));
    expect(within(screen.getByTestId("lotes-lista")).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByTestId("lote-6")).toBeInTheDocument();
  });
});
