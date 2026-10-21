import { describe, expect, it } from "vitest";
import {
  FORMULARIO_TERRESTRE_VAZIO,
  centavosDoTexto,
  comModoTerrestre,
  coberturaTerrestre,
  dividirCentavos,
  entradasDaViagem,
  formularioDosRegistros,
  itensDoFormulario,
  modoDoTexto,
  modoSugerido,
  ordenarParaRateio,
  pernasDaVaga,
  planoDoValor,
  ratearTotal,
  rotuloDaCobertura,
  sugestaoTerrestreDaVaga,
  textoDoGrupo,
  textoDoTrecho,
  totalDividido,
  validarEdicaoDoGrupo,
  validarTrechoTerrestre,
  type FormularioTerrestre,
} from "./transporte-terrestre";

const form = (f: Partial<FormularioTerrestre>): FormularioTerrestre => ({ ...FORMULARIO_TERRESTRE_VAZIO, ...f });

describe("validarTrechoTerrestre — a regra do dono (16/10)", () => {
  it("carro: só o valor; a empresa é descartada", () => {
    const r = validarTrechoTerrestre({ trecho: "ida", modo: "carro", empresa: "qualquer", valorCentavos: 30_000 });
    expect(r).toEqual({ ok: true, valor: { trecho: "ida", modo: "carro", empresa: null, valorCentavos: 30_000 } });
  });

  it("van: empresa E valor obrigatórios", () => {
    const sem = validarTrechoTerrestre({ trecho: "volta", modo: "van", empresa: "  ", valorCentavos: 0 });
    expect(sem.ok).toBe(false);
    if (!sem.ok) {
      expect(sem.erros.empresa).toMatch(/empresa/);
      expect(sem.erros.valorCentavos).toMatch(/valor/);
    }
    const ok = validarTrechoTerrestre({ trecho: "volta", modo: "van", empresa: "  Viação   Cometa ", valorCentavos: 120_000 });
    expect(ok).toEqual({ ok: true, valor: { trecho: "volta", modo: "van", empresa: "Viação Cometa", valorCentavos: 120_000 } });
  });

  it("ônibus saiu das opções (21/10): o registro novo é recusado, mesmo com empresa", () => {
    const r = validarTrechoTerrestre({ trecho: "ida", modo: "onibus", empresa: "Cometa", valorCentavos: 9_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.modo).toBe("Escolha carro ou van.");
  });

  it("recusa modo e trecho fora do domínio, valor quebrado e valor absurdo", () => {
    const r = validarTrechoTerrestre({ trecho: "meio", modo: "aereo", valorCentavos: 10.5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(["modo", "trecho", "valorCentavos"]);
    const alto = validarTrechoTerrestre({ trecho: "ida", modo: "carro", valorCentavos: 10_000_001 });
    expect(alto.ok).toBe(false);
  });
});

describe("centavosDoTexto", () => {
  it.each([
    ["1.200,00", 120_000], ["1200", 120_000], ["300,5", 30_050], ["R$ 1.200", 120_000], ["1200.50", 120_050], ["0,99", 99],
  ])("%s → %i", (texto, esperado) => expect(centavosDoTexto(texto)).toBe(esperado));

  it("texto que não é número vira null (nunca R$ 0 calado)", () => {
    expect(centavosDoTexto("ABC123")).toBeNull();
    expect(centavosDoTexto("")).toBeNull();
    expect(centavosDoTexto("1,2,3")).toBeNull();
  });
});

describe("dividirCentavos", () => {
  it("reparte o total sem perder centavo (sobra vai para as primeiras)", () => {
    expect(dividirCentavos(120_000, 8)).toEqual(Array(8).fill(15_000));
    expect(dividirCentavos(1_000, 3)).toEqual([334, 333, 333]);
    expect(dividirCentavos(1_000, 3).reduce((a, b) => a + b, 0)).toBe(1_000);
  });
});

describe("pernas e cobertura da vaga", () => {
  it("só ida, só volta e volta que segue para outro evento", () => {
    expect(pernasDaVaga({})).toEqual(["ida", "volta"]);
    expect(pernasDaVaga({ trechosSugeridos: "so_ida" })).toEqual(["ida"]);
    expect(pernasDaVaga({ trechosSugeridos: "so_volta" })).toEqual(["volta"]);
    expect(pernasDaVaga({ voltaSegueParaEventoId: "ev-2" })).toEqual(["ida"]);
  });

  it("cobre tudo só quando todas as pernas da vaga são terrestres", () => {
    const ida = { trecho: "ida" as const, modo: "van" as const, empresa: "X", valorCentavos: 60_000 };
    const volta = { trecho: "volta" as const, modo: "van" as const, empresa: "X", valorCentavos: 60_000 };
    expect(coberturaTerrestre({}, [ida]).cobreTudo).toBe(false);
    expect(coberturaTerrestre({}, [ida]).semTerrestre).toEqual(["volta"]);
    expect(coberturaTerrestre({}, [ida, volta])).toMatchObject({ cobreTudo: true, totalCentavos: 120_000, semTerrestre: [] });
    expect(coberturaTerrestre({ trechosSugeridos: "so_ida" }, [ida]).cobreTudo).toBe(true);
    expect(coberturaTerrestre({}, []).cobreTudo).toBe(false);
  });

  it("rótulo: um modo só diz qual; modos diferentes, 'Terrestre'", () => {
    const c = (modos: Array<"carro" | "van">) => coberturaTerrestre({}, modos.map((m, i) => ({ trecho: i === 0 ? "ida" as const : "volta" as const, modo: m, empresa: null, valorCentavos: 1 })));
    expect(rotuloDaCobertura(c(["van", "van"]))).toBe("Vai de van");
    expect(rotuloDaCobertura(c(["carro"]))).toBe("Vai de carro");
    expect(rotuloDaCobertura(c(["carro", "van"]))).toBe("Terrestre");
  });

  it("texto da linha: 'Carro · R$ 300,00' e 'Van · Empresa · R$ 1.200,00'", () => {
    expect(textoDoTrecho({ modo: "carro", empresa: null, valorCentavos: 30_000 })).toBe("Carro · R$ 300,00");
    expect(textoDoTrecho({ modo: "van", empresa: "Empresa X", valorCentavos: 120_000 })).toBe("Van · Empresa X · R$ 1.200,00");
  });
});

describe("o que a Sugestão já diz (prints do dono)", () => {
  it.each([
    ["van - 7h saindo", "van"], ["14h carro", "carro"], ["carro - 18h", "carro"], ["9h - onibus", "onibus"],
    ["Ônibus 22h", "onibus"], ["07:30", null], ["caravana 8h", null],
  ])("%s → %s", (texto, modo) => expect(modoDoTexto(texto)).toBe(modo));

  it("o campo de transporte da Validação manda; sem ele, o texto do horário", () => {
    expect(sugestaoTerrestreDaVaga({ flightArrivalSuggestedTime: "van - 7h saindo", flightReturnSuggestedTime: "carro - 18h" }))
      .toEqual({ ida: "van", volta: "carro" });
    expect(sugestaoTerrestreDaVaga({ transportModeIda: "aereo", flightArrivalSuggestedTime: "van - 7h" })).toEqual({});
    expect(sugestaoTerrestreDaVaga({ transportModeIda: "carro", transportModeVolta: "onibus" })).toEqual({ ida: "carro", volta: "onibus" });
    expect(sugestaoTerrestreDaVaga({ trechosSugeridos: "so_ida", flightReturnSuggestedTime: "van" })).toEqual({});
  });
});

describe("Busca de passagens: perna terrestre não é aérea", () => {
  it("troca o modo só das pernas registradas", () => {
    const v = { id: "v1", transportModeIda: null, transportModeVolta: "aereo" };
    expect(comModoTerrestre(v, [{ trecho: "ida", modo: "carro", empresa: null, valorCentavos: 1 }]))
      .toEqual({ id: "v1", transportModeIda: "carro", transportModeVolta: "aereo" });
    expect(comModoTerrestre(v, [])).toBe(v);
  });
});

describe("rateio do total (21/10) — a soma bate exatamente com o total", () => {
  it("R$ 1.000,01 em 3 vagas de ida e volta: vaga 333,34 / 333,34 / 333,33; a ida fica com o centavo ímpar", () => {
    const partes = ratearTotal(100_001, [
      { id: "a", pernas: ["ida", "volta"] }, { id: "b", pernas: ["ida", "volta"] }, { id: "c", pernas: ["volta", "ida"] },
    ]);
    expect(partes.map((p) => [p.teamInclusionId, p.trecho, p.valorCentavos])).toEqual([
      ["a", "ida", 16_667], ["a", "volta", 16_667],
      ["b", "ida", 16_667], ["b", "volta", 16_667],
      ["c", "ida", 16_667], ["c", "volta", 16_666],
    ]);
    expect(partes.reduce((s, p) => s + p.valorCentavos, 0)).toBe(100_001);
  });

  it("a van de R$ 1.200 com 8 vagas: R$ 150 cada (R$ 75 na ida, R$ 75 na volta)", () => {
    const vagas = Array.from({ length: 8 }, (_, i) => ({ id: `v${i}`, pernas: ["ida", "volta"] as const }));
    const partes = ratearTotal(120_000, vagas);
    expect(partes).toHaveLength(16);
    expect(new Set(partes.map((p) => p.valorCentavos))).toEqual(new Set([7_500]));
  });

  it("vaga 'só ida' fica com a parte inteira na ida (a divisão é por vaga)", () => {
    const partes = ratearTotal(30_000, [{ id: "a", pernas: ["ida", "volta"] }, { id: "b", pernas: ["ida"] }]);
    expect(partes.map((p) => [p.teamInclusionId, p.trecho, p.valorCentavos])).toEqual([["a", "ida", 7_500], ["a", "volta", 7_500], ["b", "ida", 15_000]]);
  });

  it("muitos totais e tamanhos: nunca perde nem inventa centavo", () => {
    for (const total of [1, 7, 99, 100_001, 123_457, 9_999_999]) {
      for (const n of [1, 2, 3, 7, 13]) {
        const vagas = Array.from({ length: n }, (_, i) => ({ id: `v${i}`, pernas: (i % 3 === 0 ? ["ida"] : ["ida", "volta"]) as Array<"ida" | "volta"> }));
        expect(ratearTotal(total, vagas).reduce((s, p) => s + p.valorCentavos, 0)).toBe(total);
      }
    }
  });

  it("a ordem do rateio é pelo número da vaga (as sem número no fim), não pela ordem em que foram marcadas", () => {
    const ordem = ordenarParaRateio([
      { id: "z", inclusionNumber: 4812 }, { id: "y", inclusionNumber: null }, { id: "x", inclusionNumber: 4810 }, { id: "w", inclusionNumber: 4811 },
    ]);
    expect(ordem.map((v) => v.id)).toEqual(["x", "w", "z", "y"]);
  });
});

describe("itensDoFormulario — diálogo da vaga e lote (21/10: valor da viagem toda)", () => {
  const uma = [{ id: "v1", pernas: ["ida", "volta"] as const }];

  it("carro numa vaga: R$ 300 é a viagem toda — R$ 150 na ida e R$ 150 na volta", () => {
    const r = itensDoFormulario(form({ modo: "carro", valor: "300" }), uma);
    expect(r).toEqual({
      ok: true,
      agrupar: false,
      foraDoTrecho: [],
      itens: [
        { teamInclusionId: "v1", trecho: "ida", modo: "carro", empresa: null, valorCentavos: 15_000 },
        { teamInclusionId: "v1", trecho: "volta", modo: "carro", empresa: null, valorCentavos: 15_000 },
      ],
    });
  });

  it("van numa vaga, só a ida marcada: o valor todo vai para a ida", () => {
    const r = itensDoFormulario(form({ volta: false, modo: "van", empresa: "  Transluz  ", valor: "150,00" }), uma);
    expect(r.ok && r.itens).toEqual([{ teamInclusionId: "v1", trecho: "ida", modo: "van", empresa: "Transluz", valorCentavos: 15_000 }]);
  });

  it("van sem empresa e sem valor: os dois erros, nos campos", () => {
    const r = itensDoFormulario(form({ modo: "van" }), uma);
    expect(r).toEqual({ ok: false, erros: { empresa: "Nome da empresa é obrigatório", valor: "Valor da van é obrigatório" } });
  });

  it("carro sem valor diz 'Valor do carro'", () => {
    const r = itensDoFormulario(form({ modo: "carro" }), uma);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.valor).toBe("Valor do carro é obrigatório");
  });

  it("ônibus não se registra mais (21/10)", () => {
    const r = itensDoFormulario({ ...form({ valor: "10" }), modo: "onibus" as never }, uma);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.modo).toBe("Escolha carro ou van.");
  });

  it("nenhuma perna marcada é erro", () => {
    const r = itensDoFormulario(form({ ida: false, volta: false, modo: "carro", valor: "1" }), uma);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.pernas).toBeTruthy();
  });

  it("lote de van: o valor total da van é dividido entre as vagas e agrupado (o 'De cada vaga' não vale para a van)", () => {
    const ids = Array.from({ length: 8 }, (_, i) => ({ id: `v${i}`, pernas: ["ida", "volta"] as const }));
    const r = itensDoFormulario(form({ modo: "van", empresa: "Cometa", valor: "1.200,00", divisao: "cada" }), ids);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.agrupar).toBe(true);
      expect(r.itens).toHaveLength(16);
      expect(r.itens.reduce((s, i) => s + i.valorCentavos, 0)).toBe(120_000);
    }
  });

  it("lote de carro 'de cada vaga': cada vaga com o valor do carro dela, sem grupo", () => {
    const r = itensDoFormulario(form({ volta: false, modo: "carro", valor: "300" }), [{ id: "a", pernas: ["ida", "volta"] }, { id: "b", pernas: ["ida"] }, { id: "c", pernas: ["ida", "volta"] }]);
    expect(r.ok && r.itens.map((i) => i.valorCentavos)).toEqual([30_000, 30_000, 30_000]);
    expect(r.ok && r.agrupar).toBe(false);
  });

  it("lote de carro 'o total, dividido': vira grupo, soma exata", () => {
    const r = itensDoFormulario(form({ modo: "carro", valor: "100,01", divisao: "dividir" }), [{ id: "a", pernas: ["ida", "volta"] }, { id: "b", pernas: ["ida", "volta"] }]);
    expect(r.ok && r.agrupar).toBe(true);
    expect(r.ok && r.itens.map((i) => i.valorCentavos)).toEqual([2_501, 2_500, 2_500, 2_500]);
  });

  it("vaga sem nenhum trecho marcado fica de fora; nenhuma com o trecho → erro com a dica", () => {
    const r = itensDoFormulario(form({ ida: false, modo: "carro", valor: "100" }), [{ id: "a", pernas: ["ida", "volta"] }, { id: "b", pernas: ["ida"] }]);
    expect(r.ok && r.foraDoTrecho).toEqual(["b"]);
    const nada = itensDoFormulario(form({ volta: false, modo: "carro", valor: "100" }), [{ id: "a", pernas: ["volta"] }, { id: "b", pernas: ["volta"] }]);
    expect(nada).toEqual({ ok: false, erros: { pernas: "Nenhuma das vagas marcadas tem o trecho escolhido. Marque a volta." } });
  });

  it("dividir centavos demais entre vagas demais é recusado", () => {
    const r = itensDoFormulario(form({ modo: "van", empresa: "X", valor: "0,05" }), Array.from({ length: 8 }, (_, i) => ({ id: `v${i}`, pernas: ["ida", "volta"] as const })));
    expect(r).toEqual({ ok: false, erros: { valor: "O total dividido entre as vagas fica abaixo de R$ 0,01 por trecho." } });
  });

  it("valor por trecho acima de R$ 100 mil é recusado", () => {
    const r = itensDoFormulario(form({ volta: false, modo: "carro", valor: "150.000,00" }), uma);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.valor).toMatch(/alto demais/);
  });
});

describe("planoDoValor — 'R$ X por vaga' enquanto digita", () => {
  it("van de R$ 1.000,01 em 3 vagas: por vaga de R$ 333,33 a R$ 333,34, total exato", () => {
    const p = planoDoValor(form({ modo: "van", valor: "1.000,01" }), [{ id: "a", pernas: ["ida", "volta"] }, { id: "b", pernas: ["ida", "volta"] }, { id: "c", pernas: ["ida", "volta"] }]);
    expect(p).toMatchObject({ dividir: true, totalCentavos: 100_001, porVagaMin: 33_333, porVagaMax: 33_334, foraDoTrecho: [] });
  });

  it("carro 'de cada vaga': total do lote = valor × vagas", () => {
    const p = planoDoValor(form({ modo: "carro", valor: "300" }), [{ id: "a", pernas: ["ida", "volta"] }, { id: "b", pernas: ["ida", "volta"] }]);
    expect(p).toMatchObject({ dividir: false, totalCentavos: 60_000, porVagaMin: 30_000, porVagaMax: 30_000 });
  });

  it("valor que não é número: null", () => {
    expect(planoDoValor(form({ modo: "van", valor: "abc" }), [{ id: "a", pernas: ["ida"] }])).toBeNull();
  });

  it("totalDividido: van sempre (com 2+ vagas); carro só se escolheu", () => {
    expect(totalDividido({ modo: "van", divisao: "cada" }, 2)).toBe(true);
    expect(totalDividido({ modo: "van", divisao: "cada" }, 1)).toBe(false);
    expect(totalDividido({ modo: "carro", divisao: "cada" }, 5)).toBe(false);
    expect(totalDividido({ modo: "carro", divisao: "dividir" }, 5)).toBe(true);
  });
});

describe("formularioDosRegistros — editar o que está gravado", () => {
  it("ida e volta da mesma van: o valor do formulário é a viagem toda (a soma)", () => {
    const f = formularioDosRegistros([
      { trecho: "ida", modo: "van", empresa: "X", valorCentavos: 7_501 },
      { trecho: "volta", modo: "van", empresa: "X", valorCentavos: 7_500 },
    ], ["ida", "volta"]);
    expect(f).toMatchObject({ ida: true, volta: true, modo: "van", empresa: "X", valor: "150,01" });
  });

  it("ônibus antigo volta sem modo: a pessoa escolhe carro ou van para salvar", () => {
    const f = formularioDosRegistros([{ trecho: "ida", modo: "onibus", empresa: "Cometa", valorCentavos: 9_000 }], ["ida"]);
    expect(f).toMatchObject({ ida: true, volta: false, modo: "", empresa: "Cometa", valor: "90,00" });
  });

  it("sem registro: as pernas da vaga e o modo da Sugestão já marcados", () => {
    expect(formularioDosRegistros([], ["ida"], { ida: "van" })).toMatchObject({ ida: true, volta: false, modo: "van", valor: "" });
  });

  it("Sugestão van na ida e carro na volta: abre de van só com a ida (a volta se registra à parte)", () => {
    expect(formularioDosRegistros([], ["ida", "volta"], { ida: "van", volta: "carro" })).toMatchObject({ ida: true, volta: false, modo: "van" });
  });

  it("Sugestão só de ônibus: sem modo, com as pernas da vaga (quem abriu escolhe)", () => {
    expect(formularioDosRegistros([], ["ida", "volta"], { ida: "onibus", volta: "onibus" })).toMatchObject({ ida: true, volta: true, modo: "" });
  });
});

describe("modoSugerido — '9h - onibus' não vira van", () => {
  it.each([
    [{ ida: "van" as const }, "van"],
    [{ ida: "onibus" as const, volta: "carro" as const }, "carro"],
    [{ ida: "onibus" as const }, undefined],
    [{}, undefined],
  ])("%o → %s", (s, m) => expect(modoSugerido(s)).toBe(m));
});

describe("entradasDaViagem — o que a linha da vaga junta", () => {
  it("mesma van e mesmo grupo: uma entrada com o total da vaga (mesmo com 1 centavo de diferença entre os trechos)", () => {
    const grupo = { id: "g1", totalCentavos: 120_001, vagas: 8 };
    const e = entradasDaViagem([
      { trecho: "volta", modo: "van", empresa: "X", valorCentavos: 7_500, grupo },
      { trecho: "ida", modo: "van", empresa: "X", valorCentavos: 7_501, grupo },
    ]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ pernas: ["ida", "volta"], totalCentavos: 15_001 });
    expect(textoDoGrupo(grupo)).toBe("parte de R$ 1.200,01 · 8 vagas");
  });

  it("ida de van e volta de carro: duas entradas", () => {
    const e = entradasDaViagem([
      { trecho: "ida", modo: "van", empresa: "X", valorCentavos: 100 },
      { trecho: "volta", modo: "carro", empresa: null, valorCentavos: 200 },
    ]);
    expect(e.map((x) => x.pernas)).toEqual([["ida"], ["volta"]]);
  });
});

describe("validarEdicaoDoGrupo — a van inteira", () => {
  it("van: empresa e total obrigatórios; carro descarta a empresa; ônibus não", () => {
    expect(validarEdicaoDoGrupo({ modo: "van", empresa: " ", totalCentavos: 0 }).ok).toBe(false);
    expect(validarEdicaoDoGrupo({ modo: "carro", empresa: "x", totalCentavos: 1_000 })).toEqual({ ok: true, valor: { modo: "carro", empresa: null, totalCentavos: 1_000 } });
    expect(validarEdicaoDoGrupo({ modo: "onibus", empresa: "x", totalCentavos: 1_000 }).ok).toBe(false);
  });
});
