/**
 * Portal do colaborador (/colaborador, Fase 1 dos Honorários) — o caminho
 * feliz no CELULAR, sobre o seed da presença ("Meia Maratona de Florianópolis",
 * server/dev/demo-seed-presenca.ts):
 *   código de acesso gerado pelo DP → primeiro acesso (CPF + código + senha)
 *   → termo → Meus eventos com "Hoje" no topo → check-in com selfie e GPS
 *   → hora registrada → check-out → sair.
 *
 * Registro: a prestação que está com HOJE sem check-in no seed. O código novo
 * troca a senha dela (o spec não depende da senha do seed).
 */
import { test, expect, type Browser } from "@playwright/test";
import { api, entrarComo, mutacao } from "./helpers/demo";

const SENHA_NOVA = "Arena2026ok";

interface PrestacaoInterna { actualId: string; colaborador: { id: string; nome: string } | null; dias: { dia: string; estado: string }[] }

/** Selfie de mentira (JPG) desenhada no próprio navegador. */
async function selfie(browser: Browser) {
  const pagina = await browser.newPage();
  const dataUrl = await pagina.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600; c.height = 800;
    const g = c.getContext("2d")!;
    g.fillStyle = "#4b6f9e"; g.fillRect(0, 0, 600, 800);
    g.fillStyle = "#ead9c9"; g.beginPath(); g.arc(300, 320, 130, 0, Math.PI * 2); g.fill();
    return c.toDataURL("image/jpeg", 0.9);
  });
  await pagina.close();
  return { name: "selfie.jpg", mimeType: "image/jpeg", buffer: Buffer.from(dataUrl.split(",")[1], "base64") };
}

test("@mobile primeiro acesso, termo, check-in com selfie e check-out", async ({ page, browser, context }) => {
  // 1) O DP gera o código de acesso de quem tem o dia de hoje livre.
  await entrarComo(page, "admin");
  const eventos = (await (await api(page).get("/api/events")).json()) as { id: string; name: string }[];
  const evento = eventos.find((e) => e.name === "Meia Maratona de Florianópolis");
  expect(evento, "evento da presença no seed").toBeTruthy();
  const painel = (await (await api(page).get(`/api/presenca/eventos/${evento!.id}`)).json()) as { prestacoes: PrestacaoInterna[] };
  const alvo = painel.prestacoes.find((p) => p.dias.some((d) => d.estado === "hoje_sem_checkin"));
  expect(alvo, "uma prestação com hoje sem check-in").toBeTruthy();
  const colabs = (await (await api(page).get("/api/collaborators")).json()) as { id: string; officialDocument: string | null }[];
  const cpf = String(colabs.find((c) => c.id === alvo!.colaborador!.id)?.officialDocument ?? "").replace(/\D/g, "");
  expect(cpf).toHaveLength(11);
  const gerado = await mutacao(page, "post", `/api/colaboradores/${alvo!.colaborador!.id}/codigo-de-acesso`);
  expect(gerado.status()).toBe(201);
  const { codigo } = (await gerado.json()) as { codigo: string };

  // 2) No celular: sai da sessão interna e cria a senha com o código.
  await context.clearCookies();
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -27.5823, longitude: -48.5489, accuracy: 15 });
  await page.goto("/colaborador");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await page.getByRole("button", { name: "Primeiro acesso ou esqueci a senha" }).click();
  await page.getByLabel("CPF").fill(cpf);
  await page.getByLabel("Código de acesso").fill(codigo);
  await page.getByLabel("Senha nova", { exact: true }).fill(SENHA_NOVA);
  await page.getByLabel("Repita a senha nova").fill(SENHA_NOVA);
  await page.getByRole("button", { name: "Criar senha e entrar" }).click();

  // 3) Termo (se ainda não aceito nesta versão).
  const termo = page.getByRole("button", { name: "Li e aceito" });
  const ola = page.getByRole("heading", { name: /^Olá,/ });
  await expect(termo.or(ola)).toBeVisible();
  if (await termo.isVisible()) {
    await page.getByRole("checkbox").check();
    await termo.click();
  }

  // 4) Meus eventos: hoje em destaque, check-in com selfie.
  await expect(page.getByText("Hoje · Meia Maratona de Florianópolis")).toBeVisible();
  const foto = await selfie(browser);
  const [seletor] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Fazer check-in" }).click(),
  ]);
  await seletor.setFiles(foto);
  await expect(page.getByRole("img", { name: "Prévia da sua selfie" })).toBeVisible();
  await expect(page.getByText("Localização pronta")).toBeVisible();
  await page.getByRole("button", { name: "Enviar check-in" }).click();
  const sucesso = page.getByRole("status").filter({ hasText: "Check-in registrado" });
  await expect(sucesso).toBeVisible();
  await expect(sucesso).toContainText(/\d{2}:\d{2}/);
  await page.getByRole("button", { name: "Pronto" }).click();

  // 5) Agora o destaque é o check-out.
  await expect(page.getByText(/Você entrou às \d{2}:\d{2}/)).toBeVisible();
  const [seletor2] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Fazer check-out" }).click(),
  ]);
  await seletor2.setFiles(foto);
  await page.getByRole("button", { name: "Enviar check-out" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Check-out registrado" })).toBeVisible();
  await page.getByRole("button", { name: "Pronto" }).click();

  // 6) O evento mostra o dia concluído; sair volta para Entrar.
  await page.getByRole("button", { name: /Meia Maratona de Florianópolis/ }).click();
  await expect(page.getByRole("heading", { name: "Seus dias" })).toBeVisible();
  await expect(page.getByText("Concluído").first()).toBeVisible();
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});
