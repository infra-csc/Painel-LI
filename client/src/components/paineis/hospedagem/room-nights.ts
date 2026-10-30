/**
 * Painel de hospedagem (30/10) — COMPARAÇÃO DE HOTÉIS: room nights, pessoa-
 * noites, custo e tipo de apartamento, por hotel, por evento e por tipo.
 * Lógica pura.
 *
 * Definições (as duas aparecem na tela, lado a lado):
 *  - PESSOA-NOITE = uma pessoa dormindo uma noite. É a soma das noites de
 *    cada hospedagem.
 *  - ROOM NIGHT = um QUARTO ocupado uma noite (o número que o hotel cobra e
 *    negocia). Um Duplo com duas pessoas por 3 noites = 6 pessoa-noites e
 *    3 room nights.
 *
 * Como se conta, a partir da HOSPEDAGEM de cada vaga (a mesma lista que a
 * tela Hospedagem e a Escalação baixam — `/api/accommodations`):
 *  - entra só a hospedagem que CONTA: com nome do hotel e não cancelada (a
 *    regra de `vagasComHotel`/`hospedagemViva`), de vaga viva (sem cancelada
 *    nem excluída) e fora da Validação/Aprovação de Escala;
 *  - noites = `nights_count` (as diárias do Espelho/Hospedagem) quando
 *    preenchido; senão check-out − check-in (a noite de D vai de D a D+1,
 *    como em shared/ocupacao-por-noite.ts); sem nenhum dos dois, "sem noites"
 *    (contada à parte, fora das somas);
 *  - room nights = noites ÷ ocupantes do apartamento (Individual 1, Duplo 2,
 *    Triplo 3). O Espelho (23/10) grava na hospedagem de cada ocupante o tipo
 *    e as diárias do quarto confirmado, então os dois do Duplo somam meio
 *    quarto cada um — 1 quarto. Hospedagem sem tipo conta como Individual
 *    (cada pessoa, um quarto) e aparece como "sem tipo";
 *  - custo = `total_cents`; sem ele, diária × noites. Custo por room night =
 *    custo ÷ room nights; por pessoa-noite = custo ÷ pessoa-noites (só com
 *    as hospedagens que têm custo E noites, para não puxar a média para baixo).
 *
 * Limite conhecido (documentado na tela): quando os ocupantes do mesmo quarto
 * têm datas diferentes (um entra dois dias antes), a divisão por ocupantes é
 * uma estimativa — o exato precisa dos quartos do Espelho (hotel_room_groups),
 * que hoje só se leem evento a evento.
 */
import type { Accommodation, Event, TeamInclusion } from "@shared/schema";
import { semAcento } from "@shared/analise-de-passagens";
import { hospedagemViva } from "@shared/logistica-da-escala";
import { ehSugestao, vagasVivas } from "@/components/scaling/scaling-analytics-data";
import { diaDaProvaISO } from "@shared/dia-da-prova";

export type TipoDeApartamento = "single" | "double" | "triple" | "";

export const ROTULO_DO_APARTAMENTO: Record<TipoDeApartamento, string> = {
  single: "Individual", double: "Duplo", triple: "Triplo", "": "Sem tipo",
};

/** "single"/"individual"/"simples" → single; "duplo"/"double"/"casal" → double; "triplo"/"triple" → triple. */
export function tipoDoApartamento(v: string | null | undefined): TipoDeApartamento {
  const t = semAcento(String(v ?? ""));
  if (!t) return "";
  if (/^(single|individual|simples|sgl)/.test(t)) return "single";
  if (/^(double|duplo|casal|twin|dbl)/.test(t)) return "double";
  if (/^(triple|triplo|tpl)/.test(t)) return "triple";
  return "";
}

const OCUPANTES: Record<TipoDeApartamento, number> = { single: 1, double: 2, triple: 3, "": 1 };

const MS_DIA = 86_400_000;
const dia = (v: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ""));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/** Noites da hospedagem: diárias informadas; senão check-out − check-in; null sem nenhum. */
export function noitesDaHospedagem(a: Pick<Accommodation, "nightsCount" | "checkInDate" | "checkOutDate">): number | null {
  if (typeof a.nightsCount === "number" && a.nightsCount > 0) return a.nightsCount;
  const ini = dia(a.checkInDate);
  const fim = dia(a.checkOutDate);
  if (ini === null || fim === null || fim <= ini) return null;
  return Math.round((fim - ini) / MS_DIA);
}

/** Custo da hospedagem em centavos: total; senão diária × noites; null sem valor. */
export function custoDaHospedagem(a: Pick<Accommodation, "totalCents" | "dailyRate">, noites: number | null): number | null {
  if (typeof a.totalCents === "number" && a.totalCents > 0) return a.totalCents;
  if (typeof a.dailyRate === "number" && a.dailyRate > 0 && noites) return a.dailyRate * noites;
  return null;
}

export interface EstadiaNoHotel {
  accommodationId: string;
  teamInclusionId: string;
  eventId: string;
  eventName: string;
  /** Dia da prova ("AAAA-MM-DD") — o período filtra por ele. */
  dataEvento: string | null;
  functionId: string | null;
  /** Chave normalizada do hotel e o nome como foi digitado. */
  hotel: string;
  hotelNome: string;
  tipo: TipoDeApartamento;
  noites: number | null;
  roomNights: number | null;
  custo: number | null;
  /** "AAAA-MM" do check-in. */
  mes: string | null;
}

/** "Hotel Ibis  Copacabana" e "hotel ibis copacabana" são o mesmo hotel. */
export const chaveDoHotel = (nome: string) => semAcento(nome).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function estadiasNoHotel(
  hospedagens: readonly Accommodation[],
  vagas: readonly TeamInclusion[],
  eventos: readonly Event[],
): EstadiaNoHotel[] {
  const vivas = new Map(vagasVivas(vagas as TeamInclusion[]).filter((i) => !ehSugestao(i)).map((i) => [i.id, i]));
  const eventoPorId = new Map(eventos.map((e) => [e.id, e]));
  const out: EstadiaNoHotel[] = [];
  for (const a of hospedagens) {
    if (!hospedagemViva(a)) continue;
    const vaga = vivas.get(a.teamInclusionId);
    if (!vaga) continue;
    const ev = eventoPorId.get(vaga.eventId);
    const noites = noitesDaHospedagem(a);
    const tipo = tipoDoApartamento(a.roomType);
    const nome = String(a.hotelName ?? "").trim().replace(/\s+/g, " ");
    const ci = /^(\d{4}-\d{2})/.exec(String(a.checkInDate ?? ""));
    out.push({
      accommodationId: a.id,
      teamInclusionId: a.teamInclusionId,
      eventId: vaga.eventId,
      eventName: ev?.name ?? "Evento sem nome",
      dataEvento: ev ? diaDaProvaISO(ev.startDate, ev.endDate, ev) : null,
      functionId: vaga.functionId ?? null,
      hotel: chaveDoHotel(nome),
      hotelNome: nome,
      tipo,
      noites,
      roomNights: noites === null ? null : noites / OCUPANTES[tipo],
      custo: custoDaHospedagem(a, noites),
      mes: ci ? ci[1] : null,
    });
  }
  return out;
}

export interface RecorteDosHoteis {
  /** Dia da prova a partir de / até ("AAAA-MM-DD"; null = sem ponta). */
  de: string | null;
  ate: string | null;
  eventId: string;
  funcoes: string[];
}

export function recortarEstadias(lista: readonly EstadiaNoHotel[], r: RecorteDosHoteis): EstadiaNoHotel[] {
  const funcoes = r.funcoes.length ? new Set(r.funcoes) : null;
  return lista.filter((e) => {
    if (r.de || r.ate) {
      if (!e.dataEvento) return false;
      if (r.de && e.dataEvento < r.de) return false;
      if (r.ate && e.dataEvento > r.ate) return false;
    }
    if (r.eventId !== "all" && e.eventId !== r.eventId) return false;
    if (funcoes && !(e.functionId && funcoes.has(e.functionId))) return false;
    return true;
  });
}

export type DimensaoDoHotel = "hotel" | "evento" | "tipo";

export const DIMENSOES_DO_HOTEL: readonly (readonly [DimensaoDoHotel, string])[] = [
  ["hotel", "Hotéis"], ["evento", "Eventos"], ["tipo", "Apartamento"],
] as const;

export interface NumerosDoHotel {
  /** Hospedagens (pessoas). */
  hospedagens: number;
  pessoaNoites: number;
  roomNights: number;
  /** Sem noites informadas (fora das somas). */
  semNoites: number;
  /** Sem valor (fora do custo médio). */
  semCusto: number;
  /** Soma do custo, centavos. */
  custo: number;
  /** Custo ÷ room nights, centavos; null sem base. */
  porRoomNight: number | null;
  /** Custo ÷ pessoa-noites, centavos; null sem base. */
  porPessoaNoite: number | null;
  /** Quantas hospedagens em cada tipo. */
  tipos: Record<TipoDeApartamento, number>;
}

export function numerosDoHotel(lista: readonly EstadiaNoHotel[]): NumerosDoHotel {
  const n: NumerosDoHotel = {
    hospedagens: lista.length, pessoaNoites: 0, roomNights: 0, semNoites: 0, semCusto: 0, custo: 0,
    porRoomNight: null, porPessoaNoite: null, tipos: { single: 0, double: 0, triple: 0, "": 0 },
  };
  let baseRn = 0, basePn = 0, baseCusto = 0;
  for (const e of lista) {
    n.tipos[e.tipo] += 1;
    if (e.noites === null) n.semNoites += 1;
    else { n.pessoaNoites += e.noites; n.roomNights += e.roomNights ?? 0; }
    if (e.custo === null) n.semCusto += 1;
    else n.custo += e.custo;
    if (e.custo !== null && e.noites !== null) { baseCusto += e.custo; basePn += e.noites; baseRn += e.roomNights ?? 0; }
  }
  // Room nights fracionados (ocupante com datas diferentes) arredondam em 1 casa.
  n.roomNights = Math.round(n.roomNights * 10) / 10;
  n.porRoomNight = baseRn > 0 ? Math.round(baseCusto / baseRn) : null;
  n.porPessoaNoite = basePn > 0 ? Math.round(baseCusto / basePn) : null;
  return n;
}

export interface GrupoDeHotel extends NumerosDoHotel {
  chave: string;
  nome: string;
  /** Hotel: os eventos em que aparece; Evento: os hotéis usados. */
  outros: string[];
  /** Dia da prova (só por evento). */
  dataEvento: string | null;
}

export function agruparEstadias(lista: readonly EstadiaNoHotel[], d: DimensaoDoHotel): GrupoDeHotel[] {
  const grupos = new Map<string, { itens: EstadiaNoHotel[]; nomes: Map<string, number> }>();
  for (const e of lista) {
    const chave = d === "hotel" ? e.hotel : d === "evento" ? e.eventId : e.tipo;
    const nome = d === "hotel" ? e.hotelNome : d === "evento" ? e.eventName : ROTULO_DO_APARTAMENTO[e.tipo];
    const g = grupos.get(chave) ?? { itens: [], nomes: new Map<string, number>() };
    g.itens.push(e);
    g.nomes.set(nome, (g.nomes.get(nome) ?? 0) + 1);
    grupos.set(chave, g);
  }
  const out: GrupoDeHotel[] = Array.from(grupos.entries()).map(([chave, g]) => {
    // Os "outros" também se juntam pela chave (o hotel com duas grafias é um só).
    const porChave = new Map<string, Map<string, number>>();
    for (const e of g.itens) {
      const [k, nome] = d === "evento" ? [e.hotel, e.hotelNome] : [e.eventId, e.eventName];
      const nomes = porChave.get(k) ?? new Map<string, number>();
      nomes.set(nome, (nomes.get(nome) ?? 0) + 1);
      porChave.set(k, nomes);
    }
    const outros = Array.from(porChave.values()).map((nomes) => Array.from(nomes.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
    return {
      ...numerosDoHotel(g.itens),
      chave,
      nome: Array.from(g.nomes.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
      outros: d === "tipo" ? [] : outros.sort((a, b) => a.localeCompare(b, "pt-BR")),
      dataEvento: d === "evento" ? g.itens[0].dataEvento : null,
    };
  });
  if (d === "tipo") {
    const ordem: TipoDeApartamento[] = ["single", "double", "triple", ""];
    return out.sort((a, b) => ordem.indexOf(a.chave as TipoDeApartamento) - ordem.indexOf(b.chave as TipoDeApartamento));
  }
  return out.sort((a, b) => b.roomNights - a.roomNights || b.hospedagens - a.hospedagens || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** "12" / "3,5" — room nights com no máximo uma casa. */
export const textoDeNoites = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
