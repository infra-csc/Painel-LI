/**
 * Honorários da cenotécnica — o fluxo inteiro, em série, sobre o seed de
 * server/dev/demo-seed-honorarios.ts. Regras do dono de 20/10:
 *  - "não precisa escalar": a vaga ABERTA (sem colaborador) pede;
 *  - "ele só coloca qual tipo de freela ou um valor à parte": o valor é o da
 *    tabela do tipo de freela, ou "Outro valor";
 *  - "empreita também ele pode colocar e selecionar quais escalações estão
 *    nessa empreita": a empreita agrupa vagas e vai como UM pedido.
 *
 *   Rafael (production, valida a cenotécnica), na Escalação, abre o modal de
 *   uma vaga aberta da Corrida Noturna de Curitiba, escolhe Freela Local (A) e
 *   envia; numa segunda vaga aberta cria uma empreita marcando também uma vaga
 *   escalada e a envia pela gaveta "Honorários do evento" → Marcos (aprovador)
 *   aprova os dois na tela Aprovação de honorários → no Planejado (21/10) a
 *   vaga escalada da empreita mostra a parte dela (R$ 3.000 ÷ 2) como a mão
 *   de obra → Patrícia (RH) libera a
 *   empreita → o relatório por evento soma tudo, a empreita uma vez só.
 *
 * Só toca em honorários (tabelas próprias) e no tipo de freela da vaga que
 * ainda não tinha tipo (o honorário grava, para o Planejado bater).
 */
import { test, expect, type Page } from "@playwright/test";
import { abrirModalDaVaga, api, confirmacao, entrarComo, esperarToast, type Vaga } from "./helpers/demo";

test.describe.configure({ mode: "serial" });

const EVENTO = "Corrida Noturna de Curitiba";
const EMPREITA = "Equipe E2E Pórtico";
let eventId = "";
type VagaDoPedido = { id: string; inclusionNumber: number; collaboratorId: string | null; collaboratorName: string | null; empreitaEmpresa: string | null; status: string; cenoFreelaTipo: string | null };
let aberta: VagaDoPedido;
let abertaDaEmpreita: VagaDoPedido;
let escaladaDaEmpreita: VagaDoPedido;
let nomeDaAberta = "";

async function idDoEvento(page: Page): Promise<string> {
  const eventos = (await (await api(page).get("/api/events")).json()) as { id: string; name: string }[];
  const e = eventos.find((x) => x.name === EVENTO);
  expect(e, `evento ${EVENTO} no seed`).toBeTruthy();
  return e!.id;
}

const modalDe = (page: Page, v: VagaDoPedido) => abrirModalDaVaga(page, { id: v.id, inclusionNumber: v.inclusionNumber } as Vaga);

test("quem pede: a vaga ABERTA, sem colaborador, pede pelo tipo de freela (valor da tabela) e envia", async ({ page }) => {
  await entrarComo(page, "production");
  eventId = await idDoEvento(page);
  const pedido = (await (await api(page).get(`/api/honorarios-ceno/pedido?eventId=${eventId}`)).json()) as {
    linhas: { vaga: VagaDoPedido | null; honorario: unknown; tabela: { valores: Record<string, { total: number } | null> } | null; sugestao: { nome: string } | null }[];
  };
  const abertas = pedido.linhas.filter((l) => l.vaga && !l.vaga.collaboratorId && !l.vaga.empreitaEmpresa && !l.honorario);
  expect(abertas.length, "duas vagas abertas sem pedido em Curitiba").toBeGreaterThanOrEqual(2);
  aberta = abertas[0].vaga!;
  abertaDaEmpreita = abertas[1].vaga!;
  nomeDaAberta = abertas[0].sugestao!.nome;
  expect(nomeDaAberta).toMatch(/^Vaga #\d+ sem nome · /);
  const escalada = pedido.linhas.find((l) => l.vaga && l.vaga.collaboratorName && !l.vaga.empreitaEmpresa && !l.honorario);
  expect(escalada, "uma vaga escalada sem valor em Curitiba").toBeTruthy();
  escaladaDaEmpreita = escalada!.vaga!;
  const tabelaLocalA = abertas[0].tabela!.valores.local_a!.total;
  const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  const modal = await modalDe(page, aberta);
  await modal.getByTestId("aba-honorario").click();
  // Não pede mais para escalar: o formulário normal, com a linha discreta.
  await expect(modal.getByTestId("hon-vaga-sem-colaborador")).toContainText("o pedido segue assim mesmo");
  await expect(modal.getByTestId("hon-vaga-sem-linha")).toHaveCount(0);
  await expect(modal.getByTestId("hon-vaga-enviar")).toBeDisabled();
  await expect(modal.getByTestId("hon-vaga-falta")).toContainText("tipo de freela");

  await modal.getByTestId("hon-vaga-tipo-local_a").click();
  await expect(modal.getByTestId("hon-vaga-valor-do-pedido")).toContainText(reais(tabelaLocalA));
  await expect(modal.getByTestId("hon-tipo-na-vaga")).toBeVisible();
  await modal.getByTestId("hon-vaga-enviar").click();
  const dialogo = confirmacao(page);
  await expect(dialogo).toContainText("Freela Local (A) · tabela");
  await dialogo.getByRole("button", { name: /^Enviar · R\$/ }).click();
  await esperarToast(page, "Enviado ao aprovador");
  await expect(modal.getByTestId("hon-vaga-situacao")).toContainText("Aguardando aprovação");

  // A vaga não tinha tipo no Resumo: passou a ter o escolhido no honorário.
  const vaga = (await (await api(page).get(`/api/team-inclusions/${aberta.id}`)).json()) as { cenoFreelaTipo: string | null; collaboratorId: string | null };
  expect(vaga).toMatchObject({ cenoFreelaTipo: "local_a", collaboratorId: null });
});

test("quem pede: cria uma empreita a partir da aba da vaga, marca mais uma vaga e envia pela gaveta do evento", async ({ page }) => {
  await entrarComo(page, "production");
  const modal = await modalDe(page, abertaDaEmpreita);
  await modal.getByTestId("aba-honorario").click();
  await modal.getByTestId("hon-vaga-parte-de-empreita").click();
  await modal.getByTestId("hon-vaga-criar-empreita").click();

  const det = page.getByTestId("hon-detalhes");
  await expect(det).toBeVisible();
  await det.getByLabel("Responsável ou equipe").fill(EMPREITA);
  const lista = det.getByTestId("hon-vagas");
  await expect(lista.getByRole("checkbox", { name: new RegExp(`#${abertaDaEmpreita.inclusionNumber}\\b`) })).toBeChecked();
  await lista.getByRole("checkbox", { name: new RegExp(`#${escaladaDaEmpreita.inclusionNumber}\\b`) }).click();
  await expect(det.getByLabel("Pessoas")).toHaveValue("2");
  await det.getByLabel("Valor fechado").fill("3000");
  await det.getByTestId("hon-detalhes-salvar").click();
  await esperarToast(page, "Empreita adicionada");
  await expect(modal.getByTestId("hon-vaga-na-empreita")).toContainText(`Faz parte da empreita ${EMPREITA}`);
  await expect(modal.getByTestId("hon-vaga-na-empreita")).toContainText("2 vagas");

  // A gaveta "Honorários do evento" (link do sino sem um devolvido só → lista de eventos).
  await page.goto("/scaling?honorarios=eventos");
  const sheet = page.getByTestId("hon-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId(`hon-evento-${eventId}`).click();
  await expect(sheet.getByText(EMPREITA).first()).toBeVisible();
  await sheet.getByTestId("hon-enviar").click();
  const dialogo = confirmacao(page);
  // Só a empreita vai neste envio.
  for (const cb of await dialogo.getByRole("checkbox").all()) {
    const rotulo = (await cb.getAttribute("aria-label")) ?? "";
    const marcado = (await cb.getAttribute("aria-checked")) === "true" || (await cb.getAttribute("data-state")) === "checked";
    if ((rotulo === `Enviar ${EMPREITA}`) !== marcado) await cb.click();
  }
  await dialogo.getByRole("button", { name: /^Enviar · R\$\s?3\.000,00/ }).click();
  await esperarToast(page, /1 pedido enviado ao aprovador/);
});

test("aprovador: vê \"Vaga #N sem nome\" com a origem do valor e a empreita com as vagas; aprova os dois", async ({ page }) => {
  await entrarComo(page, "aprovador");
  await page.goto("/aprovacao-de-honorarios");
  await expect(page.getByTestId("hon-aprovacao")).toBeVisible();

  const linhaDaAberta = page.getByRole("row").filter({ hasText: nomeDaAberta });
  await expect(linhaDaAberta).toContainText("Vaga ainda sem colaborador escalado");
  await expect(linhaDaAberta).toContainText("Freela Local (A) · tabela");
  await page.getByRole("button", { name: `Aprovar ${nomeDaAberta}`, exact: true }).click();
  await confirmacao(page).getByRole("button", { name: /^Aprovar/ }).click();
  await esperarToast(page, "Honorário aprovado");

  const linhaDaEmpreita = page.getByRole("row").filter({ hasText: EMPREITA });
  await expect(linhaDaEmpreita).toContainText("Valor fechado da equipe · 2 vagas da escala");
  await linhaDaEmpreita.getByTestId("hon-empreita-vagas-botao").click();
  await expect(linhaDaEmpreita.getByTestId("hon-empreita-vagas")).toContainText(`#${abertaDaEmpreita.inclusionNumber} sem nome`);
  await expect(linhaDaEmpreita.getByTestId("hon-empreita-vagas")).toContainText(`#${escaladaDaEmpreita.inclusionNumber} ${escaladaDaEmpreita.collaboratorName}`);
  await page.getByRole("button", { name: `Aprovar ${EMPREITA}`, exact: true }).click();
  await confirmacao(page).getByRole("button", { name: /^Aprovar/ }).click();
  await esperarToast(page, "Honorário aprovado");
});

test("Planejado (21/10): o honorário aprovado vira a mão de obra da vaga — a escalada recebe a parte da empreita", async ({ page }) => {
  await entrarComo(page, "financial");
  // A empreita aprovada (R$ 3.000) tem 2 vagas: a escalada aparece no Planejado com a metade.
  const lidos = (await (await api(page).get(`/api/budget-planned/honorarios?eventId=${eventId}`)).json()) as { nome: string; status: string; vagas: { id: string; ativa: boolean }[] }[];
  const emp = lidos.find((h) => h.nome === EMPREITA);
  expect(emp).toMatchObject({ status: "aprovado" });
  expect(emp!.vagas.filter((v) => v.ativa)).toHaveLength(2);

  await page.goto(`/budget-planned?event=${eventId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Planejado" })).toBeVisible();
  await page.getByPlaceholder("Buscar colaborador").fill(escaladaDaEmpreita.collaboratorName!);
  const card = page.locator(`article[data-card-id="${escaladaDaEmpreita.id}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByTestId("planejado-honorario-aprovado")).toContainText("Empreita aprovada");
  await expect(card.getByTestId("planejado-fonte-honorario")).toContainText(new RegExp(`parte da empreita ${EMPREITA} \\(R\\$\\s?3\\.000,00 ÷ 2\\)`));
  await expect(card.getByTestId("planejado-fonte-honorario")).toContainText("aprovada por");
  await expect(card.locator(".pla-lancamento").first()).toContainText(/R\$\s?1\.500,00/);
});

test("Financeiro: libera a empreita inteira e o relatório por evento conta a empreita uma vez", async ({ page }) => {
  await entrarComo(page, "financial");
  await page.goto(`/honorarios-ceno?evento=${eventId}`);
  await page.getByRole("button", { name: `Registrar liberação de ${EMPREITA}` }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nº da OC/DP").fill("E2E-EMP");
  await expect(dialogo.getByLabel("Valor liberado")).toHaveValue("3000,00");
  await dialogo.getByRole("button", { name: /^Liberar R\$\s?3\.000,00/ }).click();
  await esperarToast(page, /Verba liberada|Liberação registrada|liberada/);

  const fin = (await (await api(page).get(`/api/honorarios-ceno/financeiro?eventId=${eventId}`)).json()) as { nome: string; tipo: string; vagasDaEmpreita: unknown[] }[];
  expect(fin.filter((h) => h.nome === EMPREITA)).toHaveLength(1);
  expect(fin.find((h) => h.nome === EMPREITA)!.vagasDaEmpreita).toHaveLength(2);

  await page.getByRole("tab", { name: /Relatórios/ }).click();
  const linha = page.getByTestId("hon-relatorios").getByRole("row").filter({ hasText: EVENTO });
  await expect(linha).toContainText("R$ 3.000,00");
});

test("quem pede vê a vaga da empreita como parte dela, sem pedido próprio", async ({ page }) => {
  await entrarComo(page, "production");
  const modal = await modalDe(page, escaladaDaEmpreita);
  await modal.getByTestId("aba-honorario").click();
  const card = modal.getByTestId("hon-vaga-na-empreita");
  await expect(card).toContainText(`Faz parte da empreita ${EMPREITA}`);
  await expect(card).toContainText("peça para o aprovador devolver");
  await expect(modal.getByTestId("hon-vaga-form")).toHaveCount(0);
});
