/**
 * Alimentação automatizada por voo (slide "Ações de melhoria APP LI").
 *
 * Regra confirmada pelo negócio em 14/08/2026:
 * - Quem NÃO voa: sem alimentação (por enquanto; decisão pode ser revista).
 * - Quem voa, por dia do período:
 *   · dia de CHEGADA:  almoço se o voo de ida CHEGA até 11h; jantar se chega até 19h
 *   · dias do MEIO:    almoço + jantar
 *   · dia de RETORNO:  almoço se o voo de volta PARTE a partir das 13h;
 *                      jantar se parte a partir das 21h
 *   · viagem de 1 dia: aplica as duas condições no mesmo dia
 * - Fonte dos horários: a PASSAGEM registrada (chegada da ida =
 *   tickets.actualArrivalTime; partida da volta = tickets.actualReturnTime).
 *   Sem passagem/horário ainda: assume dia cheio e marca `estimado` — o modal
 *   exibe o aviso; não subpaga enquanto a compra não acontece.
 * - Valores por refeição editáveis no Valores Padrão (Demais 40/40,
 *   Cenotécnica 35/35 por padrão).
 *
 * Funções puras — sem I/O, testáveis.
 */
import { parseHoraMin } from "./atendimento";

export interface AlimentacaoDia {
  date: string;          // YYYY-MM-DD
  almoco: boolean;
  jantar: boolean;
  papel: "chegada" | "meio" | "retorno" | "unico";
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
  /** A pessoa voa? (needsTicket) — sem voo, alimentação é zero */
  voa: boolean;
  /** Horário de CHEGADA do voo de ida ("HH:MM") — da passagem registrada */
  chegadaIda?: string | null;
  /** Horário de PARTIDA do voo de volta ("HH:MM") — da passagem registrada */
  partidaVolta?: string | null;
  /** Valor do almoço/jantar em centavos (já escolhidos p/ Demais ou Cenotécnica) */
  almocoCents: number;
  jantarCents: number;
}

// Cortes confirmados pelo negócio
const CHEGADA_ALMOCO_ATE = 11 * 60;      // chega até 11:00 → almoça
const CHEGADA_JANTAR_ATE = 19 * 60;      // chega até 19:00 → janta
const RETORNO_ALMOCO_APOS = 13 * 60;     // volta parte ≥ 13:00 → almoça
const RETORNO_JANTAR_APOS = 21 * 60;     // volta parte ≥ 21:00 → janta

export function calcAlimentacao(input: AlimentacaoInput): AlimentacaoResult {
  const dias: AlimentacaoDia[] = [];
  let estimado = false;

  if (!input.voa || input.workDays.length === 0) {
    return { dias, almocos: 0, jantares: 0, totalCents: 0, estimado: false };
  }

  const sorted = [...input.workDays].sort();
  const chegada = parseHoraMin(input.chegadaIda);
  const partida = parseHoraMin(input.partidaVolta);

  for (let i = 0; i < sorted.length; i++) {
    const primeiro = i === 0;
    const ultimo = i === sorted.length - 1;
    const papel: AlimentacaoDia["papel"] =
      primeiro && ultimo ? "unico" : primeiro ? "chegada" : ultimo ? "retorno" : "meio";

    let almoco = true;
    let jantar = true;

    if (papel === "chegada" || papel === "unico") {
      if (chegada === null) {
        estimado = true; // sem horário da passagem — assume dia cheio
      } else {
        almoco = chegada <= CHEGADA_ALMOCO_ATE;
        jantar = chegada <= CHEGADA_JANTAR_ATE;
      }
    }
    if (papel === "retorno" || papel === "unico") {
      if (partida === null) {
        estimado = true;
      } else {
        // No dia único, a condição do retorno restringe ainda mais
        const a = partida >= RETORNO_ALMOCO_APOS;
        const j = partida >= RETORNO_JANTAR_APOS;
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

/** A função é de cenotécnica? (valores de refeição reduzidos no slide) */
export function isCenotecnicaFunction(functionName: string | null | undefined): boolean {
  if (!functionName) return false;
  const n = functionName.toLowerCase();
  return n.includes("cenotecnica") || n.includes("cenotécnica") || n.includes("ceno");
}

/** Valores de refeição (centavos) a partir do Valores Padrão. */
export function refeicaoCents(
  cenotecnica: boolean,
  settings?: Record<string, number | string | undefined> | null,
): { almocoCents: number; jantarCents: number } {
  const read = (key: string, def: number): number => {
    const raw = settings?.[key];
    const n = typeof raw === "string" ? parseInt(raw, 10) : raw;
    return (typeof n === "number" && Number.isFinite(n) && n > 0) ? n : def;
  };
  return cenotecnica
    ? { almocoCents: read("alimentacao_almoco_ceno", 3500), jantarCents: read("alimentacao_jantar_ceno", 3500) }
    : { almocoCents: read("alimentacao_almoco", 4000), jantarCents: read("alimentacao_jantar", 4000) };
}
