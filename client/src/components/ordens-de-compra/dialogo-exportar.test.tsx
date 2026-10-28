/**
 * Exportar (Ordens de compra, 28/10 — Fase 3, arquivos): o arquivo de OC do
 * M4 (prestadores + lotes Flash, por evento ou período, layout provisório) e
 * a planilha antiga das aprovadas sem OC continuando igual.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake } from "@/test/fixtures";
import { DialogoExportar } from "./dialogo-exportar";
import type { PreviaDoArquivoDeOc } from "./use-ordens-de-compra";

const HOJE = "2026-10-28";

const previa = (p: Partial<PreviaDoArquivoDeOc> = {}): PreviaDoArquivoDeOc => ({
  escopo: { tipo: "evento", eventId: "e1", nome: "Corrida Noturna do Recife" },
  prestadores: { linhas: 14, valorCents: 1_250_000, semCnpj: 2, eventos: 1 },
  flash: { lotes: [{ id: "L3", numero: 3, totalCents: 57_000, status: "gerado" }], valorCents: 57_000 },
  totalCents: 1_307_000, linhas: 15, legadosIgnorados: 0,
  formato: { id: "oc-m4-provisorio-v1", nome: "OC de prestadores + Flash (M4)", provisorio: true, colunas: [], cnpjDaFlashConfigurado: false },
  ...p,
});

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());

const arquivo = (nome: string) => new Response("x", { status: 200, headers: { "Content-Disposition": `attachment; filename="${nome}"` } });

function montar(props: Partial<Parameters<typeof DialogoExportar>[0]> = {}, rotear?: (url: string) => Response | undefined) {
  const onClose = vi.fn();
  const fetchMock = mockarFetch((url) => {
    const r = rotear?.(url);
    if (r) return r;
    if (url.startsWith("/api/ordens-de-compra/arquivo-m4/previa?eventId=e1")) return respostaJson(previa(), 200, url);
    if (url.startsWith("/api/ordens-de-compra/arquivo-m4/previa?inicio=")) return respostaJson(previa({ escopo: { tipo: "periodo", inicio: "2026-10-01", fim: HOJE }, prestadores: { linhas: 40, valorCents: 3_000_000, semCnpj: 0, eventos: 3 }, legadosIgnorados: 1 }), 200, url);
    if (url.startsWith("/api/ordens-de-compra/arquivo-m4?")) return arquivo("oc-m4-evento-12-layout-provisorio.xlsx");
    if (url.startsWith("/api/ordens-de-compra/exportar?")) return arquivo("prestacoes-sem-oc-12.xlsx");
    return respostaJson({}, 200, url);
  });
  const r = renderComTudo(<DialogoExportar aberto eventId="e1" nomeDoEvento="Corrida Noturna do Recife" semOc={14} hoje={HOJE} onClose={onClose} {...props} />, { user: usuarioFake({ role: "financial" }) });
  return { ...r, fetchMock, onClose };
}

describe("Exportar: arquivo de OC do M4", () => {
  it("abre no arquivo do M4 pelo evento: prestadores + lote Flash, total e os avisos; baixa e audita no servidor", async () => {
    const { user, fetchMock, onClose } = montar();
    const resumo = await screen.findByTestId("oc-arquivo-previa");
    expect(resumo).toHaveTextContent("14 prestações sem OC");
    expect(resumo).toHaveTextContent("1 lote Flash (nº 3)");
    expect(within(resumo).getByTestId("oc-arquivo-total")).toHaveTextContent("R$ 13.070,00");
    expect(resumo).toHaveTextContent("2 prestações saem sem CNPJ emissor");
    expect(resumo).toHaveTextContent("CNPJ da Flash entra com o layout oficial");
    expect(screen.getByTestId("oc-aviso-layout")).toHaveTextContent("formato provisório");
    await user.click(screen.getByTestId("oc-baixar"));
    await waitFor(() => expect(urlsChamadas(fetchMock)).toContain("/api/ordens-de-compra/arquivo-m4?eventId=e1&formato=xlsx"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("por período: consulta com as datas e avisa os eventos do fluxo antigo; período invertido trava", async () => {
    const { user, fetchMock } = montar();
    await user.click(await screen.findByTestId("oc-escopo-periodo"));
    expect(await screen.findByText(/40 prestações sem OC · 3 eventos/)).toBeInTheDocument();
    expect(urlsChamadas(fetchMock)).toContain(`/api/ordens-de-compra/arquivo-m4/previa?inicio=2026-10-01&fim=${HOJE}`);
    expect(screen.getByTestId("oc-arquivo-previa")).toHaveTextContent("1 evento do fluxo antigo ficou de fora");
    const inicio = screen.getByTestId("oc-arquivo-inicio");
    await user.clear(inicio);
    await user.type(inicio, "2026-11-30");
    expect(await screen.findByText("O início do período tem que ser antes do fim.")).toBeInTheDocument();
    expect(screen.getByTestId("oc-baixar")).toBeDisabled();
  });

  it("sem evento na tela: só o período e a planilha de conferência indisponível", async () => {
    montar({ eventId: "", nomeDoEvento: null, semOc: 0 });
    expect(await screen.findByTestId("oc-escopo-periodo")).toBeChecked();
    expect(screen.getByTestId("oc-escopo-evento")).toBeDisabled();
    expect(screen.getByTestId("oc-arquivo-sem_oc")).toBeDisabled();
  });
});

describe("Exportar: a planilha das aprovadas sem OC continua", () => {
  it("escolher a conferência mostra o aviso do CPF e baixa o /exportar em CSV", async () => {
    const { user, fetchMock } = montar();
    await user.click(await screen.findByTestId("oc-arquivo-sem_oc"));
    expect(screen.getByTestId("oc-aviso-cpf")).toHaveTextContent("CPF completo");
    await user.click(screen.getByTestId("oc-formato-csv"));
    await user.click(screen.getByTestId("oc-baixar"));
    await waitFor(() => expect(urlsChamadas(fetchMock)).toContain("/api/ordens-de-compra/exportar?eventId=e1&formato=csv"));
  });
});
