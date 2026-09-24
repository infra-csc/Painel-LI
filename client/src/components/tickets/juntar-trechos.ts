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
import { toCents } from "@/lib/ticket-form";

type Campos = Record<string, unknown>;

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

  const campos: Campos = {
    ...escreverTrecho(ida, "ida"),
    ...escreverTrecho(volta, "volta"),
    isOneWay: false,
    isReturnOnly: false,
  };

  const cAtual = toCents(atual.value) ?? 0;
  const cLido = toCents(lido.campos.value) ?? 0;
  const total = cAtual + cLido;
  if (total > 0) {
    campos.value = (total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const locs = Array.from(new Set([...locsAtual, ...locsLido]));
  if (locs.length) campos.purchaseOrderNumber = locs.join(" / ");

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
  return { campos, resumo: `${partes}.${conta}` };
}
