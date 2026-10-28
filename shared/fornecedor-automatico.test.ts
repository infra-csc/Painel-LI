/**
 * Fornecedor aprovado automaticamente pelo histórico (28/10) — regra pura.
 * 28/10 (revisão): OC não aprova (R6); o automático só cria contrato novo ou
 * confirma contrato que já é de quem passou — nunca vincula a contrato de
 * outra pessoa (S1).
 */
import { describe, expect, it } from "vitest";
import { completarCnpj, digitosDoCnpj } from "./cnpj";
import {
  GATILHOS_DA_APROVACAO, cnpjDaPrestacao, detalhesDoHistorico, fraseDaAprovacao, passagemDaNota, passagensDaPrestacao, planejarAprovacao, planoGrava,
  resumoDosPlanos, type ContratoParaAprovacao, type PassagemDoCnpj,
} from "./fornecedor-automatico";

const A = digitosDoCnpj(completarCnpj("112223330001"));
const B = digitosDoCnpj(completarCnpj("445556660001"));
const HOJE = "2026-10-28";
const evento = { id: "ev1", nome: "NR São Luís", inicio: "2026-10-10" };

const passagem = (o: Partial<PassagemDoCnpj> = {}): PassagemDoCnpj => ({
  cnpj: A, collaboratorId: "lucas", gatilho: "nota_aprovada", data: "2026-10-12", eventoId: "ev1", eventoNome: "NR São Luís", eventoInicio: "2026-10-10", razaoSocial: "LUCAS EVENTOS ME", ...o,
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

  it("prestação: só o pagamento marcado conta — a OC registrada NÃO aprova (28/10, R6)", () => {
    const base = { collaboratorId: "lucas", evento, cnpj: A, razaoSocial: " LUCAS EVENTOS ME ", pagoEm: "2026-10-20" };
    expect(GATILHOS_DA_APROVACAO).toEqual(["nota_aprovada", "pago"]);
    expect(passagensDaPrestacao(base)).toEqual([expect.objectContaining({ gatilho: "pago", data: "2026-10-20", razaoSocial: "LUCAS EVENTOS ME", eventoInicio: "2026-10-10" })]);
    // Com OC registrada e sem pagamento: nenhuma passagem.
    const comOc = { ...base, pagoEm: null, ocNumero: "4500", ocData: "2026-10-12", ocRegistradaEm: new Date() };
    expect(passagensDaPrestacao(comOc)).toEqual([]);
    expect(passagensDaPrestacao({ ...base, cnpj: null })).toEqual([]);
    expect(passagensDaPrestacao({ ...base, collaboratorId: null })).toEqual([]);
  });

  it("nota: só APROVADA; com CNPJ na prestação, só quando o da nota é o MESMO (28/10, S1); sem ele, o da nota (fluxo antigo)", () => {
    const base = { collaboratorId: "lucas", evento, status: "aprovada", nfCnpj: A, cnpjDaPrestacao: A, razaoSocial: null, aprovadaEm: new Date("2026-10-15T12:00:00Z"), atualizadaEm: null };
    expect(passagemDaNota(base)).toMatchObject({ cnpj: A, gatilho: "nota_aprovada", data: "2026-10-15" });
    expect(passagemDaNota({ ...base, nfCnpj: null })).toMatchObject({ cnpj: A });
    // CNPJ digitado na nota diferente do da prestação: não conta.
    expect(passagemDaNota({ ...base, nfCnpj: B })).toBeNull();
    // Nota do fluxo antigo (prestação sem CNPJ): vale o da nota, conferido pelo DP ao aprovar.
    expect(passagemDaNota({ ...base, nfCnpj: B, cnpjDaPrestacao: null })).toMatchObject({ cnpj: B });
    expect(passagemDaNota({ ...base, nfCnpj: null, cnpjDaPrestacao: null })).toBeNull();
    for (const status of ["enviada", "devolvida", "recusada", "pendente"]) expect(passagemDaNota({ ...base, status })).toBeNull();
    expect(passagemDaNota({ ...base, aprovadaEm: null, atualizadaEm: "2026-10-16T10:00:00Z" })?.data).toBe("2026-10-16");
  });

  it("frase do histórico", () => {
    expect(fraseDaAprovacao(passagem())).toBe("Aprovado automaticamente: CNPJ já pago em NR São Luís em 12/10/2026 (nota fiscal aprovada).");
    expect(fraseDaAprovacao(passagem({ gatilho: "pago" }))).toContain("(pagamento marcado)");
  });
});

describe("planejarAprovacao", () => {
  it("CNPJ sem contrato → cria com QUEM PASSOU PRIMEIRO; quem passou depois com o mesmo CNPJ vira pendência (28/10, S1)", () => {
    const [p] = planejarAprovacao([
      passagem({ data: "2026-10-20", gatilho: "pago", collaboratorId: "ana", razaoSocial: "NOME NOVO" }),
      passagem(),
      passagem({ data: "2026-10-14", gatilho: "pago" }),
    ], [], HOJE);
    expect(p.decisao).toEqual({ tipo: "criar", vincular: ["lucas"] });
    expect(p.pendentes).toEqual(["ana"]);
    expect(p.primeira.gatilho).toBe("nota_aprovada");
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
    expect(p.pendentes).toEqual([]);
    expect(planoGrava(p)).toBe(false);
  });

  it("contrato de OUTRA pessoa → nunca vincula sozinho: pendência \"CNPJ já é de outro contrato\" (28/10, S1)", () => {
    const [p] = planejarAprovacao([passagem(), passagem({ collaboratorId: "ana" })], [contrato()], HOJE);
    // lucas já está no contrato (confirma); ana fica pendente para o DP.
    expect(p.decisao).toEqual({ tipo: "ja_aprovado", contratoId: "k1" });
    expect(p.pendentes).toEqual(["ana"]);
    expect(planoGrava(p)).toBe(false);
    const [so] = planejarAprovacao([passagem({ collaboratorId: "ana" })], [contrato()], HOJE);
    expect(so.decisao).toEqual({ tipo: "pendente", contratoId: "k1", motivo: "cnpj_de_outro_contrato" });
    expect(so.pendentes).toEqual(["ana"]);
    expect(planoGrava(so)).toBe(false);
    // Contrato sem ninguém vinculado também não é "dele": pendência.
    expect(planejarAprovacao([passagem()], [contrato({ colaboradorIds: [] })], HOJE)[0].decisao.tipo).toBe("pendente");
    expect(resumoDosPlanos([p, so])).toMatchObject({ pendentes: 2, jaAprovados: 1 });
  });

  it("contrato sem as duas datas → abre a vigência só quando já é de quem passou", () => {
    const [p] = planejarAprovacao([passagem()], [contrato({ vigenciaInicio: null })], HOJE);
    expect(p.decisao).toEqual({ tipo: "atualizar", contratoId: "k1", vincular: [], abrirVigencia: true });
    const [outro] = planejarAprovacao([passagem()], [contrato({ vigenciaInicio: null, colaboradorIds: ["ana"] })], HOJE);
    expect(outro.decisao).toEqual({ tipo: "pendente", contratoId: "k1", motivo: "cnpj_de_outro_contrato" });
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
    expect(resumoDosPlanos(planos)).toEqual({ criar: 1, atualizar: 0, jaAprovados: 0, ignorados: 1, pendentes: 0, total: 2 });
  });

  it("histórico do contrato: frase, criação, vigência aberta e vinculados por nome", () => {
    const [p] = planejarAprovacao([passagem()], [], HOJE);
    const d = detalhesDoHistorico(p, new Map([["lucas", "Lucas Vinicius"]]), ["lucas"], false);
    expect(d[0]).toBe(p.frase);
    expect(d[1]).toContain("desde 10/10/2026, sem fim");
    expect(d[2]).toBe("Colaborador vinculado automaticamente: Lucas Vinicius.");
  });
});
