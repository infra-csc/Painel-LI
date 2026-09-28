/**
 * Troca de colaborador: a Logística (production) pede, Compras (purchasing)
 * decide. Com passagem já registrada, a aprovação avisa que Compras precisa
 * revisar a logística.
 */
import { test, expect } from "@playwright/test";
import { abrirModalDaVaga, acharVaga, api, confirmacao, entrarComo, esperarToast, lerVaga, mutacao, type Vaga } from "./helpers/demo";
import { VAGA_TROCA_COM_PASSAGEM, VAGA_TROCA_SIMPLES } from "./helpers/registros";

test.describe.configure({ mode: "serial" });

const NOVO_COLABORADOR = "Amanda Moreira Cunha";
const MOTIVO = "E2E: colaborador atual indisponível na data do evento.";

test.describe("Troca simples (sem passagem)", () => {
  let vaga: Vaga;
  let colaboradorAntes: string | null;

  test("a Logística abre a troca de uma vaga escalada", async ({ page }) => {
    await entrarComo(page, "production");
    vaga = await acharVaga(page, VAGA_TROCA_SIMPLES);
    colaboradorAntes = vaga.collaboratorId;

    const modal = await abrirModalDaVaga(page, vaga);
    await modal.getByTestId("button-request-swap").click();

    const troca = page.getByRole("dialog", { name: "Solicitar troca de colaborador" });
    await expect(troca).toBeVisible();
    await expect(troca.getByRole("radio", { name: /Colocar outro colaborador/ })).toBeChecked();
    const enviar = troca.getByRole("button", { name: "Enviar para aprovação" });
    await expect(enviar).toBeDisabled();

    await troca.getByRole("button", { name: new RegExp(`^${NOVO_COLABORADOR}`) }).click();
    await troca.getByLabel(/Motivo da troca/).fill(MOTIVO);
    await expect(enviar).toBeEnabled();
    await enviar.click();

    // A confirmação pós-envio é um segundo diálogo, por cima do formulário.
    const enviada = page.getByRole("dialog", { name: "Solicitação enviada para aprovação" });
    await expect(enviada).toContainText("A troca foi enviada para análise do time de Compras.");
    await expect(enviada).toContainText(NOVO_COLABORADOR);
    await enviada.getByRole("button", { name: "Entendi" }).click();
    await expect(enviada).toBeHidden();

    // O pedido existe, pendente, e a escala AINDA está com o colaborador atual.
    const pedidos = (await (await api(page).get(`/api/swap-requests/inclusion/${vaga.id}`)).json()) as { status: string; reason: string }[];
    expect(pedidos.some((p) => p.status === "pendente" && p.reason === MOTIVO)).toBe(true);
    expect((await lerVaga(page, vaga.id)).collaboratorId).toBe(colaboradorAntes);
  });

  test("Compras aprova: o colaborador é trocado na escala", async ({ page }) => {
    await entrarComo(page, "purchasing");
    const modal = await abrirModalDaVaga(page, vaga);
    await expect(modal).toContainText("Troca solicitada");
    await modal.getByTestId("button-approve-swap").click();

    const dialogo = confirmacao(page);
    await expect(dialogo).toContainText("Aprovar troca de colaborador?");
    await dialogo.getByRole("button", { name: "Confirmar aprovação" }).click();

    await esperarToast(page, "Troca aprovada");
    // Sem passagem/hospedagem na vaga, não há aviso de logística.
    await expect(page.getByRole("status").filter({ hasText: "Compras precisa revisar" })).toHaveCount(0);

    await expect.poll(async () => (await lerVaga(page, vaga.id)).collaboratorId).not.toBe(colaboradorAntes);
    await expect(page.getByTestId(`row-inclusion-${vaga.id}`)).toContainText(NOVO_COLABORADOR);
  });
});

test.describe("Troca com passagem registrada", () => {
  let vaga: Vaga;

  test("Compras aprova a troca e recebe o aviso de que a logística precisa ser revisada", async ({ page }) => {
    // Compras registra a passagem (API — o formulário é coberto em passagens.spec).
    await entrarComo(page, "purchasing");
    vaga = await acharVaga(page, VAGA_TROCA_COM_PASSAGEM);
    const passagem = await mutacao(page, "post", "/api/tickets", {
      teamInclusionId: vaga.id, transportType: "aereo", ticketStatus: "comprada", purchaseOrderNumber: "OC-E2E-TROCA", locator: "E2ETRC",
    });
    expect(passagem.ok(), `POST /api/tickets → ${passagem.status()}`).toBeTruthy();
    await expect.poll(async () => (await lerVaga(page, vaga.id)).status).toBe("passagem_comprada");

    // A Logística pede a troca (API — o formulário é coberto no bloco acima).
    await entrarComo(page, "production");
    const pedido = await mutacao(page, "post", "/api/swap-requests", {
      // Colaboradora "local" de SP que não está em nenhuma vaga deste evento
      // (Alexandre Costa Cunha já entrou no Night Run pela escalacao.spec).
      teamInclusionId: vaga.id, newCollaboratorId: await idDoColaborador(page, "Amanda Pinto Ribeiro"), newCity: "São Paulo - SP", reason: MOTIVO, kind: "substituicao",
    });
    expect(pedido.ok(), `POST /api/swap-requests → ${pedido.status()} ${await pedido.text()}`).toBeTruthy();

    // Compras decide na tela.
    await entrarComo(page, "purchasing");
    const modal = await abrirModalDaVaga(page, vaga);
    await modal.getByTestId("button-approve-swap").click();
    await confirmacao(page).getByRole("button", { name: "Confirmar aprovação" }).click();

    await esperarToast(page, "Troca aprovada");
    await esperarToast(page, "Compras precisa revisar");
    await expect.poll(async () => (await lerVaga(page, vaga.id)).collaboratorId).not.toBe(vaga.collaboratorId);
  });
});

async function idDoColaborador(page: import("@playwright/test").Page, nome: string): Promise<string> {
  const lista = (await (await api(page).get("/api/collaborators")).json()) as { id: string; fullName: string }[];
  const c = lista.find((x) => x.fullName === nome);
  expect(c, `colaborador "${nome}" não está no seed`).toBeTruthy();
  return c!.id;
}
