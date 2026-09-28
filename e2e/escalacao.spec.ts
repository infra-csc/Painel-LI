/**
 * Escalação (admin): vaga aberta → Salvo → Escalado → 409 ao reconfirmar →
 * Cancelada (pela Inclusão de equipe) → reativada.
 *
 * Os testes são um fluxo em série sobre a MESMA vaga (VAGA_ESCALACAO).
 */
import { test, expect } from "@playwright/test";
import { abrirModalDaVaga, acharVaga, confirmacao, entrarComo, esperarToast, lerVaga, linhaNaEscalacao, mutacao, type Vaga } from "./helpers/demo";
import { VAGA_ESCALACAO } from "./helpers/registros";

test.describe.configure({ mode: "serial" });

const COLABORADOR = "Alexandre Costa Cunha";
let vaga: Vaga;

test.beforeEach(async ({ page }) => {
  await entrarComo(page, "admin");
  vaga ??= await acharVaga(page, VAGA_ESCALACAO);
});

test("escolher um colaborador ativo e Salvar deixa a vaga como 'Salvo' (ainda aberta)", async ({ page }) => {
  const modal = await abrirModalDaVaga(page, vaga);
  // A pílula aparece no cabeçalho e no cartão de resumo — a mesma situação nas duas.
  await expect(modal.getByTestId("scaling-status-pendente").first()).toContainText("Vaga aberta");
  // Sem nome, confirmar é impossível — o rodapé diz o motivo.
  await expect(modal.getByTestId("button-confirm-scaling")).toBeDisabled();
  await expect(modal.getByTestId("text-confirm-block-reason")).toContainText(/Selecione um colaborador/);

  await modal.getByRole("button", { name: new RegExp(`^${COLABORADOR}`) }).click();
  await expect(modal.getByTestId("text-collaborator-escolhido")).toHaveText(COLABORADOR);
  await modal.getByTestId("button-save-scaling").click();

  await esperarToast(page, "Colaborador salvo — vaga ainda aberta");
  await expect(modal).toBeHidden();
  const linha = page.getByTestId(`row-inclusion-${vaga.id}`);
  await expect(linha.getByTestId("scaling-status-salvo")).toContainText("Salvo");
  await expect(linha).toContainText(COLABORADOR);
  expect((await lerVaga(page, vaga.id)).status).toBe("planejado");
});

test("Confirmar Escalação deixa a vaga 'Escalado' e avisa por toast", async ({ page }) => {
  const modal = await abrirModalDaVaga(page, vaga);
  await expect(modal.getByTestId("scaling-status-salvo").first()).toBeVisible();
  const confirmar = modal.getByTestId("button-confirm-scaling");
  await expect(confirmar).toBeEnabled();
  await confirmar.click();

  await esperarToast(page, "Escalação confirmada");
  await expect(modal).toBeHidden();
  await expect(page.getByTestId(`row-inclusion-${vaga.id}`).getByTestId("scaling-status-escalado")).toContainText("Escalado");
  // O servidor decide o status gravado (nextStatusOnConfirm): vaga sem passagem
  // nem hospedagem já nasce `aprovado`; com logística fica `escalado`. Os dois
  // são "Escalado" na pílula (CONFIRMED_STATUSES).
  expect(["escalado", "aprovado"]).toContain((await lerVaga(page, vaga.id)).status);
});

test("confirmar de novo devolve 409 e a vaga não muda", async ({ page }) => {
  // Já escalada, o modal nem oferece o botão: a segunda confirmação só chega
  // por uma aba antiga — e o servidor recusa com 409 sem mexer no status.
  const modal = await abrirModalDaVaga(page, vaga);
  await expect(modal.getByTestId("button-confirm-scaling")).toHaveCount(0);
  await modal.getByRole("button", { name: "Fechar" }).first().click();

  const statusAntes = (await lerVaga(page, vaga.id)).status;
  const r = await mutacao(page, "post", `/api/team-inclusions/${vaga.id}/confirm`);
  expect(r.status()).toBe(409);
  expect((await lerVaga(page, vaga.id)).status).toBe(statusAntes);
  await page.reload();
  await expect(page.getByTestId(`row-inclusion-${vaga.id}`).getByTestId("scaling-status-escalado")).toBeVisible();
});

test("cancelar a vaga pela ação própria (Inclusão de equipe) deixa 'Cancelada'", async ({ page }) => {
  await page.goto("/team-inclusion");
  // A tabela é virtualizada: a busca por ID traz a linha para a tela.
  await page.getByRole("textbox", { name: "ID ou nome…" }).fill(String(vaga.inclusionNumber));
  const linha = page.getByTestId(`row-inclusion-${vaga.id}`);
  await expect(linha).toBeVisible();
  await linha.getByRole("button", { name: `Cancelar escalação da inclusão #${vaga.inclusionNumber}` }).click();

  const dialogo = confirmacao(page);
  await expect(dialogo).toContainText("Cancelar escalação?");
  await dialogo.getByRole("button", { name: "Cancelar escalação" }).click();

  await esperarToast(page, "Vaga cancelada");
  await expect(linha).toContainText("Cancelada");
  expect((await lerVaga(page, vaga.id)).status).toBe("cancelado");
});

test("Reativar escalação (admin) tira a vaga de 'Cancelada'", async ({ page }) => {
  const linha = await linhaNaEscalacao(page, vaga);
  await expect(linha.getByTestId("scaling-status-cancelado")).toContainText("Cancelada");
  await linha.click();
  const modal = page.getByRole("dialog").filter({ hasText: `#${vaga.inclusionNumber}` });
  await modal.getByRole("button", { name: "Reativar escalação" }).click();

  const dialogo = confirmacao(page);
  await expect(dialogo).toContainText("Reativar escalação?");
  await dialogo.getByRole("button", { name: "Sim, reativar" }).click();

  await esperarToast(page, "Escalação reativada");
  await expect.poll(async () => (await lerVaga(page, vaga.id)).status).not.toBe("cancelado");
  await expect(page.getByTestId(`row-inclusion-${vaga.id}`).getByTestId("scaling-status-cancelado")).toHaveCount(0);
});
