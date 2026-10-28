/**
 * TIPO DE TRANSPORTE POR TRECHO (28/10 — Compras, vaga #4618 Erick Ramos,
 * Running Hour Rio): a ida AÉREA já estava comprada (GRU→SDU) e a pessoa
 * passou a VOLTAR DE ÔNIBUS (Novo Rio → Barra Funda). O bilhete do ônibus
 * trocou o tipo da passagem inteira para "Rodoviário" — a ida virou
 * "Rodoviária de origem: GRU". Pedido: "precisava diferenciar".
 *
 * Modelo: `tickets.transport_type` continua sendo o tipo da IDA (e da volta,
 * quando são iguais — todas as passagens antigas). `return_transport_type`
 * só é preenchido quando a VOLTA é diferente; NULL = igual à ida. Passagem
 * "só volta" guarda o seu tipo em `transport_type` (é o único trecho dela).
 *
 * Esta é a ÚNICA leitura de "qual é o tipo deste trecho?" — telas, Planejado,
 * Escala e sanidade usam daqui.
 */

export type TipoDoTrecho = "aereo" | "rodoviario" | "van";
export type LadoDoTrecho = "ida" | "volta";

/** O que a regra lê da passagem. */
export interface TiposDaPassagem {
  transportType?: string | null;
  returnTransportType?: string | null;
}

const TIPOS: readonly string[] = ["aereo", "rodoviario", "van"];

/** "aereo" | "rodoviario" | "van" ou null (vazio/desconhecido — cada tela decide o padrão). */
export function tipoValido(v: unknown): TipoDoTrecho | null {
  const s = String(v ?? "").trim().toLowerCase();
  return TIPOS.includes(s) ? (s as TipoDoTrecho) : null;
}

/** Tipo gravado da IDA (o da passagem). Null quando ninguém escolheu. */
export function tipoDaIda(t: TiposDaPassagem | null | undefined): TipoDoTrecho | null {
  return tipoValido(t?.transportType);
}

/** Tipo da VOLTA: o próprio, se a volta é diferente; senão o da ida. */
export function tipoDaVolta(t: TiposDaPassagem | null | undefined): TipoDoTrecho | null {
  return tipoValido(t?.returnTransportType) ?? tipoValido(t?.transportType);
}

export function tipoDoTrecho(t: TiposDaPassagem | null | undefined, lado: LadoDoTrecho): TipoDoTrecho | null {
  return lado === "ida" ? tipoDaIda(t) : tipoDaVolta(t);
}

/** A volta tem tipo diferente da ida? (ida aérea + volta de ônibus) */
export function voltaComOutroTipo(t: TiposDaPassagem | null | undefined): boolean {
  const ida = tipoDaIda(t) ?? "aereo";
  const volta = tipoValido(t?.returnTransportType);
  return !!volta && volta !== ida;
}

/**
 * O que gravar em `return_transport_type`: só o tipo DIFERENTE da ida. Igual
 * à ida, vazio, inválido ou passagem de van (a van não tem trechos) → null —
 * assim "igual à ida" tem uma representação só e nada muda para as antigas.
 */
export function tipoDaVoltaParaGravar(
  transportType: unknown,
  returnTransportType: unknown,
  /** Pernas da passagem: "só ida" / "só volta" têm um trecho só — o tipo é o de `transportType`. */
  pernas?: { temIda: boolean; temVolta: boolean },
): "aereo" | "rodoviario" | null {
  if (pernas && !(pernas.temIda && pernas.temVolta)) return null;
  const ida = tipoValido(transportType) ?? "aereo";
  const volta = tipoValido(returnTransportType);
  if (!volta || ida === "van" || volta === "van" || volta === ida) return null;
  return volta;
}

/** Terrestre (ônibus/van) — a mobilidade é R$29 fixo e o jantar do retorno sai às 20h. */
export function trechoTerrestre(tipo: string | null | undefined): boolean {
  return tipo === "rodoviario" || tipo === "van";
}

export const NOME_DO_TIPO: Record<TipoDoTrecho, string> = { aereo: "Aéreo", rodoviario: "Rodoviário", van: "Van" };

/** "Aéreo", "Rodoviário", "Van" — vazio vira "Aéreo" (o padrão de sempre das telas). */
export function nomeDoTipo(tipo: string | null | undefined): string {
  return NOME_DO_TIPO[tipoValido(tipo) ?? "aereo"];
}

/** "Aéreo" ou "Ida aérea · volta rodoviária" — para lista, Excel e auditoria. */
export function nomeDosTiposDaPassagem(t: TiposDaPassagem | null | undefined): string {
  const ida = tipoDaIda(t) ?? "aereo";
  if (!voltaComOutroTipo(t)) return NOME_DO_TIPO[ida];
  const fem = (x: TipoDoTrecho) => (x === "aereo" ? "aérea" : x === "rodoviario" ? "rodoviária" : "van");
  return `Ida ${fem(ida)} · volta ${fem(tipoDaVolta(t)!)}`;
}

// ── Volta comprada à parte: valor e bilhete por trecho (28/10) ─────────────
//
// Dono (28/10): "deveria SOMAR os valores de ida e volta também". `value`
// continua sendo o TOTAL da passagem — o que o Espelho, as Análises, as listas
// e o histórico de troca já somam, sem mudar nada neles. `returnValue` é a
// parte da volta DENTRO do total; a ida é o resto. Sem `returnValue`, a
// passagem é de uma compra só (como sempre).

export interface ValoresDaPassagem {
  value?: number | null;
  returnValue?: number | null;
}

export interface ValoresPorTrecho {
  totalCents: number | null;
  /** null quando a passagem é de uma compra só (não há como separar). */
  idaCents: number | null;
  voltaCents: number | null;
}

export function valoresPorTrecho(t: ValoresDaPassagem | null | undefined): ValoresPorTrecho {
  const total = typeof t?.value === "number" ? t.value : null;
  const volta = typeof t?.returnValue === "number" ? t.returnValue : null;
  if (volta === null) return { totalCents: total, idaCents: null, voltaCents: null };
  return { totalCents: total, idaCents: Math.max(0, (total ?? 0) - volta), voltaCents: volta };
}

const reais = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "ida R$ 388,93 + volta R$ 150,00" — ou null numa passagem de uma compra só. */
export function detalheDosValores(t: ValoresDaPassagem | null | undefined): string | null {
  const v = valoresPorTrecho(t);
  if (v.voltaCents === null) return null;
  return `ida ${reais(v.idaCents ?? 0)} + volta ${reais(v.voltaCents)}`;
}

/** "LOC JPLN7F8J · Bilhete 4471" — o número de cada compra com o rótulo do tipo do trecho. */
export function numerosDaCompra(t: (TiposDaPassagem & { purchaseOrderNumber?: string | null; returnPurchaseOrderNumber?: string | null }) | null | undefined): string[] {
  const out: string[] = [];
  const ida = tipoDaIda(t) ?? "aereo";
  const rot = (tipo: TipoDoTrecho) => (tipo === "van" ? "Empresa" : tipo === "rodoviario" ? "Bilhete" : "LOC");
  const daVolta = String(t?.returnPurchaseOrderNumber ?? "").trim();
  if (t?.purchaseOrderNumber) out.push(`${daVolta ? rot(ida) : rotuloDoNumeroDaCompra(t)} ${t.purchaseOrderNumber}`);
  if (daVolta) out.push(`${rot(tipoDaVolta(t) ?? ida)} ${daVolta}`);
  return out;
}

/** Rótulo do número da compra por tipo: "LOC" (aéreo), "Bilhete" (ônibus), "Empresa" (van). */
export function rotuloDoNumeroDaCompra(t: TiposDaPassagem | null | undefined): string {
  const ida = tipoDaIda(t) ?? "aereo";
  if (ida === "van") return "Empresa";
  const volta = tipoDaVolta(t) ?? ida;
  if (ida !== volta) return "LOC / Bilhete";
  return ida === "rodoviario" ? "Bilhete" : "LOC";
}

// ── Valor por TIPO de transporte (Análises, 28/10) ─────────────────────────

export interface ParteDoTipo {
  /** "ida" = a passagem inteira (ou só a ida, quando a volta é de outro tipo). */
  lado: LadoDoTrecho;
  tipo: TipoDoTrecho | null;
  /** Centavos; null quando não há como separar (volta de outro tipo sem valor próprio). */
  valorCents: number | null;
}

/**
 * Quanto de cada passagem é de cada tipo (28/10). Ida aérea R$ 388,93 +
 * volta de ônibus R$ 150,00 (value 53893, returnValue 15000) → aéreo 38893 e
 * rodoviário 15000. Volta do mesmo tipo da ida (todas as antigas) → uma parte
 * só, com o TOTAL no tipo da ida, como sempre. Volta de outro tipo sem valor
 * próprio → o total fica na ida e a volta entra sem valor (não há como separar).
 */
export function partesPorTipo(t: (TiposDaPassagem & ValoresDaPassagem) | null | undefined): ParteDoTipo[] {
  const total = typeof t?.value === "number" ? t.value : null;
  const ida: ParteDoTipo = { lado: "ida", tipo: tipoDaIda(t), valorCents: total };
  if (!voltaComOutroTipo(t)) return [ida];
  const v = valoresPorTrecho(t);
  const volta: ParteDoTipo = { lado: "volta", tipo: tipoDaVolta(t), valorCents: v.voltaCents };
  return v.voltaCents === null ? [ida, volta] : [{ ...ida, valorCents: v.idaCents }, volta];
}

/**
 * Espelho (28/10): o número da compra com o da volta comprada à parte —
 * "JPLN7F8J · volta 4471". Sem bilhete próprio na volta, só o da passagem
 * (como sempre); só a volta preenchida → "volta 4471". Vazio → "".
 */
export function numeroDaCompraComVolta(t: { purchaseOrderNumber?: string | null; returnPurchaseOrderNumber?: string | null } | null | undefined): string {
  const ida = String(t?.purchaseOrderNumber ?? "").trim();
  const volta = String(t?.returnPurchaseOrderNumber ?? "").trim();
  if (!volta) return ida;
  return ida ? `${ida} · volta ${volta}` : `volta ${volta}`;
}
