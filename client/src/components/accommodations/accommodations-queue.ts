/**
 * Os quatro blocos da fila de trabalho de Hospedagem.
 *
 * Substituem os três cards de resumo (Total / Registradas / Pendentes) mais o
 * banner amarelo de trocas. Os cards contavam a mesma pendência que a linha
 * repetia embaixo, e o banner só informava — não levava ao trabalho. Aqui cada
 * bloco conta E filtra, e reclicar o bloco ativo desliga o recorte.
 *
 * "Total" saiu de propósito: o número de linhas já está no rodapé e na barra de
 * contexto, e um bloco que não recorta nada não é fila de trabalho.
 */
import type { Accommodation, Event, TeamInclusion } from "@shared/schema";

export type BlocoDaFila = "reservar" | "urgente" | "troca" | "registradas";

export interface ContextoDaFila {
  eventById: Map<string, Event>;
  accommodationMap: Map<string, Accommodation>;
  pendingSwapByInclusion: Set<string>;
  /** Hoje em "YYYY-MM-DD" — injetado para o teste não depender do relógio. */
  hoje: string;
}

/** Dentro de quantos dias a chegada conta como urgente. */
export const DIAS_DE_URGENCIA = 7;

/**
 * Até quantos dias de atraso a vaga ainda conta como urgente.
 *
 * Medido nos dados reais em 02/09: das 2.011 vagas sem reserva, 1.348 têm
 * chegada há mais de 30 dias. Contar todo o passado fazia "Urgente" marcar
 * 1.540 de 1.822 — um número que não escolhe trabalho nenhum. Vaga de evento
 * que acabou há meses é passivo histórico; ninguém vai hospedar aquela pessoa.
 *
 * A semana para trás fica porque ali o caso é real e é o mais grave: alguém que
 * viajou ontem e está sem hotel.
 */
export const DIAS_DE_ATRASO = 7;

/**
 * A data em que a pessoa precisa estar hospedada.
 *
 * Não é a data do evento: quem entra no meio da montagem chega depois, e quem
 * monta chega antes. O período de trabalho da inclusão é o que manda; a data do
 * evento é o fallback para quem ainda não tem período definido.
 */
export function dataDeChegada(inclusion: TeamInclusion, eventById: Map<string, Event>): string | null {
  const doPeriodo = inclusion.scheduleStartDate;
  if (doPeriodo) return String(doPeriodo).slice(0, 10);
  const evento = eventById.get(inclusion.eventId);
  return evento?.startDate ? String(evento.startDate).slice(0, 10) : null;
}

/** Diferença em dias entre duas datas "YYYY-MM-DD", sem fuso no meio. */
export function diasAte(dataAlvo: string, hoje: string): number {
  const [aa, am, ad] = dataAlvo.split("-").map(Number);
  const [ba, bm, bd] = hoje.split("-").map(Number);
  const alvo = Date.UTC(aa, (am ?? 1) - 1, ad ?? 1);
  const base = Date.UTC(ba, (bm ?? 1) - 1, bd ?? 1);
  return Math.round((alvo - base) / 86_400_000);
}

/** Sem reserva registrada e ainda viva: é o trabalho que a tela existe para fazer. */
export function precisaReservar(inclusion: TeamInclusion, ctx: ContextoDaFila): boolean {
  return inclusion.status !== "cancelado" && !ctx.accommodationMap.get(inclusion.id);
}

/**
 * Sem reserva e a chegada cai na janela de uma semana para cada lado de hoje.
 *
 * O lado de trás existe para não esconder quem viajou ontem sem hotel; o limite
 * de trás existe para não afogar isso em anos de vaga que nunca foi preenchida.
 */
export function ehUrgente(inclusion: TeamInclusion, ctx: ContextoDaFila): boolean {
  if (!precisaReservar(inclusion, ctx)) return false;
  const chegada = dataDeChegada(inclusion, ctx.eventById);
  if (!chegada) return false;
  const dias = diasAte(chegada, ctx.hoje);
  return dias <= DIAS_DE_URGENCIA && dias >= -DIAS_DE_ATRASO;
}

export function temTrocaPendente(inclusion: TeamInclusion, ctx: ContextoDaFila): boolean {
  return inclusion.status !== "cancelado" && ctx.pendingSwapByInclusion.has(inclusion.id);
}

export function jaRegistrada(inclusion: TeamInclusion, ctx: ContextoDaFila): boolean {
  return !!ctx.accommodationMap.get(inclusion.id);
}

const PERTENCE: Record<BlocoDaFila, (i: TeamInclusion, c: ContextoDaFila) => boolean> = {
  reservar: precisaReservar,
  urgente: ehUrgente,
  troca: temTrocaPendente,
  registradas: jaRegistrada,
};

export function pertenceAoBloco(bloco: BlocoDaFila, inclusion: TeamInclusion, ctx: ContextoDaFila): boolean {
  return PERTENCE[bloco](inclusion, ctx);
}

export interface ResumoDaFila {
  reservar: number;
  urgente: number;
  troca: number;
  registradas: number;
  /** Sub-linha de "Registradas": quantos hotéis distintos e quantas diárias. */
  hoteisDistintos: number;
  diarias: number;
}

/**
 * Uma passagem só sobre a lista para os quatro contadores.
 *
 * A versão ingênua — quatro `filter` encadeados — custava quatro varreduras de
 * 3.700 linhas a cada tecla digitada na busca. Em Escalação isso congelava a
 * tela.
 */
export function contadoresDaFila(linhas: TeamInclusion[], ctx: ContextoDaFila): ResumoDaFila {
  let reservar = 0, urgente = 0, troca = 0, registradas = 0, diarias = 0;
  const hoteis = new Set<string>();

  for (const inclusion of linhas) {
    const hospedagem = ctx.accommodationMap.get(inclusion.id);
    if (hospedagem) {
      registradas++;
      if (hospedagem.hotelName) hoteis.add(hospedagem.hotelName.trim().toLowerCase());
      diarias += contarDiarias(hospedagem.checkInDate, hospedagem.checkOutDate);
    } else if (inclusion.status !== "cancelado") {
      reservar++;
      if (ehUrgente(inclusion, ctx)) urgente++;
    }
    if (temTrocaPendente(inclusion, ctx)) troca++;
  }

  return { reservar, urgente, troca, registradas, hoteisDistintos: hoteis.size, diarias };
}

/**
 * Noites entre check-in e check-out.
 *
 * Diária é noite dormida, não dia no calendário: entrar dia 11 e sair dia 15 são
 * quatro diárias, não cinco. Entrar e sair no mesmo dia é uma — o quarto foi
 * ocupado.
 */
export function contarDiarias(checkIn: unknown, checkOut: unknown): number {
  if (!checkIn || !checkOut) return 0;
  const entrada = String(checkIn).slice(0, 10);
  const saida = String(checkOut).slice(0, 10);
  const noites = diasAte(saida, entrada);
  if (Number.isNaN(noites) || noites < 0) return 0;
  return noites === 0 ? 1 : noites;
}
