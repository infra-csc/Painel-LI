/**
 * Honorários (financial — "Financeiro / DP"): evento em foco compartilhado
 * entre a Pré-aprovação (Planejado) e o Realizado; o Painel de honorários
 * (antigo Controle RH) lista e filtra pelos cards; Notas fiscais só devolve
 * com motivo. 26/10: o evento de SP do seed já terminou — é LEGADO (antes de
 * 01/11/2026): as telas abrem sem ele e o filtro "Mostrar eventos legados" o
 * traz; no Painel ele fica no recorte Legado.
 */
import { test, expect, type Page } from "@playwright/test";
import { entrarComo, esperarToast } from "./helpers/demo";
import { EVENTO_SP } from "./helpers/registros";

const botaoDoEvento = (page: Page) => page.getByRole("button", { name: `Evento: ${EVENTO_SP}. Trocar evento` });

/** Garante o evento em foco na tela atual (o seletor abre uma paleta com busca). */
async function escolherEvento(page: Page) {
  if (await botaoDoEvento(page).count()) return;
  await page.getByRole("button", { name: /Selecionar evento|Trocar evento/ }).click();
  const paleta = page.getByRole("dialog", { name: "Buscar evento" });
  // Legado (26/10): fica de fora por padrão; o filtro da paleta o mostra.
  const mostrarLegado = paleta.getByRole("checkbox", { name: /Mostrar eventos legados/ });
  if (await mostrarLegado.count() && !(await mostrarLegado.isChecked())) await mostrarLegado.check();
  await paleta.getByRole("combobox", { name: "Buscar evento" }).fill("São Paulo");
  await paleta.getByRole("option", { name: new RegExp(EVENTO_SP) }).click();
  await expect(botaoDoEvento(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await entrarComo(page, "financial");
});

test("Planejado com evento em foco → Realizado mantém o mesmo evento (e a URL carrega o contexto)", async ({ page }) => {
  await page.goto("/budget-planned");
  await expect(page.getByRole("heading", { level: 1, name: "Pré-aprovação de valores" })).toBeVisible();
  await escolherEvento(page);
  await expect(page).toHaveURL(/[?&]event=[0-9a-f-]{36}/);
  const idNaUrl = new URL(page.url()).searchParams.get("event");

  await page.getByRole("complementary", { name: "Menu principal" }).getByRole("link", { name: "Realizado" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Realizado" })).toBeVisible();
  await expect(botaoDoEvento(page)).toBeVisible();
  expect(new URL(page.url()).searchParams.get("event")).toBe(idNaUrl);
  // O evento de SP tem Realizado fechado: a tela lista as prestações dele.
  await expect(page.locator("main")).toContainText(/Total realizado/);
  // 08/10: o resumo do Realizado escreve "22 prestações" (minúscula).
  await expect(page.locator("main")).toContainText(/\d+\s*prestações/i);
});

test("Painel de honorários (legado) lista as prestações e filtra pelo card 'Aguardando DP'", async ({ page }) => {
  // Os eventos do seed com prestações já terminaram: recorte Legado.
  await page.goto("/rh-control?recorte=legado");
  await expect(page.getByRole("heading", { level: 1, name: "Painel de honorários" })).toBeVisible();
  await expect(page.getByTestId("painel-recorte-legado")).toHaveAttribute("aria-selected", "true");
  const card = page.getByRole("button", { name: /^Aguardando DP \d+/ });
  await expect(card).toHaveAttribute("aria-pressed", "false");
  // O número chega com os dados (antes disso o card mostra 0/esqueleto).
  const lerCard = async () => Number((await card.innerText()).match(/Aguardando DP\s+(\d+)/)?.[1] ?? 0);
  await expect.poll(lerCard).toBeGreaterThan(0);
  const pendentesDoRh = await lerCard();
  // Lista agrupada por evento, com itens.
  const resumo = page.locator("main").getByText(/Por evento\s*\d+ eventos?\s*·\s*\d+ itens/);
  await expect(resumo).toBeVisible();
  const totalAntes = Number((await resumo.innerText()).match(/(\d+) itens/)?.[1]);
  await expect(page.getByRole("button", { name: new RegExp(`^${EVENTO_SP}`) })).toBeVisible();

  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  // A faixa diz o recorte e conta os mesmos itens do card; a lista encolhe.
  // (Enquanto o novo recorte não chega, a lista anterior fica esmaecida — por
  // isso as contagens são esperadas, não lidas de imediato.)
  const faixa = page.getByText(/Mostrando apenas pendências do DP \(\d+ itens?\)/);
  await expect(faixa).toBeVisible();
  await expect(faixa).toContainText(new RegExp(`\\(${pendentesDoRh} itens?\\)`));
  await expect(resumo).toContainText(new RegExp(`· ${pendentesDoRh} itens`));
  expect(pendentesDoRh).toBeLessThan(totalAntes);

  // "Limpar" da própria faixa (a barra de filtros tem outro "Limpar").
  await faixa.getByRole("button", { name: "Limpar", exact: true }).click();
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await expect(faixa).toHaveCount(0);
  await expect(resumo).toContainText(new RegExp(`· ${totalAntes} itens`));
});

test("Notas fiscais: devolver sem motivo fica bloqueado; com motivo a nota vira 'Devolvida'", async ({ page }) => {
  await page.goto("/invoices");
  await expect(page.getByRole("heading", { level: 1, name: /Notas fiscais/ })).toBeVisible();
  await escolherEvento(page);
  // 08/10: as abas da tela viraram abas de verdade (role="tab").
  await page.getByRole("tab", { name: /^Aprovação DP/ }).click();

  const tabela = page.getByRole("table", { name: /Notas fiscais: colaborador/ });
  const aguardando = tabela.getByRole("row").filter({ hasText: "Aguardando DP" }).filter({ has: page.getByRole("button", { name: "Devolver" }) });
  const antes = await aguardando.count();
  expect(antes).toBeGreaterThan(0);
  const linha = aguardando.first();
  // Primeira célula: "S" (inicial do avatar), nome, "Aguardando DP há N dias".
  const colaborador = (await linha.getByRole("cell").first().innerText()).split("\n").map((s) => s.trim()).find((s) => s.length > 2 && !/^Aguardando/.test(s))!;
  expect(colaborador).toBeTruthy();
  await linha.getByRole("button", { name: "Devolver" }).click();

  const painel = tabela.getByRole("row").filter({ hasText: "Devolver para ajuste" });
  const confirmar = painel.getByRole("button", { name: "Confirmar devolução" });
  // (O rótulo é "Motivo da devolução" + marca de obrigatório; o painel só tem este campo.)
  const motivo = painel.getByRole("textbox");
  await expect(confirmar).toBeDisabled();
  await motivo.focus();
  await motivo.blur();
  await expect(painel).toContainText("Informe o motivo da devolução.");
  await expect(confirmar).toBeDisabled();

  await motivo.fill("E2E: número da OC não confere com o pedido.");
  await expect(confirmar).toBeEnabled();
  await confirmar.click();

  await esperarToast(page, "Nota devolvida para ajuste.");
  await expect(aguardando).toHaveCount(antes - 1);
  const devolvida = tabela.getByRole("row").filter({ hasText: colaborador });
  await expect(devolvida).toContainText("Devolvida");
  await expect(devolvida).toContainText("E2E: número da OC não confere com o pedido.");
});
