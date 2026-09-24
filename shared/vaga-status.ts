/**
 * Vocabulário ÚNICO do status da vaga (team_inclusions.status / .phase).
 *
 * Até 23/09 havia CINCO listas diferentes de "status confirmado" — duas em
 * server/routes.ts (`confirmedStatuses`), uma em scaling-status.ts
 * (`CONFIRMED_STATUSES`) e duas em scaling-utils.ts (`ESCALATED_STATUSES`,
 * `ACTIVE_CONFLICT_STATUSES`) — e três tabelas de rótulo (storage.ts,
 * status-badge.tsx, scaling-status.ts). `hospedagem_passagem_comprada`
 * faltava em três das cinco listas: uma vaga com tudo comprado não contava
 * como confirmada em parte das telas e podia ser reconfirmada — regressão que
 * já derrubou status em produção (ver fix-production-status.sql na raiz).
 *
 * Este módulo é a fonte. Servidor e cliente importam daqui; nenhuma lista
 * local de status deve voltar a existir. A máquina da etapa de SUGESTÃO
 * (Validação de Escala) continua em scaling-validation-rules.ts — aqui ela é
 * reutilizada, nunca copiada.
 */
import {
  SUGESTAO_PHASE,
  SUGESTAO_STATUS,
  SUGESTAO_STATUS_LABELS,
  SUGESTAO_STATUS_VALUES,
  SUGGESTION_ACTIONS,
  nextSuggestionState,
  type SugestaoStatus,
} from "./scaling-validation-rules";

// ---------------------------------------------------------------------------
// Domínio
// ---------------------------------------------------------------------------

/** Valores canônicos — os ÚNICOS que o servidor pode gravar em `status`. */
export const STATUS_DA_VAGA = [
  "planejado",
  "reaberto",
  "escalacao",
  "aguardando_producao",
  "escalado",
  "passagem",
  "passagem_comprada",
  "hospedagem",
  "hospedagem_comprada",
  "hospedagem_passagem_comprada",
  "aprovacao",
  "aprovado",
  "concluido",
  "cancelado",
  "sugestao_pendente",
  "sugestao_validada",
  "sugestao_ajuste",
  "sugestao_aprovada",
  "sugestao_negada",
] as const;
export type StatusDaVaga = (typeof STATUS_DA_VAGA)[number];

/**
 * Status LEGADOS: existem em linhas antigas do banco e só entram para leitura
 * (rótulo, fase, conflito). NUNCA gravar — o script
 * scripts/migrations/2026-09-23-status-fora-do-dominio.sql lista a limpeza.
 */
export const STATUS_LEGADOS = [
  "incluido",
  "pendente",
  "aguardando_passagem",
  "aguardando_hospedagem",
  "confirmado",
] as const;
export type StatusLegado = (typeof STATUS_LEGADOS)[number];

/** Equivalente canônico de cada legado — só para LER (rótulo, fase, transição). */
const CANONICO_DO_LEGADO: Record<StatusLegado, StatusDaVaga> = {
  incluido: "planejado",
  pendente: "planejado",
  aguardando_passagem: "passagem",
  aguardando_hospedagem: "hospedagem",
  confirmado: "escalado",
};

export const FASES_DA_VAGA = [
  "sugestao",
  "inclusao",
  "escalacao",
  "passagem",
  "hospedagem",
  "aprovacao",
  "aprovado",
  "cancelado",
] as const;
export type FaseDaVaga = (typeof FASES_DA_VAGA)[number];

const CANONICOS: ReadonlySet<string> = new Set(STATUS_DA_VAGA);
const LEGADOS: ReadonlySet<string> = new Set(STATUS_LEGADOS);
const FASES: ReadonlySet<string> = new Set(FASES_DA_VAGA);

export function ehStatusCanonico(status: string | null | undefined): status is StatusDaVaga {
  return !!status && CANONICOS.has(status);
}

export function ehStatusLegado(status: string | null | undefined): status is StatusLegado {
  return !!status && LEGADOS.has(status);
}

export function ehFaseDaVaga(fase: string | null | undefined): fase is FaseDaVaga {
  return !!fase && FASES.has(fase);
}

/**
 * Canônico do status (o próprio, ou o equivalente do legado). `null` para
 * valor fora do domínio — quem chama decide o que fazer com lixo.
 */
export function normalizarStatus(status: string | null | undefined): StatusDaVaga | null {
  if (ehStatusCanonico(status)) return status;
  if (ehStatusLegado(status)) return CANONICO_DO_LEGADO[status];
  return null;
}

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

/**
 * Escalação CONFIRMADA: o colaborador está fechado na vaga e o fluxo seguiu
 * (gestor, passagem, hospedagem, aprovação, conclusão). É a UNIÃO correta das
 * cinco listas antigas — inclui `hospedagem_passagem_comprada`, que faltava.
 */
export const CONFIRMED_STATUSES: ReadonlySet<string> = new Set<StatusDaVaga>([
  "escalado",
  "aguardando_producao",
  "passagem",
  "passagem_comprada",
  "hospedagem",
  "hospedagem_comprada",
  "hospedagem_passagem_comprada",
  "aprovacao",
  "aprovado",
  "concluido",
]);

/** Legados que significavam confirmação (linhas antigas ainda contam). */
export const STATUS_LEGADOS_DE_CONFIRMACAO = [
  "confirmado",
  "aguardando_passagem",
  "aguardando_hospedagem",
] as const;

/**
 * Status que ocupam a agenda do colaborador (conflito de datas): confirmados
 * + legados de confirmação. Fora: cancelado, sugestao_* e as vagas só
 * "salvas" (planejado/reaberto/escalacao) — nelas ninguém está fechado.
 * Array (não Set) porque o cliente faz `.includes(status)`.
 */
export const ACTIVE_CONFLICT_STATUSES: readonly string[] =
  Array.from(CONFIRMED_STATUSES).concat(STATUS_LEGADOS_DE_CONFIRMACAO);

/** Confirmada, contando os legados. */
export function ehStatusConfirmado(status: string | null | undefined): boolean {
  return !!status && ACTIVE_CONFLICT_STATUSES.includes(status);
}

/** Já existe compra (passagem e/ou hospedagem) — reconfirmar apagaria isso. */
export function temLogisticaComprada(status: string | null | undefined): boolean {
  return status === "passagem_comprada"
    || status === "hospedagem_comprada"
    || status === "hospedagem_passagem_comprada";
}

/** Vaga na etapa de Validação de Escala — aceita o status OU a fase. */
export function ehSugestao(statusOuFase: string | null | undefined): boolean {
  if (!statusOuFase) return false;
  return statusOuFase === SUGESTAO_PHASE
    || (SUGESTAO_STATUS_VALUES as readonly string[]).includes(statusOuFase);
}

// ---------------------------------------------------------------------------
// Regras de mudança
// ---------------------------------------------------------------------------

export type ResultadoDaRegra = { ok: true } | { ok: false; motivo: string };

/** Estados de ORIGEM válidos para POST /api/team-inclusions/:id/confirm. */
export const STATUS_QUE_PODEM_CONFIRMAR: readonly string[] = [
  "planejado",
  "reaberto",
  "escalacao",
  // Legados equivalentes a "vaga só salva" — a rota precisa continuar
  // confirmando linhas antigas.
  "pendente",
  "incluido",
];

/**
 * Pode confirmar a escalação a partir deste status?
 *
 * Nunca a partir de `cancelado` (reativa primeiro) nem de qualquer status já
 * confirmado: confirmar de novo regrava `escalado` por cima de
 * `passagem_comprada`/`hospedagem_*` e a compra some da tela — foi o incidente
 * corrigido à mão pelo fix-production-status.sql. Trocar a pessoa numa vaga
 * confirmada é papel da Solicitação de Troca, não do Confirmar.
 * `sugestao_*` (inclusive `sugestao_aprovada`, que hoje é só compatibilidade:
 * a aprovação já vira `inclusao/planejado`) fica com a tela de Validação.
 */
export function podeConfirmar(statusAtual: string | null | undefined): ResultadoDaRegra {
  const status = statusAtual ?? "";
  if (status === "cancelado") {
    return { ok: false, motivo: "Escalação cancelada — reative para confirmar." };
  }
  if (ehStatusConfirmado(status)) {
    return {
      ok: false,
      motivo: temLogisticaComprada(status)
        ? `Esta escalação já tem compra registrada (${rotuloDoStatus(status)}). Confirmar de novo apagaria o andamento da passagem/hospedagem — para trocar o colaborador use a Solicitação de Troca.`
        : `Esta escalação já está confirmada (${rotuloDoStatus(status)}). Para trocar o colaborador use a Solicitação de Troca.`,
    };
  }
  if (ehSugestao(status)) {
    return { ok: false, motivo: "Esta vaga está em Validação de Escala — use a tela de Validação para alterá-la." };
  }
  if (STATUS_QUE_PODEM_CONFIRMAR.includes(status)) return { ok: true };
  return { ok: false, motivo: `Status "${status || "—"}" desconhecido — não é possível confirmar esta escalação.` };
}

/**
 * Destinos da etapa de sugestão DERIVADOS da máquina de scaling-validation-
 * rules.ts (nextSuggestionState): roda todas as ações a partir do status e
 * guarda onde cada uma chega. Assim a tabela abaixo nunca diverge da regra.
 */
function destinosDaSugestao(status: SugestaoStatus): readonly StatusDaVaga[] {
  const destinos = new Set<StatusDaVaga>();
  for (const acao of SUGGESTION_ACTIONS) {
    for (const requestType of [undefined, "exclusao"] as const) {
      try {
        const proximo = nextSuggestionState({ status, phase: SUGESTAO_PHASE }, acao, { requestType });
        destinos.add(proximo.status as StatusDaVaga);
      } catch {
        // ação inválida neste status: não é destino
      }
    }
  }
  return Array.from(destinos);
}

/**
 * Transições permitidas (de → para), modeladas do fluxo REAL das rotas:
 *
 * - planejado / reaberto / escalacao (vaga só salva) → Confirmar leva a
 *   `aguardando_producao` (cenotécnica), `escalado` (tem logística) ou
 *   `aprovado` (sem passagem nem hospedagem) — nextStatusOnConfirm; ou cancela.
 * - aguardando_producao → gestor aprova (`escalado` / `aprovado`), reprova
 *   (`escalacao`: colaborador sai, vaga volta a aberta) ou cancela.
 * - escalado → Compras registra passagem/hospedagem (`*_comprada`), aprova,
 *   cancela, ou a gestão reabre (`reaberto`).
 * - passagem / hospedagem / aprovacao (etapas intermediárias) → a compra
 *   correspondente, aprovação, cancelamento ou reabertura.
 * - passagem_comprada / hospedagem_comprada → completa a outra compra
 *   (`hospedagem_passagem_comprada`), aprova ou cancela. NUNCA volta a
 *   `escalado`: é a regressão do incidente.
 * - hospedagem_passagem_comprada → aprovado, concluído ou cancelado.
 * - aprovado → concluído, cancelado ou reaberto.
 * - concluido → só reabertura administrativa ou cancelamento.
 * - cancelado → SÓ `reaberto` (reativar). Nunca `pendente` — legado.
 * - sugestao_* → derivadas de nextSuggestionState (ver acima);
 *   `sugestao_aprovada` (compatibilidade) só pode virar `planejado`.
 */
export const TRANSICOES: Record<StatusDaVaga, readonly StatusDaVaga[]> = {
  planejado: ["aguardando_producao", "escalado", "aprovado", "cancelado"],
  reaberto: ["aguardando_producao", "escalado", "aprovado", "cancelado"],
  escalacao: ["aguardando_producao", "escalado", "aprovado", "cancelado"],
  aguardando_producao: ["escalado", "aprovado", "escalacao", "cancelado"],
  escalado: ["passagem_comprada", "hospedagem_comprada", "hospedagem_passagem_comprada", "aprovado", "cancelado", "reaberto"],
  passagem: ["passagem_comprada", "hospedagem_passagem_comprada", "aprovado", "cancelado", "reaberto"],
  hospedagem: ["hospedagem_comprada", "hospedagem_passagem_comprada", "aprovado", "cancelado", "reaberto"],
  passagem_comprada: ["hospedagem_passagem_comprada", "aprovado", "cancelado"],
  hospedagem_comprada: ["hospedagem_passagem_comprada", "aprovado", "cancelado"],
  hospedagem_passagem_comprada: ["aprovado", "concluido", "cancelado"],
  aprovacao: ["aprovado", "cancelado", "reaberto"],
  aprovado: ["concluido", "cancelado", "reaberto"],
  concluido: ["reaberto", "cancelado"],
  cancelado: ["reaberto"],
  sugestao_pendente: destinosDaSugestao(SUGESTAO_STATUS.PENDENTE),
  sugestao_validada: destinosDaSugestao(SUGESTAO_STATUS.VALIDADA),
  sugestao_ajuste: destinosDaSugestao(SUGESTAO_STATUS.AJUSTE),
  sugestao_aprovada: ["planejado"],
  sugestao_negada: destinosDaSugestao(SUGESTAO_STATUS.NEGADA),
};

/**
 * A transição de → para é permitida? Mesmo status = ok (gravação idempotente).
 * Legado na origem usa o equivalente canônico (`pendente` → `planejado`…);
 * legado no DESTINO é sempre recusado — nunca se grava legado.
 */
export function podeTransitar(de: string | null | undefined, para: string | null | undefined): ResultadoDaRegra {
  const origem = normalizarStatus(de);
  if (!origem) {
    return { ok: false, motivo: `Status atual "${de || "—"}" desconhecido — corrija o registro antes de mudar o status.` };
  }
  if (!ehStatusCanonico(para)) {
    return { ok: false, motivo: `Status "${para || "—"}" não existe${ehStatusLegado(para) ? " mais (legado)" : ""} — não pode ser gravado.` };
  }
  if (origem === para) return { ok: true };
  if (TRANSICOES[origem].includes(para)) return { ok: true };
  if (origem === "cancelado") {
    return { ok: false, motivo: "Escalação cancelada — reative (Reaberto) antes de mudar o status." };
  }
  if (temLogisticaComprada(origem) && (para === "escalado" || para === "aguardando_producao")) {
    return { ok: false, motivo: `"${rotuloDoStatus(origem)}" não pode voltar para "${rotuloDoStatus(para)}": a compra registrada sumiria da tela.` };
  }
  return { ok: false, motivo: `Transição inválida: "${rotuloDoStatus(origem)}" → "${rotuloDoStatus(para)}".` };
}

// ---------------------------------------------------------------------------
// Fase e rótulo
// ---------------------------------------------------------------------------

const FASE_DO_STATUS: Record<StatusDaVaga, FaseDaVaga> = {
  planejado: "inclusao",
  reaberto: "inclusao",
  escalacao: "escalacao",
  aguardando_producao: "escalacao",
  escalado: "escalacao",
  passagem: "passagem",
  passagem_comprada: "passagem",
  hospedagem: "hospedagem",
  hospedagem_comprada: "hospedagem",
  // Mesmo par que o fix-production-status.sql grava.
  hospedagem_passagem_comprada: "hospedagem",
  aprovacao: "aprovacao",
  aprovado: "aprovado",
  concluido: "aprovado",
  cancelado: "cancelado",
  sugestao_pendente: "sugestao",
  sugestao_validada: "sugestao",
  sugestao_ajuste: "sugestao",
  sugestao_aprovada: "sugestao",
  sugestao_negada: "sugestao",
};

/**
 * Fase coerente com o status, para o servidor gravar o par (status, phase)
 * sempre junto. `null` para status fora do domínio (não adivinha).
 */
export function faseParaStatus(status: string | null | undefined): FaseDaVaga | null {
  const canonico = normalizarStatus(status);
  return canonico ? FASE_DO_STATUS[canonico] : null;
}

/**
 * Rótulo pt-BR único (une storage.ts, status-badge.tsx e scaling-status.ts).
 * `escalacao` é a vaga SEM ninguém (reprovada pelo gestor, ou reaberta pela
 * troca): "Vaga aberta", não "Escalado" — o texto diz o que falta fazer.
 */
export const ROTULO_DO_STATUS: Record<StatusDaVaga | StatusLegado, string> = {
  planejado: "Aguardando escalação",
  reaberto: "Reaberto",
  escalacao: "Vaga aberta",
  aguardando_producao: "Aguardando gestor",
  escalado: "Escalado",
  passagem: "Aguardando passagem",
  passagem_comprada: "Passagem comprada",
  hospedagem: "Aguardando hospedagem",
  hospedagem_comprada: "Hospedagem comprada",
  hospedagem_passagem_comprada: "Hospedagem e passagem compradas",
  aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  sugestao_pendente: SUGESTAO_STATUS_LABELS.sugestao_pendente,
  sugestao_validada: SUGESTAO_STATUS_LABELS.sugestao_validada,
  sugestao_ajuste: SUGESTAO_STATUS_LABELS.sugestao_ajuste,
  sugestao_aprovada: SUGESTAO_STATUS_LABELS.sugestao_aprovada,
  sugestao_negada: SUGESTAO_STATUS_LABELS.sugestao_negada,
  // Legados (só leitura)
  incluido: "Aguardando escalação",
  pendente: "Aguardando escalação",
  aguardando_passagem: "Aguardando passagem",
  aguardando_hospedagem: "Aguardando hospedagem",
  confirmado: "Confirmado",
};

/** Rótulo do status; valor fora do domínio volta como veio (nunca esconde lixo). */
export function rotuloDoStatus(status: string | null | undefined): string {
  if (!status) return "—";
  return (ROTULO_DO_STATUS as Record<string, string>)[status] ?? status;
}
