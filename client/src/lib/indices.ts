/**
 * Índices puros para listas vindas do servidor (23/09).
 *
 * As telas do Financeiro faziam `lista.find(x => x.id === id)` dentro de
 * `.map`/`.sort` — O(n·m) com 4.500 vagas × 1.000 colaboradores a cada
 * render. Aqui a lista vira `Map` uma vez (dentro de um `useMemo`) e cada
 * consulta passa a ser O(1). Sem React: funções puras, testáveis.
 *
 * Semântica idêntica ao `Array.find`: em ids repetidos, o PRIMEIRO vence.
 */

export type ComId = { id: string };

/** `[{id:"a",…},{id:"b",…}]` → `Map("a" → item, "b" → item)`. Primeiro id repetido vence. */
export function indexarPorId<T extends ComId>(lista: readonly T[] | null | undefined): Map<string, T> {
  const mapa = new Map<string, T>();
  if (!lista) return mapa;
  for (const item of lista) {
    if (item && item.id != null && !mapa.has(item.id)) mapa.set(item.id, item);
  }
  return mapa;
}

/**
 * Nome (ou qualquer campo) a partir de um mapa `id → texto`.
 * `id` vazio/nulo ou ausente do mapa devolve o `fallback` ("—" por padrão).
 */
export function nomePorId(
  mapa: ReadonlyMap<string, string>,
  id: string | null | undefined,
  fallback = "—",
): string {
  if (!id) return fallback;
  return mapa.get(id) || fallback;
}

/**
 * Agrupa por uma chave (nome de campo ou função). A ordem original dos itens é
 * preservada dentro de cada grupo — o `find` dentro de um grupo continua
 * devolvendo o mesmo item que o `find` na lista inteira devolveria.
 * Chaves `null`/`undefined` viram a string "" (um grupo só para "sem chave").
 */
export function agruparPor<T, K extends keyof T>(lista: readonly T[] | null | undefined, chave: K): Map<string, T[]>;
export function agruparPor<T>(lista: readonly T[] | null | undefined, chave: (item: T) => string | number | null | undefined): Map<string, T[]>;
export function agruparPor<T>(
  lista: readonly T[] | null | undefined,
  chave: keyof T | ((item: T) => string | number | null | undefined),
): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  if (!lista) return grupos;
  const chaveDe = typeof chave === "function"
    ? chave
    : (item: T) => item[chave] as unknown as string | number | null | undefined;
  for (const item of lista) {
    const bruta = chaveDe(item);
    const k = bruta == null ? "" : String(bruta);
    const grupo = grupos.get(k);
    if (grupo) grupo.push(item);
    else grupos.set(k, [item]);
  }
  return grupos;
}

/** Chave composta estável para índices por mais de um campo ("a|b|c"). */
export function chaveComposta(...partes: (string | number | null | undefined)[]): string {
  return partes.map(p => (p == null ? "" : String(p))).join("|");
}
