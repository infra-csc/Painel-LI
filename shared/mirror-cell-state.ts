/**
 * Estado de cada célula do Espelho Operacional (31/08).
 *
 * O âmbar de "falta preencher" só serve se for SINAL. Pintar toda célula vazia
 * deixaria a grade inteira amarela — 39 colunas × N pessoas, a maioria vazia por
 * não se aplicar — e o operador aprenderia a ignorar a cor. Por isso a
 * obrigatoriedade é CONDICIONAL: só é obrigatório o que Compras precisa para
 * fechar aquela etapa daquela pessoa.
 *
 * Regra pura, sem React e sem rede, porque é a mesma decisão que a grade, os
 * contadores de etapa e o drawer precisam tomar — e foi a duplicação desse tipo
 * de regra que já fez uma tela divergir da outra.
 */

/** O que a célula está dizendo — decide cor e conteúdo. */
export type EstadoCelula =
  /** Tem valor. */
  | "preenchido"
  /** Vazio e ninguém precisa preencher: some em cinza. */
  | "vazio"
  /** Vazio e Compras precisa disto para fechar: âmbar. */
  | "falta"
  /** Sugestão do sistema que ainda não foi confirmada: violeta. */
  | "a_confirmar"
  /** A pessoa foi dispensada desta etapa (hoje só Uber). */
  | "nao_usa";

/** O que a linha tem, do ponto de vista da obrigatoriedade. */
export interface ContextoDaLinha {
  /** A pessoa tem passagem lançada (registro de ticket). */
  temPassagem: boolean;
  /** Hotel definido — é o que destrava os demais campos de hospedagem. */
  temHotel: boolean;
  /** Valor da bagagem extra, em centavos. */
  bagagemCents: number;
  /** Valor do transporte por app, em centavos. */
  uberCents: number;
  /** Valor da locação, em centavos. */
  locacaoCents: number;
  /** Pessoa dispensada da roteirização de Uber. */
  semUber?: boolean;
  /** O grupo de Uber desta pessoa já foi confirmado por alguém. */
  uberConfirmado?: boolean;
  /** O quarto desta pessoa já foi confirmado por alguém. */
  quartoConfirmado?: boolean;
}

/** Campos que nunca são cobrados — preenchê-los é opcional por natureza. */
const NUNCA_OBRIGATORIOS = new Set([
  "schedule.startDate",
  "schedule.endDate",
  "accommodation.lateCheckout",
  "observations",
]);

/** Campos da passagem que só são cobrados quando existe passagem lançada. */
const PASSAGEM_COM_BILHETE = new Set([
  "schedule.departureDate",
  "schedule.returnDate",
  "ticket.ticketCompany",
  "ticket.departureAirport",
  "ticket.returnOriginAirport",
  "ticket.actualDepartureTime",
  "ticket.actualReturnTime",
  "ticket.locator",
  "ticket.purchaseOrderNumber",
  "ticket.checkIn3",
]);

/** Campos da hospedagem que só são cobrados depois que há hotel. */
const HOSPEDAGEM_COM_HOTEL = new Set([
  "accommodation.reservationNumber",
  "accommodation.checkInDate",
  "accommodation.checkOutDate",
  "accommodation.nightsCount",
  "accommodation.dailyRate",
  "accommodation.totalCents",
  "accommodation.paymentCompany",
  "accommodation.hotelOc",
  "accommodation.checkIn4",
]);

/** OC e conferência dos extras: cobradas quando aquele extra tem valor. */
const EXTRA_POR_VALOR: Record<string, keyof Pick<ContextoDaLinha, "bagagemCents" | "uberCents" | "locacaoCents">> = {
  "baggage.oc": "bagagemCents",
  "baggage.checkIn": "bagagemCents",
  "uber.oc": "uberCents",
  "uber.checkIn": "uberCents",
  "carRental.oc": "locacaoCents",
  "carRental.checkIn": "locacaoCents",
  "carRental.company": "locacaoCents",
};

/**
 * Este campo é obrigatório para ESTA pessoa?
 *
 * "Obrigatório" aqui quer dizer "Compras não fecha a etapa sem ele" — não é
 * validação de formulário: nada impede de salvar a linha incompleta.
 */
export function campoObrigatorio(campo: string, ctx: ContextoDaLinha): boolean {
  if (NUNCA_OBRIGATORIOS.has(campo)) return false;

  // Valor da passagem é sempre cobrado: é o número que entra na prestação.
  if (campo === "ticket.value") return true;
  // Hotel também: é ele que destrava (ou dispensa) o resto do bloco.
  if (campo === "accommodation.hotelName") return true;
  // Tipo de quarto sai do agrupamento, não do preenchimento à mão.
  if (campo === "accommodation.roomType") return false;

  if (PASSAGEM_COM_BILHETE.has(campo)) return ctx.temPassagem;
  if (HOSPEDAGEM_COM_HOTEL.has(campo)) return ctx.temHotel;

  const chaveDoExtra = EXTRA_POR_VALOR[campo];
  if (chaveDoExtra) return ctx[chaveDoExtra] > 0;

  // Os valores dos extras em si nunca são cobrados: extra que não houve é zero.
  return false;
}

/** Um valor de célula conta como preenchido? (0 conta; vazio e nulo, não.) */
export function temValor(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === "string") return valor.trim() !== "";
  if (typeof valor === "boolean") return valor;
  return true;
}

/**
 * Colunas que mostram uma SUGESTÃO até alguém confirmar o grupo. Enquanto não
 * confirmadas elas não são cobradas em âmbar: cobrar preenchimento de um número
 * que o próprio sistema calculou seria pedir para o operador digitar por cima
 * da sugestão.
 */
const DEPENDE_DE_UBER = new Set(["uber.amountCents", "uber.oc", "uber.checkIn"]);
const DEPENDE_DE_QUARTO = "accommodation.roomType";

export function estadoDaCelula(campo: string, valor: unknown, ctx: ContextoDaLinha): EstadoCelula {
  if (DEPENDE_DE_UBER.has(campo)) {
    if (ctx.semUber) return "nao_usa";
    if (!ctx.uberConfirmado) return "a_confirmar";
  }
  if (campo === DEPENDE_DE_QUARTO && !ctx.quartoConfirmado) return "a_confirmar";

  if (temValor(valor)) return "preenchido";
  return campoObrigatorio(campo, ctx) ? "falta" : "vazio";
}

/** Quantos campos obrigatórios ainda faltam nesta linha, entre os informados. */
export function faltamNaLinha(
  campos: { campo: string; valor: unknown }[],
  ctx: ContextoDaLinha,
): number {
  return campos.filter(({ campo, valor }) => estadoDaCelula(campo, valor, ctx) === "falta").length;
}

/**
 * Campos que compõem cada etapa da grade. É o que permite responder "quantas
 * pessoas estão PRONTAS para comprar" em vez de "quantas têm o registro
 * criado" — a diferença entre "13 têm hotel" e "9 dá para fechar".
 */
export const CAMPOS_POR_ETAPA = {
  passagem: [
    "ticket.value", "ticket.departureAirport", "ticket.returnOriginAirport",
    "ticket.actualDepartureTime", "ticket.actualReturnTime", "ticket.locator",
    "ticket.ticketCompany", "ticket.purchaseOrderNumber", "ticket.checkIn3",
    "schedule.departureDate", "schedule.returnDate",
  ],
  hospedagem: [
    "accommodation.hotelName", "accommodation.reservationNumber", "accommodation.checkInDate",
    "accommodation.checkOutDate", "accommodation.nightsCount", "accommodation.dailyRate",
    "accommodation.totalCents", "accommodation.paymentCompany", "accommodation.hotelOc",
    "accommodation.checkIn4",
  ],
  bagagem: ["baggage.oc", "baggage.checkIn"],
  uber: ["uber.oc", "uber.checkIn"],
  locacao: ["carRental.company", "carRental.oc", "carRental.checkIn"],
} as const;

export type EtapaDaGrade = keyof typeof CAMPOS_POR_ETAPA;

/**
 * A etapa desta pessoa está fechada? (nenhum campo obrigatório dela em aberto)
 * Célula em "a confirmar" não conta como pendência — quem decide ali é a visão
 * de Uber ou de Quartos, não o preenchimento.
 */
export function etapaCompleta(
  etapa: EtapaDaGrade,
  ler: (campo: string) => unknown,
  ctx: ContextoDaLinha,
): boolean {
  return CAMPOS_POR_ETAPA[etapa].every((campo) => estadoDaCelula(campo, ler(campo), ctx) !== "falta");
}
