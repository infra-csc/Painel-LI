/**
 * Sanidade das pernas de uma passagem (19/10 — caso #3913, Night Run Teresina).
 *
 * Um voucher lido com uma linha de deslocamento grava lixo plausível: o
 * destino de um voo vira a origem do seguinte e a passagem sai "THE → THE,
 * 17:35 → 12:15". Nenhum campo fica vazio, então nada avisava. Duas regras
 * pegam esse tipo de leitura:
 *   - origem igual ao destino na MESMA perna (THE→THE, FOR→FOR);
 *   - no aéreo, chegada antes da partida sem uma virada de meia-noite
 *     plausível (17:35 → 12:15 seriam 18h40 de voo).
 *
 * Puro e compartilhado: o leitor de voucher recusa a leitura antes de
 * preencher, e a lista de Passagens marca o que já foi gravado assim.
 */

export type PernaDaPassagem = "ida" | "volta";

export interface ProblemaNaPerna {
  trecho: PernaDaPassagem;
  motivo: "mesmo_lugar" | "chegada_antes_da_partida";
  /** Frase curta, para aviso e tooltip: "Ida THE→THE: origem igual ao destino". */
  texto: string;
}

type Campos = Record<string, unknown>;

/** Campos de cada perna, no nome usado pela passagem e pelo formulário. */
const PERNAS: Record<PernaDaPassagem, { origem: string; destino: string; partida: string; chegada: string; rotulo: string }> = {
  ida: { origem: "departureAirport", destino: "destinationAirport", partida: "actualDepartureTime", chegada: "actualArrivalTime", rotulo: "Ida" },
  volta: { origem: "returnOriginAirport", destino: "returnDestinationAirport", partida: "actualReturnTime", chegada: "returnArrivalTime", rotulo: "Volta" },
};

/**
 * Voo que pousa "antes" de decolar só é verdade se virou a meia-noite — e, no
 * doméstico, mesmo com conexão, não passa disto. 23:30 → 01:10 (1h40) passa;
 * 17:35 → 12:15 (18h40) não.
 */
export const VIRADA_DA_NOITE_MAX_MIN = 14 * 60;

const texto = (v: unknown) => String(v ?? "").trim();
const lugar = (v: unknown) => texto(v).toLocaleUpperCase("pt-BR").replace(/\s+/g, " ");

/** "17:35" → 1055; fora do formato, null. */
function minutosDoDia(v: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto(v));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Van e transporte terrestre usam esses campos para outra coisa. */
const ehTerrestre = (c: Campos) => c.transportType === "van";
// Por trecho (28/10): a volta de ônibus numa passagem aérea não é voo — o
// ônibus noturno (23:45 → 06:25) chega "antes" da partida e é normal.
const ehAereoNo = (c: Campos, trecho: PernaDaPassagem) => {
  const tipo = trecho === "volta" && texto(c.returnTransportType) ? c.returnTransportType : c.transportType;
  return !texto(tipo) || tipo === "aereo";
};

/** Perna com a mesma origem e destino (THE→THE). É a regra do levantamento. */
export function pernasComOrigemIgualAoDestino(c: Campos | null | undefined): ProblemaNaPerna[] {
  if (!c || ehTerrestre(c)) return [];
  const out: ProblemaNaPerna[] = [];
  for (const trecho of ["ida", "volta"] as const) {
    const p = PERNAS[trecho];
    const origem = lugar(c[p.origem]);
    if (origem && origem === lugar(c[p.destino])) {
      out.push({ trecho, motivo: "mesmo_lugar", texto: `${p.rotulo} ${texto(c[p.origem])}→${texto(c[p.destino])}: origem igual ao destino` });
    }
  }
  return out;
}

/** Chegada antes da partida sem virada de meia-noite plausível (só aéreo). */
export function pernasComHorarioImpossivel(c: Campos | null | undefined): ProblemaNaPerna[] {
  if (!c) return [];
  const out: ProblemaNaPerna[] = [];
  for (const trecho of ["ida", "volta"] as const) {
    if (!ehAereoNo(c, trecho)) continue;
    const p = PERNAS[trecho];
    const partida = minutosDoDia(c[p.partida]);
    const chegada = minutosDoDia(c[p.chegada]);
    if (partida === null || chegada === null || chegada >= partida) continue;
    const duracao = 24 * 60 - partida + chegada;
    if (duracao > VIRADA_DA_NOITE_MAX_MIN) {
      out.push({
        trecho, motivo: "chegada_antes_da_partida",
        texto: `${p.rotulo} sai ${texto(c[p.partida])} e chega ${texto(c[p.chegada])}: a chegada fica antes da partida`,
      });
    }
  }
  return out;
}

/** As duas regras juntas — o que o leitor de voucher confere antes de preencher. */
export function problemasNasPernas(c: Campos | null | undefined): ProblemaNaPerna[] {
  return [...pernasComOrigemIgualAoDestino(c), ...pernasComHorarioImpossivel(c)];
}

/** Rótulo do sinal na lista de Passagens. */
export const ROTULO_LEITURA_SUSPEITA = "Leitura do voucher suspeita, confira";
