import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Desde 13/08/2026 toda rota /api exige sessão no servidor. Quando a sessão
// expira, dezenas de telas receberiam 401 ao mesmo tempo e mostrariam "erro ao
// carregar" — o usuário não saberia que precisa entrar de novo. Aqui o 401 é
// tratado uma única vez: manda para a tela de login.
// Exceções: rotas de /api/auth (o próprio /me responde 401 quando deslogado e
// o app já trata isso) e quando já estamos na tela de autenticação.
let redirecionandoParaLogin = false;
function tratarSessaoExpirada(url: string) {
  if (redirecionandoParaLogin) return;
  if (url.includes("/api/auth/")) return;
  const path = window.location.pathname;
  if (path.startsWith("/auth") || path.startsWith("/reset-password")) return;
  redirecionandoParaLogin = true;
  window.location.href = `/auth?sessao=expirada&returnTo=${encodeURIComponent(path + window.location.search)}`;
}

/** Texto padrão por status HTTP, quando o servidor não manda `message`. */
const MENSAGEM_POR_STATUS: Record<number, string> = {
  400: "Dados inválidos",
  401: "Sessão expirada",
  403: "Sem permissão",
  404: "Não encontrado",
  409: "Conflito: o registro mudou",
  410: "Este recurso foi descontinuado; atualize a página",
  413: "Arquivo grande demais",
  415: "Tipo de arquivo ou conteúdo não aceito",
  429: "Muitas tentativas",
};

/**
 * Troca de senha obrigatória (23/09). Com `mustChangePassword` no usuário, o
 * servidor responde 403 `{ message, mustChangePassword: true }` para TODA a
 * API (menos /api/auth/* e o PATCH da própria senha). Em vez de cada tela
 * mostrar "sem permissão", o 403 é detectado aqui uma vez e vira este evento;
 * quem escuta é `AuthProvider` (use-auth.tsx), que abre o diálogo bloqueante.
 */
export const TROCAR_SENHA_EVENT = "painel:trocar-senha";

function exigeTrocaDeSenha(status: number, body: Record<string, unknown> | null): boolean {
  return status === 403 && body?.mustChangePassword === true;
}

function avisarTrocaDeSenha() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(TROCAR_SENHA_EVENT));
}

export const NETWORK_ERROR_MESSAGE = "Sem conexão com o servidor. Verifique a internet e tente de novo.";
export const OUTDATED_SERVER_MESSAGE = "O servidor está rodando uma versão antiga — reinicie o workflow no Replit e tente de novo.";

function mensagemPadrao(status: number): string {
  if (status === 0) return NETWORK_ERROR_MESSAGE;
  if (status >= 500) return "Erro no servidor";
  return MENSAGEM_POR_STATUS[status] ?? `Erro ${status}`;
}

/**
 * Erro de API do client (23/09). Até então `throwIfResNotOk` montava um
 * `Error("400: {...json...}")` com `as any`: `err.message` cru chegava em
 * toasts ("400: {\"message\":...}") e cada tela reimplementava a leitura de
 * `.status`/`.body`. Aqui a mensagem já nasce legível — a do servidor quando
 * existe, senão um texto pt-BR por status — e `status`/`body`/`response`
 * continuam existindo para quem já os lia.
 *
 * `status === 0` é falha de rede (fetch nem chegou ao servidor).
 */
export class ApiError extends Error {
  readonly status: number;
  /** JSON da resposta (ou null quando o corpo não era JSON). */
  readonly body: Record<string, unknown> | null;
  /** Compatibilidade com handlers antigos que leem `err.response.json()`. */
  readonly response: { status: number; json: () => Promise<Record<string, unknown> | null> };

  constructor(status: number, body: Record<string, unknown> | null = null, message?: string) {
    const doServidor = body && typeof body.message === "string" && body.message.trim() ? body.message.trim() : null;
    super(message ?? doServidor ?? mensagemPadrao(status));
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.response = { status, json: async () => body };
  }

  /** Mensagem enviada pelo servidor em `body.message`, se houver. */
  get serverMessage(): string | null {
    const m = this.body?.message;
    return typeof m === "string" && m.trim() ? m.trim() : null;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
    // Instância de outro bundle/realm (HMR, testes): mesmo formato serve.
    || (typeof err === "object" && err !== null && (err as { name?: unknown }).name === "ApiError" && typeof (err as { status?: unknown }).status === "number");
}

/** `TypeError` do fetch ("Failed to fetch", "NetworkError", "Load failed"). */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

/**
 * Falha de rede vira ApiError status 0 com texto pt-BR; o resto (AbortError
 * do cancelamento, erros já convertidos) segue como está.
 */
function converterFalhaDeRede(err: unknown): never {
  if (isNetworkError(err)) throw new ApiError(0, null, NETWORK_ERROR_MESSAGE);
  throw err;
}

const pareceHtml = (text: string) => /^\s*<(!doctype|html|head|body)/i.test(text);

export async function throwIfResNotOk(res: Response) {
  // Rota /api inexistente no servidor RODANDO cai no catch-all do Vite/static
  // e devolve o index.html com 200 — o .json() do chamador estoura com um
  // SyntaxError mudo e o usuário vê um erro genérico. Acontece sempre que o
  // código novo chega por pull mas o workflow do Replit não é reiniciado
  // (o backend não tem hot-reload). Transformamos isso numa mensagem acionável.
  if (res.ok && res.url.includes("/api/") && (res.headers.get("content-type") || "").includes("text/html")) {
    throw new ApiError(503, { message: OUTDATED_SERVER_MESSAGE });
  }
  if (!res.ok) {
    const text = (await res.text().catch(() => "")) || "";
    let body: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(text);
      body = parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      // Texto puro curto (raro: `res.send("...")`) ainda serve de mensagem;
      // HTML de proxy/servidor desatualizado não — vira o texto por status.
      if (text && !pareceHtml(text) && text.length <= 300) body = { message: text };
    }
    if (res.status === 401) tratarSessaoExpirada(res.url || "");
    if (exigeTrocaDeSenha(res.status, body)) avisarTrocaDeSenha();
    throw new ApiError(res.status, body);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  init?: { signal?: AbortSignal },
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // A identidade vai APENAS no cookie de sessão (credentials: "include").
  // Até 13/08/2026 esta função injetava `_userId` do localStorage em todo
  // corpo de mutação e o servidor aceitava esse campo como identidade —
  // qualquer pessoa trocava o id no devtools e agia como outro usuário.
  // O servidor ignora `_userId` desde então; parar de enviá-lo evita que a
  // prática volte por hábito.
  const isBodyless = method === "GET" || method === "HEAD";
  const res = await fetch(url, {
    method,
    headers,
    body: isBodyless ? undefined : (data ? JSON.stringify(data) : undefined),
    credentials: "include",
    signal: init?.signal,
  }).catch(converterFalhaDeRede);

  await throwIfResNotOk(res);
  return res;
}

/**
 * GET autenticado que já devolve o JSON — o mesmo caminho do `queryFn` padrão
 * (credentials + throwIfResNotOk + falha de rede convertida), para hooks que
 * precisam transformar a resposta antes de guardar no cache.
 */
export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: "include", signal }).catch(converterFalhaDeRede);
  await throwIfResNotOk(res);
  return (await res.json()) as T;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    // `signal` do TanStack: sair da tela cancela o download em andamento (as
    // vagas passam de 6 MB — antes o navegador terminava de baixar à toa).
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      signal,
    }).catch(converterFalhaDeRede);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

/** Só vale repetir o que pode passar sozinho: rede caída e gateway indisponível. */
const STATUS_COM_RETRY = new Set([0, 502, 503, 504]);
export function deveTentarDeNovo(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!isApiError(error)) return false;
  return STATUS_COM_RETRY.has(error.status);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      // O app é multiusuário (RH aprova ↔ produção reenvia): com
      // staleTime: Infinity as ações do outro usuário nunca apareciam sem F5.
      // 60s de frescor + refetch ao focar a janela mantém as telas vivas sem
      // rajadas de requisições.
      refetchOnWindowFocus: true,
      staleTime: 60_000,
      // Até 2 tentativas para rede/502/503/504; 4xx e o resto falham na hora
      // (repetir um 403 ou 409 só atrasa a mensagem para o usuário).
      retry: deveTentarDeNovo,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Listas GRANDES (15/09: "às vezes quando troco de página sinto umas
 * travadas"). Vagas ~4.500 linhas / ~6,5 MB de JSON, passagens ~1,6 MB,
 * colaboradores ~0,6 MB. Com o padrão de 60s, voltar a uma tela depois de um
 * minuto — ou só voltar para a janela — baixava e reprocessava tudo de novo
 * no meio da navegação. Aqui: 5 min de frescor e sem refetch ao focar.
 * Continua atualizado: toda ação do app invalida essas chaves na hora, e a
 * tela que precisar de outro tempo ainda pode passar o seu `staleTime`.
 */
for (const chave of ["/api/team-inclusions", "/api/tickets", "/api/collaborators"]) {
  queryClient.setQueryDefaults([chave], { staleTime: 5 * 60_000, refetchOnWindowFocus: false });
}
