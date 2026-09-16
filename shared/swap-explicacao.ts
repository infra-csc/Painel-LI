/**
 * O que muda ao aprovar uma troca — em texto, vaga por vaga (dono, 16/09:
 * "deixe só uma aprovação, mas bem explicativo como vai mudar e tudo mais").
 *
 * Um texto só para todo lugar onde a troca aparece (Escalação, Passagens,
 * Hospedagem e o próprio pedido), para quem pede e quem aprova lerem a mesma
 * coisa. Cobre os três tipos: troca simples, troca entre vagas (permuta) e
 * transferência para uma vaga aberta.
 */

export interface TrocaParaExplicar {
  swapKind?: string | null;
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

  if (t.swapKind === "permuta") {
    return {
      tipo: "Troca entre vagas",
      vagas: [
        { chave: "esta", vaga: esta, antes: atual, depois: novo, saiDe: cidade(t.newCity) },
        { chave: "outra", vaga: outra, antes: novo, depois: atual, saiDe: cidade(t.pairedNewCity) },
      ],
      observacoes: [
        "As duas vagas mudam juntas, no mesmo instante — ninguém fica em duas vagas nem sem vaga.",
        "Cada vaga passa a sair da cidade indicada acima, que é a origem da passagem.",
        "Passagem e hospedagem já compradas continuam no nome de quem estava na vaga: revise as duas vagas.",
      ],
      recusa: `Recusar vale para as duas vagas: ${atual} continua na vaga ${numEsta} e ${novo} continua na vaga ${numOutra}.`,
    };
  }

  if (t.swapKind === "transferencia") {
    return {
      tipo: "Transferência entre vagas",
      vagas: [
        { chave: "esta", vaga: esta, antes: "Vaga aberta", depois: novo, saiDe: cidade(t.newCity) },
        { chave: "outra", vaga: outra, antes: novo, depois: "Vaga aberta", saiDe: null },
      ],
      observacoes: [
        `${novo} sai da vaga ${numOutra} e entra na vaga ${numEsta}, no mesmo instante.`,
        `A vaga ${numOutra} volta a ficar aberta — a área precisa escalar outra pessoa nela.`,
        `Passagem e hospedagem já compradas na vaga ${numOutra} continuam no nome de ${novo}: revise.`,
      ],
      recusa: `Recusar vale para as duas vagas: ${novo} continua na vaga ${numOutra} e a vaga ${numEsta} segue aberta.`,
    };
  }

  return {
    tipo: "Troca de colaborador",
    vagas: [{ chave: "esta", vaga: esta, antes: atual, depois: novo, saiDe: cidade(t.newCity) }],
    observacoes: [
      `${novo} assume a vaga no lugar de ${atual}.`,
      "A vaga passa a sair da cidade indicada acima, que é a origem da passagem.",
      `Passagem e hospedagem já compradas continuam no nome de ${atual}: revise antes de aprovar.`,
    ],
    recusa: `Recusar mantém ${atual} na vaga ${numEsta}.`,
  };
}
