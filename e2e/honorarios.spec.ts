/**
 * Honorários da cenotécnica — o fluxo inteiro, em série, sobre o seed de
 * server/dev/demo-seed-honorarios.ts (20/10: "eles têm que pedir aqui na
 * escalação e chegar para o aprovador em outra tela"):
 *
 *   Rafael (production, valida a cenotécnica) abre, na Escalação, o modal de
 *   uma vaga sem valor da Corrida Noturna de Curitiba, lança setor e valor na
 *   aba Honorário e envia → Marcos (aprovador) aprova com ajuste na tela
 *   Aprovação de honorários → Patrícia (RH) libera parte da verba → o
 *   relatório por evento mostra pedido, aprovado, liberado e a liberar.
 *
 * Só toca em honorários (tabelas próprias) — nenhuma vaga muda.
 */
import { test, expect, type Page } from "@playwright/test";
import { abrirModalDaVaga, api, confirmacao, entrarComo, esperarToast, type Vaga } from "./helpers/demo";

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

test("quem pede: lança setor e valor na aba Honorário do modal da vaga e envia", async ({ page }) => {
  await entrarComo(page, "production");
  eventId = await idDoEvento(page);
  const pedido = (await (await api(page).get(`/api/honorarios-ceno/pedido?eventId=${eventId}`)).json()) as {
    linhas: { vaga: { id: string; inclusionNumber: number; collaboratorName: string | null; empreitaEmpresa: string | null; status: string } | null; honorario: unknown }[];
  };
  const linha = pedido.linhas.find((l) => l.vaga && !l.honorario && !l.vaga.empreitaEmpresa && l.vaga.collaboratorName);
  expect(linha, "uma vaga escalada sem valor em Curitiba").toBeTruthy();
  alvo = { numero: linha!.vaga!.inclusionNumber, nome: linha!.vaga!.collaboratorName!, vagaId: linha!.vaga!.id, statusDaVaga: linha!.vaga!.status };

  // A Validação de escala não tem mais a troca "Escala | Honorários".
  await page.goto("/scaling-validation");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("seletor-de-secao")).toHaveCount(0);

  const modal = await abrirModalDaVaga(page, { id: alvo.vagaId, inclusionNumber: alvo.numero } as Vaga);
  await modal.getByTestId("aba-honorario").click();
  await expect(modal.getByTestId("hon-vaga-situacao")).toContainText("Sem pedido");
  // Sem valor nem setor, o envio fica travado e diz o que falta.
  await expect(modal.getByTestId("hon-vaga-enviar")).toBeDisabled();
  await expect(modal.getByTestId("hon-vaga-falta")).toBeVisible();

  await modal.getByRole("combobox", { name: "Setor" }).click();
  await page.getByRole("option", { name: "Montagem" }).click();
  await modal.getByLabel("Valor negociado").fill("1900");
  await expect(modal.getByTestId("hon-vaga-salvo")).toContainText("Alterações não salvas");

  await modal.getByTestId("hon-vaga-enviar").click();
  const dialogo = confirmacao(page);
  await dialogo.getByRole("button", { name: /^Enviar · R\$\s?1\.900,00/ }).click();
  await esperarToast(page, "Enviado ao aprovador");
  await expect(modal.getByTestId("hon-vaga-situacao")).toContainText("Aguardando aprovação");
  await expect(modal.getByTestId("hon-vaga-enviar")).toHaveCount(0);
});

test("aprovador: aprova com ajuste (valor novo + motivo) na tela Aprovação de honorários", async ({ page }) => {
  await entrarComo(page, "aprovador");
  await page.goto("/scaling-approval");
  // A aba "Honorários" saiu da Aprovação de escala; o item próprio está no menu.
  await expect(page.getByRole("tab", { name: /Honorários/ })).toHaveCount(0);
  await page.getByRole("link", { name: /Aprovação de honorários/ }).first().click();
  await expect(page).toHaveURL(/\/aprovacao-de-honorarios/);
  await expect(page.getByTestId("hon-aprovacao")).toBeVisible();
  await expect(page.getByTestId("hon-apr-totais")).toBeVisible();

  await page.getByRole("button", { name: `Aprovar ${alvo.nome} com ajuste` }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Valor aprovado").fill("1700");
  await dialogo.getByLabel(/Motivo do ajuste/).fill("E2E: fechado em R$ 1.700 com a produção");
  await dialogo.getByRole("button", { name: /^Aprovar R\$\s?1\.700,00/ }).click();
  await esperarToast(page, "Aprovado com ajuste");
  await expect(page.getByRole("button", { name: `Aprovar ${alvo.nome} com ajuste` })).toHaveCount(0);

  await page.getByRole("tab", { name: /Decididos/ }).click();
  await expect(page.getByTestId("hon-decididos")).toContainText(alvo.nome);
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

test("quem pede vê o resultado na vaga: aprovado com o valor ajustado", async ({ page }) => {
  await entrarComo(page, "production");
  const modal = await abrirModalDaVaga(page, { id: alvo.vagaId, inclusionNumber: alvo.numero } as Vaga);
  await modal.getByTestId("aba-honorario").click();
  await expect(modal.getByTestId("hon-vaga-valor-aprovado")).toHaveText(/R\$\s?1\.700,00/);
  await expect(modal.getByTestId("hon-vaga-situacao")).toContainText("Liberado parcial");
});
