/**
 * Contratos (CNPJ) e dados de pagamento — contrato com a API e os hooks
 * (26/10). Todas as consultas começam com `["contratos", …]`; toda mutação
 * invalida o módulo inteiro + o sino. Só o DP (admin + financial) chama
 * estas rotas — quem não é DP nem pergunta (`enabled`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, fetchJson, throwIfResNotOk } from "@/lib/queryClient";
import type { SituacaoContratualDoColaborador, SituacaoDoContrato, TipoDeContrato } from "@shared/contratos";
import type { DadosDePagamento, TipoDeConta, TipoDePix } from "@shared/pagamento";
import type { AcaoDaLinha, CampoDaImportacao } from "@shared/importacao-contratos";
import type { OrigemDoContrato } from "@shared/fornecedor-automatico";

export const CHAVE = "contratos";
export const CHAVE_DO_SINO_DE_CONTAS = ["shell", "contas-alteradas"] as const;

export interface ColaboradorDoContrato { id: string; fullName: string; collaboratorNumber: number; type: string; active: boolean }

export interface Contrato {
  id: string;
  cnpj: string;
  cnpjFormatado: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  tipo: TipoDeContrato;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  observacao: string | null;
  anexoId: string | null;
  anexoNome: string | null;
  encerradoEm: string | null;
  encerradoPorNome: string | null;
  motivoEncerramento: string | null;
  /** 28/10: "cadastro" (DP) ou "automatico" (aprovado pelo histórico de pagamentos). */
  origem: OrigemDoContrato;
  origemDetalhe: string | null;
  versao: number;
  criadoPorNome: string | null;
  atualizadoPorNome: string | null;
  createdAt: string;
  updatedAt: string;
  situacao: SituacaoDoContrato;
  diasParaVencer: number | null;
  colaboradores: ColaboradorDoContrato[];
}

export interface HistoricoDoContrato { id: string; acao: string; detalhes: string[]; porNome: string; em: string }

export interface CorpoDoContrato {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  tipo: TipoDeContrato;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  observacao: string | null;
  colaboradorIds: string[];
}

export function useContratos(enabled = true) {
  return useQuery<{ hoje: string; contratos: Contrato[] }>({
    queryKey: [CHAVE, "lista"],
    queryFn: ({ signal }) => fetchJson("/api/contratos", signal),
    enabled,
  });
}

export function useContrato(id: string | null) {
  return useQuery<{ contrato: Contrato; historico: HistoricoDoContrato[] }>({
    queryKey: [CHAVE, "detalhe", id],
    queryFn: ({ signal }) => fetchJson(`/api/contratos/${id}`, signal),
    enabled: !!id,
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: [CHAVE] });
    void qc.invalidateQueries({ queryKey: [...CHAVE_DO_SINO_DE_CONTAS] });
  };
}

export function useMutacoesDeContrato() {
  const invalidar = useInvalidar();
  const json = async (r: Response) => r.json() as Promise<Contrato>;
  const criar = useMutation({
    mutationFn: async (c: CorpoDoContrato) => json(await apiRequest("POST", "/api/contratos", c)),
    onSuccess: invalidar,
  });
  const editar = useMutation({
    mutationFn: async ({ id, ...c }: Partial<CorpoDoContrato> & { id: string; versao: number }) => json(await apiRequest("PATCH", `/api/contratos/${id}`, c)),
    onSuccess: invalidar,
  });
  const encerrar = useMutation({
    mutationFn: async ({ id, versao, motivo }: { id: string; versao: number; motivo: string }) => json(await apiRequest("POST", `/api/contratos/${id}/encerrar`, { versao, motivo })),
    onSuccess: invalidar,
  });
  const reativar = useMutation({
    mutationFn: async ({ id, versao }: { id: string; versao: number }) => json(await apiRequest("POST", `/api/contratos/${id}/reativar`, { versao })),
    onSuccess: invalidar,
  });
  const vincular = useMutation({
    mutationFn: async ({ id, colaboradorId }: { id: string; colaboradorId: string }) => json(await apiRequest("POST", `/api/contratos/${id}/colaboradores/${colaboradorId}`)),
    onSuccess: invalidar,
  });
  const desvincular = useMutation({
    mutationFn: async ({ id, colaboradorId }: { id: string; colaboradorId: string }) => json(await apiRequest("DELETE", `/api/contratos/${id}/colaboradores/${colaboradorId}`)),
    onSuccess: invalidar,
  });
  const anexar = useMutation({
    mutationFn: async ({ id, arquivo }: { id: string; arquivo: File }) => {
      const form = new FormData();
      form.append("file", arquivo);
      const res = await fetch(`/api/contratos/${id}/anexo`, { method: "POST", body: form, credentials: "include" });
      await throwIfResNotOk(res);
      return (await res.json()) as Contrato;
    },
    onSuccess: invalidar,
  });
  const removerAnexo = useMutation({
    mutationFn: async ({ id }: { id: string }) => json(await apiRequest("DELETE", `/api/contratos/${id}/anexo`)),
    onSuccess: invalidar,
  });
  return { criar, editar, encerrar, reativar, vincular, desvincular, anexar, removerAnexo };
}

// ── Importação ──────────────────────────────────────────────────────────────

export interface LinhaDaPreviaApi {
  linha: number;
  cnpj: string | null;
  razaoSocial: string | null;
  colaborador: { id: string; nome: string } | null;
  acao: AcaoDaLinha;
  erros: string[];
  avisos: string[];
  mudancas: string[];
}

export interface PreviaApi {
  linhas: LinhaDaPreviaApi[];
  contagem: { total: number; novos: number; atualizados: number; semMudanca: number; erros: number; repetidas: number };
  contratos: { novos: number; atualizados: number };
  assinatura: string;
}

export interface ResultadoDaImportacao {
  criados: number;
  atualizados: number;
  vinculos: number;
  linhasComErro: number;
  repetidas: number;
  semMudanca: number;
  erros: { linha: number; cnpj: string | null; erros: string[] }[];
}

export interface PedidoDeImportacao {
  nomeDoArquivo: string;
  colunas: number;
  mapeamento: Partial<Record<CampoDaImportacao, number>>;
  linhas: string[][];
}

export function useImportacao() {
  const invalidar = useInvalidar();
  const previa = useMutation({
    mutationFn: async (p: PedidoDeImportacao) => (await apiRequest("POST", "/api/contratos/importacao/previa", p)).json() as Promise<PreviaApi>,
  });
  const confirmar = useMutation({
    mutationFn: async (p: PedidoDeImportacao & { assinatura: string }) =>
      (await apiRequest("POST", "/api/contratos/importacao/confirmar", p)).json() as Promise<ResultadoDaImportacao>,
    onSuccess: invalidar,
  });
  return { previa, confirmar };
}

// ── Aprovar fornecedores pelo histórico (28/10) ─────────────────────────────

export type DecisaoDaAprovacao = "criar" | "atualizar" | "ja_aprovado" | "ignorado";

export interface ItemDaAprovacaoApi {
  cnpj: string;
  razaoSocial: string;
  contratoId: string | null;
  decisao: DecisaoDaAprovacao;
  descricao: string;
  frase: string;
  evento: string;
  data: string;
  gatilho: string;
  colaboradores: { id: string; nome: string }[];
}

export interface ResumoDaAprovacao { criar: number; atualizar: number; jaAprovados: number; ignorados: number; total: number }

export interface RespostaDaAprovacao {
  simulado: boolean;
  resumo: ResumoDaAprovacao;
  itens: ItemDaAprovacaoApi[];
  aprovados: number;
  restantes?: ResumoDaAprovacao;
}

/** Prévia (`?simular=1`, não grava) e execução da varredura do histórico. Só o DP. */
export function useAprovacaoPeloHistorico() {
  const invalidar = useInvalidar();
  const previa = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/contratos/aprovacao-automatica?simular=1")).json() as Promise<RespostaDaAprovacao>,
  });
  const executar = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/contratos/aprovacao-automatica")).json() as Promise<RespostaDaAprovacao>,
    onSuccess: invalidar,
  });
  return { previa, executar };
}

// ── Sinal "contrato ativo" ──────────────────────────────────────────────────

export interface SituacaoDoColaboradorApi {
  situacao: SituacaoContratualDoColaborador;
  contratos: { id: string; cnpj: string; razaoSocial: string; situacao: SituacaoDoContrato }[];
}

export interface RespostaDaSituacao { data: string; situacoes: Record<string, SituacaoDoColaboradorApi> }

// ── Pagamento ───────────────────────────────────────────────────────────────

export interface PagamentoApi extends DadosDePagamento {
  tipoConta: TipoDeConta | null;
  pixTipo: TipoDePix | null;
  versao: number;
  atualizadoPorNome: string | null;
  updatedAt: string;
}

export interface AlteracaoDePagamento {
  id: string;
  collaboratorId?: string;
  colaboradorNome?: string;
  colaboradorNumero?: number;
  campos: string[];
  antes: Record<string, string | null>;
  depois: Record<string, string | null>;
  mudaConta: boolean;
  porNome: string;
  em: string;
  conferidoEm: string | null;
  conferidoPorNome: string | null;
  podeConferir?: boolean;
}

export interface RespostaDoPagamento {
  chaveConfigurada: boolean;
  pagamento: PagamentoApi | null;
  ilegiveis: { campo: "banco" | "agencia" | "conta" | "pixChave"; motivo: string; mensagem: string }[];
  contratos: { id: string; cnpj: string; razaoSocial: string; tipo: string; vigenciaInicio: string | null; vigenciaFim: string | null; situacao: SituacaoDoContrato }[];
  situacaoContratual: SituacaoContratualDoColaborador;
  avisos: string[];
  alteracoes: AlteracaoDePagamento[];
}

export function usePagamento(collaboratorId: string | null, enabled: boolean) {
  return useQuery<RespostaDoPagamento>({
    queryKey: [CHAVE, "pagamento", collaboratorId],
    queryFn: ({ signal }) => fetchJson(`/api/colaboradores/${collaboratorId}/pagamento`, signal),
    enabled: enabled && !!collaboratorId,
  });
}

export type CorpoDoPagamento = Partial<DadosDePagamento> & { versao: number };

export function useSalvarPagamento(collaboratorId: string) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (corpo: CorpoDoPagamento) =>
      (await apiRequest("PUT", `/api/colaboradores/${collaboratorId}/pagamento`, corpo)).json() as Promise<{ ok: true; versao: number; semMudanca?: boolean; mudouConta?: boolean }>,
    onSuccess: invalidar,
  });
}

export function useAlteracoesDeConta(situacao: "pendentes" | "todas", enabled: boolean) {
  return useQuery<AlteracaoDePagamento[]>({
    queryKey: [CHAVE, "alteracoes", situacao],
    queryFn: ({ signal }) => fetchJson(`/api/pagamento/alteracoes?situacao=${situacao}`, signal),
    enabled,
  });
}

export function useConferirAlteracao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/pagamento/alteracoes/${id}/conferir`)).json(),
    onSuccess: invalidar,
  });
}

export async function buscarContasAlteradas(signal?: AbortSignal) {
  return fetchJson<{ count: number; ultima: string | null }>("/api/shell/contas-alteradas", signal);
}
