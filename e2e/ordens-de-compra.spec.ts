/**
 * Ordens de compra (28/10, Honorários Fase 2 manual) — o caminho feliz do DP
 * sobre o seed "Corrida Noturna do Recife" (server/dev/demo-seed-pagamento.ts):
 *  - registra a OC da prestação sem OC (Montagem, contrato ativo), desfaz
 *    (sem NF ainda) e registra de novo pelo LOTE colado, com uma linha com erro
 *    que a prévia aponta e a confirmação recusa;
 *  - marca como pago a prestação programada (seleção + diálogo) e vê "Pago".
 *
 * Registros: só a prestação SEM OC e a PROGRAMADA. As duas com acesso ao
 * portal (com OC e NF devolvida) ficam para o portal-colaborador.spec.
 */
import { test, expect, type Page } from "@playwright/test";
import { api, entrarComo, esperarToast } from "./helpers/demo";

const EVENTO = "Corrida Noturna do Recife";

interface Linha { actualId: string; estado: string; colaborador: { nome: string; numero: number } | null }

async function ordens(page: Page): Promise<{ eventId: string; linhas: Linha[] }> {
  const eventos = (await (await api(page).get("/api/events")).json()) as { id: string; name: string }[];
  const ev = eventos.find((e) => e.name === EVENTO);
  expect(ev, "evento das ordens de compra no seed").toBeTruthy();
  const r = (await (await api(page).get(`/api/ordens-de-compra?eventId=${ev!.id}`)).json()) as { linhas: Linha[] };
  return { eventId: ev!.id, linhas: r.linhas };
}

test.describe.configure({ mode: "serial" });

test("DP: registra a OC, desfaz e registra de novo pelo lote com uma linha com erro", async ({ page }) => {
  await entrarComo(page, "financial");
  const { eventId, linhas } = await ordens(page);
  const alvo = linhas.find((l) => l.estado === "sem_oc")!;
  await page.goto(`/ordens-de-compra?event=${eventId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Ordens de compra" })).toBeVisible();
  await expect(page.getByTestId("oc-fila-sem_oc")).toContainText("1");

  // Individual
  await page.getByTestId(`oc-registrar-${alvo.actualId}`).click();
  const dialogo = page.getByTestId("oc-dialogo-registrar");
  await dialogo.getByTestId("oc-numero").fill("4500777001");
  await dialogo.getByTestId("oc-salvar").click();
  await esperarToast(page, "OC 4500777001 registrada");
  await expect(page.getByTestId(`oc-numero-${alvo.actualId}`)).toHaveText("4500777001");

  // Desfazer (ainda sem nota)
  await page.getByTestId(`oc-menu-${alvo.actualId}`).click();
  await page.getByTestId(`oc-menu-desfazer-oc-${alvo.actualId}`).click();
  await page.getByTestId("oc-motivo-desfazer").fill("OC digitada errada no teste");
  await page.getByTestId("oc-confirmar-desfazer").click();
  await esperarToast(page, "OC 4500777001 desfeita");
  await expect(page.getByTestId(`oc-registrar-${alvo.actualId}`)).toBeVisible();

  // Lote: uma linha boa e uma com erro
  await page.getByTestId("oc-abrir-lote").click();
  await page.getByTestId("oc-lote-texto").fill(`#${alvo.colaborador!.numero} ; 4500777002\nPessoa Que Nao Existe ; 4500777003`);
  await page.getByTestId("oc-lote-ver-previa").click();
  await expect(page.getByTestId("oc-lote-linha-2")).toContainText("Colaborador não encontrado");
  await page.getByTestId("oc-lote-filtro-todas").click();
  await expect(page.getByTestId("oc-lote-linha-1")).toContainText("Entra");
  await page.getByTestId("oc-lote-confirmar").click();
  await expect(page.getByTestId("oc-lote-registradas")).toHaveText("1");
  await expect(page.getByTestId("oc-lote-resultado")).toContainText("Linha 2");
  await page.getByTestId("oc-lote-fechar").click();
  await expect(page.getByTestId(`oc-numero-${alvo.actualId}`)).toHaveText("4500777002");
});

test("DP: marca como pago a prestação programada", async ({ page }) => {
  await entrarComo(page, "financial");
  const { eventId, linhas } = await ordens(page);
  const prog = linhas.find((l) => l.estado === "programado")!;
  await page.goto(`/ordens-de-compra?event=${eventId}`);
  await page.getByTestId(`oc-selecionar-${prog.actualId}`).click();
  await expect(page.getByTestId("oc-barra-selecao")).toContainText("1 programada selecionada");
  await page.getByTestId("oc-marcar-selecionadas").click();
  const dialogo = page.getByTestId("oc-dialogo-pago");
  await dialogo.getByLabel("Observação").fill("TED do teste e2e");
  await dialogo.getByTestId("oc-confirmar-pago").click();
  await expect(page.getByTestId(`oc-pago-${prog.actualId}`)).toContainText("Pago em");
  await expect(page.getByTestId("oc-barra-selecao")).toHaveCount(0);
});
