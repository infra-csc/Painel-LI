/**
 * "Usar este voo" (09/10): o itinerário escolhido na busca → campos do
 * formulário de passagem (o MESMO modal de Passagens). Compras ainda compra no
 * site da companhia e confere tudo antes de registrar — por isso o valor é o
 * PREÇO VISTO, dito na observação, e o LOC fica em branco.
 */
import type { TicketFormValues } from "@/lib/ticket-form";
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
