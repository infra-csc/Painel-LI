// Tipos do Espelho Operacional — contrato entre server/operational-mirror.ts
// (que produz) e client/src/pages/operational-mirror.tsx (que consome).
// Não há lógica de banco aqui; só o shape do JSON e a regra do total de hotel.
import type {
  Ticket,
  Accommodation,
  HotelRoomGroup,
  HotelRoomGroupMember,
  UberGroup as UberGroupRow,
  UberGroupMember,
} from "./schema";

export interface MirrorCollaborator {
  id: string | null;
  fullName: string;
  gender: string | null;
  city: string | null;
  state: string | null;
  type: string | null;
}

export interface MirrorFunction {
  id: string | null;
  name: string | null;
  costCenter: string | null;
  area: string | null;
}

export interface MirrorSchedule {
  startDate: string | null;
  endDate: string | null;
  flightDepartureDate: string | null;
  flightReturnDate: string | null;
  dailyRates: number | null;
}

export interface MirrorBaggage {
  totalCents: number;
  extraCents: number;
  oc: string | null;
  notes: string | null;
  checkIn: string | null;
}

export interface MirrorUber {
  totalCents: number;
  oc: string | null;
  notes: string | null;
  checkIn: string | null;
  suggestedGroupId: string | null;
  groupName: string | null;
}

export interface MirrorCarRental {
  company: string | null;
  totalCents: number;
  oc: string | null;
  notes: string | null;
  checkIn: string | null;
}

export interface MirrorRow {
  teamInclusionId: string;
  collaborator: MirrorCollaborator;
  function: MirrorFunction;
  schedule: MirrorSchedule;
  ticket: Ticket | null;
  accommodation: Accommodation | null;
  observations: string | null;
  baggage: MirrorBaggage;
  uber: MirrorUber;
  carRental: MirrorCarRental;
  /**
   * Dispensada da roteirizacao de Uber: a grade mostra "nao usa" e a pessoa
   * fica fora dos carros, num bloco proprio na visao de Uber.
   */
  skipUber: boolean;
  suggestedRoomGroupId: string | null;
  roomGroupLabel: string | null;
  pendencies: string[];
}

export interface MirrorSubtotal {
  name: string;
  tickets: number;
  hotel: number;
  baggage: number;
  uber: number;
  carRental: number;
  total: number;
}

export interface MirrorTotals {
  tickets: number;
  hotel: number;
  baggage: number;
  uber: number;
  carRental: number;
  grand: number;
  byFunction: MirrorSubtotal[];
  byDepartment: MirrorSubtotal[];
  /**
   * Rateio contábil (28/08): vários departamentos caem na MESMA conta —
   * cenotécnica, kit, percurso e produção viram "LI" na planilha da equipe.
   * É por esta visão que o financeiro fecha o evento; a de departamento
   * responde "quem gastou", esta responde "em qual conta entra".
   */
  byAccount: MirrorSubtotal[];
}

export interface MirrorEvent {
  id: string;
  name: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
}

/** Grupo de quarto do evento com seus membros (linhas cruas das tabelas). */
export type RoomGroup = HotelRoomGroup & { members: HotelRoomGroupMember[] };
/** Grupo de Uber do evento com seus membros (linhas cruas das tabelas). */
export type UberGroup = UberGroupRow & { members: UberGroupMember[] };

export interface MirrorResponse {
  event: MirrorEvent;
  rows: MirrorRow[];
  uberGroups: UberGroup[];
  roomGroups: RoomGroup[];
  totals: MirrorTotals;
  pendingCount: number;
  suggestedRoomCount: number;
  suggestedUberCount: number;
}

/**
 * Regra ÚNICA do total de hotel de uma linha:
 *   totalCents informado, senão dailyRate × diárias
 *   (diárias = nightsCount informado, senão dailyRates da escala).
 * Usada pelo servidor (KPIs/subtotais/Excel) e pelo cliente (cards/rodapé).
 */
export function hotelTotalCents(row: Pick<MirrorRow, "accommodation" | "schedule">): number {
  const acc = row.accommodation;
  if (!acc) return 0;
  if (acc.totalCents) return acc.totalCents;
  const nights = acc.nightsCount || row.schedule?.dailyRates || 0;
  return (acc.dailyRate || 0) * nights || 0;
}

/** true quando o total NÃO foi informado e está sendo derivado de diária × diárias. */
export function isHotelTotalDerived(row: Pick<MirrorRow, "accommodation" | "schedule">): boolean {
  const acc = row.accommodation;
  if (!acc || acc.totalCents) return false;
  return hotelTotalCents(row) > 0;
}
