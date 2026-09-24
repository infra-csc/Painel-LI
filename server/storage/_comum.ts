/**
 * Peças compartilhadas pelos módulos de server/storage/ (24/09): erro com
 * status, constantes de phase/status e helpers pequenos que antes se
 * repetiam dentro da classe `DatabaseStorage`.
 *
 * Nada aqui toca o banco.
 */

/** Papel de um responsável na Validação de Escala (function_managers.role). */
export type FunctionManagerRole = "validador" | "aprovador";

/** Phase das vagas ainda em validação pela área (espelha SUGESTAO_PHASE do shared). */
export const SUGESTAO_PHASE_VALUE = "sugestao";

/** Pedido de ajuste ainda em aberto (espelha CHANGE_REQUEST_STATUS.PENDENTE do shared). */
export const PENDING_REQUEST_STATUS = "pendente";

import { HttpError } from "../http";

/**
 * Erro com status HTTP lançado pelo storage (404 vaga excluída, 409 estado
 * mudou). Subclasse de `HttpError` desde 24/09: o tratador global de
 * server/http.ts testa `instanceof HttpError`, e como classe própria um
 * 404/409 que escapasse de um handler virava 500 "Erro interno".
 */
export class StorageHttpError extends HttpError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = "StorageHttpError";
  }
}

/**
 * Ids únicos e não vazios, na ordem da primeira ocorrência. Usado antes de
 * todo `inArray`: lista vazia gera SQL inválido no drizzle, então o chamador
 * devolve [] sem ir ao banco quando o resultado é vazio.
 */
export function idsUnicos(ids: readonly string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

/**
 * Normaliza qualquer valor de data (Date, string ISO, texto) → "YYYY-MM-DD".
 * Devolve `undefined` para vazio ou ilegível.
 *
 * Difere de `toIsoDate` de shared/event-window.ts de propósito: tenta
 * `new Date(texto)` quando o texto não começa com YYYY-MM-DD (o shared
 * devolve null nesse caso). Era o `toIsoDateStr` de
 * routes/integracao-maratona.ts e o miolo do `toIsoDate` interno do storage —
 * unificados aqui porque a semântica era a mesma.
 */
export function normalizarDataIso(d: unknown): string | undefined {
  if (!d) return undefined;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return undefined;
}
