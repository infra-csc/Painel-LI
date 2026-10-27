/**
 * Módulo de Honorários, Fase 0 (26/10) — de ponta a ponta, sobre o seed:
 *  - Pré-aprovação de valores: pré-aprovar uma linha (quem e quando),
 *    desfazer, pré-aprovar o evento inteiro com a prévia do total e enviar
 *    ao Realizado só o pré-aprovado;
 *  - "Não exibir valores" ao colaborador, por evento (ligado por padrão);
 *  - Painel de honorários: Fluxo novo × Legado e "Concluir em lote" com motivo.
 *
 * Registros: o evento de Curitiba (futuro — fluxo novo; nenhum outro spec mexe
 * no orçamento dele) e uma prestação do legado (eventos que já terminaram).
 */
import { test, expect, type Page } from "@playwright/test";
import { USUARIO, api, entrarComo, esperarToast } from "./helpers/demo";

const EVENTO_CURITIBA = "Corrida Noturna de Curitiba";

async function idDoEvento(page: Page, nome: string): Promise<string> {
  const eventos = (await (await api(page).get("/api/events")).json()) as { id: string; name: string }[];
  const ev = eventos.find((e) => e.name === nome);
  expect(ev, `evento ${nome} no seed`).toBeTruthy();
  return ev!.id;
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await entrarComo(page, "financial");
});

test("Pré-aprovação: linha (quem e quando), desfazer, o evento inteiro com prévia e só o pré-aprovado vai ao Realizado", async ({ page }) => {
  const eventId = await idDoEvento(page, EVENTO_CURITIBA);
  await page.goto(`/budget-planned?event=${eventId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Pré-aprovação de valores" })).toBeVisible();
  await expect(page.getByTestId("fila-pendentes")).toContainText("A pré-aprovar");

  const card = page.locator("article[data-card-id]").first();
  await expect(card).toContainText("A pré-aprovar");
  // Sem a pré-aprovação, não há "Enviar" na linha.
  await expect(card.getByRole("button", { name: /para o Realizado$/ })).toHaveCount(0);

  // 1) Uma linha
  await card.getByRole("button", { name: /^Pré-aprovar o valor de/ }).click();
  const dialogo = page.getByTestId("dialogo-pre-aprovar");
  await expect(dialogo).toContainText("Pré-aprovar este valor?");
  await dialogo.getByTestId("pre-aprovar-confirmar").click();
  await esperarToast(page, "Pré-aprovado pelo DP");
  await expect(card.getByTestId("planejado-quem-pre-aprovou")).toContainText(`Pré-aprovado por ${USUARIO.financial.nome}`);

  // 2) Desfazer
  await card.getByRole("button", { name: /^Desfazer a pré-aprovação de/ }).click();
  await page.getByTestId("desfazer-pre-aprovacao-confirmar").click();
  await esperarToast(page, "Pré-aprovação desfeita");
  await expect(card).toContainText("A pré-aprovar");

  // 3) O evento inteiro, com a prévia do total
  const pendentes = Number((await page.getByTestId("fila-pendentes").innerText()).match(/\d+/)?.[0] ?? 0);
  expect(pendentes).toBeGreaterThan(1);
  await page.getByTestId("planejado-pre-aprovar-evento").click();
  await expect(dialogo).toContainText(`Pré-aprovar ${pendentes} colaboradores?`);
  await expect(dialogo.getByTestId("pre-aprovar-total")).toContainText("R$");
  await dialogo.getByTestId("pre-aprovar-confirmar").click();
  await esperarToast(page, /pré-aprovados pelo DP/);
  await expect(page.getByTestId("fila-preaprovadas")).toContainText(String(pendentes));
  const gravados = (await (await api(page).get(`/api/budget-planned?eventId=${eventId}`)).json()) as { status: string; approvedByName: string | null }[];
  expect(gravados.filter((p) => p.status === "pre_aprovado")).toHaveLength(pendentes);
  expect(gravados[0].approvedByName).toBe(USUARIO.financial.nome);

  // 4) Enviar (liberar para a Produção) — só agora existe
  await card.getByRole("button", { name: /para o Realizado$/ }).click();
  const envio = page.getByRole("alertdialog").filter({ hasText: "Enviar ao Realizado?" });
  await envio.getByRole("button", { name: "Confirmar envio" }).click();
  await esperarToast(page, "Enviado para o Realizado!");
  await expect(card).toContainText("No Realizado");
});

test("'Não exibir valores' ao colaborador: ligado por padrão, o DP desliga e religa", async ({ page }) => {
  const eventId = await idDoEvento(page, EVENTO_CURITIBA);
  await page.goto(`/budget-planned?event=${eventId}`);
  const chave = page.getByTestId("ocultar-valores-chave");
  await expect(chave).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("ocultar-valores")).toContainText("O colaborador não verá os valores até a OC.");
  await chave.click();
  await esperarToast(page, "Valores visíveis ao colaborador");
  await expect(chave).toHaveAttribute("aria-checked", "false");
  // Religa: o servidor guarda (o toast anterior pode ainda estar na tela — confere pela API).
  await expect(chave).toBeEnabled();
  await chave.click();
  await expect(chave).toHaveAttribute("aria-checked", "true");
  await expect.poll(async () => {
    const evs = (await (await api(page).get("/api/events")).json()) as { id: string; ocultarValoresColaborador: boolean }[];
    return evs.find((e) => e.id === eventId)?.ocultarValoresColaborador;
  }).toBe(true);
});

test("Painel de honorários: abre no Fluxo novo; o Legado é só leitura e conclui em lote com motivo", async ({ page }) => {
  await page.goto("/rh-control");
  await expect(page.getByRole("heading", { level: 1, name: "Painel de honorários" })).toBeVisible();
  await expect(page.getByTestId("painel-recorte-fluxo_novo")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("painel-aviso-legado")).toHaveCount(0);

  // Uma prestação do legado que a lista mostra por padrão (aberta).
  const legado = (await (await api(page).get("/api/rh/controle?recorte=legado")).json()) as {
    itens: { id: string; collaboratorName: string | null; status: string; conclusaoForaDoFluxo: unknown; invoice: { status: string; checkinAt: string | null } | null }[];
  };
  const alvo = legado.itens.find((i) => i.collaboratorName && !i.conclusaoForaDoFluxo && i.status === "aguardando_prestacao");
  expect(alvo, "uma prestação aberta no legado").toBeTruthy();

  await page.getByTestId("painel-recorte-legado").click();
  await expect(page.getByTestId("painel-aviso-legado")).toContainText("Legado — só leitura");
  await page.getByPlaceholder("Buscar colaborador").fill(alvo!.collaboratorName!);
  const botao = page.getByTestId("painel-concluir-legado");
  await expect(botao).toBeEnabled();
  await botao.click();
  const dialogo = page.getByTestId("dialogo-concluir-legado");
  const confirmar = dialogo.getByTestId("concluir-legado-confirmar");
  await expect(confirmar).toBeDisabled();
  await dialogo.getByTestId("motivo-legado").fill("Pago fora do sistema antes do fluxo novo (teste e2e)");
  await confirmar.click();
  await esperarToast(page, /fora do fluxo/);

  const depois = (await (await api(page).get("/api/rh/controle?recorte=legado")).json()) as { itens: { id: string; conclusaoForaDoFluxo: { motivo: string } | null }[] };
  expect(depois.itens.find((i) => i.id === alvo!.id)?.conclusaoForaDoFluxo?.motivo).toContain("teste e2e");
});
