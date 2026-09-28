/**
 * Fumaça de acessibilidade nas telas principais (admin): o primeiro Tab cai
 * no link de pulo, há exatamente um h1 e o React/Radix não reclama no console.
 */
import { test, expect, type ConsoleMessage } from "@playwright/test";
import { entrarComo } from "./helpers/demo";

const TELAS: { rota: string; h1: string | RegExp }[] = [
  { rota: "/events", h1: "Eventos" },
  { rota: "/scaling", h1: "Escalação" },
  { rota: "/tickets", h1: "Passagens" },
  { rota: "/budget-planned", h1: "Planejado" },
  { rota: "/invoices", h1: /Notas fiscais/ },
  { rota: "/admin-users", h1: "Usuários" },
];

/** Erros do console que interessam: avisos do React/Radix e exceções — não o 404 de um recurso. */
function ehErroDeApp(m: ConsoleMessage): boolean {
  if (m.type() !== "error") return false;
  const texto = m.text();
  return !/Failed to load resource|net::ERR_/.test(texto);
}

for (const tela of TELAS) {
  test(`${tela.rota}: skip link no primeiro Tab, um só h1 e console limpo`, async ({ page }) => {
    const erros: string[] = [];
    page.on("console", (m) => { if (ehErroDeApp(m)) erros.push(m.text()); });
    page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));

    await entrarComo(page, "admin");
    await page.goto(tela.rota);
    await expect(page.getByRole("heading", { level: 1, name: tela.h1 })).toBeVisible();
    // Deixa a tela terminar de montar (tabelas e cards que chegam depois dos dados).
    await expect(page.locator("main")).not.toContainText(/Carregando/);

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Ir para o conteúdo" });
    await expect(skip).toBeFocused();
    await expect(skip).toHaveAttribute("href", "#conteudo");
    await page.keyboard.press("Enter");
    await expect(page.locator("main#conteudo")).toBeFocused();

    await expect(page.locator("h1")).toHaveCount(1);
    expect(erros, `erros de console em ${tela.rota}:\n${erros.join("\n---\n")}`).toEqual([]);
  });
}

// Defeito real (25/09): em /scaling-validation o React avisa
// "Function components cannot be given refs" — o StatusBadge (função sem
// forwardRef) é usado como TooltipTrigger asChild em PendingRequestBadge
// (client/src/components/scaling-validation/suggestions-list/suggestion-badges.tsx:114).
// Além do console, esse console.error derruba o `npm run dev:demo` quando o
// Vite está com forwardConsole ligado (ambiente de agente/Replit): server/vite.ts
// faz process.exit(1) em qualquer logger.error.
test.fixme("/scaling-validation: console limpo (StatusBadge sem forwardRef dentro de TooltipTrigger asChild)", async ({ page }) => {
  const erros: string[] = [];
  page.on("console", (m) => { if (ehErroDeApp(m)) erros.push(m.text()); });
  await entrarComo(page, "admin");
  await page.goto("/scaling-validation");
  await expect(page.getByRole("heading", { level: 1, name: "Validação de escala" })).toBeVisible();
  await expect(page.getByRole("table", { name: /Vagas sugeridas/ })).toBeVisible();
  expect(erros).toEqual([]);
});
