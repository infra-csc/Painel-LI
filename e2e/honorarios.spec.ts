/**
 * Honorários da cenotécnica (16/10) — o fluxo inteiro, em série, sobre o seed
 * de server/dev/demo-seed-honorarios.ts:
 *
 *   Rafael (production, valida a cenotécnica) lança o valor de uma vaga sem
 *   valor da Corrida Noturna de Curitiba e envia → Marcos (aprovador) aprova
 *   com ajuste → Patrícia (RH) libera parte da verba → o relatório por evento
 *   mostra pedido, aprovado, liberado e a liberar.
 *
 * Só toca em honorários (tabelas próprias) — nenhuma vaga muda.
 */
import { test, expect, type Page } from "@playwright/test";
import { api, confirmacao, entrarComo, esperarToast } from "./helpers/demo";

test.describe.configure({ mode: "serial" });

const EVENTO = "Corrida Noturna de Curitiba";
let eventId = "";
let alvo: { numero: number; nome: string; vagaId: string; statusDaVaga: string };

async function idDoEvento(page: Page): Promise<string> {
  const eventos = (await (await api(page).get("/api/events")).json()) as { id: string; name: string }[];
  const e = eventos.find((x) => x.name === EVENTO);
  expect(e, `evento ${EVENTO} no seed`).toBeTruthy();
  return e!.id;
}

test("quem pede: lança setor e valor na linha e envia para aprovação", async ({ page }) => {
  await entrarComo(page, "production");
  eventId = await idDoEvento(page);
  const pedido = (await (await api(page).get(`/api/honorarios-ceno/pedido?eventId=${eventId}`)).json()) as {
    linhas: { vaga: { id: string; inclusionNumber: number; collaboratorName: string | null; empreitaEmpresa: string | null; status: string } | null; honorario: unknown }[];
  };
  const linha = pedido.linhas.find((l) => l.vaga && !l.honorario && !l.vaga.empreitaEmpresa && l.vaga.collaboratorName);
  expect(linha, "uma vaga escalada sem valor em Curitiba").toBeTruthy();
  alvo = { numero: linha!.vaga!.inclusionNumber, nome: linha!.vaga!.collaboratorName!, vagaId: linha!.vaga!.id, statusDaVaga: linha!.vaga!.status };

  await page.goto(`/scaling-validation?aba=honorarios&eventId=${eventId}`);
  await expect(page.getByRole("tab", { name: /Honorários/ })).toHaveAttribute("aria-selected", "true");
  const linhaNaTela = page.getByTestId(`hon-linha-${alvo.numero}`);
  await expect(linhaNaTela).toBeVisible();

  await linhaNaTela.getByRole("combobox", { name: `Setor de ${alvo.nome}` }).click();
  await page.getByRole("option", { name: "Montagem" }).click();
  await expect(linhaNaTela.getByRole("status")).toContainText("Salvo");

  const valor = page.getByTestId(`hon-valor-${alvo.numero}`);
  await valor.fill("1.900,00");
  await valor.press("Enter");
  await expect(linhaNaTela.getByRole("status")).toContainText("Salvo");
  await expect(linhaNaTela).not.toContainText("— /diária");

  await page.getByTestId("hon-enviar").click();
  const dialogo = confirmacao(page);
  await expect(dialogo).toContainText(alvo.nome);
  // Só o nosso: desmarca os outros rascunhos do seed.
  for (const caixa of await dialogo.getByRole("checkbox").all()) {
    const rotulo = await caixa.getAttribute("aria-label");
    if (rotulo !== `Enviar ${alvo.nome}`) await caixa.click();
  }
  await dialogo.getByRole("button", { name: /^Enviar · R\$\s?1\.900,00/ }).click();
  await esperarToast(page, /1 pedido enviado ao aprovador/);
  await expect(linhaNaTela).toContainText("Aguardando aprovação");
});

test("aprovador: aprova com ajuste (valor novo + motivo) na aba Honorários", async ({ page }) => {
  await entrarComo(page, "aprovador");
  await page.goto("/scaling-approval?aba=honorarios");
  await expect(page.getByTestId("hon-aprovacao")).toBeVisible();
  await page.getByRole("button", { name: `Aprovar ${alvo.nome} com ajuste` }).click();
  const dialogo = page.getByRole("dialog");
  const valor = dialogo.getByLabel("Valor aprovado");
  await valor.fill("1700");
  await dialogo.getByLabel(/Motivo do ajuste/).fill("E2E: fechado em R$ 1.700 com a produção");
  await dialogo.getByRole("button", { name: /^Aprovar R\$\s?1\.700,00/ }).click();
  await esperarToast(page, "Aprovado com ajuste");
  await expect(page.getByRole("button", { name: `Aprovar ${alvo.nome} com ajuste` })).toHaveCount(0);
});

test("Financeiro: libera parte da verba e o relatório por evento soma tudo", async ({ page }) => {
  await entrarComo(page, "financial");
  await page.goto(`/honorarios-ceno?evento=${eventId}`);
  await page.getByRole("button", { name: `Registrar liberação de ${alvo.nome}` }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nº da OC/DP").fill("E2E-777");
  await dialogo.getByLabel("Valor liberado").fill("1000");
  await expect(dialogo).toContainText("Liberação parcial");
  await dialogo.getByRole("button", { name: /^Liberar R\$\s?1\.000,00 \(parcial\)/ }).click();
  await esperarToast(page, "Liberação parcial registrada");

  await page.getByRole("tab", { name: /Relatórios/ }).click();
  const linha = page.getByTestId("hon-relatorios").getByRole("row").filter({ hasText: EVENTO });
  await expect(linha).toContainText("R$ 1.700,00");
  await expect(linha).toContainText("R$ 1.000,00");
  await expect(linha).toContainText("R$ 700,00");

  // A escala não mudou: a vaga continua como estava.
  const vaga = (await (await api(page).get(`/api/team-inclusions/${alvo.vagaId}`)).json()) as { status: string };
  expect(vaga.status).toBe(alvo.statusDaVaga);
});
