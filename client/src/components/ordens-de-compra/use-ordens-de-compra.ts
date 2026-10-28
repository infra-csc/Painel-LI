/**
 * Ordens de compra — consultas e escritas (28/10, Fase 2 MANUAL). Contrato:
 * server/routes/honorarios-pagamento.ts.
 *
 * Toda escrita devolve a(s) linha(s) já montada(s): o cache do evento é
 * atualizado na hora e, em seguida, invalidado. OC, nota e pago mudam também
 * a trilha (Painel de honorários), as Notas fiscais e a Presença no evento —
 * todas essas chaves são invalidadas juntas.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiRequest, fetchJson, throwIfResNotOk, ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/queryClient";
import { CHAVE_CONTROLE_RH } from "@/components/rh/prestacao-utils";
import { CHAVE_PRESENCA } from "@/components/presenca/use-presenca";
import { CHAVE_COMPRAS_FLASH } from "@/components/flash/use-compras-flash";
import type { CelulaDoRetorno, PreviaDoRetorno } from "@shared/retorno-m4";
import type { ConferenciaDaNotaApi, LinhaDaOc, PreviaDoLote, RespostaDasOcs, ResultadoDoLote, ResultadoDoPago } from "./tipos";

export const CHAVE_OCS = "/api/ordens-de-compra";
export const CHAVE_CONFERENCIA_DAS_NOTAS = "/api/invoices/conferencia";

/** Lista do evento (só as prestações aprovadas pela Conferência DP). */
export function useOrdensDeCompra(eventId: string | null | undefined, ativo = true) {
  return useQuery<RespostaDasOcs>({
    queryKey: [CHAVE_OCS, eventId],
    queryFn: ({ signal }) => fetchJson<RespostaDasOcs>(`${CHAVE_OCS}?eventId=${encodeURIComponent(eventId!)}`, signal),
    enabled: !!eventId && ativo,
    staleTime: 15_000,
  });
}

/** Conferência OC × NF × CNPJ e o pago, por nota (tela Notas fiscais). */
export function useConferenciaDasNotas(eventId: string | null | undefined) {
  return useQuery<ConferenciaDaNotaApi[]>({
    queryKey: [CHAVE_CONFERENCIA_DAS_NOTAS, eventId],
    queryFn: ({ signal }) => fetchJson<ConferenciaDaNotaApi[]>(`${CHAVE_CONFERENCIA_DAS_NOTAS}?eventId=${encodeURIComponent(eventId!)}`, signal),
    enabled: !!eventId,
    staleTime: 15_000,
  });
}

/** Tudo que muda quando a OC, a nota ou o pago mudam. */
export function invalidarDepoisDoPagamento(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: [CHAVE_OCS] });
  qc.invalidateQueries({ queryKey: [CHAVE_CONFERENCIA_DAS_NOTAS] });
  qc.invalidateQueries({ queryKey: ["/api/invoices"] });
  qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
  qc.invalidateQueries({ queryKey: [CHAVE_PRESENCA] });
}

/** Troca as linhas devolvidas pelo servidor dentro do cache do evento. */
function aplicarNoCache(qc: QueryClient, eventId: string, novas: readonly LinhaDaOc[]) {
  if (novas.length === 0) return;
  const porId = new Map(novas.map((l) => [l.actualId, l]));
  qc.setQueryData<RespostaDasOcs>([CHAVE_OCS, eventId], (antes) => antes
    ? { ...antes, linhas: antes.linhas.map((l) => porId.get(l.actualId) ?? l) }
    : antes);
}

/** Envio multipart da nota (arquivo + valor + nº + CNPJ), com o tratamento de erro do app. */
export async function enviarNotaComoRepresentante(actualId: string, campos: { arquivo: File; valorNota: number; numeroNota?: string; cnpjNota?: string }): Promise<{ linha: LinhaDaOc }> {
  const corpo = new FormData();
  corpo.append("arquivo", campos.arquivo, campos.arquivo.name || "nota-fiscal.pdf");
  corpo.append("valorNota", String(campos.valorNota));
  if (campos.numeroNota?.trim()) corpo.append("numeroNota", campos.numeroNota.trim());
  if (campos.cnpjNota?.trim()) corpo.append("cnpjNota", campos.cnpjNota.trim());
  let res: Response;
  try {
    res = await fetch(`${CHAVE_OCS}/${encodeURIComponent(actualId)}/nota-fiscal`, { method: "POST", body: corpo, credentials: "include" });
  } catch {
    throw new ApiError(0, null, NETWORK_ERROR_MESSAGE);
  }
  await throwIfResNotOk(res);
  return res.json();
}

/** Sobe o comprovante do pagamento (POST /api/upload) e devolve o id do anexo (ATT-…). */
export async function enviarComprovante(arquivo: File): Promise<{ id: string; name: string }> {
  const corpo = new FormData();
  corpo.append("files", arquivo, arquivo.name);
  let res: Response;
  try {
    res = await fetch("/api/upload", { method: "POST", body: corpo, credentials: "include" });
  } catch {
    throw new ApiError(0, null, NETWORK_ERROR_MESSAGE);
  }
  await throwIfResNotOk(res);
  const lista = (await res.json()) as { id: string; name: string }[];
  if (!lista?.[0]?.id) throw new ApiError(500, null, "O comprovante não subiu. Tente de novo.");
  return lista[0];
}

/** Baixa o arquivo das aprovadas sem OC (o servidor audita o download). */
export async function baixarExportacao(eventId: string, formato: "csv" | "xlsx"): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${CHAVE_OCS}/exportar?eventId=${encodeURIComponent(eventId)}&formato=${formato}`, { credentials: "include" });
  } catch {
    throw new ApiError(0, null, NETWORK_ERROR_MESSAGE);
  }
  await throwIfResNotOk(res);
  const nome = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `prestacoes-sem-oc.${formato}`;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return nome;
}

// ── Arquivo de OC do M4 — prestadores + Flash (28/10, Fase 3, arquivos) ─────

export const CHAVE_ARQUIVO_DE_OC = "/api/ordens-de-compra/arquivo-m4";

/** GET /api/ordens-de-compra/arquivo-m4/previa (server/routes/arquivos-de-compra.ts). */
export interface PreviaDoArquivoDeOc {
  escopo: { tipo: "evento"; eventId: string; nome: string } | { tipo: "periodo"; inicio: string; fim: string };
  prestadores: { linhas: number; valorCents: number; semCnpj: number; eventos: number };
  flash: { lotes: Array<{ id: string; numero: number; totalCents: number; status: string }>; valorCents: number };
  totalCents: number;
  linhas: number;
  legadosIgnorados: number;
  formato: { id: string; nome: string; provisorio: boolean; colunas: string[]; cnpjDaFlashConfigurado: boolean };
}

/** Baixa o arquivo de OC do M4 (`query` = "eventId=…" ou "inicio=…&fim=…"); o servidor audita. */
export async function baixarArquivoDeOc(query: string, formato: "csv" | "xlsx"): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${CHAVE_ARQUIVO_DE_OC}?${query}&formato=${formato}`, { credentials: "include" });
  } catch {
    throw new ApiError(0, null, NETWORK_ERROR_MESSAGE);
  }
  await throwIfResNotOk(res);
  const nome = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `oc-m4.${formato}`;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return nome;
}

export interface CorpoDaOc { actualId: string; numero: string; valor?: number | null; data?: string | null; justificativa?: string | null }

/** As escritas da tela, presas ao evento aberto (o pago também serve à tela Notas fiscais). */
export function useAcoesDaOc(eventId: string) {
  const qc = useQueryClient();
  const depois = (novas: readonly LinhaDaOc[]) => {
    aplicarNoCache(qc, eventId, novas);
    invalidarDepoisDoPagamento(qc);
  };

  const registrar = useMutation({
    mutationFn: async (c: CorpoDaOc) => (await (await apiRequest("POST", CHAVE_OCS, c)).json()) as { linha: LinhaDaOc },
    onSuccess: (r) => depois([r.linha]),
  });

  const desfazerOc = useMutation({
    mutationFn: async (v: { actualId: string; motivo: string }) =>
      (await (await apiRequest("POST", `${CHAVE_OCS}/${encodeURIComponent(v.actualId)}/desfazer`, { motivo: v.motivo })).json()) as { linha: LinhaDaOc },
    onSuccess: (r) => depois([r.linha]),
  });

  const previaDoLote = useMutation({
    mutationFn: async (texto: string) => (await (await apiRequest("POST", `${CHAVE_OCS}/lote/previa`, { eventId, texto })).json()) as PreviaDoLote,
  });

  const confirmarLote = useMutation({
    mutationFn: async (v: { texto: string; justificativa?: string | null }) =>
      (await (await apiRequest("POST", `${CHAVE_OCS}/lote`, { eventId, texto: v.texto, justificativa: v.justificativa || null })).json()) as ResultadoDoLote,
    onSuccess: (r) => depois(r.linhas),
  });

  const marcarPago = useMutation({
    mutationFn: async (v: { actualIds: string[]; pagoEm: string; observacao?: string | null; comprovanteId?: string | null }) =>
      (await (await apiRequest("POST", "/api/pagamentos/marcar-pago", v)).json()) as ResultadoDoPago,
    onSuccess: (r) => depois(r.linhas),
  });

  const desfazerPago = useMutation({
    mutationFn: async (v: { actualId: string; motivo: string }) =>
      (await (await apiRequest("POST", `/api/pagamentos/${encodeURIComponent(v.actualId)}/desfazer`, { motivo: v.motivo })).json()) as { linha: LinhaDaOc },
    onSuccess: (r) => depois([r.linha]),
  });

  const enviarNota = useMutation({
    mutationFn: (v: { actualId: string; arquivo: File; valorNota: number; numeroNota?: string; cnpjNota?: string }) =>
      enviarNotaComoRepresentante(v.actualId, v),
    onSuccess: (r) => depois([r.linha]),
  });

  return { registrar, desfazerOc, previaDoLote, confirmarLote, marcarPago, desfazerPago, enviarNota };
}

// ── Retorno do M4 por planilha (28/10) — server/routes/retorno-m4.ts ────────

export const CHAVE_RETORNO_M4 = `${CHAVE_OCS}/retorno-m4`;

/** POST /api/ordens-de-compra/retorno-m4 — o que foi gravado e o que ficou de fora. */
export interface ResultadoDoRetorno {
  aplicadas: number;
  ocsRegistradas: number;
  programadas: number;
  pagas: number;
  lotesFlashPagos: number;
  semMudanca: number;
  comProblema: number;
  recusadas: { linha: number; referencia: string; motivos: string[] }[];
}

/**
 * Prévia (não grava) e aplicar do retorno do M4. Não é preso a um evento: o
 * arquivo pode ter linhas de vários eventos e lotes Flash — depois de aplicar,
 * invalida tudo que muda com a OC, a nota, o pago e os lotes Flash.
 */
export function useRetornoDoM4() {
  const qc = useQueryClient();
  const previa = useMutation({
    mutationFn: async (matriz: CelulaDoRetorno[][]) =>
      (await (await apiRequest("POST", `${CHAVE_RETORNO_M4}/previa`, { matriz })).json()) as PreviaDoRetorno,
  });
  const aplicar = useMutation({
    mutationFn: async (v: { matriz: CelulaDoRetorno[][]; justificativa?: string | null }) =>
      (await (await apiRequest("POST", CHAVE_RETORNO_M4, { matriz: v.matriz, justificativa: v.justificativa || null })).json()) as ResultadoDoRetorno,
    onSuccess: () => {
      invalidarDepoisDoPagamento(qc);
      qc.invalidateQueries({ queryKey: [CHAVE_COMPRAS_FLASH] });
    },
  });
  return { previa, aplicar };
}
