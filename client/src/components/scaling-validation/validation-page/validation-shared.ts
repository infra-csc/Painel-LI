/**
 * Validação de escala — constantes e utilitários puros (25/09, extraídos de
 * pages/scaling-validation.tsx).
 */
import { SUGESTAO_STATUS, STALLED_DAYS, pendingSeverity } from "@shared/scaling-validation-rules";
import type { SuggestionRow } from "@/components/scaling-validation/types";

export const ALL = "all";
export const BASE_PATH = "/scaling-validation";
export const PULSE_MS = 2000;
/** Realce mais longo para "Ver quais" (o usuário sai do toast e ainda precisa achar as linhas). */
export const PULSE_LONG_MS = 5000;
/** Rede de segurança caso o drawer não avise que terminou de fechar (ver `runAfterDrawer`). */
export const AFTER_DRAWER_FALLBACK_MS = 400;
/** Acima disto, "selecionar todas" pede confirmação — um clique no cabeçalho não pode montar um lote de 200. */
export const BIG_SELECTION = 50;
/** Lista vazia congelada: `approverNamesFor` devolve sempre a MESMA referência para "sem aprovador" (as linhas são `memo`). */
export const NO_NAMES: string[] = [];

/** Botão-chip da barra de contexto/filtros (mesma altura dos selects). */
export const CHIP_BTN = "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none";

/** "3 vagas" / "1 vaga" — plural de verdade, sem "(s)". */
export const vagas = (n: number) => `${n} ${n === 1 ? "vaga" : "vagas"}`;
export const eventos = (n: number) => `${n} ${n === 1 ? "evento" : "eventos"}`;

/** Recortes dos cards do resumo — a mesma leitura de status dos contadores. */
export type KpiFiltro = "pendentes" | "aguardandoAprovacao" | "comPedido" | "atrasadas";
export const KPI_MATCH: Record<KpiFiltro, (r: SuggestionRow) => boolean> = {
  pendentes: (r) => r.status === SUGESTAO_STATUS.PENDENTE,
  aguardandoAprovacao: (r) => r.status === SUGESTAO_STATUS.VALIDADA,
  comPedido: (r) => r.status === SUGESTAO_STATUS.AJUSTE,
  atrasadas: (r) => r.status === SUGESTAO_STATUS.PENDENTE && pendingSeverity(r.daysPending) !== "ok",
};

/** Depois de validar, a vaga é do aprovador — a frase única da tela (toast, dica e confirmação). */
export const AFTER_VALIDATE_MSG = "Depois de validar, a vaga fica com o aprovador e não muda mais — se faltar gente, use Incluir escalação.";

export const KPI_TOOLTIPS: Record<string, string> = {
  // Só as que dependem da ÁREA: o atraso das validadas é do aprovador e
  // aparece no badge "aguardando aprovação há N dias" de cada linha.
  Atrasadas: `Vagas que a área ainda não validou há ${STALLED_DAYS} dias ou mais.`,
  // O número conta o que FALTA validar; o clique liga o filtro "Só as
  // minhas funções" — o mesmo conjunto (regra de 26/08: validada não aceita
  // mais nada da área).
  "Minhas pendentes": "Das suas funções, as que você pode validar agora (sem pedido pendente). Clique para ver só elas.",
  "Com pedido": "Vagas com pedido de ajuste/exclusão aguardando o aprovador.",
  "Aguardando aprovação": `Vagas que a área já validou e agora aguardam a decisão do aprovador. ${AFTER_VALIDATE_MSG}`,
};
export type Kpi = { label: string; n: number; cls: string; filtro?: KpiFiltro | "minhas"; hint: string };
export type ValidationTab = "lista" | "escala" | "decididas";
