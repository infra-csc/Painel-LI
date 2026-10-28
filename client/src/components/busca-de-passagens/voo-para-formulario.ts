/**
 * "Usar este voo" (09/10): o itinerário escolhido na busca → campos do
 * formulário de passagem (o MESMO modal de Passagens). Compras ainda compra no
 * site da companhia e confere tudo antes de registrar — por isso o valor é o
 * PREÇO VISTO, dito na observação, e o LOC fica em branco.
 */
import { ticketToFormValues, type StoredTicketLike, type TicketFormValues } from "@/lib/ticket-form";
import { tipoDaIda, tipoDaVolta, tipoDaVoltaParaGravar } from "@shared/tipo-por-trecho";
import {
  companhiaDaPerna,
  pernasDaOpcao,
  voosDaPerna,
  type ItinerarioDeVoo,
  type PernaDaRota,
} from "@shared/busca-de-passagens";
import { formatarMoeda } from "@/lib/format";

const dia = (iso: string | undefined) => (iso ? iso.slice(0, 10) : "");
const hora = (iso: string | undefined) => (iso ? iso.slice(11, 16) : "");

/** 123456 → "1.234,56" (o formato que o campo Valor aceita). */
export function centavosParaCampo(c: number): string {
  return (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "12/11 14:32" (hora de São Paulo). */
function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");
}

export interface VooEscolhido {
  itinerario: ItinerarioDeVoo;
  perna: PernaDaRota;
  chave: string;
  /** Quando aquele preço foi visto (consulta ou cache). */
  vistoEm: string;
  /** Trecho direto confirmado: a vaga anterior de onde a ida sai. */
  idaVemDeInclusionId?: string | null;
}

export function vooParaFormulario(v: VooEscolhido, observacaoAtual?: string | null): Partial<TicketFormValues> {
  const { ida, volta } = pernasDaOpcao(v.itinerario, v.perna);
  const patch: Partial<TicketFormValues> = {
    transportType: "aereo",
    isOneWay: !!ida && !volta,
    isReturnOnly: !ida && !!volta,
    value: centavosParaCampo(v.itinerario.precoCentavos),
  };
  if (ida) {
    const p = ida.segmentos[0], c = ida.segmentos[ida.segmentos.length - 1];
    Object.assign(patch, {
      departureAirport: p.origem,
      destinationAirport: c.destino,
      actualDepartureDate: dia(p.partida),
      actualDepartureTime: hora(p.partida),
      actualArrivalTime: hora(c.chegada),
    });
  }
  if (volta) {
    const p = volta.segmentos[0], c = volta.segmentos[volta.segmentos.length - 1];
    Object.assign(patch, {
      returnOriginAirport: p.origem,
      returnDestinationAirport: c.destino,
      actualReturnDate: dia(p.partida),
      actualReturnTime: hora(p.partida),
      returnArrivalTime: hora(c.chegada),
    });
  }
  const cias = Array.from(new Set([ida, volta].filter(Boolean).map((p) => companhiaDaPerna(p)))).join(" / ");
  if (cias) patch.ticketCompany = cias;
  if (v.idaVemDeInclusionId && ida) patch.idaVemDeInclusionId = v.idaVemDeInclusionId;
  const voos = [ida ? `ida ${voosDaPerna(ida)}` : "", volta ? `volta ${voosDaPerna(volta)}` : ""].filter(Boolean).join(" · ");
  const linha = `Busca de preços${quando(v.vistoEm) ? ` (${quando(v.vistoEm)})` : ""}: ${cias} — ${voos} — ${formatarMoeda(v.itinerario.precoCentavos)} por pessoa. Valor visto na busca; confira o pago.`;
  const atual = (observacaoAtual ?? "").trim();
  patch.ticketObservations = atual && !atual.includes("Busca de preços") ? `${atual}\n${linha}` : linha;
  return patch;
}

/** O que a regra lê da passagem que a vaga já tem. */
export type PassagemExistente = StoredTicketLike & { ticketCompany?: string | null };

const preenchido = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";
const temIdaGravada = (t: PassagemExistente) =>
  [t.actualDepartureDate, t.actualDepartureTime, t.departureCityOrigin, t.departureCityDestination, t.departureAirport, t.destinationAirport].some(preenchido);
const temVoltaGravada = (t: PassagemExistente) =>
  [t.actualReturnDate, t.actualReturnTime, t.returnCityOrigin, t.returnCityDestination, t.returnOriginAirport, t.returnDestinationAirport].some(preenchido);
const campoDeCentavos = (c: number | null | undefined) => (typeof c === "number" && c > 0 ? centavosParaCampo(c) : "");
const juntarCias = (...cias: (string | null | undefined)[]) =>
  Array.from(new Set(cias.map((c) => String(c ?? "").trim()).filter(Boolean))).join(" / ");

/** A passagem gravada como formulário, sem apagar o que `base` já sugere com campo vazio. */
export function formularioDaPassagem(base: TicketFormValues, passagem: PassagemExistente): TicketFormValues {
  const atual = ticketToFormValues(passagem);
  const out: TicketFormValues = { ...base };
  for (const [k, v] of Object.entries(atual)) if (preenchido(v) || !(k in out)) out[k] = v;
  if (preenchido(passagem.ticketCompany)) out.ticketCompany = String(passagem.ticketCompany);
  return out;
}

/**
 * "Usar este voo" numa vaga que JÁ tem passagem (28/10 — passagem com tipo e
 * valor por trecho). O voo só troca o(s) trecho(s) que ele cobre:
 *
 *  - cobre a VOLTA (ida e volta, ou o voo da volta): a volta vira aérea —
 *    `returnTransportType` volta a vazio ("igual à ida") se a ida também é
 *    aérea, ou o tipo certo por `tipoDaVoltaParaGravar` — e o valor da volta é
 *    o do voo. Ida e volta juntas: uma compra só (o total é o preço do voo).
 *  - cobre só a IDA: a volta fica como está — tipo, valor e bilhete dela —, e
 *    o total = ida nova + volta existente. Sem valor próprio da volta (uma
 *    compra só), o valor gravado antes fica com a volta, à vista no formulário.
 *
 * Sem passagem, é o voo sobre `base` (como sempre).
 */
export function formularioDoVoo(base: TicketFormValues, v: VooEscolhido, passagem?: PassagemExistente | null): TicketFormValues {
  if (!passagem) return { ...base, ...vooParaFormulario(v) };
  const atual = formularioDaPassagem(base, passagem);
  const patch = vooParaFormulario(v, passagem.ticketObservations);
  const { ida, volta } = pernasDaOpcao(v.itinerario, v.perna);
  const preco = centavosParaCampo(v.itinerario.precoCentavos);
  const total = typeof passagem.value === "number" ? passagem.value : null;
  const daVolta = typeof passagem.returnValue === "number" ? passagem.returnValue : null;

  // Ida e volta no mesmo voo: a passagem inteira é este voo (uma compra só, os dois trechos aéreos).
  if ((ida && volta) || (ida && !temVoltaGravada(passagem)) || (volta && !temIdaGravada(passagem))) {
    return {
      ...atual, ...patch,
      returnTransportType: "", returnValue: "", purchaseOrderNumber: "", returnPurchaseOrderNumber: "", purchaseDate: "",
    };
  }

  if (ida) {
    // Só a ida: a volta existente fica (tipo, valor e bilhete dela).
    const tipoDaVoltaAtual = tipoDaVolta(passagem) ?? "aereo";
    return {
      ...atual, ...patch,
      transportType: "aereo",
      returnTransportType: tipoDaVoltaParaGravar("aereo", tipoDaVoltaAtual) ?? "",
      isOneWay: false, isReturnOnly: false,
      value: preco,
      // Sem valor próprio, a volta fica com o que a passagem valia.
      returnValue: campoDeCentavos(daVolta ?? total),
      purchaseOrderNumber: "",
      // Sem bilhete próprio, o número gravado era o da compra que incluía a volta.
      returnPurchaseOrderNumber: String(passagem.returnPurchaseOrderNumber || passagem.purchaseOrderNumber || ""),
      ticketCompany: juntarCias(patch.ticketCompany, passagem.ticketCompany),
    };
  }

  // Só a volta: a ida existente fica (tipo, valor e bilhete dela); a volta vira aérea.
  const tipoDaIdaAtual = tipoDaIda(passagem) ?? "aereo";
  return {
    ...atual, ...patch,
    transportType: tipoDaIdaAtual,
    returnTransportType: tipoDaVoltaParaGravar(tipoDaIdaAtual, "aereo") ?? "",
    isOneWay: false, isReturnOnly: false,
    // A ida fica com o que já era dela (o total, quando era uma compra só).
    value: campoDeCentavos(total === null ? null : total - (daVolta ?? 0)),
    returnValue: preco,
    purchaseOrderNumber: String(passagem.purchaseOrderNumber ?? ""),
    returnPurchaseOrderNumber: "",
    ticketCompany: juntarCias(passagem.ticketCompany, patch.ticketCompany),
  };
}
