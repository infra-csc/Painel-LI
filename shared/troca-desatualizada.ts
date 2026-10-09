/**
 * O pedido de troca ainda vale? (dono, 09/10)
 *
 * Caso real: transferência pedida na vaga #4287 (Roberto) para trazer o Matheus
 * da vaga #4290. Depois do pedido a #4290 passou a ter o Roberto; o quadro "Se
 * for aprovada" seguia dizendo "Hoje: Matheus", o botão "Aprovar troca" ficava
 * ativo e o servidor respondia 409 sem a tela explicar por quê.
 *
 * Esta é a MESMA conferência que a aprovação faz no servidor
 * (server/routes/trocas.ts, PATCH /api/swap-requests/:id/approve) — a rota usa
 * esta função, e as telas também, para avisar e desabilitar o "Aprovar troca"
 * antes do clique:
 *  - transferência: a vaga do pedido com quem estava nela no pedido (ou aberta)
 *    e a vaga de origem com quem vem para cá;
 *  - permuta: as duas vagas com quem estava em cada uma;
 *  - troca simples: a vaga com quem estava nela no pedido.
 *
 * Os ocupantes atuais vêm do banco (team_inclusions.collaborator_id). Campo
 * `undefined` = não se sabe (a consulta não trouxe) → aquela vaga não é
 * conferida; `null` = a vaga está aberta.
 */

export interface TrocaParaConferir {
  swapKind?: string | null;
  /** Quem estava na vaga do pedido quando ele foi aberto (null = aberta). */
  currentCollaboratorId?: string | null;
  /** Quem entra na vaga do pedido (na permuta/transferência, vem da outra vaga). */
  newCollaboratorId?: string | null;
  currentCollaboratorName?: string | null;
  newCollaboratorName?: string | null;
  inclusionNumber?: number | string | null;
  pairedInclusionNumber?: number | string | null;
  /** Quem está HOJE na vaga do pedido. */
  inclusionCollaboratorId?: string | null;
  inclusionCollaboratorName?: string | null;
  /** Quem está HOJE na outra vaga (permuta/transferência). */
  pairedCollaboratorId?: string | null;
  pairedCollaboratorName?: string | null;
}

/** Quem cada vaga precisa ter para o pedido valer (null = aberta). `outra` só na permuta/transferência. */
export function ocupantesEsperados(t: Pick<TrocaParaConferir, "swapKind" | "currentCollaboratorId" | "newCollaboratorId">): {
  esta: string | null;
  outra?: string | null;
} {
  const esta = t.currentCollaboratorId ?? null;
  if (t.swapKind === "permuta" || t.swapKind === "transferencia") return { esta, outra: t.newCollaboratorId ?? null };
  return { esta };
}

const nomeOu = (s: string | null | undefined) => s?.trim() || "outra pessoa";

function divergencia(
  numero: number | string | null | undefined,
  hojeId: string | null,
  hojeNome: string | null | undefined,
  esperadoId: string | null,
  esperadoNome: string | null | undefined,
): string {
  const hoje = hojeId ? `está com ${nomeOu(hojeNome)}` : "está aberta";
  const pedido = esperadoId ? `não com ${nomeOu(esperadoNome)}` : "e no pedido estava aberta";
  return `A vaga #${numero ?? "?"} hoje ${hoje}, ${pedido}.`;
}

/**
 * `null` quando o pedido ainda vale; senão o motivo, em pt-BR, dizendo o que
 * mudou em cada vaga ("A vaga #4290 hoje está com Roberto Carlos, não com
 * Matheus Pereira Silva.").
 */
export function motivoTrocaDesatualizada(t: TrocaParaConferir): string | null {
  const esperado = ocupantesEsperados(t);
  // Permuta sem quem estava na vaga do pedido: o servidor nunca aplica.
  if (t.swapKind === "permuta" && !esperado.esta) {
    return `O pedido não diz quem estava na vaga #${t.inclusionNumber ?? "?"} — não há quem levar para a outra vaga.`;
  }
  const motivos: string[] = [];
  if (t.inclusionCollaboratorId !== undefined && (t.inclusionCollaboratorId ?? null) !== esperado.esta) {
    motivos.push(divergencia(t.inclusionNumber, t.inclusionCollaboratorId ?? null, t.inclusionCollaboratorName, esperado.esta, t.currentCollaboratorName));
  }
  if (esperado.outra !== undefined && t.pairedCollaboratorId !== undefined && (t.pairedCollaboratorId ?? null) !== esperado.outra) {
    motivos.push(divergencia(t.pairedInclusionNumber, t.pairedCollaboratorId ?? null, t.pairedCollaboratorName, esperado.outra, t.newCollaboratorName));
  }
  return motivos.length ? motivos.join(" ") : null;
}
