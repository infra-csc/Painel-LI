/**
 * LOGÍSTICA NO QUADRO DA ESCALA (23/10 — print do dono, Troféu Brasil 2026 -
 * 4ª etapa: "aqui poderia ter informações de logística"; depois: "e também,
 * além da logística, horários e tudo mais da passagem").
 *
 * O quadro função × dia da Escalação dizia quantas pessoas trabalham em cada
 * dia, mas não se elas já têm como chegar, onde dormem e a que horas chegam.
 * Esta regra responde, por vaga, por função e por dia:
 *
 *  - PASSAGEM: quem precisa de bilhete (aéreo ou rodoviário) e quem já tem.
 *    "Precisa" = a vaga pede transporte (`needsTicket`) e tem alguma perna que
 *    NÃO vai de carro/van. "Tem" = passagem viva — a mesma regra do servidor
 *    (server/vaga-guards.ts → passagemConta: existe e não está cancelada; a de
 *    histórico de troca, `archivedAt`, não é a passagem atual).
 *  - CARRO/VAN: as pernas que vão por terra — registradas em
 *    `transportes_terrestres` ou indicadas pela Sugestão como carro/van
 *    (`sugestaoTerrestreDaVaga`). "Tem" = todas essas pernas registradas.
 *    Ônibus indicado é passagem rodoviária (comprada como passagem), como em
 *    shared/carimbo-sem-passagem.ts; perna que a passagem já cobre não é
 *    terrestre.
 *  - HOTEL: `needsAccommodation` × hospedagem com hotel e não cancelada (a
 *    mesma regra das Análises da Escalação e do servidor → hospedagemConta).
 *  - SEM NOME: vaga sem colaborador e sem empreita — trava toda a logística.
 *
 * E os HORÁRIOS: a chegada ao evento sai da ida da passagem (a hora de
 * chegada; sem ela, a de partida), a saída sai da volta (a hora de partida —
 * é o Uber/transfer para o aeroporto). Sem passagem, vale a Sugestão da
 * escala, marcada como sugestão. Quem segue direto para outro evento sai pela
 * ida da passagem da vaga seguinte (`idaVemDeInclusionId`).
 *
 * Hotel por noite: a noite de D vai de D a D+1 (como em ocupacao-por-noite) —
 * quem entra dia 9 e sai dia 14 dorme as noites 9 a 13.
 *
 * Quem chama decide o recorte (evento, função, período, excluídas). Vaga
 * cancelada não entra — como no quadro.
 */
import type { Accommodation, TeamInclusion, Ticket } from "./schema";
import { vagaComEmpreita } from "./cenotecnica-empreita";
import { diaDe, horaDe, passagemTemIda, passagemTemVolta, somarDiasISO } from "./janela-de-viagem";
import { passagemSoComCarimbo } from "./passagem-so-com-carimbo";
import { parseHoraMin } from "./atendimento";
import {
  coberturaTerrestre,
  ehModoDeRegistro,
  pernasDaVaga,
  sugestaoTerrestreDaVaga,
  type ModoTerrestre,
  type PernaDaViagem,
  type TrechoTerrestre,
} from "./transporte-terrestre";

// ── Entradas ──────────────────────────────────────────────────────────────

export type VagaDaEscala = Pick<TeamInclusion, "id" | "functionId" | "status"> & Partial<Pick<TeamInclusion,
  | "inclusionNumber" | "collaboratorId" | "empreitaEmpresa" | "needsTicket" | "needsAccommodation"
  | "flightDepartureDate" | "flightDepartureSuggestedTime" | "flightArrivalSuggestedTime"
  | "flightReturnDate" | "flightReturnSuggestedTime" | "transportModeIda" | "transportModeVolta"
  | "trechosSugeridos" | "voltaSegueParaEventoId" | "deletedAt"
>>;

export type PassagemDaEscala = Partial<Ticket>;
export type HospedagemDaEscala = Partial<Accommodation>;

export interface FontesDaLogistica {
  /** Passagens da vaga (as atuais; a de histórico é ignorada aqui também). */
  passagensDe: (vagaId: string) => readonly PassagemDaEscala[];
  /** A passagem de OUTRA vaga cuja ida sai do evento desta (trecho direto). */
  passagemQueSaiDe?: (vagaId: string) => PassagemDaEscala | undefined;
  hospedagensDe: (vagaId: string) => readonly HospedagemDaEscala[];
  terrestresDe: (vagaId: string) => readonly TrechoTerrestre[];
}

// ── Regras de "tem" ───────────────────────────────────────────────────────

/** Passagem atual e viva (server/vaga-guards.ts → passagemConta, sem as de histórico). */
export const passagemViva = (t: PassagemDaEscala | null | undefined): boolean =>
  !!t && !t.archivedAt && t.ticketStatus !== "cancelada";

/** Hospedagem com hotel e não cancelada (server/vaga-guards.ts → hospedagemConta). */
export const hospedagemViva = (a: HospedagemDaEscala | null | undefined): boolean =>
  !!a && !!(a.hotelName && String(a.hotelName).trim()) && a.hotelStatus !== "cancelada";

export type SituacaoDaPassagem = "emitida" | "comprada" | "so_carimbo" | "registrada" | "cancelada";

export const ROTULO_DA_SITUACAO: Record<SituacaoDaPassagem, string> = {
  emitida: "Emitida",
  comprada: "Comprada",
  so_carimbo: "Marcada como emitida · sem dados",
  registrada: "Registrada · sem data de compra",
  cancelada: "Cancelada",
};

export function situacaoDaPassagem(t: PassagemDaEscala | null | undefined): SituacaoDaPassagem | null {
  if (!t || t.archivedAt) return null;
  if (t.ticketStatus === "cancelada") return "cancelada";
  if (passagemSoComCarimbo(t)) return "so_carimbo";
  if (t.emittedAt) return "emitida";
  if (t.purchaseDate) return "comprada";
  return "registrada";
}

// ── Horários ──────────────────────────────────────────────────────────────

export type FonteDoHorario = "passagem" | "sugestao";
export type ModoDoMovimento = "aereo" | "rodoviario" | ModoTerrestre;

export interface Movimento {
  vagaId: string;
  tipo: "chegada" | "saida";
  /** Dia do movimento (chegada ao evento / saída do evento). */
  dia: string;
  /** "HH:MM" que ordena e agrupa: a chegada (ida) ou a partida (volta). Null = sem hora. */
  hora: string | null;
  fonte: FonteDoHorario;
  modo: ModoDoMovimento | null;
  /** Horário de partida e de chegada do trecho, quando a passagem tem. */
  partida: string | null;
  chegada: string | null;
  /** Origem → destino: aeroporto/rodoviária (ou a cidade, sem ele). */
  de: string | null;
  para: string | null;
  cidadeDe: string | null;
  cidadePara: string | null;
  companhia: string | null;
  /** Texto livre da Sugestão ("chegar até 14h", "van - 20h"), quando a fonte é ela. */
  textoDaSugestao: string | null;
  /** A saída é a ida da vaga seguinte (segue direto para outro evento). */
  segueParaOutroEvento: boolean;
}

const tipoDaPassagem = (t: PassagemDaEscala): ModoDoMovimento => {
  const tipo = String(t.transportType ?? "").toLowerCase();
  if (tipo === "rodoviario") return "rodoviario";
  if (tipo === "van") return "van";
  return "aereo";
};

const textoOuNull = (v: string | null | undefined): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

/** "14h", "chegar até 9h30", "van - 07:15" → "14:00", "09:30", "07:15". */
export function horaDaSugestao(texto: string | null | undefined): string | null {
  const min = parseHoraMin(texto);
  if (min === null) return null;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function chegadaDaPassagem(v: VagaDaEscala, t: PassagemDaEscala): Movimento | null {
  const dia = diaDe(t.actualDepartureDate);
  if (!dia) return null;
  const partida = horaDe(t.actualDepartureTime);
  const chegada = horaDe(t.actualArrivalTime);
  return {
    vagaId: v.id, tipo: "chegada",
    // Chegada "antes" da partida = chega no dia seguinte (voo noturno).
    dia: partida && chegada && chegada < partida ? somarDiasISO(dia, 1) : dia,
    hora: chegada ?? partida, fonte: "passagem", modo: tipoDaPassagem(t), partida, chegada,
    de: textoOuNull(t.departureAirport) ?? textoOuNull(t.departureCityOrigin),
    para: textoOuNull(t.destinationAirport) ?? textoOuNull(t.departureCityDestination),
    cidadeDe: textoOuNull(t.departureCityOrigin), cidadePara: textoOuNull(t.departureCityDestination),
    companhia: textoOuNull(t.ticketCompany), textoDaSugestao: null, segueParaOutroEvento: false,
  };
}

function saidaDaPassagem(v: VagaDaEscala, t: PassagemDaEscala): Movimento | null {
  const dia = diaDe(t.actualReturnDate);
  if (!dia) return null;
  const partida = horaDe(t.actualReturnTime);
  const chegada = horaDe(t.returnArrivalTime);
  return {
    vagaId: v.id, tipo: "saida", dia, hora: partida ?? chegada, fonte: "passagem", modo: tipoDaPassagem(t), partida, chegada,
    de: textoOuNull(t.returnOriginAirport) ?? textoOuNull(t.returnCityOrigin),
    para: textoOuNull(t.returnDestinationAirport) ?? textoOuNull(t.returnCityDestination),
    cidadeDe: textoOuNull(t.returnCityOrigin), cidadePara: textoOuNull(t.returnCityDestination),
    companhia: textoOuNull(t.ticketCompany), textoDaSugestao: null, segueParaOutroEvento: false,
  };
}

/** A ida da vaga seguinte, lida como a SAÍDA desta (trecho direto). */
function saidaPelaVagaSeguinte(v: VagaDaEscala, t: PassagemDaEscala): Movimento | null {
  const dia = diaDe(t.actualDepartureDate);
  if (!dia) return null;
  const partida = horaDe(t.actualDepartureTime);
  const chegada = horaDe(t.actualArrivalTime);
  return {
    vagaId: v.id, tipo: "saida", dia, hora: partida ?? chegada, fonte: "passagem", modo: tipoDaPassagem(t), partida, chegada,
    de: textoOuNull(t.departureAirport) ?? textoOuNull(t.departureCityOrigin),
    para: textoOuNull(t.destinationAirport) ?? textoOuNull(t.departureCityDestination),
    cidadeDe: textoOuNull(t.departureCityOrigin), cidadePara: textoOuNull(t.departureCityDestination),
    companhia: textoOuNull(t.ticketCompany), textoDaSugestao: null, segueParaOutroEvento: true,
  };
}

function movimentoDaSugestao(
  v: VagaDaEscala, tipo: "chegada" | "saida", dia: string | null, textos: Array<string | null | undefined>,
  modo: ModoDoMovimento | null, registro: TrechoTerrestre | undefined,
): Movimento | null {
  if (!dia) return null;
  const texto = textos.map(textoOuNull).find(Boolean) ?? null;
  return {
    vagaId: v.id, tipo, dia, hora: horaDaSugestao(texto), fonte: "sugestao", modo,
    partida: null, chegada: null, de: null, para: null, cidadeDe: null, cidadePara: null,
    companhia: registro?.empresa ? registro.empresa : null, textoDaSugestao: texto, segueParaOutroEvento: false,
  };
}

// ── Por vaga ──────────────────────────────────────────────────────────────

export type EstadoDoItem = "nao_precisa" | "falta" | "tem";

export interface LogisticaDaVagaNaEscala {
  vagaId: string;
  functionId: string;
  semNome: boolean;
  /** A vaga viaja (pede transporte, ou já tem passagem/terrestre). */
  viaja: boolean;
  passagem: EstadoDoItem;
  /** A passagem atual (a viva; sem ela, a cancelada — para o detalhe dizer). */
  passagemAtual: PassagemDaEscala | null;
  situacao: SituacaoDaPassagem | null;
  /** Pernas que pedem bilhete. */
  pernasDePassagem: PernaDaViagem[];
  terrestre: EstadoDoItem;
  /** Pernas que vão por terra (registradas ou indicadas) e o registro de cada uma. */
  pernasTerrestres: PernaDaViagem[];
  terrestrePorPerna: Partial<Record<PernaDaViagem, TrechoTerrestre>>;
  /** Modo indicado pela Sugestão, por perna (inclui ônibus). */
  indicado: Partial<Record<PernaDaViagem, ModoTerrestre>>;
  hotel: EstadoDoItem;
  hospedagem: HospedagemDaEscala | null;
  /** Noites no hotel (a noite de D vai de D a D+1). */
  noites: string[];
  chegada: Movimento | null;
  saida: Movimento | null;
}

export const vagaCancelada = (v: Pick<VagaDaEscala, "status">): boolean => v.status === "cancelado";

export function logisticaDaVagaNaEscala(v: VagaDaEscala, fontes: FontesDaLogistica): LogisticaDaVagaNaEscala {
  const passagens = fontes.passagensDe(v.id).filter((t) => !t.archivedAt);
  const viva = passagens.find(passagemViva) ?? null;
  const passagemAtual = viva ?? passagens[0] ?? null;
  const registros = fontes.terrestresDe(v.id);
  const hospedagens = fontes.hospedagensDe(v.id);
  const hospedagem = hospedagens.find(hospedagemViva) ?? null;

  const pernas = pernasDaVaga(v);
  const cobertura = coberturaTerrestre(v, registros);
  const indicado = sugestaoTerrestreDaVaga(v);
  const pernaNaPassagem = (p: PernaDaViagem) => (p === "ida" ? passagemTemIda(viva) : passagemTemVolta(viva));
  // Perna terrestre: registrada (qualquer modo gravado) ou indicada como carro/van
  // e ainda não coberta pela passagem.
  const pernasTerrestres = pernas.filter((p) => !!cobertura.porPerna[p] || (ehModoDeRegistro(indicado[p]) && !pernaNaPassagem(p)));
  const pernasDePassagem = pernas.filter((p) => !pernasTerrestres.includes(p));

  const pedeTransporte = !!v.needsTicket;
  const precisaPassagem = (pedeTransporte && pernasDePassagem.length > 0) || !!viva;
  const passagem: EstadoDoItem = !precisaPassagem ? "nao_precisa" : viva ? "tem" : "falta";

  const precisaTerrestre = (pedeTransporte && pernasTerrestres.length > 0) || registros.length > 0;
  const terrestre: EstadoDoItem = !precisaTerrestre ? "nao_precisa"
    : pernasTerrestres.length > 0 && pernasTerrestres.every((p) => !!cobertura.porPerna[p]) ? "tem" : "falta";

  const precisaHotel = !!v.needsAccommodation || !!hospedagem;
  const hotel: EstadoDoItem = !precisaHotel ? "nao_precisa" : hospedagem ? "tem" : "falta";

  const viaja = pedeTransporte || !!viva || registros.length > 0;

  // Chegada: a ida da passagem; sem ela, a Sugestão (com o modo da perna).
  let chegada: Movimento | null = null;
  let saida: Movimento | null = null;
  if (viaja) {
    chegada = (viva && passagemTemIda(viva) ? chegadaDaPassagem(v, viva) : null)
      ?? (pernas.includes("ida")
        ? movimentoDaSugestao(
          v, "chegada", diaDe(v.flightDepartureDate),
          [v.flightArrivalSuggestedTime, v.flightDepartureSuggestedTime],
          cobertura.porPerna.ida?.modo ?? indicado.ida ?? null, cobertura.porPerna.ida,
        )
        : null);
    const seguinte = fontes.passagemQueSaiDe?.(v.id);
    saida = (viva && passagemTemVolta(viva) ? saidaDaPassagem(v, viva) : null)
      ?? (seguinte && passagemViva(seguinte) ? saidaPelaVagaSeguinte(v, seguinte) : null)
      ?? (pernas.includes("volta")
        ? movimentoDaSugestao(
          v, "saida", diaDe(v.flightReturnDate), [v.flightReturnSuggestedTime],
          cobertura.porPerna.volta?.modo ?? indicado.volta ?? null, cobertura.porPerna.volta,
        )
        : null);
  }

  return {
    vagaId: v.id, functionId: v.functionId,
    semNome: !v.collaboratorId && !vagaComEmpreita(v),
    viaja, passagem, passagemAtual, situacao: situacaoDaPassagem(passagemAtual), pernasDePassagem,
    terrestre, pernasTerrestres, terrestrePorPerna: cobertura.porPerna, indicado,
    hotel, hospedagem, noites: noitesDaHospedagem(hospedagem),
    chegada, saida,
  };
}

/** Noites da hospedagem: de check-in (inclusive) a check-out (exclusive). Teto de 60. */
export function noitesDaHospedagem(a: HospedagemDaEscala | null | undefined): string[] {
  const ini = diaDe(a?.checkInDate);
  const fim = diaDe(a?.checkOutDate);
  if (!ini || !fim || fim <= ini) return [];
  const out: string[] = [];
  for (let d = ini; d < fim && out.length < 60; d = somarDiasISO(d, 1)) out.push(d);
  return out;
}

// ── Agregados ─────────────────────────────────────────────────────────────

export interface Contagem { precisam: number; tem: number }

export interface LogisticaDaFuncao {
  functionId: string;
  vagas: number;
  semNome: number;
  passagem: Contagem & { semDados: number };
  terrestre: Contagem;
  hotel: Contagem;
  /** A primeira chegada e a última saída da função (para o resumo). */
  primeiraChegada: Movimento | null;
  ultimaSaida: Movimento | null;
}

export interface LogisticaDoDia {
  dia: string;
  chegam: Movimento[];
  saem: Movimento[];
  /** Vagas com hotel nesta noite. */
  noHotel: string[];
}

export interface ResumoDaLogistica {
  porVaga: Map<string, LogisticaDaVagaNaEscala>;
  porFuncao: Map<string, LogisticaDaFuncao>;
  total: Omit<LogisticaDaFuncao, "functionId" | "primeiraChegada" | "ultimaSaida">;
  /** Dias com chegada, saída ou hotel, em ordem. */
  porDia: Map<string, LogisticaDoDia>;
  /** Vagas que viajam e ainda não têm dia de chegada / de saída (nem pela Sugestão). */
  semDiaDeChegada: string[];
  semDiaDeSaida: string[];
}

const contagemVazia = (): Contagem => ({ precisam: 0, tem: 0 });
const somar = (c: Contagem, e: EstadoDoItem) => {
  if (e === "nao_precisa") return;
  c.precisam += 1;
  if (e === "tem") c.tem += 1;
};

/** Minuto do movimento no dia (sem hora = fim da fila). */
export const minutoDoMovimento = (m: Pick<Movimento, "hora">): number =>
  m.hora ? Number(m.hora.slice(0, 2)) * 60 + Number(m.hora.slice(3, 5)) : 24 * 60;

/** Ordem do dia: por hora (sem hora por último); a passagem antes da sugestão. */
export function ordenarMovimentos<M extends Pick<Movimento, "dia" | "hora" | "fonte">>(lista: readonly M[]): M[] {
  return [...lista].sort((a, b) =>
    a.dia.localeCompare(b.dia) || minutoDoMovimento(a) - minutoDoMovimento(b) || (a.fonte === b.fonte ? 0 : a.fonte === "passagem" ? -1 : 1));
}

const antes = (a: Movimento, b: Movimento) => a.dia < b.dia || (a.dia === b.dia && minutoDoMovimento(a) < minutoDoMovimento(b));

export function resumirLogistica(vagas: readonly VagaDaEscala[], fontes: FontesDaLogistica): ResumoDaLogistica {
  const porVaga = new Map<string, LogisticaDaVagaNaEscala>();
  const porFuncao = new Map<string, LogisticaDaFuncao>();
  const porDia = new Map<string, LogisticaDoDia>();
  const total = { vagas: 0, semNome: 0, passagem: { ...contagemVazia(), semDados: 0 }, terrestre: contagemVazia(), hotel: contagemVazia() };
  const semDiaDeChegada: string[] = [];
  const semDiaDeSaida: string[] = [];
  const doDia = (dia: string) => {
    let d = porDia.get(dia);
    if (!d) { d = { dia, chegam: [], saem: [], noHotel: [] }; porDia.set(dia, d); }
    return d;
  };

  for (const v of vagas) {
    if (vagaCancelada(v)) continue;
    const l = logisticaDaVagaNaEscala(v, fontes);
    porVaga.set(v.id, l);
    let f = porFuncao.get(v.functionId);
    if (!f) {
      f = { functionId: v.functionId, vagas: 0, semNome: 0, passagem: { ...contagemVazia(), semDados: 0 }, terrestre: contagemVazia(), hotel: contagemVazia(), primeiraChegada: null, ultimaSaida: null };
      porFuncao.set(v.functionId, f);
    }
    for (const alvo of [f, total]) {
      alvo.vagas += 1;
      if (l.semNome) alvo.semNome += 1;
      somar(alvo.passagem, l.passagem);
      if (l.passagem === "tem" && l.situacao === "so_carimbo") alvo.passagem.semDados += 1;
      somar(alvo.terrestre, l.terrestre);
      somar(alvo.hotel, l.hotel);
    }
    if (l.chegada) {
      doDia(l.chegada.dia).chegam.push(l.chegada);
      if (!f.primeiraChegada || antes(l.chegada, f.primeiraChegada)) f.primeiraChegada = l.chegada;
    } else if (l.viaja && pernasDaVaga(v).includes("ida")) semDiaDeChegada.push(v.id);
    if (l.saida) {
      doDia(l.saida.dia).saem.push(l.saida);
      if (!f.ultimaSaida || antes(f.ultimaSaida, l.saida)) f.ultimaSaida = l.saida;
    } else if (l.viaja) semDiaDeSaida.push(v.id);
    for (const n of l.noites) doDia(n).noHotel.push(v.id);
  }

  for (const d of Array.from(porDia.values())) {
    d.chegam = ordenarMovimentos(d.chegam);
    d.saem = ordenarMovimentos(d.saem);
  }
  const diasEmOrdem = new Map(Array.from(porDia.entries()).sort(([a], [b]) => a.localeCompare(b)));
  return { porVaga, porFuncao, total, porDia: diasEmOrdem, semDiaDeChegada, semDiaDeSaida };
}

// ── Textos ────────────────────────────────────────────────────────────────

export type EstadoDaContagem = "ninguem" | "ok" | "falta";

export const estadoDaContagem = (c: Contagem): EstadoDaContagem =>
  c.precisam === 0 ? "ninguem" : c.tem >= c.precisam ? "ok" : "falta";

/**
 * "09:55 (2), ≈14:00, 22:05, sem horário (1)" — os horários do dia, agrupados.
 * "≈" marca o horário que veio da Sugestão (ainda sem passagem).
 */
export function horariosEmTexto(movimentos: readonly Pick<Movimento, "hora" | "fonte" | "dia">[]): string {
  const grupos = new Map<string, number>();
  let semHora = 0;
  for (const m of ordenarMovimentos(movimentos)) {
    if (!m.hora) { semHora += 1; continue; }
    const chave = `${m.fonte === "sugestao" ? "≈" : ""}${m.hora}`;
    grupos.set(chave, (grupos.get(chave) ?? 0) + 1);
  }
  const partes = Array.from(grupos, ([h, n]) => (n > 1 ? `${h} (${n})` : h));
  if (semHora > 0) partes.push(`sem horário (${semHora})`);
  return partes.join(", ");
}

/** "Chegam 4: 09:55 (2), 14:20, 22:05" / "Chegam 0". */
export function resumoDoMovimento(rotulo: string, movimentos: readonly Pick<Movimento, "hora" | "fonte" | "dia">[]): string {
  if (movimentos.length === 0) return `${rotulo} 0`;
  return `${rotulo} ${movimentos.length}: ${horariosEmTexto(movimentos)}`;
}

/** "Carro", "Van", "Aéreo", "Rodoviário", "Ônibus". */
export const NOME_DO_MODO_DO_MOVIMENTO: Record<ModoDoMovimento, string> = {
  aereo: "Aéreo", rodoviario: "Rodoviário", carro: "Carro", van: "Van", onibus: "Ônibus",
};
