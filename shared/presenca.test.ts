import { describe, expect, it } from "vitest";
import {
  CONFIGURACAO_PADRAO, ajusteEmPct, camposDoRealizadoNoCheckoutFinal, cpfDoCadastro, cpfMascarado, dentroDoLimite, diaEmBrasilia,
  diasDaPrestacao, diasPendentes, erroDaSenha, estadoDoDia, faixaDoAjuste, horaEmBrasilia, inclusaoDaPrestacao, instanteEmBrasilia,
  lerConfiguracaoDaPresenca, periodoDaPrestacao, podeConfirmarPrestacao, podeRegistrarEntrada, podeRegistrarSaida, recalcularValor,
  situacaoDoCnpjInformado, validarConfiguracaoDaPresenca, type RealizadoParaCalculo,
} from "./presenca";
import { completarCnpj } from "./cnpj";

describe("dias da prestação — a mesma fonte do Realizado", () => {
  it("dias trabalhados gravados vencem (ordenados, sem repetição)", () => {
    const p = periodoDaPrestacao({ workedDays: ["2026-11-03", "2026-11-01", "2026-11-03"] }, { scheduleStartDate: "2026-10-01", scheduleEndDate: "2026-10-05" });
    expect(p).toEqual({ fonte: "dias_trabalhados", inicio: "2026-11-01", fim: "2026-11-03", dias: ["2026-11-01", "2026-11-03"] });
  });
  it("sem dias gravados: o período da escala, dia a dia", () => {
    expect(diasDaPrestacao({ workedDays: [] }, { scheduleStartDate: "2026-11-01", scheduleEndDate: "2026-11-03" }))
      .toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });
  it("sem escala: as datas do evento; sem nada: vazio", () => {
    expect(periodoDaPrestacao({ workedDays: null }, null, { startDate: "2026-11-05", endDate: "2026-11-06" }).fonte).toBe("evento");
    expect(periodoDaPrestacao({}, { scheduleStartDate: "2026-11-01", scheduleEndDate: null }, null)).toEqual({ fonte: "nenhuma", inicio: null, fim: null, dias: [] });
  });
  it("a vaga da prestação: mesmo colaborador e evento, não excluída, a da mesma função primeiro", () => {
    const vagas = [
      { id: "a", collaboratorId: "c", eventId: "e", functionId: "f1", deletedAt: null },
      { id: "b", collaboratorId: "c", eventId: "e", functionId: "f2", deletedAt: null },
      { id: "x", collaboratorId: "c", eventId: "e", functionId: "f2", deletedAt: new Date() },
    ];
    expect(inclusaoDaPrestacao({ collaboratorId: "c", eventId: "e", functionId: "f2" }, vagas)?.id).toBe("b");
    expect(inclusaoDaPrestacao({ collaboratorId: "c", eventId: "e", functionId: "f9" }, vagas)?.id).toBe("a");
    expect(inclusaoDaPrestacao({ collaboratorId: null, eventId: "e" }, vagas)).toBeUndefined();
  });
});

describe("janela do check-in — horário de Brasília", () => {
  it("23:59 de Brasília ainda é o mesmo dia (em UTC já virou)", () => {
    expect(diaEmBrasilia(new Date("2026-11-02T02:59:00Z"))).toBe("2026-11-01");
    expect(diaEmBrasilia(new Date("2026-11-02T03:00:00Z"))).toBe("2026-11-02");
  });
  it("hora local e instante: 08:30 em Brasília = 11:30 UTC; ida e volta", () => {
    const i = instanteEmBrasilia("2026-11-01", "08:30");
    expect(i.toISOString()).toBe("2026-11-01T11:30:00.000Z");
    expect(horaEmBrasilia(i)).toBe("08:30");
    expect(instanteEmBrasilia("2026-11-01", "23:59").toISOString()).toBe("2026-11-02T02:59:00.000Z");
  });
  const dias = ["2026-11-01", "2026-11-02"];
  it("check-in só no próprio dia (nem antes, nem depois) e uma vez", () => {
    expect(podeRegistrarEntrada({ dia: "2026-11-01", hoje: "2026-11-01", dias }).ok).toBe(true);
    expect(podeRegistrarEntrada({ dia: "2026-11-02", hoje: "2026-11-01", dias }).ok).toBe(false);
    expect(podeRegistrarEntrada({ dia: "2026-11-01", hoje: "2026-11-02", dias }).ok).toBe(false);
    expect(podeRegistrarEntrada({ dia: "2026-11-03", hoje: "2026-11-03", dias }).ok).toBe(false);
    expect(podeRegistrarEntrada({ dia: "2026-11-01", hoje: "2026-11-01", dias, presenca: { checkinEm: new Date() } }).ok).toBe(false);
  });
  it("na virada do dia (UTC 02:59 → 03:00) o check-in do dia anterior fecha", () => {
    const antes = diaEmBrasilia(new Date("2026-11-02T02:59:59Z"));
    const depois = diaEmBrasilia(new Date("2026-11-02T03:00:00Z"));
    expect(podeRegistrarEntrada({ dia: "2026-11-01", hoje: antes, dias }).ok).toBe(true);
    expect(podeRegistrarEntrada({ dia: "2026-11-01", hoje: depois, dias }).ok).toBe(false);
  });
  it("check-out só depois do check-in do mesmo dia, uma vez", () => {
    expect(podeRegistrarSaida({ dia: "2026-11-01", hoje: "2026-11-01", dias }).ok).toBe(false);
    expect(podeRegistrarSaida({ dia: "2026-11-01", hoje: "2026-11-01", dias, presenca: { checkinEm: new Date() } }).ok).toBe(true);
    expect(podeRegistrarSaida({ dia: "2026-11-01", hoje: "2026-11-02", dias, presenca: { checkinEm: new Date() } }).ok).toBe(false);
    expect(podeRegistrarSaida({ dia: "2026-11-01", hoje: "2026-11-01", dias, presenca: { checkinEm: new Date(), checkoutEm: new Date() } }).ok).toBe(false);
  });
});

describe("estado do dia", () => {
  const hoje = "2026-11-02";
  const entrou = { checkinEm: new Date() };
  const saiu = { checkinEm: new Date(), checkoutEm: new Date() };
  it.each([
    ["2026-11-03", null, "futuro"],
    ["2026-11-02", null, "hoje_sem_checkin"],
    ["2026-11-02", entrou, "em_andamento"],
    ["2026-11-01", saiu, "concluido"],
    ["2026-11-01", entrou, "sem_checkout"],
    ["2026-11-01", null, "ausente"],
  ] as const)("%s com %o → %s", (dia, presenca, estado) => {
    expect(estadoDoDia({ dia, hoje, presenca })).toBe(estado);
  });
  it("falta e substituição (ativas) marcam o dia como falta; removida não", () => {
    expect(estadoDoDia({ dia: "2026-11-01", hoje, ocorrencias: [{ tipo: "falta", dia: "2026-11-01" }] })).toBe("falta");
    expect(estadoDoDia({ dia: "2026-11-01", hoje, ocorrencias: [{ tipo: "substituicao", dia: "2026-11-01" }] })).toBe("falta");
    expect(estadoDoDia({ dia: "2026-11-01", hoje, ocorrencias: [{ tipo: "falta", dia: "2026-11-01", removidoEm: new Date() }] })).toBe("ausente");
  });
  it("dias pendentes: sem check-in e sem falta (check-in sem saída conta como presença)", () => {
    expect(diasPendentes({
      dias: ["2026-11-01", "2026-11-02", "2026-11-03"],
      presencas: [{ dia: "2026-11-01", checkinEm: new Date() }],
      ocorrencias: [{ tipo: "falta", dia: "2026-11-02" }],
    })).toEqual(["2026-11-03"]);
  });
  it("confirmação: depois do último dia, ou no último dia já com o check-out; nunca depois do check-out final", () => {
    const dias = ["2026-11-01", "2026-11-02"];
    expect(podeConfirmarPrestacao({ dias, hoje: "2026-11-02", checkoutFinalFeito: false }).ok).toBe(false);
    expect(podeConfirmarPrestacao({ dias, hoje: "2026-11-02", presencaDoUltimoDia: { checkinEm: new Date(), checkoutEm: new Date() }, checkoutFinalFeito: false }).ok).toBe(true);
    expect(podeConfirmarPrestacao({ dias, hoje: "2026-11-03", checkoutFinalFeito: false }).ok).toBe(true);
    expect(podeConfirmarPrestacao({ dias, hoje: "2026-11-03", checkoutFinalFeito: true }).ok).toBe(false);
  });
});

describe("recálculo do valor", () => {
  // Freela, 4 dias (sex 06/11 a seg 09/11/2026): 2 úteis + 2 de fim de semana.
  const dias = ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"];
  const realizado: RealizadoParaCalculo = {
    dailyQuantity: 4, dailyValue: 20_000, totalValue: 4 * 20_000 + 8_000 + 8_000 + 10_000 + 10_000 + 5_000 + 0,
    weekdayLunch: 8_000, weekdayDinner: 8_000, weekendLunch: 10_000, weekendDinner: 10_000, mobility: 5_000, transport: 0,
    collaboratorType: "freela",
  };
  const calc = (ocorrencias: Parameters<typeof recalcularValor>[0]["ocorrencias"], r = realizado) =>
    recalcularValor({ realizado: r, dias, ocorrencias, divisorHoraExtra: 8, nomeDaFuncao: "Montagem" });

  it("sem ocorrências: o valor é o do Realizado", () => {
    const c = calc([]);
    expect(c.valorCalculado).toBe(realizado.totalValue);
    expect(c.diasPagos).toEqual(dias);
    expect(c.linhas.some((l) => l.includes("Sem ocorrências"))).toBe(true);
  });
  it("falta num dia útil tira a diária e a alimentação média do dia útil", () => {
    const c = calc([{ tipo: "falta", dia: "2026-11-09" }]);
    // diária 200 + (80+80)/2 úteis = 80 → −280
    expect(c.valorCalculado).toBe(realizado.totalValue - 28_000);
    expect(c.diasPagos).toEqual(dias.slice(0, 3));
    expect(c.dailyQuantity).toBe(3);
    expect(c.refeicoes).toMatchObject({ weekdayLunch: 4_000, weekdayDinner: 4_000, weekendLunch: 10_000 });
    expect(c.linhas.some((l) => l.startsWith("Falta em 09/11"))).toBe(true);
  });
  it("substituição = falta do titular naquele dia (o substituto vai pela divisão de escalação)", () => {
    expect(calc([{ tipo: "substituicao", dia: "2026-11-07" }]).valorCalculado).toBe(realizado.totalValue - 20_000 - 10_000);
  });
  it("diária extra põe um dia (diária + alimentação média do tipo de dia)", () => {
    const c = calc([{ tipo: "diaria_extra", dia: "2026-11-10" }]);
    expect(c.valorCalculado).toBe(realizado.totalValue + 20_000 + 8_000);
    expect(c.diasPagos).toEqual([...dias, "2026-11-10"]);
    expect(c.dailyQuantity).toBe(5);
  });
  it("horas extras = horas × (diária ÷ divisor)", () => {
    const c = calc([{ tipo: "horas_extras", horas: "3" }, { tipo: "horas_extras", horas: 1.5, dia: "2026-11-06" }]);
    expect(c.horasExtras).toBe(4.5);
    expect(c.valorDaHora).toBe(2_500);
    expect(c.valorHorasExtras).toBe(11_250);
    expect(c.valorCalculado).toBe(realizado.totalValue + 11_250);
  });
  it("falta repetida no mesmo dia conta uma vez; removida e fora da prestação não contam", () => {
    const c = calc([
      { tipo: "falta", dia: "2026-11-06" }, { tipo: "falta", dia: "2026-11-06" },
      { tipo: "falta", dia: "2026-11-08", removidoEm: new Date() }, { tipo: "falta", dia: "2026-12-01" },
    ]);
    expect(c.diasComFalta).toEqual(["2026-11-06"]);
    expect(c.valorCalculado).toBe(realizado.totalValue - 28_000);
  });
  it("casa (CLT): falta em dia útil não tira diária (só fim de semana tem), só a alimentação", () => {
    const casa = { ...realizado, collaboratorType: "casa", dailyQuantity: 2, totalValue: 2 * 20_000 + 36_000 + 5_000 };
    const c = calc([{ tipo: "falta", dia: "2026-11-06" }], casa);
    expect(c.diariasRemovidas).toBe(0);
    expect(c.valorCalculado).toBe(casa.totalValue - 8_000);
    expect(calc([{ tipo: "falta", dia: "2026-11-07" }], casa).diariasRemovidas).toBe(1);
  });
  it("os campos do Realizado fecham no valor final (subtotal ÷ diárias, como o salvar do modal)", () => {
    const c = calc([{ tipo: "falta", dia: "2026-11-09" }, { tipo: "horas_extras", horas: 2 }]);
    const final = c.valorCalculado + 1_000;
    const campos = camposDoRealizadoNoCheckoutFinal(realizado, c, final);
    expect(campos.totalValue).toBe(final);
    expect(campos.workedDays).toEqual(c.diasPagos);
    expect(campos.dailyQuantity).toBe(3);
    const soma = campos.weekdayLunch + campos.weekdayDinner + campos.weekendLunch + campos.weekendDinner + realizado.mobility + realizado.transport;
    expect(campos.dailyValue).toBe(Math.round((final - soma) / 3));
  });
});

describe("limite do ajuste do produtor (10%)", () => {
  it("dentro de ±10% passa; fora não", () => {
    expect(faixaDoAjuste(100_000, 10)).toEqual({ minimo: 90_000, maximo: 110_000 });
    expect(dentroDoLimite(100_000, 110_000, 10)).toBe(true);
    expect(dentroDoLimite(100_000, 90_000, 10)).toBe(true);
    expect(dentroDoLimite(100_000, 110_001, 10)).toBe(false);
    expect(dentroDoLimite(100_000, 89_999, 10)).toBe(false);
  });
  it("centavos: a margem arredonda para dentro", () => {
    expect(faixaDoAjuste(12_345, 10)).toEqual({ minimo: 11_111, maximo: 13_579 });
  });
  it("ajuste em % com duas casas; calculado zero → null", () => {
    expect(ajusteEmPct(100_000, 105_550)).toBe(5.55);
    expect(ajusteEmPct(0, 1_000)).toBeNull();
  });
});

describe("CNPJ informado × contratos do colaborador", () => {
  const cnpj = completarCnpj("112223330001");
  const outro = completarCnpj("445556660001");
  const contratos = [{ id: "k1", cnpj: cnpj.replace(/\D/g, ""), vigenciaInicio: "2026-01-01", vigenciaFim: "2026-12-31" }];
  it("ativo, sem contrato e sem CNPJ", () => {
    expect(situacaoDoCnpjInformado(cnpj, contratos, "2026-11-01")).toEqual({ situacao: "contrato_ativo", contratoId: "k1" });
    expect(situacaoDoCnpjInformado(outro, contratos, "2026-11-01").situacao).toBe("sem_contrato");
    expect(situacaoDoCnpjInformado(null, contratos, "2026-11-01").situacao).toBe("sem_cnpj");
  });
  it("contrato vencido do colaborador → contrato_inativo (pendência, não bloqueio)", () => {
    expect(situacaoDoCnpjInformado(cnpj, contratos, "2027-02-01")).toEqual({ situacao: "contrato_inativo", contratoId: "k1" });
  });
});

describe("configurações (padrão provisório)", () => {
  it("sem linha gravada vale o padrão; valor inválido também", () => {
    expect(lerConfiguracaoDaPresenca([])).toEqual(CONFIGURACAO_PADRAO);
    const c = lerConfiguracaoDaPresenca([{ key: "hora_extra_divisor", value: "abc" }, { key: "produtor_ajuste_max_pct", value: "15" }, { key: "presenca_selfie_obrigatoria", value: "false" }]);
    expect(c.horaExtraDivisor).toBe(8);
    expect(c.produtorAjusteMaxPct).toBe(15);
    expect(c.selfieObrigatoria).toBe(false);
  });
  it("o termo padrão é rascunho e diz isso", () => {
    expect(CONFIGURACAO_PADRAO.termoTexto.startsWith("RASCUNHO")).toBe(true);
  });
  it("validação: número fora da faixa e texto do termo mudado sem versão nova são recusados", () => {
    expect(validarConfiguracaoDaPresenca({ produtorAjusteMaxPct: 150 }, CONFIGURACAO_PADRAO)).toHaveProperty("erro");
    expect(validarConfiguracaoDaPresenca({ termoTexto: "Texto novo do termo, com mais de vinte caracteres." }, CONFIGURACAO_PADRAO)).toHaveProperty("erro");
    const ok = validarConfiguracaoDaPresenca({ termoTexto: "Texto novo do termo, com mais de vinte caracteres.", termoVersao: "v2", produtorAjusteMaxPct: 12 }, CONFIGURACAO_PADRAO);
    expect(ok).not.toHaveProperty("erro");
    if (!("erro" in ok)) expect(ok.gravar).toMatchObject({ produtor_ajuste_max_pct: "12", presenca_termo_versao: "v2" });
  });
});

describe("acesso do colaborador", () => {
  it("senha: 8+ caracteres com letra e número", () => {
    expect(erroDaSenha("curta1")).toBeTruthy();
    expect(erroDaSenha("semnumeros")).toBeTruthy();
    expect(erroDaSenha("boa-senha-1")).toBeNull();
  });
  it("CPF do cadastro: principal ou secundário marcado como CPF; máscara nunca mostra tudo", () => {
    expect(cpfDoCadastro({ officialDocument: "123.456.789-09", documentType: "cpf" })).toBe("12345678909");
    expect(cpfDoCadastro({ officialDocument: "MG-12.345.678", documentType: "rg", secondaryDocument: "12345678909", secondaryDocumentType: "CPF" })).toBe("12345678909");
    expect(cpfDoCadastro({ officialDocument: "MG-12", documentType: "rg" })).toBeNull();
    expect(cpfMascarado("12345678909")).toBe("•••.456.789-••");
  });
});
