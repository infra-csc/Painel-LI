/**
 * Honorários da cenotécnica — contrato com a API e os hooks de dados (16/10).
 * Um formato por chave: todas as consultas do módulo começam com
 * `["honorarios-ceno", …]` e toda mutação invalida o módulo inteiro + o sino.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, fetchJson } from "@/lib/queryClient";
import type { AvisoDaVaga } from "@shared/honorarios-ceno";

export const CHAVE = "honorarios-ceno";
export const CHAVE_DO_SINO = ["shell", "honorarios-ceno"] as const;

export interface Honorario {
  id: string;
  eventId: string;
  tipo: "vaga" | "empreita";
  teamInclusionId: string | null;
  functionId: string | null;
  collaboratorId: string | null;
  nome: string;
  pessoas: number | null;
  descricao: string | null;
  setor: string | null;
  posicao: string | null;
  inicio: string | null;
  fim: string | null;
  diarias: number | null;
  valorPedido: number;
  valorAprovado: number | null;
  observacao: string | null;
  status: string;
  versao: number;
  criadoPor: string;
  criadoPorNome: string;
  enviadoPor: string | null;
  enviadoPorNome: string | null;
  enviadoEm: string | null;
  decididoPor: string | null;
  decididoPorNome: string | null;
  decididoEm: string | null;
  motivoDecisao: string | null;
  createdAt: string;
  updatedAt: string;
  liberado: number;
  falta: number;
  eventName: string | null;
  eventStartDate: string | null;
  eventEndDate: string | null;
  inclusionNumber: number | null;
  functionName: string | null;
  vagaStatus: string | null;
  vagaExcluida: boolean;
  /** A escala mudou depois do pedido (troca de colaborador, vaga cancelada…). */
  avisoDaVaga: AvisoDaVaga | null;
  colaboradorAtualId: string | null;
  /** Quem está HOJE na vaga (o `nome` é o de quando o pedido foi feito). */
  colaboradorAtual: string | null;
  eventoExcluido: boolean;
  /** Vaga: 'viagem' | 'sp' | 'local_a' | 'local_b' (tabela) ou 'outro'; null na empreita e nos antigos. */
  tipoFreela: string | null;
  /** Pedido de vaga ainda sem colaborador ("Vaga #N sem nome"). */
  semColaborador: boolean;
  /** Empreita: as vagas que fazem parte dela (com quem está nelas hoje). */
  vagasDaEmpreita: VagaDaEmpreita[];
  /** Empreita: vagas dela que mudaram na escala ("#5063 cancelada na escala"). */
  avisosDaEmpreita: string[];
  podeEditar: boolean;
  podeRemover: boolean;
  podeDecidir: boolean;
  podeDevolver: boolean;
  podeLiberar: boolean;
  eAprovador: boolean;
}

export interface VagaDaEmpreita {
  id: string;
  inclusionNumber: number;
  functionId: string;
  functionName: string | null;
  collaboratorId: string | null;
  collaboratorName: string | null;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  dias: number;
  aviso: Exclude<AvisoDaVaga, "colaborador_trocado"> | null;
}

export interface Liberacao {
  id: string;
  honorarioId: string;
  data: string;
  oc: string;
  valor: number;
  observacao: string | null;
  porNome: string;
  createdAt: string;
  estornadaEm: string | null;
  estornadaPorNome: string | null;
  motivoEstorno: string | null;
}

export interface HonorarioDoFinanceiro extends Honorario {
  liberacoes: Liberacao[];
}

export interface EntradaDoHistorico {
  id: string;
  acao: string;
  valorAnterior: number | null;
  valorNovo: number | null;
  motivo: string | null;
  detalhe: string | null;
  porNome: string;
  em: string;
}

export interface VagaDoPedido {
  id: string;
  eventId: string;
  inclusionNumber: number;
  functionId: string;
  functionName: string;
  collaboratorId: string | null;
  collaboratorName: string | null;
  collaboratorType: string | null;
  status: string;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  dailyRates: number;
  cenoFreelaTipo: string | null;
  needsTicket: boolean;
  empreitaEmpresa: string | null;
  empreitaPessoas: number | null;
  empreitaValor: number | null;
  /** Dias de trabalho (os mesmos da tabela de empreita). */
  dias: number;
}

export interface SugestaoDaVaga {
  setor: string | null;
  posicao: string | null;
  inicio: string | null;
  fim: string | null;
  diarias: number | null;
  nome: string;
  /** Tipo de freela já escolhido no Resumo da vaga (vem pré-selecionado). */
  tipoFreela: string | null;
  semColaborador: boolean;
}

/** Os 4 valores da tabela da cenotécnica para os dias da vaga (null = sem dias). */
export interface TabelaDaVaga {
  dias: number;
  valores: Record<"viagem" | "sp" | "local_a" | "local_b", { total: number; extrapolado: boolean } | null>;
}

export interface LinhaDoPedido {
  vaga: VagaDoPedido | null;
  sugestao: SugestaoDaVaga | null;
  tabela?: TabelaDaVaga | null;
  honorario: Honorario | null;
  foraDaEscala: boolean;
}

/** Vaga do evento que pode entrar numa empreita (com onde ela está hoje). */
export interface VagaParaEmpreita {
  id: string;
  inclusionNumber: number;
  functionName: string;
  collaboratorName: string | null;
  semColaborador: boolean;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  dias: number;
  empreita: { id: string; nome: string } | null;
  pedidoProprio: { id: string; status: string; valorPedido: number } | null;
}

export interface PedidoDoEvento {
  evento: { id: string; name: string; startDate: string; endDate: string; location: string; status: string };
  linhas: LinhaDoPedido[];
  empreitas: Honorario[];
  vagasDoEvento?: VagaParaEmpreita[];
  casa: { id: string; inclusionNumber: number; functionName: string; collaboratorName: string | null }[];
  funcoes: { id: string; name: string }[];
}

export interface EventoDoPedido {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  location: string;
  vagas: number;
  semColaborador?: number;
  semPedido: number;
  empreitas: number;
  rascunhos: number;
  aguardando: number;
  devolvidos: number;
  aprovados: number;
  totalPedido: number;
  totalAprovado: number;
  passado: boolean;
}

export interface AcessoHonorarios {
  podePedir: boolean;
  podeAprovar: boolean;
  podeLiberar: boolean;
  admin: boolean;
}

export interface PendenciasHonorarios {
  aguardandoMinhaAprovacao: number;
  aguardandoPodeDecidir: number;
  devolvidosParaMim: number;
  aLiberar: number;
}

// ── Consultas ───────────────────────────────────────────────────────────────

export function useAcessoHonorarios(enabled = true) {
  return useQuery<AcessoHonorarios>({
    queryKey: [CHAVE, "acesso"],
    queryFn: ({ signal }) => fetchJson<AcessoHonorarios>("/api/honorarios-ceno/acesso", signal),
    enabled,
    staleTime: 60_000,
  });
}

/** Chaves e leituras do lado de quem pede — as mesmas no hook e no `fetchQuery` do link do sino. */
export const chaveDosEventos = () => [CHAVE, "eventos"] as const;
export const chaveDoPedido = (eventId: string | null) => [CHAVE, "pedido", eventId] as const;
export const buscarEventosDoPedido = (signal?: AbortSignal) => fetchJson<EventoDoPedido[]>("/api/honorarios-ceno/eventos", signal);
export const buscarPedidoDoEvento = (eventId: string, signal?: AbortSignal) =>
  fetchJson<PedidoDoEvento>(`/api/honorarios-ceno/pedido?eventId=${encodeURIComponent(eventId)}`, signal);

export function useEventosDoPedido(enabled: boolean) {
  return useQuery<EventoDoPedido[]>({
    queryKey: [...chaveDosEventos()],
    queryFn: ({ signal }) => buscarEventosDoPedido(signal),
    enabled,
  });
}

export function usePedidoDoEvento(eventId: string | null, enabled = true) {
  return useQuery<PedidoDoEvento>({
    queryKey: [...chaveDoPedido(eventId)],
    queryFn: ({ signal }) => buscarPedidoDoEvento(eventId ?? "", signal),
    enabled: enabled && !!eventId,
  });
}

export function useFilaDeAprovacao(situacao: "pendentes" | "decididos", eventId: string | null, enabled = true) {
  return useQuery<Honorario[]>({
    queryKey: [CHAVE, "aprovacao", situacao, eventId ?? ""],
    queryFn: ({ signal }) => fetchJson<Honorario[]>(`/api/honorarios-ceno/aprovacao?situacao=${situacao}${eventId ? `&eventId=${encodeURIComponent(eventId)}` : ""}`, signal),
    enabled,
  });
}

export function useHonorariosDoFinanceiro(eventId: string | null, enabled = true) {
  return useQuery<HonorarioDoFinanceiro[]>({
    queryKey: [CHAVE, "financeiro", eventId ?? ""],
    queryFn: ({ signal }) => fetchJson<HonorarioDoFinanceiro[]>(`/api/honorarios-ceno/financeiro${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`, signal),
    enabled,
  });
}

export function useHistoricoDoHonorario(id: string | null) {
  return useQuery<{ honorario: Honorario; historico: EntradaDoHistorico[]; liberacoes: Liberacao[] }>({
    queryKey: [CHAVE, "historico", id],
    queryFn: ({ signal }) => fetchJson(`/api/honorarios-ceno/${id}/historico`, signal),
    enabled: !!id,
  });
}

export function buscarPendencias(signal?: AbortSignal) {
  return fetchJson<PendenciasHonorarios>("/api/honorarios-ceno/pendencias", signal);
}

// ── Mutações ────────────────────────────────────────────────────────────────

export interface CamposDoPedido {
  nome?: string | null;
  pessoas?: number | null;
  descricao?: string | null;
  setor?: string | null;
  posicao?: string | null;
  inicio?: string | null;
  fim?: string | null;
  diarias?: number | null;
  valorPedido?: number;
  observacao?: string | null;
  tipoFreela?: string | null;
  /** Empreita: as vagas dela (substitui a lista). */
  vagaIds?: string[];
  /** Empreita: confirmou descartar o rascunho próprio das vagas que entram. */
  descartarRascunhos?: boolean;
}

/** 409 da empreita: vagas com rascunho próprio que precisam de confirmação para descartar. */
export interface PrecisaConfirmarDescarte { id: string; nome: string; status: string; inclusionNumber: number }

export interface ResultadoDoLote {
  enviados?: string[];
  feitos?: string[];
  recusados: { id: string; nome: string; motivo: string }[];
}

function useInvalidarModulo() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [CHAVE] });
    qc.invalidateQueries({ queryKey: [...CHAVE_DO_SINO] });
  };
}

const json = async <T,>(r: Promise<Response>) => (await (await r).json()) as T;

export function useMutacoesDoPedido() {
  const invalidar = useInvalidarModulo();
  const criar = useMutation({
    mutationFn: (b: { eventId: string; tipo: "vaga" | "empreita"; teamInclusionId?: string } & CamposDoPedido) =>
      json<Honorario>(apiRequest("POST", "/api/honorarios-ceno", b)),
    onSettled: invalidar,
  });
  const editar = useMutation({
    mutationFn: ({ id, ...b }: { id: string; versao: number } & CamposDoPedido) =>
      json<Honorario>(apiRequest("PATCH", `/api/honorarios-ceno/${id}`, b)),
    onSettled: invalidar,
  });
  const remover = useMutation({
    mutationFn: ({ id, versao }: { id: string; versao: number }) => json<{ ok: true }>(apiRequest("DELETE", `/api/honorarios-ceno/${id}`, { versao })),
    onSettled: invalidar,
  });
  const enviar = useMutation({
    mutationFn: (itens: { id: string; versao: number }[]) => json<ResultadoDoLote>(apiRequest("POST", "/api/honorarios-ceno/enviar", { itens })),
    onSettled: invalidar,
  });
  return { criar, editar, remover, enviar };
}

/**
 * Grava o tipo de freela NA VAGA (20/10) pela rota da Escalação — usada quando
 * quem pede escolhe o tipo no honorário e a vaga ainda não tinha, para o
 * Planejado bater. Nunca troca um tipo que a vaga já tem.
 */
export function useGravarTipoNaVaga() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vagaId, tipo }: { vagaId: string; tipo: string }) =>
      json<unknown>(apiRequest("PATCH", `/api/team-inclusions/${vagaId}/ceno-freela-tipo`, { cenoFreelaTipo: tipo })),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      qc.invalidateQueries({ queryKey: [CHAVE] });
    },
  });
}

export function useMutacoesDoAprovador() {
  const invalidar = useInvalidarModulo();
  const aprovar = useMutation({
    mutationFn: ({ id, versao }: { id: string; versao: number }) => json<Honorario>(apiRequest("POST", `/api/honorarios-ceno/${id}/aprovar`, { versao })),
    onSettled: invalidar,
  });
  const ajustar = useMutation({
    mutationFn: ({ id, ...b }: { id: string; versao: number; valor: number; motivo: string }) =>
      json<Honorario>(apiRequest("POST", `/api/honorarios-ceno/${id}/aprovar-com-ajuste`, b)),
    onSettled: invalidar,
  });
  const devolver = useMutation({
    mutationFn: ({ id, ...b }: { id: string; versao: number; motivo: string }) =>
      json<Honorario>(apiRequest("POST", `/api/honorarios-ceno/${id}/devolver`, b)),
    onSettled: invalidar,
  });
  const lote = useMutation({
    mutationFn: (b: { acao: "aprovar" | "devolver"; itens: { id: string; versao: number }[]; motivo?: string }) =>
      json<ResultadoDoLote>(apiRequest("POST", "/api/honorarios-ceno/decidir-lote", b)),
    onSettled: invalidar,
  });
  return { aprovar, ajustar, devolver, lote };
}

export function useMutacoesDoFinanceiro() {
  const invalidar = useInvalidarModulo();
  const liberar = useMutation({
    mutationFn: ({ id, ...b }: { id: string; versao: number; data: string; oc: string; valor: number; observacao?: string | null }) =>
      json<Honorario>(apiRequest("POST", `/api/honorarios-ceno/${id}/liberacoes`, b)),
    onSettled: invalidar,
  });
  const estornar = useMutation({
    mutationFn: ({ id, liberacaoId, ...b }: { id: string; liberacaoId: string; versao: number; motivo: string }) =>
      json<Honorario>(apiRequest("POST", `/api/honorarios-ceno/${id}/liberacoes/${liberacaoId}/estornar`, b)),
    onSettled: invalidar,
  });
  return { liberar, estornar };
}
