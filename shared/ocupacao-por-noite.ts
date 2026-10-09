/**
 * Ocupação de um quarto NOITE A NOITE (09/10, pedido do dono).
 *
 * Um "Duplo" com Mauricio 22/04→27/04 e Edney 24/04→26/04 não é duplo o tempo
 * todo: é Single até o Edney chegar, Duplo enquanto os dois estão e Single de
 * novo depois que ele sai. Esta função parte das datas de entrada/saída de cada
 * ocupante (as mesmas que a tela mostra — vindas da passagem) e devolve os
 * TRECHOS consecutivos com os mesmos ocupantes.
 *
 * Convenções: datas "AAAA-MM-DD"; a noite de D vai de D a D+1, então quem
 * entra em 22 e sai em 27 dorme as noites 22, 23, 24, 25 e 26. Ocupante sem
 * data, ou com saída que não é depois da entrada, fica de fora do cálculo.
 * Noites em que ninguém está no quarto não viram trecho.
 */
import { tipoPorOcupantes } from "./room-pairing";

export type TipoDoTrecho = "single" | "double" | "triple";

export interface PeriodoDoOcupante {
  checkIn: string | null | undefined;
  checkOut: string | null | undefined;
}

export interface TrechoDeOcupacao<T extends PeriodoDoOcupante = PeriodoDoOcupante> {
  /** Primeira noite do trecho (dia de entrada). */
  de: string;
  /** Dia da saída do trecho (a noite anterior é a última). */
  ate: string;
  noites: number;
  tipo: TipoDoTrecho;
  /** Quem dorme no quarto nesse trecho, na ordem recebida. */
  ocupantes: T[];
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})/;
const dia = (v: string | null | undefined): string | null => {
  const m = v ? String(v).match(DIA) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const diasEntre = (de: string, ate: string): number => {
  const ms = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((ms(ate) - ms(de)) / 86_400_000);
};

export function ocupacaoPorNoite<T extends PeriodoDoOcupante>(ocupantes: readonly T[]): TrechoDeOcupacao<T>[] {
  const validos = ocupantes
    .map((o) => ({ o, ini: dia(o.checkIn), fim: dia(o.checkOut) }))
    .filter((x): x is { o: T; ini: string; fim: string } => !!x.ini && !!x.fim && x.fim > x.ini);
  if (!validos.length) return [];

  // Cada entrada ou saída é uma fronteira possível de trecho.
  const fronteiras = Array.from(new Set(validos.flatMap((x) => [x.ini, x.fim]))).sort();
  const trechos: TrechoDeOcupacao<T>[] = [];
  for (let i = 0; i < fronteiras.length - 1; i++) {
    const de = fronteiras[i];
    const ate = fronteiras[i + 1];
    const presentes = validos.filter((x) => x.ini <= de && x.fim >= ate).map((x) => x.o);
    if (!presentes.length) continue;
    const anterior = trechos[trechos.length - 1];
    const mesmos = anterior && anterior.ate === de
      && anterior.ocupantes.length === presentes.length
      && anterior.ocupantes.every((o, k) => o === presentes[k]);
    if (mesmos) {
      anterior.ate = ate;
      anterior.noites = diasEntre(anterior.de, ate);
    } else {
      trechos.push({ de, ate, noites: diasEntre(de, ate), tipo: tipoPorOcupantes(presentes.length), ocupantes: presentes });
    }
  }
  return trechos;
}

/** "Single" · "Duplo" · "Triplo" — o rótulo que a tela e o PDF usam. */
export function rotuloDoTipo(tipo: TipoDoTrecho): string {
  return tipo === "single" ? "Single" : tipo === "double" ? "Duplo" : "Triplo";
}

/** Total de diárias de quarto (room-nights) dos trechos. */
export function diariasDosTrechos(trechos: readonly TrechoDeOcupacao[]): number {
  return trechos.reduce((n, t) => n + t.noites, 0);
}
