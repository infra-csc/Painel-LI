/**
 * Setup do projeto "componentes" do vitest (jsdom) — roda antes de CADA
 * arquivo *.test.tsx do client.
 *
 *  - matchers do jest-dom (`toBeInTheDocument`, `toHaveFocus`…);
 *  - `cleanup` depois de cada teste (sem `globals`, a Testing Library não
 *    consegue registrar o afterEach sozinha);
 *  - APIs de navegador que o jsdom não tem e o Radix/TanStack usam:
 *    `matchMedia`, `ResizeObserver`, `IntersectionObserver`, `scrollIntoView`
 *    e a captura de ponteiro (Select/Popover/Tooltip);
 *  - `useAuth` mockado (ver ./auth-mock.ts): o `AuthProvider` real chama
 *    /api/auth/me ao montar; aqui o usuário é o que cada teste passa a
 *    `renderComTudo({ user })`.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { zerarAuthMock } from "./auth-mock";

vi.mock("@/hooks/use-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/hooks/use-auth")>();
  const { authMock } = await import("./auth-mock");
  return { ...original, useAuth: () => authMock.valor };
});

afterEach(() => {
  cleanup();
  zerarAuthMock();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── APIs de navegador ausentes no jsdom ─────────────────────────────────────

if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

class ObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): never[] { return []; }
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ObserverFalso as unknown as typeof ResizeObserver;
}
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = ObserverFalso as unknown as typeof IntersectionObserver;
}

if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}
// Radix Select/Popover/Tooltip chamam a captura de ponteiro; o jsdom não a implementa.
if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
