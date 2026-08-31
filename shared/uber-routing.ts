/**
 * Roteirização de Uber (31/08) — quem divide o carro e a que horas ele sai.
 *
 * Duas correções em relação ao que existia:
 *
 * 1. O horário do carro era a MÉDIA dos voos do grupo. Ninguém sai na média:
 *    quem voa 04:55 e quem voa 05:50 saíam juntos num horário que servia mal
 *    para os dois. Agora o carro é pensado pelo EXTREMO que não pode falhar —
 *    na ida, o voo mais cedo (ninguém perde voo); na volta, o último pouso
 *    (ninguém espera sozinho no aeroporto).
 *
 * 2. A volta passa a olhar o POUSO, não a hora do voo. Sem isso a tela mostrava
 *    a hora da decolagem e quem lia fazia a conta de cabeça.
 *
 * Regra pura: sem banco e sem rede, porque é a mesma conta que o servidor faz
 * ao sugerir e que a tela precisa refazer quando alguém troca de carro.
 */

/** Minutos entre o primeiro voo do carro e o próximo que ainda cabe nele. */
export const JANELA_MIN = 90;
/** O carro sai com esta antecedência do voo mais cedo do grupo. */
export const ANTECEDENCIA_MIN = 180;
/** O carro busca este tanto depois do último pouso do grupo. */
export const ESPERA_POUSO_MIN = 15;

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

/** Uma pessoa a ser levada (ou buscada) num dia, num aeroporto, num horário. */
export interface Passageiro {
  /** Identifica a pessoa — o agrupamento não interpreta este valor. */
  id: string;
  data: string;
  aeroporto: string;
  /**
   * Ida: hora do VOO (é dela que sai a antecedência).
   * Volta: hora do POUSO (é dela que sai a espera).
   */
  minutos: number | null;
}

export interface Carro {
  data: string;
  aeroporto: string;
  passageiros: Passageiro[];
  /** Horário sugerido do carro, "HH:MM" — null quando ninguém tem horário. */
  horario: string | null;
}

/**
 * Agrupa quem divide o carro: mesma data, mesmo aeroporto e voos dentro da
 * janela a partir do PRIMEIRO do carro.
 *
 * Igualdade exata de horário não serve — quem voa 04:55, 05:30 e 05:50 do mesmo
 * aeroporto no mesmo dia tem que dividir o carro, e era isso que a comparação
 * por horário idêntico não fazia.
 *
 * Quem não tem horário fica sozinho: juntá-lo a um carro qualquer seria decidir
 * por um dado que não existe.
 */
export function agruparEmCarros(
  passageiros: Passageiro[],
  direcao: "ida" | "volta",
  opcoes: { janelaMin?: number; maxPorCarro?: number; antecedenciaMin?: number; esperaPousoMin?: number } = {},
): Carro[] {
  const janela = opcoes.janelaMin ?? JANELA_MIN;
  const maxPorCarro = opcoes.maxPorCarro ?? Infinity;

  const porChave = new Map<string, Passageiro[]>();
  for (const p of passageiros) {
    const chave = `${p.data}|${p.aeroporto}`;
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave)!.push(p);
  }

  const carros: Carro[] = [];
  for (const [chave, lista] of Array.from(porChave.entries())) {
    const [data, aeroporto] = chave.split("|");
    // Sem horário vai para o fim: não puxa a janela de ninguém.
    const ordenada = [...lista].sort((a, b) => (a.minutos ?? Number.MAX_SAFE_INTEGER) - (b.minutos ?? Number.MAX_SAFE_INTEGER));

    let atual: Passageiro[] = [];
    const fechar = () => {
      if (atual.length === 0) return;
      carros.push({ data, aeroporto, passageiros: atual, horario: horarioDoCarro(atual, direcao, opcoes) });
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
 * O horário do carro é do CARRO, não da pessoa:
 * - ida: voo mais cedo do grupo − antecedência (ninguém perde voo);
 * - volta: último pouso do grupo + espera (ninguém fica esperando sozinho).
 */
export function horarioDoCarro(
  passageiros: Passageiro[],
  direcao: "ida" | "volta",
  opcoes: { antecedenciaMin?: number; esperaPousoMin?: number } = {},
): string | null {
  const minutos = passageiros.map((p) => p.minutos).filter((m): m is number => m != null);
  if (minutos.length === 0) return null;
  if (direcao === "ida") {
    return horaDosMinutos(Math.min(...minutos) - (opcoes.antecedenciaMin ?? ANTECEDENCIA_MIN));
  }
  return horaDosMinutos(Math.max(...minutos) + (opcoes.esperaPousoMin ?? ESPERA_POUSO_MIN));
}
