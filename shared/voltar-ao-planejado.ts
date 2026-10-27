/**
 * "Voltar ao Planejado" — pedido do DP (27/10), regra de 28/10.
 *
 * "Precisa deixar voltar para o Planejado para qualquer ajuste. Ex.: NR São
 * Luís (Lucas) não teria mobilidade, enviei para o Realizado e não consigo
 * excluir a mobilidade calculada errado."
 *
 * O DP (ou o administrador) tira a prestação do Realizado — com as divisões
 * dela — e a linha do Planejado volta a pedir a pré-aprovação (fluxo novo) ou
 * a "não enviada" (evento legado: a linha fica pendente e o fluxo antigo a
 * deixa reenviar sem pré-aprovação). Motivo obrigatório; tudo auditado com a
 * cópia do que saiu.
 *
 * Só ANTES do pagamento começar: com OC registrada ou nota fiscal (na
 * prestação ou em qualquer divisão) não volta — aí o caminho é desfazer a OC
 * / tratar a NF primeiro. Lançamento direto no Realizado (sem Planejado) e
 * divisão (filha) não voltam: não há linha do Planejado a devolver / a ação é
 * da prestação principal.
 *
 * Funções puras — usadas pelo servidor (a trava de verdade) e pela tela (o
 * botão já diz por que não dá).
 */

export const MOTIVO_DO_VOLTAR_MIN = 5;
export const MOTIVO_DO_VOLTAR_MAX = 1000;

export interface PrestacaoQueVolta {
  plannedId?: string | null;
  splitParentId?: string | null;
  ocNumero?: string | null;
  ocRegistradaEm?: Date | string | null;
  pagoEm?: string | null;
}

export type PermissaoDoVoltar = { ok: true } | { ok: false; motivo: string; codigo: string };

/**
 * A prestação (com as divisões dela) pode voltar ao Planejado?
 * `temNotaFiscal`: há NF vinculada à prestação ou a alguma divisão.
 */
export function podeVoltarAoPlanejado(
  prestacao: PrestacaoQueVolta | null | undefined,
  divisoes: readonly PrestacaoQueVolta[] = [],
  temNotaFiscal = false,
): PermissaoDoVoltar {
  if (!prestacao) return { ok: false, motivo: "Prestação não encontrada.", codigo: "nao_encontrada" };
  if (prestacao.splitParentId) {
    return { ok: false, motivo: "Esta é uma divisão da vaga — use \"Voltar ao Planejado\" na prestação principal (as divisões voltam junto).", codigo: "divisao" };
  }
  if (!prestacao.plannedId) {
    return { ok: false, motivo: "Lançada direto no Realizado — não há linha do Planejado para onde voltar.", codigo: "sem_planejado" };
  }
  const todas = [prestacao, ...divisoes];
  if (todas.some((p) => !!p.ocNumero || !!p.ocRegistradaEm || !!p.pagoEm)) {
    return { ok: false, motivo: "Já tem OC registrada — desfaça a OC antes de voltar ao Planejado.", codigo: "com_oc" };
  }
  if (temNotaFiscal) {
    return { ok: false, motivo: "Já tem nota fiscal — trate/exclua a NF antes de voltar ao Planejado.", codigo: "com_nf" };
  }
  return { ok: true };
}

/** Motivo válido (aparado, entre o mínimo e o máximo)? Devolve o texto limpo ou null. */
export function motivoDoVoltarValido(motivo: unknown): string | null {
  if (typeof motivo !== "string") return null;
  const t = motivo.trim();
  return t.length >= MOTIVO_DO_VOLTAR_MIN && t.length <= MOTIVO_DO_VOLTAR_MAX ? t : null;
}
