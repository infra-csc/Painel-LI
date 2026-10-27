/**
 * Linhas da aba Buscar (09/10): cada escalação que precisa de passagem aérea,
 * com o que a busca VAI usar (origem → destino, datas e horários sugeridos,
 * pernas) e o que falta — calculado pela MESMA regra do servidor
 * (shared/busca-de-passagens.ts · planejarBusca), vaga a vaga.
 *
 * Passagem comprada entra com as datas e o aeroporto de saída DELA (para
 * comparar o pago com o preço de hoje na mesma viagem).
 *
 * 15/10 (dono): de primeira só os eventos que ainda não terminaram (fim hoje
 * ou depois, fuso de São Paulo) — "Incluir eventos passados" traz o resto. O
 * servidor já manda só esses (`?futuros=1`); o teste aqui é o mesmo, para a
 * lista e as contagens das faixas nunca divergirem.
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
import { isEventPast } from "@shared/event-window";
import { cidadeDoEvento, diaDe } from "@shared/janela-de-viagem";
import type { FiltrosDaBusca, FiltroDeTrecho } from "./filtros-da-busca";
import { comModoTerrestre, type TrechoTerrestre } from "@shared/transporte-terrestre";

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
  /**
   * Aeroporto do evento que a busca usa sem ninguém ter confirmado (o principal
   * da cidade, 15/10); null = já confirmado no evento, ou cidade desconhecida.
   */
  aeroportoSugerido: string | null;
  /** Aeroportos da cidade do evento quando o sugerido vale (mais de um = confirmar uma vez no evento). */
  aeroportosDaCidadeDoEvento: string[];
  /** O evento já terminou (fim antes de hoje) — só aparece com "Incluir eventos passados". */
  eventoPassou: boolean;
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
  /** 16/10: perna registrada como carro/van/ônibus não é aérea (a mesma regra do servidor). */
  terrestreByInclusion?: ReadonlyMap<string, readonly TrechoTerrestre[]>;
}): LinhaDaBusca[] {
  const eventos = new Map<string, EventoDaBusca>();
  entrada.eventById.forEach((e, id) => eventos.set(id, eventoDaBusca(e)));
  const out: LinhaDaBusca[] = [];
  for (const vagaCrua of entrada.vagas) {
    const v = comModoTerrestre(vagaCrua, entrada.terrestreByInclusion?.get(vagaCrua.id));
    const passagem = entrada.ticketByInclusion.get(v.id);
    const cidadeDeSaida = (v.city || (v.collaboratorId ? entrada.collaboratorById.get(v.collaboratorId)?.city : "") || "").trim();
    const ajuste: AjusteDaBusca = { ...ajusteDaPassagem(passagem), ...(entrada.ajustes[v.id] ?? {}) };
    const vaga: VagaDaBusca = { ...v, cidadeDeSaida };
    const plano = planejarBusca({ vagas: [vaga], eventos, ajustes: { [v.id]: ajuste }, hoje: entrada.hoje });
    // Só escalação com trecho AÉREO a comprar entra na tela.
    if (plano.faltando.some((f) => f.tipo === "nao_precisa" || f.tipo === "sem_trecho_aereo")) continue;
    // Sai da mesma cidade/região do evento (16/10, dono: "não é intuitivo"):
    // não há voo a comprar, então não é pendência da busca. Com passagem
    // comprada continua na lista (o registro existe e precisa aparecer).
    if (!passagem && plano.faltando.some((f) => f.tipo === "mesmo_aeroporto")) continue;
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
      aeroportoSugerido: plano.aeroportosSugeridos[v.eventId]?.iata ?? null,
      aeroportosDaCidadeDoEvento: plano.aeroportosSugeridos[v.eventId]?.opcoes ?? [],
      eventoPassou: !!evento && isEventPast(evento.endDate, entrada.hoje),
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

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Passa nos filtros? `ignorar` zera um filtro (para contar as opções dele). */
export function passaNosFiltros(l: LinhaDaBusca, f: FiltrosDaBusca, ignorar?: CampoContado): boolean {
  // Recorte de período: vale para TUDO (lista, faixas e opções dos filtros).
  if (!f.passados && l.eventoPassou) return false;
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
  // Sem acento/caixa (28/10): "joao pessoa" acha "João Pessoa".
  const q = semAcento(f.q.replace(/#/g, "")).trim();
  if (q) {
    const alvo = semAcento(`${l.vaga.inclusionNumber ?? ""} ${l.colaborador} ${l.funcao} ${l.evento?.name ?? ""}`);
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

/** Um evento cujo aeroporto precisa ser confirmado (cidade com mais de um, ou desconhecida). */
export interface EventoAConfirmar {
  eventId: string;
  nome: string;
  local: string;
  /** O que a busca já está usando (principal da cidade); null = cidade desconhecida, as escalações esperam. */
  sugerido: string | null;
  /** Aeroportos da cidade do evento, o principal primeiro (vazia quando a cidade é desconhecida). */
  sugestoes: string[];
  /** Escalações da lista que dependem dele. */
  escalacoes: number;
  /** A ida mais próxima entre elas (ordena a faixa). */
  primeiraData: string | null;
}

/**
 * Eventos a confirmar (15/10): o aeroporto do evento é pedido UMA vez por
 * evento, num lugar só (a faixa acima da lista) — não numa pílula por linha.
 *  - cidade com MAIS DE UM aeroporto (BH, Rio, São Paulo…): a busca já usa o
 *    principal (não trava), e a faixa pede a confirmação;
 *  - cidade desconhecida: as escalações esperam (dado faltando) até confirmar.
 * Inclui o evento anterior do trecho direto, quando é ele que falta.
 */
export function eventosAConfirmar(linhas: readonly LinhaDaBusca[], eventById: ReadonlyMap<string, Event>): EventoAConfirmar[] {
  const mapa = new Map<string, EventoAConfirmar>();
  const somar = (l: LinhaDaBusca, eventId: string, sugerido: string | null, sugestoes: string[]) => {
    const e = eventById.get(eventId);
    const atual = mapa.get(eventId) ?? { eventId, nome: e?.name ?? "Evento", local: e?.location ?? "", sugerido, sugestoes, escalacoes: 0, primeiraData: null };
    atual.escalacoes++;
    const d = l.dataIda ?? l.dataVolta;
    if (d && (!atual.primeiraData || d < atual.primeiraData)) atual.primeiraData = d;
    mapa.set(eventId, atual);
  };
  for (const l of linhas) {
    if (l.aeroportoSugerido && l.aeroportosDaCidadeDoEvento.length > 1) somar(l, l.vaga.eventId, l.aeroportoSugerido, l.aeroportosDaCidadeDoEvento);
    for (const f of l.faltas) if (f.tipo === "evento_sem_aeroporto" && f.eventId) somar(l, f.eventId, null, []);
  }
  // Os que travam (cidade desconhecida) primeiro; depois pela ida mais próxima.
  return Array.from(mapa.values()).sort((a, b) =>
    Number(!!a.sugerido) - Number(!!b.sugerido)
    || (a.primeiraData ?? "9999").localeCompare(b.primeiraData ?? "9999") || a.nome.localeCompare(b.nome, "pt-BR"));
}
