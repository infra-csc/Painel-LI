/**
 * JANELA DE VIAGEM, TRECHO DIRETO E DATA IMPOSSÍVEL — regra pura (09/10).
 *
 * Caso real (produção): Alonso, vaga #4045 Night Run Aracaju (escala 22–25/10;
 * ida 21/10 16:15, volta 26/10 03:50) e vaga #4238 Makai João Pessoa (escala
 * 26/10–02/11; ida 25/10 21:25 GRU→JPA). As ESCALAS não se cruzam — a regra
 * de agenda (shared/conflito-de-agenda.ts) só olha scheduleStart/End e não
 * pegou —, mas as VIAGENS se cruzam: ele embarcaria em Guarulhos às 21:25 do
 * dia 25 estando em Aracaju até as 03:50 do dia 26. Compras: "precisaríamos de
 * uma solução para passagens de 1 perna e o pinga-pinga — nesse caso o Alonso
 * vai direto de ARA p/ JP".
 *
 * Decisões do dono:
 *  - viagem sobreposta NÃO pode (bloqueio, sem "registrar mesmo assim"),
 *    exceto quando as duas vagas estão ENCADEADAS (trecho direto);
 *  - o custo do trecho direto é do evento de DESTINO (é a ida da vaga seguinte);
 *  - quem planeja INDICA o encadeamento (Sugestão, Inclusão, Escalação —
 *    campos `idaVemDoEventoId` / `voltaSegueParaEventoId` da vaga) e Compras
 *    CONFIRMA ao registrar a passagem (`tickets.idaVemDeInclusionId`). Com a
 *    passagem registrada, vale o que Compras gravou;
 *  - o que já se cruza hoje só é LISTADO (Pendências) — nada muda sozinho.
 *
 * Janela de ocupação de uma vaga = da partida da ida até a chegada da volta.
 * Cada ponta tem a sua fonte, nesta ordem: passagem atual → datas sugeridas da
 * vaga (dia inteiro, sem hora) → período da escala. Vaga encadeada: a janela
 * da anterior termina na partida do trecho direto, onde começa a da seguinte —
 * as duas nunca conflitam entre si.
 *
 * Conflito entre duas janelas (mesmo colaborador):
 *  - com hora nas duas pontas que se cruzam: intersecção > 0 → BLOQUEIA
 *    (volta 10:00 × ida 18:00 no mesmo dia não cruza);
 *  - sem hora: 2+ dias em comum → BLOQUEIA; 1 dia → AVISO (dono, 18/09: "tem
 *    casos com 2 viagens no mesmo dia, horários compatíveis").
 *
 * Esta é a ÚNICA regra de "esta vaga está encadeada com aquela?" — o servidor
 * (registro de passagem, Pendências, Escalação) e as telas usam daqui.
 */
import { ocupaAgenda } from "./conflito-de-agenda";

/** Quantos dias entre o fim de uma vaga e o início da outra ainda contam como "vai direto". */
export const DIAS_PARA_TRECHO_DIRETO = 3;
/** Primeiro ano aceito numa data de passagem (dono, 09/10: anos 0002/+72026 em produção). */
export const ANO_MINIMO_DA_PASSAGEM = 2024;
/** Até quantos anos à frente de hoje uma data de passagem é plausível. */
export const ANOS_A_FRENTE_DA_PASSAGEM = 2;

type Dia = string | Date | null | undefined;

/** O que a regra lê da passagem ATUAL da vaga (não a de histórico de troca). */
export interface PassagemDaJanela {
  id?: string | null;
  transportType?: string | null;
  actualDepartureDate?: Dia;
  actualDepartureTime?: string | null;
  actualArrivalTime?: string | null;
  actualReturnDate?: Dia;
  actualReturnTime?: string | null;
  returnArrivalTime?: string | null;
  departureCityOrigin?: string | null;
  departureCityDestination?: string | null;
  returnCityOrigin?: string | null;
  returnCityDestination?: string | null;
  purchaseDate?: Dia;
  /** Trecho direto confirmado por Compras: a ida sai do evento desta vaga. */
  idaVemDeInclusionId?: string | null;
}

/** O que a regra lê da vaga. */
export interface VagaDaJanela {
  id: string;
  inclusionNumber?: number | null;
  eventId: string;
  eventName?: string | null;
  /** `events.location` ("Orla de Atalaia, Aracaju - SE") — a cidade sai do fim. */
  eventLocation?: string | null;
  collaboratorId?: string | null;
  status?: string | null;
  phase?: string | null;
  deletedAt?: Date | string | null;
  scheduleStartDate?: Dia;
  scheduleEndDate?: Dia;
  flightDepartureDate?: Dia;
  flightReturnDate?: Dia;
  trechosSugeridos?: string | null;
  idaVemDoEventoId?: string | null;
  voltaSegueParaEventoId?: string | null;
  /** Passagem atual (null/undefined = ainda sem passagem). */
  passagem?: PassagemDaJanela | null;
}

/** Uma ponta da janela. `hora` null = dia inteiro (sugestão ou escala). */
export interface Marco {
  dia: string;
  hora: string | null;
  fonte: "passagem" | "sugestao" | "escala";
}

export interface JanelaDeViagem {
  inicio: Marco | null;
  fim: Marco | null;
}

// ── Datas e horas, sem fuso ─────────────────────────────────────────────────

/** "AAAA-MM-DD" de string/Date; null se não for data. Não passa por fuso. */
export function diaDe(v: Dia): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const m = /^([+-]?\d{4,6})-(\d{2})-(\d{2})/.exec(String(v).trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "HH:MM" de "H:MM", "HH:MM:SS"; null se não for hora. */
export function horaDe(v: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function diaComoNumero(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Dias corridos de `de` até `ate` (negativo se `ate` vem antes). */
export function diasEntreDatas(de: string, ate: string): number {
  return diaComoNumero(ate) - diaComoNumero(de);
}

export function somarDiasISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/** Minuto absoluto da ponta; sem hora, o começo (início) ou o fim (fim) do dia. */
function instante(m: Marco, lado: "inicio" | "fim"): number {
  return diaComoNumero(m.dia) * 1440 + (m.hora ? minutos(m.hora) : lado === "inicio" ? 0 : 1439);
}

/** "26/10 03:50" ou "26/10". */
export function marcoEmTexto(m: Marco | null | undefined): string {
  if (!m) return "—";
  const [, mes, dia] = m.dia.split("-");
  return `${dia}/${mes}${m.hora ? ` ${m.hora}` : ""}`;
}

// ── Cidade do evento ────────────────────────────────────────────────────────

/** "Orla de Atalaia, Aracaju - SE" → "Aracaju". Sem vírgula, o texto todo (sem a UF). */
export function cidadeDoEvento(location: string | null | undefined): string {
  const bruto = String(location ?? "").trim();
  if (!bruto) return "";
  const partes = bruto.split(",").map((p) => p.trim()).filter(Boolean);
  const fim = partes[partes.length - 1] ?? bruto;
  return fim.replace(/\s*[-/–]\s*[A-Za-z]{2}$/, "").trim();
}

const chaveDeCidade = (c: string) =>
  c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** As duas vagas são em cidades diferentes? Cidade desconhecida → não dá para dizer (false). */
export function cidadesDiferentes(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = chaveDeCidade(cidadeDoEvento(a)), cb = chaveDeCidade(cidadeDoEvento(b));
  return !!ca && !!cb && ca !== cb;
}

// ── Pernas da passagem ──────────────────────────────────────────────────────

export type TrechosDaPassagem = "ida_e_volta" | "so_ida" | "so_volta";

/** A passagem tem a perna de ida? (algum dado dela preenchido) */
export function passagemTemIda(t: PassagemDaJanela | null | undefined): boolean {
  return !!t && !!(diaDe(t.actualDepartureDate) || t.actualDepartureTime || t.departureCityOrigin || t.departureCityDestination);
}

/** A passagem tem a perna de volta? */
export function passagemTemVolta(t: PassagemDaJanela | null | undefined): boolean {
  return !!t && !!(diaDe(t.actualReturnDate) || t.actualReturnTime || t.returnCityOrigin || t.returnCityDestination);
}

/**
 * Pernas da passagem gravada. Não há coluna: "só ida"/"só volta" é a passagem
 * com os campos da outra perna vazios (mesma leitura do formulário — 28/08).
 * Sem perna nenhuma (só o carimbo de emitida, por exemplo) → null.
 */
export function trechosDaPassagem(t: PassagemDaJanela | null | undefined): TrechosDaPassagem | null {
  const ida = passagemTemIda(t), volta = passagemTemVolta(t);
  if (ida && volta) return "ida_e_volta";
  if (ida) return "so_ida";
  if (volta) return "so_volta";
  return null;
}

// ── Encadeamento (a regra única) ────────────────────────────────────────────

export type FonteDoEncadeamento = "passagem" | "indicacao";

export interface Encadeamento<V extends VagaDaJanela> {
  /** A vaga de onde a pessoa sai direto (fica sem volta própria). */
  anterior: V;
  /** A vaga para onde ela vai direto (a ida dela é o trecho direto). */
  seguinte: V;
  /** "passagem": Compras confirmou; "indicacao": quem planejou indicou. */
  fonte: FonteDoEncadeamento;
}

function encadeadaEmOrdem<V extends VagaDaJanela>(x: V, y: V): FonteDoEncadeamento | null {
  const t = y.passagem;
  // Compras confirmou o trecho direto nesta passagem.
  if (t?.idaVemDeInclusionId && t.idaVemDeInclusionId === x.id) return "passagem";
  // Passagem com ida registrada que NÃO sai de x: vale o que foi comprado.
  if (t && (diaDe(t.actualDepartureDate) || t.idaVemDeInclusionId)) return null;
  // Sem ida comprada: vale a indicação de quem planejou (em qualquer das pontas).
  if ((x.voltaSegueParaEventoId && x.voltaSegueParaEventoId === y.eventId)
    || (y.idaVemDoEventoId && y.idaVemDoEventoId === x.eventId)) return "indicacao";
  return null;
}

/**
 * As duas vagas estão encadeadas (trecho direto de uma para a outra)? Exige o
 * MESMO colaborador (quando os dois são conhecidos) e eventos diferentes.
 * Devolve quem é a anterior, quem é a seguinte e de onde veio o encadeamento.
 */
export function encadeamentoEntre<V extends VagaDaJanela>(a: V, b: V): Encadeamento<V> | null {
  if (a.id === b.id || a.eventId === b.eventId) return null;
  if (a.collaboratorId && b.collaboratorId && a.collaboratorId !== b.collaboratorId) return null;
  const ab = encadeadaEmOrdem(a, b);
  if (ab) return { anterior: a, seguinte: b, fonte: ab };
  const ba = encadeadaEmOrdem(b, a);
  if (ba) return { anterior: b, seguinte: a, fonte: ba };
  return null;
}

/** Atalho: "esta vaga está encadeada com aquela?" */
export function estaoEncadeadas(a: VagaDaJanela, b: VagaDaJanela): boolean {
  return encadeamentoEntre(a, b) !== null;
}

// ── Janela ──────────────────────────────────────────────────────────────────

function inicioProprio(v: VagaDaJanela): Marco | null {
  const t = v.passagem;
  const idaComprada = diaDe(t?.actualDepartureDate);
  if (idaComprada) return { dia: idaComprada, hora: horaDe(t?.actualDepartureTime), fonte: "passagem" };
  const sugerida = diaDe(v.flightDepartureDate);
  if (sugerida) return { dia: sugerida, hora: null, fonte: "sugestao" };
  const escala = diaDe(v.scheduleStartDate);
  return escala ? { dia: escala, hora: null, fonte: "escala" } : null;
}

function fimProprio(v: VagaDaJanela): Marco | null {
  const t = v.passagem;
  const volta = diaDe(t?.actualReturnDate);
  if (volta) {
    const partida = horaDe(t?.actualReturnTime);
    const chegada = horaDe(t?.returnArrivalTime);
    // Chegada "antes" da partida = chega no dia seguinte (voo noturno).
    const dia = partida && chegada && chegada < partida ? somarDiasISO(volta, 1) : volta;
    return { dia, hora: chegada ?? partida, fonte: "passagem" };
  }
  const sugerida = diaDe(v.flightReturnDate);
  if (sugerida) return { dia: sugerida, hora: null, fonte: "sugestao" };
  const escala = diaDe(v.scheduleEndDate);
  return escala ? { dia: escala, hora: null, fonte: "escala" } : null;
}

/**
 * Janela de UMA vaga. `seguinte` = a vaga para onde ela vai direto (se houver):
 * aí a janela termina na partida do trecho direto (o início da seguinte).
 */
export function janelaDaVaga(v: VagaDaJanela, seguinte?: VagaDaJanela | null): JanelaDeViagem {
  const inicio = inicioProprio(v);
  const fim = seguinte ? inicioProprio(seguinte) ?? fimProprio(v) : fimProprio(v);
  return { inicio, fim };
}

/** A janela é válida (tem as duas pontas e o fim não vem antes do início)? */
function janelaValida(j: JanelaDeViagem): j is { inicio: Marco; fim: Marco } {
  return !!j.inicio && !!j.fim && instante(j.fim, "fim") >= instante(j.inicio, "inicio");
}

export type NivelDoConflitoDeViagem = "bloqueia" | "aviso";

export interface CruzamentoDeJanelas {
  nivel: NivelDoConflitoDeViagem;
  /** Onde começa e termina o trecho em comum. */
  inicio: Marco;
  fim: Marco;
}

/**
 * Duas janelas se cruzam? Com hora nas duas pontas do trecho em comum, conta o
 * minuto (intersecção > 0 bloqueia; encostar não). Sem hora numa delas, conta
 * dias: 2+ bloqueia, 1 é aviso.
 */
export function cruzamentoDeJanelas(a: JanelaDeViagem, b: JanelaDeViagem): CruzamentoDeJanelas | null {
  if (!janelaValida(a) || !janelaValida(b)) return null;
  const inicio = instante(a.inicio, "inicio") >= instante(b.inicio, "inicio") ? a.inicio : b.inicio;
  const fim = instante(a.fim, "fim") <= instante(b.fim, "fim") ? a.fim : b.fim;
  if (inicio.hora && fim.hora) {
    const cruzou = instante(fim, "fim") - instante(inicio, "inicio") > 0;
    return cruzou ? { nivel: "bloqueia", inicio, fim } : null;
  }
  const dias = diasEntreDatas(inicio.dia, fim.dia) + 1;
  if (dias <= 0) return null;
  return { nivel: dias >= 2 ? "bloqueia" : "aviso", inicio, fim };
}

/** Para cada vaga, a vaga para onde ela segue direto (se houver), entre as dadas. */
function seguintesDe<V extends VagaDaJanela>(vagas: readonly V[]): Map<string, V> {
  const out = new Map<string, V>();
  for (let i = 0; i < vagas.length; i++) {
    for (let j = i + 1; j < vagas.length; j++) {
      const e = encadeamentoEntre(vagas[i], vagas[j]);
      if (e && !out.has(e.anterior.id)) out.set(e.anterior.id, e.seguinte);
    }
  }
  return out;
}

export interface ConflitoDeViagem<V extends VagaDaJanela> {
  outra: V;
  nivel: NivelDoConflitoDeViagem;
  janelaDaVaga: JanelaDeViagem;
  janelaDaOutra: JanelaDeViagem;
  /** O trecho em comum. */
  inicio: Marco;
  fim: Marco;
  /** A outra viagem começa antes desta (a pessoa ainda está lá quando esta começa). */
  outraVemAntes: boolean;
}

export interface ConflitosDeViagem<V extends VagaDaJanela> {
  bloqueia: ConflitoDeViagem<V>[];
  avisos: ConflitoDeViagem<V>[];
}

/**
 * Conflitos de VIAGEM entre `vaga` e as outras vagas do mesmo colaborador.
 * Fora: a própria vaga, vagas de outro colaborador, as que não ocupam agenda
 * (excluída, cancelada, sugestão, não confirmada — `ocupaAgenda`) e as
 * encadeadas com ela. Vagas do MESMO evento também ficam fora: dentro de um
 * evento quem cuida é a regra de agenda.
 */
export function conflitosDeViagem<V extends VagaDaJanela>(vaga: V, outras: readonly V[]): ConflitosDeViagem<V> {
  const bloqueia: ConflitoDeViagem<V>[] = [];
  const avisos: ConflitoDeViagem<V>[] = [];
  const doColaborador = outras.filter((o) => o.id !== vaga.id
    && (!vaga.collaboratorId || !o.collaboratorId || o.collaboratorId === vaga.collaboratorId)
    && ocupaAgenda(o));
  const todas = [vaga, ...doColaborador];
  const seguintes = seguintesDe(todas);
  const janela = janelaDaVaga(vaga, seguintes.get(vaga.id));
  for (const outra of doColaborador) {
    if (outra.eventId === vaga.eventId) continue;
    if (estaoEncadeadas(vaga, outra)) continue;
    const janelaDaOutra = janelaDaVaga(outra, seguintes.get(outra.id));
    const c = cruzamentoDeJanelas(janela, janelaDaOutra);
    if (!c) continue;
    const outraVemAntes = !!janelaDaOutra.inicio && !!janela.inicio
      && instante(janelaDaOutra.inicio, "inicio") < instante(janela.inicio, "inicio");
    const item: ConflitoDeViagem<V> = { outra, nivel: c.nivel, janelaDaVaga: janela, janelaDaOutra, inicio: c.inicio, fim: c.fim, outraVemAntes };
    (c.nivel === "bloqueia" ? bloqueia : avisos).push(item);
  }
  return { bloqueia, avisos };
}

/**
 * Pares de vagas cujas viagens se cruzam (nível "bloqueia"), sem encadeamento
 * — para a Pendências. Cada par sai uma vez. Só vagas que ocupam agenda e
 * com PASSAGEM registrada nas duas (o que já foi comprado e se cruza; sem
 * passagem de um lado, a vaga ainda está na fila de Compras com a sugestão
 * de trecho direto e o registro é que vai barrar).
 */
export function viagensQueSeCruzam<V extends VagaDaJanela>(vagas: readonly V[]): Array<{ a: V; b: V; conflito: ConflitoDeViagem<V> }> {
  const porColaborador = new Map<string, V[]>();
  for (const v of vagas) {
    if (!v.collaboratorId || !ocupaAgenda(v)) continue;
    const lista = porColaborador.get(v.collaboratorId) ?? [];
    lista.push(v);
    porColaborador.set(v.collaboratorId, lista);
  }
  const out: Array<{ a: V; b: V; conflito: ConflitoDeViagem<V> }> = [];
  for (const lista of Array.from(porColaborador.values())) {
    if (lista.length < 2) continue;
    for (let i = 0; i < lista.length; i++) {
      const { bloqueia } = conflitosDeViagem(lista[i], lista);
      for (const c of bloqueia) {
        // Cada par uma vez: só quando a outra vem depois na lista.
        if (lista.indexOf(c.outra) > i && trechosDaPassagem(lista[i].passagem) && trechosDaPassagem(c.outra.passagem)) out.push({ a: lista[i], b: c.outra, conflito: c });
      }
    }
  }
  return out;
}

// ── Trecho direto: candidatas e sugestões ──────────────────────────────────

export interface VizinhaDeViagem<V extends VagaDaJanela> {
  vaga: V;
  /** Cidade do evento da vizinha ("Aracaju"). */
  cidade: string;
  /** Dias entre o fim de uma e o início da outra (0 = no mesmo dia). */
  dias: number;
  /** "anterior": termina antes desta começar; "seguinte": começa depois desta terminar. */
  lado: "anterior" | "seguinte";
  /** Dia em que a anterior termina / a seguinte começa ("AAAA-MM-DD"). */
  dia: string;
}

/**
 * Outras vagas do MESMO colaborador, em OUTRA cidade, que terminam até
 * `DIAS_PARA_TRECHO_DIRETO` dias antes do início desta (lado "anterior") ou
 * começam até esse tanto depois do fim dela (lado "seguinte"). É de onde sai a
 * lista "Vem direto de outro evento" e a sugestão para Compras. Ordem: a mais
 * próxima primeiro.
 */
export function vizinhasParaTrechoDireto<V extends VagaDaJanela>(vaga: V, outras: readonly V[]): VizinhaDeViagem<V>[] {
  const ini = diaDe(vaga.scheduleStartDate), fim = diaDe(vaga.scheduleEndDate);
  const out: VizinhaDeViagem<V>[] = [];
  for (const o of outras) {
    if (o.id === vaga.id || o.eventId === vaga.eventId) continue;
    if (vaga.collaboratorId && o.collaboratorId !== vaga.collaboratorId) continue;
    if (!ocupaAgenda(o)) continue;
    if (!cidadesDiferentes(vaga.eventLocation, o.eventLocation)) continue;
    const oIni = diaDe(o.scheduleStartDate), oFim = diaDe(o.scheduleEndDate);
    if (ini && oFim) {
      const d = diasEntreDatas(oFim, ini);
      if (d >= 0 && d <= DIAS_PARA_TRECHO_DIRETO) {
        out.push({ vaga: o, cidade: cidadeDoEvento(o.eventLocation), dias: d, lado: "anterior", dia: oFim });
        continue;
      }
    }
    if (fim && oIni) {
      const d = diasEntreDatas(fim, oIni);
      if (d >= 0 && d <= DIAS_PARA_TRECHO_DIRETO) out.push({ vaga: o, cidade: cidadeDoEvento(o.eventLocation), dias: d, lado: "seguinte", dia: oIni });
    }
  }
  return out.sort((a, b) => a.dias - b.dias || a.dia.localeCompare(b.dia));
}

/**
 * Sugestão de trecho direto para Compras na vaga SEM passagem de ida: a vaga
 * anterior mais próxima (ou a que a logística indicou, se o colaborador tem
 * vaga naquele evento). null quando já está encadeada pela passagem.
 */
export function sugestaoDeTrechoDireto<V extends VagaDaJanela>(vaga: V, outras: readonly V[]): VizinhaDeViagem<V> | null {
  if (vaga.passagem?.idaVemDeInclusionId) return null;
  const anteriores = vizinhasParaTrechoDireto(vaga, outras).filter((v) => v.lado === "anterior");
  const indicada = vaga.idaVemDoEventoId ? anteriores.find((a) => a.vaga.eventId === vaga.idaVemDoEventoId) : undefined;
  if (indicada) return indicada;
  // Indicação do outro lado: a anterior disse que segue para cá.
  const pelaAnterior = anteriores.find((a) => a.vaga.voltaSegueParaEventoId === vaga.eventId);
  return pelaAnterior ?? anteriores[0] ?? null;
}

/** A vaga para onde esta segue direto, confirmado por Compras (passagem da seguinte). */
export function seguidaPorPassagem<V extends VagaDaJanela>(vaga: V, outras: readonly V[]): V | null {
  return outras.find((o) => o.id !== vaga.id && o.passagem?.idaVemDeInclusionId === vaga.id) ?? null;
}

// ── Datas impossíveis ───────────────────────────────────────────────────────

/** Campos de data/hora da passagem que a validação confere. */
export type CampoDeDataDaPassagem = "actualDepartureDate" | "actualReturnDate" | "actualReturnTime" | "purchaseDate";

/** Ano de "AAAA-MM-DD" (aceita ano com sinal/6 dígitos, que é como o lixo chega). */
function anoDe(v: Dia): number | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getUTCFullYear();
  const m = /^([+-]?\d{4,6})-/.exec(String(v ?? "").trim());
  return m ? Number(m[1]) : null;
}

/**
 * Erros de data da passagem, por campo (vazio = ok). Servidor é a fonte da
 * verdade; a tela usa a mesma função para mostrar a mensagem no campo.
 *  - ano fora de 2024…(ano de hoje + 2) em ida, volta e compra;
 *  - volta antes da ida (dia; no mesmo dia, pela hora de partida).
 */
export function errosDeDataDaPassagem(t: PassagemDaJanela, hoje: string): Partial<Record<CampoDeDataDaPassagem, string>> {
  const erros: Partial<Record<CampoDeDataDaPassagem, string>> = {};
  const anoMax = Number(hoje.slice(0, 4)) + ANOS_A_FRENTE_DA_PASSAGEM;
  const conferirAno = (campo: CampoDeDataDaPassagem, rotulo: string, v: Dia) => {
    if (v === null || v === undefined || v === "") return;
    const ano = anoDe(v);
    if (ano === null) { erros[campo] = `${rotulo}: data inválida (use DD/MM/AAAA).`; return; }
    if (ano < ANO_MINIMO_DA_PASSAGEM || ano > anoMax) {
      erros[campo] = `${rotulo} com ano ${ano} — use um ano entre ${ANO_MINIMO_DA_PASSAGEM} e ${anoMax}.`;
    }
  };
  conferirAno("actualDepartureDate", "Data da ida", t.actualDepartureDate);
  conferirAno("actualReturnDate", "Data da volta", t.actualReturnDate);
  conferirAno("purchaseDate", "Data da compra", t.purchaseDate);
  const ida = diaDe(t.actualDepartureDate), volta = diaDe(t.actualReturnDate);
  if (ida && volta && !erros.actualDepartureDate && !erros.actualReturnDate) {
    if (volta < ida) {
      erros.actualReturnDate = `A volta (${marcoEmTexto({ dia: volta, hora: null, fonte: "passagem" })}) não pode ser antes da ida (${marcoEmTexto({ dia: ida, hora: null, fonte: "passagem" })}).`;
    } else if (volta === ida) {
      const hIda = horaDe(t.actualDepartureTime), hVolta = horaDe(t.actualReturnTime);
      if (hIda && hVolta && hVolta < hIda) {
        erros.actualReturnTime = `No mesmo dia, a volta (${hVolta}) não pode sair antes da ida (${hIda}).`;
      }
    }
  }
  return erros;
}

/** Frase curta para a lista/Pendências ("Data da volta antes da ida"), ou null. */
export function motivoDeDataImpossivel(t: PassagemDaJanela, hoje: string): string | null {
  const e = errosDeDataDaPassagem(t, hoje);
  if (e.actualReturnDate?.startsWith("A volta") || e.actualReturnTime) return "Data da volta antes da ida";
  if (e.actualDepartureDate) return `Ano impossível na ida (${anoDe(t.actualDepartureDate)})`;
  if (e.actualReturnDate) return `Ano impossível na volta (${anoDe(t.actualReturnDate)})`;
  if (e.purchaseDate) return `Ano impossível na compra (${anoDe(t.purchaseDate)})`;
  return null;
}

// ── Mensagem do bloqueio ────────────────────────────────────────────────────

/** Primeiro nome, para a frase do bloqueio ("Alonso"). */
export function primeiroNome(nome: string | null | undefined): string {
  const n = String(nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!n) return "O colaborador";
  return n.charAt(0).toLocaleUpperCase("pt-BR") + n.slice(1).toLocaleLowerCase("pt-BR");
}

/**
 * A frase do 409 ao registrar uma passagem que cruza outra viagem — dita como
 * Compras fala: "Alonso já está em Aracaju até 26/10 03:50 (#4045 · Night Run
 * Aracaju). Esta ida 25/10 21:25 cruza com essa viagem. Se Alonso vai direto
 * de Aracaju, registre como trecho direto."
 */
export function mensagemDeViagemCruzada(
  nome: string | null | undefined,
  c: Pick<ConflitoDeViagem<VagaDaJanela>, "outra" | "janelaDaVaga" | "janelaDaOutra" | "outraVemAntes">,
): string {
  const quem = primeiroNome(nome);
  const cidade = cidadeDoEvento(c.outra.eventLocation) || "outro evento";
  const ref = `#${c.outra.inclusionNumber ?? "?"}${c.outra.eventName ? ` · ${c.outra.eventName}` : ""}`;
  if (c.outraVemAntes) {
    // "Está em Aracaju até…" é a SAÍDA de lá (a volta embarca às 03:50); a
    // janela vai até a chegada, mas a frase fala de onde a pessoa está.
    const t = c.outra.passagem;
    const voltaDia = diaDe(t?.actualReturnDate), voltaHora = horaDe(t?.actualReturnTime);
    const saida = c.janelaDaOutra.fim?.fonte === "passagem" && voltaDia && voltaHora
      ? { dia: voltaDia, hora: voltaHora, fonte: "passagem" as const }
      : c.janelaDaOutra.fim;
    return `${quem} já está em ${cidade} até ${marcoEmTexto(saida)} (${ref}). `
      + `Esta ida ${marcoEmTexto(c.janelaDaVaga.inicio)} cruza com essa viagem. `
      + `Se ${quem} vai direto de ${cidade}, registre como trecho direto.`;
  }
  return `${quem} vai para ${cidade} a partir de ${marcoEmTexto(c.janelaDaOutra.inicio)} (${ref}). `
    + `Esta volta ${marcoEmTexto(c.janelaDaVaga.fim)} cruza com essa viagem. `
    + `Se ${quem} segue direto para ${cidade}, registre a passagem de lá como trecho direto e deixe esta só com a ida.`;
}

// ── Indicação na vaga (Sugestão / Inclusão / Escalação) ────────────────────

/** Campos de viagem sugerida da vaga que a indicação de trecho direto mexe. */
export interface TrechosDaVaga {
  trechosSugeridos?: string | null;
  idaVemDoEventoId?: string | null;
  voltaSegueParaEventoId?: string | null;
  transportModeIda?: string | null;
  flightDepartureDate?: string | Date | null;
  flightDepartureSuggestedTime?: string | null;
  flightArrivalSuggestedTime?: string | null;
  transportModeVolta?: string | null;
  flightReturnDate?: string | Date | null;
  flightReturnSuggestedTime?: string | null;
}

/** Campos que a normalização pode escrever (o resto da vaga não muda). */
export const CAMPOS_DE_TRECHOS_DA_VAGA = [
  "trechosSugeridos", "idaVemDoEventoId", "voltaSegueParaEventoId",
  "transportModeIda", "flightDepartureDate", "flightDepartureSuggestedTime", "flightArrivalSuggestedTime",
  "transportModeVolta", "flightReturnDate", "flightReturnSuggestedTime",
] as const;

/**
 * Deixa a indicação coerente, do mesmo jeito em toda porta (servidor e telas):
 *  - "segue direto para o evento Y" = sem volta própria → trechos "so_ida" e
 *    os campos da volta vazios (a perna é a ida da vaga de Y — custo de lá);
 *  - "só ida" → volta vazia; "só volta" → ida vazia e sem "vem direto de";
 *  - "vem direto do evento X" mantém a ida (ela É o trecho direto: modal,
 *    data e desembarque continuam valendo — a origem é a cidade de X);
 *  - "ida e volta" é gravado como null (o padrão de sempre);
 *  - de/para o PRÓPRIO evento é erro.
 */
export function normalizarTrechosDaVaga<T extends TrechosDaVaga>(v: T, eventIdDaVaga?: string | null): { valor: T; erro?: string } {
  const out: TrechosDaVaga = { ...v };
  const vazio = (s: string | null | undefined) => (s ?? "").trim() === "";
  if (vazio(out.idaVemDoEventoId)) out.idaVemDoEventoId = null;
  if (vazio(out.voltaSegueParaEventoId)) out.voltaSegueParaEventoId = null;
  if (eventIdDaVaga && (out.idaVemDoEventoId === eventIdDaVaga || out.voltaSegueParaEventoId === eventIdDaVaga)) {
    return { valor: v, erro: "A vaga não pode vir de nem seguir para o próprio evento." };
  }
  let trechos = out.trechosSugeridos === "so_ida" || out.trechosSugeridos === "so_volta" ? out.trechosSugeridos : null;
  if (out.voltaSegueParaEventoId) {
    if (trechos === "so_volta") return { valor: v, erro: "\"Só volta\" não combina com \"segue direto para outro evento\" — escolha uma das duas." };
    trechos = "so_ida";
  }
  if (trechos === "so_ida") {
    out.transportModeVolta = null;
    out.flightReturnDate = null;
    out.flightReturnSuggestedTime = null;
  }
  if (trechos === "so_volta") {
    out.idaVemDoEventoId = null;
    out.transportModeIda = null;
    out.flightDepartureDate = null;
    out.flightDepartureSuggestedTime = null;
    out.flightArrivalSuggestedTime = null;
  }
  out.trechosSugeridos = trechos;
  return { valor: out as T };
}

/** Texto curto da indicação para a fila de Compras ("Logística indicou: vem direto de X"). */
export function textoDaIndicacao(
  v: Pick<TrechosDaVaga, "trechosSugeridos" | "idaVemDoEventoId" | "voltaSegueParaEventoId">,
  nomeDoEvento: (id: string) => string | null | undefined,
): string[] {
  const out: string[] = [];
  if (v.idaVemDoEventoId) out.push(`vem direto de ${nomeDoEvento(v.idaVemDoEventoId) || "outro evento"}`);
  if (v.voltaSegueParaEventoId) out.push(`segue direto para ${nomeDoEvento(v.voltaSegueParaEventoId) || "outro evento"}`);
  else if (v.trechosSugeridos === "so_ida") out.push("só ida (sem volta)");
  if (v.trechosSugeridos === "so_volta") out.push("só volta (sem ida)");
  return out;
}

// ── Pedido de ajuste em par (Escalação) ─────────────────────────────────────

/** O que o par precisa saber de cada vaga no momento da decisão. */
export interface VagaDoPar {
  id: string;
  inclusionNumber?: number | null;
  eventId: string;
  collaboratorId?: string | null;
  collaboratorName?: string | null;
  status?: string | null;
  deletedAt?: Date | string | null;
}

/**
 * O pedido em par ("vai direto de A para B") ainda vale? Mesma ideia da troca
 * desatualizada (shared/troca-desatualizada.ts): se uma das vagas mudou no
 * meio — excluída, cancelada, outro colaborador numa delas (as duas deixam de
 * ter a mesma pessoa) — o aprovador não
 * aplica nada (nem metade). null = o pedido ainda vale.
 */
export function motivoParDesatualizado(
  anterior: VagaDoPar | null | undefined,
  seguinte: VagaDoPar | null | undefined,
): string | null {
  const motivos: string[] = [];
  for (const v of [anterior, seguinte]) {
    if (!v) { motivos.push("Uma das vagas do pedido não existe mais."); continue; }
    if (v.deletedAt) motivos.push(`A vaga #${v.inclusionNumber ?? "?"} foi excluída.`);
    else if (v.status === "cancelado") motivos.push(`A vaga #${v.inclusionNumber ?? "?"} foi cancelada.`);
    else if (!v.collaboratorId) motivos.push(`A vaga #${v.inclusionNumber ?? "?"} está sem colaborador.`);
  }
  if (motivos.length === 0 && anterior && seguinte && anterior.collaboratorId !== seguinte.collaboratorId) {
    motivos.push("As duas vagas não estão mais com a mesma pessoa.");
  }
  if (motivos.length === 0 && anterior && seguinte && anterior.eventId === seguinte.eventId) {
    motivos.push("As duas vagas são do mesmo evento.");
  }
  return motivos.length ? `${motivos.join(" ")} O pedido não foi aplicado — negue e peça de novo, se ainda fizer sentido.` : null;
}

// ── Sinais de viagem (resposta de GET /api/tickets/sinais-de-viagem) ────────

/** Referência curta a outra vaga, para a tela. */
export interface RefDeVaga {
  inclusionId: string;
  numero: number;
  eventId: string;
  eventName: string;
  cidade: string;
}

export interface SinalDeViagem {
  /** Viagens que se cruzam com esta, sem encadeamento ("bloqueia"). */
  cruzaCom?: Array<RefDeVaga & { nivel: "bloqueia" | "aviso" }>;
  /** Passagem com data impossível ("Data da volta antes da ida"). */
  dataImpossivel?: string;
  /** A ida desta vaga é o trecho direto vindo de outra (Compras confirmou ou a logística indicou). */
  vemDiretoDe?: RefDeVaga & { confirmado: boolean };
  /** Esta vaga não tem volta própria: segue direto para outra. */
  segueDiretoPara?: RefDeVaga & { confirmado: boolean };
  /** Sugestão para Compras (vaga sem ida comprada): pode ir direto da anterior. */
  podeIrDiretoDe?: RefDeVaga & { dia: string; indicadoPelaLogistica: boolean };
  /** Inverso, na anterior: a próxima vaga começa logo depois em outra cidade. */
  seguePara?: RefDeVaga & { dia: string };
  /** Vagas do mesmo colaborador que terminam até 3 dias antes, em outra cidade (lista do modal). */
  vizinhasAnteriores?: Array<RefDeVaga & { dia: string }>;
}

export interface SinaisDeViagem {
  porVaga: Record<string, SinalDeViagem>;
  totais: { viagensQueSeCruzam: number; passagensComDataImpossivel: number };
}

