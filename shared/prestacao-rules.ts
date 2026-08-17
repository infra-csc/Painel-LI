/**
 * Regras do fluxo de prestação de contas e nota fiscal.
 *
 * Fonte única para client e servidor. Antes cada tela reimplementava a
 * elegibilidade da NF (as cópias já tinham divergido: o Controle RH contava
 * itens que a tela de Notas Fiscais não mostrava) e o servidor não validava
 * transição nenhuma.
 *
 * Funções puras — sem acesso a banco, sem I/O.
 */

export type RhStatus = "pendente" | "aprovado" | "rejeitado" | "devolvido";
export type InvoiceStatus = "pendente" | "enviada" | "aprovada" | "devolvida" | "recusada";

/** O que estas regras precisam saber de uma prestação (Realizado). */
export interface PrestacaoLike {
  sentForReview?: boolean | null;
  rhStatus?: string | null;
  splitParentId?: string | null;
  didNotAttend?: boolean | null;
}

/** O que estas regras precisam saber de uma nota fiscal. */
export interface NotaLike {
  status?: string | null;
  checkinAt?: Date | string | null;
}

/** O que estas regras precisam saber de uma inclusão de escalação. */
export interface EscalacaoLike {
  collaboratorId?: string | null;
  functionId?: string | null;
  eventId?: string | null;
  emitsNf?: boolean | null;
  deletedAt?: Date | string | null;
}

/** Resultado de uma verificação de transição: ok, ou o motivo da recusa. */
export type Permissao = { ok: true } | { ok: false; motivo: string };

const ok: Permissao = { ok: true };
const nao = (motivo: string): Permissao => ({ ok: false, motivo });

/**
 * A NF é liberada com o ENVIO do Realizado — não espera a análise do
 * comparativo pelo RH (decisão de negócio de 13/08/2026). Devolvido e
 * rejeitado pausam a nota até o reenvio.
 */
export function isNfEligible(p: PrestacaoLike | null | undefined): boolean {
  if (!p) return false;
  if (p.rhStatus === "aprovado") return true;
  return Boolean(p.sentForReview) && p.rhStatus === "pendente";
}

/**
 * Isenção de NF definida na escalação: se o escalado (colaborador+função no
 * evento) está marcado com `emitsNf === false`, nenhuma nota é cobrada dele.
 *
 * Sem match de colaborador na escalação, ou sem match exato de função, assume
 * que emite (cobra NF). Inclusões deletadas e de outros eventos são ignoradas.
 * Antes cada tela reimplementava esta regra e as cópias divergiram (uma não
 * filtrava deletedAt nem eventId).
 *
 * Retorna true quando o colaborador está ISENTO (não emite NF).
 */
export function nfIsentaPorEscalacao(
  inclusions: readonly EscalacaoLike[] | null | undefined,
  collaboratorId: string | null | undefined,
  functionId: string | null | undefined,
  eventId: string | null | undefined,
): boolean {
  if (!inclusions || !collaboratorId) return false;
  const matches = inclusions.filter(ti =>
    !ti.deletedAt &&
    ti.collaboratorId &&
    ti.collaboratorId === collaboratorId &&
    ti.eventId === eventId
  );
  if (matches.length === 0) return false;
  const byFunction = matches.find(ti => ti.functionId === functionId);
  if (!byFunction) return false;
  return byFunction.emitsNf === false;
}

/** Itens que entram nos totais do evento (filhos de divisão não duplicam). */
export function contaNosTotais(p: PrestacaoLike | null | undefined): boolean {
  if (!p) return false;
  return !p.splitParentId && !p.didNotAttend;
}

/** O RH só decide o que está de fato em análise. */
export function podeDecidirPrestacao(p: PrestacaoLike | null | undefined): Permissao {
  if (!p) return nao("Prestação não encontrada.");
  if (!p.sentForReview) return nao("Esta prestação ainda não foi enviada para análise.");
  if (p.rhStatus !== "pendente") return nao("Esta prestação já foi analisada.");
  return ok;
}

/** Reenvio: aprovado é terminal; o resto pode voltar para análise. */
export function podeEnviarParaRevisao(p: PrestacaoLike | null | undefined): boolean {
  if (!p) return false;
  if (p.rhStatus === "aprovado") return false;
  return !p.sentForReview || p.rhStatus === "devolvido" || p.rhStatus === "rejeitado";
}

/** Item em análise ou aprovado é imutável para quem não é RH/admin. */
export function prestacaoEstaTravada(p: PrestacaoLike | null | undefined): boolean {
  if (!p) return false;
  return p.rhStatus === "aprovado" || (Boolean(p.sentForReview) && p.rhStatus === "pendente");
}

/**
 * Aprovar a NF exige nota enviada e Realizado íntegro: se o RH devolveu ou
 * recusou a prestação depois do envio da nota, o valor de referência muda —
 * aprovar ali pagaria contra um valor desatualizado.
 */
export function podeAprovarNota(
  nota: NotaLike | null | undefined,
  prestacao?: PrestacaoLike | null,
): Permissao {
  if (!nota) return nao("Nota fiscal não encontrada.");
  if (nota.status !== "enviada") return nao("Só é possível aprovar uma nota com status 'enviada'.");
  if (prestacao && (prestacao.rhStatus === "devolvido" || prestacao.rhStatus === "rejeitado")) {
    return nao("O Realizado deste item foi devolvido/recusado — aguarde o reenvio antes de aprovar a NF.");
  }
  return ok;
}

/** Devolver e recusar seguem a mesma porta de entrada da aprovação. */
export function podeDevolverNota(nota: NotaLike | null | undefined): Permissao {
  if (!nota) return nao("Nota fiscal não encontrada.");
  if (nota.status !== "enviada") return nao("Só é possível devolver uma nota com status 'enviada'.");
  return ok;
}

/** Check-in financeiro: só depois de aprovada, uma única vez e com data. */
export function podeFazerCheckin(
  nota: NotaLike | null | undefined,
  paymentDate?: string | null,
): Permissao {
  if (!nota) return nao("Nota fiscal não encontrada.");
  if (nota.status !== "aprovada") return nao("Check-in só é possível em nota já aprovada.");
  if (nota.checkinAt) return nao("Esta nota já teve check-in.");
  if (!paymentDate) return nao("Informe a data de pagamento para o check-in.");
  return ok;
}
