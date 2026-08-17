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

async function throwIfResNotOk(res: Response) {
  // Rota /api inexistente no servidor RODANDO cai no catch-all do Vite/static
  // e devolve o index.html com 200 — o .json() do chamador estoura com um
  // SyntaxError mudo e o usuário vê um erro genérico. Acontece sempre que o
  // código novo chega por pull mas o workflow do Replit não é reiniciado
  // (o backend não tem hot-reload). Transformamos isso numa mensagem acionável.
  if (res.ok && res.url.includes("/api/") && (res.headers.get("content-type") || "").includes("text/html")) {
    const err = new Error("Servidor desatualizado") as any;
    err.status = 503;
    err.body = { message: "O servidor está rodando uma versão antiga — reinicie o workflow no Replit e tente de novo." };
    err.response = { status: 503, json: async () => err.body };
    throw err;
  }
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
    if (res.status === 401) tratarSessaoExpirada(res.url || "");
    const err = new Error(`${res.status}: ${text}`) as any;
    err.status = res.status;
    err.body = body;
    // Compatibilidade com handlers que leem err.response.json()
    err.response = { status: res.status, json: async () => body };
    throw err;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
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
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

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
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
