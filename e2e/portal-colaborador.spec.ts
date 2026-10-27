/**
 * Portal do colaborador (/colaborador, Fase 1 dos Honorários) — o caminho
 * feliz no CELULAR, sobre o seed da presença ("Meia Maratona de Florianópolis",
 * server/dev/demo-seed-presenca.ts):
 *   código de acesso gerado pelo DP → primeiro acesso (CPF + código + senha)
 *   → termo → Meus eventos com "Hoje" no topo → check-in com selfie e GPS
 *   → hora registrada → check-out → sair.
 *
 * Registro: a prestação que está com HOJE sem check-in no seed. O código novo
 * troca a senha dela (o spec não depende da senha do seed).
 *
 * 28/10 (Fase 2): o reenvio da nota fiscal DEVOLVIDA pelo DP, sobre o seed de
 * server/dev/demo-seed-pagamento.ts ("Corrida Noturna do Recife"). Registro:
 * a prestação em "NF devolvida" (acesso ao portal, sem conta cadastrada) —
 * nenhum outro spec mexe nela. Sem PAGAMENTO_CHAVE no servidor a conta não
 * pode ser gravada: o spec confere o aviso "em manutenção" e que nada mudou.
 */
import { test, expect, type Browser } from "@playwright/test";
import { api, entrarComo, mutacao } from "./helpers/demo";

const SENHA_DO_SEED = "Portal@2026"; // DEMO_SENHA_DO_COLABORADOR (docs/demo.md)

const SENHA_NOVA = "Arena2026ok";

interface PrestacaoInterna { actualId: string; colaborador: { id: string; nome: string } | null; dias: { dia: string; estado: string }[] }

/** Selfie de mentira (JPG) desenhada no próprio navegador. */
async function selfie(browser: Browser) {
  const pagina = await browser.newPage();
  const dataUrl = await pagina.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600; c.height = 800;
    const g = c.getContext("2d")!;
    g.fillStyle = "#4b6f9e"; g.fillRect(0, 0, 600, 800);
    g.fillStyle = "#ead9c9"; g.beginPath(); g.arc(300, 320, 130, 0, Math.PI * 2); g.fill();
    return c.toDataURL("image/jpeg", 0.9);
  });
  await pagina.close();
  return { name: "selfie.jpg", mimeType: "image/jpeg", buffer: Buffer.from(dataUrl.split(",")[1], "base64") };
}

test("@mobile primeiro acesso, termo, check-in com selfie e check-out", async ({ page, browser, context }) => {
  // 1) O DP gera o código de acesso de quem tem o dia de hoje livre.
  await entrarComo(page, "admin");
  const eventos = (await (await api(page).get("/api/events")).json()) as { id: string; name: string }[];
  const evento = eventos.find((e) => e.name === "Meia Maratona de Florianópolis");
  expect(evento, "evento da presença no seed").toBeTruthy();
  const painel = (await (await api(page).get(`/api/presenca/eventos/${evento!.id}`)).json()) as { prestacoes: PrestacaoInterna[] };
  const alvo = painel.prestacoes.find((p) => p.dias.some((d) => d.estado === "hoje_sem_checkin"));
  expect(alvo, "uma prestação com hoje sem check-in").toBeTruthy();
  const colabs = (await (await api(page).get("/api/collaborators")).json()) as { id: string; officialDocument: string | null }[];
  const cpf = String(colabs.find((c) => c.id === alvo!.colaborador!.id)?.officialDocument ?? "").replace(/\D/g, "");
  expect(cpf).toHaveLength(11);
  const gerado = await mutacao(page, "post", `/api/colaboradores/${alvo!.colaborador!.id}/codigo-de-acesso`);
  expect(gerado.status()).toBe(201);
  const { codigo } = (await gerado.json()) as { codigo: string };

  // 2) No celular: sai da sessão interna e cria a senha com o código.
  await context.clearCookies();
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -27.5823, longitude: -48.5489, accuracy: 15 });
  await page.goto("/colaborador");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await page.getByRole("button", { name: "Primeiro acesso ou esqueci a senha" }).click();
  await page.getByLabel("CPF").fill(cpf);
  await page.getByLabel("Código de acesso").fill(codigo);
  await page.getByLabel("Senha nova", { exact: true }).fill(SENHA_NOVA);
  await page.getByLabel("Repita a senha nova").fill(SENHA_NOVA);
  await page.getByRole("button", { name: "Criar senha e entrar" }).click();

  // 3) Termo (se ainda não aceito nesta versão).
  const termo = page.getByRole("button", { name: "Li e aceito" });
  const ola = page.getByRole("heading", { name: /^Olá,/ });
  await expect(termo.or(ola)).toBeVisible();
  if (await termo.isVisible()) {
    await page.getByRole("checkbox").check();
    await termo.click();
  }

  // 4) Meus eventos: hoje em destaque, check-in com selfie.
  await expect(page.getByText("Hoje · Meia Maratona de Florianópolis")).toBeVisible();
  const foto = await selfie(browser);
  const [seletor] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Fazer check-in" }).click(),
  ]);
  await seletor.setFiles(foto);
  await expect(page.getByRole("img", { name: "Prévia da sua selfie" })).toBeVisible();
  await expect(page.getByText("Localização pronta")).toBeVisible();
  await page.getByRole("button", { name: "Enviar check-in" }).click();
  const sucesso = page.getByRole("status").filter({ hasText: "Check-in registrado" });
  await expect(sucesso).toBeVisible();
  await expect(sucesso).toContainText(/\d{2}:\d{2}/);
  await page.getByRole("button", { name: "Pronto" }).click();

  // 5) Agora o destaque é o check-out.
  await expect(page.getByText(/Você entrou às \d{2}:\d{2}/)).toBeVisible();
  const [seletor2] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Fazer check-out" }).click(),
  ]);
  await seletor2.setFiles(foto);
  await page.getByRole("button", { name: "Enviar check-out" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Check-out registrado" })).toBeVisible();
  await page.getByRole("button", { name: "Pronto" }).click();

  // 6) O evento mostra o dia concluído; sair volta para Entrar.
  await page.getByRole("button", { name: /Meia Maratona de Florianópolis/ }).click();
  await expect(page.getByRole("heading", { name: "Seus dias" })).toBeVisible();
  await expect(page.getByText("Concluído").first()).toBeVisible();
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});

interface LinhaDaOc { actualId: string; colaborador: { id: string; nome: string } | null; estado: string; oc: { numero: string; valor: number | null } | null }

/** PDF mínimo válido (o servidor confere o tipo pelo conteúdo). */
function notaEmPdf() {
  const c = "BT /F1 14 Tf 60 760 Td (NFS-e e2e) Tj ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${c.length} >>\nstream\n${c}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let s = "%PDF-1.4\n";
  const off: number[] = [];
  objs.forEach((o, i) => { off.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { name: "nfse-corrigida.pdf", mimeType: "application/pdf", buffer: Buffer.from(s, "latin1") };
}

test("@mobile nota fiscal devolvida pelo DP: o comentário no topo e o reenvio com a conta", async ({ page, context }) => {
  // 1) Pelo DP: quem está com a nota devolvida, o CPF e se a chave dos dados bancários existe.
  await entrarComo(page, "admin");
  const eventos = (await (await api(page).get("/api/events")).json()) as { id: string; name: string }[];
  const evento = eventos.find((e) => e.name === "Corrida Noturna do Recife");
  expect(evento, "evento das OCs no seed").toBeTruthy();
  const lerLinhas = async () => ((await (await api(page).get(`/api/ordens-de-compra?eventId=${evento!.id}`)).json()) as { linhas: LinhaDaOc[] }).linhas;
  const alvo = (await lerLinhas()).find((l) => l.estado === "nf_devolvida");
  expect(alvo, "uma prestação com a NF devolvida").toBeTruthy();
  const colabs = (await (await api(page).get("/api/collaborators")).json()) as { id: string; officialDocument: string | null }[];
  const cpf = String(colabs.find((c) => c.id === alvo!.colaborador!.id)?.officialDocument ?? "").replace(/\D/g, "");
  expect(cpf).toHaveLength(11);
  const pagamento = (await (await api(page).get(`/api/colaboradores/${alvo!.colaborador!.id}/pagamento`)).json()) as { chaveConfigurada: boolean };

  // 2) No celular: entra com a senha do seed; o destaque do topo é a nota devolvida.
  await context.clearCookies();
  await page.goto("/colaborador");
  await page.getByLabel("CPF").fill(cpf);
  await page.getByLabel("Senha", { exact: true }).fill(SENHA_DO_SEED);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Nota devolvida · Corrida Noturna do Recife")).toBeVisible();
  await expect(page.getByText(/O valor da nota não bate com a OC/).first()).toBeVisible();
  await page.getByRole("button", { name: "Enviar de novo" }).click();

  // 3) O formulário: o comentário do DP, o que deve constar na nota, o arquivo e o valor.
  await expect(page.getByText("O DP devolveu a nota anterior")).toBeVisible();
  await expect(page.getByText(alvo!.oc!.numero, { exact: true })).toBeVisible();
  await page.getByTestId("portal-arquivo-da-nota").setInputFiles(notaEmPdf());
  await expect(page.getByText("nfse-corrigida.pdf")).toBeVisible();
  const valor = page.getByLabel("Valor da nota");
  await valor.fill("1");
  await expect(page.getByText(/Diferente do valor da OC/)).toBeVisible();
  await valor.fill(String(alvo!.oc!.valor));
  await expect(page.getByText(/Diferente do valor da OC/)).toHaveCount(0);
  await page.getByLabel("Nº da nota (opcional)").fill("77");

  // 4) A conta do CNPJ (ainda não cadastrada para esta pessoa).
  await page.getByLabel("Banco").fill("260");
  await expect(page.getByText("Nubank")).toBeVisible();
  await page.getByLabel("Agência").fill("0001");
  await page.getByLabel("Conta com dígito").fill("4821937-5");
  await page.getByText("Corrente", { exact: true }).click();
  await page.getByLabel("Titular da conta").fill(alvo!.colaborador!.nome);
  await page.getByRole("button", { name: "Enviar de novo" }).click();

  if (!pagamento.chaveConfigurada) {
    // Sem a chave, nada é gravado: o aviso manda falar com o DP e a nota segue devolvida.
    await expect(page.getByRole("alert").filter({ hasText: "Sistema de pagamento em manutenção" })).toBeVisible();
    await context.clearCookies();
    await entrarComo(page, "admin");
    expect((await lerLinhas()).find((l) => l.actualId === alvo!.actualId)?.estado).toBe("nf_devolvida");
    return;
  }

  // 5) Enviada: sucesso com a conta mascarada e, no evento, "em conferência no DP".
  const sucesso = page.getByRole("status").filter({ hasText: "Nota fiscal enviada" });
  await expect(sucesso).toBeVisible();
  await expect(sucesso).toContainText("Conta guardada (protegida)");
  await expect(sucesso).not.toContainText("4821937");
  await page.getByRole("button", { name: "Voltar ao evento" }).click();
  await expect(page.getByText("Nota enviada · em conferência no DP")).toBeVisible();
  const href = await page.getByRole("link", { name: /Ver a nota enviada/ }).getAttribute("href");
  const arquivo = await page.request.get(href!);
  expect(arquivo.status()).toBe(200);
  expect(arquivo.headers()["content-type"]).toContain("application/pdf");

  // 6) No DP, a nota chegou para a conferência.
  await context.clearCookies();
  await entrarComo(page, "admin");
  expect((await lerLinhas()).find((l) => l.actualId === alvo!.actualId)?.estado).toBe("nf_enviada");
});
