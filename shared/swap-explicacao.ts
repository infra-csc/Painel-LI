/**
 * O que muda ao aprovar uma troca — em texto, vaga por vaga (dono, 16/09:
 * "deixe só uma aprovação, mas bem explicativo como vai mudar e tudo mais").
 *
 * Um texto só para todo lugar onde a troca aparece (Escalação, Passagens,
 * Hospedagem e o próprio pedido), para quem pede e quem aprova lerem a mesma
 * coisa. Cobre os três tipos: troca simples, troca entre vagas (permuta) e
 * transferência para uma vaga aberta.
 */

import { ocupantesEsperados } from "./troca-desatualizada";

export interface TrocaParaExplicar {
  swapKind?: string | null;
  /**
   * Ocupantes de fato (09/10, opcionais): quando a vaga mudou desde o pedido,
   * o "Hoje" mostra quem está nela agora, não quem estava no pedido. Sem os
   * ids do pedido ou sem o ocupante atual (`undefined`), vale o texto do pedido.
   */
  currentCollaboratorId?: string | null;
  newCollaboratorId?: string | null;
  inclusionCollaboratorId?: string | null;
  inclusionCollaboratorName?: string | null;
  pairedCollaboratorId?: string | null;
  pairedCollaboratorName?: string | null;
  inclusionNumber?: number | string | null;
  eventName?: string | null;
  pairedInclusionNumber?: number | string | null;
  pairedEventName?: string | null;
  pairedFunctionName?: string | null;
  currentCollaboratorName?: string | null;
  newCollaboratorName?: string | null;
  newCity?: string | null;
  pairedNewCity?: string | null;
}

export interface MudancaNaVaga {
  chave: "esta" | "outra";
  /** "Vaga #3623 · Corrida X · atendimento" */
  vaga: string;
  /** Quem está hoje (ou "Vaga aberta"). */
  antes: string;
  /** Quem fica depois de aprovar (ou "Vaga aberta"). */
  depois: string;
  /** De onde quem entra sai — a origem da passagem. */
  saiDe: string | null;
}

export interface ExplicacaoDaTrocaTexto {
  tipo: string;
  vagas: MudancaNaVaga[];
  /** O que acontece junto com a aprovação. */
  observacoes: string[];
  /** O que acontece se recusar. */
  recusa: string;
}

const nome = (s: string | null | undefined) => s?.trim() || "?";
const cidade = (s: string | null | undefined) => s?.trim() || null;
const rotulo = (n: number | string | null | undefined, ...extras: (string | null | undefined)[]) =>
  [`Vaga #${n ?? "?"}`, ...extras.map((e) => e?.trim()).filter(Boolean)].join(" · ");

export function explicarTroca(t: TrocaParaExplicar): ExplicacaoDaTrocaTexto {
  const atual = nome(t.currentCollaboratorName);
  const novo = nome(t.newCollaboratorName);
  const numEsta = `#${t.inclusionNumber ?? "?"}`;
  const numOutra = `#${t.pairedInclusionNumber ?? "?"}`;
  const esta = rotulo(t.inclusionNumber, t.eventName);
  const outra = rotulo(t.pairedInclusionNumber, t.pairedEventName, t.pairedFunctionName);
  // "Hoje" de fato (09/10): se a vaga mudou desde o pedido, mostra quem está nela agora.
  const esperado = ocupantesEsperados(t);
  const deFato = (hojeId: string | null | undefined, hojeNome: string | null | undefined, esperadoId: string | null, sabeEsperado: boolean, doPedido: string) =>
    hojeId !== undefined && sabeEsperado && (hojeId ?? null) !== esperadoId
      ? (hojeId ? hojeNome?.trim() || "outra pessoa" : "Vaga aberta")
      : doPedido;
  const hojeEsta = (doPedido: string) =>
    deFato(t.inclusionCollaboratorId, t.inclusionCollaboratorName, esperado.esta, t.currentCollaboratorId !== undefined, doPedido);
  const hojeOutra = (doPedido: string) =>
    deFato(t.pairedCollaboratorId, t.pairedCollaboratorName, esperado.outra ?? null, t.newCollaboratorId !== undefined, doPedido);

  if (t.swapKind === "permuta") {
    return {
      tipo: "Troca entre vagas",
      vagas: [
        { chave: "esta", vaga: esta, antes: hojeEsta(atual), depois: novo, saiDe: cidade(t.newCity) },
        { chave: "outra", vaga: outra, antes: hojeOutra(novo), depois: atual, saiDe: cidade(t.pairedNewCity) },
      ],
      observacoes: [
        "As duas vagas mudam juntas, no mesmo instante — ninguém fica em duas vagas nem sem vaga.",
        "Cada vaga passa a sair da cidade indicada acima, que é a origem da passagem.",
        "Passagem já comprada nas duas vagas vai para o histórico de cada vaga (o custo continua no evento); Compras compra as novas. Hospedagem já registrada: revise.",
      ],
      recusa: `Recusar vale para as duas vagas: ${atual} continua na vaga ${numEsta} e ${novo} continua na vaga ${numOutra}.`,
    };
  }

  if (t.swapKind === "transferencia") {
    // Desde 05/10 a vaga de destino pode já ter alguém: essa pessoa sai da
    // escala (não vai para a outra vaga — a outra fica aberta).
    const quemSai = t.currentCollaboratorName?.trim() || null;
    return {
      tipo: "Transferência entre vagas",
      vagas: [
        { chave: "esta", vaga: esta, antes: hojeEsta(quemSai ?? "Vaga aberta"), depois: novo, saiDe: cidade(t.newCity) },
        { chave: "outra", vaga: outra, antes: hojeOutra(novo), depois: "Vaga aberta", saiDe: null },
      ],
      observacoes: [
        `${novo} sai da vaga ${numOutra} e entra na vaga ${numEsta}, no mesmo instante.`,
        ...(quemSai ? [`${quemSai} sai da vaga ${numEsta} e fica fora da escala (não vai para a vaga ${numOutra}).`] : []),
        `A vaga ${numOutra} volta a ficar aberta — a área precisa escalar outra pessoa nela.`,
        quemSai
          ? `Passagens já compradas (de ${novo} na vaga ${numOutra} e de ${quemSai} na vaga ${numEsta}) vão para o histórico de cada vaga (o custo continua no evento). Hospedagem já registrada: revise.`
          : `Passagem já comprada para ${novo} na vaga ${numOutra} vai para o histórico dela (o custo continua no evento). Hospedagem já registrada: revise.`,
      ],
      recusa: quemSai
        ? `Recusar vale para as duas vagas: ${novo} continua na vaga ${numOutra} e ${quemSai} continua na vaga ${numEsta}.`
        : `Recusar vale para as duas vagas: ${novo} continua na vaga ${numOutra} e a vaga ${numEsta} segue aberta.`,
    };
  }

  return {
    tipo: "Troca de colaborador",
    vagas: [{ chave: "esta", vaga: esta, antes: hojeEsta(atual), depois: novo, saiDe: cidade(t.newCity) }],
    observacoes: [
      `${novo} assume a vaga no lugar de ${atual}.`,
      "A vaga passa a sair da cidade indicada acima, que é a origem da passagem.",
      `Passagem já comprada para ${atual} vai para o histórico da vaga (o custo continua no evento) e Compras compra a de ${novo}. Hospedagem já registrada: revise antes de aprovar.`,
    ],
    recusa: `Recusar mantém ${atual} na vaga ${numEsta}.`,
  };
}
