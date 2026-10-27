/**
 * Fornecedor aprovado automaticamente pelo histórico (28/10) — regra pura.
 */
import { describe, expect, it } from "vitest";
import { completarCnpj, digitosDoCnpj } from "./cnpj";
import {
  cnpjDaPrestacao, detalhesDoHistorico, fraseDaAprovacao, passagemDaNota, passagensDaPrestacao, planejarAprovacao, planoGrava, resumoDosPlanos,
  type ContratoParaAprovacao, type PassagemDoCnpj,
} from "./fornecedor-automatico";

const A = digitosDoCnpj(completarCnpj("112223330001"));
const B = digitosDoCnpj(completarCnpj("445556660001"));
const HOJE = "2026-10-28";
const evento = { id: "ev1", nome: "NR São Luís", inicio: "2026-10-10" };

const passagem = (o: Partial<PassagemDoCnpj> = {}): PassagemDoCnpj => ({
  cnpj: A, collaboratorId: "lucas", gatilho: "oc", data: "2026-10-12", eventoId: "ev1", eventoNome: "NR São Luís", eventoInicio: "2026-10-10", razaoSocial: "LUCAS EVENTOS ME", ...o,
});
const contrato = (o: Partial<ContratoParaAprovacao> = {}): ContratoParaAprovacao => ({
  id: "k1", cnpj: A, vigenciaInicio: "2026-01-01", vigenciaFim: null, encerradoEm: null, colaboradorIds: ["lucas"], ...o,
});

describe("de onde vem a passagem", () => {
  it("CNPJ da prestação: o do check-out final; sem ele, o da confirmação; inválido não conta", () => {
    expect(cnpjDaPrestacao(completarCnpj("112223330001"), B)).toBe(A);
    expect(cnpjDaPrestacao(null, B)).toBe(B);
    expect(cnpjDaPrestacao("11.222.333/0001-00", null)).toBeNull();
    expect(cnpjDaPrestacao("", "")).toBeNull();
  });

  it("prestação: OC registrada (data da OC ou do registro) e pagamento marcado", () => {
    const base = { collaboratorId: "lucas", evento, cnpj: A, razaoSocial: " LUCAS EVENTOS ME ", ocNumero: "4500", ocData: "2026-10-12", ocRegistradaEm: null, pagoEm: null };
    expect(passagensDaPrestacao(base)).toEqual([expect.objectContaining({ gatilho: "oc", data: "2026-10-12", razaoSocial: "LUCAS EVENTOS ME", eventoInicio: "2026-10-10" })]);
    expect(passagensDaPrestacao({ ...base, ocData: null, ocRegistradaEm: new Date("2026-10-13T15:00:00Z") })[0].data).toBe("2026-10-13");
    expect(passagensDaPrestacao({ ...base, pagoEm: "2026-10-20" }).map((p) => p.gatilho)).toEqual(["oc", "pago"]);
    expect(passagensDaPrestacao({ ...base, ocNumero: null, ocData: null })).toEqual([]);
    expect(passagensDaPrestacao({ ...base, cnpj: null })).toEqual([]);
    expect(passagensDaPrestacao({ ...base, collaboratorId: null })).toEqual([]);
  });

  it("nota: só APROVADA e com CNPJ (o da nota ou, nas antigas, o da prestação)", () => {
    const base = { collaboratorId: "lucas", evento, status: "aprovada", nfCnpj: B, cnpjDaPrestacao: A, razaoSocial: null, aprovadaEm: new Date("2026-10-15T12:00:00Z"), atualizadaEm: null };
    expect(passagemDaNota(base)).toMatchObject({ cnpj: B, gatilho: "nota_aprovada", data: "2026-10-15" });
    expect(passagemDaNota({ ...base, nfCnpj: null })).toMatchObject({ cnpj: A });
    // Nota do fluxo antigo: sem nf_cnpj e sem CNPJ na prestação → não conta.
    expect(passagemDaNota({ ...base, nfCnpj: null, cnpjDaPrestacao: null })).toBeNull();
    for (const status of ["enviada", "devolvida", "recusada", "pendente"]) expect(passagemDaNota({ ...base, status })).toBeNull();
    expect(passagemDaNota({ ...base, aprovadaEm: null, atualizadaEm: "2026-10-16T10:00:00Z" })?.data).toBe("2026-10-16");
  });

  it("frase do histórico", () => {
    expect(fraseDaAprovacao(passagem())).toBe("Aprovado automaticamente: CNPJ já pago em NR São Luís em 12/10/2026 (OC registrada).");
    expect(fraseDaAprovacao(passagem({ gatilho: "pago" }))).toContain("(pagamento marcado)");
  });
});

describe("planejarAprovacao", () => {
  it("CNPJ sem contrato → criar, com a passagem mais antiga, todos os que passaram e vigência desde o início do 1º evento", () => {
    const [p] = planejarAprovacao([
      passagem({ data: "2026-10-20", gatilho: "pago", collaboratorId: "ana", razaoSocial: "NOME NOVO" }),
      passagem(),
      passagem({ data: "2026-10-12", gatilho: "nota_aprovada" }),
    ], [], HOJE);
    expect(p.decisao).toEqual({ tipo: "criar" });
    expect(p.primeira.gatilho).toBe("oc");
    expect(p.colaboradorIds).toEqual(["lucas", "ana"]);
    expect(p.razaoSocial).toBe("NOME NOVO");
    expect(p.vigenciaInicio).toBe("2026-10-10");
    expect(planoGrava(p)).toBe(true);
  });

  it("início do evento depois da passagem (dado estranho) → vale a data da passagem", () => {
    expect(planejarAprovacao([passagem({ eventoInicio: "2026-11-01" })], [], HOJE)[0].vigenciaInicio).toBe("2026-10-12");
    expect(planejarAprovacao([passagem({ eventoInicio: null })], [], HOJE)[0].vigenciaInicio).toBe("2026-10-12");
  });

  it("contrato vigente com quem passou → já aprovado (idempotente)", () => {
    const [p] = planejarAprovacao([passagem()], [contrato()], HOJE);
    expect(p.decisao).toEqual({ tipo: "ja_aprovado", contratoId: "k1" });
    expect(planoGrava(p)).toBe(false);
  });

  it("contrato vigente sem a pessoa → vincula só quem falta", () => {
    const [p] = planejarAprovacao([passagem(), passagem({ collaboratorId: "ana" })], [contrato()], HOJE);
    expect(p.decisao).toEqual({ tipo: "atualizar", contratoId: "k1", vincular: ["ana"], abrirVigencia: false });
  });

  it("contrato sem as duas datas → abre a vigência (e vincula quem falta)", () => {
    const [p] = planejarAprovacao([passagem()], [contrato({ vigenciaInicio: null, colaboradorIds: [] })], HOJE);
    expect(p.decisao).toEqual({ tipo: "atualizar", contratoId: "k1", vincular: ["lucas"], abrirVigencia: true });
  });

  it("encerrado à mão → ignorado, mesmo dentro da vigência; vencido ou futuro do DP → ignorado", () => {
    expect(planejarAprovacao([passagem()], [contrato({ encerradoEm: "2026-10-01T10:00:00Z" })], HOJE)[0].decisao)
      .toEqual({ tipo: "ignorado", contratoId: "k1", motivo: "encerrado" });
    expect(planejarAprovacao([passagem()], [contrato({ vigenciaFim: "2026-09-30" })], HOJE)[0].decisao)
      .toEqual({ tipo: "ignorado", contratoId: "k1", motivo: "vigencia_do_dp" });
    expect(planejarAprovacao([passagem()], [contrato({ vigenciaInicio: "2026-12-01" })], HOJE)[0].decisao)
      .toEqual({ tipo: "ignorado", contratoId: "k1", motivo: "vigencia_do_dp" });
    // Encerrado sem datas também não volta.
    expect(planejarAprovacao([passagem()], [contrato({ vigenciaInicio: null, encerradoEm: new Date() })], HOJE)[0].decisao.tipo).toBe("ignorado");
  });

  it("um plano por CNPJ, CNPJ com ou sem máscara; resumo conta cada decisão", () => {
    const planos = planejarAprovacao([
      passagem({ cnpj: completarCnpj("112223330001") }),
      passagem({ cnpj: B, data: "2026-10-01" }),
      passagem({ cnpj: "123" }),
    ], [contrato({ cnpj: B, vigenciaFim: "2026-01-01" })], HOJE);
    expect(planos.map((p) => p.cnpj)).toEqual([B, A]);
    expect(resumoDosPlanos(planos)).toEqual({ criar: 1, atualizar: 0, jaAprovados: 0, ignorados: 1, total: 2 });
  });

  it("histórico do contrato: frase, criação, vigência aberta e vinculados por nome", () => {
    const [p] = planejarAprovacao([passagem()], [], HOJE);
    const d = detalhesDoHistorico(p, new Map([["lucas", "Lucas Vinicius"]]), ["lucas"], false);
    expect(d[0]).toBe(p.frase);
    expect(d[1]).toContain("desde 10/10/2026, sem fim");
    expect(d[2]).toBe("Colaborador vinculado automaticamente: Lucas Vinicius.");
  });
});
