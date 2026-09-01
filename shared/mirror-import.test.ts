import { describe, it, expect } from "vitest";
import {
  COLUNAS_DA_PLANILHA, lerPlanilhaDoEspelho, normalizarNome, paraCentavos, paraData, paraHora,
  totalDeAlteracoes, type PessoaDoEvento,
} from "./mirror-import";

/** Monta uma planilha como o export escreve: contexto, cabeçalho, linhas. */
function planilha(linhas: unknown[][]): unknown[][] {
  return [
    ["Evento: Corrida Vale"],
    ["Endereço: Itabira"],
    ["Data: 2026-05-27 a 2026-05-31"],
    [],
    [...COLUNAS_DA_PLANILHA],
    ...linhas,
  ];
}

/** Uma linha da planilha a partir de pares coluna→valor. */
function linha(nome: string, valores: Record<string, unknown> = {}): unknown[] {
  const out: unknown[] = new Array(COLUNAS_DA_PLANILHA.length).fill("");
  out[0] = nome;
  for (const [coluna, valor] of Object.entries(valores)) {
    const i = (COLUNAS_DA_PLANILHA as readonly string[]).indexOf(coluna);
    if (i < 0) throw new Error(`coluna inexistente no teste: ${coluna}`);
    out[i] = valor;
  }
  return out;
}

const pessoa = (id: string, nome: string, atual: Record<string, unknown> = {}): PessoaDoEvento => ({
  teamInclusionId: id,
  nome,
  ler: (campo) => atual[campo],
});

describe("conversões da planilha", () => {
  it("dinheiro em qualquer formato vira centavos", () => {
    expect(paraCentavos("R$ 1.234,56")).toBe(123456);
    expect(paraCentavos("1234,56")).toBe(123456);
    expect(paraCentavos(1234.56)).toBe(123456);
    expect(paraCentavos("")).toBeNull();
    expect(paraCentavos("abc")).toBeNull();
  });

  it("data aceita o texto brasileiro, o ISO e a série do Excel", () => {
    expect(paraData("29/05/2026")).toBe("2026-05-29");
    expect(paraData("2026-05-29")).toBe("2026-05-29");
    expect(paraData("29/05/26")).toBe("2026-05-29");
    // 46171 é 29/05/2026 na contagem do Excel.
    expect(paraData(46171)).toBe("2026-05-29");
    expect(paraData("")).toBeNull();
  });

  it("hora aceita texto e a fração de dia do Excel", () => {
    expect(paraHora("8:30")).toBe("08:30");
    expect(paraHora("08:30:00")).toBe("08:30");
    expect(paraHora(0.5)).toBe("12:00");
    expect(paraHora("99:99")).toBeNull();
  });

  it("nome ignora acento, caixa e espaço repetido", () => {
    expect(normalizarNome("  JOSÉ   da Silva ")).toBe("jose da silva");
  });
});

describe("leitura da planilha", () => {
  const pessoas = [pessoa("v1", "Willians Silva de Jesus"), pessoa("v2", "Naiara Daiane Souza")];

  it("recusa arquivo que não é o template", () => {
    const r = lerPlanilhaDoEspelho([["qualquer", "coisa"], ["outra", "linha"]], pessoas);
    expect(r.formatoInvalido).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/Exporte a planilha/i);
  });

  it("acha o cabeçalho mesmo com linhas de contexto antes", () => {
    const r = lerPlanilhaDoEspelho(planilha([linha("Willians Silva de Jesus", { LOCALIZADOR: "ABC123" })]), pessoas);
    expect(r.formatoInvalido).toBeUndefined();
    expect(r.linhas[0].alteracoes).toEqual([{ campo: "ticket.locator", de: null, para: "ABC123" }]);
  });

  it("célula vazia NÃO apaga o que já existe", () => {
    // É a regra que permite importar a planilha de uma área sem destruir a da
    // outra: quem cuida de passagem não preenche hotel.
    const comDados = [pessoa("v1", "Willians Silva de Jesus", {
      "ticket.locator": "JÁ TINHA", "accommodation.hotelName": "Ibis",
    })];
    const r = lerPlanilhaDoEspelho(planilha([linha("Willians Silva de Jesus", { "PASSAGENS TT R$": "R$ 100,00" })]), comDados);
    expect(r.linhas[0].alteracoes).toEqual([{ campo: "ticket.value", de: null, para: 10000 }]);
  });

  it("não registra alteração quando o valor é o mesmo", () => {
    const igual = [pessoa("v1", "Willians Silva de Jesus", { "ticket.locator": "ABC123" })];
    const r = lerPlanilhaDoEspelho(planilha([linha("Willians Silva de Jesus", { LOCALIZADOR: "ABC123" })]), igual);
    expect(r.linhas[0].alteracoes).toHaveLength(0);
    expect(r.avisos.join(" ")).toMatch(/não traz nada diferente/i);
  });

  it("data com hora no banco não conta como mudança", () => {
    const comData = [pessoa("v1", "Willians Silva de Jesus", { "schedule.startDate": "2026-05-29T00:00:00.000Z" })];
    const r = lerPlanilhaDoEspelho(planilha([linha("Willians Silva de Jesus", { "INÍCIO": "29/05/2026" })]), comData);
    expect(r.linhas[0].alteracoes).toHaveLength(0);
  });

  it("nome que não está no evento fica de fora, com o motivo", () => {
    const r = lerPlanilhaDoEspelho(planilha([linha("Fulano de Tal", { LOCALIZADOR: "X" })]), pessoas);
    expect(r.linhas[0].problema).toMatch(/não está escalada/i);
    expect(r.linhas[0].teamInclusionId).toBeUndefined();
  });

  it("nome repetido no evento não é adivinhado", () => {
    const doisIguais = [pessoa("v1", "João Silva"), pessoa("v2", "João Silva")];
    const r = lerPlanilhaDoEspelho(planilha([linha("João Silva", { LOCALIZADOR: "X" })]), doisIguais);
    expect(r.linhas[0].problema).toMatch(/2 pessoas com este nome/i);
  });

  it("casa o nome mesmo com acento e caixa diferentes", () => {
    const r = lerPlanilhaDoEspelho(planilha([linha("WILLIANS SILVA DE JESUS", { LOCALIZADOR: "ABC" })]), pessoas);
    expect(r.linhas[0].teamInclusionId).toBe("v1");
  });

  it("para nos subtotais que o próprio export escreve", () => {
    const r = lerPlanilhaDoEspelho(
      planilha([
        linha("Willians Silva de Jesus", { LOCALIZADOR: "ABC" }),
        ["SUBTOTAIS POR FUNÇÃO"],
        ["Cenotecnica", "", "", 1000],
      ]),
      pessoas,
    );
    expect(r.linhas).toHaveLength(1);
  });

  it("não grava as colunas que o sistema calcula", () => {
    // PENDÊNCIAS é derivada e QUARTO sai do agrupamento: digitar ali não muda
    // nada — o valor voltaria a ser recalculado no minuto seguinte.
    const r = lerPlanilhaDoEspelho(
      planilha([linha("Willians Silva de Jesus", { "PENDÊNCIAS": "Sem hotel", QUARTO: "Triplo", DEPARTAMENTO: "Outra" })]),
      pessoas,
    );
    expect(r.linhas[0].alteracoes).toHaveLength(0);
  });

  it("lê a linha inteira de uma vez e conta o total", () => {
    const r = lerPlanilhaDoEspelho(
      planilha([linha("Naiara Daiane Souza", {
        "PASSAGENS TT R$": "R$ 1.415,43",
        "AERO IDA": "CNF", "HR IDA": "10:05", "LOCALIZADOR": "NES2UB",
        "EMPRESA": "GOL", "OC": "OC-99", "HOTEL": "Ibis Itabira",
        "DIÁRIAS": "3", "R$ DIARIA H": "R$ 250,00", "LATE CHECK OUT": "Sim",
      })]),
      [pessoa("v2", "Naiara Daiane Souza")],
    );
    const campos = Object.fromEntries(r.linhas[0].alteracoes.map((a) => [a.campo, a.para]));
    expect(campos["ticket.value"]).toBe(141543);
    expect(campos["ticket.departureAirport"]).toBe("CNF");
    expect(campos["ticket.actualDepartureTime"]).toBe("10:05");
    expect(campos["ticket.locator"]).toBe("NES2UB");
    expect(campos["ticket.ticketCompany"]).toBe("GOL");
    expect(campos["ticket.purchaseOrderNumber"]).toBe("OC-99");
    expect(campos["accommodation.hotelName"]).toBe("Ibis Itabira");
    expect(campos["accommodation.nightsCount"]).toBe(3);
    expect(campos["accommodation.dailyRate"]).toBe(25000);
    expect(campos["accommodation.lateCheckout"]).toBe(true);
    expect(totalDeAlteracoes(r.linhas)).toBe(10);
  });

  it("a OC repetida em cada bloco vai para o bloco certo", () => {
    // "OC" aparece cinco vezes no cabeçalho; é a POSIÇÃO que diz de quem é.
    const r = lerPlanilhaDoEspelho(
      planilha([(() => {
        const l = linha("Willians Silva de Jesus");
        l[13] = "OC-PASSAGEM";
        l[22] = "OC-HOTEL";
        l[25] = "OC-BAGAGEM";
        l[28] = "OC-UBER";
        l[32] = "OC-LOCACAO";
        return l;
      })()]),
      pessoas,
    );
    const campos = Object.fromEntries(r.linhas[0].alteracoes.map((a) => [a.campo, a.para]));
    expect(campos["ticket.purchaseOrderNumber"]).toBe("OC-PASSAGEM");
    expect(campos["accommodation.hotelOc"]).toBe("OC-HOTEL");
    expect(campos["baggage.oc"]).toBe("OC-BAGAGEM");
    expect(campos["uber.oc"]).toBe("OC-UBER");
    expect(campos["carRental.oc"]).toBe("OC-LOCACAO");
  });
});
