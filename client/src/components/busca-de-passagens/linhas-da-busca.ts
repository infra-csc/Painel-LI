/**
 * Linhas da aba Buscar (09/10): cada escalação que precisa de passagem aérea,
 * com o que a busca VAI usar (origem → destino, datas e horários sugeridos,
 * pernas) e o que falta — calculado pela MESMA regra do servidor
 * (shared/busca-de-passagens.ts · planejarBusca), vaga a vaga.
 *
 * Passagem comprada entra com as datas e o aeroporto de saída DELA (para
 * comparar o pago com o preço de hoje na mesma viagem).
 */
import type { Collaborator, Event, TeamInclusion, Ticket } from "@shared/schema";
import {
  faixaDeHorario,
  planejarBusca,
  type AjusteDaBusca,
  type DadoFaltando,
  type EventoDaBusca,
  type RotaPlanejada,
  type VagaDaBusca,
} from "@shared/busca-de-passagens";
import { chaveDaCidade, ehIata } from "@shared/aeroportos-do-brasil";
import { cidadeDoEvento, diaDe } from "@shared/janela-de-viagem";
import type { FiltrosDaBusca, FiltroDeTrecho } from "./filtros-da-busca";

export interface LinhaDaBusca {
  vaga: TeamInclusion;
  evento: Event | undefined;
  passagem: Ticket | undefined;
  comprada: boolean;
  valorPagoCentavos: number | null;
  colaborador: string;
  funcao: string;
  cidadeDeSaida: string;
  cidadeDoEvento: string;
  trecho: Exclude<FiltroDeTrecho, "todos">;
  rotas: RotaPlanejada[];
  faltas: DadoFaltando[];
  dataIda: string | null;
  dataVolta: string | null;
  chegarAte: string | null;
  sairApos: string | null;
  /** Ajustes automáticos (passagem comprada) + os feitos na tela. */
  ajuste: AjusteDaBusca;
}

/** Ajuste que a passagem comprada impõe: as datas e a saída dela. */
export function ajusteDaPassagem(t: Ticket | undefined): AjusteDaBusca {
  if (!t) return {};
  const out: AjusteDaBusca = {};
  const ida = diaDe(t.actualDepartureDate), volta = diaDe(t.actualReturnDate);
  if (ida) out.dataIda = ida;
  if (volta) out.dataVolta = volta;
  if (t.departureAirport && ehIata(t.departureAirport.trim())) out.aeroportoDeCasa = t.departureAirport.trim().toUpperCase();
  else if (t.returnDestinationAirport && ehIata(t.returnDestinationAirport.trim())) out.aeroportoDeCasa = t.returnDestinationAirport.trim().toUpperCase();
  return out;
}

export function eventoDaBusca(e: Event): EventoDaBusca {
  return { id: e.id, name: e.name, location: e.location, aeroportoIata: e.aeroportoIata ?? null };
}

export function montarLinhas(entrada: {
  vagas: readonly TeamInclusion[];
  eventById: ReadonlyMap<string, Event>;
  collaboratorById: ReadonlyMap<string, Collaborator>;
  ticketByInclusion: ReadonlyMap<string, Ticket>;
  nomeDoColaborador: (id?: string | null) => string;
  nomeDaFuncao: (id: string) => string;
  ajustes: Record<string, AjusteDaBusca | undefined>;
  hoje: string;
}): LinhaDaBusca[] {
  const eventos = new Map<string, EventoDaBusca>();
  entrada.eventById.forEach((e, id) => eventos.set(id, eventoDaBusca(e)));
  const out: LinhaDaBusca[] = [];
  for (const v of entrada.vagas) {
    const passagem = entrada.ticketByInclusion.get(v.id);
    const cidadeDeSaida = (v.city || (v.collaboratorId ? entrada.collaboratorById.get(v.collaboratorId)?.city : "") || "").trim();
    const ajuste: AjusteDaBusca = { ...ajusteDaPassagem(passagem), ...(entrada.ajustes[v.id] ?? {}) };
    const vaga: VagaDaBusca = { ...v, cidadeDeSaida };
    const plano = planejarBusca({ vagas: [vaga], eventos, ajustes: { [v.id]: ajuste }, hoje: entrada.hoje });
    // Só escalação com trecho AÉREO a comprar entra na tela.
    if (plano.faltando.some((f) => f.tipo === "nao_precisa" || f.tipo === "sem_trecho_aereo")) continue;
    const temIda = v.trechosSugeridos !== "so_volta" && (!v.transportModeIda || v.transportModeIda === "aereo") && ajuste.somente !== "volta";
    const temVolta = v.trechosSugeridos !== "so_ida" && !v.voltaSegueParaEventoId && (!v.transportModeVolta || v.transportModeVolta === "aereo") && ajuste.somente !== "ida";
    const direto = !!(v.idaVemDoEventoId || ajuste.idaDoEventoId);
    const evento = entrada.eventById.get(v.eventId);
    out.push({
      vaga: v,
      evento,
      passagem,
      comprada: !!passagem,
      valorPagoCentavos: passagem?.value ?? null,
      colaborador: entrada.nomeDoColaborador(v.collaboratorId),
      funcao: entrada.nomeDaFuncao(v.functionId),
      cidadeDeSaida,
      cidadeDoEvento: cidadeDoEvento(evento?.location),
      trecho: direto ? "direto" : temIda && temVolta ? "ida_e_volta" : temIda ? "so_ida" : "so_volta",
      rotas: plano.rotas,
      faltas: plano.faltando,
      dataIda: temIda ? (ajuste.dataIda ?? diaDe(v.flightDepartureDate)) : null,
      dataVolta: temVolta ? (ajuste.dataVolta ?? diaDe(v.flightReturnDate)) : null,
      chegarAte: temIda && faixaDeHorario(v.flightArrivalSuggestedTime, "chegar_ate") ? (v.flightArrivalSuggestedTime ?? null) : null,
      sairApos: temVolta && faixaDeHorario(v.flightReturnSuggestedTime, "sair_apos") ? (v.flightReturnSuggestedTime ?? null) : null,
      ajuste,
    });
  }
  return out;
}

const TIPOS_DE_FALTA: Record<"sem_data" | "sem_cidade" | "sem_aeroporto", DadoFaltando["tipo"][]> = {
  sem_data: ["sem_data_ida", "sem_data_volta", "data_passada", "volta_antes_da_ida"],
  sem_cidade: ["sem_cidade_de_saida", "cidade_sem_aeroporto"],
  sem_aeroporto: ["evento_sem_aeroporto"],
};

/** Destino da linha para o filtro: o aeroporto confirmado ou a cidade do evento. */
export const destinoDaLinha = (l: LinhaDaBusca) => l.evento?.aeroportoIata || chaveDaCidade(l.cidadeDoEvento) || "";
export const saidaDaLinha = (l: LinhaDaBusca) => chaveDaCidade(l.cidadeDeSaida);

export type CampoContado = "situacao" | "evento" | "saida" | "destino" | "funcoes";

/** Passa nos filtros? `ignorar` zera um filtro (para contar as opções dele). */
export function passaNosFiltros(l: LinhaDaBusca, f: FiltrosDaBusca, ignorar?: CampoContado): boolean {
  if (ignorar !== "situacao") {
    if (f.situacao === "pendentes" && l.comprada) return false;
    if (f.situacao === "compradas" && !l.comprada) return false;
  }
  if (ignorar !== "evento" && f.evento !== "all" && l.vaga.eventId !== f.evento) return false;
  if (ignorar !== "funcoes" && f.funcoes.length > 0 && !f.funcoes.includes(l.vaga.functionId)) return false;
  if (ignorar !== "saida" && f.saida !== "all" && saidaDaLinha(l) !== f.saida) return false;
  if (ignorar !== "destino" && f.destino !== "all" && destinoDaLinha(l) !== f.destino) return false;
  if (f.trecho !== "todos" && l.trecho !== f.trecho) return false;
  if (f.falta === "prontas" && l.faltas.length > 0) return false;
  if (f.falta === "com_falta" && l.faltas.length === 0) return false;
  if (f.falta === "sem_data" || f.falta === "sem_cidade" || f.falta === "sem_aeroporto") {
    const tipos = TIPOS_DE_FALTA[f.falta];
    if (!l.faltas.some((x) => tipos.includes(x.tipo))) return false;
  }
  if (f.de && (!l.dataIda || l.dataIda < f.de)) return false;
  if (f.ate && (!l.dataIda || l.dataIda > f.ate)) return false;
  const q = f.q.replace(/#/g, "").trim().toLowerCase();
  if (q) {
    const alvo = `${l.vaga.inclusionNumber ?? ""} ${l.colaborador} ${l.funcao} ${l.evento?.name ?? ""}`.toLowerCase();
    if (!alvo.includes(q)) return false;
  }
  return true;
}

/** Ordem da lista: a ida mais próxima primeiro; sem data no fim. */
export function ordenarLinhas(linhas: LinhaDaBusca[]): LinhaDaBusca[] {
  return linhas.slice().sort((a, b) =>
    (a.dataIda ?? a.dataVolta ?? "9999").localeCompare(b.dataIda ?? b.dataVolta ?? "9999")
    || (a.vaga.inclusionNumber ?? 0) - (b.vaga.inclusionNumber ?? 0));
}
