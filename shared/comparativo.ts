/**
 * Regras do COMPARATIVO (Planejado × Realizado) — 08/10.
 *
 * Funções puras, usadas pela tela (use-budget-comparison-data, comparison-*),
 * pelo cálculo gravado no servidor (POST /api/budget-comparison/calculate) e
 * pelos testes. Antes cada lugar tinha a sua cópia e elas divergiram: o
 * Comparativo só olhava o "não participou" do PLANEJADO, e quem era marcado
 * só no Realizado aparecia com realizado R$ 0, uma "economia" negativa e o
 * planejado entrando no total.
 */
import { isNfEligible } from "./prestacao-rules";

/** O que basta para saber se a pessoa participou. */
export interface MarcaDeParticipacao {
  didNotAttend?: boolean | null;
}

/**
 * "Não participou": marcado no Realizado OU no Planejado de referência — o
 * MESMO critério do Realizado (`isDidNotAttend` em use-budget-actual-data) e
 * do Flash (`isFlashCreditableActual` + `plannedSaysNotAttended`).
 */
export function naoParticipou(
  realizado: MarcaDeParticipacao | null | undefined,
  planejado: MarcaDeParticipacao | null | undefined,
): boolean {
  return !!realizado?.didNotAttend || !!planejado?.didNotAttend;
}

export interface ItemDoGrupoNoComparativo extends MarcaDeParticipacao {
  totalValue: number | null;
}

export interface TotaisDoGrupoNoComparativo {
  /** O titular da linha (pai ou avulso) não participou. */
  naoParticipou: boolean;
  /** Realizado do grupo: pai + filhos da divisão, sem quem não participou. */
  realizado: number;
  /** Planejado que entra nos totais (0 quando o titular não participou). */
  planejado: number;
  /** Realizado − planejado da linha (0 quando o titular não participou). */
  variacao: number;
}

/**
 * Números de uma linha do comparativo (pai ou avulso + filhos da divisão).
 *
 * Mesmas somas do Realizado: cada prestação conta se participou (o filho de
 * divisão herda o `plannedId` do pai, então o planejado é o do grupo); o
 * planejado entra uma vez, pelo titular, e só se ele participou.
 */
export function totaisDoGrupoNoComparativo(
  pai: ItemDoGrupoNoComparativo,
  filhos: readonly ItemDoGrupoNoComparativo[],
  planejado: (MarcaDeParticipacao & { totalValue: number | null }) | null | undefined,
): TotaisDoGrupoNoComparativo {
  const titularAusente = naoParticipou(pai, planejado);
  const realizado = [pai, ...filhos]
    .filter(item => !naoParticipou(item, planejado))
    .reduce((s, item) => s + (item.totalValue || 0), 0);
  if (titularAusente) return { naoParticipou: true, realizado, planejado: 0, variacao: 0 };
  const plano = planejado ? (planejado.totalValue || 0) : 0;
  return { naoParticipou: false, realizado, planejado: plano, variacao: planejado ? realizado - plano : realizado };
}

/**
 * Ida e volta da mobilidade para exibir. Sem a divisão gravada (nulo) — ou
 * gravada como 0 + 0 com mobilidade maior que zero, que é o mesmo "vazio" —
 * a ida leva a metade arredondada para cima e a volta o resto.
 */
export function idaEVoltaDaMobilidade(
  mobilidade: number | null | undefined,
  ida: number | null | undefined,
  volta: number | null | undefined,
): { ida: number; volta: number } {
  const total = mobilidade || 0;
  const semDivisao = (ida == null && volta == null) || (total > 0 && !ida && !volta);
  if (semDivisao) return { ida: Math.ceil(total / 2), volta: Math.floor(total / 2) };
  return { ida: ida ?? Math.ceil(total / 2), volta: volta ?? Math.floor(total / 2) };
}

/**
 * Ida e volta de uma mobilidade RATEADA (divisão de escalação): a mesma
 * proporção da divisão cheia (`idaEVoltaDaMobilidade`), com a volta levando o
 * resto — ida + volta fecham sempre com a mobilidade rateada, sem perder
 * centavo no arredondamento. Antes o rateio escalava a mobilidade e mantinha
 * ida e volta cheias, e no modal da divisão as duas não fechavam com o total.
 */
export function idaEVoltaRateadas(
  mobilidadeRateada: number,
  mobilidadeCheia: number | null | undefined,
  ida: number | null | undefined,
  volta: number | null | undefined,
): { ida: number; volta: number } {
  const total = Math.max(0, mobilidadeRateada || 0);
  const cheia = idaEVoltaDaMobilidade(mobilidadeCheia, ida, volta);
  const base = cheia.ida + cheia.volta;
  const idaRateada = base > 0 ? Math.round((total * cheia.ida) / base) : Math.ceil(total / 2);
  return { ida: idaRateada, volta: total - idaRateada };
}

/**
 * A prestação entra nos TOTAIS do comparativo (realizado, planejado e
 * diferença — os da tela e os gravados por POST /calculate)? Aprovada pelo
 * RH, ou enviada e ainda pendente: o mesmo recorte de fluxo da NF
 * (`isNfEligible`) e do crédito no Flash (`isFlashCreditableActual`).
 * Devolvida e recusada continuam na LISTA (o RH precisa vê-las), mas os
 * valores delas não são definitivos — ficam fora dos totais até o reenvio.
 * Vale para o titular da linha; os filhos da divisão seguem o titular.
 */
export function entraNosTotaisDoComparativo(
  p: { sentForReview?: boolean | null; rhStatus?: string | null },
): boolean {
  return isNfEligible(p);
}

/** Etapa do trilho do Comparativo (0 Escalação … 4 Nota fiscal). */
export type EtapaDoComparativo = 2 | 3 | 4;

/**
 * Etapa atual do Comparativo. Enquanto houver item sem envio/decisão, é a
 * Prestação; tudo enviado/decidido → Aprovação RH; só com TODAS aprovadas E o
 * comparativo aprovado (fechado) → Nota fiscal. Antes bastava tudo aprovado
 * item a item e o trilho pulava para a nota com o comparativo ainda aberto.
 */
export function etapaDoComparativo(
  itens: readonly { sentForReview?: boolean | null; rhStatus?: string | null }[],
  statusDoComparativo: string | null | undefined,
): EtapaDoComparativo {
  const tudoEnviadoOuDecidido = itens.length > 0 && itens.every(i => i.sentForReview || ["aprovado", "devolvido", "rejeitado"].includes(i.rhStatus || ""));
  const tudoAprovado = itens.length > 0 && itens.every(i => i.rhStatus === "aprovado");
  if (tudoAprovado && statusDoComparativo === "aprovado") return 4;
  return tudoEnviadoOuDecidido ? 3 : 2;
}
