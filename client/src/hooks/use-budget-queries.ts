/**
 * Consultas do ORÇAMENTO compartilhadas pelas três telas (Planejado, Realizado,
 * Comparativo) — 25/09 (modularização do Financeiro).
 *
 * Por quê: cada tela declarava as mesmas 10–12 `useQuery` (eventos, funções,
 * colaboradores, passagens, configurações, planejado/realizado/comparativo do
 * evento, notas, escalações, logs) com pequenas variações de `queryFn` — três
 * cópias para manter em sincronia. Aqui vive UMA versão:
 *  - mesmas CHAVES de sempre (`["/api/budget-actual", eventId]` etc.), porque
 *    as invalidações do app inteiro usam esse formato;
 *  - `apiRequest` para as consultas por evento (checa `res.ok`, trata 401 e
 *    HTML de servidor desatualizado — o padrão fixado em 23/09);
 *  - só o que a tela PEDE é ligado (`opcoes`): consulta desligada não gera
 *    requisição, então o Planejado continua sem baixar o comparativo e o
 *    Comparativo sem baixar passagens/valores por função.
 *
 * Também centraliza os índices repetidos (nome por id com `fixEncoding`,
 * passagem por vaga) e o `useQueriesState` das consultas ligadas.
 */
import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { fixEncoding } from "@/lib/utils";
import { useQueriesState, type QueriesState } from "@/components/common/query-state";
import type { ActivityLog } from "@/components/activity-timeline";
import type {
  BudgetActual, BudgetComparison, BudgetNote, BudgetPlanned, Collaborator, Event, Function, FunctionValue,
  TeamInclusion, Ticket,
} from "@shared/schema";

export interface OpcoesDasConsultasDeOrcamento {
  /** Registros do Planejado do evento. */
  planned?: boolean;
  /** Registros do Realizado do evento. */
  actual?: boolean;
  /** Comparativo (cabeçalho de status) do evento. */
  comparison?: boolean;
  /** Escalações (`team-inclusions`) do evento. */
  inclusions?: boolean;
  /** Notas do chat de auditoria: tipo de entidade da tela (`false` = não consulta). */
  notes?: "planned" | "actual" | false;
  /** `staleTime` das notas (o Realizado usa 30 s; as outras, o padrão). */
  notesStaleTime?: number;
  /** Logs de alteração do Planejado (badge "Planejado alterado pelo RH"). */
  plannedLogs?: boolean;
  /** Catálogos globais opcionais. */
  functionValues?: boolean;
  tickets?: boolean;
  settings?: boolean;
  /** Texto quando o colaborador não é encontrado (Planejado/Realizado: "Não definido"; Comparativo: "-"). */
  fallbackColaborador?: string;
}

const NOTAS_VAZIAS: BudgetNote[] = [];
const LOGS_VAZIOS: ActivityLog[] = [];

function getJson<T>(url: string): Promise<T> {
  return apiRequest("GET", url).then(r => r.json() as Promise<T>);
}

export interface ConsultasDeOrcamento {
  qEvents: UseQueryResult<Event[]>;
  qFunctions: UseQueryResult<Function[]>;
  qCollaborators: UseQueryResult<Collaborator[]>;
  qFunctionValues: UseQueryResult<FunctionValue[]>;
  qTickets: UseQueryResult<Ticket[]>;
  qSettings: UseQueryResult<Record<string, number>>;
  qPlanned: UseQueryResult<BudgetPlanned[]>;
  qActual: UseQueryResult<BudgetActual[]>;
  qComparison: UseQueryResult<BudgetComparison | null>;
  qInclusions: UseQueryResult<TeamInclusion[]>;
  qNotes: UseQueryResult<BudgetNote[]>;
  qPlannedLogs: UseQueryResult<ActivityLog[]>;

  events: Event[] | undefined;
  functions: Function[] | undefined;
  collaborators: Collaborator[] | undefined;
  functionValues: FunctionValue[] | undefined;
  allTickets: Ticket[] | undefined;
  systemSettings: Record<string, number> | undefined;
  budgetPlanned: BudgetPlanned[] | undefined;
  budgetActual: BudgetActual[] | undefined;
  comparison: BudgetComparison | null | undefined;
  teamInclusions: TeamInclusion[] | undefined;
  /** Sempre uma lista (vazia enquanto carrega). */
  eventNotes: BudgetNote[];
  plannedLogs: ActivityLog[];
  /** Evento em foco dentro de `events` (undefined até a lista chegar). */
  selectedEvent: Event | undefined;

  /** id → nome já com `fixEncoding` (ou o fallback). */
  collaboratorNameById: Map<string, string>;
  functionNameById: Map<string, string>;
  getCollaboratorName: (id?: string | null) => string;
  getFunctionName: (id?: string | null) => string;
  /** Passagem registrada por vaga (`teamInclusionId`) — fonte dos horários de voo. */
  ticketByInclusion: Map<string, Ticket>;

  /** Carregando/erro consolidados dos catálogos + consultas por evento LIGADAS. */
  estado: QueriesState;
}

export function useBudgetQueries(eventId: string, opcoes: OpcoesDasConsultasDeOrcamento = {}): ConsultasDeOrcamento {
  const temEvento = !!eventId;
  const fallbackColaborador = opcoes.fallbackColaborador ?? "Não definido";

  const qEvents = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const qFunctions = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const qCollaborators = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const qFunctionValues = useQuery<FunctionValue[]>({ queryKey: ["/api/function-values"], enabled: !!opcoes.functionValues });
  // Passagens: fonte dos horários de voo para mobilidade e alimentação.
  const qTickets = useQuery<Ticket[]>({ queryKey: ["/api/tickets"], enabled: !!opcoes.tickets });
  // Sem `queryFn` caseiro (23/09): o padrão do queryClient checa `res.ok`,
  // trata 401 e HTML de servidor desatualizado — o de antes gravava o corpo
  // do erro no cache como se fossem os valores.
  const qSettings = useQuery<Record<string, number>>({ queryKey: ["/api/system-settings"], enabled: !!opcoes.settings });

  // As consultas do evento passam por `apiRequest` (23/09). As chaves seguem
  // com o id separado porque as invalidações do app usam esse formato — por
  // isso o `queryFn` explícito continua.
  const qPlanned = useQuery<BudgetPlanned[]>({
    queryKey: ["/api/budget-planned", eventId],
    queryFn: () => getJson<BudgetPlanned[]>(`/api/budget-planned?eventId=${eventId}`),
    enabled: temEvento && !!opcoes.planned,
  });
  const qActual = useQuery<BudgetActual[]>({
    queryKey: ["/api/budget-actual", eventId],
    queryFn: () => getJson<BudgetActual[]>(`/api/budget-actual?eventId=${eventId}`),
    enabled: temEvento && !!opcoes.actual,
  });
  // Antes o Realizado devolvia `null` em erro e seguia como se não houvesse
  // comparativo. Unificado em 23/09: lança e a UI avisa.
  const qComparison = useQuery<BudgetComparison | null>({
    queryKey: ["/api/budget-comparison", eventId],
    queryFn: () => getJson<BudgetComparison | null>(`/api/budget-comparison?eventId=${eventId}`),
    enabled: temEvento && !!opcoes.comparison,
  });
  // Só as escalações do evento em foco (`?eventId=`, contrato 23/09) — antes
  // baixava as ~4.500 de todos os eventos.
  const qInclusions = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions", eventId],
    queryFn: () => getJson<TeamInclusion[]>(`/api/team-inclusions?eventId=${eventId}`),
    enabled: temEvento && !!opcoes.inclusions,
  });
  const tipoDasNotas = opcoes.notes || "planned";
  // Lança em erro (23/09) em vez de devolver `[]` — o chat não pode parecer vazio por falha de rede.
  const qNotes = useQuery<BudgetNote[]>({
    queryKey: ["/api/budget-notes/by-event", tipoDasNotas, eventId],
    queryFn: () => getJson<BudgetNote[]>(`/api/budget-notes/by-event?entityType=${tipoDasNotas}&eventId=${eventId}`),
    enabled: temEvento && !!opcoes.notes,
    staleTime: opcoes.notesStaleTime,
  });
  const qPlannedLogs = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs/by-event", "budget_planned", eventId],
    queryFn: () => getJson<ActivityLog[]>(`/api/activity-logs/by-event?entityType=budget_planned&eventId=${eventId}`),
    enabled: temEvento && !!opcoes.plannedLogs,
    staleTime: 60_000,
  });

  const events = qEvents.data;
  const functions = qFunctions.data;
  const collaborators = qCollaborators.data;
  const allTickets = qTickets.data;

  // Maps id→nome pré-computados: os getters eram Array.find O(n) chamados
  // dentro do comparador de ordenação e por card, O(n²) com listas grandes.
  const collaboratorNameById = useMemo(() => {
    const m = new Map<string, string>();
    collaborators?.forEach(c => m.set(c.id, fixEncoding(c.fullName) || fallbackColaborador));
    return m;
  }, [collaborators, fallbackColaborador]);
  const functionNameById = useMemo(() => {
    const m = new Map<string, string>();
    functions?.forEach(f => m.set(f.id, f.name));
    return m;
  }, [functions]);
  const getCollaboratorName = useMemo(
    () => (id?: string | null) => (id ? collaboratorNameById.get(id) || fallbackColaborador : fallbackColaborador),
    [collaboratorNameById, fallbackColaborador],
  );
  const getFunctionName = useMemo(
    () => (id?: string | null) => (id ? functionNameById.get(id) || "-" : "-"),
    [functionNameById],
  );
  const ticketByInclusion = useMemo(() => {
    const m = new Map<string, Ticket>();
    for (const t of allTickets || []) if (t.teamInclusionId) m.set(t.teamInclusionId, t);
    return m;
  }, [allTickets]);

  const selectedEvent = useMemo(() => events?.find(e => e.id === eventId), [events, eventId]);

  // Erro/carregando de TUDO que a tela precisa (23/09): um só aviso com
  // "Tentar de novo", que refaz apenas o que falhou. Só entram as consultas
  // ligadas — as desligadas nunca ficam "carregando".
  const estado = useQueriesState([
    qEvents, qFunctions, qCollaborators,
    ...(opcoes.planned ? [qPlanned] : []),
    ...(opcoes.actual ? [qActual] : []),
    ...(opcoes.inclusions ? [qInclusions] : []),
    ...(opcoes.comparison ? [qComparison] : []),
  ]);

  return {
    qEvents, qFunctions, qCollaborators, qFunctionValues, qTickets, qSettings,
    qPlanned, qActual, qComparison, qInclusions, qNotes, qPlannedLogs,
    events, functions, collaborators,
    functionValues: qFunctionValues.data,
    allTickets,
    systemSettings: qSettings.data,
    budgetPlanned: qPlanned.data,
    budgetActual: qActual.data,
    comparison: qComparison.data,
    teamInclusions: qInclusions.data,
    eventNotes: qNotes.data ?? NOTAS_VAZIAS,
    plannedLogs: qPlannedLogs.data ?? LOGS_VAZIOS,
    selectedEvent,
    collaboratorNameById, functionNameById, getCollaboratorName, getFunctionName, ticketByInclusion,
    estado,
  };
}

export default useBudgetQueries;
