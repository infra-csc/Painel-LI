#!/usr/bin/env node
/**
 * Captura de referência do redesign, sobre o modo demonstração (nada de banco real).
 * Uso: node scripts/redesign/capturar.mjs <pasta-de-saida> <porta> [rotas separadas por vírgula]
 * Grava <papel>-<rota>-<largura>.png e medidas.jsonl (transbordo, altura, fonte, 1ª linha).
 * Larguras: as da auditoria, mais 1366x768 (notebook) e o celular com toque real.
 */
import { chromium } from "@playwright/test";
import { appendFileSync, mkdirSync } from "node:fs";

const [saida, porta = "5094", lista] = process.argv.slice(2);
if (!saida) { console.error("Uso: capturar.mjs <pasta> <porta> [rotas]"); process.exit(2); }
mkdirSync(saida, { recursive: true });
const BASE = `http://localhost:${porta}`;
const ROTAS = lista ? lista.split(",") : ["/pendencias", "/paineis", "/events", "/calendar", "/functions", "/collaborators", "/user-registration", "/admin-users",
  "/scaling", "/scaling-validation", "/scaling-approval", "/aprovacao-de-honorarios", "/team-inclusion", "/consultation", "/tickets", "/busca-de-passagens", "/accommodations",
  "/baggage-control", "/rh-control", "/flash-account", "/honorarios-ceno", "/contratos", "/calculation-rules", "/system-settings", "/simulation"];
const TELAS = [[1920, 1080, false], [1366, 820, false], [1366, 768, false], [820, 1100, false], [390, 844, true]];
const nome = (r) => r.replace(/^\//, "").replace(/[/?&=]/g, "_");

const navegador = await chromium.launch();
for (const [w, h, toque] of TELAS) {
  const ctx = await navegador.newContext({ viewport: { width: w, height: h }, hasTouch: toque, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const p = await ctx.newPage();
  p.setDefaultNavigationTimeout(150_000);
  await p.goto(`${BASE}/__demo/entrar?papel=admin`);
  await p.waitForTimeout(1000);
  for (const r of ROTAS) {
    await p.goto(BASE + r);
    await p.waitForTimeout(3500);
    const m = await p.evaluate(() => ({
      doc: document.documentElement.scrollWidth, janela: innerWidth, altura: document.documentElement.scrollHeight,
      y1aLinha: Math.round(document.querySelector("main tbody tr, main article, main li")?.getBoundingClientRect().top ?? -1),
    }));
    await p.screenshot({ path: `${saida}/${nome(r)}-${w}x${h}.png` });
    appendFileSync(`${saida}/medidas.jsonl`, JSON.stringify({ r, w, h, ...m }) + "\n");
    if (m.doc > m.janela + 1) console.log("TRANSBORDO", r, w, `${m.doc}>${m.janela}`);
  }
  await ctx.close();
}
await navegador.close();
console.log("fim");
