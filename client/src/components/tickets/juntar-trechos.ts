/**
 * Ida e volta em vouchers DIFERENTES (dono, 15/09: "há casos de registro de
 * passagem de ida e volta mas com vouchers diferentes; o app tem que entender
 * que os dois são ida e volta e somar o total dos valores").
 *
 * O leitor de PDF avisa quando o voucher traz um trecho só (`trechoUnico`) e o
 * põe nos campos de IDA. Sozinho ele não sabe se é a ida ou a volta — quem
 * sabe é o que JÁ está na passagem. Esta função junta os dois:
 *   - o trecho mais cedo vira IDA e o mais tarde vira VOLTA;
 *   - os valores SOMAM;
 *   - os LOCs ficam juntos ("ABC123 / DEF456").
 *
 * Não junta (devolve null, e a tela segue como antes) quando: o voucher traz
 * os dois trechos; a passagem está vazia ou já tem ida E volta; ou o LOC lido
 * já está na passagem (é o mesmo voucher relido — somar dobraria o valor).
 */
import { normalizeTransportType, toCents, type TransportType } from "@/lib/ticket-form";

type Campos = Record<string, unknown>;

/**
 * TIPO POR TRECHO (28/10, vaga #4618): cada trecho guarda o seu tipo. O da
 * ida é `transportType`; o da volta, `returnTransportType` quando diferente
 * ("" = igual à ida). Passagem só de volta guarda o tipo em `transportType`.
 */
function tipoDoLado(c: Campos, lado: "ida" | "volta"): TransportType {
  if (lado === "ida") return normalizeTransportType(c.transportType);
  return normalizeTransportType(vazio(c.returnTransportType) ? c.transportType : c.returnTransportType);
}

/** Os dois tipos gravados no formato do formulário ("" = volta igual à ida). */
function camposDosTipos(ida: TransportType, volta: TransportType): Campos {
  return { transportType: ida, returnTransportType: volta !== ida ? volta : "" };
}

const NOME_DO_TIPO: Record<TransportType, string> = { aereo: "aérea", rodoviario: "de ônibus", van: "de van" };

/** Campos de um trecho, no nome da IDA → nome equivalente na VOLTA. */
const IDA_PARA_VOLTA: Record<string, string> = {
  departureAirport: "returnOriginAirport",
  destinationAirport: "returnDestinationAirport",
  departureCityOrigin: "returnCityOrigin",
  departureCityDestination: "returnCityDestination",
  actualDepartureDate: "actualReturnDate",
  actualDepartureTime: "actualReturnTime",
  actualArrivalTime: "returnArrivalTime",
};
const CAMPOS_IDA = Object.keys(IDA_PARA_VOLTA);

const vazio = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
const temIda = (c: Campos) => CAMPOS_IDA.some((k) => !vazio(c[k]));
const temVolta = (c: Campos) => CAMPOS_IDA.some((k) => !vazio(c[IDA_PARA_VOLTA[k]]));

/** Lê um trecho (ida ou volta) e devolve no nome dos campos de IDA. */
function lerTrecho(c: Campos, lado: "ida" | "volta"): Campos {
  const t: Campos = {};
  for (const k of CAMPOS_IDA) t[k] = lado === "ida" ? c[k] : c[IDA_PARA_VOLTA[k]];
  return t;
}

/** Escreve um trecho (no nome de IDA) no lado pedido — campo sem valor fica "". */
function escreverTrecho(t: Campos, lado: "ida" | "volta"): Campos {
  const out: Campos = {};
  for (const k of CAMPOS_IDA) out[lado === "ida" ? k : IDA_PARA_VOLTA[k]] = vazio(t[k]) ? "" : t[k];
  return out;
}

const locsDe = (v: unknown): string[] =>
  String(v ?? "").split("/").map((s) => s.trim().toUpperCase()).filter(Boolean);

/** "1.234,50" — o formato do campo de valor do formulário. */
const formatarReais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const reais = (cents: number) =>
  `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const momento = (t: Campos) => (vazio(t.actualDepartureDate) ? "" : `${t.actualDepartureDate}T${t.actualDepartureTime || "00:00"}`);

export interface IdaEVoltaJuntas {
  /** Campos para aplicar na passagem (substituem ida, volta, valor e LOC). */
  campos: Campos;
  /** Frase para o aviso: o que foi juntado e a conta do valor. */
  resumo: string;
}

export function juntarIdaEVolta(
  atual: Campos | null | undefined,
  lido: { campos: Campos; trechoUnico?: boolean },
): IdaEVoltaJuntas | null {
  if (!atual || !lido.trechoUnico) return null;
  const aIda = temIda(atual);
  const aVolta = temVolta(atual);
  if (aIda === aVolta) return null; // vazia, ou já com ida e volta

  const locsAtual = locsDe(atual.purchaseOrderNumber);
  const locsLido = locsDe(lido.campos.purchaseOrderNumber);
  if (locsLido.length > 0 && locsLido.every((l) => locsAtual.includes(l))) return null; // mesmo voucher

  const existente = lerTrecho(atual, aIda ? "ida" : "volta");
  const novo = temIda(lido.campos) ? lerTrecho(lido.campos, "ida") : lerTrecho(lido.campos, "volta");
  if (!temIda(novo)) return null;

  // Mais cedo = ida. Sem data para comparar, o que já estava mantém o seu lado.
  const mExistente = momento(existente);
  const mNovo = momento(novo);
  const novoPrimeiro = mExistente && mNovo ? mNovo < mExistente : !aIda;
  const [ida, volta] = novoPrimeiro ? [novo, existente] : [existente, novo];
  // Cada trecho leva o SEU tipo (28/10): ida aérea + volta de ônibus não vira
  // tudo rodoviário (nem tudo aéreo).
  const tipoExistente = tipoDoLado(atual, aIda ? "ida" : "volta");
  const tipoNovo = vazio(lido.campos.transportType) ? tipoExistente : normalizeTransportType(lido.campos.transportType);
  const [tipoIda, tipoVolta] = novoPrimeiro ? [tipoNovo, tipoExistente] : [tipoExistente, tipoNovo];

  const campos: Campos = {
    ...escreverTrecho(ida, "ida"),
    ...escreverTrecho(volta, "volta"),
    ...camposDosTipos(tipoIda, tipoVolta),
    isOneWay: false,
    isReturnOnly: false,
  };

  const cAtual = toCents(atual.value) ?? 0;
  const cLido = toCents(lido.campos.value) ?? 0;
  const total = cAtual + cLido;
  // Cada trecho com o SEU valor e o SEU LOC/bilhete (28/10 — dono: "deveria
  // SOMAR os valores de ida e volta"): o da ida fica em value/purchaseOrderNumber,
  // o da volta em returnValue/returnPurchaseOrderNumber; o total gravado é a soma.
  const compraExistente = { loc: locsAtual.join(" / "), cents: cAtual };
  const compraNova = { loc: locsLido.join(" / "), cents: cLido };
  const [compraIda, compraVolta] = novoPrimeiro ? [compraNova, compraExistente] : [compraExistente, compraNova];
  campos.value = compraIda.cents > 0 ? formatarReais(compraIda.cents) : "";
  campos.returnValue = compraVolta.cents > 0 ? formatarReais(compraVolta.cents) : "";
  campos.purchaseOrderNumber = compraIda.loc;
  campos.returnPurchaseOrderNumber = compraVolta.loc;
  const locs = Array.from(new Set([...locsAtual, ...locsLido]));

  const cias = Array.from(new Set([atual.ticketCompany, lido.campos.ticketCompany].filter((c) => !vazio(c)).map((c) => String(c).trim().toUpperCase())));
  if (cias.length) campos.ticketCompany = cias.join(" / ");

  const compras = [atual.purchaseDate, lido.campos.purchaseDate].filter((d) => !vazio(d)).sort();
  if (compras.length) campos.purchaseDate = compras[0];

  const partes = [
    "Juntei ida e volta de vouchers diferentes",
    locs.length > 1 ? `(LOC ${locs.join(" e ")})` : "",
  ].filter(Boolean).join(" ");
  const conta = cAtual > 0 && cLido > 0
    ? ` Valor somado: ${reais(cAtual)} + ${reais(cLido)} = ${reais(total)}.`
    : total > 0 ? ` Valor: ${reais(total)} — um dos vouchers veio sem valor, confira.` : "";
  const tipos = tipoIda !== tipoVolta ? ` Ida ${NOME_DO_TIPO[tipoIda]} e volta ${NOME_DO_TIPO[tipoVolta]} — cada trecho com o seu tipo.` : "";
  return { campos, resumo: `${partes}.${conta}${tipos}` };
}

// ── Bilhete de UM trecho numa passagem que já tem ida E volta (28/10) ──────
//
// Caso #4618: ida e volta aéreas compradas; a volta virou ônibus. O bilhete do
// ônibus trazia só a volta e era aplicado por cima da passagem inteira — o
// tipo da IDA virava rodoviário e o LOC do voo sumia. Agora a tela PERGUNTA
// qual trecho o bilhete substitui e mexe só nele.

export type LadoDoBilhete = "ida" | "volta";

/** O bilhete traz um trecho só e a passagem já tem os dois: é preciso escolher qual trocar. */
export function precisaEscolherOTrecho(atual: Campos | null | undefined, lido: { campos: Campos; trechoUnico?: boolean }): boolean {
  if (!atual || !lido.trechoUnico) return false;
  if (!temIda(lido.campos) && !temVolta(lido.campos)) return false;
  return temIda(atual) && temVolta(atual);
}

const diasEntre = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;

/**
 * Qual trecho o bilhete deve substituir — a sugestão da pergunta. O leitor do
 * ônibus SABE (põe a volta nos campos da volta); o do voo põe um trecho só
 * sempre nos campos de ida — aí vale a data mais próxima. Empate: a ida.
 */
export function ladoSugerido(atual: Campos, lido: { campos: Campos }): LadoDoBilhete {
  if (!temIda(lido.campos) && temVolta(lido.campos)) return "volta";
  const dia = String(lido.campos.actualDepartureDate ?? "").slice(0, 10);
  const ida = String(atual.actualDepartureDate ?? "").slice(0, 10);
  const volta = String(atual.actualReturnDate ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dia) && /^\d{4}-\d{2}-\d{2}$/.test(ida) && /^\d{4}-\d{2}-\d{2}$/.test(volta)) {
    return diasEntre(dia, volta) < diasEntre(dia, ida) ? "volta" : "ida";
  }
  return "ida";
}

const br = (iso: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}` : "";
};

/** "aérea · GRU → SDU · 11/11 12:05" — para a pergunta e o aviso. */
export function descreverTrecho(c: Campos, lado: LadoDoBilhete): string {
  const t = lerTrecho(c, lado);
  const de = String(t.departureAirport || t.departureCityOrigin || "").trim();
  const para = String(t.destinationAirport || t.departureCityDestination || "").trim();
  const quando = [br(t.actualDepartureDate), String(t.actualDepartureTime ?? "").trim()].filter(Boolean).join(" ");
  return [NOME_DO_TIPO[tipoDoLado(c, lado)], de || para ? `${de || "?"} → ${para || "?"}` : "", quando].filter(Boolean).join(" · ");
}

/** O trecho do bilhete lido (onde quer que o leitor o tenha posto), descrito com o tipo dele. */
export function descreverBilhete(lido: { campos: Campos }): string {
  const lado: LadoDoBilhete = temIda(lido.campos) ? "ida" : "volta";
  const c = { ...lido.campos, returnTransportType: "" };
  return descreverTrecho(c, lado);
}

/**
 * Troca SÓ o trecho escolhido pelo do bilhete — campos, tipo, bilhete/LOC e
 * valor DELE (a volta comprada à parte: returnPurchaseOrderNumber/returnValue).
 * O outro trecho fica como estava, com o seu tipo, LOC e valor; o total da
 * passagem é a soma (dono, 28/10). Trocar a ida de uma passagem de uma compra
 * só passa aquela compra para a volta (é o que sobrou dela).
 */
export function substituirUmTrecho(atual: Campos, lido: { campos: Campos }, lado: LadoDoBilhete): IdaEVoltaJuntas {
  const novo = temIda(lido.campos) ? lerTrecho(lido.campos, "ida") : lerTrecho(lido.campos, "volta");
  const outro: LadoDoBilhete = lado === "ida" ? "volta" : "ida";
  const tipoOutro = tipoDoLado(atual, outro);
  const tipoNovo = vazio(lido.campos.transportType) ? tipoDoLado(atual, lado) : normalizeTransportType(lido.campos.transportType);
  const [tipoIda, tipoVolta] = lado === "ida" ? [tipoNovo, tipoOutro] : [tipoOutro, tipoNovo];

  const campos: Campos = {
    ...escreverTrecho(novo, lado),
    ...camposDosTipos(tipoIda, tipoVolta),
    isOneWay: false,
    isReturnOnly: false,
  };

  const cias = Array.from(new Set([atual.ticketCompany, lido.campos.ticketCompany].filter((c) => !vazio(c)).map((c) => String(c).trim().toUpperCase())));
  if (cias.length) campos.ticketCompany = cias.join(" / ");

  // A compra de cada trecho (28/10): ida em value/purchaseOrderNumber, volta à
  // parte em returnValue/returnPurchaseOrderNumber.
  const jaSeparada = !vazio(atual.returnValue) || !vazio(atual.returnPurchaseOrderNumber);
  const daIda = { loc: String(atual.purchaseOrderNumber ?? "").trim(), cents: toCents(atual.value) ?? 0 };
  const daVolta = { loc: String(atual.returnPurchaseOrderNumber ?? "").trim(), cents: toCents(atual.returnValue) ?? 0 };
  const doLado = lado === "ida" ? daIda : daVolta;
  const locLido = locsDe(lido.campos.purchaseOrderNumber).join(" / ");
  const mesmoBilhete = !!locLido && locsDe(doLado.loc).join(" / ") === locLido;
  const centsLido = toCents(lido.campos.value);
  const nova = { loc: locLido || doLado.loc, cents: centsLido ?? (mesmoBilhete ? doLado.cents : 0) };

  let ida = daIda, volta = daVolta;
  let aviso = "";
  if (lado === "volta") {
    volta = nova;
    if (!jaSeparada && daIda.cents > 0) aviso = ` O valor que estava (${reais(daIda.cents)}) ficou como Valor da ida — se ele incluía a volta antiga, ajuste.`;
  } else {
    ida = nova;
    // Passagem de uma compra só: o que sobra dela é a volta.
    if (!jaSeparada) {
      volta = daIda;
      if (daIda.cents > 0) aviso = ` A compra que estava (${reais(daIda.cents)}) ficou como Valor da volta — se ela incluía a ida antiga, ajuste.`;
    }
  }
  campos.purchaseOrderNumber = ida.loc;
  campos.value = ida.cents > 0 ? formatarReais(ida.cents) : "";
  campos.returnPurchaseOrderNumber = volta.loc;
  campos.returnValue = volta.cents > 0 ? formatarReais(volta.cents) : "";

  const total = ida.cents + volta.cents;
  const conta = nova.cents > 0
    ? ` Total: ida ${reais(ida.cents)} + volta ${reais(volta.cents)} = ${reais(total)}.`
    : ` O bilhete não traz valor: informe o Valor da ${lado}.`;
  const ficou = descreverTrecho({ ...atual }, outro);
  const resumo = `Troquei só a ${lado} pelo bilhete (${descreverTrecho(campos, lado)}). A ${outro} ficou como estava${ficou ? ` (${ficou})` : ""}.${conta}${aviso}`;
  return { campos, resumo };
}

/**
 * Nota do voucher nas Observações da passagem (19/10 — caso #3913): a conexão
 * ("Volta com conexão em Fortaleza (FOR), chega 13:25 e sai 14:20.") não tem
 * campo próprio. Entra no FIM do que já estava escrito, sem apagar nada, e não
 * se repete quando o mesmo voucher é lido de novo.
 */
export function juntarObservacao(atual: unknown, nota: string | null | undefined): string {
  const antes = String(atual ?? "").trim();
  const nova = String(nota ?? "").trim();
  if (!nova || antes.includes(nova)) return antes;
  return antes ? `${antes}\n${nova}` : nova;
}
