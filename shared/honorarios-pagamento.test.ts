import { describe, expect, it } from "vitest";
import {
  celulaCsv, conferirNotaComOc, dataLimiteDoExpurgo, descricaoSugeridaDaNota, dividirLinha, erroDaDataPassada, erroDoNumeroDaOc,
  estadoDoPagamento, fraseDoPagamentoAoColaborador, lerLoteDeOc, lerValorEmReais, montarCsv, ocDaNota, ocExigeJustificativa,
  pagamentoPassouDaGuarda, podeDesfazerOc, podeEnviarNotaDaOc, podeMarcarPago, podeRegistrarOc, reaisParaCsv, valoresVisiveisAoColaborador,
  COLUNAS_DA_EXPORTACAO, type PrestacaoDoLote,
} from "./honorarios-pagamento";
import { completarCpf } from "./pagamento";

const HOJE = "2026-11-20";
const aprovada = { rhStatus: "aprovado", splitParentId: null, didNotAttend: false, ocNumero: null, pagoEm: null };

describe("OC (etapa 4)", () => {
  it("número: obrigatório, até 40 caracteres, sem símbolo estranho", () => {
    expect(erroDoNumeroDaOc("")).toMatch(/Informe/);
    expect(erroDoNumeroDaOc("  ")).toMatch(/Informe/);
    expect(erroDoNumeroDaOc("4500012345")).toBeNull();
    expect(erroDoNumeroDaOc("OC 2026/0001-A")).toBeNull();
    expect(erroDoNumeroDaOc("x".repeat(41))).toMatch(/40/);
    expect(erroDoNumeroDaOc("<script>")).toMatch(/letras/);
  });

  it("só depois da Conferência DP aprovar, uma vez, nunca em divisão ou não participou", () => {
    expect(podeRegistrarOc(aprovada).ok).toBe(true);
    expect(podeRegistrarOc({ ...aprovada, rhStatus: "pendente" })).toMatchObject({ ok: false, codigo: "nao_aprovada" });
    expect(podeRegistrarOc({ ...aprovada, ocNumero: "1" })).toMatchObject({ ok: false, codigo: "oc_ja_registrada" });
    expect(podeRegistrarOc({ ...aprovada, splitParentId: "x" })).toMatchObject({ ok: false, codigo: "divisao" });
    expect(podeRegistrarOc({ ...aprovada, didNotAttend: true })).toMatchObject({ ok: false, codigo: "nao_participou" });
  });

  it("sem contrato ativo exige justificativa (pendência, não bloqueio)", () => {
    expect(ocExigeJustificativa("contrato_ativo")).toBe(false);
    for (const s of ["sem_cnpj", "sem_contrato", "contrato_inativo"] as const) expect(ocExigeJustificativa(s)).toBe(true);
  });

  it("desfazer só antes de existir NF", () => {
    expect(podeDesfazerOc({ ...aprovada, ocNumero: "1" }, null).ok).toBe(true);
    expect(podeDesfazerOc({ ...aprovada, ocNumero: "1" }, { status: "devolvida" })).toMatchObject({ ok: false, codigo: "com_nf" });
    expect(podeDesfazerOc(aprovada, null)).toMatchObject({ ok: false, codigo: "sem_oc" });
  });

  it("data: real, AAAA-MM-DD e não no futuro", () => {
    expect(erroDaDataPassada("2026-11-20", HOJE, "a data da OC")).toBeNull();
    expect(erroDaDataPassada("2026-11-21", HOJE, "a data da OC")).toMatch(/futuro/);
    expect(erroDaDataPassada("20/11/2026", HOJE, "a data da OC")).toMatch(/inválida/);
    expect(erroDaDataPassada("2026-02-30", HOJE, "a data da OC")).toMatch(/inválida/);
  });
});

describe("nota × OC (etapas 5 e 6)", () => {
  it("a nota só com OC; reenvio só da devolvida", () => {
    expect(podeEnviarNotaDaOc(aprovada, null)).toMatchObject({ ok: false, codigo: "aguardando_oc" });
    const comOc = { ...aprovada, ocNumero: "45001" };
    expect(podeEnviarNotaDaOc(comOc, null).ok).toBe(true);
    expect(podeEnviarNotaDaOc(comOc, { status: "devolvida" }).ok).toBe(true);
    expect(podeEnviarNotaDaOc(comOc, { status: "enviada" })).toMatchObject({ ok: false, codigo: "nf_em_analise" });
    expect(podeEnviarNotaDaOc(comOc, { status: "aprovada" })).toMatchObject({ ok: false, codigo: "nf_aprovada" });
    expect(podeEnviarNotaDaOc(comOc, { status: "recusada" })).toMatchObject({ ok: false, codigo: "nf_recusada" });
  });

  it("a OC da nota fica travada na registrada", () => {
    expect(ocDaNota("45001", "")).toEqual({ oc: "45001" });
    expect(ocDaNota("45001", " 45 001 ")).toEqual({ oc: "45001" });
    expect(ocDaNota("45001", "99")).toHaveProperty("erro");
    expect(ocDaNota(null, "OC-7")).toEqual({ oc: "OC-7" });
    expect(ocDaNota(null, "")).toEqual({ oc: null });
  });

  it("conferência: OC, valor (com a diferença) e CNPJ", () => {
    const tudoCerto = conferirNotaComOc({ ocNumero: "45001", ocValor: 100_000, cnpjEmissor: "11222333000181" }, { oc: "45001", nfValor: 100_000, nfCnpj: "11.222.333/0001-81" });
    expect(tudoCerto.confere).toBe(true);
    expect(tudoCerto.divergencias).toEqual([]);
    const errada = conferirNotaComOc({ ocNumero: "45001", ocValor: 100_000, cnpjEmissor: "11222333000181" }, { oc: "45002", nfValor: 90_000, nfCnpj: "22333444000190" });
    expect(errada.confere).toBe(false);
    expect(errada.oc.confere).toBe(false);
    expect(errada.valor).toMatchObject({ confere: false, diferenca: -10_000 });
    expect(errada.cnpj.confere).toBe(false);
    expect(errada.divergencias).toHaveLength(3);
    expect(errada.divergencias[1]).toMatch(/abaixo.*R\$\s100,00/);
    const incompleta = conferirNotaComOc({ ocNumero: "45001", ocValor: 100_000, cnpjEmissor: null }, { oc: "45001", nfValor: null, nfCnpj: null });
    expect(incompleta.valor.confere).toBeNull();
    expect(incompleta.confere).toBe(false);
  });
});

describe("pagamento (etapa 7) e estado", () => {
  const comOc = { ...aprovada, ocNumero: "45001" };
  it("pago só depois de programado (NF aprovada e lançada no M4), uma vez", () => {
    expect(podeMarcarPago(comOc, { status: "aprovada" })).toMatchObject({ ok: false, codigo: "nao_programado" });
    expect(podeMarcarPago(comOc, { status: "aprovada", checkinAt: "2026-11-10T12:00:00Z" }).ok).toBe(true);
    expect(podeMarcarPago({ ...comOc, pagoEm: "2026-11-15" }, { status: "aprovada", checkinAt: "x" })).toMatchObject({ ok: false, codigo: "ja_pago" });
  });

  it("estado e a frase do portal", () => {
    expect(estadoDoPagamento({ ocNumero: null })).toBe("sem_oc");
    expect(estadoDoPagamento({ ocNumero: "1" })).toBe("com_oc");
    expect(estadoDoPagamento({ ocNumero: "1", nota: { status: "enviada" } })).toBe("nf_enviada");
    expect(estadoDoPagamento({ ocNumero: "1", nota: { status: "devolvida" } })).toBe("nf_devolvida");
    expect(estadoDoPagamento({ ocNumero: "1", nota: { status: "aprovada" } })).toBe("nf_aprovada");
    expect(estadoDoPagamento({ ocNumero: "1", nota: { status: "aprovada", checkinAt: "x", paymentDate: "2026-11-30" } })).toBe("programado");
    expect(estadoDoPagamento({ ocNumero: "1", pagoEm: "2026-12-01", nota: { status: "aprovada", checkinAt: "x" } })).toBe("pago");
    expect(fraseDoPagamentoAoColaborador("programado", { programadoPara: "2026-11-30" })).toBe("Pagamento programado para 30/11.");
    expect(fraseDoPagamentoAoColaborador("pago", { pagoEm: "2026-12-01" })).toBe("Pago em 01/12.");
  });

  it("\"não exibir valores\" vale até a OC", () => {
    expect(valoresVisiveisAoColaborador(true, null)).toBe(false);
    expect(valoresVisiveisAoColaborador(true, "45001")).toBe(true);
    expect(valoresVisiveisAoColaborador(false, null)).toBe(true);
  });

  it("descrição sugerida da nota", () => {
    expect(descricaoSugeridaDaNota({ funcao: "Montagem", evento: "Maratona X", inicio: "2026-11-20", fim: "2026-11-22", ocNumero: "45001" }))
      .toBe("Prestação de serviços de Montagem no evento Maratona X de 20/11 a 22/11/2026 — OC nº 45001.");
  });
});

describe("lote de OC", () => {
  const cpfA = completarCpf("123456789");
  const base = (o: Partial<PrestacaoDoLote>): PrestacaoDoLote => ({
    id: "00000000-0000-4000-8000-000000000001", colaboradorNumero: 10, colaboradorNome: "Ana Souza", cpf: cpfA, totalValue: 120_000,
    rhStatus: "aprovado", situacaoDoCnpj: "contrato_ativo", ...o,
  });
  const prestacoes = [
    base({}),
    base({ id: "00000000-0000-4000-8000-000000000002", colaboradorNumero: 11, colaboradorNome: "Bruno Lima", cpf: null, situacaoDoCnpj: "sem_contrato" }),
    base({ id: "00000000-0000-4000-8000-000000000003", colaboradorNumero: 12, colaboradorNome: "Caio Reis", cpf: null, rhStatus: "pendente" }),
    base({ id: "00000000-0000-4000-8000-000000000004", colaboradorNumero: 13, colaboradorNome: "Dani Melo", cpf: null }),
    base({ id: "00000000-0000-4000-8000-000000000005", colaboradorNumero: 13, colaboradorNome: "Dani Melo", cpf: null }),
    base({ id: "00000000-0000-4000-8000-000000000006", colaboradorNumero: 14, colaboradorNome: "Edu Isento", cpf: null, emiteNf: false }),
  ];

  it("colado com ; e tab: CPF, nº do colaborador e nome; valor vazio = aprovado; data vazia = hoje", () => {
    const texto = [
      `${cpfA.slice(0, 3)}.${cpfA.slice(3, 6)}.${cpfA.slice(6, 9)}-${cpfA.slice(9)};4500001;1.250,50;19/11/2026`,
      "#11\t4500002",
      "",
      "Caio Reis;4500003",
      "13;4500004",
      "Zé Ninguém;4500005",
      "14;4500006",
      "#10;4500007",
      "00000000-0000-4000-8000-000000000004;OC <x>;abc;31/02/2026",
    ].join("\n");
    const r = lerLoteDeOc(texto, prestacoes, HOJE);
    const [a, b, c, d, e, f, g, h] = r.linhas;
    expect(a).toMatchObject({ linha: 1, situacao: "ok", numero: "4500001", valor: 125_050, data: "2026-11-19", actualId: prestacoes[0].id });
    expect(a.avisos.join(" ")).toMatch(/diferente do aprovado/);
    expect(b).toMatchObject({ linha: 2, situacao: "ok", valor: 120_000, data: HOJE, exigeJustificativa: true });
    expect(c.situacao).toBe("erro");
    expect(c.erros.join(" ")).toMatch(/Conferência DP/);
    expect(d.erros.join(" ")).toMatch(/mais de uma prestação/);
    expect(e.erros.join(" ")).toMatch(/não encontrado/);
    expect(f.erros.join(" ")).toMatch(/Não emite NF/);
    expect(g.erros.join(" ")).toMatch(/repetida no lote \(linha 1\)/);
    expect(h.erros.length).toBeGreaterThanOrEqual(3);
    expect(r.resumo).toMatchObject({ ok: 2, erro: 6, exigemJustificativa: 1 });
    expect(JSON.stringify(r)).not.toContain(cpfA);
  });

  it("o CSV exportado, preenchido: acha as colunas pelos títulos e ignora a linha sem OC", () => {
    const csv = montarCsv([
      [...COLUNAS_DA_EXPORTACAO],
      [prestacoes[0].id, "Ana Souza", cpfA, "", "", "Contrato ativo", "Ev", "Montagem", "1200,00", "", "4500100", "", ""],
      [prestacoes[3].id, "Dani Melo", "", "", "", "Contrato ativo", "Ev", "Montagem", "1200,00", "", "", "", ""],
    ]);
    const r = lerLoteDeOc(csv, prestacoes, HOJE);
    expect(r.comCabecalho).toBe(true);
    expect(r.linhas[0]).toMatchObject({ situacao: "ok", actualId: prestacoes[0].id, numero: "4500100", valor: 120_000 });
    expect(r.linhas[1].situacao).toBe("ignorada");
    expect(r.resumo).toMatchObject({ ok: 1, ignorada: 1, erro: 0 });
  });
});

describe("valores, CSV e expurgo", () => {
  it("lê reais em vários formatos", () => {
    expect(lerValorEmReais("1.234,56")).toEqual({ centavos: 123_456 });
    expect(lerValorEmReais("R$ 1.234,56")).toEqual({ centavos: 123_456 });
    expect(lerValorEmReais("1234.5")).toEqual({ centavos: 123_450 });
    expect(lerValorEmReais("1,234.56")).toEqual({ centavos: 123_456 });
    expect(lerValorEmReais("800")).toEqual({ centavos: 80_000 });
    expect(lerValorEmReais("")).toEqual({ centavos: null });
    expect(lerValorEmReais("-5")).toHaveProperty("erro");
    expect(reaisParaCsv(123_456)).toBe("1234,56");
  });

  it("CSV com BOM, ; e células protegidas (aspas e fórmula)", () => {
    const csv = montarCsv([["a;b", "=SOMA(1)", "x\"y", 3]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿\"a;b\";'=SOMA(1);\"x\"\"y\";3\r\n");
    expect(celulaCsv(null)).toBe("");
    expect(dividirLinha("\"a;b\";c;\"d\"\"e\"", ";")).toEqual(["a;b", "c", "d\"e"]);
  });

  it("expurgo: pago há MAIS que o prazo sai; no limite fica", () => {
    expect(dataLimiteDoExpurgo("2026-10-28", 365)).toBe("2025-10-28");
    expect(pagamentoPassouDaGuarda("2025-10-27", "2026-10-28", 365)).toBe(true);
    expect(pagamentoPassouDaGuarda("2025-10-28", "2026-10-28", 365)).toBe(false);
    expect(pagamentoPassouDaGuarda(null, "2026-10-28", 365)).toBe(false);
  });
});
