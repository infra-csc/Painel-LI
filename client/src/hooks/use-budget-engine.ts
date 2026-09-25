/**
 * Motor do Planejado na tela — 25/09 (modularização).
 *
 * Extraído de budget-planned.tsx: filtra as escalações confirmadas, calcula
 * cada vaga com o motor compartilhado (@shared/budget-engine) com cache por
 * vaga, e deriva os índices que cards e planilha consomem (enviados ao
 * Realizado, "não participou", totais e estatísticas). Sem JSX.
 */
import { useCallback, useMemo, useRef } from "react";
import type { BudgetActual, BudgetPlanned as BudgetPlannedRow, Collaborator, FunctionValue, TeamInclusion, Ticket } from "@shared/schema";
import { calcularPlanejadoDaVaga, type VagaParaPlanejado } from "@shared/budget-engine";
import { indexarPorId } from "@/lib/indices";
import { collabFuncKey, isCasaType, type BudgetOverrides, type CalculatedBudget } from "@/components/budget/types";

export interface EntradaDoMotor {
  teamInclusions: TeamInclusion[] | undefined;
  functionValues: FunctionValue[] | undefined;
  collaborators: Collaborator[] | undefined;
  functionNamesById: Map<string, string>;
  systemSettings: Record<string, number> | undefined;
  ticketByInclusion: Map<string, Ticket>;
  eventLocation: string | null;
  budgetOverrides: BudgetOverrides;
  allBudgetPlanned: BudgetPlannedRow[] | undefined;
  existingActuals: BudgetActual[] | undefined;
}

export interface EstatisticasDoPlanejado {
  total: number;
  totalCasa: number;
  totalFreela: number;
  valorCasa: number;
  valorFreela: number;
  media: number;
  mediaPorDia: number;
  enviados: number;
  progressoEnvio: number;
}

export interface SaidaDoMotor {
  confirmedInclusions: TeamInclusion[];
  calculatedBudgets: CalculatedBudget[];
  /** Ids de vaga já enviados ao Realizado (derivado de `existingActuals`). */
  sentToActual: Set<string>;
  /** Chaves "colaborador|função" marcadas como "não participou". */
  notAttendedKeys: Set<string>;
  isCardNotAttended: (b: CalculatedBudget) => boolean;
  plannedByCollabFunc: Map<string, BudgetPlannedRow>;
  actualsByCollabFunc: Map<string, BudgetActual>;
  totalGeral: number;
  stats: EstatisticasDoPlanejado;
}

const STATUS_CONFIRMADOS = new Set([
  "confirmado", "escalacao", "escalado", "aprovacao", "passagem", "passagem_comprada",
  "hospedagem", "hospedagem_comprada", "hospedagem_passagem_comprada", "aprovado",
]);

export function useBudgetEngine(e: EntradaDoMotor): SaidaDoMotor {
  const {
    teamInclusions, functionValues, collaborators, functionNamesById, systemSettings,
    ticketByInclusion, eventLocation, budgetOverrides, allBudgetPlanned, existingActuals,
  } = e;

  // Índices O(1) (23/09): `collaborators?.find` e `functionValues?.find` rodavam
  // dentro do `.map` do cálculo — O(n·m) a cada render.
  const collaboratorById = useMemo(() => indexarPorId(collaborators), [collaborators]);
  const functionValueByFunctionId = useMemo(() => {
    const m = new Map<string, FunctionValue>();
    functionValues?.forEach(fv => { if (!m.has(fv.functionId)) m.set(fv.functionId, fv); });
    return m;
  }, [functionValues]);

  // Filtrar apenas escalações CONFIRMADAS
  const confirmedInclusions = useMemo(() => {
    if (!teamInclusions) return [];
    return teamInclusions.filter(inc => STATUS_CONFIRMADOS.has(inc.status));
  }, [teamInclusions]);

  // "Já enviado ao Realizado" é DERIVADO de `existingActuals` (23/09): fonte
  // única. Antes era um `useState` alimentado por um useEffect O(n·m) e ainda
  // alterado à mão nos onSuccess — duas fontes de verdade que divergiam.
  // Após enviar, os onSuccess gravam o registro criado no cache da query
  // (`setQueryData`) e invalidam; a UI responde na hora sem estado paralelo.
  const sentToActual = useMemo(() => {
    const enviados = new Set<string>();
    if (!existingActuals || existingActuals.length === 0) return enviados;
    const chaves = new Set<string>();
    for (const a of existingActuals) chaves.add(collabFuncKey(a));
    for (const inc of confirmedInclusions) {
      if (chaves.has(collabFuncKey(inc))) enviados.add(inc.id);
    }
    return enviados;
  }, [existingActuals, confirmedInclusions]);

  // ── Cálculo por vaga: MOTOR COMPARTILHADO (23/09) ────────────────────────
  // `calcularPlanejadoDaVaga` (@shared/budget-engine) é a mesma sequência que
  // o servidor usa em apply-defaults — a fórmula duplicada saiu desta tela.
  // Cache por vaga: só recalcula a linha cuja ENTRADA mudou (escalação,
  // função, tipo, valores, configurações, passagem ou override). Digitar um
  // valor recalcula UMA vaga; as demais devolvem o MESMO objeto e o
  // `SheetRow` (React.memo) e os cards não repintam.
  const cacheOrcamentosRef = useRef(new Map<string, { chave: unknown[]; result: CalculatedBudget }>());
  const calculatedBudgets = useMemo((): CalculatedBudget[] => {
    if (!confirmedInclusions || !functionValues) return [];
    const anterior = cacheOrcamentosRef.current;
    const proximo = new Map<string, { chave: unknown[]; result: CalculatedBudget }>();
    const out = confirmedInclusions.map((inclusion): CalculatedBudget => {
      const id = inclusion.id;
      const fv = functionValueByFunctionId.get(inclusion.functionId) ?? null;
      const collab = inclusion.collaboratorId ? collaboratorById.get(inclusion.collaboratorId) : undefined;
      const fnName = functionNamesById.get(inclusion.functionId) ?? null;
      const ticket = ticketByInclusion.get(inclusion.id) ?? null;
      const override = budgetOverrides[id];
      const chave: unknown[] = [inclusion, fnName, collab?.type ?? null, fv, systemSettings, eventLocation, ticket, override];
      const hit = anterior.get(id);
      const reaproveita = !!hit && hit.chave.length === chave.length && hit.chave.every((v, i) => v === chave[i]);
      const result: CalculatedBudget = reaproveita
        ? hit.result
        : {
            ...calcularPlanejadoDaVaga({
              vaga: inclusion as VagaParaPlanejado,
              functionName: fnName,
              collaboratorType: collab?.type,
              functionValue: fv,
              settings: systemSettings,
              eventLocation,
              ticket,
              override,
            }),
            inclusion,
            collaborator: collab,
            functionValue: fv,
          };
      proximo.set(id, { chave, result });
      return result;
    });
    cacheOrcamentosRef.current = proximo;
    return out;
  }, [confirmedInclusions, functionValues, collaboratorById, functionValueByFunctionId, functionNamesById, systemSettings, ticketByInclusion, eventLocation, budgetOverrides]);

  // Set de chaves "collaboratorId|functionId" para cards marcados como "não participou"
  const notAttendedKeys = useMemo(() => {
    const keys = new Set<string>();
    (allBudgetPlanned || []).forEach(p => {
      if (p.didNotAttend) keys.add(collabFuncKey(p));
    });
    return keys;
  }, [allBudgetPlanned]);

  const isCardNotAttended = useCallback(
    (b: CalculatedBudget) => notAttendedKeys.has(collabFuncKey(b.inclusion)),
    [notAttendedKeys],
  );

  // Registros indexados por "colaborador|função" — evita .find() O(n) por card/linha.
  // O primeiro registro vence, preservando a semântica do Array.find original.
  const plannedByCollabFunc = useMemo(() => {
    const m = new Map<string, BudgetPlannedRow>();
    (allBudgetPlanned || []).forEach(p => {
      const key = collabFuncKey(p);
      if (!m.has(key)) m.set(key, p);
    });
    return m;
  }, [allBudgetPlanned]);

  const actualsByCollabFunc = useMemo(() => {
    const m = new Map<string, BudgetActual>();
    (existingActuals || []).forEach(a => {
      if (a.splitParentId) return;
      const key = collabFuncKey(a);
      if (!m.has(key)) m.set(key, a);
    });
    return m;
  }, [existingActuals]);

  const totalGeral = useMemo(() => {
    return calculatedBudgets
      .filter(b => !notAttendedKeys.has(collabFuncKey(b.inclusion)))
      .reduce((sum, b) => sum + b.totalFinal, 0);
  }, [calculatedBudgets, notAttendedKeys]);

  // Estatísticas de resumo
  const stats = useMemo((): EstatisticasDoPlanejado => {
    const activeBudgets = calculatedBudgets.filter(b => !notAttendedKeys.has(collabFuncKey(b.inclusion)));
    const total = activeBudgets.length;
    const isFreela = (type?: string) => type === "freela" || !type;
    const totalCasa = activeBudgets.filter(b => isCasaType(b.collaborator?.type)).length;
    const totalFreela = activeBudgets.filter(b => isFreela(b.collaborator?.type)).length;
    const valorCasa = activeBudgets.filter(b => isCasaType(b.collaborator?.type)).reduce((sum, b) => sum + b.totalFinal, 0);
    const valorFreela = activeBudgets.filter(b => isFreela(b.collaborator?.type)).reduce((sum, b) => sum + b.totalFinal, 0);
    const media = total > 0 ? totalGeral / total : 0;
    const totalDias = activeBudgets.reduce((sum, b) => sum + b.weekdays + b.weekends, 0);
    const mediaPorDia = totalDias > 0 ? totalGeral / totalDias : 0;
    // Mesmo denominador de `total` (só ativos) — incluir "não participou" aqui
    // impedia o progresso de chegar a 100%.
    const enviados = activeBudgets.filter(b => sentToActual.has(b.inclusion.id)).length;
    const progressoEnvio = total > 0 ? (enviados / total) * 100 : 0;

    return { total, totalCasa, totalFreela, valorCasa, valorFreela, media, mediaPorDia, enviados, progressoEnvio };
  }, [calculatedBudgets, totalGeral, sentToActual, notAttendedKeys]);

  return {
    confirmedInclusions, calculatedBudgets, sentToActual, notAttendedKeys, isCardNotAttended,
    plannedByCollabFunc, actualsByCollabFunc, totalGeral, stats,
  };
}

export default useBudgetEngine;
