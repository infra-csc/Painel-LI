/**
 * Datas de ENTRADA e SAÍDA do quarto no Espelho (09/10) — regra pura, sem
 * banco, usada pelo recálculo de sugestões (servidor) e pela aba Quartos.
 *
 * Regra do dono: "a data vir sempre da passagem e não da diária".
 *   - Entrada = dia em que a pessoa CHEGA na ida. A passagem guarda a data de
 *     partida; se a chegada passa da meia-noite (hora de chegada menor que a
 *     de partida no relógio), a pessoa chega — e entra no quarto — no dia
 *     seguinte.
 *   - Saída = data da volta. "Quem volta após 18h ganha uma diária no dia
 *     seguinte" (dono, 09/10): volta a partir de HORA_DA_VOLTA_COM_DIARIA_EXTRA
 *     sai do quarto um dia depois.
 *   - Cada lado cai, nesta ordem: passagem → datas sugeridas de viagem da
 *     vaga → hospedagem já registrada → período da escala.
 *   - A hospedagem JÁ RESERVADA não vence a passagem, mas também não some:
 *     quando diverge, a função devolve o aviso para quem confere.
 *
 * Vale só para as datas do quarto no Espelho — o cálculo de diárias do
 * Planejado/Realizado tem regra própria (shared/budget-engine.ts).
 */

/**
 * Volta com partida a partir deste horário (minutos desde 00:00, INCLUSIVE)
 * ganha uma diária no dia seguinte — a saída do quarto vira volta + 1 dia.
 */
export const HORA_DA_VOLTA_COM_DIARIA_EXTRA = 18 * 60;

export type OrigemDaDataDoQuarto = "passagem" | "sugerida" | "hospedagem" | "escala";

export interface PassagemDoQuarto {
  actualDepartureDate?: string | null;
  actualDepartureTime?: string | null;
  /** Hora de chegada da IDA. */
  actualArrivalTime?: string | null;
  actualReturnDate?: string | null;
  /** Hora de partida da VOLTA. */
  actualReturnTime?: string | null;
}

export interface EntradaDasDatasDoQuarto {
  passagem?: PassagemDoQuarto | null;
  vaga: {
    flightDepartureDate?: string | null;
    flightReturnDate?: string | null;
    /** Texto livre em faixa ("20h+", "depois das 20h", "18-22h"). */
    flightReturnSuggestedTime?: string | null;
    scheduleStartDate?: string | null;
    scheduleEndDate?: string | null;
  };
  hospedagem?: { checkInDate?: string | null; checkOutDate?: string | null } | null;
}

export interface DatasDoQuarto {
  checkIn: string | null;
  checkOut: string | null;
  origemEntrada: OrigemDaDataDoQuarto | null;
  origemSaida: OrigemDaDataDoQuarto | null;
  /** A ida pousa depois da meia-noite: entrada no dia seguinte à partida. */
  chegadaDepoisDaMeiaNoite: boolean;
  /** Volta a partir das 18h: saída um dia depois. `horario` é o que decidiu ("21:05"). */
  diariaExtraNaVolta: { horario: string } | null;
  /** Hospedagem reservada com datas diferentes das usadas — conferir. */
  divergencia: {
    reservada: { checkIn: string | null; checkOut: string | null };
    usada: { checkIn: string | null; checkOut: string | null };
    texto: string;
  } | null;
}

const ymd = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/** "2026-04-22" + 1 → "2026-04-23" (em UTC, sem fuso no meio). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** "21:05" → 1265. Só HH:MM (como a passagem guarda). Inválido → null. */
function minutosHHMM(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(v));
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

/**
 * Hora INICIAL de um horário sugerido em texto livre → minutos. "20h+" → 1200,
 * "depois das 20h" → 1200, "18-22h" → 1080, "8-14h" → 480, "8h às 10h" → 480,
 * "21:30" → 1290, "0900" → 540. Sem número reconhecível → null.
 */
export function horaInicialDaFaixa(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const m = /(\d{1,4})(?:\s*[:h]\s*(\d{2}))?/i.exec(String(texto));
  if (!m) return null;
  let h: number, min: number;
  if (m[1].length >= 3 && m[2] === undefined) {
    const raw = m[1].padStart(4, "0");
    h = Number(raw.slice(0, 2));
    min = Number(raw.slice(2));
  } else {
    h = Number(m[1]);
    min = Number(m[2] ?? 0);
  }
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** "2026-04-22" → "22/04". */
const ddmm = (v: string | null) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}` : "—");

const ROTULO_DA_ORIGEM: Record<OrigemDaDataDoQuarto, string> = {
  passagem: "passagem",
  sugerida: "datas sugeridas",
  hospedagem: "hospedagem",
  escala: "escala",
};

export function datasDoQuarto(e: EntradaDasDatasDoQuarto): DatasDoQuarto {
  const t = e.passagem ?? null;
  const acc = e.hospedagem ?? null;

  // ── Entrada
  let checkIn: string | null = null;
  let origemEntrada: OrigemDaDataDoQuarto | null = null;
  let chegadaDepoisDaMeiaNoite = false;
  const idaPassagem = ymd(t?.actualDepartureDate);
  if (idaPassagem) {
    const partida = minutosHHMM(t?.actualDepartureTime);
    const chegada = minutosHHMM(t?.actualArrivalTime);
    chegadaDepoisDaMeiaNoite = partida !== null && chegada !== null && chegada < partida;
    checkIn = chegadaDepoisDaMeiaNoite ? somarDias(idaPassagem, 1) : idaPassagem;
    origemEntrada = "passagem";
  } else if (ymd(e.vaga.flightDepartureDate)) {
    checkIn = ymd(e.vaga.flightDepartureDate);
    origemEntrada = "sugerida";
  } else if (ymd(acc?.checkInDate)) {
    checkIn = ymd(acc?.checkInDate);
    origemEntrada = "hospedagem";
  } else if (ymd(e.vaga.scheduleStartDate)) {
    checkIn = ymd(e.vaga.scheduleStartDate);
    origemEntrada = "escala";
  }

  // ── Saída
  let checkOut: string | null = null;
  let origemSaida: OrigemDaDataDoQuarto | null = null;
  let diariaExtraNaVolta: DatasDoQuarto["diariaExtraNaVolta"] = null;
  const voltaPassagem = ymd(t?.actualReturnDate);
  const voltaSugerida = ymd(e.vaga.flightReturnDate);
  if (voltaPassagem || voltaSugerida) {
    const daPassagem = !!voltaPassagem;
    const base = (voltaPassagem ?? voltaSugerida) as string;
    // Com passagem vale o horário da passagem (sem horário, sem +1); sem
    // passagem, a hora inicial da faixa sugerida.
    const minutos = daPassagem ? minutosHHMM(t?.actualReturnTime) : horaInicialDaFaixa(e.vaga.flightReturnSuggestedTime);
    if (minutos !== null && minutos >= HORA_DA_VOLTA_COM_DIARIA_EXTRA) {
      diariaExtraNaVolta = { horario: daPassagem ? hhmm(minutos) : String(e.vaga.flightReturnSuggestedTime).trim() };
      checkOut = somarDias(base, 1);
    } else {
      checkOut = base;
    }
    origemSaida = daPassagem ? "passagem" : "sugerida";
  } else if (ymd(acc?.checkOutDate)) {
    checkOut = ymd(acc?.checkOutDate);
    origemSaida = "hospedagem";
  } else if (ymd(e.vaga.scheduleEndDate)) {
    checkOut = ymd(e.vaga.scheduleEndDate);
    origemSaida = "escala";
  }

  // ── Hospedagem reservada x datas usadas
  let divergencia: DatasDoQuarto["divergencia"] = null;
  const resIn = ymd(acc?.checkInDate);
  const resOut = ymd(acc?.checkOutDate);
  const difereIn = !!resIn && origemEntrada !== "hospedagem" && !!checkIn && resIn !== checkIn;
  const difereOut = !!resOut && origemSaida !== "hospedagem" && !!checkOut && resOut !== checkOut;
  if (difereIn || difereOut) {
    const origem = origemEntrada === origemSaida || !difereOut ? origemEntrada : origemSaida;
    divergencia = {
      reservada: { checkIn: resIn, checkOut: resOut },
      usada: { checkIn, checkOut },
      texto: `Hospedagem reservada ${ddmm(resIn)}→${ddmm(resOut)}, ${ROTULO_DA_ORIGEM[origem ?? "passagem"]} ${ddmm(checkIn)}→${ddmm(checkOut)} — conferir`,
    };
  }

  return { checkIn, checkOut, origemEntrada, origemSaida, chegadaDepoisDaMeiaNoite, diariaExtraNaVolta, divergencia };
}

/** Selo curto da origem, para a linha: "da passagem", "sugerida", "da hospedagem", "da escala". */
export function seloDaOrigem(origem: OrigemDaDataDoQuarto | null): string | null {
  switch (origem) {
    case "passagem": return "da passagem";
    case "sugerida": return "sugerida";
    case "hospedagem": return "da hospedagem";
    case "escala": return "da escala";
    default: return null;
  }
}
