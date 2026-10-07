/**
 * Passagens (purchasing): registrar a passagem de uma vaga escalada muda o
 * status para 'passagem_comprada'; marcar como emitida carimba a linha.
 */
import { test, expect } from "@playwright/test";
import { acharVaga, addDias, entrarComo, esperarToast, lerVaga, type Vaga } from "./helpers/demo";
import { VAGA_PASSAGEM } from "./helpers/registros";

test.describe.configure({ mode: "serial" });

let vaga: Vaga;

test.beforeEach(async ({ page }) => {
  await entrarComo(page, "purchasing");
  vaga ??= await acharVaga(page, VAGA_PASSAGEM);
});

test("registrar a passagem de uma vaga escalada deixa a vaga 'passagem_comprada'", async ({ page }) => {
  expect(vaga.needsTicket, "a vaga do seed precisa viajar").toBe(true);
  await page.goto("/tickets");
  const linha = page.getByRole("row").filter({ has: page.getByTestId(`buy-ticket-${vaga.inclusionNumber}`) });
  await expect(linha).toContainText("Pendente");
  await page.getByTestId(`buy-ticket-${vaga.inclusionNumber}`).click();

  const modal = page.getByRole("dialog", { name: "Registro de passagem" });
  await expect(modal).toContainText(`#${vaga.inclusionNumber}`);
  await modal.getByRole("tab", { name: /Dados da passagem/ }).click();

  const ida = addDias(vaga.scheduleStartDate!, -1);
  const volta = addDias(vaga.scheduleEndDate!, 1);
  // Os rótulos terminam na marca de obrigatório ("*" oculto + "(obrigatório)"),
  // por isso a busca é pelo começo do texto. Os campos da VOLTA sem
  // obrigatoriedade têm o mesmo nome — o "obrigatório" desambigua a IDA.
  await modal.getByLabel(/^LOC\b/).fill("E2E123");
  await modal.getByLabel(/^Valor da passagem/).fill("850,00");
  await modal.getByLabel(/^Aeroporto de origem.*obrigatório/).fill("SSA");
  await modal.getByLabel(/^Aeroporto de destino.*obrigatório/).fill("POA");
  await modal.getByLabel(/^Data \(ida\)/).fill(ida);
  await modal.getByLabel(/^Horário \(ida\)/).fill("07:30");
  await modal.getByLabel(/^Chegada \(ida\)/).fill("10:15");
  await modal.getByLabel(/^Data \(volta\)/).fill(volta);
  await modal.getByLabel(/^Horário \(volta\)/).fill("18:40");
  await modal.getByTestId(`button-register-ticket-${vaga.id}`).click();

  await esperarToast(page, "Passagem registrada");
  await expect(modal).toBeHidden();
  await expect.poll(async () => (await lerVaga(page, vaga.id)).status).toBe("passagem_comprada");

  // A linha agora mostra a compra (e não oferece mais "Registrar").
  await expect(page.getByTestId(`buy-ticket-${vaga.inclusionNumber}`)).toHaveCount(0);
  const comprada = page.getByRole("row").filter({ has: page.getByTestId(`view-ticket-${vaga.inclusionNumber}`) });
  await expect(comprada).toBeVisible();
  await expect(comprada.getByTestId(`ticket-summary-${vaga.id}`)).toBeVisible();
  await expect(comprada).toContainText("Comprada");
});

test("marcar a passagem como emitida carimba a linha", async ({ page }) => {
  await page.goto("/tickets");
  const linha = page.getByRole("row").filter({ has: page.getByTestId(`toggle-emitida-${vaga.id}`) });
  await expect(linha).toBeVisible();
  await expect(linha.getByTestId(`ticket-emitida-${vaga.id}`)).toHaveCount(0);

  await page.getByTestId(`toggle-emitida-${vaga.id}`).click();
  await esperarToast(page, /marcada\(s\) como emitida\(s\)/);
  await expect(linha.getByTestId(`ticket-emitida-${vaga.id}`)).toContainText("Emitida");
  await expect(page.getByTestId(`toggle-emitida-${vaga.id}`)).toHaveAccessibleName("Desfazer emissão da passagem");

  const passagens = (await (await page.request.get("/api/tickets")).json()) as { teamInclusionId: string; emittedAt: string | null }[];
  expect(passagens.find((t) => t.teamInclusionId === vaga.id)?.emittedAt).toBeTruthy();
});
