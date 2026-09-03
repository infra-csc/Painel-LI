/**
 * O que é pendência no Espelho Operacional — regra da rodada de design de
 * 02/09, aprovada pelo cliente.
 *
 * A unidade de pendência é o BLOCO, não o campo. A interface nunca diz
 * "3 campos faltando": diz "1 bloco aberto", "3 blocos abertos" ou "pronto".
 * Contar campos fazia a grade parecer mais atrasada do que está — 39 colunas,
 * a maioria vazia por não se aplicar.
 *
 * Só três blocos travam o fechamento: Passagem, Hospedagem e Uber. Bagagem
 * extra e Locação são eventuais — quem não tem, não tem, e isso não é falta.
 *
 * Um bloco só conta para uma pessoa se estiver EM USO. Quem mora na cidade do
 * evento não usa passagem e não fica pendente dela. "Em uso" vem dos sinais que
 * a inclusão já tem (precisa de passagem / de hospedagem / foi dispensado do
 * Uber), não de um marcador novo no banco.
 *
 * Sugestão calculada pelo sistema e não confirmada por humano NÃO é dado: conta
 * como falta. Antes ela era neutra, e o evento parecia fechado com o Uber
 * inteiro ainda por confirmar.
 *
 * Regra pura, sem React e sem rede — a mesma decisão alimenta a faixa âmbar, o
 * placar, os chips, a coluna Situação da grade, Departamentos e Pessoas. Foi a
 * duplicação desse tipo de regra que fez telas divergirem antes.
 */
import type { MirrorRow } from "./operational-mirror-types";
import {
  CAMPOS_POR_ETAPA, estadoDaCelula, temValor,
  type ContextoDaLinha, type EtapaDaGrade,
} from "./mirror-cell-state";

export type BlocoDeCusto = EtapaDaGrade;

/** Os cinco blocos de custo, na ordem da grade. */
export const BLOCOS_DE_CUSTO: BlocoDeCusto[] = ["passagem", "hospedagem", "bagagem", "uber", "locacao"];

/** Só estes travam o fechamento. */
export const BLOCOS_QUE_PENDENCIAM: BlocoDeCusto[] = ["passagem", "hospedagem", "uber"];

export const ROTULO_DO_BLOCO: Record<BlocoDeCusto, string> = {
  passagem: "Passagem",
  hospedagem: "Hospedagem",
  bagagem: "Bagagem extra",
  uber: "Uber",
  locacao: "Locação",
};

export function blocoPendencia(bloco: BlocoDeCusto): boolean {
  return BLOCOS_QUE_PENDENCIAM.includes(bloco);
}

/** Ids dos grupos já confirmados por alguém — o que separa sugestão de dado. */
export interface GruposConfirmados {
  uber: Set<string>;
  quartos: Set<string>;
}

/**
 * O contexto que a regra de célula precisa, montado a partir da linha.
 *
 * Vivia copiado em dois lugares da página (a faixa de fechamento e a grade), e
 * a próxima divergência entre os dois era questão de tempo.
 */
export function contextoDaLinha(r: MirrorRow, confirmados: GruposConfirmados): ContextoDaLinha {
  return {
    temPassagem: !!r.ticket,
    temHotel: !!r.accommodation?.hotelName,
    bagagemCents: r.baggage.extraCents,
    uberCents: r.uber.totalCents,
    locacaoCents: r.carRental.totalCents,
    semUber: r.skipUber,
    uberConfirmado: !!r.uber.suggestedGroupId && confirmados.uber.has(r.uber.suggestedGroupId),
    quartoConfirmado: !!r.suggestedRoomGroupId && confirmados.quartos.has(r.suggestedRoomGroupId),
  };
}

/**
 * Lê um campo da linha pelo caminho usado na grade ("ticket.value").
 *
 * É o que permite a regra rodar sobre a linha inteira sem reescrever a lista de
 * campos em dois lugares. A grade chama de "departureDate"/"returnDate" o que o
 * schedule guarda com o prefixo do voo; e os valores dos extras têm nome
 * próprio na linha.
 */
export function lerCampoDaLinha(r: MirrorRow, campo: string): unknown {
  const [grupo, chave] = campo.split(".");
  if (!chave) return (r as unknown as Record<string, unknown>)[grupo];
  if (grupo === "schedule") {
    const sc = r.schedule as unknown as Record<string, unknown>;
    if (chave === "departureDate") return sc.flightDepartureDate;
    if (chave === "returnDate") return sc.flightReturnDate;
    return sc[chave];
  }
  if (grupo === "baggage" && chave === "amountCents") return r.baggage.extraCents;
  if (grupo === "uber" && chave === "amountCents") return r.uber.totalCents;
  if (grupo === "carRental" && chave === "amountCents") return r.carRental.totalCents;
  const bloco = (r as unknown as Record<string, unknown>)[grupo] as Record<string, unknown> | null;
  return bloco ? bloco[chave] : null;
}

/**
 * Esta pessoa usa este bloco?
 *
 * Passagem e hospedagem: a inclusão diz se precisa (needsTicket /
 * needsAccommodation); na falta do sinal, ter o registro basta. Uber: quem foi
 * dispensado da roteirização não usa; quem não viaja de avião também não —
 * Uber aqui é o traslado do aeroporto. Bagagem e locação: em uso quando há
 * lançamento.
 */
export function blocoEmUso(bloco: BlocoDeCusto, r: MirrorRow): boolean {
  switch (bloco) {
    case "passagem":
      return (r.needsTicket ?? false) || !!r.ticket;
    case "hospedagem":
      return (r.needsAccommodation ?? false) || !!r.accommodation;
    case "uber":
      return !r.skipUber && blocoEmUso("passagem", r);
    case "bagagem":
      return r.baggage.extraCents > 0 || temValor(r.baggage.oc);
    case "locacao":
      return r.carRental.totalCents > 0 || temValor(r.carRental.company) || temValor(r.carRental.oc);
  }
}

/**
 * Quantos campos deste bloco ainda faltam para esta pessoa.
 *
 * Só serve para decidir "aberto ou pronto" — o número NUNCA vai para a tela.
 * "A confirmar" conta como falta: sugestão não confirmada não é dado.
 */
export function faltamNoBloco(bloco: BlocoDeCusto, r: MirrorRow, ctx: ContextoDaLinha): number {
  let n = 0;
  for (const campo of CAMPOS_POR_ETAPA[bloco]) {
    const estado = estadoDaCelula(campo, lerCampoDaLinha(r, campo), ctx);
    if (estado === "falta" || estado === "a_confirmar") n += 1;
  }
  return n;
}

/** O bloco está em uso E incompleto? */
export function blocoAberto(bloco: BlocoDeCusto, r: MirrorRow, ctx: ContextoDaLinha): boolean {
  return blocoEmUso(bloco, r) && faltamNoBloco(bloco, r, ctx) > 0;
}

/** Os blocos que travam o fechamento desta pessoa, na ordem da grade. */
export function blocosAbertos(r: MirrorRow, ctx: ContextoDaLinha): BlocoDeCusto[] {
  return BLOCOS_QUE_PENDENCIAM.filter((b) => blocoAberto(b, r, ctx));
}

/** Alguma sugestão do sistema ainda por confirmar nesta linha? */
export function temSugestaoAConfirmar(r: MirrorRow, ctx: ContextoDaLinha): boolean {
  if (blocoEmUso("uber", r) && !ctx.uberConfirmado && !!r.uber.suggestedGroupId) return true;
  if (blocoEmUso("hospedagem", r) && !ctx.quartoConfirmado && !!r.suggestedRoomGroupId) return true;
  return false;
}

/** "pronto" · "1 bloco aberto" · "3 blocos abertos" — o único texto de situação. */
export function textoDaSituacao(abertos: number): string {
  if (abertos === 0) return "pronto";
  return abertos === 1 ? "1 bloco aberto" : `${abertos} blocos abertos`;
}

/** Estado de um bloco para o cartão da pessoa e o drawer. */
export type EstadoDoBloco = "nao_usa" | "a_completar" | "pronto" | "lancado" | "sem_lancamento";

export function estadoDoBloco(bloco: BlocoDeCusto, r: MirrorRow, ctx: ContextoDaLinha): EstadoDoBloco {
  const usa = blocoEmUso(bloco, r);
  if (!blocoPendencia(bloco)) return usa ? "lancado" : "sem_lancamento";
  if (!usa) return "nao_usa";
  return faltamNoBloco(bloco, r, ctx) > 0 ? "a_completar" : "pronto";
}

// ── Chips da faixa de pendências ─────────────────────────────────────────────

export type ChipDePendencia = "semPassagem" | "semLocalizador" | "semOc" | "semConferencia";

export const CHIPS_DE_PENDENCIA: { key: ChipDePendencia; label: string }[] = [
  { key: "semPassagem", label: "Sem passagem" },
  { key: "semLocalizador", label: "Sem localizador" },
  { key: "semOc", label: "Sem OC" },
  { key: "semConferencia", label: "Sem conferência" },
];

const OC_POR_BLOCO: Record<"passagem" | "hospedagem" | "uber", string> = {
  passagem: "ticket.purchaseOrderNumber",
  hospedagem: "accommodation.hotelOc",
  uber: "uber.oc",
};
const CONFERENCIA_POR_BLOCO: Record<"passagem" | "hospedagem" | "uber", string> = {
  passagem: "ticket.checkIn3",
  hospedagem: "accommodation.checkIn4",
  uber: "uber.checkIn",
};

/**
 * A pessoa cai neste chip?
 *
 * As regras de OC e conferência olham SÓ os três blocos que pendenciam, e só
 * os que a pessoa usa. Falta de OC numa bagagem que não existe não é falta.
 */
export function caiNoChip(chip: ChipDePendencia, r: MirrorRow, ctx: ContextoDaLinha): boolean {
  const usaPassagem = blocoEmUso("passagem", r);
  switch (chip) {
    case "semPassagem":
      return usaPassagem && (!r.ticket || !temValor(r.ticket.value));
    case "semLocalizador":
      return usaPassagem && !!r.ticket && !temValor(r.ticket.locator);
    case "semOc":
      return BLOCOS_QUE_PENDENCIAM.some((b) => {
        if (!blocoEmUso(b, r)) return false;
        const campo = OC_POR_BLOCO[b as keyof typeof OC_POR_BLOCO];
        const estado = estadoDaCelula(campo, lerCampoDaLinha(r, campo), ctx);
        return estado === "falta" || estado === "a_confirmar";
      });
    case "semConferencia":
      return BLOCOS_QUE_PENDENCIAM.some((b) => {
        if (!blocoEmUso(b, r)) return false;
        const campo = CONFERENCIA_POR_BLOCO[b as keyof typeof CONFERENCIA_POR_BLOCO];
        const estado = estadoDaCelula(campo, lerCampoDaLinha(r, campo), ctx);
        return estado === "falta" || estado === "a_confirmar";
      });
  }
}

// ── Resumo do evento ─────────────────────────────────────────────────────────

export interface ResumoDoBloco {
  bloco: BlocoDeCusto;
  /** Quantas pessoas usam o bloco. */
  emUso: number;
  /** Nos que pendenciam: quantas das que usam estão prontas. Nos eventuais, = emUso. */
  prontas: number;
  /** Nos que pendenciam: emUso − prontas. Nos eventuais, 0. */
  faltam: number;
}

export interface ResumoDoEvento {
  /** Pessoas com ao menos um bloco aberto. */
  pessoasTravando: number;
  porBloco: Record<BlocoDeCusto, ResumoDoBloco>;
  porChip: Record<ChipDePendencia, number>;
  /** Pessoas com alguma sugestão por confirmar. */
  comSugestao: number;
}

/**
 * Uma passagem só sobre as linhas para tudo o que a faixa e o placar mostram.
 *
 * Cada linha é lida uma vez; recalcular por bloco e por chip separadamente
 * seria dez varreduras a cada tecla na busca.
 */
export function resumoDoEvento(rows: MirrorRow[], confirmados: GruposConfirmados): ResumoDoEvento {
  const porBloco = Object.fromEntries(
    BLOCOS_DE_CUSTO.map((b) => [b, { bloco: b, emUso: 0, prontas: 0, faltam: 0 }]),
  ) as Record<BlocoDeCusto, ResumoDoBloco>;
  const porChip: Record<ChipDePendencia, number> = { semPassagem: 0, semLocalizador: 0, semOc: 0, semConferencia: 0 };
  let pessoasTravando = 0;
  let comSugestao = 0;

  for (const r of rows) {
    const ctx = contextoDaLinha(r, confirmados);
    let travando = false;
    for (const b of BLOCOS_DE_CUSTO) {
      if (!blocoEmUso(b, r)) continue;
      const acc = porBloco[b];
      acc.emUso += 1;
      if (!blocoPendencia(b)) { acc.prontas += 1; continue; }
      if (faltamNoBloco(b, r, ctx) > 0) { acc.faltam += 1; travando = true; }
      else acc.prontas += 1;
    }
    if (travando) pessoasTravando += 1;
    if (temSugestaoAConfirmar(r, ctx)) comSugestao += 1;
    for (const c of CHIPS_DE_PENDENCIA) if (caiNoChip(c.key, r, ctx)) porChip[c.key] += 1;
  }

  return { pessoasTravando, porBloco, porChip, comSugestao };
}
