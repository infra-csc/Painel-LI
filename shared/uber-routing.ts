/**
 * Roteirização de Uber — quem divide o carro, de onde ele sai e a que horas.
 *
 * Regra do dono (09/10): "Na ida é Norte × Aeroporto, na volta Hotel × Aeroporto."
 *
 * - IDA: o carro sai da NORTE (a empresa, na cidade de origem) para o
 *   aeroporto de embarque da ida. Quem sai de outra cidade ("Sai de" da vaga
 *   fora de São Paulo) vai num carro daquela cidade — nunca no da Norte.
 * - VOLTA: o carro sai do HOTEL do evento para o aeroporto de embarque da
 *   VOLTA. Antes a volta era "Aeroporto → Norte", medida pelo pouso (buscar
 *   15 min depois do último pouso) — o carro ficava na cidade errada.
 *
 * Nas duas direções o carro é pensado pelo EXTREMO que não pode falhar: sai
 * com a antecedência configurada antes do voo MAIS CEDO do grupo (ninguém
 * perde voo). Não é a média: quem voa 04:55 e quem voa 05:50 saíam juntos num
 * horário que servia mal para os dois (31/08).
 *
 * Regra pura: sem banco e sem rede, porque é a mesma conta que o servidor faz
 * ao sugerir e que a tela usa para explicar o carro.
 */
import { isEventoEmSP } from "./atendimento";

/** Minutos entre o primeiro voo do carro e o próximo que ainda cabe nele. */
export const JANELA_MIN = 90;
/** O carro sai com esta antecedência do voo mais cedo do grupo — na ida e na volta. */
export const ANTECEDENCIA_MIN = 180;
/**
 * Espera depois do pouso — NÃO É MAIS USADA desde 09/10 (a volta agora sai do
 * hotel para o aeroporto, pela antecedência). Fica só como padrão da chave
 * `uber_pickup_wait_minutes`, que não foi apagada.
 * @deprecated
 */
export const ESPERA_POUSO_MIN = 15;

/** De onde sai o carro da ida quando a pessoa sai da cidade da empresa. */
export const ORIGEM_NORTE = "Norte";
/** De onde sai o carro da volta quando a hospedagem não diz o hotel. */
export const HOTEL_PADRAO = "Hotel/Local do evento";

/** "07:35" → 455. Vazio ou inválido → null. */
export function minutosDaHora(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const m = String(hora).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 455 → "07:35". Antes da meia-noite vira "00:00" — o carro não sai no dia anterior. */
export function horaDosMinutos(minutos: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutos)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * De onde sai o carro da IDA: "Norte" quando a pessoa sai de São Paulo / Grande
 * SP (ou quando não há como saber); senão, a própria cidade de saída — gente de
 * cidades diferentes não divide carro.
 */
export function origemDaIda(saiDe: string | null | undefined): string {
  const cidade = String(saiDe ?? "").trim();
  if (!cidade) return ORIGEM_NORTE;
  // A UF sozinha não basta: "Campinas - SP" é SP, mas não sai da Norte. Sem o
  // sufixo, sobra o município — São Paulo e a Grande SP contam como Norte.
  const semUf = cidade.replace(/\s*[-–/(,]\s*sp\s*\)?\s*$/i, "").trim();
  return isEventoEmSP(semUf || cidade) ? ORIGEM_NORTE : cidade;
}

/** Os campos da passagem que decidem o carro (subconjunto de `tickets`). */
export interface PassagemDoCarro {
  departureAirport?: string | null;
  departureCityOrigin?: string | null;
  destinationAirport?: string | null;
  returnOriginAirport?: string | null;
  returnCityOrigin?: string | null;
  actualDepartureDate?: string | null;
  actualDepartureTime?: string | null;
  actualReturnDate?: string | null;
  actualReturnTime?: string | null;
}

/**
 * O voo que o carro leva a pessoa para pegar, nesta direção: data, aeroporto
 * de EMBARQUE e hora da PARTIDA.
 * - ida: aeroporto de origem da ida;
 * - volta: aeroporto de origem da VOLTA (na falta, a cidade de origem da volta
 *   ou o aeroporto de destino da ida — é de lá que se volta).
 */
export function vooDoCarro(t: PassagemDoCarro | null | undefined, direcao: "ida" | "volta"): {
  data: string | null;
  aeroporto: string | null;
  hora: string | null;
  minutos: number | null;
} {
  if (direcao === "ida") {
    const hora = t?.actualDepartureTime || null;
    return {
      data: t?.actualDepartureDate || null,
      aeroporto: t?.departureAirport || t?.departureCityOrigin || null,
      hora,
      minutos: minutosDaHora(hora),
    };
  }
  const hora = t?.actualReturnTime || null;
  return {
    data: t?.actualReturnDate || null,
    aeroporto: t?.returnOriginAirport || t?.returnCityOrigin || t?.destinationAirport || null,
    hora,
    minutos: minutosDaHora(hora),
  };
}

/** Uma pessoa a ser levada ao aeroporto num dia, num horário. */
export interface Passageiro {
  /** Identifica a pessoa — o agrupamento não interpreta este valor. */
  id: string;
  data: string;
  /** Aeroporto de embarque. */
  aeroporto: string;
  /**
   * De onde o carro sai: "Norte" ou a cidade de saída na ida; o hotel na volta.
   * Vazio = um ponto só (não separa ninguém).
   */
  local?: string;
  /** Hora da PARTIDA do voo (é dela que sai a antecedência), nas duas direções. */
  minutos: number | null;
}

export interface Carro {
  data: string;
  aeroporto: string;
  local: string;
  passageiros: Passageiro[];
  /** Horário sugerido do carro, "HH:MM" — null quando ninguém tem horário. */
  horario: string | null;
}

/**
 * Agrupa quem divide o carro: mesma data, mesmo aeroporto, mesmo ponto de
 * saída (Norte/cidade na ida, hotel na volta) e voos dentro da janela a partir
 * do PRIMEIRO do carro.
 *
 * Igualdade exata de horário não serve — quem voa 04:55, 05:30 e 05:50 do mesmo
 * aeroporto no mesmo dia tem que dividir o carro.
 *
 * Quem não tem horário fica sozinho: juntá-lo a um carro qualquer seria decidir
 * por um dado que não existe.
 */
export function agruparEmCarros(
  passageiros: Passageiro[],
  direcao: "ida" | "volta",
  opcoes: { janelaMin?: number; maxPorCarro?: number; antecedenciaMin?: number } = {},
): Carro[] {
  const janela = opcoes.janelaMin ?? JANELA_MIN;
  const maxPorCarro = opcoes.maxPorCarro ?? Infinity;

  // Chave em JSON: nome de hotel pode ter qualquer caractere, inclusive "|".
  const porChave = new Map<string, Passageiro[]>();
  for (const p of passageiros) {
    const chave = JSON.stringify([p.data, p.aeroporto, p.local ?? ""]);
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave)!.push(p);
  }

  const carros: Carro[] = [];
  for (const lista of Array.from(porChave.values())) {
    const { data, aeroporto } = lista[0];
    const local = lista[0].local ?? "";
    // Sem horário vai para o fim: não puxa a janela de ninguém.
    const ordenada = [...lista].sort((a, b) => (a.minutos ?? Number.MAX_SAFE_INTEGER) - (b.minutos ?? Number.MAX_SAFE_INTEGER));

    let atual: Passageiro[] = [];
    const fechar = () => {
      if (atual.length === 0) return;
      carros.push({ data, aeroporto, local, passageiros: atual, horario: horarioDoCarro(atual, direcao, opcoes) });
      atual = [];
    };

    for (const p of ordenada) {
      if (atual.length === 0) { atual.push(p); continue; }
      const primeiro = atual[0].minutos;
      const cabeNaJanela =
        primeiro != null && p.minutos != null && p.minutos - primeiro <= janela;
      if (cabeNaJanela && atual.length < maxPorCarro) atual.push(p);
      else { fechar(); atual.push(p); }
    }
    fechar();
  }
  return carros;
}

/**
 * O horário do carro é do CARRO, não da pessoa: voo mais cedo do grupo −
 * antecedência, na ida (Norte → aeroporto) e na volta (hotel → aeroporto).
 * A direção fica na assinatura porque é a mesma conta para as duas desde 09/10.
 */
export function horarioDoCarro(
  passageiros: Passageiro[],
  _direcao: "ida" | "volta",
  opcoes: { antecedenciaMin?: number } = {},
): string | null {
  const minutos = passageiros.map((p) => p.minutos).filter((m): m is number => m != null);
  if (minutos.length === 0) return null;
  return horaDosMinutos(Math.min(...minutos) - (opcoes.antecedenciaMin ?? ANTECEDENCIA_MIN));
}
