import { describe, it, expect } from "vitest";
import { ehColunaDeNumeroSolto, mapearColunas } from "./mirror-columns";

/**
 * Cabeçalho REAL da planilha que a equipe usa ("Circuitinho - Fortaleza",
 * 01/09). É por causa dele que o casamento deixou de ser por posição: tem seis
 * colunas a mais no começo, "IDA"/"VOLTA" no lugar de "AERO IDA"/"AERO VOLTA",
 * e o número do check-in numa célula separada.
 */
const CABECALHO_REAL = [
  "NOME", "CPF", "DN", "FREELA | CASA", "OBS", "DEPARTAMENTO", "CONTA", "STATUS",
  "INÍCIO", "DATA IDA", "TÉRMINO", "DATA VOLTA",
  "PASSAGENS TT R$", "IDA", "HR IDA", "HR VOLTA", "VOLTA", "LOCALIZADOR", "EMPRESA", "OC", "CHECK IN", 3,
  "DIÁRIAS", "QUARTO", "R$ DIARIA H", "LATE CHECK OUT", "HOTEL TT R$", "HOTEL", "EMPRESA", "PAGAMENTO", "OC", "CHECK IN", 4,
  "BAGAGEM TT R$", "OC", "CHECK IN", 1,
  "UBER TT R$", "OC", "CHECK IN", 2,
  "EMPRESA", "LOCAÇÃO TT R$", "OC", "CHECK IN",
];

/** Cabeçalho que o próprio sistema exporta. */
const CABECALHO_DO_EXPORT = [
  "NOME", "DEPARTAMENTO",
  "INÍCIO", "DATA IDA", "TÉRMINO", "DATA VOLTA",
  "PASSAGENS TT R$", "AERO IDA", "HR IDA", "HR VOLTA", "AERO VOLTA", "LOCALIZADOR", "EMPRESA", "OC", "CHECK IN 3",
  "DIÁRIAS", "QUARTO", "R$ DIARIA H", "LATE CHECK OUT", "HOTEL TT R$", "HOTEL", "EMPRESA PAGAMENTO", "OC", "CHECK IN 4",
  "BAGAGEM TT R$", "OC", "CHECK IN 1",
  "UBER TT R$", "OC", "CHECK IN 2",
  "EMPRESA LOCAÇÃO", "TT R$", "OC", "CHECK IN",
  "PENDÊNCIAS",
];

/** campo → título da coluna que o alimenta. */
const campos = (cabecalho: unknown[]) => {
  const out: Record<string, string> = {};
  for (const c of mapearColunas(cabecalho)) {
    if (c.campo && !(c.campo in out)) out[c.campo] = `${c.titulo}@${c.indice}`;
  }
  return out;
};

describe("planilha real da equipe", () => {
  const m = campos(CABECALHO_REAL);

  it("as colunas extras do começo não deslocam nada", () => {
    // Era exatamente isto que quebrava: CPF, DN, FREELA|CASA, OBS, CONTA e
    // STATUS empurravam tudo, e a leitura posicional gravava no campo errado.
    expect(m["schedule.startDate"]).toBe("INICIO@8");
    expect(m["schedule.departureDate"]).toBe("DATA IDA@9");
    expect(m["schedule.endDate"]).toBe("TERMINO@10");
    expect(m["schedule.returnDate"]).toBe("DATA VOLTA@11");
  });

  it('"IDA" e "VOLTA" são os aeroportos, como o export chama de "AERO IDA"', () => {
    expect(m["ticket.departureAirport"]).toBe("IDA@13");
    expect(m["ticket.returnOriginAirport"]).toBe("VOLTA@16");
  });

  it("cada OC vai para o bloco a que pertence", () => {
    // "OC" aparece cinco vezes; o nome sozinho não diz de quem é.
    expect(m["ticket.purchaseOrderNumber"]).toBe("OC@19");
    expect(m["accommodation.hotelOc"]).toBe("OC@30");
    expect(m["baggage.oc"]).toBe("OC@34");
    expect(m["uber.oc"]).toBe("OC@38");
    expect(m["carRental.oc"]).toBe("OC@43");
  });

  it("cada CHECK IN também", () => {
    expect(m["ticket.checkIn3"]).toBe("CHECK IN@20");
    expect(m["accommodation.checkIn4"]).toBe("CHECK IN@31");
    expect(m["baggage.checkIn"]).toBe("CHECK IN@35");
    expect(m["uber.checkIn"]).toBe("CHECK IN@39");
    expect(m["carRental.checkIn"]).toBe("CHECK IN@44");
  });

  it('"EMPRESA" muda de significado conforme o bloco', () => {
    // Companhia aérea na passagem, pagador no hotel, locadora na locação — e a
    // da locação vem ANTES do marcador do bloco, o que exige olhar a próxima.
    expect(m["ticket.ticketCompany"]).toBe("EMPRESA@18");
    expect(m["accommodation.paymentCompany"]).toBe("EMPRESA@28");
    expect(m["carRental.company"]).toBe("EMPRESA@41");
  });

  it('"PAGAMENTO" é lida e NÃO grava — senão sobrescreveria o pagador', () => {
    const coluna = mapearColunas(CABECALHO_REAL).find((c) => c.indice === 29)!;
    expect(coluna.titulo).toBe("PAGAMENTO");
    expect(coluna.campo).toBeNull();
  });

  it("as colunas de identificação nunca gravam", () => {
    const porIndice = new Map(mapearColunas(CABECALHO_REAL).map((c) => [c.indice, c]));
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 23]) {
      expect(`${i}:${porIndice.get(i)!.campo}`).toBe(`${i}:${null}`);
    }
  });

  it("o número solto do check-in não vira campo", () => {
    expect(ehColunaDeNumeroSolto("3")).toBe(true);
    expect(ehColunaDeNumeroSolto("OC")).toBe(false);
    const numeros = mapearColunas(CABECALHO_REAL).filter((c) => ehColunaDeNumeroSolto(c.titulo));
    expect(numeros).toHaveLength(4);
    expect(numeros.every((c) => !c.campo)).toBe(true);
  });
});

describe("planilha que o próprio sistema exporta", () => {
  const m = campos(CABECALHO_DO_EXPORT);

  it("continua lendo igual — os dois formatos convivem", () => {
    expect(m["ticket.departureAirport"]).toBe("AERO IDA@7");
    expect(m["ticket.returnOriginAirport"]).toBe("AERO VOLTA@10");
    expect(m["ticket.purchaseOrderNumber"]).toBe("OC@13");
    expect(m["accommodation.paymentCompany"]).toBe("EMPRESA PAGAMENTO@21");
    expect(m["accommodation.hotelOc"]).toBe("OC@22");
    expect(m["carRental.company"]).toBe("EMPRESA LOCACAO@30");
    expect(m["carRental.amountCents"]).toBe("TT R$@31");
    expect(m["carRental.oc"]).toBe("OC@32");
  });

  it("PENDÊNCIAS é calculada e não volta pela planilha", () => {
    const p = mapearColunas(CABECALHO_DO_EXPORT).find((c) => c.titulo === "PENDENCIAS")!;
    expect(p.campo).toBeNull();
  });
});

describe("planilha com coluna estranha", () => {
  it("coluna desconhecida fica marcada, sem derrubar o resto", () => {
    const cab = [...CABECALHO_REAL, "COLUNA NOVA DA EQUIPE"];
    const cols = mapearColunas(cab);
    const nova = cols.find((c) => c.titulo === "COLUNA NOVA DA EQUIPE")!;
    expect(nova.campo).toBeUndefined();
    // O resto continua mapeado.
    expect(campos(cab)["ticket.locator"]).toBe("LOCALIZADOR@17");
  });
});
