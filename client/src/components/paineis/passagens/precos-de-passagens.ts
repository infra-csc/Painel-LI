/**
 * Painel de passagens (30/10) — COMPARAÇÃO DE PREÇOS por rota, companhia,
 * tipo, evento e mês: quantidade, total e valor unitário (médio, mínimo,
 * máximo), e as passagens muito acima do preço típico da rota. Lógica pura.
 *
 * Reaproveita as regras que já existem, sem copiar:
 *  - shared/analise-de-passagens.ts (Análises de passagens, 07/10):
 *    `chaveDaCompanhia`/`nomeDaCompanhia` (LATAM = "Latam Airlines" = TAM),
 *    `lugarDaRota` (aeroporto ou cidade; "Farol da Barra, Salvador - BA" →
 *    Salvador), `recortesPorTransporte` (a volta de outro tipo conta no tipo
 *    dela, com o valor dela — shared/tipo-por-trecho.ts `partesPorTipo`);
 *  - shared/janela-de-viagem.ts `trechosDaPassagem` (ida e volta / só ida / só volta);
 *  - shared/regras-da-busca.ts `precoTipico` (mediana, amostra mínima 3) e
 *    `avaliarTetoDoTrecho` (o MESMO teto da busca de passagens: 30% acima do
 *    típico pede justificativa ao registrar).
 *
 * A UNIDADE de preço é a passagem como foi comprada:
 *  - ida e volta numa compra só (quase todas) → uma unidade "⇄", com o total;
 *  - só ida / só volta → uma unidade "→" do trecho;
 *  - volta de OUTRO tipo (ida aérea + volta de ônibus, 28/10) → duas unidades
 *    "→", uma por trecho, cada uma no seu tipo e com o seu valor.
 * Rota "⇄" e rota "→" nunca se misturam (o preço de um trecho não é
 * comparável ao de ida e volta).
 *
 * Entram as passagens ATUAIS e as do HISTÓRICO de troca (custo de quem saiu,
 * como nas Análises). Valor nulo ou zero = "sem valor": conta na quantidade,
 * fica fora de média, mínimo e máximo — e o painel diz quantas são.
 * Período pelo INÍCIO do evento (o mesmo das Análises).
 */
import type { Event, TeamInclusion, Ticket } from "@shared/schema";
import {
  ROTULO_TRANSPORTE, chaveDaCompanhia, diaISO, lugarDaRota, nomeDaCompanhia, recortesPorTransporte, semAcento,
  type PassagemParaAnalise,
} from "@shared/analise-de-passagens";
import { trechosDaPassagem } from "@shared/janela-de-viagem";
import { AJUSTES_PADRAO, avaliarTetoDoTrecho, mediana, precoTipico, type PrecoTipico } from "@shared/regras-da-busca";

export type FormaDaCompra = "ida_e_volta" | "trecho";

/** Uma unidade de preço (ver o cabeçalho). */
export interface PrecoDaPassagem {
  /** ticketId, com ":ida"/":volta" quando a passagem virou dois trechos. */
  id: string;
  ticketId: string;
  teamInclusionId: string;
  inclusionNumber: number | null;
  eventId: string;
  eventName: string;
  eventStartDate: string | null;
  functionId: string | null;
  arquivada: boolean;
  /** Centavos; null/0 = sem valor. */
  valor: number | null;
  /** aereo | rodoviario | van | "" (não informado). */
  tipo: string;
  companhia: string;
  companhiaNome: string;
  forma: FormaDaCompra;
  /** Chave com a forma ("rt|gru>ssa" / "ow|gru>ssa") e o nome ("GRU ⇄ SSA"). */
  rota: { chave: string; nome: string } | null;
  /** Dia da viagem do trecho (a ida; no trecho de volta, a volta). */
  data: string | null;
}

const temValor = (p: { valor: number | null }) => typeof p.valor === "number" && p.valor > 0;
const aparado = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** Ticket + vaga + evento → a passagem das Análises (o mesmo que o SELECT de /api/tickets/analises lê). */
export function paraAnalise(t: Ticket, vaga: TeamInclusion, evento: Event | undefined): PassagemParaAnalise {
  return {
    ticketId: t.id,
    teamInclusionId: t.teamInclusionId,
    eventId: vaga.eventId,
    eventName: evento?.name ?? "Evento sem nome",
    eventStartDate: diaISO(evento?.startDate ?? null),
    pessoaId: t.archivedAt ? t.archivedCollaboratorId ?? null : vaga.collaboratorId ?? null,
    arquivada: !!t.archivedAt,
    valor: typeof t.value === "number" ? t.value : null,
    bagagem: typeof t.baggageTotalCents === "number" ? t.baggageTotalCents : null,
    dataCompra: diaISO(t.purchaseDate),
    dataIda: diaISO(t.actualDepartureDate),
    dataVolta: diaISO(t.actualReturnDate),
    companhia: t.ticketCompany ?? null,
    transporte: t.transportType ?? null,
    transporteDaVolta: t.returnTransportType ?? null,
    valorDaVolta: typeof t.returnValue === "number" ? t.returnValue : null,
    origem: aparado(t.departureAirport) ?? t.departureCityOrigin ?? null,
    destino: aparado(t.destinationAirport) ?? t.departureCityDestination ?? null,
    trechoDireto: !!t.idaVemDeInclusionId,
  };
}

function rotaDe(origem: string | null | undefined, destino: string | null | undefined, forma: FormaDaCompra) {
  const o = lugarDaRota(origem);
  const d = lugarDaRota(destino);
  if (!o || !d) return null;
  return forma === "ida_e_volta"
    ? { chave: `rt|${o.chave}>${d.chave}`, nome: `${o.nome} ⇄ ${d.nome}` }
    : { chave: `ow|${o.chave}>${d.chave}`, nome: `${o.nome} → ${d.nome}` };
}

/**
 * As unidades de preço de todas as passagens (atuais + histórico). Fora: a
 * passagem de vaga que não está na lista (excluída) e a de evento excluído —
 * o mesmo corte das Análises.
 */
export function precosDasPassagens(
  passagens: readonly Ticket[],
  vagas: readonly TeamInclusion[],
  eventos: readonly Event[],
): PrecoDaPassagem[] {
  const vagaPorId = new Map(vagas.map((v) => [v.id, v]));
  const eventoPorId = new Map(eventos.map((e) => [e.id, e]));
  const vistos = new Set<string>();
  const out: PrecoDaPassagem[] = [];
  for (const t of passagens) {
    if (vistos.has(t.id)) continue;
    vistos.add(t.id);
    const vaga = vagaPorId.get(t.teamInclusionId);
    if (!vaga || vaga.deletedAt) continue;
    const evento = eventoPorId.get(vaga.eventId);
    if (evento && /^exclu[ií]do$/i.test(String(evento.status ?? ""))) continue;
    const p = paraAnalise(t, vaga, evento);
    const pernas = trechosDaPassagem(t);
    const recortes = recortesPorTransporte(p);
    const voltaOrigem = aparado(t.returnOriginAirport) ?? t.returnCityOrigin;
    const voltaDestino = aparado(t.returnDestinationAirport) ?? t.returnCityDestination;
    const base = {
      ticketId: t.id, teamInclusionId: t.teamInclusionId, inclusionNumber: vaga.inclusionNumber ?? null,
      eventId: p.eventId, eventName: p.eventName, eventStartDate: p.eventStartDate, functionId: vaga.functionId ?? null,
      arquivada: p.arquivada,
      companhia: chaveDaCompanhia(p.companhia), companhiaNome: nomeDaCompanhia(chaveDaCompanhia(p.companhia), p.companhia),
    };
    if (recortes.length === 1) {
      const forma: FormaDaCompra = pernas === "ida_e_volta" ? "ida_e_volta" : "trecho";
      const soVolta = pernas === "so_volta";
      out.push({
        ...base, id: t.id, valor: p.valor, tipo: semAcento(String(p.transporte ?? "")), forma,
        rota: soVolta ? rotaDe(voltaOrigem, voltaDestino, forma) : rotaDe(p.origem, p.destino, forma),
        data: soVolta ? p.dataVolta : p.dataIda,
      });
    } else {
      const [ida, volta] = recortes;
      out.push({
        ...base, id: `${t.id}:ida`, valor: ida.valor, tipo: semAcento(String(ida.transporte ?? "")), forma: "trecho",
        rota: rotaDe(p.origem, p.destino, "trecho"), data: p.dataIda,
      });
      out.push({
        ...base, id: `${t.id}:volta`, valor: volta.valor, tipo: semAcento(String(volta.transporte ?? "")), forma: "trecho",
        rota: rotaDe(voltaOrigem, voltaDestino, "trecho"), data: p.dataVolta,
      });
    }
  }
  return out;
}

// ── Recorte ─────────────────────────────────────────────────────────────────

export interface RecorteDosPrecos {
  /** Início do evento a partir de / até ("AAAA-MM-DD"; null = sem ponta). */
  de: string | null;
  ate: string | null;
  /** "all" = todos. */
  eventId: string;
  /** Vazio = todas. */
  funcoes: string[];
  /** "all" = todos; "" = não informado. */
  tipo: string;
}

export function recortarPrecos(lista: readonly PrecoDaPassagem[], r: RecorteDosPrecos): PrecoDaPassagem[] {
  const funcoes = r.funcoes.length ? new Set(r.funcoes) : null;
  return lista.filter((p) => {
    if (r.de || r.ate) {
      if (!p.eventStartDate) return false;
      if (r.de && p.eventStartDate < r.de) return false;
      if (r.ate && p.eventStartDate > r.ate) return false;
    }
    if (r.eventId !== "all" && p.eventId !== r.eventId) return false;
    if (funcoes && !(p.functionId && funcoes.has(p.functionId))) return false;
    if (r.tipo !== "all" && p.tipo !== r.tipo) return false;
    return true;
  });
}

// ── Agrupamento ─────────────────────────────────────────────────────────────

export type DimensaoDoPreco = "rota" | "companhia" | "tipo" | "evento" | "mes";

export const DIMENSOES_DO_PRECO: readonly (readonly [DimensaoDoPreco, string])[] = [
  ["rota", "Rotas"], ["companhia", "Companhias"], ["tipo", "Tipo"], ["evento", "Eventos"], ["mes", "Meses"],
] as const;

export interface EstatisticaDePreco {
  /** Unidades no grupo (com ou sem valor). */
  qtde: number;
  comValor: number;
  /** Centavos. */
  total: number;
  media: number | null;
  mediana: number | null;
  min: number | null;
  max: number | null;
}

export interface GrupoDePreco extends EstatisticaDePreco {
  chave: string;
  nome: string;
  /** Unidades acima do teto da rota (ver `acimaDoTipico`). */
  acima: number;
}

export function estatistica(lista: readonly { valor: number | null }[]): EstatisticaDePreco {
  const valores = lista.filter(temValor).map((p) => p.valor as number);
  const total = valores.reduce((s, v) => s + v, 0);
  return {
    qtde: lista.length,
    comValor: valores.length,
    total,
    media: valores.length ? Math.round(total / valores.length) : null,
    mediana: mediana(valores),
    min: valores.length ? Math.min(...valores) : null,
    max: valores.length ? Math.max(...valores) : null,
  };
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-10" → "out/26". */
export const rotuloDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1] ?? "?"}/${mes.slice(2, 4)}`;

function chaveENome(p: PrecoDaPassagem, d: DimensaoDoPreco): { chave: string; nome: string } | null {
  switch (d) {
    case "rota": return p.rota;
    case "companhia": return { chave: p.companhia, nome: p.companhiaNome };
    case "tipo": return { chave: p.tipo, nome: ROTULO_TRANSPORTE[p.tipo] ?? p.tipo };
    case "evento": return { chave: p.eventId, nome: p.eventName };
    case "mes": {
      const m = p.data?.slice(0, 7);
      return m ? { chave: m, nome: rotuloDoMes(m) } : null;
    }
  }
}

export function agruparPrecos(lista: readonly PrecoDaPassagem[], d: DimensaoDoPreco, acimaIds: ReadonlySet<string> = new Set()): GrupoDePreco[] {
  const grupos = new Map<string, { itens: PrecoDaPassagem[]; nomes: Map<string, number> }>();
  for (const p of lista) {
    const cn = chaveENome(p, d);
    if (!cn) continue;
    const g = grupos.get(cn.chave) ?? { itens: [], nomes: new Map<string, number>() };
    g.itens.push(p);
    g.nomes.set(cn.nome, (g.nomes.get(cn.nome) ?? 0) + 1);
    grupos.set(cn.chave, g);
  }
  const out = Array.from(grupos.entries()).map(([chave, g]) => ({
    ...estatistica(g.itens),
    chave,
    // A grafia mais usada vira o nome ("Salvador - BA" ganha de "salvador").
    nome: Array.from(g.nomes.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    acima: g.itens.filter((p) => acimaIds.has(p.id)).length,
  }));
  if (d === "mes") return out.sort((a, b) => a.chave.localeCompare(b.chave));
  return out.sort((a, b) =>
    (a.chave === "" ? 1 : 0) - (b.chave === "" ? 1 : 0) || b.qtde - a.qtde || b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ── Muito acima do típico ───────────────────────────────────────────────────

export interface PassagemAcima {
  item: PrecoDaPassagem;
  tipico: number;
  /** Quanto passa do típico, em % inteiro. */
  pctAcima: number;
  amostra: number;
}

const chaveDoTipico = (p: PrecoDaPassagem) => (p.rota ? `${p.tipo}|${p.rota.chave}` : null);

/**
 * O típico de cada rota (por tipo de transporte e forma da compra) sai de
 * TODAS as passagens com valor — não só do recorte: a rota tem mais amostra
 * e o típico não muda quando se filtra um evento. Uma passagem é "muito
 * acima" quando passa do teto da busca de passagens (padrão 30% sobre a
 * mediana; `pctDoTeto` vem dos ajustes quando o admin os lê).
 */
export function acimaDoTipico(
  recorte: readonly PrecoDaPassagem[],
  todas: readonly PrecoDaPassagem[],
  pctDoTeto: number = AJUSTES_PADRAO.tetoPorTrechoPct,
): PassagemAcima[] {
  const valoresPorRota = new Map<string, number[]>();
  for (const p of todas) {
    const k = chaveDoTipico(p);
    if (!k || !temValor(p)) continue;
    const lista = valoresPorRota.get(k) ?? [];
    lista.push(p.valor as number);
    valoresPorRota.set(k, lista);
  }
  const tipicos = new Map<string, PrecoTipico | null>();
  valoresPorRota.forEach((v, k) => tipicos.set(k, precoTipico(v)));
  const out: PassagemAcima[] = [];
  for (const p of recorte) {
    const k = chaveDoTipico(p);
    if (!k) continue;
    const av = avaliarTetoDoTrecho(p.valor, tipicos.get(k) ?? null, pctDoTeto);
    if (av?.acima) out.push({ item: p, tipico: av.tipico, pctAcima: av.pctAcimaDoTipico, amostra: av.amostra });
  }
  return out.sort((a, b) => b.pctAcima - a.pctAcima || (b.item.valor ?? 0) - (a.item.valor ?? 0));
}

/** Os tipos presentes (para o filtro), com quantas unidades cada um tem. */
export function tiposPresentes(lista: readonly PrecoDaPassagem[]): { id: string; nome: string; n: number }[] {
  const m = new Map<string, number>();
  for (const p of lista) m.set(p.tipo, (m.get(p.tipo) ?? 0) + 1);
  return Array.from(m.entries())
    .map(([id, n]) => ({ id, nome: ROTULO_TRANSPORTE[id] ?? id, n }))
    .sort((a, b) => (a.id === "" ? 1 : b.id === "" ? -1 : b.n - a.n));
}
