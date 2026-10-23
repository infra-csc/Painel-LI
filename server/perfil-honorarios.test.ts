/**
 * Perfil Honorários (23/10) — a lista do que a API libera, sem subir o app.
 * O teste de rota (server/test/perfil-honorarios.test.ts) cobre o gate de
 * verdade; aqui ficam os casos de borda do casamento de caminho.
 */
import { describe, expect, it } from "vitest";
import { rotaLiberadaAoPerfilHonorarios as libera } from "./perfil-honorarios";

const EU = "11111111-2222-3333-4444-555555555555";

describe("rotaLiberadaAoPerfilHonorarios", () => {
  it("a tela de liberação: acesso, sino, lista do Financeiro, histórico, liberar e estornar", () => {
    expect(libera("GET", "/api/honorarios-ceno/acesso", EU)).toBe(true);
    expect(libera("GET", "/api/honorarios-ceno/pendencias", EU)).toBe(true);
    expect(libera("GET", "/api/honorarios-ceno/financeiro", EU)).toBe(true);
    expect(libera("GET", "/api/honorarios-ceno/abc/historico", EU)).toBe(true);
    expect(libera("POST", "/api/honorarios-ceno/abc/liberacoes", EU)).toBe(true);
    expect(libera("POST", "/api/honorarios-ceno/abc/liberacoes/def/estornar", EU)).toBe(true);
    expect(libera("HEAD", "/api/honorarios-ceno/financeiro", EU)).toBe(true);
  });

  it("lançar, enviar, aprovar e devolver honorário ficam de fora", () => {
    expect(libera("GET", "/api/honorarios-ceno/eventos", EU)).toBe(false);
    expect(libera("GET", "/api/honorarios-ceno/pedido", EU)).toBe(false);
    expect(libera("GET", "/api/honorarios-ceno/aprovacao", EU)).toBe(false);
    expect(libera("GET", "/api/honorarios-ceno/situacao", EU)).toBe(false);
    expect(libera("POST", "/api/honorarios-ceno", EU)).toBe(false);
    expect(libera("POST", "/api/honorarios-ceno/enviar", EU)).toBe(false);
    expect(libera("PATCH", "/api/honorarios-ceno/abc", EU)).toBe(false);
    expect(libera("DELETE", "/api/honorarios-ceno/abc", EU)).toBe(false);
    expect(libera("POST", "/api/honorarios-ceno/abc/aprovar", EU)).toBe(false);
    expect(libera("POST", "/api/honorarios-ceno/abc/devolver", EU)).toBe(false);
    expect(libera("POST", "/api/honorarios-ceno/decidir-lote", EU)).toBe(false);
    // Método errado na rota certa.
    expect(libera("DELETE", "/api/honorarios-ceno/abc/liberacoes", EU)).toBe(false);
    expect(libera("POST", "/api/honorarios-ceno/financeiro", EU)).toBe(false);
  });

  it("o resto do app fica de fora, inclusive o que qualquer logado lê", () => {
    for (const p of ["/api/events", "/api/collaborators", "/api/team-inclusions", "/api/tickets", "/api/budget-planned", "/api/invoices", "/api/users", "/api/swap-requests", "/api/system-settings", "/api/payment-companies", "/api/shell/aguardando-gestor"]) {
      expect(libera("GET", p, EU), p).toBe(false);
    }
  });

  it("caixa, barra final e querystring não abrem nem fecham porta", () => {
    expect(libera("GET", "/API/Honorarios-Ceno/Financeiro/", EU)).toBe(true);
    expect(libera("GET", "/api/honorarios-ceno/financeiro?eventId=x", EU)).toBe(true);
    expect(libera("GET", "/API/EVENTS", EU)).toBe(false);
    expect(libera("GET", "/api/honorarios-ceno/financeiro/../../events", EU)).toBe(false);
  });

  it("fora do gate (auth, integração, portal), fora da API e preflight passam como para todo mundo", () => {
    expect(libera("GET", "/api/auth/me", EU)).toBe(true);
    expect(libera("POST", "/api/auth/logout", EU)).toBe(true);
    expect(libera("GET", "/honorarios-ceno", EU)).toBe(true);
    expect(libera("OPTIONS", "/api/events", EU)).toBe(true);
    expect(libera("GET", "/api/authx", EU)).toBe(false);
  });

  it("só a própria conta no PATCH de usuário (troca da senha provisória); sair da simulação", () => {
    expect(libera("PATCH", `/api/users/${EU}`, EU)).toBe(true);
    expect(libera("PATCH", `/api/users/${EU.toUpperCase()}`, EU)).toBe(true);
    expect(libera("PATCH", "/api/users/outro-id", EU)).toBe(false);
    expect(libera("GET", `/api/users/${EU}`, EU)).toBe(false);
    expect(libera("PATCH", `/api/users/${EU}/toggle-active`, EU)).toBe(false);
    expect(libera("POST", "/api/simulation/stop", EU)).toBe(true);
    expect(libera("POST", "/api/simulation/start", EU)).toBe(false);
  });
});
