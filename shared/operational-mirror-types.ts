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
import type { DatasDoQuarto } from "./datas-do-quarto";
import type { ValoresDoHotelSalvos } from "./custo-dos-quartos";
import type { OcupanteForaDoEspelho, VagaCanceladaComCusto } from "./vagas-canceladas";

export type { OcupanteForaDoEspelho, VagaCanceladaComCusto } from "./vagas-canceladas";

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
  /**
   * A inclusão precisa de passagem / de hospedagem. Opcionais porque servidores
   * antigos não os mandam — a regra de pendência cai então em "tem o registro".
   */
  needsTicket?: boolean;
  needsAccommodation?: boolean;
  suggestedRoomGroupId: string | null;
  roomGroupLabel: string | null;
  /**
   * Entrada/saída do quarto desta vaga e de onde vieram (09/10): passagem →
   * datas sugeridas → hospedagem → escala, com o aviso quando a hospedagem
   * reservada diverge. Opcional porque servidores antigos não mandam.
   */
  datasDoQuarto?: DatasDoQuarto;
  /**
   * Hotel desta pessoa calculado pela aba Quartos (20/10): noites × tarifa por
   * pessoa do tipo de cada noite (ou a diária própria do quarto) + late
   * check-out — shared/custo-dos-quartos.ts. `null`/ausente: a pessoa não está
   * em quarto ou o evento não tem tarifa. `completo` falso = há noite sem tarifa.
   */
  hotelDosQuartos?: { totalCentavos: number; noites: number; completo: boolean } | null;
  /**
   * O que o "Confirmar" do quarto escreveu na hospedagem desta vaga (23/10,
   * `hospedagens_do_espelho.campos`: coluna → valor) — separa o "do Espelho"
   * do lançado à mão (shared/hotel-na-hospedagem.ts). Ausente/null: nada.
   */
  hospedagemDoEspelho?: Record<string, string | number | null> | null;
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
  /**
   * Quanto de `total` é de VAGA CANCELADA (23/10): o dinheiro gasto continua
   * no rateio, mas a visão Departamentos (operacional) mostra só as ativas.
   * Opcional: servidor antigo não manda.
   */
  canceladas?: number;
}

/** O que as vagas canceladas ainda somam no custo do evento (23/10). */
export interface TotaisDasCanceladas {
  /** Vagas canceladas que têm algum registro ou valor (as do bloco). */
  vagas: number;
  /** Destas, quantas ainda têm passagem ou hospedagem valendo — o aviso do topo. */
  revisar: number;
  tickets: number;
  hotel: number;
  baggage: number;
  uber: number;
  carRental: number;
  total: number;
}

export interface MirrorTotals {
  /** Passagens: as atuais + as de HISTÓRICO (troca aprovada) — o dinheiro foi gasto. */
  tickets: number;
  /** Quanto de `tickets` é de passagem que virou histórico numa troca (01/10). */
  ticketsHistorico: number;
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
  /**
   * Vagas canceladas (23/10): JÁ INCLUÍDAS em tickets/hotel/…/grand e nos
   * subtotais — dinheiro gasto não some —, separadas aqui para a tela dizer
   * quanto é delas. Opcional: servidor antigo não manda.
   */
  canceladas?: TotaisDasCanceladas;
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
export type RoomGroup = HotelRoomGroup & {
  members: HotelRoomGroupMember[];
  /**
   * Quem estava gravado no quarto e saiu na leitura por não ter mais vaga ativa
   * no evento (cancelada ou excluída, 23/10). O vínculo no banco fica; o
   * quarto CONFIRMADO avisa. Opcional: servidor antigo não manda.
   */
  foraDoEspelho?: OcupanteForaDoEspelho[];
};
/** Grupo de Uber do evento com seus membros (linhas cruas das tabelas). */
export type UberGroup = UberGroupRow & { members: UberGroupMember[]; foraDoEspelho?: OcupanteForaDoEspelho[] };

export interface MirrorResponse {
  event: MirrorEvent;
  rows: MirrorRow[];
  uberGroups: UberGroup[];
  roomGroups: RoomGroup[];
  totals: MirrorTotals;
  pendingCount: number;
  suggestedRoomCount: number;
  suggestedUberCount: number;
  /**
   * Valores do hotel gravados na aba Quartos (tarifas, fatura, diária própria e
   * valor pago por quarto, late check-out por pessoa). Opcional: servidor antigo
   * não manda; `null` quando as tabelas ainda não existem no banco.
   */
  valoresDoHotel?: ValoresDoHotelSalvos | null;
  /**
   * Vagas canceladas que ainda têm passagem, hospedagem ou algum valor (23/10).
   * FORA de `rows` (grade, pessoas, departamentos, pendências, quartos, Uber);
   * o custo delas está em `totals` e em `totals.canceladas`.
   */
  vagasCanceladas?: VagaCanceladaComCusto[];
}

/**
 * Regra ÚNICA do total de hotel de uma linha (manual × calculado):
 *   1. totalCents informado (o "HOTEL TT" lançado à mão) — vence sempre;
 *   2. senão, o calculado pela aba Quartos (20/10), quando todas as noites da
 *      pessoa têm tarifa — `row.hotelDosQuartos`;
 *   3. senão, dailyRate × diárias (diárias = nightsCount informado, senão
 *      dailyRates da escala).
 * Usada pelo servidor (KPIs/subtotais/Excel) e pelo cliente (cards/rodapé).
 * Não entra no Planejado/Realizado: é o custo de logística do Espelho.
 */
export type LinhaDoHotel = Pick<MirrorRow, "accommodation" | "schedule"> & Partial<Pick<MirrorRow, "hotelDosQuartos">>;

export type FonteDoHotel = "lancado" | "quartos" | "diaria";

const diariaVezesNoites = (row: LinhaDoHotel): number => {
  const acc = row.accommodation;
  if (!acc) return 0;
  return (acc.dailyRate || 0) * (acc.nightsCount || row.schedule?.dailyRates || 0) || 0;
};

/** De onde vem o total de hotel da linha (`null` = sem valor). */
export function fonteDoHotel(row: LinhaDoHotel): FonteDoHotel | null {
  if (row.accommodation?.totalCents) return "lancado";
  const q = row.hotelDosQuartos;
  if (q && q.completo && q.totalCentavos > 0) return "quartos";
  return diariaVezesNoites(row) > 0 ? "diaria" : null;
}

export function hotelTotalCents(row: LinhaDoHotel): number {
  const fonte = fonteDoHotel(row);
  if (fonte === "lancado") return row.accommodation?.totalCents ?? 0;
  if (fonte === "quartos") return row.hotelDosQuartos?.totalCentavos ?? 0;
  return diariaVezesNoites(row);
}

/** true quando o total NÃO foi informado e está sendo calculado (aba Quartos ou diária × diárias). */
export function isHotelTotalDerived(row: LinhaDoHotel): boolean {
  const fonte = fonteDoHotel(row);
  return fonte === "quartos" || fonte === "diaria";
}
