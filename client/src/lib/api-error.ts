/**
 * Mensagem amigável a partir do erro lançado por `apiRequest` /
 * `getQueryFn` (client/src/lib/queryClient.ts) — um `ApiError` com
 * `.status` e `.body` (JSON da resposta).
 *
 * Substitui as cópias locais `fnErrMsg`/`errMsg`/`describeError` das telas
 * (unificadas em 23/09). Nunca devolve texto em inglês nem o "400: {...}"
 * cru: quem chega ao usuário é a mensagem do servidor, um texto pt-BR por
 * status ou o `fallback` da tela.
 */
import { ApiError, isApiError, isNetworkError, NETWORK_ERROR_MESSAGE } from "./queryClient";

export interface ApiErrorLike {
  status?: number;
  body?: { message?: unknown } | null;
  message?: string;
}

export const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Entre novamente para continuar.";
export const FORBIDDEN_MESSAGE = "Você não tem permissão para esta ação.";

/** `body.message` quando é um texto não vazio (ApiError ou objeto no mesmo formato). */
function mensagemDoServidor(e: ApiErrorLike): string | null {
  const m = e.body?.message;
  return typeof m === "string" && m.trim() ? m.trim() : null;
}

/**
 * Texto que veio de um `new Error("...")` do próprio client ("Erro ao
 * confirmar upload") pode ir para a tela; o de exceção técnica do navegador
 * ("Failed to fetch", "Unexpected token <", "400: {...}") não.
 */
function pareceErroTecnico(err: Error): boolean {
  if (err instanceof TypeError || err instanceof SyntaxError) return true;
  const m = err.message || "";
  return /^\d{3}:\s/.test(m) || /failed to fetch|networkerror|load failed|unexpected token|is not a function|cannot read propert/i.test(m);
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err === null || err === undefined) return fallback;

  // Falha de rede que não passou pelo queryClient (fetch direto nas telas).
  if (isNetworkError(err)) return NETWORK_ERROR_MESSAGE;

  const e = err as ApiErrorLike;
  const status = typeof e.status === "number" ? e.status : undefined;
  const doServidor = mensagemDoServidor(e);

  if (status === 0) return NETWORK_ERROR_MESSAGE;
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  // O servidor usa 403 também para "evento encerrado", "fora da janela de
  // ajuste", "use a troca de colaborador" — esconder isso atrás de "sem
  // permissão" deixava o usuário sem saber o que fazer (23/09).
  if (status === 403) return doServidor ?? FORBIDDEN_MESSAGE;
  if (doServidor) return doServidor;
  // 410 (rota descontinuada: o client está velho) e 415 (tipo/conteúdo de
  // arquivo recusado) têm texto acionável próprio — melhor que o fallback
  // genérico da tela ("não foi possível carregar").
  if (status === 410 || status === 415) return new ApiError(status).message;
  if (isApiError(err) || status !== undefined) return fallback;

  // Error comum do client: só passa se for texto nosso, não exceção técnica.
  if (err instanceof Error) return pareceErroTecnico(err) ? fallback : (err.message.trim() || fallback);
  return fallback;
}

export { ApiError, isApiError };
