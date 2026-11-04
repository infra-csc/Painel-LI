/**
 * Acessibilidade automática (axe, 04/11): rede do redesign. Violação crítica reprova sempre.
 * As demais têm um teto por tela em TETO, que só pode descer: a cada onda do redesign,
 * baixe o número da tela para o novo valor (o teste diz qual é).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { entrarComo } from "./helpers/demo";

// Violações sérias (regras distintas) por tela, medidas em 04/11.
const TETO: Record<string, number> = {};
const ROTAS = ["/paineis", "/pendencias", "/events", "/collaborators", "/scaling", "/scaling-validation", "/scaling-approval", "/tickets", "/accommodations", "/rh-control", "/honorarios-ceno", "/system-settings"];

for (const rota of ROTAS) {
  test(`axe: ${rota}`, async ({ page }) => {
    await entrarComo(page, "admin");
    await page.goto(rota);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const nos = (v: typeof violations[number]) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(" ")}`;
    const criticas = violations.filter((v) => v.impact === "critical");
    const serias = violations.filter((v) => v.impact === "serious");
    console.log(`[axe] ${rota}: ${criticas.length} críticas, ${serias.length} sérias | ${[...criticas, ...serias].map((v) => `${v.id}=${v.nodes.length}`).join(" ")}`);
    expect(criticas.map(nos)).toEqual([]);
    expect(serias.length, serias.map(nos).join("\n")).toBeLessThanOrEqual(TETO[rota] ?? 0);
  });
}
