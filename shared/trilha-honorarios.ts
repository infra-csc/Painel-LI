/**
 * Trilha ÚNICA do honorário — Módulo de Honorários, Fase 0 (26/10).
 *
 * Slide 8 da reunião de 21/10: "cada registro = uma pessoa num evento", com o
 * caminho normal
 *   Previsto → Pré-aprovado → Em evento → Confirmado → Validado →
 *   OC emitida → NF enviada → NF lançada no M4 → Pago
 * e os desvios (devolvido volta para quem corrige · recusado encerra · não
 * participou zera · não emite NF pula a nota). Até aqui cada tela tinha a
 * sua trilha (Realizado 4 passos, Comparativo 5, Controle 6, Notas 3).
 *
 * Esta é a régua de todas. O que o app ainda NÃO faz fica marcado como
 * indisponível ("em breve"), sem fingir que funciona: a OC emitida pelo DP
 * (hoje o número da OC chega junto com a nota) e o pagamento (hoje fora do
 * app). Mapeamento dos dados de hoje para cada etapa (o que conta como feito):
 *
 *  - Previsto: a vaga escalada (ou a linha do Planejado) existe;
 *  - Pré-aprovado: `budget_planned.status` pré-aprovado — OU já existe a
 *    prestação (o que foi enviado antes da pré-aprovação existir passou por
 *    ela de fato: não volta atrás);
 *  - Em evento: a prestação existe (o Planejado foi liberado para a Produção);
 *  - Confirmado: a prestação foi enviada para análise (ou já decidida);
 *  - Validado: o DP aprovou a prestação (Comparativo);
 *  - OC emitida: indisponível (Fase 1);
 *  - NF enviada: nota enviada (ou já aprovada);
 *  - NF lançada no M4: nota aprovada E lançada (o "check-in financeiro" de
 *    hoje — no slide 11, "check-in" fica só para a arena);
 *  - Pago: indisponível (Fase 1).
 *
 * Funções puras — servidor (Painel de honorários) e tela (componente comum).
 */
import { estaPreAprovado } from "./pre-aprovacao";

export type EtapaDaTrilha =
  | "previsto" | "pre_aprovado" | "em_evento" | "confirmado" | "validado"
  | "oc_emitida" | "nf_enviada" | "nf_lancada" | "pago";

export interface DefinicaoDaEtapa {
  id: EtapaDaTrilha;
  rotulo: string;
  /** O que acontece na etapa (dica). */
  descricao: string;
  /** Quem executa (cor da faixa no slide 4). */
  quem: "DP" | "Produção" | "Colaborador" | "M4";
  /** O app já registra esta etapa? Falso = "em breve", nunca conta como feita. */
  disponivel: boolean;
  /** Onde a etapa acontece hoje no app (dica). */
  ondeHoje?: string;
  /** Etapa da nota fiscal (pulada quando o colaborador não emite NF). */
  daNota?: boolean;
}

export const ETAPAS_DA_TRILHA: readonly DefinicaoDaEtapa[] = [
  { id: "previsto", rotulo: "Previsto", descricao: "Valor calculado a partir da escalação", quem: "DP", disponivel: true, ondeHoje: "Escalação e Pré-aprovação de valores" },
  { id: "pre_aprovado", rotulo: "Pré-aprovado", descricao: "O DP revisou e pré-aprovou o valor antes do evento", quem: "DP", disponivel: true, ondeHoje: "Pré-aprovação de valores" },
  { id: "em_evento", rotulo: "Em evento", descricao: "Liberado para a Produção: a prestação está com o responsável da função", quem: "Produção", disponivel: true, ondeHoje: "Realizado" },
  { id: "confirmado", rotulo: "Confirmado", descricao: "Dias e valores confirmados e enviados para a conferência do DP", quem: "Produção", disponivel: true, ondeHoje: "Realizado" },
  { id: "validado", rotulo: "Validado", descricao: "O DP conferiu o planejado × o realizado e aprovou", quem: "DP", disponivel: true, ondeHoje: "Conferência DP" },
  { id: "oc_emitida", rotulo: "OC emitida", descricao: "Ordem de compra gerada no M4 pelo DP — chega na Fase 1", quem: "DP", disponivel: false },
  { id: "nf_enviada", rotulo: "NF enviada", descricao: "Nota fiscal anexada com o nº da OC", quem: "Colaborador", disponivel: true, ondeHoje: "Notas fiscais › Lançamento", daNota: true },
  { id: "nf_lancada", rotulo: "NF lançada no M4", descricao: "O DP validou a nota e deu entrada no M4 (hoje: o check-in financeiro da nota)", quem: "DP", disponivel: true, ondeHoje: "Notas fiscais › Aprovação DP", daNota: true },
  { id: "pago", rotulo: "Pago", descricao: "Pagamento programado e liquidado no M4 — chega na Fase 1", quem: "M4", disponivel: false, daNota: true },
];

const INDICE = new Map(ETAPAS_DA_TRILHA.map((e, i) => [e.id, i]));
export const indiceDaEtapa = (id: EtapaDaTrilha): number => INDICE.get(id) ?? 0;
export const definicaoDaEtapa = (id: EtapaDaTrilha): DefinicaoDaEtapa => ETAPAS_DA_TRILHA[indiceDaEtapa(id)];

/** Desvios do caminho normal (slide 8) + o "concluído fora do fluxo" do legado. */
export type DesvioDaTrilha = "devolvido" | "recusado" | "nao_participou" | "concluido_fora_do_fluxo";

export const ROTULO_DO_DESVIO: Record<DesvioDaTrilha, string> = {
  devolvido: "Devolvido",
  recusado: "Recusado",
  nao_participou: "Não participou",
  concluido_fora_do_fluxo: "Concluído fora do fluxo",
};

/** Como cada etapa aparece para UM registro. */
export type EstadoDaEtapa = "feita" | "atual" | "futura" | "em_breve" | "nao_se_aplica";

export interface EntradaDaTrilha {
  planejado?: { status?: string | null; didNotAttend?: boolean | null } | null;
  realizado?: { sentForReview?: boolean | null; rhStatus?: string | null; didNotAttend?: boolean | null } | null;
  nota?: { status?: string | null; checkinAt?: Date | string | null } | null;
  /** O colaborador emite NF nesta escalação (padrão: sim). */
  emiteNf?: boolean;
  /** Linha do legado concluída fora do fluxo ("Concluir em lote"). */
  concluidoForaDoFluxo?: boolean;
}

export interface PosicaoNaTrilha {
  /** Onde o registro ESTÁ: a última etapa do caminho com todas as anteriores feitas. */
  etapa: EtapaDaTrilha;
  /** A próxima etapa que o registro espera (null: terminou ou saiu do caminho). */
  proxima: EtapaDaTrilha | null;
  desvio: DesvioDaTrilha | null;
  /** Não emite NF: as etapas da nota não se aplicam. */
  naoEmiteNf: boolean;
  estados: Record<EtapaDaTrilha, EstadoDaEtapa>;
  /** Texto curto do que falta ("Aguardando a conferência do DP"). */
  aguardando: string;
}

const AGUARDANDO: Record<EtapaDaTrilha, string> = {
  previsto: "Aguardando o cálculo",
  pre_aprovado: "Aguardando a pré-aprovação do DP",
  em_evento: "Pré-aprovado — falta liberar para a Produção (enviar ao Realizado)",
  confirmado: "Aguardando a prestação do responsável da função",
  validado: "Aguardando a conferência do DP",
  oc_emitida: "Aguardando a OC",
  nf_enviada: "Aguardando o envio da nota fiscal",
  nf_lancada: "Aguardando a validação e o lançamento da NF no M4",
  pago: "NF lançada no M4 — o pagamento ainda é acompanhado fora do app",
};

/** Posição de UM registro (uma pessoa num evento) na trilha. */
export function posicaoNaTrilha(e: EntradaDaTrilha): PosicaoNaTrilha {
  const r = e.realizado ?? null;
  const n = e.nota ?? null;
  const emiteNf = e.emiteNf !== false;
  const rh = r?.rhStatus || "pendente";
  const nf = n?.status || "pendente";

  const feitas = new Set<EtapaDaTrilha>(["previsto"]);
  if (estaPreAprovado(e.planejado?.status) || r) feitas.add("pre_aprovado");
  if (r) feitas.add("em_evento");
  if (r && ((r.sentForReview && rh !== "devolvido") || rh === "aprovado" || rh === "rejeitado")) feitas.add("confirmado");
  if (rh === "aprovado") feitas.add("validado");
  if (emiteNf && (nf === "enviada" || nf === "aprovada" || !!n?.checkinAt)) feitas.add("nf_enviada");
  if (emiteNf && nf === "aprovada" && !!n?.checkinAt) feitas.add("nf_lancada");

  // Onde está: avança pelo caminho enquanto as etapas disponíveis estiverem feitas.
  let etapa: EtapaDaTrilha = "previsto";
  let proxima: EtapaDaTrilha | null = null;
  for (const def of ETAPAS_DA_TRILHA) {
    if (!def.disponivel) continue;
    if (def.daNota && !emiteNf) continue;
    if (feitas.has(def.id)) { etapa = def.id; continue; }
    proxima = def.id;
    break;
  }

  let desvio: DesvioDaTrilha | null = null;
  if (e.planejado?.didNotAttend || r?.didNotAttend) desvio = "nao_participou";
  else if (e.concluidoForaDoFluxo) desvio = "concluido_fora_do_fluxo";
  else if (rh === "rejeitado" || (emiteNf && nf === "recusada")) desvio = "recusado";
  else if (rh === "devolvido" || (emiteNf && nf === "devolvida")) desvio = "devolvido";

  // Recusado, não participou e concluído fora do fluxo encerram: nada mais é esperado.
  const encerrado = desvio === "recusado" || desvio === "nao_participou" || desvio === "concluido_fora_do_fluxo";
  const esperada = encerrado ? null : proxima;

  const estados = {} as Record<EtapaDaTrilha, EstadoDaEtapa>;
  for (const def of ETAPAS_DA_TRILHA) {
    if (!def.disponivel) estados[def.id] = "em_breve";
    else if (def.daNota && !emiteNf) estados[def.id] = "nao_se_aplica";
    else if (feitas.has(def.id)) estados[def.id] = "feita";
    else if (def.id === proxima) estados[def.id] = "atual";
    else estados[def.id] = "futura";
  }

  let aguardando: string;
  if (desvio === "nao_participou") aguardando = "Não participou — o valor foi zerado";
  else if (desvio === "concluido_fora_do_fluxo") aguardando = "Concluído fora do fluxo (legado)";
  else if (desvio === "recusado") aguardando = nf === "recusada" && rh !== "rejeitado" ? "Nota fiscal recusada — encerrado" : "Prestação recusada pelo DP — encerrado";
  else if (desvio === "devolvido") aguardando = rh === "devolvido" ? "Devolvido ao responsável da função para correção" : "Nota devolvida ao colaborador para correção";
  else if (!esperada) aguardando = emiteNf ? AGUARDANDO.pago : "Validado — não emite NF";
  else if (esperada === "nf_lancada" && nf === "aprovada") aguardando = "NF aprovada — falta o lançamento no M4";
  else aguardando = AGUARDANDO[esperada];

  return { etapa, proxima: esperada, desvio, naoEmiteNf: !emiteNf, estados, aguardando };
}

/** Quantos registros ESTÃO em cada etapa (e em cada desvio) — a trilha do evento. */
export interface ContagemDaTrilha {
  porEtapa: Record<EtapaDaTrilha, number>;
  porDesvio: Record<DesvioDaTrilha, number>;
  total: number;
}

export function contagemVazia(): ContagemDaTrilha {
  return {
    porEtapa: Object.fromEntries(ETAPAS_DA_TRILHA.map((e) => [e.id, 0])) as Record<EtapaDaTrilha, number>,
    porDesvio: { devolvido: 0, recusado: 0, nao_participou: 0, concluido_fora_do_fluxo: 0 },
    total: 0,
  };
}

export function contarNaTrilha(posicoes: readonly Pick<PosicaoNaTrilha, "etapa" | "desvio">[]): ContagemDaTrilha {
  const c = contagemVazia();
  for (const p of posicoes) {
    c.total += 1;
    c.porEtapa[p.etapa] += 1;
    if (p.desvio) c.porDesvio[p.desvio] += 1;
  }
  return c;
}
