/**
 * Fábricas de registros de DOMÍNIO para os testes de componente (28/09).
 *
 * `fixtures.ts` tem o usuário e o `fetch` mockado; aqui ficam vaga, passagem,
 * hospedagem, evento, função, colaborador, nota fiscal, realizado e a linha do
 * Controle RH — tudo com os campos completos do schema e padrões neutros.
 * Passe só o que o teste precisa mudar: `vagaFake({ status: "cancelado" })`.
 */
import type {
  Accommodation, BudgetActual, Collaborator, Event, Function as Funcao, Invoice, TeamInclusion, Ticket,
} from "@shared/schema";
import type { SuggestionRow } from "@/components/scaling-validation/types";
import type { PrestacaoItem } from "@/components/rh/prestacao-types";
import type { NotaParaControle, PlanejadoParaControle, RealizadoParaControle } from "@shared/controle-rh";

let seq = 0;
const proximo = () => { seq += 1; return seq; };

const CRIADO_EM = new Date("2026-03-01T12:00:00Z");

export function vagaFake(parcial: Partial<TeamInclusion> = {}): TeamInclusion {
  const n = proximo();
  return {
    id: `vaga-${n}`,
    inclusionNumber: 100 + n,
    eventId: "evento-1",
    functionId: "funcao-1",
    collaboratorId: "colab-1",
    area: null,
    emitsNf: true,
    atendimentoTipo: null,
    percurseiroTipo: null,
    cenoFreelaTipo: null,
    empreitaEmpresa: null,
    empreitaPessoas: null,
    empreitaValor: null,
    rowOrder: null,
    scheduleStartDate: "2026-04-10",
    scheduleEndDate: "2026-04-12",
    actualStartDate: null,
    actualEndDate: null,
    flightDepartureDate: null,
    flightDepartureSuggestedTime: null,
    flightArrivalSuggestedTime: null,
    flightReturnDate: null,
    flightReturnSuggestedTime: null,
    needsTicket: false,
    needsAccommodation: false,
    transportModeIda: null,
    transportModeVolta: null,
    suggestionSentAt: null,
    validatedAt: null,
    validatedBy: null,
    validationNote: null,
    dailyRates: 3,
    workDays: ["2026-04-10", "2026-04-11", "2026-04-12"],
    dailyValue: 0,
    actualDailyRates: null,
    observations: null,
    actualObservations: null,
    emergencyRecord: false,
    skipUber: false,
    city: "São Paulo",
    status: "planejado",
    previousStatus: null,
    phase: "inclusao",
    userId: "user-1",
    createdAt: CRIADO_EM,
    updatedAt: CRIADO_EM,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    approvedByProduction: null,
    approvedByProductionAt: null,
    ...parcial,
  };
}

export function passagemFake(parcial: Partial<Ticket> = {}): Ticket {
  const n = proximo();
  return {
    id: `passagem-${n}`,
    teamInclusionId: "vaga-1",
    transportType: "aereo",
    purchaseDate: "2026-03-20",
    actualDepartureDate: "2026-04-09",
    actualDepartureTime: "08:00",
    actualArrivalTime: "10:00",
    actualReturnDate: "2026-04-13",
    actualReturnTime: "18:00",
    returnArrivalTime: "20:00",
    departureCityOrigin: null,
    departureCityDestination: null,
    returnCityOrigin: null,
    returnCityDestination: null,
    departureAirport: "GRU",
    destinationAirport: "BSB",
    returnOriginAirport: "BSB",
    returnDestinationAirport: "GRU",
    value: 150000,
    purchaseOrderNumber: "AX782Q",
    fileUrl: null,
    attachmentIds: null,
    cardLastFourDigits: null,
    ticketObservations: null,
    ticketCompany: null,
    ticketStatus: null,
    emittedAt: null,
    emittedBy: null,
    locator: null,
    checkIn3: null,
    baggageTotalCents: null,
    baggageOc: null,
    baggageNotes: null,
    createdAt: CRIADO_EM,
    updatedAt: CRIADO_EM,
    updatedBy: null,
    ...parcial,
  };
}

export function hospedagemFake(parcial: Partial<Accommodation> = {}): Accommodation {
  const n = proximo();
  return {
    id: `hosp-${n}`,
    teamInclusionId: "vaga-1",
    checkInDate: "2026-04-09",
    checkInTime: "14:00",
    checkOutDate: "2026-04-13",
    checkOutTime: "12:00",
    hotelLocation: "Asa Sul, Brasília",
    hotelName: "Hotel Nacional",
    dailyRate: null,
    reservationNumber: "RES-1",
    accommodationObservations: null,
    attachmentIds: null,
    roomType: null,
    nightsCount: null,
    lateCheckout: false,
    totalCents: null,
    paymentCompany: null,
    hotelOc: null,
    checkIn4: null,
    hotelStatus: null,
    createdAt: CRIADO_EM,
    updatedAt: CRIADO_EM,
    updatedBy: null,
    ...parcial,
  };
}

export function eventoFake(parcial: Partial<Event> = {}): Event {
  const n = proximo();
  return {
    id: `evento-${n}`,
    eventNumber: n,
    name: `Circuito Brasília ${n}`,
    location: "Brasília, DF",
    startDate: "2026-04-10",
    endDate: "2026-04-12",
    observations: null,
    status: "planejado",
    paymentCompanyName: null,
    paymentCompanyCnpj: null,
    createdAt: CRIADO_EM,
    ...parcial,
  };
}

export function funcaoFake(parcial: Partial<Funcao> = {}): Funcao {
  const n = proximo();
  return {
    id: `funcao-${n}`,
    functionNumber: n,
    name: `Produção ${n}`,
    description: null,
    responsibleArea: null,
    costCenter: null,
    quantity: 1,
    userId: "user-1",
    createdAt: CRIADO_EM,
    ...parcial,
  };
}

export function colaboradorFake(parcial: Partial<Collaborator> = {}): Collaborator {
  const n = proximo();
  return {
    id: `colab-${n}`,
    collaboratorNumber: n,
    fullName: `Ana Souza ${n}`,
    officialDocument: `000.000.000-0${n}`,
    documentType: "cpf",
    secondaryDocument: null,
    secondaryDocumentType: null,
    documentAttachmentId: null,
    birthDate: null,
    type: "freela",
    phone: null,
    city: "Curitiba",
    state: "PR",
    addressStreet: null,
    addressNumber: null,
    addressComplement: null,
    addressZip: null,
    gender: null,
    status: "aprovado",
    approvalNotes: null,
    approvedBy: null,
    approvedAt: null,
    isCoordinator: false,
    active: true,
    inactiveReason: null,
    inactivatedAt: null,
    createdBy: null,
    createdByName: null,
    createdAt: CRIADO_EM,
    ...parcial,
  };
}

/** Linha de GET /api/scaling-suggestions — a vaga em fase de sugestão, com os campos que o servidor anexa. */
export function sugestaoFake(parcial: Partial<SuggestionRow> = {}): SuggestionRow {
  const { workDays: _ignorado, ...restoDaVaga } = vagaFake({ phase: "sugestao", status: "sugestao_pendente", collaboratorId: null });
  return {
    ...restoDaVaga,
    workDays: ["2026-04-10", "2026-04-11", "2026-04-12"],
    eventName: "Circuito Brasília",
    eventStartDate: "2026-04-10",
    eventEndDate: "2026-04-12",
    canEdit: true,
    canDecide: true,
    daysPending: 0,
    pendingRequest: null,
    lastDecision: null,
    lastVagaDecision: null,
    ...parcial,
  };
}

export function notaFiscalFake(parcial: Partial<Invoice> = {}): Invoice {
  const n = proximo();
  return {
    id: `nf-${n}`,
    eventId: "evento-1",
    collaboratorId: "colab-1",
    functionId: "funcao-1",
    budgetActualId: "realizado-1",
    oc: "OC-1234",
    attachmentUrl: "https://arquivos.exemplo/nf.pdf",
    attachmentName: "nf.pdf",
    paymentText: null,
    status: "enviada",
    returnComment: null,
    paymentDate: null,
    approvedAt: null,
    history: [],
    checkinAt: null,
    checkinBy: null,
    createdAt: CRIADO_EM,
    updatedAt: CRIADO_EM,
    ...parcial,
  };
}

export function realizadoFake(parcial: Partial<BudgetActual> = {}): BudgetActual {
  const n = proximo();
  return {
    id: `realizado-${n}`,
    plannedId: null,
    eventId: "evento-1",
    collaboratorId: "colab-1",
    functionId: "funcao-1",
    collaboratorType: "freela",
    dailyQuantity: 3,
    dailyValue: 30000,
    costAssistance: 0,
    weekdayLunch: 0,
    weekdayDinner: 0,
    weekendLunch: 0,
    weekendDinner: 0,
    mobility: 0,
    mobilityIda: 0,
    mobilityVolta: 0,
    transport: 0,
    totalValue: 90000,
    changeReason: null,
    paymentStatus: "pendente",
    observations: null,
    attachmentIds: null,
    createdBy: null,
    createdAt: CRIADO_EM,
    updatedAt: CRIADO_EM,
    updatedBy: null,
    sentForReview: true,
    rhStatus: "pendente",
    rhComment: null,
    rhActionBy: null,
    rhActionAt: null,
    resubmitted: false,
    splitParentId: null,
    workedDays: null,
    didNotAttend: false,
    didNotAttendReason: null,
    rhAdjusted: false,
    rhAdjustedFields: null,
    rhAdjustNote: null,
    ...parcial,
  };
}

// ── Controle RH (contrato de @shared/controle-rh) ───────────────────────────

export function planejadoRhFake(parcial: Partial<PlanejadoParaControle> = {}): PlanejadoParaControle {
  return {
    id: "planejado-1",
    eventId: "evento-1",
    collaboratorId: "colab-1",
    functionId: "funcao-1",
    collaboratorType: "freela",
    dailyQuantity: 3,
    dailyValue: 30000,
    costAssistance: 0,
    weekdayLunch: 4400,
    weekdayDinner: 4400,
    weekendLunch: 0,
    weekendDinner: 0,
    mobility: 12000,
    transport: 0,
    totalValue: 110800,
    status: "aprovado_rh",
    observations: null,
    didNotAttend: false,
    createdBy: null,
    createdAt: "2026-03-01T12:00:00.000Z",
    updatedAt: "2026-03-01T12:00:00.000Z",
    ...parcial,
  };
}

export function realizadoRhFake(parcial: Partial<RealizadoParaControle> = {}): RealizadoParaControle {
  return {
    id: "realizado-1",
    plannedId: "planejado-1",
    eventId: "evento-1",
    collaboratorId: "colab-1",
    functionId: "funcao-1",
    splitParentId: null,
    dailyQuantity: 3,
    dailyValue: 30000,
    weekdayLunch: 4400,
    weekdayDinner: 4400,
    weekendLunch: 0,
    weekendDinner: 0,
    mobility: 12000,
    transport: 0,
    totalValue: 110800,
    changeReason: null,
    paymentStatus: "pendente",
    sentForReview: true,
    rhStatus: "pendente",
    rhComment: null,
    rhActionBy: null,
    rhActionAt: null,
    resubmitted: false,
    didNotAttend: false,
    didNotAttendReason: null,
    rhAdjusted: false,
    rhAdjustNote: null,
    updatedBy: null,
    updatedAt: "2026-03-05T12:00:00.000Z",
    ...parcial,
  } as RealizadoParaControle;
}

export function notaRhFake(parcial: Partial<NotaParaControle> = {}): NotaParaControle {
  return {
    id: "nf-1",
    budgetActualId: "realizado-1",
    oc: "OC-1234",
    attachmentUrl: null,
    attachmentName: null,
    status: "enviada",
    returnComment: null,
    paymentDate: null,
    approvedAt: null,
    checkinAt: null,
    checkinBy: null,
    createdAt: "2026-03-06T12:00:00.000Z",
    updatedAt: "2026-03-06T12:00:00.000Z",
    ...parcial,
  };
}

/** Linha da fila do Controle RH (GET /api/rh/controle). */
export function linhaRhFake(parcial: Partial<PrestacaoItem> = {}): PrestacaoItem {
  const n = proximo();
  return {
    id: `linha-rh-${n}`,
    status: "prestacao_recebida",
    responsavelAtual: "RH",
    lastActivityDate: new Date().toISOString(),
    event: {
      id: "evento-1", eventNumber: 1, name: "Circuito Brasília", location: "Brasília, DF",
      startDate: "2026-04-10", endDate: "2026-04-12", status: "planejado",
    },
    collaboratorId: "colab-1",
    collaboratorName: "ANA SOUZA",
    functionId: "funcao-1",
    functionName: "Produção",
    teamInclusion: { id: "vaga-1", inclusionNumber: 101, status: "escalado", phase: "escalacao", emitsNf: true, createdAt: "2026-02-20T12:00:00.000Z" },
    planned: planejadoRhFake(),
    actual: realizadoRhFake(),
    invoice: null,
    emiteNf: true,
    nfElegivel: true,
    rhActionByName: null,
    rhPrecisaAgir: true,
    ...parcial,
  } as PrestacaoItem;
}
