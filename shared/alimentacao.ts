/**
 * Alimentação automatizada por voo (slide "Ações de melhoria APP LI").
 *
 * Regra confirmada pelo negócio (14/08 e revista em 17/08/2026):
 * - Quem NÃO voa (jornada externa / evento local): almoço + jantar em TODOS
 *   os dias trabalhados (o slide condiciona a horas de jornada — 4h para
 *   almoço, 10h para jantar — mas o sistema não registra jornada; assume as
 *   duas refeições). Nunca "estimado": não depende de passagem.
 * - Quem voa, por dia do período:
 *   · dia de CHEGADA:  almoço se o voo de ida CHEGA até 13h (dono 19/10; era
 *                      11h — caso Rubem, NR Teresina: chegou 11:30 e perdia o
 *                      almoço); jantar se chega até 19h
 *   · dias do MEIO:    almoço + jantar
 *   · dia de RETORNO:  almoço se o voo de volta PARTE a partir das 13h;
 *                      jantar se parte a partir das 21h OU se a volta CHEGA
 *                      depois das 21h (19/10 — Rubem partiu 18:55 e chegou
 *                      22:05: janta no caminho)
 *   · viagem de 1 dia: aplica as duas condições no mesmo dia
 * - DATAS da viagem (15/10 — caso Everson, Night Run Teresina: escala 07–11/10,
 *   volta 12/10 às 03:45; o horário 03:45 era aplicado ao domingo 11/10 e
 *   tirava o almoço e o jantar dele). Os horários só valem no dia em que a
 *   viagem ACONTECE:
 *   · volta numa data DEPOIS do último dia da escala → o último dia é cheio
 *     (almoço + jantar) e o dia da partida não tem refeição (não é dia
 *     trabalhado); volta na MESMA data do último dia → regra de horário acima;
 *   · chegada da ida numa data ANTES do primeiro dia → o primeiro dia é cheio;
 *     na MESMA data → regra de horário. A data de chegada é a da partida da
 *     ida, +1 dia quando o voo cruza a meia-noite (chegada no relógio menor
 *     que a partida) — ver `dataDeChegadaDaIda`;
 *   · data estranha (chegada DEPOIS do primeiro dia, volta ANTES do último) ou
 *     sem data → regra de horário de sempre (compatível; nada é inventado).
 * - Fonte dos horários: a PASSAGEM registrada (chegada da ida =
 *   tickets.actualArrivalTime; partida da volta = tickets.actualReturnTime;
 *   datas = actualDepartureDate / actualReturnDate). Sem passagem: os
 *   sugeridos da escalação (flight*SuggestedTime, flightDepartureDate /
 *   flightReturnDate). Sem horário nem data que resolva o dia: assume dia
 *   cheio e marca `estimado` — o modal exibe o aviso; não subpaga enquanto a
 *   compra não acontece.
 * - Valores por refeição editáveis no Valores Padrão (Demais 40/40,
 *   Cenotécnica 35/35, Key Account / Gerente 44/44 por padrão — regra 18/08:
 *   "Executivo 40,00, Key/Gerente 44,00"; Executivo de Contas = Demais).
 *
 * Funções puras — sem I/O, testáveis.
 */
import { parseHoraMin } from "./atendimento";
import { ehCenotecnica } from "./cenotecnica";

export interface AlimentacaoDia {
  date: string;          // YYYY-MM-DD
  almoco: boolean;
  jantar: boolean;
  /** "externo" = quem não voa (jornada externa): dia cheio, sem depender de voo */
  papel: "chegada" | "meio" | "retorno" | "unico" | "externo";
}

export interface AlimentacaoResult {
  dias: AlimentacaoDia[];
  almocos: number;
  jantares: number;
  totalCents: number;
  /** true quando algum horário faltou e o dia foi assumido cheio */
  estimado: boolean;
}

export interface AlimentacaoInput {
  /** Dias do período (YYYY-MM-DD, ordenados ou não — serão ordenados) */
  workDays: string[];
  /** A pessoa voa? (needsTicket) — sem voo é jornada externa: almoço + jantar todo dia */
  voa: boolean;
  /** Horário de CHEGADA do voo de ida ("HH:MM") — da passagem registrada */
  chegadaIda?: string | null;
  /** Horário de PARTIDA do voo de volta ("HH:MM") — da passagem registrada */
  partidaVolta?: string | null;
  /** Horário de CHEGADA da volta ("HH:MM", opcional) — chegar depois das 21h dá a janta do dia (19/10) */
  chegadaVolta?: string | null;
  /**
   * DATA em que o voo de ida CHEGA (YYYY-MM-DD) — use `dataDeChegadaDaIda`
   * (cruzar a meia-noite empurra para o dia seguinte). Antes do 1º dia da
   * escala ⇒ 1º dia cheio. Ausente ⇒ regra só de horário.
   */
  dataChegadaIda?: string | null;
  /**
   * DATA da PARTIDA da volta (YYYY-MM-DD). Depois do último dia da escala ⇒
   * último dia cheio. Ausente ⇒ regra só de horário.
   */
  dataPartidaVolta?: string | null;
  /** Valor do almoço/jantar em centavos (já escolhidos p/ Demais ou Cenotécnica) */
  almocoCents: number;
  jantarCents: number;
  /**
   * Transporte terrestre (van/ônibus/carro)? Regra 17/08: no dia de RETORNO,
   * van saindo às 20h ou depois já paga jantar (o deck fala em 21h para VOO —
   * a diferença é que o terrestre não tem check-in/aeroporto e sai do evento
   * mais tarde na prática).
   */
  terrestre?: boolean;
}

// Cortes confirmados pelo negócio
const CHEGADA_ALMOCO_ATE = 13 * 60;      // chega até 13:00 → almoça (dono 19/10; era 11:00)
const CHEGADA_JANTAR_ATE = 19 * 60;      // chega até 19:00 → janta
const RETORNO_ALMOCO_APOS = 13 * 60;     // volta parte ≥ 13:00 → almoça
const RETORNO_JANTAR_APOS = 21 * 60;     // VOO de volta parte ≥ 21:00 → janta
const RETORNO_JANTAR_APOS_TERRESTRE = 20 * 60; // van/ônibus saindo ≥ 20:00 → janta (regra 17/08)
const RETORNO_JANTAR_SE_CHEGA_APOS = 21 * 60;  // a volta chega depois das 21:00 → janta (dono 19/10)

/** "YYYY-MM-DD" (aceita timestamp ISO — corta o horário); inválido/vazio → null. */
function dataISO(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Data em que o voo de IDA chega: a data da partida, +1 dia quando o horário
 * de chegada no relógio é MENOR que o de partida (cruzou a meia-noite — ex.:
 * sai 09/10 23:35, chega 02:35 ⇒ chega 10/10). Sem data de partida → null;
 * sem um dos horários → a própria data de partida (não dá para ver o cruzamento).
 */
export function dataDeChegadaDaIda(
  dataPartida: string | null | undefined,
  horaPartida: string | null | undefined,
  horaChegada: string | null | undefined,
): string | null {
  const d = dataISO(dataPartida);
  if (!d) return null;
  const p = parseHoraMin(horaPartida);
  const c = parseHoraMin(horaChegada);
  if (p === null || c === null || c >= p) return d;
  const [y, m, dia] = d.split("-").map(Number);
  const prox = new Date(Date.UTC(y, m - 1, dia + 1));
  return `${prox.getUTCFullYear()}-${String(prox.getUTCMonth() + 1).padStart(2, "0")}-${String(prox.getUTCDate()).padStart(2, "0")}`;
}

export function calcAlimentacao(input: AlimentacaoInput): AlimentacaoResult {
  const dias: AlimentacaoDia[] = [];
  let estimado = false;

  if (input.workDays.length === 0) {
    return { dias, almocos: 0, jantares: 0, totalCents: 0, estimado: false };
  }

  const sorted = [...input.workDays].sort();

  // Jornada externa (não voa): almoço + jantar em todos os dias, sem estimativa
  if (!input.voa) {
    for (const date of sorted) dias.push({ date, almoco: true, jantar: true, papel: "externo" });
    return {
      dias,
      almocos: dias.length,
      jantares: dias.length,
      totalCents: dias.length * (input.almocoCents + input.jantarCents),
      estimado: false,
    };
  }
  const chegada = parseHoraMin(input.chegadaIda);
  const partida = parseHoraMin(input.partidaVolta);
  const chegadaDaVolta = parseHoraMin(input.chegadaVolta);
  // Chegou depois das 21h — ou cruzou a meia-noite (chegada no relógio menor
  // que a partida): a janta foi no caminho.
  const voltaChegaTarde = chegadaDaVolta !== null && (chegadaDaVolta > RETORNO_JANTAR_SE_CHEGA_APOS || (partida !== null && chegadaDaVolta < partida));
  // Datas da viagem: chegou num dia ANTES do 1º dia / volta num dia DEPOIS do
  // último ⇒ a borda é dia cheio e o horário não se aplica. Mesma data, data
  // estranha ou sem data ⇒ regra de horário (comparação de string: YYYY-MM-DD).
  const dataChegada = dataISO(input.dataChegadaIda);
  const dataVolta = dataISO(input.dataPartidaVolta);
  const chegouAntes = dataChegada !== null && dataChegada < sorted[0];
  const voltaDepois = dataVolta !== null && dataVolta > sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length; i++) {
    const primeiro = i === 0;
    const ultimo = i === sorted.length - 1;
    const papel: AlimentacaoDia["papel"] =
      primeiro && ultimo ? "unico" : primeiro ? "chegada" : ultimo ? "retorno" : "meio";

    let almoco = true;
    let jantar = true;

    if ((papel === "chegada" || papel === "unico") && !chegouAntes) {
      if (chegada === null) {
        estimado = true; // sem horário da passagem — assume dia cheio
      } else {
        almoco = chegada <= CHEGADA_ALMOCO_ATE;
        jantar = chegada <= CHEGADA_JANTAR_ATE;
      }
    }
    if ((papel === "retorno" || papel === "unico") && !voltaDepois) {
      if (partida === null) {
        estimado = true;
      } else {
        // No dia único, a condição do retorno restringe ainda mais
        const a = partida >= RETORNO_ALMOCO_APOS;
        const j = partida >= (input.terrestre ? RETORNO_JANTAR_APOS_TERRESTRE : RETORNO_JANTAR_APOS) || voltaChegaTarde;
        almoco = papel === "unico" ? (almoco && a) : a;
        jantar = papel === "unico" ? (jantar && j) : j;
      }
    }

    dias.push({ date: sorted[i], almoco, jantar, papel });
  }

  const almocos = dias.filter(d => d.almoco).length;
  const jantares = dias.filter(d => d.jantar).length;
  return {
    dias,
    almocos,
    jantares,
    totalCents: almocos * input.almocoCents + jantares * input.jantarCents,
    estimado,
  };
}

/**
 * A função é de cenotécnica para ALIMENTAÇÃO e DIÁRIAS? (refeição reduzida,
 * casa sem diária, empreita para freela.)
 *
 * Mesma lista de termos do fluxo do gestor (shared/cenotecnica.ts), com
 * `incluiSupCeno: false`: "Sup Ceno" (supervisor) é do grupo PRODUTOR — regra
 * atual do dono ("produtor = produção/ativação/kit/sup ceno"): recebe diária
 * normal e alimentação de "demais". Tornar isso configurável é decisão dele.
 */
export function isCenotecnicaFunction(functionName: string | null | undefined): boolean {
  return ehCenotecnica(functionName, { incluiSupCeno: false });
}

/**
 * Perfil de refeição (regra 18/08):
 * - "gestao": Key Account e Gerente (R$ 44 almoço / R$ 44 jantar por padrão)
 * - "ceno":   cenotécnica (R$ 35 / R$ 35)
 * - "demais": todo o resto, INCLUSIVE Executivo de Contas (R$ 40 / R$ 40)
 */
export type RefeicaoPerfil = "demais" | "ceno" | "gestao";

const GESTAO_NAME_RE = /\bkey\b|key ?account|gerente/i;

/**
 * Decide o perfil de refeição a partir do nome da função e (quando é função de
 * atendimento) do `atendimentoTipo` escolhido na escalação.
 * - atendimentoTipo === "key_account" → "gestao"
 * - nome contém "key", "key account" ou "gerente" (e não "executivo") → "gestao"
 * - função de cenotécnica → "ceno"
 * - senão → "demais" (Executivo de Contas cai aqui)
 */
export function refeicaoPerfil(
  functionName: string | null | undefined,
  atendimentoTipo?: string | null,
): RefeicaoPerfil {
  if (atendimentoTipo === "key_account") return "gestao";
  const name = functionName ?? "";
  if (GESTAO_NAME_RE.test(name) && !/executivo/i.test(name)) return "gestao";
  if (isCenotecnicaFunction(functionName)) return "ceno";
  return "demais";
}

/** Normaliza o 1º argumento legado (boolean = cenotécnica?) para o perfil. */
function toPerfil(p: boolean | RefeicaoPerfil): RefeicaoPerfil {
  if (typeof p === "boolean") return p ? "ceno" : "demais";
  return p;
}

/**
 * Valores de refeição (centavos) a partir do Valores Padrão.
 * O 1º argumento aceita o perfil ("demais" | "ceno" | "gestao") ou, por
 * compatibilidade, o boolean antigo `cenotecnica` (true → ceno, false → demais).
 */
export function refeicaoCents(
  perfil: boolean | RefeicaoPerfil,
  settings?: Record<string, number | string | undefined> | null,
): { almocoCents: number; jantarCents: number } {
  const read = (key: string, def: number): number => {
    const raw = settings?.[key];
    const n = typeof raw === "string" ? parseInt(raw, 10) : raw;
    return (typeof n === "number" && Number.isFinite(n) && n > 0) ? n : def;
  };
  switch (toPerfil(perfil)) {
    case "ceno":
      return { almocoCents: read("alimentacao_almoco_ceno", 3500), jantarCents: read("alimentacao_jantar_ceno", 3500) };
    case "gestao":
      return { almocoCents: read("alimentacao_almoco_gestao", 4400), jantarCents: read("alimentacao_jantar_gestao", 4400) };
    default:
      return { almocoCents: read("alimentacao_almoco", 4000), jantarCents: read("alimentacao_jantar", 4000) };
  }
}

/** Chave (Valores Padrão) do almoço em dia útil para colaborador `casa` (CLT). */
export const ALIMENTACAO_ALMOCO_CASA_UTIL_KEY = "alimentacao_almoco_casa_util";
/** Default: R$ 5,00 — só a "diferença", o vale-refeição cobre o resto. */
export const ALIMENTACAO_ALMOCO_CASA_UTIL_DEFAULT_CENTS = 500; // R$ 5,00 — corrigido pelo usuário em 17/08 (era 800)
/** Idem para CENOTÉCNICA de casa (regra 17/08): almoço em dia útil R$ 3,00. */
export const ALIMENTACAO_ALMOCO_CASA_UTIL_CENO_KEY = "alimentacao_almoco_casa_util_ceno";
export const ALIMENTACAO_ALMOCO_CASA_UTIL_CENO_DEFAULT_CENTS = 300;

/** VR cadastrado (centavos ≥ 0) ou null — "sem VR" (null, vazio, negativo, NaN). */
export function vrValido(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

/**
 * Valores de refeição (centavos) para UM dia específico, considerando o tipo
 * do colaborador (regra de negócio 17/08):
 * - `casa` (CLT) em dia ÚTIL: almoço = `alimentacao_almoco_casa_util`
 *   (default R$ 5,00); cenotécnica de casa: `alimentacao_almoco_casa_util_ceno`
 *   (default R$ 3,00). Jantar inalterado (40 / 35 ceno).
 * - `freela`: NÃO recebe alimentação (26/08) — o cachê já cobre a refeição.
 * - `casa` em fim de semana, `local` e cenotécnica: iguais a
 *   `refeicaoCents` (a regra do voo continua decidindo QUAIS refeições existem).
 * - perfil "gestao" (Key Account / Gerente, 18/08): casa em dia útil usa o
 *   MESMO almoço reduzido de "demais" (R$ 5,00); o jantar é o de gestão (R$ 44).
 * - VR do colaborador (28/10, pedido do DP): `casa` em dia ÚTIL com VR
 *   cadastrado (`ctx.vrDiarioCents`, collaborators.vr_diario_cents) paga
 *   almoço = max(0, almoço da regra da função − VR) — R$ 40 demais, R$ 44
 *   gestão, R$ 35 ceno. Ex.: VR R$ 40,50 → almoço R$ 0,00 (o VR já cobre).
 *   Sem VR (null), o valor fixo acima ("só a diferença do VR" de R$ 35).
 * O 1º argumento aceita o perfil ou o boolean legado `cenotecnica`.
 */
export function refeicaoCentsDia(
  perfil: boolean | RefeicaoPerfil,
  settings: Record<string, number | string | undefined> | null | undefined,
  ctx: { tipoColaborador?: string | null; isWeekend: boolean; vrDiarioCents?: number | null },
): { almocoCents: number; jantarCents: number } {
  const p = toPerfil(perfil);
  const cenotecnica = p === "ceno";
  const base = refeicaoCents(p, settings);
  // FREELA NÃO RECEBE ALIMENTAÇÃO (decisão do dono, 26/08). O freela é
  // contratado por cachê fechado — a refeição já está dentro dele, e pagar por
  // fora dobrava o custo no Planejado. Vale em qualquer evento, útil ou fim de
  // semana. Antes o freela recebia o mesmo que "casa" em fim de semana.
  if (ctx.tipoColaborador === "freela") return { almocoCents: 0, jantarCents: 0 };
  const vr = vrValido(ctx.vrDiarioCents);
  if (ctx.tipoColaborador === "casa" && !ctx.isWeekend && vr !== null) {
    return { almocoCents: Math.max(0, base.almocoCents - vr), jantarCents: base.jantarCents };
  }
  if (ctx.tipoColaborador === "casa" && !ctx.isWeekend) {
    const key = cenotecnica ? ALIMENTACAO_ALMOCO_CASA_UTIL_CENO_KEY : ALIMENTACAO_ALMOCO_CASA_UTIL_KEY;
    const def = cenotecnica ? ALIMENTACAO_ALMOCO_CASA_UTIL_CENO_DEFAULT_CENTS : ALIMENTACAO_ALMOCO_CASA_UTIL_DEFAULT_CENTS;
    const raw = settings?.[key];
    const n = typeof raw === "string" ? parseInt(raw, 10) : raw;
    const almoco = (typeof n === "number" && Number.isFinite(n) && n > 0) ? n : def;
    return { almocoCents: almoco, jantarCents: base.jantarCents };
  }
  return base;
}

/**
 * Normaliza um horário escrito de forma livre ("van - 10h", "chega 09:30",
 * "1430") para o formato "HH:MM" que o `<input type="time">` aceita.
 * Retorna `null` quando não há horário reconhecível no texto.
 *
 * Aditivo (18/08): o Realizado precisa PRÉ-PREENCHER os campos de hora do
 * bloco "Viagem" com o que já existe — a passagem registrada (HH:MM limpo) ou
 * o horário sugerido na escalação (texto livre). Nenhuma assinatura existente
 * foi alterada.
 */
export function toHoraHHMM(texto: string | null | undefined): string | null {
  const min = parseHoraMin(texto);
  if (min === null) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
