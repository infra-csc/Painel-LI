/**
 * Importar o retorno do M4 (Ordens de compra, 28/10): o arquivo é lido no
 * navegador e vira células; a prévia mostra os contadores e o motivo de cada
 * linha; "Aplicar N linhas" manda as mesmas células (e a justificativa, se
 * precisar) e mostra o resultado.
 */
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import type { LinhaPropostaDoRetorno, PreviaDoRetorno } from "@shared/retorno-m4";
import { DialogoRetornoM4 } from "./dialogo-retorno-m4";
import type { ResultadoDoRetorno } from "./use-ordens-de-compra";

const ID = "0b9f2a1e-1111-4c4c-9a9a-000000000001";
const CSV = `﻿Referência;Nº da OC;Situação;Data programada;Data de liquidação;Valor (R$)\r\n${ID};4500123;;;;1.234,56\r\nLote 7;OC-F;Liquidado;;07/11/2026;570,00\r\n${ID}x;45;;;;1,00\r\n`;

const vazio = { oc: null, programarPara: null, notaId: null, pagoEm: null };
function linha(p: Partial<LinhaPropostaDoRetorno> & { linha: number }): LinhaPropostaDoRetorno {
  return {
    referencia: ID, tipo: "prestador", alvoId: ID, quem: "ANA SOUZA", evento: "Corrida Noturna", numeroOc: "4500123", situacao: null,
    dataProgramada: null, dataLiquidacao: null, valorCents: 123_456, acoes: [], resultado: "sem_mudanca", problemas: [], avisos: [],
    frase: "Sem mudança — já estava assim no app.", exigeJustificativa: false, gravar: vazio, ...p,
  };
}

const previa = (p: Partial<PreviaDoRetorno> = {}): PreviaDoRetorno => ({
  erro: null,
  formato: { id: "retorno-m4-provisorio-v1", nome: "Retorno do M4", provisorio: true },
  linhas: [
    linha({ linha: 2, resultado: "aplicar", acoes: ["registrar_oc"], frase: "Registra a OC 4500123.", exigeJustificativa: true, avisos: ["CNPJ emissor sem contrato ativo — a OC entra só com a justificativa."] }),
    linha({ linha: 3, tipo: "flash", quem: "Lote Flash 7", evento: null, referencia: "Lote 7", resultado: "aplicar", acoes: ["marcar_pago"], frase: "Marca o lote pago à Flash em 07/11/2026." }),
    linha({ linha: 4, referencia: `${ID}x`, quem: null, resultado: "problema", problemas: ["Valor do M4 R$ 1,00 difere do aprovado R$ 1.234,56 — a linha fica de fora; confira no M4."] }),
  ],
  resumo: { total: 3, registrarOc: 1, programar: 0, marcarPago: 1, semMudanca: 0, problema: 1, aplicar: 2, exigemJustificativa: 1 },
  ...p,
});

const resultado: ResultadoDoRetorno = {
  aplicadas: 2, ocsRegistradas: 1, programadas: 0, pagas: 0, lotesFlashPagos: 1, semMudanca: 0, comProblema: 1, recusadas: [],
};

function montar(p: PreviaDoRetorno = previa()) {
  const onClose = vi.fn();
  const fetchMock = mockarFetch((url) => {
    if (url === "/api/ordens-de-compra/retorno-m4/previa") return respostaJson(p, 200, url);
    if (url === "/api/ordens-de-compra/retorno-m4") return respostaJson(resultado, 200, url);
    return respostaJson({}, 200, url);
  });
  const r = renderComTudo(<DialogoRetornoM4 aberto onClose={onClose} />, { user: usuarioFake({ role: "financial" }) });
  return { ...r, fetchMock, onClose };
}

const corpoDe = (fetchMock: ReturnType<typeof mockarFetch>, url: string) => {
  const chamada = fetchMock.mock.calls.find(([u]) => u === url);
  return chamada ? JSON.parse(String((chamada[1] as RequestInit).body)) : undefined;
};

describe("Importar retorno do M4", () => {
  it("avisa que o layout é provisório e lista as colunas esperadas", () => {
    montar();
    expect(screen.getByTestId("oc-retorno-aviso-layout")).toHaveTextContent("Layout provisório");
    const colunas = screen.getByTestId("oc-retorno-colunas");
    for (const t of ["Referência", "Nº da OC", "Situação", "Data programada", "Data de liquidação", "Valor (R$)"]) expect(colunas).toHaveTextContent(t);
  });

  it("arquivo → prévia com os contadores, o motivo de cada linha e o filtro; as células vão para a prévia", async () => {
    const { user, fetchMock } = montar();
    await user.upload(screen.getByTestId("oc-retorno-input-arquivo"), new File([CSV], "retorno.csv", { type: "text/csv" }));

    const resumo = await screen.findByTestId("oc-retorno-resumo");
    expect(within(resumo).getByTestId("oc-retorno-filtro-registrar_oc")).toHaveTextContent("Registrar OC · 1");
    expect(within(resumo).getByTestId("oc-retorno-filtro-programar")).toHaveTextContent("Programar · 0");
    expect(within(resumo).getByTestId("oc-retorno-filtro-marcar_pago")).toHaveTextContent("Marcar pago · 1");
    expect(within(resumo).getByTestId("oc-retorno-filtro-sem_mudanca")).toHaveTextContent("Sem mudança · 0");
    expect(within(resumo).getByTestId("oc-retorno-filtro-problema")).toHaveTextContent("Com problema · 1");
    expect(screen.getByTestId("oc-retorno-linha-4")).toHaveTextContent("difere do aprovado");
    expect(screen.getByTestId("oc-retorno-linha-3")).toHaveTextContent("Lote Flash 7");

    // A prévia recebeu as células do CSV (BOM tirado; o valor fica texto).
    const enviado = corpoDe(fetchMock, "/api/ordens-de-compra/retorno-m4/previa");
    expect(enviado.matriz[0][0]).toBe("Referência");
    expect(enviado.matriz[1]).toEqual([ID, "4500123", "", "", "", "1.234,56"]);

    // Filtro "Com problema" recorta a lista.
    await user.click(screen.getByTestId("oc-retorno-filtro-problema"));
    expect(screen.queryByTestId("oc-retorno-linha-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("oc-retorno-linha-4")).toBeInTheDocument();
  });

  it("a justificativa é exigida; aplicar manda as mesmas células e mostra o resultado", async () => {
    const { user, fetchMock } = montar();
    await user.upload(screen.getByTestId("oc-retorno-input-arquivo"), new File([CSV], "retorno.csv", { type: "text/csv" }));
    const aplicarBotao = await screen.findByTestId("oc-retorno-aplicar");
    expect(aplicarBotao).toHaveTextContent("Aplicar 2 linhas");
    await user.click(aplicarBotao);
    expect(await screen.findByText(/Escreva a justificativa/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/ordens-de-compra/retorno-m4")).toBe(false);

    await user.click(screen.getByTestId("oc-retorno-justificativa"));
    await user.paste("Renovação");
    await user.click(aplicarBotao);
    const enviado = corpoDe(fetchMock, "/api/ordens-de-compra/retorno-m4/previa");
    await waitFor(() => expect(corpoDe(fetchMock, "/api/ordens-de-compra/retorno-m4")).toEqual({ matriz: enviado.matriz, justificativa: "Renovação" }));
    const fim = await screen.findByTestId("oc-retorno-resultado");
    expect(fim).toHaveTextContent("1 OC registrada · 1 lote Flash pago");
  });

  it("arquivo sem o cabeçalho: mostra o erro e não oferece aplicar", async () => {
    const { user } = montar(previa({ erro: "Não achei o cabeçalho do retorno do M4: falta a coluna “Nº da OC”.", linhas: [], resumo: { total: 0, registrarOc: 0, programar: 0, marcarPago: 0, semMudanca: 0, problema: 0, aplicar: 0, exigemJustificativa: 0 } }));
    await user.upload(screen.getByTestId("oc-retorno-input-arquivo"), new File(["A;B\n1;2\n"], "x.csv", { type: "text/csv" }));
    expect(await screen.findByTestId("oc-retorno-erro-do-arquivo")).toHaveTextContent("Não achei o cabeçalho");
    expect(screen.queryByTestId("oc-retorno-aplicar")).not.toBeInTheDocument();
  });

  it("tudo já estava assim: \"Nada a aplicar\" e o botão desabilitado", async () => {
    const { user } = montar(previa({
      linhas: [linha({ linha: 2 })],
      resumo: { total: 1, registrarOc: 0, programar: 0, marcarPago: 0, semMudanca: 1, problema: 0, aplicar: 0, exigemJustificativa: 0 },
    }));
    await user.upload(screen.getByTestId("oc-retorno-input-arquivo"), new File([CSV], "retorno.csv", { type: "text/csv" }));
    expect(await screen.findByTestId("oc-retorno-nada-a-aplicar")).toHaveTextContent("tudo já estava assim");
    expect(screen.getByTestId("oc-retorno-aplicar")).toBeDisabled();
  });

  it("tipo de arquivo errado: erro legível sem chamar o servidor", async () => {
    const onClose = vi.fn();
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    const { user } = renderComTudo(<DialogoRetornoM4 aberto onClose={onClose} />, { user: usuarioFake({ role: "financial" }), userEvent: { applyAccept: false } });
    await user.upload(screen.getByTestId("oc-retorno-input-arquivo"), new File(["oi"], "foto.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a planilha do retorno do M4");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
