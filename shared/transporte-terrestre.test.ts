import { describe, expect, it } from "vitest";
import {
  FORMULARIO_TERRESTRE_VAZIO,
  centavosDoTexto,
  comModoTerrestre,
  coberturaTerrestre,
  dividirCentavos,
  formularioDosRegistros,
  itensDoFormulario,
  modoDoTexto,
  pernasDaVaga,
  rotuloDaCobertura,
  sugestaoTerrestreDaVaga,
  textoDoTrecho,
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

  it("ônibus é tratado como a van (empresa + valor)", () => {
    expect(validarTrechoTerrestre({ trecho: "ida", modo: "onibus", valorCentavos: 9_000 }).ok).toBe(false);
    expect(validarTrechoTerrestre({ trecho: "ida", modo: "onibus", empresa: "Cometa", valorCentavos: 9_000 }).ok).toBe(true);
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

describe("itensDoFormulario — modal da vaga e lote", () => {
  it("carro ida e volta iguais: um item por perna com o valor de cada perna", () => {
    const r = itensDoFormulario(form({ modo: "carro", valor: "300" }), ["v1"]);
    expect(r).toEqual({
      ok: true,
      itens: [
        { teamInclusionId: "v1", trecho: "ida", modo: "carro", empresa: null, valorCentavos: 30_000 },
        { teamInclusionId: "v1", trecho: "volta", modo: "carro", empresa: null, valorCentavos: 30_000 },
      ],
    });
  });

  it("van sem empresa e sem valor: os dois erros, nos campos", () => {
    const r = itensDoFormulario(form({ modo: "van" }), ["v1"]);
    expect(r).toEqual({ ok: false, erros: { empresa: "Nome da empresa é obrigatório", valor: "Valor é obrigatório" } });
  });

  it("carro sem valor diz 'Valor do carro'", () => {
    const r = itensDoFormulario(form({ modo: "carro" }), ["v1"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.valor).toBe("Valor do carro é obrigatório");
  });

  it("nenhuma perna marcada é erro", () => {
    const r = itensDoFormulario(form({ ida: false, volta: false, modo: "carro", valor: "1" }), ["v1"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.pernas).toBeTruthy();
  });

  it("volta diferente: ida de van, volta de carro", () => {
    const r = itensDoFormulario(form({ modo: "van", empresa: "Cometa", valor: "600", voltaIgual: false, modoVolta: "carro", valorVolta: "250" }), ["v1"]);
    expect(r.ok && r.itens.map((i) => [i.trecho, i.modo, i.empresa, i.valorCentavos])).toEqual([
      ["ida", "van", "Cometa", 60_000],
      ["volta", "carro", null, 25_000],
    ]);
  });

  it("só a volta: o bloco principal vale para a volta", () => {
    const r = itensDoFormulario(form({ ida: false, volta: true, modo: "van", empresa: "X", valor: "500" }), ["v1"]);
    expect(r.ok && r.itens).toEqual([{ teamInclusionId: "v1", trecho: "volta", modo: "van", empresa: "X", valorCentavos: 50_000 }]);
  });

  it("lote 'dividir': a van de R$ 1.200 por perna repartida entre 8 vagas", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `v${i}`);
    const r = itensDoFormulario(form({ modo: "van", empresa: "Cometa", valor: "1.200,00", divisao: "dividir" }), ids);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.itens).toHaveLength(16);
      expect(new Set(r.itens.map((i) => i.valorCentavos))).toEqual(new Set([15_000]));
    }
  });

  it("lote 'cada': o mesmo valor em todas as vagas", () => {
    const r = itensDoFormulario(form({ ida: true, volta: false, modo: "carro", valor: "300" }), ["a", "b", "c"]);
    expect(r.ok && r.itens.map((i) => i.valorCentavos)).toEqual([30_000, 30_000, 30_000]);
  });

  it("dividir centavos demais entre vagas demais é recusado", () => {
    const r = itensDoFormulario(form({ modo: "carro", valor: "0,05", divisao: "dividir" }), Array.from({ length: 8 }, (_, i) => `v${i}`));
    expect(r.ok).toBe(false);
  });
});

describe("formularioDosRegistros — editar o que está gravado", () => {
  it("ida e volta iguais voltam como 'volta igual'", () => {
    const f = formularioDosRegistros([
      { trecho: "ida", modo: "van", empresa: "X", valorCentavos: 120_000 },
      { trecho: "volta", modo: "van", empresa: "X", valorCentavos: 120_000 },
    ], ["ida", "volta"]);
    expect(f).toMatchObject({ ida: true, volta: true, modo: "van", empresa: "X", valor: "1.200,00", voltaIgual: true });
  });

  it("sem registro: as pernas da vaga e o modo da Sugestão já marcados", () => {
    expect(formularioDosRegistros([], ["ida"], { ida: "van" })).toMatchObject({ ida: true, volta: false, modo: "van", valor: "" });
  });
});
