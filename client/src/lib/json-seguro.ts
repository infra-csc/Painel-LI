/**
 * Leitura tolerante de colunas jsonb (25/09).
 *
 * O banco passou a guardar `history`, `rhAdjustedFields`, `changesLog` e
 * `previous_data/new_data` como jsonb, então o TIPO compartilhado diz "objeto".
 * Mas a API ainda serializa esses campos como string na borda (ver
 * `serializarJsonNaBorda` em server/http.ts) para não quebrar o client de um
 * dia para o outro. Enquanto os dois formatos coexistirem, quem lê aceita os
 * dois: string → JSON.parse; objeto → devolve como está; inválido → null.
 */
export function lerJson<T>(valor: string | T | null | undefined): T | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor !== "string") return valor;
  try {
    return JSON.parse(valor) as T;
  } catch {
    return null;
  }
}
