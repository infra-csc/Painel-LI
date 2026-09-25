/**
 * Fábricas e utilitários de dados para os testes de componente.
 */
import { vi } from "vitest";
import type { User } from "@shared/schema";

let sequencia = 0;

/** Usuário completo (tipo `User` do schema) com padrões sensatos. */
export function usuarioFake(parcial: Partial<User> = {}): User {
  sequencia += 1;
  return {
    id: `user-${sequencia}`,
    email: `pessoa${sequencia}@exemplo.com.br`,
    password: "",
    name: `Pessoa ${sequencia}`,
    role: "admin",
    area: null,
    resetToken: null,
    resetTokenExpiry: null,
    status: "approved",
    isActive: true,
    mustChangePassword: false,
    canApproveCenotecnica: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...parcial,
  };
}

/** `Response` JSON para mockar o `fetch` (o queryClient lê `content-type`). */
export function respostaJson(corpo: unknown, status = 200, url = ""): Response {
  const res = new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
  // `Response.url` é somente leitura e vazio quando construído à mão; o
  // queryClient usa a URL para detectar HTML no lugar de JSON e para o 401.
  if (url) Object.defineProperty(res, "url", { value: url });
  return res;
}

export type RoteadorDeFetch = (url: string, init?: RequestInit) => Response | Promise<Response>;

/**
 * Substitui `fetch` por um roteador por URL. Devolve o spy para conferir as
 * chamadas (`fetchMock.mock.calls`). Restaurado pelo setup no afterEach.
 */
export function mockarFetch(rotear: RoteadorDeFetch) {
  const fetchMock = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    return rotear(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** URLs (só o caminho) das chamadas que o `fetch` mockado recebeu. */
export function urlsChamadas(fetchMock: ReturnType<typeof mockarFetch>): string[] {
  return fetchMock.mock.calls.map(([entrada]) =>
    typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url,
  );
}
