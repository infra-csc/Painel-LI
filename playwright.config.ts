/**
 * Testes E2E (Playwright) sobre o MODO DEMONSTRAÇÃO — `npm run test:e2e`.
 *
 * O runner sobe o próprio servidor (`npm run dev:demo`, PGlite em memória com
 * o seed de server/dev/demo-seed.ts) na porta 5058 — separada da 5055 do
 * launch.json para não brigar com uma demo aberta no browser pane.
 *
 * O seed é compartilhado por toda a suíte e os testes MUDAM estado, então os
 * arquivos rodam em série (`fullyParallel: false`, um worker) e cada spec usa
 * registros distintos (ver e2e/helpers/registros.ts).
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 5058;
const baseURL = `http://localhost:${PORT}`;
// 28/09: numa rodada pelo Bash do Windows o `webServer.env` não chegou ao
// `npm run dev:demo` e o servidor subiu na 5055 (padrão do demo.ts) enquanto o
// Playwright esperava a 5058 para sempre. O processo que carrega esta config é
// o mesmo que gera o filho, então gravar no ambiente aqui garante a porta.
process.env.PORT = String(PORT);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev:demo",
    port: PORT,
    // AI_AGENT/CLAUDECODE vazios: o Vite 8 liga `server.forwardConsole` sozinho
    // quando detecta um agente de IA no ambiente e passa a repetir no terminal
    // cada console.error do navegador (até 28/09 isso ainda derrubava o
    // servidor via process.exit em server/vite.ts). O relatório do Playwright
    // já coleta o console; aqui ele só suja o stderr.
    env: { PORT: String(PORT), AI_AGENT: "", CLAUDECODE: "", CLAUDE_CODE: "" },
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 800 } },
      grepInvert: /@mobile/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
      grep: /@mobile/,
    },
  ],
});
