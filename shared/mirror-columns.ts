/**
 * De qual campo é cada coluna da planilha do espelho (01/09).
 *
 * A primeira versão casava coluna com campo pela POSIÇÃO. Funcionava na
 * planilha que o próprio sistema exporta e quebrava na que a equipe usa de
 * verdade: aquela tem seis colunas a mais no começo (CPF, DN, FREELA|CASA,
 * OBS, CONTA, STATUS) e, a partir da sétima, tudo entrava no campo errado —
 * em silêncio, que é o pior jeito de errar num arquivo que grava no banco.
 *
 * Agora o casamento é por NOME, ancorado ao BLOCO. Os nomes se repetem entre
 * blocos ("OC" e "CHECK IN" aparecem cinco vezes cada), então o nome sozinho
 * não basta: é o marcador de início de bloco que diz de quem é aquela OC.
 *
 * Assim a leitura tolera coluna a mais, coluna a menos e nome variante — o que
 * uma planilha viva sempre acaba tendo.
 */

/** Blocos, na ordem em que aparecem no arquivo. */
export type Bloco = "geral" | "passagem" | "hotel" | "bagagem" | "uber" | "locacao";

/** Tira acento, espaço repetido e caixa. */
export function chaveDaColuna(nome: unknown): string {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * O que abre cada bloco. A coluna que casa com um destes nomes passa a valer
 * para o bloco novo, e tudo à direita dela pertence a ele até o próximo.
 */
const ABRE_BLOCO: { bloco: Exclude<Bloco, "geral">; nomes: string[] }[] = [
  { bloco: "passagem", nomes: ["PASSAGENS TT R$", "PASSAGEM TT R$", "PASSAGENS TT", "PASSAGENS R$"] },
  { bloco: "hotel", nomes: ["DIARIAS", "HOTEL TT R$"] },
  { bloco: "bagagem", nomes: ["BAGAGEM TT R$", "BAGAGEM TT", "BAGAGEM R$"] },
  { bloco: "uber", nomes: ["UBER TT R$", "UBER TT", "UBER R$"] },
  { bloco: "locacao", nomes: ["LOCACAO TT R$", "LOCACAO TT", "TT R$", "EMPRESA LOCACAO"] },
];

/**
 * Nome da coluna → campo, dentro de cada bloco.
 *
 * `null` = coluna que se lê e nunca se grava: NOME e DEPARTAMENTO identificam
 * a pessoa; PENDÊNCIAS é calculada; QUARTO sai do agrupamento de quartos, não
 * da digitação; CPF, OBS, CONTA e STATUS são colunas de trabalho da equipe que
 * não têm par no espelho.
 */
const CAMPOS: Record<Bloco, Record<string, string | null>> = {
  geral: {
    "NOME": null, "DEPARTAMENTO": null, "CPF": null, "DN": null,
    "FREELA | CASA": null, "FREELA| CASA": null, "FREELA |CASA": null, "FREELA|CASA": null,
    "OBS": null, "CONTA": null, "STATUS": null, "PENDENCIAS": null,
    "INICIO": "schedule.startDate",
    "DATA IDA": "schedule.departureDate",
    "TERMINO": "schedule.endDate",
    "DATA VOLTA": "schedule.returnDate",
  },
  passagem: {
    "PASSAGENS TT R$": "ticket.value", "PASSAGEM TT R$": "ticket.value",
    "PASSAGENS TT": "ticket.value", "PASSAGENS R$": "ticket.value",
    // A planilha da equipe chama de "IDA"/"VOLTA" o que o export chama de
    // "AERO IDA"/"AERO VOLTA" — é a mesma sigla de aeroporto ou rodoviária.
    "IDA": "ticket.departureAirport", "AERO IDA": "ticket.departureAirport",
    "VOLTA": "ticket.returnOriginAirport", "AERO VOLTA": "ticket.returnOriginAirport",
    "HR IDA": "ticket.actualDepartureTime",
    "HR VOLTA": "ticket.actualReturnTime",
    "LOCALIZADOR": "ticket.locator",
    "EMPRESA": "ticket.ticketCompany",
    "OC": "ticket.purchaseOrderNumber",
    "CHECK IN": "ticket.checkIn3", "CHECK IN 3": "ticket.checkIn3",
  },
  hotel: {
    "DIARIAS": "accommodation.nightsCount",
    "QUARTO": null,
    "R$ DIARIA H": "accommodation.dailyRate", "R$ DIARIA": "accommodation.dailyRate",
    "LATE CHECK OUT": "accommodation.lateCheckout",
    "HOTEL TT R$": "accommodation.totalCents",
    "HOTEL": "accommodation.hotelName",
    // "EMPRESA" é QUEM paga ("Direto c/hotel"); "PAGAMENTO" é COMO se paga
    // ("Adiantamento"). São colunas diferentes na planilha da equipe, e o
    // espelho só tem campo para a primeira — mandar as duas para o mesmo
    // lugar faria a segunda sobrescrever a primeira sem ninguém ver.
    "EMPRESA": "accommodation.paymentCompany",
    "EMPRESA PAGAMENTO": "accommodation.paymentCompany",
    "PAGAMENTO": null,
    "OC": "accommodation.hotelOc",
    "CHECK IN": "accommodation.checkIn4", "CHECK IN 4": "accommodation.checkIn4",
  },
  bagagem: {
    "BAGAGEM TT R$": "baggage.amountCents", "BAGAGEM TT": "baggage.amountCents", "BAGAGEM R$": "baggage.amountCents",
    "OC": "baggage.oc",
    "CHECK IN": "baggage.checkIn", "CHECK IN 1": "baggage.checkIn",
  },
  uber: {
    "UBER TT R$": "uber.amountCents", "UBER TT": "uber.amountCents", "UBER R$": "uber.amountCents",
    "OC": "uber.oc",
    "CHECK IN": "uber.checkIn", "CHECK IN 2": "uber.checkIn",
  },
  locacao: {
    "EMPRESA": "carRental.company", "EMPRESA LOCACAO": "carRental.company",
    "LOCACAO TT R$": "carRental.amountCents", "LOCACAO TT": "carRental.amountCents", "TT R$": "carRental.amountCents",
    "OC": "carRental.oc",
    "CHECK IN": "carRental.checkIn",
  },
};

/**
 * Colunas que nunca gravam, em bloco nenhum.
 *
 * Precisam ser checadas antes do bloco porque aparecem fora do lugar: no
 * export, PENDÊNCIAS é a última coluna do arquivo e cai depois do bloco de
 * locação, onde "PENDENCIAS" não significa nada. São dados que o sistema
 * calcula ou que identificam a pessoa — em nenhum caso vêm de volta pela
 * planilha.
 */
const NUNCA_GRAVA = new Set([
  "NOME", "DEPARTAMENTO", "CPF", "DN", "OBS", "CONTA", "STATUS", "PENDENCIAS", "QUARTO",
  "FREELA | CASA", "FREELA| CASA", "FREELA |CASA", "FREELA|CASA",
]);

export interface ColunaMapeada {
  indice: number;
  titulo: string;
  bloco: Bloco;
  /** null = coluna reconhecida que não se grava. undefined = não reconhecida. */
  campo: string | null | undefined;
}

/**
 * Lê a linha de cabeçalho e diz de qual campo é cada coluna.
 *
 * Detalhe que só aparece com o arquivo real: a coluna "EMPRESA" imediatamente
 * antes de "LOCAÇÃO TT R$" é a LOCADORA, não a companhia aérea. Ela vem antes
 * do marcador do bloco, então é preciso olhar para a frente uma casa.
 */
export function mapearColunas(cabecalho: unknown[]): ColunaMapeada[] {
  const titulos = cabecalho.map((c) => chaveDaColuna(c));
  const abre = (t: string) => ABRE_BLOCO.find((b) => b.nomes.includes(t))?.bloco;

  const out: ColunaMapeada[] = [];
  let bloco: Bloco = "geral";

  for (let i = 0; i < titulos.length; i++) {
    const t = titulos[i];
    if (!t) { out.push({ indice: i, titulo: "", bloco, campo: undefined }); continue; }

    const inicia = abre(t);
    if (inicia) bloco = inicia;
    // "EMPRESA" seguida do marcador de locação já é do bloco de locação.
    else if (t === "EMPRESA" && abre(titulos[i + 1] ?? "") === "locacao") bloco = "locacao";

    const campo = NUNCA_GRAVA.has(t) ? null : CAMPOS[bloco][t];
    out.push({ indice: i, titulo: t, bloco, campo });
  }
  return out;
}

/**
 * A planilha traz "CHECK IN" e o número do check-in em células separadas
 * (mescladas no Excel). A coluna do número não carrega dado nenhum e não pode
 * virar campo.
 */
export function ehColunaDeNumeroSolto(titulo: string): boolean {
  return /^[0-9]+$/.test(titulo);
}
