// Extraído de rh-control.tsx em 25/09 (modularização): tipos e constantes da
// fila de prestações de contas do Controle RH. Sem lógica de tela — é o
// vocabulário que hooks, cartões, filtros e resumo compartilham.
//
// Desde 25/09 (endpoint agregado) a linha da fila É o contrato do servidor:
// `LinhaDoControleRh` de @shared/controle-rh, que já chega com status,
// responsável, nomes, NF e isenção resolvidos. Os aliases abaixo existem para
// os componentes continuarem falando "PrestacaoItem"/"Invoice" sem cada um
// importar do shared.
import type {
  ContadoresDoControleRh,
  EventoParaControle,
  LinhaDoControleRh,
  NotaParaControle,
  RealizadoParaControle,
  StatusDaPrestacao,
} from "@shared/controle-rh";

export type { StatusDaPrestacao, EventoParaControle, NotaParaControle, ContadoresDoControleRh };

/**
 * Valor do filtro de status da tela: os seis status da linha + "all" + os
 * quatro card-filtros. Só "all" não existe no servidor (vira `status` vazio).
 */
export type PrestacaoStatus =
  | StatusDaPrestacao
  | "all"
  | "rh_action"
  // Filtros dos cards de métrica (não são status de item):
  | "col_action"
  | "nf_andamento"
  | "concluidos";

/**
 * Realizado como o card o lê. Desde 25/09 o contrato `RealizadoParaControle`
 * já traz alimentação e mobilidade (o corpo do cartão mostra Planejado ×
 * Realizado), então o alias é o próprio tipo do servidor.
 */
export type RealizadoDaLinha = RealizadoParaControle;

export type PrestacaoItem = Omit<LinhaDoControleRh, "actual"> & { actual: RealizadoDaLinha | null };

export interface EventGroup {
  event: EventoParaControle;
  items: PrestacaoItem[];
  actionNeeded: number;
}

export const STATUS_ORDER: StatusDaPrestacao[] = [
  "prestacao_recebida",
  "devolvida_para_ajuste",
  "planejamento_pendente",
  "aguardando_prestacao",
  "aprovada_faturamento",
  "recusada",
];

export const CONCLUDED_STATUSES: StatusDaPrestacao[] = ["aprovada_faturamento", "recusada"];
export const ACTIONABLE_STATUSES: StatusDaPrestacao[] = ["planejamento_pendente", "aguardando_prestacao", "prestacao_recebida", "devolvida_para_ajuste"];

/** Status em que a bola está com o RH (também conta no card "Ação do RH"). */
export const RH_STATUSES: StatusDaPrestacao[] = ["prestacao_recebida", "planejamento_pendente"];
