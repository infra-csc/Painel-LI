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
  podeEditar: boolean;
  podeRemover: boolean;
  podeDecidir: boolean;
  podeDevolver: boolean;
  podeLiberar: boolean;
  eAprovador: boolean;
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
}

export interface SugestaoDaVaga {
  setor: string | null;
  posicao: string | null;
  inicio: string | null;
  fim: string | null;
  diarias: number | null;
  nome: string;
}

export interface LinhaDoPedido {
  vaga: VagaDoPedido | null;
  sugestao: SugestaoDaVaga | null;
  honorario: Honorario | null;
  foraDaEscala: boolean;
}

export interface PedidoDoEvento {
  evento: { id: string; name: string; startDate: string; endDate: string; location: string; status: string };
  linhas: LinhaDoPedido[];
  empreitas: Honorario[];
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

export function useEventosDoPedido(enabled: boolean) {
  return useQuery<EventoDoPedido[]>({
    queryKey: [CHAVE, "eventos"],
    queryFn: ({ signal }) => fetchJson<EventoDoPedido[]>("/api/honorarios-ceno/eventos", signal),
    enabled,
  });
}

export function usePedidoDoEvento(eventId: string | null, enabled = true) {
  return useQuery<PedidoDoEvento>({
    queryKey: [CHAVE, "pedido", eventId],
    queryFn: ({ signal }) => fetchJson<PedidoDoEvento>(`/api/honorarios-ceno/pedido?eventId=${encodeURIComponent(eventId ?? "")}`, signal),
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
}

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
