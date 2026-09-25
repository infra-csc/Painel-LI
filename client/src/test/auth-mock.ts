/**
 * Estado do `useAuth` mockado nos testes de componente (ver setup.ts).
 *
 * `renderComTudo({ user, auth })` troca o valor antes de renderizar; as
 * funções são `vi.fn()` para o teste conferir chamadas (`authMock.valor.logout`).
 * Zerado depois de cada teste pelo setup.
 */
import { vi } from "vitest";
import type { User } from "@shared/schema";

export type AuthMockado = ReturnType<typeof import("@/hooks/use-auth").useAuth>;

function autenticacaoVazia(): AuthMockado {
  return {
    user: null,
    simulation: null,
    login: vi.fn(async () => ({ ok: true as const })),
    logout: vi.fn(),
    setUser: vi.fn(),
    isLoading: false,
    isAuthenticated: false,
    precisaTrocarSenha: false,
    senhaTrocada: vi.fn(),
  };
}

export const authMock: { valor: AuthMockado } = { valor: autenticacaoVazia() };

export function definirAuthMock(user: User | null, extras: Partial<AuthMockado> = {}): AuthMockado {
  authMock.valor = { ...autenticacaoVazia(), user, isAuthenticated: !!user, ...extras };
  return authMock.valor;
}

export function zerarAuthMock(): void {
  authMock.valor = autenticacaoVazia();
}
