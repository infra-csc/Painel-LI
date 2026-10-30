/**
 * Painéis (30/10) — a conta de "fora do prazo" e "feitas × não feitas" de
 * PASSAGEM e de HOTEL por evento. Lógica pura; os dois painéis (Passagens e
 * Hospedagem) usam daqui, cada um com a sua etapa.
 *
 * Pedido do dono (30/10): "painel de passagens fora do prazo (evento e qtde);
 * passagens por evento futuro: emitidas × não emitidas; hotéis atrasados
 * (mesma lógica); hotéis por evento: registrada × não registrada". O objetivo
 * é pegar as mudanças o mais rápido possível para agir.
 *
 * NADA de regra nova aqui — a régua é a do Quadro de prazos das Análises da
 * Escalação, importada:
 *  - a data do evento é o DIA DA PROVA (`analisarPorEvento` → `dataEvento`,
 *    que lê os "Dia(s) do evento" do cadastro — shared/dia-da-prova.ts);
 *  - o prazo é D-N dessa data (`prazoDaEtapa`, D-37 passagem, D-30 hotel,
 *    editáveis em /api/escala/prazos — shared/prazos-da-escala.ts);
 *  - a vaga PARADA na etapa é a do Quadro (`quadroDoEvento`): escala já
 *    confirmada, precisa da passagem/hotel e ainda não tem. Passagem e Hotel
 *    são tarefas paralelas (a1b9f38f) — a vaga sem as duas aparece nas duas;
 *  - a situação (atrasado / vence em até 3 dias / no prazo) é
 *    `situacaoDoPrazo` sobre as PARADAS, como a célula do Quadro.
 *
 * O que o painel acrescenta é só a separação do "não feito" em dois:
 *  - "a emitir" / "a reservar" = as paradas do Quadro (trabalho de Compras);
 *  - "esperando a escala" = precisa, ainda não tem, e a escala não foi
 *    confirmada (o Quadro conta essas vagas numa coluna anterior). Não pinta a
 *    situação — mas aparece, porque depois do prazo é a próxima a virar atraso.
 *
 * "Tem passagem" e "tem hotel" são os MESMOS do contexto das Análises
 * (use-scaling-recorte.ts): passagem com data de compra (o índice
 * `purchasedTicketByInclusion`) e hospedagem com nome do hotel e não
 * cancelada (`vagasComHotel` = `hospedagemViva`).
 */
import type { Accommodation, Event, Function as Funcao, TeamInclusion, Ticket } from "@shared/schema";
import { vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { hospedagemViva } from "@shared/logistica-da-escala";
import {
  DIAS_PADRAO, diasDeAtraso, prazoDaEtapa, situacaoDoPrazo,
  type DiasDosPrazos, type SituacaoDoPrazo,
} from "@shared/prazos-da-escala";
import {
  analisarPorEvento, ehSugestao, quadroDoEvento, rotuloDaDataDoEvento, vagasVivas,
  type AnalyticsContext, type EventoAnalisado,
} from "@/components/scaling/scaling-analytics-data";

export type EtapaDaLogistica = "passagem" | "hotel";

export const ROTULOS_DA_ETAPA: Record<EtapaDaLogistica, {
  feitas: string; aFazer: string; acao: string; precisam: string; umaFeita: string; varias: string; uma: string;
}> = {
  passagem: { feitas: "emitidas", aFazer: "a emitir", acao: "Abrir em Passagens", precisam: "precisam de passagem", umaFeita: "emitida", varias: "passagens", uma: "passagem" },
  hotel: { feitas: "registradas", aFazer: "a reservar", acao: "Abrir em Hospedagem", precisam: "precisam de hotel", umaFeita: "registrada", varias: "hospedagens", uma: "hospedagem" },
};

/** As listas que as telas de Passagens/Hospedagem/Escalação já baixam (mesmas chaves de cache). */
export interface FontesDoPainel {
  vagas: readonly TeamInclusion[];
  eventos: readonly Event[];
  funcoes: readonly Funcao[];
  passagens?: readonly Ticket[];
  hospedagens?: readonly Accommodation[];
}

const MS_DIA = 86_400_000;

/** "2026-11-06" → dias de hoje até lá (negativo = passou). */
export function diasAte(iso: string | null, hoje: Date): number | null {
  if (!iso) return null;
  const alvo = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo.getTime() - base.getTime()) / MS_DIA);
}

/**
 * O contexto das Análises da Escalação montado a partir das listas cruas —
 * as mesmas regras de `analyticsContext` em use-scaling-recorte.ts. Troca e
 * pedido de ajuste não entram (o painel não conta "travadas").
 */
export function contextoDoPainel(f: FontesDoPainel): AnalyticsContext {
  const eventoPorId = new Map<string, Event>();
  f.eventos.forEach((e) => { if (!eventoPorId.has(e.id)) eventoPorId.set(e.id, e); });
  const funcaoPorId = new Map<string, Funcao>();
  f.funcoes.forEach((x) => { if (!funcaoPorId.has(x.id)) funcaoPorId.set(x.id, x); });
  const comPassagem = new Set<string>();
  (f.passagens ?? []).forEach((t) => {
    // purchasedTicketByInclusion (use-scaling-queries.ts): passagem atual com data de compra.
    if (t.teamInclusionId && !t.archivedAt && t.purchaseDate !== null && t.purchaseDate !== undefined) comPassagem.add(t.teamInclusionId);
  });
  const comHotel = new Set<string>();
  (f.hospedagens ?? []).forEach((a) => { if (a.teamInclusionId && hospedagemViva(a)) comHotel.add(a.teamInclusionId); });
  return {
    temNome: (i) => !!i.collaboratorId || vagaComEmpreita(i),
    temTroca: () => false,
    temPedido: () => false,
    getEventName: (id) => (id ? eventoPorId.get(id)?.name : undefined) ?? "Evento sem nome",
    getFunctionName: (id) => (id ? funcaoPorId.get(id)?.name : undefined) ?? "Função",
    getCollaboratorName: () => "",
    getEventDates: (id) => (id ? eventoPorId.get(id) : undefined),
    temPassagem: (i) => comPassagem.has(i.id),
    temHotel: (i) => comHotel.has(i.id),
  };
}

// ── Recorte da tela ─────────────────────────────────────────────────────────

export type PeriodoDoPainel = "30" | "60" | "90" | "todos";

export const PERIODOS_DO_PAINEL: { id: PeriodoDoPainel; nome: string }[] = [
  { id: "todos", nome: "Todos os próximos eventos" },
  { id: "30", nome: "Próximos 30 dias" },
  { id: "60", nome: "Próximos 60 dias" },
  { id: "90", nome: "Próximos 90 dias" },
];

export interface RecorteDoPainel {
  periodo: PeriodoDoPainel;
  /** "all" = todos. */
  eventId: string;
  /** Vazio = todas. */
  funcoes: string[];
}

export const RECORTE_PADRAO: RecorteDoPainel = { periodo: "todos", eventId: "all", funcoes: [] };

export const temRecorteNoPainel = (r: RecorteDoPainel) => r.periodo !== "todos" || r.eventId !== "all" || r.funcoes.length > 0;

/**
 * As vagas que contam: vivas (sem canceladas/excluídas), fora da
 * Validação/Aprovação de Escala (sugestão ainda não compra nada — como em
 * `contarLogistica`), na função e no evento escolhidos.
 */
export function vagasDoPainel(vagas: readonly TeamInclusion[], recorte: Pick<RecorteDoPainel, "eventId" | "funcoes">): TeamInclusion[] {
  const funcoes = recorte.funcoes.length ? new Set(recorte.funcoes) : null;
  return vagasVivas(vagas as TeamInclusion[]).filter((i) =>
    !ehSugestao(i)
    && (recorte.eventId === "all" || i.eventId === recorte.eventId)
    && (!funcoes || funcoes.has(i.functionId)));
}

/** O evento ainda vem (o dia da prova é hoje ou depois) e cai no período escolhido. */
export function eventoNoPeriodo(dataEvento: string | null, periodo: PeriodoDoPainel, hoje: Date): boolean {
  const dias = diasAte(dataEvento, hoje);
  if (dias === null || dias < 0) return false;
  return periodo === "todos" || dias <= Number(periodo);
}

// ── Uma linha por evento ────────────────────────────────────────────────────

export interface LinhaDaLogistica {
  eventId: string;
  nome: string;
  /** Dia da prova, "AAAA-MM-DD". */
  dataEvento: string | null;
  /** "06/11" ou "05–06/11" — o mesmo rótulo do Quadro. */
  rotuloDaData: string;
  /** Dias até o dia da prova. */
  diasAteOEvento: number | null;
  /** Data limite da etapa (meia-noite local). */
  prazo: Date | null;
  /** N do D-N em vigor. */
  diasAntes: number;
  /** A situação do Quadro (sobre as paradas). */
  situacao: SituacaoDoPrazo;
  /** Dias depois do prazo (positivo) ou de folga (negativo). */
  atraso: number | null;
  /** Vagas que precisam da passagem/hotel. */
  precisam: number;
  /** Já têm. */
  feitas: number;
  /** Paradas do Quadro: escala confirmada, precisa e não tem. */
  aFazer: number;
  /** Precisam e não têm, mas a escala ainda não foi confirmada. */
  esperandoEscala: number;
  /** feitas ÷ precisam (0–100, inteiro); 100 sem ninguém precisando. */
  pctFeitas: number;
}

export function linhasDaLogistica(
  vagas: readonly TeamInclusion[],
  ctx: AnalyticsContext,
  etapa: EtapaDaLogistica,
  hoje: Date,
  dias: DiasDosPrazos = DIAS_PADRAO,
): LinhaDaLogistica[] {
  const eventos: EventoAnalisado[] = analisarPorEvento(vagas as TeamInclusion[], ctx, hoje);
  const precisa = (i: TeamInclusion) => (etapa === "passagem" ? !!i.needsTicket : !!i.needsAccommodation);
  const tem = (i: TeamInclusion) => (etapa === "passagem" ? !!ctx.temPassagem?.(i) : !!ctx.temHotel?.(i));
  return eventos.map((e) => {
    const coluna = quadroDoEvento(e.vagas, ctx).colunas[etapa];
    const quem = e.vagas.filter((i) => !ehSugestao(i) && precisa(i));
    const feitas = quem.filter(tem).length;
    const aFazer = coluna.paradas.length;
    const naoFeitas = quem.length - feitas;
    const prazo = prazoDaEtapa(e.dataEvento, etapa, dias);
    return {
      eventId: e.eventId,
      nome: e.nome,
      dataEvento: e.dataEvento,
      rotuloDaData: rotuloDaDataDoEvento(e),
      diasAteOEvento: diasAte(e.dataEvento, hoje),
      prazo,
      diasAntes: dias[etapa],
      situacao: situacaoDoPrazo(prazo, hoje, aFazer),
      atraso: diasDeAtraso(prazo, hoje),
      precisam: quem.length,
      feitas,
      aFazer,
      esperandoEscala: Math.max(0, naoFeitas - aFazer),
      pctFeitas: quem.length === 0 ? 100 : Math.round((feitas / quem.length) * 100),
    };
  });
}

/** O prazo já passou (ou vence hoje/em até 3 dias) e ainda falta alguém. */
export type GrupoDoPrazo = "atrasado" | "vence_logo";

/**
 * As linhas do quadro "Fora do prazo": prazo vencido com algo por fazer
 * (`atrasado`) ou vencendo em até 3 dias (`vence_logo`). Entra também o
 * evento cujo prazo passou só com vagas esperando a escala — o Quadro não o
 * pinta na coluna da logística, mas o painel o mostra (sem cor de atraso).
 * Ordem: o mais atrasado primeiro; empate pelo evento mais próximo.
 */
export function foraDoPrazo(linhas: readonly LinhaDaLogistica[]): Record<GrupoDoPrazo, LinhaDaLogistica[]> {
  const out: Record<GrupoDoPrazo, LinhaDaLogistica[]> = { atrasado: [], vence_logo: [] };
  for (const l of linhas) {
    if (l.atraso === null || l.aFazer + l.esperandoEscala === 0) continue;
    if (l.atraso > 0) out.atrasado.push(l);
    else if (-l.atraso <= 3) out.vence_logo.push(l);
  }
  const ordem = (a: LinhaDaLogistica, b: LinhaDaLogistica) =>
    (b.atraso ?? 0) - (a.atraso ?? 0) || (a.diasAteOEvento ?? 0) - (b.diasAteOEvento ?? 0) || a.nome.localeCompare(b.nome, "pt-BR");
  out.atrasado.sort(ordem);
  out.vence_logo.sort(ordem);
  return out;
}

/** Totais do topo. */
export interface ResumoDaLogistica {
  eventos: number;
  precisam: number;
  feitas: number;
  pctFeitas: number | null;
  /** Paradas em eventos com prazo vencido (o número vermelho do Quadro). */
  aFazerAtrasadas: number;
  eventosAtrasados: number;
  /** Esperando a escala em eventos com prazo vencido. */
  esperandoAtrasadas: number;
  /** Não feitas (paradas + esperando) em eventos com prazo vencendo em até 3 dias. */
  vencendo: number;
  eventosVencendo: number;
}

export function resumirLogistica(linhas: readonly LinhaDaLogistica[]): ResumoDaLogistica {
  const fora = foraDoPrazo(linhas);
  const precisam = linhas.reduce((s, l) => s + l.precisam, 0);
  const feitas = linhas.reduce((s, l) => s + l.feitas, 0);
  return {
    eventos: linhas.length,
    precisam,
    feitas,
    pctFeitas: precisam === 0 ? null : Math.round((feitas / precisam) * 100),
    aFazerAtrasadas: fora.atrasado.reduce((s, l) => s + l.aFazer, 0),
    eventosAtrasados: fora.atrasado.filter((l) => l.aFazer > 0).length,
    esperandoAtrasadas: fora.atrasado.reduce((s, l) => s + l.esperandoEscala, 0),
    vencendo: fora.vence_logo.reduce((s, l) => s + l.aFazer + l.esperandoEscala, 0),
    eventosVencendo: fora.vence_logo.length,
  };
}

/**
 * Tudo o que o painel precisa, de uma vez: as vagas do recorte, as linhas dos
 * eventos que ainda vêm (no período) e as opções dos filtros (evento e
 * função, com quantas vagas que precisam cada uma deixa).
 */
export function montarPainelDaLogistica(
  fontes: FontesDoPainel,
  etapa: EtapaDaLogistica,
  recorte: RecorteDoPainel,
  hoje: Date,
  dias: DiasDosPrazos = DIAS_PADRAO,
) {
  const ctx = contextoDoPainel(fontes);
  const linhas = linhasDaLogistica(vagasDoPainel(fontes.vagas, recorte), ctx, etapa, hoje, dias)
    .filter((l) => eventoNoPeriodo(l.dataEvento, recorte.periodo, hoje) && l.precisam > 0)
    .sort((a, b) => (a.diasAteOEvento ?? 0) - (b.diasAteOEvento ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"));

  // Opções: o que cada evento/função deixa no período, sem o próprio filtro.
  const precisa = (i: TeamInclusion) => (etapa === "passagem" ? !!i.needsTicket : !!i.needsAccommodation);
  const datas = new Map<string, string | null>();
  for (const l of linhasDaLogistica(vagasDoPainel(fontes.vagas, { eventId: "all", funcoes: [] }), ctx, etapa, hoje, dias)) {
    datas.set(l.eventId, l.dataEvento);
  }
  const noPeriodo = (eventId: string) => eventoNoPeriodo(datas.get(eventId) ?? null, recorte.periodo, hoje);
  const contarPor = (vs: TeamInclusion[], chave: (i: TeamInclusion) => string) => {
    const m = new Map<string, number>();
    for (const i of vs) if (precisa(i) && noPeriodo(i.eventId)) m.set(chave(i), (m.get(chave(i)) ?? 0) + 1);
    return m;
  };
  const porEvento = contarPor(vagasDoPainel(fontes.vagas, { eventId: "all", funcoes: recorte.funcoes }), (i) => i.eventId);
  const porFuncao = contarPor(vagasDoPainel(fontes.vagas, { eventId: recorte.eventId, funcoes: [] }), (i) => i.functionId);
  const opcoesDeEvento = Array.from(porEvento.entries())
    .map(([id, n]) => ({ id, nome: ctx.getEventName(id), n, data: datas.get(id) ?? "" }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, "pt-BR"))
    .map(({ id, nome, n }) => ({ id, nome, n }));
  // O evento escolhido continua na lista mesmo fora do período (senão o filtro some).
  if (recorte.eventId !== "all" && !porEvento.has(recorte.eventId)) {
    opcoesDeEvento.unshift({ id: recorte.eventId, nome: ctx.getEventName(recorte.eventId), n: 0 });
  }
  const opcoesDeFuncao = Array.from(porFuncao.entries())
    .map(([id, n]) => ({ id, nome: ctx.getFunctionName(id), n }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return { ctx, linhas, fora: foraDoPrazo(linhas), resumo: resumirLogistica(linhas), opcoes: { eventos: opcoesDeEvento, funcoes: opcoesDeFuncao } };
}

export type PainelDaLogistica = ReturnType<typeof montarPainelDaLogistica>;

/** "prazo 30/09 (D-37)". */
export function textoDoPrazo(l: Pick<LinhaDaLogistica, "prazo" | "diasAntes">): string {
  if (!l.prazo) return "sem data do evento";
  return `prazo ${String(l.prazo.getDate()).padStart(2, "0")}/${String(l.prazo.getMonth() + 1).padStart(2, "0")} (D-${l.diasAntes})`;
}

/** "8 dias atrasado" · "vence hoje" · "vence em 2 dias" · "12 dias de folga". */
export function textoDoAtraso(atraso: number | null): string {
  if (atraso === null) return "sem data";
  if (atraso > 0) return `${atraso} ${atraso === 1 ? "dia" : "dias"} atrasado`;
  if (atraso === 0) return "vence hoje";
  if (-atraso <= 3) return `vence em ${-atraso} ${-atraso === 1 ? "dia" : "dias"}`;
  return `${-atraso} dias de folga`;
}
