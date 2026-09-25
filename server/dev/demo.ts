/**
 * Modo DEMONSTRAÇÃO — `npm run dev:demo` (25/09).
 *
 * Sobe a aplicação completa (API + Vite dev middleware) sobre um Postgres
 * embutido (PGlite, WASM) com o schema gerado de shared/schema.ts e o seed
 * realista de server/dev/demo-seed.ts. Serve para conferir as telas ao vivo,
 * por papel, sem DATABASE_URL, sem Portal Norte e sem tocar em produção.
 *
 * O ambiente é definido AQUI (e não no script do package.json) para funcionar
 * igual no Windows, no Linux e no Replit:
 *   PAINEL_DB=pglite         → server/db.ts troca o Neon pelo PGlite;
 *   NODE_ENV=development     → Vite dev middleware, cookie Lax sem Secure,
 *                              login por senha permitido;
 *   PAINEL_DEMO=1            → server/app.ts registra GET /__demo/entrar?papel=…
 *   PORT=5055 (padrão)       → .claude/launch.json aponta para esta porta.
 *
 * Tudo vive em memória: parar o processo apaga o banco; subir de novo recria
 * o mesmo seed (determinístico). Ver docs/demo.md.
 */
process.env.PAINEL_DB = "pglite";
process.env.NODE_ENV = "development";
process.env.PAINEL_DEMO = "1";
process.env.PORT ||= "5055";
process.env.SESSION_SECRET ||= "segredo-de-sessao-da-demo";
process.env.SSO_SECRET ||= "segredo-de-sso-da-demo";
process.env.PORTAL_ORIGIN ||= `http://localhost:${process.env.PORT}`;
process.env.PORTAL_API_TOKEN ||= "token-do-portal-na-demo";

(async () => {
  // Imports dinâmicos: server/db.ts lê PAINEL_DB no carregamento, então o
  // ambiente acima precisa estar definido antes de qualquer módulo do servidor.
  const [{ db, inicializarBancoDeTeste }, { criarSchemaPglite }, { semearDemo, DEMO_PAPEIS, DEMO_SENHA, DEMO_USUARIOS }, { createApp }, { setupVite, log }] = await Promise.all([
    import("../db"),
    import("./pglite-schema"),
    import("./demo-seed"),
    import("../app"),
    import("../vite"),
  ]);

  const t0 = Date.now();
  await inicializarBancoDeTeste();
  await criarSchemaPglite(db);
  const resumo = await semearDemo(db);
  log(`banco embutido pronto em ${Date.now() - t0} ms — ${resumo.vagas} vagas, ${resumo.colaboradores} colaboradores, ${resumo.eventos} eventos`, "demo");

  const { app, server } = await createApp({ modoSeguro: false, cookieSecure: false });
  await setupVite(app, server);

  const port = parseInt(process.env.PORT!, 10);
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[Demo] A porta ${port} já está em uso por outro processo. Suba em outra: PORT=5056 npm run dev:demo (o launch.json usa 5055).`);
    } else {
      console.error("[Demo] Falha ao abrir a porta:", err);
    }
    process.exit(1);
  });
  server.listen({ port, host: "0.0.0.0" }, () => {
    log(`serving on port ${port}`);
    console.warn("\n[Demo] Logins automáticos (a sessão nasce como se viesse do SSO):");
    for (const papel of DEMO_PAPEIS) {
      console.warn(`  http://localhost:${port}/__demo/entrar?papel=${papel.padEnd(13)} → ${DEMO_USUARIOS[papel].name} (${DEMO_USUARIOS[papel].role}${DEMO_USUARIOS[papel].canApproveCenotecnica ? ", aprova cenotécnica" : ""})`);
    }
    console.warn(`  Login por senha (tela /auth): qualquer e-mail acima com a senha "${DEMO_SENHA}".\n`);
  });
})().catch((err) => {
  console.error("[Demo] Falha ao subir o modo demonstração:", err);
  process.exit(1);
});
