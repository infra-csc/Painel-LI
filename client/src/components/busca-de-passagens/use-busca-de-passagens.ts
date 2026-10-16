/**
 * Dados da tela Busca de passagens (09/10): prévia/busca (POST), consumo,
 * link de compra, aeroporto do evento e o registro do voo usado.
 *
 * A PRÉVIA é o mesmo POST sem nada autorizado: devolve rotas, o que falta e o
 * que já está no cache — de graça. Gastar consulta é sempre um clique com o
 * número de consultas escrito no botão.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, fetchJson, isApiError } from "@/lib/queryClient";
import type { AjusteDaBusca, ConsumoDaBusca, PedidoDaBusca, RespostaDaBusca, VagaDoPedido } from "@shared/busca-de-passagens";
import type { AjustesDaBusca, TendenciaDoPreco } from "@shared/regras-da-busca";
import type { ResumoDoConsumo } from "@shared/consumo-da-busca";
import type { LinkDeCompra } from "@shared/links-de-compra";

export const CHAVE_DO_CONSUMO = ["/api/busca-de-passagens/consumo"] as const;

export function useConsumoDaBusca(ativo = true) {
  return useQuery<ConsumoDaBusca>({
    queryKey: CHAVE_DO_CONSUMO,
    queryFn: ({ signal }) => fetchJson<ConsumoDaBusca>("/api/busca-de-passagens/consumo", signal),
    enabled: ativo,
    staleTime: 30_000,
  });
}

export type DetalheDoConsumo = ResumoDoConsumo & { fornecedor: ConsumoDaBusca["fornecedor"]; cacheHoras: number };
export function useDetalheDoConsumo(ativo: boolean) {
  return useQuery<DetalheDoConsumo>({
    queryKey: ["/api/busca-de-passagens/consumo/detalhe"],
    queryFn: ({ signal }) => fetchJson<DetalheDoConsumo>("/api/busca-de-passagens/consumo/detalhe", signal),
    enabled: ativo,
    staleTime: 30_000,
  });
}

/** Erro da busca em formato que a tela sabe explicar. */
export interface ErroDaBusca {
  tipo: "teto" | "nao_configurada" | "falha";
  mensagem: string;
  usadas?: number;
  teto?: number;
}

function lerErro(e: unknown): ErroDaBusca {
  if (isApiError(e)) {
    const code = e.body?.code;
    if (e.status === 429 && code === "teto_atingido") {
      return { tipo: "teto", mensagem: e.message, usadas: Number(e.body?.usadas), teto: Number(e.body?.teto) };
    }
    if (e.status === 503 && code === "nao_configurada") return { tipo: "nao_configurada", mensagem: e.message };
    return { tipo: "falha", mensagem: e.message };
  }
  return { tipo: "falha", mensagem: "Não foi possível falar com o servidor. Tente de novo." };
}

/**
 * Prévia automática das vagas selecionadas (com espera curta para a seleção
 * assentar) + a busca de verdade. O último resultado fica guardado: a prévia
 * seguinte só o substitui quando volta.
 */
export function useBuscaDePassagens(vagas: VagaDoPedido[], inicial?: { flex?: readonly string[]; alternativas?: readonly string[] }) {
  const queryClient = useQueryClient();
  const [resposta, setResposta] = useState<RespostaDaBusca | null>(null);
  const [erro, setErro] = useState<ErroDaBusca | null>(null);
  const [previaCarregando, setPreviaCarregando] = useState(false);
  const pedidoAtual = useRef(0);
  const assinatura = JSON.stringify(vagas);
  // Datas vizinhas / aeroportos já pedidos: voltam do cache a cada prévia (a tela de resultados os guarda na URL).
  const mostrarFlex = useRef<Set<string>>(new Set(inicial?.flex ?? []));
  const mostrarAlternativas = useRef<Set<string>>(new Set(inicial?.alternativas ?? []));

  const executar = useCallback(async (extra: Omit<PedidoDaBusca, "vagas">, lista: VagaDoPedido[]) => {
    const corpo: PedidoDaBusca = { vagas: lista, mostrarFlex: Array.from(mostrarFlex.current), mostrarAlternativas: Array.from(mostrarAlternativas.current), ...extra };
    const r = await apiRequest("POST", "/api/busca-de-passagens", corpo);
    return (await r.json()) as RespostaDaBusca;
  }, []);

  // Prévia: sempre que a seleção (ou um ajuste) muda.
  useEffect(() => {
    const lista = JSON.parse(assinatura) as VagaDoPedido[];
    if (lista.length === 0) { setResposta(null); setErro(null); setPreviaCarregando(false); return; }
    const n = ++pedidoAtual.current;
    setPreviaCarregando(true);
    const t = setTimeout(() => {
      executar({}, lista)
        .then((r) => { if (n === pedidoAtual.current) { setResposta(r); setErro(null); } })
        .catch((e) => { if (n === pedidoAtual.current) setErro(lerErro(e)); })
        .finally(() => { if (n === pedidoAtual.current) setPreviaCarregando(false); });
    }, 350);
    return () => clearTimeout(t);
  }, [assinatura, executar]);

  const busca = useMutation({
    /** `vagas`: a lista com um ajuste que acabou de mudar (2 conexões, outro aeroporto). */
    mutationFn: ({ extra, vagas: outras }: { extra: Omit<PedidoDaBusca, "vagas">; vagas?: VagaDoPedido[] }) => {
      for (const k of extra.flex ?? []) mostrarFlex.current.add(k);
      for (const k of [...(extra.alternativas ?? []), ...(extra.mostrarAlternativas ?? [])]) mostrarAlternativas.current.add(k);
      pedidoAtual.current++; // uma prévia atrasada não sobrescreve o resultado
      return executar(extra, outras ?? (JSON.parse(assinatura) as VagaDoPedido[]));
    },
    onSuccess: (r) => {
      setResposta(r);
      setErro(null);
      queryClient.setQueryData(CHAVE_DO_CONSUMO, r.consumo);
      queryClient.invalidateQueries({ queryKey: ["/api/busca-de-passagens/consumo/detalhe"] });
    },
    onError: (e) => {
      const lido = lerErro(e);
      setErro(lido);
      if (lido.tipo === "teto") queryClient.invalidateQueries({ queryKey: CHAVE_DO_CONSUMO });
    },
  });

  return {
    resposta,
    erro,
    limparErro: () => setErro(null),
    previaCarregando,
    buscar: busca.mutate,
    buscando: busca.isPending,
    /** Qual ação está rodando (para o esqueleto aparecer só onde importa). */
    pedidoEmAndamento: busca.isPending ? busca.variables?.extra : undefined,
    /** O que a prévia já pede de volta do cache (datas vizinhas e aeroportos testados). */
    mostrando: { flex: Array.from(mostrarFlex.current), alternativas: Array.from(mostrarAlternativas.current) },
  };
}

/**
 * Aeroportos confirmados NESTA sessão (evento → IATA). A lista /api/events tem
 * cache de 60 s no navegador (catálogo): um refetch logo depois de confirmar
 * podia trazer a versão antiga e "desconfirmar" a linha. A tela aplica isto
 * por cima da lista até ela chegar atualizada.
 */
export const CHAVE_DOS_CONFIRMADOS = ["busca-de-passagens", "aeroportos-confirmados"] as const;
export function useAeroportosConfirmados(): Record<string, string> {
  return useQuery<Record<string, string>>({
    queryKey: CHAVE_DOS_CONFIRMADOS,
    queryFn: () => ({}),
    initialData: {},
    staleTime: Infinity,
    gcTime: Infinity,
  }).data;
}

export function useConfirmarAeroporto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, iata }: { eventId: string; iata: string }) =>
      (await apiRequest("PUT", `/api/busca-de-passagens/eventos/${eventId}/aeroporto`, { iata })).json() as Promise<{ id: string; aeroportoIata: string }>,
    onSuccess: (r) => {
      // A lista de eventos é a mesma de todo o app: reflete na hora (sem
      // refetch — o cache de 60 s do navegador devolveria a versão antiga).
      queryClient.setQueryData<Array<{ id: string; aeroportoIata?: string | null }>>(["/api/events"], (lista) =>
        lista?.map((e) => (e.id === r.id ? { ...e, aeroportoIata: r.aeroportoIata } : e)));
      queryClient.setQueryData<Record<string, string>>(CHAVE_DOS_CONFIRMADOS, (m) => ({ ...(m ?? {}), [r.id]: r.aeroportoIata }));
    },
  });
}

/** Qual link abre (companhia × agência) é a regra de shared/links-de-compra.ts. */
export async function pedirLinkDeCompra(itinerarioId: string): Promise<{ links: LinkDeCompra[]; doCache: boolean }> {
  const r = await apiRequest("POST", "/api/busca-de-passagens/link", { itinerarioId });
  return r.json();
}

export async function registrarUsoDoVoo(corpo: {
  teamInclusionId: string; chave: string; perna: string; itinerarioId: string; companhia: string; voos: string; precoCentavos: number; precoVistoEm: string;
}): Promise<void> {
  await apiRequest("POST", "/api/busca-de-passagens/uso", corpo);
}

export function useAlterarTeto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (teto: number) => (await apiRequest("PUT", "/api/busca-de-passagens/teto", { teto })).json() as Promise<ConsumoDaBusca>,
    onSuccess: (c) => {
      queryClient.setQueryData(CHAVE_DO_CONSUMO, c);
      queryClient.invalidateQueries({ queryKey: ["/api/busca-de-passagens/consumo/detalhe"] });
    },
  });
}

// ── Etapa 2 (09/10): acompanhar preço e os ajustes do admin ──────────────

export interface AcompanhamentoNaTela {
  id: string;
  teamInclusionId: string;
  inclusionNumber: number | null;
  eventId: string | null;
  eventName: string | null;
  colaborador: string | null;
  funcao: string | null;
  criadoPorNome: string | null;
  criadoEm: string | null;
  ativo: boolean;
  rotas: string[];
  precoInicial: number | null;
  ultimoPreco: number | null;
  menorPreco: number | null;
  ultimaChecagemEm: string | null;
  tendencia: TendenciaDoPreco | null;
  aviso: "caiu" | "subir" | null;
  avisoTexto: string | null;
  avisoEm: string | null;
  avisoNovo: boolean;
  paradoEm: string | null;
  motivoParada: string | null;
}
export interface ListaDeAcompanhamentos { itens: AcompanhamentoNaTela[]; limite: number; ativos: number; hora: number; quedaPct: number }
export interface ResumoDaChecagem { checadas: number; consultas: number; avisos: number; puladas: number; paradas: number }

export const CHAVE_DOS_ACOMPANHAMENTOS = ["/api/busca-de-passagens/acompanhamentos"] as const;
export const CHAVE_DO_SINO_DE_PRECOS = ["shell", "precos-acompanhados"] as const;

export function useAcompanhamentos(ativo = true) {
  return useQuery<ListaDeAcompanhamentos>({
    queryKey: CHAVE_DOS_ACOMPANHAMENTOS,
    queryFn: ({ signal }) => fetchJson<ListaDeAcompanhamentos>("/api/busca-de-passagens/acompanhamentos", signal),
    enabled: ativo,
    staleTime: 30_000,
  });
}

/** Acompanhar / parar / tirar o aviso / checar agora — todos refazem a lista e o sino. */
export function useAcoesDoAcompanhamento() {
  const queryClient = useQueryClient();
  const refazer = () => {
    queryClient.invalidateQueries({ queryKey: CHAVE_DOS_ACOMPANHAMENTOS });
    queryClient.invalidateQueries({ queryKey: CHAVE_DO_SINO_DE_PRECOS });
  };
  const acompanhar = useMutation({
    mutationFn: async ({ teamInclusionId, ajuste }: { teamInclusionId: string; ajuste?: AjusteDaBusca }) =>
      (await apiRequest("POST", "/api/busca-de-passagens/acompanhamentos", { teamInclusionId, ajuste })).json() as Promise<{ id: string; jaExistia: boolean }>,
    onSuccess: refazer,
  });
  const parar = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/busca-de-passagens/acompanhamentos/${id}`)).json(),
    onSuccess: refazer,
  });
  const vistos = useMutation({
    mutationFn: async (ids?: string[]) => (await apiRequest("POST", "/api/busca-de-passagens/acompanhamentos/vistos", ids ? { ids } : {})).json(),
    onSuccess: refazer,
  });
  const checar = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/busca-de-passagens/acompanhamentos/checar", {})).json() as Promise<ResumoDaChecagem>,
    onSuccess: () => {
      refazer();
      queryClient.invalidateQueries({ queryKey: CHAVE_DO_CONSUMO });
    },
  });
  return { acompanhar, parar, vistos, checar };
}

export interface RespostaDosAjustes { ajustes: AjustesDaBusca; padrao: AjustesDaBusca }
export const CHAVE_DOS_AJUSTES = ["/api/busca-de-passagens/ajustes"] as const;
export function useAjustesDaBusca(ativo: boolean) {
  return useQuery<RespostaDosAjustes>({
    queryKey: CHAVE_DOS_AJUSTES,
    queryFn: ({ signal }) => fetchJson<RespostaDosAjustes>("/api/busca-de-passagens/ajustes", signal),
    enabled: ativo,
    staleTime: 60_000,
  });
}
export function useSalvarAjustes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (parcial: Partial<AjustesDaBusca>) => (await apiRequest("PUT", "/api/busca-de-passagens/ajustes", parcial)).json() as Promise<RespostaDosAjustes>,
    onSuccess: (r) => {
      queryClient.setQueryData(CHAVE_DOS_AJUSTES, r);
      queryClient.invalidateQueries({ queryKey: CHAVE_DOS_ACOMPANHAMENTOS });
    },
  });
}
