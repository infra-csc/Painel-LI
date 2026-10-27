/**
 * Presença no evento (27/10, Honorários Fase 1) — o caminho feliz das telas
 * internas, sobre o seed da presença ("Meia Maratona de Florianópolis",
 * server/dev/demo-seed-presenca.ts):
 *  - produção: na arena agora, lança a falta do dia sem registro, faz o
 *    check-out final de quem está pronto (o limite de ±10% trava antes),
 *    gera o código de acesso;
 *  - DP: a Conferência mostra o resumo da presença com "Ver presença".
 *
 * Registros: Caio (Fotografia, dia sem registro), Rodrigo (Montagem, pronto e
 * confirmado) e Amanda (Produtor, código). O portal (portal-colaborador.spec)
 * mexe no Paulo — roda antes e não cruza com estes.
 */
import { test, expect, type Page } from "@playwright/test";
import { api, entrarComo, esperarToast } from "./helpers/demo";

const EVENTO = "Meia Maratona de Florianópolis";

interface Dia { dia: string; estado: string }
interface Prestacao { actualId: string; colaborador: { nome: string } | null; dias: Dia[] }

async function presenca(page: Page): Promise<{ eventId: string; prestacoes: Prestacao[] }> {
  const eventos = (await (await api(page).get("/api/events")).json()) as { id: string; name: string }[];
  const ev = eventos.find((e) => e.name === EVENTO);
  expect(ev, "evento da presença no seed").toBeTruthy();
  const r = (await (await api(page).get(`/api/presenca/eventos/${ev!.id}`)).json()) as { prestacoes: Prestacao[] };
  return { eventId: ev!.id, prestacoes: r.prestacoes };
}

test.describe.configure({ mode: "serial" });

test("produção: na arena, falta do dia sem registro, check-out final dentro do limite e código de acesso", async ({ page }) => {
  await entrarComo(page, "production");
  const { eventId, prestacoes } = await presenca(page);
  await page.goto(`/presenca?event=${eventId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Presença no evento" })).toBeVisible();
  await expect(page.getByTestId("prs-na-arena")).toContainText("Na arena agora");
  await expect(page.getByRole("link", { name: "Presença no evento" }).first()).toBeVisible();

  // Falta no dia que passou sem registro (Caio).
  const caio = prestacoes.find((p) => p.colaborador?.nome.startsWith("Caio"))!;
  const semRegistro = caio.dias.find((d) => d.estado === "ausente")!;
  const cartaoCaio = page.getByTestId(`prs-pessoa-${caio.actualId}`);
  await cartaoCaio.getByTestId(`prs-dia-${semRegistro.dia}`).click();
  await page.getByTestId(`prs-falta-${semRegistro.dia}`).click();
  await page.getByTestId("prs-salvar-ocorrencia").click();
  await esperarToast(page, "Falta lançada");
  await expect(cartaoCaio).not.toContainText("Sem registro em");

  // Check-out final de quem está pronto (Rodrigo): fora do limite trava; o calculado vai.
  const rodrigo = prestacoes.find((p) => p.colaborador?.nome.startsWith("Rodrigo"))!;
  await page.getByTestId(`prs-checkout-${rodrigo.actualId}`).click();
  const dialogo = page.getByTestId("prs-dialogo-checkout");
  await expect(dialogo).toContainText("Memória de cálculo");
  const campo = dialogo.getByLabel("Valor final em reais");
  await campo.fill("99999,00");
  await campo.blur();
  await expect(dialogo.getByTestId("prs-fora-do-limite")).toBeVisible();
  await expect(dialogo.getByTestId("prs-enviar-checkout")).toBeDisabled();
  await dialogo.getByRole("button", { name: "Usar o calculado" }).click();
  await dialogo.getByTestId("prs-enviar-checkout").click();
  await esperarToast(page, "Check-out final feito");
  await expect(page.getByTestId(`prs-pessoa-${rodrigo.actualId}`)).toContainText("Enviado ao DP");

  // Código de acesso (Amanda): aparece uma vez, com o texto do WhatsApp.
  const amanda = prestacoes.find((p) => p.colaborador?.nome.startsWith("Amanda"))!;
  await page.getByTestId(`prs-acoes-${amanda.actualId}`).click();
  await page.getByTestId(`prs-menu-codigo-${amanda.actualId}`).click();
  await page.getByTestId("prs-gerar-codigo").click();
  await expect(page.getByTestId("prs-codigo-gerado")).toHaveText(/^\d{3} \d{3}$/);
  await expect(page.getByTestId("prs-codigo-mensagem")).toContainText("/colaborador com seu CPF");
});

test("DP: a Conferência mostra a presença de quem fez o check-out final", async ({ page }) => {
  await entrarComo(page, "financial");
  const { eventId, prestacoes } = await presenca(page);
  const rodrigo = prestacoes.find((p) => p.colaborador?.nome.startsWith("Rodrigo"))!;
  await page.goto(`/budget-comparison?event=${eventId}`);
  await page.getByTestId("comparativo-expandir-todas").click();
  const resumo = page.getByTestId(`cmp-presenca-${rodrigo.actualId}`);
  await expect(resumo).toContainText("Presença no evento");
  await expect(resumo).toContainText("Confirmou");
  await resumo.getByTestId(`cmp-ver-presenca-${rodrigo.actualId}`).click();
  await expect(page).toHaveURL(new RegExp(`/presenca\\?event=${eventId}&pessoa=${rodrigo.actualId}`));
  await expect(page.getByTestId(`prs-pessoa-${rodrigo.actualId}`)).toContainText("Enviado ao DP");
});
