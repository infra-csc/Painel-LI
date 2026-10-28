/**
 * Formatos declarativos dos arquivos (28/10, Fase 3 — arquivos). Quando o
 * layout OFICIAL chegar e `FORMATO_COMPRA_FLASH`/`FORMATO_OC_M4` forem
 * trocados, os testes "layout provisório" abaixo são os que mudam junto.
 */
import { describe, expect, it } from "vitest";
import {
  FORMATO_COMPRA_FLASH, FORMATO_OC_M4, csvDoArquivo, descricaoDaOcDoLoteFlash, descricaoDaOcDoPrestador, escaparCelula, marcaDoTopo,
  matrizDoArquivo, nomeDoArquivo, reaisNoFormato, textoDaCelula, type FormatoDeArquivo, type LinhaDoArquivoDeOc, type LinhaDoArquivoFlash,
} from "./formatos-de-arquivo";

const flash: LinhaDoArquivoFlash = { cpf: "12345678909", nome: "Ana Souza", alimentacaoCents: 123456, mobilidadeCents: 5000, totalCents: 128456, lote: 7 };

describe("motor do formato", () => {
  it("valor em reais no decimal do formato, sem milhar; nulo vira vazio", () => {
    expect(reaisNoFormato(123456, ",")).toBe("1234,56");
    expect(reaisNoFormato(5, ".")).toBe("0.05");
    expect(reaisNoFormato(null, ",")).toBe("");
  });

  it("escapa separador, aspas e quebra; neutraliza fórmula do Excel", () => {
    expect(escaparCelula("a;b", ";")).toBe("\"a;b\"");
    expect(escaparCelula("a;b", ",")).toBe("a;b");
    expect(escaparCelula("a,b", ",")).toBe("\"a,b\"");
    expect(escaparCelula("diz \"oi\"", ";")).toBe("\"diz \"\"oi\"\"\"");
    expect(escaparCelula("=SOMA(A1)", ";")).toBe("'=SOMA(A1)");
    expect(escaparCelula("-10", ";")).toBe("'-10");
  });

  it("um formato trocado (separador, decimal, data, documento) muda o arquivo sem mudar o motor", () => {
    const oficial: FormatoDeArquivo<LinhaDoArquivoFlash & { dia: string }> = {
      ...(FORMATO_COMPRA_FLASH as unknown as FormatoDeArquivo<LinhaDoArquivoFlash & { dia: string }>),
      id: "flash-oficial", provisorio: false, separador: ",", decimal: ".", formatoDaData: "aaaa-mm-dd", documentos: "mascara", bom: false, quebraDeLinha: "\n",
      colunas: [
        { titulo: "documento", campo: "cpf", tipo: "cpf" },
        { titulo: "valor", campo: "totalCents", tipo: "centavos" },
        { titulo: "data", campo: "dia", tipo: "data" },
      ],
    };
    const csv = csvDoArquivo(oficial, [{ ...flash, dia: "2026-10-28" }], "2026-10-28");
    expect(csv).toBe("documento,valor,data\n123.456.789-09,1284.56,2026-10-28\n");
    expect(nomeDoArquivo(oficial as FormatoDeArquivo<unknown>, "lote-7", "csv")).toBe("compra-flash-lote-7.csv");
  });

  it("data em dd/mm/aaaa e CNPJ com máscara", () => {
    const l = { data: "2026-11-02", cnpj: "70000002000166" } as LinhaDoArquivoDeOc;
    expect(textoDaCelula(FORMATO_OC_M4, { titulo: "", campo: "data", tipo: "data" }, l)).toBe("02/11/2026");
    expect(textoDaCelula(FORMATO_OC_M4, { titulo: "", campo: "cnpj", tipo: "cnpj" }, l)).toBe("70.000.002/0001-66");
  });

  it("XLSX: valor e inteiro como número; documento continua texto (zero à esquerda)", () => {
    const m = matrizDoArquivo(FORMATO_COMPRA_FLASH, [{ ...flash, cpf: "01234567890" }], "2026-10-28");
    const dados = m[m.length - 1];
    expect(dados).toEqual(["01234567890", "Ana Souza", 1234.56, 50, 1284.56, 7]);
  });
});

describe("layout provisório (trocar quando o oficial chegar)", () => {
  it("compra Flash: marca no topo, cabeçalho e colunas na ordem; BOM, ';' e CRLF", () => {
    const csv = csvDoArquivo(FORMATO_COMPRA_FLASH, [flash], "2026-10-28");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const linhas = csv.slice(1).split("\r\n");
    expect(linhas[0]).toMatch(/^LAYOUT PROVISÓRIO/);
    expect(linhas[0]).toContain("gerado em 28/10/2026");
    expect(linhas[1]).toBe("CPF;Nome;Alimentação (R$);Mobilidade (R$);Total (R$);Lote");
    expect(linhas[2]).toBe("12345678909;Ana Souza;1234,56;50,00;1284,56;7");
    expect(linhas[3]).toBe("");
    expect(nomeDoArquivo(FORMATO_COMPRA_FLASH as FormatoDeArquivo<unknown>, "lote-7", "xlsx")).toBe("compra-flash-lote-7-layout-provisorio.xlsx");
  });

  it("OC do M4: colunas, documento com máscara e a marca também no XLSX", () => {
    expect(FORMATO_OC_M4.colunas.map((c) => c.titulo)).toEqual([
      "Tipo", "CNPJ do fornecedor", "Razão social", "Valor (R$)", "Centro de custo", "Evento", "Data", "Função", "Descrição sugerida", "Referência",
    ]);
    const m = matrizDoArquivo(FORMATO_OC_M4, [], "2026-10-28");
    expect(String(m[0][0])).toMatch(/^LAYOUT PROVISÓRIO/);
    expect(m[1][0]).toBe("Tipo");
    expect(marcaDoTopo({ ...FORMATO_OC_M4, provisorio: false } as FormatoDeArquivo<unknown>, "2026-10-28")).toBeNull();
    expect(nomeDoArquivo(FORMATO_OC_M4 as FormatoDeArquivo<unknown>, "Evento São João 2026", "csv")).toBe("oc-m4-Evento-Sao-Joao-2026-layout-provisorio.csv");
  });

  it("descrições sugeridas do prestador e do lote Flash", () => {
    expect(descricaoDaOcDoPrestador({ funcao: "Produtor", evento: "Corrida Noturna", inicio: "2026-10-30", fim: "2026-11-01" }))
      .toBe("Prestação de serviços de Produtor no evento Corrida Noturna de 30/10 a 01/11/2026.");
    expect(descricaoDaOcDoPrestador({ evento: "X", inicio: "2026-10-30", fim: "2026-10-30" })).toBe("Prestação de serviços no evento X em 30/10/2026.");
    expect(descricaoDaOcDoLoteFlash({ numero: 12, inicio: "2026-10-01", fim: "2026-10-31" })).toBe("Crédito Flash alimentação/mobilidade — lote 12 (01/10 a 31/10/2026)");
    expect(descricaoDaOcDoLoteFlash({ numero: 3, evento: "Maratona" })).toBe("Crédito Flash alimentação/mobilidade — lote 3 · Maratona");
  });
});
