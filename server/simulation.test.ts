import { describe, it, expect } from "vitest";
import {
  resolveEffectiveUserId,
  isBlockedBySimulation,
} from "./simulation";

describe("resolveEffectiveUserId — identidade efetiva da sessão", () => {
  it("sem simulação, devolve o usuário real da sessão", () => {
    expect(resolveEffectiveUserId({ userId: "real-1" })).toBe("real-1");
  });

  it("com simulação ativa, devolve o usuário simulado (o real não muda)", () => {
    expect(
      resolveEffectiveUserId({ userId: "real-1", simulatedUserId: "sim-2" }),
    ).toBe("sim-2");
  });

  it("sem sessão (ou sessão vazia), devolve undefined", () => {
    expect(resolveEffectiveUserId(undefined)).toBeUndefined();
    expect(resolveEffectiveUserId(null)).toBeUndefined();
    expect(resolveEffectiveUserId({})).toBeUndefined();
  });

  it("simulatedUserId sozinho não autentica ninguém sem userId real? — autentica o simulado (o gate de sessão de index.ts já exigiu userId real antes)", () => {
    // Documentação do comportamento: o middleware global de index.ts exige
    // req.session.userId REAL para qualquer /api — este helper roda depois.
    expect(resolveEffectiveUserId({ simulatedUserId: "sim-2" })).toBe("sim-2");
  });
});

describe("isBlockedBySimulation — modo somente leitura", () => {
  it("sem simulação ativa, nada é bloqueado", () => {
    expect(isBlockedBySimulation("POST", "/api/events", false)).toBe(false);
    expect(isBlockedBySimulation("DELETE", "/api/users/1", false)).toBe(false);
  });

  it("com simulação, GET/HEAD/OPTIONS passam sempre (OPTIONS = preflight)", () => {
    expect(isBlockedBySimulation("GET", "/api/events", true)).toBe(false);
    expect(isBlockedBySimulation("HEAD", "/api/events", true)).toBe(false);
    expect(isBlockedBySimulation("OPTIONS", "/api/events", true)).toBe(false);
  });

  it("com simulação, mutações em /api são bloqueadas", () => {
    expect(isBlockedBySimulation("POST", "/api/events", true)).toBe(true);
    expect(isBlockedBySimulation("PUT", "/api/events/1", true)).toBe(true);
    expect(isBlockedBySimulation("PATCH", "/api/users/1", true)).toBe(true);
    expect(isBlockedBySimulation("DELETE", "/api/events/1", true)).toBe(true);
  });

  it("whitelist: sair da simulação e logout nunca são bloqueados", () => {
    expect(isBlockedBySimulation("POST", "/api/simulation/stop", true)).toBe(false);
    expect(isBlockedBySimulation("POST", "/api/auth/logout", true)).toBe(false);
    // /start passa no middleware, mas o handler recusa com 400 ("Saia da
    // simulação atual primeiro") — comportamento coberto pelo contrato da rota.
    expect(isBlockedBySimulation("POST", "/api/simulation/start", true)).toBe(false);
  });

  it("comparação case-insensitive e tolerante a barra final (Express roteia assim)", () => {
    expect(isBlockedBySimulation("POST", "/API/Events", true)).toBe(true);
    expect(isBlockedBySimulation("post", "/api/simulation/STOP/", true)).toBe(false);
  });

  it("fora de /api (assets, Vite) nada é bloqueado", () => {
    expect(isBlockedBySimulation("POST", "/qualquer-coisa", true)).toBe(false);
  });
});
