// Trecho direto entre eventos (23/10, print do dono: Viva Esporte Vila Velha →
// Serra). Quando os dois eventos ficam na região do MESMO aeroporto, o trecho
// direto é por terra: não há voo a buscar nem passagem aérea a registrar. A
// regra é a da Busca de passagens (`mesmo_aeroporto` em
// shared/busca-de-passagens.ts): aeroporto principal do evento anterior igual
// ao do evento da vaga. Só muda a apresentação — o encadeamento continua o
// mesmo (shared/janela-de-viagem.ts).
import { aeroportosDaCidade, aeroportosDoEvento } from "@shared/aeroportos-do-brasil";
import type { RefDeVaga } from "@shared/janela-de-viagem";

type Anterior = Pick<RefDeVaga, "cidade" | "eventName">;

/**
 * Aeroporto comum quando o evento anterior e o desta vaga ficam na mesma
 * região ("VIX" para Vila Velha → Serra); null quando são regiões diferentes
 * ou quando uma das cidades é desconhecida (aí vale o caminho de sempre).
 */
export function aeroportoComumDoTrechoDireto(
  anterior: Anterior,
  atual: { location?: string | null; name?: string | null },
): string | null {
  const de = aeroportosDoEvento({ location: anterior.cidade, name: anterior.eventName })[0];
  const para = aeroportosDoEvento(atual)[0];
  return de && para && de === para ? de : null;
}

/**
 * Onde fica o evento anterior, curto, para o título "Vem direto de …": a
 * cidade do local quando é conhecida; senão a cidade que o NOME do evento
 * traz entre hífens ("Viva Esporte - 2026 - Vila Velha" com local "Fundão" →
 * "Vila Velha"); senão o que houver.
 */
export function ondeFicaOEventoAnterior(anterior: Anterior): string {
  const cidade = String(anterior.cidade ?? "").trim();
  if (cidade && aeroportosDaCidade(cidade).length > 0) return cidade;
  const doNome = String(anterior.eventName ?? "")
    .split(/\s+[-–—]\s+/)
    .map((p) => p.trim())
    .reverse()
    .find((p) => !/^\d+$/.test(p) && aeroportosDaCidade(p).length > 0);
  return doNome || cidade || anterior.eventName;
}
