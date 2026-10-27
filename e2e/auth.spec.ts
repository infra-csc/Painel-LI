/**
 * Autenticação: o login por papel muda o menu, sair derruba a sessão e a
 * tela /auth (login por senha, só fora de produção) trata senha errada.
 */
import { test, expect } from "@playwright/test";
import { DEMO_SENHA, USUARIO, api, entrarComo } from "./helpers/demo";

const menu = (page: import("@playwright/test").Page) => page.getByRole("complementary", { name: "Menu principal" });

test.describe("Login por papel", () => {
  test("admin vê 'Cadastro de usuários' e o grupo Honorários no menu", async ({ page }) => {
    await entrarComo(page, "admin");
    await expect(menu(page).getByRole("link", { name: "Cadastro de usuários" })).toBeVisible();
    // 26/10 (slide 11): o grupo "Financeiro" virou "Honorários".
    await expect(menu(page).getByRole("button", { name: "Honorários", exact: true })).toBeVisible();
    await expect(menu(page).getByRole("button", { name: "Financeiro" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Conta de ${USUARIO.admin.nome}` })).toBeVisible();
  });

  // 27/10: a Área de Função vê só a "Presença no evento" do grupo Honorários (das funções dela).
  test("function_area vê só a Presença no evento em Honorários, não vê Cadastro de usuários, e vê a Validação de escala", async ({ page }) => {
    await entrarComo(page, "function_area");
    await expect(menu(page).getByRole("link", { name: /Validação de escala/ })).toBeVisible();
    await expect(menu(page).getByRole("link", { name: "Presença no evento" })).toBeVisible();
    await expect(menu(page).getByRole("link", { name: "Painel de honorários" })).toHaveCount(0);
    await expect(menu(page).getByRole("link", { name: "Pré-aprovação de valores" })).toHaveCount(0);
    await expect(menu(page).getByRole("link", { name: "Notas fiscais" })).toHaveCount(0);
    await expect(menu(page).getByRole("link", { name: "Cadastro de usuários" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Conta de ${USUARIO.function_area.nome}` })).toBeVisible();
  });

  test("financial (Financeiro / DP) vê Honorários na ordem do fluxo e não vê o Log de auditoria", async ({ page }) => {
    await entrarComo(page, "financial");
    await expect(menu(page).getByRole("link", { name: "Painel de honorários" })).toBeVisible();
    await expect(menu(page).getByRole("link", { name: "Pré-aprovação de valores" })).toBeVisible();
    await expect(menu(page).getByRole("link", { name: "Conferência DP" })).toBeVisible();
    await expect(menu(page).getByRole("link", { name: "Notas fiscais" })).toBeVisible();
    await expect(menu(page).getByText("Configuração e apoio")).toBeVisible();
    await expect(menu(page).getByRole("link", { name: "Log de auditoria" })).toHaveCount(0);
  });
});

test.describe("Sair e tela /auth", () => {
  test("Sair encerra a sessão e mostra a tela de entrada", async ({ page }) => {
    await entrarComo(page, "admin");
    await page.getByRole("button", { name: `Conta de ${USUARIO.admin.nome}` }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();

    // A casca some e a tela de login (formulário direto, só em dev) aparece.
    await expect(page.getByRole("heading", { level: 1, name: "Logística Interna" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expect(menu(page)).toHaveCount(0);
    // A sessão no servidor foi derrubada de verdade.
    await expect.poll(async () => (await api(page).get("/api/auth/me")).status()).toBe(401);
    // Ao pedir /auth explicitamente, a tela de entrada continua lá.
    await page.goto("/auth");
    await expect(page.getByLabel("E-mail")).toBeVisible();
  });

  test("/auth com senha errada mostra a mensagem de credenciais inválidas", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("E-mail").fill(USUARIO.admin.email);
    await page.getByLabel("Senha", { exact: true }).fill("senha-errada");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toContainText(/Credenciais inválidas/);
    await expect(menu(page)).toHaveCount(0);
  });

  test("/auth com a senha de demonstração entra e redireciona para a primeira tela do papel", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("E-mail").fill(USUARIO.purchasing.email);
    await page.getByLabel("Senha", { exact: true }).fill(DEMO_SENHA);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(menu(page)).toBeVisible();
    await expect(page.getByRole("button", { name: `Conta de ${USUARIO.purchasing.nome}` })).toBeVisible();
    await expect(page).not.toHaveURL(/\/auth/);
  });
});
