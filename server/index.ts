import { createApp } from "./app";
import { garantirEstrutura } from "./ensure-schema";
import { setupVite, serveStatic, log } from "./vite";

// ── Processo: nunca cair por uma promise esquecida (23/09) ──────────────────
// Um `await` rejeitado fora de try/catch (ou fora do asyncHandler) viraria
// `unhandledRejection` e, no Node 20, derruba o processo inteiro — com todos os
// requests em voo. Logamos e seguimos. `uncaughtException` é mais grave: se o
// erro indica estado irrecuperável (sintaxe, referência quebrada, memória),
// saímos com código 1 para o autoscale subir uma instância limpa; o resto só
// é logado.
process.on("unhandledRejection", (motivo) => {
  console.error("[Process] Promise rejeitada sem tratamento:", motivo);
});
process.on("uncaughtException", (err) => {
  console.error("[Process] Exceção não capturada:", err);
  const irrecuperavel =
    err instanceof SyntaxError ||
    err instanceof ReferenceError ||
    err instanceof RangeError ||
    /out of memory|heap/i.test(err?.message ?? "");
  if (irrecuperavel) {
    console.error("[Process] Estado irrecuperável — encerrando com código 1.");
    process.exit(1);
  }
});

// A aplicação em si (middlewares, sessão, SSO, gate, CSRF, rotas, tratador de
// erros) é montada por `createApp` em server/app.ts — a MESMA fábrica que os
// testes de rota usam. Aqui fica só o que é boot do processo.
(async () => {
  // Antes de aceitar tráfego: repõe a estrutura que um db:push a partir de
  // um checkout antigo já apagou do banco (ver server/ensure-schema.ts).
  await garantirEstrutura();

  const { app, server } = await createApp();

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  // reusePort só existe no Linux (onde a aplicação roda): no Windows o Node
  // aborta com ENOTSUP e o servidor nem sobe, impedindo rodar o projeto
  // localmente para conferir uma tela.
  server.listen({
    port,
    host: "0.0.0.0",
    ...(process.platform === "linux" ? { reusePort: true } : {}),
  }, () => {
    log(`serving on port ${port}`);
  });
})();
