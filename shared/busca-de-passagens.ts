/**
 * BUSCA DE PASSAGENS NA INTERNET — regra pura (09/10).
 *
 * Compras e admin selecionam vagas e o app consulta preços reais (LATAM, GOL e
 * Azul) num fornecedor pago por consulta (Ignav: 1.000 grátis, depois US$ 2 a
 * cada mil). O dono quer gastar o MÍNIMO e a busca "certeira", então tudo o
 * que decide QUANTAS consultas uma busca gasta mora aqui, testado:
 *
 *  1. PLANEJAR: de cada vaga sai a perna que ela precisa, da cidade certa —
 *     ida e volta numa consulta só quando as duas saem/voltam para casa;
 *     só ida / só volta / trecho direto (pinga-pinga: a ida sai do evento
 *     anterior) viram consultas de uma perna. Faltou dado (data, "Sai de",
 *     aeroporto do evento) → a vaga NÃO entra e a tela diz o que falta.
 *  2. AGRUPAR: vagas com a mesma consulta (perna, aeroportos, datas e filtros)
 *     viram UMA consulta. A chave é o pedido normalizado — é também a chave
 *     do cache compartilhado entre usuários (3 h).
 *  3. FILTRAR NA ORIGEM: só LA/G3/AD, até 1 conexão, mercado BR e a janela
 *     de horário da vaga ("Chegar até" na ida, "Sair após" na volta).
 *  4. ORDENAR PELO CUSTO TOTAL: preço + diária de hotel quando a volta sai a
 *     partir das 18h (regra do Espelho — HORA_DA_VOLTA_COM_DIARIA_EXTRA), com
 *     os voos absurdos (2 conexões, 12 h+, conexão de 8 h+) no fim.
 */
import { HORA_DA_VOLTA_COM_DIARIA_EXTRA } from "./datas-do-quarto";
import { aeroportosDaCidade, aeroportosDoEvento, alternativasDoAeroporto, ehIata } from "./aeroportos-do-brasil";
import { diaDe, somarDiasISO } from "./janela-de-viagem";

// ── Constantes do dono ─────────────────────────────────────────────────────

/** Só as três companhias que a empresa compra (dono, 09/10). */
export const CIAS_DA_BUSCA = ["LA", "G3", "AD"] as const;
export const NOME_DA_CIA: Record<string, string> = { LA: "LATAM", G3: "GOL", AD: "Azul", JJ: "LATAM" };
/** Resultado reaproveitado por todos os usuários durante este tempo. */
export const HORAS_DE_CACHE_DA_BUSCA = 3;
/** system_settings: teto de consultas no mês (padrão 1.000 — as grátis do plano). */
export const CHAVE_DO_TETO_MENSAL = "busca_passagens_teto_mensal";
export const TETO_MENSAL_PADRAO = 1000;
/** A partir desta fração do teto a tela avisa. */
export const ALERTA_DO_TETO = 0.8;
/** Conexões aceitas na consulta padrão ("Tentar com 2 conexões" é à parte). */
export const MAX_PARADAS_PADRAO = 1;
/** Limites de segurança de uma busca. */
export const MAX_VAGAS_POR_BUSCA = 80;
export const MAX_CONSULTAS_POR_BUSCA = 40;
/** Conexão a partir disto ganha o selo "conexão longa". */
export const CONEXAO_LONGA_MIN = 3 * 60;
/** Viagem absurda: vai para o fim da lista com selo. */
export const PERNA_ABSURDA_MIN = 12 * 60;
export const CONEXAO_ABSURDA_MIN = 8 * 60;

// ── Faixa de horário sugerida (texto livre) ────────────────────────────────

/** Janela em minutos desde 00:00; ponta null = aberta. */
export interface Faixa { desde: number | null; ate: number | null }
/** Como ler UM horário solto: "Chegar até 9h" (ida) ou "Sair após 18h" (volta). */
export type SentidoDaFaixa = "chegar_ate" | "sair_apos";

const PERIODOS: Array<[RegExp, Faixa]> = [
  [/(inicio|comeco) da manha/, { desde: 5 * 60, ate: 9 * 60 }],
  [/(fim|final) da manha/, { desde: 9 * 60, ate: 12 * 60 }],
  [/(inicio|comeco) da tarde/, { desde: 12 * 60, ate: 15 * 60 }],
  [/(fim|final) da tarde/, { desde: 15 * 60, ate: 18 * 60 }],
  [/(inicio|comeco) da noite/, { desde: 18 * 60, ate: 21 * 60 }],
  [/madrugada/, { desde: 0, ate: 6 * 60 }],
  [/manha/, { desde: 5 * 60, ate: 12 * 60 }],
  [/tarde/, { desde: 12 * 60, ate: 18 * 60 }],
  [/noite/, { desde: 18 * 60, ate: 23 * 60 + 59 }],
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Horários do texto, em minutos, na ordem em que aparecem. */
function horariosDoTexto(t: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,4})(?:\s*(?::|h)\s*(\d{2})?)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    let h: number, min: number;
    if (m[1].length >= 3 && m[2] === undefined) {
      const raw = m[1].padStart(4, "0");
      h = Number(raw.slice(0, 2));
      min = Number(raw.slice(2));
    } else {
      h = Number(m[1]);
      min = Number(m[2] ?? 0);
    }
    if (h === 24 && min === 0) { out.push(23 * 60 + 59); continue; }
    if (h > 23 || min > 59) return [];
    out.push(h * 60 + min);
  }
  return out;
}

/**
 * Horário sugerido da vaga (texto livre: "8-14h", "até 14h", "20h+", "depois
 * das 20h", "manhã", "9h") → janela. Um horário solto vale conforme o campo:
 * "Chegar até" (ida) é teto; "Sair após" (volta) é piso. Não interpretável
 * (vazio, "a combinar", faixa que vira a noite como "22-2h") → null = sem filtro.
 */
export function faixaDeHorario(texto: string | null | undefined, sentido: SentidoDaFaixa): Faixa | null {
  const t = semAcento(String(texto ?? "")).trim();
  if (!t || /^(n\/?a|-+|nao (informado|definido))$/.test(t)) return null;
  const horas = horariosDoTexto(t);
  if (horas.length === 0) {
    for (const [re, faixa] of PERIODOS) if (re.test(t)) return { ...faixa };
    return null;
  }
  if (horas.length >= 2) {
    const [a, b] = horas;
    return a < b ? { desde: a, ate: b } : null;
  }
  const h = horas[0];
  const antes = t.slice(0, t.search(/\d/));
  const depois = t.slice(t.search(/\d/));
  if (/\b(ate|antes)\b/.test(antes)) return { desde: null, ate: h };
  if (/\+/.test(depois) || /\b(depois|apos|partir|desde|mais tarde)\b/.test(antes)) return { desde: h, ate: null };
  return sentido === "chegar_ate" ? { desde: null, ate: h } : { desde: h, ate: null };
}

/** Filtro de horário no formato do fornecedor (horas inteiras, hora local do aeroporto). */
export interface FiltroDeHorario {
  partidaDe?: number;
  partidaAte?: number;
  chegadaDe?: number;
  chegadaAte?: number;
}

/**
 * Janela em minutos → horas inteiras do fornecedor. Arredonda para FORA
 * ("até 13:30" → até 13h59; "desde 10:15" → desde 10h): a consulta não perde
 * voo bom por arredondamento; o selo "chega no horário" usa o minuto exato.
 */
export function filtroDaFaixa(f: Faixa | null, ponta: "partida" | "chegada"): FiltroDeHorario | null {
  if (!f || (f.desde === null && f.ate === null)) return null;
  const de = f.desde === null ? undefined : Math.floor(f.desde / 60);
  const ate = f.ate === null ? undefined : Math.min(23, Math.floor(f.ate / 60));
  return ponta === "chegada"
    ? { ...(de !== undefined ? { chegadaDe: de } : {}), ...(ate !== undefined ? { chegadaAte: ate } : {}) }
    : { ...(de !== undefined ? { partidaDe: de } : {}), ...(ate !== undefined ? { partidaAte: ate } : {}) };
}

/** "8h–14h", "até 14h", "a partir de 18h30". */
export function faixaEmTexto(f: Faixa | null): string {
  if (!f) return "";
  const hh = (m: number) => (m % 60 === 0 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`);
  if (f.desde !== null && f.ate !== null) return `${hh(f.desde)}–${hh(f.ate)}`;
  if (f.ate !== null) return `até ${hh(f.ate)}`;
  if (f.desde !== null) return `a partir de ${hh(f.desde)}`;
  return "";
}

// ── Consulta e chave (cache) ───────────────────────────────────────────────

/** "ida": casa → evento (ou evento anterior → evento); "volta": evento → casa. */
export type PernaDaRota = "ida" | "volta" | "ida_e_volta";

/** O pedido ao fornecedor, normalizado — sem nenhum dado pessoal. */
export interface ConsultaDePassagens {
  perna: PernaDaRota;
  origem: string;
  destino: string;
  dataIda: string;
  /** Só em "ida_e_volta". */
  dataVolta: string | null;
  maxParadas: 1 | 2;
  /** Filtro da primeira perna (a única, nas consultas de uma perna). */
  horarioIda: FiltroDeHorario | null;
  /** Filtro da volta numa consulta de ida e volta. */
  horarioVolta: FiltroDeHorario | null;
}

const filtroNaChave = (f: FiltroDeHorario | null) =>
  f ? `${f.partidaDe ?? ""},${f.partidaAte ?? ""},${f.chegadaDe ?? ""},${f.chegadaAte ?? ""}` : "-";

/**
 * Chave normalizada da consulta: dois pedidos com a mesma chave são o MESMO
 * pedido ao fornecedor (mesma resposta) — agrupa vagas e indexa o cache.
 */
export function chaveDaConsulta(c: ConsultaDePassagens): string {
  return [
    c.perna,
    `${c.origem.toUpperCase()}>${c.destino.toUpperCase()}`,
    c.dataIda,
    c.dataVolta ?? "-",
    `p${c.maxParadas}`,
    filtroNaChave(c.horarioIda),
    filtroNaChave(c.horarioVolta),
  ].join("|");
}

/** Chave do link de compra de um itinerário (também em cache). */
export const chaveDoLink = (itinerarioId: string) => `link|${itinerarioId}`;

// ── Planejamento: vagas → rotas ─────────────────────────────────────────────

/** O que a busca lê da vaga (nada pessoal vai ao fornecedor). */
export interface VagaDaBusca {
  id: string;
  inclusionNumber?: number | null;
  eventId: string;
  /** "Sai de" da vaga; na falta, a cidade do cadastro do colaborador. */
  cidadeDeSaida?: string | null;
  needsTicket?: boolean | null;
  transportModeIda?: string | null;
  transportModeVolta?: string | null;
  flightDepartureDate?: string | Date | null;
  flightArrivalSuggestedTime?: string | null;
  flightReturnDate?: string | Date | null;
  flightReturnSuggestedTime?: string | null;
  trechosSugeridos?: string | null;
  idaVemDoEventoId?: string | null;
  voltaSegueParaEventoId?: string | null;
  /** Despacha mala (função na lista do admin ou cenotécnica — shared/regras-da-busca.ts). */
  precisaMala?: boolean | null;
}

export interface EventoDaBusca {
  id: string;
  name?: string | null;
  location?: string | null;
  /** Aeroporto confirmado por quem compra (events.aeroporto_iata). */
  aeroportoIata?: string | null;
}

/** Ajustes feitos na tela, por vaga, só para esta busca (nada é gravado na vaga). */
export interface AjusteDaBusca {
  /** Aeroporto de casa escolhido no lugar do principal da cidade ("CGH" em vez de "GRU"). */
  aeroportoDeCasa?: string | null;
  /** Data informada na hora, quando a vaga não tem. */
  dataIda?: string | null;
  dataVolta?: string | null;
  /** "Tentar com 2 conexões". */
  maxParadas?: 1 | 2 | null;
  /** Trecho direto: a ida sai do evento desta vaga anterior do colaborador. */
  idaDoEventoId?: string | null;
  /** Só uma perna (ex.: "Buscar preços do trecho direto" = só a ida). */
  somente?: "ida" | "volta" | null;
  /**
   * "Ver sem o horário sugerido" (09/10): a consulta vai SEM a janela de
   * horário (a rota tinha filtro e voltou vazia ou só com opções ruins). A
   * janela continua valendo para os selos — a opção fora dela é marcada
   * ("Sai 17:45 — antes do sugerido 18h"), nunca escondida.
   */
  semHorario?: boolean | null;
  /** Aeroporto alternativo do EVENTO escolhido na tela ("SDU" em vez de "GIG"). */
  aeroportoDoEvento?: string | null;
}

export type TipoDeDadoFaltando =
  | "vaga_invalida"
  | "nao_precisa"
  | "sem_trecho_aereo"
  | "sem_cidade_de_saida"
  | "cidade_sem_aeroporto"
  | "evento_sem_aeroporto"
  | "sem_data_ida"
  | "sem_data_volta"
  | "data_passada"
  | "volta_antes_da_ida"
  | "mesmo_aeroporto";

export interface DadoFaltando {
  vagaId: string;
  tipo: TipoDeDadoFaltando;
  mensagem: string;
  /** evento_sem_aeroporto: qual evento e as sugestões pela cidade dele. */
  eventId?: string;
  sugestoes?: string[];
  /** cidade_sem_aeroporto: o texto que não foi reconhecido. */
  texto?: string;
}

export interface VagaNaRota { vagaId: string; perna: PernaDaRota }

export interface RotaPlanejada extends ConsultaDePassagens {
  chave: string;
  vagas: VagaNaRota[];
  eventoIds: string[];
  /** Janela exata (minutos) para o selo "chega/sai no horário" — a mais estreita das vagas. */
  faixaIda: Faixa | null;
  faixaVolta: Faixa | null;
  /** A ida sai de outro evento (pinga-pinga). */
  trechoDireto: boolean;
  /** Outros aeroportos da cidade de casa, para trocar ("GRU" → CGH, VCP). */
  alternativasDeCasa: string[];
  /** Outros aeroportos que atendem o evento ("GIG" → SDU). */
  alternativasDoEvento: string[];
  /** A rota tem janela de horário, mas a consulta foi pedida SEM ela. */
  semHorario: boolean;
  /** Quantas vagas desta rota despacham mala (o custo total soma a mala de quem não a tem incluída). */
  vagasComMala: number;
}

export interface PlanoDaBusca {
  rotas: RotaPlanejada[];
  faltando: DadoFaltando[];
  /**
   * Eventos SEM aeroporto confirmado cuja cidade foi reconhecida (15/10): a
   * busca usou o principal da cidade (evento → IATA + os aeroportos da cidade).
   * Não conta como dado faltando — a tela mostra "aeroporto sugerido" com troca
   * em um clique e, quando a cidade tem MAIS DE UM (`opcoes` > 1), pede a
   * confirmação uma vez por evento, sem travar a busca.
   */
  aeroportosSugeridos: Record<string, AeroportoSugerido>;
}

export interface AeroportoSugerido {
  iata: string;
  /** Aeroportos da cidade do evento, o principal primeiro (1 = nada a confirmar). */
  opcoes: string[];
}

const modoAereo = (m: string | null | undefined) => !m || m === "aereo";
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** A janela mais estreita entre duas (para as vagas agrupadas na mesma rota). */
function estreitar(a: Faixa | null, b: Faixa | null): Faixa | null {
  if (!a) return b;
  if (!b) return a;
  const desde = a.desde === null ? b.desde : b.desde === null ? a.desde : Math.max(a.desde, b.desde);
  const ate = a.ate === null ? b.ate : b.ate === null ? a.ate : Math.min(a.ate, b.ate);
  return { desde, ate };
}

/**
 * Vagas → rotas a consultar (agrupadas) + o que falta. Uma vaga com qualquer
 * dado faltando NÃO entra (nem a perna que estaria completa): a busca nunca
 * consulta pela metade e a tela mostra o que corrigir.
 */
export function planejarBusca(entrada: {
  vagas: readonly VagaDaBusca[];
  eventos: ReadonlyMap<string, EventoDaBusca> | Record<string, EventoDaBusca>;
  ajustes?: Record<string, AjusteDaBusca | undefined>;
  hoje: string;
}): PlanoDaBusca {
  const eventoDe = (id: string | null | undefined): EventoDaBusca | undefined => {
    if (!id) return undefined;
    const ev = entrada.eventos as Map<string, EventoDaBusca> & Record<string, EventoDaBusca>;
    return typeof ev.get === "function" ? ev.get(id) : ev[id];
  };
  const faltando: DadoFaltando[] = [];
  const rotas = new Map<string, RotaPlanejada>();
  const eventoSemAeroportoJaDito = new Set<string>();
  const aeroportosSugeridos: Record<string, AeroportoSugerido> = {};

  for (const v of entrada.vagas) {
    const aj = entrada.ajustes?.[v.id] ?? {};
    const falta: DadoFaltando[] = [];
    const dizer = (tipo: TipoDeDadoFaltando, mensagem: string, extra: Partial<DadoFaltando> = {}) =>
      falta.push({ vagaId: v.id, tipo, mensagem, ...extra });

    if (v.needsTicket === false) {
      faltando.push({ vagaId: v.id, tipo: "nao_precisa", mensagem: "Esta vaga não precisa de passagem." });
      continue;
    }
    const precisaIda = aj.somente !== "volta" && v.trechosSugeridos !== "so_volta" && modoAereo(v.transportModeIda);
    const precisaVolta = aj.somente !== "ida" && v.trechosSugeridos !== "so_ida" && !v.voltaSegueParaEventoId && modoAereo(v.transportModeVolta);
    if (!precisaIda && !precisaVolta) {
      faltando.push({ vagaId: v.id, tipo: "sem_trecho_aereo", mensagem: "Nenhum trecho aéreo a buscar (a viagem é por outro transporte ou segue direto para outro evento)." });
      continue;
    }

    // Aeroporto do evento (destino da ida, origem da volta): o confirmado e
    // salvo; sem ele, o PRINCIPAL da cidade do evento (15/10 — pelo local e, se
    // não reconhecer, pelo nome do evento): Teresina → THE, BH → CNF, Rio → GIG.
    // Só a cidade desconhecida trava a vaga até alguém confirmar.
    const evento = eventoDe(v.eventId);
    const aeroportoDoEvento = (ev: EventoDaBusca | undefined, eventId: string): string | null => {
      const iata = ev?.aeroportoIata && ehIata(ev.aeroportoIata) ? ev.aeroportoIata.toUpperCase() : null;
      if (iata) return iata;
      const daCidade = aeroportosDoEvento(ev);
      if (daCidade.length > 0) {
        aeroportosSugeridos[eventId] = { iata: daCidade[0], opcoes: daCidade };
        return daCidade[0];
      }
      const nome = ev?.name || "do evento";
      dizer("evento_sem_aeroporto", `Aeroporto de ${nome} ainda não confirmado.`, {
        eventId,
        sugestoes: [],
      });
      return null;
    };
    const aeroEventoOriginal = aeroportoDoEvento(evento, v.eventId);
    const trocaDoEvento = aj.aeroportoDoEvento && ehIata(aj.aeroportoDoEvento) ? aj.aeroportoDoEvento.toUpperCase() : null;
    const aeroEvento = aeroEventoOriginal && trocaDoEvento ? trocaDoEvento : aeroEventoOriginal;
    const alternativasDoEvento = aeroEventoOriginal
      ? [aeroEventoOriginal, ...alternativasDoAeroporto(aeroEventoOriginal)].filter((a, i, l) => a !== aeroEvento && l.indexOf(a) === i)
      : [];

    // Origem da ida: evento anterior (trecho direto) ou a cidade de casa.
    const idaDoEventoId = aj.idaDoEventoId || v.idaVemDoEventoId || null;
    let aeroOrigemIda: string | null = null;
    if (precisaIda && idaDoEventoId) aeroOrigemIda = aeroportoDoEvento(eventoDe(idaDoEventoId), idaDoEventoId);

    const precisaCasa = (precisaIda && !idaDoEventoId) || precisaVolta;
    let aeroCasa: string | null = null;
    let alternativas: string[] = [];
    if (precisaCasa) {
      const cidade = String(v.cidadeDeSaida ?? "").trim();
      const daCidade = aeroportosDaCidade(cidade);
      const escolhido = aj.aeroportoDeCasa && ehIata(aj.aeroportoDeCasa) ? aj.aeroportoDeCasa.toUpperCase() : null;
      if (escolhido) {
        aeroCasa = escolhido;
        alternativas = daCidade.filter((a) => a !== escolhido);
        for (const a of alternativasDoAeroporto(escolhido)) if (a !== escolhido && !alternativas.includes(a)) alternativas.push(a);
      } else if (!cidade) {
        dizer("sem_cidade_de_saida", "Sem cidade de saída (\"Sai de\") na vaga nem no cadastro do colaborador.");
      } else if (daCidade.length === 0) {
        dizer("cidade_sem_aeroporto", `Não sei o aeroporto de "${cidade}". Informe o código (ex.: GRU).`, { texto: cidade });
      } else {
        aeroCasa = daCidade[0];
        alternativas = daCidade.slice(1);
        for (const a of alternativasDoAeroporto(aeroCasa)) if (a !== aeroCasa && !alternativas.includes(a)) alternativas.push(a);
      }
      // Mesma cidade/região do evento (16/10, dono: "não é intuitivo"): sem voo
      // — a viagem é por terra. Aeroporto de saída ESCOLHIDO (na tela ou pela
      // passagem comprada) só conta quando é o próprio aeroporto do evento.
      const mesmaRegiao = escolhido ? aeroCasa === aeroEvento : !!aeroCasa && !!aeroEvento && (aeroCasa === aeroEvento || daCidade.includes(aeroEvento));
      if (aeroCasa && aeroEvento && mesmaRegiao) {
        const onde = evento?.name ? `${evento.name} (${aeroEvento})` : `o evento (${aeroEvento})`;
        dizer("mesmo_aeroporto", `Sai de ${cidade || aeroCasa}, na mesma região de ${onde}: a viagem é por terra, não há voo a buscar.`, { texto: cidade || aeroCasa });
      }
    }
    if (precisaIda && idaDoEventoId && aeroOrigemIda && aeroEvento && aeroOrigemIda === aeroEvento) {
      dizer("mesmo_aeroporto", `O evento anterior fica na mesma região (${aeroEvento}): a viagem é por terra, não há voo a buscar.`);
    }

    // Datas: da vaga ou informadas na hora.
    const dataIda = precisaIda ? diaDe(aj.dataIda || null) ?? diaDe(v.flightDepartureDate) : null;
    const dataVolta = precisaVolta ? diaDe(aj.dataVolta || null) ?? diaDe(v.flightReturnDate) : null;
    if (precisaIda && !dataIda) dizer("sem_data_ida", "Sem data de ida sugerida.");
    if (precisaVolta && !dataVolta) dizer("sem_data_volta", "Sem data de volta sugerida.");
    if (dataIda && dataIda < entrada.hoje) dizer("data_passada", `A data da ida (${dataCurta(dataIda)}) já passou.`);
    else if (dataVolta && dataVolta < entrada.hoje) dizer("data_passada", `A data da volta (${dataCurta(dataVolta)}) já passou.`);
    if (dataIda && dataVolta && dataVolta < dataIda) dizer("volta_antes_da_ida", "A data de volta é antes da data de ida.");

    if (falta.length > 0) {
      for (const f of falta) {
        // O mesmo evento sem aeroporto aparece uma vez por evento, não por vaga.
        if (f.tipo === "evento_sem_aeroporto" && f.eventId) {
          const k = `${f.eventId}`;
          if (eventoSemAeroportoJaDito.has(k)) {
            faltando.push({ ...f, sugestoes: undefined });
            continue;
          }
          eventoSemAeroportoJaDito.add(k);
        }
        faltando.push(f);
      }
      continue;
    }

    const maxParadas: 1 | 2 = aj.maxParadas === 2 ? 2 : 1;
    const faixaIda = faixaDeHorario(v.flightArrivalSuggestedTime, "chegar_ate");
    const faixaVolta = faixaDeHorario(v.flightReturnSuggestedTime, "sair_apos");
    const semHorario = aj.semHorario === true;
    /** "Ver sem o horário sugerido": a consulta vai sem filtro; a janela fica só para os selos. */
    const filtro = (f: Faixa | null, ponta: "partida" | "chegada") => (semHorario ? null : filtroDaFaixa(f, ponta));
    const adicionar = (c: ConsultaDePassagens, perna: PernaDaRota, extra: { faixaIda: Faixa | null; faixaVolta: Faixa | null; trechoDireto: boolean; alternativas: string[] }) => {
      const chave = chaveDaConsulta(c);
      const atual = rotas.get(chave);
      const comMala = v.precisaMala ? 1 : 0;
      if (atual) {
        atual.vagas.push({ vagaId: v.id, perna });
        if (!atual.eventoIds.includes(v.eventId)) atual.eventoIds.push(v.eventId);
        atual.faixaIda = estreitar(atual.faixaIda, extra.faixaIda);
        atual.faixaVolta = estreitar(atual.faixaVolta, extra.faixaVolta);
        atual.vagasComMala += comMala;
        return;
      }
      rotas.set(chave, {
        ...c, chave, vagas: [{ vagaId: v.id, perna }], eventoIds: [v.eventId],
        faixaIda: extra.faixaIda, faixaVolta: extra.faixaVolta, trechoDireto: extra.trechoDireto,
        alternativasDeCasa: extra.alternativas,
        alternativasDoEvento,
        semHorario: semHorario && !!(extra.faixaIda || extra.faixaVolta),
        vagasComMala: comMala,
      });
    };

    const origemIda = idaDoEventoId ? aeroOrigemIda! : aeroCasa!;
    if (precisaIda && precisaVolta && !idaDoEventoId) {
      adicionar({
        perna: "ida_e_volta", origem: aeroCasa!, destino: aeroEvento!, dataIda: dataIda!, dataVolta: dataVolta!, maxParadas,
        horarioIda: filtro(faixaIda, "chegada"), horarioVolta: filtro(faixaVolta, "partida"),
      }, "ida_e_volta", { faixaIda, faixaVolta, trechoDireto: false, alternativas });
      continue;
    }
    if (precisaIda) {
      adicionar({
        perna: "ida", origem: origemIda, destino: aeroEvento!, dataIda: dataIda!, dataVolta: null, maxParadas,
        horarioIda: filtro(faixaIda, "chegada"), horarioVolta: null,
      }, "ida", { faixaIda, faixaVolta: null, trechoDireto: !!idaDoEventoId, alternativas: idaDoEventoId ? [] : alternativas });
    }
    if (precisaVolta) {
      adicionar({
        perna: "volta", origem: aeroEvento!, destino: aeroCasa!, dataIda: dataVolta!, dataVolta: null, maxParadas,
        horarioIda: filtro(faixaVolta, "partida"), horarioVolta: null,
      }, "volta", { faixaIda: null, faixaVolta, trechoDireto: false, alternativas });
    }
  }
  return { rotas: Array.from(rotas.values()), faltando, aeroportosSugeridos };
}

/** Quantas consultas a busca vai gastar: as rotas que ainda não estão no cache. */
export function consultasPrevistas(chaves: readonly string[], emCache: ReadonlySet<string>): number {
  return new Set(chaves.filter((c) => !emCache.has(c))).size;
}

// ── Datas flexíveis (±1 dia) ───────────────────────────────────────────────

export interface VarianteDeData {
  consulta: ConsultaDePassagens;
  chave: string;
  /** Dias deslocados na ida / na volta. */
  deslocamento: { ida: number; volta: number };
  /** Diárias a mais (+) ou a menos (−) por chegar antes/sair depois. */
  diarias: number;
  rotulo: string;
}

/**
 * "Datas flexíveis (±1 dia)" — botão à parte, até 2 consultas por rota:
 *  - só ida: um dia antes (+1 diária) e um dia depois (−1 diária, chega depois do sugerido);
 *  - só volta: um dia antes (−1 diária) e um dia depois (+1 diária);
 *  - ida e volta: chegar um dia antes e voltar um dia depois (+1 diária cada).
 * Data que já passou fica fora (custa menos).
 */
export function variantesDeData(rota: ConsultaDePassagens, hoje: string): VarianteDeData[] {
  const opcoes: Array<{ ida: number; volta: number; diarias: number; rotulo: string }> =
    rota.perna === "ida" ? [
      { ida: -1, volta: 0, diarias: 1, rotulo: "1 dia antes" },
      { ida: 1, volta: 0, diarias: -1, rotulo: "1 dia depois" },
    ] : rota.perna === "volta" ? [
      { ida: -1, volta: 0, diarias: -1, rotulo: "1 dia antes" },
      { ida: 1, volta: 0, diarias: 1, rotulo: "1 dia depois" },
    ] : [
      { ida: -1, volta: 0, diarias: 1, rotulo: "Ida 1 dia antes" },
      { ida: 0, volta: 1, diarias: 1, rotulo: "Volta 1 dia depois" },
    ];
  const out: VarianteDeData[] = [];
  for (const o of opcoes) {
    const dataIda = somarDiasISO(rota.dataIda, o.ida);
    const dataVolta = rota.dataVolta ? somarDiasISO(rota.dataVolta, o.volta) : null;
    if (dataIda < hoje) continue;
    const consulta: ConsultaDePassagens = { ...pick(rota), dataIda, dataVolta };
    out.push({ consulta, chave: chaveDaConsulta(consulta), deslocamento: { ida: o.ida, volta: o.volta }, diarias: o.diarias, rotulo: o.rotulo });
  }
  return out;
}

/** Só os campos do pedido (sem vagas/faixas da rota). */
export function pick(r: ConsultaDePassagens): ConsultaDePassagens {
  return {
    perna: r.perna, origem: r.origem, destino: r.destino, dataIda: r.dataIda, dataVolta: r.dataVolta,
    maxParadas: r.maxParadas, horarioIda: r.horarioIda, horarioVolta: r.horarioVolta,
  };
}

// ── Aeroportos alternativos (09/10) ────────────────────────────────────────

export interface VarianteDeAeroporto {
  consulta: ConsultaDePassagens;
  chave: string;
  /** Qual ponta troca: a de casa ou a do evento. */
  lado: "casa" | "evento";
  iata: string;
  /** "Sair de CGH", "Chegar em CGH", "Evento por SDU". */
  rotulo: string;
}

/**
 * "Testar CGH/VCP em vez de GRU" — uma consulta por aeroporto alternativo, a
 * MESMA que a busca faria se a pessoa escolhesse aquele aeroporto (mesma
 * chave → depois de testada, trocar não gasta nada). Casa: a ponta de casa
 * da rota (origem da ida / destino da volta); evento: a outra ponta.
 */
export function variantesDeAeroporto(rota: RotaPlanejada): VarianteDeAeroporto[] {
  const out: VarianteDeAeroporto[] = [];
  const base = pick(rota);
  const casaNaOrigem = rota.perna !== "volta";
  if (!rota.trechoDireto) {
    for (const iata of rota.alternativasDeCasa) {
      const consulta = casaNaOrigem ? { ...base, origem: iata } : { ...base, destino: iata };
      if (consulta.origem === consulta.destino) continue;
      out.push({ consulta, chave: chaveDaConsulta(consulta), lado: "casa", iata, rotulo: rota.perna === "volta" ? `Chegar em ${iata}` : `Sair de ${iata}` });
    }
  }
  for (const iata of rota.alternativasDoEvento) {
    const consulta = casaNaOrigem ? { ...base, destino: iata } : { ...base, origem: iata };
    if (consulta.origem === consulta.destino) continue;
    out.push({ consulta, chave: chaveDaConsulta(consulta), lado: "evento", iata, rotulo: `Evento por ${iata}` });
  }
  return out;
}

/** A rota tem janela de horário no pedido (a consulta vai filtrada)? */
export const temFiltroDeHorario = (r: Pick<ConsultaDePassagens, "horarioIda" | "horarioVolta">) => !!(r.horarioIda || r.horarioVolta);

/** Os campos de uma chave (`chaveDaConsulta`) — para ligar histórico, uso e vaga pela rota/data. */
export function lerChave(chave: string): Pick<ConsultaDePassagens, "perna" | "origem" | "destino" | "dataIda" | "dataVolta"> | null {
  const [perna, trecho, dataIda, dataVolta] = String(chave ?? "").split("|");
  const m = /^([A-Z]{3})>([A-Z]{3})$/.exec(trecho ?? "");
  if (!m || (perna !== "ida" && perna !== "volta" && perna !== "ida_e_volta") || !/^\d{4}-\d{2}-\d{2}$/.test(dataIda ?? "")) return null;
  return { perna, origem: m[1], destino: m[2], dataIda, dataVolta: /^\d{4}-\d{2}-\d{2}$/.test(dataVolta ?? "") ? dataVolta : null };
}

// ── Resultado normalizado e custo total ────────────────────────────────────

export interface SegmentoDeVoo {
  companhia: string;
  numero: string;
  operadaPor?: string | null;
  origem: string;
  destino: string;
  /** Hora local do aeroporto, "AAAA-MM-DDTHH:MM". */
  partida: string;
  chegada: string;
  duracaoMin?: number | null;
}

export interface PernaDeVoo {
  companhia: string;
  duracaoMin: number | null;
  segmentos: SegmentoDeVoo[];
}

export interface ItinerarioDeVoo {
  /** Id do fornecedor (pede o link de compra). */
  id: string;
  precoCentavos: number;
  moeda: string;
  /** 1 perna (só ida / só volta) ou 2 (ida e volta). */
  pernas: PernaDeVoo[];
  bagagem?: { mao: number | null; despachada: number | null } | null;
  trocaDeCompanhia?: boolean;
}

export interface ResultadoDaConsulta {
  itinerarios: ItinerarioDeVoo[];
  /** Quando o fornecedor viu esses preços (ISO), se informado. */
  observadoEm: string | null;
}

export type TipoDeSelo =
  | "no_horario" | "fora_do_horario" | "diaria_extra" | "diaria_a_menos" | "conexao_longa" | "viagem_longa" | "troca_de_cia" | "menor_custo"
  | "mala_inclusa" | "mala_extra";

export interface Selo { tipo: TipoDeSelo; texto: string }

export interface OpcaoAvaliada {
  itinerario: ItinerarioDeVoo;
  /** Preço + diárias a mais (quando o valor da diária é conhecido). */
  custoTotalCentavos: number;
  diarias: number;
  /** A volta sai a partir das 18h (regra do Espelho). */
  diariaExtraNaVolta: boolean;
  chegaNoHorario: boolean | null;
  saiNoHorario: boolean | null;
  paradas: number;
  duracaoMin: number | null;
  maiorConexaoMin: number;
  absurda: boolean;
  /** 0 = boa, 1 = fora do horário sugerido, 2 = absurda (fim da lista). */
  grupo: 0 | 1 | 2;
  selos: Selo[];
  /**
   * Mala de quem despacha (09/10): 0 quando a tarifa já inclui; o valor
   * estimado × pernas quando não inclui (entra no custo total); null quando
   * nenhuma vaga da rota despacha.
   */
  malaCentavos: number | null;
}

/** Contexto do custo total de uma opção. */
export interface ContextoDaOpcao {
  diariaCentavos?: number | null;
  diariasDaData?: number;
  /** Valor estimado de UMA mala despachada por perna; só quando alguém da rota despacha. */
  malaCentavos?: number | null;
}

/** "R$ 150" — reais inteiros, para os selos. */
export const reaisInteiros = (centavos: number) => `R$ ${Math.round(centavos / 100).toLocaleString("pt-BR")}`;

const hhmmDe = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const horaCurta = (min: number) => (min % 60 === 0 ? `${Math.floor(min / 60)}h` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`);

/**
 * "Sai 17:45 — antes do sugerido 18h" / "Chega 15:10 — depois do sugerido
 * 14h": a opção fora da janela diz QUANTO e PARA ONDE está fora (dono, 09/10:
 * marcar em vez de esconder quando a busca vai sem o horário).
 */
export function textoForaDoHorario(verbo: "Chega" | "Sai" | "Volta sai", minuto: number, f: Faixa): string {
  const hora = hhmmDe(minuto);
  if (f.desde !== null && minuto < f.desde) return `${verbo} ${hora} — antes do sugerido ${f.ate === null ? horaCurta(f.desde) : faixaEmTexto(f)}`;
  if (f.ate !== null && minuto > f.ate) return `${verbo} ${hora} — depois do sugerido ${f.desde === null ? horaCurta(f.ate) : faixaEmTexto(f)}`;
  return `${verbo} ${hora} — fora do horário sugerido`;
}

/** "AAAA-MM-DDTHH:MM" → minutos desde 00:00 daquele dia. */
export function minutoDoDia(iso: string): number | null {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutos entre dois horários locais (mesmo aeroporto → mesmo fuso). */
function minutosEntre(a: string, b: string): number | null {
  const pa = Date.parse(`${a.slice(0, 16)}:00Z`), pb = Date.parse(`${b.slice(0, 16)}:00Z`);
  return Number.isFinite(pa) && Number.isFinite(pb) ? Math.round((pb - pa) / 60000) : null;
}

const dentro = (min: number | null, f: Faixa | null): boolean | null => {
  if (!f || min === null) return null;
  return (f.desde === null || min >= f.desde) && (f.ate === null || min <= f.ate);
};

/** "3h25", "45min". */
export function duracaoEmTexto(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** As pernas da opção, pelo papel de cada uma na rota. */
export function pernasDaOpcao(it: ItinerarioDeVoo, perna: PernaDaRota): { ida: PernaDeVoo | null; volta: PernaDeVoo | null } {
  if (perna === "volta") return { ida: null, volta: it.pernas[0] ?? null };
  if (perna === "ida") return { ida: it.pernas[0] ?? null, volta: null };
  return { ida: it.pernas[0] ?? null, volta: it.pernas[1] ?? null };
}

/**
 * Avalia uma opção: custo total, selos e o grupo de ordenação. `diarias` da
 * data (datas flexíveis) somam com a diária extra da volta noturna.
 */
export function avaliarOpcao(
  it: ItinerarioDeVoo,
  rota: Pick<RotaPlanejada, "perna" | "faixaIda" | "faixaVolta">,
  ctx: ContextoDaOpcao = {},
): OpcaoAvaliada {
  const { ida, volta } = pernasDaOpcao(it, rota.perna);
  const selos: Selo[] = [];
  const ultimaChegadaIda = ida ? ida.segmentos[ida.segmentos.length - 1] : null;
  const primeiraPartidaIda = ida?.segmentos[0] ?? null;
  // Chegada no dia seguinte à partida nunca está "dentro" de uma janela com teto.
  const chegaDiaSeguinte = !!(ultimaChegadaIda && primeiraPartidaIda && ultimaChegadaIda.chegada.slice(0, 10) > primeiraPartidaIda.partida.slice(0, 10));
  let chegaNoHorario = ultimaChegadaIda ? dentro(minutoDoDia(ultimaChegadaIda.chegada), rota.faixaIda) : null;
  if (chegaNoHorario && chegaDiaSeguinte && rota.faixaIda?.ate !== null) chegaNoHorario = false;
  const partidaVolta = volta?.segmentos[0] ?? null;
  const minPartidaVolta = partidaVolta ? minutoDoDia(partidaVolta.partida) : null;
  const saiNoHorario = partidaVolta ? dentro(minPartidaVolta, rota.faixaVolta) : null;
  const diariaExtraNaVolta = minPartidaVolta !== null && minPartidaVolta >= HORA_DA_VOLTA_COM_DIARIA_EXTRA;
  const diarias = (diariaExtraNaVolta ? 1 : 0) + (ctx.diariasDaData ?? 0);
  const diaria = ctx.diariaCentavos && ctx.diariaCentavos > 0 ? ctx.diariaCentavos : null;
  const pernas = [ida, volta].filter((p): p is PernaDeVoo => !!p);
  // Mala: a tarifa já inclui (bagagem despachada ≥ 1) ou soma a estimativa por perna.
  const malaPorPerna = ctx.malaCentavos && ctx.malaCentavos > 0 ? ctx.malaCentavos : null;
  const malaInclusa = (it.bagagem?.despachada ?? 0) >= 1;
  const malaCentavos = malaPorPerna === null ? null : malaInclusa ? 0 : malaPorPerna * Math.max(1, pernas.length);
  const custoTotalCentavos = it.precoCentavos + (diaria ? diarias * diaria : 0) + (malaCentavos ?? 0);

  const paradas = Math.max(0, ...pernas.map((p) => p.segmentos.length - 1));
  const duracoes = pernas.map((p) => p.duracaoMin);
  const duracaoMin = duracoes.every((d) => typeof d === "number") ? (duracoes as number[]).reduce((s, d) => s + d, 0) : null;
  let maiorConexaoMin = 0;
  for (const p of pernas) {
    for (let i = 1; i < p.segmentos.length; i++) {
      const espera = minutosEntre(p.segmentos[i - 1].chegada, p.segmentos[i].partida);
      if (espera !== null && espera > maiorConexaoMin) maiorConexaoMin = espera;
    }
  }
  const pernaLonga = pernas.some((p) => (p.duracaoMin ?? 0) > PERNA_ABSURDA_MIN);
  const absurda = paradas >= 2 || pernaLonga || maiorConexaoMin >= CONEXAO_ABSURDA_MIN || !!it.trocaDeCompanhia;

  if (chegaNoHorario === true || saiNoHorario === true) {
    if (chegaNoHorario !== false && saiNoHorario !== false) {
      selos.push({ tipo: "no_horario", texto: rota.perna === "volta" ? "Sai no horário sugerido" : "Chega no horário sugerido" });
    }
  }
  if (chegaNoHorario === false) {
    const min = ultimaChegadaIda ? minutoDoDia(ultimaChegadaIda.chegada) : null;
    selos.push({
      tipo: "fora_do_horario",
      texto: chegaDiaSeguinte
        ? `Chega no dia seguinte${min !== null ? ` (${hhmmDe(min)})` : ""}`
        : min !== null && rota.faixaIda ? textoForaDoHorario("Chega", min, rota.faixaIda) : "Chega fora do horário sugerido",
    });
  }
  if (saiNoHorario === false) {
    selos.push({
      tipo: "fora_do_horario",
      texto: minPartidaVolta !== null && rota.faixaVolta
        ? textoForaDoHorario(rota.perna === "volta" ? "Sai" : "Volta sai", minPartidaVolta, rota.faixaVolta)
        : "Volta fora do horário sugerido",
    });
  }
  if (diarias > 0) selos.push({ tipo: "diaria_extra", texto: diarias === 1 ? "+1 diária" : `+${diarias} diárias` });
  if (diarias < 0) selos.push({ tipo: "diaria_a_menos", texto: diarias === -1 ? "−1 diária" : `${diarias} diárias` });
  if (maiorConexaoMin >= CONEXAO_LONGA_MIN) selos.push({ tipo: "conexao_longa", texto: `Conexão longa (${duracaoEmTexto(maiorConexaoMin)})` });
  if (pernaLonga || paradas >= 2) {
    const maisLonga = Math.max(...pernas.map((p) => p.duracaoMin ?? 0));
    selos.push({ tipo: "viagem_longa", texto: paradas >= 2 ? `${paradas} conexões${maisLonga ? ` · ${duracaoEmTexto(maisLonga)}` : ""}` : `Viagem longa (${duracaoEmTexto(maisLonga)})` });
  }
  if (it.trocaDeCompanhia) selos.push({ tipo: "troca_de_cia", texto: "Troca de companhia por conta própria" });
  if (malaCentavos === 0) selos.push({ tipo: "mala_inclusa", texto: "Inclui mala" });
  else if (malaCentavos !== null) selos.push({ tipo: "mala_extra", texto: `+${reaisInteiros(malaCentavos)} de mala` });

  const grupo: 0 | 1 | 2 = absurda ? 2 : chegaNoHorario === false || saiNoHorario === false ? 1 : 0;
  return { itinerario: it, custoTotalCentavos, diarias, diariaExtraNaVolta, chegaNoHorario, saiNoHorario, paradas, duracaoMin, maiorConexaoMin, absurda, grupo, selos, malaCentavos };
}

/**
 * Opções em ordem de decisão: as boas primeiro, depois as fora do horário,
 * as absurdas no fim; dentro de cada grupo, pelo CUSTO TOTAL e depois pela
 * duração. A primeira opção do grupo bom ganha o selo "menor custo".
 */
export function ordenarOpcoes(
  itinerarios: readonly ItinerarioDeVoo[],
  rota: Pick<RotaPlanejada, "perna" | "faixaIda" | "faixaVolta">,
  ctx: ContextoDaOpcao = {},
): OpcaoAvaliada[] {
  const avaliadas = itinerarios
    .filter((it) => Number.isFinite(it.precoCentavos) && it.precoCentavos > 0 && it.pernas.length > 0)
    .map((it) => avaliarOpcao(it, rota, ctx))
    .sort((a, b) => a.grupo - b.grupo || a.custoTotalCentavos - b.custoTotalCentavos || (a.duracaoMin ?? 9e9) - (b.duracaoMin ?? 9e9));
  const melhor = avaliadas[0];
  if (melhor && melhor.grupo < 2) melhor.selos.unshift({ tipo: "menor_custo", texto: "Menor custo total" });
  return avaliadas;
}

/** "LA 3456 + LA 3210" — os voos de uma perna. */
export function voosDaPerna(p: PernaDeVoo | null | undefined): string {
  return (p?.segmentos ?? []).map((s) => `${s.companhia} ${s.numero}`).join(" + ");
}

/** Nome da companhia da perna ("LATAM"); mistura vira "LATAM / GOL". */
export function companhiaDaPerna(p: PernaDeVoo | null | undefined): string {
  const nomes = Array.from(new Set((p?.segmentos ?? []).map((s) => NOME_DA_CIA[s.companhia] ?? s.companhia)));
  return nomes.join(" / ") || (p ? NOME_DA_CIA[p.companhia] ?? p.companhia : "");
}

/** Primeiro dia do mês de `hoje` ("AAAA-MM-01"). */
export const inicioDoMes = (hoje: string) => `${hoje.slice(0, 7)}-01`;

// ── Contrato da API (servidor ↔ tela) ──────────────────────────────────────

/** Uma vaga do pedido, com os ajustes feitos na tela. */
export interface VagaDoPedido { id: string; ajuste?: AjusteDaBusca }

/**
 * POST /api/busca-de-passagens. Sem nenhuma lista de permissão, a resposta é
 * a PRÉVIA: rotas, o que falta e o que já está no cache (de graça). Só gasta
 * consulta o que vier autorizado:
 *  - `consultar`: chaves que a pessoa viu na prévia e mandou buscar;
 *  - `consultarVagas`: rotas destas vagas (ex.: "Tentar com 2 conexões" e a
 *    troca de aeroporto, que mudam a chave);
 *  - `atualizar`: chaves a reconsultar mesmo com cache ("Atualizar");
 *  - `flex`: rotas cujas datas vizinhas (±1 dia) a pessoa pediu agora;
 *  - `alternativas`: rotas cujos aeroportos alternativos a pessoa mandou testar.
 * `mostrarFlex`/`mostrarAlternativas` só devolvem o que já está no cache.
 */
export interface PedidoDaBusca {
  vagas: VagaDoPedido[];
  consultar?: string[];
  consultarVagas?: string[];
  atualizar?: string[];
  flex?: string[];
  mostrarFlex?: string[];
  alternativas?: string[];
  mostrarAlternativas?: string[];
}

export interface ResultadoNaTela extends ResultadoDaConsulta {
  /** ISO de quando o app consultou (cache compartilhado). */
  consultadoEm: string;
  /** Veio do cache (não gastou agora). */
  doCache: boolean;
}

export interface ErroNaRota { codigo: string; mensagem: string }

export interface VarianteNaTela {
  chave: string;
  rotulo: string;
  diarias: number;
  dataIda: string;
  dataVolta: string | null;
  resultado: ResultadoNaTela | null;
  erro: ErroNaRota | null;
}

export interface RotaNaTela extends RotaPlanejada {
  resultado: ResultadoNaTela | null;
  erro: ErroNaRota | null;
  /** Diária média de hotel do evento (centavos), se conhecida. */
  diariaCentavos: number | null;
  /** Datas vizinhas já consultadas (null = não pedidas). */
  variantes: VarianteNaTela[] | null;
  /** Quantas consultas "Datas flexíveis" gastaria agora (as que não estão no cache). */
  consultasDoFlex: number;
  /** Aeroportos alternativos já testados (null = não pedidos). */
  alternativas?: AlternativaNaTela[] | null;
  /** Quantas consultas "Testar aeroportos alternativos" gastaria agora. */
  consultasDasAlternativas?: number;
  /** Mala estimada por perna (centavos) quando alguém da rota despacha; null quando ninguém. */
  malaCentavos?: number | null;
}

export interface AlternativaNaTela {
  chave: string;
  lado: "casa" | "evento";
  iata: string;
  rotulo: string;
  resultado: ResultadoNaTela | null;
  erro: ErroNaRota | null;
}

export interface ConsumoDaBusca {
  usadas: number;
  teto: number;
  /** null = busca não configurada (produção sem a chave). */
  fornecedor: { nome: string; simulado: boolean } | null;
  cacheHoras: number;
}

export interface RespostaDaBusca {
  rotas: RotaNaTela[];
  faltando: DadoFaltando[];
  /** Consultas de verdade feitas neste pedido. */
  gastou: number;
  consumo: ConsumoDaBusca;
}

/** Situação do teto para a tela: "ok", "alerta" (≥ 80%) ou "atingido". */
export function situacaoDoTeto(usadas: number, teto: number): "ok" | "alerta" | "atingido" {
  if (usadas >= teto) return "atingido";
  return teto > 0 && usadas >= teto * ALERTA_DO_TETO ? "alerta" : "ok";
}
