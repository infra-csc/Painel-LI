/**
 * Regras puras da Escalação compartilhadas entre client e servidor.
 *
 * A decisão de "para onde vai o status/fase ao confirmar" morava no client
 * (scaling.tsx) e o servidor só sobrescrevia cenotécnica. Agora a rota
 * POST /api/team-inclusions/:id/confirm decide no servidor com esta função;
 * o client só a usa para pré-visualização/mensagens.
 */

const CENOTECNICA_KEYWORDS = ["cenotecnica", "cenotécnica", "sup ceno"] as const;

/** A função é de cenotécnica (precisa de aprovação da Produção antes do fluxo)? */
export function isCenotecnicaFunctionName(functionName: string | null | undefined): boolean {
  const name = (functionName || "").toLowerCase();
  return CENOTECNICA_KEYWORDS.some((k) => name.includes(k));
}

export interface ConfirmStatusInput {
  functionName: string | null | undefined;
  needsTicket: boolean | null | undefined;
  needsAccommodation: boolean | null | undefined;
}

export interface ConfirmStatusResult {
  status: "aguardando_producao" | "aprovado" | "escalado";
  phase: "escalacao" | "aprovado";
}

/**
 * Status/fase da escalação após "Confirmar Escalação".
 *
 * - Cenotécnica: SEMPRE vai para aguardando_producao (fase escalacao) primeiro;
 * - Sem logística (nem passagem nem hospedagem): vai direto para aprovado
 *   (Compras só entra em trocas, não na primeira escalação);
 * - Demais: escalado (fase escalacao) e segue para passagem/hospedagem.
 */
export function nextStatusOnConfirm(input: ConfirmStatusInput): ConfirmStatusResult {
  if (isCenotecnicaFunctionName(input.functionName)) {
    return { status: "aguardando_producao", phase: "escalacao" };
  }
  const noLogistics = !input.needsTicket && !input.needsAccommodation;
  if (noLogistics) return { status: "aprovado", phase: "aprovado" };
  return { status: "escalado", phase: "escalacao" };
}
