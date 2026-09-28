/**
 * Permissões: o que cada papel vê em Usuários e o que o servidor recusa com
 * 403 mesmo que alguém chame a API direto.
 */
import { test, expect } from "@playwright/test";
import { USUARIO, api, entrarComo, mutacao } from "./helpers/demo";

test.describe("Tela Usuários (/admin-users)", () => {
  test("admin vê 'Novo Usuário' e as ações de conta habilitadas", async ({ page }) => {
    await entrarComo(page, "admin");
    await page.goto("/admin-users");
    await expect(page.getByRole("heading", { level: 1, name: "Usuários" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo Usuário" })).toBeVisible();
    await expect(page.getByRole("button", { name: `Resetar senha de ${USUARIO.production.nome}` })).toBeEnabled();
  });

  test("production não vê 'Novo Usuário' e as ações só de admin ficam desabilitadas com o motivo no tooltip", async ({ page }) => {
    await entrarComo(page, "production");
    await page.goto("/admin-users");
    await expect(page.getByRole("heading", { level: 1, name: "Usuários" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo Usuário" })).toHaveCount(0);

    // O botão em si está desabilitado; o invólucro focável carrega o motivo.
    const resetar = page.getByRole("button", { name: `Resetar senha de ${USUARIO.purchasing.nome}` });
    await expect(resetar.last()).toBeDisabled();
    const involucro = resetar.first();
    await expect(involucro).toHaveAttribute("aria-disabled", "true");
    await involucro.hover();
    await expect(page.getByRole("tooltip")).toContainText("Só administradores podem fazer isso.");
    await expect(involucro).toHaveAccessibleDescription("Só administradores podem fazer isso.");
  });

  test("function_area não tem a tela: /admin-users redireciona para a primeira tela permitida", async ({ page }) => {
    await entrarComo(page, "function_area");
    await page.goto("/admin-users");
    await expect(page).not.toHaveURL(/\/admin-users/);
    await expect(page.getByRole("heading", { level: 1, name: "Usuários" })).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "Menu principal" }).getByRole("link", { name: "Usuários" })).toHaveCount(0);
  });
});

test.describe("API direta (com o cookie da sessão)", () => {
  test("production: aprovar usuário (PATCH /api/users/:id/approval) → 403", async ({ page }) => {
    await entrarComo(page, "production");
    const usuarios = (await (await api(page).get("/api/users")).json()) as { id: string; email: string }[];
    const alvo = usuarios.find((u) => u.email === USUARIO.function_area.email)!;
    const r = await mutacao(page, "patch", `/api/users/${alvo.id}/approval`, { status: "approved" });
    expect(r.status()).toBe(403);
    expect((await r.json()).message).toMatch(/Sem permissão/);
    // Nada mudou.
    const depois = (await (await api(page).get("/api/users")).json()) as { id: string; status: string }[];
    expect(depois.find((u) => u.id === alvo.id)?.status).toBe("approved");
  });

  test("function_area: listar usuários (GET /api/users) → 403; log de auditoria → 403", async ({ page }) => {
    await entrarComo(page, "function_area");
    expect((await api(page).get("/api/users")).status()).toBe(403);
    expect((await api(page).get("/api/system-logs")).status()).toBe(403);
  });

  test("financial (RH) não registra passagem (POST /api/tickets) → 403", async ({ page }) => {
    await entrarComo(page, "financial");
    const vagas = (await (await api(page).get("/api/team-inclusions")).json()) as { id: string; status: string }[];
    const escalada = vagas.find((v) => v.status === "escalado")!;
    const r = await mutacao(page, "post", "/api/tickets", { teamInclusionId: escalada.id, transportType: "aereo" });
    expect(r.status()).toBe(403);
  });

  test("mutação sem Origin é barrada pelo gate de CSRF (403), mesmo com sessão válida", async ({ page }) => {
    await entrarComo(page, "admin");
    const r = await api(page).post("/api/tickets", { data: {} });
    expect(r.status()).toBe(403);
    expect((await r.json()).message).toBe("Origem não informada");
  });

  test("sem sessão: a API recusa com 401 e a rota de demo exige um papel conhecido", async ({ request }) => {
    expect((await request.get("/api/team-inclusions")).status()).toBe(401);
    expect((await request.get("/__demo/entrar?papel=hacker", { maxRedirects: 0 })).status()).toBe(400);
  });
});
