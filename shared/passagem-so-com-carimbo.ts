/**
 * Passagem que é SÓ O CARIMBO de emissão (22/10).
 *
 * "Marcar como emitida" numa vaga sem passagem cria uma linha de passagem só
 * com o carimbo (`emittedAt`/`emittedBy`) — POST /api/tickets/emitidas. Se
 * quem clicou desfaz e ninguém preencheu nada nessa linha, ela não é uma
 * passagem: é o rastro do clique. O desfazer apaga a linha (e a vaga volta
 * para "Comprar"); passagem com qualquer dado só perde o carimbo.
 *
 * A regra olha as colunas ao contrário de propósito: lista o que NÃO é dado
 * (identidade, carimbo e contabilidade da linha) e trata todo o resto como
 * dado. Coluna nova em `tickets` conta como dado até alguém dizer o contrário
 * — o erro possível é deixar uma linha vazia, nunca apagar uma preenchida.
 * O teste confere a lista contra o schema.
 *
 * Fora da lista (contam como dado): tipo, datas, horários, cidades,
 * aeroportos, valor, LOC, OC, arquivo e anexos, cartão, observações,
 * companhia, situação (`ticketStatus` — o carimbo não grava situação; se está
 * preenchida, alguém escolheu), bagagem, trecho direto, justificativa do
 * preço, conferência e as colunas de histórico de troca (`archived*`: linha de
 * histórico nunca se apaga).
 */
import type { Ticket } from "./schema";

/** Colunas que o próprio "emitir" grava ou que a linha tem por existir — não são dado da passagem. */
export const CAMPOS_QUE_NAO_SAO_DADO = [
  "id",
  "teamInclusionId",
  "emittedAt",
  "emittedBy",
  "createdAt",
  "updatedAt",
  "updatedBy",
] as const;

const NAO_E_DADO: ReadonlySet<string> = new Set(CAMPOS_QUE_NAO_SAO_DADO);

/** Valor vazio: ausente, texto em branco ou lista sem itens. Número (até 0) e booleano contam. */
function vazio(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * A passagem é só o carimbo de emissão? Precisa estar carimbada e não ter
 * nenhum campo de dado preenchido.
 */
export function passagemSoComCarimbo(t: Partial<Ticket> | null | undefined): boolean {
  if (!t || !t.emittedAt) return false;
  for (const [campo, valor] of Object.entries(t)) {
    if (NAO_E_DADO.has(campo)) continue;
    if (!vazio(valor)) return false;
  }
  return true;
}
