import { defineConfig } from "vitest/config";
import path from "path";

// ESM: __dirname não existe (o vitest avisava em todo run). Node 20.11+ expõe import.meta.dirname.
const raiz = import.meta.dirname ?? process.cwd();

// Config própria do vitest: o vite.config.ts tem root=client e esconderia os
// testes de shared/. Testes são co-locados (*.test.ts ao lado do código).
export default defineConfig({
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "client/src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
    // Os testes de rota (server/test/) sobem um Postgres embutido (PGlite,
    // WASM): o primeiro boot leva alguns segundos e cada teste faz várias
    // idas ao banco. Os 5 s padrão derrubavam a suíte em máquina lenta/CI.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(raiz, "shared"),
      "@": path.resolve(raiz, "client", "src"),
    },
  },
});
