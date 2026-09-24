/**
 * Setup do projeto "rotas" do vitest (vitest.config.ts → setupFiles).
 *
 * Roda antes de CADA arquivo de server/test/ (cada arquivo tem o próprio
 * worker e o próprio PGlite — os dados de um nunca vazam para outro, e a ordem
 * dos arquivos não importa). Faz duas coisas:
 *
 *  1. Warm-up do banco e do app num `beforeAll` com timeout de 3 min: o boot
 *     do PGlite (WASM) + geração do schema pelo drizzle-kit + createApp leva de
 *     3 a 10 s em máquina fria/CI. Antes esse custo caía dentro do primeiro
 *     `it` (ou do beforeAll de cada arquivo, com 60 s) e, com o worker
 *     disputando CPU com os testes unitários, a primeira execução fria
 *     estourava o timeout de 22 testes. `criarApp()` é memoizado: os arquivos
 *     que ainda chamam `criarApp()` no próprio beforeAll só pegam a instância.
 *
 *  2. Silencia console.log/warn: o app loga cada request e cada bloqueio
 *     (AuthAudit/CSRF) — ruído no relatório. console.error continua visível
 *     (500 de verdade tem que aparecer).
 */
import { afterAll, beforeAll, vi } from "vitest";
import { criarApp } from "./harness";

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await criarApp();
}, 180_000);

afterAll(() => {
  vi.restoreAllMocks();
});
