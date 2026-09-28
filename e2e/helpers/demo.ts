/**
 * Ajudantes dos testes E2E sobre o modo demonstração.
 *
 * - `entrarComo(page, papel)`: login pela rota `GET /__demo/entrar?papel=…`
 *   (302 → `/`, cookie de sessão; a sessão nasce como SSO).
 * - `api(page)`: chamadas à API com o cookie da página (o Playwright manda o
 *   Origin certo, então o CSRF passa como no browser real).
 * - `acharVaga` / `acharSugestao`: localizam registros do seed pelo trio
 *   (evento, função, status) — nunca por id, que muda a cada subida do PGlite.
 *
 * Quais registros cada spec usa está em ./registros.ts.
 */
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const PAPEIS = ["admin", "production", "purchasing", "function_area", "financial", "aprovador"] as const;
export type Papel = (typeof PAPEIS)[number];

/** Nomes semeados (server/dev/demo-seed.ts — DEMO_USUARIOS). */
export const USUARIO: Record<Papel, { nome: string; email: string }> = {
  admin: { nome: "Helena Martins", email: "admin@demo.local" },
  production: { nome: "Rafael Nogueira", email: "producao@demo.local" },
  purchasing: { nome: "Camila Duarte", email: "compras@demo.local" },
  function_area: { nome: "Bruno Cardoso", email: "area@demo.local" },
  financial: { nome: "Patrícia Lemos", email: "rh@demo.local" },
  aprovador: { nome: "Marcos Vieira", email: "aprovador@demo.local" },
};

export const DEMO_SENHA = "Demo@2026";

/** Entra com o papel e espera a casca do app (menu lateral) aparecer. */
export async function entrarComo(page: Page, papel: Papel): Promise<void> {
  await page.goto(`/__demo/entrar?papel=${papel}`);
  await expect(page.getByRole("complementary", { name: "Menu principal" })).toBeVisible();
}

/** Contexto de requisições que compartilha o cookie de sessão da página. */
export function api(page: Page): APIRequestContext {
  return page.request;
}

/**
 * Mutação pela API com o cookie da página. O browser real manda `Origin`
 * sozinho; `page.request` não — e o gate de CSRF de server/app.ts recusa
 * (403 "Origem não informada") qualquer POST/PATCH/DELETE sem ele.
 */
export async function mutacao(page: Page, metodo: "post" | "patch" | "delete", url: string, data: unknown = {}) {
  const origin = new URL(page.url()).origin;
  return api(page)[metodo](url, { data, headers: { Origin: origin } });
}

/** Campos da vaga que os testes usam (GET /api/team-inclusions devolve mais). */
export interface Vaga {
  id: string;
  inclusionNumber: number | null;
  eventId: string;
  functionId: string;
  collaboratorId: string | null;
  status: string;
  phase: string | null;
  needsTicket: boolean | null;
  needsAccommodation: boolean | null;
  validationNote: string | null;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  functionName?: string | null;
  eventName?: string | null;
}

export interface FiltroDeVaga {
  evento: string;
  funcao: string;
  status?: string | string[];
  comColaborador?: boolean;
}

function casa(v: { eventName?: string | null; functionName?: string | null; status: string; collaboratorId: string | null }, f: FiltroDeVaga): boolean {
  const statusOk = f.status === undefined ? true : Array.isArray(f.status) ? f.status.includes(v.status) : v.status === f.status;
  return v.eventName === f.evento && v.functionName === f.funcao && statusOk && (f.comColaborador === undefined || !!v.collaboratorId === f.comColaborador);
}

/** Todas as vagas visíveis para a sessão atual (GET /api/team-inclusions — sem as sugestões). */
export async function listarVagas(page: Page): Promise<Vaga[]> {
  const r = await api(page).get("/api/team-inclusions");
  expect(r.ok(), `GET /api/team-inclusions → ${r.status()}`).toBeTruthy();
  return (await r.json()) as Vaga[];
}

/** Uma vaga do seed pelo trio (evento, função, status) — falha alto se não existir. */
export async function acharVaga(page: Page, filtro: FiltroDeVaga): Promise<Vaga> {
  const achada = (await listarVagas(page)).find((v) => casa(v, filtro));
  expect(achada, `vaga não encontrada no seed: ${JSON.stringify(filtro)}`).toBeTruthy();
  return achada!;
}

/** Uma vaga da etapa de SUGESTÃO (GET /api/scaling-suggestions) pelo trio. */
export async function acharSugestao(page: Page, filtro: FiltroDeVaga): Promise<Vaga & { canEdit?: boolean }> {
  const r = await api(page).get("/api/scaling-suggestions");
  expect(r.ok(), `GET /api/scaling-suggestions → ${r.status()}`).toBeTruthy();
  const lista = (await r.json()) as (Vaga & { canEdit?: boolean })[];
  const achada = lista.find((v) => casa(v, filtro));
  expect(achada, `sugestão não encontrada no seed: ${JSON.stringify(filtro)}`).toBeTruthy();
  return achada!;
}

/** Recarrega a vaga pelo id (estado atual no servidor). */
export async function lerVaga(page: Page, id: string): Promise<Vaga> {
  const r = await api(page).get(`/api/team-inclusions/${id}`);
  expect(r.ok(), `GET /api/team-inclusions/${id} → ${r.status()}`).toBeTruthy();
  return (await r.json()) as Vaga;
}

/** Abre a Escalação e devolve a linha da vaga (a tabela mostra o recorte "Futuros" por padrão). */
export async function linhaNaEscalacao(page: Page, vaga: Vaga): Promise<Locator> {
  await page.goto("/scaling");
  const linha = page.getByTestId(`row-inclusion-${vaga.id}`);
  await expect(linha).toBeVisible();
  return linha;
}

/** Abre o modal "Detalhes da escalação" da vaga a partir da linha. */
export async function abrirModalDaVaga(page: Page, vaga: Vaga): Promise<Locator> {
  const linha = await linhaNaEscalacao(page, vaga);
  await linha.click();
  const modal = page.getByRole("dialog").filter({ hasText: `#${vaga.inclusionNumber}` });
  await expect(modal).toBeVisible();
  return modal;
}

/** O toast (Radix, role=status) com este título está visível. */
export async function esperarToast(page: Page, titulo: string | RegExp): Promise<Locator> {
  const toast = page.getByRole("status").filter({ hasText: titulo }).first();
  await expect(toast).toBeVisible();
  return toast;
}

/** A confirmação única do app (ConfirmDialog sobre o AlertDialog do Radix). */
export function confirmacao(page: Page): Locator {
  return page.getByRole("alertdialog");
}

/** Soma dias a uma data ISO (YYYY-MM-DD) sem fuso. */
export function addDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
