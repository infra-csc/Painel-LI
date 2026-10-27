/**
 * Chamadas do portal do colaborador (/api/colaborador/*).
 *
 * Mesmo `ApiError` e mesma mensagem de rede do resto do app
 * (client/src/lib/queryClient.ts), mas SEM o `throwIfResNotOk` de lá: ele
 * manda todo 401 para /auth (a tela de login INTERNA). Aqui o 401 significa
 * "a sessão do colaborador acabou" e vira o evento EVENTO_SESSAO_EXPIRADA, que
 * a página do portal escuta para voltar à tela de Entrar com o aviso.
 *
 * O CSRF do servidor confere Origin/Sec-Fetch-Site: um fetch da própria página
 * já manda os dois; nada de header extra.
 */
import { ApiError, NETWORK_ERROR_MESSAGE, isApiError } from "@/lib/queryClient";
import type {
  EuDoPortal, PrestacoesDoPortal, RespostaDaConfirmacao, RespostaDaMarcacao, TipoDeMarcacao,
} from "./tipos";

/** Chaves do TanStack Query do portal (separadas das telas internas). */
export const CHAVE_DO_PORTAL = ["portal-colaborador"] as const;
export const CHAVE_EU = ["portal-colaborador", "eu"] as const;
export const CHAVE_PRESTACOES = ["portal-colaborador", "prestacoes"] as const;

/** Disparado em qualquer 401 do portal (menos entrar e primeiro acesso). */
export const EVENTO_SESSAO_EXPIRADA = "portal-colaborador:sessao-expirada";

const ROTAS_ABERTAS = ["/api/colaborador/entrar", "/api/colaborador/primeiro-acesso"];

const pareceHtml = (texto: string) => /^\s*<(!doctype|html|head|body)/i.test(texto);

async function erroDaResposta(res: Response): Promise<ApiError> {
  const texto = (await res.text().catch(() => "")) || "";
  let corpo: Record<string, unknown> | null = null;
  try {
    const lido = JSON.parse(texto);
    corpo = lido && typeof lido === "object" ? lido : null;
  } catch {
    if (texto && !pareceHtml(texto) && texto.length <= 300) corpo = { message: texto };
  }
  return new ApiError(res.status, corpo);
}

interface OpcoesDaChamada {
  method?: "GET" | "POST";
  json?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

export async function chamarPortal<T>(url: string, opcoes: OpcoesDaChamada = {}): Promise<T> {
  const { method = opcoes.json !== undefined || opcoes.form ? "POST" : "GET", json, form, signal } = opcoes;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "include",
      headers: json !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
      signal,
    });
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === "AbortError") throw erro;
    throw new ApiError(0, null, NETWORK_ERROR_MESSAGE);
  }
  if (!res.ok) {
    const erro = await erroDaResposta(res);
    if (res.status === 401 && !ROTAS_ABERTAS.includes(url) && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(EVENTO_SESSAO_EXPIRADA));
    }
    throw erro;
  }
  // Servidor desatualizado devolve o index.html com 200 numa rota que não existe.
  if ((res.headers.get("content-type") || "").includes("text/html")) {
    throw new ApiError(503, { message: "O servidor está desatualizado. Tente de novo em alguns minutos." });
  }
  return (await res.json()) as T;
}

/** Quem está logado — null quando não há sessão de colaborador (401). */
export async function buscarEu(): Promise<EuDoPortal | null> {
  try {
    return await chamarPortal<EuDoPortal>("/api/colaborador/eu");
  } catch (erro) {
    if (isApiError(erro) && erro.status === 401) return null;
    throw erro;
  }
}

export const buscarPrestacoes = () => chamarPortal<PrestacoesDoPortal>("/api/colaborador/prestacoes");

export const entrar = (cpf: string, senha: string) =>
  chamarPortal<EuDoPortal>("/api/colaborador/entrar", { json: { cpf, senha } });

export const primeiroAcesso = (cpf: string, codigo: string, senha: string) =>
  chamarPortal<EuDoPortal>("/api/colaborador/primeiro-acesso", { json: { cpf, codigo, senha } });

export const sair = () => chamarPortal<{ ok: boolean }>("/api/colaborador/sair", { method: "POST" });

export const aceitarTermo = (versao: string) => chamarPortal<EuDoPortal>("/api/colaborador/termo", { json: { versao } });

export interface Localizacao { lat: number; lng: number; precisao: number | null }

export function enviarMarcacao(a: { actualId: string; dia: string; tipo: TipoDeMarcacao; foto: Blob | null; localizacao: Localizacao | null }) {
  const form = new FormData();
  if (a.foto) form.append("foto", a.foto, a.foto.type === "image/png" ? "selfie.png" : "selfie.jpg");
  if (a.localizacao) {
    form.append("lat", String(a.localizacao.lat));
    form.append("lng", String(a.localizacao.lng));
    if (a.localizacao.precisao != null) form.append("precisao", String(Math.round(a.localizacao.precisao)));
  }
  const url = `/api/colaborador/presencas/${encodeURIComponent(a.actualId)}/${encodeURIComponent(a.dia)}/${a.tipo}`;
  return chamarPortal<RespostaDaMarcacao>(url, { method: "POST", form });
}

export interface CorpoDaConfirmacao { dias: string[]; cnpj: string; razaoSocial?: string | null; contestacao?: string | null }

export const confirmarPrestacao = (actualId: string, corpo: CorpoDaConfirmacao) =>
  chamarPortal<RespostaDaConfirmacao>(`/api/colaborador/prestacoes/${encodeURIComponent(actualId)}/confirmar`, { json: corpo });

/** Texto do erro para a tela: a mensagem do servidor como veio; 429 e rede com texto próprio. */
export function mensagemDoErro(erro: unknown, padrao = "Não deu certo. Tente de novo."): string {
  if (!isApiError(erro)) return padrao;
  if (erro.status === 429) return erro.serverMessage ?? "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  return erro.message || padrao;
}

export const ehErroDeRede = (erro: unknown) => isApiError(erro) && erro.status === 0;
export const codigoDoErro = (erro: unknown): string | null =>
  isApiError(erro) && typeof erro.body?.codigo === "string" ? (erro.body.codigo as string) : null;
