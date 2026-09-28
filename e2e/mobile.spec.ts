/**
 * Telas no celular (projeto "mobile", Pixel 5): sem rolagem horizontal da
 * página e menu-gaveta operável por teclado.
 */
import { test, expect } from "@playwright/test";
import { entrarComo } from "./helpers/demo";

const TELAS = ["/events", "/scaling", "/invoices"];

test.describe("@mobile", () => {
  test.beforeEach(async ({ page }) => {
    await entrarComo(page, "admin");
  });

  for (const rota of TELAS) {
    test(`${rota} não tem rolagem horizontal da página @mobile`, async ({ page }) => {
      await page.goto(rota);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("main")).not.toContainText(/Carregando/);
      const medidas = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(medidas.scrollWidth, `${rota}: ${JSON.stringify(medidas)}`).toBeLessThanOrEqual(medidas.innerWidth);
    });
  }

  test("o menu-gaveta abre e fecha pelo teclado, prendendo o foco enquanto está aberto @mobile", async ({ page }) => {
    await page.goto("/events");
    const abrir = page.getByRole("button", { name: "Abrir menu" });
    await expect(abrir).toBeVisible();
    // No celular o menu lateral começa fechado (fora da tela).
    await expect(page.getByRole("dialog", { name: "Menu principal" })).toHaveCount(0);

    await abrir.focus();
    await page.keyboard.press("Enter");
    const gaveta = page.getByRole("dialog", { name: "Menu principal" });
    await expect(gaveta).toBeVisible();
    await expect(gaveta).toHaveAttribute("aria-modal", "true");
    // O foco entra na gaveta (no botão de fechar) e a página atrás fica inerte.
    await expect(gaveta.getByRole("button", { name: "Fechar menu" })).toBeFocused();
    await expect(page.locator("main").locator("xpath=ancestor::*[@inert]")).toHaveCount(1);
    await expect(gaveta.getByRole("link", { name: "Notas fiscais" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Menu principal" })).toHaveCount(0);
    await expect(page.locator("main").locator("xpath=ancestor::*[@inert]")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Eventos" })).toBeVisible();
  });
});
