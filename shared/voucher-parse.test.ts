/**
 * Testes do leitor de vouchers com o conteúdo REAL dos dois formatos que a
 * equipe usa (28/08). Nome do passageiro/hóspede e CPF foram trocados por
 * fictícios — o resto do texto é exatamente o que sai dos PDFs.
 */
import { describe, it, expect } from "vitest";
import { lerVoucher, dataSemAno, dataComAno, valorBr } from "./voucher-parse";

const PASSAGEM = `SÃO PAULO - JOINVILLE - SÃO PAULO LOCALIZADOR: IJQZNW BILHETE: 1272307948235 15/jul/2026
Cia Voo Classe Assento Origem / Destino Partida / Chegada
G3 1202 O Congonhas (CGH) 19/ago 19:55
GOL Escalas 0 Joinville (JOI) 19/ago 21:05
Term. Embarque: A Classe
Reserva:
Econômica
*Confirme o terminal de embarque, com a Cia Aérea antes do voo.
Observações: Sem Bagagem Despachada / Sem Reembolso /
Sem Alteração de Voo
Pagamento: FATURADO
G3 1201 B Joinville (JOI) 24/ago 08:30
GOL Escalas 0 Congonhas (CGH) 24/ago 09:30
Term. Embarque: Classe
Reserva:
Econômica
*Confirme o terminal de embarque, com a Cia Aérea antes do voo.
Observações: Sem Bagagem Despachada / Sem Reembolso /
Sem Alteração de Voo
Pagamento: FATURADO
Data Emissão: 15/jul/2026 Valor: BRL 564,44 Taxas + Repasse: BRL 110,95 + BRL 0,00 Total: BRL 675,39
FULANO DE TAL SOBRENOME O.S. 1844
Agência:LCA VIAGENS Solicitante: Eduardo Meira
Empresa:Norte Marketing Esportivo Emissor: ADMINISTRADOR DO
SISTEMA`;

const HOSPEDAGEM = `Voucher Hotel
Emitido em: 29/07/2026, 17:14 • Protocolo: #04FAM4
Let's Brasília Hotel
Hospedagem em Brasília
Localizador do hotel: 40558521202
Setor Hoteleiro Norte SNH, Quadra, 5 Bloco B - Bairro Asa Norte
1 Diária • 1 Quarto • 1 Hóspede
Check-In ter 04 ago 2026 às 14h00 Check-Out qua 05 ago 2026 às 12h00
Quarto 1 • Hóspedes Localizador: 40558521202
Quarto Duplo De Luxo
Café da manhã incluso
Reembolsável sem taxa até 04/08/2026 • 08:59
Beltrana Da Silva Exemplo 111.222.333-44
Sobre Let's Brasília Hotel
Valor a pagar no hotel: R$ 40,79`;

describe("voucher de passagem (formato das agências)", () => {
  const r = lerVoucher(PASSAGEM);

  it("reconhece como passagem", () => {
    expect(r.tipo).toBe("passagem");
  });

  it("lê localizador, emissão e o TOTAL — tarifa + taxas (decisão do dono)", () => {
    expect(r.campos.purchaseOrderNumber).toBe("IJQZNW");
    expect(r.campos.purchaseDate).toBe("2026-07-15");
    expect(r.campos.value).toBe("675,39"); // 564,44 de tarifa + 110,95 de taxas
  });

  it("lê a ida com aeroportos, data deduzida e os DOIS horários", () => {
    expect(r.campos.departureAirport).toBe("CGH");
    expect(r.campos.destinationAirport).toBe("JOI");
    expect(r.campos.actualDepartureDate).toBe("2026-08-19");
    expect(r.campos.actualDepartureTime).toBe("19:55");
    expect(r.campos.actualArrivalTime).toBe("21:05");
  });

  it("lê a volta, inclusive a chegada que a alimentação/mobilidade usa", () => {
    expect(r.campos.returnOriginAirport).toBe("JOI");
    expect(r.campos.returnDestinationAirport).toBe("CGH");
    expect(r.campos.actualReturnDate).toBe("2026-08-24");
    expect(r.campos.actualReturnTime).toBe("08:30");
    expect(r.campos.returnArrivalTime).toBe("09:30");
  });

  it("usa o roteiro do topo para as CIDADES (o trecho só traz o aeroporto)", () => {
    expect(r.campos.departureCityOrigin).toBe("São Paulo");
    expect(r.campos.departureCityDestination).toBe("Joinville");
    expect(r.campos.returnCityOrigin).toBe("Joinville");
    expect(r.campos.returnCityDestination).toBe("São Paulo");
  });

  it("identifica o passageiro e não inventa avisos", () => {
    expect(r.pessoa).toBe("FULANO DE TAL SOBRENOME");
    expect(r.avisos).toEqual([]);
  });
});

describe("voucher de hotel (Onfly)", () => {
  const r = lerVoucher(HOSPEDAGEM);

  it("reconhece como hospedagem", () => {
    expect(r.tipo).toBe("hospedagem");
  });

  it("lê hotel, cidade, reserva e o período com horários", () => {
    expect(r.campos.hotelName).toBe("Let's Brasília Hotel");
    expect(r.campos.hotelLocation).toBe("Brasília");
    expect(r.campos.reservationNumber).toBe("40558521202");
    expect(r.campos.checkInDate).toBe("2026-08-04");
    expect(r.campos.checkInTime).toBe("14:00");
    expect(r.campos.checkOutDate).toBe("2026-08-05");
    expect(r.campos.checkOutTime).toBe("12:00");
  });

  it("avisa que a diária não vem no arquivo em vez de chutar valor", () => {
    expect(r.campos.dailyRate).toBeUndefined();
    expect(r.avisos.join(" ")).toMatch(/taxa de balcão/i);
  });

  it("identifica o hóspede", () => {
    expect(r.pessoa).toBe("Beltrana Da Silva Exemplo");
  });
});

describe("regras de data e valor", () => {
  it("data com ano em qualquer um dos dois formatos", () => {
    expect(dataComAno("15/jul/2026")).toBe("2026-07-15");
    expect(dataComAno("04 ago 2026")).toBe("2026-08-04");
  });

  it("data sem ano usa o ano da emissão", () => {
    expect(dataSemAno("19/ago", "2026-07-15")).toBe("2026-08-19");
  });

  it("viagem que vira o ano: data anterior à emissão cai no ano seguinte", () => {
    expect(dataSemAno("05/jan", "2026-12-20")).toBe("2027-01-05");
  });

  it("sem emissão para se apoiar, não chuta o ano", () => {
    expect(dataSemAno("19/ago", null)).toBeNull();
  });

  it("valor em BRL e em R$", () => {
    expect(valorBr("BRL 564,44")).toBe("564,44");
    expect(valorBr("R$ 1.250,00")).toBe("1.250,00");
  });
});

describe("arquivo que não é voucher conhecido", () => {
  it("não quebra: devolve desconhecido com aviso", () => {
    const r = lerVoucher("Contrato de prestação de serviços\nCláusula primeira...");
    expect(r.tipo).toBe("desconhecido");
    expect(r.campos).toEqual({});
    expect(r.avisos.length).toBe(1);
  });
});
