/**
 * Mensagem amigável a partir do erro lançado por `apiRequest` /
 * `getQueryFn` (client/src/lib/queryClient.ts), que enriquece o Error com
 * `.status` e `.body` (JSON da resposta).
 *
 * Substitui as cópias locais `fnErrMsg`/`errMsg`/`getErrorMessage` das telas.
 */
export interface ApiErrorLike {
  status?: number;
  body?: { message?: unknown } | null;
  message?: string;
}

export const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Entre novamente para continuar.";
export const FORBIDDEN_MESSAGE = "Você não tem permissão para esta ação.";

export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = (err ?? {}) as ApiErrorLike;
  if (e.status === 401) return SESSION_EXPIRED_MESSAGE;
  if (e.status === 403) return FORBIDDEN_MESSAGE;
  const m = e.body?.message;
  if (typeof m === "string" && m.trim()) return m;
  return fallback;
}
