/**
 * Módulo de Escala: a área valida uma sugestão COM observação, o aprovador lê
 * a observação e aprova, e a vaga vira 'planejado' na Escalação.
 *
 * Fluxo em série sobre a MESMA sugestão (SUGESTAO_VALIDACAO):
 *   function_area (Bruno Cardoso) valida → aprovador (Marcos Vieira) aprova.
 */
import { test, expect, type Page } from "@playwright/test";
import { acharSugestao, confirmacao, entrarComo, lerVaga, type Vaga } from "./helpers/demo";
import { SUGESTAO_VALIDACAO } from "./helpers/registros";

test.describe.configure({ mode: "serial" });

const OBSERVACAO = "E2E: conferir o horário do voo de volta — o evento termina tarde.";
let sugestao: Vaga & { canEdit?: boolean };

/** Contagem exibida num indicador do resumo ("Minhas pendentes: 3. …"). */
async function contagemDoIndicador(page: Page, rotulo: string): Promise<number> {
  const nome = await page.getByRole("button", { name: new RegExp(`^${rotulo}: \\d+`) }).getAttribute("aria-label");
  return Number(nome?.match(/: (\d+)/)?.[1]);
}

test("a área valida a sugestão com observação: sai de 'Minhas pendentes' e fica 'aguardando aprovação'", async ({ page }) => {
  await entrarComo(page, "function_area");
  sugestao = await acharSugestao(page, SUGESTAO_VALIDACAO);
  expect(sugestao.canEdit, "Bruno Cardoso precisa ser validador desta função").toBe(true);

  await page.goto("/scaling-validation");
  await expect(page.getByRole("heading", { level: 1, name: "Validação de escala" })).toBeVisible();
  const minhasAntes = await contagemDoIndicador(page, "Minhas pendentes");
  const aguardandoAntes = await contagemDoIndicador(page, "Aguardando aprovação");
  expect(minhasAntes).toBeGreaterThan(0);

  // Recorte "Minhas pendentes": a vaga está lá, com o botão Validar.
  await page.getByRole("button", { name: /^Minhas pendentes: \d+/ }).click();
  const linha = page.getByRole("row").filter({ has: page.getByRole("button", { name: `Ver detalhes da vaga #${sugestao.inclusionNumber}` }) });
  await expect(linha).toBeVisible();
  await expect(linha).toContainText("Aguardando validação da área");
  await linha.getByRole("button", { name: "Validar", exact: true }).click();

  const dialogo = confirmacao(page);
  await expect(dialogo).toContainText("Validar 1 vaga?");
  await expect(dialogo).toContainText(`#${sugestao.inclusionNumber}`);
  await dialogo.getByLabel(/Observação para o aprovador/).fill(OBSERVACAO);
  await dialogo.getByRole("button", { name: /Validar 1 vaga · enviar para aprovação/ }).click();
  await expect(dialogo).toBeHidden();

  // Saiu do recorte "minhas pendentes"…
  await expect(linha).toHaveCount(0);
  await expect.poll(() => contagemDoIndicador(page, "Minhas pendentes")).toBe(minhasAntes - 1);
  await expect.poll(() => contagemDoIndicador(page, "Aguardando aprovação")).toBe(aguardandoAntes + 1);

  // …e aparece como validada no recorte "Aguardando aprovação", com a observação marcada.
  await page.getByRole("button", { name: /^Aguardando aprovação: \d+/ }).click();
  const validada = page.getByRole("row").filter({ has: page.getByRole("button", { name: `Ver detalhes da vaga #${sugestao.inclusionNumber}` }) });
  await expect(validada).toContainText("Validada pela área — aguardando aprovação");
  await expect(validada.getByLabel("Tem observação da validação")).toBeVisible();

  const noServidor = await acharSugestao(page, { ...SUGESTAO_VALIDACAO, status: "sugestao_validada" });
  expect(noServidor.id).toBe(sugestao.id);
  expect(noServidor.validationNote).toBe(OBSERVACAO);
});

test("o aprovador vê a observação da área na Aprovação e aprova; a vaga vira 'planejado' na Escalação", async ({ page }) => {
  await entrarComo(page, "aprovador");
  await page.goto("/scaling-approval");
  await page.getByRole("tab", { name: /Vagas aguardando aprovação/ }).click();

  const linha = page.getByRole("row").filter({ has: page.getByRole("checkbox", { name: `Selecionar vaga #${sugestao.inclusionNumber}` }) });
  await expect(linha).toBeVisible();
  await expect(linha).toContainText("Bruno Cardoso");

  // A observação de quem validou: ícone com o texto no tooltip (foco abre).
  const dica = linha.getByLabel("Tem observação da validação");
  await dica.focus();
  await expect(page.getByRole("tooltip")).toContainText(OBSERVACAO);

  await linha.getByRole("button", { name: `Aprovar a vaga #${sugestao.inclusionNumber}` }).click();
  const dialogo = confirmacao(page);
  await expect(dialogo).toContainText("Aprovar 1 vaga?");
  // O painel de decisão repete a observação por extenso.
  await expect(dialogo).toContainText(OBSERVACAO);
  await dialogo.getByRole("button", { name: /^Aprovar \(1\)/ }).click();
  await expect(dialogo).toBeHidden();
  await expect(linha).toHaveCount(0);

  // Aprovada, a vaga sai da etapa de sugestão e entra na Escalação como planejado.
  await expect.poll(async () => (await lerVaga(page, sugestao.id)).status).toBe("planejado");
  const vaga = await lerVaga(page, sugestao.id);
  expect(vaga.phase).not.toBe("sugestao");

  await page.goto("/scaling");
  const naEscalacao = page.getByTestId(`row-inclusion-${sugestao.id}`);
  await expect(naEscalacao).toBeVisible();
  await expect(naEscalacao.getByTestId(vaga.collaboratorId ? "scaling-status-salvo" : "scaling-status-pendente")).toBeVisible();
});
