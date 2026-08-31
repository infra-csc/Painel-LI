import { sql } from "drizzle-orm";
import { teamInclusions } from "@shared/schema";

/**
 * Seleção compatível com bancos publicados antes de `skip_uber`.
 *
 * `to_jsonb(linha)->>'skip_uber'` não referencia a coluna diretamente: em um
 * schema antigo a chave simplesmente não existe e o valor vira false. Isso
 * mantém as leituras operacionais funcionando até a migração aditiva chegar ao
 * banco de produção.
 */
export const teamInclusionSelectCompat = {
  id: teamInclusions.id,
  inclusionNumber: teamInclusions.inclusionNumber,
  eventId: teamInclusions.eventId,
  functionId: teamInclusions.functionId,
  collaboratorId: teamInclusions.collaboratorId,
  area: teamInclusions.area,
  emitsNf: teamInclusions.emitsNf,
  atendimentoTipo: teamInclusions.atendimentoTipo,
  percurseiroTipo: teamInclusions.percurseiroTipo,
  cenoFreelaTipo: teamInclusions.cenoFreelaTipo,
  rowOrder: teamInclusions.rowOrder,
  scheduleStartDate: teamInclusions.scheduleStartDate,
  scheduleEndDate: teamInclusions.scheduleEndDate,
  actualStartDate: teamInclusions.actualStartDate,
  actualEndDate: teamInclusions.actualEndDate,
  flightDepartureDate: teamInclusions.flightDepartureDate,
  flightDepartureSuggestedTime: teamInclusions.flightDepartureSuggestedTime,
  flightArrivalSuggestedTime: teamInclusions.flightArrivalSuggestedTime,
  flightReturnDate: teamInclusions.flightReturnDate,
  flightReturnSuggestedTime: teamInclusions.flightReturnSuggestedTime,
  needsTicket: teamInclusions.needsTicket,
  needsAccommodation: teamInclusions.needsAccommodation,
  transportModeIda: teamInclusions.transportModeIda,
  transportModeVolta: teamInclusions.transportModeVolta,
  suggestionSentAt: teamInclusions.suggestionSentAt,
  validatedAt: teamInclusions.validatedAt,
  validatedBy: teamInclusions.validatedBy,
  dailyRates: teamInclusions.dailyRates,
  workDays: teamInclusions.workDays,
  dailyValue: teamInclusions.dailyValue,
  actualDailyRates: teamInclusions.actualDailyRates,
  observations: teamInclusions.observations,
  actualObservations: teamInclusions.actualObservations,
  emergencyRecord: teamInclusions.emergencyRecord,
  skipUber: sql<boolean>`COALESCE((to_jsonb(${teamInclusions})->>'skip_uber')::boolean, false)`,
  city: teamInclusions.city,
  status: teamInclusions.status,
  previousStatus: teamInclusions.previousStatus,
  phase: teamInclusions.phase,
  userId: teamInclusions.userId,
  createdAt: teamInclusions.createdAt,
  updatedAt: teamInclusions.updatedAt,
  updatedBy: teamInclusions.updatedBy,
  deletedAt: teamInclusions.deletedAt,
  deletedBy: teamInclusions.deletedBy,
  approvedByProduction: teamInclusions.approvedByProduction,
  approvedByProductionAt: teamInclusions.approvedByProductionAt,
};