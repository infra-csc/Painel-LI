/**
 * Ordens de compra — o formato das respostas do servidor (28/10, Fase 2
 * MANUAL do Módulo de Honorários). Espelha `LinhaDaOc` em
 * server/honorarios-pagamento-servico.ts e as rotas de
 * server/routes/honorarios-pagamento.ts; se o servidor mudar, mude aqui.
 */
import type { ConferenciaDaNota, EstadoDoPagamento, LinhaDoLoteDeOc } from "@shared/honorarios-pagamento";
import type { SituacaoDoCnpjInformado } from "@shared/presenca";

export interface PessoaQueRegistrou { id: string; nome: string | null }

export interface OcDaLinha {
  numero: string;
  valor: number | null;
  data: string | null;
  registradaEm: string | null;
  registradaPor: PessoaQueRegistrou | null;
  /** "manual" | "lote" | "m4" */
  origem: string | null;
  justificativa: string | null;
}

export interface NotaDaLinha {
  id: string;
  status: string;
  oc: string | null;
  numero: string | null;
  valor: number | null;
  cnpj: string | null;
  arquivoNome: string | null;
  arquivoUrl: string | null;
  comentarioDoDp: string | null;
  enviadaEm: string | null;
  paymentDate: string | null;
  lancadaNoM4Em: string | null;
}

export interface PagamentoDaLinha {
  pagoEm: string;
  registradoPor: PessoaQueRegistrou | null;
  registradoEm: string | null;
  observacao: string | null;
  comprovanteId: string | null;
  comprovanteUrl: string | null;
}

export interface CnpjEmissorDaLinha {
  cnpj: string | null;
  razaoSocial: string | null;
  origem: string | null;
  situacao: SituacaoDoCnpjInformado;
  rotulo: string;
  contratoId: string | null;
}

export interface AcoesDaLinha {
  registrarOc: boolean;
  exigeJustificativa: boolean;
  desfazerOc: boolean;
  marcarPago: boolean;
  desfazerPago: boolean;
  motivoSemOc: string | null;
}

export interface LinhaDaOc {
  actualId: string;
  eventId: string;
  colaborador: { id: string; nome: string; numero: number } | null;
  /** 28/10 (R7): divisão da vaga — o substituto pago como prestação própria; ausente num servidor antigo. */
  divisao?: { titularActualId: string; titularNome: string | null } | null;
  funcao: { id: string | null; nome: string | null; centroDeCusto: string | null };
  valorAprovado: number;
  rhActionAt: string | null;
  emiteNf: boolean;
  cnpjEmissor: CnpjEmissorDaLinha;
  oc: OcDaLinha | null;
  nota: NotaDaLinha | null;
  conferencia: ConferenciaDaNota | null;
  programadoPara: string | null;
  pagamento: PagamentoDaLinha | null;
  estado: EstadoDoPagamento;
  rotuloDoEstado: string;
  acoes: AcoesDaLinha;
}

export type ContadoresDaOc = Record<EstadoDoPagamento, number> & { naoEmiteNf: number; exigemJustificativa: number; total: number };

export interface RespostaDasOcs {
  evento: {
    id: string; nome: string; cidade: string | null; inicio: string | null; fim: string | null;
    empresaPagadora: { nome: string | null; cnpj: string | null };
  };
  hoje: string;
  linhas: LinhaDaOc[];
  contadores: ContadoresDaOc;
  permissoes?: { podeDesfazerPago: boolean; podeRodarExpurgo: boolean };
}

/** POST /api/ordens-de-compra/lote/previa */
export interface PreviaDoLote {
  linhas: LinhaDoLoteDeOc[];
  comCabecalho: boolean;
  resumo: { ok: number; erro: number; ignorada: number; exigemJustificativa: number };
}

/** POST /api/ordens-de-compra/lote */
export interface ResultadoDoLote {
  registradas: number;
  ignoradas: number;
  recusadas: { linha: number; referencia: string; motivos: string[] }[];
  linhas: LinhaDaOc[];
}

/** POST /api/pagamentos/marcar-pago */
export interface ResultadoDoPago {
  pagas: number;
  recusadas: { actualId: string; motivo: string; codigo: string }[];
  linhas: LinhaDaOc[];
}

/** GET /api/invoices/conferencia — uma por nota. */
export interface ConferenciaDaNotaApi {
  invoiceId: string;
  actualId: string | null;
  legado: boolean;
  ocRegistrada: OcDaLinha | null;
  cnpjEmissor: CnpjEmissorDaLinha | null;
  valorAprovado: number | null;
  conferencia: ConferenciaDaNota | null;
  estado: EstadoDoPagamento | null;
  rotuloDoEstado: string | null;
  programadoPara: string | null;
  pagamento: PagamentoDaLinha | null;
  podeMarcarPago: boolean;
  podeDesfazerPago: boolean;
}
