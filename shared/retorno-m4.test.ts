/**
 * Retorno do M4 por planilha (28/10): leitura do CSV/XLSX no layout
 * PROVISÓRIO e a ação proposta por linha contra o estado do app.
 */
import { describe, expect, it } from "vitest";
import {
  enxugarMatrizDoRetorno, lerRetornoM4, lerSituacaoDoRetorno, lerValorDoRetorno, matrizDoCsv, numeroDoLoteFlash, proporRetornoM4,
  type EstadoDoRetorno, type LoteFlashNoRetorno, type PrestacaoNoRetorno,
} from "./retorno-m4";
import { FORMATO_OC_M4, FORMATO_RETORNO_M4 } from "./formatos-de-arquivo";

const HOJE = "2026-11-10";
const ID = "0b9f2a1e-1111-4c4c-9a9a-000000000001";
const ID2 = "0b9f2a1e-2222-4c4c-9a9a-000000000002";

const CAB = "Referência;Nº da OC;Situação;Data programada;Data de liquidação;Valor (R$)";

function prestacao(p: Partial<PrestacaoNoRetorno> = {}): PrestacaoNoRetorno {
  return {
    id: ID, colaboradorNome: "ANA SOUZA", eventoNome: "Corrida Noturna", legado: false, emiteNf: true,
    rhStatus: "aprovado", splitParentId: null, collaboratorId: "c1", didNotAttend: false,
    ocNumero: null, ocValor: null, totalValue: 123_456, pagoEm: null, situacaoDoCnpj: "contrato_ativo", nota: null,
    ...p,
  };
}
const lote = (p: Partial<LoteFlashNoRetorno> = {}): LoteFlashNoRetorno => ({ id: "L7", numero: 7, status: "gerado", totalCents: 57_000, pagoEm: null, ...p });
const estado = (ps: PrestacaoNoRetorno[] = [prestacao()], ls: LoteFlashNoRetorno[] = [lote()]): EstadoDoRetorno => ({
  prestacoes: new Map(ps.map((p) => [p.id.toLowerCase(), p])),
  lotes: new Map(ls.map((l) => [l.numero, l])),
});
const propor = (csv: string, e: EstadoDoRetorno = estado()) => proporRetornoM4(lerRetornoM4(matrizDoCsv(csv)), e, HOJE);
/** O "R$ " da moeda vem com espaço não separável. */
const sp = (t: string) => t.replace(/\s/g, " ");
const notaAprovada = { id: "nf1", status: "aprovada", checkinAt: null, paymentDate: null };
const notaProgramada = { id: "nf1", status: "aprovada", checkinAt: "2026-11-01T10:00:00Z", paymentDate: "2026-11-05" };

describe("leitura do arquivo", () => {
  it("CSV com BOM, ';', a marca do topo, colunas a mais e linhas vazias", () => {
    const csv = `﻿LAYOUT PROVISÓRIO — retorno\r\nTipo;${CAB};Evento\r\n\r\nPrestador;${ID};4500123;Programado;05/11/2026;;1.234,56;Corrida\r\n;;;;;;;\r\n`;
    const r = lerRetornoM4(matrizDoCsv(csv));
    expect(r.erro).toBeNull();
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({
      linha: 4, referencia: ID, numeroOc: "4500123", situacao: "programado", dataProgramada: "2026-11-05", dataLiquidacao: null, valorCents: 123_456, erros: [],
    });
  });

  it("CSV com ',' e aspas; data ISO e decimal com ponto", () => {
    const csv = `Referencia,N da OC,Status,Data programada,Data de liquidacao,Valor\n${ID},"OC 45/1",LIQUIDADA,2026-11-05,2026-11-07T00:00:00,"1234.56"\n`;
    const [l] = lerRetornoM4(matrizDoCsv(csv)).linhas;
    expect(l).toMatchObject({ numeroOc: "OC 45/1", situacao: "liquidado", dataProgramada: "2026-11-05", dataLiquidacao: "2026-11-07", valorCents: 123_456 });
  });

  it("situação aceita variações de texto, acento e caixa; desconhecida é erro legível", () => {
    for (const t of ["Programado", "PROGRAMADA", "  agendado ", "Pagamento programado"]) expect(lerSituacaoDoRetorno(t)).toEqual({ situacao: "programado" });
    for (const t of ["Liquidado", "Liquidada", "PAGO", "Quitada", "baixado"]) expect(lerSituacaoDoRetorno(t)).toEqual({ situacao: "liquidado" });
    expect(lerSituacaoDoRetorno("Emitida")).toEqual({ situacao: "emitida" });
    expect(lerSituacaoDoRetorno("")).toEqual({ situacao: null });
    expect(lerSituacaoDoRetorno("Cancelada")).toEqual({ erro: expect.stringContaining("não reconhecida") });
  });

  it("valor: vírgula, milhar, R$ e número cru da planilha (XLSX)", () => {
    expect(lerValorDoRetorno("1.234,56")).toEqual({ centavos: 123_456 });
    expect(lerValorDoRetorno("R$ 980,5")).toEqual({ centavos: 98_050 });
    expect(lerValorDoRetorno(1234.56)).toEqual({ centavos: 123_456 });
    expect(lerValorDoRetorno("")).toEqual({ centavos: null });
    expect(lerValorDoRetorno("abc")).toHaveProperty("erro");
  });

  it("XLSX: célula numérica de data (série do Excel) e nº da OC numérico", () => {
    const matriz = [CAB.split(";"), [ID, 4500123456, "liquidado", 46331, 46333, 1234.56]];
    const [l] = lerRetornoM4(matriz).linhas;
    expect(l).toMatchObject({ numeroOc: "4500123456", dataProgramada: "2026-11-05", dataLiquidacao: "2026-11-07", valorCents: 123_456 });
  });

  it("sem cabeçalho reconhecível: erro do arquivo, com as colunas que faltam; vazio também", () => {
    expect(lerRetornoM4(matrizDoCsv("A;B;C\n1;2;3\n")).erro).toMatch(/faltam as colunas “Referência”, “Nº da OC”, “Valor \(R\$\)”/);
    expect(lerRetornoM4(matrizDoCsv("Referência;Valor\nx;1\n")).erro).toMatch(/falta a coluna “Nº da OC”/);
    expect(lerRetornoM4(matrizDoCsv("\n\n")).erro).toBe("O arquivo está vazio.");
  });

  it("enxugar: só as colunas do formato vão ao servidor, o nº da linha não muda", () => {
    const m = matrizDoCsv(`MARCA\nTipo;Descrição sugerida;Valor (R$);Referência;Nº da OC\n\nPrestador;texto longo;10,00;${ID};45\n`);
    const e = enxugarMatrizDoRetorno(m);
    expect(e[1]).toEqual(["Referência", "Nº da OC", "Valor (R$)"]);
    expect(e[2]).toEqual([]);
    expect(e[3]).toEqual([ID, "45", "10,00"]);
    expect(lerRetornoM4(e).linhas[0]).toMatchObject({ linha: 4, referencia: ID, numeroOc: "45", valorCents: 1000 });
    expect(enxugarMatrizDoRetorno([["a", "b"]])).toEqual([["a", "b"]]);
  });

  it("data inválida vira erro da linha", () => {
    const [l] = lerRetornoM4(matrizDoCsv(`${CAB}\n${ID};45;programado;31/02/2026;;10,00\n`)).linhas;
    expect(l.erros[0]).toMatch(/^Data programada: data inválida/);
  });

  it("a chave é a Referência do arquivo de OC exportado (o mesmo título)", () => {
    const tituloDaReferencia = FORMATO_OC_M4.colunas.find((c) => c.campo === "referencia")!.titulo;
    expect(FORMATO_RETORNO_M4.colunas.find((c) => c.campo === "referencia")!.titulos[0]).toBe(tituloDaReferencia);
    expect(FORMATO_RETORNO_M4.provisorio).toBe(true);
    expect(numeroDoLoteFlash("Lote 12")).toBe(12);
    expect(numeroDoLoteFlash("lote nº 3")).toBe(3);
    expect(numeroDoLoteFlash(ID)).toBeNull();
  });
});

describe("a ação de cada linha", () => {
  it("sem OC + emitida: registra a OC (valor = aprovado, data = hoje)", () => {
    const p = propor(`${CAB}\n${ID};4500123;;;;1.234,56\n`);
    expect(p.linhas[0]).toMatchObject({ resultado: "aplicar", acoes: ["registrar_oc"], quem: "ANA SOUZA", gravar: { oc: { numero: "4500123", valor: 123_456, data: HOJE } } });
    expect(p.linhas[0].frase).toBe("Registra a OC 4500123.");
    expect(p.resumo).toMatchObject({ total: 1, registrarOc: 1, aplicar: 1, problema: 0 });
  });

  it("valor divergente NÃO aplica: a linha fica de fora com o porquê", () => {
    const p = propor(`${CAB}\n${ID};4500123;;;;1.200,00\n`);
    expect(p.linhas[0].resultado).toBe("problema");
    expect(p.linhas[0].acoes).toEqual([]);
    expect(sp(p.linhas[0].problemas[0])).toBe("Valor do M4 R$ 1.200,00 difere do aprovado R$ 1.234,56 — a linha fica de fora; confira no M4.");
    // Com OC, compara com o valor da OC registrada.
    const comOc = propor(`${CAB}\n${ID};4500123;;;;1.234,56\n`, estado([prestacao({ ocNumero: "4500123", ocValor: 100_000 })]));
    expect(sp(comOc.linhas[0].problemas[0])).toMatch(/difere da OC registrada R\$ 1\.000,00/);
    // Sem valor também não entra.
    expect(propor(`${CAB}\n${ID};4500123;;;;\n`).linhas[0].problemas[0]).toMatch(/Sem valor para conferir/);
  });

  it("linha sem referência: \"OC sem identificador\"; referência desconhecida e repetida", () => {
    const p = propor(`${CAB}\n;4500123;;;;10,00\n${ID2};45;;;;10,00\n${ID};4500123;;;;1.234,56\n${ID.toUpperCase()};4500123;;;;1.234,56\n`);
    expect(p.linhas.map((l) => l.resultado)).toEqual(["problema", "problema", "aplicar", "problema"]);
    expect(p.linhas[0].problemas[0]).toMatch(/^OC sem identificador/);
    expect(p.linhas[1].problemas[0]).toMatch(/^Prestação não encontrada/);
    expect(p.linhas[3].problemas[0]).toBe("Referência repetida no arquivo (já na linha 4).");
  });

  it("evento do fluxo antigo, não emite NF e não aprovada ficam de fora", () => {
    expect(propor(`${CAB}\n${ID};45;;;;1.234,56\n`, estado([prestacao({ legado: true })])).linhas[0].problemas[0]).toMatch(/fluxo antigo/);
    expect(propor(`${CAB}\n${ID};45;;;;1.234,56\n`, estado([prestacao({ emiteNf: false })])).linhas[0].problemas[0]).toMatch(/Não emite NF/);
    expect(propor(`${CAB}\n${ID};45;;;;1.234,56\n`, estado([prestacao({ rhStatus: "pendente" })])).linhas[0].problemas[0]).toMatch(/Conferência DP aprovar/);
  });

  it("OC já registrada com outro número é problema; com o mesmo é sem mudança", () => {
    const e = estado([prestacao({ ocNumero: "4500123", ocValor: 123_456 })]);
    expect(propor(`${CAB}\n${ID};4500999;;;;1.234,56\n`, e).linhas[0].problemas[0]).toBe("O M4 devolveu a OC 4500999, mas a registrada no app é 4500123.");
    const igual = propor(`${CAB}\n${ID};4500 123;;;;1.234,56\n`, e);
    expect(igual.linhas[0]).toMatchObject({ resultado: "sem_mudanca", frase: "Sem mudança — já estava assim no app." });
  });

  it("CNPJ sem contrato ativo: entra, mas pede a justificativa", () => {
    const p = propor(`${CAB}\n${ID};45;;;;1.234,56\n`, estado([prestacao({ situacaoDoCnpj: "sem_contrato" })]));
    expect(p.linhas[0]).toMatchObject({ resultado: "aplicar", exigeJustificativa: true });
    expect(p.resumo.exigemJustificativa).toBe(1);
  });

  it("programado com NF aprovada: programa; sem NF aprovada é problema; sem data é problema", () => {
    const e = estado([prestacao({ ocNumero: "45", ocValor: 123_456, nota: notaAprovada })]);
    const p = propor(`${CAB}\n${ID};45;Programado;05/11/2026;;1.234,56\n`, e);
    expect(p.linhas[0]).toMatchObject({ resultado: "aplicar", acoes: ["programar"], gravar: { programarPara: "2026-11-05", notaId: "nf1" } });
    expect(p.linhas[0].frase).toBe("Programa para 05/11/2026.");
    const enviada = estado([prestacao({ ocNumero: "45", ocValor: 123_456, nota: { ...notaAprovada, status: "enviada" } })]);
    expect(propor(`${CAB}\n${ID};45;Programado;05/11/2026;;1.234,56\n`, enviada).linhas[0].problemas[0]).toBe("O M4 diz programado, mas a NF ainda não foi aprovada no app (NF enviada).");
    expect(propor(`${CAB}\n${ID};45;Programado;;;1.234,56\n`, e).linhas[0].problemas[0]).toBe("Programado sem a data programada.");
    // Linha nova (registra a OC) dizendo programado: a nota ainda não existe → a linha inteira fica de fora.
    const nova = propor(`${CAB}\n${ID};45;Programado;05/11/2026;;1.234,56\n`);
    expect(nova.linhas[0]).toMatchObject({ resultado: "problema", acoes: [] });
    expect(nova.linhas[0].problemas[0]).toMatch(/nota fiscal ainda não chegou/);
  });

  it("liquidado com NF aprovada: programa e marca pago na mesma linha; já programado: só marca pago", () => {
    const e = estado([prestacao({ ocNumero: "45", ocValor: 123_456, nota: notaAprovada })]);
    const p = propor(`${CAB}\n${ID};45;Liquidado;;07/11/2026;1.234,56\n`, e);
    expect(p.linhas[0]).toMatchObject({ acoes: ["programar", "marcar_pago"], gravar: { programarPara: "2026-11-07", pagoEm: "2026-11-07" } });
    expect(p.resumo).toMatchObject({ programar: 1, marcarPago: 1, aplicar: 1 });
    const prog = estado([prestacao({ ocNumero: "45", ocValor: 123_456, nota: notaProgramada })]);
    const q = propor(`${CAB}\n${ID};45;Liquidado;06/11/2026;07/11/2026;1.234,56\n`, prog);
    expect(q.linhas[0]).toMatchObject({ resultado: "aplicar", acoes: ["marcar_pago"] });
    expect(q.linhas[0].avisos[0]).toBe("Já programado no app para 05/11/2026; o M4 diz 06/11/2026 (a data no app não muda).");
    expect(propor(`${CAB}\n${ID};45;Liquidado;;20/11/2026;1.234,56\n`, prog).linhas[0].problemas[0]).toBe("A data de liquidação não pode ser no futuro.");
  });

  it("idempotente: tudo já gravado igual → sem mudança; já paga em outra data → problema", () => {
    const paga = estado([prestacao({ ocNumero: "45", ocValor: 123_456, nota: notaProgramada, pagoEm: "2026-11-07" })]);
    expect(propor(`${CAB}\n${ID};45;Liquidado;05/11/2026;07/11/2026;1.234,56\n`, paga).linhas[0].resultado).toBe("sem_mudanca");
    expect(propor(`${CAB}\n${ID};45;Liquidado;;08/11/2026;1.234,56\n`, paga).linhas[0].problemas[0]).toMatch(/^Já paga no app em 07\/11\/2026; o M4 diz 08\/11\/2026/);
  });

  it("linha que o M4 ainda não devolveu (sem OC e sem situação): sem mudança", () => {
    const p = propor(`${CAB}\n${ID};;;;;1.234,56\n`);
    expect(p.linhas[0]).toMatchObject({ resultado: "sem_mudanca", frase: "Sem nº da OC nem situação — o M4 ainda não devolveu esta linha." });
  });

  it("lote Flash: liquidado marca pago; valor diferente, cancelado e já pago em outra data não", () => {
    const p = propor(`${CAB}\nLote 7;OC-F7;Liquidado;;07/11/2026;570,00\n`);
    expect(p.linhas[0]).toMatchObject({ tipo: "flash", alvoId: "L7", quem: "Lote Flash 7", acoes: ["marcar_pago"], gravar: { pagoEm: "2026-11-07" } });
    expect(p.linhas[0].frase).toBe("Marca o lote pago à Flash em 07/11/2026.");
    expect(sp(propor(`${CAB}\nLote 7;OC-F7;Liquidado;;07/11/2026;500,00\n`).linhas[0].problemas[0])).toMatch(/difere do total do lote R\$ 570,00/);
    expect(propor(`${CAB}\nLote 7;;Liquidado;;07/11/2026;570,00\n`, estado([], [lote({ status: "cancelado" })])).linhas[0].problemas[0]).toMatch(/cancelado/);
    expect(propor(`${CAB}\nLote 7;;Liquidado;;07/11/2026;570,00\n`, estado([], [lote({ status: "pago", pagoEm: "2026-11-07" })])).linhas[0].resultado).toBe("sem_mudanca");
    expect(propor(`${CAB}\nLote 7;;Liquidado;;08/11/2026;570,00\n`, estado([], [lote({ status: "pago", pagoEm: "2026-11-07" })])).linhas[0].resultado).toBe("problema");
    expect(propor(`${CAB}\nLote 9;;Liquidado;;07/11/2026;570,00\n`).linhas[0].problemas[0]).toBe("Lote Flash 9 não encontrado no app.");
    const programado = propor(`${CAB}\nLote 7;OC-F7;Programado;05/11/2026;;570,00\n`);
    expect(programado.linhas[0]).toMatchObject({ resultado: "sem_mudanca" });
    expect(programado.linhas[0].avisos[0]).toMatch(/só registra a liquidação/);
  });

  it("arquivo com erro: nenhuma linha e o erro na prévia", () => {
    const p = propor("A;B\n1;2\n");
    expect(p.erro).toMatch(/cabeçalho/);
    expect(p.linhas).toEqual([]);
    expect(p.formato.provisorio).toBe(true);
  });
});
