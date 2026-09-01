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

// ─── Voucher aéreo da Onfly (30/08) ─────────────────────────────────────────
// Texto real dos PDFs, com nomes e CPFs trocados por fictícios.

const ONFLY_IDA_E_VOLTA = `Voucher Aéreo
Emitido em: 27/08/2026, 22:58 • Protocolo: #04K5YN
Ida
São Paulo para Fortaleza
LA3506 - Latam
GRU
Aeroporto Internacional de
Guarulhos (GRU)
30 Sep, 2026 • 15:55
Vôo direto
03h25m
FOR
Aeroporto Internacional de
Fortaleza - Pinto Martins (FOR)…
( )30 Sep, 2026 • 19:20
Tarifa LIGHT Localizador EINDWE
Passageiros Bagagem Serviço adicional Assento e-ticket
FULANO MIGUEL MARQUES
334.545.608-70
1x Mala 10 kg
1x Mochila - 9572203230835
Ciclano Da Silva Cordeiro
349.206.068-42
1x Mala 10 kg
1x Mochila - 9572203230837
Volta
Fortaleza para São Paulo
LA3253 - Latam
FOR
Aeroporto Internacional de
Fortaleza - Pinto Martins (FOR)…
( )05 Oct, 2026 • 06:05
Vôo direto
03h35m
GRU
Aeroporto Internacional de
Guarulhos (GRU)
05 Oct, 2026 • 09:40
Tarifa LIGHT Localizador EINDWE
Passageiros Bagagem Serviço adicional Assento e-ticket
FULANO MIGUEL MARQUES
334.545.608-70
1x Mala 10 kg
Ciclano Da Silva Cordeiro
349.206.068-42
1x Mala 10 kg
Centro de custo
Ceno - Evento
Motivo
Circuitinho - Fortaleza`;

const ONFLY_UM_TRECHO = `Voucher Aéreo
Emitido em: 27/08/2026, 22:28 • Protocolo: #04K625
Ida
Fortaleza para São Paulo
LA3253 - Latam
FOR
Aeroporto Internacional de
Fortaleza - Pinto Martins (FOR)…
( )04 Oct, 2026 • 06:05
Vôo direto
03h35m
GRU
Aeroporto Internacional de
Guarulhos (GRU)
04 Oct, 2026 • 09:40
Tarifa LIGHT Localizador EGXMOA
Passageiros Bagagem Serviço adicional Assento e-ticket
Beltrano Carlos Ferreira Alves
226.321.328-78
1x Mala 10 kg
Centro de custo
PRODUÇÃO - Evento
Motivo
Circuitinho - Fortaleza`;

// Bilhete de um trecho no formato da agência: o roteiro do topo tem duas
// pontas em vez de três.
const AGENCIA_SO_UM_TRECHO = `SÃO PAULO - RIO DE JANEIRO LOCALIZADOR: SOAEFM BILHETE: 1272307464781 08/jul/2026
Cia Voo Classe Assento Origem / Destino Partida / Chegada
G3 1446 E Congonhas (CGH) 15/jul 11:10
GOL Escalas 0 Galeão (GIG) 15/jul 12:20
Term. Embarque: A Classe
Reserva:
Econômica
Pagamento: FATURADO
Data Emissão: 08/jul/2026 Valor: BRL 1.374,73 Taxas + Repasse: BRL 62,14 + BRL 0,00 Total: BRL 1.436,87
FULANO CHADDAD BARREIRO DA CUNHA O.S. 1803
Agência:LCA VIAGENS Solicitante: Leandro Duarte Vieira`;

describe("voucher aéreo da Onfly", () => {
  const r = lerVoucher(ONFLY_IDA_E_VOLTA);

  it("não é confundido com voucher de hotel", () => {
    expect(r.tipo).toBe("passagem");
    expect(r.formato).toBe("Voucher aéreo (Onfly)");
  });

  it("lê localizador, emissão e companhia", () => {
    expect(r.campos.purchaseOrderNumber).toBe("EINDWE");
    expect(r.campos.purchaseDate).toBe("2026-08-27");
    expect(r.campos.ticketCompany).toBe("LATAM");
  });

  it("lê a ida com data em inglês, aeroportos e as duas horas", () => {
    expect(r.campos.departureAirport).toBe("GRU");
    expect(r.campos.destinationAirport).toBe("FOR");
    expect(r.campos.departureCityOrigin).toBe("São Paulo");
    expect(r.campos.departureCityDestination).toBe("Fortaleza");
    expect(r.campos.actualDepartureDate).toBe("2026-09-30");
    expect(r.campos.actualDepartureTime).toBe("15:55");
    expect(r.campos.actualArrivalTime).toBe("19:20");
  });

  it("lê a volta do mesmo arquivo", () => {
    expect(r.campos.returnOriginAirport).toBe("FOR");
    expect(r.campos.returnDestinationAirport).toBe("GRU");
    expect(r.campos.actualReturnDate).toBe("2026-10-05");
    expect(r.campos.actualReturnTime).toBe("06:05");
    expect(r.campos.returnArrivalTime).toBe("09:40");
    expect(r.trechoUnico).toBe(false);
  });

  it("junta os passageiros do grupo sem repetir os da volta", () => {
    expect(r.pessoas).toEqual(["Fulano Miguel Marques", "Ciclano da Silva Cordeiro"]);
  });

  it("avisa que o voucher não traz valor nenhum", () => {
    expect(r.campos.value).toBeUndefined();
    expect(r.avisos.join(" ")).toMatch(/não traz o valor/i);
  });
});

describe("voucher aéreo da Onfly com um trecho só", () => {
  const r = lerVoucher(ONFLY_UM_TRECHO);

  it("marca trecho único em vez de decidir que é apenas ida", () => {
    // O arquivo se intitula "Ida", mas pode ser a volta emitida à parte: quem
    // decide é o recorte escolhido na tela.
    expect(r.trechoUnico).toBe(true);
    expect(r.campos.isOneWay).toBeUndefined();
    expect(r.campos.actualReturnDate).toBeUndefined();
  });

  it("lê o trecho que veio", () => {
    expect(r.campos.departureAirport).toBe("FOR");
    expect(r.campos.destinationAirport).toBe("GRU");
    expect(r.campos.actualDepartureDate).toBe("2026-10-04");
    expect(r.pessoas).toEqual(["Beltrano Carlos Ferreira Alves"]);
  });
});

describe("voucher da agência com um trecho só", () => {
  const r = lerVoucher(AGENCIA_SO_UM_TRECHO);

  it("usa as duas pontas do roteiro como cidades, não o nome do aeroporto", () => {
    expect(r.campos.departureCityOrigin).toBe("São Paulo");
    expect(r.campos.departureCityDestination).toBe("Rio de Janeiro");
  });

  it("continua marcando trecho único e lendo o total", () => {
    expect(r.trechoUnico).toBe(true);
    expect(r.campos.value).toBe("1.436,87");
  });
});

// ─── Hospedagem: os dois formatos novos (31/08) ─────────────────────────────
// Texto real dos PDFs, com nomes trocados por fictícios.

const HOTEL_AGENCIA = `AVENIDA PALACE HOTEL VOUCHER: 012292
Data limite do cancelamento: Tarifa não reembolsável
Endereço Telefone Emissão Café da
Manhã:
sim
Acompanhante / Tipo Apto Check-In / Check-Out
AV KALED COSAC. QD 25 -
CENTRO
31/ago/2026 FULANO QUERINO 07/set/2026 14:00
Cristalina - GO Duplo 23/set/2026 12:00
Observações: Com café da manhã e camas de solteiro.
Pagamento: FATURADO Diária: BRL 280,00 Outros: BRL 0,00 BRL 0,00 Total: BRL 4.480,00
BELTRANO VINICIUS SOUSA DE ANDRADE O.S. 2356
Agência:LCA VIAGENS Solicitante: Sabrina Silva Portes
Empresa:Norte Marketing Esportivo Emissor: PRISCILA GONCALVES`;

const RELATORIO_HOTEL = `Emissão: 31/08/2026 13:44:04
Confirmação de Reserva Nº 34.298
RUA DEPUTADO MOREIRA DA ROCHA, 504 MEIRELES, FORTALEZA
60160060 FORTALEZA CE
D8 HOTEL
RESERVAS NORTE MARKETING
Empresa: 00.000.000/0000-00 PARTICULAR
Apartamentos
Entrada Saída Apto Tipo Pax Pensão Diária TotalAdiant.
30/09/26 05/10/26 (1) DBL 1 CM 290,00 1.450,0014:00 12:00 0,00R$
Hóspede: FULANA TOUSSAINT NASCIMENTO ADULTO PAGANTE
28/09/26 04/10/26 (1) DBL 2 CM 290,00 1.740,0014:00 12:00 0,00R$
Hóspede: BELTRANO CARLOS FERREIRA ADULTO PAGANTE
Hóspede: CICRANO WILLIAN MEIRELES (30/09/26 14:00 à 03/10/26 12:00) ADULTO PAGANTE
30/09/26 05/10/26 (1) TPL 3 CM 455,00 2.275,0014:00 12:00 0,00R$
Hóspede: JAMERSON RODRIGUES ADULTO PAGANTE
Hóspede: LUAN MIGUEL MARQUES ADULTO PAGANTE
Hóspede: BRUNO SILVA CORDEIRO ADULTO PAGANTE
Aptos Pax Total da ReservaTOTAIS Adiantamentos Extras Total a pagarUso Créd.
R$ 6.625,00 R$ 6.625,005 9 0,00`;

describe("voucher de hotel da agência", () => {
  const r = lerVoucher(HOTEL_AGENCIA);

  it("não é confundido com o voucher de passagem da mesma agência", () => {
    expect(r.tipo).toBe("hospedagem");
    expect(r.formato).toBe("Voucher de hotel (agência)");
  });

  it("lê hotel, voucher, período e valores", () => {
    expect(r.campos.hotelName).toBe("Avenida Palace Hotel");
    expect(r.campos.reservationNumber).toBe("012292");
    expect(r.campos.checkInDate).toBe("2026-09-07");
    expect(r.campos.checkOutDate).toBe("2026-09-23");
    expect(r.campos.dailyRate).toBe("280,00");
    expect(r.campos.totalCents).toBe("4.480,00");
    expect(r.campos.roomType).toBe("Duplo");
  });

  it("conta as noites em vez de deixar o campo para a mão", () => {
    // 07/09 a 23/09 são 16 noites — a conta que quem preenche faria de cabeça.
    expect(r.campos.nightsCount).toBe("16");
  });

  it("a data de emissão não vira check-in", () => {
    // A emissão (31/ago) aparece na MESMA linha do check-in; só as datas com
    // hora ao lado são do período.
    expect(r.campos.checkInDate).not.toBe("2026-08-31");
  });

  it("avisa que a diária é do quarto quando há acompanhante", () => {
    expect(r.avisos.join(" ")).toMatch(/dividido com Fulano Querino/i);
    expect(r.avisos.join(" ")).toMatch(/do quarto, não de cada pessoa/i);
  });

  it("lê o hóspede titular", () => {
    expect(r.pessoa).toBe("Beltrano Vinicius Sousa de Andrade");
  });
});

describe("relatório de reservas do hotel", () => {
  const r = lerVoucher(RELATORIO_HOTEL);

  it("reconhece o formato e devolve UMA hospedagem por hóspede", () => {
    expect(r.formato).toBe("Relatório de reservas (hotel)");
    expect(r.hospedagens).toHaveLength(6);
  });

  it("pega o nome do hotel, não a linha do CEP", () => {
    // "60160060 FORTALEZA CE" também é uma linha em caixa alta.
    expect(r.campos.hotelName).toBe("D8 Hotel");
  });

  it("cada hóspede leva o período do seu quarto", () => {
    const h = r.hospedagens!.find((x) => x.pessoa.startsWith("Fulana"))!;
    expect(h.campos.checkInDate).toBe("2026-09-30");
    expect(h.campos.checkOutDate).toBe("2026-10-05");
    expect(h.campos.nightsCount).toBe("5");
  });

  it("hóspede com período próprio não herda o do quarto", () => {
    // O quarto vai de 28/09 a 04/10; esta pessoa fica de 30/09 a 03/10.
    const h = r.hospedagens!.find((x) => x.pessoa.startsWith("Cicrano"))!;
    expect(h.campos.checkInDate).toBe("2026-09-30");
    expect(h.campos.checkOutDate).toBe("2026-10-03");
    expect(h.avisos.join(" ")).toMatch(/período próprio/i);
  });

  it("quarto individual leva a diária e o total; compartilhado, nenhum dos dois", () => {
    // Preencher a diária do quarto em cada ocupante multiplicaria o custo do
    // evento pelo número de pessoas.
    const sozinha = r.hospedagens!.find((x) => x.pax === 1)!;
    expect(sozinha.campos.dailyRate).toBe("290,00");
    expect(sozinha.campos.totalCents).toBe("1.450,00");

    const triplo = r.hospedagens!.find((x) => x.pax === 3)!;
    expect(triplo.campos.dailyRate).toBeUndefined();
    expect(triplo.campos.totalCents).toBeUndefined();
    expect(triplo.avisos.join(" ")).toMatch(/dividido por 3 pessoas/i);
  });

  it("traduz a sigla do tipo de quarto", () => {
    expect(r.hospedagens!.find((x) => x.pax === 3)!.campos.roomType).toBe("Triplo");
    expect(r.hospedagens!.find((x) => x.pax === 1)!.campos.roomType).toBe("Duplo");
  });

  it("diz quantas pessoas vieram no arquivo", () => {
    expect(r.avisos.join(" ")).toMatch(/6 hóspedes/);
  });
});

/**
 * Passagem rodoviária (01/09) — texto real do comprovante, com o passageiro
 * trocado por um nome fictício. Formato que precisa ser reconhecido ANTES do
 * voucher da agência: ele detecta por "LOCALIZADOR:", que este arquivo também
 * tem, e leria a viagem de ônibus como se fosse um voo.
 */
const RODOVIARIA = `Confirmação de Compra
Comprovante: 20804178
VIAGEM DE IDA
Passageiro: FULANA ANDRADE ALVES DA SILVA
Bilhete Eletrônico
Clique Aqui
Trecho:
São Paulo, SP - Barra Funda→Londrina, PR - Terminal José Garcia Villar
Partida:
03/09/2026 07:00:00
Chegada:
03/09/2026 14:45:00
Seguro:
Não contratado
Classe:
LEITO
Poltrona:
32
Localizador:
NKCFOUT
VIAGEM DE VOLTA
Passageiro: FULANA ANDRADE ALVES DA SILVA
Bilhete Eletrônico
Clique Aqui
Trecho:
Londrina, PR - Terminal José Garcia Villar→São Paulo, SP - Barra Funda
Partida:
06/09/2026 23:30:00
Chegada:
07/09/2026 06:30:00
Seguro:
Não contratado
Classe:
LEITO
Poltrona:
29
Localizador:
NZCFOUN
RODOVIÁRIA DE EMBARQUE (IDA)
São Paulo, SP - Barra Funda
R. Jorn. Aloysio Biondi, 215 - 556 - Barra Funda São Paulo, SP
RODOVIÁRIA DE DESEMBARQUE (IDA)
Londrina, PR - Terminal José Garcia Villar
Av. Dez de Dezembro, 1830 – Centro Londrina – PR
RODOVIÁRIA DE EMBARQUE (VOLTA)
Londrina, PR - Terminal José Garcia Villar
Av. Dez de Dezembro, 1830 – Centro Londrina – PR
RODOVIÁRIA DE DESEMBARQUE (VOLTA)
São Paulo, SP - Barra Funda
R. Jorn. Aloysio Biondi, 215 - 556 - Barra Funda São Paulo, SP
ORIENTAÇÕES PARA RETIRADA DA PASSAGEM
Bilhete Eletrônico: Imprima o bilhete eletrônico e apresente-se com documento original diretamente na plataforma de embarque.`;

describe("passagem rodoviária", () => {
  const r = lerVoucher(RODOVIARIA);

  it("é lida como rodoviária, e não como voo", () => {
    // O detector do voucher da agência ("LOCALIZADOR:") casa com este texto:
    // se a ordem do lerVoucher mudar, este teste cai.
    expect(r.tipo).toBe("passagem");
    expect(r.formato).toBe("Passagem rodoviária");
    expect(r.campos.transportType).toBe("rodoviario");
  });

  it('"Bilhete" recebe o comprovante da compra, não o localizador', () => {
    // Cada trecho tem o seu localizador e o campo é um só — o número da
    // compra é o que identifica a passagem inteira.
    expect(r.campos.purchaseOrderNumber).toBe("20804178");
  });

  it("separa a rodoviária da cidade, nas quatro pontas", () => {
    expect(r.campos.departureAirport).toBe("Barra Funda");
    expect(r.campos.departureCityOrigin).toBe("São Paulo");
    expect(r.campos.destinationAirport).toBe("Terminal José Garcia Villar");
    expect(r.campos.departureCityDestination).toBe("Londrina");
    expect(r.campos.returnOriginAirport).toBe("Terminal José Garcia Villar");
    expect(r.campos.returnCityOrigin).toBe("Londrina");
    expect(r.campos.returnDestinationAirport).toBe("Barra Funda");
    expect(r.campos.returnCityDestination).toBe("São Paulo");
  });

  it("lê partida e chegada dos dois trechos", () => {
    expect(r.campos.actualDepartureDate).toBe("2026-09-03");
    expect(r.campos.actualDepartureTime).toBe("07:00");
    expect(r.campos.actualArrivalTime).toBe("14:45");
    expect(r.campos.actualReturnDate).toBe("2026-09-06");
    expect(r.campos.actualReturnTime).toBe("23:30");
    expect(r.campos.returnArrivalTime).toBe("06:30");
  });

  it("avisa quando o ônibus noturno desembarca no dia seguinte", () => {
    // Só o HORÁRIO da chegada é gravado: "06:30" lido sozinho parece o mesmo
    // dia, e a diferença muda diária de hotel e mobilidade de madrugada.
    expect(r.avisos.join(" ")).toMatch(/embarca 06\/09 e desembarca 07\/09/);
  });

  it("leva localizador, poltrona e classe para o aviso — não há campo para eles", () => {
    expect(r.avisos.join(" ")).toMatch(/ida NKCFOUT · poltrona 32 · LEITO/);
    expect(r.avisos.join(" ")).toMatch(/volta NZCFOUN · poltrona 29 · LEITO/);
  });

  it("lê o passageiro e avisa que não há valor no comprovante", () => {
    expect(r.pessoa).toBe("Fulana Andrade Alves da Silva");
    expect(r.trechoUnico).toBe(false);
    expect(r.avisos.join(" ")).toMatch(/não traz o valor/i);
  });
});

describe("passagem rodoviária só de ida", () => {
  const soIda = RODOVIARIA.slice(0, RODOVIARIA.indexOf("VIAGEM DE VOLTA"))
    + RODOVIARIA.slice(RODOVIARIA.indexOf("RODOVIÁRIA DE EMBARQUE (IDA)"), RODOVIARIA.indexOf("RODOVIÁRIA DE EMBARQUE (VOLTA)"));
  const r = lerVoucher(soIda);

  it("não inventa a volta e marca o trecho como único", () => {
    expect(r.campos.actualDepartureDate).toBe("2026-09-03");
    expect(r.campos.actualReturnDate).toBeUndefined();
    expect(r.campos.returnOriginAirport).toBeUndefined();
    expect(r.trechoUnico).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/um trecho só/i);
  });
});
