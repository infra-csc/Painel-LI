/**
 * Prazos do fluxo novo dos honorários (28/10) — cada etapa, as viradas de
 * dia em Brasília e a leitura/validação da configuração.
 */
import { describe, expect, it } from "vitest";
import {
  PRAZOS_PADRAO, CHAVES_DOS_PRAZOS, contarPrazos, diaDeBrasilia, diasEntre, lerPrazosDosHonorarios, prazoDaPrestacao, prazoDaProducao,
  prazoDoColaborador, situacaoDoVencimento, somarDias, textoDoPrazo, urgenciaDoPrazo, validarPrazosDosHonorarios, type EntradaDoPrazo,
} from "./prazos-honorarios";
import { hojeISO } from "./hoje-sp";

const base = (o: Partial<EntradaDoPrazo> = {}): EntradaDoPrazo => ({
  hoje: "2026-11-05",
  prazos: PRAZOS_PADRAO,
  ultimoDia: "2026-11-02",
  emiteNf: true,
  confirmado: false,
  realizado: { sentForReview: false, rhStatus: "pendente" },
  ...o,
});

describe("datas em Brasília", () => {
  it("o instante vira o dia de Brasília antes de contar (23h30 em Brasília ainda é o mesmo dia)", () => {
    expect(diaDeBrasilia("2026-10-31T02:30:00.000Z")).toBe("2026-10-30"); // 23h30 de 30/10 em Brasília
    expect(diaDeBrasilia("2026-10-31T03:00:00.000Z")).toBe("2026-10-31"); // meia-noite em Brasília
    expect(diaDeBrasilia(new Date("2026-11-01T02:59:59.000Z"))).toBe("2026-10-31");
    // Coluna date fica como está (nunca passa por new Date("AAAA-MM-DD"), que é UTC).
    expect(diaDeBrasilia("2026-11-01")).toBe("2026-11-01");
    expect(diaDeBrasilia(null)).toBeNull();
    expect(diaDeBrasilia("lixo")).toBeNull();
  });

  it("soma e diferença de dias corridos atravessam o fim do mês e do ano", () => {
    expect(somarDias("2026-10-30", 3)).toBe("2026-11-02");
    expect(somarDias("2026-12-30", 5)).toBe("2027-01-04");
    expect(diasEntre("2026-10-30", "2026-11-02")).toBe(3);
    expect(diasEntre("2026-11-02", "2026-10-30")).toBe(-3);
  });

  it("vence no fim do dia: no dia é 'vence hoje', no seguinte 'atrasado 1 dia'", () => {
    expect(situacaoDoVencimento("2026-11-04", "2026-11-02")).toEqual({ situacao: "no_prazo", dias: 2 });
    expect(situacaoDoVencimento("2026-11-04", "2026-11-04")).toEqual({ situacao: "vence_hoje", dias: 0 });
    expect(situacaoDoVencimento("2026-11-04", "2026-11-05")).toEqual({ situacao: "atrasado", dias: 1 });
  });

  it("às 22h de Brasília o 'hoje' ainda é o dia de Brasília (o servidor roda em UTC)", () => {
    const agora = new Date("2026-11-05T01:00:00.000Z"); // 22h de 04/11 em Brasília
    const hoje = hojeISO(undefined, agora);
    expect(hoje).toBe("2026-11-04");
    const p = prazoDaPrestacao(base({ hoje, ultimoDia: "2026-11-02" })); // confirmar vence 04/11
    expect(p.atual).toMatchObject({ etapa: "confirmar_presenca", situacao: "vence_hoje" });
  });
});

describe("cada etapa", () => {
  it("durante o evento (e no último dia) não há prazo", () => {
    expect(prazoDaPrestacao(base({ hoje: "2026-11-02" }))).toEqual({ atual: null, paralelo: null, pior: null });
    expect(prazoDaPrestacao(base({ hoje: "2026-10-30" })).atual).toBeNull();
    expect(prazoDaPrestacao(base({ ultimoDia: null })).atual).toBeNull();
  });

  it("depois do último dia: o colaborador confirma (2 dias) e a produção fecha (3 dias) em paralelo", () => {
    const p = prazoDaPrestacao(base({ hoje: "2026-11-03" }));
    expect(p.atual).toMatchObject({ etapa: "confirmar_presenca", quem: "colaborador", desde: "2026-11-02", venceEm: "2026-11-04", situacao: "no_prazo", dias: 1 });
    expect(p.paralelo).toMatchObject({ etapa: "checkout_final", quem: "producao", venceEm: "2026-11-05", dias: 2 });
    expect(p.pior?.etapa).toBe("confirmar_presenca");
    expect(prazoDoColaborador(p)?.etapa).toBe("confirmar_presenca");
    expect(prazoDaProducao(p)?.etapa).toBe("checkout_final");
  });

  it("colaborador atrasado: o pior é o dele; confirmou → só o check-out final", () => {
    const atrasado = prazoDaPrestacao(base({ hoje: "2026-11-06" }));
    expect(atrasado.atual).toMatchObject({ situacao: "atrasado", dias: 2 });
    expect(atrasado.paralelo).toMatchObject({ situacao: "atrasado", dias: 1 });
    expect(atrasado.pior?.etapa).toBe("confirmar_presenca");
    const confirmado = prazoDaPrestacao(base({ hoje: "2026-11-05", confirmado: true }));
    expect(confirmado.atual).toMatchObject({ etapa: "checkout_final", situacao: "vence_hoje" });
    expect(confirmado.paralelo).toBeNull();
    expect(prazoDoColaborador(confirmado)).toBeNull();
  });

  it("com o confirmar mais longo que o check-out, o pior é o check-out", () => {
    const p = prazoDaPrestacao(base({ hoje: "2026-11-06", prazos: { ...PRAZOS_PADRAO, confirmarPresenca: 10 } }));
    expect(p.atual?.situacao).toBe("no_prazo");
    expect(p.pior).toMatchObject({ etapa: "checkout_final", situacao: "atrasado", dias: 1 });
  });

  it("enviada ao DP: conferência conta do check-out final, no dia de Brasília", () => {
    const p = prazoDaPrestacao(base({
      hoje: "2026-11-06",
      realizado: { sentForReview: true, rhStatus: "pendente", checkoutFinalEm: "2026-11-04T02:00:00.000Z" }, // 23h de 03/11
    }));
    expect(p.atual).toMatchObject({ etapa: "conferencia_dp", quem: "dp", desde: "2026-11-03", venceEm: "2026-11-06", situacao: "vence_hoje" });
  });

  it("reenviada depois da devolução sem novo check-out: conta da última atualização", () => {
    const p = prazoDaPrestacao(base({
      hoje: "2026-11-10",
      realizado: { sentForReview: true, rhStatus: "pendente", checkoutFinalEm: "2026-11-03T15:00:00Z", rhActionAt: "2026-11-05T15:00:00Z", updatedAt: "2026-11-08T15:00:00Z" },
    }));
    expect(p.atual).toMatchObject({ etapa: "conferencia_dp", desde: "2026-11-08", venceEm: "2026-11-11" });
  });

  it("devolvida pelo DP: volta à produção com o prazo do check-out, contado da devolução", () => {
    const p = prazoDaPrestacao(base({ hoje: "2026-11-10", realizado: { sentForReview: false, rhStatus: "devolvido", rhActionAt: "2026-11-06T13:00:00Z" } }));
    expect(p.atual).toMatchObject({ etapa: "corrigir_prestacao", quem: "producao", venceEm: "2026-11-09", situacao: "atrasado", dias: 1 });
    expect(prazoDaProducao(p)?.etapa).toBe("corrigir_prestacao");
  });

  it("aprovada sem OC: o DP registra a OC em 3 dias da aprovação", () => {
    const p = prazoDaPrestacao(base({ hoje: "2026-11-08", realizado: { sentForReview: true, rhStatus: "aprovado", rhActionAt: "2026-11-05T12:00:00Z" } }));
    expect(p.atual).toMatchObject({ etapa: "registrar_oc", quem: "dp", venceEm: "2026-11-08", situacao: "vence_hoje" });
  });

  it("com OC: o colaborador envia a nota em 5 dias do REGISTRO da OC (não da data da OC)", () => {
    const p = prazoDaPrestacao(base({
      hoje: "2026-11-12",
      realizado: { rhStatus: "aprovado", sentForReview: true, ocNumero: "4500", ocData: "2026-11-01", ocRegistradaEm: "2026-11-06T18:00:00Z" },
    }));
    expect(p.atual).toMatchObject({ etapa: "enviar_nf", quem: "colaborador", desde: "2026-11-06", venceEm: "2026-11-11", situacao: "atrasado", dias: 1 });
    // Sem o instante do registro (importação antiga), vale a data da OC.
    const semRegistro = prazoDaPrestacao(base({ hoje: "2026-11-03", realizado: { rhStatus: "aprovado", ocNumero: "1", ocData: "2026-11-01" } }));
    expect(semRegistro.atual?.venceEm).toBe("2026-11-06");
  });

  it("nota enviada: o DP confere em 2 dias do último envio do histórico", () => {
    const p = prazoDaPrestacao(base({
      hoje: "2026-11-12",
      realizado: { rhStatus: "aprovado", ocNumero: "1", ocRegistradaEm: "2026-11-05T12:00:00Z" },
      nota: { status: "enviada", history: [{ type: "enviado", at: "2026-11-06T12:00:00Z" }, { type: "devolvido", at: "2026-11-07T12:00:00Z" }, { type: "reenviado", at: "2026-11-10T12:00:00Z" }] },
    }));
    expect(p.atual).toMatchObject({ etapa: "conferir_nf", quem: "dp", desde: "2026-11-10", venceEm: "2026-11-12", situacao: "vence_hoje" });
  });

  it("nota devolvida: volta ao colaborador, 5 dias da devolução", () => {
    const p = prazoDaPrestacao(base({
      hoje: "2026-11-09",
      realizado: { rhStatus: "aprovado", ocNumero: "1" },
      nota: { status: "devolvida", history: [{ type: "enviado", at: "2026-11-02T12:00:00Z" }, { type: "devolvido", at: "2026-11-03T12:00:00Z" }] },
    }));
    expect(p.atual).toMatchObject({ etapa: "reenviar_nf", quem: "colaborador", venceEm: "2026-11-08", situacao: "atrasado", dias: 1 });
  });

  it("sem prazo: legado, não participou, recusada, não emite NF, nota aprovada/recusada e paga", () => {
    const aprovada = { rhStatus: "aprovado", ocNumero: "1" };
    expect(prazoDaPrestacao(base({ legado: true })).atual).toBeNull();
    expect(prazoDaPrestacao(base({ realizado: null })).atual).toBeNull();
    expect(prazoDaPrestacao(base({ realizado: { didNotAttend: true } })).atual).toBeNull();
    expect(prazoDaPrestacao(base({ realizado: { rhStatus: "rejeitado", sentForReview: true } })).atual).toBeNull();
    expect(prazoDaPrestacao(base({ emiteNf: false, realizado: { rhStatus: "aprovado", rhActionAt: "2026-11-01T12:00:00Z" } })).atual).toBeNull();
    expect(prazoDaPrestacao(base({ realizado: aprovada, nota: { status: "aprovada" } })).atual).toBeNull();
    expect(prazoDaPrestacao(base({ realizado: aprovada, nota: { status: "recusada" } })).atual).toBeNull();
    expect(prazoDaPrestacao(base({ realizado: { ...aprovada, pagoEm: "2026-11-04" } })).atual).toBeNull();
  });

  it("os prazos configurados mudam o vencimento", () => {
    const p = prazoDaPrestacao(base({ hoje: "2026-11-03", prazos: { ...PRAZOS_PADRAO, confirmarPresenca: 1 } }));
    expect(p.atual).toMatchObject({ venceEm: "2026-11-03", situacao: "vence_hoje" });
  });
});

describe("textos, urgência e contagem", () => {
  it("textos curtos", () => {
    expect(textoDoPrazo({ situacao: "atrasado", dias: 1, venceEm: "2026-11-04" })).toBe("Atrasado 1 dia");
    expect(textoDoPrazo({ situacao: "atrasado", dias: 3, venceEm: "2026-11-04" })).toBe("Atrasado 3 dias");
    expect(textoDoPrazo({ situacao: "vence_hoje", dias: 0, venceEm: "2026-11-04" })).toBe("Vence hoje");
    expect(textoDoPrazo({ situacao: "no_prazo", dias: 1, venceEm: "2026-11-04" })).toBe("Vence amanhã");
    expect(textoDoPrazo({ situacao: "no_prazo", dias: 4, venceEm: "2026-11-04" })).toBe("Vence 04/11");
  });

  it("urgência: mais atrasado > vence hoje > o que vence antes", () => {
    const u = (situacao: "atrasado" | "vence_hoje" | "no_prazo", dias: number) => urgenciaDoPrazo({ situacao, dias });
    expect(u("atrasado", 5)).toBeGreaterThan(u("atrasado", 1));
    expect(u("atrasado", 1)).toBeGreaterThan(u("vence_hoje", 0));
    expect(u("vence_hoje", 0)).toBeGreaterThan(u("no_prazo", 1));
    expect(u("no_prazo", 1)).toBeGreaterThan(u("no_prazo", 4));
    expect(urgenciaDoPrazo(null)).toBe(-Infinity);
  });

  it("conta atrasados (por quem), vence hoje e o maior atraso pelo pior de cada prestação", () => {
    const c = contarPrazos([
      prazoDaPrestacao(base({ hoje: "2026-11-06" })), // colaborador atrasado 2
      prazoDaPrestacao(base({ hoje: "2026-11-05", confirmado: true })), // check-out vence hoje
      prazoDaPrestacao(base({ hoje: "2026-11-10", realizado: { rhStatus: "devolvido", rhActionAt: "2026-11-02T12:00:00Z" } })), // produção atrasada 5
      prazoDaPrestacao(base({ hoje: "2026-11-02" })), // sem prazo
      null,
    ]);
    expect(c).toEqual({ atrasados: 2, venceHoje: 1, atrasadosPorQuem: { colaborador: 1, producao: 1, dp: 0 }, maiorAtraso: 5 });
  });
});

describe("configuração", () => {
  it("lê o gravado e cai no padrão quando falta ou é inválido", () => {
    const p = lerPrazosDosHonorarios([
      { key: CHAVES_DOS_PRAZOS.confirmarPresenca, value: "4" },
      { key: CHAVES_DOS_PRAZOS.enviarNf, value: "0" },
      { key: CHAVES_DOS_PRAZOS.conferirNf, value: "2,5" },
    ]);
    expect(p).toEqual({ ...PRAZOS_PADRAO, confirmarPresenca: 4 });
  });

  it("valida só os campos enviados: inteiros de 1 a 60", () => {
    const ok = validarPrazosDosHonorarios({ enviarNf: 7, conferirNf: "1" }, PRAZOS_PADRAO);
    expect(ok).toEqual({ gravar: { [CHAVES_DOS_PRAZOS.enviarNf]: "7", [CHAVES_DOS_PRAZOS.conferirNf]: "1" }, novos: { ...PRAZOS_PADRAO, enviarNf: 7, conferirNf: 1 } });
    expect(validarPrazosDosHonorarios({ checkoutFinal: 0 }, PRAZOS_PADRAO)).toMatchObject({ campo: "checkoutFinal" });
    expect(validarPrazosDosHonorarios({ checkoutFinal: 61 }, PRAZOS_PADRAO)).toMatchObject({ campo: "checkoutFinal" });
    expect(validarPrazosDosHonorarios({ checkoutFinal: 2.5 }, PRAZOS_PADRAO)).toMatchObject({ campo: "checkoutFinal" });
    expect(validarPrazosDosHonorarios({}, PRAZOS_PADRAO)).toEqual({ gravar: {}, novos: PRAZOS_PADRAO });
  });
});
