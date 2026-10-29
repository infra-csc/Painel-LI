import { describe, expect, it } from "vitest";
import {
  CONFIGURACAO_PADRAO, ajusteEmPct, camposDoRealizadoNoCheckoutFinal, cpfDoCadastro, cpfMascarado, dentroDoLimite, diaEmBrasilia,
  diasDaPrestacao, diasPendentes, erroDaSenha, estadoDoDia, faixaDoAjuste, horaEmBrasilia, inclusaoDaPrestacao, instanteEmBrasilia,
  lerConfiguracaoDaPresenca, periodoDaPrestacao, podeConfirmarPrestacao, podeRegistrarEntrada, podeRegistrarSaida, recalcularValor,
  situacaoDoCnpjInformado, validarConfiguracaoDaPresenca, type RealizadoParaCalculo,
  baseDoCheckoutFinal, baseComDobras, erroDaOcorrencia, realizadoParaCalculo,
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
  it("horas extras = horas × (diária do dia ÷ divisor); sem dia não contam (28/10, revisão S2)", () => {
    const c = calc([{ tipo: "horas_extras", horas: "3", dia: "2026-11-07" }, { tipo: "horas_extras", horas: 1.5, dia: "2026-11-06" }, { tipo: "horas_extras", horas: 2 }]);
    expect(c.horasExtras).toBe(4.5);
    expect(c.valorDaHora).toBe(2_500);
    expect(c.valorHorasExtras).toBe(11_250);
    expect(c.valorCalculado).toBe(realizado.totalValue + 11_250);
    expect(c.linhas.some((l) => l.includes("sem dia"))).toBe(true);
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
    const c = calc([{ tipo: "falta", dia: "2026-11-09" }, { tipo: "horas_extras", horas: 2, dia: "2026-11-06" }]);
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

describe("revisão 28/10 — recálculo por DIA (R2, R3, R8, S2)", () => {
  // Freela, seg 02/11 a qui 05/11/2026, diária R$ 100, 1,5 no 3º dia (subtotal R$ 450), sem alimentação.
  const dias = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
  const comMeia: RealizadoParaCalculo = {
    dailyQuantity: 4, dailyValue: 11_250, totalValue: 45_000, weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0,
    mobility: 0, transport: 0, collaboratorType: "freela", diasMeiaExtra: ["2026-11-04"],
  };
  const calc = (ocorrencias: Parameters<typeof recalcularValor>[0]["ocorrencias"], r: RealizadoParaCalculo = comMeia, o: { horaExtraMaxDia?: number } = {}) =>
    recalcularValor({ realizado: r, dias, ocorrencias, divisorHoraExtra: 8, nomeDaFuncao: "Montagem", ...o });

  it("R3: falta no dia de 1,5 tira o valor DELE (R$ 150): fica R$ 300", () => {
    expect(calc([{ tipo: "falta", dia: "2026-11-04" }]).valorCalculado).toBe(30_000);
  });
  it("R3: falta num dia normal tira R$ 100 (não a média de R$ 112,50): fica R$ 350", () => {
    expect(calc([{ tipo: "falta", dia: "2026-11-02" }]).valorCalculado).toBe(35_000);
  });
  it("R3: o check-out final tira o dia que saiu da lista de 1,5", () => {
    const fora = calc([{ tipo: "falta", dia: "2026-11-04" }]);
    expect(camposDoRealizadoNoCheckoutFinal(comMeia, fora, fora.valorCalculado).diasMeiaExtra).toEqual([]);
    const fica = calc([{ tipo: "falta", dia: "2026-11-02" }]);
    expect(camposDoRealizadoNoCheckoutFinal(comMeia, fica, fica.valorCalculado).diasMeiaExtra).toEqual(["2026-11-04"]);
  });
  it("R8: casa em dia útil não tem diária — a hora extra vai pela folha (0, com o aviso)", () => {
    const casa: RealizadoParaCalculo = { ...comMeia, collaboratorType: "casa", dailyQuantity: 0, dailyValue: 0, totalValue: 0, diasMeiaExtra: [] };
    const c = calc([{ tipo: "horas_extras", horas: 4, dia: "2026-11-03" }], casa);
    expect(c.valorHorasExtras).toBe(0);
    expect(c.valorCalculado).toBe(0);
    expect(c.linhas.some((l) => l.includes("folha"))).toBe(true);
  });
  it("S2: horas extras com teto por dia (12 h padrão, configurável)", () => {
    const semMeia = { ...comMeia, totalValue: 40_000, dailyValue: 10_000, diasMeiaExtra: [] };
    const c = calc([{ tipo: "horas_extras", horas: 8, dia: "2026-11-02" }, { tipo: "horas_extras", horas: 7, dia: "2026-11-02" }], semMeia);
    expect(c.horasExtras).toBe(12);
    expect(c.valorHorasExtras).toBe(15_000);
    expect(calc([{ tipo: "horas_extras", horas: 8, dia: "2026-11-02" }], semMeia, { horaExtraMaxDia: 4 }).horasExtras).toBe(4);
    expect(CONFIGURACAO_PADRAO.horaExtraMaxDia).toBe(12);
  });
  it("R2: o 2º check-out final (depois da devolução) recalcula da BASE — as horas extras não contam duas vezes", () => {
    const base: RealizadoParaCalculo = { ...comMeia, totalValue: 40_000, dailyValue: 10_000, diasMeiaExtra: [] };
    const ocorrencias = [{ tipo: "horas_extras", horas: 8, dia: "2026-11-02" }];
    const primeiro = calc(ocorrencias, base);
    expect(primeiro.valorCalculado).toBe(50_000);
    const gravado = { ...base, ...camposDoRealizadoNoCheckoutFinal(base, primeiro, primeiro.valorCalculado), baseCheckoutFinal: baseDoCheckoutFinal({ ...base, workedDays: dias }) };
    // Antes: recalculava do total já ajustado (R$ 500) → R$ 625.
    const segundo = recalcularValor({ realizado: realizadoParaCalculo(gravado), dias, ocorrencias, divisorHoraExtra: 8, nomeDaFuncao: "Montagem" });
    expect(segundo.valorCalculado).toBe(50_000);
  });
});

describe("dobra de turno na presença (29/10)", () => {
  // Freela, seg 02/11 a qui 05/11/2026, diária R$ 100, DOBRA na terça 03/11:
  // subtotal R$ 500 e 5 diárias (o dia com dobra paga 2), sem alimentação.
  const dias = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
  const comDobra: RealizadoParaCalculo = {
    dailyQuantity: 5, dailyValue: 10_000, totalValue: 50_000, weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0,
    mobility: 0, transport: 0, collaboratorType: "freela", diasDobra: ["2026-11-03"],
  };
  const calc = (ocorrencias: Parameters<typeof recalcularValor>[0]["ocorrencias"], r: RealizadoParaCalculo = comDobra) =>
    recalcularValor({ realizado: r, dias, ocorrencias, divisorHoraExtra: 8, nomeDaFuncao: "Montagem" });

  it("sem ocorrências: o calculado já tem a dobra (fato do dia, não ajuste) e a memória diz", () => {
    const c = calc([]);
    expect(c.valorCalculado).toBe(50_000);
    expect(c.dailyQuantity).toBe(5);
    expect(c.diasDobra).toEqual(["2026-11-03"]);
    expect(c.linhas[0]).toContain("1 dobra de turno (03/11)");
  });

  it("falta no dia com dobra tira as DUAS diárias do dia: fica R$ 300 e 3 diárias", () => {
    const c = calc([{ tipo: "falta", dia: "2026-11-03" }]);
    expect(c.valorCalculado).toBe(30_000);
    expect(c.dailyQuantity).toBe(3);
    expect(c.diariasRemovidas).toBe(2);
    expect(c.diasDobra).toEqual([]);
    expect(c.linhas.some((l) => l.includes("Falta em 03/11") && l.includes("dobra: 2 diárias"))).toBe(true);
  });

  it("falta noutro dia tira R$ 100 e mantém a dobra; o check-out final grava a dobra que ficou", () => {
    const c = calc([{ tipo: "falta", dia: "2026-11-02" }]);
    expect(c.valorCalculado).toBe(40_000);
    expect(c.dailyQuantity).toBe(4);
    const campos = camposDoRealizadoNoCheckoutFinal(comDobra, c, c.valorCalculado);
    expect(campos.diasDobra).toEqual(["2026-11-03"]);
    expect(campos.workedDays).toEqual(["2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(campos.dailyValue).toBe(10_000);
  });

  it("horas extras no dia com dobra: a hora é a da diária do dia (não a dobrada)", () => {
    const c = calc([{ tipo: "horas_extras", horas: 8, dia: "2026-11-03" }]);
    expect(c.valorHorasExtras).toBe(10_000);
    expect(c.valorCalculado).toBe(60_000);
  });

  it("a base do check-out final guarda a dobra; o 2º check-out (depois da devolução) recalcula com ela", () => {
    const base = baseDoCheckoutFinal({ ...comDobra, workedDays: dias });
    expect(base.diasDobra).toEqual(["2026-11-03"]);
    const primeiro = calc([{ tipo: "horas_extras", horas: 8, dia: "2026-11-02" }]);
    const gravado = { ...comDobra, ...camposDoRealizadoNoCheckoutFinal(comDobra, primeiro, primeiro.valorCalculado), baseCheckoutFinal: base };
    const segundo = recalcularValor({ realizado: realizadoParaCalculo(gravado), dias, ocorrencias: [{ tipo: "horas_extras", horas: 8, dia: "2026-11-02" }], divisorHoraExtra: 8, nomeDaFuncao: "Montagem" });
    expect(segundo.valorCalculado).toBe(60_000);
    expect(segundo.diasDobra).toEqual(["2026-11-03"]);
  });

  it("baseComDobras: dobra marcada depois do 1º check-out final entra na base (e sai, se tirada)", () => {
    const semDobra = baseDoCheckoutFinal({ ...comDobra, dailyQuantity: 4, totalValue: 40_000, diasDobra: null, workedDays: dias });
    const comNova = baseComDobras({ base: semDobra, dias, diasDobra: ["2026-11-03"], collaboratorType: "freela", nomeDaFuncao: "Montagem" });
    expect(comNova).toMatchObject({ totalValue: 50_000, dailyQuantity: 5, dailyValue: 10_000, diasDobra: ["2026-11-03"] });
    expect(recalcularValor({ realizado: comNova, dias, ocorrencias: [], divisorHoraExtra: 8, nomeDaFuncao: "Montagem" }).valorCalculado).toBe(50_000);
    const tirada = baseComDobras({ base: comNova, dias, diasDobra: [], collaboratorType: "freela", nomeDaFuncao: "Montagem" });
    expect(tirada).toMatchObject({ totalValue: 40_000, dailyQuantity: 4, diasDobra: null });
    // Sem mudança: a mesma base.
    expect(baseComDobras({ base: comNova, dias, diasDobra: ["2026-11-03"], collaboratorType: "freela", nomeDaFuncao: "Montagem" })).toBe(comNova);
  });

  it("baseComDobras: dobra num dia de 1,5 substitui o ½; dia sem diária (casa em dia útil) é ignorado", () => {
    const comMeia = baseDoCheckoutFinal({ ...comDobra, dailyQuantity: 4, totalValue: 45_000, diasDobra: null, diasMeiaExtra: ["2026-11-04"], workedDays: dias });
    const r = baseComDobras({ base: comMeia, dias, diasDobra: ["2026-11-04"], collaboratorType: "freela", nomeDaFuncao: "Montagem" });
    expect(r).toMatchObject({ totalValue: 50_000, dailyQuantity: 5, diasMeiaExtra: null, diasDobra: ["2026-11-04"] });
    const casa = baseDoCheckoutFinal({ ...comDobra, collaboratorType: "casa", dailyQuantity: 0, totalValue: 0, diasDobra: null, workedDays: dias });
    expect(baseComDobras({ base: casa, dias, diasDobra: ["2026-11-03"], collaboratorType: "casa", nomeDaFuncao: "Montagem" })).toBe(casa);
  });

  it("baseComDobras: ½ marcado ou tirado depois do 1º check-out final também entra na base (29/10)", () => {
    const semMeia = baseDoCheckoutFinal({ ...comDobra, dailyQuantity: 4, totalValue: 40_000, diasDobra: null, diasMeiaExtra: null, workedDays: dias });
    const comMeia = baseComDobras({ base: semMeia, dias, diasDobra: null, diasMeiaExtra: ["2026-11-03"], collaboratorType: "freela", nomeDaFuncao: "Montagem" });
    // ½ não conta na quantidade (não é número inteiro): só o valor sobe.
    expect(comMeia).toMatchObject({ totalValue: 45_000, dailyQuantity: 4, diasMeiaExtra: ["2026-11-03"], diasDobra: null });
    const tirada = baseComDobras({ base: comMeia, dias, diasDobra: null, diasMeiaExtra: [], collaboratorType: "freela", nomeDaFuncao: "Montagem" });
    expect(tirada).toMatchObject({ totalValue: 40_000, dailyQuantity: 4, diasMeiaExtra: null });
    // diasMeiaExtra ausente mantém os ½ da base.
    expect(baseComDobras({ base: comMeia, dias, diasDobra: null, collaboratorType: "freela", nomeDaFuncao: "Montagem" })).toBe(comMeia);
  });
});

describe("revisão 28/10 — quem lança o quê e quando (S2)", () => {
  const base = {
    dias: ["2026-11-02", "2026-11-03", "2026-11-04"], diasExtras: [] as string[], ocorrencias: [] as { tipo: string; dia: string | null; horas?: number | string | null }[],
    periodoDaVaga: { inicio: "2026-11-02", fim: "2026-11-04" }, horaExtraMaxDia: 12, financeiras: true,
  };
  it("Área de Função só lança falta e substituição", () => {
    expect(erroDaOcorrencia({ ...base, financeiras: false, tipo: "horas_extras", dia: "2026-11-02", horas: 2 })).toMatchObject({ status: 403 });
    expect(erroDaOcorrencia({ ...base, financeiras: false, tipo: "diaria_extra", dia: "2026-11-05" })).toMatchObject({ status: 403 });
    expect(erroDaOcorrencia({ ...base, financeiras: false, tipo: "falta", dia: "2026-11-02" })).toBeNull();
  });
  it("horas extras: dia obrigatório, dia da prestação e até o teto do dia (somando o que já foi lançado)", () => {
    expect(erroDaOcorrencia({ ...base, tipo: "horas_extras", dia: null, horas: 2 })).toMatchObject({ status: 400 });
    expect(erroDaOcorrencia({ ...base, tipo: "horas_extras", dia: "2026-11-09", horas: 2 })).toMatchObject({ status: 400 });
    expect(erroDaOcorrencia({ ...base, tipo: "horas_extras", dia: "2026-11-02", horas: 13 })).toMatchObject({ status: 400 });
    expect(erroDaOcorrencia({ ...base, ocorrencias: [{ tipo: "horas_extras", dia: "2026-11-02", horas: 10 }], tipo: "horas_extras", dia: "2026-11-02", horas: 3 })).toMatchObject({ status: 400 });
    expect(erroDaOcorrencia({ ...base, tipo: "horas_extras", dia: "2026-11-02", horas: 12 })).toBeNull();
  });
  it("diária extra: só no período da vaga ± 2 dias e uma por data", () => {
    expect(erroDaOcorrencia({ ...base, tipo: "diaria_extra", dia: "2026-11-06" })).toBeNull();
    expect(erroDaOcorrencia({ ...base, tipo: "diaria_extra", dia: "2026-10-31" })).toBeNull();
    expect(erroDaOcorrencia({ ...base, tipo: "diaria_extra", dia: "2026-11-07" })).toMatchObject({ status: 400 });
    expect(erroDaOcorrencia({ ...base, tipo: "diaria_extra", dia: "2027-01-10" })).toMatchObject({ status: 400 });
    expect(erroDaOcorrencia({ ...base, ocorrencias: [{ tipo: "diaria_extra", dia: "2026-11-06" }], tipo: "diaria_extra", dia: "2026-11-06" })).toMatchObject({ status: 409 });
  });
});
