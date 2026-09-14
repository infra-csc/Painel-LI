/**
 * Trocas que envolvem DUAS vagas (dono, 14/09). A Escalação barra quem já tem
 * escalação no mesmo período, e dois casos reais ficavam sem saída:
 *
 *  - PERMUTA: "trocar dois colaboradores que já estão escalados no mesmo fim
 *    de semana, em eventos diferentes" — A não entrava na vaga de B enquanto
 *    B estava na de A, e vice-versa.
 *  - TRANSFERÊNCIA: "casos que ainda não têm alguém escalado na vaga" — a
 *    pessoa que se quer trazer já está escalada em outra vaga do período.
 *
 * Os dois viram UM pedido de troca, com o "Sai de" de quem se move, aplicado
 * nas duas vagas de uma vez quando aprovado.
 */

export type TipoDeTroca = "substituicao" | "permuta" | "transferencia";

type Dia = string | Date | null | undefined;
const ymd = (d: Dia): string => (d ? (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10) : "");

/** Os períodos agendados das duas vagas se sobrepõem? Sem datas, não. */
export function periodosSeSobrepoem(
  a: { scheduleStartDate?: Dia; scheduleEndDate?: Dia },
  b: { scheduleStartDate?: Dia; scheduleEndDate?: Dia },
): boolean {
  const ai = ymd(a.scheduleStartDate);
  const af = ymd(a.scheduleEndDate);
  const bi = ymd(b.scheduleStartDate);
  const bf = ymd(b.scheduleEndDate);
  if (!ai || !af || !bi || !bf) return false;
  return ai <= bf && bi <= af;
}

/** "vaga #12 · Circuitinho Salvador" */
export function rotuloDaVaga(numero: number | string | null | undefined, evento: string | null | undefined): string {
  return `vaga #${numero ?? "?"}${evento ? ` · ${evento}` : ""}`;
}

/** Linha crua de swap_requests com os joins de vaga e evento (SQL direto → snake_case). */
export interface TrocaCrua {
  id: string;
  team_inclusion_id?: string | null;
  paired_inclusion_id?: string | null;
  swap_kind?: string | null;
  current_collaborator_name?: string | null;
  new_collaborator_name?: string | null;
  new_city?: string | null;
  paired_new_city?: string | null;
  inclusion_number?: number | string | null;
  event_name?: string | null;
  paired_inclusion_number?: number | string | null;
  paired_event_name?: string | null;
  created_at?: string | Date | null;
  requested_by_name?: string | null;
  reason?: string | null;
  status?: string | null;
  reviewed_at?: string | Date | null;
  reviewed_by_name?: string | null;
  review_comment?: string | null;
}

/**
 * A troca contada do ponto de vista de UMA vaga, no formato do histórico.
 * Na vaga pareada os papéis se invertem: lá, quem sai é o "novo" do pedido e
 * quem chega é o "atual" — na transferência, ninguém chega (a vaga fica aberta).
 */
export function trocaNaVisaoDaVaga(r: TrocaCrua, vagaId: string) {
  const pareada = r.paired_inclusion_id === vagaId && r.team_inclusion_id !== vagaId;
  const permuta = r.swap_kind === "permuta";
  const transferencia = r.swap_kind === "transferencia";
  const outra = pareada
    ? rotuloDaVaga(r.inclusion_number, r.event_name)
    : rotuloDaVaga(r.paired_inclusion_number, r.paired_event_name);
  return {
    id: String(r.id),
    createdAt: r.created_at ?? null,
    requestedByName: r.requested_by_name ?? null,
    currentCollaboratorName: (pareada ? r.new_collaborator_name : r.current_collaborator_name) ?? null,
    newCollaboratorName: (pareada ? r.current_collaborator_name : r.new_collaborator_name) ?? null,
    newCity: (pareada ? r.paired_new_city : r.new_city) ?? null,
    reason: r.reason ?? null,
    status: String(r.status ?? "pendente"),
    reviewedAt: r.reviewed_at ?? null,
    reviewedByName: r.reviewed_by_name ?? null,
    reviewComment: r.review_comment ?? null,
    permutaCom: permuta ? outra : null,
    saiDeOutro: permuta ? ((pareada ? r.new_city : r.paired_new_city) ?? null) : null,
    transferencia,
    outraVaga: transferencia ? outra : null,
  };
}
