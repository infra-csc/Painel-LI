/**
 * Compras de créditos Flash em LOTE (28/10, Honorários — Fase 3, arquivos):
 * tipos das respostas, consultas e escritas. Contrato:
 * server/routes/arquivos-de-compra.ts (regras em shared/flash-compras.ts).
 *
 * Gerar o lote devolve o lote; o arquivo sai num GET separado (o servidor
 * audita CADA download). Gerar, cancelar e pagar invalidam a prévia, a lista
 * de lotes e o extrato (o lançamento mostra o lote em que entrou).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, fetchJson, throwIfResNotOk, ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/queryClient";
import type { AvisoDaCompra, StatusDoLoteFlash, TotaisDaCompra } from "@shared/flash-compras";

export const CHAVE_COMPRAS_FLASH = "/api/flash/compras";
export const CHAVE_PREVIA_DA_COMPRA = "/api/flash/compras/previa";

export interface FormatoInformado { id: string; nome: string; provisorio: boolean }

export interface LinhaDaPrevia {
  collaboratorId: string;
  nome: string;
  /** •••.456.789-•• — o CPF completo só vai no arquivo. */
  cpfMascarado: string | null;
  ativo: boolean;
  alimentacaoCents: number;
  mobilidadeCents: number;
  totalCents: number;
  lancamentos: number;
  avisos: AvisoDaCompra[];
  entra: boolean;
}

export interface PreviaDaCompraApi {
  filtro: { inicio: string; fim: string; eventId: string | null; incluirManuais: boolean };
  proximoNumero: number;
  assinatura: string;
  totais: TotaisDaCompra;
  foraDoLote: TotaisDaCompra;
  formato: FormatoInformado;
  linhas: LinhaDaPrevia[];
}

export interface LoteFlash {
  id: string;
  numero: number;
  periodoInicio: string;
  periodoFim: string;
  evento: { id: string; nome: string } | null;
  incluiManuais: boolean;
  status: StatusDoLoteFlash;
  rotuloDoStatus: string;
  formato: string;
  colaboradores: number;
  lancamentos: number;
  totalAlimentacaoCents: number;
  totalMobilidadeCents: number;
  totalCents: number;
  geradoPorNome: string | null;
  geradoEm: string;
  pagoEm: string | null;
  cancelamento: { em: string; porNome: string | null; motivo: string | null } | null;
  /** Os créditos amarrados mudaram depois da compra (comparativo ressincronizado/reaberto). */
  divergencia: { totalAtualCents: number; lancamentosAtuais: number } | null;
  acoes: { baixar: boolean; cancelar: boolean; marcarPago: boolean };
}

export interface ListaDeLotes { hoje: string; lotes: LoteFlash[]; formato: FormatoInformado }

export interface FiltroDaCompraNaTela { inicio: string; fim: string; eventId: string; incluirManuais: boolean }

const query = (f: FiltroDaCompraNaTela) => {
  const p = new URLSearchParams({ inicio: f.inicio, fim: f.fim });
  if (f.eventId) p.set("eventId", f.eventId);
  if (f.incluirManuais) p.set("manuais", "1");
  return p.toString();
};

export function usePreviaDaCompra(f: FiltroDaCompraNaTela, ativo: boolean) {
  return useQuery<PreviaDaCompraApi>({
    queryKey: [CHAVE_PREVIA_DA_COMPRA, f.inicio, f.fim, f.eventId, f.incluirManuais],
    queryFn: ({ signal }) => fetchJson<PreviaDaCompraApi>(`${CHAVE_PREVIA_DA_COMPRA}?${query(f)}`, signal),
    enabled: ativo,
    staleTime: 10_000,
  });
}

export function useLotesFlash(ativo = true) {
  return useQuery<ListaDeLotes>({
    queryKey: [CHAVE_COMPRAS_FLASH],
    queryFn: ({ signal }) => fetchJson<ListaDeLotes>(CHAVE_COMPRAS_FLASH, signal),
    enabled: ativo,
    staleTime: 15_000,
  });
}

/** Baixa um arquivo de uma rota GET (o servidor audita) e devolve o nome. */
export async function baixarArquivo(url: string, nomePadrao: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "include" });
  } catch {
    throw new ApiError(0, null, NETWORK_ERROR_MESSAGE);
  }
  await throwIfResNotOk(res);
  const nome = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? nomePadrao;
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = href;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
  return nome;
}

export const baixarArquivoDoLote = (loteId: string, formato: "csv" | "xlsx") =>
  baixarArquivo(`${CHAVE_COMPRAS_FLASH}/${encodeURIComponent(loteId)}/arquivo?formato=${formato}`, `compra-flash.${formato}`);

export function useAcoesDasCompras() {
  const qc = useQueryClient();
  const depois = () => {
    qc.invalidateQueries({ queryKey: [CHAVE_PREVIA_DA_COMPRA] });
    qc.invalidateQueries({ queryKey: [CHAVE_COMPRAS_FLASH] });
    qc.invalidateQueries({ queryKey: ["/api/flash-movements"] });
  };
  const gerar = useMutation({
    mutationFn: async (v: { inicio: string; fim: string; eventId: string | null; incluirManuais: boolean; assinatura: string }) =>
      (await (await apiRequest("POST", CHAVE_COMPRAS_FLASH, v)).json()) as { lote: LoteFlash },
    onSuccess: depois,
  });
  const cancelar = useMutation({
    mutationFn: async (v: { id: string; motivo: string }) =>
      (await (await apiRequest("POST", `${CHAVE_COMPRAS_FLASH}/${encodeURIComponent(v.id)}/cancelar`, { motivo: v.motivo })).json()) as { lote: LoteFlash; creditosDevolvidos: number },
    onSuccess: depois,
  });
  const marcarPago = useMutation({
    mutationFn: async (v: { id: string; pagoEm: string }) =>
      (await (await apiRequest("POST", `${CHAVE_COMPRAS_FLASH}/${encodeURIComponent(v.id)}/pago`, { pagoEm: v.pagoEm })).json()) as { lote: LoteFlash },
    onSuccess: depois,
  });
  return { gerar, cancelar, marcarPago };
}
