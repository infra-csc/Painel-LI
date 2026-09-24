import { defineConfig } from "vitest/config";
import path from "path";

// ESM: __dirname não existe (o vitest avisava em todo run). Node 20.11+ expõe import.meta.dirname.
const raiz = import.meta.dirname ?? process.cwd();

// Config própria do vitest: o vite.config.ts tem root=client e esconderia os
// testes de shared/. Testes são co-locados (*.test.ts ao lado do código).
//
// Dois projetos (24/09), porque os dois tipos de teste têm perfis opostos:
//  - "unitarios": puros, milhares por segundo, timeouts padrão;
//  - "rotas" (server/test/): sobem a aplicação REAL sobre um Postgres embutido
//    (PGlite, WASM). O primeiro boot de cada arquivo (WASM + schema gerado do
//    drizzle) leva de 3 a 10 s numa máquina fria/CI e cada teste faz várias
//    idas ao banco. O setupFile faz esse boot num `beforeAll` próprio, com
//    timeout largo, ANTES do primeiro teste — assim o custo do boot nunca é
//    cobrado do timeout de um teste (era isso que derrubava 22 testes na
//    primeira execução fria). `retry: 0` de propósito: flakiness tem que
//    aparecer, não ser mascarada.
export default defineConfig({
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unitarios",
          include: ["shared/**/*.test.ts", "client/src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
          exclude: ["**/node_modules/**", "server/test/**"],
          // Projetos com maxWorkers diferentes precisam de groupOrder distinto
          // (o vitest recusa rodar): unitários primeiro, rotas depois.
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: "rotas",
          include: ["server/test/**/*.test.ts"],
          setupFiles: ["server/test/setup.ts"],
          testTimeout: 60_000,
          hookTimeout: 180_000,
          retry: 0,
          // Cada arquivo sobe o PRÓPRIO Postgres WASM (PGlite) num fork. Com o
          // padrão (CPUs − 1 workers) seis PGlites bootavam juntos e, uma vez
          // em ~6 execuções, um fork morria sem stack ("Worker exited
          // unexpectedly" — abort do WASM sob pressão de memória/CPU). Com 3
          // workers: 3/3 verdes e ~25 s; sequencial (1) leva ~60 s.
          maxWorkers: 3,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(raiz, "shared"),
      "@": path.resolve(raiz, "client", "src"),
    },
  },
});
